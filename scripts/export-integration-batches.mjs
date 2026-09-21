#!/usr/bin/env node

/**
 * Protocol-3 integration release exporter.
 *
 * This module is intentionally independent of the work directory layout used
 * by the author agents.  It consumes only the immutable delivery manifests,
 * the staged state ledger and the formal merged files.  The resulting proof
 * embeds the bytes needed to audit the release after the work directory has
 * been discarded.
 *
 * Public API:
 *   verifyIntegrationBatches({taskRoot, project, batches, state?, now?})
 *   exportIntegrationBatches({taskRoot, project, batches, outputDirectory, baseline?})
 *   verifyReleaseProof(proof | proofPath)
 * `project` is the imported usage-card module (used to compare report
 * sentences); the verifier remains usable without it for structural checks.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {readDelivery, digest as deliveryDigest} from '../.agents/skills/write-katsuyo-usage-cards/scripts/delivery-store.mjs';
import {cardHash, pair, sentenceOf, sha} from '../.agents/skills/write-katsuyo-usage-cards/scripts/staged-quality.mjs';

const HEX = /^[a-f0-9]{64}$/u;
const AGENT = /^\/root\/[a-z0-9_]+$/u;
const fail = message => { throw new Error(`Integration release: ${message}`); };
const asText = bytes => Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/u, '');
const parse = (bytes, label) => {
  try { return JSON.parse(asText(bytes)); }
  catch (error) { fail(`invalid JSON in ${label}: ${error.message}`); }
};
const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const digest = value => deliveryDigest(Buffer.isBuffer(value) ? value : Buffer.from(String(value)));
const canonical = value => JSON.stringify(value);
const same = (a, b) => canonical(a) === canonical(b);
const arr = value => Array.isArray(value) ? value : [];
const sorted = values => [...values].sort((a, b) => String(a).localeCompare(String(b)));
const safeRel = value => typeof value === 'string' && value && !path.isAbsolute(value)
  && !value.split('/').some(part => !part || part === '.' || part === '..' || part.includes('\\'));

function readState(taskRoot, supplied) {
  if (supplied && typeof supplied === 'object') return supplied;
  const file = path.join(taskRoot, 'staged-state', 'state.json');
  if (!fs.existsSync(file)) fail(`state ledger not found: ${file}`);
  return parse(fs.readFileSync(file), file);
}

function readManifest(taskRoot) {
  const file = path.join(taskRoot, 'manifest.json');
  if (!fs.existsSync(file)) fail(`manifest not found: ${file}`);
  const value = parse(fs.readFileSync(file), file);
  return Array.isArray(value) ? value : arr(value?.batches ?? value?.manifest);
}

function batchName(value) {
  const name = typeof value === 'string' ? value : value?.batch ?? value?.name ?? value?.id;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*\/\d{2,}$/u.test(name ?? '')) fail(`invalid batch name: ${name}`);
  return name;
}

function manifestEntry(manifest, name) {
  const [lane, number] = name.split('/');
  const entry = manifest.find(row => `${row?.lane}/${String(row?.batch).padStart(2, '0')}` === name)
    ?? manifest.find(row => row?.batch === name);
  if (!entry) fail(`manifest has no entry for ${name}`);
  if (entry.assignment !== `${name}.assignment.json` || entry.cards !== `${name}.cards.json`) {
    fail(`manifest paths do not match ${name}`);
  }
  if (!safeRel(entry.assignment) || !safeRel(entry.cards)) fail(`unsafe manifest path for ${name}`);
  return {entry, lane, number};
}

function bytesAt(root, relative, label = relative) {
  if (!safeRel(relative)) fail(`unsafe path for ${label}`);
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) fail(`missing ${label}: ${file}`);
  return fs.readFileSync(file);
}

function proofArtifact(label, relative, bytes, value = undefined) {
  const result = {path: relative, hash: digest(bytes), bytes: Buffer.from(bytes).toString('base64')};
  if (value !== undefined) result.value = value;
  result.label = label;
  return result;
}

function proofDelivery(root, delivery, label) {
  if (!delivery || typeof delivery !== 'object') fail(`missing ${label} delivery`);
  const bytes = readDelivery(root, delivery);
  const manifestBytes = bytesAt(root, delivery.manifest, `${label} manifest`);
  const artifacts = {};
  for (const source of Object.keys(delivery.files ?? {})) {
    const artifactBytes = bytes.get(source);
    if (!artifactBytes) fail(`${label} delivery omitted ${source}`);
    artifacts[source] = proofArtifact(source, source, artifactBytes, parse(artifactBytes, source));
  }
  return {manifest: structuredClone(delivery), manifestArtifact: proofArtifact('manifest', delivery.manifest, manifestBytes, parse(manifestBytes, delivery.manifest)), artifacts};
}

function artifactFromDelivery(deliveryProof, source, label) {
  const artifact = deliveryProof.artifacts?.[source];
  if (!artifact) fail(`${label} delivery does not contain ${source}`);
  return artifact;
}

function verifyNoActiveWriters(item, now) {
  for (const stage of arr(item?.stages)) {
    if (['writing', 'checked', 'check-failed', 'submitted'].includes(stage.status)) {
      fail(`active writer/reviewer stage ${stage.id}`);
    }
    if (stage.lease && ['writing', 'checked', 'check-failed'].includes(stage.status)) {
      const expiry = Date.parse(stage.lease.expiresAt);
      if (!Number.isFinite(expiry)) fail(`invalid lease on ${stage.id}`);
      if (expiry > now) fail(`active lease on ${stage.id}`);
    }
  }
}

function rowPair(card) {
  try { return pair(card); } catch { return null; }
}

function expectedSentence(card, project) {
  if (!project || typeof project.resolveUsageCard !== 'function') return null;
  try { return sentenceOf(card, project).sentence; } catch { return null; }
}

function independentReviewer(stage, reviewer) {
  return AGENT.test(reviewer ?? '') && reviewer !== '/root' && reviewer !== stage.owner
    && !arr(stage.previousOwners).some(row => row?.owner === reviewer);
}

function verifyReview({root, stage, reviewer, entry, authorReceipt, scopeHash, cardSnapshotHash,
  cards, readings, project, conflict = false}) {
  if (!independentReviewer(stage, reviewer)) fail(`reviewer ${reviewer} is not independent`);
  if (!entry || !entry.delivery || !HEX.test(entry.receipt ?? '')) fail(`missing reviewer receipt for ${reviewer}`);
  if (entry.receipt !== entry.delivery.receipt) fail(`reviewer receipt mismatch for ${reviewer}`);
  const delivery = proofDelivery(root, entry.delivery, `reviewer ${reviewer}`);
  const reportArtifact = artifactFromDelivery(delivery, entry.report, `reviewer ${reviewer}`);
  const report = reportArtifact.value ?? parse(Buffer.from(reportArtifact.bytes, 'base64'), entry.report);
  if (report.reviewer !== reviewer || report.selfReview !== false) fail(`review identity mismatch for ${reviewer}`);
  if (report.authorReceipt !== authorReceipt || report.scopeHash !== scopeHash
      || report.cardSnapshotHash !== cardSnapshotHash || report.count !== cards.length) {
    fail(`review source hashes mismatch for ${reviewer}`);
  }
  if (report.packetRevision !== undefined && report.packetRevision !== (stage.reviewPacketRevision ?? 0)) {
    fail(`review packet revision mismatch for ${reviewer}`);
  }
  const cardIds = new Set(cards.map(card => card.id));
  const conflictIds = new Set(arr(stage.conflict?.cardIds));
  const expectedIds = conflict ? conflictIds : cardIds;
  const rows = arr(report.rows);
  if (rows.length !== expectedIds.size || new Set(rows.map(row => row?.id)).size !== rows.length
      || rows.some(row => !expectedIds.has(row?.id))) fail(`review scope mismatch for ${reviewer}`);
  const byId = new Map(cards.map(card => [card.id, card]));
  for (const row of rows) {
    const card = byId.get(row.id);
    if (!card || !HEX.test(row.hash ?? '') || row.hash !== cardHash(card)) fail(`review card hash mismatch for ${reviewer}: ${row.id}`);
    const sentence = expectedSentence(card, project);
    if (sentence !== null && row.sentence !== sentence) fail(`review sentence mismatch for ${reviewer}: ${row.id}`);
    if (!['approved', 'rejected'].includes(row.status)) fail(`invalid review decision for ${reviewer}: ${row.id}`);
    for (const field of ['sentence', 'reason', 'roles', 'time', 'negation', 'translation', 'reading']) {
      if (typeof row[field] !== 'string' || row[field].trim().length < 2) fail(`missing review ${field}: ${reviewer}/${row.id}`);
    }
  }
  const candidates = arr(readings?.candidates);
  const candidateIds = new Set(candidates.map(candidate => candidate.id));
  const expectedCandidateIds = conflict ? new Set(arr(stage.conflict?.candidateIds)) : candidateIds;
  const decisions = arr(report.candidates);
  if (decisions.length !== expectedCandidateIds.size || new Set(decisions.map(row => row?.id)).size !== decisions.length
      || decisions.some(row => !expectedCandidateIds.has(row?.id))) fail(`review dictionary scope mismatch for ${reviewer}`);
  for (const decision of decisions) {
    if (!['retain', 'error'].includes(decision.decision) || typeof decision.reason !== 'string' || !decision.reason.trim()) {
      fail(`invalid dictionary decision for ${reviewer}/${decision.id}`);
    }
  }
  if (!entry.review || !same({rows: entry.review.rows, candidates: entry.review.candidates}, {rows, candidates: decisions})) {
    fail(`recorded review differs from immutable report for ${reviewer}`);
  }
  return {reviewer, receipt: entry.receipt, delivery, report, reportArtifact, conflict};
}

function verifyFinalization({root, stage, cards, readings, authorReceipt, scopeHash, cardSnapshotHash, reviews}) {
  if (!stage.finalization?.delivery || !stage.finalization.report) fail(`missing finalization receipt for ${stage.id}`);
  const delivery = proofDelivery(root, stage.finalization.delivery, `finalization ${stage.id}`);
  const artifact = artifactFromDelivery(delivery, stage.finalization.report, `finalization ${stage.id}`);
  const summary = artifact.value;
  if (summary.status !== 'approved' || summary.stage !== stage.id || summary.batch !== stage.batch
      || summary.authorReceipt !== authorReceipt || summary.scopeHash !== scopeHash
      || summary.cardSnapshotHash !== cardSnapshotHash || summary.count !== cards.length) {
    fail(`finalization source/outcome mismatch for ${stage.id}`);
  }
  const reviewerReceipts = summary.reviewerReceipts;
  const expectedReceipts = Object.fromEntries(reviews.map(review => [review.reviewer, review.receipt]));
  if (!same(reviewerReceipts, expectedReceipts)) fail(`finalization reviewer receipts changed for ${stage.id}`);
  const decisions = arr(summary.decisions);
  if (decisions.length !== cards.length) fail(`finalization card count mismatch for ${stage.id}`);
  const byId = new Map(cards.map(card => [card.id, card]));
  for (const decision of decisions) {
    const card = byId.get(decision.id);
    if (!card || decision.status !== 'approved' || decision.hash !== cardHash(card)) fail(`finalization card decision mismatch: ${decision.id}`);
  }
  const candidateIds = new Set(arr(readings?.candidates).map(candidate => candidate.id));
  const candidateDecisions = arr(summary.candidates);
  if (candidateDecisions.length !== candidateIds.size || candidateDecisions.some(row => !candidateIds.has(row.id) || row.decision !== 'retain')) {
    fail(`finalization dictionary decisions mismatch for ${stage.id}`);
  }
  return {delivery, summary, artifact};
}

function verifyStage({root, stage, assignment, assignmentHash, project, requiredReviews}) {
  if (stage.status !== 'approved') fail(`stage ${stage.id} is not approved`);
  if (!stage.delivery || !HEX.test(stage.delivery.receipt ?? '')) fail(`stage ${stage.id} has no author receipt`);
  const delivery = proofDelivery(root, stage.delivery, `author ${stage.id}`);
  const scopeArtifact = artifactFromDelivery(delivery, stage.paths?.scope, `author ${stage.id}`);
  const cardsArtifact = artifactFromDelivery(delivery, stage.paths?.cards, `author ${stage.id}`);
  const notesArtifact = artifactFromDelivery(delivery, stage.paths?.notes, `author ${stage.id}`);
  const readingsArtifact = artifactFromDelivery(delivery, stage.paths?.readings, `author ${stage.id}`);
  if (scopeArtifact.hash !== stage.scopeHash || scopeArtifact.hash !== assignmentHash && !same(parse(Buffer.from(scopeArtifact.bytes, 'base64'), 'scope'), assignment)) {
    // A scope is allowed to be a strict subset of the original assignment;
    // its own hash is the authoritative immutable scope hash.
    if (scopeArtifact.hash !== stage.scopeHash) fail(`scope hash mismatch for ${stage.id}`);
  }
  const scope = scopeArtifact.value;
  const cards = cardsArtifact.value;
  const notes = notesArtifact.value;
  const readings = readingsArtifact.value;
  if (!Array.isArray(scope) || !Array.isArray(cards) || !Array.isArray(notes) || !readings || typeof readings !== 'object') fail(`invalid author artifacts for ${stage.id}`);
  if (!HEX.test(stage.cardSnapshotHash ?? '') || cardsArtifact.hash !== stage.cardSnapshotHash) fail(`card snapshot hash mismatch for ${stage.id}`);
  if (cards.length !== stage.pairs.length || notes.length !== cards.length || new Set(cards.map(card => card?.id)).size !== cards.length) fail(`author count mismatch for ${stage.id}`);
  const assignmentPairs = new Set(assignment.map(rowPair));
  const stagePairs = arr(stage.pairs);
  const cardPairs = cards.map(rowPair);
  if (new Set(cardPairs).size !== cards.length || cardPairs.some(value => !assignmentPairs.has(value))
      || !same(sorted(cardPairs), sorted(stagePairs)) || scope.length !== stagePairs.length
      || !same(sorted(scope.map(rowPair)), sorted(stagePairs))) fail(`author scope mismatch for ${stage.id}`);
  const noteIds = new Set(notes.map(note => note?.id));
  if (noteIds.size !== notes.length || cards.some(card => !noteIds.has(card.id))) fail(`author notes mismatch for ${stage.id}`);
  const reviewers = arr(stage.reviewers);
  if (new Set(reviewers).size !== reviewers.length || reviewers.length < requiredReviews) fail(`review quorum missing for ${stage.id}`);
  const primaryReviewers = stage.conflict?.primaryReviewers ?? reviewers;
  if (primaryReviewers.length < requiredReviews || primaryReviewers.some(reviewer => !reviewers.includes(reviewer))) fail(`primary reviewer set mismatch for ${stage.id}`);
  const reviews = [];
  for (const reviewer of reviewers) {
    const conflict = Boolean(stage.conflict?.reviewer === reviewer);
    reviews.push(verifyReview({root, stage, reviewer, entry: stage.reviews?.[reviewer], authorReceipt: stage.delivery.receipt,
      scopeHash: stage.scopeHash, cardSnapshotHash: stage.cardSnapshotHash, cards, readings, project, conflict}));
  }
  if (!stage.conflict && reviewers.length !== requiredReviews) fail(`unexpected extra reviewer for ${stage.id}`);
  if (stage.conflict) {
    if (!stage.conflict.reviewer || reviewers.length !== requiredReviews + 1 || !stage.conflict.cardIds?.length && !stage.conflict.candidateIds?.length) fail(`invalid conflict reviewer for ${stage.id}`);
    const primaryReceipts = Object.fromEntries(primaryReviewers.map(reviewer => [reviewer, stage.reviews?.[reviewer]?.delivery?.receipt]));
    if (!same(stage.conflict.primaryReceipts, primaryReceipts)) fail(`conflict primary receipts changed for ${stage.id}`);
    const adjudicator = reviews.find(review => review.reviewer === stage.conflict.reviewer);
    if (!adjudicator?.conflict) fail(`missing conflict-only adjudication for ${stage.id}`);
    // The conflict packet is deliberately restricted to the conflict sets;
    // the exact-scope check above proves that no settled card/candidate was
    // supplied for adjudication.
  }
  const finalization = verifyFinalization({root, stage, cards, readings, authorReceipt: stage.delivery.receipt,
    scopeHash: stage.scopeHash, cardSnapshotHash: stage.cardSnapshotHash, reviews});
  // Every stage in a merged release has to contribute cards approved by the
  // two independent reports (and by a conflict adjudicator where present).
  for (const review of reviews) {
    const adjudicator = stage.conflict?.reviewer === review.reviewer;
    // Primary reports may disagree on the conflict set. A third report is
    // the only report allowed to settle it; without a conflict all reports
    // must independently approve every item.
    if ((!stage.conflict || adjudicator)
        && (!review.report.rows.every(row => row.status === 'approved') || !review.report.candidates.every(row => row.decision === 'retain'))) {
      fail(`review did not approve all cards in ${stage.id}: ${review.reviewer}`);
    }
  }
  return {stage: {id: stage.id, batch: stage.batch, kind: stage.kind, owner: stage.owner, previousOwners: arr(stage.previousOwners),
    status: stage.status, pairs: stagePairs, scopeHash: stage.scopeHash, cardSnapshotHash: stage.cardSnapshotHash,
    authorReceipt: stage.delivery.receipt, reviewPacketRevision: stage.reviewPacketRevision ?? 0, conflict: stage.conflict ?? null}, delivery,
    draft: {scope: scopeArtifact, cards: cardsArtifact, notes: notesArtifact, readings: readingsArtifact},
    reviews, finalization};
}

function normalizeBaseline(root, baseline) {
  if (!baseline) return {cards: [], sourceHash: null, objectHash: digest(canonical([])), path: null, historical: true};
  let cards, bytes = null, sourcePath = null;
  if (Array.isArray(baseline)) cards = baseline;
  else if (typeof baseline === 'string') {
    sourcePath = path.isAbsolute(baseline) ? baseline : path.resolve(root, baseline);
    bytes = fs.readFileSync(sourcePath); cards = parse(bytes, sourcePath);
  } else {
    cards = baseline.cards ?? baseline.value;
    if (baseline.bytes) bytes = Buffer.from(baseline.bytes);
    if (baseline.path) { sourcePath = path.isAbsolute(baseline.path) ? baseline.path : path.resolve(root, baseline.path); bytes ??= fs.readFileSync(sourcePath); }
  }
  if (!Array.isArray(cards) && Array.isArray(cards?.cards)) cards = cards.cards;
  if (!Array.isArray(cards)) fail('baseline must contain a card array');
  const sourceHash = bytes ? digest(bytes) : null;
  return {cards: structuredClone(cards), sourceHash, sourceBytes: bytes?.toString('base64') ?? null,
    objectHash: digest(canonical(cards)), path: sourcePath, historical: true};
}

function normalizeCall(taskRootOrOptions, project, batches, outputDirectory) {
  if (taskRootOrOptions && typeof taskRootOrOptions === 'object' && !Array.isArray(taskRootOrOptions)) return {...taskRootOrOptions};
  return {taskRoot: taskRootOrOptions, project, batches, outputDirectory};
}

/** Verify one or more merged protocol-3 batches without writing anything. */
export function verifyIntegrationBatches(taskRootOrOptions, project, batches, outputDirectory) {
  const options = normalizeCall(taskRootOrOptions, project, batches, outputDirectory);
  const taskRoot = path.resolve(options.taskRoot ?? '.');
  const state = readState(taskRoot, options.state);
  const manifest = readManifest(taskRoot);
  const names = (typeof options.batches === 'string' ? [options.batches] : arr(options.batches)).map(batchName);
  if (!names.length || new Set(names).size !== names.length) fail('at least one unique batch is required');
  const now = typeof options.now === 'function' ? Date.parse(options.now()) : Number(options.now ?? Date.now());
  const nowMs = Number.isFinite(now) ? now : Date.now();
  const proofs = [];
  for (const name of names) {
    const item = state.batches?.[name];
    if (!item) fail(`state ledger has no batch ${name}`);
    verifyNoActiveWriters(item, nowMs);
    const {entry} = manifestEntry(manifest, name);
    const assignmentBytes = bytesAt(taskRoot, entry.assignment, `${name} assignment`);
    const assignmentHash = digest(assignmentBytes);
    if (entry.hash !== assignmentHash || item.assignmentHash && item.assignmentHash !== assignmentHash) fail(`assignment hash mismatch for ${name}`);
    if (item.entryHash && item.entryHash !== sha(JSON.stringify(entry))) fail(`manifest entry hash mismatch for ${name}`);
    const assignment = parse(assignmentBytes, entry.assignment);
    if (!Array.isArray(assignment) || assignment.length !== entry.count) fail(`assignment count mismatch for ${name}`);
    if (!item.merged || item.merged.count !== assignment.length) fail(`batch ${name} is not fully merged`);
    const mergedBytes = bytesAt(taskRoot, entry.cards, `${name} merged cards`);
    const mergedHash = digest(mergedBytes);
    if (mergedHash !== item.merged.hash) fail(`merged file hash mismatch for ${name}`);
    const merged = parse(mergedBytes, entry.cards);
    if (!Array.isArray(merged) || merged.length !== assignment.length) fail(`merged card count mismatch for ${name}`);
    if (merged.some(card => card?.review !== 'approved') || new Set(merged.map(card => card?.id)).size !== merged.length) fail(`merged card identity mismatch for ${name}`);
    const requiredReviews = Number(state.requiredReviews ?? 2);
    if (!Number.isSafeInteger(requiredReviews) || requiredReviews < 2) fail('invalid required review quorum');
    const stages = arr(item.stages).filter(stage => stage.status === 'approved');
    const stageProofs = [];
    for (const stage of stages) {
      const verified = verifyStage({root: taskRoot, stage, assignment, assignmentHash, project: options.project, requiredReviews});
      stageProofs.push(verified);
    }
    const covered = new Set(stageProofs.flatMap(proof => proof.stage.pairs));
    const requiredPairs = assignment.map(rowPair);
    if (covered.size !== requiredPairs.length || requiredPairs.some(p => !covered.has(p))) fail(`approved stages do not cover ${name}`);
    const mergedPairs = merged.map(rowPair);
    if (!same(sorted(mergedPairs), sorted(requiredPairs))) fail(`merged pairs do not match assignment for ${name}`);
    const byPair = new Map();
    for (const stage of stageProofs) for (const card of stage.draft.cards.value) {
      const key = rowPair(card), previous = byPair.get(key);
      // Expansion stages intentionally repeat their pilot cards. Repetition
      // is safe only when the immutable card object is byte-identical.
      if (previous && !same(previous, card)) fail(`approved snapshots disagree for ${key}`);
      byPair.set(key, card);
    }
    for (const card of merged) {
      const source = byPair.get(rowPair(card));
      if (!source || !same(card, {...source, review: 'approved'})) fail(`merged card differs from approved snapshot: ${card.id}`);
    }
    proofs.push({batch: name, assignment: proofArtifact('assignment', entry.assignment, assignmentBytes, assignment), merged: proofArtifact('merged', entry.cards, mergedBytes, merged),
      assignmentHash, mergedHash, stages: stageProofs});
  }
  return {schemaVersion: 1, scope: 'integration', taskRoot, requiredReviews: Number(state.requiredReviews ?? 2), batches: proofs, valid: true};
}

