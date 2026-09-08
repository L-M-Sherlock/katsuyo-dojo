import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { acceptedAdjectiveConjugations, adjectiveDiagnosticCandidates, diagnoseCommonAdjectiveError } from '../app/lib/adjective-conjugation.mjs';
import { deriveUnified, unifiedDiagnosticSteps } from '../app/lib/unified-knowledge.mjs';
import { emptySkillStats, updateKnowledgeStats } from '../app/lib/adaptive.mjs';

const serious = { domain: 'adjective', class: 'na', surface: '真面目', reading: 'まじめ' };
const white = { domain: 'adjective', class: 'i', surface: '白い', reading: 'しろい', iiFamily: false };
function expectFailure(item, form, input, kcId, confirmed = []) {
  const result = createAnswerAnalyzer(item, form)(input);
  assert.equal(result.kind, 'incorrect', `${form}: ${input}`);
  assert.equal(result.diagnosis?.kcId, kcId, `${form}: ${input}`);
  assert.deepEqual(result.diagnosis?.confirmedKcIds, confirmed, `${form}: ${input}`);
  return result;
}

test('the common fallback preserves all legacy matches and rechecks normalization and KC scope', () => {
  for (const [item, forms] of [
    [serious, ['adjectiveAttributive', 'adjectivePredicative', 'adjectiveNaNegative', 'adjectiveNaPast', 'adjectiveNaTe', 'adjectiveBa', 'adjectiveAdverb']],
    [white, ['adjectiveNegative', 'adjectivePast', 'adjectiveTe', 'adjectiveBa', 'adjectiveAdverb']],
  ]) for (const form of forms) {
    for (const candidate of adjectiveDiagnosticCandidates(item, form)) {
      assert.equal(diagnoseCommonAdjectiveError(item, form, candidate.answer), null, `${form}: ${candidate.answer}`);
    }
    for (const answer of acceptedAdjectiveConjugations(item, form)) {
      assert.equal(diagnoseCommonAdjectiveError(item, form, answer), null, answer);
    }
  }
  assert.equal(diagnoseCommonAdjectiveError(serious, 'adjectiveNaTe', '真面目て').kcId, 'adj.suffix.na-te');
  assert.equal(diagnoseCommonAdjectiveError(serious, 'adjectiveNaTe', '真面目て', value => value, []), null);
  assert.equal(diagnoseCommonAdjectiveError(white, 'adjectivePast', '＊白かた＊', value => value.replaceAll('＊', '')).kcId, 'adj.suffix.i-past');
  assert.equal(diagnoseCommonAdjectiveError(white, 'adjectivePast', '＊白かた＊'), null);
  // Scope cannot discard one competing interpretation and manufacture a
  // unique failed KC after normalization has made two operations identical.
  const collision = value => value === '白くなない' ? '白ない' : value;
  assert.equal(diagnoseCommonAdjectiveError(white, 'adjectiveNegative', '白ない', collision, ['adj.stem.i-ku']), null);
});

test('the reported majimete error affects only the na te connection', () => {
  for (const input of ['まじめて', '真面目て', ' 真面目て。 ']) {
    const result = expectFailure(serious, 'adjectiveNaTe', input, 'adj.suffix.na-te');
    assert.match(result.diagnosis.message, /「て」.*「で」/);
    const kcIds = deriveUnified(serious, 'adjectiveNaTe').requiredKcIds;
    for (const hintUsed of [false, true]) {
      const before = Object.fromEntries([...kcIds, 'onbin.voicing', 'adj.suffix.na-past'].map(id =>
        [id, { ...emptySkillStats(), attempts: 5, correct: 5, filteredAccuracy: 1 }]));
      const after = updateKnowledgeStats(before, { kcIds, focusId: 'adj.class.na', correct: false,
        failedKcId: result.diagnosis.kcId, confirmedKcIds: result.diagnosis.confirmedKcIds, hintUsed });
      assert.equal(after['adj.suffix.na-te'].attempts, 6);
      assert.equal(after['adj.suffix.na-te'].filteredAccuracy, .8);
      for (const id of Object.keys(before).filter(id => id !== 'adj.suffix.na-te')) assert.deepEqual(after[id], before[id]);
    }
  }
});

test('single local na suffix mutations cover voicing, size, repetition, swaps and retained na or da', () => {
  for (const [form, endings, id] of [
    ['adjectiveAttributive', ['なな', 'だな'], 'na-attributive'],
    ['adjectivePredicative', ['た', 'だだ', 'なだ'], 'na-predicative'],
    ['adjectiveNaNegative', ['てはない', 'ではなぃ', 'ではなない', 'ではないない', 'じゃないじゃない', 'でないでない', 'ではいな', 'なではない', 'だじゃない'], 'na-negative'],
    ['adjectiveNaPast', ['だつた', 'だたっ', 'だったった', 'だっただった', 'だだった', 'たっだ'], 'na-past'],
    ['adjectiveNaTe', ['て', 'でで', 'なで', 'だで'], 'na-te'],
    ['adjectiveBa', ['ならぱ', 'ならら', 'であれれば', 'なであれば', 'らなば', 'であばれ'], 'na-conditional'],
    ['adjectiveAdverb', ['にに', 'だに', 'なに'], 'na-adverb'],
  ]) for (const ending of endings) {
    for (const base of [serious.surface, serious.reading]) expectFailure(serious, form, base + ending, `adj.suffix.${id}`);
  }
});

