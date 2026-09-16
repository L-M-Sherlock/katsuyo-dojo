import basics from './usage-cards/basics.mjs';
import linking from './usage-cards/linking.mjs';
import actions from './usage-cards/actions.mjs';
import combinations from './usage-cards/combinations.mjs';
import classBasics from './usage-cards/class-basics.mjs';
import classLinking1 from './usage-cards/class-linking-1.mjs';
import classLinking2 from './usage-cards/class-linking-2.mjs';
import classActions1 from './usage-cards/class-actions-1.mjs';
import classActions2 from './usage-cards/class-actions-2.mjs';
import classCombinations1 from './usage-cards/class-combinations-1.mjs';
import classCombinations2 from './usage-cards/class-combinations-2.mjs';
import { REVIEWED_LEXICAL_SENSES, reviewedLexicalSense } from './lexical-usage.mjs';
import { ADJECTIVES } from './adjective-catalog.mjs';
import { assessFormUsage } from './form-eligibility.mjs';
import { UNIFIED_COURSES } from './unified-curriculum.mjs';
import { deriveUnified } from './unified-knowledge.mjs';

/** @typedef {{text: string, reading?: string}} SentencePart */
/** @typedef {{id: string, senseId: string, meaning: string, form: string, scene: string,
 * before: SentencePart[], after: SentencePart[], translation: string, note?: string,
 * review: 'draft' | 'approved'}} UsageCard */
/** @typedef {UsageCard & {target: {text: string, reading: string}}} ResolvedUsageCard */

/** Separate teaching content: never populate this from eligibility `context`. */
export const USAGE_CARDS = /** @type {UsageCard[]} */ ([...basics, ...linking, ...actions, ...combinations,
  ...classBasics, ...classLinking1, ...classLinking2, ...classActions1, ...classActions2, ...classCombinations1, ...classCombinations2]);
export const USAGE_CARD_GROUPS = [
  {id: 'basics', stages: ['basics', 'voice']},
  {id: 'linking', stages: ['linking', 'intentions']},
  {id: 'actions', stages: ['actions']},
  {id: 'combinations', stages: ['integration']},
];
const forms = new Set(UNIFIED_COURSES.flatMap(course => course.forms));
const senses = new Map(REVIEWED_LEXICAL_SENSES.map(sense => [sense.id, sense]));
const kanji = /[\u3400-\u9fff々]/u;
const length = text => Array.from(text).length;

const readingKey = text => text.normalize('NFKC').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
  .replace(/[\s、。，．,.!！?？「」『』（）()：:；;]/g, '');

