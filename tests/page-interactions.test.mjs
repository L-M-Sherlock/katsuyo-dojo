import { exerciseKey } from '../app/lib/exercise-selection.mjs';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { conjugateAdjective } from '../app/lib/adjective-conjugation.mjs';
import { conjugate } from '../app/lib/conjugation.mjs';
import { COMPOUND_FORM_LABELS, COMPOUND_FORM_SPECS } from '../app/lib/compound-forms.mjs';
import { unifiedDiagnosticSteps as buildDiagnosticSteps } from '../app/lib/unified-knowledge.mjs';
import { emptySkillStats } from '../app/lib/adaptive.mjs';
import { emptyPracticeLog } from '../app/lib/practice-log.mjs';
import { emptyAssessment } from '../app/lib/learning-assessment.mjs';
import { CURRICULUM_VERSION } from '../app/lib/unified-curriculum.mjs';
import { wordKey } from '../app/lib/exercise-selection.mjs';

// Compile the actual page without starting Vite's development server in tests.
const pageUrl = new URL('../app/page.tsx', import.meta.url);
// Exposing the display-label table only lets the UI driver identify the
// question shown on screen; expected scores remain independently asserted.
const compiled = ts.transpileModule(await readFile(pageUrl, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replace(/from ["']([^"']+)["']/g, (_match, specifier) =>
  `from ${JSON.stringify(specifier.startsWith('.') ? new URL(specifier, pageUrl).href : import.meta.resolve(specifier))}`);
const { default: Page, VERB_KNOWLEDGE, ADJECTIVE_KNOWLEDGE, KNOWLEDGE, ALL_KCS } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/katsuyo-dojo/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'StorageEvent']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
for (const key of ['requestAnimationFrame', 'cancelAnimationFrame', 'addEventListener', 'removeEventListener']) globalThis[key] = dom.window[key].bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement, StrictMode } = await import('react');
const { render, cleanup, fireEvent, waitFor, act, configure } = await import('@testing-library/react');
configure({ asyncUtilTimeout: 5000 });
const KEY = 'katsuyo-practice-profile-v7';
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
  return { version: 7, assessment: emptyAssessment(), curriculumVersion: CURRICULUM_VERSION, recentWordKeys: [], practiceLog: emptyPracticeLog(), accessibleCourseIds: [], coursePractice: {}, legacy: null, migration: null, date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    attempted: 0, correct: 0, streak: 0, rotation: 0, byKc: {}, introducedKcIds: [VERB_KNOWLEDGE.components.find((kc) => kc.gating).id], ...overrides };
}
function progressWithoutLog(value) {
  const result = typeof value === 'string' ? JSON.parse(value) : structuredClone(value);
  delete result.practiceLog;
  // Finish/skip actions legitimately record when guidance was exposed. They
  // must preserve scores, attempts and the pending task itself.
  delete result.assessment.seenExposureIds;
  for (const pending of Object.values(result.assessment.pending)) {
    delete pending.lastPresentedAt;
    delete pending.lastPresentedOrdinal;
  }
  return result;
}
function assertProgressUnchanged(before) {
  assert.deepEqual(progressWithoutLog(storage.getItem(KEY)), progressWithoutLog(before));
}
const localPracticeIds = ids => ids.filter(id => ['stem.', 'onbin.', 'suffix.', 'construction.', 'contraction.', 'adj.stem.', 'adj.suffix.', 'adj.exception.', 'compound.polite-'].some(prefix => id.startsWith(prefix)) || id === 'exception.aru-negative');
const assistedStat = (profile, id) => profile.assessment.assistedByKc[id] ?? emptySkillStats();
function assertAssistedChanges(before, after, ids, correct = true) {
  const expected = localPracticeIds(ids);
  assert.deepEqual(after.byKc, before.byKc, 'guided work cannot update independent mastery');
  assert.deepEqual(after.assessment.independentByKc, before.assessment.independentByKc);
  const changed = Object.keys(after.assessment.assistedByKc).filter(id => JSON.stringify(after.assessment.assistedByKc[id]) !== JSON.stringify(before.assessment.assistedByKc[id]));
  assert.deepEqual(changed.sort(), [...expected].sort());
  for (const id of expected) {
    assert.equal(assistedStat(after, id).attempts, assistedStat(before, id).attempts + 1, id);
    assert.equal(assistedStat(after, id).correct, assistedStat(before, id).correct + Number(correct), id);
  }
  assert.ok(Object.keys(after.assessment.assistedByKc).every(id => localPracticeIds([id]).length === 1));
}
function assertStepChanges(before, after, ids, correct = true) {
  assertAssistedChanges(before, after, ids, correct);
  assert.equal(after.assessment.originalCount, before.assessment.originalCount);
  assert.deepEqual(Object.keys(after.assessment.pending), Object.keys(before.assessment.pending));
  for (const key of Object.keys(before.assessment.pending)) {
    assert.deepEqual(after.assessment.pending[key].failedKcIds, before.assessment.pending[key].failedKcIds);
    assert.equal(after.assessment.pending[key].failures, before.assessment.pending[key].failures);
  }
  assert.deepEqual(after.coursePractice, before.coursePractice);
  for (const key of ['attempted', 'correct', 'streak']) assert.equal(after[key], before[key]);
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
async function showHint(view) {
  fireEvent.click(view.getByRole('button', { name: '看一条提示' }));
  await waitFor(() => assert.ok(view.getByRole('button', { name: '收起提示' })));
  await waitFor(() => assert.equal(view.container.querySelector('.practice-controls').disabled, false));
  assert.equal(JSON.parse(storage.getItem(KEY)).practiceLog.events.at(-1).type, 'hint');
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
function displayedExercise(view) {
  const surface = view.container.querySelector('.word-display ruby').firstChild.textContent;
  const label = view.container.querySelector('.question-kicker span:nth-child(2)').textContent;
  const form = view.container.querySelector('.exercise-card').getAttribute('data-form') || null;
  const exercise = KNOWLEDGE.exercises.find(exercise => exercise.item.surface === surface && exercise.form === form);
  assert.ok(exercise, `${surface}: ${label}`);
  return exercise;
}
async function answerDisplayedCorrectly(view) {
  const exercise = displayedExercise(view);
  if (!exercise.form) await classifyCorrect(view);
  else {
    const item = exercise.item;
    const correct = item.domain === 'adjective' ? conjugateAdjective({ ...item, surface: item.reading }, exercise.form)
      : conjugate(item.reading, item.class, exercise.form);
    fireEvent.change(view.getByLabelText('你的答案'), { target: { value: correct } });
    fireEvent.submit(view.getByLabelText('你的答案').closest('form'));
    await waitFor(() => assert.ok(view.getByText('正解！')));
  }
  return exercise;
}

async function exportedProfile(view, name = '导出数据') {
  let captured;
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL, click = dom.window.HTMLAnchorElement.prototype.click;
  URL.createObjectURL = blob => { captured = blob; return 'blob:practice-log-test'; };
  URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  try {
    fireEvent.click(view.getByRole('button', { name }));
    assert.ok(captured);
    return JSON.parse(await captured.text()).profile;
  } finally { URL.createObjectURL = create; URL.revokeObjectURL = revoke; dom.window.HTMLAnchorElement.prototype.click = click; }
}

test('page preserves hint assistance after collapse and clears the manual hint on the next question', async () => {
  const view = await mount();
  await showHint(view);
  fireEvent.click(view.getByRole('button', { name: '收起提示' }));
  await classifyCorrect(view);
  const hinted = JSON.parse(storage.getItem(KEY));
  assert.deepEqual(hinted.byKc, {});
  assert.deepEqual(hinted.assessment.assistedByKc, {}, 'a hinted classification supplies no local transformation evidence');
  assert.equal(hinted.practiceLog.events.at(-1).support.source, 'hinted');
  assert.equal(Object.keys(hinted.assessment.pending).length, 1);
  await next(view);
  await classifyCorrect(view);
  const saved = JSON.parse(storage.getItem(KEY)), event = saved.practiceLog.events.at(-1);
  assert.equal(event.hintUsed, false);
  assert.ok(!event.support.provided.includes('hint'));
  assert.notEqual(event.support.source, 'hinted');
  assert.equal(saved.attempted, 2);
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
  const before = view.container.querySelector('.word-display').textContent;
  fireEvent.click(view.getByRole('tab', { name: '形容词专项' }));
  assert.equal(view.getByRole('tab', { name: '形容词专项' }).getAttribute('aria-selected'), 'true');
  assert.equal(view.container.querySelector('.word-display').textContent, before);
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
  fireEvent.click(view.getByRole('button', { name: /知识进度 全部课程/ }));
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
  const complete = masteredProfile();
  complete.coursePractice.voiceCompound = KNOWLEDGE.exercises.filter(e=>e.courseId==='voiceCompound').slice(0,12).map(exerciseKey);
  storage.setItem(KEY, JSON.stringify(complete));
  const view = await mount();
  const initialCourse = view.container.querySelector('.current-course-name').textContent;
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
  assert.notEqual(view.container.querySelector('.current-course-name').textContent, initialCourse);
});

test('revealing in review creates a pending retest and the next round starts with spacing instead of fabricated mastery loss', async () => {
  const initial = masteredProfile();
  storage.setItem(KEY, JSON.stringify(initial));
  const view = await mount();
  fireEvent.click(view.getByRole('button', { name: '不知道' }));
  await waitFor(() => assert.ok(view.getByText('记住这个变化')));
  const revealed = JSON.parse(storage.getItem(KEY));
  assert.deepEqual(revealed.byKc, initial.byKc);
  assert.equal(Object.keys(revealed.assessment.pending).length, 1);
  assert.deepEqual(revealed.practiceLog.events.at(-1).changes, []);
  assert.equal(revealed.practiceLog.events.at(-1).diagnosis.kcId, null);
  fireEvent.click(view.getByRole('button', { name: '结束本轮' }));
  await waitFor(() => assert.ok(view.getByText('本轮完成')));
  fireEvent.click(view.getByRole('button', { name: /继续下一轮/ }));
  await waitFor(() => assert.match(view.container.querySelector('.practice-notice').textContent, /间隔练习/));
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).assessment.pending, revealed.assessment.pending);
});

test('compound review varies words across forms and saved history survives starting another round and reloading', async () => {
  storage.setItem(KEY, JSON.stringify(masteredProfile()));
  let view = await mount();
  const startPotential = async () => {
    fireEvent.click([...view.container.querySelectorAll('.mode-list button')].find(button => button.textContent.includes('可能形')));
    await waitFor(() => assert.match(view.container.querySelector('.current-course-name').textContent, /可能形/));
  };
  await startPotential();
  const seen = [];
  for (let i = 0; i < 12; i++) {
    const surface = view.container.querySelector('.word-display ruby').firstChild.textContent;
    assert.ok(!seen.includes(`verb:${surface}`), `repeated ${surface} in a twelve-question round`);
    seen.push(`verb:${surface}`);
    fireEvent.change(view.getByLabelText('你的答案'), { target: { value: view.container.querySelector('.word-display rt').textContent } });
    // Reveal to exercise the original-question path without coupling this test
    // to a particular form. It must still add exactly one history entry.
    fireEvent.click(view.getByRole('button', { name: '不知道' }));
    await waitFor(() => assert.ok(view.getByText('记住这个变化')));
    assert.deepEqual(JSON.parse(storage.getItem(KEY)).recentWordKeys, seen);
    await next(view);
  }
  assert.ok(view.getByText('本轮完成'));
  await startPotential();
  const firstNewWord = view.container.querySelector('.word-display ruby').firstChild.textContent;
  assert.ok(!seen.includes(`verb:${firstNewWord}`));
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).recentWordKeys, seen);
  cleanup();
  view = await mount();
  await startPotential();
  assert.ok(!seen.includes(`verb:${view.container.querySelector('.word-display ruby').firstChild.textContent}`));
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).recentWordKeys, seen);
});

test('a legacy adjective preference does not create a separate adaptive route', async () => {
  storage.setItem(DOMAIN, 'adjective');
  const view = await mount();
  assert.equal(view.getByRole('tab', { name: '全部课程' }).getAttribute('aria-selected'), 'true');
  await classifyCorrect(view);
  assert.ok(JSON.parse(storage.getItem(KEY)).introducedKcIds.includes('class.godan'));
});

test('corrupt progress is preserved and recovery controls stay usable', async () => {
  storage.setItem(KEY, '{broken');
  const view = await mount();
  assert.match(view.getByRole('alert').textContent, /无法解析/);
  assert.equal(storage.getItem(KEY), '{broken');
  assert.equal(view.getByRole('button', { name: '导出原始记录' }).disabled, false);
  assert.equal(view.getByRole('button', { name: '清除损坏记录并重新开始' }).disabled, false);
});

