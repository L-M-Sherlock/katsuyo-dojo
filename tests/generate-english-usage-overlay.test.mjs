import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { USAGE_CARDS } from '../app/lib/usage-cards.mjs';
import { usageCardSourceHash as auditSourceHash } from '../scripts/audit-i18n.mjs';
import {
  createGoogleTranslateHttpAdapter,
  defineTranslatorAdapter,
  freezeEnglishUsageAgentAssignments,
  generateEnglishUsageOverlay,
  importEnglishUsageAgentOutputs,
  mergeEnglishUsageAgentOutputs,
  usageCardSourceHash,
} from '../scripts/generate-english-usage-overlay.mjs';

const fixedNow = () => new Date('2026-10-14T00:00:00.000Z');
const digestJson = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'katsuyo-i18n-overlay-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return {
    root,
    workDir: path.join(root, 'work'),
    outputPath: path.join(root, 'usage-cards.mjs'),
  };
}

function mockAdapter(calls, failFirst = new Set()) {
  const attempts = new Map();
  return defineTranslatorAdapter({
    id: 'mock-translator-v1',
    async translateCard(task) {
      calls.push(task);
      const attempt = (attempts.get(task.id) ?? 0) + 1;
      attempts.set(task.id, attempt);
      if (failFirst.has(task.id) && attempt === 1) throw new Error(`temporary failure for ${task.id}`);
      return {
        scene: `Context for ${task.id}`,
        translation: `Translation for ${task.id}`,
        ...(task.fields.note === undefined ? {} : { note: `Note for ${task.id}` }),
      };
    },
  });
}

