import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createDelivery} from '../.agents/skills/write-katsuyo-usage-cards/scripts/delivery-store.mjs';
import {cardHash, pair, sentenceOf, sha} from '../.agents/skills/write-katsuyo-usage-cards/scripts/staged-quality.mjs';
import {exportIntegrationBatches, verifyIntegrationBatches, verifyIntegrationRelease, verifyReleaseProof} from '../scripts/export-integration-batches.mjs';

function fixture(t, {baseline = false, requiredReviews = 2, conflict = false} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'katsuyo-release-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const assignment = [{senseId: 'verb:書く:かく', meaning: '写', form: 'try', answer: 'ためす', answerReading: 'ためす', class: 'godan'}];
  const card = {id: 'usage:try:verb:書く:かく', senseId: assignment[0].senseId, meaning: assignment[0].meaning,
    form: assignment[0].form, scene: '课后想先试写一行。', before: [{text: '一行を', reading: 'いちぎょうを'}],
    after: [{text: '。', reading: '。'}], translation: '我想先试着写一行。', review: 'draft'};
  const project = {resolveUsageCard: () => ({target: {text: assignment[0].answer, reading: assignment[0].answerReading}})};
  const entry = {lane: 'demo', course: 'multiStepCompound', batch: 0, assignment: 'demo/00.assignment.json', cards: 'demo/00.cards.json', count: 1};
  const assignmentBytes = Buffer.from(`${JSON.stringify(assignment, null, 2)}\n`);
  entry.hash = sha(assignmentBytes);
  fs.mkdirSync(path.join(root, 'demo'), {recursive: true});
  fs.writeFileSync(path.join(root, entry.assignment), assignmentBytes);
  fs.writeFileSync(path.join(root, 'manifest.json'), `${JSON.stringify([entry], null, 2)}\n`);
  const scopeBytes = Buffer.from(`${JSON.stringify(assignment, null, 2)}\n`);
  const cardsBytes = Buffer.from(`${JSON.stringify([card], null, 2)}\n`);
  const notes = [{id: card.id, roles: '主体为我', object: '一行文字', time: '现在', negation: '没有否定'}];
  const notesBytes = Buffer.from(`${JSON.stringify(notes, null, 2)}\n`);
  const readings = {candidates: []};
  const readingsBytes = Buffer.from(`${JSON.stringify(readings, null, 2)}\n`);
  const authorPaths = {scope: 'author-work/demo/00/scope.json', cards: 'author-work/demo/00/cards.json', notes: 'author-work/demo/00/notes.json', readings: 'author-work/demo/00/readings.json'};
  const authorDelivery = createDelivery({root, batch: 'demo/00', phase: 'author', revision: 1,
    artifacts: new Map([[authorPaths.scope, scopeBytes], [authorPaths.cards, cardsBytes], [authorPaths.notes, notesBytes], [authorPaths.readings, readingsBytes]])});
  const sentence = sentenceOf(card, project).sentence;
  const reviewEntries = {};
  const primaryReviewers = Array.from({length: requiredReviews}, (_, index) => ['/root/reviewer_one', '/root/reviewer_two'][index] ?? `/root/reviewer_${index + 1}`);
  const reviewers = [...primaryReviewers, ...(conflict ? ['/root/conflict_reviewer'] : [])];
  const primaryReceipts = () => Object.fromEntries(primaryReviewers.map(reviewer => [reviewer, reviewEntries[reviewer].receipt]));
  const review = reviewer => ({rows: [{id: card.id, hash: cardHash(card), sentence,
    status: conflict && reviewer === reviewers[0] ? 'rejected' : 'approved', reason: `${reviewer} checked the complete sentence`, roles: '主体为我', time: '现在', negation: '没有否定', translation: card.translation, reading: 'いちぎょうをためす。'}], candidates: [], reviewer, selfReview: false,
    authorReceipt: authorDelivery.receipt, scopeHash: sha(scopeBytes), cardSnapshotHash: sha(cardsBytes), count: 1,
    ...(reviewer === '/root/conflict_reviewer' ? {primaryReceipts: primaryReceipts()} : {})});
  for (const [index, reviewer] of reviewers.entries()) {
    const reportPath = `staged-state/demo/00/review-${index}.json`;
    const reportBytes = Buffer.from(`${JSON.stringify(review(reviewer), null, 2)}\n`);
    const delivery = createDelivery({root, batch: 'demo/00', phase: 'review', revision: index + 1, artifacts: new Map([[reportPath, reportBytes]])});
    reviewEntries[reviewer] = {report: reportPath, receipt: delivery.receipt, delivery, review: review(reviewer)};
  }
  const summaryPath = 'staged-state/demo/00/finalization.json';
  const summary = {version: 1, stage: 'pilot-01', batch: 'demo/00', status: 'approved', policy: 'coordinator-only', requiredReviews,
    count: 1, scopeHash: sha(scopeBytes), cardSnapshotHash: sha(cardsBytes), authorReceipt: authorDelivery.receipt,
    reviewerReceipts: Object.fromEntries(reviewers.map(reviewer => [reviewer, reviewEntries[reviewer].receipt])), conflicts: [],
    decisions: [{id: card.id, pair: pair(card), hash: cardHash(card), status: 'approved', votes: {approved: conflict ? 1 : requiredReviews, rejected: 0}}], candidates: []};
  const summaryBytes = Buffer.from(`${JSON.stringify(summary, null, 2)}\n`);
  const finalizationDelivery = createDelivery({root, batch: 'demo/00', phase: 'review', revision: 3, artifacts: new Map([[summaryPath, summaryBytes]])});
  const stage = {id: 'pilot-01', batch: 'demo/00', kind: 'pilot', owner: '/root/writer', status: 'approved', paths: authorPaths,
    scopeHash: sha(scopeBytes), cardSnapshotHash: sha(cardsBytes), pairs: [pair(card)], delivery: authorDelivery,
    reviewers, reviews: reviewEntries, finalization: {report: summaryPath, delivery: finalizationDelivery}};
  if (conflict) stage.conflict = {cardIds: [card.id], candidateIds: [], primaryReviewers, primaryReceipts: primaryReceipts(),
    authorReceipt: authorDelivery.receipt, scopeHash: sha(scopeBytes), cardSnapshotHash: sha(cardsBytes), reviewer: '/root/conflict_reviewer'};
  const state = {version: 3, requiredReviews, assignmentHash: entry.hash, entryHash: sha(JSON.stringify(entry)), batches: {'demo/00': {
    assignmentHash: entry.hash, entryHash: sha(JSON.stringify(entry)), stages: [stage], merged: {hash: sha(Buffer.from(`${JSON.stringify([{...card, review: 'approved'}], null, 2)}\n`)), count: 1}}}};
  const mergedBytes = Buffer.from(`${JSON.stringify([{...card, review: 'approved'}], null, 2)}\n`);
  fs.writeFileSync(path.join(root, entry.cards), mergedBytes);
  fs.mkdirSync(path.join(root, 'staged-state'), {recursive: true});
  fs.writeFileSync(path.join(root, 'staged-state', 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
  const base = baseline ? [{id: 'usage:old:verb:旧:きゅう', senseId: 'verb:旧:きゅう', form: 'old', review: 'approved'}] : [];
  return {root, project, batch: 'demo/00', baseline: base, state, stage, card, mergedBytes};
}

test('exports a portable release and verifies it after deleting the work root', t => {
  const f = fixture(t, {baseline: true});
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'katsuyo-portable-'));
  t.after(() => fs.rmSync(out, {recursive: true, force: true}));
  const result = exportIntegrationBatches({taskRoot: f.root, project: f.project, batches: [f.batch], outputDirectory: out, baseline: f.baseline});
  assert.equal(result.cardCount, 2);
  fs.rmSync(f.root, {recursive: true, force: true});
  assert.equal(fs.existsSync(f.root), false);
  assert.equal(verifyReleaseProof(JSON.parse(fs.readFileSync(result.proofPath, 'utf8'))).valid, true);
  assert.equal(verifyIntegrationRelease({proofPath: result.proofPath}).valid, true);
  assert.equal(JSON.parse(fs.readFileSync(result.releasePath, 'utf8'))[0].id, f.baseline[0].id);
});

