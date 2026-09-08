import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnoseEndingOmission } from '../app/lib/ending-omission.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { createAnswerAnalyzer, normalizeAnswer } from '../app/lib/answer-analysis.mjs';

const verb = (surface, reading, cls = 'godan') => ({ domain: 'verb', surface, reading, class: cls });
const adjective = (surface, reading, cls = 'i', iiFamily = false) => ({ domain: 'adjective', surface, reading, class: cls, iiFamily });
const check = (item, form, input) => diagnoseEndingOmission(item, form, input, normalizeAnswer, deriveUnified(item, form).requiredKcIds);
const writing = verb('書く', 'かく');
const eating = verb('食べる', 'たべる', 'ichidan');
const quiet = adjective('静か', 'しずか', 'na');

test('basic verb suffix omissions confirm the visible transformed stem only', () => {
  for (const [item, form, input, confirmed] of [
    [writing, 'negative', '書かな', ['stem.godan.a']],
    [verb('買う', 'かう'), 'negative', 'かわな', ['stem.godan.a', 'stem.godan.u-wa']],
    [writing, 'past', '書い', ['onbin.i']],
    [writing, 'te', ' かい。 ', ['onbin.i']],
    [verb('話す', 'はなす'), 'past', '話し', ['stem.godan.shi-connective']],
    [verb('行く', 'いく'), 'te', 'いっ', ['onbin.sokuon']],
    [eating, 'negative', '食べな', ['stem.ichidan.drop-ru']],
    [eating, 'past', 'たべ', ['stem.ichidan.drop-ru']],
    [eating, 'te', '食べ', ['stem.ichidan.drop-ru']],
    [verb('する', 'する', 'irregular'), 'negative', 'しな', []],
    [verb('来る', 'くる', 'irregular'), 'te', 'き', []],
  ]) {
    const result = check(item, form, input);
    assert.equal(result?.kcId, `suffix.${form}`, input);
    assert.deepEqual(result.confirmedKcIds, confirmed, input);
  }
});

test('an absent だ or で proves the onbin stem but says nothing about voicing', () => {
  for (const form of ['past', 'te']) {
    const result = check(verb('読む', 'よむ'), form, 'よん');
    assert.equal(result?.kcId, `suffix.${form}`);
    assert.deepEqual(result.confirmedKcIds, ['onbin.hatsuon']);
    const voiced = check(verb('泳ぐ', 'およぐ'), form, '泳い');
    assert.deepEqual(voiced.confirmedKcIds, ['onbin.i']);
  }
});

test('voice, volitional, conditional and zuni endings have explicit primitive failures', () => {
  for (const [item, form, input, confirmed] of [
    [writing, 'passive', '書かれ', ['stem.godan.a']],
    [writing, 'causative', 'かかせ', ['stem.godan.a']],
    [writing, 'causativePassive', '書かせられ', ['stem.godan.a']],
    [writing, 'volitional', '書こ', ['stem.godan.o']],
    [writing, 'potential', 'かけ', ['stem.godan.e']],
    [writing, 'ba', '書け', ['stem.godan.e']],
    [writing, 'zuni', '書かず', ['stem.godan.a']],
    [eating, 'potential', '食べられ', ['stem.ichidan.drop-ru']],
    [eating, 'potential', 'たべれ', ['stem.ichidan.drop-ru']],
    [eating, 'imperative', '食べ', ['stem.ichidan.drop-ru']],
  ]) {
    const result = check(item, form, input);
    assert.equal(result?.kcId, form === 'zuni' ? 'construction.zuni' : `suffix.${form}`, input);
    assert.deepEqual(result.confirmedKcIds, confirmed, input);
  }
});

