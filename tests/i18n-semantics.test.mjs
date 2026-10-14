import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPOUND_FORM_SPECS } from '../app/lib/compound-forms.mjs';
import { FORM_SEMANTICS } from '../app/lib/form-semantics.mjs';
import {
  EN_FORM_SEMANTICS,
  FORM_SEMANTICS_BY_LOCALE,
  formSemanticsForLocale,
  localizedSemanticsForForm,
} from '../app/lib/i18n/content-semantics.mjs';

const han = /[\u3400-\u4dbf\u4e00-\u9fff]/u;
const textFields = ['concise', 'coreMeaning', 'core', 'register', 'usageNote', 'usage', 'contrast'];

test('English form semantics have exact stable-id coverage', () => {
  assert.deepEqual(Object.keys(EN_FORM_SEMANTICS).sort(), Object.keys(FORM_SEMANTICS).sort());
  assert.deepEqual(Object.keys(FORM_SEMANTICS_BY_LOCALE.en).sort(), Object.keys(FORM_SEMANTICS_BY_LOCALE['zh-CN']).sort());
  assert.equal(new Set(Object.keys(EN_FORM_SEMANTICS)).size, Object.keys(FORM_SEMANTICS).length);
});

test('English entries preserve semantic shape and structural metadata', () => {
  for (const [form, source] of Object.entries(FORM_SEMANTICS)) {
    const localized = EN_FORM_SEMANTICS[form];
    assert.ok(localized, `missing English semantics for ${form}`);
    assert.ok(localized.concise.trim(), `${form} concise must not be empty`);
    assert.ok(localized.coreMeaning.trim(), `${form} coreMeaning must not be empty`);
    assert.equal(localized.core, localized.coreMeaning, `${form} core alias must match`);

    for (const field of ['register', 'usageNote', 'contrast']) {
      assert.equal(field in localized, field in source, `${form} must preserve ${field} presence`);
    }
    assert.equal('usage' in localized, 'usage' in source, `${form} must preserve usage alias presence`);
    if (localized.usageNote) assert.equal(localized.usage, localized.usageNote, `${form} usage alias must match`);
    for (const field of ['baseForm', 'continuation', 'form']) {
      assert.equal(localized[field], source[field], `${form} must preserve ${field}`);
    }
  }
});

test('English semantic prose contains no Chinese Han text', () => {
  for (const [form, entry] of Object.entries(EN_FORM_SEMANTICS)) {
    for (const field of textFields) {
      if (entry[field] === undefined) continue;
      assert.doesNotMatch(entry[field], han, `${form}.${field} contains Chinese text`);
    }
  }
});

test('compound entries retain generated form metadata and base guidance', () => {
  for (const [form, spec] of Object.entries(COMPOUND_FORM_SPECS)) {
    const entry = EN_FORM_SEMANTICS[form];
    const base = EN_FORM_SEMANTICS[spec.form];
    assert.equal(entry.baseForm, spec.form);
    assert.equal(entry.continuation, spec.ending);
    assert.equal(entry.form, form);
    for (const field of ['register', 'usageNote', 'contrast']) {
      assert.equal(entry[field], base[field], `${form} must inherit English ${field}`);
    }
  }
});

test('locale accessors normalize supported locales and reject unsupported locales', () => {
  assert.equal(formSemanticsForLocale('zh-CN'), FORM_SEMANTICS);
  assert.equal(formSemanticsForLocale('en'), EN_FORM_SEMANTICS);
  assert.equal(formSemanticsForLocale('en-US'), EN_FORM_SEMANTICS);
  assert.throws(() => formSemanticsForLocale('fr'), /Unsupported/);
  assert.equal(localizedSemanticsForForm('teiru', 'en'), EN_FORM_SEMANTICS.teiru);
  assert.equal(localizedSemanticsForForm('teiru', 'zh-CN'), FORM_SEMANTICS.teiru);
  assert.equal(localizedSemanticsForForm('not-a-form', 'en'), null);
});
