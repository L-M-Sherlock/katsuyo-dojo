import assert from 'node:assert/strict';
import test from 'node:test';
import { assessmentTarget, emptyAssessment, reconcileAssessmentCatalog, recordIndependentAttempt } from '../app/lib/learning-assessment.mjs';
import { restoreLearningAssessment } from '../app/lib/assessment-transfer.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { assessmentCatalog, applyLearningObservation } from '../app/lib/learning-profile.mjs';
import { planRetestQuestion } from '../app/lib/retest-planning.mjs';
import { summarizeUnifiedCourse } from '../app/lib/unified-progress.mjs';

const at = '2026-09-12T01:00:00.000Z';
const exercise = (surface, reading, cls, form, courseId = 'aspect') => {
  const item = { domain: 'verb', surface, reading, class: cls };
  return { id: `${courseId}:${form ?? 'classify'}:${surface}`, courseId, item, form, kcIds: deriveUnified(item, form).requiredKcIds, prerequisites: [] };
};
const first = exercise('乗る', 'のる', 'godan', 'teiruNegative');
const second = exercise('待つ', 'まつ', 'godan', 'teiruNegative');
const third = exercise('取る', 'とる', 'godan', 'teiruNegative');
const other = exercise('読む', 'よむ', 'godan', 'teiruNegative');
const otherAlternate = exercise('飲む', 'のむ', 'godan', 'teiruNegative');
const fillers = [exercise('書く', 'かく', 'godan', null, 'classify'), exercise('食べる', 'たべる', 'ichidan', null, 'classify')];
const complete = [first, second, third, other, otherAlternate, ...fillers];
const courses = [{ id: 'aspect' }, { id: 'classify' }, { id: 'later' }];
const components = [...new Set(complete.flatMap(e => e.kcIds))].map((id, order) => ({
  id, order, firstCourseId: 'aspect', firstCourseIndex: 0, gating: true, prerequisites: [], coverageKcIds: [],
}));
const full = { attempts: 5, correct: 5, confidence: 1, bestConfidence: 1, filteredAccuracy: 1, cleanTimeCount: 0, cleanTimeTotal: 0 };
const fresh = () => ({ byKc: Object.fromEntries(components.map(k => [k.id, { ...full }])), assessment: emptyAssessment(),
  introducedKcIds: components.map(k => k.id), accessibleCourseIds: courses.map(c => c.id), coursePractice: {}, recentWordKeys: [], rotation: 0 });
const courseKcIds = { aspect: components.map(k => k.id), classify: fillers.flatMap(e => e.kcIds), later: first.kcIds };
const record = (profile, e, id, correct = false) => ({ ...profile, assessment: recordIndependentAttempt(profile.assessment, { exercise: e, questionId: id, correct, at }) });
const gap = profile => fillers.reduce((p, e, i) => record(p, e, `gap-${profile.assessment.originalCount}-${i}`, true), profile);
const plan = (profile, catalog, mode = 'adaptive', instant = at) => planRetestQuestion(profile, mode, { exercises: catalog, components, courses, courseKcIds, at: instant });
const restore = (profile, catalog = complete) => restoreLearningAssessment(profile, { components, exercises: catalog, at, catalogVersion: 7 });
const reconcile = (profile, catalog) => ({ ...profile, assessment: reconcileAssessmentCatalog(profile.assessment, catalog, 7) });
const observe = (profile, e, id, catalog, hint = false) => applyLearningObservation(profile, e, {
  type: hint ? 'hint' : 'question', outcome: hint ? 'shown' : 'correct', questionId: id, eventId: `${id}:event`, at,
}, assessmentCatalog(catalog));

test('catalog reconciliation suspends only vanished rule paths and preserves scores, history and chronology', () => {
  const old = record(fresh(), first, 'failure'), before = structuredClone(old), key = assessmentTarget(first).key;
  const paused = reconcile(old, [other, otherAlternate, ...fillers]);
  assert.deepEqual(old, before);
  assert.equal(paused.assessment.version, 2);
  assert.deepEqual(paused.assessment.pending, {});
  assert.deepEqual(paused.assessment.suspendedPending[key], { ...old.assessment.pending[key], suspension: { reason: 'no-eligible-exercise', catalogVersion: 7 } });
  for (const field of ['byTarget', 'independentByKc', 'assistedByKc', 'seenQuestionIds', 'seenAssistedIds', 'seenExposureIds', 'originalCount']) {
    assert.deepEqual(paused.assessment[field], old.assessment[field], field);
  }
  assert.deepEqual(paused.byKc, old.byKc);
  assert.equal(reconcileAssessmentCatalog(paused.assessment, [other, ...fillers], 8), paused.assessment, 'repeat imports preserve the original suspension revision');
  const resumed = reconcile(paused, [second, ...fillers]);
  assert.deepEqual(resumed.assessment.pending[key], old.assessment.pending[key], 'any compatible replacement restores the original anchors');
  assert.deepEqual(resumed.assessment.suspendedPending, {});
  assert.deepEqual(resumed.assessment.byTarget, old.assessment.byTarget, 'restoration is not an independent success');
});

