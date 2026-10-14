import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { USAGE_CARDS } from '../app/lib/usage-cards.mjs';
import { buildExpansionRepairRereview, repairAssignments, validateRepairOutput } from '../scripts/repair-english-usage-cards.mjs';

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sampleReview = (card, english) => ({ id: card.id, sourceHash: english.sourceHash,
  englishHash: hash(english), status: 'revise', reason: `The context for ${card.id} needs a more exact translation.`,
  checks: { englishNatural: true, meaning: false, roles: true, timeAndPolarity: true,
    register: true, scene: true, noAnswerLeak: true },
  reviewer: '/root/reviewer', packetId: 'review-0000', packetSha256: 'packet' });

test('repair assignments are deterministic and split at sixteen cards', () => {
  const cards = USAGE_CARDS.slice(0, 17);
  const overlays = cards.map(card => ({ id: card.id, sourceHash: hash(card),
    scene: 'A person acts.', translation: 'A person acts.' }));
  const batches = [{ id: 'batch-0000', ids: cards.map(card => card.id), receipt: 'author-receipt' }];
  const args = { nonApprovedRows: cards.map((card, index) => sampleReview(card, overlays[index])),
    cards, overlays, frozen: { batches, final: { receipt: 'final', overlayHash: 'overlay', moduleHash: 'module' } },
    sample: { manifestSha256: 'sample' } };
  const first = repairAssignments(args);
  const reverse = repairAssignments({ ...args, nonApprovedRows: [...args.nonApprovedRows].reverse() });
  assert.deepEqual(first, reverse);
  assert.deepEqual(first.map(row => row.count), [16, 1]);
  assert.equal(first[0].cards[0].authorBatchReceipt, 'author-receipt');
  assert.equal(first[0].cards[0].review.status, 'revise');
  assert.ok(first[0].cards[0].japanese.sentence.includes(first[0].cards[0].japanese.target.text));
  assert.equal(first[0].cards[0].englishHash, hash(overlays.find(row => row.id === first[0].cards[0].id)));
});

test('merge output accepts exact English fields and rejects stale, reordered, or leaked content', () => {
  const card = USAGE_CARDS.find(row => !row.note);
  const english = { id: card.id, sourceHash: hash(card), scene: 'A person acts.', translation: 'A person acts.' };
  const batch = { id: 'batch-0000', ids: [card.id], receipt: 'author' };
  const assignment = repairAssignments({ nonApprovedRows: [sampleReview(card, english)],
    cards: [card], overlays: [english], frozen: { batches: [batch],
      final: { receipt: 'final', overlayHash: 'overlay', moduleHash: 'module' } },
    sample: { manifestSha256: 'sample' } })[0];
  const output = { schemaVersion: 1, translatorId: 'gpt-6-luna-max', batchId: assignment.batchId,
    assignmentHash: 'assignment', cards: [{ id: card.id, sourceHash: english.sourceHash,
      originalEnglishHash: hash(english), scene: 'Someone prepares a meal.',
      translation: 'Someone prepares a meal.' }] };
  const canonical = new Map([[card.id, card]]);
  assert.equal(validateRepairOutput(output, assignment, 'assignment', canonical)[0].scene,
    'Someone prepares a meal.');
  const stale = structuredClone(output); stale.cards[0].originalEnglishHash = 'old';
  assert.throws(() => validateRepairOutput(stale, assignment, 'assignment', canonical), /wrong identity/);
  const note = structuredClone(output); note.cards[0].note = 'Unexpected.';
  assert.throws(() => validateRepairOutput(note, assignment, 'assignment', canonical), /note presence/);
  const leak = structuredClone(output); leak.cards[0].scene = assignment.cards[0].japanese.target.text;
  assert.throws(() => validateRepairOutput(leak, assignment, 'assignment', canonical), /leaks the Japanese target/);
  const chinese = structuredClone(output); chinese.cards[0].translation = '请处理这件事。';
  assert.throws(() => validateRepairOutput(chinese, assignment, 'assignment', canonical), /Chinese text/);
});

test('second repair rereviews changed rows and carries only unchanged approvals', () => {
  const cards = USAGE_CARDS.slice(0, 2);
  const overlays = cards.map(card => ({ id: card.id, sourceHash: hash(card),
    scene: 'A person acts.', translation: 'A person acts.' }));
  const updated = { ...overlays[1], translation: 'The person acts carefully.' };
  const review = { approvedRows: [{ id: cards[0].id, sourceHash: overlays[0].sourceHash,
    englishHash: hash(overlays[0]), authorBatch: 'batch-0000', reviewer: 'reviewer', packetSha256: 'packet' }],
  nonApprovedRows: [{ ...sampleReview(cards[1], overlays[1]), packetId: 'batch-0000' }] };
  const args = { cards, overlays: [overlays[0], updated],
    batches: [{ id: 'batch-0000', ids: cards.map(card => card.id), receipt: 'new-author' }],
    replacements: new Map([[cards[1].id, updated]]), review,
    mergeReceipt: { receipt: 'merge', finalReceipt: 'new-final' } };
  const result = buildExpansionRepairRereview(args);
  assert.deepEqual(result.ids, [cards[1].id]);
  assert.equal(result.packets.length, 1);
  assert.equal(result.packets[0].cards[0].englishHash, hash(updated));
  assert.equal(result.packets[0].cards[0].authorBatchReceipt, 'new-author');
  assert.equal(result.carriedApproved.length, 1);
  assert.throws(() => buildExpansionRepairRereview({ ...args,
    overlays: [{ ...overlays[0], translation: 'Changed approval.' }, updated] }),
  /approved expansion row changed/);
});

test('final stage keeps prior approvals and only packets the newly changed card', () => {
  const cards = USAGE_CARDS.slice(0, 3);
  const prior = cards.map(card => ({ id: card.id, sourceHash: hash(card),
    scene: 'A person acts.', translation: 'A person acts.' }));
  const changed = { ...prior[2], translation: 'Someone acts with care.' };
  const approvedRows = prior.slice(0, 2).map((row, index) => ({ id: row.id,
    sourceHash: row.sourceHash, englishHash: hash(row), authorBatch: 'batch-0000',
    reviewer: `reviewer-${index}`, packetSha256: `packet-${index}` }));
  const result = buildExpansionRepairRereview({ cards, overlays: [...prior.slice(0, 2), changed],
    batches: [{ id: 'batch-0000', ids: cards.map(card => card.id), receipt: 'new-author' }],
    replacements: new Map([[changed.id, changed]]),
    review: { approvedRows, nonApprovedRows: [{ ...sampleReview(cards[2], prior[2]),
      packetId: 'rereview-0000' }] },
    mergeReceipt: { receipt: 'merge', finalReceipt: 'new-final' }, repairStage: 'final' });
  assert.deepEqual(result.ids, [changed.id]);
  assert.equal(result.carriedApproved.length, 2);
  assert.equal(result.packets[0].cards.length, 1);
  assert.equal(result.packets[0].cards[0].focusedReview.originalEnglishHash, hash(prior[2]));
  assert.equal(result.packets[0].cards[0].englishHash, hash(changed));
});