async function mountCompoundPast(ending = 'past', family = 'verb', baseOverride = null) {
  const initial = masteredProfile();
  const base = baseOverride ?? (family === 'verb' ? 'teageru' : 'tai');
  initial.byKc[`apply.${base}.continuation`] = emptySkillStats();
  initial.byKc[`facet.apply.${base}.${ending}`] = emptySkillStats();
  storage.setItem(KEY, JSON.stringify(initial));
  const view = await mount();
  const label = view.container.querySelector('.question-kicker span:nth-child(2)').textContent;
  const form = Object.keys(COMPOUND_FORM_LABELS).find((id) => COMPOUND_FORM_LABELS[id] === label);
  assert.equal(COMPOUND_FORM_SPECS[form]?.ending, ending);
  assert.equal(COMPOUND_FORM_SPECS[form]?.form, base);
  const surface = view.container.querySelector('.word-display ruby').firstChild.textContent;
  const item = VERB_KNOWLEDGE.exercises.find((exercise) => exercise.form === form && exercise.item.surface === surface).item;
  return { initial, view, form, item };
}

test('whole continuation confusion requests diagnosis instead of blaming either shared rule or application', async () => {
  const { initial, view, form, item } = await mountCompoundPast();
  const answer = conjugate(item.reading, item.class, form.replace(/Past$/, 'Negative'));
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: answer } });
  fireEvent.click(view.getByRole('button', { name: '检查答案' }));
  await waitFor(() => assert.ok(view.getByRole('region', { name: '拆步练习' })));
  const saved = JSON.parse(storage.getItem(KEY));
  assert.deepEqual(saved.byKc, initial.byKc);
  assert.equal(saved.attempted, 1);
  assert.equal(saved.correct, 0);
});

test('an unrecognized compound answer gives no partial credit', async () => {
  const { initial, view } = await mountCompoundPast();
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: 'わからないxyz' } });
  fireEvent.click(view.getByRole('button', { name: '检查答案' }));
  await waitFor(() => assert.ok(view.getByText('差一点')));
  const saved = JSON.parse(storage.getItem(KEY));
  const changed = Object.keys(saved.byKc).filter((id) => JSON.stringify(saved.byKc[id]) !== JSON.stringify(initial.byKc[id]));
  assert.deepEqual(changed, []);
  assert.match(view.container.querySelector('.feedback-copy p').textContent, /缺少足够完整的片段/);
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
  assertProgressUnchanged(before);
  assert.equal(view.getByLabelText('你的答案').disabled, false);
  assert.equal(Boolean(view.queryByText('差一点')), false);
  assert.equal(Boolean(view.container.querySelector('.next-button')), false);
  fireEvent.click(view.getByRole('button', { name: '检查答案' }));
  await waitFor(() => assert.equal(JSON.parse(storage.getItem(KEY)).practiceLog.events.length, 2));
  assertProgressUnchanged(before);
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: correct } });
  assert.equal(Boolean(view.queryByText(/可能是输入笔误/)), false);
  fireEvent.click(view.getByRole('button', { name: '检查答案' }));
  await waitFor(() => assert.ok(view.getByText('正解！')));
  const saved = JSON.parse(storage.getItem(KEY));
  assert.equal(saved.attempted, JSON.parse(before).attempted + 1);
  assert.deepEqual(saved.recentWordKeys, [wordKey({ item })]);
  assert.equal(saved.correct, JSON.parse(before).correct + 1);
  assert.equal(saved.byKc['apply.teageru.continuation'].attempts, 1);
  assert.equal(saved.byKc['apply.teageru.continuation'].correct, 1);
  assert.equal(saved.assessment.independentByKc['apply.teageru.continuation'].correct, 1);
  assert.equal(saved.practiceLog.events.at(-1).support.independent, true);
  assert.ok(saved.practiceLog.events.at(-1).support.provided.includes('lexical-retry'));
  await next(view);
  assert.equal(Boolean(view.queryByText(/可能是输入笔误/)), false);
});

test('a typo retry retains hint usage when the corrected answer is graded', async () => {
  const { view, item, form, initial } = await mountCompoundPast();
  await showHint(view);
  fireEvent.click(view.getByRole('button', { name: '收起提示' }));
  const correct = await submitLexicalTypo(view, item, form);
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: correct } });
  fireEvent.click(view.getByRole('button', { name: '检查答案' }));
  await waitFor(() => assert.ok(view.getByText('正解！')));
  const saved = JSON.parse(storage.getItem(KEY));
  assert.deepEqual(saved.byKc, initial.byKc);
  assert.equal(saved.assessment.assistedByKc['apply.teageru.continuation'], undefined);
  assert.equal(saved.practiceLog.events.at(-1).support.source, 'hinted');
  assert.equal(saved.practiceLog.events.at(-1).support.independent, false);
  assert.equal(Object.keys(saved.assessment.pending).length, 1);
});

test('revealing after a typo grades normally and clears the retry notice', async () => {
  const { view, item, form } = await mountCompoundPast();
  await submitLexicalTypo(view, item, form);
  fireEvent.click(view.getByRole('button', { name: '不知道' }));
  await waitFor(() => assert.ok(view.getByText('记住这个变化')));
  assert.equal(Boolean(view.queryByText(/可能是输入笔误/)), false);
  assert.equal(JSON.parse(storage.getItem(KEY)).attempted, 1);
  assert.equal(JSON.parse(storage.getItem(KEY)).correct, 0);
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).recentWordKeys, [wordKey({ item })]);
});

async function startDiagnosticPractice(withHint = false) {
  const context = await mountCompoundPast('past', 'i-adjective');
  const { view, item, form } = context;
  if (withHint) {
    await showHint(view);
    fireEvent.click(view.getByRole('button', { name: '收起提示' }));
  }
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: 'たのんだいた' } });
  fireEvent.click(view.getByRole('button', { name: '检查答案' }));
  await waitFor(() => assert.ok(view.getByRole('region', { name: '拆步练习' })));
  return { ...context, steps: buildDiagnosticSteps(item, form) };
}

async function assertDiagnosticSummary(view, { skipped = false, updated }) {
  await waitFor(() => {
    const summary = view.container.querySelector('.feedback-copy p').textContent;
    const footer = view.container.querySelector('.feedback-meta > span').textContent;
    assert.match(summary, skipped ? /跳过/ : /拆步练习已完成/);
    assert.match(summary, /原题仍计为错误/);
    assert.match(summary, /独立掌握度/);
    assert.match(summary, /待复测/);
    assert.match(summary, updated ? /已记录 \d+ 个局部知识点的辅助练习/ : /已记录本次诊断过程/);
    assert.doesNotMatch(summary, /暂时无法确定出错步骤/);
    assert.doesNotMatch(footer, /后续变化单独评估|拆步作答单独评估/);
    assert.match(footer, /已完成|已结束|跳过|待复测|辅助/);
    assert.doesNotMatch(`${summary} ${footer}`, /独立掌握度已更新|知识点掌握度已更新/);
  });
}

async function mountPassiveDesirePractice() {
  const initial = masteredProfile();
  initial.attempted = 17;
  initial.correct = 12;
  initial.streak = 3;
  initial.byKc['compound.multi-step'] = emptySkillStats();
  storage.setItem(KEY, JSON.stringify(initial));
  const view = await mount();
  assert.match(view.container.querySelector('.instruction').textContent, /受身・愿望・否定过去/);
  const surface = view.container.querySelector('.word-display ruby').firstChild.textContent;
  const item = VERB_KNOWLEDGE.exercises.find(exercise => exercise.form === 'passiveDesireNegativePast' && exercise.item.surface === surface).item;
  assert.equal(item.class, 'godan');
  return { initial, view, item };
}

for (const localized of [false, true]) test(`passive desire probes show each target and preserve whole-answer statistics (localized=${localized})`, async () => {
  const { initial, view, item } = await mountPassiveDesirePractice();
  const passive = conjugate(item.surface, item.class, 'passive');
  const passiveReading = conjugate(item.reading, item.class, 'passive');
  const passiveKcIds = VERB_KNOWLEDGE.exercises.find(exercise => exercise.form === 'passive' && exercise.item.surface === item.surface).kcIds;
  const tai = conjugate(passive, 'ichidan', 'tai');
  const taiReading = conjugate(passiveReading, 'ichidan', 'tai');
  const iStem = conjugate(item.reading, item.class, 'masu').slice(0, -2);
  const answer = localized ? iStem + 'られたくなかった' : 'わからないxyz';
  const question = view.container.querySelector('.stage-meta').textContent;
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: answer } });
  fireEvent.submit(view.getByLabelText('你的答案').closest('form'));
  const count = localized ? 4 : 3;
  await waitFor(() => assert.ok(view.getByText(`拆步练习 · 第 1 / ${count} 步`)));
  const whole = JSON.parse(storage.getItem(KEY));
  assert.deepEqual(whole.byKc, initial.byKc);
  assert.equal(whole.attempted, initial.attempted + 1);
  assert.equal(whole.correct, initial.correct);
  assert.equal(whole.streak, 0);
  assert.equal(view.container.querySelectorAll('.knowledge-tags .target').length, 0);
  assert.equal(view.container.querySelectorAll('.knowledge-tags .confirmed').length, 0);
  if (localized) assert.match(view.container.querySelector('.feedback-copy p').textContent, /受身/);
  else assert.match(view.container.querySelector('.feedback-copy p').textContent, /缺少足够完整的片段/);

  // These expectations specify the local work each probe asks for, rather than
  // borrowing the diagnostic generator's own KC list as a grading oracle.
  const steps = [
    ...(localized ? [
      { surface: item.surface, target: /[アaａ]段/i, answer: passiveReading.slice(0, -2), kcIds: ['stem.godan.a'] },
      { surface: passive.slice(0, -2), target: /受身/, answer: passiveReading, kcIds: ['suffix.passive'] },
    ] : [
      { surface: item.surface, target: /受身/, answer: passiveReading, kcIds: passiveKcIds },
    ]),
    { surface: passive, target: /たい/, answer: taiReading, kcIds: ['stem.ichidan.drop-ru', 'construction.tai'] },
    { surface: tai, target: /たい.*否定过去/, answer: conjugateAdjective({ class: 'i', surface: taiReading }, 'adjectiveNegativePast'),
      kcIds: ['adj.stem.i-ku', 'adj.suffix.i-negative', 'adj.suffix.i-past', 'adj.compound.i-negative-past', 'apply.tai.continuation', 'facet.apply.tai.negativePast'] },
  ];
  for (const [index, step] of steps.entries()) {
    const region = view.getByRole('region', { name: '拆步练习' });
    assert.match(region.querySelector('p > strong').textContent, step.target);
    assert.ok(region.querySelector('.diagnostic-word').textContent.includes(step.surface));
    assert.equal(view.container.querySelector('.next-button').disabled, true);
    assert.equal(view.container.querySelector('.rule-line').parentElement.hidden, true);
    const before = JSON.parse(storage.getItem(KEY));
    const input = view.getByLabelText('本步答案');
    fireEvent.change(input, { target: { value: step.answer } });
    fireEvent.submit(input.closest('form'));
    fireEvent.submit(input.closest('form'));
    await waitFor(() => assert.ok(view.getByText(/本步正确，已记录辅助练习/)));
    const saved = JSON.parse(storage.getItem(KEY));
    assertStepChanges(before, saved, step.kcIds);
    assert.deepEqual(saved.byKc['compound.multi-step'], initial.byKc['compound.multi-step']);
    assert.deepEqual(saved.coursePractice, initial.coursePractice);
    assert.equal(saved.attempted, whole.attempted);
    assert.equal(saved.correct, whole.correct);
    assert.equal(saved.streak, whole.streak);
    const advance = view.container.querySelector('[data-diagnostic-next]');
    await waitFor(() => assert.equal(document.activeElement === advance, true));
    fireEvent.keyDown(advance, { key: 'Enter' });
    assert.equal(view.container.querySelector('.stage-meta').textContent, question);
    if (index < steps.length - 1) {
      await waitFor(() => assert.ok(view.getByText(`拆步练习 · 第 ${index + 2} / ${count} 步`)));
      assert.equal(view.getByLabelText('本步答案').value, '');
    }
  }
  await waitFor(() => assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false));
  assert.ok(view.getByText('差一点'));
  await assertDiagnosticSummary(view, { updated: true });
  assert.equal(view.container.querySelector('.rule-line').parentElement.hidden, false);
  const nextButton = view.container.querySelector('.next-button');
  assert.equal(nextButton.disabled, false);
  await waitFor(() => assert.equal(document.activeElement === nextButton, true));
  fireEvent.keyDown(nextButton, { key: 'Enter' });
  await waitFor(() => assert.notEqual(view.container.querySelector('.stage-meta').textContent, question));
  assert.equal(view.getByLabelText('你的答案').disabled, false);
  assert.doesNotMatch(view.container.textContent, /拆步练习已完成|知识点掌握度已更新/);
  assert.equal(JSON.parse(storage.getItem(KEY)).attempted, whole.attempted);
});

