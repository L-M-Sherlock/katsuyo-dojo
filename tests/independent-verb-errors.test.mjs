import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnswerAnalyzer, normalizeAnswer } from '../app/lib/answer-analysis.mjs';
import { diagnoseCommonConjugationError } from '../app/lib/knowledge-model.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { emptySkillStats, updateKnowledgeStats } from '../app/lib/adaptive.mjs';

const verb = (surface, reading, cls = 'godan') => ({ domain: 'verb', surface, reading, class: cls });
const expectFailure = (item, form, input, kcId) => {
  const result = createAnswerAnalyzer(item, form)(input);
  assert.equal(result.kind, 'incorrect', input);
  assert.equal(result.diagnosis?.kcId, kcId, `${item.surface} / ${form} / ${input}`);
  assert.deepEqual(result.diagnosis.confirmedKcIds, [], input);
  assert.deepEqual(result.steps, [], input);
  return result.diagnosis;
};
const common = (item, form, input, scope = deriveUnified(item, form).requiredKcIds) =>
  diagnoseCommonConjugationError(item, form, input, normalizeAnswer, scope)
  ?? diagnoseCommonConjugationError({ ...item, surface: item.reading, lexicalSurface: item.surface }, form, input, normalizeAnswer, scope);

test('independent voice errors retain the godan a-row and misuse only the ichidan attachment', () => {
  for (const [item, form, inputs, kcId] of [
    [verb('書く', 'かく'), 'passive', ['書かられる', 'かかられる'], 'suffix.passive'],
    [verb('読む', 'よむ'), 'passive', ['読まられる', 'よまられる'], 'suffix.passive'],
    [verb('買う', 'かう'), 'passive', ['買わられる', 'かわられる'], 'suffix.passive'],
    [verb('書く', 'かく'), 'causative', ['書かさせる', 'かかさせる'], 'suffix.causative'],
    [verb('泳ぐ', 'およぐ'), 'causative', ['泳がさせる', 'およがさせる'], 'suffix.causative'],
    [verb('待つ', 'まつ'), 'causative', ['待たさせる', 'またさせる'], 'suffix.causative'],
    [verb('書く', 'かく'), 'causative', ['書かさす', 'かかさす'], 'suffix.causative'],
  ]) for (const input of inputs) expectFailure(item, form, input, kcId);
});

test('independent ichidan ending confusions localize volitional spelling and imperative overextension', () => {
  for (const [item, form, inputs, kcId] of [
    [verb('食べる', 'たべる', 'ichidan'), 'volitional', ['食べよお', 'たべよお'], 'suffix.volitional'],
    [verb('見る', 'みる', 'ichidan'), 'volitional', ['見よお', 'みよお'], 'suffix.volitional'],
    [verb('閉める', 'しめる', 'ichidan'), 'volitional', ['閉めよお', 'しめよお'], 'suffix.volitional'],
    [verb('食べる', 'たべる', 'ichidan'), 'imperative', ['食べろう', 'たべろう'], 'suffix.imperative'],
    [verb('起きる', 'おきる', 'ichidan'), 'imperative', ['起きろう', 'おきろう'], 'suffix.imperative'],
  ]) for (const input of inputs) expectFailure(item, form, input, kcId);
});

test('independent su-ending inputs keep the dictionary ending before a complete past or te continuation', () => {
  for (const [item, form, inputs] of [
    [verb('話す', 'はなす'), 'past', ['話すた', 'はなすた']],
    [verb('話す', 'はなす'), 'te', ['話すて', 'はなすて']],
    [verb('返す', 'かえす'), 'teageru', ['返すてあげる', 'かえすてあげる']],
    [verb('貸す', 'かす'), 'tekudasai', ['貸すてください', 'かすてください']],
    [verb('消す', 'けす'), 'teiru', ['消すている', 'けすている']],
    [verb('消す', 'けす'), 'teiru', ['消すてる', 'けすてる']],
    [verb('話す', 'はなす'), 'tara', ['話すたら', 'はなすたら']],
    [verb('話す', 'はなす'), 'tari', ['話すたり', 'はなすたり']],
    [verb('話す', 'はなす'), 'tatte', ['話すたって', 'はなすたって']],
  ]) for (const input of inputs) expectFailure(item, form, input, 'stem.godan.shi-connective');
});