test('v1 imports upgrade without replay and v2 suspended entries roundtrip or resume against the current catalog', () => {
  const profile = record(fresh(), first, 'failure'), v1 = structuredClone(profile);
  v1.assessment.version = 1; delete v1.assessment.suspendedPending;
  const restored = restore(v1);
  assert.equal(restored.assessment.version, 2);
  assert.deepEqual(restored, { byKc: profile.byKc, assessment: profile.assessment });
  const paused = restore(v1, fillers), key = assessmentTarget(first).key;
  assert.ok(paused.assessment.suspendedPending[key]);
  assert.deepEqual(restore(paused, fillers), paused);
  assert.deepEqual(restore(paused), restored);
  assert.deepEqual(restoreLearningAssessment(paused, { components, at }), paused, 'omitted catalog is not an empty catalog');
  assert.deepEqual(restore(v1, []), paused, 'an explicitly empty complete catalog is a real suspension');
});

test('v2 rejects malformed, contradictory or unauditable suspended obligations', () => {
  const valid = restore(record(fresh(), first, 'failure'), fillers), key = assessmentTarget(first).key;
  const invalids = [
    p => { delete p.assessment.suspendedPending; },
    p => { p.assessment.suspendedPending[key].suspension.reason = 'mastered'; },
    p => { p.assessment.suspendedPending[key].suspension.catalogVersion = 0; },
    p => { p.assessment.suspendedPending[key].lastPresentedOrdinal = 99; },
    p => { delete p.assessment.byTarget[key]; },
    p => { p.assessment.pending[key] = { ...p.assessment.suspendedPending[key] }; },
    p => { p.assessment.version = 1; },
  ];
  for (const mutate of invalids) {
    const bad = structuredClone(valid); mutate(bad);
    assert.throws(() => restore(bad, fillers), /学习评估/);
  }
});

test('zero-candidate obligations cannot create endless spacing or block course completion', () => {
  const profile = record(fresh(), first, 'removed-source'), snapshot = structuredClone(profile);
  assert.equal(plan(profile, [other, otherAlternate, ...fillers]), null, 'read-only runtime guard also handles not-yet-persisted reconciliation');
  assert.deepEqual(profile, snapshot);
  const paused = reconcile(profile, [other, otherAlternate, ...fillers]);
  assert.equal(summarizeUnifiedCourse(courses[0], components, paused.introducedKcIds, paused).complete, true);
  assert.equal(summarizeUnifiedCourse(courses[0], components, paused.introducedKcIds, paused).pendingCount, 0);
  assert.equal(paused.assessment.byTarget[assessmentTarget(first).key].independentCorrect, 0);
});

test('a removed oldest target does not starve a remaining compatible retest in adaptive or specialist mode', () => {
  const profile = gap(record(record(fresh(), first, 'removed'), other, 'remaining'));
  const catalog = [other, otherAlternate, ...fillers];
  for (const mode of ['adaptive', 'aspect']) {
    const selected = plan(profile, catalog, mode);
    assert.equal(selected.kind, 'retest');
    assert.equal(selected.pending.key, assessmentTarget(other).key);
    assert.equal(selected.exercise.id, otherAlternate.id);
  }
});

test('removing only the failed word retains its obligation and transfers through another word on the same path', () => {
  const profile = record(fresh(), first, 'removed-word'), key = assessmentTarget(first).key;
  const catalog = [second, third, ...fillers], updated = reconcile(profile, catalog);
  assert.deepEqual(updated.assessment.pending[key], profile.assessment.pending[key]);
  assert.deepEqual(updated.assessment.suspendedPending, {});
  const selected = plan(gap(updated), catalog);
  assert.equal(selected.kind, 'retest');
  assert.notEqual(selected.exercise.item.surface, first.item.surface);
  assert.equal(assessmentTarget(selected.exercise).key, key);
});