test('a completed compound base is saved once and Enter completes only its remaining probe', async () => {
  const { view, initial, item, form } = await mountCompoundPast('past', 'i-adjective');
  const baseForm=COMPOUND_FORM_SPECS[form].form;
  const baseAnswer=conjugate(item.reading,item.class,baseForm);
  fireEvent.change(view.getByLabelText('你的答案'), {target:{value:baseAnswer}});
  fireEvent.click(view.getByRole('button',{name:'检查答案'}));
  await waitFor(()=>assert.ok(view.getByText('拆步练习 · 第 1 / 1 步')));
  const beforeProbe=JSON.parse(storage.getItem(KEY));
  const confirmed=[...view.container.querySelectorAll('.knowledge-tags .confirmed')];
  assert.ok(confirmed.length>0);
  assert.equal(beforeProbe.attempted,1);
  assert.equal(beforeProbe.correct,0);
  assert.equal(beforeProbe.byKc[`construction.${baseForm}`].correct,initial.byKc[`construction.${baseForm}`].correct+1);
  assert.deepEqual(beforeProbe.byKc['adj.suffix.i-past'],initial.byKc['adj.suffix.i-past']);
  fireEvent.change(view.getByLabelText('本步答案'),{target:{value:conjugate(item.reading,item.class,form)}});
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  await waitFor(()=>assert.ok(view.getByText(/本步正确，已记录辅助练习/)));
  const saved=JSON.parse(storage.getItem(KEY));
  assert.equal(saved.attempted,1);
  assert.equal(saved.correct,0);
  assert.equal(saved.streak,0);
  assert.deepEqual(saved.byKc[`construction.${baseForm}`],beforeProbe.byKc[`construction.${baseForm}`]);
  assertStepChanges(beforeProbe, saved, ['adj.suffix.i-past']);
  fireEvent.keyDown(view.getByRole('button',{name:/完成拆步/}),{key:'Enter'});
  await waitFor(()=>assert.equal(Boolean(view.queryByRole('region',{name:'拆步练习'})),false));
  await assertDiagnosticSummary(view, { updated: true });
  fireEvent.keyDown(view.container.querySelector('.next-button'),{key:'Enter'});
  await waitFor(()=>assert.equal(Boolean(view.queryByText('差一点')),false));
});

test('unlocalized compound errors are followed by two guided steps without revealing the full answer', async () => {
  const { view, initial, steps, item } = await startDiagnosticPractice();
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).byKc, initial.byKc);
  assert.equal(JSON.parse(storage.getItem(KEY)).attempted, 1);
  assert.equal(JSON.parse(storage.getItem(KEY)).correct, 0);
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).recentWordKeys, [wordKey({ item })]);
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
    await waitFor(() => assert.ok(view.getByText(/本步正确，已记录辅助练习/)));
    const saved = JSON.parse(storage.getItem(KEY));
    assertStepChanges(before, saved, step.kcIds);
    assert.equal(saved.attempted, 1);
    assert.equal(saved.correct, 0);
    assert.equal(saved.streak, 0);
    assert.deepEqual(saved.recentWordKeys, [wordKey({ item })]);
    fireEvent.click(view.getByRole('button', { name: index === 0 ? '练习下一步' : '完成拆步' }));
  }
  await assertDiagnosticSummary(view, { updated: true });
  assert.equal(view.container.querySelector('.rule-line').parentElement.hidden, false);
  assert.equal(view.container.querySelector('.next-button').disabled, false);
  const beforeNext = JSON.parse(storage.getItem(KEY));
  fireEvent.click(view.container.querySelector('.next-button'));
  await waitFor(() => assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false));
  assert.doesNotMatch(view.container.textContent, /拆步练习已完成|知识点掌握度已更新/);
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: 'xyz' } });
  fireEvent.click(view.getByRole('button', { name: '检查答案' }));
  await waitFor(() => assert.ok(view.getByRole('region', { name: '拆步练习' })));
  assert.doesNotMatch(view.container.querySelector('.feedback-copy p').textContent, /拆步练习已完成|掌握度已更新/);
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).byKc, beforeNext.byKc);
});

test('an unknown first step remains ungraded and the second step diagnoses only its continuation', async () => {
  const { view, initial, steps, item, form } = await startDiagnosticPractice();
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: 'xyz' } });
  fireEvent.click(view.getByRole('button', { name: '检查本步' }));
  await waitFor(() => assert.ok(view.getByText(/本次不更新未确认的知识点|本步不更新掌握度/)));
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).byKc, initial.byKc);
  assert.doesNotMatch(view.container.querySelector('.feedback-copy p').textContent, /掌握度已更新/);
  fireEvent.click(view.getByRole('button', { name: '练习下一步' }));
  const supplements = createAnswerAnalyzer(item, form, { step: steps[0] })('xyz').steps;
  assert.ok(supplements.length, 'the unknown base now has finite primitive checks');
  for (const supplement of supplements) {
    assert.ok(view.container.querySelector('.diagnostic-word').textContent.includes(supplement.surface));
    fireEvent.change(view.getByLabelText('本步答案'), { target: { value: 'xyz' } });
    fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
    await waitFor(() => assert.ok(view.getByText(/本步不更新掌握度/)));
    fireEvent.click(view.getByRole('button', { name: '练习下一步' }));
  }
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: steps[1].reading } });
  fireEvent.click(view.getByRole('button', { name: '检查本步' }));
  await waitFor(() => assert.ok(view.getByText(/还没有继续变为过去形/)));
  const saved = JSON.parse(storage.getItem(KEY));
  assert.equal(assistedStat(saved, 'adj.suffix.i-past').attempts, 1);
  assert.equal(assistedStat(saved, 'adj.suffix.i-past').correct, 0);
  assert.deepEqual(saved.byKc, initial.byKc);
  assert.equal(saved.byKc[steps[1].focusId].attempts, 0);
  for (const id of steps[0].kcIds) assert.deepEqual(saved.byKc[id], initial.byKc[id]);
  fireEvent.click(view.getByRole('button', { name: '完成拆步' }));
  await assertDiagnosticSummary(view, { updated: true });
});

test('skipping diagnostic steps adds no evidence or counts', async () => {
  const { view } = await startDiagnosticPractice();
  const before = storage.getItem(KEY);
  fireEvent.click(view.getByRole('button', { name: '跳过剩余拆步，查看解析' }));
  await waitFor(() => assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false));
  assertProgressUnchanged(before);
  assert.equal(view.container.querySelector('.rule-line').parentElement.hidden, false);
  assert.equal(Boolean(view.queryByLabelText('本步答案')), false);
  await assertDiagnosticSummary(view, { skipped: true, updated: false });
});

for (const firstStepCorrect of [true, false]) test(`skipping the remaining probe reports only saved evidence (firstStepCorrect=${firstStepCorrect})`, async () => {
  const { view, steps } = await startDiagnosticPractice();
  const before = JSON.parse(storage.getItem(KEY));
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: firstStepCorrect ? steps[0].readings[0] : 'xyz' } });
  fireEvent.click(view.getByRole('button', { name: '检查本步' }));
  await waitFor(() => assert.ok(view.getByText(firstStepCorrect ? /本步正确，已记录辅助练习/ : /本次不更新未确认的知识点|本步不更新掌握度/)));
  const afterStep = JSON.parse(storage.getItem(KEY));
  assertStepChanges(before, afterStep, firstStepCorrect ? steps[0].kcIds : []);
  const inProgress = view.container.querySelector('.feedback-copy p').textContent;
  assert.match(inProgress, /拆步不改变独立掌握度|独立掌握度.*不变/);
  assert.match(inProgress, /待复测/);
  if (firstStepCorrect) assert.match(inProgress, /辅助练习/);
  assert.doesNotMatch(inProgress, /拆步练习已完成/);
  assert.equal(afterStep.attempted, before.attempted);
  assert.equal(afterStep.correct, before.correct);
  assert.equal(afterStep.streak, before.streak);
  fireEvent.click(view.getByRole('button', { name: '练习下一步' }));
  const beforeSkip = storage.getItem(KEY);
  fireEvent.click(view.getByRole('button', { name: '跳过剩余拆步，查看解析' }));
  await waitFor(() => assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false));
  assertProgressUnchanged(beforeSkip);
  await assertDiagnosticSummary(view, { skipped: true, updated: firstStepCorrect });
  assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false);
  assert.equal(view.container.querySelector('.next-button').disabled, false);
});

async function mountDerivedPastProbe(baseForm) {
  const context = await mountCompoundPast('past', 'verb', baseForm);
  const { view, item, form } = context;
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: 'xyz' } });
  fireEvent.click(view.getByRole('button', { name: '检查答案' }));
  await waitFor(() => assert.ok(view.getByRole('region', { name: '拆步练习' })));
  const baseReading = conjugate(item.reading, item.class, baseForm);
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: baseReading } });
  fireEvent.click(view.getByRole('button', { name: '检查本步' }));
  await waitFor(() => assert.ok(view.getByText(/本步正确，已记录辅助练习/)));
  fireEvent.click(view.getByRole('button', { name: '练习下一步' }));
  const derivedClass = baseForm === 'tagaru' ? 'godan' : 'ichidan';
  return {
    ...context,
    baseReading,
    derivedClass,
    classLabel: derivedClass === 'godan' ? '五段动词' : '一段动词',
    correctReading: conjugate(item.reading, item.class, form),
    correctSurface: conjugate(item.surface, item.class, form),
    wrongReading: baseReading.slice(0, -1) + (derivedClass === 'godan' ? 'た' : 'った'),
    allowedKcIds: derivedClass === 'godan' ? ['onbin.sokuon', 'suffix.past']
      : item.class === 'ichidan' ? ['suffix.past'] : ['stem.ichidan.drop-ru', 'suffix.past'],
  };
}

test('two omissions inside the causative-passive suffix do not add redundant stem and suffix probes', async () => {
  const initial = masteredProfile();
  initial.byKc['apply.causativePassive.continuation'] = emptySkillStats();
  initial.byKc['facet.apply.causativePassive.negativePast'] = emptySkillStats();
  // Keep this integration fixture in the one-step ichidan suffix family.
  initial.byKc['stem.godan.a'].filteredAccuracy = .8;
  storage.setItem(KEY, JSON.stringify(initial));
  const view = await mount();
  const surface = view.container.querySelector('.word-display ruby').firstChild.textContent;
  const item = VERB_KNOWLEDGE.exercises.find(e => e.item.surface === surface).item;
  assert.equal(item.class, 'ichidan');
  assert.match(view.container.querySelector('.instruction').textContent, /使役受身.*否定過去|使役受身.*否定过去/);
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: 'xyz§' } });
  fireEvent.submit(view.getByLabelText('你的答案').closest('form'));
  await waitFor(() => assert.ok(view.getByText('拆步练习 · 第 1 / 2 步')));
  const before = JSON.parse(storage.getItem(KEY));
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: item.reading.slice(0, -1) + 'せれる' } });
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  await waitFor(() => assert.ok(view.getByText(/接续写成了「せれる」.*「させられる」/)));
  assert.ok(view.getByText('拆步练习 · 第 1 / 2 步'));
  const after = JSON.parse(storage.getItem(KEY));
  assertStepChanges(before, after, ['suffix.causativePassive'], false);
  assert.equal(after.attempted, before.attempted);
  assert.equal(after.correct, before.correct);
  assert.deepEqual(after.recentWordKeys, before.recentWordKeys);
  fireEvent.keyDown(view.container.querySelector('[data-diagnostic-next]'), { key: 'Enter' });
  await waitFor(() => assert.ok(view.getByText('拆步练习 · 第 2 / 2 步')));
  assert.match(view.container.querySelector('.diagnostic-word').textContent, /させられる/);
  assert.equal(view.getByRole('region', { name: '拆步练习' }).querySelector('strong').textContent, '否定过去形');
});

