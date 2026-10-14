import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogKeys, createI18n, defineCatalog, detectLocale, localeFromPath, localizedPath, messageParameters,
  readLocalePreference, writeLocalePreference } from '../app/lib/i18n/index.mjs';

const catalogs = {
  'zh-CN': defineCatalog({
    greeting: '你好，{name}',
    attempts: { other: '作答 {count} 次' },
    fallbackOnly: '中文回退',
    nested: { score: '{score} 分' },
  }),
  en: defineCatalog({
    greeting: 'Hello, {name}',
    attempts: { one: '{count} attempt', other: '{count} attempts' },
    nested: { score: '{score} points' },
  }),
};

test('translates stable keys, parameters, plurals and Chinese fallbacks', () => {
  const i18n = createI18n({ locale: 'en', catalogs });
  assert.equal(i18n.t('greeting', { name: 'Mika' }), 'Hello, Mika');
  assert.equal(i18n.plural('attempts', 1), '1 attempt');
  assert.equal(i18n.plural('attempts', 3), '3 attempts');
  assert.equal(i18n.t('fallbackOnly'), '中文回退');
  assert.equal(i18n.t('nested.score', { score: 8 }), '8 points');
  assert.equal(i18n.t('missing.key'), 'missing.key');
});

test('catalog helpers expose stable leaves and interpolation parameters', () => {
  assert.deepEqual(catalogKeys(catalogs.en), ['attempts', 'greeting', 'nested.score']);
  assert.deepEqual(messageParameters(catalogs.en.attempts), ['count']);
  assert.deepEqual(messageParameters(catalogs.en.greeting), ['name']);
  assert.throws(() => defineCatalog({ broken: 3 }), /Catalog value/);
});

test('formats numbers, dates and durations with the active locale', () => {
  const english = createI18n({ locale: 'en', catalogs });
  const chinese = createI18n({ locale: 'zh-CN', catalogs });
  assert.equal(english.number(1234.5, { maximumFractionDigits: 1 }), '1,234.5');
  assert.equal(chinese.number(1234.5, { maximumFractionDigits: 1 }), '1,234.5');
  assert.match(english.date('2026-09-26T00:00:00Z', { timeZone: 'UTC', dateStyle: 'medium' }), /Sep 26, 2026/);
  assert.match(chinese.date('2026-09-26T00:00:00Z', { timeZone: 'UTC', dateStyle: 'medium' }), /2026年9月26日/);
  assert.match(english.duration(3_720_000), /1 hr.*2 min/);
  assert.match(chinese.duration(3_720_000), /1小时.*2分钟/);
});

test('path locale overrides preference, then browser language, with English root fallback', () => {
  assert.equal(localeFromPath('/katsuyo-dojo/zh-CN/'), 'zh-CN');
  assert.equal(localeFromPath('/katsuyo-dojo/en/'), 'en');
  assert.equal(localeFromPath('/katsuyo-dojo/'), null);
  assert.equal(detectLocale({ pathname: '/katsuyo-dojo/en/', preference: 'zh-CN', languages: ['zh-TW'] }), 'en');
  assert.equal(detectLocale({ pathname: '/katsuyo-dojo/', preference: 'zh-CN', languages: ['en-US'] }), 'zh-CN');
  assert.equal(detectLocale({ pathname: '/katsuyo-dojo/', languages: ['zh-HK', 'en-US'] }), 'zh-CN');
  assert.equal(detectLocale({ pathname: '/katsuyo-dojo/', languages: ['fr-FR'] }), 'en');
});

test('localized paths replace or add one locale segment', () => {
  assert.equal(localizedPath('/katsuyo-dojo/zh-CN/', 'en'), '/katsuyo-dojo/en/');
  assert.equal(localizedPath('/katsuyo-dojo/en/principles/', 'zh-CN'), '/katsuyo-dojo/zh-CN/principles/');
  assert.equal(localizedPath('/katsuyo-dojo/', 'en'), '/katsuyo-dojo/en/');
});

test('locale preference uses an independent storage key and tolerates blocked storage', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(writeLocalePreference('en-US', storage), true);
  assert.equal(values.get('katsuyo-ui-locale-v1'), 'en');
  assert.equal(readLocalePreference(storage), 'en');
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readLocalePreference(blocked), null);
  assert.equal(writeLocalePreference('zh-CN', blocked), false);
});
