#!/usr/bin/env node
// Retrospective per-card language audit. Mechanical checks never approve prose.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {USAGE_CARDS, resolveUsageCard, usageCardIssues, usageCardItem} from '../app/lib/usage-cards.mjs';
import {assessFormUsage} from '../app/lib/form-eligibility.mjs';
import {createDelivery, readDelivery} from '../.agents/skills/write-katsuyo-usage-cards/scripts/delivery-store.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultRoot = path.join(project, 'work/naturalness-full-20260923');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file));
const fail = message => { throw Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const stageSources = [
  ['basics', ['basics.mjs', 'class-basics.mjs', 'basic-words/index.mjs']],
  ['voice', ['voice-words/index.mjs']],
  ['linking', ['linking.mjs', 'class-linking-1.mjs', 'class-linking-2.mjs', 'linking-words/index.mjs']],
  ['intentions', ['intention-words/index.mjs']],
  ['actions', ['actions.mjs', 'actions-generated.mjs', 'class-actions-1.mjs', 'class-actions-2.mjs']],
  ['integration', ['combinations.mjs', 'integration-generated.mjs', 'class-combinations-1.mjs', 'class-combinations-2.mjs']],
];
const baseName = batchId => batchId.replace('/', '-');
const repairDeliveryBatch = repairId => `repair/${repairId.replace(/\D/gu, '')}`;
const rootFile = (root, relative) => path.join(root, relative);
const writeNew = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
};
const writeFrozen = (file, value) => {
  if (fs.existsSync(file)) assert(hash(read(file)) === hash(value), `Frozen input drift: ${file}`);
  else writeNew(file, value);
};
const writeState = (root, state) => {
  const next = rootFile(root, 'state.json.next');
  fs.writeFileSync(next, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(next, rootFile(root, 'state.json'));
};
const current = new Map(USAGE_CARDS.map(card => [card.id, card]));
assert(current.size === USAGE_CARDS.length, 'Runtime card IDs are not unique');

async function sourceOrder() {
  const stages = new Map();
  const seen = new Set();
  for (const [stage, files] of stageSources) {
    const ids = [];
    for (const file of files) {
      const module = await import(pathToFileURL(path.join(project, 'app/lib/usage-cards', file)).href);
      for (const card of module.default) {
        if (!current.has(card.id)) continue; // Previously deferred exact pair.
        assert(!seen.has(card.id), `Card appears in two source modules: ${card.id}`);
        seen.add(card.id);
        ids.push(card.id);
      }
    }
    stages.set(stage, ids);
  }
  assert(seen.size === current.size, 'Source modules do not partition the current runtime cards');
  return stages;
}

function verifiedPrior() {
  const proof = read(path.join(project, 'docs/usage-card-naturalness-20260923.json'));
  const ids = new Set();
  for (const row of proof.approvedRevisions) {
    assert(!ids.has(row.id) && row.languageReview?.status === 'approved'
      && row.languageReview.id === row.id && row.languageReview.hash === row.draftHash
      && hash(row.currentCard) === row.currentHash
      && hash(current.get(row.id)) === row.currentHash
      && /^[a-f0-9]{64}$/u.test(row.authorReceipt) && /^[a-f0-9]{64}$/u.test(row.reviewReceipt),
    `Prior approval is missing or stale: ${row.id}`);
    ids.add(row.id);
  }
  assert(ids.size === 36, `Expected 36 exact prior approvals, found ${ids.size}`);
  return ids;
}

async function initialize(root) {
  assert(!fs.existsSync(root), `Audit root already exists: ${root}`);
  const prior = verifiedPrior();
  const stages = await sourceOrder();
  const batches = {};
  let index = 0;
  const stageCounts = {};
  for (const [stage, ids] of stages) {
    const pending = ids.filter(id => !prior.has(id));
    stageCounts[stage] = {current: ids.length, previouslyApproved: ids.length - pending.length, pending: pending.length};
    for (let start = 0; start < pending.length; start += 16) {
      const slice = pending.slice(start, start + 16);
      const batchId = `audit/${String(index++).padStart(4, '0')}`;
      batches[batchId] = {stage, ids: slice, sourceHashes: slice.map(id => hash(current.get(id))),
        status: 'queued'};
    }
  }
  const pendingCount = Object.values(stageCounts).reduce((n, row) => n + row.pending, 0);
  assert(current.size === 17596 && prior.size === 36 && pendingCount === 17560,
    'Current runtime differs from the approved 17,596/36/17,560 scope; inspect before initializing');
  fs.mkdirSync(root, {recursive: true});
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: project, encoding: 'utf8'}).trim();
  const snapshot = {schemaVersion: 1, sourceCommit: commit, runtimeHash: hash(USAGE_CARDS),
    activeCount: current.size, priorApprovedIds: [...prior], stageCounts,
    cards: USAGE_CARDS};
  writeNew(rootFile(root, 'baseline/snapshot.json'), snapshot);
  writeNew(rootFile(root, 'baseline/cards.json'), USAGE_CARDS);
  const manifest = {schemaVersion: 1, sourceCommit: commit, snapshotHash: hash(snapshot),
    activeCount: current.size, priorApprovedCount: prior.size, pendingCount,
    batchSize: 16, batchCount: Object.keys(batches).length,
    stageCounts, batches};
  writeNew(rootFile(root, 'manifest.json'), manifest);
  writeState(root, {schemaVersion: 1, snapshotHash: manifest.snapshotHash, batches});
  return {root, sourceCommit: commit, active: current.size, priorApproved: prior.size,
    pending: pendingCount, batches: manifest.batchCount, stageCounts};
}

