import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import StatisticsPage, {STATISTICS_MESSAGES} from '../app/lib/statistics-page.mjs';
import { emptyStatistics } from '../app/lib/statistics.mjs';
import {createI18n} from '../app/lib/i18n/core.mjs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/katsuyo-dojo/en/#/stats' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, cleanup } = await import('@testing-library/react');
afterEach(cleanup);
after(() => dom.window.close());

function fixture() {
  const statistics = emptyStatistics('2026-09-15T01:00:00.000Z');
  Object.assign(statistics.totals, {
    questions: 1234,
    correct: 9,
    independent: 10,
    independentCorrect: 8,
    activeMs: 3_600_000,
    answerMs: 5_000,
    answerSamples: 2,
    hints: 3,
  });
  statistics.ordinal = 1234;
  statistics.errors = { 'target-form': 2, unattributed: 1, 'kc:kc.test': 3 };
  statistics.kcErrors = { 'kc.test': 3 };
  const component = { id: 'kc.test', label: '中文知识点', gating: true, firstCourseId: 'course.test', order: 1, coverageKcIds: [] };
  const course = { id: 'course.test', title: '中文课程', domain: 'verb', review: false };
  return {
    profile: {
      statistics,
      introducedKcIds: [component.id],
      byKc: { [component.id]: { attempts: 1, correct: 0, confidence: 0.4, filteredAccuracy: 0 } },
      accessibleCourseIds: [course.id],
      assessment: { pending: {}, suspendedPending: {} },
      coursePractice: {},
    },
    model: { components: [component], courseKcIds: { [course.id]: [component.id] } },
    courses: [course],
  };
}

function mount(props = {}) {
  return render(createElement(StatisticsPage, {
    ...fixture(),
    onBack() {},
    onKnowledge() {},
    ...props,
  }));
}

test('English statistics localizes visible copy, dynamic labels, formats, and ARIA text', () => {
  const view = mount({
    locale: 'en',
    courseLabel: () => 'Past tense',
    knowledgeLabel: () => 'Past suffix',
  });
  assert.ok(view.getByRole('heading', { name: 'Learning statistics', level: 1 }));
  assert.ok(view.getByRole('group', { name: 'Statistics scope' }));
  assert.ok(view.getByRole('button', { name: 'Back to practice' }));
  assert.match(view.container.textContent, /1,234/);
  assert.match(view.container.textContent, /1\.0 hours/);
  assert.match(view.container.textContent, /Sep 15, 2026/);
  assert.match(view.container.textContent, /Past tense/);
  assert.match(view.container.textContent, /Past suffix/);
  assert.match(view.container.textContent, /Answered with a different complete form/);
  assert.match(view.container.textContent, /No specific cause identified/);
  assert.match(view.container.textContent, /Mastered 0\/1/);
  assert.doesNotMatch(view.container.textContent, /\p{Script=Han}/u);
  for (const element of view.container.querySelectorAll('[aria-label]')) assert.doesNotMatch(element.getAttribute('aria-label'), /\p{Script=Han}/u);
});

test('statistics uses full-key translator overrides and falls back for missing keys', () => {
  const view = mount({ locale: 'en', t: (key) => key === 'statistics.title' ? 'Progress evidence' : key });
  assert.ok(view.getByRole('heading', { name: 'Progress evidence', level: 1 }));
  assert.ok(view.getByText('Practice trends'));
});

test('Chinese remains the default locale', () => {
  const view = mount();
  assert.ok(view.getByRole('heading', { name: '学习统计', level: 1 }));
  assert.ok(view.getByRole('group', { name: '统计范围' }));
  assert.ok(view.getByText('中文课程'));
  assert.ok(view.getAllByText('中文知识点').length >= 1);
});

test('exported statistics messages work as complete locale catalogs', () => {
  const i18n = createI18n({locale: 'en', catalogs: STATISTICS_MESSAGES});
  const view = mount({locale: i18n.locale, t: i18n.t, courseLabel: () => 'Past tense', knowledgeLabel: () => 'Past suffix'});
  assert.ok(view.getByRole('heading', {name: 'Learning statistics', level: 1}));
  assert.match(view.container.textContent, /1,234/);
});

test('English statistics normalizes locale tags and rejects a Chinese catalog fallback', () => {
  const view = mount({locale: 'en-US', t: () => '缺少翻译', courseLabel: () => 'Past tense', knowledgeLabel: () => 'Past suffix'});
  assert.ok(view.getByRole('heading', {name: 'Learning statistics', level: 1}));
  assert.doesNotMatch(view.container.textContent, /缺少翻译/);
  for (const element of view.container.querySelectorAll('[aria-label]')) assert.doesNotMatch(element.getAttribute('aria-label'), /缺少翻译/);
});