/** Read JSON or .json.gz proof bytes through the same parser used by verification.
 * Supplying bytes lets callers hash and verify exactly one filesystem read.
 */
export function readReleaseProof(file, sourceBytes = fs.readFileSync(file)) {
  let bytes = sourceBytes;
  if (/\.gz$/iu.test(file)) {
    try { bytes = gunzipSync(bytes); }
    catch (error) { fail(`cannot decompress proof ${file}: ${error.message}`); }
  }
  return parse(bytes, file);
}

/** Verify a portable proof after the task root is unavailable. */
export function verifyReleaseProof(input) {
  const proof = typeof input === 'string' ? readReleaseProof(input) : input;
  if (!proof || proof.schemaVersion !== 1 || proof.scope !== 'integration') fail('unsupported release proof');
  if (!Array.isArray(proof.batches) || !proof.batches.length
      || new Set(proof.batches.map(batch => batchName(batch.batch))).size !== proof.batches.length) fail('portable proof requires unique nonempty batches');
  const verifyArtifact = artifact => {
    if (!artifact?.bytes || !safeRel(artifact.path) || !HEX.test(artifact.hash ?? '')
        || digest(Buffer.from(artifact.bytes, 'base64')) !== artifact.hash) fail(`portable artifact hash mismatch: ${artifact?.path}`);
    if (artifact.value !== undefined && !same(parse(Buffer.from(artifact.bytes, 'base64'), artifact.path), artifact.value)) fail(`portable artifact object mismatch: ${artifact.path}`);
  };
  const boundArtifact = (delivery, artifact) => {
    const bound = delivery.artifacts?.[artifact?.path];
    if (!bound || !same(bound, artifact)) fail(`portable artifact is not bound to delivery: ${artifact?.path}`);
    return bound.value;
  };
  const exactIds = (rows, expected) => Array.isArray(rows) && rows.length === expected.size
    && new Set(rows.map(row => row?.id)).size === rows.length && rows.every(row => expected.has(row?.id));
  const verifyPortableDelivery = (deliveryProof, label) => {
    if (!deliveryProof?.manifest || !deliveryProof.manifestArtifact) fail(`missing portable ${label} manifest`);
    const delivery = deliveryProof.manifest, manifestArtifact = deliveryProof.manifestArtifact;
    verifyArtifact(manifestArtifact);
    const manifestBytes = Buffer.from(manifestArtifact.bytes ?? '', 'base64');
    if (!HEX.test(delivery.receipt ?? '') || digest(manifestBytes) !== delivery.receipt
        || manifestArtifact.hash !== delivery.receipt || manifestArtifact.path !== delivery.manifest) fail(`portable ${label} receipt mismatch`);
    const manifest = parse(manifestBytes, `${label} manifest`);
    const pinned = {...delivery}; delete pinned.manifest; delete pinned.receipt;
    if (!same(manifest, pinned)) fail(`portable ${label} manifest metadata mismatch`);
    const sourceNames = Object.keys(delivery.files ?? {});
    if (!sourceNames.length || sourceNames.length !== Object.keys(delivery.hashes ?? {}).length
        || !same(sorted(sourceNames), sorted(Object.keys(delivery.sourceHashes ?? {})))
        || !same(sorted(sourceNames), sorted(Object.keys(deliveryProof.artifacts ?? {})))) fail(`portable ${label} file set mismatch`);
    for (const source of sourceNames) {
      const target = delivery.files[source], artifact = deliveryProof.artifacts?.[source];
      if (!artifact || !safeRel(source) || !safeRel(target) || artifact.path !== source
          || target !== `${delivery.root}/${path.posix.basename(source)}`
          || artifact.hash !== delivery.hashes[target] || artifact.hash !== delivery.sourceHashes[source]
          || digest(Buffer.from(artifact.bytes, 'base64')) !== artifact.hash) fail(`portable ${label} artifact mismatch: ${source}`);
      verifyArtifact(artifact);
    }
  };
  const releasedIds = new Set(), releasedPairs = new Set();
  for (const batch of arr(proof.batches)) {
    const assignment = batch.assignment?.value, merged = batch.merged?.value;
    if (!Array.isArray(assignment) || !assignment.length || !Array.isArray(merged) || batch.assignmentHash !== batch.assignment.hash
        || batch.mergedHash !== batch.merged.hash || merged.length !== assignment.length) fail(`portable batch assignment/merge mismatch: ${batch.batch}`);
    const assignmentPairs = assignment.map(rowPair), mergedPairs = merged.map(rowPair);
    if (assignmentPairs.some(pairValue => !pairValue) || new Set(assignmentPairs).size !== assignmentPairs.length
        || !same(sorted(assignmentPairs), sorted(mergedPairs)) || merged.some(card => card?.review !== 'approved')
        || new Set(merged.map(card => card?.id)).size !== merged.length) {
      fail(`portable batch pair mismatch: ${batch.batch}`);
    }
    for (const card of merged) {
      if (!card?.id || releasedIds.has(card.id) || releasedPairs.has(rowPair(card))) fail(`portable duplicate merged card: ${card?.id}`);
      releasedIds.add(card.id); releasedPairs.add(rowPair(card));
    }
    if (!Array.isArray(batch.stages) || !batch.stages.length
        || new Set(batch.stages.map(stage => stage.stage?.id)).size !== batch.stages.length) fail(`portable stage identity mismatch: ${batch.batch}`);
    const covered = new Set();
    const approvedByPair = new Map();
    for (const artifact of [batch.assignment, batch.merged, ...arr(batch.stages).flatMap(stage => [stage.draft.scope, stage.draft.cards, stage.draft.notes, stage.draft.readings,
      stage.delivery.manifestArtifact, ...stage.reviews.map(review => [review.reportArtifact, review.delivery.manifestArtifact]).flat(),
      stage.finalization.artifact, stage.finalization.delivery.manifestArtifact])]) {
      verifyArtifact(artifact);
    }
    for (const stage of arr(batch.stages)) {
      verifyPortableDelivery(stage.delivery, `author ${stage.stage.id}`);
      for (const review of stage.reviews) verifyPortableDelivery(review.delivery, `reviewer ${review.reviewer}`);
      verifyPortableDelivery(stage.finalization.delivery, `finalization ${stage.stage.id}`);
      if (stage.stage.status !== 'approved' || stage.stage.batch !== batch.batch) fail(`portable stage is not approved: ${stage.stage.id}`);
      if (stage.delivery.manifest.receipt !== stage.stage.authorReceipt) fail(`portable author receipt mismatch: ${stage.stage.id}`);
      for (const artifact of Object.values(stage.draft)) boundArtifact(stage.delivery, artifact);
      const summary = boundArtifact(stage.finalization.delivery, stage.finalization.artifact);
      if (!same(summary, stage.finalization.summary)) fail(`portable finalization summary differs from receipt: ${stage.stage.id}`);
      const scope = stage.draft.scope.value, cards = stage.draft.cards.value, notes = stage.draft.notes.value, readings = stage.draft.readings.value;
      if (!Array.isArray(scope) || !Array.isArray(cards) || !Array.isArray(notes) || !readings || !Array.isArray(stage.stage.pairs)
          || stage.stage.scopeHash !== stage.draft.scope.hash || stage.stage.cardSnapshotHash !== stage.draft.cards.hash
          || !cards.length || cards.length !== stage.stage.pairs.length || notes.length !== cards.length
          || new Set(cards.map(card => card?.id)).size !== cards.length || cards.some(card => !card?.id || card.review !== 'draft')
          || new Set(stage.stage.pairs).size !== stage.stage.pairs.length
          || !same(sorted(cards.map(rowPair)), sorted(stage.stage.pairs)) || !same(sorted(scope.map(rowPair)), sorted(stage.stage.pairs))) {
        fail(`portable author scope mismatch: ${stage.stage.id}`);
      }
      for (const pairValue of stage.stage.pairs) {
        if (!assignmentPairs.includes(pairValue)) fail(`portable stage outside assignment: ${stage.stage.id}/${pairValue}`);
        covered.add(pairValue);
      }
      const cardById = new Map(cards.map(card => [card.id, card]));
      if (!exactIds(notes, new Set(cardById.keys()))) fail(`portable author notes mismatch: ${stage.stage.id}`);
      const candidateIds = new Set(arr(readings.candidates).map(candidate => candidate.id));
      if (!Array.isArray(readings.candidates) || candidateIds.size !== readings.candidates.length
          || [...candidateIds].some(id => !cardById.has(id))) fail(`portable dictionary candidate identity mismatch: ${stage.stage.id}`);
      const requiredReviews = Number(summary?.requiredReviews);
      if (!Number.isSafeInteger(requiredReviews) || requiredReviews < 2
          || (proof.requiredReviews !== undefined && requiredReviews !== proof.requiredReviews)) fail(`portable required review quorum mismatch: ${stage.stage.id}`);
      if (new Set(stage.reviews.map(review => review.reviewer)).size !== stage.reviews.length) fail(`portable duplicate reviewer: ${stage.stage.id}`);
      for (const review of stage.reviews) {
        const report = boundArtifact(review.delivery, review.reportArtifact);
        if (!same(report, review.report)) fail(`portable review report differs from receipt: ${review.reviewer}`);
        if (!independentReviewer(stage.stage, review.reviewer) || review.receipt !== review.delivery.manifest.receipt
            || report.reviewer !== review.reviewer || report.selfReview !== false
            || report.authorReceipt !== stage.stage.authorReceipt || report.scopeHash !== stage.stage.scopeHash
            || report.cardSnapshotHash !== stage.stage.cardSnapshotHash || report.count !== cards.length
            || (report.packetRevision !== undefined && report.packetRevision !== stage.stage.reviewPacketRevision)) fail(`portable review source mismatch: ${review.reviewer}`);
        const conflict = Boolean(stage.stage.conflict?.reviewer === review.reviewer);
        const expectedIds = new Set(conflict ? arr(stage.stage.conflict?.cardIds) : cards.map(card => card.id));
        const requiresApproval = !stage.stage.conflict || conflict;
        if (!Array.isArray(report.rows) || report.rows.length !== expectedIds.size || new Set(report.rows.map(row => row.id)).size !== report.rows.length
            || report.rows.some(row => !expectedIds.has(row.id) || row.hash !== cardHash(cardById.get(row.id))
              || !['approved', 'rejected'].includes(row.status) || (requiresApproval && row.status !== 'approved'))) {
          fail(`portable review card mismatch: ${review.reviewer}`);
        }
        for (const row of report.rows) for (const field of ['sentence', 'reason', 'roles', 'time', 'negation', 'translation', 'reading']) {
          if (typeof row[field] !== 'string' || row[field].trim().length < 2) fail(`portable review field missing: ${review.reviewer}/${row.id}`);
        }
        const expectedCandidateIds = new Set(conflict ? arr(stage.stage.conflict?.candidateIds) : candidateIds);
        if (!exactIds(report.candidates, expectedCandidateIds)
            || report.candidates.some(row => !['retain', 'error'].includes(row.decision) || (requiresApproval && row.decision !== 'retain')
              || typeof row.reason !== 'string' || !row.reason.trim())) fail(`portable review dictionary mismatch: ${review.reviewer}`);
      }
      const conflictReviewer = stage.stage.conflict?.reviewer;
      if (conflictReviewer) {
        const conflict = stage.stage.conflict;
        const primary = stage.reviews.filter(review => review.reviewer !== conflictReviewer);
        if (stage.reviews.length !== requiredReviews + 1 || stage.reviews.filter(review => review.reviewer === conflictReviewer).length !== 1
            || !stage.stage.conflict.cardIds?.length && !stage.stage.conflict.candidateIds?.length) fail(`portable conflict quorum mismatch: ${stage.stage.id}`);
        const primaryReceipts = Object.fromEntries(primary.map(review => [review.reviewer, review.receipt]));
        if (!same(primary.map(review => review.reviewer), conflict.primaryReviewers)
            || !same(primaryReceipts, conflict.primaryReceipts)
            || conflict.authorReceipt !== stage.stage.authorReceipt || conflict.scopeHash !== stage.stage.scopeHash
            || conflict.cardSnapshotHash !== stage.stage.cardSnapshotHash
            || !same(stage.reviews.find(review => review.reviewer === conflictReviewer).report.primaryReceipts, primaryReceipts)) {
          fail(`portable conflict dependencies mismatch: ${stage.stage.id}`);
        }
        const disputedCards = cards.filter(card => new Set(primary.map(review => review.report.rows.find(row => row.id === card.id).status)).size > 1).map(card => card.id);
        const disputedCandidates = [...candidateIds].filter(id => new Set(primary.map(review => review.report.candidates.find(row => row.id === id).decision)).size > 1);
        if (!same(sorted(disputedCards), sorted(arr(conflict.cardIds)))
            || !same(sorted(disputedCandidates), sorted(arr(conflict.candidateIds)))) fail(`portable conflict scope mismatch: ${stage.stage.id}`);
        for (const review of primary) {
          if (review.report.rows.some(row => !disputedCards.includes(row.id) && row.status !== 'approved')
              || review.report.candidates.some(row => !disputedCandidates.includes(row.id) && row.decision !== 'retain')) {
            fail(`portable settled review did not approve: ${stage.stage.id}`);
          }
        }
      } else if (stage.stage.conflict || stage.reviews.length !== requiredReviews) fail(`portable reviewer quorum mismatch: ${stage.stage.id}`);
      if (!summary || summary.status !== 'approved' || summary.stage !== stage.stage.id || summary.batch !== batch.batch
          || summary.authorReceipt !== stage.stage.authorReceipt || summary.scopeHash !== stage.stage.scopeHash
          || summary.cardSnapshotHash !== stage.stage.cardSnapshotHash || summary.count !== cards.length) fail(`portable finalization mismatch: ${stage.stage.id}`);
      const receipts = Object.fromEntries(stage.reviews.map(review => [review.reviewer, review.receipt]));
      if (!same(summary.reviewerReceipts, receipts)) fail(`portable finalization reviewer receipts mismatch: ${stage.stage.id}`);
      if (!exactIds(summary.decisions, new Set(cardById.keys()))
          || summary.decisions.some(row => row.status !== 'approved' || row.hash !== cardHash(cardById.get(row.id)))) fail(`portable finalization decisions mismatch: ${stage.stage.id}`);
      if (!exactIds(summary.candidates, candidateIds)
          || summary.candidates.some(row => !candidateIds.has(row.id) || row.decision !== 'retain')) fail(`portable finalization dictionary mismatch: ${stage.stage.id}`);
      for (const card of cards) {
        const key = rowPair(card), previous = approvedByPair.get(key);
        if (previous && !same(previous, card)) fail(`portable approved snapshots disagree for ${key}`);
        approvedByPair.set(key, card);
      }
    }
    if (covered.size !== assignmentPairs.length) fail(`portable stage coverage incomplete: ${batch.batch}`);
    for (const card of merged) {
      const draft = approvedByPair.get(rowPair(card));
      if (!draft || !same(card, {...draft, review: 'approved'})) fail(`portable merged card differs from approved snapshot: ${card.id}`);
    }
  }
  if (proof.release) {
    const bytes = Buffer.from(proof.release.bytes, 'base64');
    if (digest(bytes) !== proof.release.fileHash || !same(parse(bytes, 'release'), proof.release.cards)) fail('portable release hash mismatch');
    const baseline = proof.baseline?.cards;
    if (!Array.isArray(baseline) || digest(canonical(baseline)) !== proof.baseline.objectHash) fail('portable baseline object hash mismatch');
    if (proof.baseline.sourceBytes) {
      const sourceBytes = Buffer.from(proof.baseline.sourceBytes, 'base64');
      if (digest(sourceBytes) !== proof.baseline.sourceHash) fail('portable baseline source hash mismatch');
      const source = parse(sourceBytes, 'baseline');
      if (!same(Array.isArray(source) ? source : source?.cards, baseline)) fail('portable baseline source object mismatch');
    }
    if (baseline.length && (!Array.isArray(proof.release.cards) || proof.release.cards.length < baseline.length
        || !same(proof.release.cards.slice(0, baseline.length), baseline))) fail('portable baseline preservation mismatch');
    const baselineIds = new Set(baseline.map(card => card?.id)), baselinePairs = new Set(baseline.map(rowPair));
    if (baselineIds.size !== baseline.length || baselinePairs.size !== baseline.length
        || baseline.some(card => !card?.id || !rowPair(card) || card.review !== 'approved')) fail('portable baseline identity mismatch');
    if (!same(proof.release.cards, [...baseline, ...proof.batches.flatMap(batch => batch.merged.value)])) fail('portable release differs from approved batches and historical baseline');
    for (const batch of arr(proof.batches)) for (const card of arr(batch.merged?.value)) {
      if (baselineIds.has(card?.id) || baselinePairs.has(rowPair(card))) fail(`portable baseline overlap: ${card?.id}`);
    }
  }
  return {valid: true, batches: proof.batches.length, cards: proof.release?.cards?.length ?? proof.batches.reduce((n, batch) => n + batch.merged.value.length, 0)};
}

