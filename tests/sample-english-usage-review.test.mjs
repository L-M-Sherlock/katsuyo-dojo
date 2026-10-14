import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { USAGE_CARDS, usageCardItem, usageCardClassRequirements } from '../app/lib/usage-cards.mjs';
import { COURSE_STAGES, UNIFIED_COURSES } from '../app/lib/unified-curriculum.mjs';
import { loadFrozenBatches, selectEnglishUsageReview } from '../scripts/sample-english-usage-review.mjs';

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const byteHash = value => crypto.createHash('sha256').update(value).digest('hex');
const overlay = (card, note = false) => ({ id: card.id, sourceHash: hash(card), scene: 'Scene.',
  translation: 'Translation.', ...(note ? { note: 'Note.' } : {}) });

test('sampling is stable, keeps all strata, and includes the full review context', () => {
  const cards = USAGE_CARDS.filter(card => card.form === 'ba').slice(0, 100);
  assert.equal(cards.length, 100);
  const overlays = cards.map((card, index) => overlay(card, index === 50));
  const batches = [
    { id: 'batch-0000', ids: cards.slice(0, 50).map(card => card.id) },
    { id: 'batch-0001', ids: cards.slice(50).map(card => card.id) },
  ];
  const input = { cards, overlays, batches,
    validFormClasses: usageCardClassRequirements().filter(pair => pair.startsWith('ba/')),
    courses: UNIFIED_COURSES.filter(course => course.forms.includes('ba')), stages: [] };
  const first = selectEnglishUsageReview(input);
  const reversed = selectEnglishUsageReview({ ...input, cards: [...cards].reverse(), overlays: [...overlays].reverse() });
  assert.deepEqual(reversed, first);
  const selected = new Set(first.rows.map(row => row.id));
  const sorted = [...cards].sort((a, b) => a.id.localeCompare(b.id));
  const valid = new Set(usageCardClassRequirements());
  for (const wordClass of new Set(cards.map(card => usageCardItem(card.senseId).class))) {
    if (valid.has(`ba/${wordClass}`)) assert.ok(selected.has(sorted.find(card => usageCardItem(card.senseId).class === wordClass).id));
  }
  for (const batch of batches) assert.ok(selected.has([...batch.ids].sort()[0]));
  assert.ok(selected.has(cards[50].id));
  assert.equal(first.hashSampleCount, Math.ceil(first.remainingCount * 0.05));
  const row = first.rows[0];
  assert.equal(row.sourceHash, hash(cards.find(card => card.id === row.id)));
  assert.ok(row.japanese.sentence.includes(row.japanese.target.text));
  assert.ok(row.japanese.reading.includes(row.japanese.target.reading));
  assert.equal(row.english.translation, 'Translation.');
  assert.ok(row.canonical.before && row.canonical.after && row.canonical.meaning);
});

test('uncovered courses and all six stages are filled with first IDs', () => {
  const cards = COURSE_STAGES.map(stage => {
    const courses = UNIFIED_COURSES.filter(row => row.stageId === stage.id);
    return USAGE_CARDS.find(card => courses.some(course => course.forms.includes(card.form)
      && usageCardItem(card.senseId).domain === course.domain));
  });
  assert.equal(cards.filter(Boolean).length, COURSE_STAGES.length);
  const courses = cards.map(card => UNIFIED_COURSES.find(course => course.forms.includes(card.form)
    && usageCardItem(card.senseId).domain === course.domain));
  const sample = selectEnglishUsageReview({ cards, overlays: cards.map(card => overlay(card)),
    batches: [{ id: 'batch-0000', ids: cards.map(card => card.id) }], validFormClasses: [],
    courses, stages: COURSE_STAGES });
  assert.equal(sample.rows.length, cards.length);
  assert.deepEqual(new Set(sample.rows.map(row => row.stageId)), new Set(COURSE_STAGES.map(stage => stage.id)));
  assert.ok(sample.rows.some(row => row.reasons.some(reason => reason.startsWith('courseGap:'))));
});

