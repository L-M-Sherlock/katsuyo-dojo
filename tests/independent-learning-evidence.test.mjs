import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { planDiagnosticTransition } from '../app/lib/diagnostic-session.mjs';
import { evidenceCondition, scoreLearningEvidence } from '../app/lib/learning-evidence.mjs';
import { assessmentTarget, emptyAssessment, recordIndependentAttempt, recordAssistedAttempt } from '../app/lib/learning-assessment.mjs';

const raw = await readFile(new URL('./fixtures/independent-learning-evidence.json', import.meta.url), 'utf8');
const frozen = JSON.parse(raw), seeds = frozen.cases, seedById = new Map(seeds.map(seed => [seed.id, seed]));
const reviews = JSON.parse(await readFile(new URL('./fixtures/independent-learning-evidence-reviews.json', import.meta.url), 'utf8'));
const instant = '2026-09-09T12:00:00.000Z';
const emptyMaps = () => ({ byKc: {}, independentByKc: {}, assistedByKc: {} });
const stats = () => ({ attempts: 8, correct: 6, filteredAccuracy: .6, confidence: .6 / .85,
  bestConfidence: .9, cleanTimeTotal: 1200, cleanTimeCount: 2 });
const populated = ids => ({ byKc: Object.fromEntries(ids.map(id => [id, stats()])), independentByKc: {}, assistedByKc: {} });
const changedIds = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])]
  .filter(id => JSON.stringify(before[id]) !== JSON.stringify(after[id]));
// This prohibition is declared independently of production classification and
// local-rule filters. A broken production allowlist must not change the oracle.
const protectedSourceIds = ['class.godan', 'class.ichidan', 'class.irregular', 'adj.class.i', 'adj.class.na',
  'heuristic.ru-ie', 'heuristic.ru-other', 'exception.ru-godan', 'lexeme.ru-godan.帰る',
  'facet.class.irregular.suru', 'facet.class.irregular.kuru', 'facet.adj.class.na.regular', 'facet.adj.class.na.i-ending'];
const compositeIds = ['apply.teiru.continuation', 'facet.apply.teiru.negative', 'compound.negative-past',
  'compound.multi-step', 'adj.compound.i-negative-past', 'adj.compound.na-negative-past'];
const localIds = ['stem.ichidan.drop-ru', 'stem.godan.a', 'onbin.sokuon', 'suffix.te', 'suffix.past', 'suffix.negative',
  'construction.teiru', 'adj.stem.i-ku', 'adj.suffix.i-past', 'adj.suffix.i-negative', 'exception.aru-negative'];
const completeScope = [...protectedSourceIds, ...compositeIds, ...localIds];

function score(maps, kcIds, analysis, { form, support, diagnosticOnly = false, focusId } = {}) {
  return scoreLearningEvidence(maps, { kcIds, form, focusId, correct: analysis.kind === 'correct',
    failedKcId: analysis.diagnosis?.kcId, confirmedKcIds: analysis.diagnosis?.confirmedKcIds ?? [],
    support, diagnosticOnly });
}

test('independent learning evidence keeps all 103 preimplementation seeds and their original expectations frozen', () => {
  assert.equal(seeds.length, 103);
  assert.equal(seedById.size, 103);
  assert.equal(frozen.invariants.length, 15);
  assert.equal(createHash('sha256').update(raw).digest('hex'), '67986bb760c0b15b445a2d09c4a2aec2550c646956a1b29792310780758b6eb8');
  assert.equal(seeds.filter(seed => seed.kind === 'compound-assisted-recovery').length, 67);
  assert.ok(frozen.revisions.every(revision => revision.reason && revision.priorSha256));
});

