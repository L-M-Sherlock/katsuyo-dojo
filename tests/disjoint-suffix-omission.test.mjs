import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { deriveUnified, unifiedDiagnosticSteps } from '../app/lib/unified-knowledge.mjs';
import { planDiagnosticTransition } from '../app/lib/diagnostic-session.mjs';
import { emptySkillStats, updateKnowledgeStats } from '../app/lib/adaptive.mjs';
import { commonSuffixMutations } from '../scripts/lib/common-error-patterns.mjs';
import { generateErrorCases } from '../scripts/lib/error-patterns.mjs';
import { auditGeneratedCase } from '../scripts/lib/diagnosis-audit.mjs';
import { wholeErrorCases, atomicErrorCases } from '../scripts/lib/universal-error-cases.mjs';
import { atomicSteps, buildDiagnosticPlan } from '../app/lib/diagnostic-plan.mjs';

const close = { domain: 'verb', surface: '閉める', reading: 'しめる', class: 'ichidan' };
const disjoint = 'common-suffix-disjoint';

test('two separated omissions in causative-passive identify only its suffix in whole and supplied-base questions', () => {
  const steps = unifiedDiagnosticSteps(close, 'causativePassiveNegativePast');
  for (const step of [undefined, steps[0]]) for (const input of ['しめせれる', '閉めせれる', ' しめせれる。 ']) {
    const analysis = createAnswerAnalyzer(close, 'causativePassive', { step })(input);
    assert.equal(analysis.diagnosis?.kcId, 'suffix.causativePassive', input);
    assert.deepEqual(analysis.diagnosis.confirmedKcIds, []);
    assert.deepEqual(analysis.steps, []);
    assert.match(analysis.feedback.message, /「せれる」/);
    assert.match(analysis.feedback.message, /「させられる」/);
    assert.doesNotMatch(analysis.feedback.message, /不能唯一|未确认的变化/);
    const ids = step?.kcIds ?? deriveUnified(close, 'causativePassive').requiredKcIds;
    const before = Object.fromEntries(ids.map(id => [id, { ...emptySkillStats(), attempts: 5, correct: 5, filteredAccuracy: 1, confidence: 1, bestConfidence: 1 }]));
    const after = updateKnowledgeStats(before, { kcIds: ids, focusId: 'suffix.causativePassive', failedKcId: analysis.diagnosis.kcId, correct: false });
    assert.deepEqual(ids.filter(id => after[id] !== before[id]), ['suffix.causativePassive']);
  }
  const analyzed = createAnswerAnalyzer(close, steps[0].form, { step: steps[0] })('しめせれる');
  const transition = planDiagnosticTransition(steps, 0, analyzed);
  assert.deepEqual(transition.writes, ['suffix.causativePassive']);
  assert.deepEqual(transition.followups, []);
  assert.equal(transition.nextSteps.length, 2);
  assert.equal(transition.nextSteps[1].reading, 'しめさせられる');
  assert.equal(transition.nextSteps[1].targetLabel, '否定过去形');
});

test('a suffix mutation does not override accepted variants, compete away other rules, or cross a stem boundary', () => {
  assert.equal(createAnswerAnalyzer(close, 'causativePassive')('しめらせられる').diagnosis?.kcId, 'class.ichidan', 'a complete wrong-class form retains its class diagnosis');
  assert.equal(createAnswerAnalyzer({ domain: 'verb', surface: '取る', reading: 'とる', class: 'godan' }, 'potential')('とられる').diagnosis, null, 'competing class and target-form explanations remain ambiguous');
  assert.equal(createAnswerAnalyzer(close, 'potential')('しめれる').kind, 'correct', 'accepted short potential');
  assert.equal(createAnswerAnalyzer({ domain: 'verb', surface: '読む', reading: 'よむ', class: 'godan' }, 'causativePassive')('よまされる').kind, 'correct', 'accepted contracted causative passive');
  for (const input of ['しませれる', 'しめるせれる', 'しせれる', 'せれる', 'xyz§']) {
    assert.equal(createAnswerAnalyzer(close, 'causativePassive')(input).diagnosis?.kcId ?? null, null, input);
  }
  const base = unifiedDiagnosticSteps(close, 'causativePassiveNegativePast')[0];
  const restricted = { ...base, kcIds: ['stem.ichidan.drop-ru'], focusId: 'stem.ichidan.drop-ru' };
  assert.equal(createAnswerAnalyzer(close, restricted.form, { step: restricted })('しめせれる').diagnosis, null);
});

test('the independent generator enumerates every separated pair of deletions inside one suffix', () => {
  const suffix = 'させられる', expected = new Set();
  // Enumerate retained-position masks independently of the production loops.
  for (let mask = 0; mask < 2 ** suffix.length; mask++) {
    const missing = [...suffix].flatMap((_, i) => mask & (1 << i) ? [] : [i]);
    if (missing.length === 2 && missing[1] - missing[0] > 1) expected.add([...suffix].filter((_, i) => mask & (1 << i)).join(''));
  }
  const generated = commonSuffixMutations(suffix).filter(c => c.pattern === disjoint);
  assert.deepEqual(new Set(generated.map(c => c.suffix)), expected);
  assert.ok(generated.some(c => c.suffix === 'せれる'));
});

test('the screenshot is a strict diagnosis contract in whole and probe audits, not merely a guided fallback', () => {
  for (const form of ['causativePassive', 'causativePassiveNegativePast']) {
    const generated = generateErrorCases({ item: close, form }).cases;
    const c = generated.find(c => c.pattern === disjoint && c.input === 'しめせれる');
    assert.ok(c, form);
    assert.deepEqual(c.expected, { kind: 'incorrect', failed: 'suffix.causativePassive', confirmed: [], steps: 0 });
    const analyze = createAnswerAnalyzer(c.item, c.form, { step: c.step });
    assert.equal(auditGeneratedCase(c, analyze).status, 'pass');
    const broken = input => ({ ...analyze(input), diagnosis: null });
    assert.equal(auditGeneratedCase(c, broken).status, 'regression', 'removing attribution must fail this contract');
  }
  const exercise = { item: close, form: 'causativePassive', kcIds: deriveUnified(close, 'causativePassive').requiredKcIds };
  assert.ok([...wholeErrorCases(exercise)].some(c => c.family === 'omit' && c.input === 'しめせれる'));
  const suffixStep = atomicSteps(buildDiagnosticPlan(close, exercise.form), exercise.form, exercise.kcIds).find(s => s.kcIds.includes('suffix.causativePassive'));
  const atomic = [...atomicErrorCases(exercise, suffixStep)].find(c => c.input === 'しめせれる');
  assert.deepEqual(atomic.expected, { mode: 'leaf', failed: 'suffix.causativePassive' });
});