function prepareReadings(root) {
  const {manifest} = loadState(root);
  const snapshot = read(rootFile(root, 'baseline/snapshot.json'));
  const cards = read(rootFile(root, 'baseline/cards.json'));
  assert(hash(snapshot) === manifest.snapshotHash && hash(cards) === snapshot.runtimeHash,
    'Frozen card snapshot changed before reading audit');
  const readingsPath = rootFile(root, 'baseline/readings.json');
  if (!fs.existsSync(readingsPath)) {
    const readingTool = path.join(project, '.agents/skills/write-katsuyo-usage-cards/scripts/reading-audit.py');
    execFileSync('uv', ['run', '--no-project', '--with', 'fugashi[unidic-lite]', 'python',
      readingTool, '--project', project, '--input', rootFile(root, 'baseline/cards.json'),
      '--output', readingsPath], {cwd: project, stdio: 'pipe'});
  }
  const readings = read(readingsPath);
  assert(readings.cardsChecked === cards.length && !(readings.structuralIssues?.length),
    'Full reading audit is incomplete');
  const proof = {sourceHash: snapshot.runtimeHash, reportHash: hash(readings),
    cardsChecked: readings.cardsChecked, candidates: readings.reviewCandidateCount,
    dictionary: readings.dictionary, dictionaryVersion: readings.dictionaryVersion};
  writeFrozen(rootFile(root, 'baseline/readings-proof.json'), proof);
  return proof;
}

function loadState(root) {
  const manifest = read(rootFile(root, 'manifest.json'));
  const state = read(rootFile(root, 'state.json'));
  assert(state.snapshotHash === manifest.snapshotHash, 'State belongs to another frozen snapshot');
  assert(Object.keys(state.batches).length === manifest.batchCount, 'Batch count drift');
  return {manifest, state};
}

function status(root) {
  const {manifest, state} = loadState(root);
  const batchCounts = {queued: 0, assigned: 0, reviewed: 0};
  const counts = {approved: manifest.priorApprovedCount, revise: 0, uncertain: 0};
  const stages = Object.fromEntries(Object.entries(manifest.stageCounts)
    .map(([stage, row]) => [stage, {...row, approved: row.previouslyApproved, revise: 0, uncertain: 0}]));
  for (const batch of Object.values(state.batches)) {
    batchCounts[batch.status] += 1;
    for (const row of batch.rows ?? []) {
      counts[row.status] += 1;
      stages[batch.stage][row.status] += 1;
    }
  }
  const repairedIds = new Set();
  let failedRepairAttempts = 0;
  for (const repair of Object.values(state.repairs ?? {})) {
    for (const row of repair.rows ?? []) {
      if (row.status === 'approved') repairedIds.add(row.id);
      else failedRepairAttempts += 1;
    }
  }
  const reviewedCards = counts.approved - manifest.priorApprovedCount + counts.revise + counts.uncertain;
  const deferredCount = Object.keys(state.deferrals ?? {}).length;
  return {root, active: manifest.activeCount, priorApproved: manifest.priorApprovedCount,
    pendingInitial: manifest.pendingCount, batches: manifest.batchCount, batchCounts,
    cardCounts: {reviewedInitial: reviewedCards, notYetReviewed: manifest.pendingCount - reviewedCards,
      approvedWithoutChanges: counts.approved, approvedRepairs: repairedIds.size,
      approvedTotal: counts.approved + repairedIds.size,
      deferred: deferredCount,
      unresolved: counts.revise + counts.uncertain - repairedIds.size - deferredCount,
      failedRepairAttempts}, stages};
}

function pilot(root) {
  const {state} = loadState(root);
  const result = [];
  for (const [stage] of stageSources) {
    const row = Object.entries(state.batches).find(([, batch]) => batch.stage === stage);
    if (row) result.push({batchId: row[0], stage, count: row[1].ids.length, status: row[1].status});
  }
  return result;
}

function prepareRepair(root, batchId) {
  const {state} = loadState(root);
  const batch = state.batches[batchId];
  assert(batch?.status === 'reviewed', `Batch has no frozen review: ${batchId}`);
  const existing = Object.entries(state.repairs ?? {}).filter(([, row]) => row.sourceBatchId === batchId);
  if (existing.length) return existing.map(([repairId, row]) => ({repairId, stage: row.stage,
    count: row.ids.length, assignment: rootFile(root, row.assignment), source: rootFile(root, row.source),
    feedback: rootFile(root, row.feedback)}));
  const packet = read(rootFile(root, batch.packet));
  const report = read(packet.output);
  const frozen = readDelivery(root, batch.sourceDelivery);
  const cards = JSON.parse(frozen.get(`snapshots/${baseName(batchId)}.cards.json`));
  const sentences = JSON.parse(frozen.get(`snapshots/${baseName(batchId)}.sentences.json`));
  const cardById = new Map(cards.map(card => [card.id, card]));
  const sentenceById = new Map(sentences.map(row => [row.id, row]));
  const failed = report.rows.filter(row => row.status !== 'approved');
  const prepared = [];
  state.repairs ??= {};
  for (let start = 0; start < failed.length; start += 5) {
    const rows = failed.slice(start, start + 5);
    const repairId = `${baseName(batchId)}-${String(start / 5 + 1).padStart(2, '0')}`;
    const prefix = `repairs/${repairId}`;
    const source = rows.map(row => ({...cardById.get(row.id), review: 'draft'}));
    const assignment = rows.map(row => {
      const card = cardById.get(row.id), sentence = sentenceById.get(row.id);
      const item = usageCardItem(card.senseId);
      return {id: row.id, senseId: card.senseId, form: card.form, class: item.class,
        meaning: card.meaning, answer: sentence.target.text,
        answerReading: sentence.target.reading, sourceHash: sentence.hash};
    });
    const relative = {assignment: `${prefix}/assignment.json`, source: `${prefix}/source.json`,
      feedback: `${prefix}/feedback.json`};
    writeNew(rootFile(root, relative.assignment), assignment);
    writeNew(rootFile(root, relative.source), source);
    writeNew(rootFile(root, relative.feedback), rows);
    state.repairs[repairId] = {sourceBatchId: batchId, stage: batch.stage,
      ids: rows.map(row => row.id), status: 'prepared', attemptNumber: 1, ...relative};
    prepared.push({repairId, stage: batch.stage, count: rows.length,
      assignment: rootFile(root, relative.assignment), source: rootFile(root, relative.source),
      feedback: rootFile(root, relative.feedback)});
  }
  writeState(root, state);
  return prepared;
}

