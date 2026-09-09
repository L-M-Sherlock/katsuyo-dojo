import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import {
  emptyAssessment, assessmentTarget, recordIndependentAttempt, recordAssistedAttempt, recordAssessmentExposure,
  compatibleRetest, retestStatus, selectRetest, pendingForCourse, pendingForKc,
  RETEST_MIN_INTERVENING_QUESTIONS,
} from '../app/lib/learning-assessment.mjs';

const time = '2026-09-09T02:00:00.000Z';
const verb = (surface, reading, cls, form = 'teiruNegative', courseId = 'aspect') => ({ item: { domain: 'verb', surface, reading, class: cls }, form, courseId });
const adjective = (surface, reading, cls = 'i', form = 'adjectivePast', extra = {}) => ({ item: { domain: 'adjective', surface, reading, class: cls, ...extra }, form, courseId: 'adjectiveIBase' });
const noru = verb('乗る', 'のる', 'godan');
const matsu = verb('待つ', 'まつ', 'godan');
const yomu = verb('読む', 'よむ', 'godan');
const taberu = verb('食べる', 'たべる', 'ichidan');
const original = (state, exercise, questionId, correct = true, extra = {}) => recordIndependentAttempt(state, { exercise, questionId, correct, at: time, ...extra });
const onlyPending = state => { const values = Object.values(state.pending); assert.equal(values.length, 1); return values[0]; };
const intervening = state => {
  const fillers = [verb('書く', 'かく', 'godan', 'masu'), verb('見る', 'みる', 'ichidan', 'tai'), adjective('高い', 'たかい'), adjective('静か', 'しずか', 'na', 'adjectiveNaPast')]
    .filter(exercise => !state.pending[assessmentTarget(exercise).key]);
  return original(original(state, fillers[0], `filler-${state.originalCount}-1`), fillers[1], `filler-${state.originalCount}-2`);
};

test('whole-target identity uses actual operation paths without lexical words, source heuristics, or course identity', () => {
  const target = assessmentTarget(noru);
  assert.equal(target.key, assessmentTarget(matsu).key);
  assert.equal(target.key, assessmentTarget({ ...noru, courseId: 'review', kcIds: ['irrelevant.heuristic'] }).key);
  assert.equal(target.key.length < 100, true);
  assert.equal(target.ruleSignature.includes('乗る'), false);
  assert.equal(target.ruleSignature.includes('heuristic.'), false);
  assert.notEqual(target.key, assessmentTarget(yomu).key, '促音便 cannot substitute for 撥音便');
  assert.notEqual(target.key, assessmentTarget(taberu).key, 'source classes remain distinct');
  assert.notEqual(target.key, assessmentTarget({ ...noru, form: 'teiruPast' }).key, 'past cannot stand in for negative');
  assert.equal(assessmentTarget(verb('読む', 'よむ', 'godan', 'tagaruPast')).key, assessmentTarget(verb('待つ', 'まつ', 'godan', 'tagaruPast')).key, 'a godan i-stem recipe is shared regardless of unused te/past sound rules');
});

test('identity distinguishes irregular verbs and actual special rules, including auxiliaries and adjective いい', () => {
  for (const form of ['masu', 'te', 'taiNegativePast', 'teiruNegative']) {
    assert.notEqual(assessmentTarget(verb('する', 'する', 'irregular', form)).key, assessmentTarget(verb('来る', 'くる', 'irregular', form)).key, form);
  }
  assert.notEqual(assessmentTarget(verb('行く', 'いく', 'godan', 'past')).key, assessmentTarget(verb('待つ', 'まつ', 'godan', 'past')).key);
  assert.equal(assessmentTarget(verb('行く', 'いく', 'godan', 'past')).key, assessmentTarget(verb('いく', 'いく', 'godan', 'past')).key);
  assert.equal(assessmentTarget(verb('行く', 'いく', 'godan', 'tagaru')).key, assessmentTarget(verb('書く', 'かく', 'godan', 'tagaru')).key, '行く is exceptional in its sound change, not every possible form');
  assert.notEqual(assessmentTarget(adjective('いい', 'いい', 'i', 'adjectivePast', { iiFamily: true })).key, assessmentTarget(adjective('高い', 'たかい')).key);
  assert.equal(assessmentTarget(adjective('いい', 'いい', 'i', 'adjectivePast', { iiFamily: true })).key, assessmentTarget(adjective('格好いい', 'かっこいい', 'i', 'adjectivePast', { iiFamily: true })).key);
  assert.notEqual(assessmentTarget(verb('帰る', 'かえる', 'godan', null)).key, assessmentTarget(verb('乗る', 'のる', 'godan', null)).key, 'classification exceptions remain distinct when classification itself is asked');
});

