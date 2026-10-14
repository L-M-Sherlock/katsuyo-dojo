import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { CHALLENGE_MESSAGES } from '../app/lib/challenge-selection.mjs';
import { catalogKeys, messageAt, messageParameters } from '../app/lib/i18n/catalogs.mjs';
import { COURSE_CONTENT_BY_LOCALE, COURSE_STAGE_CONTENT_BY_LOCALE } from '../app/lib/i18n/content-courses.mjs';
import { FORM_LABELS_BY_LOCALE } from '../app/lib/i18n/content-forms.mjs';
import { KNOWLEDGE_FAMILY_LABELS } from '../app/lib/i18n/content-knowledge.mjs';
import { LEXICAL_MEANINGS_BY_LOCALE } from '../app/lib/i18n/content-lexicon.mjs';
import { FORM_SEMANTICS_BY_LOCALE } from '../app/lib/i18n/content-semantics.mjs';
import { DIAGNOSTIC_CATALOGS } from '../app/lib/i18n/diagnostics.mjs';
import { SITE_CATALOGS } from '../app/lib/i18n/site-catalogs.mjs';
import { usageCardLocaleIssues } from '../app/lib/i18n/usage-card-locales.mjs';
import { EN_USAGE_CARD_OVERLAYS } from '../app/lib/i18n/content/en/usage-cards.mjs';
import { REVIEWED_LEXICAL_SENSES } from '../app/lib/lexical-usage.mjs';
import { PRINCIPLES_COPY } from '../app/lib/principles-page.mjs';
import { STATISTICS_MESSAGES } from '../app/lib/statistics-page.mjs';
import { USAGE_CARD_MESSAGES } from '../app/lib/usage-card-view.mjs';
import { USAGE_CARDS, resolveUsageCard } from '../app/lib/usage-cards.mjs';
import { verifyEnglishUsageReleaseProof } from './verify-english-usage-release.mjs';

const CJK_TEXT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HAN_TEXT = /\p{Script=Han}/u;
const PLACEHOLDER = /\{[A-Za-z][A-Za-z0-9_]*\}/u;

/** The canonical digest binds a translation to the final displayed card. */
export function usageCardSourceHash(card) {
  return crypto.createHash('sha256').update(JSON.stringify(card)).digest('hex');
}

export function lexicalMeaningIssues(meanings, senses = REVIEWED_LEXICAL_SENSES) {
  const issues = [];
  if (!meanings || typeof meanings !== 'object' || Array.isArray(meanings)) {
    return ['English lexical meanings must be an object keyed by sense ID'];
  }
  const senseIds = new Set(senses.map(sense => sense.id));
  for (const sense of senses) {
    const value = meanings[sense.id];
    if (typeof value !== 'string' || !value.trim()) issues.push(`${sense.id}: missing English lexical meaning`);
    else {
      if (value !== value.trim()) issues.push(`${sense.id}: English lexical meaning has surrounding whitespace`);
      if (CJK_TEXT.test(value)) issues.push(`${sense.id}: English lexical meaning contains CJK text`);
      if (PLACEHOLDER.test(value)) issues.push(`${sense.id}: English lexical meaning contains an interpolation token`);
    }
  }
  for (const id of Object.keys(meanings)) if (!senseIds.has(id)) issues.push(`${id}: extra English lexical meaning`);
  return issues;
}

export function catalogParityIssues(catalogs = SITE_CATALOGS, sourceLocale = 'zh-CN', targetLocale = 'en') {
  const issues = [];
  const source = catalogs[sourceLocale];
  const target = catalogs[targetLocale];
  if (!source) return [`Missing source catalog: ${sourceLocale}`];
  if (!target) return [`Missing target catalog: ${targetLocale}`];
  const sourceKeys = catalogKeys(source);
  const targetKeys = catalogKeys(target);
  const sourceSet = new Set(sourceKeys);
  const targetSet = new Set(targetKeys);
  for (const key of sourceKeys) if (!targetSet.has(key)) issues.push(`${targetLocale}: missing catalog key ${key}`);
  for (const key of targetKeys) if (!sourceSet.has(key)) issues.push(`${targetLocale}: extra catalog key ${key}`);
  for (const key of sourceKeys) if (targetSet.has(key)) {
    const sourceParams = messageParameters(messageAt(source, key));
    const targetParams = messageParameters(messageAt(target, key));
    if (JSON.stringify(sourceParams) !== JSON.stringify(targetParams)) {
      issues.push(`${targetLocale}: interpolation parameters differ for ${key}`);
    }
  }
  return issues;
}

