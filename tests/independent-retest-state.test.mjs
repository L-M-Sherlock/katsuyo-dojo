import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import {
  assessmentTarget, emptyAssessment, recordIndependentAttempt, recordAssistedAttempt, recordAssessmentExposure, recordHintExposure,
  retestStatus, selectRetest,
} from '../app/lib/learning-assessment.mjs';

const rawSeeds = await readFile(new URL('./fixtures/independent-retest-scenarios.json', import.meta.url), 'utf8');
const { scenarios } = JSON.parse(rawSeeds);
const seedById = new Map(scenarios.map(seed => [seed.id, seed]));
const instant = '2026-09-09T10:00:00.000Z';
const tomorrow = '2026-09-10T10:00:00.000Z';
const make = (surface, reading, cls, form, courseId = 'aspect', domain = 'verb') => ({
  item: { surface, reading, class: cls, domain }, form, courseId,
});
const noru = make('乗る', 'のる', 'godan', 'teiruNegative');
const toru = make('取る', 'とる', 'godan', 'teiruNegative');
const yomu = make('読む', 'よむ', 'godan', 'past', 'past');
const late = make('遅れる', 'おくれる', 'ichidan', 'tagaruPast', 'tagaru');
const fillers = [make('書く', 'かく', 'godan', 'masu', 'masu'), make('見る', 'みる', 'ichidan', 'tai', 'desire')];
const fromSeed = seed => {
  const q = seed.question;
  const exercise = make(q.surface, q.reading, q.class, q.form, q.form.startsWith('tagaru') ? 'tagaru' : 'aspect', q.domain);
  return q.lexicalSurface ? { ...exercise, item: { ...exercise.item, lexicalSurface: q.lexicalSurface } } : exercise;
};
const attempt = (state, exercise, correct, id = `q${state.originalCount + 1}`, extra = {}) => recordIndependentAttempt(state, {
  exercise, correct, questionId: id, at: instant, ...extra,
});
const spaced = state => fillers.reduce((next, exercise) => attempt(next, exercise, true), state);
const pendingFor = (state, exercise) => state.pending[assessmentTarget(exercise).key];
const initial = name => name.includes('yomu') ? yomu : name.includes('okureru-taiPast') ? { ...late, form: 'taiPast' }
  : name.includes('okureru') ? late : noru;

test('independent retest expectations remain the 39 implementation-before seeds', () => {
  assert.equal(scenarios.length, 39);
  assert.equal(seedById.size, 39);
  assert.equal(createHash('sha256').update(rawSeeds).digest('hex'), '1edab5313f3dce1745059d95c2c223b4a8809e15cd00ee1a8293ca6e62cc0221');
});

test('independent frozen failures survive every correct assisted step and never acquire atomic writes', () => {
  for (const id of ['teiru-negative-after-past-substitution', 'tagaru-past-after-class-scaffold', 'known-atomic-error-still-needs-whole-retest']) {
    const seed = seedById.get(id), exercise = fromSeed(seed), before = emptyAssessment();
    const analysis = createAnswerAnalyzer(exercise.item, exercise.form)(seed.question.answer);
    assert.equal(analysis.kind, 'incorrect', id);
    let state = attempt(before, exercise, false, id);
    const failure = structuredClone(pendingFor(state, exercise));
    for (let index = 0; index < 8; index++) state = recordAssistedAttempt(state, {
      exercise, questionId: id, eventId: `${id}:step-${index}`, at: instant, correct: true,
    });
    assert.deepEqual(pendingFor(state, exercise), failure, id);
    assert.equal(state.originalCount, 1, id);
    const target = state.byTarget[assessmentTarget(exercise).key];
    assert.equal(target.independentCorrect, 0, id);
    assert.equal(target.eligibleRetestCorrect, 0, id);
    assert.equal(target.assistedStepCorrect, 8, id);
    assert.deepEqual(state.independentByKc, {}, id);
    assert.deepEqual(state.assistedByKc, {}, id);
    assert.deepEqual(before, emptyAssessment(), 'state transition must not mutate its input');
  }
});

