import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import UsageCardView, {USAGE_CARD_MESSAGES} from '../app/lib/usage-card-view.mjs';
import {createI18n} from '../app/lib/i18n/core.mjs';
import {resolveUsageCard} from '../app/lib/usage-cards.mjs';

const card = resolveUsageCard({
  id: 'i18n-negative',
  senseId: 'verb:飲む:のむ',
  meaning: '喝',
  form: 'negative',
  scene: 'You decide not to drink tonight.',
  before: [{text: '今夜はお酒を', reading: 'こんやはおさけを'}],
  after: [{text: '。'}],
  translation: 'I will not drink tonight.',
  note: 'This sentence states a decision.',
  review: 'approved',
});

test('usage card localizes English labels while keeping the example Japanese', () => {
  const front = renderToStaticMarkup(h(UsageCardView, {card, locale: 'en'}));
  assert.match(front, /lang="en" aria-label="Context and example"/);
  assert.match(front, /<span>Context<\/span>/);
  assert.match(front, /class="usage-sentence" lang="ja"/);
  assert.match(front, /class="usage-blank" role="img" lang="en" aria-label="Enter the complete conjugated form"/);
  const back = renderToStaticMarkup(h(UsageCardView, {card, locale: 'en', revealed: true}));
  assert.match(back, /aria-label="Usage example"/);
  assert.match(back, /I will not drink tonight\./);
});

test('usage card accepts catalog messages and retains Chinese defaults', () => {
  const translated = renderToStaticMarkup(h(UsageCardView, {card, locale: 'en', t: key => key === 'practice.usageCard.scene' ? 'Situation' : key}));
  assert.match(translated, /<span>Situation<\/span>/);
  assert.match(translated, /Enter the complete conjugated form/);
  const chinese = renderToStaticMarkup(h(UsageCardView, {card, locale: 'zh-CN'}));
  assert.match(chinese, /lang="zh-CN" aria-label="场景与例句"/);
  assert.match(chinese, /lang="zh-CN" aria-label="填写变化后的完整形式"/);
});

test('English copy does not accept a Chinese fallback from the catalog', () => {
  const keys = [];
  const front = renderToStaticMarkup(h(UsageCardView, {
    card,
    locale: 'en-US',
    t: (key, params) => {
      keys.push([key, params]);
      return '缺少翻译';
    },
  }));
  assert.match(front, /lang="en" aria-label="Context and example"/);
  assert.match(front, /<span>Context<\/span>/);
  assert.match(front, /aria-label="Enter the complete conjugated form"/);
  assert.doesNotMatch(front, /缺少翻译|场景与例句|填写变化后的完整形式/);
  assert.deepEqual(keys.map(([key]) => key), [
    'practice.usageCard.context',
    'practice.usageCard.scene',
    'practice.usageCard.blank',
  ]);
  assert.ok(keys.every(([, params]) => params && typeof params === 'object'));
});

test('exported usage-card messages work as complete locale catalogs', () => {
  const i18n = createI18n({locale: 'en', catalogs: USAGE_CARD_MESSAGES});
  const front = renderToStaticMarkup(h(UsageCardView, {card, locale: i18n.locale, t: i18n.t}));
  assert.match(front, /lang="en" aria-label="Context and example"/);
  assert.match(front, /aria-label="Enter the complete conjugated form"/);
});
