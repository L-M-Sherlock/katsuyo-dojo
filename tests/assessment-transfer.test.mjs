import assert from 'node:assert/strict';
import test from 'node:test';
import { emptySkillStats, updateKnowledgeStats } from '../app/lib/adaptive.mjs';
import { emptyPracticeLog } from '../app/lib/practice-log.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { assessmentTarget, emptyAssessment, recordHintExposure, recordIndependentAttempt } from '../app/lib/learning-assessment.mjs';
import { restoreLearningAssessment } from '../app/lib/assessment-transfer.mjs';

const at = '2026-09-09T03:00:00.000Z';
const make = (surface, reading, cls, form, extra = {}) => {
  const item = { domain: ['i', 'na'].includes(cls) ? 'adjective' : 'verb', surface, reading, class: cls, ...extra };
  return { id: `course:${form ?? 'classify'}:${surface}`, courseId: 'course', item, form, kcIds: deriveUnified(item, form).requiredKcIds };
};
const noru = make('乗る', 'のる', 'godan', 'teiruNegative');
const matsu = make('待つ', 'まつ', 'godan', 'teiruNegative');
const yomu = make('読む', 'よむ', 'godan', 'teiruNegative');
const kaeru = make('帰る', 'かえる', 'godan', 'teiruNegative');
const firstFiller = make('書く', 'かく', 'godan', 'masu');
const secondFiller = make('食べる', 'たべる', 'ichidan', 'tai');
const ii = make('格好いい', 'かっこいい', 'i', 'adjectivePast', { iiFamily: true });
const classify = make('食べる', 'たべる', 'ichidan', null);
const iku = make('行く', 'いく', 'godan', 'past');
const defaults = [noru, matsu, yomu, kaeru, firstFiller, secondFiller, ii, classify, iku];
const components = [...new Set(defaults.flatMap(exercise => exercise.kcIds))].map(id => ({ id }));
const options = { components, exercises: defaults, at };
const profile = (byKc = {}) => ({ version: 6, byKc, practiceLog: emptyPracticeLog() });
const itemLog = exercise => ({ id: exercise.id, courseId: exercise.courseId, form: exercise.form,
  surface: exercise.item.surface, reading: exercise.item.reading, wordClass: exercise.item.class, domain: exercise.item.domain });
const total = attempted => ({ date: '2026-09-09', attempted, correct: 0, streak: 0 });
const repeated = (count = 5) => {
  let value;
  for (let index = 0; index < count; index++) value = updateKnowledgeStats({ a: value }, { kcIds: ['a'], correct: true }).a;
  return value;
};

// An old-format recorder, deliberately separate from current application
// scoring and logging. It preserves exactly the legacy snapshots being
// reconciled, even after the application changes how new answers are scored.
function oldEvent(before, exercise, detail = {}) {
  const sequence = before.practiceLog.totalEvents + 1;
  const { type = 'question', outcome = 'correct', questionId = `q-${sequence}`, answer = 'recorded-answer',
    kcIds = exercise.kcIds, failedKcId = null, confirmedKcIds = [], hintUsed = false,
    focusId = '', responseMs, answerLength = 5, at: eventAt = at, target: targetExtra = {} } = detail;
  const changesAllowed = ['question', 'step'].includes(type) && ['correct', 'incorrect', 'revealed'].includes(outcome);
  const byKc = changesAllowed ? updateKnowledgeStats(before.byKc, { kcIds, correct: outcome === 'correct', failedKcId,
    confirmedKcIds, hintUsed, revealed: outcome === 'revealed', focusId, responseMs, answerLength }) : before.byKc;
  const target = { surface: exercise.item.surface, reading: exercise.item.reading, form: exercise.form,
    kind: type === 'step' ? 'conjugation' : 'question', label: exercise.form ?? 'classify', kcIds,
    answers: ['recorded-correct'], readings: ['recorded-correct'], stepIndex: type === 'step' ? sequence : null,
    totalSteps: type === 'step' ? sequence : 0, nextTotalSteps: type === 'step' ? sequence : 0, ...targetExtra };
  const keys = new Set([...Object.keys(before.byKc), ...Object.keys(byKc)]);
  const changes = [...keys].filter(id => JSON.stringify(before.byKc[id]) !== JSON.stringify(byKc[id])).map(kcId => ({
    kcId, label: kcId, before: before.byKc[kcId] ?? null, after: byKc[kcId] ?? null,
  }));
  const event = { id: `event-${sequence}`, sequence, questionId, at: eventAt, type, outcome, exercise: itemLog(exercise),
    target, answer, answerLength: Array.from(answer).length, answerTruncated: false, hintUsed,
    diagnosis: { kcId: failedKcId, confirmedKcIds, resolution: outcome, message: '' }, changes,
    totals: { before: total(sequence - 1), after: total(sequence) } };
  return { ...before, byKc, practiceLog: { ...before.practiceLog, totalEvents: sequence, events: [...before.practiceLog.events, event] } };
}

