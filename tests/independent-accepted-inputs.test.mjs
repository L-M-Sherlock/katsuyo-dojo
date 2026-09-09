import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptedConjugations } from '../app/lib/conjugation.mjs';
import { createAnswerAnalyzer, normalizeAnswer } from '../app/lib/answer-analysis.mjs';
import { matchAcceptedAnswer, acceptedVariantNote, acceptedVariantKcIds } from '../app/lib/answer-variants.mjs';
import { buildDiagnosticPlan, atomicSteps } from '../app/lib/diagnostic-plan.mjs';
import { deriveUnified, unifiedDiagnosticSteps } from '../app/lib/unified-knowledge.mjs';
import { auditPlan } from '../scripts/lib/diagnostic-oracle.mjs';

const verb = (surface, reading, cls) => ({ domain: 'verb', surface, reading, class: cls });
const eat = verb('食べる', 'たべる', 'ichidan');
const see = verb('見る', 'みる', 'ichidan');
const doVerb = verb('する', 'する', 'irregular');
const study = verb('勉強する', 'べんきょうする', 'irregular');
const high = { domain: 'adjective', class: 'i', surface: '高い', reading: 'たかい', iiFamily: false };

// Independent expected forms: Tokyo Metropolitan University gives みろ/みよ
// and べろ/べよ in its imperative table, rather than only the colloquial ろ.
// https://metro-noix.tmu.ac.jp/article/0008.html
// Freeze correct forms before implementation; none are derived from a registry.
test('accepts standard ichidan yo imperatives while retaining the default ro form', () => {
  assert.deepEqual(acceptedConjugations('食べる', 'ichidan', 'imperative'), ['食べろ', '食べよ']);
  assert.deepEqual(acceptedConjugations('見る', 'ichidan', 'imperative'), ['見ろ', '見よ']);
  for (const [item, inputs] of [[eat, ['食べよ', 'たべよ', 'タベヨ', 'ﾀﾍﾞﾖ']], [see, ['見よ', 'みよ', 'ミヨ']]]) {
    for (const input of inputs) {
      const result = createAnswerAnalyzer(item, 'imperative')(input);
      assert.equal(result.kind, 'correct', input);
      assert.equal(result.diagnosis, null);
      assert.deepEqual(result.steps, []);
      assert.ok(result.match.variant, input);
      assert.match(result.match.variant.surface, /よ$/);
      assert.doesNotMatch(acceptedVariantNote(item, 'imperative', result.match.variant), /ら.*口语/);
    }
  }
  for (const [item, input] of [[verb('書く', 'かく', 'godan'), 'かけよ'], [doVerb, 'しよ'], [eat, 'たべるよ']]) {
    assert.notEqual(createAnswerAnalyzer(item, 'imperative')(input).kind, 'correct', input);
  }
});

test('accepts the deki kanji spelling throughout the supported potential family', () => {
  for (const [form, canonical, written] of [
    ['potential', 'できる', '出来る'],
    ['potentialPast', 'できた', '出来た'],
    ['potentialNegative', 'できない', '出来ない'],
    ['potentialNegativePast', 'できなかった', '出来なかった'],
  ]) {
    assert.deepEqual(acceptedConjugations('する', 'irregular', form), [canonical, written]);
    for (const [item, surfacePrefix, readingPrefix] of [[doVerb, '', ''], [study, '勉強', 'べんきょう']]) {
      const surface = acceptedConjugations(item.surface, item.class, form);
      const reading = acceptedConjugations(item.reading, item.class, form);
      assert.equal(surface.length, reading.length);
      const result = createAnswerAnalyzer(item, form)(surfacePrefix + written);
      assert.equal(result.kind, 'correct', form);
      assert.deepEqual(result.match.variant, { surface: surfacePrefix + written, reading: readingPrefix + canonical });
      assert.doesNotMatch(acceptedVariantNote(item, form, result.match.variant), /省略.*ら|口语可能/);
      assert.deepEqual(acceptedVariantKcIds(item, form, result.match.variant), []);
      assert.deepEqual(matchAcceptedAnswer(surfacePrefix + written, surface, reading, normalizeAnswer), result.match);
      assert.equal(createAnswerAnalyzer(item, form)(readingPrefix + canonical).match.variant, null);
    }
  }
  assert.notEqual(createAnswerAnalyzer(doVerb, 'potential')('出来れる').kind, 'correct');
  assert.notEqual(createAnswerAnalyzer(doVerb, 'potentialNegative')('出来た').kind, 'correct');
  assert.notEqual(createAnswerAnalyzer(verb('来る', 'くる', 'irregular'), 'potential')('出来る').kind, 'correct');
});

