import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { USAGE_CARDS, resolveUsageCard } from '../app/lib/usage-cards.mjs';
import { REVIEWED_USAGE_CARD_REVISIONS, REVIEWED_USAGE_CARD_DEFERRALS } from '../app/lib/usage-cards/reviewed-revisions.mjs';

const GENERATOR_VERSION = 1;
const MAX_BATCH_SIZE = 64;
const DEFAULT_WORK_DIR = 'work/i18n-english-usage-cards';
const DEFAULT_AGENT_WORK_DIR = 'work/i18n-english-usage-cards-gpt';
const DEFAULT_AGENT_IMPORT_DIR = 'work/i18n-gpt-assignments';
const DEFAULT_OUTPUT = 'app/lib/i18n/content/en/usage-cards.mjs';
const BASELINE_OUTPUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', DEFAULT_OUTPUT);
const DEFAULT_GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const AGENT_TRANSLATOR_ID = 'gpt-6-luna-max';
const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々〇]+/gu;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const INTERPOLATION_TOKEN = /\{[A-Za-z][A-Za-z0-9_]*\}/u;

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const digestJson = value => digest(JSON.stringify(value));
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function outputIdentity(file) {
  const resolved = path.resolve(file);
  try { return await fs.realpath(resolved); }
  catch (error) { if (error.code === 'ENOENT') return resolved; throw error; }
}

/** Successor reviews bind the original module bytes as a historical anchor. */
async function assertEnglishUsageOutputWritable(outputPath) {
  if (REVIEWED_USAGE_CARD_REVISIONS.length === 0 && REVIEWED_USAGE_CARD_DEFERRALS.length === 0) return;
  const [destination, baseline] = await Promise.all([outputIdentity(outputPath), outputIdentity(BASELINE_OUTPUT)]);
  if (destination === baseline) throw new Error('Cannot overwrite the historical English baseline after reviewed revisions. Use an explicit temporary output path.');
}

/** Bind localized text to the complete canonical runtime card. */
export function usageCardSourceHash(card) {
  return digestJson(card);
}

function assertPositiveInteger(value, name, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer from 1 through ${maximum}.`);
  }
}

function textFromParts(parts = []) {
  return parts.map(part => part?.text ?? '').join('');
}

function readingFromParts(parts = []) {
  return parts.map(part => part?.reading ?? part?.text ?? '').join('');
}

/**
 * Define the provider-neutral contract used by the generation pipeline.
 * translateCard receives one immutable task and returns localized text only.
 */
export function defineTranslatorAdapter({ id, translateCard }) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Translator adapter needs a nonempty id.');
  if (typeof translateCard !== 'function') throw new Error('Translator adapter needs translateCard(task).');
  return Object.freeze({ id: id.trim(), translateCard });
}

/** Adapt a text-at-a-time provider to the card translation contract. */
export function createTextTranslatorAdapter({ id, translateText }) {
  if (typeof translateText !== 'function') throw new Error('Text translator adapter needs translateText(request).');
  return defineTranslatorAdapter({
    id,
    async translateCard(task) {
      const output = {};
      for (const field of ['scene', 'translation', 'note']) {
        const text = task.fields[field];
        if (text === undefined) continue;
        output[field] = await translateText(Object.freeze({
          text,
          field,
          sourceLocale: task.sourceLocale,
          targetLocale: task.targetLocale,
          card: task,
        }));
      }
      return output;
    },
  });
}

class GoogleTranslateHttpError extends Error {
  constructor(message, { status = null, retryable = true } = {}) {
    super(message);
    this.name = 'GoogleTranslateHttpError';
    this.status = status;
    this.retryable = retryable;
  }
}

function decodeHtmlEntities(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|quot);/giu, (entity, token) => {
    if (token.startsWith('#x')) return String.fromCodePoint(Number.parseInt(token.slice(2), 16));
    if (token.startsWith('#')) return String.fromCodePoint(Number.parseInt(token.slice(1), 10));
    return named[token.toLowerCase()] ?? entity;
  });
}

function googleTranslatedText(payload) {
  if (Array.isArray(payload?.[0])) {
    const value = payload[0].map(segment => Array.isArray(segment) ? segment[0] ?? '' : '').join('');
    if (value) return value;
  }
  const cloudValue = payload?.data?.translations?.[0]?.translatedText;
  if (typeof cloudValue === 'string' && cloudValue) return decodeHtmlEntities(cloudValue);
  throw new GoogleTranslateHttpError('Google Translate returned an unknown response shape.');
}

/** Built-in adapter for the Google Translate HTTP endpoint. */
export function createGoogleTranslateHttpAdapter({
  fetchImpl = globalThis.fetch,
  endpoint = DEFAULT_GOOGLE_ENDPOINT,
  timeoutMs = 20_000,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Google Translate HTTP mode needs fetch.');
  assertPositiveInteger(timeoutMs, 'timeoutMs');
  const translatePayload = async ({ text, sourceLocale, targetLocale }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const body = new URLSearchParams({
      client: 'gtx',
      sl: sourceLocale,
      tl: targetLocale,
      dt: 't',
      q: text,
    });
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw new GoogleTranslateHttpError(`Google Translate HTTP ${response.status}.`, {
          status: response.status,
          retryable,
        });
      }
      return googleTranslatedText(await response.json());
    } catch (error) {
      if (error instanceof GoogleTranslateHttpError) throw error;
      const message = error?.name === 'AbortError'
        ? `Google Translate timed out after ${timeoutMs} ms.`
        : `Google Translate request failed: ${error instanceof Error ? error.message : String(error)}`;
      throw new GoogleTranslateHttpError(message);
    } finally {
      clearTimeout(timer);
    }
  };
  return defineTranslatorAdapter({
    id: 'google-translate-http-v1',
    async translateCard(task, { attempt = 0 } = {}) {
      const fields = ['scene', 'translation', 'note'].filter(field => task.fields[field] !== undefined);
      if (attempt > 0) {
        const output = {};
        for (const field of fields) {
          output[field] = await translatePayload({
            text: task.fields[field],
            sourceLocale: task.sourceLocale,
            targetLocale: task.targetLocale,
          });
        }
        return output;
      }
      const markers = fields.map((field, index) => ({ field, marker: `__KATSUYO_${index}__` }));
      const text = markers.map(({ field, marker }) => `${marker}\n${task.fields[field]}`).join('\n');
      const translated = await translatePayload({
        text,
        sourceLocale: task.sourceLocale,
        targetLocale: task.targetLocale,
      });
      const output = {};
      for (const [index, { field, marker }] of markers.entries()) {
        const start = translated.indexOf(marker);
        const nextMarker = markers[index + 1]?.marker;
        const end = nextMarker === undefined ? translated.length : translated.indexOf(nextMarker, start + marker.length);
        if (start < 0 || end < 0) {
          throw new GoogleTranslateHttpError(`Google Translate did not preserve the ${field} field marker.`, {
            retryable: true,
          });
        }
        output[field] = translated.slice(start + marker.length, end).trim();
      }
      return output;
    },
  });
}

function translationTask(card, options) {
  const resolved = resolveUsageCard(card, options);
  const target = resolved?.target ?? null;
  const beforeText = textFromParts(card.before);
  const afterText = textFromParts(card.after);
  const beforeReading = readingFromParts(card.before);
  const afterReading = readingFromParts(card.after);
  return Object.freeze({
    id: card.id,
    sourceHash: usageCardSourceHash(card),
    sourceLocale: 'zh-CN',
    targetLocale: 'en',
    fields: Object.freeze({
      scene: card.scene,
      translation: card.translation,
      ...(card.note === undefined ? {} : { note: card.note }),
    }),
    context: Object.freeze({
      senseId: card.senseId,
      form: card.form,
      meaning: card.meaning,
      japanese: Object.freeze({
        before: beforeText,
        target: target?.text ?? null,
        targetReading: target?.reading ?? null,
        after: afterText,
        sentence: `${beforeText}${target?.text ?? ''}${afterText}`,
        reading: `${beforeReading}${target?.reading ?? ''}${afterReading}`,
      }),
    }),
  });
}

function disallowedCjkRuns(value, task) {
  const japanese = `${task.context.japanese.sentence}${task.context.japanese.reading}`;
  return (value.match(CJK_RUN) ?? []).filter(run => !KANA.test(run) && !japanese.includes(run));
}

function normalizeEnglishText(value, { task, field, terminalPunctuation = false }) {
  const { id } = task;
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${id}: translator returned empty ${field}.`);
  let normalized = value.trim();
  const residual = disallowedCjkRuns(normalized, task);
  if (residual.length) throw new Error(`${id}: translated ${field} still contains Chinese text: ${residual.join(', ')}.`);
  if (terminalPunctuation && !/[.!?…][\]})"'’”]*$/u.test(normalized)) normalized += '.';
  return normalized;
}

