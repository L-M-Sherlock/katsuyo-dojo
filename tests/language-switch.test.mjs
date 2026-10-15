import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import LanguageSwitch from '../app/lib/language-switch.mjs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {pretendToBeVisual: true});
for (const key of ['window', 'document', 'navigator', 'HTMLElement']) {
  Object.defineProperty(globalThis, key, {configurable: true, value: dom.window[key]});
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const {render, cleanup, fireEvent} = await import('@testing-library/react');
afterEach(cleanup);
after(() => dom.window.close());

test('language menu supports keyboard selection, current-language marking and Escape', () => {
  const chosen = [];
  const view = render(createElement(LanguageSwitch, {locale: 'zh-CN', label: '语言', onChange: locale => chosen.push(locale)}));
  const trigger = view.getByRole('button', {name: '语言: 简体中文'});
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  fireEvent.keyDown(trigger, {key: 'ArrowDown'});
  const current = view.getByRole('menuitemradio', {name: '简体中文'});
  const english = view.getByRole('menuitemradio', {name: 'English'});
  assert.equal(current.getAttribute('aria-checked'), 'true');
  assert.equal(document.activeElement, current);
  fireEvent.keyDown(current, {key: 'ArrowDown'});
  assert.equal(document.activeElement, english);
  fireEvent.keyDown(english, {key: 'Escape'});
  assert.equal(view.queryByRole('menu'), null);
  assert.equal(document.activeElement, trigger);
  assert.deepEqual(chosen, []);
  fireEvent.click(trigger);
  fireEvent.click(view.getByRole('menuitemradio', {name: 'English'}));
  assert.deepEqual(chosen, ['en']);
  assert.equal(view.queryByRole('menu'), null);
});

test('language menu closes when the user clicks or tabs outside it', () => {
  const view = render(createElement('div', null,
    createElement(LanguageSwitch, {locale: 'en', label: 'Language', onChange: () => {}}),
    createElement('button', null, 'Outside')));
  const trigger = view.getByRole('button', {name: 'Language: English'});
  fireEvent.click(trigger);
  fireEvent.pointerDown(view.getByRole('button', {name: 'Outside'}));
  assert.equal(view.queryByRole('menu'), null);
  fireEvent.click(trigger);
  fireEvent.focusIn(view.getByRole('button', {name: 'Outside'}));
  assert.equal(view.queryByRole('menu'), null);
});
