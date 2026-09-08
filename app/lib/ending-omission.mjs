import { acceptedConjugations } from './conjugation.mjs';
import { acceptedAdjectiveConjugations } from './adjective-conjugation.mjs';

// These forms end in one identifiable primitive suffix. Continuations and
// contractions have additional competing explanations and are excluded here.
const VERB_SUFFIX = Object.fromEntries([
  'negative', 'past', 'te', 'potential', 'volitional', 'ba', 'imperative',
  'passive', 'causative', 'causativePassive',
].map(form => [form, `suffix.${form}`]));
const POLITE_SUFFIX = {
  masuPast: 'compound.polite-past', masuNegative: 'compound.polite-negative',
  masuNegativePast: 'compound.polite-negative-past',
};
const I_SUFFIX = { adjectivePast: 'adj.suffix.i-past', adjectiveBa: 'adj.suffix.i-ba' };
const NA_SUFFIX = {
  adjectiveAttributive: 'adj.suffix.na-attributive', adjectivePredicative: 'adj.suffix.na-predicative',
  adjectiveNaNegative: 'adj.suffix.na-negative', adjectiveNaPast: 'adj.suffix.na-past',
  adjectiveNaTe: 'adj.suffix.na-te', adjectiveBa: 'adj.suffix.na-conditional', adjectiveAdverb: 'adj.suffix.na-adverb',
};

/**
 * A conservative fallback after explicit error candidates: precisely one final
 * character is absent, while the full transformed stem is still observable.
 * This is a suffix failure, never a claim that the answer was a lexical typo.
 */
export function diagnoseEndingOmission(item, form, answer, normalize = value => value, requiredKcIds = []) {
  if (typeof answer !== 'string' || !form) return null;
  const kcId = item.domain === 'verb' ? (form === 'zuni' || form === 'masenka' ? `construction.${form}` : form === 'prohibitive' ? 'suffix.prohibitive' : VERB_SUFFIX[form] ?? POLITE_SUFFIX[form])
    : item.domain === 'adjective' ? (item.class === 'i' ? I_SUFFIX : NA_SUFFIX)[form] : null;
  if (!kcId || !requiredKcIds.includes(kcId)) return null;
  // A godan imperative loses the e-row change itself when its last character
  // is removed. Irregular commands also need their own stem diagnosis.
  if (form === 'imperative' && item.class !== 'ichidan') return null;
  const actual = normalize(answer);
  if (!actual) return null;
  // A na adjective has no stem transformation: reproducing its full word
  // can identify the one missing suffix, but cannot confirm its word class.
  const unchangedNa = item.domain === 'adjective' && item.class === 'na';
  if (!unchangedNa && form !== 'prohibitive' && [item.surface, item.reading].some(word => normalize(word) === actual)) return null;
  const words = [item, { ...item, surface: item.reading }];
  const targets = words.flatMap(word => item.domain === 'verb'
    ? acceptedConjugations(word.surface, word.class, form)
    : acceptedAdjectiveConjugations(word, form)).map(normalize);
  if (targets.includes(actual) || !targets.some(target => Array.from(target).slice(0, -1).join('') === actual)) return null;
  const confirmedKcIds = requiredKcIds.filter(id => item.domain === 'verb'
    ? id.startsWith('stem.') || (id.startsWith('onbin.') && id !== 'onbin.voicing')
    : item.class === 'i' && item.iiFamily && id === 'adj.exception.ii-yo');
  return { kcId, confirmedKcIds: [...new Set(confirmedKcIds)],
    message: '词干已保留，但指定词尾少写了最后一个字符。仅将未完成的接续记错。' };
}
