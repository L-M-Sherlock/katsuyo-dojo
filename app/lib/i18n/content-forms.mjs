import { COMPOUND_FORM_SPECS } from '../compound-forms.mjs';
import { FORM_LABELS } from '../form-labels.mjs';
import { normalizeLocale } from './locales.mjs';

const EN_BASE = {
  negative: 'plain negative', past: 'plain past', te: 'て-form', masu: 'ます-form',
  passive: 'passive', potential: 'potential', imperative: 'imperative', volitional: 'volitional', ba: 'ば conditional',
  nasai: 'なさい command', prohibitive: 'prohibitive', causative: 'causative', causativePassive: 'causative-passive',
  causativePassiveContracted: 'contracted causative-passive', nakute: 'なくて-form', naide: 'ないで-form',
  zu: 'ず-form', zuni: 'ずに-form', teshimau: 'てしまう', chau: 'ちゃう・じゃう', teoku: 'ておく', toku: 'とく・どく',
  negativePast: 'plain negative past', masuPast: 'polite past', masuNegative: 'polite negative',
  masuNegativePast: 'polite negative past', passivePast: 'passive — past', passiveNegative: 'passive — negative',
  passiveNegativePast: 'passive — negative past', potentialPast: 'potential — past', potentialNegative: 'potential — negative',
  potentialNegativePast: 'potential — negative past', causativePast: 'causative — past', causativeNegative: 'causative — negative',
  causativeNegativePast: 'causative — negative past', causativePassivePast: 'causative-passive — past',
  causativePassiveNegative: 'causative-passive — negative', causativePassiveNegativePast: 'causative-passive — negative past',
  passiveDesireNegativePast: 'passive + desire — negative past', teageru: 'てあげる', temorau: 'てもらう', tekureru: 'てくれる',
  tekudasai: 'てください', naideKudasai: 'ないでください', teiru: 'ている', teru: 'てる', tearu: 'てある', teoru: 'ておる',
  toru: 'とる・どる', tai: 'たい', tehoshii: 'てほしい', tara: 'たら conditional', temo: 'ても・でも', nagara: 'ながら',
  tsutsu: 'つつ', nakerebaNaranai: 'なければならない', nakutewaIkenai: 'なくてはいけない', naitoIkenai: 'ないといけない',
  tari: 'たり-form', tewa: 'ては・では', temoIi: 'てもいい', nakutemoIi: 'なくてもいい', masenka: 'ませんか',
  youtosuru: 'ようとする', temiru: 'てみる', teiku: 'ていく', teku: 'てく', tekuru: 'てくる', tatte: 'たって・だって',
  sugiru: 'すぎる', tagaru: 'たがる', adjectiveNegative: 'adjective negative', adjectivePast: 'adjective past',
  adjectiveNegativePast: 'adjective negative past', adjectiveTe: 'adjective て-form', adjectiveAttributive: 'attributive (〜な)',
  adjectivePredicative: 'plain predicate (〜だ)', adjectiveNaNegative: 'な-adjective negative', adjectiveNaPast: 'な-adjective past',
  adjectiveNaNegativePast: 'な-adjective negative past', adjectiveNaTe: 'な-adjective て-form (〜で)', adjectiveBa: 'adjective conditional',
  adjectiveAdverb: 'adverbial adjective form',
};

const EN_CHAIN = {
  temiruDesire: 'trying + desire', temiruDesirePast: 'trying + desire — past', temiruDesireNegative: 'trying + desire — negative',
  temiruDesireNegativePast: 'trying + desire — negative past', passiveProgressive: 'passive + progressive or resultant state',
  passiveProgressivePast: 'passive + progressive or resultant state — past',
  passiveProgressiveNegative: 'passive + progressive or resultant state — negative',
  passiveProgressiveNegativePast: 'passive + progressive or resultant state — negative past',
  causativeReceive: 'causative + permission received', causativeReceivePast: 'causative + permission received — past',
  temiruRequest: 'trying + request', temiruTara: 'trying + たら condition', teokuRequest: 'advance preparation + request',
  teokuBa: 'advance preparation + ば condition', teokuTara: 'advance preparation + たら condition',
  causativeRequest: 'causative + permission request', temorauDesire: 'receiving help + desire',
  temorauDesirePast: 'receiving help + desire — past', temorauDesireNegative: 'receiving help + desire — negative',
  temorauDesireNegativePast: 'receiving help + desire — negative past', temorauPotential: 'receiving help + potential',
  temorauPotentialPast: 'receiving help + potential — past', temorauPotentialNegative: 'receiving help + potential — negative',
  temorauPotentialNegativePast: 'receiving help + potential — negative past', temorauPoliteRequest: 'receiving help + polite request',
  potentialPolite: 'potential + polite form', potentialPolitePast: 'potential + polite past',
  potentialPoliteNegative: 'potential + polite negative', potentialPoliteNegativePast: 'potential + polite negative past',
  desireBa: 'desire + ば condition', sugiruNegativeRequest: 'excess + negative request',
  passiveCompletion: 'passive + unwanted result', passiveCompletionPast: 'passive + unwanted result — past',
  causativeReceiveDesire: 'causative + permission received + desire', causativeReceivePoliteRequest: 'causative + permission + polite request',
  causativeReceivePotential: 'causative + permission received + potential',
  causativeReceivePotentialPast: 'causative + permission received + potential — past',
  causativeReceivePotentialNegative: 'causative + permission received + potential — negative',
  causativeReceivePotentialNegativePast: 'causative + permission received + potential — negative past',
  potentialBa: 'potential + ば condition', potentialTara: 'potential + たら condition',
};

const endingLabel = Object.freeze({ past: 'past', negative: 'negative', negativePast: 'negative past' });
for (const [form, spec] of Object.entries(COMPOUND_FORM_SPECS)) {
  EN_BASE[form] = `${EN_BASE[spec.form]} — ${endingLabel[spec.ending]}`;
}

const EN_FORM_LABELS = Object.freeze({ ...EN_BASE, ...EN_CHAIN });
export const FORM_LABELS_BY_LOCALE = Object.freeze({ 'zh-CN': Object.freeze({ ...FORM_LABELS }), en: EN_FORM_LABELS });

export function formLabelsForLocale(locale = 'zh-CN') {
  const normalized = normalizeLocale(locale);
  if (!normalized) throw new RangeError(`Unsupported form-label locale: ${String(locale)}`);
  return FORM_LABELS_BY_LOCALE[normalized];
}

export function formLabel(locale, form) {
  if (form === null || form === undefined) return null;
  return formLabelsForLocale(locale)[form] ?? String(form);
}

export const getFormLabel = formLabel;