for (const { baseForm, correctClass, correctPast } of [
  { baseForm: 'tagaru', correctClass: true, correctPast: false },
  { baseForm: 'tagaru', correctClass: false, correctPast: true },
  { baseForm: 'teageru', correctClass: true, correctPast: true },
  { baseForm: 'teageru', correctClass: false, correctPast: false },
]) test(`derived past ambiguity adds isolated guided checks (${baseForm}, class=${correctClass}, past=${correctPast})`, async () => {
  const { view, classLabel, correctReading, correctSurface, wrongReading, allowedKcIds } = await mountDerivedPastProbe(baseForm);
  const beforeAmbiguous = JSON.parse(storage.getItem(KEY));
  const originalQuestion = view.container.querySelector('.stage-meta').textContent;
  const input = view.getByLabelText('本步答案');
  fireEvent.change(input, { target: { value: wrongReading } });
  fireEvent.submit(input.closest('form'));
  fireEvent.submit(input.closest('form'));
  await waitFor(() => assert.match(view.getByRole('region', { name: '拆步练习' }).querySelector('h3').textContent, /第\s*2\s*\/\s*4\s*步/));
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).byKc, beforeAmbiguous.byKc);
  let region = view.getByRole('region', { name: '拆步练习' });
  assert.equal(region.textContent.includes(correctReading), false);
  assert.equal(region.textContent.includes(correctSurface), false);
  assert.doesNotMatch(region.textContent, /本步正确形式/);
  assert.equal(view.container.querySelector('.rule-line').parentElement.hidden, true);
  assert.equal(view.container.querySelector('.next-button').disabled, true);
  fireEvent.keyDown(view.getByRole('button', { name: '练习下一步' }), { key: 'Enter' });
  await waitFor(() => assert.ok(view.getByRole('button', { name: classLabel })));
  region = view.getByRole('region', { name: '拆步练习' });
  assert.match(region.querySelector('h3').textContent, /第\s*3\s*\/\s*4\s*步/);
  assert.equal(region.textContent.includes(correctReading), false);
  assert.equal(region.textContent.includes(correctSurface), false);
  const beforeClass = storage.getItem(KEY);
  fireEvent.keyDown(document.body, { key: 'Enter' });
  assert.equal(storage.getItem(KEY), beforeClass);
  assert.match(region.querySelector('h3').textContent, /第\s*3\s*\/\s*4\s*步/);
  const selectedClass = correctClass ? classLabel : classLabel === '五段动词' ? '一段动词' : '五段动词';
  fireEvent.click(view.getByRole('button', { name: selectedClass }));
  await waitFor(() => assert.match(region.textContent, /本步只确认词类，不更新知识点掌握度/));
  assert.match(region.textContent, correctClass ? /词类判断正确/ : /词类判断有误/);
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).byKc, beforeAmbiguous.byKc);
  assert.equal(region.textContent.includes(correctReading), false);
  assert.equal(region.textContent.includes(correctSurface), false);
  fireEvent.keyDown(view.getByRole('button', { name: '练习下一步' }), { key: 'Enter' });
  await waitFor(() => assert.ok(view.getByLabelText('本步答案')));
  region = view.getByRole('region', { name: '拆步练习' });
  assert.match(region.querySelector('h3').textContent, /第\s*4\s*\/\s*4\s*步/);
  assert.match(region.textContent, new RegExp(`已提供词类[：:]${classLabel}`));
  assert.equal(region.textContent.includes(correctReading), false);
  assert.equal(region.textContent.includes(correctSurface), false);
  const beforePast = JSON.parse(storage.getItem(KEY));
  fireEvent.keyDown(document.body, { key: 'Enter' });
  assert.deepEqual(JSON.parse(storage.getItem(KEY)), beforePast);
  assert.equal(view.container.querySelector('.next-button').disabled, true);
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: correctPast ? correctReading : wrongReading } });
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  await waitFor(() => assert.ok(view.getByRole('button', { name: '完成拆步' })));
  assert.match(region.querySelector('h3').textContent, /第\s*4\s*\/\s*4\s*步/);
  const saved = JSON.parse(storage.getItem(KEY));
  const expectedKcIds = correctPast ? allowedKcIds : [baseForm === 'tagaru' ? 'onbin.sokuon' : 'suffix.past'];
  assertStepChanges(beforePast, saved, expectedKcIds, correctPast);
  assert.equal(saved.attempted, beforeAmbiguous.attempted);
  assert.equal(saved.correct, beforeAmbiguous.correct);
  assert.equal(saved.streak, beforeAmbiguous.streak);
  assert.deepEqual(saved.coursePractice, beforeAmbiguous.coursePractice);
  await waitFor(() => { assert.equal(view.container.querySelector('.practice-controls').disabled,false); assert.equal(document.activeElement === view.getByRole('button', { name: '完成拆步' }), true); });
  fireEvent.keyDown(view.getByRole('button', { name: '完成拆步' }), { key: 'Enter' });
  await waitFor(() => assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false));
  await assertDiagnosticSummary(view, { updated: true });
  assert.match(view.container.querySelector('.feedback-copy p').textContent, /已作答\s*4\s*\/\s*4\s*步/);
  fireEvent.keyDown(view.container.querySelector('.next-button'), { key: 'Enter' });
  await waitFor(() => assert.notEqual(view.container.querySelector('.stage-meta').textContent, originalQuestion));
  assert.doesNotMatch(view.container.textContent, /拆步练习已完成/);
});

test('a save conflict cannot append derived classification probes or claim their evidence', async () => {
  const { view, wrongReading } = await mountDerivedPastProbe('tagaru');
  const summaryBefore = view.container.querySelector('.feedback-copy p').textContent;
  const footerBefore = view.container.querySelector('.feedback-meta > span').textContent;
  const latest = { ...JSON.parse(storage.getItem(KEY)), attempted: 20, correct: 18 };
  storage.setItem(KEY, JSON.stringify(latest));
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: wrongReading } });
  fireEvent.click(view.getByRole('button', { name: '检查本步' }));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /本次操作未保存/));
  assert.deepEqual(JSON.parse(storage.getItem(KEY)), latest);
  assert.match(view.getByRole('region', { name: '拆步练习' }).querySelector('h3').textContent, /第\s*2\s*\/\s*2\s*步/);
  assert.equal(view.container.querySelector('.feedback-copy p').textContent, summaryBefore);
  assert.equal(view.container.querySelector('.feedback-meta > span').textContent, footerBefore);
  assert.equal(Boolean(view.queryByRole('button', { name: '练习下一步' })), false);
  assert.equal(Boolean(view.queryByRole('button', { name: '五段动词' })), false);
  assert.equal(view.container.querySelector('.practice-controls').disabled, true);
});

test('skipping appended classification probes keeps their expanded total and saved evidence', async () => {
  const { view, wrongReading } = await mountDerivedPastProbe('tagaru');
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: wrongReading } });
  fireEvent.click(view.getByRole('button', { name: '检查本步' }));
  await waitFor(() => assert.match(view.getByRole('region', { name: '拆步练习' }).querySelector('h3').textContent, /第\s*2\s*\/\s*4\s*步/));
  fireEvent.click(view.getByRole('button', { name: '练习下一步' }));
  await waitFor(() => assert.ok(view.getByRole('button', { name: '五段动词' })));
  const beforeSkip = storage.getItem(KEY);
  fireEvent.click(view.getByRole('button', { name: '跳过剩余拆步，查看解析' }));
  await waitFor(() => assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false));
  assertProgressUnchanged(beforeSkip);
  await assertDiagnosticSummary(view, { skipped: true, updated: true });
  assert.match(view.container.querySelector('.feedback-copy p').textContent, /已作答\s*2\s*\/\s*4\s*步/);
  assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false);
  assert.equal(view.container.querySelector('.next-button').disabled, false);
});

for (const outcome of ['correct', 'ending-error', 'mixed-error']) test(`mixed lexical and past-ending errors receive separate ungraded checks (${outcome})`, async () => {
  const { view, item, baseReading, correctReading, correctSurface, wrongReading } = await mountDerivedPastProbe('tagaru');
  // Mirror しめたがる → しまたがだ using the word actually selected by
  // the page: change its lexical prefix, preserve any godan i-row stem change
  // and たが, and independently replace った.
  const root = baseReading.slice(0, -3);
  const lexicalPrefix = item.reading.slice(0, -1);
  assert.ok(lexicalPrefix.length > 0 && root.startsWith(lexicalPrefix));
  const changedIndex = lexicalPrefix.length - 1;
  const alteredRoot = root.slice(0, changedIndex) + (root[changedIndex] === 'ま' ? 'め' : 'ま') + root.slice(changedIndex + 1);
  const mixedAnswer = alteredRoot + 'たがだ';
  const beforeMixed = JSON.parse(storage.getItem(KEY));
  const input = view.getByLabelText('本步答案');
  fireEvent.change(input, { target: { value: mixedAnswer } });
  fireEvent.submit(input.closest('form'));
  fireEvent.submit(input.closest('form'));
  await waitFor(() => assert.match(view.getByRole('region', { name: '拆步练习' }).querySelector('h3').textContent, /第\s*2\s*\/\s*4\s*步/));
  let region = view.getByRole('region', { name: '拆步练习' });
  const mixedFeedback = region.querySelector('[role="status"] > p').textContent;
  assert.match(mixedFeedback, /前部|前面|原词部分|词根/);
  assert.match(mixedFeedback, /末尾|词尾/);
  assert.match(mixedFeedback, /(?:不|未).*更新|不.*计分|不.*扣分/);
  assert.doesNotMatch(mixedFeedback, /已更新/);
  assert.equal(input.value, mixedAnswer);
  assert.equal(region.textContent.includes(correctReading), false);
  assert.equal(region.textContent.includes(correctSurface), false);
  assert.doesNotMatch(region.textContent, /本步正确形式/);
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).byKc, beforeMixed.byKc);
  assert.equal(view.container.querySelector('.rule-line').parentElement.hidden, true);
  fireEvent.keyDown(view.getByRole('button', { name: '练习下一步' }), { key: 'Enter' });
  await waitFor(() => assert.ok(view.getByRole('button', { name: '五段动词' })));
  region = view.getByRole('region', { name: '拆步练习' });
  assert.match(region.querySelector('h3').textContent, /第\s*3\s*\/\s*4\s*步/);
  assert.equal(region.textContent.includes(correctReading), false);
  assert.equal(region.textContent.includes(correctSurface), false);
  const classCorrect = outcome !== 'ending-error';
  fireEvent.click(view.getByRole('button', { name: classCorrect ? '五段动词' : '一段动词' }));
  await waitFor(() => assert.match(region.textContent, /本步只确认词类，不更新知识点掌握度/));
  assert.match(region.textContent, classCorrect ? /词类判断正确/ : /词类判断有误/);
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).byKc, beforeMixed.byKc);
  await waitFor(() => {
    assert.equal(view.container.querySelector('.practice-controls').disabled, false);
    assert.equal(document.activeElement === view.getByRole('button', { name: '练习下一步' }), true);
  });
  fireEvent.keyDown(view.getByRole('button', { name: '练习下一步' }), { key: 'Enter' });
  await waitFor(() => assert.ok(view.getByLabelText('本步答案')));
  region = view.getByRole('region', { name: '拆步练习' });
  assert.match(region.textContent, /已提供词类[：:]五段动词/);
  assert.match(region.querySelector('h3').textContent, /第\s*4\s*\/\s*4\s*步/);
  assert.equal(region.textContent.includes(correctReading), false);
  const beforeGivenClass = JSON.parse(storage.getItem(KEY));
  const finalAnswer = outcome === 'correct' ? correctReading : outcome === 'ending-error' ? wrongReading : mixedAnswer;
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: finalAnswer } });
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  await waitFor(() => assert.ok(view.getByRole('button', { name: outcome === 'mixed-error' ? '练习下一步' : '完成拆步' })));
  assert.match(region.querySelector('h3').textContent, outcome === 'mixed-error' ? /第\s*4\s*\/\s*6\s*步/ : /第\s*4\s*\/\s*4\s*步/);
  assert.equal(Boolean(view.queryByRole('button', { name: '五段动词' })), false);
  const saved = JSON.parse(storage.getItem(KEY));
  const expectedKcIds = outcome === 'correct' ? ['onbin.sokuon', 'suffix.past'] : outcome === 'ending-error' ? ['onbin.sokuon'] : [];
  assertStepChanges(beforeGivenClass, saved, expectedKcIds, outcome === 'correct');
  if (outcome === 'mixed-error') {
    const review = region.querySelector('[role="status"] > p').textContent;
    assert.match(review, /前部|前面|原词部分|词根/);
    assert.match(review, /末尾|词尾/);
    assert.match(review, /(?:不|未).*更新|不.*计分|不.*扣分/);
    assert.deepEqual(saved.byKc, beforeMixed.byKc);
  }
  assert.equal(saved.attempted, beforeMixed.attempted);
  assert.equal(saved.correct, beforeMixed.correct);
  assert.equal(saved.streak, beforeMixed.streak);
  assert.deepEqual(saved.coursePractice, beforeMixed.coursePractice);
  if (outcome === 'mixed-error') {
    // The given-class attempt remains ungraded; two separate rule probes under supplied facts
    // finish the diagnosis without asking for classification a second time.
    for (let i=0;i<2;i++) {
      fireEvent.click(view.getByRole('button', { name: '练习下一步' }));
      assert.match(region.textContent,/已提供正确输入和词类/);
      assert.equal(Boolean(view.queryByRole('button', { name: '五段动词' })),false);
      fireEvent.change(view.getByLabelText('本步答案'),{target:{value:'xyz§'}});
      fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
      await waitFor(()=>assert.ok(view.getByText(/本步不更新掌握度/)));
    }
    assert.deepEqual(JSON.parse(storage.getItem(KEY)).byKc,beforeMixed.byKc);
  }
  await waitFor(() => { assert.equal(view.container.querySelector('.practice-controls').disabled,false); assert.equal(document.activeElement === view.getByRole('button', { name: '完成拆步' }), true); });
  fireEvent.keyDown(view.getByRole('button', { name: '完成拆步' }), { key: 'Enter' });
  await waitFor(() => assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false));
  await assertDiagnosticSummary(view, { updated: true });
  assert.match(view.container.querySelector('.feedback-copy p').textContent, outcome === 'mixed-error' ? /已作答\s*6\s*\/\s*6\s*步/ : /已作答\s*4\s*\/\s*4\s*步/);
  const correctSteps = outcome === 'correct' ? 3 : outcome === 'ending-error' ? 1 : 2;
  assert.match(view.container.querySelector('.feedback-copy p').textContent, new RegExp(`答对\\s*${correctSteps}\\s*步`));
});

