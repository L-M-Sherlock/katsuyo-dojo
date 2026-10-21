import {test, after, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createElement as h} from 'react';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import manifest from '../app/data/furifont-runtime.json' with {type: 'json'};
import FuriganaText from '../app/lib/furigana-text.mjs';
import UsageCardView from '../app/lib/usage-card-view.mjs';
import {usageCardFor, usageCardItem} from '../app/lib/usage-cards.mjs';
import {splitFuriganaParts} from '../app/lib/furigana-corpus.mjs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'https://example.test/katsuyo-dojo/', pretendToBeVisual: true});
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'StorageEvent']) {
  Object.defineProperty(globalThis, key, {configurable: true, value: dom.window[key]});
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const key of ['addEventListener', 'removeEventListener', 'requestAnimationFrame', 'cancelAnimationFrame']) globalThis[key] = dom.window[key].bind(dom.window);
const {render, cleanup, waitFor, act, fireEvent} = await import('@testing-library/react');
const baseText = root => {
  const copy = root.cloneNode(true);
  for (const node of copy.querySelectorAll('rt')) node.remove();
  return copy.textContent;
};
const fontSpans = root => [...root.querySelectorAll('.furifont-ruby')];
const readyFonts = () => {
  const pending = [], faces = [];
  class FontFace {
    constructor(family, source) { this.family = family; this.source = source; this.status = 'unloaded'; }
    load() {
      this.status = 'loading';
      return new Promise(resolve => pending.push(() => { this.status = 'loaded'; resolve(this); }));
    }
  }
  Object.defineProperty(document, 'fonts', {configurable: true, value: {add: face => faces.push(face)}});
  Object.defineProperty(globalThis, 'FontFace', {configurable: true, value: FontFace});
  return {pending, faces};
};
afterEach(cleanup);
after(() => dom.window.close());

test('loading keeps native ruby visible and one family load updates all mounted words', async () => {
  const fonts = readyFonts();
  const view = render(h('div', null,
    h(FuriganaText, {surface: '来る', reading: 'くる'}),
    h(FuriganaText, {surface: '来た', reading: 'きた'}),
    h(FuriganaText, {surface: '来ない', reading: 'こない'})));
  assert.equal(view.container.querySelectorAll('ruby').length, 3);
  assert.equal(fontSpans(view.container).length, 0);
  assert.equal(baseText(view.container), '来る来た来ない');
  await waitFor(() => assert.equal(fonts.pending.length, 1));
  await act(async () => fonts.pending.forEach(release => release()));
  await waitFor(() => assert.equal(fontSpans(view.container).length, 3));
  assert.equal(view.container.querySelector('ruby'), null);
  assert.equal(view.container.textContent, '来る来た来ない');
  assert.equal(fonts.faces.length, 1);
  const byPair = new Map(manifest.entries.map(entry => [`${entry.text}\u0000${entry.reading}`, entry]));
  for (const [index, reading] of ['く', 'き', 'こ'].entries()) {
    const span = fontSpans(view.container)[index], entry = byPair.get(`来\u0000${reading}`);
    assert.ok(entry);
    assert.equal(span.textContent, '来');
    assert.equal(span.dataset.reading, reading);
    assert.equal(span.childElementCount, 0, 'the text never receives hidden reading selectors');
    assert.match(span.style.fontFeatureSettings, new RegExp(`"salt" ${entry.families.sans.salt}(?:\\D|$)`, 'u'));
  }
});

test('unknown reading and unresolved alignment retain exact native ruby after font load', async () => {
  const fonts = readyFonts();
  const unaligned = {surface: '昨日の部屋は', reading: 'きのうのへやは'};
  const view = render(h('div', null,
    h(FuriganaText, {surface: '来', reading: 'めちゃくちゃ'}),
    h(FuriganaText, unaligned)));
  await waitFor(() => assert.equal(fonts.pending.length, 1));
  await act(async () => fonts.pending.forEach(release => release()));
  await waitFor(() => assert.equal(fonts.faces.length, 1));
  assert.equal(view.container.querySelector('ruby').textContent, '来めちゃくちゃ');
  assert.equal(baseText(view.container), '来昨日の部屋は');
  const parts = splitFuriganaParts({text: unaligned.surface, reading: unaligned.reading});
  if (parts.length === 1) assert.equal(view.container.querySelectorAll('ruby').length, 2);
});

test('Sans sentences, Serif rules and large words load separate proportional fonts', async () => {
  const fonts = readyFonts();
  const view = render(h('div', null, ...['sans', 'serif', 'display'].map(family => h('p', {key: family, 'data-family': family}, h(FuriganaText, {surface: '来る', reading: 'くる', family})))));
  await waitFor(() => assert.equal(fonts.pending.length, 3));
  await act(async () => fonts.pending.forEach(release => release()));
  await waitFor(() => assert.equal(fontSpans(view.container).length, 3));
  assert.equal(fonts.faces.length, 3);
  for (const family of ['sans', 'serif', 'display']) {
    const span = view.container.querySelector(`[data-family="${family}"] .furifont-ruby`);
    assert.ok(span.style.fontFamily.includes(manifest.families[family].family));
  }
});