test('word identity cannot be changed by kana spelling, script conversion, or homophonic kanji', () => {
  const target = assessmentTarget(noru);
  assert.equal(target.wordKey, assessmentTarget(verb('のる', 'のる', 'godan')).wordKey);
  assert.equal(target.wordKey, assessmentTarget(verb('ノル', 'ノル', 'godan')).wordKey);
  assert.equal(target.wordKey, assessmentTarget(verb('載る', 'のる', 'godan')).wordKey);
  assert.notEqual(target.wordKey, assessmentTarget(verb('待つ', 'まつ', 'godan')).wordKey);
});

test('caller edits cannot leave a cached target or singleton policy using the old form or catalog', () => {
  const exercise = structuredClone(noru), first = assessmentTarget(exercise);
  exercise.form = 'teiruPast';
  assert.notEqual(assessmentTarget(exercise).key, first.key);
  const state = intervening(original(emptyAssessment(), noru, 'q1', false));
  const catalog = [noru];
  assert.ok(selectRetest(state, [noru], { at: '2026-09-12T00:00:00Z', catalogExercises: catalog }));
  catalog.push(matsu);
  assert.equal(selectRetest(state, [noru], { at: '2026-09-12T00:00:00Z', catalogExercises: catalog }), null);
});

test('unknown wrong original creates persistent pending without an invented atomic failure', () => {
  const before = emptyAssessment(), frozen = structuredClone(before);
  const state = original(before, noru, 'q1', false);
  const pending = onlyPending(state), target = assessmentTarget(noru);
  assert.deepEqual(before, frozen);
  assert.equal(state.originalCount, 1);
  assert.equal(pending.lastFailureOrdinal, 1);
  assert.deepEqual(pending.failedKcIds, []);
  assert.equal(state.byTarget[target.key].independentAttempts, 1);
  assert.equal(state.byTarget[target.key].independentCorrect, 0);
  assert.deepEqual(state.independentByKc, {});
  assert.deepEqual(state.assistedByKc, {});
  assert.equal(pendingForCourse(state, 'aspect').length, 1);
  assert.equal(pendingForKc(state, 'apply.teiru.continuation').length, 1);
  assert.equal(pendingForKc(state, 'facet.apply.teiru.negative').length, 1);
  assert.equal(pendingForKc(state, 'suffix.negative').length, 1);
  assert.equal(pendingForKc(state, 'onbin.hatsuon').length, 0);
});

test('assisted steps and their replays never change original spacing, pending, or atom buckets', () => {
  const state = original(emptyAssessment(), noru, 'q1', false);
  const pending = state.pending;
  const step = { exercise: noru, questionId: 'q1', eventId: 'q1:step:1', at: time, correct: true };
  const after = recordAssistedAttempt(state, step);
  assert.equal(after.originalCount, 1);
  assert.equal(after.pending, pending);
  assert.equal(after.independentByKc, state.independentByKc);
  assert.equal(after.assistedByKc, state.assistedByKc);
  assert.equal(after.byTarget[assessmentTarget(noru).key].assistedStepAttempts, 1);
  assert.equal(after.byTarget[assessmentTarget(noru).key].assistedStepCorrect, 1);
  assert.equal(recordAssistedAttempt(after, step), after);
  assert.equal(retestStatus(onlyPending(after), matsu, { originalCount: after.originalCount, at: time }).remainingQuestions, 2);
});

test('the first real original submission is idempotent; typo and invalid do not consume it', () => {
  let state = emptyAssessment();
  assert.equal(original(state, noru, 'q1', false, { reason: 'typo' }), state);
  assert.equal(original(state, noru, 'q1', false, { reason: 'invalid' }), state);
  state = original(state, noru, 'q1', false);
  assert.equal(original(state, matsu, 'q1', true), state);
  assert.equal(original(state, noru, 'q1', true, { independent: false, reason: 'feedback-retry' }), state);
  assert.equal(state.originalCount, 1);
});