test('diagnostic steps preserve prior hint usage and do not record whole-answer speed', async () => {
  const { view, initial, steps } = await startDiagnosticPractice(true);
  for (const [index, step] of steps.entries()) {
    fireEvent.change(view.getByLabelText('本步答案'), { target: { value: step.readings[0] } });
    fireEvent.click(view.getByRole('button', { name: '检查本步' }));
    await waitFor(() => assert.ok(view.getByText(/本步正确，已记录辅助练习/)));
    const saved = JSON.parse(storage.getItem(KEY));
    assert.deepEqual(saved.byKc, initial.byKc);
    for (const id of localPracticeIds(step.kcIds)) {
      assert.equal(assistedStat(saved, id).filteredAccuracy, .7);
      assert.equal(assistedStat(saved, id).cleanTimeCount, 0);
    }
    fireEvent.click(view.getByRole('button', { name: index === 0 ? '练习下一步' : '完成拆步' }));
  }
  await waitFor(() => assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false));
});

test('diagnostic evidence uses the same cross-tab write protection as ordinary grading', async () => {
  const { view, steps } = await startDiagnosticPractice();
  const latest = { ...JSON.parse(storage.getItem(KEY)), attempted: 20, correct: 18 };
  storage.setItem(KEY, JSON.stringify(latest));
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: steps[0].readings[0] } });
  fireEvent.click(view.getByRole('button', { name: '检查本步' }));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /本次操作未保存/));
  assert.deepEqual(JSON.parse(storage.getItem(KEY)), latest);
  assert.equal(Boolean(view.queryByText(/本步正确，已记录辅助练习/)), false);
  assert.doesNotMatch(view.container.querySelector('.feedback-copy p').textContent, /掌握度已更新|拆步练习已完成/);
  assert.doesNotMatch(view.container.querySelector('.feedback-meta > span').textContent, /掌握度已更新|拆步.*已完成/);
  assert.equal(Boolean(view.queryByRole('button', { name: '练习下一步' })), false);
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
  assertProgressUnchanged(before);
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
    await waitFor(() => assert.ok(view.getByText(/本步正确，已记录辅助练习/)));
    const advance = view.container.querySelector('[data-diagnostic-next]');
    assert.equal(document.activeElement === advance, true);
    assert.equal(advance.getAttribute('aria-keyshortcuts'), 'Enter');
    for (const extra of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }, { ctrlKey: true }]) {
      assert.equal(fireEvent.keyDown(advance, { key: 'Enter', ...extra }), false);
      assert.equal(Boolean(view.queryByText(/本步正确，已记录辅助练习/)), true);
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
  const before = JSON.parse(storage.getItem(KEY));
  let completed = 0;
  while (view.queryByRole('region', { name: '拆步练习' }) && completed < 20) {
    const index = completed++;
    const answer = view.getByLabelText('本步答案');
    fireEvent.change(answer, { target: { value: 'xyz' } });
    fireEvent.submit(answer.closest('form'));
    await waitFor(() => assert.ok(view.getByText(/本次不更新未确认的知识点|本步不更新掌握度/)));
    assert.equal(answer.disabled, true);
    await waitFor(() => assert.equal(document.activeElement === view.container.querySelector('[data-diagnostic-next]'), true));
    fireEvent.keyDown(index % 2 === 0 ? answer : document.body, { key: 'Enter' });
    await waitFor(() => assert.ok(!view.queryByRole('region', { name: '拆步练习' }) || !view.getByLabelText('本步答案').disabled));
  }
  assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false);
  assert.equal(view.container.querySelector('.next-button').disabled, false);
  await assertDiagnosticSummary(view, { updated: false });
  const saved = JSON.parse(storage.getItem(KEY));
  assert.deepEqual(saved.byKc, before.byKc);
  assert.equal(saved.attempted, before.attempted);
  assert.equal(saved.correct, before.correct);
  assert.equal(saved.streak, before.streak);
});

test('Enter cannot bypass unanswered steps or run behind the progress drawer', async () => {
  const { view, steps } = await startDiagnosticPractice();
  const before = storage.getItem(KEY);
  fireEvent.keyDown(document.body, { key: 'Enter' });
  assert.equal(storage.getItem(KEY), before);
  assert.ok(view.getByText('拆步练习 · 第 1 / 2 步'));
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: steps[0].readings[0] } });
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  await waitFor(() => assert.ok(view.getByText(/本步正确，已记录辅助练习/)));
  fireEvent.click(view.getByRole('button', { name: /知识进度 全部课程/ }));
  assert.ok(view.getByRole('dialog'));
  fireEvent.keyDown(document.body, { key: 'Enter' });
  assert.ok(view.getByText('拆步练习 · 第 1 / 2 步'));
});

for (const legacyVersion of [5, 6]) test(`v${legacyVersion} automatically migrates on use, retains its snapshot and reloads v7 without replaying migration`, async () => {
  const legacyKey = `katsuyo-practice-profile-v${legacyVersion}`;
  const legacy = { ...profile({ attempted: 7, correct: 6 }), version: legacyVersion };
  delete legacy.assessment;
  const raw = JSON.stringify(legacy);
  storage.setItem(legacyKey, raw);
  const view = await mount();
  assert.match(view.container.textContent, /独立评估已启用/);
  await classifyCorrect(view);
  const saved = JSON.parse(storage.getItem(KEY));
  assert.equal(saved.version, 7);
  assert.equal(saved.attempted, 8);
  if (legacyVersion === 5) assert.deepEqual(saved.legacy.profile, legacy);
  else assert.deepEqual(saved.legacy, legacy.legacy);
  assert.equal(saved.practiceLog.events.filter(event => event.type === 'migration').length, 1);
  assert.equal(storage.getItem(legacyKey), raw);
  cleanup();
  await mount();
  assert.deepEqual(JSON.parse(storage.getItem(KEY)), saved);
});

test('course filters preserve the active question and cannot unlock a new course', async () => {
  const view = await mount();
  const word = view.container.querySelector('.word-display').textContent;
  fireEvent.click(view.getByRole('tab', { name: '形容词专项' }));
  const courses = [...view.container.querySelectorAll('.mode-list button')];
  assert.equal(courses.length, 6);
  assert.ok(courses.every(button => button.disabled));
  fireEvent.click(courses.at(-1));
  assert.equal(view.container.querySelector('.word-display').textContent, word);
  assert.equal(view.container.querySelectorAll('.class-options button').length, 3);
});

test('historically accessible compound courses recover new shared prerequisites before returning to the selected course', async () => {
  const saved = masteredProfile();
  saved.accessibleCourseIds = ['multiStepCompound'];
  saved.byKc['adj.suffix.i-past'] = emptySkillStats();
  storage.setItem(KEY, JSON.stringify(saved));
  const view = await mount();
  const button = [...view.container.querySelectorAll('.mode-list button')].find(b => b.textContent.includes('多种表达的组合活用'));
  assert.equal(button.disabled, false);
  fireEvent.click(button);
  await waitFor(() => assert.match(view.container.querySelector('.practice-notice').textContent, /补基础/));
  assert.match(view.container.querySelector('.current-course-name').textContent, /多种表达的组合活用/);
  assert.ok(view.container.querySelector('#answer'));
  for (let i = 0; i < 8 && displayedExercise(view).form !== 'passiveDesireNegativePast'; i++) {
    if (i === 0) assert.ok(displayedExercise(view).kcIds.includes('adj.suffix.i-past'));
    assert.match(view.container.querySelector('.current-course-name').textContent, /多种表达的组合活用/);
    await answerDisplayedCorrectly(view);
    await next(view);
    if (view.container.querySelector('.completion-card')) {
      fireEvent.click(view.container.querySelector('.restart-button'));
      await waitFor(() => assert.ok(view.container.querySelector('.exercise-card')));
    }
  }
  assert.equal(JSON.parse(storage.getItem(KEY)).byKc['adj.suffix.i-past'].confidence, 1);
  assert.equal(displayedExercise(view).form, 'passiveDesireNegativePast');
  assert.equal(Boolean(view.container.querySelector('[data-class-shortcut]')), false);
});

test('the mastered voice application course remains available in review rotation without a separate quota', async () => {
  const saved = masteredProfile();
  saved.rotation = 15;
  storage.setItem(KEY, JSON.stringify(saved));
  const view = await mount();
  assert.match(view.container.querySelector('.current-course-name').textContent, /態|态|复合/);
  assert.match(view.container.querySelector('.mode-list button:nth-child(16)').textContent, /已达标/);
  assert.ok(view.getByText('巩固训练'));
});

test('old-version storage writes cannot overwrite the migrated profile', async () => {
  const view = await mount();
  await classifyCorrect(view);
  const raw = storage.getItem(KEY);
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: 'katsuyo-practice-profile-v5', newValue: '{}', storageArea: storage })));
  assert.match(view.getByRole('alert').textContent, /旧版标签页/);
  assert.equal(storage.getItem(KEY), raw);
});

for (const hintUsed of [false, true]) test(`adjective ku omission persists precise evidence (hint=${hintUsed})`, async () => {
  const initial = masteredProfile();
  initial.byKc['adj.suffix.i-negative'] = emptySkillStats();
  // Keep this as an unfinished lesson, not a mastered-then-regressed priority.
  initial.byKc['adj.suffix.i-past'] = { ...initial.byKc['adj.suffix.i-past'], filteredAccuracy: .5, confidence: .5, bestConfidence: .5 };
  storage.setItem(KEY, JSON.stringify(initial));
  const view = await mount();
  assert.equal(view.container.querySelector('.question-kicker span:nth-child(2)').textContent, '否定形');
  const surface = view.container.querySelector('.word-display ruby').firstChild.textContent;
  const item = ADJECTIVE_KNOWLEDGE.exercises.find(e => e.item.surface === surface && e.form === 'adjectiveNegative').item;
  if (hintUsed) await showHint(view);
  const stem = conjugateAdjective({ ...item, surface: item.reading }, 'adjectiveNegative').slice(0, -2);
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: stem } });
  fireEvent.click(view.getByRole('button', { name: '检查答案' }));
  await waitFor(() => assert.ok(view.getByText('已写对「く」形词干，但缺少后续的「ない」。')));
  const saved = JSON.parse(storage.getItem(KEY));
  assert.equal(saved.attempted, 1);
  assert.equal(saved.correct, 0);
  const scores = hintUsed ? saved.assessment.assistedByKc : saved.byKc;
  assert.equal(scores['adj.suffix.i-negative'].attempts, 1);
  assert.equal(scores['adj.suffix.i-negative'].correct, 0);
  assert.equal(scores['adj.stem.i-ku'].correct, hintUsed ? 1 : initial.byKc['adj.stem.i-ku'].correct + 1);
  assert.equal(scores['adj.stem.i-ku'].filteredAccuracy, hintUsed ? .7 : 1);
  if (hintUsed) assert.deepEqual(saved.byKc, initial.byKc);
  assert.deepEqual(saved.byKc['adj.class.i'], initial.byKc['adj.class.i']);
  assert.deepEqual(saved.byKc['adj.suffix.i-adverb'], initial.byKc['adj.suffix.i-adverb']);
  assert.equal(Boolean(view.queryByText(/暂时无法确定出错步骤/)), false);
  assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false);
});

test('adjective past answered as negative penalizes only the requested past rule', async () => {
  const initial = masteredProfile();
  initial.byKc['adj.suffix.i-past'] = emptySkillStats();
  storage.setItem(KEY, JSON.stringify(initial));
  const view = await mount();
  const surface = view.container.querySelector('.word-display ruby').firstChild.textContent;
  const item = ADJECTIVE_KNOWLEDGE.exercises.find(e => e.item.surface === surface && e.form === 'adjectivePast').item;
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: conjugateAdjective({ ...item, surface: item.reading }, 'adjectiveNegative') } });
  fireEvent.click(view.getByRole('button', { name: '检查答案' }));
  await waitFor(() => assert.ok(view.getByText('你写成了否定形，本题要求过去形。')));
  const saved = JSON.parse(storage.getItem(KEY));
  assert.equal(saved.attempted, 1);
  assert.equal(saved.correct, 0);
  assert.deepEqual(Object.keys(saved.byKc).filter(id => JSON.stringify(saved.byKc[id]) !== JSON.stringify(initial.byKc[id])), ['adj.suffix.i-past']);
});

