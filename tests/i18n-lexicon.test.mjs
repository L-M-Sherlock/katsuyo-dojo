import test from 'node:test';
import assert from 'node:assert/strict';
import { REVIEWED_LEXICAL_SENSES } from '../app/lib/lexical-usage.mjs';
import {
  LEXICAL_MEANINGS_BY_LOCALE,
  getLexicalMeaning,
  lexicalMeaningFor,
  lexicalMeaningsForLocale,
} from '../app/lib/i18n/content-lexicon.mjs';

const reviewedIds = REVIEWED_LEXICAL_SENSES.map(sense => sense.id).sort();

test('lexical i18n maps cover every reviewed sense exactly', () => {
  assert.equal(reviewedIds.length, 247);
  assert.equal(new Set(reviewedIds).size, reviewedIds.length);

  for (const locale of ['zh-CN', 'en']) {
    const meanings = lexicalMeaningsForLocale(locale);
    assert.deepEqual(Object.keys(meanings).sort(), reviewedIds, `${locale} must match the reviewed sense inventory`);
    assert.ok(Object.isFrozen(meanings));
  }
  assert.ok(Object.isFrozen(LEXICAL_MEANINGS_BY_LOCALE));
});

test('Chinese meanings remain identical to the reviewed lexical snapshot', () => {
  for (const sense of REVIEWED_LEXICAL_SENSES) {
    assert.equal(lexicalMeaningFor(sense.id, 'zh-CN'), sense.meaning, sense.id);
    assert.equal(lexicalMeaningFor(sense, 'zh'), sense.meaning, sense.id);
  }
});

test('English meanings are concise English glosses without Chinese or Japanese text', () => {
  const nonLatinLearningText = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
  for (const sense of REVIEWED_LEXICAL_SENSES) {
    const meaning = getLexicalMeaning(sense.id, 'en-US');
    assert.equal(typeof meaning, 'string', sense.id);
    assert.ok(meaning.length > 0 && meaning.length <= 40, `${sense.id}: ${meaning}`);
    assert.doesNotMatch(meaning, nonLatinLearningText, `${sense.id}: ${meaning}`);
    assert.match(meaning, /^[A-Za-z][A-Za-z ;()'-]*$/, `${sense.id}: ${meaning}`);
  }
});

test('lexical accessors reject unsupported locales and return null for unknown senses', () => {
  assert.equal(lexicalMeaningFor('verb:不存在:不存在', 'en'), null);
  assert.equal(lexicalMeaningFor(null, 'en'), null);
  assert.throws(() => lexicalMeaningsForLocale('fr'), /Unsupported lexical locale/);
});