test('independent frozen whole-answer controls cannot clear a different target or repeat the failed word', () => {
  const ids = [
    'same-word-correct-is-not-transfer', 'same-word-kana-is-not-new-word', 'same-word-contraction-is-not-new-word',
    'other-tense-does-not-clear', 'bare-negative-does-not-clear-composition', 'base-construction-does-not-clear-final-target',
    'tai-does-not-clear-tagaru', 'shared-form-different-onbin-does-not-clear', 'cross-domain-shared-rule-does-not-clear',
  ];
  for (const id of ids) {
    const seed = seedById.get(id), failed = initial(seed.initial), candidate = fromSeed(seed);
    let state = spaced(attempt(emptyAssessment(), failed, false));
    assert.equal(createAnswerAnalyzer(candidate.item, candidate.form)(seed.question.answer).kind, 'correct', `control is a valid answer: ${id}`);
    state = attempt(state, candidate, true);
    assert.ok(pendingFor(state, failed), id);
    assert.equal(state.byTarget[assessmentTarget(failed).key].eligibleRetestCorrect, 0, id);
  }
});

test('independent frozen different-word complete targets can clear only after two intervening originals', () => {
  for (const id of ['different-word-equivalent-complete-target-clears', 'different-word-accepted-contraction-clears', 'same-onbin-different-word-clears']) {
    const seed = seedById.get(id), failed = initial(seed.initial), candidate = fromSeed(seed);
    const failure = attempt(emptyAssessment(), failed, false);
    assert.equal(createAnswerAnalyzer(candidate.item, candidate.form)(seed.question.answer).kind, 'correct', id);
    const early = attempt(failure, candidate, true);
    assert.ok(pendingFor(early, failed), id);
    assert.equal(early.byTarget[assessmentTarget(failed).key].eligibleRetestCorrect, 0, id);
    const mature = spaced(failure), cleared = attempt(mature, candidate, true);
    assert.equal(pendingFor(cleared, failed), undefined, id);
    assert.equal(cleared.byTarget[assessmentTarget(failed).key].eligibleRetestCorrect, 1, id);
    assert.equal(cleared.byTarget[assessmentTarget(failed).key].lastRetestPolicy, 'different-word-spaced', id);
  }
});

test('independent frozen assistance conditions preserve pending even with a correct new-word final answer', () => {
  const cases = [
    ['hint-shown-then-collapsed-does-not-clear', 'hinted'],
    ['given-class-does-not-clear', 'assisted'],
    ['given-base-does-not-clear', 'assisted'],
    ['revealed-answer-does-not-clear', 'revealed'],
  ];
  for (const [id, reason] of cases) {
    const seed = seedById.get(id), candidate = fromSeed(seed);
    // A revealed answer is visible text, not a correct learner submission.
    const correct = reason !== 'revealed';
    const state = attempt(spaced(attempt(emptyAssessment(), noru, false)), candidate, correct, id, { independent: false, reason });
    assert.ok(pendingFor(state, noru), id);
    assert.equal(state.byTarget[assessmentTarget(noru).key].independentCorrect, 0, id);
    assert.equal(state.byTarget[assessmentTarget(noru).key].assistedOriginalCorrect, Number(correct), id);
    assert.equal(state.byTarget[assessmentTarget(noru).key].eligibleRetestCorrect, 0, id);
  }
});