test('unchanged godan endings and past-for-te connections remain separate observable operations', () => {
  for (const [item, form, inputs, kcId] of [
    [verb('読む', 'よむ'), 'teiru', ['読むでいる', 'よむでいる'], 'onbin.hatsuon'],
    [verb('読む', 'よむ'), 'teiru', ['読んだいる', 'よんだいる'], 'suffix.te'],
    [verb('書く', 'かく'), 'teageru', ['書くてあげる', 'かくてあげる'], 'onbin.i'],
    [verb('買う', 'かう'), 'teiru', ['買うている', 'かうている'], 'onbin.sokuon'],
    [verb('待つ', 'まつ'), 'teiru', ['待つてる', 'まつてる'], 'onbin.sokuon'],
    [verb('遊ぶ', 'あそぶ'), 'tekudasai', ['遊ぶでください', 'あそぶでください'], 'onbin.hatsuon'],
    [verb('死ぬ', 'しぬ'), 'teiru', ['死ぬでいる', 'しぬでいる'], 'onbin.hatsuon'],
    [verb('取る', 'とる'), 'past', ['取るた', 'とるた'], 'onbin.sokuon'],
    [verb('泳ぐ', 'およぐ'), 'past', ['泳ぐだ', 'およぐだ'], 'onbin.i'],
    [verb('書く', 'かく'), 'tara', ['書くたら', 'かくたら'], 'onbin.i'],
    [verb('貸す', 'かす'), 'tekudasai', ['貸したください', 'かしたください'], 'suffix.te'],
    [verb('泳ぐ', 'およぐ'), 'teiru', ['泳いだいる', 'およいだいる'], 'suffix.te'],
  ]) for (const input of inputs) expectFailure(item, form, input, kcId);
});

test('new local rules do not cross a damaged root, incomplete continuation, or competing known form', () => {
  for (const [item, form, input] of [
    [verb('書く', 'かく'), 'passive', 'さかられる'],
    [verb('書く', 'かく'), 'passive', 'かきられる'],
    [verb('書く', 'かく'), 'causative', 'かきさせる'],
    [verb('食べる', 'たべる', 'ichidan'), 'volitional', 'たぺよお'],
    [verb('起きる', 'おきる', 'ichidan'), 'imperative', 'おぎろう'],
    [verb('話す', 'はなす'), 'te', 'ななすて'],
    [verb('話す', 'はなす'), 'te', 'はなすで'],
    [verb('話す', 'はなす'), 'teageru', 'はなすてあげない'],
    [verb('貸す', 'かす'), 'tekudasai', 'かすてくさい'],
    [verb('話す', 'はなす'), 'tara', 'はなすたたら'],
    [verb('読む', 'よむ'), 'teiru', 'よむている'],
    [verb('読む', 'よむ'), 'teiru', 'よんたいる'],
    [verb('泳ぐ', 'およぐ'), 'past', 'およぐた'],
    [verb('買う', 'かう'), 'teiru', 'かうでいる'],
    [verb('話す', 'はなす'), 'teiru', 'はなすだいる'],
    [verb('書く', 'かく'), 'passive', 'かける'],
    [verb('取る', 'とる'), 'potential', 'とられる'],
    [verb('食べる', 'たべる', 'ichidan'), 'past', 'たべった'],
    [verb('待つ', 'まつ'), 'te', 'まて'],
    [verb('閉める', 'しめる', 'ichidan'), 'causativePassive', 'しめらせさる'],
  ]) assert.equal(common(item, form, input), null, `${item.surface} / ${form} / ${input}`);

  for (const [item, form, input] of [
    [verb('書く', 'かく'), 'passive', 'かかれる'],
    [verb('書く', 'かく'), 'causative', 'かかす'],
    [verb('食べる', 'たべる', 'ichidan'), 'causative', 'たべさせる'],
    [verb('食べる', 'たべる', 'ichidan'), 'causative', 'たべさす'],
    [verb('食べる', 'たべる', 'ichidan'), 'volitional', 'たべよう'],
    [verb('食べる', 'たべる', 'ichidan'), 'imperative', 'たべろ'],
    [verb('話す', 'はなす'), 'teageru', 'はなしてあげる'],
    [verb('消す', 'けす'), 'teiru', 'けしてる'],
  ]) assert.equal(createAnswerAnalyzer(item, form)(input).kind, 'correct', input);
});

test('local attribution updates exactly its failed knowledge point and respects scoring scope', () => {
  const item = verb('書く', 'かく'), form = 'passive';
  const diagnosis = expectFailure(item, form, 'かかられる', 'suffix.passive');
  const kcIds = deriveUnified(item, form).requiredKcIds;
  const before = Object.fromEntries([...kcIds, 'unrelated'].map(id => [id, { ...emptySkillStats(), attempts: 4, correct: 4 }]));
  const after = updateKnowledgeStats(before, { kcIds, focusId: 'suffix.passive', correct: false,
    failedKcId: diagnosis.kcId, confirmedKcIds: diagnosis.confirmedKcIds });
  assert.equal(after['suffix.passive'].attempts, 5);
  for (const id of [...kcIds, 'unrelated'].filter(id => id !== 'suffix.passive')) assert.deepEqual(after[id], before[id], id);
  assert.equal(common(item, form, 'かかられる', ['stem.godan.a']), null);
  assert.equal(common(verb('話す', 'はなす'), 'te', 'はなすて', ['suffix.te']), null);
});