test('the actual 乗る log now records assisted local practice while preserving the pre-step application score and pending retest', () => {
  const events = frozen.sourceExport.observedLatestQuestion;
  assert.deepEqual(events.map(event => event.sequence), [17, 18, 19, 20]);
  const source = events[0].exercise, exercise = { item: { domain: source.domain, surface: source.surface,
    reading: source.reading, class: source.wordClass }, form: source.form, courseId: source.courseId };
  const baseline = {};
  for (const event of events) for (const change of event.changes) {
    if (!(change.kcId in baseline)) baseline[change.kcId] = change.before;
  }
  let maps = { ...emptyMaps(), byKc: Object.fromEntries(Object.entries(baseline).filter(([, value]) => value !== null)) };
  const before = structuredClone(maps), initialByKc = structuredClone(maps.byKc);
  let assessment = emptyAssessment();
  for (const event of events) {
    if (event.type === 'diagnostic-end') continue;
    assert.equal(event.hintUsed, false, 'the real defect occurs without a manual hint');
    const step = event.type === 'step' ? { kind: event.target.kind, continuation: event.target.reading !== source.reading } : null;
    const support = evidenceCondition({ type: event.type, step });
    maps = scoreLearningEvidence(maps, { kcIds: event.target.kcIds, form: event.target.form,
      correct: event.outcome === 'correct', failedKcId: event.diagnosis.kcId,
      confirmedKcIds: event.diagnosis.confirmedKcIds, support });
    assessment = event.type === 'question'
      ? recordIndependentAttempt(assessment, { exercise, questionId: 'real-log-noru', correct: false, at: event.at })
      : recordAssistedAttempt(assessment, { exercise, questionId: 'real-log-noru', eventId: `real-log-${event.sequence}`,
        correct: true, at: event.at });
    assert.deepEqual(maps.byKc, initialByKc, `event ${event.sequence}: independent scores must remain unchanged`);
  }
  assert.deepEqual(maps.independentByKc, {});
  assert.equal(maps.byKc['apply.teiru.continuation'].attempts, 2);
  assert.equal(maps.byKc['apply.teiru.continuation'].confidence, 0.4705882352941177);
  assert.equal(maps.byKc['facet.apply.teiru.negative'], undefined);
  assert.deepEqual(Object.keys(maps.assistedByKc).sort(), ['construction.teiru', 'onbin.sokuon', 'stem.ichidan.drop-ru', 'suffix.negative', 'suffix.te']);
  assert.ok(Object.values(maps.assistedByKc).every(value => value.attempts === 1 && value.correct === 1));
  const key = assessmentTarget(exercise).key;
  assert.ok(assessment.pending[key]);
  assert.equal(assessment.byTarget[key].independentCorrect, 0);
  assert.equal(assessment.byTarget[key].assistedStepCorrect, 2);
  assert.equal(assessment.originalCount, 1);
  assert.deepEqual(before.byKc, initialByKc, 'replay may not mutate frozen original snapshots');
});