test('independent state preserves invalid retries, exact-once submissions and reopens a later failure', () => {
  const before = emptyAssessment();
  for (const reason of ['invalid', 'typo']) assert.equal(attempt(before, noru, false, 'retryable-question', { reason }), before);
  let state = attempt(before, noru, false, 'retryable-question');
  assert.equal(attempt(state, noru, false, 'retryable-question'), state);
  assert.equal(attempt(state, toru, true, 'retryable-question'), state);
  state = attempt(spaced(state), toru, true, 'qualified-retest');
  assert.equal(Object.keys(state.pending).length, 0);
  state = attempt(state, noru, false, 'later-failure');
  assert.equal(Object.keys(state.pending).length, 1);
  assert.equal(pendingFor(state, noru).lastQuestionId, 'later-failure');
  const again = attempt(spaced(state), toru, false, 'new-word-failure');
  assert.equal(Object.keys(again.pending).length, 1, 'same target merges rather than producing an unbounded queue');
  assert.equal(pendingFor(again, toru).failures, 2);
  assert.equal(pendingFor(again, toru).createdOrdinal, pendingFor(state, noru).createdOrdinal);
});

test('independent repeat scheduling rotates three continually failing targets without starving any', () => {
  const originals = [noru, yomu, late];
  const alternatives = [toru, make('飲む', 'のむ', 'godan', 'past', 'past'), make('増える', 'ふえる', 'ichidan', 'tagaruPast', 'tagaru')];
  const catalog = [...originals, ...alternatives];
  let state = emptyAssessment();
  for (const exercise of originals) state = attempt(state, exercise, false);
  state = spaced(state);
  const ordering = originals.map(exercise => assessmentTarget(exercise).key);
  for (let round = 0; round < 12; round++) {
    const selection = selectRetest(state, catalog, { at: instant, catalogExercises: catalog });
    assert.ok(selection, `scheduler must offer one of the three mature targets at turn ${round}`);
    assert.equal(selection.pending.key, ordering[round % 3]);
    assert.notEqual(assessmentTarget(selection.exercise).wordKey, selection.pending.lastWordKey);
    state = attempt(state, selection.exercise, false);
  }
  assert.equal(Object.keys(state.pending).length, 3);
});

test('independent filters never manufacture singleton status or substitute an unrelated exercise', () => {
  const state = spaced(attempt(emptyAssessment(), noru, false));
  const snapshot = structuredClone(state), catalog = [noru, toru, ...fillers];
  assert.equal(selectRetest(state, [noru], { at: tomorrow, catalogExercises: catalog }), null);
  assert.equal(selectRetest(state, [fillers[0]], { at: tomorrow, catalogExercises: catalog }), null);
  const alternative = selectRetest(state, [toru], { at: instant, catalogExercises: catalog });
  assert.equal(alternative.exercise, toru);
  assert.equal(alternative.status.policy, 'different-word-spaced');
  assert.equal(selectRetest(state, catalog, { at: instant, catalogExercises: catalog, excludeTargetKeys: [assessmentTarget(noru).key] }), null);
  assert.deepEqual(state, snapshot);
});

test('independent singleton policy requires explicit catalog permission and question spacing only', () => {
  // The frozen seed rejected silent same-word substitution. The implementation
  // decision explicitly admits delayed same-word exception retests; verify both
  // boundary conditions and policy labeling instead of editing that seed.
  const iku = make('行く', 'いく', 'godan', 'past', 'past'), failure = attempt(emptyAssessment(), iku, false);
  const state = spaced(failure), pending = pendingFor(state, iku), catalog = [iku, ...fillers];
  assert.equal(retestStatus(pending, iku, { originalCount: 3, at: tomorrow }).eligible, false, 'no implicit singleton permission');
  assert.ok(selectRetest(state, catalog, { at: instant, catalogExercises: catalog }));
  assert.equal(selectRetest(failure, catalog, { at: tomorrow, catalogExercises: catalog }), null);
  const selected = selectRetest(state, catalog, { at: tomorrow, catalogExercises: catalog });
  assert.equal(selected.status.policy, 'single-word-spaced');
  const cleared = attempt(state, iku, true, 'next-day-original', { at: tomorrow, singleWord: true });
  assert.equal(pendingFor(cleared, iku), undefined);
  assert.equal(cleared.byTarget[assessmentTarget(iku).key].lastRetestPolicy, 'single-word-spaced');
});

