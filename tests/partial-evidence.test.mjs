import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptedConjugations, conjugate } from '../app/lib/conjugation.mjs';
import { COMPOUND_FORM_SPECS } from '../app/lib/compound-forms.mjs';
import { diagnoseConjugation, requiredKcIds } from '../app/lib/knowledge-model.mjs';
import { emptySkillStats, updateKnowledgeStats } from '../app/lib/adaptive.mjs';

const hajimeru = { surface: '始める', reading: 'はじめる', class: 'ichidan' };
const kana = (verb) => ({ ...verb, surface: verb.reading, lexicalSurface: verb.surface });
const normalize = (value) => value.normalize('NFKC').replace(/[\s。．.！!？?]/g, '');

test('the reported negative-for-past answer credits the base and diagnoses the continuation', () => {
  const diagnosis = diagnoseConjugation(kana(hajimeru), 'teageruPast', 'はじめてあげない');
  assert.equal(diagnosis.kcId, 'composition.verb.past');
  assert.match(diagnosis.message, /末尾写成了否定形，本题要求过去形/);
  assert.deepEqual(diagnosis.confirmedKcIds, [
    'class.ichidan', 'heuristic.ru-ie', 'stem.ichidan.drop-ru', 'suffix.te', 'construction.teageru',
  ]);
  const byKc = updateKnowledgeStats({}, { kcIds: requiredKcIds(hajimeru, 'teageruPast'), focusId: diagnosis.kcId, failedKcId: diagnosis.kcId, confirmedKcIds: diagnosis.confirmedKcIds, correct: false });
  assert.equal(byKc['composition.verb.past'].attempts, 1);
  assert.equal(byKc['composition.verb.past'].correct, 0);
  assert.equal(byKc['construction.teageru'].correct, 1);
  assert.equal(byKc['suffix.past'], undefined);
  assert.equal(byKc['suffix.negative'], undefined);
});

test('same-construction ending confusions work across verbs, output classes and accepted variants', () => {
  const verbs = [hajimeru, { surface: '読む', reading: 'よむ', class: 'godan' }, { surface: '行く', reading: 'いく', class: 'godan' }, { surface: '喋る', reading: 'しゃべる', class: 'godan' }, { surface: 'する', reading: 'する', class: 'irregular' }, { surface: '来る', reading: 'くる', class: 'irregular' }];
  for (const verb of verbs.flatMap((word) => [word, kana(word)])) {
    for (const [target, spec] of Object.entries(COMPOUND_FORM_SPECS)) {
      const expected = `composition.${spec.outputType === 'iAdjective' ? 'i-adjective' : 'verb'}.${spec.ending}`;
      for (const [alternative, other] of Object.entries(COMPOUND_FORM_SPECS)) {
        if (other.form !== spec.form || alternative === target) continue;
        for (const answer of acceptedConjugations(verb.surface, verb.class, alternative)) {
          const diagnosis = diagnoseConjugation(verb, target, answer);
          assert.equal(diagnosis?.kcId, expected, `${verb.surface}: ${target} <- ${answer}`);
          assert.deepEqual(diagnosis.confirmedKcIds, requiredKcIds(verb, spec.form));
        }
      }
      for (const accepted of acceptedConjugations(verb.surface, verb.class, target)) {
        assert.equal(diagnoseConjugation(verb, target, accepted), null, `${target}: valid variant`);
      }
    }
  }
});

test('a missing continuation does not penalize an already completed construction', () => {
  for (const answer of ['始めてあげる', '始めてあげない']) {
    const diagnosis = diagnoseConjugation(hajimeru, 'teageruPast', answer);
    assert.equal(diagnosis.kcId, 'composition.verb.past');
    assert.ok(diagnosis.confirmedKcIds.includes('construction.teageru'));
  }
  assert.match(diagnoseConjugation(hajimeru, 'teageruPast', '始めてあげる').message, /还没有继续变为过去形/);
});

test('the same exact-family diagnosis supports voice and polite continuations', () => {
  for (const [target, other, failure, base] of [
    ['passivePast', 'passiveNegative', 'compound.voice-stack', 'passive'],
    ['causativePassiveNegativePast', 'causativePassivePast', 'compound.voice-stack', 'causativePassive'],
    ['masuPast', 'masuNegative', 'compound.polite-past', 'masu'],
    ['negativePast', 'negative', 'compound.negative-past', 'negative'],
  ]) {
    const diagnosis = diagnoseConjugation(hajimeru, target, conjugate(hajimeru.surface, hajimeru.class, other));
    assert.equal(diagnosis?.kcId, failure);
    assert.deepEqual(diagnosis.confirmedKcIds, requiredKcIds(hajimeru, base));
  }
});

test('typos, broken bases and unrelated constructions do not earn partial credit', () => {
  for (const answer of ['始めてあげな', '始めあげない', '始めでもらわない', '始めてもらわない', '始めてあげないです', 'xyz']) {
    assert.equal(diagnoseConjugation(hajimeru, 'teageruPast', answer), null, answer);
  }
  const diagnosis = diagnoseConjugation(kana(hajimeru), 'teageruPast', ' はじめてあげない。 ', normalize);
  assert.equal(diagnosis?.kcId, 'composition.verb.past');
});

test('partial evidence respects hints, excludes unrelated facts and does not record whole-answer speed', () => {
  const result = { kcIds: ['base', 'tail'], focusId: 'base', failedKcId: 'tail', confirmedKcIds: ['base', 'base', 'tail', 'unrelated'], correct: false, hintUsed: true, responseMs: 1200, answerLength: 4 };
  const stats = updateKnowledgeStats({}, result);
  assert.deepEqual(Object.keys(stats).sort(), ['base', 'tail']);
  assert.equal(stats.base.attempts, 1);
  assert.equal(stats.base.filteredAccuracy, .7);
  assert.equal(stats.base.cleanTimeCount, 0);
  assert.equal(stats.tail.correct, 0);
  assert.equal(stats.tail.attempts, 1);
  const revealed = updateKnowledgeStats({}, { ...result, revealed: true });
  assert.equal(revealed.base, undefined);
  const fallback = updateKnowledgeStats({}, { ...result, focusId: 'tail', failedKcId: null });
  assert.equal(fallback.base, undefined);
});

test('unconfirmed target facts retain their exact previous statistics', () => {
  const previous = { 'suffix.past': { ...emptySkillStats(), attempts: 9, correct: 8, confidence: .9 } };
  const diagnosis = diagnoseConjugation(hajimeru, 'teageruPast', '始めてあげない');
  const next = updateKnowledgeStats(previous, { correct: false, kcIds: requiredKcIds(hajimeru, 'teageruPast'), focusId: 'construction.teageru', failedKcId: diagnosis.kcId, confirmedKcIds: diagnosis.confirmedKcIds });
  assert.strictEqual(next['suffix.past'], previous['suffix.past']);
});