test('two intervening original questions are required before a different-word first-try retest', () => {
  assert.equal(RETEST_MIN_INTERVENING_QUESTIONS, 2);
  let state = original(emptyAssessment(), noru, 'q1', false);
  const pending = onlyPending(state);
  assert.equal(retestStatus(pending, matsu, { originalCount: 1, at: time }).eligible, false);
  assert.equal(retestStatus(pending, matsu, { originalCount: 2, at: time }).eligible, false);
  assert.equal(retestStatus(pending, matsu, { originalCount: 3, at: time }).eligible, true);
  state = intervening(state);
  assert.equal(state.originalCount, 3);
  const after = original(state, matsu, 'q4');
  assert.equal(after.originalCount, 4);
  assert.equal(Object.keys(after.pending).length, 0);
  assert.equal(after.byTarget[assessmentTarget(matsu).key].eligibleRetestCorrect, 1);
  assert.equal(after.byTarget[assessmentTarget(matsu).key].lastRetestPolicy, 'different-word-spaced');
  assert.equal(original(after, matsu, 'q4'), after);
});

test('early and same-word unassisted successes retain pending and count only as rehearsal', () => {
  let state = original(emptyAssessment(), noru, 'q1', false);
  state = original(state, matsu, 'q2');
  assert.equal(onlyPending(state).lastFailureOrdinal, 1, 'a success does not overwrite the original failure time');
  assert.equal(state.byTarget[assessmentTarget(noru).key].lastOutcome, 'rehearsal-correct');
  assert.equal(state.byTarget[assessmentTarget(noru).key].independentAttempts, 1);
  assert.equal(state.byTarget[assessmentTarget(noru).key].independentCorrect, 0);
  assert.equal(state.byTarget[assessmentTarget(noru).key].assistedOriginalAttempts, 1);
  assert.equal(state.byTarget[assessmentTarget(noru).key].assistedOriginalCorrect, 1);
  state = original(state, taberu, 'q3');
  state = original(state, verb('載る', 'のる', 'godan'), 'q4');
  assert.equal(onlyPending(state).lastWordKey, assessmentTarget(noru).wordKey);
  assert.equal(state.byTarget[assessmentTarget(noru).key].eligibleRetestCorrect, 0);
  assert.equal(state.byTarget[assessmentTarget(noru).key].independentAttempts, 1);
  assert.equal(state.byTarget[assessmentTarget(noru).key].assistedOriginalCorrect, 2);
  state = intervening(state);
  state = original(state, matsu, 'q7');
  assert.equal(Object.keys(state.pending).length, 0);
  const record = state.byTarget[assessmentTarget(noru).key];
  assert.equal(record.independentAttempts, 2);
  assert.equal(record.independentCorrect, 1);
  assert.equal(record.assistedOriginalAttempts, 2);
  assert.equal(record.assistedOriginalCorrect, 2);
  assert.equal(record.attempts, record.independentAttempts + record.assistedOriginalAttempts);
});

test('an unqualified wrong original is rehearsal evidence but still updates the real failure history', () => {
  let state = original(emptyAssessment(), noru, 'q1', false);
  state = original(state, matsu, 'q2', false);
  const record = state.byTarget[assessmentTarget(noru).key], pending = onlyPending(state);
  assert.equal(record.independentAttempts, 1);
  assert.equal(record.independentCorrect, 0);
  assert.equal(record.assistedOriginalAttempts, 1);
  assert.equal(record.assistedOriginalCorrect, 0);
  assert.equal(record.lastOutcome, 'rehearsal-incorrect');
  assert.equal(pending.lastFailureOrdinal, 2);
  assert.equal(pending.lastWordKey, assessmentTarget(matsu).wordKey);
  assert.equal(pending.failures, 2);
  state = intervening(state);
  state = original(state, noru, 'q5', false);
  assert.equal(state.byTarget[assessmentTarget(noru).key].independentAttempts, 2, 'a qualified clean retest failure belongs to independent evidence');
  assert.equal(state.byTarget[assessmentTarget(noru).key].lastOutcome, 'independent-incorrect');
  assert.equal(onlyPending(state).lastFailureOrdinal, 5);
});

