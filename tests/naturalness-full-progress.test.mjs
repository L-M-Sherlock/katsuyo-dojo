import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {USAGE_CARDS} from '../app/lib/usage-cards.mjs';

const status = JSON.parse(fs.readFileSync(new URL('../docs/usage-card-naturalness-full-progress.v1.json', import.meta.url)));
const bytes = fs.readFileSync(new URL('../docs/usage-card-naturalness-full-progress.v1.json.gz', import.meta.url));
const raw = zlib.gunzipSync(bytes);
const proof = JSON.parse(raw);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const cardHash = card => sha(JSON.stringify(card));

test('portable naturalness audit progress preserves the frozen full scope and exact card reviews', () => {
  assert.equal(sha(bytes), status.proof.sha256);
  assert.equal(sha(raw), status.proof.uncompressedSha256);
  assert.equal(proof.sourceCommit, status.sourceCommit);
  assert.equal(proof.activeCount, status.activeCount);
  assert.equal(proof.sourceCards.length, proof.activeCount);
  const sources = new Map(proof.sourceCards.map(card => [card.id, card]));
  assert.equal(sources.size, proof.activeCount);
  assert.equal(cardHash(proof.sourceCards), proof.runtimeHash);
  assert.equal(proof.statuses.length, proof.activeCount);
  const ids = new Set();
  const counted = {};
  for (const row of proof.statuses) {
    assert.ok(sources.has(row.id) && !ids.has(row.id));
    ids.add(row.id);
    assert.equal(row.sourceHash, cardHash(sources.get(row.id)));
    counted[row.status] = (counted[row.status] ?? 0) + 1;
  }
  assert.deepEqual(counted, status.counts);
  assert.deepEqual(counted, proof.counts);
  assert.equal(Object.keys(proof.batches).length, status.batchCount);
  assert.ok(Object.values(proof.batches).every(batch => batch.ids.length > 0 && batch.ids.length <= 16));
  assert.equal(proof.reviews.length, status.reviewedBatches);
  const reviewedIds = new Set();
  for (const review of proof.reviews) {
    assert.ok(review.sourceReceipt && review.reviewReceipt && review.reviewer);
    for (const row of review.rows) {
      assert.equal(row.hash, cardHash(sources.get(row.id)));
      assert.ok(!reviewedIds.has(row.id), row.id);
      reviewedIds.add(row.id);
      assert.ok(row.reason.length >= 20 && row.sentence && row.reading);
    }
  }
  assert.equal(reviewedIds.size, proof.activeCount - proof.priorApprovedCount);
  assert.equal(proof.repairs.length, status.repairSubmissions);
  for (const repair of proof.repairs) {
    assert.ok(repair.authorReceipt && repair.draft.length <= repair.assignment.length
      && repair.notes.length === repair.assignment.length);
    if (repair.rows.length) assert.ok(repair.reviewer && repair.author !== repair.reviewer);
    for (const row of repair.rows) {
      const card = repair.draft.find(candidate => candidate.id === row.id);
      assert.ok(card && row.hash === cardHash(card));
    }
  }
  for (const deferred of proof.deferrals ?? []) {
    assert.equal(deferred.sourceHash, cardHash(sources.get(deferred.id)));
    assert.equal(deferred.attempts.length, 3);
    assert.deepEqual(deferred.attempts.map(row => row.attemptNumber), [1, 2, 3]);
    assert.ok(deferred.attempts.every(row => row.author && row.authorReceipt && row.noteHash));
    assert.equal(proof.statuses.find(row => row.id === deferred.id)?.status, 'deferred');
  }
});

test('every displayed card has the final approved text hash, and exact deferrals stay absent', () => {
  const live = new Map(USAGE_CARDS.map(card => [card.id, card]));
  assert.equal(live.size, status.counts.approved);
  for (const row of proof.statuses) {
    const card = live.get(row.id);
    if (row.status === 'deferred') assert.equal(card, undefined, row.id);
    else {
      assert.equal(row.status, 'approved', row.id);
      assert.ok(card, row.id);
      assert.equal(cardHash(card), row.cardHash, row.id);
      assert.ok(row.reviewReceipt, row.id);
    }
  }
});
