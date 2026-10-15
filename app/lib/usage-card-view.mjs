/* eslint-disable react/prop-types -- Props use the shared JSDoc types; card content is validated before lookup. */
import { createElement as h } from 'react';
import { normalizeLocale } from './i18n/locales.mjs';
import { usageSentenceParts } from './usage-cards.mjs';
import FuriganaText from './furigana-text.mjs';

export const USAGE_CARD_MESSAGES = Object.freeze({
  'zh-CN': Object.freeze({
    'practice.usageCard.example': '用法例句',
    'practice.usageCard.context': '场景与例句',
    'practice.usageCard.scene': '场景',
    'practice.usageCard.blank': '填写变化后的完整形式',
  }),
  en: Object.freeze({
    'practice.usageCard.example': 'Usage example',
    'practice.usageCard.context': 'Context and example',
    'practice.usageCard.scene': 'Context',
    'practice.usageCard.blank': 'Enter the complete conjugated form',
  }),
});

function interpolate(message, params) {
  return message.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (token, name) => (
    Object.hasOwn(params, name) ? String(params[name]) : token
  ));
}

const HAN_TEXT = /\p{Script=Han}/u;

function message(t, locale, key, fallback, params = {}) {
  const translated = typeof t === 'function' ? t(key, params) : undefined;
  const usable = typeof translated === 'string'
    && translated.trim()
    && translated !== key
    && (locale !== 'en' || !HAN_TEXT.test(translated));
  return usable ? translated : interpolate(fallback, params);
}

/** @param {{part: import('./usage-cards.mjs').SentencePart}} props */
function Part({part}) {
  return usageSentenceParts(part).map((piece, index) => piece.reading
    ? h(FuriganaText, {key: index, surface: piece.text, reading: piece.reading}) : piece.text);
}

/** @param {{card: import('./usage-cards.mjs').ResolvedUsageCard | null, revealed?: boolean, locale?: string, t?:(key:string, params?:Record<string, unknown>)=>string}} props */
export default function UsageCardView({card, revealed = false, locale = 'zh-CN', t}) {
  if (!card) return null;
  const language = normalizeLocale(locale) ?? 'zh-CN';
  const copy = USAGE_CARD_MESSAGES[language];
  const text = (key, params) => message(t, language, key, copy[key] ?? USAGE_CARD_MESSAGES['zh-CN'][key] ?? key, params);
  return h('section', {className: `usage-card ${revealed ? 'usage-card-back' : 'usage-card-front'}`, lang: language, 'aria-label': revealed ? text('practice.usageCard.example') : text('practice.usageCard.context')},
    !revealed && h('p', {className: 'usage-scene'}, h('span', null, text('practice.usageCard.scene')), card.scene),
    h('p', {className: 'usage-sentence', lang: 'ja'},
      ...card.before.map((part, i) => h(Part, {part, key: `before-${i}`})),
      revealed
        ? h('strong', {className: 'usage-target'}, h(Part, {part: card.target}))
        : h('span', {className: 'usage-blank', role: 'img', lang: language, 'aria-label': text('practice.usageCard.blank')}),
      ...card.after.map((part, i) => h(Part, {part, key: `after-${i}`}))),
    revealed && h('p', {className: 'usage-translation'}, card.translation),
    revealed && card.note && h('p', {className: 'usage-note'}, card.note));
}