test('different form, sound family or original class cannot discharge a pending path', () => {
  let state = intervening(original(emptyAssessment(), noru, 'q1', false));
  for (const [index, exercise] of [yomu, taberu, { ...matsu, form: 'teiruPast' }].entries()) {
    assert.equal(compatibleRetest(onlyPending(state), exercise), false);
    assert.equal(retestStatus(onlyPending(state), exercise, { originalCount: state.originalCount, at: time }).reason, 'different-rule-path');
    state = original(state, exercise, `other-${index}`);
  }
  assert.equal(onlyPending(state).key, assessmentTarget(noru).key);
});

test('hinted or feedback-correct originals remain pending and restart retest spacing without inventing a failure', () => {
  for (const reason of ['hinted', 'feedback-retry']) {
    let state = intervening(original(emptyAssessment(), noru, 'q1', false));
    state = original(state, matsu, `q4-${reason}`, true, { reason });
    const target = state.byTarget[assessmentTarget(noru).key], pending = onlyPending(state);
    assert.equal(target.independentCorrect, 0);
    assert.equal(target.assistedOriginalCorrect, 1);
    assert.equal(target.eligibleRetestCorrect, 0);
    assert.equal(pending.lastFailureOrdinal, 1);
    assert.equal(pending.lastWordKey, assessmentTarget(noru).wordKey);
    assert.equal(pending.lastPresentedOrdinal, 4);
    assert.equal(pending.lastPresentedWordKey, assessmentTarget(matsu).wordKey);
    assert.equal(pending.failures, 1, 'assisted correct answers do not create another incorrect original');
  }
});

test('unspecified assistance reason is explicit and a revealed answer is never a correct attempt', () => {
  const helped = original(emptyAssessment(), noru, 'hinted-correct', true, { independent: false });
  assert.equal(onlyPending(helped).reason, 'assisted');
  assert.equal(onlyPending(helped).failures, 0);
  assert.equal(onlyPending(helped).lastFailureAt, null);
  const revealed = original(emptyAssessment(), noru, 'revealed', true, { reason: 'revealed' });
  assert.equal(revealed.byTarget[assessmentTarget(noru).key].assistedOriginalCorrect, 0);
  assert.equal(onlyPending(revealed).failures, 1);
});

test('renewed independent failure replaces the last failed word, time and ordinal, retaining earlier history', () => {
  let state = intervening(original(emptyAssessment(), noru, 'q1', false, { failedKcIds: ['suffix.negative', 'irrelevant'] }));
  state = original(state, matsu, 'q4', false, { at: '2026-09-10T02:00:00Z', failedKcIds: ['stem.ichidan.drop-ru'] });
  const pending = onlyPending(state);
  assert.equal(pending.createdOrdinal, 1);
  assert.equal(pending.lastFailureOrdinal, 4);
  assert.equal(pending.createdAt, time);
  assert.equal(pending.lastFailureAt, '2026-09-10T02:00:00.000Z');
  assert.deepEqual(pending.failedKcIds, ['suffix.negative', 'stem.ichidan.drop-ru']);
  assert.equal(pending.failures, 2);
});

test('singleton lexical exception needs explicit catalog policy and question spacing only', () => {
  const iku = verb('行く', 'いく', 'godan', 'past');
  let state = original(emptyAssessment(), iku, 'q1', false);
  const pending = onlyPending(state), nextDay = '2026-09-10T02:00:00.000Z';
  assert.equal(retestStatus(pending, iku, { originalCount: 3, at: nextDay }).reason, 'same-word');
  assert.equal(retestStatus(pending, iku, { originalCount: 1, at: nextDay, singleWord: true }).reason, 'needs-spacing');
  assert.equal(retestStatus(pending, iku, { originalCount: 3, at: time, singleWord: true }).reason, 'eligible');
  const status = retestStatus(pending, iku, { originalCount: 3, at: nextDay, singleWord: true });
  assert.deepEqual(status, { eligible: true, reason: 'eligible', remainingQuestions: 0, availableAt: null, policy: 'single-word-spaced' });
  state = intervening(state);
  state = original(state, iku, 'q4', true, { at: nextDay, singleWord: true });
  assert.equal(Object.keys(state.pending).length, 0);
  assert.equal(state.byTarget[assessmentTarget(iku).key].lastRetestPolicy, 'single-word-spaced');
});

