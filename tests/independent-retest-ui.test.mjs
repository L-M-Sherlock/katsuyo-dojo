import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { assessmentTarget, emptyAssessment, recordIndependentAttempt, recordHintExposure } from '../app/lib/learning-assessment.mjs';
import { emptyPracticeLog } from '../app/lib/practice-log.mjs';
import { UNIFIED_COURSES, CURRICULUM_VERSION } from '../app/lib/unified-curriculum.mjs';
import { createUnifiedExport } from '../app/lib/unified-profile.mjs';
import { exerciseKey, wordKey } from '../app/lib/exercise-selection.mjs';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { conjugate } from '../app/lib/conjugation.mjs';
import { conjugateAdjective } from '../app/lib/adjective-conjugation.mjs';

// Use the actual page and its rendered data-form to identify questions.
const pageUrl = new URL('../app/page.tsx', import.meta.url);
const compiled = ts.transpileModule(await readFile(pageUrl, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replace(/from ["']([^"']+)["']/g, (_match, specifier) =>
  `from ${JSON.stringify(specifier.startsWith('.') ? new URL(specifier, pageUrl).href : import.meta.resolve(specifier))}`);
const { default: Page, KNOWLEDGE, ALL_KCS } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/katsuyo-dojo/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'StorageEvent']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
for (const key of ['requestAnimationFrame', 'cancelAnimationFrame', 'addEventListener', 'removeEventListener']) globalThis[key] = dom.window[key].bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement, StrictMode } = await import('react');
const { render, cleanup, fireEvent, waitFor, configure, act } = await import('@testing-library/react');
configure({ asyncUtilTimeout: 8000 });
const KEY = 'katsuyo-practice-profile-v7';
const storage = window.localStorage;
const originalGet = dom.window.Storage.prototype.getItem;
const originalSet = dom.window.Storage.prototype.setItem;
const originalConfirm = window.confirm;
let locks;

beforeEach(() => {
  storage.clear(); locks = Promise.resolve();
  window.confirm = () => true;
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_key, callback) => {
    const result = locks.then(callback); locks = result.catch(() => {}); return result;
  } } });
});
afterEach(() => {
  cleanup();
  dom.window.Storage.prototype.getItem = originalGet;
  dom.window.Storage.prototype.setItem = originalSet;
  window.confirm = originalConfirm;
});
after(() => dom.window.close());

const dateKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const stats = { attempts: 5, correct: 5, filteredAccuracy: 1, confidence: 1, bestConfidence: 1, cleanTimeTotal: 0, cleanTimeCount: 0 };
const catalog = (surface, form) => {
  const result = KNOWLEDGE.exercises.find(exercise => exercise.item.surface === surface && exercise.form === form);
  assert.ok(result, `${surface}/${form} is in the real exercise catalog`);
  return result;
};
const noru = catalog('乗る', 'teiruNegative'), toru = catalog('取る', 'teiruNegative');
const targetKey = assessmentTarget(noru).key;
const fillerExamples = [catalog('書く', 'masu'), catalog('見る', 'tai')];
const original = (state, exercise, correct, at = new Date(Date.now() - 3_600_000).toISOString()) => recordIndependentAttempt(state, {
  exercise, correct, questionId: `seed-${state.originalCount + 1}`, at,
});
function profile({ mastered = true, assessment = emptyAssessment(), recentWordKeys = [], ...rest } = {}) {
  return { version: 7, curriculumVersion: CURRICULUM_VERSION, date: dateKey(), attempted: 0, correct: 0, streak: 0,
    rotation: 0, byKc: mastered ? Object.fromEntries(ALL_KCS.map(kc => [kc.id, { ...stats }])) : {},
    introducedKcIds: mastered ? ALL_KCS.filter(kc => kc.gating).map(kc => kc.id) : [ALL_KCS.find(kc => kc.gating).id],
    accessibleCourseIds: [], coursePractice: {}, recentWordKeys, practiceLog: emptyPracticeLog(), assessment, legacy: null, migration: null, ...rest };
}
function readyProfile() {
  let assessment = original(emptyAssessment(), toru, false);
  for (const filler of fillerExamples) assessment = original(assessment, filler, true);
  // Recent real-word history makes 乗る the first available different word;
  // this is ordinary stored input, not a test override to the page's planner.
  const beforeNoru = KNOWLEDGE.exercises.filter(exercise => {
    const target = assessmentTarget(exercise);
    return target.key === targetKey && target.wordKey < assessmentTarget(noru).wordKey;
  }).map(wordKey);
  return profile({ assessment, recentWordKeys: [...new Set(beforeNoru)] });
}
const saved = () => JSON.parse(storage.getItem(KEY));
async function mount() {
  const view = render(createElement(StrictMode, null, createElement(Page)));
  await waitFor(() => assert.equal(Boolean(view.queryByText('正在加载学习进度……')), false));
  assert.equal(Boolean(view.container.querySelector('.practice-controls')?.disabled), false);
  return view;
}
function currentExercise(view) {
  const ruby = view.container.querySelector('.word-display ruby');
  assert.ok(ruby, 'a real original question is shown');
  const surface = ruby.firstChild.textContent;
  const label = view.container.querySelector('.question-kicker')?.children[1]?.textContent;
  const isClassQuestion = !view.container.querySelector('#answer');
  const formId = view.container.querySelector('.exercise-card').getAttribute('data-form');
  const exercise = KNOWLEDGE.exercises.find(candidate => candidate.item.surface === surface &&
    (isClassQuestion ? candidate.form === null : candidate.form === formId));
  assert.ok(exercise, `${surface}/${label} identifies a current catalog original`);
  return exercise;
}
function correctText(exercise) {
  const item = exercise.item;
  return item.domain === 'adjective'
    ? conjugateAdjective({ ...item, surface: item.reading }, exercise.form)
    : conjugate(item.reading, item.class, exercise.form);
}
function submitText(view, text, double = false) {
  const input = view.getByLabelText('你的答案');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest('form'));
  if (double) fireEvent.submit(input.closest('form'));
}
async function answerCorrect(view) {
  const exercise = currentExercise(view), before = saved().attempted;
  if (exercise.form) submitText(view, correctText(exercise));
  else {
    const choices = exercise.item.domain === 'verb' ? ['ichidan', 'godan', 'irregular'] : ['i', 'na'];
    fireEvent.click(view.container.querySelector(`[data-class-shortcut="${choices.indexOf(exercise.item.class) + 1}"]`));
  }
  await waitFor(() => assert.equal(saved().attempted, before + 1));
  return exercise;
}
async function next(view) {
  fireEvent.click(view.container.querySelector('.next-button'));
  await waitFor(() => assert.equal(Boolean(view.container.querySelector('.feedback')), false));
}
async function exportThroughUI(view) {
  if (!view.queryByRole('dialog')) fireEvent.click(view.container.querySelector('.progress-trigger'));
  let blob;
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL, click = dom.window.HTMLAnchorElement.prototype.click;
  URL.createObjectURL = value => { blob = value; return 'blob:independent-retest'; };
  URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  try {
    fireEvent.click(view.getByRole('button', { name: '导出数据', exact: true }));
    assert.ok(blob);
    return JSON.parse(await blob.text());
  } finally { URL.createObjectURL = create; URL.revokeObjectURL = revoke; dom.window.HTMLAnchorElement.prototype.click = click; }
}
async function importThroughUI(view, envelope) {
  if (!view.queryByRole('dialog')) fireEvent.click(view.container.querySelector('.progress-trigger'));
  const input = view.container.querySelector('input[type="file"]');
  const file = { name: 'independent-retest.json', text: async () => JSON.stringify(envelope) };
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => assert.equal(view.container.querySelector('.transfer-notice')?.classList.contains('success'), true));
  fireEvent.click(view.container.querySelector('.progress-drawer header button[aria-label="关闭知识进度"]'));
}