function normalizeTranslation(task, translated) {
  if (!translated || typeof translated !== 'object' || Array.isArray(translated)) {
    throw new Error(`${task.id}: translator must return an object.`);
  }
  const expectedNote = task.fields.note !== undefined;
  if (expectedNote && translated.note === undefined) throw new Error(`${task.id}: translator omitted note.`);
  if (!expectedNote && translated.note !== undefined) throw new Error(`${task.id}: translator added a note that the source card does not have.`);
  return Object.freeze({
    id: task.id,
    sourceHash: task.sourceHash,
    scene: normalizeEnglishText(translated.scene, { task, field: 'scene' }),
    translation: normalizeEnglishText(translated.translation, {
      task,
      field: 'translation',
      terminalPunctuation: true,
    }),
    ...(expectedNote ? { note: normalizeEnglishText(translated.note, { task, field: 'note' }) } : {}),
  });
}

async function atomicWrite(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, bytes);
  await fs.rename(temporary, file);
}

async function writeJson(file, value) {
  await atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`);
}

function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`Cannot read JSON file ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sourceCommit(projectRoot) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function batchesFor(tasks, batchSize) {
  const width = Math.max(4, String(Math.ceil(tasks.length / batchSize) - 1).length);
  const batches = [];
  for (let start = 0, index = 0; start < tasks.length; start += batchSize, index += 1) {
    const rows = tasks.slice(start, start + batchSize);
    const id = `batch-${String(index).padStart(width, '0')}`;
    batches.push(Object.freeze({
      id,
      index,
      start,
      end: start + rows.length,
      count: rows.length,
      sourceHash: digestJson(rows.map(row => ({ id: row.id, sourceHash: row.sourceHash }))),
      rows,
    }));
  }
  return batches;
}

function manifestFor(tasks, batches, { translatorId, batchSize, projectRoot }) {
  return Object.freeze({
    schemaVersion: 1,
    generatorVersion: GENERATOR_VERSION,
    locale: 'en',
    sourceLocale: 'zh-CN',
    sourceCommit: sourceCommit(projectRoot),
    provider: translatorId,
    batchSize,
    cardCount: tasks.length,
    runtimeHash: digestJson(tasks.map(task => ({ id: task.id, sourceHash: task.sourceHash }))),
    cards: tasks.map(task => ({ id: task.id, sourceHash: task.sourceHash })),
    batches: batches.map(batch => ({
      id: batch.id,
      index: batch.index,
      start: batch.start,
      end: batch.end,
      count: batch.count,
      sourceHash: batch.sourceHash,
    })),
  });
}

function validCachedEntry(entry, task, translatorId) {
  if (!entry || entry.id !== task.id || entry.sourceHash !== task.sourceHash || entry.provider !== translatorId) return false;
  if (entry.inputHash !== digestJson(task)) return false;
  try {
    const output = normalizeTranslation(task, entry.output);
    return entry.outputHash === digestJson(output);
  } catch {
    return false;
  }
}

async function retryTranslation(operation, { retries, retryDelayMs, sleep }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (error?.retryable === false || attempt === retries) throw error;
      await sleep(retryDelayMs * (2 ** attempt));
    }
  }
  throw lastError;
}