test('independent snapshots retain spacing, failed-word identity and idempotency across a day boundary', () => {
  let state = spaced(attempt(emptyAssessment(), noru, false, 'failure-id'));
  const snapshot = JSON.stringify(state);
  state = JSON.parse(snapshot);
  assert.equal(attempt(state, noru, false, 'failure-id', { at: tomorrow }), state);
  assert.equal(state.originalCount, 3);
  assert.equal(pendingFor(state, noru).lastWordKey, 'verb:godan:のる');
  const cleared = attempt(state, toru, true, 'restored-retest', { at: tomorrow });
  assert.equal(pendingFor(cleared, noru), undefined);
  assert.equal(JSON.stringify(state), snapshot, 'loaded before snapshot remains immutable');
});

test('independent unqualified same-target rehearsal restarts spacing before later transfer can qualify', () => {
  // q2 is a real independent answer, but is too close to q1 to be a retest.
  // Its feedback still refreshes this same target; q4 has only one intervening
  // other question since that refresh, even though q1 is already far enough.
  let state = attempt(emptyAssessment(), noru, false, 'q1-failure');
  state = attempt(state, toru, true, 'q2-too-early');
  assert.equal(state.byTarget[assessmentTarget(noru).key].lastOutcome, 'rehearsal-correct');
  state = attempt(state, fillers[0], true, 'q3-distractor');
  const matsu = make('待つ', 'まつ', 'godan', 'teiruNegative');
  const status = retestStatus(pendingFor(state, noru), matsu, { originalCount: state.originalCount, at: instant });
  assert.equal(status.eligible, false, 'one distractor since same-target feedback is insufficient');
  assert.equal(status.remainingQuestions, 1);
  state = attempt(state, matsu, true, 'q4-still-rehearsal');
  assert.ok(pendingFor(state, noru));
  state = spaced(state);
  const cleared = attempt(state, toru, true, 'q7-transfer');
  assert.equal(pendingFor(cleared, noru), undefined);
  assert.equal(cleared.byTarget[assessmentTarget(noru).key].eligibleRetestCorrect, 1);
});

test('independent explicit feedback exposure adds no evidence but restarts pending spacing once', () => {
  const before = spaced(attempt(emptyAssessment(), noru, false, 'failed-original'));
  const snapshot = structuredClone(before);
  const event = { exercise: noru, questionId: 'failed-original', eventId: 'viewed-feedback', at: '2026-09-09T12:00:00.000Z' };
  const after = recordAssessmentExposure(before, event);
  assert.equal(after.originalCount, 3);
  assert.equal(after.byTarget, before.byTarget);
  assert.equal(after.independentByKc, before.independentByKc);
  assert.equal(after.assistedByKc, before.assistedByKc);
  assert.equal(pendingFor(after, noru).lastPresentedOrdinal, 3);
  assert.equal(pendingFor(after, noru).lastPresentedAt, event.at);
  assert.equal(pendingFor(after, noru).lastFailureOrdinal, 1);
  assert.equal(retestStatus(pendingFor(after, noru), toru, { originalCount: 3, at: event.at }).remainingQuestions, 2);
  assert.equal(recordAssessmentExposure(after, event), after, 'exposure replay must not renew its original timestamp or add evidence');
  assert.deepEqual(before, snapshot);
  const ready = spaced(after);
  assert.equal(retestStatus(pendingFor(ready, noru), toru, { originalCount: ready.originalCount, at: event.at }).eligible, true);
});

test('independent singleton spacing restarts at assistance and ignores elapsed time', () => {
  const iku = make('行く', 'いく', 'godan', 'past', 'past');
  const failed = spaced(attempt(emptyAssessment(), iku, false));
  const exposureAt = '2026-09-09T23:00:00.000Z';
  const exposed = recordAssessmentExposure(failed, { exercise: iku, questionId: 'q1', eventId: 'late-step', at: exposureAt });
  const state = fillers.reduce((current, exercise, i) => attempt(current, exercise, true, `after-feedback-${i}`, { at: '2026-09-09T23:05:00Z' }), exposed);
  const catalog = [iku, ...fillers];
  assert.ok(selectRetest(state, catalog, { at: exposureAt, catalogExercises: catalog }));
  const status = retestStatus(pendingFor(state, iku), iku, { originalCount: state.originalCount, at: tomorrow, singleWord: true });
  assert.equal(status.availableAt, null);
  assert.ok(selectRetest(state, catalog, { at: exposureAt, catalogExercises: catalog }));
  assert.equal(selectRetest(state, catalog, { at: exposureAt, catalogExercises: catalog }).status.policy, 'single-word-spaced');
});