/** Verify and write a portable release. Positional and object APIs are supported. */
export function exportIntegrationBatches(taskRootOrOptions, project, batches, outputDirectory) {
  const options = normalizeCall(taskRootOrOptions, project, batches, outputDirectory);
  const taskRoot = path.resolve(options.taskRoot ?? '.');
  const proof = verifyIntegrationBatches(options);
  const baseline = normalizeBaseline(taskRoot, options.baseline ?? options.baselineCards);
  const baselineIds = new Set(), baselinePairs = new Set();
  for (const card of baseline.cards) {
    if (!card?.id || !rowPair(card) || baselineIds.has(card.id) || baselinePairs.has(rowPair(card))) fail(`duplicate baseline card ${card.id ?? rowPair(card)}`);
    baselineIds.add(card.id); baselinePairs.add(rowPair(card));
  }
  const newCards = proof.batches.flatMap(batch => batch.merged.value);
  const ids = new Set(baselineIds), pairs = new Set(baselinePairs);
  for (const card of newCards) {
    if (ids.has(card.id) || pairs.has(rowPair(card))) fail(`new card overlaps historical baseline: ${card.id}`);
    ids.add(card.id); pairs.add(rowPair(card));
  }
  const releaseCards = [...baseline.cards, ...newCards];
  const releaseBytes = encode(releaseCards);
  const out = path.resolve(options.outputDirectory ?? options.outputDir ?? options.output ?? 'integration-release');
  fs.mkdirSync(out, {recursive: true});
  const releasePath = path.join(out, 'integration-cards.json');
  const proofPath = path.join(out, 'integration-release-proof.json');
  const release = {path: 'integration-cards.json', fileHash: digest(releaseBytes), bytes: releaseBytes.toString('base64'), cards: releaseCards,
    baseline: {count: baseline.cards.length, sourceHash: baseline.sourceHash, objectHash: baseline.objectHash, protocol3Receipt: null}};
  const portable = {...proof, release, baseline: {...baseline, cards: baseline.cards}};
  verifyReleaseProof(portable);
  fs.writeFileSync(releasePath, releaseBytes);
  fs.writeFileSync(proofPath, encode(portable));
  return {releasePath, proofPath, fileHash: release.fileHash, cardCount: releaseCards.length, proof: portable};
}