test('both language versions retain Japanese cloze and revealed sentence without copying readings', async () => {
  const fonts = readyFonts();
  const card = usageCardFor(usageCardItem('adjective:上手:じょうず'), 'adjectiveAdverb');
  const view = render(h(UsageCardView, {card, locale: 'zh-CN'}));
  const front = view.container.querySelector('.usage-sentence');
  const original = baseText(front);
  assert.ok(front.querySelector('.usage-blank'));
  assert.ok(!original.includes(card.target.text));
  await waitFor(() => assert.equal(fonts.pending.length, 1));
  await act(async () => fonts.pending.forEach(release => release()));
  await waitFor(() => assert.ok(fontSpans(front).length));
  assert.equal(front.textContent, original);
  view.rerender(h(UsageCardView, {card: {...card, scene: 'A piano performance.', translation: 'She played the piano well.'}, locale: 'en', revealed: true}));
  const revealed = view.container.querySelector('.usage-sentence');
  assert.equal(revealed.textContent, [...card.before, card.target, ...card.after].map(part => part.text).join(''));
  assert.ok(fontSpans(revealed).some(span => span.dataset.reading === 'じょうず'));
  assert.equal(revealed.querySelector('ruby'), null);
  assert.ok(view.container.querySelector('.usage-translation').textContent.includes('piano'));
});

test('a family omitted from the display subset retains ruby even when that font is ready', async () => {
  const fonts = readyFonts();
  const entry = manifest.entries.find(row => !row.families.display);
  assert.ok(entry);
  const view = render(h(FuriganaText, {surface: entry.text, reading: entry.reading, family: 'display'}));
  await waitFor(() => assert.equal(fonts.pending.length, 1));
  await act(async () => fonts.pending.forEach(release => release()));
  await waitFor(() => assert.equal(fonts.faces.length, 1));
  assert.equal(fontSpans(view.container).length, 0);
  assert.equal(view.container.querySelector('ruby').textContent, entry.text + entry.reading);
});

test('failed font downloads leave every native annotation visible and usable', async () => {
  class FontFace { load() { return Promise.reject(new Error('offline')); } }
  Object.defineProperty(document, 'fonts', {configurable: true, value: {add: () => assert.fail('a failed face must not be registered')}});
  Object.defineProperty(globalThis, 'FontFace', {configurable: true, value: FontFace});
  const view = render(h(FuriganaText, {surface: '来ない', reading: 'こない'}));
  await act(async () => {});
  assert.equal(fontSpans(view.container).length, 0);
  assert.equal(view.container.querySelector('ruby').textContent, '来ないこない');
  assert.equal(baseText(view.container), '来ない');
});

test('a font becoming ready leaves the active question, answer draft and learning profile intact', async () => {
  const pageUrl = new URL('../app/page.tsx', import.meta.url);
  const compiled = ts.transpileModule(await readFile(pageUrl, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX},
  }).outputText.replace(/from ["']([^"']+)["']/g, (_match, specifier) => (
    `from ${JSON.stringify(specifier.startsWith('.') ? new URL(specifier, pageUrl).href : import.meta.resolve(specifier))}`
  ));
  const {default: Page} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const fonts = readyFonts();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/katsuyo-dojo/zh-CN/');
  Object.defineProperty(navigator, 'locks', {configurable: true, value: {request: async (_key, callback) => callback()}});
  const view = render(h(Page));
  await waitFor(() => assert.equal(Boolean(view.queryByText('正在加载学习进度……')), false));
  fireEvent.click(view.getByRole('button', {name: '自由挑战', exact: true}));
  fireEvent.click(view.getByRole('button', {name: /挑战最高难度/u}));
  await waitFor(() => assert.ok(view.getByLabelText('你的答案')));
  const input = view.getByLabelText('你的答案');
  fireEvent.change(input, {target: {value: 'まだ入力中'}});
  const beforeQuestion = baseText(view.container.querySelector('.exercise-card'));
  const beforeProfile = window.localStorage.getItem('katsuyo-practice-profile-v8');
  assert.ok(beforeProfile);
  await waitFor(() => assert.ok(fonts.pending.length));
  await act(async () => fonts.pending.forEach(release => release()));
  await waitFor(() => assert.ok(fontSpans(view.container).length));
  assert.equal(baseText(view.container.querySelector('.exercise-card')), beforeQuestion);
  assert.equal(view.getByLabelText('你的答案').value, 'まだ入力中');
  assert.equal(window.localStorage.getItem('katsuyo-practice-profile-v8'), beforeProfile);
  assert.equal(window.location.hash, '#/challenge/play');
  fireEvent.click(view.getByRole('button', {name: '隐藏注音'}));
  assert.equal(view.container.querySelector('ruby, .furifont-ruby'), null);
  assert.equal(baseText(view.container.querySelector('.exercise-card')), beforeQuestion);
  assert.equal(view.getByLabelText('你的答案').value, 'まだ入力中');
  assert.equal(window.localStorage.getItem('katsuyo-practice-profile-v8'), beforeProfile);
  assert.equal(window.location.hash, '#/challenge/play');
  fireEvent.click(view.getByRole('button', {name: '显示注音'}));
  assert.ok(fontSpans(view.container).length);
  assert.equal(view.getByLabelText('你的答案').value, 'まだ入力中');
});