function prepareRetry(root, parentRepairId) {
  const {state} = loadState(root);
  const parent = state.repairs?.[parentRepairId];
  const attemptNumber = parent?.attemptNumber ?? 1;
  assert(parent?.status === 'reviewed' && attemptNumber < 3,
    `Repair is not eligible for a new attempt: ${parentRepairId}`);
  const existing = Object.entries(state.repairs).filter(([, row]) => row.parentRepairId === parentRepairId);
  if (existing.length) return existing.map(([repairId, row]) => ({repairId, count: row.ids.length,
    assignment: rootFile(root, row.assignment), source: rootFile(root, row.source),
    feedback: rootFile(root, row.feedback)}));
  const failed = parent.rows.filter(row => row.status !== 'approved');
  if (!failed.length) return [];
  const frozen = readDelivery(root, parent.sourceDelivery);
  const source = JSON.parse(frozen.get(`repairs/${parentRepairId}/draft.json`));
  const priorSource = frozen.has(parent.source)
    ? JSON.parse(frozen.get(parent.source)) : read(rootFile(root, parent.source));
  const sourceNotes = JSON.parse(frozen.get(`repairs/${parentRepairId}/notes.json`));
  const sourceById = new Map([...priorSource, ...source].map(card => [card.id, card]));
  const noteById = new Map(sourceNotes.map(row => [row.id, row]));
  const earlierAssignment = read(rootFile(root, parent.assignment));
  const fixedById = new Map(earlierAssignment.map(row => [row.id, row]));
  const reviewRows = parent.reviewDelivery
    ? new Map(read(read(rootFile(root, parent.packet)).output).rows.map(row => [row.id, row])) : new Map();
  const prepared = [];
  for (let start = 0; start < failed.length; start += 5) {
    const slice = failed.slice(start, start + 5);
    const repairId = `${parentRepairId}-r${attemptNumber + 1}-${String(start / 5 + 1).padStart(2, '0')}`;
    const prefix = `repairs/${repairId}`;
    const cards = slice.map(row => sourceById.get(row.id));
    const assignment = slice.map(row => {
      const card = sourceById.get(row.id), fixed = fixedById.get(row.id);
      assert(card && fixed, `Missing rejected repair source: ${row.id}`);
      return {...fixed, sourceHash: hash({...card, review: 'approved'})};
    });
    const feedback = slice.map(row => reviewRows.get(row.id) ??
      {id: row.id, status: 'uncertain', reason: 'Previous author did not find a credible new sentence.',
        priorAttempt: noteById.get(row.id)});
    const relative = {assignment: `${prefix}/assignment.json`, source: `${prefix}/source.json`,
      feedback: `${prefix}/feedback.json`};
    writeNew(rootFile(root, relative.assignment), assignment);
    writeNew(rootFile(root, relative.source), cards);
    writeNew(rootFile(root, relative.feedback), feedback);
    state.repairs[repairId] = {sourceBatchId: parent.sourceBatchId, parentRepairId,
      stage: parent.stage, ids: slice.map(row => row.id), status: 'prepared',
      attemptNumber: attemptNumber + 1, ...relative};
    prepared.push({repairId, count: slice.length,
      assignment: rootFile(root, relative.assignment),
      source: rootFile(root, relative.source), feedback: rootFile(root, relative.feedback)});
  }
  writeState(root, state);
  return prepared;
}

