import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { conjugate } from '../app/lib/conjugation.mjs';
import { assessFormUsage, eligibleVerbForm, supportsVerbForm } from '../app/lib/form-eligibility.mjs';
import { assessmentTarget, emptyAssessment, recordIndependentAttempt, retestStatus } from '../app/lib/learning-assessment.mjs';

// Independently composed examples and expected answers, not quotations or
// corpus-frequency claims. The reviewed common senses and valency were checked
// against NINJAL IPAL entries (さそう, やとう, あつかう, うたがう, きらう,
// いわう, おう1): https://www2.ninjal.ac.jp/dictionaries/IPALBV/mibook.html
// からかう: Shogakukan Daijisen https://kotobank.jp/word/からかう-467246
const reviewed = [
  { surface: '誘う', reading: 'さそう', meaning: '邀请', answer: '誘われたくなかった', kana: 'さそわれたくなかった', context: /聚餐.*邀请/, sentence: 'その日は休みたかったので、飲み会に誘われたくなかった。' },
  { surface: '雇う', reading: 'やとう', meaning: '雇用', answer: '雇われたくなかった', kana: 'やとわれたくなかった', context: /雇佣.*劳动条件/, sentence: '労働条件が合わず、その会社には雇われたくなかった。' },
  { surface: '扱う', reading: 'あつかう', meaning: '对待', answer: '扱われたくなかった', kana: 'あつかわれたくなかった', context: /对待/, sentence: '子供のように扱われたくなかった。' },
  { surface: '疑う', reading: 'うたがう', meaning: '怀疑', answer: '疑われたくなかった', kana: 'うたがわれたくなかった', context: /信任/, sentence: '友達に嘘をついたと疑われたくなかった。' },
  { surface: '嫌う', reading: 'きらう', meaning: '讨厌', answer: '嫌われたくなかった', kana: 'きらわれたくなかった', context: /朋友关系/, sentence: '本音を言って、友達に嫌われたくなかった。' },
  { surface: 'からかう', reading: 'からかう', meaning: '取笑', answer: 'からかわれたくなかった', kana: 'からかわれたくなかった', context: /发型.*开玩笑/, sentence: '新しい髪型を、クラスの人にからかわれたくなかった。' },
  { surface: '祝う', reading: 'いわう', meaning: '庆祝', answer: '祝われたくなかった', kana: 'いわわれたくなかった', context: /生日庆祝/, sentence: '誕生日を大げさに祝われたくなかった。' },
  { surface: '追う', reading: 'おう', meaning: '追赶', answer: '追われたくなかった', kana: 'おわれたくなかった', context: /追逐游戏/, sentence: '鬼ごっこでは、足の速い子に追われたくなかった。' },
];
const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
let model;
try { model = (await server.ssrLoadModule('/app/page.tsx')).KNOWLEDGE; }
finally { await server.close(); }
const find = (surface, form = 'passiveDesireNegativePast') => {
  const exercise = model.exercises.find(value => value.item.surface === surface && value.form === form);
  assert.ok(exercise, `${surface}/${form} must be available to actual question selection`);
  return exercise;
};

test('eight supplemental prompts retain the reviewed common sense and accept independently specified written and kana answers', () => {
  for (const expected of reviewed) {
    const exercise = find(expected.surface);
    assert.equal(exercise.item.reading, expected.reading);
    assert.equal(exercise.item.meaning, expected.meaning);
    assert.equal(exercise.item.class, 'godan');
    assert.match(exercise.context.text, expected.context);
    assert.doesNotMatch(exercise.context.text, /[ぁ-ゖァ-ヺ]|过去|曾经|已经|不想|没有/,
      'the situation must not leak an answer or prescribe tense/polarity');
    assert.equal(conjugate(expected.surface, 'godan', exercise.form), expected.answer);
    assert.equal(conjugate(expected.reading, 'godan', exercise.form), expected.kana);
    const analyze = createAnswerAnalyzer(exercise.item, exercise.form);
    assert.equal(analyze(expected.answer).kind, 'correct', expected.surface);
    assert.equal(analyze(expected.kana).kind, 'correct', expected.surface);
    assert.ok(expected.sentence.includes(expected.answer));
  }
});

test('approving human-directed passive combinations does not authorize unreviewed wish, causative, imperative, benefactive or aspect families', () => {
  const unreviewedForms = ['volitional', 'imperative', 'nasai', 'potential', 'potentialNegative',
    'causative', 'causativePast', 'causativePassive', 'causativePassiveNegativePast', 'causativePassiveContracted',
    'tai', 'taiNegative', 'tagaru', 'tehoshiiNegativePast', 'temiru', 'temiruPast',
    'tearu', 'tearuNegativePast', 'teoku', 'toku', 'teageru', 'temorau', 'tekureru',
    'teiru', 'teru', 'teiku', 'sugiru', 'nagara', 'tsutsu', 'causativeReceivePast'];
  for (const { surface } of reviewed) {
    const { item } = find(surface);
    for (const form of unreviewedForms) {
      assert.equal(supportsVerbForm(item, form), true, `${surface}/${form} is structurally recognizable`);
      assert.equal(eligibleVerbForm(item, form), false, `${surface}/${form} requires its own review`);
      assert.equal(model.exercises.some(value => value.item.surface === surface && value.form === form), false);
    }
    for (const form of ['negative', 'past', 'te', 'masu', 'passive', 'passiveNegativePast']) {
      assert.equal(eligibleVerbForm(item, form), true, `${surface}/${form}`);
      assert.ok(find(surface, form));
    }
  }
});

test('reviewing a different context neither changes the lexical retest key nor satisfies the different-word requirement', () => {
  const original = find('誘う'), alternative = find('雇う');
  const changedContext = { ...original, id: `${original.id}:context-revision`,
    context: { id: `${original.context.id}:revision`, text: '当事人谈论朋友邀请自己参加周末活动的安排。' } };
  const target = assessmentTarget(original);
  assert.deepEqual(assessmentTarget(changedContext), target);
  assert.equal(assessmentTarget(alternative).key, target.key);
  assert.notEqual(assessmentTarget(alternative).wordKey, target.wordKey);
  const assessment = recordIndependentAttempt(emptyAssessment(), {
    exercise: original, questionId: 'natural-word-context-failure', correct: false, at: '2026-09-12T00:00:00Z',
  });
  const pending = assessment.pending[target.key];
  const spacedCount = assessment.originalCount + 2;
  assert.equal(retestStatus(pending, changedContext, { originalCount: spacedCount }).reason, 'same-word');
  assert.equal(retestStatus(pending, alternative, { originalCount: spacedCount }).eligible, true);
});

test('the natural-word expansion retains existing weather, sense, simultaneous-action and morphological exclusions', () => {
  for (const [surface, form] of [['降る', 'tai'], ['開く', 'tearu'], ['知る', 'nagara'],
    ['分かる', 'tsutsu'], ['生まれる', 'causative'], ['食べる', 'causativePassiveContracted'],
    ['話す', 'causativePassiveContracted']]) {
    const { item } = find(surface, 'past');
    assert.equal(eligibleVerbForm(item, form), false, `${surface}/${form}`);
  }
  assert.equal(assessFormUsage(find('死ぬ', 'past').item, 'past').status, 'allowed');
});