test('independent stale or unrelated exposures cannot roll back an anchor or invent a pending task', () => {
  const pending = spaced(attempt(emptyAssessment(), noru, false));
  const current = recordAssessmentExposure(pending, { exercise: noru, questionId: 'q1', eventId: 'new-exposure', at: tomorrow });
  const stale = recordAssessmentExposure(current, { exercise: noru, questionId: 'q1', eventId: 'older-event', at: instant });
  assert.equal(stale.pending, current.pending);
  assert.equal(stale.byTarget, current.byTarget);
  const unrelated = recordAssessmentExposure(stale, { exercise: late, questionId: 'other', eventId: 'unrelated-event', at: tomorrow });
  assert.equal(Object.keys(unrelated.pending).length, 1);
  assert.equal(pendingFor(unrelated, late), undefined);
  assert.equal(unrelated.originalCount, current.originalCount);
  const clean = recordAssessmentExposure(emptyAssessment(), { exercise: noru, questionId: 'ungraded', eventId: 'hint-before-first-answer', at: instant });
  assert.deepEqual(clean.pending, {});
  assert.deepEqual(clean.byTarget, {});
});

test('independent assisted first completions create pending without fabricated independent wrong answers', () => {
  for (const reason of ['hinted', 'revealed', 'feedback-retry']) {
    const correct = reason !== 'revealed';
    const state = attempt(emptyAssessment(), noru, correct, `first-${reason}`, { reason, independent: false });
    const record = state.byTarget[assessmentTarget(noru).key];
    assert.ok(pendingFor(state, noru), reason);
    assert.equal(record.independentAttempts, 0, reason);
    assert.equal(record.independentCorrect, 0, reason);
    assert.equal(record.assistedOriginalAttempts, 1, reason);
    assert.equal(record.assistedOriginalCorrect, Number(correct), reason);
    assert.equal(pendingFor(state, noru).failures, Number(!correct), reason);
  }
});

test('independent counts exclude no-hint rehearsal until the spacing and transfer conditions both hold', () => {
  const key = assessmentTarget(noru).key;
  let state = attempt(emptyAssessment(), noru, false, 'first-independent-failure');
  assert.equal(state.byTarget[key].independentAttempts, 1);
  state = attempt(state, toru, true, 'too-early-correct');
  assert.equal(state.byTarget[key].lastOutcome, 'rehearsal-correct');
  assert.equal(state.byTarget[key].independentAttempts, 1, 'no hint does not make a too-early rehearsal qualified retest evidence');
  assert.equal(state.byTarget[key].independentCorrect, 0);
  assert.equal(state.byTarget[key].assistedOriginalAttempts, 1);
  assert.equal(state.byTarget[key].assistedOriginalCorrect, 1);
  state = spaced(state);
  state = attempt(state, noru, true, 'same-failed-word-after-spacing');
  assert.equal(state.byTarget[key].lastOutcome, 'rehearsal-correct');
  assert.equal(state.byTarget[key].independentAttempts, 1);
  assert.equal(state.byTarget[key].assistedOriginalCorrect, 2);
  state = attempt(spaced(state), toru, true, 'qualified-new-word');
  assert.equal(pendingFor(state, noru), undefined);
  assert.equal(state.byTarget[key].independentAttempts, 2);
  assert.equal(state.byTarget[key].independentCorrect, 1);
  assert.equal(state.byTarget[key].eligibleRetestCorrect, 1);
  assert.equal(state.byTarget[key].assistedOriginalCorrect, 2);
});

