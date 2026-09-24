import basics from './usage-cards/basics.mjs';
import linking from './usage-cards/linking.mjs';
import actions from './usage-cards/actions.mjs';
import actionsGenerated from './usage-cards/actions-generated.mjs';
import reviewedActionReplacements from './usage-cards/actions-naturalness-20260923.mjs';
import { FULL_NATURALNESS_REPLACEMENTS, FULL_NATURALNESS_DEFERRED_PAIRS } from './usage-cards/full-naturalness-overlay.mjs';
import { USER_DIRECTED_DEFERRED_PAIRS } from './usage-cards/user-directed-deferrals.mjs';
import { USER_DIRECTED_USAGE_CORRECTIONS } from './usage-cards/user-directed-corrections.mjs';
import { RETIRED_TEORU_NEGATIVE_FORMS } from './compound-forms.mjs';
import combinations from './usage-cards/combinations.mjs';
import integrationWordCards from './usage-cards/integration-generated.mjs';
import classBasics from './usage-cards/class-basics.mjs';
import classLinking1 from './usage-cards/class-linking-1.mjs';
import classLinking2 from './usage-cards/class-linking-2.mjs';
import classActions1 from './usage-cards/class-actions-1.mjs';
import classActions2 from './usage-cards/class-actions-2.mjs';
import classCombinations1 from './usage-cards/class-combinations-1.mjs';
import classCombinations2 from './usage-cards/class-combinations-2.mjs';
import basicWordCards from './usage-cards/basic-words/index.mjs';
import voiceWordCards from './usage-cards/voice-words/index.mjs';
import linkingWordCards from './usage-cards/linking-words/index.mjs';
import intentionWordCards from './usage-cards/intention-words/index.mjs';
import { REVIEWED_LEXICAL_SENSES, reviewedLexicalSense } from './lexical-usage.mjs';
import { ADJECTIVES } from './adjective-catalog.mjs';
import { assessFormUsage } from './form-eligibility.mjs';
import { NATURALNESS_DEFERRED_ACTION_PAIRS } from './action-pair-deferrals.mjs';
import { UNIFIED_COURSES } from './unified-curriculum.mjs';
import { deriveUnified } from './unified-knowledge.mjs';

/** @typedef {{text: string, reading?: string}} SentencePart */
/** @typedef {{id: string, senseId: string, meaning: string, form: string, scene: string,
 * before: SentencePart[], after: SentencePart[], translation: string, note?: string,
 * review: 'draft' | 'approved'}} UsageCard */
/** @typedef {UsageCard & {target: {text: string, reading: string}}} ResolvedUsageCard */

/** Separate teaching content: never populate this from eligibility `context`. */
const actionReplacements = new Map(reviewedActionReplacements.map(card => [card.id, card]));
const fullNaturalnessReplacements = new Map(FULL_NATURALNESS_REPLACEMENTS.map(card => [card.id, card]));
const userDirectedCorrections = new Map(USER_DIRECTED_USAGE_CORRECTIONS.map(row => [row.id, row.card]));
const originalCards = [...basics, ...linking, ...actions, ...actionsGenerated, ...combinations,
  ...classBasics, ...classLinking1, ...classLinking2, ...classActions1, ...classActions2, ...classCombinations1, ...classCombinations2,
  ...basicWordCards, ...voiceWordCards, ...linkingWordCards, ...intentionWordCards, ...integrationWordCards];
export const USAGE_CARDS = /** @type {UsageCard[]} */ (originalCards
  .filter(card => !RETIRED_TEORU_NEGATIVE_FORMS.has(card.form)
    && !NATURALNESS_DEFERRED_ACTION_PAIRS.has(`${card.senseId}/${card.form}`)
    && !FULL_NATURALNESS_DEFERRED_PAIRS.has(`${card.senseId}/${card.form}`)
    && !USER_DIRECTED_DEFERRED_PAIRS.has(`${card.senseId}/${card.form}`))
  .map(card => userDirectedCorrections.get(card.id) ?? fullNaturalnessReplacements.get(card.id) ?? actionReplacements.get(card.id) ?? card));
export const USAGE_CARD_GROUPS = [
  {id: 'basics', stages: ['basics', 'voice']},
  {id: 'linking', stages: ['linking', 'intentions']},
  {id: 'actions', stages: ['actions']},
  {id: 'combinations', stages: ['integration']},
];
const forms = new Set(UNIFIED_COURSES.flatMap(course => course.forms));
const senses = new Map(REVIEWED_LEXICAL_SENSES.map(sense => [sense.id, sense]));
const kanji = /[\u3400-\u9fff々〇]/u;
const length = text => Array.from(text).length;

const readingKey = text => text.normalize('NFKC').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
  .replace(/\s/g, '').replace(/,/g, '、').replace(/\./g, '。');
const unpunctuatedReading = text => readingKey(text).replace(/[、。!?「」『』()：:；;]/g, '');
const sentenceGroups = text => text.match(/[\u3400-\u9fff々〇]+|[^\u3400-\u9fff々〇]+/gu) ?? [];
const escapePattern = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Checks written kana/okurigana, not the dictionary reading or sense of kanji. */
function readingMatchesWrittenKana(part) {
  const pattern = sentenceGroups(part.text).map(group => kanji.test(group) ? '.+?' : escapePattern(unpunctuatedReading(group))).join('');
  return new RegExp(`^${pattern}$`, 'u').test(unpunctuatedReading(part.reading));
}

