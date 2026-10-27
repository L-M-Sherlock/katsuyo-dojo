import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { emptySkillStats } from '../app/lib/adaptive.mjs';
import { emptyAssessment, recordIndependentAttempt, assessmentTarget } from '../app/lib/learning-assessment.mjs';
import { emptyPracticeLog } from '../app/lib/practice-log.mjs';
import { CURRICULUM_VERSION } from '../app/lib/unified-curriculum.mjs';
import { EXPECTED_CURRENT_FORM_HOLDS, EXPECTED_DEFERRED_COMPONENT_IDS } from './helpers/four-form-teaching-hold-scope.mjs';

// Use the same actual-page compilation and DOM driver as page-interactions
// and independent-retest-ui. All stored records below are synthetic fixtures.
const pageUrl = new URL('../app/page.tsx', import.meta.url);
const compiled = ts.transpileModule(await readFile(pageUrl, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replace(/from ["']([^"']+)["']/g, (_match, specifier) =>
  `from ${JSON.stringify(specifier.startsWith('.') ? new URL(specifier, pageUrl).href : import.meta.resolve(specifier))}`);
const { default: Page, KNOWLEDGE, ALL_KCS } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/katsuyo-dojo/zh-CN/', pretendToBeVisual: true,
});
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'StorageEvent']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
for (const key of ['requestAnimationFrame', 'cancelAnimationFrame', 'addEventListener', 'removeEventListener']) {
  globalThis[key] = dom.window[key].bind(dom.window);
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement, StrictMode } = await import('react');
const { render, cleanup, fireEvent, waitFor, configure } = await import('@testing-library/react');
configure({ asyncUtilTimeout: 8000 });
const storage = window.localStorage;
const KEY = 'katsuyo-practice-profile-v8';
let lockTail;
beforeEach(() => {
  storage.clear();
  lockTail = Promise.resolve();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_key, callback) => {
    const job = lockTail.then(callback);
    lockTail = job.catch(() => {});
    return job;
  } } });
});
afterEach(cleanup);
after(() => dom.window.close());

function historicalProfile() {
  const date = new Date(), at = new Date(date.getTime() - 3_600_000).toISOString();
  const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  let assessment = emptyAssessment();
  for (const form of EXPECTED_CURRENT_FORM_HOLDS) {
    const exercise = KNOWLEDGE.registryExercises.find(candidate => candidate.form === form && candidate.item.surface === '書く');
    assert.ok(exercise, form);
    assessment = recordIndependentAttempt(assessment, { exercise, questionId: `historical:${form}`,
      correct: false, failedKcIds: exercise.kcIds.filter(id => EXPECTED_DEFERRED_COMPONENT_IDS.has(id)), at });
  }
  const failed = { ...emptySkillStats(), attempts: 1, correct: 0, filteredAccuracy: 0 };
  assessment.independentByKc['exception.aru-negative'] = { ...failed };
  return { version: 7, curriculumVersion: CURRICULUM_VERSION, date: today, attempted: 5, correct: 0,
    streak: 0, rotation: 0, byKc: Object.fromEntries([...EXPECTED_DEFERRED_COMPONENT_IDS].map(id => [id, { ...failed }])),
    introducedKcIds: [...ALL_KCS.filter(kc => kc.gating).map(kc => kc.id), 'exception.aru-negative'],
    assessment, accessibleCourseIds: [], coursePractice: {}, recentWordKeys: [],
    practiceLog: emptyPracticeLog(), legacy: null, migration: null };
}

async function exportedProfile(view, name) {
  let blob;
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  const click = dom.window.HTMLAnchorElement.prototype.click;
  URL.createObjectURL = value => { blob = value; return 'blob:four-form-hold-ui'; };
  URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  try {
    fireEvent.click(view.getByRole('button', { name, exact: true }));
    await waitFor(() => assert.ok(blob));
    return JSON.parse(await blob.text()).profile;
  } finally {
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    dom.window.HTMLAnchorElement.prototype.click = click;
  }
}