async function concurrentMap(items, concurrency, worker) {
  const output = new Array(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return output;
}

function cacheDocument(batch, translatorId, entries) {
  return {
    schemaVersion: 1,
    generatorVersion: GENERATOR_VERSION,
    batchId: batch.id,
    provider: translatorId,
    entries: [...entries.values()].sort(byId),
  };
}

function receiptPayload(batch, manifestHash, translatorId, overlays, now) {
  return {
    schemaVersion: 1,
    generatorVersion: GENERATOR_VERSION,
    batchId: batch.id,
    manifestHash,
    provider: translatorId,
    count: overlays.length,
    sourceHash: batch.sourceHash,
    outputHash: digestJson(overlays),
    rows: overlays.map(row => ({ id: row.id, sourceHash: row.sourceHash, outputHash: digestJson(row) })),
    generatedAt: now().toISOString(),
  };
}

function receiptWithDigest(payload) {
  return { ...payload, receipt: digestJson(payload) };
}

function renderOverlayModule(overlays) {
  return `// Generated by scripts/generate-english-usage-overlay.mjs.\n`
    + `// Do not edit this file by hand. Re-run the generator from the frozen manifest.\n`
    + `export const EN_USAGE_CARD_OVERLAYS = Object.freeze(${JSON.stringify(overlays, null, 2)}\n`
    + `  .map(row => Object.freeze(row)));\n`;
}

/**
 * Generate a complete English overlay. The production output is written only
 * after all cards have translated successfully.
 */
export async function generateEnglishUsageOverlay({
  cards,
  translator,
  workDir,
  outputPath,
  projectRoot = process.cwd(),
  batchSize = MAX_BATCH_SIZE,
  concurrency = 6,
  retries = 3,
  retryDelayMs = 750,
  resume = true,
  sleep = delay,
  now = () => new Date(),
  onProgress = () => {},
}) {
  if (!Array.isArray(cards)) throw new Error('cards must be an array.');
  if (!translator || typeof translator.id !== 'string' || typeof translator.translateCard !== 'function') {
    throw new Error('translator must be a translator adapter.');
  }
  if (typeof workDir !== 'string' || !workDir) throw new Error('workDir is required.');
  if (typeof outputPath !== 'string' || !outputPath) throw new Error('outputPath is required.');
  await assertEnglishUsageOutputWritable(outputPath);
  assertPositiveInteger(batchSize, 'batchSize', MAX_BATCH_SIZE);
  assertPositiveInteger(concurrency, 'concurrency', MAX_BATCH_SIZE);
  if (!Number.isSafeInteger(retries) || retries < 0) throw new Error('retries must be a nonnegative integer.');
  if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 0) throw new Error('retryDelayMs must be a nonnegative integer.');

  const cardIds = new Set();
  for (const card of cards) {
    if (!card || typeof card.id !== 'string' || !card.id) throw new Error('Every canonical card needs a nonempty id.');
    if (cardIds.has(card.id)) throw new Error(`Duplicate canonical card id: ${card.id}`);
    cardIds.add(card.id);
  }
  const tasks = cards.map(translationTask).sort(byId);
  const batches = batchesFor(tasks, batchSize);
  const manifest = manifestFor(tasks, batches, {
    translatorId: translator.id,
    batchSize,
    projectRoot,
  });
  const manifestHash = digestJson(manifest);
  const cacheDir = path.join(workDir, 'cache');
  const receiptDir = path.join(workDir, 'receipts');
  await writeJson(path.join(workDir, 'manifest.json'), manifest);

  const allOverlays = [];
  const batchReceipts = [];
  for (const batch of batches) {
    const cacheFile = path.join(cacheDir, `${batch.id}.json`);
    const cached = resume ? await readJson(cacheFile) : null;
    const entries = new Map();
    if (cached?.schemaVersion === 1 && cached.provider === translator.id && Array.isArray(cached.entries)) {
      const taskById = new Map(batch.rows.map(task => [task.id, task]));
      for (const entry of cached.entries) {
        const task = taskById.get(entry?.id);
        if (task && validCachedEntry(entry, task, translator.id)) entries.set(entry.id, entry);
      }
    }
    const pending = batch.rows.filter(task => !entries.has(task.id));
    let persist = Promise.resolve();
    await concurrentMap(pending, concurrency, async task => {
      const normalized = await retryTranslation(
        async attempt => normalizeTranslation(task, await translator.translateCard(task, { attempt })),
        { retries, retryDelayMs, sleep },
      );
      entries.set(task.id, {
        id: task.id,
        sourceHash: task.sourceHash,
        provider: translator.id,
        inputHash: digestJson(task),
        output: normalized,
        outputHash: digestJson(normalized),
      });
      persist = persist.then(() => writeJson(cacheFile, cacheDocument(batch, translator.id, entries)));
      await persist;
      return normalized;
    });
    await persist;

    const overlays = batch.rows.map(task => {
      const entry = entries.get(task.id);
      if (!entry || !validCachedEntry(entry, task, translator.id)) {
        throw new Error(`${batch.id}: missing valid cached translation for ${task.id}.`);
      }
      return normalizeTranslation(task, entry.output);
    });
    allOverlays.push(...overlays);
    const payload = receiptPayload(batch, manifestHash, translator.id, overlays, now);
    const receipt = receiptWithDigest(payload);
    await writeJson(path.join(receiptDir, `${batch.id}.json`), receipt);
    batchReceipts.push(receipt);
    onProgress(Object.freeze({
      batchId: batch.id,
      batchIndex: batch.index,
      batchCount: batches.length,
      translated: pending.length,
      reused: overlays.length - pending.length,
      completed: allOverlays.length,
      total: tasks.length,
    }));
  }

  const overlays = Object.freeze([...allOverlays].sort(byId));
  const moduleBytes = renderOverlayModule(overlays);
  await atomicWrite(outputPath, moduleBytes);
  const finalPayload = {
    schemaVersion: 1,
    generatorVersion: GENERATOR_VERSION,
    manifestHash,
    provider: translator.id,
    count: overlays.length,
    overlayHash: digestJson(overlays),
    moduleHash: digest(moduleBytes),
    batchReceipts: batchReceipts.map(receipt => ({ batchId: receipt.batchId, receipt: receipt.receipt })),
    generatedAt: now().toISOString(),
  };
  const finalReceipt = receiptWithDigest(finalPayload);
  await writeJson(path.join(receiptDir, 'final.json'), finalReceipt);
  return Object.freeze({
    overlays,
    manifest,
    manifestHash,
    batchReceipts: Object.freeze(batchReceipts),
    finalReceipt: Object.freeze(finalReceipt),
    outputPath,
  });
}