test('67 independently specified wrong-form recovery flows never turn guided success into independent mastery or coverage', t => {
  let actualSteps = 0;
  for (const seed of seeds.filter(seed => seed.kind === 'compound-assisted-recovery')) {
    const label = `${seed.id}: ${seed.wrongAnswer}`, exercise = { item: seed.item, form: seed.form, courseId: 'independent-audit' };
    const required = deriveUnified(seed.item, seed.form).requiredKcIds;
    for (const kcId of seed.protectedKcIds) assert.ok(required.includes(kcId), `${label}: fixture protected component exists: ${kcId}`);
    const analyzer = createAnswerAnalyzer(seed.item, seed.form), analysis = analyzer(seed.wrongAnswer);
    assert.equal(analyzer(seed.answer).kind, 'correct', `${label}: correct control`);
    assert.equal(analysis.kind, 'incorrect', `${label}: independent failure`);
    const initial = populated(required), initialSnapshot = structuredClone(initial);
    let maps = score(initial, required, analysis, { form: seed.form, support: evidenceCondition() });
    assert.deepEqual(initial, initialSnapshot, `${label}: pure scoring transition`);
    const afterOriginal = structuredClone(maps);
    // Some wrong-form inputs are directly attributable and do not need a UI
    // queue. Still exercise the supplied-premise score contract for every one
    // of the 67 declared targets rather than counting an absent queue as a pass.
    const supplied = score(maps, required, { kind: 'correct' }, { form: seed.form,
      support: evidenceCondition({ type: 'step', step: { kind: 'conjugation', continuation: true } }) });
    assert.deepEqual(supplied.byKc, afterOriginal.byKc, `${label}: supplied target increased baseline`);
    assert.deepEqual(supplied.independentByKc, afterOriginal.independentByKc, `${label}: supplied target increased independent evidence`);
    for (const kcId of required.filter(id => protectedSourceIds.includes(id) || /^apply\.|^facet\./.test(id))) {
      assert.equal(supplied.assistedByKc[kcId], afterOriginal.assistedByKc[kcId], `${label}: supplied target entered protected practice scope: ${kcId}`);
    }
    const independentSuccess = score(initial, required, { kind: 'correct' }, { form: seed.form, support: evidenceCondition() });
    for (const kcId of seed.protectedKcIds) assert.equal(independentSuccess.independentByKc[kcId]?.correct, 1,
      `${label}: a genuinely independent correct control must still count: ${kcId}`);
    for (const kcId of required.filter(id => protectedSourceIds.includes(id))) assert.equal(independentSuccess.independentByKc[kcId], undefined,
      `${label}: correct conjugation did not directly observe source class: ${kcId}`);
    let assessment = recordIndependentAttempt(emptyAssessment(), { exercise, questionId: seed.id, correct: false, at: instant });
    const failedTarget = assessmentTarget(exercise).key, failedPending = structuredClone(assessment.pending[failedTarget]);
    assert.ok(failedPending, `${label}: failure survives ambiguous attribution`);
    let steps = analysis.steps, evaluated = [...maps.assessedKcIds], examined = [], index = 0;
    const writes = new Set(evaluated), assistedWrites = new Set();
    while (index < steps.length && index < 40) {
      const step = steps[index], answer = step.kind === 'classification' ? step.expectedClass : step.readings[0];
      const actual = createAnswerAnalyzer(seed.item, seed.form, { step })(answer);
      assert.equal(actual.kind, 'correct', `${label}: provided target answer at step ${index}`);
      const transition = planDiagnosticTransition(steps, index, actual, evaluated, examined);
      const support = evidenceCondition({ type: 'step', step: transition.assessed });
      assert.equal(support.independent, false, `${label}: automatic step is support even without clicking hint`);
      const before = structuredClone(maps);
      maps = score(maps, transition.assessed.kcIds, actual, { form: step.form, support,
        diagnosticOnly: step.diagnosticOnly, focusId: step.focusId });
      assert.deepEqual(maps.byKc, afterOriginal.byKc, `${label}: guided steps changed independent baseline`);
      assert.deepEqual(maps.independentByKc, afterOriginal.independentByKc, `${label}: guided steps changed known independent evidence`);
      for (const kcId of changedIds(before.assistedByKc, maps.assistedByKc)) {
        assert.ok(!protectedSourceIds.includes(kcId) && !seed.protectedKcIds.includes(kcId), `${label}: assisted source/application/coverage contamination: ${kcId}`);
        assert.ok(!assistedWrites.has(kcId), `${label}: shared atom updated twice: ${kcId}`);
        assistedWrites.add(kcId);
      }
      for (const kcId of transition.writes) { assert.ok(!writes.has(kcId), `${label}: repeated queue credit: ${kcId}`); writes.add(kcId); }
      assessment = recordAssistedAttempt(assessment, { exercise, questionId: seed.id, eventId: `${seed.id}:step-${index}`, at: instant, correct: true });
      assert.deepEqual(assessment.pending[failedTarget], failedPending, `${label}: guided success cleared or weakened pending`);
      assert.equal(assessment.originalCount, 1, `${label}: guided steps inflated question count`);
      assert.equal(assessment.byTarget[failedTarget].independentCorrect, 0, `${label}: guided success became original success`);
      const replay = planDiagnosticTransition(transition.nextSteps, index, actual, transition.evaluated, transition.examined);
      const repeated = score(maps, replay.assessed.kcIds, actual, { form: step.form,
        support: evidenceCondition({ type: 'step', step: replay.assessed }), diagnosticOnly: step.diagnosticOnly });
      assert.deepEqual(repeated.assistedByKc, maps.assistedByKc, `${label}: resubmitted step duplicated practice evidence`);
      steps = transition.nextSteps; evaluated = transition.evaluated; examined = transition.examined; index++; actualSteps++;
    }
    assert.equal(index, steps.length, `${label}: finite recovery queue`);
    assert.deepEqual(maps.byKc, afterOriginal.byKc, `${label}: assisted completion changed independent mastery`);
    assert.ok(assessment.pending[failedTarget], `${label}: completion cannot discharge independent retest`);
    assert.equal(assessment.byTarget[failedTarget].eligibleRetestCorrect, 0, `${label}: completion cannot fake retest success`);
  }
  assert.ok(actualSteps >= 60, 'the matrix must actually run recovery steps, not only score the original answer');
  t.diagnostic(`67 frozen targets each passed explicit independent/supplied controls; their natural routes executed ${actualSteps} diagnostic steps with repeated-submit checks.`);
});

