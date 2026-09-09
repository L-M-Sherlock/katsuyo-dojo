import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { updateSkillStats } from '../app/lib/adaptive.mjs';
import { applyLearningObservation } from '../app/lib/learning-profile.mjs';
import { planDiagnosticTransition } from '../app/lib/diagnostic-session.mjs';
import { auditLearningCase } from '../scripts/lib/learning-evidence-contracts.mjs';
import { evaluateGeneratedCase } from '../scripts/lib/diagnosis-audit.mjs';
import { auditUniversalCase, auditFlow } from '../scripts/lib/universal-diagnosis-audit.mjs';

const frozen = JSON.parse(await readFile(new URL('./fixtures/independent-learning-evidence.json', import.meta.url), 'utf8'));
const makeCase = (seed, input = seed.wrongAnswer) => ({ item: seed.item, form: seed.form, input,
  kcIds: deriveUnified(seed.item, seed.form).requiredKcIds, expected: { kind: input === seed.answer ? 'correct' : 'incorrect', mode: input === seed.answer ? 'correct' : 'guided' } });
const seed = frozen.cases.find(candidate => candidate.id === 'family-teiru-Negative');
const sample = makeCase(seed), analyze = createAnswerAnalyzer(sample.item, sample.form);
const tamper = modify => (before, exercise, observation) => {
  const actual = applyLearningObservation(before, exercise, observation);
  return modify(actual, before, exercise, observation);
};
const changedMap = (map, id, correct = true) => ({ ...map, [id]: updateSkillStats(map[id], { correct }) });

test('both real generated-audit entry points check independent and assisted channels for every frozen compound target', () => {
  for (const row of frozen.cases.filter(candidate => candidate.kind === 'compound-assisted-recovery')) {
    for (const input of [row.wrongAnswer, row.answer]) {
      const c = makeCase(row, input), analyzer = createAnswerAnalyzer(c.item, c.form), result = analyzer(input);
      const exact = evaluateGeneratedCase(c, result), paths = auditUniversalCase(c, analyzer);
      assert.deepEqual(exact.problems, [], `${row.id}/${input}: exact audit`);
      assert.deepEqual(paths.problems, [], `${row.id}/${input}: path audit`);
      assert.equal(exact.learningChecks, 12);
      assert.equal(paths.learningChecks, 12);
    }
  }
});

test('the scorer contract still executes reveal protection for typo and invalid generated inputs', () => {
  for (const id of ['lexical-typo-does-not-fail', 'invalid-is-not-failure']) {
    const row = frozen.cases.find(candidate => candidate.id === id), c = makeCase(row, row.events[0].answer);
    const analysis = createAnswerAnalyzer(c.item, c.form)(c.input);
    assert.equal(analysis.kind, row.events[0].outcome);
    const checked = auditLearningCase(c, analysis);
    assert.deepEqual(checked.problems, []);
    assert.equal(checked.checks, 7, 'retry controls do not commit, while the distinct reveal action still executes and replays');
  }
});

test('generated audits fail if any assisted condition writes to the main or known-independent map', () => {
  const corruptions = [
    ['given-step', (r, _p, _e, o) => o.type === 'step'],
    ['manual-hint', (r, _p, _e, o) => o.hintUsed],
    ['grammar-feedback', (r, _p, _e, o) => o.hadGrammarFeedback],
    ['answer-reveal', (r, _p, _e, o) => o.outcome === 'revealed'],
    ['early-rehearsal', r => r.support.source === 'rehearsal'],
  ];
  for (const [name, affected] of corruptions) for (const channel of ['byKc', 'independentByKc']) {
    const observe = tamper((r, p, e, o) => {
      if (r.duplicate || !affected(r, p, e, o)) return r;
      const id = 'apply.teiru.continuation';
      return { ...r, profile: channel === 'byKc'
        ? { ...r.profile, byKc: changedMap(r.profile.byKc, id) }
        : { ...r.profile, assessment: { ...r.profile.assessment, independentByKc: changedMap(r.profile.assessment.independentByKc, id) } } };
    });
    const exact = evaluateGeneratedCase(sample, analyze(sample.input), { observe });
    const paths = auditUniversalCase(sample, analyze, { observe });
    assert.equal(exact.status, 'regression', `${name}/${channel}: exact integration`);
    assert.ok(exact.problems.some(problem => problem.code === 'learning-forbidden-write'), `${name}/${channel}`);
    assert.ok(paths.problems.some(problem => problem.code === 'learning-forbidden-write'), `${name}/${channel}: path integration`);
  }
});

