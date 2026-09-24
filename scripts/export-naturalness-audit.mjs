#!/usr/bin/env node
// Export a portable, receipt-checked checkpoint. No language status is inferred.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {readDelivery} from '../.agents/skills/write-katsuyo-usage-cards/scripts/delivery-store.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const requireComplete = args.includes('--require-complete');
const root = path.resolve(args.find(arg => !arg.startsWith('--'))
  ?? path.join(project, 'work/naturalness-full-20260923'));
const read = file => JSON.parse(fs.readFileSync(file));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bytesHash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const assert = (condition, message) => { if (!condition) throw Error(message); };
const relative = file => path.relative(root, file).split(path.sep).join('/');

const manifest = read(path.join(root, 'manifest.json'));
const state = read(path.join(root, 'state.json'));
const baseline = read(path.join(root, 'baseline/snapshot.json'));
const prior = read(path.join(project, 'docs/usage-card-naturalness-20260923.json'));
assert(hash(baseline) === manifest.snapshotHash && state.snapshotHash === manifest.snapshotHash,
  'Baseline or state changed after freezing');
const sourceById = new Map(baseline.cards.map(card => [card.id, card]));
assert(sourceById.size === manifest.activeCount, 'Baseline has duplicate card IDs');
const statuses = new Map(baseline.cards.map(card => [card.id,
  {id: card.id, sourceHash: hash(card), status: 'not-yet-reviewed'}]));
for (const row of prior.approvedRevisions) {
  assert(row.languageReview?.status === 'approved'
    && row.languageReview.hash === row.draftHash
    && hash(sourceById.get(row.id)) === row.currentHash, `Prior approval drift: ${row.id}`);
  statuses.set(row.id, {...statuses.get(row.id), status: 'approved',
    cardHash: row.currentHash, reviewReceipt: row.reviewReceipt});
}

const reviews = [];
for (const [batchId, batch] of Object.entries(state.batches)) {
  if (batch.status === 'queued') continue;
  assert(batch.sourceDelivery, `Assigned batch has no source receipt: ${batchId}`);
  const sourceFiles = readDelivery(root, batch.sourceDelivery);
  const key = batchId.replace('/', '-');
  const cards = JSON.parse(sourceFiles.get(`snapshots/${key}.cards.json`));
  const sentences = JSON.parse(sourceFiles.get(`snapshots/${key}.sentences.json`));
  assert(cards.length === batch.ids.length && sentences.length === cards.length,
    `Frozen batch scope drift: ${batchId}`);
  for (const [index, card] of cards.entries()) {
    assert(card.id === batch.ids[index] && hash(card) === batch.sourceHashes[index]
      && hash(sourceById.get(card.id)) === hash(card), `Source card drift: ${batchId}/${card.id}`);
    if (batch.status === 'assigned') statuses.get(card.id).status = 'assigned';
  }
  if (batch.status !== 'reviewed') continue;
  const reviewFiles = readDelivery(root, batch.reviewDelivery);
  const packet = read(path.join(root, batch.packet));
  const report = JSON.parse(reviewFiles.get(relative(packet.output)));
  assert(report.sourceReceipt === batch.sourceDelivery.receipt
    && report.reviewer === batch.reviewer && report.count === cards.length
    && report.rows.length === cards.length, `Review scope drift: ${batchId}`);
  const byId = new Map(sentences.map(row => [row.id, row]));
  for (const row of report.rows) {
    const sentence = byId.get(row.id);
    assert(sentence && sentence.hash === row.hash && sentence.sentence === row.sentence,
      `Review row drift: ${batchId}/${row.id}`);
    statuses.set(row.id, {...statuses.get(row.id), status: row.status,
      cardHash: row.hash, reviewReceipt: batch.reviewDelivery.receipt});
  }
  reviews.push({batchId, stage: batch.stage, reviewer: report.reviewer,
    sourceReceipt: batch.sourceDelivery.receipt,
    reviewReceipt: batch.reviewDelivery.receipt,
    rows: report.rows, candidates: report.candidates});
}