function assign(root, batchId, reviewer) {
  assert(/^\/root\/[a-z0-9_]+$/u.test(reviewer ?? ''), 'Pass the actual independent reviewer handle');
  const {manifest, state} = loadState(root);
  const batch = state.batches[batchId];
  assert(batch?.status === 'queued' && manifest.batches[batchId], `Batch not queued: ${batchId}`);
  const cards = batch.ids.map((id, index) => {
    const card = current.get(id);
    assert(card && hash(card) === batch.sourceHashes[index], `Current source card drift: ${id}`);
    assert(usageCardIssues([card]).length === 0, `Invalid source card: ${id}`);
    return card;
  });
  const sentences = cards.map(card => {
    const resolved = resolveUsageCard(card);
    assert(resolved, `Cannot construct full target: ${card.id}`);
    const parts = [...card.before, resolved.target, ...card.after];
    const usage = assessFormUsage(usageCardItem(card.senseId), card.form);
    return {id: card.id, hash: hash(card), senseId: card.senseId, form: card.form,
      meaning: card.meaning, sentence: parts.map(part => part.text).join(''),
      reading: parts.map(part => part.reading ?? part.text).join(''),
      target: resolved.target, usage: {status: usage.status, reason: usage.reason, context: usage.context?.text}};
  });
  const key = baseName(batchId);
  const cardsRel = `snapshots/${key}.cards.json`;
  const sentencesRel = `snapshots/${key}.sentences.json`;
  const readingsRel = `checks/${key}.readings.json`;
  writeFrozen(rootFile(root, cardsRel), cards);
  writeFrozen(rootFile(root, sentencesRel), sentences);
  fs.mkdirSync(path.dirname(rootFile(root, readingsRel)), {recursive: true});
  const baselineReadings = read(rootFile(root, 'baseline/readings.json'));
  const readingProof = read(rootFile(root, 'baseline/readings-proof.json'));
  const frozenSnapshot = read(rootFile(root, 'baseline/snapshot.json'));
  assert(baselineReadings.cardsChecked === manifest.activeCount
    && !(baselineReadings.structuralIssues?.length)
    && readingProof.reportHash === hash(baselineReadings)
    && hash(frozenSnapshot) === manifest.snapshotHash
    && readingProof.sourceHash === frozenSnapshot.runtimeHash,
  'Baseline reading audit is missing or invalid');
  const ids = new Set(batch.ids);
  const candidates = (baselineReadings.candidates ?? []).filter(row => ids.has(row.id));
  const readings = {...baselineReadings, cardsChecked: cards.length,
    reviewCandidateCount: candidates.length, candidates};
  writeFrozen(rootFile(root, readingsRel), readings);
  assert(!(readings.structuralIssues?.length), `Reading structure issues in ${batchId}`);
  const sources = new Map([cardsRel, sentencesRel, readingsRel]
    .map(relative => [relative, fs.readFileSync(rootFile(root, relative))]));
  const delivery = createDelivery({root, batch: batchId, phase: 'author', revision: 1, artifacts: sources});
  const packet = {schemaVersion: 1, batchId, stage: batch.stage, reviewer,
    sourceReceipt: delivery.receipt, count: cards.length,
    cards: rootFile(root, delivery.files[cardsRel]),
    sentences: rootFile(root, delivery.files[sentencesRel]),
    readings: rootFile(root, delivery.files[readingsRel]),
    output: rootFile(root, `reviews/${key}-${reviewer.slice(6)}.json`)};
  const packetRel = `packets/${key}.json`;
  writeNew(rootFile(root, packetRel), packet);
  state.batches[batchId] = {...batch, status: 'assigned', reviewer,
    sourceDelivery: delivery, packet: packetRel};
  writeState(root, state);
  return {packet: rootFile(root, packetRel), sourceReceipt: delivery.receipt,
    batchId, stage: batch.stage, count: cards.length};
}

function rolesPresent(roles) {
  if (typeof roles === 'string') return roles.trim().length >= 2;
  return roles && typeof roles === 'object' && Object.values(roles).length >= 2
    && Object.values(roles).every(value => typeof value === 'string' && value.trim().length >= 2);
}

function visibleCardHash(card) {
  return hash({id: card.id, senseId: card.senseId, form: card.form, meaning: card.meaning,
    scene: card.scene, before: card.before.map(part => part.text),
    after: card.after.map(part => part.text), translation: card.translation, note: card.note});
}
function noCandidateExplanation(note) {
  return String(note.reason ?? note.result
    ?? (typeof note.evidence === 'string' ? note.evidence : '')).trim();
}

function record(root, batchId, reviewer, dryRun = false) {
  const {state} = loadState(root);
  const batch = state.batches[batchId];
  assert(batch?.status === 'assigned' && batch.reviewer === reviewer, 'Batch is not assigned to this reviewer');
  const packet = read(rootFile(root, batch.packet));
  const files = readDelivery(root, batch.sourceDelivery);
  const key = baseName(batchId);
  const cards = JSON.parse(files.get(`snapshots/${key}.cards.json`));
  const sentences = JSON.parse(files.get(`snapshots/${key}.sentences.json`));
  const readings = JSON.parse(files.get(`checks/${key}.readings.json`));
  const report = read(packet.output);
  assert(report.reviewer === reviewer && report.sourceReceipt === packet.sourceReceipt
    && report.count === cards.length && Array.isArray(report.rows)
    && report.rows.length === cards.length, 'Reviewer identity, receipt or row count mismatch');
  const expected = new Map(sentences.map(row => [row.id, row]));
  const seen = new Set();
  const reasons = new Set();
  for (const row of report.rows) {
    const source = expected.get(row.id);
    assert(source && !seen.has(row.id) && source.hash === row.hash
      && source.sentence === row.sentence
      && ['approved', 'revise', 'uncertain'].includes(row.status),
    `Stale or duplicate review row: ${row.id}`);
    seen.add(row.id);
    const reason = String(row.reason ?? '').trim().replace(/\s+/gu, ' ');
    assert(reason.length >= 20 && !reasons.has(reason), `Generic or repeated review reason: ${row.id}`);
    reasons.add(reason);
    assert(rolesPresent(row.roles)
      && ['reason', 'time', 'negation', 'translation', 'reading'].every(field =>
        typeof row[field] === 'string' && row[field].trim().length >= 2),
    `Incomplete language finding: ${row.id}`);
    assert(!row.noNaturalExpression || (row.status !== 'approved'
      && typeof row.noNaturalBasis === 'string' && row.noNaturalBasis.trim().length >= 30),
    `Incomplete direct deferral claim: ${row.id}`);
  }
  const candidates = new Set((readings.candidates ?? []).map(row => row.id));
  assert(Array.isArray(report.candidates) && report.candidates.length === candidates.size
    && new Set(report.candidates.map(row => row.id)).size === candidates.size
    && report.candidates.every(row => candidates.has(row.id)
      && ['retain', 'error'].includes(row.decision) && String(row.reason ?? '').trim()),
  'Reading candidate decisions do not match frozen audit');
  assert(report.candidates.every(candidate => candidate.decision !== 'error'
    || report.rows.find(row => row.id === candidate.id)?.status !== 'approved'),
  'A reading error cannot be approved');
  if (dryRun) return {batchId, valid: true, count: cards.length};
  const relative = path.relative(root, packet.output).split(path.sep).join('/');
  const delivery = createDelivery({root, batch: batchId, phase: 'review', revision: 1,
    artifacts: new Map([[relative, fs.readFileSync(packet.output)]])});
  state.batches[batchId] = {...batch, status: 'reviewed', reviewDelivery: delivery,
    rows: report.rows.map(({id, hash, status, noNaturalExpression = false}) =>
      ({id, hash, status, noNaturalExpression}))};
  writeState(root, state);
  return {batchId, stage: batch.stage, reviewReceipt: delivery.receipt,
    approved: report.rows.filter(row => row.status === 'approved').length,
    revise: report.rows.filter(row => row.status === 'revise').length,
    uncertain: report.rows.filter(row => row.status === 'uncertain').length};
}

