import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDelivery} from '../.agents/skills/write-katsuyo-usage-cards/scripts/delivery-store.mjs';
import {cardHash, pair, sentenceOf, sha} from '../.agents/skills/write-katsuyo-usage-cards/scripts/staged-quality.mjs';
import {exportIntegrationBatches, verifyIntegrationBatches, verifyReleaseProof} from '../scripts/export-integration-batches.mjs';

function fixture(t, {baseline = false} = {}) {
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
  const review = reviewer => ({rows: [{id: card.id, hash: cardHash(card), sentence, status: 'approved', reason: `${reviewer} checked the complete sentence`, roles: '主体为我', time: '现在', negation: '没有否定', translation: card.translation, reading: 'いちぎょうをためす。'}], candidates: [], reviewer, selfReview: false,
    authorReceipt: authorDelivery.receipt, scopeHash: sha(scopeBytes), cardSnapshotHash: sha(cardsBytes), count: 1});
  const reviewEntries = {};
  const reviewers = ['/root/reviewer_one', '/root/reviewer_two'];
  for (const [index, reviewer] of reviewers.entries()) {
    const reportPath = `staged-state/demo/00/review-${index}.json`;
    const reportBytes = Buffer.from(`${JSON.stringify(review(reviewer), null, 2)}\n`);
    const delivery = createDelivery({root, batch: 'demo/00', phase: 'review', revision: index + 1, artifacts: new Map([[reportPath, reportBytes]])});
    reviewEntries[reviewer] = {report: reportPath, receipt: delivery.receipt, delivery, review: review(reviewer)};
  }
  const summaryPath = 'staged-state/demo/00/finalization.json';
  const summary = {version: 1, stage: 'pilot-01', batch: 'demo/00', status: 'approved', policy: 'coordinator-only', requiredReviews: 2,
    count: 1, scopeHash: sha(scopeBytes), cardSnapshotHash: sha(cardsBytes), authorReceipt: authorDelivery.receipt,
    reviewerReceipts: Object.fromEntries(reviewers.map(reviewer => [reviewer, reviewEntries[reviewer].receipt])), conflicts: [],
    decisions: [{id: card.id, pair: pair(card), hash: cardHash(card), status: 'approved', votes: {approved: 2, rejected: 0}}], candidates: []};
  const summaryBytes = Buffer.from(`${JSON.stringify(summary, null, 2)}\n`);
  const finalizationDelivery = createDelivery({root, batch: 'demo/00', phase: 'review', revision: 3, artifacts: new Map([[summaryPath, summaryBytes]])});
  const stage = {id: 'pilot-01', batch: 'demo/00', kind: 'pilot', owner: '/root/writer', status: 'approved', paths: authorPaths,
    scopeHash: sha(scopeBytes), cardSnapshotHash: sha(cardsBytes), pairs: [pair(card)], delivery: authorDelivery,
    reviewers, reviews: reviewEntries, finalization: {report: summaryPath, delivery: finalizationDelivery}};
  const state = {version: 3, requiredReviews: 2, assignmentHash: entry.hash, entryHash: sha(JSON.stringify(entry)), batches: {'demo/00': {
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
  const out = path.join(f.root, 'release');
  const result = exportIntegrationBatches({taskRoot: f.root, project: f.project, batches: [f.batch], outputDirectory: out, baseline: f.baseline});
  assert.equal(result.cardCount, 2);
  assert.equal(verifyReleaseProof(JSON.parse(fs.readFileSync(result.proofPath, 'utf8'))).valid, true);
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
