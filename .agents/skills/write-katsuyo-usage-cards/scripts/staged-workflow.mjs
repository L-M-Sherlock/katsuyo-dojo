#!/usr/bin/env node
// Protocol 3: author workspaces -> immutable submissions -> main review -> main merge.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {deliveryPath, createDelivery, readDelivery} from './delivery-store.mjs';
import {sha, pair, cardHash, validateAssignment, screenCards, sentenceOf, makeReviewTable} from './staged-quality.mjs';

const fail = message => { throw new Error(message); };
const main = actor => { if (actor !== '/root') fail('Main agent only: use actual actor /root'); };
const json = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, ''));
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const agentPattern = /^\/root(?:\/[a-z0-9_]+)?$/u;
const needsWork = stage => ['writing', 'checked', 'check-failed'].includes(stage.status);
const reviewPolicies = new Set(['main', 'coordinator-only', 'consensus']);
const limit = (value, fallback, name) => {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) fail(`${name} must be a positive integer`);
  return parsed;
};
const policy = (value, fallback = 'main') => {
  const result = value === undefined || value === null || value === '' ? fallback : String(value);
  if (!reviewPolicies.has(result)) fail(`reviewPolicy must be one of ${[...reviewPolicies].join(', ')}`);
  return result;
};
const quorum = (value, max) => {
  const count = limit(value, 2, 'requiredReviews');
  if (count < 2 || count > max) fail('requiredReviews must be at least 2 and no greater than maxReviewers');
  return count;
};

const isoTime = value => {
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) fail(`Invalid timestamp: ${value}`);
  return parsed;
};
const leaseToken = () => crypto.randomUUID();