function latestNoru() {
  const baseline = Object.fromEntries(noru.kcIds.map(id => [id, repeated()]));
  delete baseline['facet.apply.teiru.negative'];
  let old = oldEvent(profile(baseline), noru, { outcome: 'incorrect', questionId: 'noru', answer: 'のっていた' });
  old = oldEvent(old, noru, { type: 'step', questionId: 'noru', answer: 'のっている',
    kcIds: ['class.godan', 'heuristic.ru-other', 'onbin.sokuon', 'suffix.te', 'construction.teiru'],
    target: { form: 'teiru' } });
  old = oldEvent(old, noru, { type: 'step', questionId: 'noru', answer: 'のっていない',
    kcIds: ['stem.ichidan.drop-ru', 'suffix.negative', 'apply.teiru.continuation', 'facet.apply.teiru.negative'],
    target: { surface: '乗っている', reading: 'のっている' } });
  old = oldEvent(old, noru, { type: 'diagnostic-end', outcome: 'completed', questionId: 'noru', answer: '' });
  return { baseline, old };
}

test('latest 乗る failure retains its pending retest while both guided answers leave independent mastery unchanged', () => {
  const { old, baseline } = latestNoru(), snapshot = structuredClone(old);
  const result = restoreLearningAssessment(old, options), { assessment } = result;
  assert.deepEqual(old, snapshot, 'migration must not rewrite the retained original log');
  assert.deepEqual(result.byKc, baseline);
  assert.deepEqual(assessment.independentByKc, {});
  assert.equal(assessment.originalCount, 1);
  assert.equal(assessment.pending[assessmentTarget(noru).key].lastWordKey, assessmentTarget(noru).wordKey);
  assert.equal(assessment.byTarget[assessmentTarget(noru).key].assistedStepCorrect, 2);
  assert.equal(assessment.assistedByKc['construction.teiru'].correct, 1);
  assert.equal(assessment.assistedByKc['suffix.negative'].correct, 1);
  assert.equal(assessment.assistedByKc['apply.teiru.continuation'], undefined);
  assert.equal(assessment.assistedByKc['facet.apply.teiru.negative'], undefined);
  assert.equal(assessment.assistedByKc['class.godan'], undefined);
  assert.equal(assessment.assistedByKc['heuristic.ru-other'], undefined);
  assert.equal(assessment.migration.knownIndependentEvents, 1);
  assert.equal(assessment.migration.knownAssistedEvents, 2);
  assert.equal(assessment.migration.uncertain.length, 0);
  assert.deepEqual(assessment.migration.baselineByKc['apply.teiru.continuation'], baseline['apply.teiru.continuation']);
  assert.equal(assessment.migration.changes.find(change => change.kcId === 'facet.apply.teiru.negative').after, null);
});

test('v1 imports are authoritative and idempotent even when the retained log still contains a failed original', () => {
  const { old } = latestNoru();
  const restored = restoreLearningAssessment(old, options);
  let assessment = recordIndependentAttempt(restored.assessment, { exercise: firstFiller, questionId: 'new-fill-1', correct: true, at });
  assessment = recordIndependentAttempt(assessment, { exercise: secondFiller, questionId: 'new-fill-2', correct: true, at });
  assessment = recordIndependentAttempt(assessment, { exercise: matsu, questionId: 'new-retest', correct: true, at });
  assert.deepEqual(assessment.pending, {});
  const current = { ...old, byKc: restored.byKc, assessment };
  const copy = restoreLearningAssessment(current, options);
  assert.deepEqual(copy, { byKc: current.byKc, assessment: current.assessment });
  assert.deepEqual(restoreLearningAssessment({ ...current, ...copy }, options), copy);
  assert.notEqual(copy.assessment, current.assessment, 'imported state cannot alias input');
  assert.equal(copy.assessment.originalCount, 4);
});