test('independent page routes 乗る past-for-negative to tail only, preserves mastery through probes, then schedules spaced transfer', async () => {
  const baseline = readyProfile(); storage.setItem(KEY, JSON.stringify(baseline));
  const view = await mount();
  assert.equal(currentExercise(view).id, noru.id);
  submitText(view, 'のっていた', true);
  await waitFor(() => assert.equal(saved().attempted, 1));
  const afterOriginal = saved();
  assert.equal(afterOriginal.practiceLog.events.filter(event => event.type === 'question').length, 1);
  assert.equal(afterOriginal.assessment.pending[targetKey].lastWordKey, assessmentTarget(noru).wordKey);
  const steps = createAnswerAnalyzer(noru.item, noru.form)('のっていた').steps;
  assert.equal(steps.length, 1, 'the base ている construction must not be asked again');
  const region = view.getByRole('region', { name: '拆步练习' });
  assert.match(region.textContent, /のっている/);
  const input = view.getByLabelText('本步答案');
  fireEvent.change(input, { target: { value: 'のっていない' } });
  fireEvent.submit(input.closest('form')); fireEvent.submit(input.closest('form'));
  await waitFor(() => assert.equal(saved().practiceLog.events.filter(event => event.type === 'step').length, 1));
  assert.deepEqual(saved().byKc, afterOriginal.byKc, 'given intermediate input cannot increase independent mastery');
  assert.ok(saved().assessment.assistedByKc['suffix.negative']);
  assert.equal(saved().assessment.independentByKc['apply.teiru.continuation'], undefined);
  fireEvent.click(view.container.querySelector('[data-diagnostic-next]'));
  await waitFor(() => assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false));
  assert.ok(saved().assessment.pending[targetKey]);
  assert.equal(saved().attempted, 1);
  assert.equal(saved().correct, 0);
  await next(view);
  for (let i = 0; i < 2; i++) {
    assert.notEqual(assessmentTarget(currentExercise(view)).key, targetKey, `spacing original ${i + 1} must use another target`);
    await answerCorrect(view); await next(view);
  }
  const retest = currentExercise(view);
  assert.equal(assessmentTarget(retest).key, targetKey);
  assert.notEqual(assessmentTarget(retest).wordKey, assessmentTarget(noru).wordKey);
  await answerCorrect(view);
  const finished = saved();
  assert.equal(finished.assessment.pending[targetKey], undefined);
  assert.equal(finished.assessment.byTarget[targetKey].eligibleRetestCorrect, 1);
  assert.equal(finished.attempted, 4, 'probes do not inflate original question totals');
  assert.equal(finished.correct, 3);
  const finalEvent = finished.practiceLog.events.at(-1);
  assert.equal(finalEvent.support.independent, true);
});

test('independent page keeps hinted new-word correctness out of mastery and retest success after the hint is collapsed', async () => {
  const initial = readyProfile(); storage.setItem(KEY, JSON.stringify(initial));
  const view = await mount();
  fireEvent.click(view.getByRole('button', { name: '看一条提示' }));
  await waitFor(() => assert.ok(view.getByRole('button', { name: '收起提示' })));
  fireEvent.click(view.getByRole('button', { name: '收起提示' }));
  await answerCorrect(view);
  const after = saved();
  assert.ok(after.assessment.pending[targetKey]);
  assert.deepEqual(after.byKc, initial.byKc);
  assert.deepEqual(after.coursePractice, initial.coursePractice);
  assert.equal(after.assessment.byTarget[targetKey].eligibleRetestCorrect, 0);
  assert.equal(after.assessment.byTarget[targetKey].independentCorrect, 0);
  assert.equal(after.practiceLog.events.at(-1).support.source, 'hinted');
  assert.equal(after.practiceLog.events.at(-1).support.independent, false);
  await next(view);
  assert.notEqual(assessmentTarget(currentExercise(view)).key, targetKey);
});

test('independent page preserves waiting originals across reload and exports then restores resolved state without reopening history', async () => {
  storage.setItem(KEY, JSON.stringify(readyProfile()));
  let view = await mount();
  const waitingExport = await exportThroughUI(view);
  assert.ok(waitingExport.profile.assessment.pending[targetKey]);
  cleanup(); storage.clear(); storage.setItem(KEY, JSON.stringify(profile()));
  view = await mount();
  await importThroughUI(view, waitingExport);
  assert.equal(assessmentTarget(currentExercise(view)).key, targetKey);
  await answerCorrect(view);
  assert.equal(saved().assessment.pending[targetKey], undefined);
  const resolved = await exportThroughUI(view);
  assert.equal(resolved.profile.assessment.byTarget[targetKey].eligibleRetestCorrect, 1);
  cleanup(); storage.clear(); storage.setItem(KEY, JSON.stringify(profile()));
  view = await mount();
  await importThroughUI(view, resolved);
  assert.equal(saved().assessment.pending[targetKey], undefined);
  assert.equal(saved().assessment.byTarget[targetKey].eligibleRetestCorrect, 1);
  cleanup();
  view = await mount();
  assert.equal(saved().assessment.pending[targetKey], undefined);
  assert.equal(saved().assessment.byTarget[targetKey].eligibleRetestCorrect, 1);
  assert.ok(view.container.querySelector('.word-display'));
});