function freezeRepair(root, repairId, reviewer, precomputedReadings = null, author = null) {
  assert(/^\/root\/[a-z0-9_]+$/u.test(reviewer ?? ''), 'Pass the actual independent reviewer handle');
  if (author !== null) assert(/^\/root\/[a-z0-9_]+$/u.test(author), 'Pass the actual author agent handle');
  const {state} = loadState(root);
  const repair = state.repairs?.[repairId];
  assert(repair?.status === 'prepared', `Repair is not prepared: ${repairId}`);
  assert(!author || !repair.authorHandle || repair.authorHandle === author,
    `Repair author assignment changed: ${repairId}`);
  const assignment = read(rootFile(root, repair.assignment));
  const source = read(rootFile(root, repair.source));
  const draftRel = `repairs/${repairId}/draft.json`;
  const notesRel = `repairs/${repairId}/notes.json`;
  const draft = read(rootFile(root, draftRel));
  const notes = read(rootFile(root, notesRel));
  assert(Array.isArray(draft) && Array.isArray(notes) && draft.length <= assignment.length
    && notes.length === assignment.length, 'Repair cards and notes must cover the exact assignment');
  const byId = new Map(source.map(card => [card.id, card]));
  const draftById = new Map(draft.map(card => [card.id, card]));
  const assignments = new Map(assignment.map(row => [row.id, row]));
  const noteById = new Map(notes.map(row => [row.id, row]));
  assert(new Set(draft.map(card => card.id)).size === draft.length
    && noteById.size === notes.length
    && [...draftById.keys()].every(id => assignments.has(id)), 'Duplicate or extra repair ID');
  const changed = [];
  const withoutCandidate = [];
  for (const fixed of assignment) {
    const card = draftById.get(fixed.id);
    const prior = byId.get(fixed.id), note = noteById.get(fixed.id);
    const noCandidate = note?.attemptKind === 'no-credible-candidate'
      || note?.disposition === 'no-credible-candidate'
      || note?.status === 'no-credible-candidate';
    assert(prior && note && hash({...prior, review: 'approved'}) === fixed.sourceHash,
      `Repair assignment or original hash drift: ${fixed.id}`);
    if (!card) {
      assert(noCandidate && noCandidateExplanation(note).length >= 30,
        `Missing draft lacks a specific no-candidate record: ${fixed.id}`);
      withoutCandidate.push({id: fixed.id, sourceHash: fixed.sourceHash, note});
      continue;
    }
    assert(prior && fixed && note && card.review === 'draft'
      && ['id', 'senseId', 'form', 'meaning'].every(field => card[field] === prior[field]),
    `Repair scope or original hash drift: ${card.id}`);
    const resolved = resolveUsageCard(card);
    assert(resolved && resolved.target.text === fixed.answer
      && resolved.target.reading === fixed.answerReading, `Repair changed the target: ${card.id}`);
    assert(usageCardIssues([card]).length === 0, `Repair structure failed: ${card.id}`);
    if (hash(card) === hash(prior) || (noCandidate && visibleCardHash(card) === visibleCardHash(prior))) {
      assert(noCandidate && noCandidateExplanation(note).length >= 30,
      `Unchanged repair lacks a specific no-candidate record: ${card.id}`);
      withoutCandidate.push({id: card.id, sourceHash: fixed.sourceHash, note});
    } else changed.push(card);
  }
  const checkRel = `checks/${repairId}.readings.json`;
  fs.mkdirSync(path.dirname(rootFile(root, checkRel)), {recursive: true});
  const readingTool = path.join(project, '.agents/skills/write-katsuyo-usage-cards/scripts/reading-audit.py');
  if (precomputedReadings) writeFrozen(rootFile(root, checkRel), precomputedReadings);
  else execFileSync('uv', ['run', '--no-project', '--with', 'fugashi[unidic-lite]', 'python',
    readingTool, '--project', project, '--input', rootFile(root, draftRel), '--output', rootFile(root, checkRel)],
  {cwd: project, stdio: 'pipe'});
  const readings = read(rootFile(root, checkRel));
  assert(readings.cardsChecked === draft.length && !(readings.structuralIssues?.length),
    `Reading audit scope or structure issues: ${repairId}`);
  const cardRel = `repairs/${repairId}/review-cards.json`;
  const sentenceRel = `repairs/${repairId}/review-sentences.json`;
  const readingRel = `repairs/${repairId}/review-readings.json`;
  const sentences = changed.map(card => {
    const resolved = resolveUsageCard(card);
    return {id: card.id, hash: hash(card), sentence: [...card.before, resolved.target, ...card.after]
      .map(part => part.text).join('')};
  });
  writeFrozen(rootFile(root, cardRel), changed);
  writeFrozen(rootFile(root, sentenceRel), sentences);
  writeFrozen(rootFile(root, readingRel), {...readings,
    candidates: (readings.candidates ?? []).filter(row => changed.some(card => card.id === row.id))});
  const artifacts = new Map([draftRel, notesRel, repair.assignment, repair.source, cardRel, sentenceRel, readingRel]
    .map(relative => [relative, fs.readFileSync(rootFile(root, relative))]));
  const delivery = createDelivery({root, batch: repairDeliveryBatch(repairId),
    phase: 'author', revision: 1, artifacts});
  const packet = {schemaVersion: 1, repairId, reviewer, sourceReceipt: delivery.receipt,
    count: changed.length, cards: rootFile(root, delivery.files[cardRel]),
    sentences: rootFile(root, delivery.files[sentenceRel]),
    readings: rootFile(root, delivery.files[readingRel]),
    assignment: rootFile(root, delivery.files[repair.assignment]),
    output: rootFile(root, `reviews/${repairId}-${reviewer.slice(6)}.json`)};
  const packetRel = `packets/${repairId}.json`;
  writeNew(rootFile(root, packetRel), packet);
  state.repairs[repairId] = {...repair, ...(author ? {authorHandle: author} : {}),
    status: changed.length ? 'assigned' : 'reviewed',
    reviewer: changed.length ? reviewer : null, sourceDelivery: delivery, packet: packetRel,
    noCandidate: withoutCandidate, changedIds: changed.map(card => card.id),
    rows: changed.length ? undefined : withoutCandidate.map(row => ({id: row.id, status: 'no-credible-candidate'}))};
  writeState(root, state);
  return {repairId, packet: rootFile(root, packetRel), sourceReceipt: delivery.receipt,
    changed: changed.length, noCandidate: withoutCandidate.length};
}

