import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import PrinciplesPage, {
  PRINCIPLES_COPY,
  PRINCIPLE_SECTION_IDS,
  getPrincipleSections,
  principlesSectionFromHash,
} from '../app/lib/principles-page.mjs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/katsuyo-dojo/#/principles' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, cleanup, fireEvent } = await import('@testing-library/react');
afterEach(cleanup);
after(() => dom.window.close());

function valueShape(value) {
  if (Array.isArray(value)) return value.map(valueShape);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, valueShape(item)]));
  }
  return typeof value;
}

test('principles locale catalogs have the same structure', () => {
  assert.deepEqual(valueShape(PRINCIPLES_COPY.en), valueShape(PRINCIPLES_COPY['zh-CN']));
});

test('principles demo distinguishes independent and assisted evidence and can restart', () => {
  const view = render(createElement(PrinciplesPage, { locale: 'zh-CN', onBack() {} }));
  const bar = view.getByRole('progressbar', { name: '演示掌握度' });
  fireEvent.click(view.getByRole('button', { name: '辅助答对', exact: true }));
  assert.equal(bar.getAttribute('aria-valuenow'), '0');
  assert.equal(view.container.querySelector('.principles-demo-counts dd').textContent, '0');
  for (const expected of [24, 47, 71, 94, 100]) {
    fireEvent.click(view.getByRole('button', { name: '独立答对', exact: true }));
    assert.equal(bar.getAttribute('aria-valuenow'), String(expected));
  }
  fireEvent.click(view.getByRole('button', { name: '已定位的答错', exact: true }));
  assert.equal(bar.getAttribute('aria-valuenow'), '94');
  fireEvent.click(view.getByRole('button', { name: '重置演示' }));
  assert.equal(bar.getAttribute('aria-valuenow'), '0');
  assert.ok([...view.container.querySelectorAll('.principles-demo-counts dd')].every(node => node.textContent === '0'));
});

test('principles section links resolve within the article and unknown sections stay on its landing page', () => {
  const view = render(createElement(PrinciplesPage, { locale: 'zh-CN', onBack() {} }));
  const ids = [...view.container.querySelectorAll('[id]')].map(node => node.id);
  assert.equal(ids.length, new Set(ids).size);
  for (const anchor of view.getByRole('navigation', { name: '原理目录', exact: true }).querySelectorAll('a')) {
    const section = principlesSectionFromHash(anchor.getAttribute('href'));
    assert.ok(section);
    assert.ok(document.getElementById(`principles-${section}`));
  }
  assert.equal(principlesSectionFromHash('#/principles/unknown'), '');
  assert.equal(principlesSectionFromHash('#/principles'), '');
  assert.equal(principlesSectionFromHash('#/challenge/play'), null);
  assert.equal(principlesSectionFromHash('#/principles-other'), null);
});

test('English principles keep stable section IDs and localize the full interactive page', () => {
  const view = render(createElement(PrinciplesPage, { locale: 'en', section: 'mastery', onBack() {} }));
  assert.equal(view.container.firstElementChild.getAttribute('lang'), 'en');
  assert.equal(view.getByRole('heading', { level: 1 }).textContent, 'How does 活用道場 plan your practice?');
  const navigation = view.getByRole('navigation', { name: 'Principles contents', exact: true });
  assert.deepEqual(
    [...navigation.querySelectorAll('a')].map(anchor => anchor.getAttribute('href')),
    PRINCIPLE_SECTION_IDS.map(id => `#/principles/${id}`),
  );
  assert.equal(navigation.querySelector('[aria-current="location"]').getAttribute('href'), '#/principles/mastery');
  assert.deepEqual(getPrincipleSections('en').map(([id]) => id), PRINCIPLE_SECTION_IDS);
  assert.match(view.getByText('Course content refers to Yokubi.', { exact: false }).textContent, /current implementation defines/);
  assert.equal(view.getByRole('link', { name: /Yokubi: course content/ }).getAttribute('href'), 'https://yoku.bi/');

  const bar = view.getByRole('progressbar', { name: 'Demo mastery' });
  fireEvent.click(view.getByRole('button', { name: 'Independent correct', exact: true }));
  assert.equal(bar.getAttribute('aria-valuenow'), '24');
  assert.equal(view.getByRole('status').textContent, 'One independent correct answer. The demo updated mastery.');

  for (const node of view.container.querySelectorAll('[lang="ja"]')) node.remove();
  const learnerText = view.container.textContent.replaceAll('活用道場', '');
  assert.doesNotMatch(learnerText, /[\u3400-\u9fff]/u);
});

test('changing the principles locale translates demo status without resetting demo state', () => {
  const view = render(createElement(PrinciplesPage, { locale: 'zh-CN', onBack() {} }));
  fireEvent.click(view.getByRole('button', { name: '独立答对', exact: true }));
  assert.equal(view.getByRole('progressbar', { name: '演示掌握度' }).getAttribute('aria-valuenow'), '24');
  view.rerender(createElement(PrinciplesPage, { locale: 'en', onBack() {} }));
  assert.equal(view.getByRole('progressbar', { name: 'Demo mastery' }).getAttribute('aria-valuenow'), '24');
  assert.equal(view.getByRole('status').textContent, 'One independent correct answer. The demo updated mastery.');
});