test('i ku-stem errors are separated from errors after an already correct ku stem', () => {
  for (const [form, inputs, id] of [
    ['adjectiveNegative', ['しろない', 'しろぐない', '白くくない'], 'adj.stem.i-ku'],
    ['adjectiveNegative', ['白くなない', 'しろくないない', '白くいな'], 'adj.suffix.i-negative'],
    ['adjectiveTe', ['しろて', '白ぐて', '白くくて'], 'adj.stem.i-ku'],
    ['adjectiveTe', ['しろくで', '白くてて'], 'adj.suffix.i-te'],
    ['adjectiveAdverb', ['しろぐ', '白くく', 'しろ'], 'adj.stem.i-ku'],
  ]) for (const input of inputs) expectFailure(white, form, input, id);
  expectFailure(white, 'adjectiveNegative', 'しろく', 'adj.suffix.i-negative', ['adj.stem.i-ku']);
  expectFailure(white, 'adjectiveNegative', 'しろくな', 'adj.suffix.i-negative', ['adj.stem.i-ku']);
});

test('past and conditional suffix errors preserve the lexical root and have one failed connection', () => {
  for (const [form, inputs, id] of [
    ['adjectivePast', ['しろかた', '白った', '白かつた', '白がった', '白かっだ', '白かかった', '白かったた', '白かったかった', '白っかた', '白くかった', 'しろくた'], 'adj.suffix.i-past'],
    ['adjectiveBa', ['しろけば', '白ければば', '白げれば', '白けれぱ', '白れけば', '白くば', 'しろくければ'], 'adj.suffix.i-ba'],
  ]) for (const input of inputs) expectFailure(white, form, input, id);
});

test('ii suffix diagnoses require the correct yo root and preserve earlier exception evidence', () => {
  for (const item of [
    { domain: 'adjective', class: 'i', surface: 'いい', reading: 'いい', iiFamily: true },
    { domain: 'adjective', class: 'i', surface: 'かっこいい', reading: 'かっこいい', iiFamily: true },
  ]) {
    const root = item.surface.slice(0, -2) + 'よ';
    expectFailure(item, 'adjectivePast', root + 'かた', 'adj.suffix.i-past');
    expectFailure(item, 'adjectivePast', root + 'かっだ', 'adj.suffix.i-past');
    expectFailure(item, 'adjectiveBa', root + 'げれば', 'adj.suffix.i-ba');
    expectFailure(item, 'adjectiveNegative', root + 'ない', 'adj.stem.i-ku');
    expectFailure(item, 'adjectivePast', root + 'かっ', 'adj.suffix.i-past', ['adj.exception.ii-yo']);
    for (const input of [item.surface + 'かった', item.surface.slice(0, -1) + 'かた']) {
      assert.equal(createAnswerAnalyzer(item, 'adjectivePast')(input).diagnosis, null, input);
    }
    expectFailure(item, 'adjectivePast', item.surface.slice(0, -1) + 'かった', 'adj.exception.ii-yo');
  }
});

test('valid variants, wrong-class rules, lexical damage and multiple operations remain distinct', () => {
  for (const [item, forms] of [
    [serious, ['adjectiveNaNegative', 'adjectiveNaPast', 'adjectiveNaTe', 'adjectiveBa', 'adjectiveNaNegativePast']],
    [white, ['adjectiveNegative', 'adjectivePast', 'adjectiveTe', 'adjectiveBa', 'adjectiveNegativePast']],
  ]) for (const form of forms) for (const input of acceptedAdjectiveConjugations(item, form)) {
    assert.equal(createAnswerAnalyzer(item, form)(input).kind, 'correct', input);
  }
  expectFailure(serious, 'adjectiveNaTe', '真面目くて', 'adj.class.na');
  expectFailure(white, 'adjectivePast', '白いだった', 'adj.class.i');
  for (const [item, form, input] of [
    [serious, 'adjectiveNaTe', 'ましめて'], [serious, 'adjectiveNaTe', '真面目だて'],
    [serious, 'adjectiveNaNegative', '真面目ないない'], [serious, 'adjectiveNaNegativePast', '真面目じゃなかた'],
    [white, 'adjectivePast', 'しるかた'], [white, 'adjectivePast', '白いかた'],
    [white, 'adjectiveNegative', 'しるない'], [white, 'adjectiveNegative', '白ぐなぃ'],
    [white, 'adjectiveNegativePast', '白くなかた'], [white, 'adjectiveNegativePast', '白くないた'],
  ]) assert.equal(createAnswerAnalyzer(item, form)(input).diagnosis, null, `${form}: ${input}`);
});

test('the shared adjective diagnoses are scoped to supplied-base practice', () => {
  const item = { domain: 'verb', class: 'godan', surface: '読む', reading: 'よむ' };
  for (const [form, input, id] of [['taiPast', '読みたかた', 'adj.suffix.i-past'],
    ['taiNegative', '読みたない', 'adj.stem.i-ku'], ['tehoshiiPast', '読んでほしかっだ', 'adj.suffix.i-past']]) {
    assert.equal(createAnswerAnalyzer(item, form)(input).diagnosis?.kcId ?? null, null, input);
    const step = unifiedDiagnosticSteps(item, form).at(-1);
    const result = createAnswerAnalyzer(item, form, { step })(input);
    assert.equal(result.diagnosis?.kcId, id, input);
    assert.deepEqual(result.diagnosis.confirmedKcIds, []);
  }
  const step = createAnswerAnalyzer(white, 'adjectiveNegativePast')('白く').steps[0];
  assert.deepEqual(step.kcIds, ['adj.suffix.i-negative']);
  assert.equal(createAnswerAnalyzer(white, step.form, { step })('白ない').diagnosis, null);
});