test('unlogged old evidence is preserved as explicitly unknown historical baseline', () => {
  const baseline = { 'construction.teiru': repeated(7), 'apply.teiru.continuation': repeated(4) };
  const result = restoreLearningAssessment({ version: 6, byKc: baseline }, options);
  assert.deepEqual(result.byKc, baseline);
  assert.deepEqual(result.assessment.independentByKc, {});
  assert.deepEqual(result.assessment.assistedByKc, {});
  assert.deepEqual(result.assessment.pending, {});
  assert.equal(result.assessment.migration.uncertain[0].reason, 'no-practice-log');
  assert.deepEqual(result.assessment.migration.unverifiedKcIds.sort(), Object.keys(baseline).sort());
  assert.deepEqual(restoreLearningAssessment({ byKc: result.byKc, assessment: result.assessment }, options), result);
});

test('a broken snapshot chain blocks only the affected KC and never guesses its earlier baseline', () => {
  const { old, baseline } = latestNoru();
  old.byKc['construction.teiru'] = repeated(42);
  const result = restoreLearningAssessment(old, options);
  assert.deepEqual(result.byKc['construction.teiru'], old.byKc['construction.teiru']);
  assert.deepEqual(result.byKc['apply.teiru.continuation'], baseline['apply.teiru.continuation']);
  assert.equal(result.assessment.assistedByKc['construction.teiru'], undefined);
  assert.ok(result.assessment.migration.uncertain.some(entry => entry.kcId === 'construction.teiru' && entry.reason === 'snapshot-chain-mismatch'));
  assert.equal(Object.keys(result.assessment.pending).length, 1);
});

test('an internal chain gap and inconsistent recorded diagnosis are retained rather than repaired speculatively', () => {
  let old = oldEvent(profile(), noru);
  old = oldEvent(old, noru, { type: 'step', questionId: 'q-1' });
  old.practiceLog.events[1].changes.find(change => change.kcId === 'construction.teiru').before = repeated(20);
  const result = restoreLearningAssessment(old, options);
  assert.deepEqual(result.byKc['construction.teiru'], old.byKc['construction.teiru']);
  assert.ok(result.assessment.migration.uncertain.some(entry => entry.kcId === 'construction.teiru'));
  let bad = oldEvent(profile(), noru, { outcome: 'incorrect', failedKcId: 'suffix.negative' });
  bad.practiceLog.events[0].diagnosis.kcId = 'stem.ichidan.drop-ru';
  const kept = restoreLearningAssessment(bad, options);
  assert.deepEqual(kept.byKc['suffix.negative'], bad.byKc['suffix.negative']);
  assert.equal(kept.assessment.migration.uncertain[0].reason, 'unverifiable-recorded-change');
});

test('known independent positives retain recorded timing while indirect classification credit is removed', () => {
  const before = { 'apply.teiru.continuation': { ...repeated(2), cleanTimeTotal: 1000, cleanTimeCount: 1 } };
  const old = oldEvent(profile(before), noru, { focusId: 'apply.teiru.continuation', responseMs: 6789, answerLength: 6 });
  const result = restoreLearningAssessment(old, options), actual = old.byKc['apply.teiru.continuation'];
  assert.deepEqual(result.byKc['apply.teiru.continuation'], actual);
  assert.equal(result.assessment.independentByKc['apply.teiru.continuation'].cleanTimeCount, 1);
  assert.equal(result.assessment.independentByKc['apply.teiru.continuation'].cleanTimeTotal, actual.cleanTimeTotal - before['apply.teiru.continuation'].cleanTimeTotal);
  assert.equal(result.byKc['class.godan'], undefined);
  assert.equal(result.byKc['heuristic.ru-other'], undefined);
  assert.equal(result.byKc['facet.apply.teiru.negative'].correct, 1);
});