test('independent page reopens a specialist with actual-course filler then presents its pending target at the first eligible slot', async () => {
  const assessment = original(emptyAssessment(), noru, false);
  storage.setItem(KEY, JSON.stringify(profile({ assessment })));
  const view = await mount();
  const aspect = UNIFIED_COURSES.find(course => course.id === 'aspect');
  const button = [...view.container.querySelectorAll('.mode-list button')].find(node => node.querySelector('.course-name')?.textContent.includes(aspect.title));
  assert.ok(button && !button.disabled);
  fireEvent.click(button);
  await waitFor(() => assert.equal(button.classList.contains('active'), true));
  for (let i = 0; i < 2; i++) {
    const exercise = currentExercise(view);
    assert.notEqual(assessmentTarget(exercise).key, targetKey);
    assert.equal(exercise.courseId, 'aspect');
    await answerCorrect(view);
    assert.equal(saved().practiceLog.events.at(-1).exercise.courseId, exercise.courseId);
    await next(view);
  }
  assert.equal(assessmentTarget(currentExercise(view)).key, targetKey);
  assert.notEqual(assessmentTarget(currentExercise(view)).wordKey, assessmentTarget(noru).wordKey);
  assert.ok(saved().assessment.pending[targetKey]);
});

test('independent page can space a fresh classification failure using real other class targets without requiring prior mastery', async () => {
  storage.setItem(KEY, JSON.stringify(profile({ mastered: false })));
  const view = await mount();
  const failed = currentExercise(view), key = assessmentTarget(failed).key;
  assert.equal(failed.form, null);
  const wrong = [...view.container.querySelectorAll('[data-class-shortcut]')].find((_, index) => ['ichidan', 'godan', 'irregular'][index] !== failed.item.class);
  fireEvent.click(wrong);
  await waitFor(() => assert.equal(saved().attempted, 1));
  assert.ok(saved().assessment.pending[key]);
  await next(view);
  for (let i = 0; i < 2; i++) {
    assert.notEqual(assessmentTarget(currentExercise(view)).key, key, 'a new learner must not be trapped repeatedly rehearsing the pending class');
    await answerCorrect(view); await next(view);
  }
  assert.equal(assessmentTarget(currentExercise(view)).key, key);
  assert.notEqual(assessmentTarget(currentExercise(view)).wordKey, assessmentTarget(failed).wordKey);
  await answerCorrect(view);
  assert.equal(saved().assessment.pending[key], undefined);
});

test('independent page storage conflict preserves newer pending state and rejects the whole stale correct snapshot', async () => {
  const initial = readyProfile(); storage.setItem(KEY, JSON.stringify(initial));
  const view = await mount(), shown = currentExercise(view);
  const external = { ...initial, assessment: original(initial.assessment, catalog('読む', 'past'), false), attempted: 9, correct: 4 };
  storage.setItem(KEY, JSON.stringify(external));
  submitText(view, correctText(shown));
  await waitFor(() => assert.equal(view.container.querySelector('.practice-controls')?.disabled, true));
  assert.deepEqual(saved(), external);
  assert.ok(saved().assessment.pending[targetKey]);
  assert.equal(saved().practiceLog.events.length, 0);
});

test('independent page quota failure keeps the complete updated assessment and log exportable in memory', async () => {
  const initial = readyProfile(); storage.setItem(KEY, JSON.stringify(initial));
  const view = await mount();
  dom.window.Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
  submitText(view, 'のっていた');
  await waitFor(() => assert.ok(view.container.querySelector('.feedback')));
  assert.deepEqual(saved(), initial, 'failed local save does not partly overwrite its prior snapshot');
  const envelope = await exportThroughUI(view);
  assert.equal(envelope.profile.attempted, 1);
  assert.equal(envelope.profile.assessment.originalCount, initial.assessment.originalCount + 1);
  assert.equal(envelope.profile.assessment.pending[targetKey].lastWordKey, assessmentTarget(noru).wordKey);
  assert.equal(envelope.profile.practiceLog.events.length, 1);
  assert.ok(view.getByRole('alert'));
});

test('independent page keeps lifetime retest spacing through daily reset and backup import', async () => {
  const old = readyProfile(); old.date = '2026-01-01'; old.attempted = 18; old.correct = 12; old.streak = 2;
  storage.setItem(KEY, JSON.stringify(profile()));
  const view = await mount();
  await importThroughUI(view, createUnifiedExport(old));
  assert.equal(saved().attempted, 0);
  assert.equal(saved().correct, 0);
  assert.equal(saved().assessment.originalCount, 3);
  assert.equal(assessmentTarget(currentExercise(view)).key, targetKey);
  await answerCorrect(view);
  assert.equal(saved().assessment.pending[targetKey], undefined);
  assert.equal(saved().attempted, 1);
});

test('independent page persists reading a pending-target hint before submission so refresh cannot turn it into independent success', async () => {
  const initial = readyProfile(); storage.setItem(KEY, JSON.stringify(initial));
  let view = await mount();
  assert.equal(currentExercise(view).id, noru.id);
  fireEvent.click(view.getByRole('button', { name: '看一条提示' }));
  await waitFor(() => assert.ok(view.container.querySelector('.hint-box')));
  cleanup();
  view = await mount();
  assert.notEqual(assessmentTarget(currentExercise(view)).key, targetKey, 'unsubmitted hint exposure must survive remount and reopen the spacing requirement');
  assert.equal(saved().assessment.originalCount, initial.assessment.originalCount);
  assert.equal(saved().assessment.pending[targetKey].lastPresentedOrdinal, initial.assessment.originalCount);
  assert.deepEqual(saved().byKc, initial.byKc);
  await answerCorrect(view);
  assert.ok(saved().assessment.pending[targetKey], 'answering the intervening original must not clear the hinted target');
  await next(view);
  assert.notEqual(assessmentTarget(currentExercise(view)).key, targetKey);
  await answerCorrect(view); await next(view);
  const transfer = assessmentTarget(currentExercise(view));
  assert.equal(transfer.key, targetKey);
  assert.notEqual(transfer.wordKey, assessmentTarget(noru).wordKey, 'the hinted but unsubmitted word is not a fresh transfer word');
  assert.notEqual(transfer.wordKey, assessmentTarget(toru).wordKey, 'the earlier failed word is also excluded');
  await answerCorrect(view);
  assert.equal(saved().assessment.pending[targetKey], undefined);
});

