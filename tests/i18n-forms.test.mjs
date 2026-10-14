import test from 'node:test';
import assert from 'node:assert/strict';
import { FORM_LABELS } from '../app/lib/form-labels.mjs';
import { FORM_LABELS_BY_LOCALE, formLabel, formLabelsForLocale } from '../app/lib/i18n/content-forms.mjs';

test('English form labels cover every stable form ID', () => {
  assert.equal(Object.keys(FORM_LABELS).length, 170);
  assert.deepEqual(Object.keys(FORM_LABELS_BY_LOCALE.en).sort(), Object.keys(FORM_LABELS).sort());
  assert.deepEqual(Object.keys(FORM_LABELS_BY_LOCALE['zh-CN']).sort(), Object.keys(FORM_LABELS).sort());
  for (const [id, label] of Object.entries(FORM_LABELS_BY_LOCALE.en)) {
    assert.ok(label.trim(), id);
    assert.doesNotMatch(label, /[一-龥]/u, id);
  }
});

test('form-label accessors normalize locales and preserve unknown stable IDs', () => {
  assert.equal(formLabel('en-US', 'potentialNegativePast'), 'potential — negative past');
  assert.equal(formLabel('zh', 'potentialNegativePast'), FORM_LABELS.potentialNegativePast);
  assert.equal(formLabel('en', 'future-form'), 'future-form');
  assert.throws(() => formLabelsForLocale('fr'), /Unsupported/);
});
