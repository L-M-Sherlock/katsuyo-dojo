import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnswerAnalyzer, normalizeAnswer } from '../app/lib/answer-analysis.mjs';
import { unifiedDiagnosticSteps, deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { prioritizeContinuationPast } from '../app/lib/probe-routing.mjs';
import { COMPOUND_FORM_SPECS } from '../app/lib/compound-forms.mjs';
import { planDiagnosticTransition } from '../app/lib/diagnostic-session.mjs';
import { emptySkillStats, updateKnowledgeStats } from '../app/lib/adaptive.mjs';

const late = { domain: 'verb', surface: '遅れる', reading: 'おくれる', class: 'ichidan' };
const write = { domain: 'verb', surface: '書く', reading: 'かく', class: 'godan' };
const analyze = (item, form, input) => createAnswerAnalyzer(item, form)(input);

test('the original 遅れる error immediately checks the derived class and past without scoring its prefix', () => {
  for (const input of ['おくれたがた', '遅れたがた', 'オクレタガタ', ' ｵｸﾚﾀｶﾞﾀ。 ']) {
    const result = analyze(late, 'tagaruPast', input);
    assert.equal(result.kind, 'incorrect'); assert.equal(result.diagnosis, null);
    assert.equal(result.feedback.resolution, 'stage-priority');
    assert.match(result.feedback.message, /前面的构成步骤未单独检查/);
    assert.doesNotMatch(result.feedback.message, /五段|一段|促音|たがった/);
    const [category, past] = result.steps;
    assert.equal(result.steps.length, 2);
    assert.equal(category.kind, 'classification'); assert.equal(category.diagnosticOnly, true);
    assert.equal(category.reading, 'おくれたがる'); assert.deepEqual(category.kcIds, []);
    assert.equal(past.kind, 'conjugation'); assert.equal(past.providedClass, 'godan');
    assert.deepEqual(past.kcIds, ['onbin.sokuon', 'suffix.past']);
    assert.deepEqual(result.steps, unifiedDiagnosticSteps(late, 'tagaruPast', { answer: input, normalize: normalizeAnswer }));
    const before = Object.fromEntries(deriveUnified(late, 'tagaruPast').requiredKcIds.map(id => [id, emptySkillStats()]));
    assert.deepEqual(updateKnowledgeStats(before, { kcIds: Object.keys(before), correct: false }), before);
  }
});

test('the same exact routing applies across regular derived past families without hard-coding a word', () => {
  for (const [form, input, cls] of [
    ['tagaruPast', 'かきたがた', 'godan'], ['teoruPast', 'かいておた', 'godan'],
    ['teageruPast', 'かいてあげった', 'ichidan'], ['tekureruPast', 'かいてくれった', 'ichidan'],
    ['temiruPast', 'かいてみった', 'ichidan'], ['sugiruPast', 'かきすぎった', 'ichidan'],
    ['passivePast', 'かかれった', 'ichidan'], ['potentialPast', 'かけった', 'ichidan'],
    ['causativePast', 'かかせった', 'ichidan'], ['causativePassivePast', 'かかせられった', 'ichidan'],
  ]) {
    const result = analyze(write, form, input);
    assert.equal(result.feedback.resolution, 'stage-priority', input);
    assert.equal(result.diagnosis, null); assert.equal(result.steps[0].expectedClass, cls);
    assert.equal(result.steps[1].providedClass, cls);
    assert.deepEqual(result.steps[1].kcIds, cls === 'godan' ? ['onbin.sokuon', 'suffix.past'] : ['stem.ichidan.drop-ru', 'suffix.past']);
  }
  assert.equal(analyze({ domain: 'verb', surface: 'する', reading: 'する', class: 'irregular' }, 'tagaruPast', 'したがた').feedback.resolution, 'stage-priority');
});

test('a skipped base cannot suppress a shared rule actually required by the new first assessment', () => {
  for (const [item, form, input, shared] of [
    [{ domain: 'verb', surface: '待つ', reading: 'まつ', class: 'godan' }, 'teoruPast', 'まっておた', 'onbin.sokuon'],
    [{ domain: 'verb', surface: '食べる', reading: 'たべる', class: 'ichidan' }, 'teageruPast', 'たべてあげった', 'stem.ichidan.drop-ru'],
  ]) {
    const oldPlan = unifiedDiagnosticSteps(item, form);
    assert.ok(oldPlan[0].kcIds.includes(shared)); assert.ok(!oldPlan[1].kcIds.includes(shared));
    const result = analyze(item, form, input);
    assert.ok(result.steps[1].kcIds.includes(shared));
    assert.equal(result.steps.flatMap(s => s.kcIds).filter(id => id === shared).length, 1);
    assert.deepEqual(unifiedDiagnosticSteps(item, form), oldPlan, 'template scope and supplied-step semantics are unchanged');
  }
});

test('another complete expression, lexical damage, and unsupported tails do not bypass the base', () => {
  for (const [item, form, input, first] of [
    [write, 'teiruPast', 'かいていった', 'teiru'],
    [late, 'tagaruPast', 'おこれたがた', 'tagaru'],
    [late, 'tagaruPast', 'おくれたがだ', 'tagaru'],
    [late, 'tagaruPast', 'おくれたがたた', 'tagaru'],
    [late, 'tagaruNegative', 'おくれたがない', 'tagaru'],
    [late, 'tagaruNegativePast', 'おくれたがなかった', 'tagaru'],
    [write, 'tearuPast', 'かいてあた', 'tearu'],
  ]) {
    const result = analyze(item, form, input);
    assert.notEqual(result.feedback.resolution, 'stage-priority', input);
    assert.equal(result.steps[0].form, first, input);
  }
  assert.equal(analyze(late, 'tagaruPast', 'おくれりたがった').diagnosis?.kcId, 'class.ichidan');
});

test('correct answers, retries and exact completed intermediates keep their existing precedence', () => {
  assert.equal(analyze(late, 'tagaruPast', 'おくれたがった').kind, 'correct');
  assert.equal(analyze(late, 'tagaruPast', 'おこれたがった').kind, 'typo');
  assert.equal(analyze(late, 'tagaruPast', '').kind, 'invalid');
  const stop = analyze(late, 'tagaruPast', 'おくれたがる');
  assert.equal(stop.steps.length, 1); assert.equal(stop.steps[0].form, 'tagaruPast');
  assert.notEqual(stop.feedback.resolution, 'stage-priority');
});

test('multiple matching stage contexts never select an arbitrary winner or mutate their scopes', () => {
  const step = unifiedDiagnosticSteps(late, 'tagaruPast')[1];
  const context = { step, family: COMPOUND_FORM_SPECS.tagaruPast, scope: step.kcIds };
  const snapshot = JSON.stringify(context);
  assert.equal(prioritizeContinuationPast(late, 'おくれたがた', [context, context], normalizeAnswer), null);
  assert.equal(JSON.stringify(context), snapshot);
});

for (const mode of ['correct', 'repeat-error', 'unknown']) test(`priority flow terminates with only observed native-rule writes (${mode})`, () => {
  const form = 'tagaruPast', original = analyze(late, form, 'おくれたがた');
  let steps = original.steps, evaluated = [], examined = [], index = 0;
  const written = new Set();
  while (index < steps.length && index < 8) {
    const step = steps[index];
    const input = step.kind === 'classification' ? mode === 'correct' ? 'godan' : 'ichidan'
      : mode === 'unknown' ? 'xyz§' : mode === 'repeat-error' ? 'おくれたがた' : step.readings[0];
    const result = createAnswerAnalyzer(late, step.form, { step })(input);
    const transition = planDiagnosticTransition(steps, index, result, evaluated, examined);
    if (step.kind === 'classification') assert.deepEqual(transition.writes, []);
    for (const id of transition.writes) { assert.ok(['onbin.sokuon', 'suffix.past'].includes(id)); assert.ok(!written.has(id)); written.add(id); }
    assert.deepEqual(planDiagnosticTransition(transition.nextSteps, index, result, transition.evaluated, transition.examined).writes, []);
    steps = transition.nextSteps; evaluated = transition.evaluated; examined = transition.examined; index++;
  }
  assert.equal(index, steps.length);
  assert.deepEqual([...written], mode === 'correct' ? ['onbin.sokuon', 'suffix.past'] : mode === 'repeat-error' ? ['onbin.sokuon'] : []);
});