test('real observation flow keeps hint and step work auxiliary and clears only a spaced same-path original', () => {
  const catalog = [first, second, ...fillers], index = assessmentCatalog(catalog);
  let profile = applyLearningObservation(fresh(), first, { type: 'question', outcome: 'incorrect',
    questionId: 'observed-failure', eventId: 'observed-failure:event', at, failedKcId: 'onbin.sokuon' }, index).profile;
  const key = assessmentTarget(first).key, afterFailure = structuredClone(profile.byKc);
  profile = observe(profile, first, 'observed-failure-hint', catalog, true).profile;
  profile = applyLearningObservation(profile, first, { type: 'step', outcome: 'correct',
    questionId: 'observed-failure', eventId: 'observed-step', at,
    step: { kind: 'conjugation', form: 'negative', continuation: true, kcIds: ['stem.ichidan.drop-ru', 'suffix.negative'] } }, index).profile;
  profile = applyLearningObservation(profile, first, { type: 'diagnostic-end', outcome: 'completed',
    questionId: 'observed-failure', eventId: 'observed-end', at }, index).profile;
  assert.deepEqual(profile.byKc, afterFailure);
  assert.equal(profile.assessment.originalCount, 1);
  assert.equal(profile.assessment.byTarget[key].assistedStepCorrect, 1);
  assert.equal(profile.assessment.assistedByKc['suffix.negative'].correct, 1);
  assert.equal(profile.assessment.pending[key].lastPresentedOrdinal, 1);
  for (let i = 0; i < 2; i++) {
    const choice = plan(profile, catalog);
    assert.equal(choice.kind, 'spacing');
    assert.notEqual(assessmentTarget(choice.exercise).key, key);
    profile = observe(profile, choice.exercise, `observed-spacing-${i}`, catalog).profile;
  }
  const choice = plan(profile, catalog);
  assert.equal(choice.kind, 'retest');
  assert.equal(choice.exercise.id, second.id);
  const completed = observe(profile, choice.exercise, 'observed-independent', catalog);
  assert.equal(completed.support.independent, true);
  assert.equal(completed.profile.assessment.originalCount, 4);
  assert.equal(completed.profile.assessment.pending[key], undefined);
  assert.equal(completed.profile.assessment.byTarget[key].eligibleRetestCorrect, 1);
});

test('one remaining catalog word uses question spacing with no time delay and can finish its obligation', () => {
  const catalog = [first, ...fillers];
  let profile = reconcile(record(fresh(), first, 'one-failure'), catalog);
  assert.equal(plan(profile, catalog).kind, 'spacing');
  profile = gap(profile);
  const selected = plan(profile, catalog, 'aspect');
  assert.equal(selected.kind, 'retest');
  assert.equal(selected.exercise.id, first.id);
  assert.equal(selected.status.policy, 'single-word-spaced');
  assert.equal(selected.status.availableAt, null);
  assert.deepEqual(plan(profile, catalog, 'aspect', '2030-01-01T00:00:00Z'), selected);
  const completed = observe(profile, selected.exercise, 'one-retest', catalog);
  assert.equal(completed.support.independent, true);
  assert.deepEqual(completed.profile.assessment.pending, {});
});

test('two surviving words can recover after both were exposed without faking singleton transfer', () => {
  const catalog = [first, second, ...fillers];
  let profile = reconcile(record(fresh(), first, 'two-failure'), catalog);
  profile = observe(profile, second, 'two-hint', catalog, true).profile;
  profile = gap(profile);
  const rehearsal = plan(profile, catalog);
  assert.equal(rehearsal.kind, 'rehearsal');
  assert.equal(rehearsal.exercise.id, first.id);
  assert.equal(rehearsal.status.policy, 'different-word-spaced');
  const before = structuredClone(profile.byKc);
  const rehearsed = observe(profile, rehearsal.exercise, 'two-rehearsal', catalog);
  assert.equal(rehearsed.support.independent, false);
  assert.deepEqual(rehearsed.profile.byKc, before);
  profile = gap(rehearsed.profile);
  const retest = plan(profile, catalog);
  assert.equal(retest.kind, 'retest');
  assert.equal(retest.exercise.id, second.id);
  assert.deepEqual(observe(profile, second, 'two-retest', catalog).profile.assessment.pending, {});
});

test('three-word catalog retains transfer despite recency and never infers singleton from specialist filtering', () => {
  const laterThird = { ...third, courseId: 'later', id: `later:${third.id}` };
  const catalog = [first, second, laterThird, ...fillers];
  let profile = reconcile(record(fresh(), first, 'three-failure'), catalog);
  profile = observe(profile, second, 'three-hint', catalog, true).profile;
  profile = gap(profile);
  profile.recentWordKeys = catalog.map(e => `verb:${e.item.surface}`);
  const local = plan(profile, catalog, 'aspect');
  assert.equal(local.kind, 'spacing');
  assert.equal(local.exercise.courseId, 'classify');
  assert.deepEqual(reconcile(profile, catalog).assessment.suspendedPending, {}, 'locally unavailable does not mean globally removed');
  const adaptive = plan(profile, catalog);
  assert.equal(adaptive.kind, 'retest');
  assert.equal(adaptive.exercise.id, laterThird.id);
  assert.equal(adaptive.status.policy, 'different-word-spaced');
  assert.deepEqual(observe(profile, laterThird, 'three-retest', catalog).profile.assessment.pending, {});
});