for(const ending of ['た','かった'])test(`dictionary-form attachment ${ending} shows a precise past diagnosis and saves one failure`,async()=>{
  const initial=masteredProfile();
  initial.byKc['adj.suffix.i-past']=emptySkillStats();
  storage.setItem(KEY,JSON.stringify(initial));
  const view=await mount();
  const surface=view.container.querySelector('.word-display ruby').firstChild.textContent;
  const item=ADJECTIVE_KNOWLEDGE.exercises.find(e=>e.item.surface===surface&&e.form==='adjectivePast').item;
  assert.equal(item.iiFamily,false);
  fireEvent.change(view.getByLabelText('你的答案'),{target:{value:item.reading+ending}});
  fireEvent.submit(view.getByLabelText('你的答案').closest('form'));
  fireEvent.submit(view.getByLabelText('你的答案').closest('form'));
  await waitFor(()=>assert.ok(view.getByText(/你保留了原形末尾的「い」/)));
  assert.equal(Boolean(view.queryByText(/暂时无法确定出错步骤/)),false);
  assert.equal(Boolean(view.queryByRole('region',{name:'拆步练习'})),false);
  const saved=JSON.parse(storage.getItem(KEY));
  assert.equal(saved.attempted,1);
  assert.equal(saved.correct,0);
  assert.equal(saved.byKc['adj.suffix.i-past'].attempts,1);
  assert.deepEqual(Object.keys(saved.byKc).filter(id=>JSON.stringify(saved.byKc[id])!==JSON.stringify(initial.byKc[id])),['adj.suffix.i-past']);
});

for(const [tail,correct] of [['ない',false],['でない',true]])test(`na negative distinguishes incomplete ${tail} from a valid variant`,async()=>{
  const initial=masteredProfile();
  initial.byKc['adj.suffix.na-negative']=emptySkillStats();
  // Keep past unfinished so negative-past stays unavailable, while negative
  // remains the weaker learning target under prerequisite-aware selection.
  initial.byKc['adj.suffix.i-past']={...emptySkillStats(), attempts:1, correct:1, filteredAccuracy:1, confidence:1/5/0.85, bestConfidence:1/5/0.85};
  storage.setItem(KEY,JSON.stringify(initial));
  const view=await mount();
  fireEvent.click([...view.container.querySelectorAll('.mode-list button')].find(button => button.textContent.includes('な形容词基础活用')));
  await waitFor(() => assert.equal(view.container.querySelector('.question-kicker span:nth-child(2)').textContent,'否定形'));
  const surface=view.container.querySelector('.word-display ruby').firstChild.textContent;
  const item=ADJECTIVE_KNOWLEDGE.exercises.find(e=>e.item.surface===surface&&e.form==='adjectiveNaNegative').item;
  fireEvent.change(view.getByLabelText('你的答案'),{target:{value:item.reading+tail}});
  fireEvent.submit(view.getByLabelText('你的答案').closest('form'));
  await waitFor(()=>assert.ok(view.getByText(correct?'正解！':/本题要求的否定形接续不完整/)));
  const saved=JSON.parse(storage.getItem(KEY));
  assert.equal(saved.attempted,1);
  assert.equal(saved.correct,correct?1:0);
  assert.equal(saved.byKc['adj.suffix.na-negative'].attempts,1);
  assert.equal(saved.byKc['adj.suffix.na-negative'].correct,correct?1:0);
  assert.equal(Boolean(view.queryByText(/暂时无法确定出错步骤/)),false);
  assert.equal(Boolean(view.queryByRole('region',{name:'拆步练习'})),false);
  if(correct)assert.ok(view.getByText('你使用了本站接受的答案变体。'));
  else assert.deepEqual(Object.keys(saved.byKc).filter(id=>JSON.stringify(saved.byKc[id])!==JSON.stringify(initial.byKc[id])),['adj.suffix.na-negative']);
});

test('na te replacement saves only its connection failure and permits Enter navigation',async()=>{
  const initial=masteredProfile();
  initial.byKc['adj.suffix.na-te']=emptySkillStats();
  storage.setItem(KEY,JSON.stringify(initial));
  const view=await mount();
  const question=view.container.querySelector('.stage-meta').textContent;
  const surface=view.container.querySelector('.word-display ruby').firstChild.textContent;
  const item=ADJECTIVE_KNOWLEDGE.exercises.find(e=>e.item.surface===surface&&e.form==='adjectiveNaTe').item;
  fireEvent.change(view.getByLabelText('你的答案'),{target:{value:item.reading+'て'}});
  fireEvent.submit(view.getByLabelText('你的答案').closest('form'));
  await waitFor(()=>assert.ok(view.getByText(/接续部分写成了「て」/)));
  assert.equal(Boolean(view.queryByText(/暂时无法确定出错步骤/)),false);
  const saved=JSON.parse(storage.getItem(KEY));
  assert.equal(saved.attempted,1);
  assert.equal(saved.correct,0);
  assert.deepEqual(Object.keys(saved.byKc).filter(id=>JSON.stringify(saved.byKc[id])!==JSON.stringify(initial.byKc[id])),['adj.suffix.na-te']);
  fireEvent.keyDown(view.getByLabelText('你的答案'),{key:'Enter'});
  await waitFor(()=>assert.notEqual(view.container.querySelector('.stage-meta').textContent,question));
});

test('na past suffix voicing feedback saves only the suffix failure and permits the next question',async()=>{
  const initial=masteredProfile();
  initial.byKc['adj.suffix.na-past']=emptySkillStats();
  storage.setItem(KEY,JSON.stringify(initial));
  const view=await mount();
  const question=view.container.querySelector('.stage-meta').textContent;
  const surface=view.container.querySelector('.word-display ruby').firstChild.textContent;
  const item=ADJECTIVE_KNOWLEDGE.exercises.find(e=>e.item.surface===surface&&e.form==='adjectiveNaPast').item;
  fireEvent.change(view.getByLabelText('你的答案'),{target:{value:item.reading+'たっだ'}});
  fireEvent.submit(view.getByLabelText('你的答案').closest('form'));
  fireEvent.submit(view.getByLabelText('你的答案').closest('form'));
  await waitFor(()=>assert.ok(view.getByText(/接续部分写成了「たっだ」/)));
  assert.equal(Boolean(view.queryByText(/暂时无法确定出错步骤/)),false);
  assert.equal(Boolean(view.queryByRole('region',{name:'拆步练习'})),false);
  const saved=JSON.parse(storage.getItem(KEY));
  assert.equal(saved.attempted,1);
  assert.equal(saved.correct,0);
  assert.equal(saved.byKc['adj.suffix.na-past'].attempts,1);
  assert.deepEqual(Object.keys(saved.byKc).filter(id=>JSON.stringify(saved.byKc[id])!==JSON.stringify(initial.byKc[id])),['adj.suffix.na-past']);
  assert.equal(view.container.querySelector('.next-button').disabled,false);
  fireEvent.keyDown(view.getByLabelText('你的答案'),{key:'Enter'});
  await waitFor(()=>assert.notEqual(view.container.querySelector('.stage-meta').textContent,question));
});

for (const outcome of ['success', 'failure', 'unknown', 'skip', 'hint']) test(`recognized negative intermediate starts only the remaining probe (${outcome})`, async () => {
  const initial = masteredProfile();
  initial.byKc['adj.compound.i-negative-past'] = emptySkillStats();
  storage.setItem(KEY, JSON.stringify(initial));
  const view = await mount();
  assert.equal(view.container.querySelector('.question-kicker span:nth-child(2)').textContent, '否定过去形');
  const surface = view.container.querySelector('.word-display ruby').firstChild.textContent;
  const item = ADJECTIVE_KNOWLEDGE.exercises.find(e => e.form === 'adjectiveNegativePast' && e.item.surface === surface).item;
  const readingItem = { ...item, surface: item.reading };
  const negative = conjugateAdjective(readingItem, 'adjectiveNegative');
  if (outcome === 'hint') await showHint(view);
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: negative } });
  fireEvent.click(view.getByRole('button', { name: '检查答案' }));
  await waitFor(() => assert.ok(view.getByText('拆步练习 · 第 1 / 1 步')));
  assert.ok(view.getByText(/已写对否定形，但尚未完成过去变化/));
  assert.equal(Boolean(view.queryByText(/暂时无法确定出错步骤/)), false);
  assert.equal(Boolean(view.queryByText('请先变为')), false);
  assert.match(view.container.querySelector('.diagnostic-word').textContent, /ない/);
  assert.equal(view.container.querySelectorAll('.knowledge-tags .target').length, 0);
  const beforeProbe = JSON.parse(storage.getItem(KEY));
  assert.equal(beforeProbe.attempted, 1);
  assert.equal(beforeProbe.correct, 0);
  assert.equal(beforeProbe.streak, 0);
  for (const id of ['adj.stem.i-ku', 'adj.suffix.i-negative']) {
    const scores = outcome === 'hint' ? beforeProbe.assessment.assistedByKc : beforeProbe.byKc;
    assert.equal(scores[id].attempts, outcome === 'hint' ? 1 : initial.byKc[id].attempts + 1);
    assert.equal(scores[id].filteredAccuracy, outcome === 'hint' ? .7 : 1);
  }
  if (outcome === 'hint') assert.deepEqual(beforeProbe.byKc, initial.byKc);
  for (const id of ['adj.class.i', 'adj.suffix.i-past', 'adj.compound.i-negative-past']) assert.deepEqual(beforeProbe.byKc[id], initial.byKc[id]);
  if (outcome === 'skip') {
    fireEvent.click(view.getByRole('button', { name: '跳过剩余拆步，查看解析' }));
  } else {
    const answer = outcome === 'failure' ? negative : outcome === 'unknown' ? 'xyz' : conjugateAdjective(readingItem, 'adjectiveNegativePast');
    fireEvent.change(view.getByLabelText('本步答案'), { target: { value: answer } });
    fireEvent.click(view.getByRole('button', { name: '检查本步' }));
    if (outcome === 'unknown') {
      await waitFor(() => assert.ok(view.getByRole('button', { name: '练习下一步' })));
      fireEvent.click(view.getByRole('button', { name: '练习下一步' }));
      assert.match(view.getByRole('region', { name: '拆步练习' }).textContent, /已提供正确输入和词类/);
      fireEvent.change(view.getByLabelText('本步答案'), { target: { value: 'xyz' } });
      fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
    }
    await waitFor(() => assert.equal(document.activeElement === view.getByRole('button', { name: /完成拆步/ }), true));
    fireEvent.keyDown(view.getByRole('button', { name: /完成拆步/ }), { key: 'Enter' });
  }
  await waitFor(() => assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false));
  const afterProbe = JSON.parse(storage.getItem(KEY));
  await assertDiagnosticSummary(view, { skipped: outcome === 'skip', updated: outcome !== 'skip' && outcome !== 'unknown' });
  if (outcome === 'skip' || outcome === 'unknown') {
    assert.match(view.container.querySelector('.feedback-copy p').textContent, /拆步不改变独立掌握度|独立掌握度.*不变|独立掌握度.*未更新/);
  }
  assert.doesNotMatch(view.container.querySelector('.partial-evidence-note').textContent, /继续单独检查/);
  for (const id of ['adj.stem.i-ku', 'adj.suffix.i-negative', 'adj.class.i']) assert.deepEqual(afterProbe.byKc[id], beforeProbe.byKc[id]);
  assert.equal(afterProbe.attempted, 1);
  assert.equal(afterProbe.correct, 0);
  assertStepChanges(beforeProbe, afterProbe, outcome === 'skip' || outcome === 'unknown' ? [] : ['adj.suffix.i-past'], outcome !== 'failure');
  fireEvent.keyDown(view.container.querySelector('.next-button'), { key: 'Enter' });
  await waitFor(() => assert.equal(Boolean(view.queryByText('差一点')), false));
});

