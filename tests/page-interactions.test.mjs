import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { conjugate } from '../app/lib/conjugation.mjs';
import { COMPOUND_FORM_LABELS, COMPOUND_FORM_SPECS } from '../app/lib/compound-forms.mjs';
import { buildDiagnosticSteps, requiredKcIds } from '../app/lib/knowledge-model.mjs';
import { emptySkillStats } from '../app/lib/adaptive.mjs';

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

async function mountCompoundPast(ending = 'past', family = 'verb') {
  const initial = masteredProfile();
  initial.byKc[`composition.${family}.${ending}`] = emptySkillStats();
  storage.setItem(KEY, JSON.stringify(initial));
  storage.setItem(SCOPE, 'full');
  const view = await mount();
  const label = view.container.querySelector('.question-kicker span:nth-child(2)').textContent;
  const form = Object.keys(COMPOUND_FORM_LABELS).find((id) => COMPOUND_FORM_LABELS[id] === label);
  assert.equal(COMPOUND_FORM_SPECS[form]?.ending, ending);
  const surface = view.container.querySelector('.word-display ruby').firstChild.textContent;
  const item = VERB_KNOWLEDGE.exercises.find((exercise) => exercise.form === form && exercise.item.surface === surface).item;
  return { initial, view, form, item };
}

test('compound form confusion shows partial credit while keeping the question incorrect', async () => {
  const { initial, view, form, item } = await mountCompoundPast();
  fireEvent.click(view.getByRole('button', { name: '看一条提示' }));
  fireEvent.click(view.getByRole('button', { name: '收起提示' }));
  const wrongForm = form.replace(/Past$/, 'Negative');
  const answer = conjugate(item.reading, item.class, wrongForm);
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: answer } });
  fireEvent.click(view.getByRole('button', { name: '检查答案' }));
  await waitFor(() => assert.ok(view.getByText(/末尾写成了否定形，本题要求过去形/)));
  const saved = JSON.parse(storage.getItem(KEY));
  const confirmed = requiredKcIds(item, COMPOUND_FORM_SPECS[form].form);
  for (const id of confirmed) {
    assert.equal(saved.byKc[id].attempts, initial.byKc[id].attempts + 1, id);
    assert.equal(saved.byKc[id].correct, initial.byKc[id].correct + 1, id);
    assert.equal(saved.byKc[id].filteredAccuracy, .94, id);
  }
  assert.equal(saved.byKc['composition.verb.past'].correct, 0);
  assert.equal(saved.byKc['composition.verb.past'].attempts, 1);
  assert.deepEqual(saved.byKc['suffix.past'], initial.byKc['suffix.past']);
  assert.equal(saved.correct, 0);
  assert.equal(saved.attempted, 1);
  assert.equal(view.container.querySelectorAll('.knowledge-tags .confirmed').length, confirmed.length);
  assert.ok(view.getByText(/整题仍计为错误/));
  fireEvent.click(view.container.querySelector('.next-button'));
  await waitFor(() => assert.equal(Boolean(view.queryByText(/整题仍计为错误/)), false));
  assert.equal(view.container.querySelectorAll('.knowledge-tags .confirmed').length, 0);
});

test('an unrecognized compound answer gives no partial credit', async () => {
  const { initial, view } = await mountCompoundPast();
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: 'わからないxyz' } });
  fireEvent.click(view.getByRole('button', { name: '检查答案' }));
  await waitFor(() => assert.ok(view.getByText('差一点')));
  const saved = JSON.parse(storage.getItem(KEY));
  const changed = Object.keys(saved.byKc).filter((id) => JSON.stringify(saved.byKc[id]) !== JSON.stringify(initial.byKc[id]));
  assert.deepEqual(changed, []);
  assert.ok(view.getByText(/暂时无法确定出错步骤/));
  assert.equal(view.container.querySelectorAll('.knowledge-tags .target').length, 0);
  assert.ok(view.getByRole('region', { name: '拆步练习' }));
  assert.equal(view.container.querySelectorAll('.knowledge-tags .confirmed').length, 0);
});

async function submitLexicalTypo(view, item, form) {
  assert.notEqual(item.class, 'irregular');
  const correct = conjugate(item.reading, item.class, form);
  assert.equal(correct[0], item.reading[0]);
  const answer = (correct[0] === 'な' ? 'た' : 'な') + correct.slice(1);
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: answer } });
  fireEvent.click(view.getByRole('button', { name: '检查答案' }));
  await waitFor(() => assert.ok(view.getByText(/可能是输入笔误/)));
  return correct;
}