function agentAssignment(batch) {
  return {
    schemaVersion: 1,
    workflow: 'english-usage-card-agent-files',
    translatorId: AGENT_TRANSLATOR_ID,
    batchId: batch.id,
    count: batch.count,
    sourceHash: batch.sourceHash,
    cards: batch.rows.map(task => ({
      id: task.id,
      sourceHash: task.sourceHash,
      senseId: task.context.senseId,
      form: task.context.form,
      meaning: task.context.meaning,
      scene: task.fields.scene,
      translation: task.fields.translation,
      note: task.fields.note ?? null,
      japaneseSentence: task.context.japanese.sentence,
    })),
  };
}

function agentManifest(tasks, batches, assignments, { batchSize, projectRoot }) {
  return {
    schemaVersion: 1,
    generatorVersion: GENERATOR_VERSION,
    workflow: 'english-usage-card-agent-files',
    locale: 'en',
    sourceLocale: 'zh-CN',
    sourceCommit: sourceCommit(projectRoot),
    translatorId: AGENT_TRANSLATOR_ID,
    batchSize,
    cardCount: tasks.length,
    runtimeHash: digestJson(tasks.map(task => ({ id: task.id, sourceHash: task.sourceHash }))),
    cards: tasks.map(task => ({ id: task.id, sourceHash: task.sourceHash })),
    assignments: batches.map((batch, index) => ({
      batchId: batch.id,
      index: batch.index,
      count: batch.count,
      sourceHash: batch.sourceHash,
      file: `assignments/${batch.id}.json`,
      assignmentHash: assignments[index].hash,
    })),
  };
}

/** Freeze immutable translation assignments for gpt-6-luna max agents. */
export async function freezeEnglishUsageAgentAssignments({
  cards,
  workDir,
  projectRoot = process.cwd(),
  batchSize = MAX_BATCH_SIZE,
}) {
  if (!Array.isArray(cards)) throw new Error('cards must be an array.');
  if (typeof workDir !== 'string' || !workDir) throw new Error('workDir is required.');
  assertPositiveInteger(batchSize, 'batchSize', MAX_BATCH_SIZE);
  const ids = new Set();
  for (const card of cards) {
    if (!card || typeof card.id !== 'string' || !card.id) throw new Error('Every canonical card needs a nonempty id.');
    if (ids.has(card.id)) throw new Error(`Duplicate canonical card id: ${card.id}`);
    ids.add(card.id);
  }
  const tasks = cards.map(translationTask).sort(byId);
  const batches = batchesFor(tasks, batchSize);
  await fs.mkdir(path.join(workDir, 'outputs'), { recursive: true });
  const assignmentRecords = [];
  for (const batch of batches) {
    const assignment = agentAssignment(batch);
    const bytes = jsonBytes(assignment);
    const file = path.join(workDir, 'assignments', `${batch.id}.json`);
    await atomicWrite(file, bytes);
    assignmentRecords.push({ assignment, bytes, hash: digest(bytes), file });
  }
  const manifest = agentManifest(tasks, batches, assignmentRecords, { batchSize, projectRoot });
  const manifestHash = digestJson(manifest);
  await writeJson(path.join(workDir, 'manifest.json'), manifest);
  return Object.freeze({
    manifest: Object.freeze(manifest),
    manifestHash,
    assignments: Object.freeze(assignmentRecords.map(record => Object.freeze({
      batchId: record.assignment.batchId,
      count: record.assignment.count,
      file: record.file,
      assignmentHash: record.hash,
    }))),
  });
}

function exactKeys(value, allowed, label) {
  const unexpected = Object.keys(value).filter(key => !allowed.has(key));
  if (unexpected.length) throw new Error(`${label}: unexpected fields: ${unexpected.join(', ')}.`);
}