test('independent page saves an unsubmitted first hint as pending exposure without inventing a failure or original attempt', async () => {
  const initial = profile(); storage.setItem(KEY, JSON.stringify(initial));
  let view = await mount();
  const exposed = currentExercise(view), key = assessmentTarget(exposed).key;
  fireEvent.click(view.getByRole('button', { name: '看一条提示' }));
  await waitFor(() => assert.ok(view.container.querySelector('.hint-box')));
  assert.ok(saved().assessment.pending[key]);
  assert.equal(saved().assessment.pending[key].failures, 0);
  assert.equal(saved().assessment.originalCount, 0);
  assert.equal(saved().attempted, 0);
  assert.deepEqual(saved().byKc, initial.byKc);
  assert.equal(saved().assessment.byTarget[key].independentAttempts, 0);
  fireEvent.click(view.getByRole('button', { name: '收起提示' }));
  const eventCount = saved().practiceLog.events.length;
  assert.equal(eventCount, 1, 'closing the hint does not append another exposure');
  cleanup();
  view = await mount();
  for (let i = 0; i < 2; i++) {
    assert.notEqual(assessmentTarget(currentExercise(view)).key, key);
    await answerCorrect(view); await next(view);
  }
  assert.equal(assessmentTarget(currentExercise(view)).key, key);
  assert.notEqual(assessmentTarget(currentExercise(view)).wordKey, assessmentTarget(exposed).wordKey);
  await answerCorrect(view);
  assert.equal(saved().assessment.pending[key], undefined);
  assert.equal(saved().assessment.byTarget[key].independentAttempts, 1);
  assert.equal(saved().assessment.byTarget[key].eligibleRetestCorrect, 1);
  assert.equal(saved().attempted, 3);
});

test('independent page keeps a last-question failure visible and scheduled after the round ends', async () => {
  storage.setItem(KEY, JSON.stringify(profile({coursePractice:{voiceCompound: KNOWLEDGE.exercises.filter(e=>e.courseId==='voiceCompound').slice(0,12).map(exerciseKey)}})));
  const view = await mount();
  for (let i = 0; i < 11; i++) { await answerCorrect(view); await next(view); }
  assert.match(view.container.querySelector('.stage-meta').textContent, /12.*12/);
  const failed = currentExercise(view), key = assessmentTarget(failed).key;
  assert.equal(failed.form, null);
  const choices = failed.item.domain === 'verb' ? ['ichidan', 'godan', 'irregular'] : ['i', 'na'];
  const wrongIndex = choices.findIndex(choice => choice !== failed.item.class);
  fireEvent.click(view.container.querySelector(`[data-class-shortcut="${wrongIndex + 1}"]`));
  await waitFor(() => assert.equal(saved().attempted, 12));
  await next(view);
  const completion = view.container.querySelector('.completion-card');
  assert.match(completion.textContent, /待独立复测/);
  assert.doesNotMatch(completion.textContent, /全部知识点已达标|全部已达标/);
  fireEvent.click(view.container.querySelector('.restart-button'));
  await waitFor(() => assert.ok(view.container.querySelector('.word-display')));
  assert.ok(saved().assessment.pending[key]);
  for (let i = 0; i < 2; i++) {
    assert.notEqual(assessmentTarget(currentExercise(view)).key, key);
    await answerCorrect(view); await next(view);
  }
  assert.equal(assessmentTarget(currentExercise(view)).key, key);
  assert.notEqual(assessmentTarget(currentExercise(view)).wordKey, assessmentTarget(failed).wordKey);
});

test('independent page shows count-only singleton retests and keeps unrelated courses open', async () => {
  const iku = catalog('行く', 'past'), key = assessmentTarget(iku).key;
  let assessment = original(emptyAssessment(), iku, false, new Date().toISOString());
  for (const filler of fillerExamples) assessment = original(assessment, filler, true);
  storage.setItem(KEY, JSON.stringify(profile({ assessment })));
  let view = await mount();
  assert.equal(assessmentTarget(currentExercise(view)).key, key, 'two other questions suffice without elapsed time');
  const classifyCourse = UNIFIED_COURSES.find(course => course.id === 'classify');
  const classifyButton = [...view.container.querySelectorAll('.mode-list button')].find(node => node.querySelector('.course-name')?.textContent.includes(classifyCourse.title));
  assert.equal(classifyButton.disabled, false);
  assert.doesNotMatch(classifyButton.querySelector('i').textContent, /待复测/);
  fireEvent.click(view.container.querySelector('.progress-trigger'));
  fireEvent.click(view.getByRole('tab', { name: '待复测 1', exact: true }));
  assert.match(view.container.querySelector('.pending-retests').textContent, /无需等待/);
  assert.doesNotMatch(view.container.querySelector('.pending-retests').textContent, /最早时间|24 小时/);
  fireEvent.click(view.container.querySelector('.progress-drawer header button[aria-label="关闭知识进度"]'));
  fireEvent.click(view.getByRole('button', { name: '结束本轮', exact: true }));
  await waitFor(() => assert.ok(view.container.querySelector('.completion-card')));
  assert.doesNotMatch(view.container.querySelector('.completion-card').textContent, /全部知识点已达标|全部已达标/);
  cleanup();

  const old = new Date(Date.now() - 25 * 3_600_000).toISOString();
  assessment = original(emptyAssessment(), iku, false, old);
  for (const filler of fillerExamples) assessment = original(assessment, filler, true, old);
  storage.setItem(KEY, JSON.stringify(profile({ assessment })));
  view = await mount();
  assert.equal(currentExercise(view).id, iku.id);
  assert.match(view.container.querySelector('.focus-panel').textContent, /独立复测/);
  await answerCorrect(view);
  assert.equal(saved().assessment.pending[key], undefined);
  assert.equal(saved().practiceLog.events.at(-1).assessment.eligibility.policy, 'single-word-spaced');
});