for (const { locale, title, knowledgeTab, exportButton, unlockedLabel } of [
  { locale: 'zh-CN', title: '知识进度', knowledgeTab: '按知识点', exportButton: '导出数据', unlockedLabel: '已解锁知识点' },
  { locale: 'en', title: 'Knowledge progress', knowledgeTab: 'By knowledge', exportButton: 'Export data', unlockedLabel: 'Unlocked knowledge' },
]) {
  test(`${locale} progress hides held knowledge while UI export preserves its historical records`, async () => {
    window.history.replaceState(null, '', `/katsuyo-dojo/${locale}/`);
    const source = historicalProfile(), before = structuredClone(source);
    storage.setItem(KEY, JSON.stringify(source));
    const view = render(createElement(StrictMode, null, createElement(Page)));
    await waitFor(() => assert.equal(Boolean(view.queryByText(locale === 'en' ? 'Loading learning progress…' : '正在加载学习进度……')), false));
    await waitFor(() => assert.ok(view.container.querySelector('.progress-trigger')));
    if (locale === 'en') await waitFor(() => assert.equal(Boolean(view.queryByText('Loading English usage cards…')), false));
    fireEvent.click(view.container.querySelector('.progress-trigger'));
    const drawer = view.getByRole('dialog', { name: title });
    const unlocked = [...drawer.querySelectorAll('.progress-summary > div')]
      .find(element => element.querySelector('span')?.textContent === unlockedLabel);
    assert.ok(unlocked);
    await waitFor(() => assert.equal(unlocked.querySelector('strong').textContent, '131', 'current unlocked count excludes the historical held gate'));
    for (const id of EXPECTED_DEFERRED_COMPONENT_IDS) {
      assert.equal(drawer.querySelector(`[data-kc-id="${id}"]`), null, `${locale}: ${id} must not be a current course row`);
    }
    fireEvent.click(view.getByRole('tab', { name: knowledgeTab, exact: true }));
    const list = drawer.querySelector('.atomic-progress-list');
    assert.ok(list);
    const visibleIds = new Set([...list.querySelectorAll('[data-kc-id]')].map(row => row.getAttribute('data-kc-id')));
    assert.deepEqual(visibleIds, new Set(ALL_KCS.filter(kc => !EXPECTED_DEFERRED_COMPONENT_IDS.has(kc.id)).map(kc => kc.id)),
      'every still-taught knowledge row remains available');
    for (const id of EXPECTED_DEFERRED_COMPONENT_IDS) {
      assert.equal(visibleIds.has(id), false, `${locale}: ${id} must not be a current knowledge row`);
      assert.ok(ALL_KCS.some(kc => kc.id === id), `${id} remains available for historical lookup`);
    }
    for (const id of ['suffix.negative', 'adj.suffix.i-past', 'construction.tearu', 'facet.apply.tearu.past']) {
      assert.equal(visibleIds.has(id), true, `${locale}: ${id} remains in the current list`);
    }
    const exported = await exportedProfile(view, exportButton);
    assert.deepEqual(exported.byKc, source.byKc);
    for (const field of ['byTarget', 'independentByKc', 'assistedByKc', 'originalCount', 'seenQuestionIds']) {
      assert.deepEqual(exported.assessment[field], source.assessment[field], field);
    }
    for (const pending of Object.values(source.assessment.pending)) {
      const key = assessmentTarget(KNOWLEDGE.registryExercises.find(exercise => exercise.form === pending.target.form
        && exercise.item.surface === pending.target.surface)).key;
      assert.equal(exported.assessment.pending[key], undefined);
      const { suspension, ...retained } = exported.assessment.suspendedPending[key];
      assert.equal(suspension.reason, 'no-eligible-exercise');
      assert.deepEqual(retained, pending, 'failure anchors and failed KC IDs remain unchanged');
      assert.equal(exported.assessment.byTarget[key].eligibleRetestCorrect, 0);
    }
    assert.ok(exported.introducedKcIds.includes('exception.aru-negative'), 'the original introduced ID remains in backup history');
    assert.deepEqual(source, before);
  });
}
