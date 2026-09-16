/* eslint-disable react/prop-types -- Props use the shared JSDoc types; card content is validated before lookup. */
import { createElement as h } from 'react';
import { usageSentenceParts } from './usage-cards.mjs';

/** @param {{part: import('./usage-cards.mjs').SentencePart}} props */
function Part({part}) {
  return usageSentenceParts(part).map((piece, index) => piece.reading
    ? h('ruby', {key: index}, piece.text, h('rt', null, piece.reading)) : piece.text);
}

/** @param {{card: import('./usage-cards.mjs').ResolvedUsageCard | null, revealed?: boolean}} props */
export default function UsageCardView({card, revealed = false}) {
  if (!card) return null;
  return h('section', {className: `usage-card ${revealed ? 'usage-card-back' : 'usage-card-front'}`, 'aria-label': revealed ? '用法例句' : '场景与例句'},
    !revealed && h('p', {className: 'usage-scene'}, h('span', null, '场景'), card.scene),
    h('p', {className: 'usage-sentence', lang: 'ja'},
      ...card.before.map((part, i) => h(Part, {part, key: `before-${i}`})),
      revealed
        ? h('strong', {className: 'usage-target'}, h(Part, {part: card.target}))
        : h('span', {className: 'usage-blank', lang: 'zh-CN', 'aria-label': '填写变化后的完整形式'}, '＿＿＿＿'),
      ...card.after.map((part, i) => h(Part, {part, key: `after-${i}`}))),
    revealed && h('p', {className: 'usage-translation'}, card.translation),
    revealed && card.note && h('p', {className: 'usage-note'}, card.note));
}