/** Align kana anchors so long authored clauses can wrap between ruby words. */
export function usageSentenceParts(part) {
  if (!part.reading || !kanji.test(part.text)) return [{text: part.text}];
  const groups = part.text.match(/[\u3400-\u9fff々]+|[^\u3400-\u9fff々]+/gu) ?? [];
  const pattern = groups.map(group => kanji.test(group) ? '(.+?)'
    : readingKey(group).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
  const matched = readingKey(part.reading).match(new RegExp(`^${pattern}$`, 'u'));
  if (!matched) return [part];
  let index = 1;
  return groups.map(text => kanji.test(text) ? {text, reading: matched[index++]} : {text});
}

export function usageCardItem(senseId) {
  const sense = senses.get(senseId);
  if (!sense) return null;
  return sense.domain === 'adjective'
    ? {...sense, ...ADJECTIVES.find(item => item.surface === sense.surface)} : sense;
}

let classRequirements;
/** Actual form/class pairs in the eligible catalog, not a fixed card count. */
export function usageCardClassRequirements() {
  if (!classRequirements) {
    const required = new Set();
    for (const form of forms) for (const sense of REVIEWED_LEXICAL_SENSES) {
      const usage = assessFormUsage(usageCardItem(sense.id), form);
      if (usage.status === 'allowed' || (usage.status === 'context-required' && usage.context)) required.add(`${form}/${sense.class}`);
    }
    classRequirements = [...required];
  }
  return [...classRequirements];
}

/** Exactly one slot: before + the generated WHOLE target form + after. */
export function resolveUsageCard(card) {
  const item = usageCardItem(card.senseId);
  if (!item || item.meaning !== card.meaning || !forms.has(card.form)) return null;
  const usage = assessFormUsage(item, card.form);
  if (usage.status === 'blocked' || (usage.status === 'context-required' && !usage.context)) return null;
  return {...card, target: {
    text: deriveUnified(item, card.form).answer,
    reading: deriveUnified({...item, surface: item.reading, lexicalSurface: item.surface}, card.form).answer,
  }};
}

export function usageCardIssues(cards, {requireCoverage = false, requireClassCoverage = false} = {}) {
  const issues = [], ids = new Set(), pairs = new Set(), covered = new Set(), coveredClasses = new Set();
  for (const card of cards) {
    if (!card || typeof card !== 'object' || Array.isArray(card)) { issues.push('Card must be an object'); continue; }
    const fail = message => issues.push(`${card.id ?? '(missing id)'}: ${message}`);
    for (const key of ['id', 'senseId', 'meaning', 'form', 'scene', 'translation']) {
      if (typeof card[key] !== 'string' || !card[key].trim()) fail(`${key} must be nonempty text`);
    }
    if (ids.has(card.id)) fail('duplicate id');
    ids.add(card.id);
    const pair = `${card.senseId}:${card.form}`;
    if (pairs.has(pair)) fail('duplicate sense/form pair');
    pairs.add(pair);
    if (!['draft', 'approved'].includes(card.review)) fail('unknown review status');
    if (typeof card.scene === 'string' && length(card.scene) > 32) fail('scene exceeds 32 characters');
    if (typeof card.scene === 'string' && /[ぁ-ゖァ-ヺ]/u.test(card.scene)) fail('scene must be Chinese, without Japanese answer fragments');
    if (card.note !== undefined && (typeof card.note !== 'string' || !card.note.trim() || length(card.note) > 60)) fail('note must be 1–60 characters');
    if (typeof card.translation === 'string' && length(card.translation) > 160) fail('translation exceeds 160 characters');
    for (const key of ['before', 'after']) {
      if (!Array.isArray(card[key])) { fail(`${key} must be sentence parts`); continue; }
      for (const part of card[key]) {
        if (!part || typeof part !== 'object') { fail(`${key} has an invalid part`); continue; }
        if (typeof part.text !== 'string' || !part.text) { fail(`${key} has an empty part`); continue; }
        if (kanji.test(part.text) && (typeof part.reading !== 'string' || !part.reading.trim())) fail(`${key} needs a reading: ${part.text}`);
        if (part.reading !== undefined && (typeof part.reading !== 'string' || kanji.test(part.reading))) fail(`${key} reading must contain no kanji`);
        if (/[{}<>]/.test(part.text)) fail(`${key} must be plain sentence text, with no extra placeholders or markup`);
      }
    }
    const resolved = resolveUsageCard(card);
    if (!resolved) { fail('unknown/changed sense, unsupported form, or ineligible pairing'); continue; }
    const visible = [card.before, card.after].filter(Array.isArray).flat().filter(Boolean).map(part => `${part.text ?? ''}${part.reading ?? ''}`).join('');
    if ([resolved.target.text, resolved.target.reading].some(answer => length(answer) >= 4 && visible.includes(answer))) fail('the full answer is repeated outside the target slot');
    if (card.review === 'approved') {
      covered.add(card.form);
      coveredClasses.add(`${card.form}/${usageCardItem(card.senseId).class}`);
    }
  }
  if (requireCoverage) for (const form of forms) if (!covered.has(form)) issues.push(`Missing approved card for ${form}`);
  if (requireClassCoverage) for (const pair of usageCardClassRequirements()) if (!coveredClasses.has(pair)) issues.push(`Missing approved card for form/class ${pair}`);
  return issues;
}

export function createUsageCardLookup(cards) {
  const byPair = new Map();
  for (const card of cards) {
    if (card.review !== 'approved' || usageCardIssues([card]).length) continue;
    const resolved = resolveUsageCard(card);
    if (resolved) byPair.set(`${card.senseId}:${card.form}`, resolved);
  }
  /** @returns {ResolvedUsageCard | null} */
  return (item, form) => {
    if (!form) return null;
    const sense = reviewedLexicalSense(item);
    return sense ? byPair.get(`${sense.id}:${form}`) ?? null : null;
  };
}

export const usageCardFor = createUsageCardLookup(USAGE_CARDS);