function freezeRepairs(root, pairs, authored = false) {
  const width = authored ? 3 : 2;
  assert(pairs.length > 0 && pairs.length % width === 0,
    `Pass repairId reviewer${authored ? ' author' : ''} groups`);
  const jobs = [];
  for (let index = 0; index < pairs.length; index += width) {
    const [repairId, reviewer, author] = pairs.slice(index, index + width);
    const {state} = loadState(root);
    assert(state.repairs?.[repairId]?.status === 'prepared', `Repair is not prepared: ${repairId}`);
    jobs.push({repairId, reviewer, author, cards: read(rootFile(root, `repairs/${repairId}/draft.json`))});
  }
  const allCards = jobs.flatMap(job => job.cards);
  const ids = new Set(allCards.map(card => card.id));
  if (ids.size !== allCards.length || !allCards.length) {
    return jobs.map(job => freezeRepair(root, job.repairId, job.reviewer, null, job.author));
  }
  const key = crypto.randomUUID();
  const input = rootFile(root, `checks/bulk-${key}.input.json`);
  const output = rootFile(root, `checks/bulk-${key}.readings.json`);
  fs.mkdirSync(path.dirname(input), {recursive: true});
  fs.writeFileSync(input, JSON.stringify(allCards));
  const readingTool = path.join(project, '.agents/skills/write-katsuyo-usage-cards/scripts/reading-audit.py');
  execFileSync('uv', ['run', '--no-project', '--with', 'fugashi[unidic-lite]', 'python',
    readingTool, '--project', project, '--input', input, '--output', output],
  {cwd: project, stdio: 'pipe'});
  const readings = read(output);
  assert(readings.cardsChecked === allCards.length && !(readings.structuralIssues?.length),
    'Bulk reading audit scope or structure issues');
  return jobs.map(job => {
    const selected = new Set(job.cards.map(card => card.id));
    const candidates = readings.candidates.filter(candidate => selected.has(candidate.id));
    return freezeRepair(root, job.repairId, job.reviewer, {
      ...readings, cardsChecked: job.cards.length,
      reviewCandidateCount: candidates.length, candidates,
    }, job.author);
  });
}

