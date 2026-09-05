import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Compile the actual page without starting Vite's development server in tests.
const pageUrl = new URL('../app/page.tsx', import.meta.url);
const compiled = ts.transpileModule(await readFile(pageUrl, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replace(/from ["']([^"']+)["']/g, (_match, specifier) =>
  `from ${JSON.stringify(specifier.startsWith('.') ? new URL(specifier, pageUrl).href : import.meta.resolve(specifier))}`);
const { default: Page, VERB_KNOWLEDGE, ADJECTIVE_KNOWLEDGE, ALL_KCS } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/katsuyo-dojo/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'StorageEvent']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
for (const key of ['requestAnimationFrame', 'cancelAnimationFrame', 'addEventListener', 'removeEventListener']) globalThis[key] = dom.window[key].bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement, StrictMode } = await import('react');
const { render, cleanup, fireEvent, waitFor, act } = await import('@testing-library/react');
const KEY = 'katsuyo-practice-profile-v5';
const SCOPE = 'katsuyo-practice-curriculum-scope-v1';
const DOMAIN = 'katsuyo-practice-domain-v1';
const storage = dom.window.localStorage;
const originalGet = dom.window.Storage.prototype.getItem;
const originalSet = dom.window.Storage.prototype.setItem;
let lockTail;

beforeEach(() => {
  storage.clear();
  lockTail = Promise.resolve();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_key, callback) => {
    const job = lockTail.then(callback); lockTail = job.catch(() => {}); return job;
  } } });
});
afterEach(() => {
  cleanup();
  dom.window.Storage.prototype.getItem = originalGet;
  dom.window.Storage.prototype.setItem = originalSet;
});
after(() => { dom.window.close(); });

function profile(overrides = {}) {
  const date = new Date();
  return { version: 5, date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    attempted: 0, correct: 0, streak: 0, rotation: 0, byKc: {}, introducedKcIds: [VERB_KNOWLEDGE.components.find((kc) => kc.gating).id], ...overrides };
}
function masteredProfile() {
  const stats = { attempts: 5, correct: 5, filteredAccuracy: 1, confidence: 1, bestConfidence: 1, cleanTimeTotal: 0, cleanTimeCount: 0 };
  return profile({ introducedKcIds: ALL_KCS.filter((kc) => kc.gating).map((kc) => kc.id), byKc: Object.fromEntries(ALL_KCS.map((kc) => [kc.id, { ...stats }])) });
}
async function mount() {
  const view = render(createElement(StrictMode, null, createElement(Page)));
  await waitFor(() => assert.equal(Boolean(view.queryByText('正在加载学习进度……')), false));
  return view;
}
async function classifyCorrect(view) {
  const surface = view.container.querySelector('.word-display ruby').firstChild.textContent;
  const item = [...VERB_KNOWLEDGE.exercises, ...ADJECTIVE_KNOWLEDGE.exercises].find((exercise) => exercise.item.surface === surface).item;
  const choices = item.domain === 'verb' ? ['ichidan', 'godan', 'irregular'] : ['i', 'na'];
  fireEvent.click(view.container.querySelector(`[data-class-shortcut="${choices.indexOf(item.class) + 1}"]`));
  await waitFor(() => assert.ok(view.getByText('正解！')));
}
async function next(view) {
  fireEvent.click(view.container.querySelector('.next-button'));
  await waitFor(() => assert.equal(Boolean(view.queryByText('正解！')), false));
}

test('page keeps the hint penalty after collapse and clears it on the next question', async () => {
  const view = await mount();
  fireEvent.click(view.getByRole('button', { name: '看一条提示' }));
  fireEvent.click(view.getByRole('button', { name: '收起提示' }));
  await classifyCorrect(view);
  assert.equal(JSON.parse(storage.getItem(KEY)).byKc['class.godan'].filteredAccuracy, .7);
  await next(view);
  await classifyCorrect(view);
  assert.equal(JSON.parse(storage.getItem(KEY)).byKc['class.godan'].filteredAccuracy, .76);
});

test('storage write failure retains loaded totals and still displays grading feedback', async () => {
  storage.setItem(KEY, JSON.stringify(profile({ attempted: 12, correct: 10 })));
  dom.window.Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
  const view = await mount();
  assert.match(view.container.querySelector('.daily-summary').textContent, /10 \/ 12/);
  await classifyCorrect(view);
  assert.match(view.container.querySelector('.daily-summary').textContent, /11 \/ 13/);
  assert.match(view.getByRole('alert').textContent, /暂存在本页/);
  assert.ok(view.getByRole('button', { name: '导出本页记录' }));
  await next(view);
  dom.window.Storage.prototype.setItem = originalSet;
  await classifyCorrect(view);
  assert.equal(JSON.parse(storage.getItem(KEY)).attempted, 14);
});