test('independent page reads legacy storage once and never lets an old tab overwrite its new assessment snapshot', async () => {
  const legacy = profile({coursePractice:{voiceCompound: KNOWLEDGE.exercises.filter(e=>e.courseId==='voiceCompound').slice(0,12).map(exerciseKey)}}); legacy.version = 6; delete legacy.assessment;
  const legacyKey = 'katsuyo-practice-profile-v6', raw = JSON.stringify(legacy);
  storage.setItem(legacyKey, raw);
  const view = await mount();
  const exercise = currentExercise(view);
  assert.equal(exercise.form, null);
  const wrongIndex = ['ichidan', 'godan', 'irregular'].findIndex(choice => choice !== exercise.item.class);
  fireEvent.click(view.container.querySelector(`[data-class-shortcut="${wrongIndex + 1}"]`));
  await waitFor(() => assert.equal(saved()?.version, 7));
  assert.equal(storage.getItem(legacyKey), raw);
  const current = saved();
  assert.ok(current.assessment.pending[assessmentTarget(exercise).key]);
  storage.setItem(legacyKey, JSON.stringify({ ...legacy, attempted: 99 }));
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: legacyKey, newValue: storage.getItem(legacyKey), storageArea: storage })));
  assert.deepEqual(saved(), current);
  assert.equal(view.container.querySelector('.practice-controls').disabled, false);
  assert.match(view.getByRole('alert').textContent, /旧版标签页/);
});

test('independent page reaches a qualified retest in the real two-word いい family through explicitly unqualified rehearsal', async () => {
  const good = catalog('いい', 'adjectivePast'), cool = catalog('かっこいい', 'adjectivePast');
  const key = assessmentTarget(good).key;
  assert.equal(assessmentTarget(cool).key, key);
  const group = KNOWLEDGE.exercises.filter(exercise => assessmentTarget(exercise).key === key);
  assert.equal(new Set(group.map(exercise => assessmentTarget(exercise).wordKey)).size, 2);
  let assessment = original(emptyAssessment(), good, false);
  for (const filler of fillerExamples) assessment = original(assessment, filler, true);
  assessment = recordHintExposure(assessment, { exercise: cool, questionId: 'cool-unsubmitted', eventId: 'cool-hint', at: new Date(Date.now() - 1_800_000).toISOString() });
  for (const filler of fillerExamples) assessment = original(assessment, filler, true);
  const initial = profile({ assessment }); storage.setItem(KEY, JSON.stringify(initial));
  const view = await mount();
  assert.equal(currentExercise(view).id, good.id);
  assert.match(view.container.querySelector('.focus-panel').textContent, /巩固练习/);
  assert.match(view.container.querySelector('.focus-panel').textContent, /不计独立掌握/);
  await answerCorrect(view);
  assert.ok(saved().assessment.pending[key]);
  assert.deepEqual(saved().byKc, initial.byKc);
  assert.equal(saved().practiceLog.events.at(-1).support.source, 'rehearsal');
  assert.equal(saved().practiceLog.events.at(-1).support.independent, false);
  await next(view);
  for (let i = 0; i < 2; i++) {
    assert.notEqual(assessmentTarget(currentExercise(view)).key, key);
    await answerCorrect(view); await next(view);
  }
  assert.equal(currentExercise(view).id, cool.id);
  assert.match(view.container.querySelector('.focus-panel').textContent, /独立复测/);
  await answerCorrect(view);
  assert.equal(saved().assessment.pending[key], undefined);
  assert.equal(saved().assessment.byTarget[key].eligibleRetestCorrect, 1);
});

test('independent page retains pending when probes are skipped or a round is ended before completing them', async () => {
  for (const exit of ['skip', 'finish-round']) {
    storage.setItem(KEY, JSON.stringify(readyProfile()));
    const view = await mount();
    submitText(view, 'のっていた');
    await waitFor(() => assert.equal(saved().attempted, 1));
    const originalSnapshot = saved();
    assert.ok(view.queryByRole('region', { name: '拆步练习' }));
    if (exit === 'skip') {
      fireEvent.click(view.getByRole('button', { name: '跳过剩余拆步，查看解析', exact: true }));
      await waitFor(() => assert.equal(Boolean(view.queryByRole('region', { name: '拆步练习' })), false));
      assert.equal(saved().practiceLog.events.at(-1).outcome, 'skipped');
      await next(view);
    } else {
      fireEvent.click(view.getByRole('button', { name: '结束本轮', exact: true }));
      await waitFor(() => assert.ok(view.container.querySelector('.completion-card')));
      assert.match(view.container.querySelector('.completion-card').textContent, /待独立复测/);
      fireEvent.click(view.container.querySelector('.restart-button'));
      await waitFor(() => assert.ok(view.container.querySelector('.word-display')));
    }
    assert.ok(saved().assessment.pending[targetKey], exit);
    assert.equal(saved().assessment.originalCount, originalSnapshot.assessment.originalCount, exit);
    assert.equal(saved().attempted, 1, exit);
    assert.deepEqual(saved().byKc, originalSnapshot.byKc, exit);
    assert.notEqual(assessmentTarget(currentExercise(view)).key, targetKey, exit);
    cleanup();
  }
});

test('independent page clears pending only through the explicit all-progress reset and keeps it cleared after reload', async () => {
  storage.setItem(KEY, JSON.stringify(readyProfile()));
  let view = await mount();
  fireEvent.click(view.getByRole('button', { name: '清除本地进度', exact: true }));
  await waitFor(() => assert.equal(saved().assessment.originalCount, 0));
  assert.deepEqual(saved().assessment.pending, {});
  assert.deepEqual(saved().assessment.byTarget, {});
  assert.deepEqual(saved().byKc, {});
  assert.equal(saved().practiceLog.events.length, 0);
  cleanup();
  view = await mount();
  assert.deepEqual(saved().assessment.pending, {});
  assert.ok(view.container.querySelector('.word-display'));
});