test('duplicate assignments and stale overlays stop packet selection', () => {
  const card = USAGE_CARDS[0];
  const input = { cards: [card], overlays: [overlay(card)], batches: [{ id: 'a', ids: [card.id] }],
    validFormClasses: [], courses: UNIFIED_COURSES, stages: COURSE_STAGES };
  assert.throws(() => selectEnglishUsageReview({ ...input, overlays: [{ ...overlay(card), sourceHash: 'stale' }] }), /stale English overlay/);
  assert.throws(() => selectEnglishUsageReview({ ...input, batches: [...input.batches, { id: 'b', ids: [card.id] }] }), /duplicate author assignment/);
});

test('frozen receipts bind assignment, output, final overlay, and module bytes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'usage-review-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const subdir of ['assignments', 'outputs', 'receipts']) await fs.mkdir(path.join(root, subdir));
  const card = USAGE_CARDS[0];
  const english = overlay(card);
  const pairs = [{ id: card.id, sourceHash: hash(card) }];
  const batchId = 'batch-0000';
  const assignment = { schemaVersion: 1, workflow: 'english-usage-card-agent-files',
    translatorId: 'gpt-6-luna-max', batchId, count: 1, sourceHash: hash(pairs), cards: pairs };
  const assignmentBytes = `${JSON.stringify(assignment)}\n`;
  const assignmentHash = byteHash(assignmentBytes);
  const manifest = { schemaVersion: 1, workflow: 'english-usage-card-agent-files',
    translatorId: 'gpt-6-luna-max', cardCount: 1, runtimeHash: hash(pairs), cards: pairs,
    assignments: [{ batchId, file: `assignments/${batchId}.json`, count: 1,
      sourceHash: hash(pairs), assignmentHash }] };
  const batchPayload = { schemaVersion: 1, provider: 'gpt-6-luna-max', batchId,
    manifestHash: hash(manifest), count: 1, sourceHash: hash(pairs), outputHash: hash([english]),
    rows: [{ id: card.id, sourceHash: english.sourceHash, outputHash: hash(english) }] };
  const batchReceipt = { ...batchPayload, receipt: hash(batchPayload) };
  const modulePath = path.join(root, 'usage-cards.mjs');
  await fs.writeFile(modulePath, 'fixture module\n');
  const finalPayload = { schemaVersion: 1, provider: 'gpt-6-luna-max', manifestHash: hash(manifest),
    count: 1, overlayHash: hash([english]), moduleHash: byteHash('fixture module\n'),
    batchReceipts: [{ batchId, receipt: batchReceipt.receipt }] };
  const write = (relative, value) => fs.writeFile(path.join(root, relative), JSON.stringify(value));
  await fs.writeFile(path.join(root, `assignments/${batchId}.json`), assignmentBytes);
  await write('manifest.json', manifest);
  await write(`outputs/${batchId}.json`, { batchId, translatorId: 'gpt-6-luna-max',
    assignmentHash, cards: [english] });
  await write(`receipts/${batchId}.json`, batchReceipt);
  await write('receipts/final.json', { ...finalPayload, receipt: hash(finalPayload) });
  const loaded = await loadFrozenBatches(root, [card], [english], modulePath);
  assert.equal(loaded.batches[0].receipt, batchReceipt.receipt);
  await write(`outputs/${batchId}.json`, { batchId, translatorId: 'gpt-6-luna-max',
    assignmentHash, cards: [{ ...english, translation: 'Changed.' }] });
  await assert.rejects(loadFrozenBatches(root, [card], [english], modulePath), /output or final overlay differs/);
  await write(`outputs/${batchId}.json`, { batchId, translatorId: 'gpt-6-luna-max',
    assignmentHash, cards: [english] });
  await fs.writeFile(modulePath, 'changed module\n');
  await assert.rejects(loadFrozenBatches(root, [card], [english], modulePath), /module bytes differ/);
});
