import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as retryDelay} from 'node:timers/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {runReviewPreflight} from '../../.agents/skills/write-katsuyo-usage-cards/scripts/review-preflight.mjs';
import {createDelivery, readDelivery} from '../../.agents/skills/write-katsuyo-usage-cards/scripts/delivery-store.mjs';
import {runCheckedSteps} from '../../.agents/skills/write-katsuyo-usage-cards/scripts/checked-steps.mjs';

const TASK_ROOT = fs.realpathSync(path.dirname(fileURLToPath(import.meta.url)));
const STATES = ['unassigned', 'authoring', 'author-submitted', 'awaiting-review', 'reviewing', 'review-submitted', 'reviewed'];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const pair = row => `${row.senseId}/${row.form}`;
const batchPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*\/[0-9]{2,}$/;
const agentPattern = /^(?:\/?[A-Za-z0-9_-]+)(?:\/[A-Za-z0-9_-]+)*$/;
const fail = message => { throw new Error(message); };
const own = (object, key) => Object.hasOwn(object, key);
const json = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));

function uniqueReviewReasons(ledger) {
  const seen = new Map();
  for (const row of ledger) {
    const reason = typeof row.reason === 'string' ? row.reason.trim().replace(/\s+/gu, ' ') : '';
    if (!reason) continue; // The existing per-card validation reports missing text.
    if (seen.has(reason)) fail(`Repeated review reason requires per-card revision: ${seen.get(reason)} / ${row.id}`);
    seen.set(reason, row.id);
  }
}

function inside(root, target) {
  const rel = path.relative(root, target);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) fail(`Path escapes task root: ${target}`);
}

/** Reject symlinks/junctions, including intermediate directories and absent leaf parents. */
function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes(':') || path.isAbsolute(relative)) fail(`Unsafe relative path: ${relative}`);
  const pieces = relative.split('/');
  if (pieces.some(p => !p || p === '.' || p === '..')) fail(`Unsafe relative path: ${relative}`);
  const target = path.resolve(root, ...pieces);
  inside(root, target);
  let current = root;
  for (const piece of pieces) {
    current = path.join(current, piece);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) fail(`Symlink/junction is not allowed: ${current}`);
      inside(root, fs.realpathSync(current));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return target;
}

let projectPromise;
async function repository() {
  projectPromise ??= import(new URL('../../app/lib/usage-cards.mjs', import.meta.url));
  return projectPromise;
}