for (const mode of ['adaptive', 'giving']) test(`giving recovery in ${mode} uses real classification and completes the retained course`, async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/giving-recovery-profile.json', import.meta.url), 'utf8')).profile;
  storage.setItem(KEY, JSON.stringify({ ...fixture, date: dateKey(), practiceGoalCourseId: 'giving' }));
  let view = await mount();
  if (mode === 'giving') {
    fireEvent.click([...view.container.querySelectorAll('.mode-list button')].find(button => button.textContent.includes('授受表达')));
    await waitFor(() => assert.ok(view.container.querySelector('.mode-list button.active')?.textContent.includes('授受表达')));
  }
  const { summarizeUnifiedCourse } = await import('../app/lib/unified-progress.mjs');
  const giving = UNIFIED_COURSES.find(c => c.id === 'giving');
  const byId = new Map(ALL_KCS.map(kc => [kc.id, kc]));
  const components = KNOWLEDGE.courseKcIds.giving.map(id => byId.get(id));
  const status = () => summarizeUnifiedCourse(giving, components, saved().introducedKcIds, saved());
  const baselineAttempts = saved().attempted;
  const seen = [];
  let resumed = false;
  assert.equal(status().mastered, 18);
  for (let i = 0; i < 24 && !status().complete; i++) {
    assert.match(view.container.querySelector('.focus-panel strong').textContent, /授受表达/);
    const exercise = currentExercise(view);
    seen.push(exercise);
    if (exercise.form === null) {
      assert.match(view.container.querySelector('.focus-panel').textContent, /补基础/);
      assert.doesNotMatch(view.container.querySelector('.focus-panel').textContent, /一段动词|五段动词|不规则动词/, 'the independent classification answer must not be disclosed');
      assert.ok(['ichidan','i'].includes(exercise.item.class));
    }
    await answerCorrect(view);
    if (status().complete) break;
    if (mode === 'adaptive' && !resumed && saved().byKc['apply.tekureru.continuation']?.confidence === 1) {
      assert.equal(saved().practiceGoalCourseId, 'giving');
      cleanup(); view = await mount(); resumed = true;
      assert.match(view.container.querySelector('.focus-panel strong').textContent, /授受表达/);
      continue;
    }
    fireEvent.click(view.container.querySelector('.next-button'));
    await waitFor(() => assert.ok(view.container.querySelector('.completion-card') || !view.container.querySelector('.feedback')));
    if (view.container.querySelector('.completion-card')) {
      fireEvent.click(view.container.querySelector('.restart-button'));
      await waitFor(() => assert.ok(view.container.querySelector('.exercise-card')));
    }
  }
  if (mode === 'adaptive') assert.equal(resumed, true);
  assert.equal(status().complete, true, `stalled after ${seen.length} questions`);
  assert.equal(status().mastered, 25);
  assert.equal(saved().attempted, baselineAttempts + seen.length);
  assert.equal(seen.filter(exercise => exercise.form === null && exercise.item.domain === 'verb').length, 2);
  assert.equal(seen.filter(exercise => exercise.form === null && exercise.item.domain === 'adjective').length, mode === 'adaptive' ? 3 : 0);
  for (const form of ['temorauPast', 'temorauNegativePast', 'tekureruPast', 'tekureruNegative', 'tekureruNegativePast']) assert.ok(seen.some(e => e.form === form), form);
  assert.ok(saved().byKc['class.ichidan'].confidence === 1);
  assert.ok(saved().practiceLog.events.every(e => e.type === 'question' && e.support.independent));
  assert.deepEqual(saved().assessment.pending, {});
  console.log(`giving recovery ${mode}: ${seen.length} independent correct originals`);
});

test('a genuine cross-course classification regression is scheduled before the retained new course without revealing the answer', async () => {
  const initial = profile({ practiceGoalCourseId: 'direction' });
  initial.byKc['adj.class.i'] = { ...stats, attempts: 6, filteredAccuracy: .8, confidence: .8 / .85, bestConfidence: 1 };
  for (const id of ['apply.teiku.continuation', 'apply.tekuru.continuation']) {
    initial.byKc[id] = { ...stats, attempts: 0, correct: 0, filteredAccuracy: null, confidence: 0, bestConfidence: 0 };
    for (const facet of ALL_KCS.find(kc => kc.id === id).coverageKcIds) initial.byKc[facet] = { ...initial.byKc[id] };
  }
  storage.setItem(KEY, JSON.stringify(initial));
  const view = await mount();
  for (let i = 0; i < 2; i++) {
    const e = currentExercise(view);
    assert.equal(e.courseId, 'adjectiveClassify'); assert.equal(e.form, null);
    assert.match(view.container.querySelector('.focus-panel').textContent, /之前退步/);
    assert.doesNotMatch(view.container.querySelector('.focus-panel').textContent, /い形容词|な形容词/);
    await answerCorrect(view); await next(view);
  }
  assert.equal(saved().byKc['adj.class.i'].confidence, 1);
  assert.equal(saved().practiceGoalCourseId, 'direction');
  assert.equal(currentExercise(view).courseId, 'direction');
});

test('the actual page corrects an old nara classification penalty and exports an idempotent 6/6 profile', async () => {
  const { oldVersionedNaraProfile } = await import('./helpers/nara-profile.mjs');
  const old = oldVersionedNaraProfile(KNOWLEDGE);
  const initial = profile({ ...old, date: dateKey(), byKc: { ...profile().byKc, ...old.byKc } });
  storage.setItem(KEY, JSON.stringify(initial));
  const view = await mount();
  assert.ok(view.getByText('旧归因记录已校正'));
  const exported = (await exportThroughUI(view)).profile;
  assert.equal(exported.byKc['adj.class.i'].confidence, 1);
  assert.equal(exported.assessment.independentByKc['adj.class.i'], undefined);
  assert.equal(exported.practiceLog.events.at(-1).diagnosis.resolution, 'score-correction');
  assert.deepEqual(exported.practiceLog.events.slice(0, initial.practiceLog.events.length), initial.practiceLog.events);
  const { summarizeUnifiedCourse } = await import('../app/lib/unified-progress.mjs');
  const kcs = KNOWLEDGE.courseKcIds.adjectiveIBase.map(id => ALL_KCS.find(kc => kc.id === id));
  assert.equal(summarizeUnifiedCourse(UNIFIED_COURSES.find(c => c.id === 'adjectiveIBase'), kcs, exported.introducedKcIds, exported).mastered, 6);
  cleanup(); storage.setItem(KEY, JSON.stringify(exported));
  const reloaded = await mount();
  assert.equal(reloaded.queryByText('旧归因记录已校正'), null);
  const repeated = (await exportThroughUI(reloaded)).profile;
  assert.deepEqual(repeated, exported);
});