function recordRepair(root, repairId, reviewer, dryRun = false) {
  const {state} = loadState(root);
  const repair = state.repairs?.[repairId];
  assert(repair?.status === 'assigned' && repair.reviewer === reviewer, 'Repair is not assigned to this reviewer');
  const packet = read(rootFile(root, repair.packet));
  const files = readDelivery(root, repair.sourceDelivery);
  const cardRel = `repairs/${repairId}/review-cards.json`;
  const sentenceRel = `repairs/${repairId}/review-sentences.json`;
  const readingRel = `repairs/${repairId}/review-readings.json`;
  const cards = JSON.parse(files.get(cardRel));
  const sentences = JSON.parse(files.get(sentenceRel));
  const readings = JSON.parse(files.get(readingRel));
  const report = read(packet.output);
  assert(report.reviewer === reviewer && report.sourceReceipt === packet.sourceReceipt
    && report.count === cards.length && Array.isArray(report.rows)
    && report.rows.length === cards.length, 'Repair report scope or receipt mismatch');
  const expected = new Map(sentences.map(row => [row.id, row]));
  const seen = new Set();
  const reasons = new Set();
  for (const row of report.rows) {
    const source = expected.get(row.id);
    assert(source && !seen.has(row.id) && source.hash === row.hash
      && source.sentence === row.sentence && ['approved', 'revise', 'uncertain'].includes(row.status),
    `Stale repair review row: ${row.id}`);
    seen.add(row.id);
    const reason = String(row.reason ?? '').trim().replace(/\s+/gu, ' ');
    assert(reason.length >= 20 && !reasons.has(reason), `Generic or repeated repair reason: ${row.id}`);
    reasons.add(reason);
    assert(rolesPresent(row.roles)
      && ['reason', 'time', 'negation', 'translation', 'reading'].every(field =>
        typeof row[field] === 'string' && row[field].trim().length >= 2),
    `Incomplete repair finding: ${row.id}`);
  }
  const candidateIds = new Set((readings.candidates ?? []).map(row => row.id));
  assert(Array.isArray(report.candidates) && report.candidates.length === candidateIds.size
    && report.candidates.every(row => candidateIds.has(row.id)
      && ['retain', 'error'].includes(row.decision) && String(row.reason ?? '').trim()),
  'Repair reading candidate mismatch');
  assert(report.candidates.every(candidate => candidate.decision !== 'error'
    || report.rows.find(row => row.id === candidate.id)?.status !== 'approved'),
  'A reading error cannot be approved');
  if (dryRun) return {repairId, valid: true, count: cards.length};
  const reportRel = path.relative(root, packet.output).split(path.sep).join('/');
  const delivery = createDelivery({root, batch: repairDeliveryBatch(repairId),
    phase: 'review', revision: 1, artifacts: new Map([[reportRel, fs.readFileSync(packet.output)]])});
  state.repairs[repairId] = {...repair, status: 'reviewed', reviewDelivery: delivery,
    rows: [...report.rows.map(({id, hash, status}) => ({id, hash, status})),
      ...repair.noCandidate.map(({id}) => ({id, status: 'no-credible-candidate'}))]};
  writeState(root, state);
  return {repairId, reviewReceipt: delivery.receipt,
    approved: report.rows.filter(row => row.status === 'approved').length,
    revise: report.rows.filter(row => row.status === 'revise').length,
    uncertain: report.rows.filter(row => row.status === 'uncertain').length,
    noCandidate: repair.noCandidate.length};
}

function annotateAuthor(root, repairId, author) {
  assert(/^\/root\/[a-z0-9_]+$/u.test(author ?? ''), 'Pass the actual author agent handle');
  const {state} = loadState(root);
  const repair = state.repairs?.[repairId];
  assert(repair && repair.sourceDelivery && (!repair.authorHandle || repair.authorHandle === author),
    `Cannot annotate author for ${repairId}`);
  state.repairs[repairId] = {...repair, authorHandle: author};
  writeState(root, state);
  return {repairId, author, authorReceipt: repair.sourceDelivery.receipt};
}

function annotateAuthors(root, pairs) {
  assert(pairs.length > 0 && pairs.length % 2 === 0, 'Pass repairId author pairs');
  const {state} = loadState(root);
  const result = [];
  for (let index = 0; index < pairs.length; index += 2) {
    const [repairId, author] = pairs.slice(index, index + 2);
    assert(/^\/root\/[a-z0-9_]+$/u.test(author ?? ''), 'Pass the actual author agent handle');
    const repair = state.repairs?.[repairId];
    assert(repair && repair.sourceDelivery && (!repair.authorHandle || repair.authorHandle === author),
      `Cannot annotate author for ${repairId}`);
    state.repairs[repairId] = {...repair, authorHandle: author};
    result.push({repairId, author, authorReceipt: repair.sourceDelivery.receipt});
  }
  writeState(root, state);
  return result;
}

function deferPair(root, id) {
  const {state} = loadState(root);
  if (state.deferrals?.[id]) return state.deferrals[id];
  const sourceEntry = Object.entries(state.batches).find(([, batch]) =>
    batch.rows?.some(row => row.id === id && row.status !== 'approved'));
  assert(sourceEntry, `No rejected original review for ${id}`);
  const [sourceBatchId, sourceBatch] = sourceEntry;
  const sourceIndex = sourceBatch.ids.indexOf(id);
  const attempts = Object.entries(state.repairs ?? {})
    .filter(([, repair]) => repair.sourceBatchId === sourceBatchId
      && repair.status === 'reviewed' && repair.rows.some(row => row.id === id))
    .map(([repairId, repair]) => {
      const row = repair.rows.find(candidate => candidate.id === id);
      assert(row.status !== 'approved' && repair.authorHandle,
        `Unresolved attempt lacks a verified author: ${repairId}/${id}`);
      const files = readDelivery(root, repair.sourceDelivery);
      const notes = JSON.parse(files.get(`repairs/${repairId}/notes.json`));
      const note = notes.find(candidate => candidate.id === id);
      assert(note, `Missing attempt note: ${repairId}/${id}`);
      if (row.status === 'no-credible-candidate') assert(
        noCandidateExplanation(note).length >= 30,
        `No-candidate attempt lacks concrete evidence: ${repairId}/${id}`);
      else assert(repair.reviewDelivery && ['revise', 'uncertain'].includes(row.status),
        `Rejected draft lacks an independent review: ${repairId}/${id}`);
      return {repairId, attemptNumber: repair.attemptNumber ?? 1,
        kind: row.status === 'no-credible-candidate' ? 'no-credible-candidate' : 'reviewed-draft-rejected',
        author: repair.authorHandle, authorReceipt: repair.sourceDelivery.receipt,
        reviewReceipt: repair.reviewDelivery?.receipt ?? null,
        cardHash: row.hash ?? null, noteHash: hash(note), note};
    }).sort((a, b) => a.attemptNumber - b.attemptNumber);
  assert(attempts.length === 3
    && attempts.every((row, index) => row.attemptNumber === index + 1)
    && new Set(attempts.map(row => row.authorReceipt)).size === 3,
  `Exact pair does not have three distinct completed repair attempts: ${id}`);
  const searchNotes = attempts.filter(row => row.kind === 'no-credible-candidate');
  assert(new Set(searchNotes.map(row => row.noteHash)).size === searchNotes.length,
    `No-candidate search was repeated: ${id}`);
  const source = current.get(id);
  assert(source && hash(source) === sourceBatch.sourceHashes[sourceIndex],
    `Published source drift before deferral: ${id}`);
  const result = {id, pair: `${source.senseId}/${source.form}`,
    sourceHash: hash(source), sourceBatchId,
    basis: 'three-failed-repair-attempts', attempts,
    restoreCondition: '有自然且适合课程用义的新句通过独立审核后，逐对恢复常规出题。'};
  state.deferrals ??= {};
  state.deferrals[id] = result;
  writeState(root, state);
  return result;
}