test('singleton question spacing starts at the latest rehearsal without a time delay', () => {
  const iku = verb('行く', 'いく', 'godan', 'past');
  let state = intervening(original(emptyAssessment(), iku, 'q1', false));
  state = original(state, iku, 'q4', true, { at: '2026-09-09T14:00:00Z', singleWord: false });
  const pending = onlyPending(state);
  assert.equal(pending.lastFailureAt, time);
  assert.equal(pending.lastPresentedAt, '2026-09-09T14:00:00.000Z');
  state = intervening(state);
  const tooSoon = retestStatus(onlyPending(state), iku, { originalCount: state.originalCount, at: '2026-09-10T02:00:00Z', singleWord: true });
  assert.equal(tooSoon.eligible, true);
  assert.equal(tooSoon.reason, 'eligible');
  assert.equal(tooSoon.availableAt, null);
  state = original(state, iku, 'q7', true, { at: '2026-09-10T14:00:00Z', singleWord: true });
  assert.equal(Object.keys(state.pending).length, 0);
});

test('explicit assisted operations reset pending time and spacing without adding attempts or success credit', () => {
  const iku = verb('行く', 'いく', 'godan', 'past');
  const before = intervening(original(emptyAssessment(), iku, 'q1', false));
  const event = { exercise: iku, questionId: 'q1', eventId: 'q1:completed', at: '2026-09-09T18:00:00Z' };
  const state = recordAssessmentExposure(before, event), pending = onlyPending(state);
  assert.equal(state.originalCount, before.originalCount);
  assert.equal(state.byTarget, before.byTarget);
  assert.equal(state.independentByKc, before.independentByKc);
  assert.equal(state.assistedByKc, before.assistedByKc);
  assert.equal(state.seenAssistedIds, before.seenAssistedIds);
  assert.equal(pending.lastFailureAt, time);
  assert.equal(pending.lastFailureOrdinal, 1);
  assert.equal(pending.lastPresentedOrdinal, 3);
  assert.equal(pending.lastPresentedAt, '2026-09-09T18:00:00.000Z');
  assert.equal(pending.failures, 1);
  assert.equal(retestStatus(pending, iku, { originalCount: 3, at: '2026-09-10T18:00:00Z', singleWord: true }).remainingQuestions, 2);
  assert.equal(retestStatus(pending, iku, { originalCount: 5, at: '2026-09-10T02:00:00Z', singleWord: true }).reason, 'eligible');
  assert.equal(retestStatus(pending, iku, { originalCount: 5, at: '2026-09-10T18:00:00Z', singleWord: true }).eligible, true);
  assert.equal(recordAssessmentExposure(state, event), state);
  const older = recordAssessmentExposure(state, { ...event, eventId: 'q1:older-arrival', at: '2026-09-09T16:00:00Z' });
  assert.equal(older.pending, state.pending, 'old unseen events cannot rewind the delay or move spacing');
  const other = recordAssessmentExposure(state, { exercise: noru, questionId: 'other', eventId: 'other:skip', at: '2026-09-09T22:00:00Z' });
  assert.equal(other.pending, state.pending, 'recording unrelated assistance cannot create or change pending');
  const saved = JSON.parse(JSON.stringify(state));
  assert.equal(recordAssessmentExposure(saved, event), saved, 'exposure receipts survive persistence');
});