test('every automatic help condition retains its source and never awards independent or source-class credit', () => {
  const conditions = [
    [{ type: 'step', step: { kind: 'conjugation', continuation: false } }, ['subgoal']],
    [{ type: 'step', step: { kind: 'conjugation', continuation: true } }, ['subgoal', 'intermediate']],
    [{ type: 'step', step: { kind: 'conjugation', continuation: true, providedClass: 'godan' } }, ['subgoal', 'intermediate', 'word-class']],
    [{ type: 'step', step: { kind: 'atomic', continuation: true } }, ['subgoal', 'intermediate', 'word-class', 'target-rule']],
    [{ type: 'step', step: { kind: 'stem', continuation: false } }, ['subgoal', 'word-class', 'target-rule']],
  ];
  for (const [settings, provided] of conditions) {
    const support = evidenceCondition(settings);
    assert.equal(support.independent, false);
    assert.deepEqual(support.provided, provided);
    const before = populated(completeScope), after = scoreLearningEvidence(before, { kcIds: completeScope,
      form: 'teiruNegative', correct: true, support, responseMs: 1200, answerLength: 4 });
    assert.deepEqual(after.byKc, before.byKc);
    assert.deepEqual(after.independentByKc, {});
    assert.deepEqual(Object.keys(after.assistedByKc).sort(), [...localIds].sort());
    for (const stats of Object.values(after.assistedByKc)) assert.equal(stats.cleanTimeCount, 0, 'assisted time must not become unassisted fluency');
  }
});

test('independent complete conjugation gives operation credit but does not prove source classification or heuristics', () => {
  const before = populated(completeScope), after = scoreLearningEvidence(before, {
    kcIds: completeScope, form: 'teiruNegative', correct: true, support: evidenceCondition(),
  });
  for (const id of protectedSourceIds) {
    assert.deepEqual(after.byKc[id], before.byKc[id], id);
    assert.equal(after.independentByKc[id], undefined, id);
  }
  for (const id of [...compositeIds, ...localIds]) {
    assert.equal(after.byKc[id].attempts, before.byKc[id].attempts + 1, id);
    assert.equal(after.byKc[id].correct, before.byKc[id].correct + 1, id);
    assert.equal(after.independentByKc[id].correct, 1, id);
  }
  assert.deepEqual(after.assistedByKc, {});
});

test('direct classification observations remain assessable and supplied derived class does not masquerade as source class', () => {
  const classification = scoreLearningEvidence(emptyMaps(), { kcIds: ['class.ichidan', 'heuristic.ru-ie'],
    form: null, correct: true, support: evidenceCondition() });
  assert.equal(classification.byKc['class.ichidan'].correct, 1);
  const knownFailure = scoreLearningEvidence(populated(['class.ichidan']), { kcIds: ['class.ichidan'],
    form: 'negative', correct: false, failedKcId: 'class.ichidan', support: evidenceCondition() });
  assert.equal(knownFailure.byKc['class.ichidan'].attempts, 9);
  assert.equal(knownFailure.byKc['class.ichidan'].correct, 6);
  const seed = seedById.get('provided-class-is-not-source-class-success');
  const required = deriveUnified(seed.item, seed.form).requiredKcIds;
  const before = populated(required);
  const derivedClass = scoreLearningEvidence(before, { kcIds: required, form: seed.form, correct: true,
    diagnosticOnly: true, support: evidenceCondition({ type: 'step', step: { diagnosticOnly: true, kind: 'classification' } }) });
  assert.deepEqual(derivedClass.byKc, before.byKc);
  assert.deepEqual(derivedClass.assistedByKc, {});
  assert.deepEqual(derivedClass.assessedKcIds, []);
});