test('original classification evidence and explicit historical failure attribution survive without rerunning an analyzer', () => {
  let old = oldEvent(profile(), classify);
  old = oldEvent(old, noru, { outcome: 'incorrect', failedKcId: 'suffix.negative', confirmedKcIds: ['stem.ichidan.drop-ru'], answer: 'historical-analyzer-input' });
  const result = restoreLearningAssessment(old, options);
  assert.equal(result.byKc['class.ichidan'].correct, 1);
  assert.equal(result.byKc['heuristic.ru-ie'].correct, 1);
  assert.equal(result.byKc['suffix.negative'].attempts, 1);
  assert.equal(result.byKc['suffix.negative'].correct, 0);
  assert.equal(result.byKc['stem.ichidan.drop-ru'].correct, 1);
  assert.equal(result.assessment.independentByKc['suffix.negative'].correct, 0);
  assert.deepEqual(result.assessment.pending[assessmentTarget(noru).key].failedKcIds, ['suffix.negative']);
});

test('hinted, revealed and grammar-feedback retry evidence cannot affect independent or application statistics', () => {
  let old = oldEvent(profile(), noru, { questionId: 'hinted', hintUsed: true, focusId: 'construction.teiru', responseMs: 1234 });
  old = oldEvent(old, matsu, { questionId: 'reveal', outcome: 'revealed', failedKcId: 'apply.teiru.continuation' });
  old = oldEvent(old, yomu, { questionId: 'retry', outcome: 'incorrect' });
  old = oldEvent(old, yomu, { questionId: 'retry', focusId: 'construction.teiru', responseMs: 2222 });
  const result = restoreLearningAssessment(old, options);
  assert.deepEqual(result.byKc, {});
  assert.deepEqual(result.assessment.independentByKc, {});
  assert.equal(result.assessment.assistedByKc['construction.teiru'].correct, 2);
  assert.equal(result.assessment.assistedByKc['construction.teiru'].cleanTimeCount, 0);
  assert.equal(result.assessment.assistedByKc['apply.teiru.continuation'], undefined);
  assert.equal(result.assessment.assistedByKc['class.godan'], undefined);
  assert.equal(result.assessment.originalCount, 3);
  assert.ok(result.assessment.migration.events.some(entry => entry.source === 'feedback-retry'));
});

test('lexical typo and invalid retries expose no grammar recipe and do not consume independent eligibility or spacing', () => {
  let old = oldEvent(profile(), noru, { questionId: 'input', outcome: 'invalid' });
  old = oldEvent(old, noru, { questionId: 'input', outcome: 'typo' });
  old = oldEvent(old, noru, { questionId: 'input' });
  const result = restoreLearningAssessment(old, options);
  assert.equal(result.assessment.originalCount, 1);
  assert.equal(result.assessment.independentByKc['construction.teiru'].correct, 1);
  assert.deepEqual(result.assessment.assistedByKc, {});
  assert.equal(result.assessment.migration.knownIndependentEvents, 1);
});

test('full catalog metadata preserves adjective iiFamily, even when an old exercise id has changed', () => {
  const old = oldEvent(profile(), ii, { outcome: 'incorrect' });
  old.practiceLog.events[0].exercise.id = 'previous-curriculum-id';
  const result = restoreLearningAssessment(old, options);
  assert.ok(result.assessment.pending[assessmentTarget(ii).key]);
  const withoutException = { ...ii, item: { ...ii.item, iiFamily: false } };
  assert.notEqual(assessmentTarget(withoutException).key, assessmentTarget(ii).key);
  assert.equal(result.assessment.migration.unknownEvents, 0);
});