export const exportIntegrationRelease = exportIntegrationBatches;

export const sha256 = digest;

/** Verify either a live task-root ledger or a previously exported proof. */
export function verifyIntegrationRelease(input) {
  if (input?.schemaVersion === 1 && input?.scope === 'integration') return verifyReleaseProof(input);
  if (input?.proof || input?.proofPath) return verifyReleaseProof(input.proof ?? input.proofPath);
  return verifyIntegrationBatches(input);
}

function optionsFromArgv(argv) {
  const options = {};
  const allowed = new Set(['verify', 'help', 'taskRoot', 'project', 'batches', 'proof', 'proofPath',
    'baseline', 'baselineCards', 'outputDirectory', 'outputDir', 'output']);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) fail(`unexpected CLI argument: ${argv[i]}`);
    const key = argv[i].slice(2).replace(/-([a-z])/gu, (_, c) => c.toUpperCase());
    if (!allowed.has(key)) fail(`unknown CLI option: ${argv[i]}`);
    if (key === 'help') { options.help = true; continue; }
    if (key === 'verify') {
      if (argv[i + 1] === 'true' || argv[i + 1] === 'false') options.verify = argv[++i] === 'true';
      else if (!argv[i + 1] || argv[i + 1].startsWith('--')) options.verify = true;
      else fail('--verify accepts true or false');
      continue;
    }
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) fail(`missing value for --${key}`);
    options[key] = argv[++i];
  }
  if (options.batches) options.batches = options.batches.split(',');
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = optionsFromArgv(process.argv.slice(2));
    if (options.help) {
      process.stdout.write('Export: --task-root DIR --batches lane/00,lane/01 [--project DIR_OR_MODULE] [--baseline FILE] [--output-directory DIR]\n'
        + 'Verify live batches: --verify true --task-root DIR --batches lane/00,lane/01 [--project DIR_OR_MODULE]\n'
        + 'Verify portable proof: --verify true --proof-path FILE.json[.gz] (no task root or project needed)\n'
        + 'Live commands load app/lib/usage-cards.mjs from --project, or from the current directory by default.\n');
    } else {
      const proofPath = options.proofPath ?? options.proof;
      const verify = options.verify ?? Boolean(proofPath);
      if (proofPath && (!verify || options.taskRoot || options.batches || options.project)) fail('portable --proof-path verification cannot be combined with export or live task options');
      if (!proofPath) {
        if (!options.taskRoot || !options.batches?.length) fail('live export/verification requires --task-root DIR and --batches lane/00,...; use --proof-path FILE for portable verification');
        const projectPath = path.resolve(options.project ?? process.cwd());
        const modulePath = /\.m?js$/iu.test(projectPath) ? projectPath : path.join(projectPath, 'app/lib/usage-cards.mjs');
        options.project = await import(pathToFileURL(modulePath).href);
        if (typeof options.project.resolveUsageCard !== 'function') fail(`project module has no resolveUsageCard: ${modulePath}`);
      }
      const result = verify ? verifyIntegrationRelease(options) : exportIntegrationBatches(options);
      process.stdout.write(`${JSON.stringify(verify ? {valid: result.valid, batches: Array.isArray(result.batches) ? result.batches.length : result.batches,
        ...(result.cards !== undefined ? {cards: result.cards} : {})} : {valid: true, releasePath: result.releasePath, proofPath: result.proofPath,
        fileHash: result.fileHash, cardCount: result.cardCount})}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