test('assisted negative and positive local evidence remain available without penalizing or improving independent mastery', () => {
  const before = populated(completeScope), support = evidenceCondition({ type: 'step', step: { continuation: true } });
  const after = scoreLearningEvidence(before, { kcIds: completeScope, form: 'teiruNegative', correct: false,
    failedKcId: 'suffix.negative', confirmedKcIds: ['stem.ichidan.drop-ru', 'class.godan', 'apply.teiru.continuation', 'facet.apply.teiru.negative'], support });
  assert.deepEqual(after.byKc, before.byKc);
  assert.deepEqual(after.independentByKc, {});
  assert.equal(after.assistedByKc['suffix.negative'].attempts, 1);
  assert.equal(after.assistedByKc['suffix.negative'].correct, 0);
  assert.equal(after.assistedByKc['stem.ichidan.drop-ru'].correct, 1);
  assert.deepEqual(Object.keys(after.assistedByKc).sort(), ['stem.ichidan.drop-ru', 'suffix.negative']);
  assert.deepEqual([...after.assessedKcIds].sort(), ['stem.ichidan.drop-ru', 'suffix.negative']);
});

test('revealed answers cannot fabricate a focused primitive failure or successful copying evidence', () => {
  const before = populated(completeScope);
  for (const correct of [false, true]) {
    const after = scoreLearningEvidence(before, { kcIds: completeScope, form: 'teiruNegative', correct,
      focusId: 'suffix.negative', failedKcId: 'suffix.negative', revealed: true,
      support: evidenceCondition({ revealed: true }) });
    assert.deepEqual(after.byKc, before.byKc);
    assert.deepEqual(after.independentByKc, before.independentByKc);
    assert.deepEqual(after.assistedByKc, before.assistedByKc);
    assert.deepEqual(after.assessedKcIds, []);
  }
});

test('hint use remains assisted after collapse and correct hinted originals leave a pending independent check', () => {
  const seed = seedById.get('hint-stays-used-after-collapse'), exercise = { item: seed.item, form: seed.form };
  const required = deriveUnified(seed.item, seed.form).requiredKcIds, before = populated(required);
  // Visibility is deliberately absent: closing a hint is not erasing its use.
  const support = evidenceCondition({ type: 'question', hintUsed: true });
  const after = scoreLearningEvidence(before, { kcIds: required, form: seed.form, correct: true, hintUsed: true, support });
  assert.equal(support.source, 'hinted');
  assert.deepEqual(after.byKc, before.byKc);
  assert.deepEqual(after.independentByKc, {});
  assert.ok(!Object.keys(after.assistedByKc).some(id => /^apply\.|^facet\./.test(id)));
  const assessment = recordIndependentAttempt(emptyAssessment(), { exercise, questionId: seed.id, correct: true,
    independent: support.independent, reason: support.source, at: instant });
  assert.ok(assessment.pending[assessmentTarget(exercise).key]);
  assert.equal(assessment.byTarget[assessmentTarget(exercise).key].independentCorrect, 0);
});

test('wrong originals do not earn aggregate partial credit and unknown mistakes do not manufacture focused failures', () => {
  const before = populated(completeScope);
  const unknown = scoreLearningEvidence(before, { kcIds: completeScope, form: 'teiruNegative', correct: false,
    focusId: 'apply.teiru.continuation', support: evidenceCondition() });
  assert.deepEqual(unknown.byKc, before.byKc);
  assert.deepEqual(unknown.assessedKcIds, []);
  const partial = scoreLearningEvidence(before, { kcIds: completeScope, form: 'teiruNegative', correct: false,
    confirmedKcIds: ['suffix.te', 'construction.teiru', 'class.godan', 'apply.teiru.continuation', 'facet.apply.teiru.negative'],
    support: evidenceCondition() });
  assert.deepEqual(changedIds(before.byKc, partial.byKc).sort(), ['construction.teiru', 'suffix.te']);
  assert.deepEqual([...partial.assessedKcIds].sort(), ['construction.teiru', 'suffix.te']);
});

test('feedback retries and immediate rehearsal cannot increase independent mastery', () => {
  for (const settings of [{ hadFeedback: true }, { rehearsal: true }]) {
    const support = evidenceCondition(settings), before = populated(completeScope);
    const after = scoreLearningEvidence(before, { kcIds: completeScope, form: 'teiruNegative', correct: true, support });
    assert.equal(support.independent, false);
    assert.deepEqual(after.byKc, before.byKc);
    assert.deepEqual(after.independentByKc, {});
  }
});