function strictAgentOverlay(task, row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`${task.id}: output row must be an object.`);
  const noteExpected = task.fields.note !== undefined;
  exactKeys(row, new Set(['id', 'sourceHash', 'scene', 'translation', ...(noteExpected ? ['note'] : [])]), task.id);
  if (row.id !== task.id) throw new Error(`${task.id}: output id differs from assignment.`);
  if (row.sourceHash !== task.sourceHash) throw new Error(`${task.id}: output sourceHash differs from assignment.`);
  if (noteExpected !== (row.note !== undefined)) throw new Error(`${task.id}: output note presence differs from assignment.`);
  const output = {};
  for (const field of ['scene', 'translation', ...(noteExpected ? ['note'] : [])]) {
    const value = row[field];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${task.id}: output ${field} must be nonempty text.`);
    if (value !== value.trim()) throw new Error(`${task.id}: output ${field} has surrounding whitespace.`);
    const residual = disallowedCjkRuns(value, task);
    if (residual.length) throw new Error(`${task.id}: output ${field} still contains Chinese text: ${residual.join(', ')}.`);
    if (INTERPOLATION_TOKEN.test(value)) throw new Error(`${task.id}: output ${field} contains an interpolation token.`);
    output[field] = value;
  }
  if (!/[.!?…][\]})"'’”]*$/u.test(output.translation)) {
    throw new Error(`${task.id}: output translation needs terminal punctuation.`);
  }
  const target = task.context.japanese.target;
  const answerReading = task.context.japanese.targetReading;
  // Only the front-side scene can reveal an unanswered target. Translation and
  // note appear after grading; source notes can deliberately name the form.
  if (target && output.scene.includes(target)) {
    throw new Error(`${task.id}: output scene leaks the Japanese target answer.`);
  }
  if (answerReading && answerReading.length >= 4 && output.scene.includes(answerReading)) {
    throw new Error(`${task.id}: output scene leaks the Japanese answer reading.`);
  }
  return Object.freeze({
    id: task.id,
    sourceHash: task.sourceHash,
    scene: output.scene,
    translation: output.translation,
    ...(noteExpected ? { note: output.note } : {}),
  });
}

/** Apply the frozen agent-output language and field checks to one current card. */
export function validateEnglishUsageAgentOverlay(card, row, options) {
  return strictAgentOverlay(translationTask(card, options), row);
}

async function jsonFileWithBytes(file) {
  let bytes;
  try {
    bytes = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Missing file: ${file}`);
    throw error;
  }
  try {
    return { bytes, value: JSON.parse(bytes) };
  } catch (error) {
    throw new Error(`Invalid JSON in ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateAgentOutputDocument(document, assignment, assignmentHash, tasks) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error(`${assignment.batchId}: output must be an object.`);
  }
  exactKeys(document, new Set(['schemaVersion', 'translatorId', 'batchId', 'assignmentHash', 'cards']), assignment.batchId);
  if (document.schemaVersion !== 1) throw new Error(`${assignment.batchId}: unsupported output schemaVersion.`);
  if (document.translatorId !== AGENT_TRANSLATOR_ID) throw new Error(`${assignment.batchId}: translatorId must be ${AGENT_TRANSLATOR_ID}.`);
  if (document.batchId !== assignment.batchId) throw new Error(`${assignment.batchId}: output batchId differs from assignment.`);
  if (document.assignmentHash !== assignmentHash) throw new Error(`${assignment.batchId}: output assignmentHash differs from frozen assignment.`);
  if (!Array.isArray(document.cards) || document.cards.length !== tasks.length) {
    throw new Error(`${assignment.batchId}: output card count differs from assignment.`);
  }
  return document.cards.map((row, index) => {
    if (row?.id !== tasks[index].id) {
      throw new Error(`${assignment.batchId}: output cards must keep exact assignment order at index ${index}.`);
    }
    return strictAgentOverlay(tasks[index], row);
  });
}

/** Validate exact gpt-6-luna max output files and merge the final overlay. */
export async function mergeEnglishUsageAgentOutputs({
  cards,
  workDir,
  outputPath,
  now = () => new Date(),
}) {
  if (!Array.isArray(cards)) throw new Error('cards must be an array.');
  if (typeof workDir !== 'string' || !workDir) throw new Error('workDir is required.');
  if (typeof outputPath !== 'string' || !outputPath) throw new Error('outputPath is required.');
  await assertEnglishUsageOutputWritable(outputPath);
  const { value: manifest } = await jsonFileWithBytes(path.join(workDir, 'manifest.json'));
  if (manifest?.schemaVersion !== 1 || manifest.workflow !== 'english-usage-card-agent-files') {
    throw new Error('Agent manifest is missing or has an unsupported schema.');
  }
  if (manifest.translatorId !== AGENT_TRANSLATOR_ID) throw new Error(`Agent manifest translatorId must be ${AGENT_TRANSLATOR_ID}.`);
  if (!Array.isArray(manifest.assignments) || !Array.isArray(manifest.cards)) throw new Error('Agent manifest is incomplete.');
  const tasks = cards.map(translationTask).sort(byId);
  const currentCards = tasks.map(task => ({ id: task.id, sourceHash: task.sourceHash }));
  if (manifest.cardCount !== tasks.length || manifest.runtimeHash !== digestJson(currentCards)
    || JSON.stringify(manifest.cards) !== JSON.stringify(currentCards)) {
    throw new Error('Agent manifest does not match current canonical usage cards. Freeze new assignments.');
  }
  const manifestHash = digestJson(manifest);
  const expectedOutputFiles = new Set(manifest.assignments.map(row => `${row.batchId}.json`));
  let actualOutputFiles = [];
  try {
    actualOutputFiles = (await fs.readdir(path.join(workDir, 'outputs'))).filter(file => file.endsWith('.json')).sort();
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const missing = [...expectedOutputFiles].filter(file => !actualOutputFiles.includes(file));
  const extra = actualOutputFiles.filter(file => !expectedOutputFiles.has(file));
  if (missing.length || extra.length) {
    throw new Error(`Agent output file set differs from manifest. Missing: ${missing.join(', ') || 'none'}. Extra: ${extra.join(', ') || 'none'}.`);
  }

  const taskById = new Map(tasks.map(task => [task.id, task]));
  const overlays = [];
  const batchReceipts = [];
  for (const manifestBatch of manifest.assignments) {
    const assignmentPath = path.join(workDir, manifestBatch.file);
    const assignmentFile = await jsonFileWithBytes(assignmentPath);
    if (digest(assignmentFile.bytes) !== manifestBatch.assignmentHash) {
      throw new Error(`${manifestBatch.batchId}: frozen assignment hash mismatch.`);
    }
    const assignment = assignmentFile.value;
    if (assignment.batchId !== manifestBatch.batchId || assignment.sourceHash !== manifestBatch.sourceHash
      || assignment.count !== manifestBatch.count || !Array.isArray(assignment.cards)) {
      throw new Error(`${manifestBatch.batchId}: assignment metadata differs from manifest.`);
    }
    const batchTasks = assignment.cards.map(row => {
      const task = taskById.get(row.id);
      if (!task || row.sourceHash !== task.sourceHash) {
        throw new Error(`${manifestBatch.batchId}: assignment source differs from current card ${row.id}.`);
      }
      return task;
    });
    const outputFile = await jsonFileWithBytes(path.join(workDir, 'outputs', `${manifestBatch.batchId}.json`));
    const batchOverlays = validateAgentOutputDocument(
      outputFile.value,
      assignment,
      manifestBatch.assignmentHash,
      batchTasks,
    );
    overlays.push(...batchOverlays);
    const batch = {
      id: manifestBatch.batchId,
      sourceHash: manifestBatch.sourceHash,
    };
    const payload = receiptPayload(batch, manifestHash, AGENT_TRANSLATOR_ID, batchOverlays, now);
    const receipt = receiptWithDigest(payload);
    await writeJson(path.join(workDir, 'receipts', `${manifestBatch.batchId}.json`), receipt);
    batchReceipts.push(receipt);
  }
  const orderedOverlays = Object.freeze([...overlays].sort(byId));
  if (orderedOverlays.length !== tasks.length) throw new Error('Merged overlay count differs from current canonical cards.');
  const moduleBytes = renderOverlayModule(orderedOverlays);
  await atomicWrite(outputPath, moduleBytes);
  const finalPayload = {
    schemaVersion: 1,
    generatorVersion: GENERATOR_VERSION,
    manifestHash,
    provider: AGENT_TRANSLATOR_ID,
    count: orderedOverlays.length,
    overlayHash: digestJson(orderedOverlays),
    moduleHash: digest(moduleBytes),
    batchReceipts: batchReceipts.map(receipt => ({ batchId: receipt.batchId, receipt: receipt.receipt })),
    generatedAt: now().toISOString(),
  };
  const finalReceipt = receiptWithDigest(finalPayload);
  await writeJson(path.join(workDir, 'receipts', 'final.json'), finalReceipt);
  return Object.freeze({
    overlays: orderedOverlays,
    manifest: Object.freeze(manifest),
    manifestHash,
    batchReceipts: Object.freeze(batchReceipts),
    finalReceipt: Object.freeze(finalReceipt),
    outputPath,
  });
}

function withinRoot(root, relative, label) {
  if (typeof relative !== 'string' || !relative) throw new Error(`${label} must be a nonempty path.`);
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, relative);
  if (absolute !== absoluteRoot && !absolute.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`${label} leaves its work directory.`);
  }
  return absolute;
}

function sourceOutputRows(value, sourceBatch) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') throw new Error(`${sourceBatch.id}: source output must be an array or envelope.`);
  exactKeys(value, new Set(['id', 'count', 'cards']), sourceBatch.id);
  if (value.id !== sourceBatch.id || value.count !== sourceBatch.count || !Array.isArray(value.cards)) {
    throw new Error(`${sourceBatch.id}: source output envelope differs from its manifest.`);
  }
  return value.cards;
}

/**
 * Import the original-order gpt output files without changing their text.
 * The command regroups rows into the official ID-sorted frozen assignments.
 */
export async function importEnglishUsageAgentOutputs({
  cards,
  sourceWorkDir,
  workDir,
  now = () => new Date(),
}) {
  if (!Array.isArray(cards)) throw new Error('cards must be an array.');
  if (typeof sourceWorkDir !== 'string' || !sourceWorkDir) throw new Error('sourceWorkDir is required.');
  if (typeof workDir !== 'string' || !workDir) throw new Error('workDir is required.');
  const tasks = cards.map(translationTask).sort(byId);
  const taskById = new Map(tasks.map(task => [task.id, task]));
  if (taskById.size !== tasks.length) throw new Error('Canonical usage-card IDs must be unique.');

  const sourceManifestFile = await jsonFileWithBytes(path.join(sourceWorkDir, 'manifest.json'));
  const sourceManifest = sourceManifestFile.value;
  if (sourceManifest?.version !== 1 || !Array.isArray(sourceManifest.batches)) {
    throw new Error('Source agent manifest is missing or has an unsupported schema.');
  }
  if (sourceManifest.cardCount !== tasks.length) {
    throw new Error(`Source agent manifest has ${sourceManifest.cardCount} cards; expected ${tasks.length}.`);
  }
  const missingSourceOutputs = [];
  for (const batch of sourceManifest.batches) {
    const outputPath = withinRoot(sourceWorkDir, batch.output, `${batch.id}: output path`);
    try {
      await fs.access(outputPath);
    } catch (error) {
      if (error?.code === 'ENOENT') missingSourceOutputs.push(batch.id);
      else throw error;
    }
  }
  if (missingSourceOutputs.length) {
    throw new Error(`Source agent outputs are incomplete. Missing ${missingSourceOutputs.length}: ${missingSourceOutputs.join(', ')}.`);
  }

  const localizedById = new Map();
  const sourceProof = [];
  for (const sourceBatch of sourceManifest.batches) {
    if (!sourceBatch || typeof sourceBatch.id !== 'string' || !Number.isSafeInteger(sourceBatch.count)
      || sourceBatch.count < 1 || sourceBatch.count > MAX_BATCH_SIZE) {
      throw new Error('Source agent manifest has an invalid batch.');
    }
    const assignmentPath = withinRoot(sourceWorkDir, sourceBatch.assignment, `${sourceBatch.id}: assignment path`);
    const outputPath = withinRoot(sourceWorkDir, sourceBatch.output, `${sourceBatch.id}: output path`);
    const assignmentFile = await jsonFileWithBytes(assignmentPath);
    const outputFile = await jsonFileWithBytes(outputPath);
    const assignment = assignmentFile.value;
    if (!assignment || assignment.id !== sourceBatch.id || assignment.count !== sourceBatch.count
      || !Array.isArray(assignment.cards) || assignment.cards.length !== sourceBatch.count) {
      throw new Error(`${sourceBatch.id}: source assignment differs from manifest.`);
    }
    const outputRows = sourceOutputRows(outputFile.value, sourceBatch);
    if (outputRows.length !== assignment.cards.length) {
      throw new Error(`${sourceBatch.id}: source output count differs from assignment.`);
    }
    for (const [index, assignmentRow] of assignment.cards.entries()) {
      const task = taskById.get(assignmentRow?.id);
      if (!task || assignmentRow.sourceHash !== task.sourceHash) {
        throw new Error(`${sourceBatch.id}: source assignment card ${assignmentRow?.id} is stale or unknown.`);
      }
      const outputRow = outputRows[index];
      if (outputRow?.id !== assignmentRow.id || outputRow?.sourceHash !== assignmentRow.sourceHash) {
        throw new Error(`${sourceBatch.id}: source output order or identity differs at index ${index}.`);
      }
      if (localizedById.has(task.id)) throw new Error(`${task.id}: duplicate source translation.`);
      localizedById.set(task.id, strictAgentOverlay(task, outputRow));
    }
    sourceProof.push({
      batchId: sourceBatch.id,
      count: sourceBatch.count,
      assignmentHash: digest(assignmentFile.bytes),
      outputHash: digest(outputFile.bytes),
    });
  }
  const missingIds = tasks.filter(task => !localizedById.has(task.id)).map(task => task.id);
  if (missingIds.length || localizedById.size !== tasks.length) {
    throw new Error(`Source translations do not exactly cover canonical cards. Missing: ${missingIds.join(', ') || 'none'}.`);
  }

  const { value: officialManifest } = await jsonFileWithBytes(path.join(workDir, 'manifest.json'));
  const currentCards = tasks.map(task => ({ id: task.id, sourceHash: task.sourceHash }));
  if (officialManifest?.workflow !== 'english-usage-card-agent-files'
    || officialManifest.translatorId !== AGENT_TRANSLATOR_ID
    || officialManifest.cardCount !== tasks.length
    || officialManifest.runtimeHash !== digestJson(currentCards)
    || JSON.stringify(officialManifest.cards) !== JSON.stringify(currentCards)
    || !Array.isArray(officialManifest.assignments)) {
    throw new Error('Official agent manifest does not match current canonical cards. Freeze official assignments first.');
  }

  const officialOutputs = [];
  for (const batch of officialManifest.assignments) {
    const assignmentFile = await jsonFileWithBytes(withinRoot(workDir, batch.file, `${batch.batchId}: official assignment path`));
    if (digest(assignmentFile.bytes) !== batch.assignmentHash) {
      throw new Error(`${batch.batchId}: official assignment hash mismatch.`);
    }
    const assignment = assignmentFile.value;
    if (!Array.isArray(assignment.cards) || assignment.cards.length !== batch.count) {
      throw new Error(`${batch.batchId}: official assignment count mismatch.`);
    }
    const output = {
      schemaVersion: 1,
      translatorId: AGENT_TRANSLATOR_ID,
      batchId: batch.batchId,
      assignmentHash: batch.assignmentHash,
      cards: assignment.cards.map(row => {
        const localized = localizedById.get(row.id);
        if (!localized || localized.sourceHash !== row.sourceHash) {
          throw new Error(`${batch.batchId}: no imported translation for ${row.id}.`);
        }
        return localized;
      }),
    };
    officialOutputs.push({
      file: path.join(workDir, 'outputs', `${batch.batchId}.json`),
      output,
    });
  }

  for (const row of officialOutputs) await writeJson(row.file, row.output);
  const importPayload = {
    schemaVersion: 1,
    translatorId: AGENT_TRANSLATOR_ID,
    sourceManifestHash: digest(sourceManifestFile.bytes),
    officialManifestHash: digestJson(officialManifest),
    cardCount: localizedById.size,
    batchCount: sourceProof.length,
    sourceBatches: sourceProof,
    importedAt: now().toISOString(),
  };
  const importReceipt = receiptWithDigest(importPayload);
  await writeJson(path.join(workDir, 'receipts', 'import.json'), importReceipt);
  return Object.freeze({
    cardCount: localizedById.size,
    sourceBatchCount: sourceProof.length,
    officialBatchCount: officialOutputs.length,
    importReceipt: Object.freeze(importReceipt),
  });
}

function parseInteger(value, name, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}.`);
  }
  return parsed;
}