test('missing or inconsistent lexical metadata leaves the original map untouched but preserves real question spacing', () => {
  const old = oldEvent(profile(), noru);
  old.practiceLog.events[0].exercise.wordClass = 'ichidan';
  const result = restoreLearningAssessment(old, options);
  assert.deepEqual(result.byKc, old.byKc);
  assert.equal(result.assessment.originalCount, 1);
  assert.deepEqual(result.assessment.byTarget, {});
  assert.equal(result.assessment.migration.unknownEvents, 1);
  assert.ok(result.assessment.migration.uncertain.some(entry => entry.reason === 'exercise-metadata-unavailable'));
  const unavailable = restoreLearningAssessment(old, { components, at });
  assert.deepEqual(unavailable.byKc, old.byKc);
});

test('retained suffixes establish only a bounded baseline and do not manufacture an omitted original attempt', () => {
  const { old } = latestNoru();
  old.practiceLog.events = old.practiceLog.events.slice(1);
  old.practiceLog.droppedEntries = 1;
  const result = restoreLearningAssessment(old, options);
  assert.equal(result.assessment.originalCount, 0);
  assert.deepEqual(result.assessment.pending, {});
  assert.equal(result.assessment.migration.throughSequence, 4);
  assert.equal(result.assessment.migration.originalLog.droppedEntries, 1);
  assert.ok(result.assessment.migration.uncertain.some(entry => entry.reason === 'older-events-not-retained'));
  assert.deepEqual(restoreLearningAssessment({ ...old, ...result }, options), result);
});

test('premature and same-word correct repeats enter assisted practice; only a spaced different-word original clears pending', () => {
  let old = oldEvent(profile(), noru, { outcome: 'incorrect', questionId: 'failed', at: '2026-09-08T15:00:00Z' });
  old = oldEvent(old, matsu, { questionId: 'too-early', at: '2026-09-09T00:00:00Z' });
  old = oldEvent(old, firstFiller);
  old = oldEvent(old, secondFiller);
  old = oldEvent(old, noru, { questionId: 'same-word' });
  const pendingResult = restoreLearningAssessment(old, options);
  assert.equal(pendingResult.assessment.originalCount, 5);
  assert.ok(pendingResult.assessment.pending[assessmentTarget(noru).key]);
  assert.equal(pendingResult.byKc['apply.teiru.continuation'], undefined);
  assert.equal(pendingResult.assessment.assistedByKc['construction.teiru'].correct, 2);
  old = oldEvent(old, firstFiller);
  old = oldEvent(old, secondFiller);
  old = oldEvent(old, matsu, { questionId: 'eligible' });
  const cleared = restoreLearningAssessment(old, options);
  assert.equal(cleared.assessment.originalCount, 8);
  assert.equal(cleared.assessment.pending[assessmentTarget(noru).key], undefined);
  assert.equal(cleared.byKc['apply.teiru.continuation'].correct, 1);
  assert.equal(cleared.assessment.byTarget[assessmentTarget(noru).key].eligibleRetestCorrect, 1);
});

test('same form with another sound family does not clear pending or manufacture a singleton retest', () => {
  let old = oldEvent(profile(), noru, { outcome: 'incorrect' });
  old = oldEvent(old, firstFiller);
  old = oldEvent(old, secondFiller);
  old = oldEvent(old, yomu, { at: '2026-09-12T03:00:00Z' });
  old = oldEvent(old, noru, { at: '2026-09-12T03:01:00Z' });
  const result = restoreLearningAssessment(old, options);
  assert.ok(result.assessment.pending[assessmentTarget(noru).key]);
  assert.equal(result.assessment.byTarget[assessmentTarget(noru).key].eligibleRetestCorrect, 0);
  assert.equal(result.assessment.byTarget[assessmentTarget(yomu).key].independentCorrect, 1);
});

test('explicit full-catalog singleton uses delayed original retrieval and still requires intervening real questions', () => {
  let old = oldEvent(profile(), iku, { outcome: 'incorrect', at: '2026-09-08T01:00:00Z' });
  old = oldEvent(old, firstFiller, { at: '2026-09-08T02:00:00Z' });
  old = oldEvent(old, secondFiller, { at: '2026-09-08T03:00:00Z' });
  old = oldEvent(old, iku, { at: '2026-09-09T02:00:00Z' });
  const result = restoreLearningAssessment(old, options);
  assert.equal(result.assessment.pending[assessmentTarget(iku).key], undefined);
  assert.equal(result.assessment.byTarget[assessmentTarget(iku).key].lastRetestPolicy, 'single-word-spaced');
});