test('the conditional question specifies ba and a nara answer never penalizes classification or conditional rules', async () => {
  const initial = profile({ practiceGoalCourseId: 'adjectiveConditional' });
  initial.byKc['adj.suffix.i-ba'] = { ...stats, attempts: 0, correct: 0, filteredAccuracy: null, confidence: 0, bestConfidence: 0 };
  storage.setItem(KEY, JSON.stringify(initial));
  const view = await mount(), exercise = currentExercise(view);
  assert.equal(exercise.form, 'adjectiveBa'); assert.equal(exercise.item.class, 'i');
  assert.match(view.container.querySelector('.instruction').textContent, /ば条件形/);
  submitText(view, exercise.item.reading + 'なら');
  await waitFor(() => assert.equal(saved().attempted, 1));
  assert.deepEqual(saved().byKc, initial.byKc);
  const event = saved().practiceLog.events.at(-1);
  assert.equal(event.target.label, 'ば条件形');
  assert.equal(event.diagnosis.kcId, null); assert.equal(event.diagnosis.resolution, 'target-form');
  assert.match(view.container.querySelector('.feedback-copy').textContent, /い形容词も|い形容词也/);
  assert.doesNotMatch(view.container.querySelector('.feedback-copy').textContent, /套用了な形容词/);
});

for (const choice of ['godan', 'ichidan']) test(`借りる diagnostic asks ある class (${choice}) before the past rule and preserves source mastery`, async () => {
  const kariru = catalog('借りる', 'tearuPast'), source = catalog('見る', 'tearuPast');
  const key = assessmentTarget(kariru).key;
  let assessment = original(emptyAssessment(), source, false);
  for (const filler of fillerExamples) assessment = original(assessment, filler, true);
  const earlier = KNOWLEDGE.exercises.filter(e => assessmentTarget(e).key === key && assessmentTarget(e).wordKey < assessmentTarget(kariru).wordKey).map(wordKey);
  storage.setItem(KEY, JSON.stringify(profile({ assessment, recentWordKeys: [...new Set(earlier)] })));
  const view = await mount();
  assert.equal(currentExercise(view).id, kariru.id);
  const before = saved();
  submitText(view, 'ありてあた');
  await waitFor(() => assert.equal(saved().attempted, 1));
  const submitStep = async (text, outcome) => {
    const total = saved().practiceLog.totalEvents;
    const input = view.getByLabelText('本步答案');
    fireEvent.change(input, { target: { value: text } }); fireEvent.submit(input.closest('form'));
    await waitFor(() => assert.equal(saved().practiceLog.totalEvents, total + 1));
    assert.equal(saved().practiceLog.events.at(-1).outcome, outcome);
  };
  const advanceStep = async () => {
    fireEvent.click(view.container.querySelector('[data-diagnostic-next]'));
    await waitFor(() => assert.equal(view.container.querySelector('[data-diagnostic-next]'), null));
  };
  await submitStep('ありてある', 'typo');
  assert.deepEqual(saved().byKc, before.byKc);
  await submitStep('かりてある', 'correct'); await advanceStep();
  await submitStep('かりてあた', 'incorrect'); await advanceStep();
  const region = view.getByRole('region', { name: '拆步练习' });
  assert.match(region.textContent, /末尾「ある」/);
  assert.equal(view.queryByLabelText('本步答案'), null);
  const prompts = [...region.querySelectorAll(':scope > p')].map(p => p.textContent).join('');
  assert.doesNotMatch(prompts, /五段|一段/, 'do not reveal the class before the choice');
  const previous = saved();
  fireEvent.click(region.querySelectorAll('.class-options button')[choice === 'godan' ? 0 : 1]);
  await waitFor(() => assert.equal(saved().practiceLog.totalEvents, previous.practiceLog.totalEvents + 1));
  const classEvent = saved().practiceLog.events.at(-1);
  assert.equal(classEvent.target.kind, 'classification');
  assert.equal(classEvent.outcome, choice === 'godan' ? 'correct' : 'incorrect');
  assert.deepEqual(classEvent.target.kcIds, []);
  assert.deepEqual(classEvent.changes, []); assert.deepEqual(classEvent.assistedChanges, []);
  assert.deepEqual(saved().byKc, before.byKc);
  await advanceStep();
  assert.match(region.textContent, /已提供词类：五段动词/);
  await submitStep('かりてあた', 'incorrect');
  const pastEvent = saved().practiceLog.events.at(-1);
  assert.equal(pastEvent.diagnosis.kcId, 'onbin.sokuon');
  assert.deepEqual(pastEvent.assistedChanges.map(c => c.kcId), ['onbin.sokuon']);
  assert.deepEqual(saved().byKc, before.byKc);
  assert.ok(saved().assessment.pending[key]);
  assert.equal(saved().attempted, 1); assert.equal(saved().correct, 0);
});

test('nakute grouped probes and ahead-of-step retries preserve scoring and allow resubmission', async () => {
  const target = catalog('渡る','nakute');
  let assessment = original(emptyAssessment(), target, false);
  for (const filler of fillerExamples) assessment = original(assessment, filler, true);
  const key = assessmentTarget(target).key;
  const initial = profile({assessment});
  storage.setItem(KEY,JSON.stringify(initial));
  const view = await mount(), exercise = currentExercise(view);
  assert.equal(exercise.form,'nakute');
  // Use the selected same-rule word; the diagnostic behavior must generalize.
  const negative = deriveUnified(exercise.item,'negative').answer;
  const negativeKana = deriveUnified({...exercise.item,surface:exercise.item.reading},'negative').answer;
  const root = negativeKana.slice(0,-3);
  assert.ok(negative);
  submitText(view,root+'りなくて');
  await waitFor(()=>assert.equal(saved().attempted,1));
  const submitStep = async answer => {
    const count = saved().practiceLog.totalEvents;
    const input = view.getByLabelText('本步答案');
    fireEvent.change(input,{target:{value:answer}});fireEvent.submit(input.closest('form'));
    await waitFor(()=>assert.equal(saved().practiceLog.totalEvents,count+1));
  };
  const advance = async () => {
    fireEvent.click(view.container.querySelector('[data-diagnostic-next]'));
    await waitFor(()=>assert.equal(view.container.querySelector('[data-diagnostic-next]'),null));
  };
  assert.match(view.getByRole('region',{name:'拆步练习'}).textContent,/否定形/);
  await submitStep(negativeKana);await advance();
  await submitStep('xyz');await advance();
  const before = saved();
  await submitStep(negativeKana.slice(0,-1)+'くて');
  const event = saved().practiceLog.events.at(-1);
  assert.equal(event.diagnosis.resolution,'step-ahead');
  assert.deepEqual(event.changes,[]);assert.deepEqual(event.assistedChanges,[]);
  assert.deepEqual(saved().assessment.assistedByKc,before.assessment.assistedByKc);
  assert.deepEqual(saved().assessment.independentByKc,before.assessment.independentByKc);
  assert.equal(saved().assessment.byTarget[key].assistedStepAttempts,before.assessment.byTarget[key].assistedStepAttempts);
  assert.deepEqual(saved().byKc,before.byKc);
  assert.match(view.getByRole('region',{name:'拆步练习'}).textContent,/后续步骤的正确形式/);
  await submitStep(negativeKana.slice(0,-1)+'く');
  assert.equal(saved().practiceLog.events.at(-1).outcome,'correct');
  assert.ok(saved().assessment.pending[key]);
});

