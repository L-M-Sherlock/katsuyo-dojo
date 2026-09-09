import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createAnswerAnalyzer, normalizeAnswer } from '../app/lib/answer-analysis.mjs';
import { acceptedConjugations } from '../app/lib/conjugation.mjs';
import { COMPOUND_FORM_SPECS } from '../app/lib/compound-forms.mjs';
import { deriveUnified, unifiedDiagnosticSteps } from '../app/lib/unified-knowledge.mjs';
import { prioritizeContinuationFormSwitch } from '../app/lib/probe-routing.mjs';
import { planDiagnosticTransition } from '../app/lib/diagnostic-session.mjs';
import { CONTINUATION_FORM_MATRIX, generateContinuationSwitchCases } from '../scripts/lib/probe-routing-cases.mjs';
import { evaluateGeneratedCase } from '../scripts/lib/diagnosis-audit.mjs';

const seeds = JSON.parse(readFileSync(new URL('./fixtures/probe-form-switch-seeds.json', import.meta.url), 'utf8'));
const word = (surface, reading, cls) => ({ domain: 'verb', surface, reading, class: cls });
const ride = word('乗る', 'のる', 'godan');
const write = word('書く', 'かく', 'godan');
const analyze = (item, form, input) => createAnswerAnalyzer(item, form)(input);
const local = id => /^(stem\.|onbin\.|suffix\.|exception\.|adj\.(stem|suffix|exception)\.)/.test(id);
const compoundForms = Object.keys(CONTINUATION_FORM_MATRIX).flatMap(base => ['Past', 'Negative', 'NegativePast'].map(ending => base + ending));
const forms = [...compoundForms, 'passiveDesireNegativePast'];

test('frozen independent sibling examples prioritize only the observed continuation stage', () => {
  for (const [surface, reading, cls, form, input, target] of seeds.priority) {
    const item = word(surface, reading, cls), result = analyze(item, form, input);
    // Frozen expectation review: てある and contracted ている have the same
    // complete negative-past surface. The original seed stays unchanged, and
    // this explicit competing-expression witness overrides its first guess.
    if (form === 'tearuPast' && input === 'かいてなかった') {
      assert.ok(acceptedConjugations(reading, cls, 'tearuNegativePast').includes(input));
      assert.ok(acceptedConjugations(reading, cls, 'teiruNegativePast').includes(input));
      assert.equal(result.steps[0].form, 'tearu');
      assert.notEqual(result.feedback.resolution, 'stage-priority');
      continue;
    }
    assert.equal(result.kind, 'incorrect', input);
    assert.equal(result.diagnosis, null, input);
    assert.equal(result.feedback.resolution, 'stage-priority', input);
    assert.equal(result.steps.length, 1, input);
    assert.equal(result.steps[0].form, target, input);
    assert.equal(result.steps[0].continuation, true, input);
    assert.ok(result.steps[0].kcIds.every(local), input);
    assert.match(result.feedback.message, /前面的构成步骤未单独检查/);
    assert.deepEqual(result.steps, unifiedDiagnosticSteps(item, form, { answer: input, normalize: normalizeAnswer }));
  }
});

test('lexical damage, complete competing expressions and legitimate targets preserve their respective guards', () => {
  for (const [surface, reading, cls, form, input] of seeds.guard) {
    const result = analyze(word(surface, reading, cls), form, input);
    assert.notEqual(result.feedback?.resolution, 'stage-priority', `${form}: ${input}`);
  }
  for (const [surface, reading, cls, form, input] of seeds.correct) {
    assert.equal(analyze(word(surface, reading, cls), form, input).kind, 'correct', input);
  }
  for (const [item, form, input] of [
    [{ domain: 'adjective', class: 'i', surface: '高い', reading: 'たかい' }, 'adjectiveNegativePast', 'たかかった'],
    [{ domain: 'adjective', class: 'na', surface: '静か', reading: 'しずか' }, 'adjectiveNaNegativePast', 'しずかだった'],
  ]) {
    const result = analyze(item, form, input);
    assert.notEqual(result.feedback?.resolution, 'stage-priority');
    assert.equal(result.steps[0].continuation, false, 'an unperformed negative must still be assessed');
  }
});