/** Alternate roots are restricted to synthetic tests underneath pipeline-state. */
export function createPipeline({taskRoot = TASK_ROOT} = {}) {
  const root = fs.realpathSync(taskRoot);
  inside(TASK_ROOT, root);
  if (root !== TASK_ROOT) {
    const rel = path.relative(TASK_ROOT, root).split(path.sep).join('/');
    if (!/^pipeline-state\/demo-[A-Za-z0-9-]+$/.test(rel)) fail('Alternate root must be pipeline-state/demo-*');
    safePath(TASK_ROOT, rel);
  }

  const file = relative => safePath(root, relative);
  function read(relative, observed) {
    const absolute = file(relative);
    if (!fs.statSync(absolute).isFile()) fail(`Not a regular file: ${relative}`);
    const bytes = fs.readFileSync(absolute);
    if (observed) {
      const current = sha(bytes);
      if (observed.has(relative) && observed.get(relative) !== current) fail(`File changed during validation: ${relative}`);
      observed.set(relative, current);
    }
    return bytes;
  }
  function readJson(relative, observed) { return json(read(relative, observed)); }
  function report(relative, observed) {
    const bytes = read(relative, observed);
    if (!bytes.toString('utf8').trim()) fail(`Empty report: ${relative}`);
    return sha(bytes);
  }
  function manifest(observed) {
    const rows = readJson('manifest.json', observed);
    if (!Array.isArray(rows) || !rows.length) fail('manifest.json must be a nonempty array');
    const entries = new Map();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || !Number.isSafeInteger(row.batch) || row.batch < 0) fail('Invalid manifest batch');
      const batch = `${row.lane}/${String(row.batch).padStart(2, '0')}`;
      if (!batchPattern.test(batch) || entries.has(batch)) fail(`Invalid/duplicate manifest batch: ${batch}`);
      if (row.assignment !== `${batch}.assignment.json` || row.cards !== `${batch}.cards.json`) fail(`Manifest paths do not match batch: ${batch}`);
      if (!Number.isSafeInteger(row.count) || row.count < 1 || !/^[a-f0-9]{64}$/.test(row.hash)) fail(`Invalid manifest count/hash: ${batch}`);
      file(row.assignment); file(row.cards);
      entries.set(batch, row);
    }
    return entries;
  }
  function entry(batch, observed, entries) {
    if (!batchPattern.test(batch ?? '')) fail('Use --batch lane/NN (no traversal, absolute paths, or backslashes)');
    const row = (entries ?? manifest(observed)).get(batch);
    if (!row) fail(`Batch is absent from manifest: ${batch}`);
    const bytes = read(row.assignment, observed);
    if (sha(bytes) !== row.hash) fail(`Assignment hash differs from manifest: ${batch}`);
    const assignment = json(bytes);
    if (!Array.isArray(assignment) || assignment.length !== row.count) fail(`Assignment count differs from manifest: ${batch}`);
    if (assignment.some(a => !a || !a.senseId || !a.form || !a.class || !a.meaning || !a.answer || !a.answerReading)) fail(`Assignment must contain exact sense/form targets: ${batch}`);
    if (new Set(assignment.map(pair)).size !== assignment.length) fail(`Duplicate assignment pair: ${batch}`);
    return {batch, row, assignment, manifestEntryHash: sha(JSON.stringify(row))};
  }
  const stateFile = batch => `pipeline-state/${batch}.json`;
  function getState(info, observed) {
    let state;
    try { state = readJson(stateFile(info.batch), observed); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return {version: 1, batch: info.batch, status: 'unassigned', revision: 0,
        assignmentHash: info.row.hash, manifestEntryHash: info.manifestEntryHash,
        count: info.row.count, author: null, reviewer: null, owner: null, history: []};
    }
    if (state.version !== 1 || state.batch !== info.batch || !STATES.includes(state.status)
      || !Number.isSafeInteger(state.revision) || state.revision < 1 || !Array.isArray(state.history)
      || state.assignmentHash !== info.row.hash || state.manifestEntryHash !== info.manifestEntryHash || state.count !== info.row.count) fail(`State/manifest mismatch: ${info.batch}`);
    const activeRole = state.status === 'authoring' ? 'author' : state.status === 'reviewing' ? 'reviewer' : null;
    if (activeRole ? !state.owner || state.owner.role !== activeRole || state.owner.agent !== state[activeRole] : state.owner !== null) fail(`Malformed active owner: ${info.batch}`);
    if (state.status !== 'unassigned' && !agentPattern.test(state.author ?? '')) fail(`Missing author: ${info.batch}`);
    if (['awaiting-review', 'reviewing', 'review-submitted', 'reviewed'].includes(state.status) && !state.authorFreeze) fail(`Missing author freeze: ${info.batch}`);
    if (['reviewing', 'review-submitted', 'reviewed'].includes(state.status) && (!agentPattern.test(state.reviewer ?? '') || state.reviewer === state.author)) fail(`Invalid independent reviewer: ${info.batch}`);
    if (state.status === 'reviewed' && !state.reviewFreeze) fail(`Missing review freeze: ${info.batch}`);
    if (state.status.endsWith('-submitted') && (!state.submission || state.deliveryProtocol !== 2 || state.submission.phase !== state.status.split('-')[0])) fail(`Missing submission: ${info.batch}`);
    return state;
  }
  function validateReadings(info, cards, observed, project, requested, phase) {
    const allowed = [`${info.batch}.readings.json`, `${info.batch}.review-readings.json`];
    const relative = requested ?? (phase === 'review' && fs.existsSync(file(allowed[1])) ? allowed[1] : allowed[0]);
    if (!allowed.includes(relative) || (phase === 'author' && relative !== allowed[0])) fail('Readings report must use the current batch prefix');
    const data = readJson(relative, observed);
    if (data.cardsChecked !== cards.length || !Array.isArray(data.structuralIssues) || data.structuralIssues.length
      || !Array.isArray(data.candidates) || data.reviewCandidateCount !== data.candidates.length) fail(`Invalid readings report: ${relative}`);
    if (fs.statSync(file(relative)).mtimeMs < fs.statSync(file(info.row.cards)).mtimeMs) fail(`Readings report predates cards; rerun reading-audit: ${relative}`);
    const seen = new Set();
    for (const candidate of data.candidates) {
      const card = cards.find(c => c.id === candidate.id);
      if (!card || seen.has(candidate.id)) fail(`Unknown/duplicate reading candidate: ${candidate.id}`);
      seen.add(candidate.id);
      const parts = [...card.before, project.resolveUsageCard(card).target, ...card.after];
      const expected = {senseId: card.senseId, form: card.form, scene: card.scene, translation: card.translation,
        sentence: parts.map(p => p.text).join(''), reading: parts.map(p => p.reading ?? p.text).join('')};
      for (const key of Object.keys(expected)) if (candidate[key] !== expected[key]) fail(`Stale reading candidate ${candidate.id}: ${key}`);
    }
    return {file: relative, hash: observed.get(relative), candidates: data.candidates.length};
  }
  function validateCards(info, observed, project) {
    const cards = readJson(info.row.cards, observed);
    if (!Array.isArray(cards)) fail('Cards must be an array');
    const issues = project.usageCardIssues(cards);
    if (issues.length) fail(`Card structure failed:\n${issues.join('\n')}`);
    if (cards.length !== info.row.count || new Set(cards.map(pair)).size !== cards.length) fail('Card count/pair coverage differs from assignment');
    const expected = new Map(info.assignment.map(a => [pair(a), a]));
    for (const card of cards) {
      const a = expected.get(pair(card));
      if (!a || card.id !== `usage:${card.form}:${card.senseId}` || card.meaning !== a.meaning) fail(`Unassigned/changed card: ${card.id}`);
      if (card.review !== 'draft') fail(`Pipeline source cards must remain draft: ${card.id}`);
      const resolved = project.resolveUsageCard(card);
      if (project.usageCardItem(card.senseId)?.class !== a.class || resolved.target.text !== a.answer || resolved.target.reading !== a.answerReading) fail(`Assignment target differs from current repository: ${card.id}`);
    }
    return cards;
  }
  function validateLedger(info, cards, observed, project) {
    const relative = `${info.batch}.review.json`;
    const ledger = readJson(relative, observed);
    if (!Array.isArray(ledger) || ledger.length !== cards.length || new Set(ledger.map(r => r?.id)).size !== cards.length) fail('Review ledger must contain every card exactly once');
    uniqueReviewReasons(ledger);
    const rows = new Map(ledger.map(r => [r.id, r]));
    let approved = 0, unresolved = 0;
    for (const card of cards) {
      const record = rows.get(card.id), resolved = project.resolveUsageCard(card);
      const sentence = [...card.before, resolved.target, ...card.after].map(p => p.text).join('');
      if (!record || record.hash !== sha(JSON.stringify(card)) || record.sentence !== sentence
        || typeof record.reason !== 'string' || !record.reason.trim() || !['approved', 'unresolved'].includes(record.status)) fail(`Missing/stale review sentence, hash, reason, or status: ${card.id}`);
      if (record.status === 'approved') approved++; else unresolved++;
    }
    return {file: relative, hash: observed.get(relative), approved, unresolved};
  }
  function baseline(relativeFiles, observed) {
    const result = {};
    for (const relative of relativeFiles) {
      try { result[relative] = sha(read(relative, observed)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; result[relative] = null; }
    }
    return result;
  }
  function requireDelta(previous, observed, label) {
    if (!previous || !Object.values(previous).some(Boolean)) return;
    const changed = Object.entries(previous).some(([relative, digest]) => {
      let current = null;
      try { current = sha(read(relative, observed)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      return current !== digest;
    });
    if (!changed) fail(`${label} artifacts are unchanged since assignment; run the review/authoring step and write a new report before freezing`);
  }
  function snapshotFiles(info, sources, observed, phase, revision) {
    const artifacts = new Map();
    for (const source of sources) {
      const bytes = read(source, observed);
      artifacts.set(source, bytes);
    }
    const delivery = createDelivery({root, batch: info.batch, phase, revision, artifacts});
    verifySnapshot(delivery, observed);
    return delivery;
  }
  function roleBaseline(info, phase, observed) {
    return baseline(phase === 'author' ? [info.row.cards, `${info.batch}.author.md`]
      : [info.row.cards, `${info.batch}.review.json`, `${info.batch}.review.md`], observed);
  }
  function checkEvidence(info, previous, phase, observed, requestedReadings) {
    const evidence = previous.checkRun;
    if (!evidence || evidence.phase !== phase || evidence.agent !== previous.owner?.agent) fail('Run checked steps successfully before submitting');
    const readings = requestedReadings ?? (phase === 'review' && fs.existsSync(file(`${info.batch}.review-readings.json`))
      ? `${info.batch}.review-readings.json` : `${info.batch}.readings.json`);
    if (!Object.hasOwn(evidence.files, readings)) fail('Check plan must bind the chosen readings report');
    for (const [relative, expected] of Object.entries(evidence.files)) {
      if (sha(read(relative, observed)) !== expected) fail(`Check evidence is stale: ${relative}`);
    }
  }
  function verifySnapshot(snapshot, observed, compareWorking = false) {
    const artifacts = readDelivery(root, snapshot);
    read(snapshot.manifest, observed);
    for (const [source, bytes] of artifacts) {
      if (observed) observed.set(snapshot.files[source], sha(bytes));
      if (compareWorking && sha(read(source, observed)) !== sha(bytes)) fail(`Working artifact changed after submission: ${source}`);
    }
    return artifacts;
  }
  async function withLock(batch, work) {
    const relative = `pipeline-state/${batch}.lock`, absolute = file(relative);
    fs.mkdirSync(path.dirname(absolute), {recursive: true});
    file(relative);
    const token = crypto.randomUUID();
    let fd;
    try { fd = fs.openSync(absolute, 'wx'); }
    catch (error) {
      if (error.code === 'EEXIST') fail(`Batch operation lock exists: ${relative}; do not delete it while an operation may be running`);
      throw error;
    }
    try {
      fs.writeFileSync(fd, JSON.stringify({token, pid: process.pid, startedAt: new Date().toISOString()}));
      fs.fsyncSync(fd);
      fs.closeSync(fd); fd = undefined;
      return await work();
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      const lock = json(fs.readFileSync(absolute));
      if (lock.token !== token) fail(`Lock ownership changed; left untouched: ${relative}`);
      fs.unlinkSync(absolute);
    }
  }
  async function commit(state, observed) {
    for (const [relative, digest] of observed) if (sha(read(relative)) !== digest) fail(`File changed during validation: ${relative}`);
    const relative = stateFile(state.batch), target = file(relative);
    const temp = file(`${relative}.${crypto.randomUUID()}.tmp`);
    let fd;
    try {
      fd = fs.openSync(temp, 'wx');
      fs.writeFileSync(fd, JSON.stringify(state, null, 2) + '\n');
      fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      // Windows scanners can hold a file briefly. Retain the old state on failure;
      // never unlink it before the replacement (which would expose an absent state).
      for (let attempt = 0; ; attempt++) {
        try { await fs.promises.rename(temp, target); break; }
        catch (error) {
          if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === 4) throw error;
          await retryDelay(25 * (attempt + 1));
        }
      }
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }
  function assertFrozenArtifacts(freeze, observed) {
    for (const [relative, digest] of Object.entries(freeze.files)) if (sha(read(relative, observed)) !== digest) fail(`Frozen author artifact changed before review assignment: ${relative}`);
  }

  async function run(command, options = {}) {
    const allowed = {
      'assign-author': ['batch', 'agent', 'actor', 'protocol'], 'freeze-author': ['batch', 'agent'],
      'assign-review': ['batch', 'agent', 'actor'], 'freeze-review': ['batch', 'agent', 'readings'],
      'reopen-review': ['batch', 'agent', 'actor', 'reason'],
      'reopen-author': ['batch', 'agent', 'actor', 'reason'],
      'transfer-author': ['batch', 'agent', 'new-agent', 'actor', 'reason'],
      'transfer-review': ['batch', 'agent', 'new-agent', 'actor', 'reason'],
      'return-to-author': ['batch', 'agent', 'actor', 'reason'],
      'seal-reviewed': ['batch', 'actor'],
      'enable-delivery': ['batch', 'actor'],
      'run-checks': ['batch', 'agent', 'plan'],
      'submit-author': ['batch', 'agent', 'revision'],
      'submit-review': ['batch', 'agent', 'revision', 'readings'],
      'accept-author': ['batch', 'actor', 'receipt', 'revision'],
      'accept-review': ['batch', 'actor', 'receipt', 'revision'],
      'reject-submission': ['batch', 'actor', 'receipt', 'reason'],
      describe: ['batch'], list: [],
    };
    if (!own(allowed, command)) fail(`Unknown command: ${command}`);
    for (const key of Object.keys(options)) if (!allowed[command].includes(key)) fail(`Unsupported --${key} for ${command}`);
    if (command === 'list') {
      const entries = manifest();
      const batches = [...entries.keys()].map(batch => {
        const info = entry(batch, undefined, entries), state = getState(info);
        return {batch, status: state.status, owner: state.owner?.agent ?? null, role: state.owner?.role ?? null,
          author: state.author, reviewer: state.reviewer, count: state.count, revision: state.revision};
      });
      return {counts: Object.fromEntries(STATES.map(status => [status, batches.filter(b => b.status === status).length])), batches};
    }
    const initial = entry(options.batch);
    if (command === 'describe') return getState(initial);
    const coordinatorOnly = ['seal-reviewed', 'enable-delivery', 'reject-submission', 'accept-author', 'accept-review'].includes(command);
    if (!coordinatorOnly && !agentPattern.test(options.agent ?? '')) fail('A valid --agent identity is required');
    const assigning = command.startsWith('assign-') || command === 'reopen-review' || command === 'reopen-author' || command.startsWith('transfer-') || command === 'return-to-author' || coordinatorOnly;
    if (assigning && options.actor !== 'root' && options.actor !== '/root') fail('Assignment is coordinator-only; explicitly pass --actor root');
    const project = command.startsWith('freeze-') || command.startsWith('submit-') ? await repository() : null;
    return withLock(options.batch, async () => {
      const observed = new Map(), info = entry(options.batch, observed), previous = getState(info, observed);
      const now = new Date().toISOString();
      const state = structuredClone(previous);
      if (command === 'enable-delivery') {
        if (previous.deliveryProtocol === 2) fail('Delivery protocol already enabled');
        state.deliveryProtocol = 2;
      } else if (command === 'run-checks') {
        if (previous.deliveryProtocol !== 2) fail('Enable delivery protocol 2 first');
        if (!previous.owner || previous.owner.agent !== options.agent) fail('Only the active writer can run checks');
        const phase = previous.status === 'authoring' ? 'author' : 'review';
        // Invalidate earlier successful evidence before starting any process.
        delete state.checkRun;
        state.revision++; state.updatedAt = now;
        state.history.push({action: 'checks-started', at: now, actor: options.agent, agent: options.agent, from: state.status, to: state.status});
        await commit(state, observed);
        const checked = new Map();
        const plan = readJson(options.plan, checked);
        const inputs = [info.row.assignment, info.row.cards, `${info.batch}.${phase}.md`];
        if (phase === 'review') inputs.push(`${info.batch}.review.json`);
        for (const relative of inputs) read(relative, checked);
        if (!Array.isArray(plan.outputs) || !plan.outputs.length) fail('Check plan must declare its output reports');
        for (const relative of plan.outputs) {
          if (typeof relative !== 'string' || !relative.startsWith(`${info.batch}.`) || inputs.includes(relative)) fail('Check outputs must be reports with this batch prefix');
          file(relative);
        }
        const results = await runCheckedSteps(plan, {cwd: root});
        for (const [relative, expected] of checked) {
          if (sha(read(relative)) !== expected) fail(`Inputs changed during checks: ${relative}`);
        }
        for (const relative of plan.outputs ?? []) {
          read(relative, checked);
        }
        const after = new Map();
        const current = getState(info, after);
        if (current.revision !== state.revision || current.owner?.agent !== options.agent) fail('Ownership changed while checks ran');
        for (const [relative, hash] of checked) after.set(relative, hash);
        state.checkRun = {phase, agent: options.agent, plan: options.plan, files: Object.fromEntries(checked), results};
        state.revision++; state.updatedAt = new Date().toISOString();
        state.history.push({action: 'checks-passed', at: state.updatedAt, actor: options.agent, agent: options.agent, from: state.status, to: state.status});
        await commit(state, after); return state;
      } else if (command.startsWith('accept-')) {
        const phase = command.slice('accept-'.length);
        if (previous.deliveryProtocol !== 2 || previous.status !== `${phase}-submitted`) fail('No matching submitted delivery');
        if (String(previous.revision) !== String(options.revision) || previous.submission.delivery.receipt !== options.receipt) fail('Stale submission revision or receipt');
        verifySnapshot(previous.submission.delivery, observed, true);
        state[`${phase}Freeze`] = previous.submission;
        delete state.submission;
        state.status = phase === 'author' ? 'awaiting-review' : 'reviewed';
      } else if (command === 'reject-submission') {
        if (!previous.status.endsWith('-submitted') || previous.submission?.delivery.receipt !== options.receipt) fail('No matching submitted delivery');
        if (typeof options.reason !== 'string' || options.reason.trim().length < 12) fail('A concrete return reason is required');
        const phase = previous.submission.phase;
        state.previousSubmissions ??= [];
        state.previousSubmissions.push({submission: previous.submission, reason: options.reason, at: now});
        delete state.submission;
        state.status = phase === 'author' ? 'authoring' : 'reviewing';
        state.owner = {role: phase === 'author' ? 'author' : 'reviewer', agent: previous[phase === 'author' ? 'author' : 'reviewer'], assignedAt: now};
      } else if (command === 'seal-reviewed') {
        if (previous.owner || previous.status !== 'reviewed') fail('Only a frozen reviewed batch can be sealed');
        // Author bytes are historical; never reconstruct them from reviewed cards.
        if (previous.authorFreeze.delivery) {
          const artifacts = verifySnapshot(previous.authorFreeze.delivery, observed);
          for (const [source, digest] of Object.entries(previous.authorFreeze.files)) {
            if (!artifacts.has(source) || sha(artifacts.get(source)) !== digest) fail(`Author delivery differs from original freeze: ${source}`);
          }
        }
        assertFrozenArtifacts(previous.reviewFreeze, observed);
        if (previous.reviewFreeze.delivery) {
          const artifacts = verifySnapshot(previous.reviewFreeze.delivery, observed, true);
          for (const [source, digest] of Object.entries(previous.reviewFreeze.files)) {
            if (!artifacts.has(source) || sha(artifacts.get(source)) !== digest) fail(`Review delivery differs from freeze: ${source}`);
          }
          return previous;
        }
        const projectForSeal = await repository();
        const cards = validateCards(info, observed, projectForSeal);
        validateLedger(info, cards, observed, projectForSeal);
        const reviewSources = [info.row.cards, `${info.batch}.review.json`, `${info.batch}.review.md`, previous.reviewFreeze.readings.file];
        for (const relative of reviewSources) if (!fs.existsSync(file(relative))) fail(`Cannot seal missing artifact: ${relative}`);
        const next = previous.revision + 1;
        state.reviewFreeze.delivery = snapshotFiles(info, reviewSources, observed, 'review', next);
        state.updatedAt = now; state.revision = next;
        state.history.push({action: command, at: now, actor: options.actor, agent: null, from: previous.status, to: state.status});
        await commit(state, observed); return state;
      } else if (command === 'return-to-author') {
        if (previous.owner || previous.status !== 'reviewed') fail('Only a frozen reviewed batch can return to author');
        if (typeof options.reason !== 'string' || options.reason.trim().length < 12) fail('A concrete rewrite reason is required');
        state.previousReviewFreezes ??= [];
        state.previousReviewFreezes.push({reviewer: previous.reviewer, freeze: previous.reviewFreeze, reason: options.reason});
        state.previousAuthorFreezes ??= [];
        state.previousAuthorFreezes.push({author: previous.author, freeze: previous.authorFreeze, reason: options.reason});
        state.previousAuthors ??= [];
        state.previousAuthors.push({agent: previous.author, at: now, reason: options.reason});
        delete state.reviewFreeze; delete state.authorFreeze;
        state.reviewer = null; state.author = options.agent; state.status = 'authoring';
        state.owner = {role: 'author', agent: options.agent, assignedAt: now};
      } else if (command === 'transfer-review') {
        if (previous.owner?.role !== 'reviewer' || previous.status !== 'reviewing') fail('Only an active reviewer can be transferred');
        if (options.agent !== previous.reviewer) fail('Transfer source must match the recorded reviewer');
        const next = options['new-agent'];
        if (typeof next !== 'string' || !agentPattern.test(next) || next === previous.reviewer || next === previous.author) fail('New reviewer must be different from the previous reviewer and author');
        if (typeof options.reason !== 'string' || options.reason.trim().length < 12) fail('A concrete review handoff reason is required');
        const artifacts = {};
        for (const relative of [info.row.cards, `${info.batch}.review.json`, `${info.batch}.review.md`, `${info.batch}.review-readings.json`]) {
          try { artifacts[relative] = sha(read(relative, observed)); }
          catch (error) { if (error.code !== 'ENOENT') throw error; artifacts[relative] = null; }
        }
        state.previousReviewers ??= [];
        state.previousReviewers.push({agent: previous.reviewer, at: now, reason: options.reason, artifacts});
        state.reviewer = next; state.owner = {role: 'reviewer', agent: next, assignedAt: now};
      } else if (command === 'transfer-author') {
        if (previous.owner?.role !== 'author' || previous.status !== 'authoring') fail('Only an active author can be transferred');
        if (options.agent !== previous.author) fail('Transfer source must match the recorded author');
        if (typeof options['new-agent'] !== 'string' || !agentPattern.test(options['new-agent']) || options['new-agent']===previous.author) fail('New author must be a different valid agent');
        if (typeof options.reason !== 'string' || options.reason.trim().length < 12) fail('A concrete transfer reason is required');
        state.previousAuthors ??= [];
        state.previousAuthors.push({agent:previous.author,at:now,reason:options.reason});
        state.author=options['new-agent']; state.owner={role:'author',agent:options['new-agent'],assignedAt:now};
      } else if (command === 'reopen-author') {
        if (previous.owner || previous.status !== 'awaiting-review') fail('Only an awaiting-review batch can be reopened for author repair');
        if (options.agent !== previous.author) fail('Author repair agent must be the recorded author');
        if (typeof options.reason !== 'string' || options.reason.trim().length < 12) fail('A concrete author-repair reason is required');
        state.previousAuthorFreezes ??= [];
        state.previousAuthorFreezes.push({freeze:previous.authorFreeze,reason:options.reason});
        delete state.authorFreeze;
        state.status='authoring'; state.owner={role:'author',agent:options.agent,assignedAt:now};
      } else if (command === 'reopen-review') {
        if (previous.owner || previous.status !== 'reviewed') fail('Only a frozen reviewed batch can be reopened');
        if (options.agent === previous.author) fail('Reviewer must differ from the author');
        if (typeof options.reason !== 'string' || options.reason.trim().length < 12) fail('A concrete re-review reason is required');
        // Reopening invalidates approval; record drift instead of blessing new files.
        const artifactChanges = [];
        for (const [relative, expected] of Object.entries(previous.reviewFreeze.files)) {
          let current;
          try { current = sha(read(relative, observed)); }
          catch(error) { if(error.code !== 'ENOENT') throw error; current = null; }
          if(current !== expected) artifactChanges.push({file:relative,expected,current});
        }
        state.previousReviewFreezes ??= [];
        state.previousReviewFreezes.push({reviewer:previous.reviewer,freeze:previous.reviewFreeze,reason:options.reason,artifactChanges});
        delete state.reviewFreeze;
        state.status='reviewing'; state.reviewer=options.agent;
        state.owner={role:'reviewer',agent:options.agent,assignedAt:now};
      } else if (command === 'assign-author') {
        if (previous.owner || previous.status !== 'unassigned') fail(`Cannot assign author: ${previous.status}, owner=${previous.owner?.agent ?? 'none'}`);
        if (options.protocol !== undefined && String(options.protocol) !== '2') fail('Supported delivery protocol is 2');
        if (options.protocol !== undefined) state.deliveryProtocol = 2;
        state.status = 'authoring'; state.author = options.agent;
        state.owner = {role: 'author', agent: options.agent, assignedAt: now};
        if (state.deliveryProtocol === 2) state.authorBaseline = roleBaseline(info, 'author', observed);
      } else if (command === 'freeze-author' || command === 'submit-author') {
        if (previous.status !== 'authoring' || previous.owner?.agent !== options.agent) fail('Only the active author can freeze this batch');
        if (previous.deliveryProtocol === 2 && command === 'freeze-author') fail('Protocol 2 requires submit-author then coordinator accept-author');
        if (command === 'submit-author') {
          if (previous.deliveryProtocol !== 2 || String(previous.revision) !== String(options.revision)) fail('Stale revision or delivery protocol');
          checkEvidence(info, previous, 'author', observed);
        }
        const cards = validateCards(info, observed, project);
        if (previous.deliveryProtocol === 2) requireDelta(previous.authorBaseline, observed, 'Author');
        const preflight = await runReviewPreflight({taskRoot: root, batch: info.batch, phase: 'author', project});
        if (preflight.blockers.length) fail(`Review preflight blocked author handoff:\n${preflight.blockers.map(item => `${item.code}: ${item.message}`).join('\n')}`);
        const authorReport = `${info.batch}.author.md`;
        report(authorReport, observed);
        const readings = validateReadings(info, cards, observed, project, undefined, 'author');
        const frozen = {at: now, cardsHash: observed.get(info.row.cards), readings,
          files: Object.fromEntries([info.row.cards, authorReport, readings.file].map(f => [f, observed.get(f)])),
          delivery: snapshotFiles(info, [info.row.cards, authorReport, readings.file], observed, 'author', previous.revision + 1)};
        if (command === 'submit-author') { state.submission = {...frozen, phase: 'author', agent: options.agent, checks: previous.checkRun}; state.status = 'author-submitted'; }
        else { state.authorFreeze = frozen; state.status = 'awaiting-review'; }
        state.owner = null;
      } else if (command === 'assign-review') {
        if (previous.owner || previous.status !== 'awaiting-review') fail(`Cannot assign reviewer: ${previous.status}, owner=${previous.owner?.agent ?? 'none'}`);
        if (options.agent === previous.author) fail('Reviewer must differ from the author');
        assertFrozenArtifacts(previous.authorFreeze, observed);
        if (previous.authorFreeze.delivery) verifySnapshot(previous.authorFreeze.delivery, observed);
        state.status = 'reviewing'; state.reviewer = options.agent;
        state.owner = {role: 'reviewer', agent: options.agent, assignedAt: now};
        if (state.deliveryProtocol === 2) state.reviewBaseline = roleBaseline(info, 'review', observed);
      } else if (command === 'freeze-review' || command === 'submit-review') {
        if (previous.status !== 'reviewing' || previous.owner?.agent !== options.agent) fail('Only the active reviewer can freeze this batch');
        if (previous.deliveryProtocol === 2 && command === 'freeze-review') fail('Protocol 2 requires submit-review then coordinator accept-review');
        if (command === 'submit-review') {
          if (previous.deliveryProtocol !== 2 || String(previous.revision) !== String(options.revision)) fail('Stale revision or delivery protocol');
          checkEvidence(info, previous, 'review', observed, options.readings);
        }
        const cards = validateCards(info, observed, project);
        if (previous.authorFreeze.delivery) verifySnapshot(previous.authorFreeze.delivery, observed);
        const ledger = validateLedger(info, cards, observed, project);
        if (previous.deliveryProtocol === 2) requireDelta(previous.reviewBaseline, observed, 'Review');
        const preflight = await runReviewPreflight({taskRoot: root, batch: info.batch, phase: 'review', project});
        if (preflight.blockers.length) fail(`Review preflight blocked review handoff:\n${preflight.blockers.map(item => `${item.code}: ${item.message}`).join('\n')}`);
        const reviewReport = `${info.batch}.review.md`;
        report(reviewReport, observed);
        const readings = validateReadings(info, cards, observed, project, options.readings, 'review');
        const frozen = {at: now, cardsHash: observed.get(info.row.cards), ledger, readings,
          files: Object.fromEntries([info.row.cards, ledger.file, reviewReport, readings.file].map(f => [f, observed.get(f)])),
          delivery: snapshotFiles(info, [info.row.cards, ledger.file, reviewReport, readings.file], observed, 'review', previous.revision + 1)};
        if (command === 'submit-review') { state.submission = {...frozen, phase: 'review', agent: options.agent, checks: previous.checkRun}; state.status = 'review-submitted'; }
        else { state.reviewFreeze = frozen; state.status = 'reviewed'; }
        state.owner = null;
      }
      if (state.deliveryProtocol === 2 && !command.startsWith('submit-') && state.owner) {
        state[`${state.status === 'authoring' ? 'author' : 'review'}Baseline`] = roleBaseline(info, state.status === 'authoring' ? 'author' : 'review', observed);
      }
      delete state.checkRun;
      state.updatedAt = now; state.revision++;
      state.history.push({action: command, at: now, actor: assigning ? options.actor : options.agent,
        agent: options.agent, from: previous.status, to: state.status,
        ...(command === 'reopen-review' || command === 'reopen-author' || command.startsWith('transfer-') || command === 'return-to-author' || command === 'reject-submission' ? {reason:options.reason} : {}),
        ...(command.startsWith('transfer-') ? {newAgent:options['new-agent']} : {})});
      await commit(state, observed);
      return state;
    });
  }
  return {run};
}

const help = `Batch owner pipeline (all paths under ${TASK_ROOT})
  assign-author --batch lane/NN --agent NAME --actor root [--protocol 2]
  enable-delivery --batch lane/NN --actor root
  run-checks --batch lane/NN --agent NAME --plan lane/NN.checks.json
  submit-author --batch lane/NN --agent NAME --revision CURRENT_REVISION
  submit-review --batch lane/NN --agent NAME --revision CURRENT_REVISION [--readings lane/NN.review-readings.json]
  accept-author --batch lane/NN --actor root --revision SUBMITTED_REVISION --receipt SHA256
  accept-review --batch lane/NN --actor root --revision SUBMITTED_REVISION --receipt SHA256
  reject-submission --batch lane/NN --actor root --receipt SHA256 --reason CONCRETE_REASON
  seal-reviewed --batch lane/NN --actor root
  freeze-author --batch lane/NN --agent NAME
  assign-review --batch lane/NN --agent OTHER_NAME --actor root
  freeze-review --batch lane/NN --agent OTHER_NAME [--readings lane/NN.review-readings.json]
  reopen-review --batch lane/NN --agent REVIEWER --actor root --reason CONCRETE_REASON
  reopen-author --batch lane/NN --agent AUTHOR --actor root --reason CONCRETE_REASON
  transfer-author --batch lane/NN --agent OLD_AUTHOR --new-agent NEW_AUTHOR --actor root --reason HANDOFF_REASON
  transfer-review --batch lane/NN --agent OLD_REVIEWER --new-agent NEW_REVIEWER --actor root --reason HANDOFF_REASON
  return-to-author --batch lane/NN --agent AUTHOR --actor root --reason REWRITE_REASON
  describe --batch lane/NN
  list
  self-test
No existing batches are automatically enrolled. Assignment flags assert coordinator identity;
shared filesystem access is not an authentication boundary. See pipeline-notes.md.`;

export async function selfTest() {
  const relative = `pipeline-state/demo-${crypto.randomUUID()}`;
  const demo = safePath(TASK_ROOT, relative);
  fs.mkdirSync(path.join(demo, 'demo'), {recursive: true});
  const pipeline = createPipeline({taskRoot: demo});
  const project = await repository();
  const write = (name, data) => fs.writeFileSync(safePath(demo, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');
  const card = {id: 'usage:teoku:verb:読む:よむ', senseId: 'verb:読む:よむ', meaning: project.usageCardItem('verb:読む:よむ').meaning,
    form: 'teoku', scene: '明天要开讨论会，今天先读好资料。', before: [{text: '会議の前に、資料を', reading: 'かいぎのまえに、しりょうを'}],
    after: [{text: '。'}], translation: '开会前先读好资料。', review: 'draft'};
  const target = project.resolveUsageCard(card).target;
  const assignment = [{senseId: card.senseId, form: card.form, class: project.usageCardItem(card.senseId).class,
    meaning: card.meaning, answer: target.text, answerReading: target.reading}];
  const assignmentText = JSON.stringify(assignment, null, 2) + '\n';
  write('demo/00.assignment.json', assignmentText);
  const manifest = [{lane: 'demo', batch: 0, assignment: 'demo/00.assignment.json', cards: 'demo/00.cards.json', count: 1, hash: sha(assignmentText)}];
  write('manifest.json', manifest);
  const authorArgs = {batch: 'demo/00', agent: 'author', actor: 'root'};
  const freezeAuthor = {batch: 'demo/00', agent: 'author'};
  const reviewArgs = {batch: 'demo/00', agent: 'reviewer', actor: 'root'};
  const freezeReview = {batch: 'demo/00', agent: 'reviewer'};
  const checks = [];
  const reject = async (name, command, args, pattern) => { await assert.rejects(() => pipeline.run(command, args), pattern); checks.push(name); };
  const readingReport = () => ({cardsChecked: 1, dictionary: 'synthetic-test', structuralIssues: [], reviewCandidateCount: 0, candidates: []});
  const freshReadings = name => {
    write(name, readingReport());
    // Use the same timestamp as cards to avoid coarse Windows filesystem timestamp differences.
    const stamp = fs.statSync(safePath(demo, 'demo/00.cards.json')).mtime;
    fs.utimesSync(safePath(demo, name), stamp, new Date(stamp.getTime() + 1000));
  };
  try {
    assert.equal((await pipeline.run('describe', {batch: 'demo/00'})).status, 'unassigned'); checks.push('absent state is unassigned');
    await reject('path traversal blocked', 'assign-author', {...authorArgs, batch: '../00'}, /lane\/NN/);
    await reject('unknown batch blocked', 'assign-author', {...authorArgs, batch: 'demo/01'}, /absent from manifest/);
    await reject('arbitrary CLI path option blocked', 'assign-author', {...authorArgs, input: '../cards.json'}, /Unsupported/);
    await reject('coordinator assertion required', 'assign-author', {batch: 'demo/00', agent: 'author'}, /coordinator-only/);
    write('manifest.json', [{...manifest[0], cards: '../escape.cards.json'}]);
    await reject('manifest paths must match fixed batch prefix', 'assign-author', authorArgs, /paths do not match/);
    write('manifest.json', [...manifest, manifest[0]]);
    await reject('duplicate manifest batches blocked', 'assign-author', authorArgs, /duplicate manifest/);
    write('manifest.json', manifest);
    write('demo/00.assignment.json', assignmentText + ' ');
    await reject('manifest assignment hash enforced', 'assign-author', authorArgs, /hash differs/);
    write('demo/00.assignment.json', assignmentText);
    const concurrent = agent => new Promise((resolve, rejectChild) => {
      const code = `import {createPipeline} from ${JSON.stringify(pathToFileURL(fileURLToPath(import.meta.url)).href)}; try { await createPipeline({taskRoot:${JSON.stringify(demo)}}).run('assign-author',{batch:'demo/00',agent:${JSON.stringify(agent)},actor:'root'}); } catch(e) { console.error(e.message); process.exitCode=1; }`;
      const child = spawn(process.execPath, ['--input-type=module', '-e', code], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
      let stderr = '';
      child.stderr.on('data', data => { stderr += data; });
      child.on('error', rejectChild); child.on('close', code => resolve({code, stderr, agent}));
    });
    const racers = await Promise.all([concurrent('author'), concurrent('other-author')]);
    assert.equal(racers.filter(r => r.code === 0).length, 1);
    const author = (await pipeline.run('describe', {batch: 'demo/00'})).author;
    freezeAuthor.agent = author; authorArgs.agent = author;
    checks.push('two real processes racing assign exactly one owner');
    write('manifest.json', [{...manifest[0], course: 'changed'}]);
    await reject('enrolled manifest entry cannot change', 'describe', {batch: 'demo/00'}, /State\/manifest mismatch/);
    write('manifest.json', manifest);
    const lockPath = safePath(demo, 'pipeline-state/demo/00.lock');
    write('pipeline-state/demo/00.lock', {token: 'synthetic-other-process'});
    await reject('existing operation lock is never stolen', 'assign-author', authorArgs, /operation lock exists/);
    assert.equal(json(fs.readFileSync(lockPath)).token, 'synthetic-other-process');
    fs.unlinkSync(lockPath);
    await reject('active assignment cannot be overwritten', 'assign-author', authorArgs, /Cannot assign author/);
    const transfer={batch:'demo/00',agent:author,'new-agent':'replacement',actor:'root',reason:'Original synthetic writer stopped; hand off the preserved batch.'};
    await reject('author handoff requires coordinator','transfer-author',{...transfer,actor:'author'},/coordinator-only/);
    await reject('author handoff requires recorded source','transfer-author',{...transfer,agent:'wrong'},/recorded author/);
    const transferred=await pipeline.run('transfer-author',transfer);
    assert.equal(transferred.owner.agent,'replacement');
    assert.equal(transferred.previousAuthors[0].agent,author);
    await pipeline.run('transfer-author',{...transfer,agent:'replacement','new-agent':author});
    checks.push('author handoff preserves previous owner and allows only explicit transfer');
    await reject('wrong author cannot freeze', 'freeze-author', {...freezeAuthor, agent: 'impostor'}, /active author/);
    await reject('review cannot start before author freezes', 'assign-review', reviewArgs, /Cannot assign reviewer/);
    write('demo/00.cards.json', []);
    await reject('exact card coverage required', 'freeze-author', freezeAuthor, /coverage differs/);
    write('demo/00.cards.json', [{...card, scene: 'x'.repeat(40)}]);
    await reject('repository structure validation runs', 'freeze-author', freezeAuthor, /structure failed/);
    write('demo/00.cards.json', [card]);
    await reject('author report required', 'freeze-author', freezeAuthor, /ENOENT/);
    write('demo/00.author.md', 'Synthetic author report.');
    await reject('readings report required', 'freeze-author', freezeAuthor, /ENOENT/);
    freshReadings('demo/00.readings.json');
    fs.utimesSync(safePath(demo, 'demo/00.readings.json'), new Date(0), new Date(0));
    await reject('stale reading report refused', 'freeze-author', freezeAuthor, /predates cards/);
    freshReadings('demo/00.readings.json');
    const future = new Date(Date.now() + 2000);
    const reading = [...card.before, target, ...card.after].map(p => p.reading ?? p.text).join('');
    write('demo/00.readings.json', {...readingReport(), reviewCandidateCount: 1, candidates: [{...card, sentence: 'stale', reading}]});
    fs.utimesSync(safePath(demo, 'demo/00.readings.json'), future, future);
    await reject('reading candidates must describe current cards', 'freeze-author', freezeAuthor, /Stale reading candidate/);
    freshReadings('demo/00.readings.json');
    assert.equal((await pipeline.run('freeze-author', freezeAuthor)).status, 'awaiting-review'); checks.push('author handoff succeeds');
    await reject('self-review forbidden', 'assign-review', {...reviewArgs, agent: author}, /must differ/);
    write('demo/00.cards.json', [{...card, translation: 'Changed after author freeze.'}]);
    await reject('frozen artifacts cannot drift before review', 'assign-review', reviewArgs, /Frozen author artifact changed/);
    write('demo/00.cards.json', [card]);
    assert.equal((await pipeline.run('assign-review', reviewArgs)).status, 'reviewing'); checks.push('independent reviewer assigned');
    await reject('second reviewer refused', 'assign-review', {...reviewArgs, agent: 'second-reviewer'}, /Cannot assign reviewer/);
    const transferReview = {batch:'demo/00',agent:reviewArgs.agent,'new-agent':'replacement-reviewer',actor:'root',reason:'Old reviewer is stopped; preserve draft and transfer independent review.'};
    await reject('review handoff requires coordinator','transfer-review',{...transferReview,actor:'author'},/coordinator-only/);
    assert.throws(() => uniqueReviewReasons([{id:'a',reason:'All sentences passed.'},{id:'b',reason:'  All sentences passed.  '}]), /Repeated review reason/);
    uniqueReviewReasons([{id:'a',reason:'The child sleeps to let the parent work.'},{id:'b',reason:'The parent receives help when the child sleeps.'}]);
    checks.push('duplicate generic reasons rejected while distinct card decisions are accepted');
    await reject('review handoff requires recorded source','transfer-review',{...transferReview,agent:'wrong'},/recorded reviewer/);
    await reject('review handoff rejects author','transfer-review',{...transferReview,'new-agent':author},/different/);
    await reject('review handoff needs concrete reason','transfer-review',{...transferReview,reason:'short'},/concrete/);
    const handedReview = await pipeline.run('transfer-review',transferReview);
    assert.equal(handedReview.owner.agent,'replacement-reviewer');
    assert.equal(handedReview.author,author);
    assert.equal(handedReview.previousReviewers[0].artifacts['demo/00.cards.json'],sha(fs.readFileSync(safePath(demo,'demo/00.cards.json'))));
    await reject('former reviewer cannot freeze after handoff','freeze-review',freezeReview,/active reviewer/);
    await pipeline.run('transfer-review',{...transferReview,agent:'replacement-reviewer','new-agent':reviewArgs.agent});
    checks.push('review handoff preserves ownership history and current artifacts without approval');
    await reject('wrong reviewer cannot freeze', 'freeze-review', {...freezeReview, agent: author}, /active reviewer/);
    const sentence = [...card.before, target, ...card.after].map(p => p.text).join('');
    const record = {id: card.id, sentence, status: 'unresolved', reason: 'Synthetic unresolved decision accepted for handoff.', hash: sha(JSON.stringify(card))};
    write('demo/00.review.json', []);
    await reject('review ID coverage required', 'freeze-review', freezeReview, /every card exactly once/);
    write('demo/00.review.json', [{...record, sentence: 'stale'}]);
    await reject('review sentence bound to current target', 'freeze-review', freezeReview, /stale review/);
    write('demo/00.review.json', [{...record, hash: '0'.repeat(64)}]);
    await reject('review hash bound to pure card', 'freeze-review', freezeReview, /stale review/);
    write('demo/00.review.json', [{...record, reason: '   '}]);
    await reject('review reason cannot be empty', 'freeze-review', freezeReview, /stale review/);
    write('demo/00.review.json', [{...record, status: 'draft'}]);
    await reject('ledger status must be approved or unresolved', 'freeze-review', freezeReview, /stale review/);
    write('demo/00.review.json', [record]);
    await reject('review report required', 'freeze-review', freezeReview, /ENOENT/);
    write('demo/00.review.md', 'Synthetic review report.');
    freshReadings('demo/00.review-readings.json');
    const reviewed = await pipeline.run('freeze-review', freezeReview);
    assert.equal(reviewed.status, 'reviewed'); assert.equal(reviewed.reviewFreeze.ledger.unresolved, 1); assert.equal(reviewed.owner, null);
    checks.push('unresolved ledger can freeze without approving cards');
    const sealed = await pipeline.run('seal-reviewed', {batch:'demo/00', actor:'root'});
    assert.ok(sealed.authorFreeze.delivery?.root && sealed.reviewFreeze.delivery?.root);
    checks.push('reviewed batch seals immutable author and review delivery snapshots');
    await reject('reviewed batch cannot silently restart', 'assign-author', authorArgs, /Cannot assign author/);
    assert.equal((await pipeline.run('list')).counts.reviewed, 1); checks.push('list summarizes per-batch state');
    assert.equal(sealed.history.length, 8); checks.push('failed operations do not change history');
    await reject('frozen review cannot be transferred','transfer-review',transferReview,/active reviewer/);
    const rewrite = {batch:'demo/00',agent:'rewrite-author',actor:'root',reason:'Frozen draft contains template text; withdraw review and author a new revision.'};
    await reject('return to author requires coordinator','return-to-author',{...rewrite,actor:'reviewer'},/coordinator-only/);
    await reject('return to author requires concrete reason','return-to-author',{...rewrite,reason:'short'},/concrete/);
    const returned = await pipeline.run('return-to-author',rewrite);
    assert.equal(returned.status,'authoring'); assert.equal(returned.author,'rewrite-author');
    assert.equal(returned.reviewFreeze,undefined); assert.equal(returned.reviewer,null);
    assert.equal(returned.previousReviewFreezes.length,1); assert.equal(returned.previousAuthorFreezes.length,1);
    await reject('cannot return active author again','return-to-author',rewrite,/frozen reviewed/);
    await pipeline.run('freeze-author',{batch:'demo/00',agent:'rewrite-author'});
    await pipeline.run('assign-review',reviewArgs);
    write('demo/00.review.md','Synthetic review report after the rewritten author handoff.');
    freshReadings('demo/00.review-readings.json');
    await pipeline.run('freeze-review',freezeReview);
    checks.push('full rewrite withdraws approval and requires new independent review');
    assert.equal(fs.existsSync(safePath(demo, 'pipeline-state/demo/00.lock')), false); checks.push('operation locks released');
    const reopen={batch:'demo/00',agent:'second-reviewer',actor:'root',reason:'Repeat actual language review after frozen review report drift.'};
    await reject('reopen requires coordinator', 'reopen-review', {...reopen,actor:'reviewer'}, /coordinator-only/);
    await reject('reopen rejects author', 'reopen-review', {...reopen,agent:'rewrite-author'}, /differ from the author/);
    await reject('reopen requires concrete reason', 'reopen-review', {...reopen,reason:'fix'}, /concrete/);
    write('demo/00.review.md','Changed after freeze');
    const reopened=await pipeline.run('reopen-review',reopen);
    assert.equal(reopened.status,'reviewing'); assert.equal(reopened.reviewFreeze,undefined);
    assert.equal(reopened.previousReviewFreezes.at(-1).artifactChanges[0].file,'demo/00.review.md');
    checks.push('reopen revokes frozen approval and preserves drift evidence');
    await reject('reopen cannot steal a running review','reopen-review',reopen,/frozen reviewed/);

    // Protocol 2 tests only use this random synthetic workspace, never production batches.
    await pipeline.run('enable-delivery', {batch:'demo/00', actor:'root'});
    const reviewer = 'second-reviewer';
    const reviewCheck = {batch:'demo/00', agent:reviewer, plan:'demo/00.checks.json'};
    const reportBytes = JSON.stringify(readingReport());
    write('demo/00.checks.json', {outputs:['demo/00.review-readings.json'], steps:[
      {executable:process.execPath,args:['-e', `require('fs').writeFileSync('demo/00.review-readings.json',${JSON.stringify(reportBytes)})`]}
    ]});
    const revisionNow = async () => (await pipeline.run('describe',{batch:'demo/00'})).revision;
    const submitReview = async () => pipeline.run('submit-review',{batch:'demo/00',agent:reviewer,revision:await revisionNow()});
    await reject('protocol 2 refuses direct review freeze','freeze-review',{batch:'demo/00',agent:reviewer},/submit-review/);
    await assert.rejects(submitReview,/checked steps/); checks.push('submission needs successful check evidence');
    // A legitimate reviewer edit must not be mistaken for author snapshot drift.
    const revisedCard={...card,scene:'明天要讨论材料，今天先读完资料。'};
    write('demo/00.cards.json',[revisedCard]);
    write('demo/00.review.json',[{...record,hash:sha(JSON.stringify(revisedCard))}]);
    write('demo/00.review.md','Read the revised meeting preparation sentence and its explicit purpose.');
    await pipeline.run('run-checks',reviewCheck);
    write('demo/00.review.md','Edited after checks.');
    await assert.rejects(submitReview,/evidence is stale/); checks.push('post-check editing invalidates submission');
    await pipeline.run('run-checks',reviewCheck);
    write('demo/00.failing-checks.json',{outputs:['demo/00.review-readings.json'],steps:[
      {executable:process.execPath,args:['-e','process.exit(17)']},
      {executable:process.execPath,args:['-e',"require('fs').writeFileSync('must-not-run','bad')"]}
    ]});
    await reject('failed subprocess stops later steps','run-checks',{...reviewCheck,plan:'demo/00.failing-checks.json'},/exit=17/);
    assert.equal(fs.existsSync(safePath(demo,'must-not-run')),false);
    await assert.rejects(submitReview,/checked steps/); checks.push('failed rerun revokes previous successful evidence');
    write('demo/00.mutating-checks.json',{outputs:['demo/00.review-readings.json'],steps:[
      {executable:process.execPath,args:['-e',"require('fs').appendFileSync('demo/00.review.md',' changed inside checker')"]}
    ]});
    await reject('checking cannot silently modify reviewed inputs','run-checks',{...reviewCheck,plan:'demo/00.mutating-checks.json'},/Inputs changed/);
    await assert.rejects(submitReview,/checked steps/); checks.push('input drift during check leaves no reusable success');
    await pipeline.run('run-checks',reviewCheck);
    const submitted=await submitReview();
    assert.equal(submitted.status,'review-submitted'); assert.equal(submitted.owner,null);
    assert.equal(submitted.reviewFreeze,undefined);
    const accept={batch:'demo/00',actor:'root',receipt:submitted.submission.delivery.receipt,revision:submitted.revision};
    await reject('submitter cannot accept its own command identity','accept-review',{...accept,actor:reviewer},/coordinator-only/);
    await reject('receipt mismatch refused','accept-review',{...accept,receipt:'0'.repeat(64)},/receipt/);
    await reject('stale acceptance revision refused','accept-review',{...accept,revision:submitted.revision-1},/revision/);
    await assert.rejects(submitReview,/active reviewer/); checks.push('submitted phase refuses a second write-side submission');
    const snapshot=submitted.submission.delivery;
    const frozenReport=readDelivery(demo,snapshot).get('demo/00.review.md');
    write('demo/00.review.md','Still writing after submit.');
    await reject('late working-file write blocks acceptance','accept-review',accept,/changed after submission/);
    assert.deepEqual(readDelivery(demo,snapshot).get('demo/00.review.md'),frozenReport);
    checks.push('working-file drift cannot mutate captured delivery bytes');
    await pipeline.run('reject-submission',{batch:'demo/00',actor:'root',receipt:accept.receipt,reason:'The writer changed the report after submission; prepare a new immutable version.'});
    write('demo/00.review.md','New explicit handoff after rejecting the incomplete submission.');
    await pipeline.run('run-checks',reviewCheck);
    const second=await submitReview();
    assert.notEqual(second.submission.delivery.root,snapshot.root);
    await reject('old receipt cannot accept replacement','accept-review',{...accept,revision:second.revision},/receipt/);
    const accepted=await pipeline.run('accept-review',{...accept,receipt:second.submission.delivery.receipt,revision:second.revision});
    assert.equal(accepted.status,'reviewed'); assert.equal(accepted.reviewFreeze.ledger.unresolved,1);
    assert.deepEqual(readDelivery(demo,accepted.authorFreeze.delivery).get('demo/00.cards.json'),Buffer.from(JSON.stringify([card],null,2)+'\n'));
    checks.push('legitimate review edits preserve the original author snapshot');
    const immutablePath=accepted.reviewFreeze.delivery.files['demo/00.review.md'];
    const savedSnapshot=fs.readFileSync(safePath(demo,immutablePath));
    write(immutablePath,'Unexpected direct snapshot write.');
    assert.throws(()=>readDelivery(demo,accepted.reviewFreeze.delivery),/artifact drift/);
    write(immutablePath,savedSnapshot.toString('utf8'));
    checks.push('tampered snapshot is refused by consumer');
    const manifestPath=accepted.reviewFreeze.delivery.manifest;
    const manifestBytes=fs.readFileSync(safePath(demo,manifestPath));
    write(manifestPath,manifestBytes.toString('utf8')+' ');
    assert.throws(()=>readDelivery(demo,accepted.reviewFreeze.delivery),/manifest drift/);
    write(manifestPath,manifestBytes.toString('utf8'));
    assert.throws(()=>createDelivery({root:demo,batch:'../outside',phase:'review',revision:1,artifacts:new Map([['demo/00.cards.json',Buffer.from('[]')]])}),/Invalid delivery metadata/);
    checks.push('manifest tampering and delivery path escape rejected');
    // Simulate a legacy state with a legitimately revised card: do not fake author history.
    const legacy=structuredClone(accepted);
    delete legacy.authorFreeze.delivery; delete legacy.reviewFreeze.delivery;
    write('pipeline-state/demo/00.json',legacy);
    write('demo/00.review.md','Drift before legacy sealing.');
    await reject('legacy sealing cannot bless drift','seal-reviewed',{batch:'demo/00',actor:'root'},/Frozen author artifact changed/);
    write('demo/00.review.md',savedSnapshot.toString('utf8'));
    const migrated=await pipeline.run('seal-reviewed',{batch:'demo/00',actor:'root'});
    assert.equal(migrated.authorFreeze.delivery,undefined);
    assert.ok(migrated.reviewFreeze.delivery);
    checks.push('legacy migration preserves original author hashes without inventing author bytes');
    await pipeline.run('return-to-author',{...rewrite,agent:'writer-v2'});
    await reject('protocol 2 refuses direct author freeze','freeze-author',{batch:'demo/00',agent:'writer-v2'},/submit-author/);
    write('demo/00.author-checks.json',{outputs:['demo/00.readings.json'],steps:[
      {executable:process.execPath,args:['-e',`require('fs').writeFileSync('demo/00.readings.json',${JSON.stringify(reportBytes)})`]}
    ]});
    const authorCheck={batch:'demo/00',agent:'writer-v2',plan:'demo/00.author-checks.json'};
    await pipeline.run('run-checks',authorCheck);
    await reject('refreshing only check output cannot replace new author report','submit-author',{batch:'demo/00',agent:'writer-v2',revision:await revisionNow()},/unchanged/);
    write('demo/00.author.md','Re-read the meeting preparation card; author handoff v2.');
    await pipeline.run('run-checks',authorCheck);
    const authorSubmission=await pipeline.run('submit-author',{batch:'demo/00',agent:'writer-v2',revision:await revisionNow()});
    assert.equal(authorSubmission.status,'author-submitted');
    await reject('review cannot start before author acceptance','assign-review',reviewArgs,/Cannot assign reviewer/);
    const authorAccepted=await pipeline.run('accept-author',{batch:'demo/00',actor:'root',revision:authorSubmission.revision,receipt:authorSubmission.submission.delivery.receipt});
    assert.equal(authorAccepted.status,'awaiting-review');
    checks.push('author submission requires separate coordinator acceptance');
    return {passed: checks.length, checks, productionStatesCreated: 0};
  } finally {
    // Only the verified, generated synthetic root is recursively removed.
    const checked = safePath(TASK_ROOT, relative);
    if (checked !== demo || !path.basename(checked).startsWith('demo-')) fail('Refusing unsafe test cleanup');
    fs.rmSync(checked, {recursive: true, force: true});
  }
}

function parse(argv) {
  const [command = 'help', ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    if (!/^--[a-z-]+$/.test(key) || !rest[i + 1] || rest[i + 1].startsWith('--')) fail(`Expected --option value, got ${key}`);
    if (own(options, key.slice(2))) fail(`Repeated option: ${key}`);
    options[key.slice(2)] = rest[i + 1];
  }
  return {command, options};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const {command, options} = parse(process.argv.slice(2));
    if (command === 'help') { if (Object.keys(options).length) fail('help takes no options'); console.log(help); }
    else {
      if (command === 'self-test' && Object.keys(options).length) fail('self-test takes no options');
      console.log(JSON.stringify(command === 'self-test' ? await selfTest() : await createPipeline().run(command, options), null, 2));
    }
  } catch (error) { console.error(`pipeline: ${error.message}`); process.exitCode = 1; }
}