test('spelling variants do not masquerade as ra deletion and genuine contracted potentials keep their note', () => {
  for (const [item, form, input] of [
    [eat, 'potential', '食べれる'], [eat, 'potentialNegative', '食べれない'],
    [verb('来る', 'くる', 'irregular'), 'potentialPast', '来れた'],
  ]) {
    const result = createAnswerAnalyzer(item, form)(input);
    assert.equal(result.kind, 'correct', input);
    assert.match(acceptedVariantNote(item, form, result.match.variant), /省略「ら」/);
  }
});

test('normalization changes kana script and width without changing pronunciation or morphology', () => {
  assert.equal(normalizeAnswer(' ﾀｶｶｯﾀ。 '), 'たかかった');
  assert.equal(normalizeAnswer('タカカッタ'), 'たかかった');
  assert.equal(normalizeAnswer('タ\u3099ッタ'), 'だった');
  assert.equal(normalizeAnswer('ｳﾞｧｲｵﾘﾝ'), 'ゔぁいおりん');
  assert.equal(normalizeAnswer('コーヒー'), 'こーひー');
  assert.notEqual(normalizeAnswer('コーヒー'), normalizeAnswer('こおひい'));
  assert.notEqual(normalizeAnswer('タカカツタ'), normalizeAnswer('たかかった'));
  assert.notEqual(normalizeAnswer('タガカッタ'), normalizeAnswer('たかかった'));
  assert.equal(normalizeAnswer('出来る'), '出来る', 'kanji acceptance is a form variant, not global character replacement');
  for (const input of ['タカカッタ', 'ﾀｶｶｯﾀ', ' 高カッタ。 ']) {
    assert.equal(createAnswerAnalyzer(high, 'adjectivePast')(input).kind, 'correct', input);
  }
  const wrongKana = createAnswerAnalyzer(high, 'adjectivePast')('たかかつた');
  const wrongKatakana = createAnswerAnalyzer(high, 'adjectivePast')('ﾀｶｶﾂﾀ');
  assert.equal(wrongKatakana.kind, 'incorrect');
  assert.equal(wrongKatakana.diagnosis?.kcId, wrongKana.diagnosis?.kcId);
  assert.equal(wrongKatakana.diagnosis?.kcId, 'adj.suffix.i-past');
  const lexicalKana = createAnswerAnalyzer(high, 'adjectivePast')('たがかった');
  const lexicalKatakana = createAnswerAnalyzer(high, 'adjectivePast')('タガカッタ');
  assert.equal(lexicalKatakana.kind, lexicalKana.kind);
  assert.notEqual(lexicalKatakana.kind, 'correct');
  assert.equal(lexicalKatakana.diagnosis?.kcId ?? null, lexicalKana.diagnosis?.kcId ?? null);
});

test('invalid input and raw length limits apply before kana normalization can shorten input', () => {
  const analyze = createAnswerAnalyzer(high, 'adjectivePast');
  const boundary = 'ﾀｶｶｯﾀ' + ' '.repeat(256 - Array.from('ﾀｶｶｯﾀ').length);
  for (const input of ['', ' 。！？ ', null, 123, boundary + ' ']) {
    const result = analyze(input);
    assert.equal(result.kind, 'invalid', String(input));
    assert.equal(result.diagnosis, null);
    assert.deepEqual(result.steps, []);
  }
  assert.equal(analyze(boundary).kind, 'correct');
  const combined = 'カ\u3099'.repeat(129);
  assert.equal(Array.from(normalizeAnswer(combined)).length, 129);
  assert.equal(analyze(combined).kind, 'invalid', 'raw 258 code points still exceed the 256 limit');
});

test('new legal variants remain consistent with native plans and supplied practice', () => {
  for (const [item, form] of [[eat, 'imperative'], [see, 'imperative'],
    [doVerb, 'potential'], [doVerb, 'potentialPast'], [doVerb, 'potentialNegative'], [doVerb, 'potentialNegativePast'],
    [study, 'potentialNegativePast']]) {
    const plan = buildDiagnosticPlan(item, form);
    assert.deepEqual(auditPlan(item, form, plan), [], `${item.surface}/${form}`);
  }
  const commandPlan = buildDiagnosticPlan(eat, 'imperative');
  const commandStep = atomicSteps(commandPlan, 'imperative', deriveUnified(eat, 'imperative').requiredKcIds).at(-1);
  for (const input of ['食べよ', 'たべよ', 'ﾀﾍﾞﾖ']) assert.equal(createAnswerAnalyzer(eat, 'imperative', { step: commandStep })(input).kind, 'correct', input);
  const potentialStep = unifiedDiagnosticSteps(doVerb, 'potentialNegativePast').at(-1);
  for (const input of ['出来なかった', 'デキナカッタ']) assert.equal(createAnswerAnalyzer(doVerb, 'potentialNegativePast', { step: potentialStep })(input).kind, 'correct', input);
});