test('the independent matrix explicitly covers every supported continuation family and ending', () => {
  const registered = [...new Set(Object.values(COMPOUND_FORM_SPECS).map(spec => spec.form))].sort();
  const listed = Object.keys(CONTINUATION_FORM_MATRIX).filter(base => !['passive', 'potential', 'causative', 'causativePassive'].includes(base)).sort();
  assert.deepEqual(listed, registered);
  assert.equal(compoundForms.length, 60);
  const items = [write, ride, word('泳ぐ', 'およぐ', 'godan'), word('話す', 'はなす', 'godan'),
    word('待つ', 'まつ', 'godan'), word('死ぬ', 'しぬ', 'godan'), word('遊ぶ', 'あそぶ', 'godan'),
    word('読む', 'よむ', 'godan'), word('買う', 'かう', 'godan'), word('行く', 'いく', 'godan'),
    word('食べる', 'たべる', 'ichidan'), word('増える', 'ふえる', 'ichidan'), word('する', 'する', 'irregular'),
    word('勉強する', 'べんきょうする', 'irregular'), word('来る', 'くる', 'irregular')];
  let priority = 0, guard = 0;
  for (const item of items) for (const form of forms) {
    const cases = generateContinuationSwitchCases(item, form);
    assert.ok(cases.length, `${item.surface}/${form}`);
    for (const seed of cases) {
      const result = analyze(item, form, seed.input);
      const c = { ...seed, item, form, step: null, kcIds: deriveUnified(item, form).requiredKcIds };
      const assessment = evaluateGeneratedCase(c, result);
      assert.equal(assessment.status, 'pass', `${item.surface}/${form}/${seed.input}: ${JSON.stringify(assessment.problems)}`);
      if (seed.expected.priority) priority++; else guard++;
    }
    for (const surface of [item.surface, item.reading]) for (const correct of acceptedConjugations(surface, item.class, form)) {
      assert.equal(analyze(item, form, correct).kind, 'correct');
    }
  }
  assert.ok(priority > 3000); assert.ok(guard > 3000);
});

test('sibling matching restores shared tail rules and never manufactures prefix or application evidence', () => {
  for (const [item, form, input, shared] of [
    [word('食べる', 'たべる', 'ichidan'), 'sugiruPast', 'たべすぎない', 'stem.ichidan.drop-ru'],
    [word('待つ', 'まつ', 'godan'), 'temorauPast', 'まってもらわなかった', 'onbin.sokuon'],
    [write, 'teokuPast', 'かいておかない', 'onbin.i'],
  ]) {
    const previous = unifiedDiagnosticSteps(item, form);
    assert.ok(previous[0].kcIds.includes(shared)); assert.ok(!previous[1].kcIds.includes(shared));
    const current = analyze(item, form, input);
    assert.equal(current.diagnosis, null);
    assert.ok(current.steps[0].kcIds.includes(shared));
    assert.equal(current.steps.flatMap(step => step.kcIds).filter(id => id === shared).length, 1);
    assert.ok(current.steps[0].kcIds.every(local));
    assert.deepEqual(unifiedDiagnosticSteps(item, form), previous, 'no mutation of full-plan scopes');
  }
});

test('sibling priority is script-normalized, never inferred from an arbitrary suffix and never resolves competing stages by order', () => {
  for (const input of ['のっていた', '乗っていた', 'ノッテイタ', ' ﾉｯﾃｲﾀ。 ']) {
    assert.equal(analyze(ride, 'teiruNegative', input).steps[0].form, 'teiruNegative');
  }
  const step = unifiedDiagnosticSteps(ride, 'teiruNegative')[1];
  const context = { step, family: COMPOUND_FORM_SPECS.teiruNegative, scope: step.kcIds };
  const snapshot = JSON.stringify(context);
  assert.equal(prioritizeContinuationFormSwitch(ride, 'のっていた', [context, context], normalizeAnswer), null);
  assert.equal(prioritizeContinuationFormSwitch(ride, 'のっていない', [context], normalizeAnswer), null);
  assert.equal(prioritizeContinuationFormSwitch(ride, 'よっていた', [context], normalizeAnswer), null);
  assert.equal(JSON.stringify(context), snapshot);
});

