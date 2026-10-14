import { normalizeLocale } from './locales.mjs';

const HASH = /^[a-f0-9]{64}$/u;
// Curly quotation marks are also standard English typography. Keep them out of
// this check and reject only punctuation that is specific to CJK prose.
const CJK_PUNCTUATION = /[，。；：！？【】（）《》]/u;
const REQUIRED_KEYS = Object.freeze(['id', 'sourceHash', 'scene', 'translation']);
const ALLOWED_KEYS = new Set([...REQUIRED_KEYS, 'note']);

export class UsageCardLocaleError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'UsageCardLocaleError';
    this.issues = Object.freeze([...issues]);
  }
}

function textIssue(row, key, index, {englishOnly, allowedJapanese = ''}) {
  const value = row?.[key];
  if (typeof value !== 'string' || !value.trim()) return `overlay[${index}]: ${key} must be nonempty text`;
  if (value !== value.trim()) return `${row.id}: ${key} must not start or end with whitespace`;
  if (englishOnly) {
    const hanSegments = value.match(/\p{Script=Han}+/gu) ?? [];
    if (hanSegments.some(segment => !allowedJapanese.includes(segment))) {
      return `${row.id}: ${key} contains unrecognized Han text`;
    }
    if (CJK_PUNCTUATION.test(value)) return `${row.id}: ${key} contains CJK punctuation`;
  }
  return null;
}

/**
 * Validate a usage-card locale overlay. Pass canonicalCards for exact ID
 * coverage. Pass expectedHashes for source-drift validation in Node audits.
 */
export function usageCardLocaleIssues(overlays, {
  canonicalCards,
  expectedHashes,
  allowedJapaneseById,
  englishOnly = false,
} = {}) {
  const issues = [];
  if (!Array.isArray(overlays)) return ['Usage-card locale overlay must be an array'];

  const rowsById = new Map();
  for (const [index, row] of overlays.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      issues.push(`overlay[${index}]: row must be an object`);
      continue;
    }
    const unexpected = Object.keys(row).filter(key => !ALLOWED_KEYS.has(key));
    if (unexpected.length) issues.push(`${row.id ?? `overlay[${index}]`}: unexpected fields: ${unexpected.join(', ')}`);
    for (const key of REQUIRED_KEYS) {
      const issue = textIssue(row, key, index, {
        englishOnly: englishOnly && ['scene', 'translation'].includes(key),
        allowedJapanese: allowedJapaneseById?.get(row.id) ?? '',
      });
      if (issue) issues.push(issue);
    }
    if (row.note !== undefined) {
      const issue = textIssue(row, 'note', index, {
        englishOnly,
        allowedJapanese: allowedJapaneseById?.get(row.id) ?? '',
      });
      if (issue) issues.push(issue);
    }
    if (typeof row.sourceHash === 'string' && !HASH.test(row.sourceHash)) {
      issues.push(`${row.id ?? `overlay[${index}]`}: sourceHash must be a lowercase SHA-256 digest`);
    }
    if (typeof row.id !== 'string' || !row.id.trim()) continue;
    if (rowsById.has(row.id)) issues.push(`${row.id}: duplicate overlay id`);
    else rowsById.set(row.id, row);
  }

  if (canonicalCards !== undefined) {
    if (!Array.isArray(canonicalCards)) issues.push('Canonical usage cards must be an array');
    else {
      const cardsById = new Map();
      for (const [index, card] of canonicalCards.entries()) {
        if (!card || typeof card.id !== 'string' || !card.id) {
          issues.push(`canonicalCards[${index}]: card needs a nonempty id`);
          continue;
        }
        if (cardsById.has(card.id)) issues.push(`${card.id}: duplicate canonical card id`);
        else cardsById.set(card.id, card);
      }
      for (const id of cardsById.keys()) if (!rowsById.has(id)) issues.push(`${id}: missing locale overlay`);
      for (const id of rowsById.keys()) if (!cardsById.has(id)) issues.push(`${id}: extra locale overlay`);
    }
  }

  if (expectedHashes !== undefined) {
    if (!(expectedHashes instanceof Map)) issues.push('Expected usage-card hashes must be a Map');
    else for (const [id, row] of rowsById) {
      const expected = expectedHashes.get(id);
      if (expected !== undefined && row.sourceHash !== expected) issues.push(`${id}: stale sourceHash`);
    }
  }
  return issues;
}

/** Freeze a locale overlay without changing its rows. */
export function defineUsageCardLocale(overlays) {
  const issues = usageCardLocaleIssues(overlays);
  if (issues.length) throw new UsageCardLocaleError('Invalid usage-card locale overlay.', issues);
  return Object.freeze(overlays.map(row => Object.freeze({...row})));
}

/**
 * Merge localized teaching text into canonical cards by stable card ID.
 * Canonical cards and overlay rows remain unchanged. English never falls back
 * to the Chinese scene, translation, or note.
 */
export function applyUsageCardLocale(canonicalCards, locale, overlays) {
  const normalized = normalizeLocale(locale);
  if (!normalized) throw new UsageCardLocaleError(`Unsupported usage-card locale: ${String(locale)}`);
  if (normalized === 'zh-CN') return canonicalCards;
  if (normalized !== 'en') throw new UsageCardLocaleError(`Unsupported usage-card locale: ${normalized}`);

  const issues = usageCardLocaleIssues(overlays, {canonicalCards});
  if (issues.length) throw new UsageCardLocaleError('English usage-card coverage is incomplete or invalid.', issues);
  const localizedById = new Map(overlays.map(row => [row.id, row]));
  return Object.freeze(canonicalCards.map(card => {
    const localized = localizedById.get(card.id);
    const stableCard = Object.fromEntries(Object.entries(card)
      .filter(([key]) => !['scene', 'translation', 'note'].includes(key)));
    return Object.freeze({
      ...stableCard,
      scene: localized.scene,
      translation: localized.translation,
      ...(localized.note === undefined ? {} : {note: localized.note}),
    });
  }));
}

/** Load large locale content only when its language is active. */
export async function loadUsageCardLocale(locale) {
  const normalized = normalizeLocale(locale);
  if (!normalized) throw new UsageCardLocaleError(`Unsupported usage-card locale: ${String(locale)}`);
  if (normalized === 'zh-CN') return null;
  if (normalized === 'en') {
    const module = await import('./content/en/usage-cards.mjs');
    return module.EN_USAGE_CARD_OVERLAYS;
  }
  throw new UsageCardLocaleError(`Unsupported usage-card locale: ${normalized}`);
}

/** Load and apply the active locale in one operation. */
export async function localizeUsageCards(canonicalCards, locale) {
  const overlays = await loadUsageCardLocale(locale);
  return overlays === null ? canonicalCards : applyUsageCardLocale(canonicalCards, locale, overlays);
}