/** Align kana anchors so long authored clauses can wrap between ruby words. */
export function usageSentenceParts(part) {
  if (!part.reading || !kanji.test(part.text)) return [{text: part.text}];
  const groups = sentenceGroups(part.text);
  const match = key => {
    if (groups.some((group, index) => index > 0 && index < groups.length - 1
      && !kanji.test(group) && !key(group) && kanji.test(groups[index - 1]) && kanji.test(groups[index + 1]))) return null;
    const pattern = capture => groups.map(group => kanji.test(group) ? capture
      : escapePattern(key(group))).join('');
    const reading = key(part.reading);
    const shortest = reading.match(new RegExp(`^${pattern('(.+?)')}$`, 'u'));
    const longest = reading.match(new RegExp(`^${pattern('(.+)')}$`, 'u'));
    // Repeated kana may occur inside a word's reading too: 昨日の -> きのうの.
    // Accept a split only when its shortest and longest alignments agree.
    if (!shortest || !longest || shortest.some((value, index) => value !== longest[index])) return null;
    return shortest;
  };
  let matched = match(readingKey);
  // Legacy readings sometimes omit punctuation. Never guess the split between
  // adjacent kanji words once their only separator has been removed.
  if (!matched) matched = match(unpunctuatedReading);
  if (!matched) return [part];
  let index = 1;
  return groups.map(text => kanji.test(text) ? {text, reading: matched[index++]} : {text});
}

/** Editorial candidates only: kana is natural for many words and auxiliaries. */
export function usageCardWritingReview(cards) {
  return cards.flatMap(card => {
    const clauses = ['before', 'after'].map(key => Array.isArray(card?.[key])
      ? card[key].map(part => typeof part?.text === 'string' ? part.text : '').join('') : '');
    const text = clauses.join('＿＿＿＿');
    const allKana = !kanji.test(text) && (text.match(/[ぁ-ゖァ-ヺー]/gu)?.length ?? 0) >= 10;
    if (!allKana && !clauses.some(clause => /[ぁ-ゖ]{12,}/u.test(clause))) return [];
    return [{id: card.id, text, reason: allKana ? '较长句段全部使用假名，请核对是否省略了常用汉字及注音。' : '存在较长的连续平假名，请核对正文书写。'}];
  });
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

const stageRequirements = new Map();
/** Exact eligible sense/form pairs; classification has no conjugation form. */
export function usageCardStageRequirements(stageId) {
  if (!stageRequirements.has(stageId)) {
    const required = new Set();
    for (const course of UNIFIED_COURSES.filter(course => course.stageId === stageId)) {
      for (const form of course.forms) for (const sense of REVIEWED_LEXICAL_SENSES.filter(sense => sense.domain === course.domain)) {
        const usage = assessFormUsage(usageCardItem(sense.id), form);
        if (usage.status === 'allowed' || (usage.status === 'context-required' && usage.context)) required.add(`${sense.id}/${form}`);
      }
    }
    stageRequirements.set(stageId, [...required]);
  }
  return [...stageRequirements.get(stageId)];
}

export function basicUsageCardRequirements() {
  return usageCardStageRequirements('basics');
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

export function usageCardIssues(cards, {requireCoverage = false, requireClassCoverage = false, requireBasicCoverage = false, requireStageCoverage = []} = {}) {
  const issues = [], ids = new Set(), pairs = new Set(), covered = new Set(), coveredClasses = new Set(), coveredPairs = new Set();
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
    if (typeof card.translation === 'string' && /[ぁ-ゖァ-ヺ]/u.test(card.translation)) fail('translation must be Chinese, not copied Japanese');
    for (const key of ['before', 'after']) {
      if (!Array.isArray(card[key])) { fail(`${key} must be sentence parts`); continue; }
      for (const part of card[key]) {
        if (!part || typeof part !== 'object') { fail(`${key} has an invalid part`); continue; }
        if (typeof part.text !== 'string' || !part.text) { fail(`${key} has an empty part`); continue; }
        if (kanji.test(part.text) && (typeof part.reading !== 'string' || !part.reading.trim())) fail(`${key} needs a reading: ${part.text}`);
        if (part.reading !== undefined && (typeof part.reading !== 'string' || kanji.test(part.reading))) fail(`${key} reading must contain no kanji`);
        if (typeof part.reading === 'string' && !readingMatchesWrittenKana(part)) fail(`${key} reading does not match written kana: ${part.text}`);
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
      coveredPairs.add(`${card.senseId}/${card.form}`);
    }
  }
  if (requireCoverage) for (const form of forms) if (!covered.has(form)) issues.push(`Missing approved card for ${form}`);
  if (requireClassCoverage) for (const pair of usageCardClassRequirements()) if (!coveredClasses.has(pair)) issues.push(`Missing approved card for form/class ${pair}`);
  if (requireBasicCoverage) for (const pair of basicUsageCardRequirements()) if (!coveredPairs.has(pair)) issues.push(`Missing approved basic card for ${pair}`);
  for (const stage of requireStageCoverage) for (const pair of usageCardStageRequirements(stage)) if (!coveredPairs.has(pair)) issues.push(`Missing approved ${stage} card for ${pair}`);
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