test('retryable typo and invalid input do not manufacture terminal failures or consume the original id', () => {
  for (const id of ['lexical-typo-does-not-fail', 'invalid-is-not-failure']) {
    const seed = seedById.get(id), event = seed.events[0], exercise = { item: seed.item, form: seed.form };
    const analysis = createAnswerAnalyzer(seed.item, seed.form)(event.answer);
    assert.equal(analysis.kind, event.outcome, id);
    const before = emptyAssessment(), after = recordIndependentAttempt(before, { exercise, questionId: id,
      correct: false, reason: analysis.kind, at: instant });
    assert.equal(after, before, id);
  }
});

test('frozen lexical-only retry expectation survives the explicit grammar-feedback distinction', () => {
  const seed = seedById.get('lexical-typo-does-not-fail');
  const analyzer = createAnswerAnalyzer(seed.item, seed.form);
  assert.equal(analyzer(seed.events[0].answer).kind, 'typo');
  assert.equal(analyzer(seed.events[1].answer).kind, 'correct');
  // API clarification: hadFeedback means grammar/answer feedback. The lexical
  // retry prompt does not reveal either and retains the frozen qualification.
  const support = evidenceCondition({ type: 'question', lexicalRetry: true, hadFeedback: false, revealed: false, hintUsed: false });
  assert.equal(support.independent, seed.expect.correctedWithoutDisclosureCanBeIndependent,
    'Frozen expectation allows a lexical-only correction without answer disclosure');
});

test('explicit target-path adjudications retain the frozen counterexamples and require same-path positive controls', () => {
  assert.equal(reviews.fixtureSha256, createHash('sha256').update(raw).digest('hex'));
  assert.deepEqual(Object.keys(reviews.reviews).sort(), ['retest-correct-contracted-variant', 'retest-different-word-with-gap']);
  const fillerExercises = [
    { item: { domain: 'verb', surface: '食べる', reading: 'たべる', class: 'ichidan' }, form: 'masu' },
    { item: { domain: 'adjective', surface: '高い', reading: 'たかい', class: 'i' }, form: 'adjectivePast' },
  ];
  const attempt = (state, exercise, correct, questionId) => recordIndependentAttempt(state, { exercise, correct, questionId, at: instant });
  const spacedFailure = (exercise, id) => fillerExercises.reduce((state, filler, index) => attempt(state, filler, true, `${id}:filler-${index}`),
    attempt(emptyAssessment(), exercise, false, `${id}:failed`));
  for (const [id, review] of Object.entries(reviews.reviews)) {
    const seed = seedById.get(id), last = seed.events.filter(event => event.phase === 'question').at(-1);
    assert.equal(seed.expect.pending, false, `${id}: original expectation must remain available for review`);
    assert.ok(review.reason.length > 50);
    const failed = { item: seed.item, form: seed.form }, candidate = { item: last.item, form: last.form ?? seed.form };
    assert.equal(createAnswerAnalyzer(candidate.item, candidate.form)(last.answer).kind, 'correct', `${id}: still a valid conjugation`);
    const state = attempt(spacedFailure(failed, id), candidate, true, `${id}:retest`);
    assert.equal(Boolean(state.pending[assessmentTarget(failed).key]), review.expect.pending, id);
    assert.equal(state.byTarget[assessmentTarget(candidate).key].independentCorrect, 1, `${id}: preserve evidence for the actual new path`);
  }
  for (const control of reviews.positiveControls) {
    const make = source => ({ item: { domain: 'verb', surface: source.surface, reading: source.reading, class: source.class }, form: source.form });
    const failed = make(control.failed), candidate = make(control.retest);
    assert.equal(createAnswerAnalyzer(candidate.item, candidate.form)(control.retest.answer).kind, 'correct', control.id);
    const state = attempt(spacedFailure(failed, control.id), candidate, true, `${control.id}:retest`);
    assert.equal(Boolean(state.pending[assessmentTarget(failed).key]), control.expect.pending, control.id);
    assert.equal(state.byTarget[assessmentTarget(candidate).key].eligibleRetestCorrect, 1, control.id);
  }
});