test('lexical typo retries leave all statistics untouched and a correction is graded once', async () => {
  const { view, item, form } = await mountCompoundPast('negativePast');
  const before = storage.getItem(KEY);
  const correct = await submitLexicalTypo(view, item, form);
  assert.equal(storage.getItem(KEY), before);
  assert.equal(view.getByLabelText('你的答案').disabled, false);
  assert.equal(Boolean(view.queryByText('差一点')), false);
  assert.equal(Boolean(view.container.querySelector('.next-button')), false);
  fireEvent.click(view.getByRole('button', { name: '检查答案' }));
  assert.equal(storage.getItem(KEY), before);
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: correct } });
  assert.equal(Boolean(view.queryByText(/可能是输入笔误/)), false);
  fireEvent.click(view.getByRole('button', { name: '检查答案' }));
  await waitFor(() => assert.ok(view.getByText('正解！')));
  const saved = JSON.parse(storage.getItem(KEY));
  assert.equal(saved.attempted, JSON.parse(before).attempted + 1);
  assert.equal(saved.correct, JSON.parse(before).correct + 1);
  assert.equal(saved.byKc['composition.verb.negativePast'].attempts, 1);
  assert.equal(saved.byKc['composition.verb.negativePast'].correct, 1);
  await next(view);
  assert.equal(Boolean(view.queryByText(/可能是输入笔误/)), false);
});

test('a typo retry retains hint usage and a wrong continuation still receives partial attribution', async () => {
  const { view, item, form } = await mountCompoundPast();
  fireEvent.click(view.getByRole('button', { name: '看一条提示' }));
  fireEvent.click(view.getByRole('button', { name: '收起提示' }));
  await submitLexicalTypo(view, item, form);
  const wrong = conjugate(item.reading, item.class, form.replace(/Past$/, 'Negative'));
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: wrong } });
  fireEvent.click(view.getByRole('button', { name: '检查答案' }));
  await waitFor(() => assert.ok(view.getByText(/末尾写成了否定形，本题要求过去形/)));
  const saved = JSON.parse(storage.getItem(KEY));
  assert.equal(saved.attempted, 1);
  assert.equal(saved.correct, 0);
  assert.equal(saved.byKc['composition.verb.past'].attempts, 1);
  for (const id of requiredKcIds(item, COMPOUND_FORM_SPECS[form].form)) {
    assert.equal(saved.byKc[id].filteredAccuracy, .94, id);
  }
  assert.equal(Boolean(view.queryByText(/可能是输入笔误/)), false);
});

test('revealing after a typo grades normally and clears the retry notice', async () => {
  const { view, item, form } = await mountCompoundPast();
  await submitLexicalTypo(view, item, form);
  fireEvent.click(view.getByRole('button', { name: '不知道' }));
  await waitFor(() => assert.ok(view.getByText('记住这个变化')));
  assert.equal(Boolean(view.queryByText(/可能是输入笔误/)), false);
  assert.equal(JSON.parse(storage.getItem(KEY)).attempted, 1);
  assert.equal(JSON.parse(storage.getItem(KEY)).correct, 0);
});

async function startDiagnosticPractice(withHint = false) {
  const context = await mountCompoundPast('past', 'i-adjective');
  const { view, item, form } = context;
  if (withHint) {
    fireEvent.click(view.getByRole('button', { name: '看一条提示' }));
    fireEvent.click(view.getByRole('button', { name: '收起提示' }));
  }
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: 'たのんだいた' } });
  fireEvent.click(view.getByRole('button', { name: '检查答案' }));
  await waitFor(() => assert.ok(view.getByRole('region', { name: '拆步练习' })));
  return { ...context, steps: buildDiagnosticSteps(item, form) };
}