test('denied storage reads do not prevent grading or route switching', async () => {
  dom.window.Storage.prototype.getItem = () => { throw new Error('SecurityError'); };
  const view = await mount();
  await classifyCorrect(view);
  assert.match(view.getByRole('alert').textContent, /暂存在本页/);
  fireEvent.click(view.getByRole('tab', { name: '形容词活用' }));
  await waitFor(() => assert.equal(view.getByRole('tab', { name: '形容词活用' }).getAttribute('aria-selected'), 'true'));
  await classifyCorrect(view);
});

test('a late external write is caught before grading even without a storage event', async () => {
  const view = await mount();
  const latest = profile({ attempted: 20, correct: 18 });
  storage.setItem(KEY, JSON.stringify(latest));
  fireEvent.click(view.container.querySelector('[data-class-shortcut="2"]'));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /本次操作未保存/));
  assert.deepEqual(JSON.parse(storage.getItem(KEY)), latest);
  assert.equal(view.container.querySelector('.practice-controls').disabled, true);
  assert.equal(view.getByRole('button', { name: '导出本页记录' }).disabled, false);
});

test('storage events close an open drawer and keep recovery actions available', async () => {
  const view = await mount();
  fireEvent.click(view.getByRole('button', { name: /知识进度 核心活用/ }));
  assert.ok(view.getByRole('dialog'));
  const raw = JSON.stringify(profile({ attempted: 3, correct: 2 }));
  storage.setItem(KEY, raw);
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: raw, storageArea: storage })));
  assert.match(view.getByRole('alert').textContent, /本页已暂停/);
  assert.equal(Boolean(view.queryByRole('dialog')), false);
  assert.equal(view.container.querySelector('.practice-controls').disabled, true);
  assert.equal(view.getByRole('button', { name: '重新加载最新进度' }).disabled, false);
});

test('a completed route plays twelve questions and rotates to another course', async () => {
  storage.setItem(KEY, JSON.stringify(masteredProfile()));
  const view = await mount();
  const initialCourse = view.container.querySelector('.focus-panel strong').textContent;
  assert.ok(view.getByText('巩固训练'));
  const words = new Set();
  for (let i = 0; i < 12; i++) {
    words.add(view.container.querySelector('.word-display ruby').textContent);
    await classifyCorrect(view);
    await next(view);
    if (i < 11) assert.equal(Boolean(view.queryByText('本轮完成')), false);
  }
  assert.equal(words.size, 12);
  assert.ok(view.getByText('本轮完成'));
  fireEvent.click(view.getByRole('button', { name: /继续下一轮/ }));
  await waitFor(() => assert.ok(view.getByText('巩固训练')));
  assert.notEqual(view.container.querySelector('.focus-panel strong').textContent, initialCourse);
});

test('a regression in review is prioritized in the next round', async () => {
  storage.setItem(KEY, JSON.stringify(masteredProfile()));
  const view = await mount();
  fireEvent.click(view.getByRole('button', { name: '不知道' }));
  await waitFor(() => assert.ok(view.getByText('记住这个变化')));
  fireEvent.click(view.getByRole('button', { name: '结束本轮' }));
  await waitFor(() => assert.ok(view.getByText('本轮完成')));
  fireEvent.click(view.getByRole('button', { name: /继续下一轮/ }));
  await waitFor(() => assert.ok(view.getByText('当前课程')));
  assert.equal(Boolean(view.queryByText('巩固训练')), false);
  assert.equal(view.container.querySelector('.focus-panel strong').textContent, '动词分类');
});

test('fresh adjective preference activates the adjective route without a saved profile', async () => {
  storage.setItem(DOMAIN, 'adjective'); storage.setItem(SCOPE, 'core');
  const view = await mount();
  assert.equal(view.getByRole('tab', { name: '形容词活用' }).getAttribute('aria-selected'), 'true');
  await classifyCorrect(view);
  assert.ok(JSON.parse(storage.getItem(KEY)).introducedKcIds.some((id) => id.startsWith('adj.')));
});

test('corrupt progress is preserved and recovery controls stay usable', async () => {
  storage.setItem(KEY, '{broken');
  const view = await mount();
  assert.match(view.getByRole('alert').textContent, /无法解析/);
  assert.equal(storage.getItem(KEY), '{broken');
  assert.equal(view.getByRole('button', { name: '导出原始记录' }).disabled, false);
  assert.equal(view.getByRole('button', { name: '清除损坏记录并重新开始' }).disabled, false);
});