test('scheduler leaves waiting work intact, selects eligible work fairly and never infers singleton from filtering', () => {
  const iku = verb('行く', 'いく', 'godan', 'past');
  let state = original(emptyAssessment(), noru, 'n1', false);
  state = original(state, yomu, 'y2', false);
  state = original(state, iku, 'i3', false);
  state = intervening(state);
  const before = structuredClone(state), full = [noru, matsu, yomu, verb('飲む', 'のむ', 'godan'), iku];
  const first = selectRetest(state, full, { at: time, catalogExercises: full });
  assert.equal(first.pending.key, assessmentTarget(noru).key);
  assert.equal(first.exercise, matsu);
  assert.deepEqual(state, before, 'selection is read-only');
  state = original(state, first.exercise, 'retest-6', false);
  const second = selectRetest(state, full, { at: time, catalogExercises: full });
  assert.equal(second.pending.key, assessmentTarget(yomu).key);
  assert.equal(selectRetest(state, [noru], { at: '2026-09-12T00:00:00Z', catalogExercises: full }), null, 'one filtered word is not a singleton target');
  const singleton = selectRetest(state, [iku], { at: '2026-09-10T02:00:00Z', catalogExercises: full });
  assert.equal(singleton.status.policy, 'single-word-spaced');
  assert.equal(selectRetest(state, full, { at: time, catalogExercises: full, excludeTargetKeys: Object.keys(state.pending) }), null);
  assert.equal(selectRetest(state, [second.exercise], { at: time, catalogExercises: full, excludeWordKeys: [assessmentTarget(second.exercise).wordKey] }), null);
});

test('cross-day JSON persistence retains lifetime count, idempotency and unresolved obligations', () => {
  let state = intervening(original(emptyAssessment(), noru, 'q1', false));
  state = JSON.parse(JSON.stringify(state));
  assert.equal(state.originalCount, 3);
  assert.equal(original(state, noru, 'q1', false), state);
  const next = original(state, matsu, 'tomorrow', true, { at: '2026-09-10T00:00:00Z' });
  assert.equal(next.originalCount, 4);
  assert.equal(Object.keys(next.pending).length, 0);
});

test('every actual catalog rule path has a reachable retest policy without using a different rule', async () => {
  const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  try {
    const { KNOWLEDGE } = await server.ssrLoadModule('/app/page.tsx');
    const groups = new Map();
    for (const exercise of KNOWLEDGE.exercises) {
      const target = assessmentTarget(exercise);
      if (!groups.has(target.key)) groups.set(target.key, []);
      groups.get(target.key).push(exercise);
    }
    for (const [key, exercises] of groups) {
      const example = exercises[0], target = assessmentTarget(example);
      assert.equal(exercises.every(exercise => assessmentTarget(exercise).ruleSignature === target.ruleSignature), true, 'no digest collision');
      assert.equal(new Set(exercises.map(exercise => exercise.form)).size, 1, 'forms never share targets');
      assert.equal(new Set(exercises.map(exercise => exercise.item.class)).size, 1, 'original classes never share targets');
      const failed = original(emptyAssessment(), example, 'failure', false);
      const spaced = intervening(failed);
      // This group is the complete catalog for this target, not a filtered
      // readiness subset, and avoids re-indexing unrelated groups 828 times.
      const choice = selectRetest(spaced, exercises, { at: '2026-09-10T02:00:00Z', catalogExercises: exercises });
      assert.ok(choice, `No reachable retest for ${example.id}`);
      assert.equal(choice.pending.key, key);
      assert.equal(compatibleRetest(onlyPending(failed), choice.exercise), true);
      const differentWords = new Set(exercises.map(exercise => assessmentTarget(exercise).wordKey));
      assert.equal(choice.status.policy, differentWords.size === 1 ? 'single-word-spaced' : 'different-word-spaced');
      const cleared = original(spaced, choice.exercise, 'retest', true, { at: '2026-09-10T02:00:00Z', singleWord: choice.status.policy === 'single-word-spaced' });
      assert.equal(cleared.pending[key], undefined, example.id);
      assert.equal(cleared.byTarget[key].eligibleRetestCorrect, 1, example.id);
    }
    assert.ok(groups.size > 500, 'coverage includes the whole model, not one representative family');
  } finally { await server.close(); }
});

test('retest eligibility is identical across clock times for singleton and different-word targets', () => {
  const iku = verb('行く', 'いく', 'godan', 'past');
  const pending = onlyPending(original(emptyAssessment(), iku, 'clock-independent', false));
  for (const originalCount of [1,2,3,50]) {
    const results = ['1970-01-01T00:00:00Z', time, '2099-12-31T23:59:59Z'].map(at =>
      retestStatus(pending,iku,{originalCount,at,singleWord:true}));
    assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
    assert.equal(results[0].availableAt,null);
    assert.equal(results[0].eligible,originalCount>=3);
  }
});