test('unlocalized compound errors are followed by two independent steps without revealing the full answer', async () => {
  const { view, initial, steps } = await startDiagnosticPractice();
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).byKc, initial.byKc);
  assert.equal(JSON.parse(storage.getItem(KEY)).attempted, 1);
  assert.equal(JSON.parse(storage.getItem(KEY)).correct, 0);
  assert.equal(view.container.querySelector('.rule-line').parentElement.hidden, true);
  assert.equal(view.container.querySelector('.next-button').disabled, true);
  const question = view.container.querySelector('.stage-meta').textContent;
  fireEvent.keyDown(document.body, { key: 'Enter' });
  assert.equal(view.container.querySelector('.stage-meta').textContent, question);
  for (const [index, step] of steps.entries()) {
    const before = JSON.parse(storage.getItem(KEY));
    fireEvent.change(view.getByLabelText('本步答案'), { target: { value: step.readings[0] } });
    // Repeated submissions must not race into duplicate evidence.
    fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
    fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
    await waitFor(() => assert.ok(view.getByText('本步正确，已更新本步知识点。')));
    const saved = JSON.parse(storage.getItem(KEY));
    const changed = Object.keys(saved.byKc).filter((id) => JSON.stringify(saved.byKc[id]) !== JSON.stringify(before.byKc[id]));
    assert.deepEqual(changed.sort(), [...step.kcIds].sort());
    for (const id of step.kcIds) assert.equal(saved.byKc[id].attempts, before.byKc[id].attempts + 1);
    assert.equal(saved.attempted, 1);
    assert.equal(saved.correct, 0);
    assert.equal(saved.streak, 0);
    fireEvent.click(view.getByRole('button', { name: index === 0 ? '练习下一步' : '完成拆步' }));
  }
  assert.equal(view.container.querySelector('.rule-line').parentElement.hidden, false);
  assert.equal(view.container.querySelector('.next-button').disabled, false);
  fireEvent.click(view.container.querySelector('.next-button'));
  await waitFor(() => assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false));
});

test('an unknown first step remains ungraded and the second step diagnoses only its continuation', async () => {
  const { view, initial, steps } = await startDiagnosticPractice();
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: 'xyz' } });
  fireEvent.click(view.getByRole('button', { name: '检查本步' }));
  await waitFor(() => assert.ok(view.getByText(/本步答案有误，仍无法定位/)));
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).byKc, initial.byKc);
  fireEvent.click(view.getByRole('button', { name: '练习下一步' }));
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: steps[1].reading } });
  fireEvent.click(view.getByRole('button', { name: '检查本步' }));
  await waitFor(() => assert.ok(view.getByText(/还没有继续变为过去形/)));
  const saved = JSON.parse(storage.getItem(KEY));
  assert.equal(saved.byKc[steps[1].focusId].attempts, 1);
  assert.equal(saved.byKc[steps[1].focusId].correct, 0);
  for (const id of steps[0].kcIds) assert.deepEqual(saved.byKc[id], initial.byKc[id]);
});

test('skipping diagnostic steps adds no evidence or counts', async () => {
  const { view } = await startDiagnosticPractice();
  const before = storage.getItem(KEY);
  fireEvent.click(view.getByRole('button', { name: '跳过剩余拆步，查看解析' }));
  assert.equal(storage.getItem(KEY), before);
  assert.equal(view.container.querySelector('.rule-line').parentElement.hidden, false);
  assert.equal(Boolean(view.queryByLabelText('本步答案')), false);
});

test('diagnostic steps preserve prior hint usage and do not record whole-answer speed', async () => {
  const { view, initial, steps } = await startDiagnosticPractice(true);
  for (const [index, step] of steps.entries()) {
    fireEvent.change(view.getByLabelText('本步答案'), { target: { value: step.readings[0] } });
    fireEvent.click(view.getByRole('button', { name: '检查本步' }));
    await waitFor(() => assert.ok(view.getByText('本步正确，已更新本步知识点。')));
    const saved = JSON.parse(storage.getItem(KEY));
    for (const id of step.kcIds) {
      assert.equal(saved.byKc[id].filteredAccuracy, initial.byKc[id].attempts ? .94 : .7);
      assert.equal(saved.byKc[id].cleanTimeCount, initial.byKc[id].cleanTimeCount);
    }
    fireEvent.click(view.getByRole('button', { name: index === 0 ? '练习下一步' : '完成拆步' }));
  }
});

test('diagnostic evidence uses the same cross-tab write protection as ordinary grading', async () => {
  const { view, steps } = await startDiagnosticPractice();
  const latest = { ...JSON.parse(storage.getItem(KEY)), attempted: 20, correct: 18 };
  storage.setItem(KEY, JSON.stringify(latest));
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: steps[0].readings[0] } });
  fireEvent.click(view.getByRole('button', { name: '检查本步' }));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /本次操作未保存/));
  assert.deepEqual(JSON.parse(storage.getItem(KEY)), latest);
  assert.equal(Boolean(view.queryByText('本步正确，已更新本步知识点。')), false);
  assert.equal(view.container.querySelector('.practice-controls').disabled, true);
});