test('generator writes deterministic overlays, a frozen manifest, resumable cache, and receipts', async t => {
  const files = await fixture(t);
  const noteCard = USAGE_CARDS.find(card => card.note);
  assert.ok(noteCard);
  const cards = [USAGE_CARDS[1], noteCard, USAGE_CARDS[0]];
  const calls = [];
  const translator = mockAdapter(calls);
  const options = {
    cards,
    translator,
    ...files,
    projectRoot: process.cwd(),
    batchSize: 2,
    concurrency: 2,
    retries: 0,
    retryDelayMs: 0,
    sleep: async () => {},
    now: fixedNow,
  };

  const first = await generateEnglishUsageOverlay(options);
  assert.equal(calls.length, cards.length);
  assert.deepEqual(first.overlays.map(row => row.id), cards.map(card => card.id).sort());
  assert.equal(first.batchReceipts.length, 2);
  assert.equal(first.manifest.batchSize, 2);
  assert.equal(first.manifest.cardCount, cards.length);
  assert.equal(first.manifest.provider, translator.id);
  assert.deepEqual(first.overlays.map(row => row.sourceHash),
    [...cards].sort((a, b) => a.id < b.id ? -1 : 1).map(usageCardSourceHash));
  for (const card of cards) assert.equal(usageCardSourceHash(card), auditSourceHash(card));

  const manifest = JSON.parse(await fs.readFile(path.join(files.workDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.runtimeHash, first.manifest.runtimeHash);
  assert.equal((await fs.readdir(path.join(files.workDir, 'cache'))).length, 2);
  const receiptFiles = await fs.readdir(path.join(files.workDir, 'receipts'));
  assert.deepEqual(receiptFiles.sort(), ['batch-0000.json', 'batch-0001.json', 'final.json']);
  const finalReceipt = JSON.parse(await fs.readFile(path.join(files.workDir, 'receipts', 'final.json'), 'utf8'));
  const { receipt, ...receiptPayload } = finalReceipt;
  assert.equal(receipt, digestJson(receiptPayload));

  const generated = await import(`${pathToFileURL(files.outputPath).href}?run=first`);
  assert.deepEqual(generated.EN_USAGE_CARD_OVERLAYS, first.overlays);
  assert.ok(Object.isFrozen(generated.EN_USAGE_CARD_OVERLAYS));
  assert.ok(generated.EN_USAGE_CARD_OVERLAYS.every(Object.isFrozen));

  const firstBytes = await fs.readFile(files.outputPath, 'utf8');
  const second = await generateEnglishUsageOverlay(options);
  assert.equal(calls.length, cards.length, 'a matching cache prevents provider calls');
  assert.deepEqual(second.overlays, first.overlays);
  assert.equal(await fs.readFile(files.outputPath, 'utf8'), firstBytes);

  const changed = cards.map((card, index) => index === 0 ? { ...card, scene: `${card.scene}。` } : card);
  await generateEnglishUsageOverlay({ ...options, cards: changed });
  assert.equal(calls.length, cards.length + 1, 'only the changed source card is translated again');
});

test('generator retries transient adapter failures and rejects batches larger than 64 cards', async t => {
  const files = await fixture(t);
  const card = USAGE_CARDS[0];
  const calls = [];
  const result = await generateEnglishUsageOverlay({
    cards: [card],
    translator: mockAdapter(calls, new Set([card.id])),
    ...files,
    projectRoot: process.cwd(),
    batchSize: 1,
    concurrency: 1,
    retries: 1,
    retryDelayMs: 0,
    sleep: async () => {},
    now: fixedNow,
  });
  assert.equal(calls.length, 2);
  assert.equal(result.overlays.length, 1);
  await assert.rejects(generateEnglishUsageOverlay({
    cards: [card],
    translator: mockAdapter([]),
    ...files,
    batchSize: 65,
  }), /batchSize must be an integer from 1 through 64/);
});

test('generator retries translated fields that fail validation', async t => {
  const files = await fixture(t);
  const card = USAGE_CARDS[0];
  const attempts = [];
  const translator = defineTranslatorAdapter({
    id: 'mock-validation-retry-v1',
    async translateCard(_task, options) {
      attempts.push(options.attempt);
      if (options.attempt === 0) {
        return { scene: '主持人让嘉宾回答问题。', translation: 'An English sentence.' };
      }
      return { scene: 'The host asks a guest a question.', translation: 'An English sentence.' };
    },
  });
  const result = await generateEnglishUsageOverlay({
    cards: [card],
    translator,
    ...files,
    batchSize: 1,
    retries: 1,
    retryDelayMs: 0,
    sleep: async () => {},
    now: fixedNow,
  });
  assert.deepEqual(attempts, [0, 1]);
  assert.equal(result.overlays[0].scene, 'The host asks a guest a question.');
});

test('generator permits Japanese grammar tokens but rejects untranslated Chinese text', async t => {
  const files = await fixture(t);
  const card = USAGE_CARDS.find(row => row.id === 'usage:zu');
  assert.ok(card);
  const japaneseTerm = defineTranslatorAdapter({
    id: 'mock-japanese-term-v1',
    async translateCard() {
      return {
        scene: 'A formal report describes an omitted name.',
        translation: 'The report was submitted without a name.',
        note: 'ず is a formal negative connector.',
      };
    },
  });
  const result = await generateEnglishUsageOverlay({
    cards: [card],
    translator: japaneseTerm,
    ...files,
    batchSize: 1,
    now: fixedNow,
  });
  assert.equal(result.overlays[0].note, 'ず is a formal negative connector.');

  const chineseResidue = defineTranslatorAdapter({
    id: 'mock-chinese-residue-v1',
    async translateCard() {
      return { scene: 'This still contains 中文.', translation: 'The sentence is translated.', note: 'A note.' };
    },
  });
  await assert.rejects(generateEnglishUsageOverlay({
    cards: [card],
    translator: chineseResidue,
    workDir: path.join(files.root, 'residue-work'),
    outputPath: path.join(files.root, 'residue.mjs'),
    batchSize: 1,
    retries: 0,
  }), /still contains Chinese text: 中文/);
});

test('Google Translate HTTP adapter posts the requested locale and parses translated segments', async () => {
  const requests = [];
  const adapter = createGoogleTranslateHttpAdapter({
    timeoutMs: 1_000,
    async fetchImpl(url, init) {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return [[['__KATSUYO_0__\nA translated context.\n__KATSUYO_1__\nA translated sentence.', '']]];
        },
      };
    },
  });
  const output = await adapter.translateCard({
    id: 'usage:test',
    sourceLocale: 'zh-CN',
    targetLocale: 'en',
    fields: { scene: '一句中文。', translation: '另一句中文。' },
  });
  assert.deepEqual(output, { scene: 'A translated context.', translation: 'A translated sentence.' });
  assert.equal(requests.length, 1);
  assert.ok(requests.every(request => request.url === 'https://translate.googleapis.com/translate_a/single'));
  assert.deepEqual(Object.fromEntries(requests[0].init.body), {
    client: 'gtx',
    sl: 'zh-CN',
    tl: 'en',
    dt: 't',
    q: '__KATSUYO_0__\n一句中文。\n__KATSUYO_1__\n另一句中文。',
  });
});