test('generated audits reject nonlocal assisted records, missing local records, and false retest completion', () => {
  const correct = makeCase(seed, seed.answer), analysis = analyze(correct.input);
  for (const id of ['class.godan', 'heuristic.ru-other', 'apply.teiru.continuation', 'facet.apply.teiru.negative']) {
    const observe = tamper((r, _p, _e, o) => o.type !== 'step' || r.duplicate ? r : { ...r,
      profile: { ...r.profile, assessment: { ...r.profile.assessment, assistedByKc: changedMap(r.profile.assessment.assistedByKc, id) } } });
    assert.ok(auditLearningCase(correct, analysis, { observe }).problems.some(problem => problem.code === 'learning-nonlocal-practice'), id);
  }
  const omitted = tamper((r, before) => ({ ...r, profile: before }));
  assert.ok(auditLearningCase(correct, analysis, { observe: omitted }).problems.some(problem => problem.code === 'learning-missing-observation'
    || problem.code === 'learning-wrong-count'), 'a scorer that suppresses all evidence must not pass');
  const cleared = tamper((r, _p, _e, o) => o.type !== 'step' || r.duplicate ? r : { ...r,
    profile: { ...r.profile, assessment: { ...r.profile.assessment, pending: {} } } });
  assert.ok(auditLearningCase(correct, analysis, { observe: cleared }).problems.some(problem => problem.code === 'learning-lost-pending'));
});

test('generated audits reject repeated writes and accidental input mutation rather than caching a successful verdict', () => {
  const repeated = tamper((r, _p, _e, o) => !r.duplicate ? r : { ...r, duplicate: false,
    profile: { ...r.profile, assessment: { ...r.profile.assessment,
      assistedByKc: changedMap(r.profile.assessment.assistedByKc, o.kcIds.find(id => id.startsWith('suffix.')) ?? 'suffix.negative') } } });
  assert.ok(auditLearningCase(sample, analyze(sample.input), { observe: repeated }).problems.some(problem => problem.code === 'learning-unprotected-repeat'));
  const mutated = (before, exercise, observation) => {
    before.byKc['suffix.negative'].attempts++;
    return applyLearningObservation(before, exercise, observation);
  };
  assert.ok(auditLearningCase(sample, analyze(sample.input), { observe: mutated }).problems.some(problem => problem.code === 'learning-observer-exception'));
  assert.deepEqual(auditLearningCase(sample, analyze(sample.input)).problems, [], 'prior malicious observers cannot poison a later valid run');
});

test('universal sequential flows retain legacy arithmetic assertions and also check the real profile channel', () => {
  const exercise = { item: { domain: 'verb', surface: '閉める', reading: 'しめる', class: 'ichidan' }, form: 'tagaruNegativePast' };
  exercise.kcIds = deriveUnified(exercise.item, exercise.form).requiredKcIds;
  const initial = createAnswerAnalyzer(exercise.item, exercise.form)('xyz§');
  const options = { exercise, initial, transition: planDiagnosticTransition, bound: 30,
    analyzerForStep: step => createAnswerAnalyzer(exercise.item, exercise.form, { step }),
    answerForStep: step => step.kind === 'classification' ? step.expectedClass : step.readings[0] };
  const good = auditFlow(options);
  assert.deepEqual(good.problems, []);
  assert.ok(good.learningChecks >= good.steps * 14 + 1);
  const broken = tamper((r, _p, _e, o) => o.type !== 'step' || r.duplicate ? r : { ...r,
    profile: { ...r.profile, byKc: changedMap(r.profile.byKc, 'apply.tagaru.continuation') } });
  const bad = auditFlow({ ...options, observe: broken });
  assert.ok(bad.problems.some(problem => problem.code === 'learning-forbidden-write'));
  const legacyBroken = (steps, index, analysis, known, examined) => {
    const result = planDiagnosticTransition(steps, index, analysis, known, examined);
    return { ...result, writes: [] };
  };
  assert.ok(auditFlow({ ...options, transition: legacyBroken }).problems.some(problem => problem.code === 'wrong-flow-write'),
    'adding channel checks must not delete the older queue/statistics assertion');
});