test('diagnostic lexical typo retries preserve the current step and all evidence', async () => {
  const { view, steps, item } = await startDiagnosticPractice();
  assert.notEqual(item.class, 'irregular');
  const before = storage.getItem(KEY);
  const correct = steps[0].readings[0];
  const typo = (correct[0] === 'な' ? 'た' : 'な') + correct.slice(1);
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: typo } });
  fireEvent.click(view.getByRole('button', { name: '检查本步' }));
  await waitFor(() => assert.ok(view.getByText(/本步尚未计分/)));
  assert.equal(storage.getItem(KEY), before);
  assert.equal(view.getByLabelText('本步答案').disabled, false);
  assert.equal(Boolean(view.queryByRole('button', { name: '练习下一步' })), false);
});

test('Enter advances diagnostic feedback, completes diagnostics, then goes to the next question', async () => {
  const { view, steps } = await startDiagnosticPractice();
  const question = view.container.querySelector('.stage-meta').textContent;
  assert.equal(view.container.querySelector('.next-button').textContent, '请完成或跳过拆步');
  assert.equal(Boolean(view.container.querySelector('.next-button kbd')), false);
  for (const [index, step] of steps.entries()) {
    fireEvent.change(view.getByLabelText('本步答案'), { target: { value: step.readings[0] } });
    fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
    await waitFor(() => assert.ok(view.getByText('本步正确，已更新本步知识点。')));
    const advance = view.container.querySelector('[data-diagnostic-next]');
    assert.equal(document.activeElement === advance, true);
    assert.equal(advance.getAttribute('aria-keyshortcuts'), 'Enter');
    for (const extra of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }, { ctrlKey: true }]) {
      assert.equal(fireEvent.keyDown(advance, { key: 'Enter', ...extra }), false);
      assert.equal(Boolean(view.queryByText('本步正确，已更新本步知识点。')), true);
    }
    fireEvent.keyDown(document.activeElement, { key: 'Enter' });
    assert.equal(view.container.querySelector('.stage-meta').textContent, question);
    if (index === 0) {
      await waitFor(() => assert.equal(document.activeElement === view.getByLabelText('本步答案'), true));
      assert.equal(view.getByLabelText('本步答案').value, '');
    }
  }
  const nextButton = view.container.querySelector('.next-button');
  await waitFor(() => assert.equal(document.activeElement === nextButton, true));
  assert.equal(nextButton.disabled, false);
  fireEvent.keyDown(document.activeElement, { key: 'Enter' });
  await waitFor(() => assert.notEqual(view.container.querySelector('.stage-meta').textContent, question));
  assert.equal(JSON.parse(storage.getItem(KEY)).attempted, 1);
});

test('Enter from a retained disabled answer or the page body also advances a diagnostic step', async () => {
  const { view } = await startDiagnosticPractice();
  for (let index = 0; index < 2; index++) {
    const answer = view.getByLabelText('本步答案');
    fireEvent.change(answer, { target: { value: 'xyz' } });
    fireEvent.submit(answer.closest('form'));
    await waitFor(() => assert.ok(view.getByText(/本步答案有误，仍无法定位/)));
    assert.equal(answer.disabled, true);
    fireEvent.keyDown(index === 0 ? answer : document.body, { key: 'Enter' });
  }
  assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false);
  assert.equal(view.container.querySelector('.next-button').disabled, false);
});

test('Enter cannot bypass unanswered steps or run behind the progress drawer', async () => {
  const { view, steps } = await startDiagnosticPractice();
  const before = storage.getItem(KEY);
  fireEvent.keyDown(document.body, { key: 'Enter' });
  assert.equal(storage.getItem(KEY), before);
  assert.ok(view.getByText('拆步练习 · 第 1 / 2 步'));
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: steps[0].readings[0] } });
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  await waitFor(() => assert.ok(view.getByText('本步正确，已更新本步知识点。')));
  fireEvent.click(view.getByRole('button', { name: /知识进度 完整课程/ }));
  assert.ok(view.getByRole('dialog'));
  fireEvent.keyDown(document.body, { key: 'Enter' });
  assert.ok(view.getByText('拆步练习 · 第 1 / 2 步'));
});