test('Google adapter retries lost markers with per-field requests', async t => {
  const files = await fixture(t);
  const requests = [];
  const responses = [
    'The combined response lost its markers.',
    'A translated context.',
    'A translated sentence.',
  ];
  const adapter = createGoogleTranslateHttpAdapter({
    timeoutMs: 1_000,
    async fetchImpl(_url, init) {
      requests.push(Object.fromEntries(init.body));
      const translated = responses.shift();
      return { ok: true, status: 200, async json() { return [[[translated, '']]]; } };
    },
  });
  const result = await generateEnglishUsageOverlay({
    cards: [USAGE_CARDS[0]],
    translator: adapter,
    ...files,
    batchSize: 1,
    retries: 1,
    retryDelayMs: 0,
    sleep: async () => {},
    now: fixedNow,
  });
  assert.equal(requests.length, 3);
  assert.match(requests[0].q, /__KATSUYO_0__/);
  assert.doesNotMatch(requests[1].q, /__KATSUYO_/);
  assert.doesNotMatch(requests[2].q, /__KATSUYO_/);
  assert.equal(result.overlays[0].scene, 'A translated context.');
  assert.equal(result.overlays[0].translation, 'A translated sentence.');
});

test('agent-file workflow freezes exact assignments and merges validated gpt-6-luna-max output', async t => {
  const files = await fixture(t);
  const noteCard = USAGE_CARDS.find(card => card.note);
  const cards = [USAGE_CARDS[1], noteCard, USAGE_CARDS[0]];
  const frozen = await freezeEnglishUsageAgentAssignments({
    cards,
    workDir: files.workDir,
    projectRoot: process.cwd(),
    batchSize: 2,
  });
  assert.equal(frozen.manifest.translatorId, 'gpt-6-luna-max');
  assert.equal(frozen.assignments.length, 2);
  assert.ok(frozen.assignments.every(batch => batch.count <= 2));

  const manifest = JSON.parse(await fs.readFile(path.join(files.workDir, 'manifest.json'), 'utf8'));
  for (const batch of manifest.assignments) {
    const assignment = JSON.parse(await fs.readFile(path.join(files.workDir, batch.file), 'utf8'));
    assert.equal(assignment.translatorId, 'gpt-6-luna-max');
    assert.equal(assignment.cards.length, batch.count);
    for (const card of assignment.cards) {
      assert.deepEqual(Object.keys(card), [
        'id', 'sourceHash', 'senseId', 'form', 'meaning', 'scene', 'translation', 'note', 'japaneseSentence',
      ]);
      assert.ok(card.japaneseSentence);
    }
    const output = {
      schemaVersion: 1,
      translatorId: 'gpt-6-luna-max',
      batchId: batch.batchId,
      assignmentHash: batch.assignmentHash,
      cards: assignment.cards.map(card => ({
        id: card.id,
        sourceHash: card.sourceHash,
        scene: `English context for ${card.id}.`,
        translation: `English translation for ${card.id}.`,
        ...(card.note === null ? {} : { note: `English note for ${card.id}.` }),
      })),
    };
    await fs.writeFile(path.join(files.workDir, 'outputs', `${batch.batchId}.json`), `${JSON.stringify(output, null, 2)}\n`);
  }
  await fs.mkdir(path.join(files.workDir, 'cache'), { recursive: true });
  await fs.writeFile(path.join(files.workDir, 'cache', 'google-cache.json'), '{"must":"be ignored"}\n');

  const merged = await mergeEnglishUsageAgentOutputs({
    cards,
    workDir: files.workDir,
    outputPath: files.outputPath,
    now: fixedNow,
  });
  assert.equal(merged.overlays.length, cards.length);
  assert.ok(merged.batchReceipts.every(receipt => receipt.provider === 'gpt-6-luna-max'));
  assert.equal(merged.finalReceipt.provider, 'gpt-6-luna-max');
  const generated = await import(`${pathToFileURL(files.outputPath).href}?run=agent-files`);
  assert.deepEqual(generated.EN_USAGE_CARD_OVERLAYS, merged.overlays);
  assert.deepEqual((await fs.readdir(path.join(files.workDir, 'receipts'))).sort(),
    ['batch-0000.json', 'batch-0001.json', 'final.json']);

  const beforeFailure = await fs.readFile(files.outputPath, 'utf8');
  const firstBatch = manifest.assignments[0];
  const outputPath = path.join(files.workDir, 'outputs', `${firstBatch.batchId}.json`);
  const invalid = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  invalid.cards[0].scene = 'This field still contains 中文.';
  await fs.writeFile(outputPath, `${JSON.stringify(invalid, null, 2)}\n`);
  await assert.rejects(mergeEnglishUsageAgentOutputs({
    cards,
    workDir: files.workDir,
    outputPath: files.outputPath,
  }), /still contains Chinese text: 中文/);
  assert.equal(await fs.readFile(files.outputPath, 'utf8'), beforeFailure,
    'a failed merge does not replace the last complete overlay');
});