for (const outcome of ['correct','wrong','malformed','skip']) test(`negative-past mixed errors open only the three missing rules and keep truthful summaries (${outcome})`, async () => {
  const {view,item,form}=await mountCompoundPast('negativePast','verb','tagaru');
  const base=conjugate(item.reading,item.class,'tagaru');
  fireEvent.change(view.getByLabelText('你的答案'),{target:{value:base}});
  fireEvent.submit(view.getByLabelText('你的答案').closest('form'));
  await waitFor(()=>assert.ok(view.getByText('拆步练习 · 第 1 / 1 步')));
  const before=JSON.parse(storage.getItem(KEY));
  fireEvent.change(view.getByLabelText('本步答案'),{target:{value:base.slice(0,-1)+'りない'}});
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  await waitFor(()=>assert.ok(view.getByText('拆步练习 · 第 1 / 4 步')));
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).byKc,before.byKc);
  const region=view.getByRole('region',{name:'拆步练习'});
  assert.match(region.textContent,/「り」/);assert.match(region.textContent,/仍是「ない」/);
  assert.equal(region.textContent.includes(conjugate(item.reading,item.class,form)),false);
  assert.equal(view.container.querySelector('.rule-line').parentElement.hidden,true);
  fireEvent.click(view.getByRole('button',{name:'练习下一步'}));
  const targets=[base.slice(0,-1)+'ら',base.slice(0,-1)+'らない',base.slice(0,-1)+'らなかった'];
  const wrong=[base.slice(0,-1)+'り',targets[0],targets[1]];
  const ids=['stem.godan.a','suffix.negative','adj.suffix.i-past'];
  for(let i=0;i<3;i++) {
    assert.match(region.textContent,/已提供正确输入和词类/);
    if(outcome==='skip'&&i===1){fireEvent.click(view.getByRole('button',{name:'跳过剩余拆步，查看解析'}));break;}
    const input=outcome==='malformed'?'xyz§':outcome==='wrong'?wrong[i]:targets[i];
    const prior=JSON.parse(storage.getItem(KEY));
    fireEvent.change(view.getByLabelText('本步答案'),{target:{value:input}});
    fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
    fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
    await waitFor(()=>assert.ok(view.container.querySelector('[data-diagnostic-next]')));
    const after=JSON.parse(storage.getItem(KEY));
    assertStepChanges(prior, after, outcome === 'malformed' ? [] : [ids[i]], outcome !== 'wrong');
    assert.equal(after.attempted,before.attempted);assert.equal(after.correct,before.correct);assert.equal(after.streak,before.streak);
    fireEvent.click(view.container.querySelector('[data-diagnostic-next]'));
  }
  await waitFor(()=>assert.equal(Boolean(view.queryByRole('region',{name:'拆步练习'})),false));
  await assertDiagnosticSummary(view,{skipped:outcome==='skip',updated:outcome!=='malformed'});
  assert.equal(view.container.querySelector('.next-button').disabled,false);
  for(const id of [`apply.tagaru.continuation`,`facet.apply.tagaru.negativePast`])assert.deepEqual(JSON.parse(storage.getItem(KEY)).byKc[id],before.byKc[id]);
});

test('invalid whole and probe input asks for re-entry without consuming a question, probe or evidence',async()=>{
  const {view}=await mountCompoundPast();
  const initial=storage.getItem(KEY);
  for(const value of [' 。 ','あ'.repeat(257)]) {
    fireEvent.change(view.getByLabelText('你的答案'),{target:{value}});
    fireEvent.submit(view.getByLabelText('你的答案').closest('form'));
    await waitFor(() => assert.ok(view.getByText(value.length>256?/输入过长/:/请输入答案后再检查/)));
    assertProgressUnchanged(initial);assert.equal(Boolean(view.queryByText('差一点')),false);
    const event = JSON.parse(storage.getItem(KEY)).practiceLog.events.at(-1);
    assert.equal(event.outcome, 'invalid'); assert.deepEqual(event.changes, []);
    assert.equal(event.answerTruncated, value.length > 256);
  }
  fireEvent.change(view.getByLabelText('你的答案'),{target:{value:'xyz§'}});
  fireEvent.submit(view.getByLabelText('你的答案').closest('form'));
  await waitFor(()=>assert.ok(view.getByRole('region',{name:'拆步练习'})));
  const before=storage.getItem(KEY),heading=view.getByRole('region',{name:'拆步练习'}).querySelector('h3').textContent;
  for(const value of [' 。 ','あ'.repeat(257)]) {
    fireEvent.change(view.getByLabelText('本步答案'),{target:{value}});
    fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
    await waitFor(() => assert.ok(view.getByText(value.length>256?/输入过长/:/请输入答案后再检查/)));
    assertProgressUnchanged(before);
    assert.equal(view.getByRole('region',{name:'拆步练习'}).querySelector('h3').textContent,heading);
    assert.equal(Boolean(view.container.querySelector('[data-diagnostic-next]')),false);
  }
});

test('a supplied negative records only assisted local evidence and asks for the remaining past on the page', async () => {
  const { view, item } = await mountCompoundPast('negativePast', 'verb', 'tagaru');
  const base = conjugate(item.reading, item.class, 'tagaru');
  const negative = conjugate(base, 'godan', 'negative');
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: base } });
  fireEvent.submit(view.getByLabelText('你的答案').closest('form'));
  await waitFor(() => assert.ok(view.getByText('拆步练习 · 第 1 / 1 步')));
  const before = JSON.parse(storage.getItem(KEY));
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: negative } });
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  await waitFor(() => assert.ok(view.getByText('拆步练习 · 第 1 / 2 步')));
  assert.match(view.getByRole('region', { name: '拆步练习' }).textContent, /已写对给定形式的否定变化/);
  const afterNegative = JSON.parse(storage.getItem(KEY));
  assertStepChanges(before, afterNegative, ['stem.godan.a', 'suffix.negative']);
  for (const id of ['adj.suffix.i-past', 'compound.negative-past', 'apply.tagaru.continuation', 'facet.apply.tagaru.negativePast'])
    assert.deepEqual(afterNegative.byKc[id], before.byKc[id]);
  fireEvent.keyDown(view.container.querySelector('[data-diagnostic-next]'), { key: 'Enter' });
  await waitFor(() => assert.ok(view.getByText('拆步练习 · 第 2 / 2 步')));
  assert.ok(view.container.querySelector('.diagnostic-word').textContent.includes(negative));
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: negative } });
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  await waitFor(() => assert.ok(view.getByRole('button', { name: /完成拆步/ })));
  const afterPast = JSON.parse(storage.getItem(KEY));
  assertStepChanges(afterNegative, afterPast, ['adj.suffix.i-past'], false);
  for (const key of ['attempted', 'correct', 'streak']) assert.equal(afterPast[key], before[key]);
  fireEvent.keyDown(view.getByRole('button', { name: /完成拆步/ }), { key: 'Enter' });
  await waitFor(() => assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false));
  await assertDiagnosticSummary(view, { skipped: false, updated: true });
  assert.equal(view.container.querySelector('.next-button').disabled, false);
});

test('an independent na-te analogue in katakana directly saves only its suffix error', async () => {
  const initial = masteredProfile();
  initial.byKc['adj.suffix.na-te'] = emptySkillStats();
  storage.setItem(KEY, JSON.stringify(initial));
  const view = await mount();
  const surface = view.container.querySelector('.word-display ruby').firstChild.textContent;
  const item = ADJECTIVE_KNOWLEDGE.exercises.find(e => e.item.surface === surface && e.form === 'adjectiveNaTe').item;
  const input = (item.reading + 'だて').replace(/[ぁ-ゖ]/g, kana => String.fromCharCode(kana.charCodeAt(0) + 0x60));
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: input } });
  fireEvent.submit(view.getByLabelText('你的答案').closest('form'));
  await waitFor(() => assert.ok(view.getByText('差一点')));
  assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false);
  const saved = JSON.parse(storage.getItem(KEY));
  assert.equal(saved.attempted, 1); assert.equal(saved.correct, 0);
  assert.deepEqual(Object.keys(saved.byKc).filter(id => JSON.stringify(saved.byKc[id]) !== JSON.stringify(initial.byKc[id])), ['adj.suffix.na-te']);
  assert.equal(view.container.querySelector('.next-button').disabled, false);
});

test('practice logs link original and expanded steps, show exact changes, and survive export and reload', async () => {
  const { view, item, form } = await mountCompoundPast('negative', 'verb', 'tagaru');
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: 'xyz§' } });
  fireEvent.submit(view.getByLabelText('你的答案').closest('form'));
  await waitFor(() => assert.ok(view.getByText('拆步练习 · 第 1 / 2 步')));
  const original = JSON.parse(storage.getItem(KEY)), base = conjugate(item.reading, item.class, 'tagaru');
  const firstScope = buildDiagnosticSteps(item, form)[0].kcIds;
  const inputs = [base, (base[0] === 'ふ' ? 'せ' : 'ふ') + base.slice(1, -1) + 'れない', base.slice(0, -1) + 'ら', base.slice(0, -1) + 'らない'];
  const changes = [firstScope, [], ['stem.godan.a'], ['suffix.negative']];
  for (const [index, input] of inputs.entries()) {
    const before = JSON.parse(storage.getItem(KEY));
    fireEvent.change(view.getByLabelText('本步答案'), { target: { value: input } });
    fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
    fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
    await waitFor(() => assert.ok(view.container.querySelector('[data-diagnostic-next]')));
    const current = JSON.parse(storage.getItem(KEY)), log = current.practiceLog.events.at(-1);
    assert.equal(current.practiceLog.events.length, index + 2);
    assert.equal(log.answer, input); assert.equal(log.target.stepIndex, index + 1);
    assert.deepEqual(log.changes, []);
    assert.deepEqual(log.assistedChanges.map(c => c.kcId), localPracticeIds(changes[index]));
    for (const c of log.assistedChanges) { assert.deepEqual(c.before, before.assessment.assistedByKc[c.kcId] ?? null); assert.deepEqual(c.after, current.assessment.assistedByKc[c.kcId]); }
    assert.equal(log.support.independent, false);
    assert.equal(log.assessment.before.pending, true); assert.equal(log.assessment.after.pending, true);
    assertStepChanges(before, current, changes[index]);
    assert.deepEqual(log.totals.before, log.totals.after);
    if (index === 1) { assert.equal(log.target.totalSteps, 2); assert.equal(log.target.nextTotalSteps, 4); }
    fireEvent.keyDown(view.container.querySelector('[data-diagnostic-next]'), { key: 'Enter' });
    if (index < 3) await waitFor(() => assert.equal(view.getByLabelText('本步答案').disabled, false));
  }
  await assertDiagnosticSummary(view, { updated: true });
  const saved = JSON.parse(storage.getItem(KEY)), events = saved.practiceLog.events;
  assert.equal(events.length, 6); assert.equal(new Set(events.map(e => e.questionId)).size, 1);
  assert.deepEqual(events.map(e => e.outcome), ['incorrect', 'correct', 'incorrect', 'correct', 'correct', 'completed']);
  assert.deepEqual(events.at(-1).changes, []);
  assert.equal(saved.attempted, original.attempted); assert.equal(saved.correct, original.correct);
  fireEvent.click(view.getByRole('button', { name: /知识进度 全部课程/ }));
  fireEvent.click(view.getByRole('tab', { name: '作答日志' }));
  const history = view.getByRole('region', { name: '作答日志' });
  assert.equal(history.querySelectorAll('details').length, 6);
  assert.match(history.textContent, /本次未更新独立掌握度/);
  assert.match(history.textContent, /辅助练习/);
  assert.ok(history.textContent.includes(inputs[1]));
  assert.deepEqual((await exportedProfile(view)).practiceLog, saved.practiceLog);
  cleanup();
  const reloaded = await mount();
  fireEvent.click(reloaded.getByRole('button', { name: /知识进度 全部课程/ }));
  fireEvent.click(reloaded.getByRole('tab', { name: '作答日志' }));
  assert.equal(reloaded.getByRole('region', { name: '作答日志' }).querySelectorAll('details').length, 6);
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).practiceLog, saved.practiceLog);
});

test('a storage failure keeps the score and matching log together in the downloadable memory copy', async () => {
  const initial = profile({ attempted: 12, correct: 10 });
  storage.setItem(KEY, JSON.stringify(initial));
  dom.window.Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
  const view = await mount();
  await classifyCorrect(view);
  assert.deepEqual(JSON.parse(storage.getItem(KEY)), initial);
  const exported = await exportedProfile(view, '导出本页记录');
  assert.equal(exported.attempted, 13); assert.equal(exported.practiceLog.events.length, 1);
  const event = exported.practiceLog.events[0];
  assert.equal(event.outcome, 'correct'); assert.equal(event.totals.before.attempted, 12); assert.equal(event.totals.after.attempted, 13);
  for (const change of event.changes) assert.deepEqual(change.after, exported.byKc[change.kcId]);
});

test('skips are logged without evidence, and the next original question receives a new identity', async () => {
  const { view } = await startDiagnosticPractice();
  const before = JSON.parse(storage.getItem(KEY));
  fireEvent.click(view.getByRole('button', { name: '跳过剩余拆步，查看解析' }));
  await assertDiagnosticSummary(view, { skipped: true, updated: false });
  const skipped = JSON.parse(storage.getItem(KEY));
  assertProgressUnchanged(before);
  assert.equal(skipped.practiceLog.events.at(-1).outcome, 'skipped');
  assert.deepEqual(skipped.practiceLog.events.at(-1).changes, []);
  fireEvent.click(view.container.querySelector('.next-button'));
  await waitFor(() => assert.ok(view.getByRole('button', { name: '不知道' })));
  fireEvent.click(view.getByRole('button', { name: '不知道' }));
  await waitFor(() => assert.ok(view.getByText('记住这个变化')));
  const events = JSON.parse(storage.getItem(KEY)).practiceLog.events;
  assert.equal(events.at(-1).outcome, 'revealed');
  assert.notEqual(events.at(-1).questionId, events[0].questionId);
});