test('a cross-day assisted operation postpones singleton retrieval from its latest recorded exposure', () => {
  let old = oldEvent(profile(), iku, { outcome: 'incorrect', questionId: 'iku', at: '2026-09-08T01:00:00Z' });
  old = oldEvent(old, firstFiller, { at: '2026-09-08T02:00:00Z' });
  old = oldEvent(old, secondFiller, { at: '2026-09-08T03:00:00Z' });
  old = oldEvent(old, iku, { type: 'step', questionId: 'iku', at: '2026-09-09T01:00:00Z' });
  old = oldEvent(old, iku, { type: 'diagnostic-end', outcome: 'completed', questionId: 'iku', at: '2026-09-09T01:05:00Z' });
  old = oldEvent(old, iku, { at: '2026-09-09T02:00:00Z' });
  const result = restoreLearningAssessment(old, options), pending = result.assessment.pending[assessmentTarget(iku).key];
  assert.ok(pending);
  assert.equal(result.assessment.originalCount, 4);
  assert.equal(result.assessment.byTarget[pending.key].eligibleRetestCorrect, 0);
  assert.equal(pending.lastPresentedAt, '2026-09-09T02:00:00.000Z');
  assert.deepEqual(result.assessment.seenExposureIds, ['event-4', 'event-5']);
});

test('explicit negative evidence on an assisted step leaves independent mastery intact and records a local practice error', () => {
  const baseline = { 'suffix.negative': repeated(5) };
  let old = oldEvent(profile(baseline), noru, { outcome: 'incorrect', questionId: 'failed' });
  old = oldEvent(old, noru, { type: 'step', outcome: 'incorrect', failedKcId: 'suffix.negative', questionId: 'failed' });
  const result = restoreLearningAssessment(old, options);
  assert.deepEqual(result.byKc, baseline);
  assert.deepEqual(result.assessment.independentByKc, {});
  assert.equal(result.assessment.assistedByKc['suffix.negative'].attempts, 1);
  assert.equal(result.assessment.assistedByKc['suffix.negative'].correct, 0);
  assert.equal(result.assessment.migration.changes[0].after.attempts, 5);
  result.byKc['suffix.negative'].attempts = 999;
  assert.equal(result.assessment.migration.changes[0].after.attempts, 5, 'report snapshots must not alias live byKc records');
});

test('malformed v1 assessment cannot be silently replayed as legacy history or normalize away a completed state', () => {
  const { old } = latestNoru(), valid = restoreLearningAssessment(old, options);
  const mutations = [
    state => { state.assessment.version = 2; },
    state => { state.assessment.originalCount = 99; },
    state => { state.assessment.originalCount++; state.assessment.seenQuestionIds.push('invented-question'); },
    state => { state.assessment.seenQuestionIds.push(state.assessment.seenQuestionIds[0]); },
    state => { state.assessment.independentByKc['construction.teiru'] = repeated(99); },
    state => { state.assessment.assistedByKc['apply.teiru.continuation'] = repeated(1); },
    state => { Object.values(state.assessment.pending)[0].target.ruleSignature += ' '; },
    state => { Object.values(state.assessment.pending)[0].lastFailureOrdinal = 99; },
    state => { Object.values(state.assessment.pending)[0].lastPresentedAt = '2000-01-01T00:00:00Z'; },
    state => { Object.values(state.assessment.byTarget)[0].independentCorrect = 99; },
    state => { state.assessment.migration.throughSequence = -1; },
    state => { state.assessment.migration.baselineByKc['unknown'] = emptySkillStats(); },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(valid); mutate(changed);
    assert.throws(() => restoreLearningAssessment({ ...old, ...changed }, options), /学习评估/);
  }
  const fresh = { byKc: {}, assessment: emptyAssessment() };
  assert.deepEqual(restoreLearningAssessment(fresh, options), fresh);
});