export function createStagedWorkflow({taskRoot, project, now = () => new Date().toISOString(), lockTimeoutMs = 30000, stageLeaseMs = 900000} = {}) {
  const leaseDuration = value => limit(value, stageLeaseMs, 'stageLeaseMs');
  const root = fs.realpathSync(taskRoot);
  const file = relative => deliveryPath(root, relative);
  const read = relative => fs.readFileSync(file(relative));
  const readJson = relative => json(read(relative));
  const hashFile = relative => fs.existsSync(file(relative)) ? sha(read(relative)) : null;
  const statePath = 'staged-state/state.json';
  const writeNew = (relative, value) => {
    fs.mkdirSync(path.dirname(file(relative)), {recursive: true});
    fs.writeFileSync(file(relative), encode(value), {flag: 'wx'});
  };
  const writeState = state => {
    const temp = `staged-state/${crypto.randomUUID()}.tmp`;
    writeNew(temp, state);
    fs.renameSync(file(temp), file(statePath));
  };
  const manifest = () => readJson('manifest.json');
  const source = batch => {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*\/\d{2,}$/u.test(batch ?? '')) fail('Use a safe batch lane/NN');
    const entry = manifest().find(row => `${row.lane}/${String(row.batch).padStart(2, '0')}` === batch);
    if (!entry) fail(`Unknown batch ${batch}`);
    if (entry.assignment !== `${batch}.assignment.json` || entry.cards !== `${batch}.cards.json`) fail('Manifest paths do not match batch');
    const bytes = read(entry.assignment), rows = json(bytes);
    if (sha(bytes) !== entry.hash || rows.length !== entry.count) fail(`Assignment changed: ${batch}`);
    return {entry, rows, hash: sha(bytes), entryHash: sha(JSON.stringify(entry))};
  };
  const guard = state => {
    for (const [relative, hash] of Object.entries(state.protected)) {
      if (hashFile(relative) !== hash) fail(`Protected file changed outside main merge: ${relative}`);
    }
  };
  const stageFor = (state, batch, id) => {
    const item = state.batches[batch];
    const stage = item?.stages.find(row => row.id === id);
    if (!stage) fail(`Unknown stage ${batch}/${id}`);
    const current = source(batch);
    if (current.hash !== item.assignmentHash || current.entryHash !== item.entryHash) fail('Dispatch assignment changed');
    return {item, stage, current};
  };
  const leaseExpired = stage => !stage.lease || isoTime(stage.lease.expiresAt) <= isoTime(now());
  const assertLease = (stage, actor, token) => {
    if (stage.owner !== actor) fail('Only the active stage author may operate this stage');
    if (!stage.lease || leaseExpired(stage)) fail('Owner lease expired; coordinator must reclaim the stage');
    if (token !== undefined && token !== stage.lease.token) fail('Lease token does not match the active owner');
  };
  const newLease = (owner, duration) => {
    const started = now();
    return {owner, token: leaseToken(), heartbeatAt: started,
      expiresAt: new Date(isoTime(started) + duration).toISOString()};
  };
  const snapshot = stage => {
    const bytes = readDelivery(root, stage.delivery);
    const scopeBytes = bytes.get(stage.paths.scope);
    if (!scopeBytes || sha(scopeBytes) !== stage.scopeHash) fail('Author scope hash does not match immutable delivery');
    const cards = json(bytes.get(stage.paths.cards));
    const notes = json(bytes.get(stage.paths.notes));
    const readings = json(bytes.get(stage.paths.readings));
    if (!Array.isArray(cards) || cards.length !== stage.pairs.length) fail('Immutable card snapshot count mismatch');
    if (!Array.isArray(notes) || notes.length !== cards.length) fail('Immutable notes snapshot count mismatch');
    const pairs = new Set(cards.map(pair));
    const cardsBytes = bytes.get(stage.paths.cards);
    if (stage.cardSnapshotHash && sha(cardsBytes) !== stage.cardSnapshotHash) fail('Author card snapshot hash mismatch');
    if (pairs.size !== cards.length || stage.pairs.some(p => !pairs.has(p))) fail('Immutable card snapshot scope mismatch');
    return {cards, notes, readings};
  };
  const independent = (stage, reviewer) => {
    if (!agentPattern.test(reviewer ?? '') || reviewer === '/root' || reviewer === stage.owner
        || stage.previousOwners?.some(row => row.owner === reviewer)) fail('Reviewer must be independent of root and every current or previous author');
  };
  const reviewerPacket = (stage, reviewer) => {
    readDelivery(root, stage.delivery);
    const report = stage.reviewOutputPaths?.[reviewer];
    if (!report) fail('Missing fixed reviewer output path');
    const conflict = stage.conflict;
    return {
      version: 1,
      reviewer,
      batch: stage.batch,
      stage: stage.id,
      authorReceipt: stage.delivery.receipt,
      receipt: stage.delivery.receipt,
      scopeHash: stage.scopeHash,
      cardSnapshotHash: stage.cardSnapshotHash,
      count: stage.pairs.length,
      assignment: file(stage.delivery.files[stage.paths.scope]),
      cards: file(stage.delivery.files[stage.paths.cards]),
      notes: file(stage.delivery.files[stage.paths.notes]),
      readings: file(stage.delivery.files[stage.paths.readings]),
      output: file(report),
      reviewScope: conflict ? {cardIds: conflict.cardIds, candidateIds: conflict.candidateIds,
        primaryReviewers: conflict.primaryReviewers, primaryReceipts: conflict.primaryReceipts} : null,
      reviewPairs: conflict ? snapshot(stage).cards
        .filter(card => stage.conflict.cardIds?.includes(card.id))
        .map(card => pair(card)) : stage.pairs.slice(),
      packetRevision: stage.reviewPacketRevision ?? 0,
    };
  };
  const reportConflicts = (stage, snap, reviewers) => {
    const reports = reviewers.map(reviewer => stage.reviews?.[reviewer]?.review).filter(Boolean);
    if (reports.length < reviewers.length || reports.length < 2) return null;
    const cardIds = snap.cards.filter(card => new Set(reports.map(report => report.rows.find(row => row.id === card.id)?.status)).size > 1).map(card => card.id);
    const candidateIds = snap.readings.candidates.filter(candidate => new Set(reports.map(report => report.candidates.find(row => row.id === candidate.id)?.decision)).size > 1).map(candidate => candidate.id);
    if (!cardIds.length && !candidateIds.length) return null;
    return {cardIds, candidateIds, primaryReviewers: [...reviewers],
      primaryReceipts: Object.fromEntries(reviewers.map(reviewer => [reviewer, stage.reviews[reviewer].delivery.receipt]))};
  };
  const verifiedReview = (stage, reviewer) => {
    independent(stage, reviewer);
    const entry = stage.reviews?.[reviewer];
    if (!entry?.delivery) fail(`Missing immutable reviewer delivery: ${reviewer}`);
    const bytes = readDelivery(root, entry.delivery).get(entry.report);
    if (!bytes || entry.receipt !== entry.delivery.receipt) fail('Reviewer receipt mismatch');
    const report = json(bytes);
    if (report.reviewer !== reviewer || report.selfReview !== false || report.authorReceipt !== stage.delivery.receipt) fail('Reviewer source or identity mismatch');
    if (report.scopeHash !== undefined && report.scopeHash !== stage.scopeHash) fail('Reviewer scope hash mismatch');
    if (report.cardSnapshotHash !== undefined && report.cardSnapshotHash !== stage.cardSnapshotHash) fail('Reviewer card snapshot hash mismatch');
    if (report.count !== undefined && report.count !== stage.pairs.length) fail('Reviewer card count mismatch');
    const review = {...report};
    for (const key of ['reviewer', 'selfReview', 'reviewedAt', 'authorReceipt', 'scopeHash', 'cardSnapshotHash', 'count']) delete review[key];
    if (JSON.stringify(review) !== JSON.stringify(entry.review)) fail('Reviewer report delivery does not match recorded report');
    return review;
  };
  const verifyFinalization = stage => {
    if (!stage.finalization) {
      if (stage.reviewerDecisionBy === 'coordinator') fail('Missing mechanical finalization receipt');
      readDelivery(root, stage.reviewDelivery); return;
    }
    const {delivery, report} = stage.finalization;
    const summaryBytes = readDelivery(root, delivery).get(report);
    if (!summaryBytes) fail('Finalization summary delivery is missing its source');
    const summary = json(summaryBytes);
    if (summary.authorReceipt !== stage.delivery.receipt || summary.scopeHash !== stage.scopeHash
        || summary.cardSnapshotHash !== stage.cardSnapshotHash
        || summary.count !== stage.pairs.length || summary.status !== stage.status
        || summary.stage !== stage.id || summary.requiredReviews < 2) fail('Finalization source or outcome mismatch');
    readDelivery(root, stage.delivery);
    const reviewers = stage.reviewers ?? [];
    if (reviewers.length < summary.requiredReviews || Object.keys(summary.reviewerReceipts).length !== reviewers.length) fail('Finalization quorum mismatch');
    for (const reviewer of reviewers) {
      verifiedReview(stage, reviewer);
      if (summary.reviewerReceipts[reviewer] !== stage.reviews[reviewer].delivery.receipt) fail('Finalization reviewer dependency changed');
    }
  };
  const approved = item => {
    const cards = new Map();
    for (const stage of item.stages.filter(s => s.status === 'approved')) {
      verifyFinalization(stage);
      for (const card of snapshot(stage).cards) cards.set(pair(card), card);
    }
    return cards;
  };
  const latest = (item, kind) => item.stages.filter(s => s.kind === kind).at(-1);
  const event = (state, type, details = {}) => state.events.push({at: now(), type, ...details});
  const checkNotes = (notes, cards) => {
    if (!Array.isArray(notes) || notes.length !== cards.length || new Set(notes.map(n => n.id)).size !== cards.length) fail('Every card needs exactly one author note');
    for (const card of cards) {
      const note = notes.find(n => n.id === card.id);
      for (const field of ['roles', 'object', 'time', 'negation']) {
        const value = typeof note?.[field] === 'object' ? Object.values(note[field]).join('；') : note?.[field];
        if (typeof value !== 'string' || !value.trim()) fail(`Missing author ${field}: ${card.id}`);
      }
    }
  };
  const checkDraft = stage => {
    const scopeBytes = read(stage.paths.scope);
    if (sha(scopeBytes) !== stage.scopeHash) fail('Stage scope changed');
    const scope = json(scopeBytes), cards = readJson(stage.paths.cards), notes = readJson(stage.paths.notes);
    const current = validateAssignment(scope, project);
    if (current.some(r => r.status !== 'valid')) fail('Current assignment resolution failed');
    const result = screenCards(cards, scope, project);
    checkNotes(notes, cards);
    return {scope, cards, notes, result};
  };
  const fileSet = stage => Object.fromEntries(['scope', 'cards', 'notes', 'readings'].map(key => [stage.paths[key], hashFile(stage.paths[key])]));
  const verifyCheck = stage => {
    if (!stage.check) fail('Run staged check after the final edit');
    for (const [relative, hash] of Object.entries(stage.check.files)) if (!hash || hashFile(relative) !== hash) fail(`Stale stage check: ${relative}`);
  };

  async function run(command, opts = {}) {
    fs.mkdirSync(file('staged-state'), {recursive: true});
    const lockPath = file('staged-state/operation.lock');
    const deadline = Date.now() + lockTimeoutMs;
    let fd;
    while (fd === undefined) {
      try { fd = fs.openSync(lockPath, 'wx'); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (Date.now() >= deadline) fail('Operation lock is still held; retry after the active operation finishes');
        await delay(Math.min(100, Math.max(1, deadline - Date.now())));
      }
    }
    try {
      if (command === 'init') {
        main(opts.actor);
        if (fs.existsSync(file(statePath))) fail('Staged workflow already initialized');
        const protectedFiles = {'manifest.json': hashFile('manifest.json')};
        for (const row of manifest()) for (const f of [row.assignment, row.cards]) protectedFiles[f] = hashFile(f);
        const state = {version: 3, startedAt: now(),
          maxAuthors: limit(opts.maxAuthors, 6, 'maxAuthors'),
          maxReviewQueue: limit(opts.maxReviewQueue, 6, 'maxReviewQueue'),
          maxReviewers: limit(opts.maxReviewers, 8, 'maxReviewers'),
          reviewPolicy: policy(opts.reviewPolicy),
          stageLeaseMs: leaseDuration(opts.stageLeaseMs),
          protected: protectedFiles, batches: {}, pending: {}, registeredReviewers: [], events: []};
        state.requiredReviews = quorum(opts.requiredReviews, state.maxReviewers);
        event(state, 'initialized'); writeNew(statePath, state);
        return {version: 3, maxAuthors: state.maxAuthors, maxReviewQueue: state.maxReviewQueue,
          maxReviewers: state.maxReviewers, requiredReviews: state.requiredReviews, reviewPolicy: state.reviewPolicy,
          stageLeaseMs: state.stageLeaseMs};
      }
      const state = readJson(statePath);
      if (state.version !== 3) fail('Not a protocol 3 state');
      // States created before reviewer scaling used these implicit defaults.
      const maxAuthors = limit(state.maxAuthors, 6, 'maxAuthors');
      const maxReviewQueue = limit(state.maxReviewQueue, 6, 'maxReviewQueue');
      const maxReviewers = limit(state.maxReviewers, 8, 'maxReviewers');
      const stageLeaseMs = leaseDuration(state.stageLeaseMs);
      state.stageLeaseMs = stageLeaseMs;
      state.registeredReviewers ??= [];
      for (const batch of Object.values(state.batches ?? {})) for (const stage of batch.stages ?? []) {
        for (const reviewer of stage.reviewers ?? []) if (!state.registeredReviewers.includes(reviewer)) state.registeredReviewers.push(reviewer);
      }
      if (state.registeredReviewers.length > maxReviewers) fail('Registered reviewer pool exceeds configured capacity');
      const reviewPolicy = policy(state.reviewPolicy);
      const requiredReviews = quorum(state.requiredReviews, maxReviewers);
      guard(state);
      if (command === 'status' || command === 'metrics') {
        const stages = Object.entries(state.batches).flatMap(([batch, item]) => item.stages.map(s => ({batch, id: s.id, kind: s.kind, owner: s.owner, status: s.status, count: s.pairs.length,
          lease: s.lease ? {heartbeatAt: s.lease.heartbeatAt, expiresAt: s.lease.expiresAt, expired: leaseExpired(s)} : null})));
        const decisions = state.events.filter(e => e.type === 'reviewed');
        const first = new Map(); for (const e of state.events.filter(e => e.type === 'first-draft')) for (const row of e.rows) if (!first.has(row.id)) first.set(row.id, {...row, outcome: row.invalid ? 'rejected' : 'pending'});
        for (const e of decisions) for (const row of e.decisions) {
          const initial = first.get(row.id);
          if (initial?.outcome === 'pending') initial.outcome = initial.hash === row.hash ? row.status : 'rejected';
        }
        const firstDecided = [...first.values()].filter(row => row.outcome !== 'pending');
        const currentApproved = new Set(Object.values(state.batches).flatMap(item => [...approved(item).keys()]));
        const cutoff = Date.parse(now()) - 3600000;
        const recent = new Set(decisions.filter(e => Date.parse(e.at) >= cutoff).flatMap(e => e.decisions.filter(r => r.status === 'approved').map(r => r.pair)));
        const validRecent = [...recent].filter(p => currentApproved.has(p));
        return {stages, pending: state.pending, config: {maxAuthors, maxReviewQueue, maxReviewers, requiredReviews, reviewPolicy,
            stageLeaseMs, registeredReviewers: state.registeredReviewers.length}, metrics: {approvedPairs: currentApproved.size, approvedLastHour: validRecent.length,
          firstDraftDecided: firstDecided.length, firstDraftPending: first.size - firstDecided.length,
          firstPassApproved: firstDecided.filter(row => row.outcome === 'approved').length,
          firstPassRate: firstDecided.length ? firstDecided.filter(row => row.outcome === 'approved').length / firstDecided.length : null,
          mergedPairs: Object.values(state.batches).reduce((n, b) => n + (b.merged?.count ?? 0), 0),
          note: 'Only protocol 3 main-agent decisions; historical or templated approvals are excluded.'}};
      }
      if (command === 'configure') {
        main(opts.actor);
        const reviewedSubmitted = Object.values(state.batches).flatMap(b => b.stages)
          .filter(s => s.status === 'submitted' && Object.keys(s.reviews ?? {}).length);
        if (reviewedSubmitted.length && (opts.reviewPolicy !== undefined || opts.requiredReviews !== undefined)) fail('Cannot change review policy after reviewer reports exist');
        if (opts.maxAuthors !== undefined) state.maxAuthors = limit(opts.maxAuthors, maxAuthors, 'maxAuthors');
        if (opts.maxReviewQueue !== undefined) state.maxReviewQueue = limit(opts.maxReviewQueue, maxReviewQueue, 'maxReviewQueue');
        if (opts.maxReviewers !== undefined) state.maxReviewers = limit(opts.maxReviewers, maxReviewers, 'maxReviewers');
        if (opts.stageLeaseMs !== undefined) state.stageLeaseMs = leaseDuration(opts.stageLeaseMs);
        if (opts.reviewPolicy !== undefined) state.reviewPolicy = policy(opts.reviewPolicy, reviewPolicy);
        state.requiredReviews = quorum(opts.requiredReviews ?? requiredReviews, state.maxReviewers ?? maxReviewers);
        if ((state.registeredReviewers?.length ?? 0) > state.maxReviewers) fail('Configured reviewer pool is below registered reviewers');
        for (const batch of Object.values(state.batches)) for (const pending of batch.stages) {
          if ((pending.reviewers?.length ?? 0) > state.maxReviewers) fail('Configured reviewer limit is below existing assignments');
        }
        event(state, 'configured', {maxAuthors: state.maxAuthors, maxReviewQueue: state.maxReviewQueue,
          maxReviewers: state.maxReviewers, requiredReviews: state.requiredReviews, reviewPolicy: state.reviewPolicy,
          stageLeaseMs: state.stageLeaseMs});
        writeState(state);
        return {maxAuthors: state.maxAuthors, maxReviewQueue: state.maxReviewQueue,
          maxReviewers: state.maxReviewers, requiredReviews: state.requiredReviews, reviewPolicy: state.reviewPolicy,
          stageLeaseMs: state.stageLeaseMs};
      }
      if (command === 'dispatch') {
        main(opts.actor);
        if (!agentPattern.test(opts.owner ?? '')) fail('Owner must be the actual /root/agent_name handle');
        const current = source(opts.batch);
        const validation = validateAssignment(current.rows, project);
        state.pending[opts.batch] = validation.filter(r => r.status !== 'valid');
        if (state.pending[opts.batch].length) { writeState(state); return {dispatched: false, pending: state.pending[opts.batch]}; }
        const all = Object.values(state.batches).flatMap(b => b.stages);
        if (all.filter(needsWork).length >= maxAuthors) fail('Author limit reached; finish a stage before dispatching');
        if (all.filter(s => s.status === 'submitted').length >= maxReviewQueue) fail('Review queue full; finish reviews before dispatching');
        if (all.some(s => needsWork(s) && s.owner === opts.owner)) fail('This author already owns an active stage');
        const item = state.batches[opts.batch] ??= {assignmentHash: current.hash, entryHash: current.entryHash, stages: [], incidents: 0};
        if (item.stages.some(s => needsWork(s) || s.status === 'submitted')) fail('Batch already has an active or submitted stage');
        if (item.merged) fail('Batch already merged');
        const kind = opts.kind;
        if (!['pilot', 'expansion', 'remaining'].includes(kind)) fail('Stage kind must be pilot, expansion, or remaining');
        if (kind !== 'pilot' && latest(item, 'pilot')?.status !== 'approved') fail('Pilot needs main-agent approval');
        if (kind === 'remaining' && latest(item, 'expansion')?.status !== 'approved') fail('Expansion needs main-agent approval');
        if (kind !== 'pilot' && item.incidents >= 2) fail('Two incidents: restart with a three-card pilot');
        if (!Array.isArray(opts.pairs) || new Set(opts.pairs).size !== opts.pairs.length) fail('Dispatch requires a unique exact pair list chosen before writing');
        const byPair = new Map(current.rows.map(row => [pair(row), row]));
        const rows = opts.pairs.map(p => byPair.get(p) ?? fail(`Pair outside original assignment: ${p}`));
        const approvedMap = approved(item), uncovered = current.rows.filter(r => !approvedMap.has(pair(r)));
        if (kind === 'pilot' && rows.length !== Math.min(3, current.rows.length)) fail('Pilot requires three cards (or entire smaller assignment)');
        if (kind === 'pilot' && current.rows.some(r => r.class === 'irregular') && !rows.some(r => r.class === 'irregular')) fail('Include an available irregular pairing in pilot');
        if (kind === 'pilot' && current.rows.some(r => /Negative|Past/u.test(r.form)) && !rows.some(r => /Negative|Past/u.test(r.form))) fail('Include an available negative or past target in pilot');
        if (kind === 'expansion' && (rows.length < Math.min(10, current.rows.length) || rows.length > 15)) fail('Expansion requires 10–15 exact pairs');
        if (kind === 'expansion' && snapshot(latest(item, 'pilot')).cards.some(c => !opts.pairs.includes(pair(c)))) fail('Expansion must include the reviewed pilot pairs');
        if (kind === 'remaining' && (rows.length !== Math.min(5, uncovered.length) || !rows.length || rows.some(r => approvedMap.has(pair(r))))) fail('Remaining stage must contain only unfinished pairs, at most 5; dispatch another chunk after review');
        const id = `${kind}-${String(item.stages.length + 1).padStart(2, '0')}`;
        const roundRoot = `author-work/${opts.batch}/${opts.owner.split('/').at(-1)}/${id}-${crypto.randomUUID()}`;
        const paths = {scope: `${roundRoot}/assignment.json`, cards: `${roundRoot}/cards.json`, notes: `${roundRoot}/notes.json`, readings: `${roundRoot}/readings.json`};
        writeNew(paths.scope, rows);
        const stage = {id, batch: opts.batch, kind, owner: opts.owner, status: 'writing', paths, scopeHash: hashFile(paths.scope), pairs: opts.pairs, at: now(), attempts: 0,
          lease: newLease(opts.owner, stageLeaseMs), leaseHistory: []};
        item.stages.push(stage); event(state, 'dispatched', {batch: opts.batch, stage: id, owner: opts.owner, kind}); writeState(state);
        return {dispatched: true, batch: opts.batch, stage: id, owner: opts.owner, leaseToken: stage.lease.token, lease: stage.lease, assignment: file(paths.scope),
          writable: [file(paths.cards), file(paths.notes)], pipeline: fileURLToPath(import.meta.url),
          targets: rows.map(({senseId, form, meaning, answer, answerReading}) => ({senseId, form, meaning, answer, answerReading})),
          fallback: {irregularUnavailable: !current.rows.some(r => r.class === 'irregular'), negativePastUnavailable: !current.rows.some(r => /Negative|Past/u.test(r.form))},
          instruction: 'Write only the two author files. Call check then submit; stop writing. Formal cards are main-agent merge output.'};
      }
      const stageId = command === 'merge' ? state.batches[opts.batch]?.stages.at(-1)?.id : opts.stage;
      const {item, stage, current} = stageFor(state, opts.batch, stageId);
      if (command === 'heartbeat') {
        if (opts.actor !== stage.owner) fail('Only the active stage owner may heartbeat');
        if (opts.leaseToken !== undefined && opts.leaseToken !== stage.lease?.token) fail('Lease token does not match the active owner');
        if (leaseExpired(stage)) fail('Owner lease expired; coordinator must reclaim the stage');
        stage.lease = newLease(stage.owner, stageLeaseMs);
        event(state, 'heartbeat', {batch: opts.batch, stage: stage.id, owner: stage.owner, expiresAt: stage.lease.expiresAt});
        writeState(state);
        return {status: stage.status, owner: stage.owner, leaseToken: stage.lease.token, lease: stage.lease};
      }
      if (command === 'reclaim') {
        main(opts.actor);
        if (!needsWork(stage) || !agentPattern.test(opts.owner ?? '') || !opts.reason?.trim()) fail('Reclaim needs an unfinished stage, actual new owner and reason');
        if (!leaseExpired(stage)) fail('Owner lease is still live; heartbeat or wait for expiry before reclaim');
        stage.leaseHistory ??= [];
        stage.leaseHistory.push({owner: stage.owner, lease: stage.lease, at: now(), reason: opts.reason});
        stage.previousOwners ??= [];
        stage.previousOwners.push({owner: stage.owner, at: now(), reason: opts.reason});
        stage.owner = opts.owner; stage.lease = newLease(opts.owner, stageLeaseMs); delete stage.check; stage.status = 'writing';
        event(state, 'reclaimed', {batch: opts.batch, stage: stage.id, owner: stage.owner, reason: opts.reason}); writeState(state);
        return {status: stage.status, owner: stage.owner, leaseToken: stage.lease.token, lease: stage.lease, writable: [file(stage.paths.cards), file(stage.paths.notes)]};
      }
      if (command === 'handoff') {
        main(opts.actor);
        if (!needsWork(stage) || !agentPattern.test(opts.owner ?? '') || !opts.reason?.trim()) fail('Handoff needs an inactive previous writer, actual new owner and reason');
        if (!leaseExpired(stage)) fail('Owner lease is still live; use heartbeat or reclaim after expiry');
        stage.previousOwners ??= [];
        stage.previousOwners.push({owner: stage.owner, at: now(), reason: opts.reason});
        stage.leaseHistory ??= []; stage.leaseHistory.push({owner: stage.owner, lease: stage.lease, at: now(), reason: opts.reason});
        stage.owner = opts.owner; stage.lease = newLease(opts.owner, stageLeaseMs); delete stage.check; stage.status = 'writing';
        event(state, 'handoff', {batch: opts.batch, stage: stage.id, owner: opts.owner, reason: opts.reason}); writeState(state);
        return {status: stage.status, owner: stage.owner, leaseToken: stage.lease.token, lease: stage.lease, writable: [file(stage.paths.cards), file(stage.paths.notes)]};
      }
      if (command === 'reopen') {
        main(opts.actor);
        if (!['submitted', 'rejected'].includes(stage.status) || !agentPattern.test(opts.owner ?? '') || !opts.reason?.trim()) fail('Reopen needs a submitted/rejected stage, actual owner and reason');
        stage.previousStatuses ??= []; stage.previousStatuses.push({status: stage.status, at: now(), reason: opts.reason});
        stage.previousOwners ??= []; stage.previousOwners.push({owner: stage.owner, at: now(), reason: opts.reason});
        stage.owner = opts.owner; stage.status = 'writing'; stage.lease = newLease(opts.owner, stageLeaseMs); stage.leaseHistory ??= []; delete stage.check; delete stage.reviewer; delete stage.reviewers; delete stage.reviews; delete stage.reviewDelivery; delete stage.reviewDeliveries; delete stage.reviewReceipts; delete stage.reviewOutputPaths; delete stage.finalization;
        stage.reviewScopes = {};
        event(state, 'reopened', {batch: opts.batch, stage: stage.id, owner: opts.owner, reason: opts.reason}); writeState(state);
        return {status: stage.status, owner: stage.owner, leaseToken: stage.lease.token, lease: stage.lease, writable: [file(stage.paths.cards), file(stage.paths.notes)]};
      }
      if (['check', 'submit'].includes(command)) {
        if (!needsWork(stage)) fail('Only the active stage author may check or submit');
        assertLease(stage, opts.actor, opts.leaseToken);
        if (command === 'check') {
          delete stage.check;
          stage.status = 'check-failed'; writeState(state);
          const draft = checkDraft(stage), issues = [...draft.result.issues];
          event(state, 'first-draft', {batch: opts.batch, stage: stage.id, rows: draft.cards.map(card => ({id: card.id, hash: cardHash(card), invalid: issues.some(issue => issue.id === card.id)}))});
          writeState(state);
          if (!issues.length) {
            const before = Object.fromEntries(['scope', 'cards', 'notes'].map(k => [stage.paths[k], hashFile(stage.paths[k])]));
            if (!opts.readingRunner) fail('Reading audit runner required');
            try { fs.unlinkSync(file(stage.paths.readings)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
            await opts.readingRunner(file(stage.paths.cards), file(stage.paths.readings));
            assertLease(stage, opts.actor, opts.leaseToken);
            if (!fs.existsSync(file(stage.paths.readings))) fail('Reading audit did not write a report');
            for (const [f, h] of Object.entries(before)) if (hashFile(f) !== h) fail(`Inputs changed during reading audit: ${f}`);
            const readings = readJson(stage.paths.readings);
            if (readings.cardsChecked !== draft.cards.length || !Array.isArray(readings.structuralIssues) || readings.structuralIssues.length || !Array.isArray(readings.candidates) || readings.reviewCandidateCount !== readings.candidates.length) fail('Invalid reading audit');
            const candidateIds = new Set();
            for (const candidate of readings.candidates) {
              const card = draft.cards.find(c => c.id === candidate.id);
              if (!card || candidateIds.has(candidate.id)) fail('Unknown/duplicate reading candidate');
              candidateIds.add(candidate.id);
              const full = sentenceOf(card, project);
              if (candidate.sentence !== full.sentence || candidate.reading !== full.reading || candidate.translation !== card.translation) fail(`Stale reading candidate ${candidate.id}`);
            }
            stage.check = {files: fileSet(stage)}; stage.status = 'checked';
          } else {
            const hash = hashFile(stage.paths.cards);
            if (stage.lastFailedHash !== hash) { stage.attempts++; item.incidents++; stage.lastFailedHash = hash; }
            event(state, 'check-failed', {batch: opts.batch, stage: stage.id, issues});
            if (item.incidents >= 2) stage.status = 'rejected';
          }
          guard(state); writeState(state);
          return {status: stage.status, issues, incidents: item.incidents, needsPilot: item.incidents >= 2};
        }
        if (stage.status !== 'checked') fail('Check final files before submission');
        assertLease(stage, opts.actor, opts.leaseToken);
        verifyCheck(stage); checkDraft(stage);
        const artifacts = new Map(Object.values(stage.paths).map(p => [p, read(p)]));
        stage.delivery = createDelivery({root, batch: opts.batch, phase: 'author', revision: item.stages.length, artifacts});
        stage.cardSnapshotHash = sha(artifacts.get(stage.paths.cards));
        stage.status = 'submitted'; stage.submittedAt = now(); event(state, 'submitted', {batch: opts.batch, stage: stage.id});
        writeState(state);
        const snap = snapshot(stage), table = `staged-state/${opts.batch}/${stage.id}.table.md`;
        fs.mkdirSync(path.dirname(file(table)), {recursive: true});
        fs.writeFileSync(file(table), makeReviewTable(snap.cards, snap.notes, project, snap.readings));
        return {status: stage.status, receipt: stage.delivery.receipt, reviewTable: file(table), cards: snap.cards.length};
      }
      if (command === 'assign-review') {
        main(opts.actor);
        if (stage.status !== 'submitted') fail('Review assignment requires a submitted immutable stage');
        independent(stage, opts.reviewer);
        stage.reviewers ??= stage.reviewer ? [stage.reviewer] : [];
        if (stage.reviewers.includes(opts.reviewer)) fail('Reviewer already assigned');
        // A third reviewer is an adjudicator, never an extra vote.  Wait for
        // the two required primary reports and create a conflict-only scope.
        if (stage.reviewers.length >= requiredReviews && !stage.conflict) {
          const primary = stage.reviewers.slice(0, requiredReviews);
          const detected = reportConflicts(stage, snapshot(stage), primary);
          if (!detected) fail('Third reviewer is allowed only after a primary-review conflict');
          stage.conflict = detected;
        }
        if (stage.reviewers.length >= maxReviewers) fail('Reviewer limit reached');
        state.registeredReviewers ??= [];
        if (!state.registeredReviewers.includes(opts.reviewer) && state.registeredReviewers.length >= maxReviewers) fail('Reviewer pool limit reached');
        if (!state.registeredReviewers.includes(opts.reviewer)) state.registeredReviewers.push(opts.reviewer);
        stage.reviewers.push(opts.reviewer);
        stage.batch = opts.batch;
        stage.reviewer = stage.reviewers[0]; stage.reviewAssignedAt = now();
        stage.reviewOutputPaths ??= {};
        stage.reviewOutputPaths[opts.reviewer] ??= `staged-state/${opts.batch}/${stage.id}.${stage.delivery.receipt.slice(0, 12)}.p${stage.reviewPacketRevision ?? 0}.review-${opts.reviewer.split('/').at(-1)}.json`;
        stage.reviewScopes ??= {};
        stage.reviewScopes[opts.reviewer] ??= {pairs: stage.pairs.slice(), candidateIds: null};
        if (stage.conflict) stage.conflict.reviewer = opts.reviewer;
        event(state, 'review-assigned', {batch: opts.batch, stage: stage.id, reviewer: opts.reviewer}); writeState(state);
        return {status: stage.status, reviewers: stage.reviewers, reviewer: opts.reviewer, packet: reviewerPacket(stage, opts.reviewer), reviewTable: file(`staged-state/${opts.batch}/${stage.id}.table.md`)};
      }
      if (command === 'repair-review-packets') {
        main(opts.actor);
        if (stage.status !== 'submitted') fail('Packet repair requires a submitted immutable stage');
        stage.batch = opts.batch;
        stage.reviewPacketRevision = (stage.reviewPacketRevision ?? 0) + 1;
        stage.reviewers = (stage.reviewers ?? []).slice(0, requiredReviews);
        stage.reviews = {}; delete stage.reviewDelivery; delete stage.reviewDeliveries; delete stage.reviewReceipts;
        delete stage.finalization; delete stage.conflict; stage.reviewScopes = {};
        stage.reviewOutputPaths = {};
        for (const reviewer of stage.reviewers) {
          independent(stage, reviewer);
          stage.reviewOutputPaths[reviewer] = `staged-state/${opts.batch}/${stage.id}.${stage.delivery.receipt.slice(0, 12)}.p${stage.reviewPacketRevision}.review-${reviewer.split('/').at(-1)}.json`;
        }
        event(state, 'review-packets-repaired', {batch: opts.batch, stage: stage.id, reviewers: stage.reviewers ?? []});
        writeState(state);
        return {status: stage.status, packets: (stage.reviewers ?? []).map(reviewer => reviewerPacket(stage, reviewer))};
      }
      if (command === 'review') {
        const assignedReviewers = stage.reviewers ?? (stage.reviewer ? [stage.reviewer] : []);
        if (reviewPolicy !== 'main' && opts.actor === '/root') fail('Coordinator-only policy forbids main-agent semantic decisions; use independent reviewer reports and run finalize');
        if (opts.actor !== '/root' && !assignedReviewers.includes(opts.actor)) fail('Only main agent or assigned reviewer may review this stage');
        if (reviewPolicy !== 'main' && !assignedReviewers.length) fail('Assign at least one reviewer before review');
        if (opts.actor === '/root' && assignedReviewers.length > 1) {
          const reports = assignedReviewers.map(reviewer => stage.reviews?.[reviewer]?.review).filter(Boolean);
          if (reports.length !== assignedReviewers.length) {
            const missing = assignedReviewers.find(reviewer => !stage.reviews?.[reviewer]);
            fail(`Missing independent reviewer report: ${missing}`);
          }
          const snapForConflict = snapshot(stage);
          const conflicts = snapForConflict.cards.filter(card => {
            const votes = reports.map(report => report.rows.find(row => row.id === card.id)?.status);
            return new Set(votes).size > 1;
          });
          if (conflicts.length) fail(`Independent reviewer conflict: ${conflicts.map(card => card.id).join(', ')}`);
          const candidateConflicts = snapForConflict.readings.candidates.filter(candidate => {
            const votes = reports.map(report => report.candidates.find(row => row.id === candidate.id)?.decision);
            return new Set(votes).size > 1;
          });
          if (candidateConflicts.length) fail(`Independent reviewer conflict: ${candidateConflicts.map(candidate => candidate.id).join(', ')}`);
        }
        if (stage.status !== 'submitted') fail('Review requires a submitted immutable stage');
        verifyCheck(stage);
        const snap = snapshot(stage);
        const inputReview = opts.reviewPath ? json(fs.readFileSync(opts.reviewPath)) : opts.review;
        const review = {rows: inputReview?.rows, candidates: inputReview?.candidates};
        if (opts.actor !== '/root') independent(stage, opts.actor);
        const expectedReport = stage.reviewOutputPaths?.[opts.actor];
        if (opts.actor !== '/root' && !expectedReport) fail('Retrieve reviewer packet with assign-review first');
        if (expectedReport && opts.reviewPath && path.resolve(opts.reviewPath) !== path.resolve(file(expectedReport))) fail('Review output must use the assigned reviewer packet path');
        if (inputReview?.reviewer !== undefined && inputReview.reviewer !== opts.actor) fail('Review identity does not match assigned reviewer');
        if (inputReview?.authorReceipt !== undefined && inputReview.authorReceipt !== stage.delivery.receipt) fail('Review source receipt does not match assigned packet');
        if (inputReview?.scopeHash !== undefined && inputReview.scopeHash !== stage.scopeHash) fail('Review scope hash does not match assigned packet');
        if (inputReview?.cardSnapshotHash !== undefined && inputReview.cardSnapshotHash !== stage.cardSnapshotHash) fail('Review card snapshot hash does not match assigned packet');
        if (inputReview?.count !== undefined && inputReview.count !== stage.pairs.length) fail('Review card count does not match assigned packet');
        if (stage.reviews?.[opts.actor]) fail('Reviewer already submitted; reopen for a new immutable revision');
        if (screenCards(snap.cards, current.rows.filter(r => stage.pairs.includes(pair(r))), project).issues.length) fail('Stage fails current preflight');
        const conflictReviewer = stage.conflict?.reviewer === opts.actor;
        const expectedCardIds = new Set(conflictReviewer ? stage.conflict.cardIds : snap.cards.map(card => card.id));
        if (!Array.isArray(review?.rows) || review.rows.length !== expectedCardIds.size || new Set(review.rows.map(r => r.id)).size !== expectedCardIds.size
            || review.rows.some(row => !expectedCardIds.has(row.id))) fail(conflictReviewer ? 'Conflict review must cover conflict cards only' : 'Review each card exactly once');
        const reasons = new Set();
        for (const card of snap.cards.filter(card => expectedCardIds.has(card.id))) {
          const r = review.rows.find(row => row.id === card.id);
          if (!r || !['approved', 'rejected'].includes(r.status) || r.hash !== cardHash(card) || r.sentence !== sentenceOf(card, project).sentence) fail(`Missing or stale review: ${card.id}`);
          for (const key of ['reason', 'roles', 'time', 'negation', 'translation', 'reading']) if (typeof r[key] !== 'string' || r[key].trim().length < 2) fail(`Missing review ${key}: ${card.id}`);
          if (reasons.has(r.reason.trim())) fail('Duplicate review reason');
          reasons.add(r.reason.trim());
        }
        // A conflict reviewer is restricted to the conflict set. It must
        // reproduce the primary quorum's decision for every unconflicted card
        // and candidate, so a third report cannot rewrite unrelated evidence.
        if (stage.conflict?.reviewer === opts.actor) {
          const primary = stage.conflict.primaryReviewers.map(reviewer => stage.reviews[reviewer].review);
          for (const row of review.rows) {
            if (!stage.conflict.cardIds.includes(row.id)) {
              const statuses = primary.map(report => report.rows.find(candidate => candidate.id === row.id)?.status);
              if (!statuses.length || statuses.some(status => status !== row.status) || new Set(statuses).size > 1) fail(`Conflict reviewer changed unconflicted card: ${row.id}`);
            }
          }
        }
        const candidateIds = new Set((conflictReviewer ? snap.readings.candidates.filter(c => stage.conflict.candidateIds.includes(c.id)) : snap.readings.candidates).map(c => c.id));
        if (!Array.isArray(review.candidates) || review.candidates.length !== candidateIds.size || new Set(review.candidates.map(c => c.id)).size !== candidateIds.size) fail('Adjudicate each dictionary candidate');
        for (const c of review.candidates) if (!candidateIds.has(c.id) || !['retain', 'error'].includes(c.decision) || !c.reason?.trim()) fail('Invalid dictionary adjudication');
        const allPassed = review.rows.every(r => r.status === 'approved') && review.candidates.every(c => c.decision === 'retain');
        stage.reviewOutputPaths ??= {};
        const report = `staged-state/${opts.batch}/${stage.id}.accepted-review-${crypto.randomUUID()}.json`;
        writeNew(report, {...review, reviewer: opts.actor, selfReview: stage.owner === opts.actor, authorReceipt: stage.delivery.receipt,
          scopeHash: stage.scopeHash, cardSnapshotHash: stage.cardSnapshotHash, count: stage.pairs.length, reviewedAt: now()});
        stage.reviews ??= {};
        const delivery = createDelivery({root, batch: opts.batch, phase: 'review', revision: item.stages.length, artifacts: new Map([[report, read(report)]])});
        stage.reviews[opts.actor] = {report, receipt: delivery.receipt, delivery, review};
        stage.reviewDelivery = delivery;
        stage.reviewDeliveries ??= {}; stage.reviewDeliveries[opts.actor] = delivery;
        stage.reviewReceipts ??= {}; stage.reviewReceipts[opts.actor] = delivery.receipt;
        stage.reviewedAt = now();
        if (opts.actor !== '/root') {
          event(state, 'reviewer-submitted', {batch: opts.batch, stage: stage.id, reviewer: opts.actor,
            reports: Object.keys(stage.reviews).length, required: assignedReviewers.length});
          writeState(state);
          return {status: stage.status, reviewer: opts.actor, reports: Object.keys(stage.reviews).length,
            required: assignedReviewers.length, receipt: delivery.receipt};
        }
        if (opts.actor === '/root' && assignedReviewers.length > 1) {
          const submittedReviewers = new Set(Object.keys(stage.reviews ?? {}));
          for (const reviewer of assignedReviewers) if (!submittedReviewers.has(reviewer)) fail(`Missing independent reviewer report: ${reviewer}`);
        }
        stage.status = allPassed ? 'approved' : 'rejected'; stage.reviewerDecisionBy = opts.actor;
        if (allPassed && stage.kind === 'pilot') item.incidents = 0;
        if (!allPassed) item.incidents++;
        event(state, 'reviewed', {batch: opts.batch, stage: stage.id, decisions: review.rows.map(r => ({id: r.id, pair: pair(snap.cards.find(c => c.id === r.id)), hash: r.hash, status: r.status}))});
        writeState(state); return {status: stage.status, needsPilot: item.incidents >= 2, receipt: stage.reviewDelivery.receipt};
      }
      if (command === 'finalize') {
        main(opts.actor);
        if (!['coordinator-only', 'consensus'].includes(reviewPolicy)) fail('finalize requires reviewPolicy coordinator-only or consensus');
        if (stage.status !== 'submitted') fail('Finalize requires a submitted immutable stage');
        verifyCheck(stage);
        const assignedReviewers = stage.reviewers ?? [];
        if (assignedReviewers.length < requiredReviews) fail(`Assign at least ${requiredReviews} independent reviewers before finalize`);
        const reports = assignedReviewers.map(reviewer => verifiedReview(stage, reviewer));
        if (reports.length !== assignedReviewers.length) fail(`Missing independent reviewer report: ${assignedReviewers.find(r => !stage.reviews?.[r])}`);
        const snap = snapshot(stage);
        const byReport = reports;
        const rows = snap.cards.map(card => {
          const direct = byReport.map(report => report.rows.find(row => row.id === card.id)?.status);
          const primaryStatuses = (stage.conflict?.primaryReviewers ?? []).map(reviewer => stage.reviews?.[reviewer]?.review?.rows.find(row => row.id === card.id)?.status);
          const conflictCard = stage.conflict?.cardIds?.includes(card.id);
          const third = conflictCard && stage.conflict?.reviewer
            ? stage.reviews?.[stage.conflict.reviewer]?.review?.rows.find(row => row.id === card.id)?.status : undefined;
          const votes = conflictCard && third ? [third] : direct.map(vote => vote ?? primaryStatuses[0]);
          const approvedVotes = votes.filter(v => v === 'approved').length;
          const rejectedVotes = votes.filter(v => v === 'rejected').length;
          const status = reviewPolicy === 'coordinator-only'
            ? (approvedVotes === votes.length ? 'approved' : 'rejected')
            : (approvedVotes > rejectedVotes ? 'approved' : 'rejected');
          return {id: card.id, pair: pair(card), hash: cardHash(card), status,
            votes: {approved: approvedVotes, rejected: rejectedVotes}};
        });
        const candidates = [...new Set(snap.readings.candidates.map(c => c.id))].map(id => {
          const direct = byReport.map(report => report.candidates.find(c => c.id === id)?.decision);
          const primaryDecisions = (stage.conflict?.primaryReviewers ?? []).map(reviewer => stage.reviews?.[reviewer]?.review?.candidates.find(c => c.id === id)?.decision);
          const conflictCandidate = stage.conflict?.candidateIds?.includes(id);
          const third = conflictCandidate && stage.conflict?.reviewer
            ? stage.reviews?.[stage.conflict.reviewer]?.review?.candidates.find(c => c.id === id)?.decision : undefined;
          const votes = conflictCandidate && third ? [third] : direct.map(vote => vote ?? primaryDecisions[0]);
          const retained = votes.filter(v => v === 'retain').length;
          const errors = votes.filter(v => v === 'error').length;
          const decision = reviewPolicy === 'coordinator-only' ? (retained === votes.length ? 'retain' : 'error')
            : (retained > errors ? 'retain' : 'error');
          return {id, decision, votes: {retain: retained, error: errors}};
        });
        const conflicts = rows.filter(row => row.votes.approved && row.votes.rejected).map(row => row.id)
          .concat(candidates.filter(c => c.votes.retain && c.votes.error).map(c => c.id));
        // Do not silently adjudicate disagreement. Leave the immutable stage
        // submitted and issue a third-review packet for conflict items only.
        if (conflicts.length && assignedReviewers.length === requiredReviews) {
          const cardIds = rows.filter(row => row.votes.approved && row.votes.rejected).map(row => row.id);
          const candidateIds = candidates.filter(c => c.votes.retain && c.votes.error).map(c => c.id);
          stage.conflict = {cardIds, candidateIds, primaryReviewers: [...assignedReviewers],
            primaryReceipts: Object.fromEntries(assignedReviewers.map(reviewer => [reviewer, stage.reviews[reviewer].delivery.receipt]))};
          event(state, 'review-conflict', {batch: opts.batch, stage: stage.id, cardIds, candidateIds});
          writeState(state);
          return {status: 'rejected', pendingReview: true, policy: reviewPolicy, conflicts,
            reports: reports.length, required: requiredReviews, needsThirdReview: true};
        }
        const allPassed = rows.every(row => row.status === 'approved') && candidates.every(c => c.decision === 'retain');
        stage.status = allPassed ? 'approved' : 'rejected'; stage.reviewerDecisionBy = 'coordinator'; stage.finalizedAt = now();
        const summaryReport = `staged-state/${opts.batch}/${stage.id}.finalization-${crypto.randomUUID()}.json`;
        const summary = {version: 1, stage: stage.id, batch: opts.batch, status: stage.status, policy: reviewPolicy,
          requiredReviews, count: stage.pairs.length, scopeHash: stage.scopeHash, cardSnapshotHash: stage.cardSnapshotHash,
          authorReceipt: stage.delivery.receipt, reviewerReceipts: Object.fromEntries(assignedReviewers.map(reviewer => [reviewer, stage.reviews[reviewer].delivery.receipt])),
          conflicts, decisions: rows, candidates};
        writeNew(summaryReport, summary);
        const summaryDelivery = createDelivery({root, batch: opts.batch, phase: 'review', revision: item.stages.length, artifacts: new Map([[summaryReport, read(summaryReport)]])});
        stage.finalization = {report: summaryReport, delivery: summaryDelivery};
        if (allPassed && stage.kind === 'pilot') item.incidents = 0;
        if (!allPassed) item.incidents++;
        event(state, 'reviewed', {batch: opts.batch, stage: stage.id, policy: reviewPolicy, conflicts,
          decisions: rows.map(({id, pair: p, hash, status}) => ({id, pair: p, hash, status}))});
        writeState(state);
        return {status: stage.status, policy: reviewPolicy, conflicts, reports: reports.length,
          required: requiredReviews, receipt: summaryDelivery.receipt, needsPilot: item.incidents >= 2};
      }
      if (command === 'merge') {
        main(opts.actor);
        if (item.stages.some(s => needsWork(s) || s.status === 'submitted')) fail('Stop all batch writers and finish reviews before merge');
        if (latest(item, 'pilot')?.status !== 'approved' || (current.rows.length > 3 && latest(item, 'expansion')?.status !== 'approved')) fail('Pilot and expansion gates required');
        const collected = approved(item), cards = current.rows.map(row => {
          const card = collected.get(pair(row)) ?? fail(`Unreviewed pair: ${pair(row)}`);
          return {...card, review: 'approved'};
        });
        const result = screenCards(cards.map(card => ({...card, review: 'draft'})), current.rows, project);
        if (result.issues.length) fail(`Merged content fails current screening: ${JSON.stringify(result.issues)}`);
        // Preserve an existing formal draft. Author submissions are never overwritten.
        if (fs.existsSync(file(current.entry.cards))) {
          const backup = `staged-state/${opts.batch}/formal-before-${crypto.randomUUID()}.json`;
          fs.mkdirSync(path.dirname(file(backup)), {recursive: true}); fs.writeFileSync(file(backup), read(current.entry.cards), {flag: 'wx'});
        }
        const bytes = encode(cards), temp = `staged-state/${opts.batch}/merge-${crypto.randomUUID()}.tmp`;
        fs.writeFileSync(file(temp), bytes, {flag: 'wx'}); guard(state);
        fs.renameSync(file(temp), file(current.entry.cards));
        state.protected[current.entry.cards] = sha(bytes); item.merged = {hash: sha(bytes), count: cards.length, at: now()};
        event(state, 'merged', {batch: opts.batch, count: cards.length}); writeState(state);
        return {output: file(current.entry.cards), ...item.merged, publication: 'Not integrated or deployed'};
      }
      fail(`Unknown staged command ${command}`);
    } finally { fs.closeSync(fd); fs.unlinkSync(lockPath); }
  }
  return {run};
}

export function readingRunner(projectRoot) {
  return (input, output) => new Promise((resolve, reject) => {
    const audit = fileURLToPath(new URL('./reading-audit.py', import.meta.url));
    const child = spawn('uv', ['run', '--no-project', '--with', 'fugashi[unidic-lite]', 'python', audit, '--project', projectRoot, '--input', input, '--output', output], {cwd: projectRoot, windowsHide: true});
    let error = ''; child.stdout.resume(); child.stderr.on('data', bytes => { error += bytes; });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(`Reading audit exited ${code}: ${error}`)));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2), opts = {};
    for (let i = 0; i < args.length; i += 2) { if (!args[i].startsWith('--') || !args[i + 1]) fail('Use --key value'); opts[args[i].slice(2)] = args[i + 1]; }
    if (!path.isAbsolute(opts.project ?? '') || !path.isAbsolute(opts['task-root'] ?? '')) fail('Use absolute --project and --task-root');
    const projectRoot = opts.project, project = await import(pathToFileURL(path.join(projectRoot, 'app/lib/usage-cards.mjs')).href);
    if (opts.selection) {
      const selection = json(fs.readFileSync(opts.selection));
      opts.pairs = selection.map(row => typeof row === 'string' ? row : pair(row));
    }
    if (opts.review) { opts.reviewPath = opts.review; opts.review = json(fs.readFileSync(opts.review)); }
    const runner = createStagedWorkflow({taskRoot: opts['task-root'], project, projectRoot});
    const result = await runner.run(command, {...opts, readingRunner: readingRunner(projectRoot)});
    console.log(JSON.stringify(result, null, 2));
    if (result.dispatched === false || result.issues?.length) process.exitCode = 2;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