test('adjective partial suffixes keep vocabulary and observable ii irregularity intact', () => {
  for (const [item, form, input, failure, confirmed] of [
    [adjective('早い', 'はやい'), 'adjectivePast', 'はやかっ', 'adj.suffix.i-past', []],
    [adjective('早い', 'はやい'), 'adjectiveBa', '早けれ', 'adj.suffix.i-ba', []],
    [adjective('いい', 'いい', 'i', true), 'adjectivePast', 'よかっ', 'adj.suffix.i-past', ['adj.exception.ii-yo']],
    [adjective('かっこいい', 'かっこいい', 'i', true), 'adjectiveBa', 'かっこよけれ', 'adj.suffix.i-ba', ['adj.exception.ii-yo']],
    [quiet, 'adjectiveNaNegative', '静かではな', 'adj.suffix.na-negative', []],
    [quiet, 'adjectiveNaNegative', 'しずかじゃな', 'adj.suffix.na-negative', []],
    [quiet, 'adjectiveNaPast', '静かだっ', 'adj.suffix.na-past', []],
    [quiet, 'adjectiveBa', 'しずかな', 'adj.suffix.na-conditional', []],
  ]) {
    const result = check(item, form, input);
    assert.equal(result?.kcId, failure, input);
    assert.deepEqual(result.confirmedKcIds, confirmed, input);
  }
});

test('na adjective words copied without their single required suffix do not prove their class', () => {
  for (const [form, id] of [
    ['adjectiveAttributive', 'adj.suffix.na-attributive'], ['adjectivePredicative', 'adj.suffix.na-predicative'],
    ['adjectiveNaTe', 'adj.suffix.na-te'], ['adjectiveAdverb', 'adj.suffix.na-adverb'],
  ]) for (const input of ['静か', 'しずか']) {
    const result = check(quiet, form, input);
    assert.equal(result?.kcId, id, form);
    assert.deepEqual(result.confirmedKcIds, []);
  }
});

test('polite continuation truncations confirm only the retained connective stem', () => {
  for (const [form, input, failure] of [
    ['masuPast', '書きまし', 'compound.polite-past'],
    ['masuNegative', 'かきませ', 'compound.polite-negative'],
    ['masuNegativePast', '書きませんでし', 'compound.polite-negative-past'],
  ]) {
    const result = check(writing, form, input);
    assert.equal(result?.kcId, failure);
    assert.deepEqual(result.confirmedKcIds, ['stem.godan.i']);
    assert.equal(result.confirmedKcIds.includes('suffix.masu'), false);
  }
});

test('root copies, unobserved stem changes, multiple errors and unsupported continuations stay unresolved', () => {
  for (const [item, form, input] of [
    [writing, 'negative', '書く'], [writing, 'imperative', '書'],
    [writing, 'negative', '書きな'], [writing, 'negative', '書か'],
    [writing, 'past', 'かっ'], [eating, 'negative', 'たべらな'],
    [adjective('早い', 'はやい'), 'adjectiveAdverb', 'はや'],
    [adjective('いい', 'いい', 'i', true), 'adjectivePast', 'いかっ'],
    [writing, 'negativePast', '書かなかっ'], [writing, 'masuPast', '書きませ'],
    [writing, 'causativePassiveContracted', '書かされ'], [writing, 'teageruPast', '書いてあげ'],
    [writing, 'nakute', '書かなく'], [quiet, 'adjectiveNaNegativePast', '静かではなかっ'],
  ]) assert.equal(check(item, form, input), null, `${form}: ${input}`);
});

test('accepted forms and earlier explicit diagnoses remain authoritative', () => {
  assert.equal(check(eating, 'potential', '食べれる'), null);
  assert.equal(check(quiet, 'adjectiveBa', '静かなら'), null);
  assert.equal(diagnoseEndingOmission(writing, 'negative', '書かな', normalizeAnswer, ['class.godan']), null);
  // 書け is also a full imperative: the existing form-switch diagnosis must
  // win over the weaker observation that the potential suffix lacks る.
  const formSwitch = createAnswerAnalyzer(writing, 'potential')('書け');
  assert.equal(formSwitch.diagnosis?.kcId, 'suffix.potential');
  assert.deepEqual(formSwitch.diagnosis.confirmedKcIds, []);
  const voicedError = createAnswerAnalyzer(verb('読む', 'よむ'), 'te')('よんて');
  assert.equal(voicedError.diagnosis?.kcId, 'onbin.voicing');
});