const repairs = [];
for (const [repairId, repair] of Object.entries(state.repairs ?? {})) {
  if (repair.status === 'prepared') continue;
  const files = readDelivery(root, repair.sourceDelivery);
  const draft = JSON.parse(files.get(`repairs/${repairId}/draft.json`));
  const notes = JSON.parse(files.get(`repairs/${repairId}/notes.json`));
  const assignment = JSON.parse(files.get(repair.assignment));
  assert(draft.length <= repair.ids.length && notes.length === repair.ids.length
    && assignment.length === repair.ids.length
    && draft.every(card => repair.ids.includes(card.id)), `Repair scope drift: ${repairId}`);
  let report = null;
  if (repair.reviewDelivery) {
    const reviewFiles = readDelivery(root, repair.reviewDelivery);
    const packet = read(path.join(root, repair.packet));
    report = JSON.parse(reviewFiles.get(relative(packet.output)));
    assert(report.sourceReceipt === repair.sourceDelivery.receipt
      && report.reviewer === repair.reviewer
      && report.rows.length === repair.changedIds.length, `Repair review drift: ${repairId}`);
    for (const row of report.rows) {
      const card = draft.find(candidate => candidate.id === row.id);
      assert(card && hash(card) === row.hash, `Repair card hash drift: ${repairId}/${row.id}`);
      if (row.status === 'approved') statuses.set(row.id, {...statuses.get(row.id),
        status: 'approved', cardHash: hash({...card, review: 'approved'}),
        reviewReceipt: repair.reviewDelivery.receipt});
      else statuses.set(row.id, {...statuses.get(row.id), status: row.status,
        cardHash: row.hash, reviewReceipt: repair.reviewDelivery.receipt});
    }
  }
  for (const row of repair.noCandidate ?? []) statuses.set(row.id, {...statuses.get(row.id),
    status: 'no-credible-candidate', authorReceipt: repair.sourceDelivery.receipt});
  repairs.push({repairId, sourceBatchId: repair.sourceBatchId,
    parentRepairId: repair.parentRepairId ?? null, attemptNumber: repair.attemptNumber ?? 1,
    author: repair.authorHandle ?? null, reviewer: repair.reviewer ?? null,
    authorReceipt: repair.sourceDelivery.receipt,
    reviewReceipt: repair.reviewDelivery?.receipt ?? null,
    assignment, draft, notes, rows: report?.rows ?? [],
    noCandidate: repair.noCandidate ?? []});
}
const deferrals = Object.values(state.deferrals ?? {});
for (const row of deferrals) {
  assert(sourceById.has(row.id) && row.sourceHash === hash(sourceById.get(row.id))
    && row.attempts.length === 3, `Invalid exact-pair deferral: ${row.id}`);
  statuses.set(row.id, {...statuses.get(row.id), status: 'deferred',
    cardHash: row.sourceHash, deferralBasis: row.basis});
}

const counts = {};
for (const row of statuses.values()) counts[row.status] = (counts[row.status] ?? 0) + 1;
assert(Object.values(counts).reduce((sum, count) => sum + count, 0) === manifest.activeCount,
  'Final audit status partition is incomplete');
if (requireComplete) {
  assert((counts.approved ?? 0) + (counts.deferred ?? 0) === manifest.activeCount,
    `Naturalness audit is incomplete: ${JSON.stringify(counts)}`);
  assert(repairs.every(repair => repair.author && (repair.rows.length === 0 || repair.reviewer)),
    'A repair is missing its actual author or independent reviewer');
}
const proof = {schemaVersion: 1, sourceCommit: manifest.sourceCommit,
  snapshotHash: manifest.snapshotHash, runtimeHash: baseline.runtimeHash,
  activeCount: manifest.activeCount, priorApprovedCount: prior.approvedCount,
  priorLedgerHash: hash(prior), sourceCards: baseline.cards,
  batches: manifest.batches, reviews, repairs, deferrals,
  statuses: [...statuses.values()], counts};
const jsonBytes = Buffer.from(JSON.stringify(proof));
const compressed = zlib.gzipSync(jsonBytes, {level: 9});
const proofPath = path.join(project, 'docs/usage-card-naturalness-full-progress.v1.json.gz');
const statusPath = path.join(project, 'docs/usage-card-naturalness-full-progress.v1.json');
const status = {schemaVersion: 1, sourceCommit: manifest.sourceCommit,
  activeCount: manifest.activeCount, batchCount: manifest.batchCount,
  reviewedBatches: reviews.length, repairSubmissions: repairs.length,
  counts, proof: {path: path.relative(project, proofPath), sha256: bytesHash(compressed),
    uncompressedSha256: bytesHash(jsonBytes)}};
fs.writeFileSync(`${proofPath}.next`, compressed);
fs.renameSync(`${proofPath}.next`, proofPath);
fs.writeFileSync(`${statusPath}.next`, JSON.stringify(status, null, 2) + '\n');
fs.renameSync(`${statusPath}.next`, statusPath);
console.log(JSON.stringify(status));
