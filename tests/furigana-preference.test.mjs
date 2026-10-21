import assert from 'node:assert/strict';
import {after, afterEach, beforeEach, test} from 'node:test';
import {createElement as h} from 'react';
import {JSDOM} from 'jsdom';
import FuriganaText from '../app/lib/furigana-text.mjs';
import FuriganaToggle from '../app/lib/furigana-toggle.mjs';
import {FURIGANA_PREFERENCE_KEY, FuriganaProvider} from '../app/lib/furigana-preference.mjs';
import {I18nProvider} from '../app/lib/i18n/provider.mjs';
import {SITE_CATALOGS} from '../app/lib/i18n/site-catalogs.mjs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://example.test/katsuyo-dojo/zh-CN/', pretendToBeVisual: true,
});
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement']) {
  Object.defineProperty(globalThis, key, {configurable: true, value: dom.window[key]});
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
const {render, cleanup, fireEvent, waitFor, act} = await import('@testing-library/react');

const baseText = root => {
  const copy = root.cloneNode(true);
  for (const node of copy.querySelectorAll('rt')) node.remove();
  return copy.textContent;
};
const samples = () => h('section', {'aria-label': 'Japanese samples'},
  ...['sans', 'serif', 'display'].map(family => h('p', {'data-family': family, key: family},
    h(FuriganaText, {surface: '来る', reading: 'くる', family, forceRuby: true}))),
  h('label', null, 'Answer draft', h('input', {defaultValue: 'まだ入力中'})));
const app = (locale = 'zh-CN') => h(I18nProvider, {locale, catalogs: SITE_CATALOGS},
  h(FuriganaProvider, null, h(FuriganaToggle), samples()));
const assertPlainJapanese = view => {
  assert.equal(view.container.querySelector('ruby, rt, .furifont-ruby'), null);
  for (const family of ['sans', 'serif', 'display']) {
    const word = view.container.querySelector(`[data-family="${family}"] [lang="ja"]`);
    assert.equal(word.textContent, '来る');
    assert.equal(word.style.fontFeatureSettings, '');
    if (family !== 'sans') assert.equal(word.style.fontFamily, 'var(--font-jp-serif)');
  }
};
const deferredFonts = () => {
  const pending = [], faces = [];
  class FontFace {
    constructor(family) { this.family = family; this.status = 'unloaded'; }
    load() {
      this.status = 'loading';
      return new Promise(resolve => pending.push(() => {
        this.status = 'loaded';
        resolve(this);
      }));
    }
  }
  Object.defineProperty(document, 'fonts', {configurable: true, value: {add: face => faces.push(face)}});
  Object.defineProperty(globalThis, 'FontFace', {configurable: true, value: FontFace});
  return {pending, faces};
};

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', storageDescriptor);
  window.localStorage.clear();
  Object.defineProperty(document, 'fonts', {configurable: true, value: undefined});
  Object.defineProperty(globalThis, 'FontFace', {configurable: true, value: undefined});
});
afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'localStorage', storageDescriptor);
});
after(() => dom.window.close());

test('the default setting shows native ruby and hiding it keeps Japanese text and answer drafts', () => {
  const view = render(app());
  const sentence = view.getByRole('region', {name: 'Japanese samples'});
  const original = baseText(sentence);
  assert.equal(sentence.querySelectorAll('ruby').length, 3);
  fireEvent.change(view.getByLabelText('Answer draft'), {target: {value: '作答を続ける'}});
  fireEvent.click(view.getByRole('button', {name: '隐藏注音'}));
  assertPlainJapanese(view);
  assert.equal(baseText(sentence), original);
  assert.equal(view.getByLabelText('Answer draft').value, '作答を続ける');
  assert.equal(window.localStorage.getItem(FURIGANA_PREFERENCE_KEY), 'false');
  fireEvent.click(view.getByRole('button', {name: '显示注音'}));
  assert.equal(sentence.querySelectorAll('ruby').length, 3);
  assert.equal(baseText(sentence), original);
  assert.equal(window.localStorage.getItem(FURIGANA_PREFERENCE_KEY), 'true');
});

test('loaded Furifont annotations hide and return without changing saved learning data or reloading fonts', async () => {
  const fonts = deferredFonts();
  const profile = '{"test":"learning data must remain untouched"}';
  window.localStorage.setItem('katsuyo-practice-profile-v8', profile);
  const view = render(app('en'));
  await waitFor(() => assert.equal(fonts.pending.length, 3));
  await act(async () => fonts.pending.forEach(release => release()));
  await waitFor(() => assert.equal(view.container.querySelectorAll('.furifont-ruby').length, 3));
  const before = baseText(view.getByRole('region', {name: 'Japanese samples'}));
  fireEvent.click(view.getByRole('button', {name: 'Hide furigana'}));
  assertPlainJapanese(view);
  assert.equal(view.getByLabelText('Answer draft').value, 'まだ入力中');
  assert.equal(window.localStorage.getItem('katsuyo-practice-profile-v8'), profile);
  fireEvent.click(view.getByRole('button', {name: 'Show furigana'}));
  await waitFor(() => assert.equal(view.container.querySelectorAll('.furifont-ruby').length, 3));
  assert.equal(baseText(view.getByRole('region', {name: 'Japanese samples'})), before);
  assert.equal(fonts.pending.length, 3);
  assert.equal(fonts.faces.length, 3);
  assert.equal(window.localStorage.getItem('katsuyo-practice-profile-v8'), profile);
});

test('a saved hidden setting avoids annotation-font downloads and survives a language change and remount', async () => {
  const fonts = deferredFonts();
  window.localStorage.setItem(FURIGANA_PREFERENCE_KEY, 'false');
  const view = render(app());
  assertPlainJapanese(view);
  assert.ok(view.getByRole('button', {name: '显示注音'}));
  fireEvent.change(view.getByLabelText('Answer draft'), {target: {value: '答えの下書き'}});
  view.rerender(app('en'));
  assertPlainJapanese(view);
  assert.ok(view.getByRole('button', {name: 'Show furigana'}));
  assert.equal(view.getByLabelText('Answer draft').value, '答えの下書き');
  await act(async () => {});
  assert.equal(fonts.pending.length, 0);
  view.unmount();
  const restored = render(app('en'));
  assertPlainJapanese(restored);
  assert.equal(fonts.pending.length, 0);
  fireEvent.click(restored.getByRole('button', {name: 'Show furigana'}));
  await waitFor(() => assert.equal(fonts.pending.length, 3));
  assert.equal(window.localStorage.getItem(FURIGANA_PREFERENCE_KEY), 'true');
});

test('blocked browser storage keeps the default visible and the display control usable', () => {
  Object.defineProperty(window, 'localStorage', {configurable: true, get() { throw new Error('storage blocked'); }});
  const view = render(app('en'));
  assert.equal(view.container.querySelectorAll('ruby').length, 3);
  fireEvent.click(view.getByRole('button', {name: 'Hide furigana'}));
  assertPlainJapanese(view);
  fireEvent.click(view.getByRole('button', {name: 'Show furigana'}));
  assert.equal(view.container.querySelectorAll('ruby').length, 3);
  assert.equal(view.getByLabelText('Answer draft').value, 'まだ入力中');
});