test('voice continuation skills belong to the voice application course and existing mastery needs no new review quota', async () => {
  const initial = profile();
  initial.byKc['apply.potential.continuation'] = {...stats, attempts:0, correct:0, confidence:0, bestConfidence:0, filteredAccuracy:null};
  storage.setItem(KEY,JSON.stringify(initial));
  const view = await mount();
  assert.equal(view.container.querySelector('.focus-panel strong').textContent,'可能与态的后续活用');
  assert.equal(view.container.querySelector('.completion-card'),null);
  assert.equal(currentExercise(view).courseId,'voiceCompound');
  await answerCorrect(view);
  assert.ok(saved().byKc['apply.potential.continuation'].attempts>0);
});

test('after masu completion adaptive resumes partially learned adjectives before new verb negatives', async () => {
  const initial=profile({practiceGoalCourseId:'masu'});
  initial.byKc['adj.class.i']={...stats,attempts:2,correct:2,confidence:2/4.25,bestConfidence:2/4.25};
  for(const id of ['adj.class.na','stem.godan.a','suffix.negative'])initial.byKc[id]={...stats,attempts:0,correct:0,confidence:0,bestConfidence:0,filteredAccuracy:null};
  initial.introducedKcIds=initial.introducedKcIds.filter(id=>id!=='adj.class.na');
  storage.setItem(KEY,JSON.stringify(initial));
  const view=await mount();
  assert.equal(currentExercise(view).courseId,'adjectiveClassify');
  assert.equal(currentExercise(view).item.class,'i');
  assert.match(view.container.querySelector('.focus-panel').textContent,/形容词分类/);
  await answerCorrect(view);await next(view);
  assert.equal(currentExercise(view).courseId,'adjectiveClassify');
  assert.equal(saved().byKc['stem.godan.a'].attempts,0);
});

for(const [form,kc] of [['temiruDesirePast','compound.chain.temiru-desire-past'],['passiveProgressivePast','compound.chain.passive-progressive-past'],['causativeReceivePast','compound.chain.causative-receive-past']])test(`new chain ${form} renders three guided stages without awarding independent application`,async()=>{
  const initial=profile({practiceGoalCourseId:'multiStepCompound'});
  initial.byKc[kc]={...stats,attempts:0,correct:0,filteredAccuracy:null,confidence:0,bestConfidence:0};
  storage.setItem(KEY,JSON.stringify(initial));

  const view=await mount(),exercise=currentExercise(view);

  assert.equal(exercise.form,form);
  const before=saved();
  const plan=createAnswerAnalyzer(exercise.item,form)('xyz').steps;
  assert.equal(plan.length,3);

  submitText(view,'xyz');await waitFor(()=>assert.equal(saved().attempted,1));
  for(const step of plan){

    const total=saved().practiceLog.totalEvents;
    const input=view.getByLabelText('本步答案');
    fireEvent.change(input,{target:{value:step.readings[0]}});fireEvent.submit(input.closest('form'));
    await waitFor(()=>assert.equal(saved().practiceLog.totalEvents,total+1));
    assert.equal(saved().practiceLog.events.at(-1).outcome,'correct');
    fireEvent.click(view.container.querySelector('[data-diagnostic-next]'));
    await waitFor(()=>assert.equal(Boolean(view.container.querySelector('[data-diagnostic-next]')),false));
  }
  assert.deepEqual(saved().byKc,before.byKc);
  assert.equal(saved().assessment.assistedByKc[kc],undefined);
  assert.equal(saved().correct,0);assert.equal(saved().attempted,1);
  assert.ok(saved().assessment.pending[assessmentTarget(exercise).key]);
});

test('knowledge progress nests coverage under its declared parent without duplicate rows or score changes',async()=>{
  storage.setItem(KEY,JSON.stringify(profile()));
  const view=await mount(),before=saved();
  fireEvent.click(view.container.querySelector('.progress-trigger'));
  fireEvent.click(view.getByRole('tab',{name:'按知识点',exact:true}));
  const list=view.container.querySelector('.atomic-progress-list');
  for(const base of ['tai','tehoshii']) {
    const id=`apply.${base}.continuation`;
    const group=list.querySelector(`[data-coverage-parent="${id}"]`);
    assert.ok(group);
    const expected=ALL_KCS.find(kc=>kc.id===id).coverageKcIds;
    assert.deepEqual([...group.querySelectorAll('.knowledge-coverage-children [data-kc-id]')].map(row=>row.dataset.kcId),expected);
    for(const child of expected)assert.equal(list.querySelectorAll(`[data-kc-id="${child}"]`).length,1);
  }
  const rendered=[...list.querySelectorAll('[data-kc-id]')].map(row=>row.dataset.kcId);
  assert.equal(new Set(rendered).size,ALL_KCS.length);
  assert.equal(rendered.length,ALL_KCS.length);
  // A coverage item's original family does not prevent nesting under its parent.
  const past=ALL_KCS.find(kc=>kc.id==='suffix.past');
  const pastGroup=list.querySelector('[data-coverage-parent="suffix.past"]');
  for(const child of past.coverageKcIds)assert.ok(pastGroup.querySelector(`[data-kc-id="${child}"]`));
  fireEvent.click(view.getByRole('tab',{name:'按课程',exact:true}));
  const courseList=view.container.querySelector('.course-progress-list');
  const taiGroup=courseList.querySelector('[data-coverage-parent="apply.tai.continuation"]');
  assert.equal(taiGroup.querySelectorAll('.knowledge-coverage-children [data-kc-id]').length,3);
  assert.deepEqual(saved(),before);
});