test('rejects an active writer even when a stale merged file exists', t => {
  const f = fixture(t);
  f.state.batches[f.batch].stages[0].status = 'submitted';
  assert.throws(() => verifyIntegrationBatches({taskRoot: f.root, project: f.project, batches: [f.batch], state: f.state}), /active writer/);
});

test('allows an expired or retained author lease after the stage is approved', t => {
  const f = fixture(t);
  f.state.batches[f.batch].stages[0].lease = {expiresAt: new Date(Date.now() + 60_000).toISOString()};
  assert.equal(verifyIntegrationBatches({taskRoot: f.root, project: f.project, batches: [f.batch], state: f.state}).valid, true);
});

test('rejects missing independent reviewer receipts', t => {
  const f = fixture(t);
  f.state.batches[f.batch].stages[0].reviews['/root/reviewer_two'].receipt = null;
  assert.throws(() => verifyIntegrationBatches({taskRoot: f.root, project: f.project, batches: [f.batch], state: f.state}), /reviewer receipt/);
});

test('rejects a reviewer report bound to the wrong author scope', t => {
  const f = fixture(t);
  f.state.batches[f.batch].stages[0].scopeHash = '0'.repeat(64);
  assert.throws(() => verifyIntegrationBatches({taskRoot: f.root, project: f.project, batches: [f.batch], state: f.state}), /scope hash mismatch|review source hashes mismatch/);
});

