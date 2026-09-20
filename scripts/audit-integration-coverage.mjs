#!/usr/bin/env node

/**
 * Audit the exact sense/form coverage of the integration (multi-step) card
 * set.  The audit deliberately treats work-directory candidate files as
 * untrusted input: only the card source passed to --cards (or the runtime
 * USAGE_CARDS export) is considered published/approved content.
 *
 * The report has four disjoint sets:
 *   required  - the frozen current requirement snapshot;
 *   approved  - approved cards in the formal card source;
 *   deferred  - exact pairs explicitly deferred after applicability review;
 *   open      - exact pairs still awaiting a decision.
 *
 * A successful audit requires approved ∪ deferred ∪ open to equal required,
 * with no intersections.  Existing cards are checked for byte-for-byte
 * preservation when --baseline is supplied.  Receipts and expected file
 * hashes are optional in report mode and become blocking with --strict (or
 * when their metadata is supplied).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const HEX = /^[a-f0-9]{64}$/u;
const fail = message => { throw new Error(message); };

export const pairKey = value => {
  if (typeof value === 'string') {
    const slash = value.lastIndexOf('/');
    return slash > 0 && slash < value.length - 1 ? value : null;
  }
  if (!value || typeof value !== 'object') return null;
  if (typeof value.pair === 'string') return pairKey(value.pair);
  if (typeof value.senseForm === 'string') return pairKey(value.senseForm);
  if (typeof value.senseId === 'string' && typeof value.form === 'string') return `${value.senseId}/${value.form}`;
  if (typeof value.sense === 'string' && typeof value.form === 'string') return `${value.sense}/${value.form}`;
  return null;
};

export const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const text = value => Buffer.isBuffer(value) ? value.toString('utf8') : String(value);

function parseJson(bytes, file) {
  try { return JSON.parse(text(bytes).replace(/^\uFEFF/u, '')); }
  catch (error) { fail(`Invalid JSON in ${file}: ${error.message}`); }
}

function absolute(root, value, fallback) {
  const candidate = value ?? fallback;
  if (!candidate) return null;
  return path.isAbsolute(candidate) ? candidate : path.resolve(root, candidate);
}

export function readData(file) {
  const bytes = fs.readFileSync(file);
  if (/\.m?js$/iu.test(file)) return {value: null, bytes};
  return {value: parseJson(bytes, file), bytes};
}

function listFrom(value, names = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const name of names) if (Array.isArray(value[name])) return value[name];
  // A few historical ledgers use an object keyed by pair.
  if (value.pairs && typeof value.pairs === 'object' && !Array.isArray(value.pairs)) {
    return Object.entries(value.pairs).map(([pair, row]) => typeof row === 'object' ? {...row, pair} : pair);
  }
  return [];
}

function normalizePairs(value, label) {
  const rows = listFrom(value, ['requirements', 'required', 'current', 'items', 'deferred', 'open', 'unresolved', 'pending']);
  const result = [], duplicates = [], invalid = [];
  const seen = new Set();
  for (const row of rows) {
    const pair = pairKey(row);
    if (!pair) { invalid.push(row); continue; }
    if (seen.has(pair)) { duplicates.push(pair); continue; }
    seen.add(pair);
    result.push({pair, row});
  }
  return {label, rows: result, set: seen, duplicates, invalid};
}

async function loadModuleCards(file) {
  const module = await import(pathToFileURL(file).href);
  const candidates = [module.USAGE_CARDS, module.default, module.cards, module.integrationCards];
  const cards = candidates.find(Array.isArray);
  if (!cards) fail(`No card array export found in ${file}`);
  return cards;
}

export async function loadCards(file) {
  const bytes = fs.readFileSync(file);
  if (/\.m?js$/iu.test(file)) return {cards: await loadModuleCards(file), bytes, path: file};
  const value = parseJson(bytes, file);
  const cards = listFrom(value, ['cards', 'approved', 'items', 'usageCards']);
  if (!Array.isArray(cards)) fail(`No card array found in ${file}`);
  return {cards, bytes, path: file};
}

function cardReading(card, resolver) {
  if (typeof card?.reading === 'string') return card.reading;
  if (typeof card?.answerReading === 'string') return card.answerReading;
  if (typeof resolver !== 'function') return null;
  try {
    const resolved = resolver(card);
    return typeof resolved?.target?.reading === 'string' ? resolved.target.reading : null;
  } catch { return null; }
}

function expectedReading(row) {
  if (!row || typeof row !== 'object') return null;
  return row.answerReading ?? row.reading ?? row.targetReading ?? null;
}

function extractReceiptMap(value) {
  const map = new Map(), files = new Map(), cards = new Map();
  const visit = (row, keyHint = null) => {
    if (typeof row === 'string' && keyHint) {
      if (HEX.test(row)) {
        if (keyHint.includes('/') || keyHint.startsWith('usage:')) map.set(keyHint, row);
        if (keyHint.endsWith('.json') || keyHint.endsWith('.mjs')) files.set(keyHint, row);
      }
      return;
    }
    if (!row || typeof row !== 'object') return;
    if (Array.isArray(row)) { for (const item of row) visit(item); return; }
    const key = typeof row.id === 'string' ? row.id : keyHint;
    const pair = pairKey(row);
    const receipt = row.receipt ?? row.cardReceipt ?? row.authorReceipt;
    if (key && typeof receipt === 'string') map.set(key, receipt);
    if (pair && typeof receipt === 'string') map.set(pair, receipt);
    const fileHash = row.fileHash ?? row.formalFileHash ?? row.sourceHash;
    if (typeof fileHash === 'string') {
      if (typeof row.path === 'string') files.set(row.path, fileHash);
      if (typeof row.file === 'string') files.set(row.file, fileHash);
    }
    if (key && (row.cardHash || row.hash)) cards.set(key, row.cardHash ?? row.hash);
    for (const [name, child] of Object.entries(row)) {
      if (['receipt', 'cardReceipt', 'authorReceipt', 'fileHash', 'formalFileHash', 'sourceHash', 'cardHash', 'hash'].includes(name)) continue;
      if (child && typeof child === 'object') visit(child, (name.includes('/') || name.startsWith('usage:') || name.endsWith('.json') || name.endsWith('.mjs')) ? name : null);
    }
  };
  visit(value);
  return {map, files, cards};
}

function mapCards(cards) {
  const ids = new Map(), pairs = new Map(), duplicateIds = [], duplicatePairs = [];
  for (const card of cards) {
    if (!card || typeof card !== 'object') continue;
    const id = typeof card.id === 'string' ? card.id : null;
    const pair = pairKey(card);
    if (id) { if (ids.has(id)) duplicateIds.push(id); ids.set(id, card); }
    if (pair) { if (pairs.has(pair)) duplicatePairs.push(pair); pairs.set(pair, card); }
  }
  return {ids, pairs, duplicateIds, duplicatePairs};
}

function setArray(set) { return [...set].sort((a, b) => a.localeCompare(b)); }
function intersection(a, b) { return new Set([...a].filter(item => b.has(item))); }
function difference(a, b) { return new Set([...a].filter(item => !b.has(item))); }

/**
 * @param {object} options
 * @param {string} options.project project root
 * @param {string} [options.requirements] frozen requirement JSON
 * @param {string} [options.cards] formal JSON/module card source
 * @param {string} [options.baseline] baseline JSON/module card source
 * @param {string} [options.deferred] exact deferred pair ledger
 * @param {string} [options.open] exact open/unresolved pair ledger
 * @param {string} [options.receipts] receipt and expected-hash ledger
 * @param {string} [options.runtime] runtime module used for resolving target readings
 * @param {boolean} [options.strict] missing receipt/hash/reading metadata is blocking
 */