function parseArgs(argv) {
  const args = [...argv];
  const values = {
    mode: 'google-http',
    provider: 'google-http',
    workDir: null,
    sourceWorkDir: DEFAULT_AGENT_IMPORT_DIR,
    output: DEFAULT_OUTPUT,
    batchSize: MAX_BATCH_SIZE,
    concurrency: 6,
    retries: 3,
    retryDelayMs: 750,
    timeoutMs: 20_000,
    resume: true,
    endpoint: DEFAULT_GOOGLE_ENDPOINT,
  };
  if (args[0] && !args[0].startsWith('-')) values.mode = args.shift();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--help' || flag === '-h') return { ...values, help: true };
    if (flag === '--no-resume' || flag === '--force') { values.resume = false; continue; }
    const next = args[index + 1];
    if (next === undefined) throw new Error(`Missing value for ${flag}.`);
    index += 1;
    if (flag === '--mode') values.mode = next;
    else if (flag === '--provider') values.provider = next;
    else if (flag === '--work-dir') values.workDir = next;
    else if (flag === '--source-work-dir') values.sourceWorkDir = next;
    else if (flag === '--output') values.output = next;
    else if (flag === '--batch-size') values.batchSize = parseInteger(next, 'batch-size', { minimum: 1, maximum: MAX_BATCH_SIZE });
    else if (flag === '--concurrency') values.concurrency = parseInteger(next, 'concurrency', { minimum: 1, maximum: MAX_BATCH_SIZE });
    else if (flag === '--retries') values.retries = parseInteger(next, 'retries');
    else if (flag === '--retry-delay-ms') values.retryDelayMs = parseInteger(next, 'retry-delay-ms');
    else if (flag === '--timeout-ms') values.timeoutMs = parseInteger(next, 'timeout-ms', { minimum: 1 });
    else if (flag === '--google-endpoint') values.endpoint = next;
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (values.workDir === null) {
    values.workDir = ['freeze-agent-files', 'import-agent-files', 'merge-agent-files'].includes(values.mode)
      ? DEFAULT_AGENT_WORK_DIR : DEFAULT_WORK_DIR;
  }
  return values;
}