test('rejects report content whose card hash no longer matches the author snapshot', t => {
  const f = fixture(t);
  f.state.batches[f.batch].stages[0].reviews['/root/reviewer_one'].review.rows[0].hash = '0'.repeat(64);
  assert.throws(() => verifyIntegrationBatches({taskRoot: f.root, project: f.project, batches: [f.batch], state: f.state}), /recorded review differs|card hash mismatch/);
});

test('rejects a formal merged file that drifts from its merged receipt', t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.root, 'demo/00.cards.json'), ' ');
  assert.throws(() => verifyIntegrationBatches({taskRoot: f.root, project: f.project, batches: [f.batch], state: f.state}), /merged file hash mismatch/);
});

test('rejects a new card overlapping the historical baseline', t => {
  const f = fixture(t);
  const baseline = [{...f.card, review: 'approved'}];
  assert.throws(() => exportIntegrationBatches({taskRoot: f.root, project: f.project, batches: [f.batch], outputDirectory: path.join(f.root, 'release'), baseline}), /overlaps historical baseline/);
});

function portableFixture(t, options = {}) {
  const f = fixture(t, {baseline: true, ...options});
  const result = exportIntegrationBatches({taskRoot: f.root, project: f.project, batches: [f.batch],
    outputDirectory: path.join(f.root, 'release'), baseline: f.baseline});
  return {...f, ...result, proof: JSON.parse(fs.readFileSync(result.proofPath, 'utf8'))};
}

// Model a self-consistent changed release. Its own hash is not review evidence.
function encodeRelease(proof) {
  const bytes = Buffer.from(`${JSON.stringify(proof.release.cards, null, 2)}\n`);
  proof.release.bytes = bytes.toString('base64');
  proof.release.fileHash = sha(bytes);
}

function encodeArtifact(artifact) {
  const bytes = Buffer.from(`${JSON.stringify(artifact.value, null, 2)}\n`);
  artifact.bytes = bytes.toString('base64');
  artifact.hash = sha(bytes);
}

test('portable release must contain every approved merged card and no extra card', t => {
  const {proof} = portableFixture(t);
  for (const edit of [cards => cards.pop(), cards => cards.push({...cards[1], id: 'unreviewed-extra', senseId: 'unreviewed-sense'})]) {
    const altered = structuredClone(proof);
    edit(altered.release.cards);
    encodeRelease(altered);
    assert.throws(() => verifyReleaseProof(altered), /release differs from approved batches/);
  }
});

test('portable proofs reject empty and duplicate batch evidence', t => {
  const {proof} = portableFixture(t);
  for (const batches of [[], [proof.batches[0], proof.batches[0]]]) {
    assert.throws(() => verifyReleaseProof({...proof, batches}), /unique nonempty batches/);
  }
});

test('portable proofs count distinct independent reviewers', t => {
  const {proof} = portableFixture(t);
  const stage = proof.batches[0].stages[0];
  stage.reviews[1] = structuredClone(stage.reviews[0]);
  assert.throws(() => verifyReleaseProof(proof), /duplicate reviewer/);
});

test('portable verification preserves explicitly configured larger review quorums', t => {
  const {proof} = portableFixture(t, {requiredReviews: 3});
  assert.equal(proof.requiredReviews, 3);
  assert.equal(verifyReleaseProof(proof).valid, true);
});

test('portable verification accepts a receipt-bound conflict adjudication and rejects changed dependencies', t => {
  const {proof} = portableFixture(t, {conflict: true});
  assert.equal(verifyReleaseProof(proof).valid, true);
  const conflict = proof.batches[0].stages[0].stage.conflict;
  conflict.primaryReceipts[conflict.primaryReviewers[0]] = '0'.repeat(64);
  assert.throws(() => verifyReleaseProof(proof), /conflict dependencies mismatch/);
});

test('portable finalization summaries remain bound to their immutable receipt', t => {
  const {proof} = portableFixture(t);
  const stage = proof.batches[0].stages[0];
  stage.finalization.summary.reviewerReceipts = {[stage.reviews[0].reviewer]: stage.reviews[0].receipt};
  assert.throws(() => verifyReleaseProof(proof), /finalization summary differs from receipt/);
});