function recordParityIssues(label, localized) {
  const source = localized?.['zh-CN'];
  const target = localized?.en;
  if (!source || !target) return [`${label}: missing zh-CN or en content`];
  const sourceIds = Object.keys(source);
  const targetIds = Object.keys(target);
  const sourceSet = new Set(sourceIds);
  const targetSet = new Set(targetIds);
  const issues = [];
  for (const id of sourceIds) if (!targetSet.has(id)) issues.push(`${label}: missing English content for ${id}`);
  for (const id of targetIds) if (!sourceSet.has(id)) issues.push(`${label}: extra English content for ${id}`);
  for (const id of sourceIds) if (targetSet.has(id)) {
    const value = target[id];
    if (typeof value === 'string' && !value.trim()) issues.push(`${label}: empty English content for ${id}`);
    else if (typeof value === 'string' && HAN_TEXT.test(value)) issues.push(`${label}: English content contains Han text for ${id}`);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      const requiredFields = Object.keys(source[id] ?? {}).filter(key => typeof source[id]?.[key] === 'string');
      for (const key of requiredFields) {
        if (typeof value[key] !== 'string' || !value[key].trim()) issues.push(`${label}: missing English ${key} for ${id}`);
        else if (HAN_TEXT.test(value[key])) issues.push(`${label}: English ${key} contains Han text for ${id}`);
      }
    }
  }
  return issues;
}

/** Audit exact stable-ID coverage for all domain-content sidecars. */
export function contentParityIssues({
  courseStages = COURSE_STAGE_CONTENT_BY_LOCALE,
  courses = COURSE_CONTENT_BY_LOCALE,
  forms = FORM_LABELS_BY_LOCALE,
  knowledgeFamilies = KNOWLEDGE_FAMILY_LABELS,
  semantics = FORM_SEMANTICS_BY_LOCALE,
  lexicon = LEXICAL_MEANINGS_BY_LOCALE,
} = {}) {
  return [
    ...recordParityIssues('course stages', courseStages),
    ...recordParityIssues('courses', courses),
    ...recordParityIssues('forms', forms),
    ...recordParityIssues('knowledge families', knowledgeFamilies),
    ...recordParityIssues('semantics', semantics),
    ...recordParityIssues('lexicon', lexicon),
  ];
}

function valueShape(value, path = '') {
  if (Array.isArray(value)) return value.flatMap((entry, index) => valueShape(entry, `${path}[${index}]`));
  if (value && typeof value === 'object') return Object.entries(value)
    .flatMap(([key, entry]) => valueShape(entry, path ? `${path}.${key}` : key));
  return [`${path}:${typeof value}`];
}

/** Check locale content that intentionally uses arrays instead of catalogs. */
export function structuredContentParityIssues(label, localized) {
  const source = valueShape(localized?.['zh-CN']);
  const target = valueShape(localized?.en);
  const sourceSet = new Set(source);
  const targetSet = new Set(target);
  return [
    ...source.filter(path => !targetSet.has(path)).map(path => `${label}: missing English shape ${path}`),
    ...target.filter(path => !sourceSet.has(path)).map(path => `${label}: extra English shape ${path}`),
  ];
}

