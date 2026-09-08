import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnosePassiveStageError } from '../app/lib/passive-stage-diagnosis.mjs';
import { acceptedConjugations } from '../app/lib/conjugation.mjs';
import { deriveExercise } from '../app/lib/knowledge-model.mjs';
import { emptySkillStats, updateKnowledgeStats } from '../app/lib/adaptive.mjs';

const verb = (surface, reading, cls = 'godan') => ({ domain: 'verb', class: cls, surface, reading });
const sawagu = verb('騒ぐ', 'さわぐ');
const targets = ['passive', 'passivePast', 'passiveNegative', 'passiveNegativePast', 'passiveDesireNegativePast'];
const checkStage = (item, form, input) => {
  const diagnosis = diagnosePassiveStageError(item, form, input);
  assert.ok(diagnosis, `${item.surface} → ${form}: ${input}`);
  assert.equal(diagnosis.kcId, null);
  assert.deepEqual(diagnosis.confirmedKcIds, []);
  assert.deepEqual(diagnosis.stage, {
    form: 'passive', label: '受身形构造', candidateKcIds: ['stem.godan.a', 'suffix.passive'],
  });
  const required = deriveExercise(item, form).requiredKcIds;
  for (const id of diagnosis.stage.candidateKcIds) assert.ok(required.includes(id), id);
  return diagnosis;
};

test('the screenshot locates the passive stage in both accepted writing systems without exposing an answer', () => {
  for (const input of ['さわぎられたくなかった', '騒ぎられたくなかった']) {
    const diagnosis = checkStage(sawagu, 'passiveDesireNegativePast', input);
    assert.match(diagnosis.message, /受身形的构造/);
    assert.match(diagnosis.message, /尚未更新知识点/);
    assert.doesNotMatch(diagnosis.message, /騒が|さわが|られる|れる|あ段|a 段/);
  }
});

test('each supported target requires its complete continuation from the incorrect passive base', () => {
  for (const [form, input] of [
    ['passive', 'さわぎられる'],
    ['passivePast', 'さわぎられた'],
    ['passiveNegative', 'さわぎられない'],
    ['passiveNegativePast', 'さわぎられなかった'],
    ['passiveDesireNegativePast', 'さわぎられたくなかった'],
  ]) checkStage(sawagu, form, input);
});

test('bounded mixed stem and suffix errors cover every godan ending without changing the root', () => {
  for (const [surface, reading, input] of [
    ['買う', 'かう', 'かいられたくなかった'],
    ['書く', 'かく', 'かきられたくなかった'],
    ['泳ぐ', 'およぐ', 'およぎられたくなかった'],
    ['話す', 'はなす', 'はなしられたくなかった'],
    ['待つ', 'まつ', 'まちられたくなかった'],
    ['死ぬ', 'しぬ', 'しにられたくなかった'],
    ['遊ぶ', 'あそぶ', 'あそびられたくなかった'],
    ['読む', 'よむ', 'よみられたくなかった'],
    ['帰る', 'かえる', 'かえりられたくなかった'],
  ]) checkStage(verb(surface, reading), 'passiveDesireNegativePast', input);
  for (const input of ['騒がられる', '騒ぎれる', '騒ぐられる', '騒げられる', '騒ごられる']) {
    checkStage(sawagu, 'passive', input);
  }
});

test('correct forms, wrong roots, wrong row families and malformed continuations remain outside the diagnosis', () => {
  for (const form of targets) {
    for (const word of [sawagu.surface, sawagu.reading]) {
      for (const correct of acceptedConjugations(word, 'godan', form)) {
        assert.equal(diagnosePassiveStageError(sawagu, form, correct), null, correct);
      }
    }
  }
  for (const [form, input] of [
    ['passive', 'たわぎられる'], // Damaged lexical root.
    ['passive', '騒きられる'], // Another consonant row.
    ['passive', 'さわられる'], // Missing the godan stem syllable.
    ['passive', 'さわぎらる'], // Incomplete passive suffix.
    ['passivePast', 'さわぎられるた'], // Retained final る in the next operation.
    ['passiveNegative', 'さわぎられなかった'], // Wrong requested continuation.
    ['passiveNegativePast', 'さわぎられない'], // Missing past transformation.
    ['passiveDesireNegativePast', 'たわぎられたくなかった'],
    ['passiveDesireNegativePast', 'さわぎられなかった'], // Missing desire.
    ['passiveDesireNegativePast', 'さわぎられたかった'], // Missing negation.
    ['passiveDesireNegativePast', 'さわぎられたいなかった'],
    ['passiveDesireNegativePast', 'さわぎられるたくなかった'],
    ['passiveDesireNegativePast', 'さわぎられたくなかた'],
    ['passiveDesireNegativePast', 'さわぎられたくなかったかった'],
    ['passiveDesireNegativePast', 'xxさわぎられたくなかった'],
    ['passiveDesireNegativePast', 'さわぎられたくなかったxx'],
    ['passiveDesireNegativePast', 'さわがれたくなかた'], // Correct passive, broken ending.
  ]) assert.equal(diagnosePassiveStageError(sawagu, form, input), null, `${form}: ${input}`);
  assert.equal(diagnosePassiveStageError(verb('買う', 'かう'), 'passive', 'かあられる'), null);
});

test('other forms and word classes do not inherit the passive-stage contract', () => {
  for (const form of ['potential', 'causative', 'causativePassive', 'taiNegativePast', 'negativePast', null]) {
    assert.equal(diagnosePassiveStageError(sawagu, form, 'さわぎられたくなかった'), null, form);
  }
  for (const item of [
    verb('食べる', 'たべる', 'ichidan'), verb('する', 'する', 'irregular'),
    { domain: 'adjective', class: 'na', surface: '静か', reading: 'しずか' },
    { domain: 'verb', class: 'godan', surface: '不明', reading: 'ふめい' }, null,
  ]) assert.equal(diagnosePassiveStageError(item, 'passive', 'たべりられる'), null);
});

test('normalization uses the supplied comparison function and does not introduce fuzzy matching', () => {
  const input = ' さわぎられたくなかった。';
  assert.equal(diagnosePassiveStageError(sawagu, 'passiveDesireNegativePast', input), null);
  const normalize = value => value.normalize('NFKC').replace(/[\s。]/g, '');
  assert.ok(diagnosePassiveStageError(sawagu, 'passiveDesireNegativePast', input, normalize));
});

test('a stage-only diagnosis never applies positive or negative knowledge evidence', () => {
  const form = 'passiveDesireNegativePast';
  const diagnosis = checkStage(sawagu, form, 'さわぎられたくなかった');
  const kcIds = deriveExercise(sawagu, form).requiredKcIds;
  const before = Object.fromEntries(kcIds.map(id => [id, { ...emptySkillStats(), attempts: 2, correct: 1,
    filteredAccuracy: .5, confidence: .1, bestConfidence: .1 }]));
  const after = updateKnowledgeStats(before, { kcIds, focusId: kcIds.at(-1), correct: false,
    failedKcId: diagnosis.kcId, confirmedKcIds: diagnosis.confirmedKcIds });
  assert.deepEqual(after, before);
});