test('portable draft artifacts cannot detach from their author receipt', t => {
  const {proof} = portableFixture(t);
  const stage = proof.batches[0].stages[0];
  stage.draft.notes.value[0].roles = 'A modified, unsubmitted note';
  encodeArtifact(stage.draft.notes);
  assert.throws(() => verifyReleaseProof(proof), /artifact is not bound to delivery/);
});

test('portable merged card content must equal the reviewed author snapshot', t => {
  const {proof} = portableFixture(t);
  const batch = proof.batches[0];
  batch.merged.value[0].translation = '未经审核的另一条译文。';
  encodeArtifact(batch.merged);
  batch.mergedHash = batch.merged.hash;
  proof.release.cards[1] = structuredClone(batch.merged.value[0]);
  encodeRelease(proof);
  assert.throws(() => verifyReleaseProof(proof), /merged card differs from approved snapshot/);
});

test('portable reviewer reports cannot detach from their review receipt', t => {
  const {proof} = portableFixture(t);
  const review = proof.batches[0].stages[0].reviews[0];
  review.reportArtifact.value.rows[0].reason = 'A rewritten reason absent from the immutable delivery';
  encodeArtifact(review.reportArtifact);
  review.report = structuredClone(review.reportArtifact.value);
  assert.throws(() => verifyReleaseProof(proof), /artifact is not bound to delivery/);
});

test('portable file baselines preserve source bytes as well as historical card objects', t => {
  const f = fixture(t, {baseline: true});
  const baselinePath = path.join(f.root, 'historical.json');
  const baselineBytes = Buffer.from(JSON.stringify(f.baseline));
  fs.writeFileSync(baselinePath, baselineBytes);
  const result = exportIntegrationBatches({taskRoot: f.root, project: f.project, batches: [f.batch],
    outputDirectory: path.join(f.root, 'release'), baseline: baselinePath});
  assert.equal(result.proof.baseline.sourceBytes, baselineBytes.toString('base64'));
  assert.equal(result.proof.baseline.sourceHash, sha(baselineBytes));
  const altered = structuredClone(result.proof);
  const differentBytes = Buffer.from(JSON.stringify([{...f.baseline[0], translation: 'changed'}]));
  altered.baseline.sourceBytes = differentBytes.toString('base64');
  altered.baseline.sourceHash = sha(differentBytes);
  assert.throws(() => verifyReleaseProof(altered), /baseline source object mismatch/);
});

const cliPath = fileURLToPath(new URL('../scripts/export-integration-batches.mjs', import.meta.url));
const runCli = args => spawnSync(process.execPath, [cliPath, ...args], {encoding: 'utf8'});

test('CLI verifies a portable proof without any live task or project', t => {
  const {proof, root} = portableFixture(t);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'katsuyo-cli-proof-'));
  t.after(() => fs.rmSync(out, {recursive: true, force: true}));
  const proofPath = path.join(out, 'proof.json');
  fs.writeFileSync(proofPath, JSON.stringify(proof));
  fs.rmSync(root, {recursive: true, force: true});
  for (const args of [['--verify', 'true', '--proof-path', proofPath], ['--proof-path', proofPath]]) {
    const result = runCli(args);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {valid: true, batches: 1, cards: 2});
  }
});

test('CLI loads the selected project resolver and rejects a changed review sentence', t => {
  const f = fixture(t);
  const projectRoot = path.join(f.root, 'project');
  const modulePath = path.join(projectRoot, 'app/lib/usage-cards.mjs');
  fs.mkdirSync(path.dirname(modulePath), {recursive: true});
  fs.writeFileSync(modulePath, 'export const resolveUsageCard = () => ({target:{text:"ためす",reading:"ためす"}});\n');
  const args = ['--verify', 'true', '--task-root', f.root, '--batches', f.batch, '--project', projectRoot];
  const valid = runCli(args);
  assert.equal(valid.status, 0, valid.stderr);
  assert.deepEqual(JSON.parse(valid.stdout), {valid: true, batches: 1});
  fs.writeFileSync(modulePath, 'export const resolveUsageCard = () => ({target:{text:"変わる",reading:"かわる"}});\n');
  const invalid = runCli(args);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /review sentence mismatch/);
});

test('CLI diagnoses missing or incompatible verification modes before reading task state', () => {
  const missing = runCli(['--verify', 'true']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /requires --task-root.*--batches/);
  const mixed = runCli(['--verify', 'true', '--proof-path', 'proof.json', '--task-root', 'task']);
  assert.equal(mixed.status, 1);
  assert.match(mixed.stderr, /cannot be combined/);
  const falseProof = runCli(['--verify', 'false', '--proof-path', 'proof.json']);
  assert.equal(falseProof.status, 1);
  assert.match(falseProof.stderr, /cannot be combined/);
});