export function englishUsageCardIssues(overlays = EN_USAGE_CARD_OVERLAYS, cards = USAGE_CARDS) {
  const expectedHashes = new Map(cards.map(card => [card.id, usageCardSourceHash(card)]));
  const allowedJapaneseById = new Map(cards.map(card => {
    const resolved = resolveUsageCard(card);
    const sentenceParts = [...(card.before ?? []), ...(card.after ?? [])];
    return [card.id, [
      ...sentenceParts.flatMap(part => [part.text, part.reading]),
      resolved?.target?.text,
      resolved?.target?.reading,
    ].filter(Boolean).join('\n')];
  }));
  const issues = usageCardLocaleIssues(overlays, {
    canonicalCards: cards,
    expectedHashes,
    allowedJapaneseById,
    englishOnly: true,
  });
  const cardsById = new Map(cards.map(card => [card.id, card]));
  for (const row of Array.isArray(overlays) ? overlays : []) {
    const card = cardsById.get(row?.id);
    if (!card) continue;
    const resolved = resolveUsageCard(card);
    if (!resolved) {
      issues.push(`${card.id}: canonical card cannot resolve`);
      continue;
    }
    const leaked = [resolved.target.text, resolved.target.reading]
      .filter(value => typeof value === 'string' && value.length > 0)
      .find(answer => typeof row.scene === 'string' && row.scene.includes(answer));
    if (leaked) issues.push(`${card.id}: English scene leaks the Japanese target answer`);
    if (typeof row.translation === 'string' && row.translation.trim()
      && !/[.!?…][\]})"'’”]*$/u.test(row.translation.trim())) {
      issues.push(`${card.id}: English translation needs terminal punctuation`);
    }
  }
  return issues;
}

export function auditI18n({
  catalogs = Object.freeze({
    site: SITE_CATALOGS,
    diagnostics: DIAGNOSTIC_CATALOGS,
    challenge: CHALLENGE_MESSAGES,
    statistics: STATISTICS_MESSAGES,
    usageCards: USAGE_CARD_MESSAGES,
  }),
  cards = USAGE_CARDS,
  overlays = EN_USAGE_CARD_OVERLAYS,
  senses = REVIEWED_LEXICAL_SENSES,
  lexicalMeanings = LEXICAL_MEANINGS_BY_LOCALE.en,
} = {}) {
  const groups = {
    catalogs: Object.entries(catalogs).flatMap(([name, catalog]) => catalogParityIssues(catalog)
      .map(issue => `${name}: ${issue}`)),
    content: contentParityIssues(),
    principles: structuredContentParityIssues('principles', PRINCIPLES_COPY),
    usageCards: englishUsageCardIssues(overlays, cards),
    lexicon: lexicalMeaningIssues(lexicalMeanings, senses),
  };
  const issues = Object.entries(groups).flatMap(([group, rows]) => rows.map(message => `${group}: ${message}`));
  return Object.freeze({
    ok: issues.length === 0,
    counts: Object.freeze({
      canonicalUsageCards: cards.length,
      englishUsageCards: Array.isArray(overlays) ? overlays.length : 0,
      lexicalSenses: senses.length,
      englishLexicalMeanings: lexicalMeanings && typeof lexicalMeanings === 'object' && !Array.isArray(lexicalMeanings)
        ? Object.keys(lexicalMeanings).length : 0,
    }),
    groups: Object.freeze(Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, Object.freeze(rows)]))),
    issues: Object.freeze(issues),
  });
}

function printReport(report, json = false) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`i18n audit: ${report.ok ? 'PASS' : 'FAIL'}`);
  console.log(`Usage cards: ${report.counts.englishUsageCards}/${report.counts.canonicalUsageCards}`);
  console.log(`Lexical meanings: ${report.counts.englishLexicalMeanings}/${report.counts.lexicalSenses}`);
  if (!report.ok) {
    const shown = report.issues.slice(0, 100);
    for (const issue of shown) console.error(`- ${issue}`);
    if (shown.length < report.issues.length) console.error(`- … ${report.issues.length - shown.length} more issue(s)`);
  }
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) {
  const report = auditI18n();
  printReport(report, process.argv.includes('--json'));
  if (!report.ok) process.exitCode = 1;
  try {
    const proof = verifyEnglishUsageReleaseProof();
    if (!process.argv.includes('--json')) console.log(`English usage-card release proof: ${proof.cards.length} current cards`);
  } catch (error) {
    console.error(`English usage-card release proof: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