function helpText() {
  return `Generate the complete English usage-card overlay.\n\n`
    + `Usage:\n`
    + `  node scripts/generate-english-usage-overlay.mjs [google-http] [options]\n`
    + `  node scripts/generate-english-usage-overlay.mjs freeze-agent-files [options]\n`
    + `  node scripts/generate-english-usage-overlay.mjs import-agent-files [options]\n`
    + `  node scripts/generate-english-usage-overlay.mjs merge-agent-files [options]\n\n`
    + `Options:\n`
    + `  --provider google-http       Translation provider (default: google-http)\n`
    + `  --work-dir PATH              Manifest, cache, and receipts directory\n`
    + `  --source-work-dir PATH       Original-order agent assignments to import\n`
    + `  --output PATH                Generated ESM overlay module\n`
    + `  --batch-size N               Cards per auditable batch, maximum 64\n`
    + `  --concurrency N              Concurrent card translations\n`
    + `  --retries N                  Retries after a transient failure\n`
    + `  --retry-delay-ms N           Initial exponential retry delay\n`
    + `  --timeout-ms N               Timeout for each HTTP request\n`
    + `  --google-endpoint URL        Override the Google Translate endpoint\n`
    + `  --no-resume, --force         Ignore existing translation cache\n`;
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(helpText());
    return;
  }
  if (!['google', 'google-http'].includes(options.provider)) {
    throw new Error(`Unsupported provider: ${options.provider}`);
  }
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const workDir = path.resolve(process.cwd(), options.workDir);
  const outputPath = path.resolve(process.cwd(), options.output);
  if (options.mode === 'freeze-agent-files') {
    const result = await freezeEnglishUsageAgentAssignments({
      cards: USAGE_CARDS,
      workDir,
      projectRoot,
      batchSize: options.batchSize,
    });
    console.log(JSON.stringify({
      translatorId: AGENT_TRANSLATOR_ID,
      cards: result.manifest.cardCount,
      batches: result.assignments.length,
      workDir,
      manifestHash: result.manifestHash,
    }, null, 2));
    return;
  }
  if (options.mode === 'merge-agent-files') {
    const result = await mergeEnglishUsageAgentOutputs({
      cards: USAGE_CARDS,
      workDir,
      outputPath,
    });
    console.log(JSON.stringify({
      translatorId: AGENT_TRANSLATOR_ID,
      cards: result.overlays.length,
      batches: result.batchReceipts.length,
      manifestHash: result.manifestHash,
      outputPath: result.outputPath,
      receipt: result.finalReceipt.receipt,
    }, null, 2));
    return;
  }
  if (options.mode === 'import-agent-files') {
    const result = await importEnglishUsageAgentOutputs({
      cards: USAGE_CARDS,
      sourceWorkDir: path.resolve(process.cwd(), options.sourceWorkDir),
      workDir,
    });
    console.log(JSON.stringify({
      translatorId: AGENT_TRANSLATOR_ID,
      cards: result.cardCount,
      sourceBatches: result.sourceBatchCount,
      officialBatches: result.officialBatchCount,
      workDir,
      receipt: result.importReceipt.receipt,
    }, null, 2));
    return;
  }
  if (!['google', 'google-http'].includes(options.mode)) throw new Error(`Unsupported mode: ${options.mode}`);
  const translator = createGoogleTranslateHttpAdapter({
    endpoint: options.endpoint,
    timeoutMs: options.timeoutMs,
  });
  const result = await generateEnglishUsageOverlay({
    cards: USAGE_CARDS,
    translator,
    workDir,
    outputPath,
    projectRoot,
    batchSize: options.batchSize,
    concurrency: options.concurrency,
    retries: options.retries,
    retryDelayMs: options.retryDelayMs,
    resume: options.resume,
    onProgress(progress) {
      console.error(`${progress.batchId}: ${progress.completed}/${progress.total} `
        + `(translated ${progress.translated}, reused ${progress.reused})`);
    },
  });
  console.log(JSON.stringify({
    cards: result.overlays.length,
    batches: result.batchReceipts.length,
    manifestHash: result.manifestHash,
    outputPath: result.outputPath,
    receipt: result.finalReceipt.receipt,
  }, null, 2));
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (direct) main(process.argv.slice(2)).catch(error => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

