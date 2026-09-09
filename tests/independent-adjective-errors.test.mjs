import assert from 'node:assert/strict';
import test from 'node:test';
import { ADJECTIVES } from '../app/lib/adjective-catalog.mjs';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { diagnoseCommonAdjectiveError } from '../app/lib/adjective-conjugation.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { emptySkillStats, updateKnowledgeStats } from '../app/lib/adaptive.mjs';

const adjective = surface => ADJECTIVES.find(item => item.surface === surface);
const high = adjective('高い');
const quiet = adjective('静か');

// These inputs and KCs were fixed by independent review before implementation;
// no production diagnostic candidates or mutation generator define the oracle.
const reported = [
  [high, 'adjectiveBa', 'たかくれば', 'adj.suffix.i-ba'],
  [quiet, 'adjectiveNaNegative', 'しずかだない', 'adj.suffix.na-negative'],
  [quiet, 'adjectiveNaTe', 'しずかだて', 'adj.suffix.na-te'],
  [quiet, 'adjectiveAttributive', 'しずかの', 'adj.suffix.na-attributive'],
  [quiet, 'adjectiveBa', 'しずかだば', 'adj.suffix.na-conditional'],
];

function expectConnection(item, form, input, id) {
  const result = createAnswerAnalyzer(item, form)(input);
  assert.equal(result.kind, 'incorrect', `${item.surface}/${form}: ${input}`);
  assert.equal(result.diagnosis?.kcId, id, `${item.surface}/${form}: ${input}`);
  assert.deepEqual(result.diagnosis.confirmedKcIds, [], input);
  assert.equal(result.steps.length, 0, `should not repeat the same isolated rule: ${input}`);
  return result;
}

test('independently discovered adjective analogies diagnose one connection immediately', () => {
  for (const [item, form, input, id] of reported) {
    const result = expectConnection(item, form, input, id);
    const kcIds = deriveUnified(item, form).requiredKcIds;
    const before = Object.fromEntries([...kcIds, 'adj.exception.ii-yo', 'adj.stem.i-ku'].map(kcId =>
      [kcId, { ...emptySkillStats(), attempts: 5, correct: 5, filteredAccuracy: 1 }]));
    const after = updateKnowledgeStats(before, { kcIds, focusId: kcIds[0], correct: false,
      failedKcId: result.diagnosis.kcId, confirmedKcIds: result.diagnosis.confirmedKcIds, hintUsed: false });
    assert.equal(after[id].attempts, 6);
    assert.equal(after[id].correct, 5);
    for (const otherId of Object.keys(before).filter(kcId => kcId !== id)) assert.deepEqual(after[otherId], before[otherId]);
  }
});

test('the five analogies generalize to intact lexical words in both accepted writings', () => {
  for (const item of ADJECTIVES) {
    if (item.class === 'i') {
      const roots = item.iiFamily
        ? [item.surface.slice(0, -2) + 'よ', item.reading.slice(0, -2) + 'よ']
        : [item.surface.slice(0, -1), item.reading.slice(0, -1)];
      for (const root of new Set(roots)) {
        expectConnection(item, 'adjectiveBa', root + 'くれば', 'adj.suffix.i-ba');
        expectConnection(item, 'adjectiveBa', ` ${root}くれば。 `, 'adj.suffix.i-ba');
      }
    } else {
      for (const [form, tail, id] of [
        ['adjectiveNaNegative', 'だない', 'adj.suffix.na-negative'],
        ['adjectiveNaTe', 'だて', 'adj.suffix.na-te'],
        ['adjectiveAttributive', 'の', 'adj.suffix.na-attributive'],
        ['adjectiveBa', 'だば', 'adj.suffix.na-conditional'],
      ]) for (const root of new Set([item.surface, item.reading])) {
        expectConnection(item, form, root + tail, id);
        expectConnection(item, form, ` ${root}${tail}。 `, id);
      }
    }
  }
});

test('the new patterns require the correct lexical root, including the ii exception', () => {
  for (const [item, form, input] of [
    [high, 'adjectiveBa', 'たがくれば'], [high, 'adjectiveBa', 'たかいくれば'],
    [quiet, 'adjectiveNaNegative', 'しすかだない'], [quiet, 'adjectiveNaTe', 'しずだて'],
    [quiet, 'adjectiveAttributive', 'しづかの'], [quiet, 'adjectiveBa', 'しずがだば'],
    [adjective('きれい'), 'adjectiveNaNegative', 'きれだない'],
    [adjective('いい'), 'adjectiveBa', 'いくれば'],
    [adjective('かっこいい'), 'adjectiveBa', 'かっこいくれば'],
    [quiet, 'adjectiveNaNegativePast', 'しずかだない'],
  ]) {
    const result = createAnswerAnalyzer(item, form)(input);
    assert.equal(result.kind, 'incorrect', input);
    assert.equal(result.diagnosis?.kcId ?? null, null, input);
    assert.deepEqual(result.diagnosis?.confirmedKcIds ?? [], [], input);
  }
});

test('valid variants and existing class or form diagnoses retain their precedence', () => {
  for (const [item, form, input] of [
    [high, 'adjectiveBa', 'たかければ'],
    [adjective('いい'), 'adjectiveBa', 'よければ'],
    [adjective('かっこいい'), 'adjectiveBa', 'かっこよければ'],
    [quiet, 'adjectiveNaNegative', 'しずかではない'], [quiet, 'adjectiveNaNegative', '静かじゃない'],
    [quiet, 'adjectiveNaNegative', 'しずかでない'], [quiet, 'adjectiveNaTe', '静かで'],
    [quiet, 'adjectiveAttributive', 'しずかな'], [quiet, 'adjectiveBa', 'しずかなら'],
    [quiet, 'adjectiveBa', '静かならば'], [quiet, 'adjectiveBa', 'しずかであれば'],
  ]) assert.equal(createAnswerAnalyzer(item, form)(input).kind, 'correct', input);
  // Reviewed against Japan Foundation's なら grammar: it also attaches to
  // i-adjectives. Preserve the old input, correct the mistaken class oracle.
  const nara = createAnswerAnalyzer(high, 'adjectiveBa')('高いなら');
  assert.equal(nara.diagnosis.kcId, null);
  assert.equal(nara.diagnosis.targetMismatch, true);
  assert.deepEqual(nara.diagnosis.confirmedKcIds, []);
  expectConnection(quiet, 'adjectiveNaNegative', '静かくない', 'adj.class.na');
  expectConnection(adjective('いい'), 'adjectiveBa', 'いければ', 'adj.exception.ii-yo');
  expectConnection(quiet, 'adjectiveNaTe', '静かだ', 'adj.suffix.na-te');

  // A custom normalizer can make the new analogy collide with a legacy class
  // interpretation. KC scoping must not bypass the legacy ambiguity guard.
  const collide = value => value.replace('高いなら', '高くれば');
  assert.equal(diagnoseCommonAdjectiveError(high, 'adjectiveBa', '高くれば', collide, ['adj.suffix.i-ba']), null);
  assert.equal(diagnoseCommonAdjectiveError(quiet, 'adjectiveNaNegative', '静かだない', value => value, []), null);
});