test('hint-only pending with zero attempts and no fabricated failure roundtrips as authoritative state', () => {
  let assessment = recordHintExposure(emptyAssessment(), { exercise: noru, questionId: 'unsubmitted', eventId: 'hint', at });
  let restored = restoreLearningAssessment({ byKc: {}, assessment }, options);
  assert.deepEqual(restored.assessment, assessment);
  assert.equal(restored.assessment.originalCount, 0);
  assert.equal(restored.assessment.pending[assessmentTarget(noru).key].failures, 0);
  assert.equal(restored.assessment.pending[assessmentTarget(noru).key].lastFailureAt, null);
  assert.equal(restored.assessment.pending[assessmentTarget(noru).key].createdOrdinal, 0);
  assert.deepEqual(restored.assessment.seenQuestionIds, []);
  assessment = recordIndependentAttempt(restored.assessment, { exercise: noru, questionId: 'after-refresh', correct: true, at });
  restored = restoreLearningAssessment({ byKc: {}, assessment }, options);
  assert.deepEqual(restored.assessment, assessment);
  assert.equal(restored.assessment.byTarget[assessmentTarget(noru).key].independentCorrect, 0);
  assert.equal(restored.assessment.byTarget[assessmentTarget(noru).key].assistedOriginalCorrect, 1);
  assert.equal(restored.assessment.pending[assessmentTarget(noru).key].failures, 0);
});

test('hint-created ordinal zero can later acquire a real failed attempt without losing its original exposure history', () => {
  let assessment = recordHintExposure(emptyAssessment(), { exercise: noru, questionId: 'hinted', eventId: 'hint', at });
  assessment = recordIndependentAttempt(assessment, { exercise: noru, questionId: 'hinted', correct: false, at, independent: false, reason: 'hinted' });
  const restored = restoreLearningAssessment({ byKc: {}, assessment }, options);
  const pending = restored.assessment.pending[assessmentTarget(noru).key];
  assert.equal(pending.createdOrdinal, 0);
  assert.equal(pending.failures, 1);
  assert.equal(pending.lastFailureOrdinal, 1);
  assert.equal(pending.lastFailureAt, at);
  assert.deepEqual(restored.assessment, assessment);
});

test('hint-only zero-failure state cannot carry negative ordinals or invented failure evidence', () => {
  const assessment = recordHintExposure(emptyAssessment(), { exercise: noru, questionId: 'unsubmitted', eventId: 'hint', at });
  for (const mutate of [
    pending => { pending.createdOrdinal = -1; },
    pending => { pending.lastFailureAt = at; },
    pending => { pending.lastFailureOrdinal = 1; },
    pending => { pending.failedKcIds = ['suffix.negative']; },
    pending => { pending.reason = 'incorrect'; },
  ]) {
    const invalid = structuredClone(assessment); mutate(Object.values(invalid.pending)[0]);
    assert.throws(() => restoreLearningAssessment({ byKc: {}, assessment: invalid }, options), /学习评估/);
  }
});

test('an assisted correct original needs independent verification without being relabeled as an original failure', () => {
  for (const reason of ['hinted', 'feedback-retry', 'assisted']) {
    const assessment = recordIndependentAttempt(emptyAssessment(), { exercise: noru, questionId: `helped-${reason}`, correct: true, independent: false, reason, at });
    const restored = restoreLearningAssessment({ byKc: {}, assessment }, options), pending = restored.assessment.pending[assessmentTarget(noru).key];
    assert.equal(pending.failures, 0);
    assert.equal(pending.lastFailureAt, null);
    assert.equal(pending.lastFailureOrdinal, null);
    assert.deepEqual(restored.assessment, assessment);
  }
});

test('older v1 pending defaults only its missing latest word key without replaying or altering evidence', () => {
  const assessment = recordIndependentAttempt(emptyAssessment(), { exercise: noru, questionId: 'failed', correct: false, at });
  const key = assessmentTarget(noru).key, old = structuredClone(assessment);
  delete old.pending[key].lastPresentedWordKey;
  const restored = restoreLearningAssessment({ byKc: {}, assessment: old }, options);
  assert.equal(restored.assessment.pending[key].lastPresentedWordKey, old.pending[key].lastWordKey);
  assert.equal(old.pending[key].lastPresentedWordKey, undefined);
  assert.deepEqual(restored.assessment, assessment);
});