test('independent no-hint rehearsal errors preserve the target failure without masquerading as independent counters', () => {
  const key = assessmentTarget(noru).key;
  let state = attempt(emptyAssessment(), noru, false, 'q1-independent-failure');
  state = attempt(state, toru, false, 'q2-rehearsal-error');
  assert.equal(state.originalCount, 2);
  assert.equal(state.byTarget[key].lastOutcome, 'rehearsal-incorrect');
  assert.equal(state.byTarget[key].attempts, 2);
  assert.equal(state.byTarget[key].independentAttempts, 1);
  assert.equal(state.byTarget[key].assistedOriginalAttempts, 1);
  assert.equal(state.byTarget[key].assistedOriginalCorrect, 0);
  assert.equal(pendingFor(state, noru).failures, 2);
  assert.equal(pendingFor(state, noru).lastWordKey, assessmentTarget(toru).wordKey);
  assert.equal(pendingFor(state, noru).lastFailureOrdinal, 2);
});

test('independent transfer must change both the failed word and the most recently helped or rehearsed word', () => {
  const matsu = make('待つ', 'まつ', 'godan', 'teiruNegative');
  for (const source of ['hint', 'rehearsal']) {
    let state = attempt(emptyAssessment(), noru, false, `${source}-original-failure`);
    if (source === 'hint') {
      state = spaced(state);
      state = recordHintExposure(state, { exercise: matsu, questionId: `${source}-unsubmitted`, eventId: `${source}-exposure`, at: instant });
    } else state = attempt(state, matsu, true, `${source}-too-early`);
    state = spaced(state);
    state = JSON.parse(JSON.stringify(state));
    const pending = pendingFor(state, noru);
    assert.equal(retestStatus(pending, noru, { originalCount: state.originalCount, at: instant }).eligible, false, `${source}: failed word stays excluded`);
    assert.equal(retestStatus(pending, matsu, { originalCount: state.originalCount, at: instant }).eligible, false, `${source}: a recently helped word cannot become the new-word retest`);
    assert.equal(retestStatus(pending, toru, { originalCount: state.originalCount, at: instant }).eligible, true, `${source}: a third compatible word is a valid transfer`);
    const selected = selectRetest(state, [noru, matsu, toru], { at: instant, catalogExercises: [noru, matsu, toru] });
    assert.equal(selected.exercise, toru);
    const cleared = attempt(state, toru, true, `${source}-qualified-third-word`);
    assert.equal(pendingFor(cleared, noru), undefined);
  }
});

test('independent hinted or feedback-correct completion does not fabricate a failure timestamp or erase a real earlier failure', () => {
  for (const reason of ['hinted', 'feedback-retry']) {
    const first = attempt(emptyAssessment(), toru, true, `first-${reason}`, { reason, independent: false });
    assert.equal(pendingFor(first, toru).failures, 0, reason);
    assert.equal(pendingFor(first, toru).lastFailureAt, null, reason);
    assert.equal(pendingFor(first, toru).lastFailureOrdinal, null, reason);
    const failed = spaced(attempt(emptyAssessment(), noru, false, `real-failure-${reason}`));
    const before = pendingFor(failed, noru);
    const later = attempt(failed, toru, true, `later-correct-${reason}`, { reason, independent: false, at: tomorrow });
    const after = pendingFor(later, noru);
    assert.equal(after.failures, before.failures, reason);
    assert.equal(after.lastFailureAt, before.lastFailureAt, reason);
    assert.equal(after.lastFailureOrdinal, before.lastFailureOrdinal, reason);
    assert.equal(after.lastWordKey, before.lastWordKey, reason);
    assert.equal(after.lastPresentedWordKey, assessmentTarget(toru).wordKey, reason);
    assert.equal(after.lastPresentedAt, tomorrow, reason);
    assert.equal(after.lastPresentedOrdinal, later.originalCount, reason);
  }
});