const [command, ...args] = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
const root = rootIndex >= 0 ? path.resolve(args[rootIndex + 1]) : defaultRoot;
if (rootIndex >= 0) args.splice(rootIndex, 2);
try {
  let result;
  if (command === 'init') result = await initialize(root);
  else if (command === 'prepare-readings') result = prepareReadings(root);
  else if (command === 'status') result = status(root);
  else if (command === 'pilot') result = pilot(root);
  else if (command === 'prepare-repair') result = prepareRepair(root, args[0]);
  else if (command === 'prepare-repair-many') result = args.flatMap(batchId => prepareRepair(root, batchId));
  else if (command === 'prepare-ready-repairs') {
    const {state} = loadState(root);
    const already = new Set(Object.values(state.repairs ?? {}).map(row => row.sourceBatchId));
    result = Object.entries(state.batches)
      .filter(([id, row]) => row.status === 'reviewed' && !already.has(id)
        && row.rows.some(finding => finding.status !== 'approved'))
      .flatMap(([id]) => prepareRepair(root, id));
  }
  else if (command === 'prepare-retry') result = prepareRetry(root, args[0]);
  else if (command === 'prepare-retry-many') result = args.flatMap(repairId => prepareRetry(root, repairId));
  else if (command === 'prepare-ready-retries') {
    const {state} = loadState(root);
    const parents = new Set(Object.values(state.repairs ?? {}).map(row => row.parentRepairId).filter(Boolean));
    result = Object.entries(state.repairs ?? {})
      .filter(([id, row]) => row.status === 'reviewed' && (row.attemptNumber ?? 1) < 3
        && row.rows.some(finding => finding.status !== 'approved') && !parents.has(id))
      .flatMap(([id]) => prepareRetry(root, id));
  }
  else if (command === 'assign') result = assign(root, args[0], args[1]);
  else if (command === 'assign-many') {
    assert(args.length > 0 && args.length % 2 === 0, 'Pass batchId reviewer pairs');
    result = [];
    for (let index = 0; index < args.length; index += 2) result.push(assign(root, args[index], args[index + 1]));
  }
  else if (command === 'record') result = record(root, args[0], args[1]);
  else if (command === 'check-report') result = record(root, args[0], args[1], true);
  else if (command === 'record-many') {
    assert(args.length > 0 && args.length % 2 === 0, 'Pass batchId reviewer pairs');
    result = [];
    for (let index = 0; index < args.length; index += 2) result.push(record(root, args[index], args[index + 1]));
  }
  else if (command === 'record-ready') {
    const {state} = loadState(root);
    result = Object.entries(state.batches)
      .filter(([, row]) => row.status === 'assigned'
        && fs.existsSync(read(rootFile(root, row.packet)).output))
      .map(([batchId, row]) => record(root, batchId, row.reviewer));
  }
  else if (command === 'freeze-repair') result = freezeRepair(root, args[0], args[1]);
  else if (command === 'freeze-repair-many') result = freezeRepairs(root, args);
  else if (command === 'freeze-repair-authored') result = freezeRepair(root, args[0], args[1], null, args[2]);
  else if (command === 'freeze-repair-authored-many') result = freezeRepairs(root, args, true);
  else if (command === 'record-repair') result = recordRepair(root, args[0], args[1]);
  else if (command === 'check-repair-report') result = recordRepair(root, args[0], args[1], true);
  else if (command === 'annotate-author') result = annotateAuthor(root, args[0], args[1]);
  else if (command === 'annotate-author-many') result = annotateAuthors(root, args);
  else if (command === 'defer-pair') result = deferPair(root, args[0]);
  else if (command === 'record-ready-repairs') {
    const {state} = loadState(root);
    result = Object.entries(state.repairs ?? {})
      .filter(([, row]) => row.status === 'assigned'
        && fs.existsSync(read(rootFile(root, row.packet)).output))
      .map(([repairId, row]) => recordRepair(root, repairId, row.reviewer));
  }
  else fail('Usage: audit-naturalness.mjs init|prepare-readings|status|pilot|assign batchId reviewer|assign-many batchId reviewer...|record batchId reviewer|record-many batchId reviewer...|record-ready|prepare-repair batchId|prepare-repair-many batchId...|prepare-ready-repairs|prepare-retry repairId|prepare-retry-many repairId...|prepare-ready-retries|freeze-repair repairId reviewer|freeze-repair-many repairId reviewer...|record-repair repairId reviewer|record-ready-repairs|annotate-author repairId author|defer-pair cardId [--root path]');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
}
