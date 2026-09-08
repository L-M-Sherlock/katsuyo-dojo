import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptedConjugations } from '../app/lib/conjugation.mjs';
import { hasLexicalTypo } from '../app/lib/lexical-typo.mjs';

const tanoshimu = { domain: 'verb', surface: '楽しむ', reading: 'たのしむ', class: 'godan' };
const normalize = (value) => value.normalize('NFKC').replace(/[\s。．.！!？?]/g, '');
function check(item, form, answer) {
  return hasLexicalTypo(item, answer, acceptedConjugations(item.surface, item.class, form),
    acceptedConjugations(item.reading, item.class, form), normalize);
}

test('the reported lexical typo is recognized in kana and surface answers', () => {
  assert.equal(check(tanoshimu, 'teageruNegativePast', 'なのしんであげなかった'), true);
  assert.equal(check(tanoshimu, 'teageruNegativePast', '苦しんであげなかった'), true);
  assert.equal(check(tanoshimu, 'teageruNegativePast', ' なのしんであげなかった。 '), true);
  assert.equal(check(tanoshimu, 'teageruNegativePast', 'のしんであげなかった'), true);
  assert.equal(check(tanoshimu, 'teageruNegativePast', 'たのしんであげなかった'), false);
  assert.equal(check(tanoshimu, 'teageruNegativePast', 'たたのしんであげなかった'), true);
});

test('inflection, onbin, voicing and multiple errors are not lexical typos', () => {
  for (const answer of ['たのしんであげない', 'たのしんであげた', 'たのしてあげなかった',
    'たのしんてあげなかった', 'たのしんであげなかた', 'なのしんであげない',
    'ななしんであげなかった', 'xyz']) {
    assert.equal(check(tanoshimu, 'teageruNegativePast', answer), false, answer);
  }
});

test('regular stems and accepted variants remain eligible', () => {
  assert.equal(check({ domain: 'verb', surface: '始める', reading: 'はじめる', class: 'ichidan' }, 'teageruPast', 'かじめてあげた'), true);
  assert.equal(check({ domain: 'verb', surface: '読む', reading: 'よむ', class: 'godan' }, 'causativePassivePast', 'のまされた'), true);
});

test('irregular inflection is excluded while the prefix of a suru compound is eligible', () => {
  const kuru = { domain: 'verb', surface: '来る', reading: 'くる', class: 'irregular' };
  assert.equal(check(kuru, 'negativePast', 'くなかった'), false);
  assert.equal(check(kuru, 'past', 'くた'), false);
  const suru = { domain: 'verb', surface: '勉強する', reading: 'べんきょうする', class: 'irregular' };
  assert.equal(check(suru, 'past', 'べんきょうすた'), false);
  assert.equal(check(suru, 'past', 'ぺんきょうした'), true);
});

test('adjective irregular stems and endings are excluded', () => {
  const ii = { domain: 'adjective', surface: 'かっこいい', reading: 'かっこいい', class: 'i', iiFamily: true };
  assert.equal(hasLexicalTypo(ii, 'かっこいかった', ['かっこよかった'], ['かっこよかった']), false);
  assert.equal(hasLexicalTypo(ii, 'がっこよかった', ['かっこよかった'], ['かっこよかった']), true);
  const na = { domain: 'adjective', surface: '綺麗', reading: 'きれい', class: 'na' };
  assert.equal(hasLexicalTypo(na, 'きねいだった', ['綺麗だった'], ['きれいだった']), true);
  assert.equal(hasLexicalTypo(na, 'きれいだっだ', ['綺麗だった'], ['きれいだった']), false);
});

test('ambiguous corrections and unchanged answers do not trigger a retry', () => {
  assert.equal(hasLexicalTypo({ ...tanoshimu, surface: 'さのしむ' }, 'なのしんだ', ['さのしんだ'], ['たのしんだ']), false);
  assert.equal(hasLexicalTypo(tanoshimu, 'たのしんだ', ['楽しんだ'], ['たのしんだ']), false);
});