for (const corrected of [true, false]) test(`whole past collision starts at the useful checks with no base credit (corrected=${corrected})`, async () => {
  const { view, item, form, initial } = await mountCompoundPast('past', 'verb', 'tagaru');
  const base = conjugate(item.reading, item.class, 'tagaru');
  const wrong = base.slice(0, -1) + 'た', correct = conjugate(item.reading, item.class, form);
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: wrong } });
  fireEvent.submit(view.getByLabelText('你的答案').closest('form'));
  fireEvent.submit(view.getByLabelText('你的答案').closest('form'));
  await waitFor(() => assert.ok(view.getByText('拆步练习 · 第 1 / 2 步')));
  const original = JSON.parse(storage.getItem(KEY));
  assert.deepEqual(original.byKc, initial.byKc);
  assert.equal(original.practiceLog.events.length, 1);
  assert.equal(original.practiceLog.events[0].diagnosis.resolution, 'stage-priority');
  assert.deepEqual(original.practiceLog.events[0].changes, []);
  assert.match(view.container.querySelector('.feedback-copy p').textContent, /前面的构成步骤未单独检查/);
  const region = view.getByRole('region', { name: '拆步练习' });
  assert.equal(Boolean(view.queryByLabelText('本步答案')), false);
  assert.equal(region.textContent.includes(correct), false);
  assert.equal(view.container.querySelector('.rule-line').parentElement.hidden, true);
  fireEvent.click(view.getByRole('button', { name: '五段动词' }));
  await waitFor(() => assert.ok(view.getByText(/本步只确认词类，不更新知识点掌握度/)));
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).byKc, initial.byKc);
  await waitFor(() => assert.equal(document.activeElement === view.getByRole('button', { name: '练习下一步' }), true));
  fireEvent.keyDown(document.activeElement, { key: 'Enter' });
  await waitFor(() => assert.ok(view.getByLabelText('本步答案')));
  assert.equal(region.textContent.includes(correct), false);
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: corrected ? correct : wrong } });
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  await waitFor(() => assert.ok(view.getByRole('button', { name: '完成拆步' })));
  const saved = JSON.parse(storage.getItem(KEY)), event = saved.practiceLog.events.at(-1);
  assert.equal(saved.practiceLog.events.length, 3);
  assert.deepEqual(event.changes, []);
  assert.deepEqual(new Set(event.assistedChanges.map(c => c.kcId)), new Set(corrected ? ['onbin.sokuon', 'suffix.past'] : ['onbin.sokuon']));
  assertStepChanges(original, saved, corrected ? ['onbin.sokuon', 'suffix.past'] : ['onbin.sokuon'], corrected);
  assert.equal(event.target.stepIndex, 2); assert.equal(event.target.totalSteps, 2);
  assert.equal(event.diagnosis.kcId, corrected ? null : 'onbin.sokuon');
  for (const id of ['class.ichidan', 'class.godan', 'heuristic.ru-ie', 'construction.tagaru', 'apply.tagaru.continuation', 'facet.apply.tagaru.past'])
    assert.deepEqual(saved.byKc[id], initial.byKc[id], id);
  assert.equal(saved.attempted, original.attempted); assert.equal(saved.correct, original.correct); assert.equal(saved.streak, original.streak);
  fireEvent.click(view.getByRole('button', { name: '完成拆步' }));
  await assertDiagnosticSummary(view, { updated: true });
  const events = JSON.parse(storage.getItem(KEY)).practiceLog.events;
  assert.equal(events.length, 4); assert.equal(new Set(events.map(e => e.questionId)).size, 1);
  assert.equal(events.at(-1).outcome, 'completed');
});

test('a complete sibling-form error stays pending after its focused practice and clears only after two other originals and a different-word independent retest', async () => {
  const { view, item, form, initial } = await mountCompoundPast('negative', 'verb', 'teiru');
  const source = displayedExercise(view);
  fireEvent.change(view.getByLabelText('你的答案'), { target: { value: conjugate(item.reading, item.class, 'teiruPast') } });
  fireEvent.submit(view.getByLabelText('你的答案').closest('form'));
  await waitFor(() => assert.ok(view.getByText('拆步练习 · 第 1 / 1 步')));
  assert.match(view.container.querySelector('.feedback-copy p').textContent, /过去形.*否定形/);
  const failed = JSON.parse(storage.getItem(KEY)), pendingKey = Object.keys(failed.assessment.pending)[0];
  assert.equal(Object.keys(failed.assessment.pending).length, 1);
  assert.deepEqual(failed.byKc, initial.byKc);
  assert.deepEqual(failed.practiceLog.events[0].changes, []);
  assert.equal(failed.practiceLog.events[0].diagnosis.resolution, 'stage-priority');
  const region = view.getByRole('region', { name: '拆步练习' });
  assert.ok(region.querySelector('.diagnostic-word').textContent.includes(conjugate(item.surface, item.class, 'teiru')));
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: conjugate(item.reading, item.class, form) } });
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  await waitFor(() => assert.ok(view.getByRole('button', { name: /完成拆步/ })));
  const practiced = JSON.parse(storage.getItem(KEY));
  assertStepChanges(failed, practiced, ['stem.ichidan.drop-ru', 'suffix.negative']);
  assert.equal(practiced.assessment.byTarget[pendingKey].independentCorrect, 0);
  assert.equal(practiced.assessment.byTarget[pendingKey].assistedStepCorrect, 1);
  fireEvent.click(view.getByRole('button', { name: /完成拆步/ }));
  await assertDiagnosticSummary(view, { updated: true });
  await next(view);
  for (let index = 0; index < 2; index++) {
    assert.match(view.container.querySelector('.practice-notice').textContent, /间隔练习/);
    assert.ok(JSON.parse(storage.getItem(KEY)).assessment.pending[pendingKey]);
    await answerDisplayedCorrectly(view);
    const spaced = JSON.parse(storage.getItem(KEY)), event = spaced.practiceLog.events.at(-1);
    assert.notEqual(event.assessment.targetKey, pendingKey, 'spacing must use another target');
    assert.ok(spaced.assessment.pending[pendingKey]);
    assert.equal(spaced.assessment.originalCount, index + 2);
    await next(view);
  }
  assert.match(view.container.querySelector('.practice-notice').textContent, /独立复测/);
  const retest = displayedExercise(view);
  assert.equal(retest.form, form);
  assert.notEqual(retest.item.reading, item.reading, 'another spelling of the same word is insufficient');
  assert.deepEqual(localPracticeIds(retest.kcIds).sort(), localPracticeIds(source.kcIds).sort());
  const beforeRetest = JSON.parse(storage.getItem(KEY));
  await answerDisplayedCorrectly(view);
  const saved = JSON.parse(storage.getItem(KEY)), event = saved.practiceLog.events.at(-1);
  assert.equal(saved.assessment.pending[pendingKey], undefined);
  assert.equal(saved.assessment.byTarget[pendingKey].eligibleRetestCorrect, 1);
  assert.equal(event.support.independent, true);
  assert.equal(event.assessment.before.pending, true); assert.equal(event.assessment.after.pending, false);
  assert.equal(event.assessment.eligibility.eligible, true);
  assert.equal(saved.assessment.originalCount, 4); assert.equal(saved.attempted, 4); assert.equal(saved.correct, 3);
  assert.equal(saved.byKc['apply.teiru.continuation'].correct, beforeRetest.byKc['apply.teiru.continuation'].correct + 1);
  assert.deepEqual(saved.assessment.assistedByKc, beforeRetest.assessment.assistedByKc);
});

test('v7 export and UI import preserve assisted records, pending retests and logs without replaying historical work', async () => {
  const { view, steps } = await startDiagnosticPractice();
  fireEvent.change(view.getByLabelText('本步答案'), { target: { value: steps[0].readings[0] } });
  fireEvent.submit(view.getByLabelText('本步答案').closest('form'));
  await waitFor(() => assert.ok(view.getByText(/本步正确，已记录辅助练习/)));
  fireEvent.click(view.getByRole('button', { name: '跳过剩余拆步，查看解析' }));
  await assertDiagnosticSummary(view, { skipped: true, updated: true });
  const saved = JSON.parse(storage.getItem(KEY));
  fireEvent.click(view.getByRole('button', { name: /知识进度 全部课程/ }));
  fireEvent.click(view.getByRole('tab', { name: /待复测 1/ }));
  assert.match(view.getByRole('region', { name: '待独立复测' }).textContent, /先完成 2 道其他整题/);
  const backup = await exportedProfile(view);
  assert.equal(backup.version, 7); assert.deepEqual(backup.assessment, saved.assessment);
  cleanup(); storage.clear();
  const fresh = await mount();
  fireEvent.click(fresh.getByRole('button', { name: /知识进度 全部课程/ }));
  const oldConfirm = window.confirm;
  window.confirm = () => true;
  try {
    fireEvent.change(fresh.container.querySelector('input[type="file"]'), { target: { files: [{ name: 'progress.json', text: async () => JSON.stringify(backup) }] } });
    await waitFor(() => assert.deepEqual(JSON.parse(storage.getItem(KEY)).assessment, saved.assessment));
  } finally { window.confirm = oldConfirm; }
  const imported = JSON.parse(storage.getItem(KEY));
  assert.deepEqual(imported.byKc, saved.byKc); assert.deepEqual(imported.practiceLog, saved.practiceLog);
  assert.match(fresh.container.querySelector('.practice-notice').textContent, /间隔练习/);
  cleanup();
  const reloaded = await mount();
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).assessment, saved.assessment);
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).practiceLog, saved.practiceLog);
  assert.match(reloaded.container.querySelector('.practice-notice').textContent, /间隔练习/);
});

test('opening a hint without submitting persists exposure and pending status across reload', async () => {
  const { view, initial } = await mountCompoundPast('past', 'verb', 'teageru');
  await showHint(view);
  const hinted = JSON.parse(storage.getItem(KEY)), event = hinted.practiceLog.events.at(-1);
  assert.equal(event.type, 'hint'); assert.equal(event.outcome, 'shown');
  assert.equal(event.support.independent, false);
  assert.deepEqual(event.changes, []); assert.deepEqual(event.assistedChanges, []);
  assert.deepEqual(hinted.byKc, initial.byKc);
  assert.equal(hinted.attempted, 0); assert.equal(hinted.assessment.originalCount, 0);
  const pendingKey = Object.keys(hinted.assessment.pending)[0];
  assert.equal(Object.keys(hinted.assessment.pending).length, 1);
  fireEvent.click(view.getByRole('button', { name: '收起提示' }));
  assert.equal(storage.getItem(KEY), JSON.stringify(hinted), 'collapsing a hint cannot erase its exposure');
  cleanup();
  const reloaded = await mount();
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).assessment.pending, hinted.assessment.pending);
  assert.match(reloaded.container.querySelector('.practice-notice').textContent, /间隔练习/);
  assert.equal(Boolean(reloaded.queryByText('收起提示')), false);
  await answerDisplayedCorrectly(reloaded);
  const saved = JSON.parse(storage.getItem(KEY));
  assert.ok(saved.assessment.pending[pendingKey]);
  assert.equal(saved.assessment.originalCount, 1);
  assert.notEqual(saved.practiceLog.events.at(-1).assessment.targetKey, pendingKey);
  assert.equal(saved.assessment.byTarget[pendingKey]?.eligibleRetestCorrect ?? 0, 0);
});

for (const offscreen of [true,false]) test(`feedback is brought into view only when needed (${offscreen}) without moving keyboard focus`, async()=>{
  const rect=dom.window.HTMLElement.prototype.getBoundingClientRect;
  const scroll=dom.window.HTMLElement.prototype.scrollIntoView;
  const calls=[];
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
    if(this.classList.contains('feedback'))return {top:offscreen?700:100,bottom:offscreen?1000:400,height:300,left:0,right:800,width:800,x:0,y:0,toJSON(){return {};}};
    return rect.call(this);
  };
  dom.window.HTMLElement.prototype.scrollIntoView=function(options){calls.push({element:this,options});};
  try {
    const view=await mount();
    assert.equal(view.container.querySelector('.focus-panel'),null);
    assert.ok(view.container.querySelector('.current-course-name'));
    await classifyCorrect(view);
    await act(async()=>{await new Promise(resolve=>requestAnimationFrame(resolve));});
    const feedback=view.container.querySelector('.feedback');
    assert.equal(calls.filter(call=>call.element===feedback).length,Number(offscreen));
    if(offscreen)assert.equal(calls.find(call=>call.element===feedback).options.block,'nearest');
    assert.equal(JSON.parse(storage.getItem(KEY)).attempted,1);
    assert.equal(document.activeElement===view.container.querySelector('.next-button'),false);
  } finally {
    dom.window.HTMLElement.prototype.getBoundingClientRect=rect;
    if(scroll)dom.window.HTMLElement.prototype.scrollIntoView=scroll;else delete dom.window.HTMLElement.prototype.scrollIntoView;
  }
});