export async function auditIntegrationCoverage(options = {}) {
  const root = path.resolve(options.project ?? process.cwd());
  const strict = options.strict === true || options.strict === 'true';
  const frozenDefault = fs.existsSync(path.resolve(root, 'docs/integration-stage-requirements.v1.json'))
    ? 'docs/integration-stage-requirements.v1.json' : 'work/integration-20260920/stage-requirements.json';
  const requirementFile = absolute(root, options.requirements, frozenDefault);
  if (!requirementFile || !fs.existsSync(requirementFile)) fail(`Requirements file not found: ${requirementFile}`);
  const requirementData = readData(requirementFile).value;
  const required = normalizePairs(requirementData, 'required');
  const errors = [];
  if (required.invalid.length) errors.push(`Invalid required pair rows: ${required.invalid.length}`);
  if (required.duplicates.length) errors.push(`Duplicate required pairs: ${required.duplicates.join(', ')}`);

  const runtimeFile = absolute(root, options.runtime, 'app/lib/usage-cards.mjs');
  let runtime = null;
  try { runtime = await import(pathToFileURL(runtimeFile).href); } catch (error) { errors.push(`Runtime import failed: ${error.message}`); }
  const resolver = runtime?.resolveUsageCard;
  const cardFile = absolute(root, options.cards, 'app/lib/usage-cards.mjs');
  const cardSource = options.cards ? await loadCards(cardFile) : {cards: runtime?.USAGE_CARDS ?? [], bytes: fs.readFileSync(cardFile), path: cardFile};
  if (!Array.isArray(cardSource.cards)) errors.push('Card source does not export an array');
  const cards = Array.isArray(cardSource.cards) ? cardSource.cards : [];
  const cardMap = mapCards(cards);
  if (cardMap.duplicateIds.length) errors.push(`Duplicate card IDs: ${cardMap.duplicateIds.join(', ')}`);
  if (cardMap.duplicatePairs.length) errors.push(`Duplicate card pairs: ${cardMap.duplicatePairs.join(', ')}`);
  const missingCardIds = cards.filter(card => !card || typeof card.id !== 'string' || !card.id.trim()).length;
  if (missingCardIds) errors.push(`Cards missing IDs: ${missingCardIds}`);
  const approvedCards = cards.filter(card => card?.review === 'approved');
  const structuralIssues = typeof runtime?.usageCardIssues === 'function'
    ? runtime.usageCardIssues(approvedCards).map(issue => String(issue)) : [];
  if (structuralIssues.length) errors.push(`Approved card structural issues: ${structuralIssues.join('; ')}`);
  const approved = new Set(approvedCards.map(pairKey).filter(pair => required.set.has(pair)));
  const nonApprovedRequired = new Set(cards.map(pairKey).filter(pair => required.set.has(pair) && !approved.has(pair)));
  if (nonApprovedRequired.size) errors.push(`Required pairs are present only as non-approved cards: ${setArray(nonApprovedRequired).join(', ')}`);
  const unexpectedCards = new Set(cards.map(pairKey).filter(pair => pair && !required.set.has(pair) && cardMap.pairs.get(pair)?.review === 'approved'));

  const deferredData = options.deferred && fs.existsSync(absolute(root, options.deferred))
    ? readData(absolute(root, options.deferred)).value : requirementData?.deferred ?? [];
  const openData = options.open && fs.existsSync(absolute(root, options.open))
    ? readData(absolute(root, options.open)).value : requirementData?.open ?? [];
  const deferred = normalizePairs(deferredData, 'deferred');
  const open = normalizePairs(openData, 'open');
  for (const set of [deferred, open]) {
    if (set.invalid.length) errors.push(`Invalid ${set.label} pair rows: ${set.invalid.length}`);
    if (set.duplicates.length) errors.push(`Duplicate ${set.label} pairs: ${set.duplicates.join(', ')}`);
  }
  const overlap = {
    approvedDeferred: intersection(approved, deferred.set),
    approvedOpen: intersection(approved, open.set),
    deferredOpen: intersection(deferred.set, open.set),
  };
  for (const [name, set] of Object.entries(overlap)) if (set.size) errors.push(`${name} overlap: ${setArray(set).join(', ')}`);
  const union = new Set([...approved, ...deferred.set, ...open.set]);
  const missing = difference(required.set, union), extra = difference(union, required.set);
  if (missing.size) errors.push(`Missing required pairs: ${setArray(missing).join(', ')}`);
  if (extra.size) errors.push(`Unregistered deferred/open/approved pairs: ${setArray(extra).join(', ')}`);

  const baseline = options.baseline && fs.existsSync(absolute(root, options.baseline))
    ? await loadCards(absolute(root, options.baseline)) : null;
  const baselineChanged = [], baselineMissing = [];
  if (baseline) {
    const currentById = new Map(cards.map(card => [card?.id, card]));
    for (const old of baseline.cards) {
      const current = currentById.get(old?.id);
      if (!current) baselineMissing.push(old?.id ?? '(missing id)');
      else if (JSON.stringify(current) !== JSON.stringify(old)) baselineChanged.push(old.id);
    }
    // Incremental candidate files intentionally contain only new cards. A
    // formal/runtime source must preserve every baseline ID; --strict makes
    // that requirement blocking while report mode still exposes the list.
    if (baselineMissing.length && (strict || !options.cards)) errors.push(`Baseline cards missing from formal source: ${baselineMissing.join(', ')}`);
    if (baselineChanged.length) errors.push(`Baseline cards changed: ${baselineChanged.join(', ')}`);
  }

  const receiptData = options.receipts && fs.existsSync(absolute(root, options.receipts))
    ? readData(absolute(root, options.receipts)).value : null;
  const receiptMaps = extractReceiptMap(receiptData);
  const receiptMissing = [], receiptInvalid = [], receiptHashMismatch = [], readingMissing = [], readingMismatch = [], cardIdentity = [];
  for (const row of required.rows) {
    if (!approved.has(row.pair)) continue;
    const card = cardMap.pairs.get(row.pair);
    if (!card) { cardIdentity.push({pair: row.pair, reason: 'approved pair has no card'}); continue; }
    if (row.row && typeof row.row === 'object'
        && ((row.row.senseId && card.senseId !== row.row.senseId) || (row.row.form && card.form !== row.row.form))) {
      cardIdentity.push({pair: row.pair, id: card.id});
    }
    const expected = expectedReading(row.row), actual = cardReading(card, resolver);
    if (expected && !actual) readingMissing.push(card.id ?? row.pair);
    else if (expected && actual && expected !== actual) readingMismatch.push({id: card.id ?? row.pair, expected, actual});
    const receipt = card.receipt ?? receiptMaps.map.get(card.id) ?? receiptMaps.map.get(row.pair);
    if (!receipt) receiptMissing.push(card.id ?? row.pair);
    else if (!HEX.test(receipt)) receiptInvalid.push(card.id ?? row.pair);
    const expectedCardHash = receiptMaps.cards.get(card.id) ?? receiptMaps.cards.get(row.pair);
    if (expectedCardHash && digest(Buffer.from(JSON.stringify(card))) !== expectedCardHash) receiptHashMismatch.push(card.id ?? row.pair);
  }
  if (cardIdentity.length) errors.push(`Approved card identity mismatch: ${cardIdentity.map(row => row.pair).join(', ')}`);
  if (readingMismatch.length) errors.push(`Reading mismatch: ${readingMismatch.map(row => row.id).join(', ')}`);
  if (strict && readingMissing.length) errors.push(`Missing approved readings: ${readingMissing.join(', ')}`);
  if (strict && receiptMissing.length) errors.push(`Missing card receipts: ${receiptMissing.join(', ')}`);
  if (receiptInvalid.length) errors.push(`Invalid card receipts: ${receiptInvalid.join(', ')}`);
  if (receiptHashMismatch.length) errors.push(`Card snapshot hash mismatch: ${receiptHashMismatch.join(', ')}`);

  const fileHash = digest(cardSource.bytes), expectedFileHash = options.fileHash ?? receiptMaps.files.get(cardSource.path) ?? receiptMaps.files.get(path.relative(root, cardSource.path));
  const fileHashMatches = expectedFileHash ? fileHash === expectedFileHash : null;
  if (expectedFileHash && !fileHashMatches) errors.push(`Formal card file hash mismatch: expected ${expectedFileHash}, got ${fileHash}`);
  if (strict && !expectedFileHash) errors.push('Missing expected formal card file hash');

  const report = {
    schemaVersion: 1,
    scope: 'integration',
    requirements: {path: requirementFile, fileHash: digest(fs.readFileSync(requirementFile)), count: required.set.size, pairs: setArray(required.set)},
    cards: {path: cardSource.path, fileHash, count: cards.length, approvedCount: approvedCards.length, approvedPairs: setArray(approved), unexpectedApprovedPairs: setArray(unexpectedCards)},
    deferred: {count: deferred.set.size, pairs: setArray(deferred.set)},
    open: {count: open.set.size, pairs: setArray(open.set)},
    sets: {union: setArray(union), missing: setArray(missing), extra: setArray(extra), overlap: Object.fromEntries(Object.entries(overlap).map(([name, set]) => [name, setArray(set)]))},
    baseline: baseline ? {path: absolute(root, options.baseline), count: baseline.cards.length, missing: baselineMissing, changed: baselineChanged} : null,
    integrity: {cardIdentity, structuralIssues, readingMissing, readingMismatch, receiptMissing, receiptInvalid, receiptHashMismatch, expectedFileHash: expectedFileHash ?? null, fileHashMatches},
    valid: errors.length === 0,
    errors,
  };
  return report;
}

function optionsFromArgv(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) fail(`Unexpected argument: ${token}`);
    const key = token.slice(2).replace(/-([a-z])/gu, (_, c) => c.toUpperCase());
    if (key === 'strict') { options.strict = true; continue; }
    const value = argv[++i];
    if (!value || value.startsWith('--')) fail(`Missing value for --${key}`);
    options[key] = value;
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = optionsFromArgv(process.argv.slice(2));
    if (options.project && !path.isAbsolute(options.project)) fail('--project must be absolute');
    const report = await auditIntegrationCoverage(options);
    if (options.output) {
      const output = absolute(options.project ?? process.cwd(), options.output);
      fs.mkdirSync(path.dirname(output), {recursive: true});
      fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.valid) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