test('import command accepts plain and envelope outputs and regroups them without changing text', async t => {
  const files = await fixture(t);
  const sourceWorkDir = path.join(files.root, 'original-order');
  const noteCard = USAGE_CARDS.find(card => card.note);
  const cards = [USAGE_CARDS[0], noteCard, USAGE_CARDS[1]];
  await freezeEnglishUsageAgentAssignments({
    cards,
    workDir: files.workDir,
    projectRoot: process.cwd(),
    batchSize: 2,
  });

  const sourceBatches = [cards.slice(0, 2), cards.slice(2)];
  const sourceManifest = {
    version: 1,
    cardCount: cards.length,
    batchSize: 2,
    batches: sourceBatches.map((rows, index) => ({
      id: `batch-${String(index).padStart(4, '0')}`,
      count: rows.length,
      assignment: `batch-${String(index).padStart(4, '0')}/assignment.json`,
      output: `batch-${String(index).padStart(4, '0')}/output.json`,
    })),
  };
  await fs.mkdir(sourceWorkDir, { recursive: true });
  await fs.writeFile(path.join(sourceWorkDir, 'manifest.json'), `${JSON.stringify(sourceManifest, null, 2)}\n`);
  const expected = new Map();
  for (const [index, rows] of sourceBatches.entries()) {
    const batch = sourceManifest.batches[index];
    const directory = path.join(sourceWorkDir, batch.id);
    await fs.mkdir(directory, { recursive: true });
    const assignmentCards = rows.map(card => ({
      id: card.id,
      sourceHash: usageCardSourceHash(card),
      senseId: card.senseId,
      form: card.form,
      meaning: card.meaning,
      scene: card.scene,
      translation: card.translation,
      ...(card.note === undefined ? {} : { note: card.note }),
      japaneseSentence: 'A frozen Japanese sentence.',
    }));
    await fs.writeFile(path.join(directory, 'assignment.json'), `${JSON.stringify({
      id: batch.id,
      count: rows.length,
      cards: assignmentCards,
    }, null, 2)}\n`);
    const translated = assignmentCards.map((card, cardIndex) => {
      const row = {
        id: card.id,
        sourceHash: card.sourceHash,
        scene: `Exact scene ${index}-${cardIndex}.`,
        translation: `Exact translation ${index}-${cardIndex}.`,
        ...(card.note === undefined ? {} : { note: `Exact note ${index}-${cardIndex}.` }),
      };
      expected.set(row.id, row);
      return row;
    });
    const output = index === 0 ? translated : { id: batch.id, count: translated.length, cards: translated };
    await fs.writeFile(path.join(directory, 'output.json'), `${JSON.stringify(output, null, 2)}\n`);
  }

  const imported = await importEnglishUsageAgentOutputs({
    cards,
    sourceWorkDir,
    workDir: files.workDir,
    now: fixedNow,
  });
  assert.equal(imported.cardCount, cards.length);
  assert.equal(imported.sourceBatchCount, 2);
  assert.equal(imported.officialBatchCount, 2);
  const officialManifest = JSON.parse(await fs.readFile(path.join(files.workDir, 'manifest.json'), 'utf8'));
  const importedRows = [];
  for (const batch of officialManifest.assignments) {
    const envelope = JSON.parse(await fs.readFile(path.join(files.workDir, 'outputs', `${batch.batchId}.json`), 'utf8'));
    assert.equal(envelope.translatorId, 'gpt-6-luna-max');
    assert.equal(envelope.assignmentHash, batch.assignmentHash);
    importedRows.push(...envelope.cards);
  }
  assert.deepEqual(new Map(importedRows.map(row => [row.id, row])), expected,
    'the import only regroups rows and adds the official envelope');

  const merged = await mergeEnglishUsageAgentOutputs({
    cards,
    workDir: files.workDir,
    outputPath: files.outputPath,
    now: fixedNow,
  });
  assert.deepEqual(new Map(merged.overlays.map(row => [row.id, row])), expected);
});