test('existing direct polite-ending diagnoses and completed intermediates keep precedence', () => {
  for (const [form, input, expected] of [['masuPast', 'かきません', 'compound.polite-past'],
    ['masuNegative', 'かきました', 'compound.polite-negative'], ['masuNegativePast', 'かきました', 'compound.polite-negative-past']]) {
    const result = analyze(write, form, input);
    assert.equal(result.diagnosis?.kcId, expected); assert.deepEqual(result.steps, []);
  }
  const completed = analyze(ride, 'teiruNegative', 'のっている');
  assert.notEqual(completed.feedback.resolution, 'stage-priority');
  assert.equal(completed.steps.length, 1); assert.equal(completed.steps[0].form, 'teiruNegative');
});

test('a complete negative only checks the remaining past, including the exact accepted contraction or spelling branch', () => {
  for (const [item, form, input, correct] of [
    [write, 'tagaruNegativePast', 'かきたがらない', 'かきたがらなかった'],
    [write, 'taiNegativePast', 'かきたくない', 'かきたくなかった'],
    [write, 'teshimauNegativePast', 'かいちゃわない', 'かいちゃわなかった'],
    [write, 'causativeNegativePast', 'かかさない', 'かかさなかった'],
    [word('する', 'する', 'irregular'), 'potentialNegativePast', '出来ない', '出来なかった'],
    [word('騒ぐ', 'さわぐ', 'godan'), 'passiveDesireNegativePast', 'さわがれたくない', 'さわがれたくなかった'],
  ]) {
    const result = analyze(item, form, input);
    assert.equal(result.diagnosis, null, input);
    assert.equal(result.steps.length, 1, input);
    const step = result.steps[0];
    assert.equal(step.form, 'adjectivePast');
    assert.deepEqual(step.kcIds, ['adj.suffix.i-past']);
    assert.ok([...step.providedAnswers].some(value => normalizeAnswer(value) === normalizeAnswer(input)));
    const probe = createAnswerAnalyzer(item, step.form, { step });
    assert.equal(probe(correct).kind, 'correct', input);
    assert.equal(probe(input).diagnosis?.kcId, 'adj.suffix.i-past', input);
    assert.deepEqual(probe(input).diagnosis?.confirmedKcIds, [], input);
    if (input === '出来ない') assert.equal(step.reading, 'できない');
  }
});

for (const mode of ['correct', 'repeat-sibling', 'unknown']) test(`all sibling-priority families terminate without repeated or skipped-prefix writes (${mode})`, () => {
  for (const form of forms) {
    const seed = generateContinuationSwitchCases(write, form).find(c => c.expected.priority);
    if (!seed) continue; // A family may be wholly ambiguous with another expression for this lexical item.
    let steps = analyze(write, form, seed.input).steps, evaluated = [], examined = [], index = 0;
    const initialScope = new Set(steps.flatMap(step => step.kcIds)), written = new Set();
    while (index < steps.length && index < 10) {
      const step = steps[index];
      const input = mode === 'correct' ? step.readings[0] : mode === 'repeat-sibling' ? seed.input : 'xyz§';
      const result = createAnswerAnalyzer(write, step.form, { step })(input);
      const transition = planDiagnosticTransition(steps, index, result, evaluated, examined);
      for (const id of transition.writes) { assert.ok(initialScope.has(id), id); assert.ok(!written.has(id), id); written.add(id); }
      assert.deepEqual(planDiagnosticTransition(transition.nextSteps, index, result, transition.evaluated, transition.examined).writes, []);
      steps = transition.nextSteps; evaluated = transition.evaluated; examined = transition.examined; index++;
    }
    assert.equal(index, steps.length, form);
    if (mode === 'correct') assert.deepEqual([...written], [...initialScope]);
    if (mode === 'unknown') assert.equal(written.size, 0);
  }
});
