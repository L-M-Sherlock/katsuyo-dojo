import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptedConjugations } from '../app/lib/conjugation.mjs';
import { acceptedAdjectiveConjugations } from '../app/lib/adjective-conjugation.mjs';
import { hasLexicalTypo } from '../app/lib/lexical-typo.mjs';
import { createAnswerAnalyzer, normalizeAnswer } from '../app/lib/answer-analysis.mjs';
import { unifiedDiagnosticSteps } from '../app/lib/unified-knowledge.mjs';

const verb = (surface, reading, cls = 'godan') => ({ domain: 'verb', surface, reading, class: cls });
const adjective = (surface, reading, cls = 'i', iiFamily = false) => ({ domain: 'adjective', surface, reading, class: cls, iiFamily });
const application = verb('申し込む', 'もうしこむ');
const answers = (item, form, reading = false) => item.domain === 'verb'
  ? acceptedConjugations(reading ? item.reading : item.surface, item.class, form)
  : acceptedAdjectiveConjugations({ ...item, surface: reading ? item.reading : item.surface }, form);
const check = (item, form, input) => hasLexicalTypo(item, input, answers(item, form), answers(item, form, true), normalizeAnswer);

test('a missing lexical kana, kanji or long vowel retries only the otherwise complete answer', () => {
  for (const [form, input] of [
    ['taiPast', 'もしこみたかった'],
    ['taiPast', 'もうこみたかった'],
    ['taiPast', '申しみたかった'],
    ['taiPast', ' もしこみたかった。 '],
    ['teageruNegativePast', 'もしこんであげなかった'],
    ['causativePassivePast', 'もしこまされた'],
  ]) {
    assert.equal(check(application, form, input), true, input);
    assert.equal(createAnswerAnalyzer(application, form)(input).kind, 'typo', input);
  }
  const suru = verb('勉強する', 'べんきょうする', 'irregular');
  assert.equal(check(suru, 'past', 'べんきょした'), true);
  assert.equal(createAnswerAnalyzer(suru, 'past')('べんきょした').kind, 'typo');
});

test('native adjectives and ii-family words retain their complete inflection', () => {
  for (const [item, form, input] of [
    [adjective('大きい', 'おおきい'), 'adjectivePast', 'おきかった'],
    [adjective('かっこいい', 'かっこいい', 'i', true), 'adjectiveNegativePast', 'かこよくなかった'],
    [adjective('綺麗', 'きれい', 'na'), 'adjectiveNaNegativePast', 'きいじゃなかった'],
    [adjective('ゴージャス', 'ゴージャス', 'na'), 'adjectiveNaPast', 'ゴジャスだった'],
  ]) {
    assert.equal(check(item, form, input), true, input);
    assert.equal(createAnswerAnalyzer(item, form)(input).kind, 'typo', input);
  }
});

test('short lexical stems and deleting a whole stem do not establish a typo', () => {
  for (const [item, form, input] of [
    [verb('書く', 'かく'), 'masu', 'きます'],
    [verb('読む', 'よむ'), 'past', 'んだ'],
    [verb('頼む', 'たのむ'), 'taiPast', 'のみたかった'],
    [verb('来る', 'くる', 'irregular'), 'past', 'た'],
    [adjective('早い', 'はやい'), 'adjectiveNegative', 'はくない'],
    [application, 'taiPast', 'みたかった'],
  ]) assert.equal(check(item, form, input), false, input);
});

test('ending omissions, changed inflections and multiple errors never receive a lexical retry', () => {
  for (const input of [
    'もうしこみたかっ', 'もうしこみたかた', 'もうしこみかった',
    'もうしこみたい', 'もしこみたい', 'もこみたかった', 'なしこみたかった',
    'もうしこんだいた', '申しこみたかった', 'みたかった',
  ]) {
    assert.equal(check(application, 'taiPast', input), false, input);
    assert.notEqual(createAnswerAnalyzer(application, 'taiPast')(input).kind, 'typo', input);
  }
  const ii = adjective('かっこいい', 'かっこいい', 'i', true);
  assert.equal(check(ii, 'adjectivePast', 'かっこかった'), false);
  assert.equal(check(ii, 'adjectivePast', 'かこいかった'), false);
});

test('ambiguous surface corrections and omissions crossing the ending boundary are rejected', () => {
  const ambiguous = verb('もうし込む', 'もうしこむ');
  assert.equal(hasLexicalTypo(ambiguous, 'もうしみたい', ['もうし込みたい'], ['もうしこみたい']), false);
  // In あたたかかった, either the stem's か or the suffix's か could
  // have been dropped. Correct lexical spelling cannot be established.
  const boundary = adjective('暖かい', 'あたたかい');
  assert.equal(check(boundary, 'adjectivePast', 'あたたかった'), false);
});

test('valid variants and explicit grammar diagnoses keep precedence over the typo path', () => {
  assert.equal(createAnswerAnalyzer(application, 'causativePassivePast')('もうしこまされた').kind, 'correct');
  assert.equal(check(application, 'causativePassivePast', 'もうしこまされた'), false);
  const result = createAnswerAnalyzer(application, 'past')('もうしこみた');
  assert.equal(result.kind, 'incorrect');
  assert.equal(result.diagnosis?.kcId, 'onbin.hatsuon');
  const [, tail] = unifiedDiagnosticSteps(application, 'taiPast');
  assert.equal(createAnswerAnalyzer(application, 'taiPast', { step: tail })('もしこみたかった').kind, 'typo');
  const incorrectTail = createAnswerAnalyzer(application, 'taiPast', { step: tail })('もうしこみたい');
  assert.equal(incorrectTail.kind, 'incorrect');
  assert.equal(incorrectTail.diagnosis?.kcId, 'adj.suffix.i-past');
});
