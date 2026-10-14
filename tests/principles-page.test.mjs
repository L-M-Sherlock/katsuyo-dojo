import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import PrinciplesPage, { principlesSectionFromHash } from '../app/lib/principles-page.mjs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/katsuyo-dojo/#/principles' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, cleanup, fireEvent } = await import('@testing-library/react');
afterEach(cleanup);
after(() => dom.window.close());

test('principles demo distinguishes independent and assisted evidence and can restart', () => {
  const view = render(createElement(PrinciplesPage, { onBack() {} }));
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
  const view = render(createElement(PrinciplesPage, { onBack() {} }));
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
