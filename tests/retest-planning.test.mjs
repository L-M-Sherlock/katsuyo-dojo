import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createServer } from 'vite';
import { planRetestQuestion } from '../app/lib/retest-planning.mjs';
import { assessmentCatalog, applyLearningObservation } from '../app/lib/learning-profile.mjs';
import { assessmentTarget, emptyAssessment, recordIndependentAttempt } from '../app/lib/learning-assessment.mjs';
import { UNIFIED_COURSES } from '../app/lib/unified-curriculum.mjs';

const at = '2026-09-09T02:00:00.000Z';
let server, model, catalog, options;
before(async () => {
  server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  ({ KNOWLEDGE: model } = await server.ssrLoadModule('/app/page.tsx'));
  catalog = assessmentCatalog(model.exercises);
  options = { exercises: model.exercises, components: model.components, courses: UNIFIED_COURSES, courseKcIds: model.courseKcIds, at };
});
after(async () => { await server?.close(); });

const get = (surface, form, courseId) => {
  const found = model.exercises.find(exercise => exercise.item.surface === surface && exercise.form === form && (!courseId || exercise.courseId === courseId));
  assert.ok(found, `missing actual exercise ${surface}/${form}/${courseId}`);
  return found;
};
const mastered = () => Object.fromEntries(model.components.map(kc => [kc.id, { attempts: 5, correct: 5, filteredAccuracy: 1,
  confidence: 1, bestConfidence: 1, cleanTimeCount: 0, cleanTimeTotal: 0 }]));
const fresh = (initial = false) => ({ assessment: emptyAssessment(), byKc: initial ? {} : mastered(),
  introducedKcIds: initial ? ['class.godan'] : model.components.filter(kc => kc.gating).map(kc => kc.id),
  accessibleCourseIds: initial ? [] : UNIFIED_COURSES.map(course => course.id), coursePractice: {}, recentWordKeys: [], rotation: 0 });
const record = (profile, exercise, id, correct = false, instant = at) => ({ ...profile,
  assessment: recordIndependentAttempt(profile.assessment, { exercise, questionId: id, correct, at: instant }) });
const gap = profile => [get('食べる', 'masu'), get('高い', 'adjectivePast')].reduce((state, exercise, index) => record(state, exercise, `filler-${profile.assessment.originalCount}-${index}`, true), profile);
const plan = (profile, mode = 'adaptive', extra = {}) => planRetestQuestion(profile, mode, { ...options, ...extra });

test('no pending work leaves normal planning in control', () => {
  assert.equal(plan(fresh()), null);
  assert.equal(plan({ ...fresh(), assessment: undefined }), null);
});

test('due retests precede fillers and preserve the whole rule path with a different word', () => {
  const failed = get('乗る', 'teiruNegative');
  const profile = gap(record(fresh(), failed, 'q1'));
  const before = structuredClone(profile);
  const choice = plan(profile);
  assert.equal(choice.kind, 'retest');
  assert.equal(choice.status.eligible, true);
  assert.equal(choice.exercise.form, failed.form);
  assert.equal(assessmentTarget(choice.exercise).key, assessmentTarget(failed).key);
  assert.notEqual(assessmentTarget(choice.exercise).wordKey, assessmentTarget(failed).wordKey);
  assert.deepEqual(profile, before, 'planning never mutates scores, pending or original count');
});

test('initial single introduced class can use the open classification course and return to a spaced retest', () => {
  const failed = get('書く', null, 'classify');
  let profile = record(fresh(true), failed, 'initial-failure');
  const first = plan(profile);
  assert.equal(first.kind, 'spacing');
  assert.equal(first.exercise.courseId, 'classify');
  assert.equal(first.exercise.form, null);
  assert.notEqual(assessmentTarget(first.exercise).key, assessmentTarget(failed).key);
  profile = applyLearningObservation(profile, first.exercise, { type: 'question', outcome: 'correct', questionId: 'initial-filler1', eventId: 'initial-filler1:event', at }, catalog).profile;
  const second = plan(profile);
  assert.equal(second.kind, 'spacing');
  assert.equal(second.exercise.courseId, 'classify');
  assert.notEqual(assessmentTarget(second.exercise).key, assessmentTarget(failed).key);
  profile = applyLearningObservation(profile, second.exercise, { type: 'question', outcome: 'correct', questionId: 'initial-filler2', eventId: 'initial-filler2:event', at }, catalog).profile;
  const retest = plan(profile);
  assert.equal(retest.kind, 'retest');
  assert.equal(retest.pending.key, assessmentTarget(failed).key);
  assert.equal(profile.assessment.originalCount, 3);
});

test('fillers protect only the oldest waiting target so multiple pending items cannot deadlock', () => {
  const sourceA = get('乗る', 'teiruNegative'), otherA = get('待つ', 'teiruNegative');
  const sourceB = get('読む', 'teiruNegative'), otherB = get('飲む', 'teiruNegative');
  const smallCatalog = [sourceA, otherA, sourceB, otherB];
  let profile = record(record(fresh(), sourceA, 'a'), sourceB, 'b');
  const waiting = profile.assessment.pending[assessmentTarget(sourceA).key];
  const first = plan(profile, 'aspect', { exercises: smallCatalog });
  assert.equal(first.kind, 'spacing');
  assert.equal(first.pending.key, waiting.key);
  assert.equal(assessmentTarget(first.exercise).key, assessmentTarget(sourceB).key, 'another pending target can fill the oldest target gap');
  profile = record(profile, first.exercise, 'spacing-b-again');
  const next = plan(profile, 'aspect', { exercises: smallCatalog });
  assert.equal(next.kind, 'retest');
  assert.equal(next.pending.key, waiting.key);
});

test('continually failing three actual targets rotate without starving the oldest due work', () => {
  const sources = [get('乗る', 'teiruNegative'), get('読む', 'teiruNegative'), get('書く', 'teiruNegative')];
  const alternatives = [get('待つ', 'teiruNegative'), get('飲む', 'teiruNegative'), get('聞く', 'teiruNegative')];
  const smallCatalog = [...sources, ...alternatives];
  let profile = sources.reduce((state, exercise, i) => record(state, exercise, `fail-${i}`), fresh());
  const served = new Map();
  for (let index = 0; index < 18; index++) {
    const choice = plan(profile, 'aspect', { exercises: smallCatalog });
    assert.equal(choice.kind, 'retest');
    served.set(choice.pending.key, (served.get(choice.pending.key) ?? 0) + 1);
    profile = record(profile, choice.exercise, `again-${index}`);
  }
  assert.equal(served.size, 3);
  assert.deepEqual([...served.values()], [6, 6, 6]);
});

test('specialist mode preserves unrelated pending and never inserts another domain retest', () => {
  const profile = gap(record(fresh(), get('乗る', 'teiruNegative'), 'verb-failure'));
  const before = structuredClone(profile.assessment.pending);
  assert.equal(plan(profile, 'adjectiveIBase'), null);
  assert.deepEqual(profile.assessment.pending, before);
  assert.equal(plan(profile, 'adaptive').kind, 'retest');
});

test('a specialist without local fillers uses an already-open basic classification exercise and its actual course id', () => {
  const failed = get('見る', 'potentialNegative', 'potential');
  const otherCatalogWord = get('食べる', 'potentialNegative', 'voiceCompound');
  const classification = get('書く', null, 'classify');
  const pool = [failed, otherCatalogWord, classification];
  let profile = record(fresh(), failed, 'specialist-failure');
  profile = { ...profile, accessibleCourseIds: ['potential', 'classify'], introducedKcIds: ['class.godan'] };
  const choice = plan(profile, 'potential', { exercises: pool });
  assert.equal(choice.kind, 'spacing');
  assert.equal(choice.exercise.id, classification.id);
  assert.equal(choice.exercise.courseId, 'classify', 'the caller must display actual filler course, not specialist mode');
  assert.equal(choice.exercise.form, null);
  const closedBasics = { ...profile, accessibleCourseIds: ['potential'], introducedKcIds: [] };
  assert.equal(plan(closedBasics, 'potential', { exercises: pool }).kind, 'waiting', 'no fallback course can be silently unlocked');
});

test('filtered specialist pools never manufacture singleton exceptions despite a long wait', () => {
  const failed = get('見る', 'potentialNegative', 'potential');
  const actualAlternate = get('食べる', 'potentialNegative', 'voiceCompound');
  const classification = get('書く', null, 'classify');
  const pool = [failed, actualAlternate, classification];
  const profile = gap(record(fresh(), failed, 'q1'));
  const specialist = plan(profile, 'potential', { exercises: pool, at: '2026-09-15T00:00:00Z' });
  assert.equal(specialist.kind, 'spacing');
  assert.equal(specialist.exercise.form, null);
  const adaptive = plan(profile, 'adaptive', { exercises: pool, at: '2026-09-15T00:00:00Z' });
  assert.equal(adaptive.kind, 'retest');
  assert.equal(adaptive.exercise.id, actualAlternate.id);
  assert.equal(adaptive.status.policy, 'different-word-spaced');
});

test('a true singleton remains waiting for 24 hours while other due targets can still run', () => {
  const iku = get('行く', 'past'), noru = get('乗る', 'teiruNegative');
  let profile = record(record(fresh(), iku, 'iku-failure'), noru, 'noru-failure');
  profile = gap(profile);
  const next = plan(profile, 'adaptive', { at: '2026-09-09T03:00:00Z' });
  assert.equal(next.kind, 'retest');
  assert.equal(next.pending.key, assessmentTarget(noru).key, 'not-yet-due singleton must not block a later eligible target');
  const isolated = gap(record(fresh(), iku, 'only-iku'));
  const early = plan(isolated, 'past', { at: '2026-09-10T01:59:59Z' });
  assert.equal(early.kind, 'spacing');
  const due = plan(isolated, 'past', { at: '2026-09-10T02:00:00Z' });
  assert.equal(due.kind, 'retest');
  assert.equal(due.exercise.item.surface, '行く');
  assert.equal(due.status.policy, 'single-word-delayed');
  assert.equal(due.status.availableAt, '2026-09-10T02:00:00.000Z');
});

test('a two-word rule recovers through explicitly unqualified rehearsal, two fillers, then transfer', () => {
  const firstWord = get('いい', 'adjectivePast'), secondWord = get('かっこいい', 'adjectivePast');
  const key = assessmentTarget(firstWord).key;
  assert.equal(catalog.get(key).words.size, 2, 'use the actual two-word いい-family catalog');
  let profile = gap(record(fresh(), firstWord, 'ii-failed'));
  profile = applyLearningObservation(profile, secondWord, { type: 'hint', outcome: 'shown', questionId: 'second-hinted', eventId: 'ii:hint', at }, catalog).profile;
  assert.equal(profile.assessment.pending[key].lastWordKey, assessmentTarget(firstWord).wordKey);
  assert.equal(profile.assessment.pending[key].lastPresentedWordKey, assessmentTarget(secondWord).wordKey);
  const early = plan(profile, 'adjectiveIBase');
  assert.equal(early.kind, 'spacing', 'a rehearsal cannot skip its own required interval');
  profile = gap(profile);
  const consolidation = plan(profile, 'adjectiveIBase');
  assert.equal(consolidation.kind, 'rehearsal');
  assert.equal(consolidation.exercise.id, firstWord.id, 'rehearse the failure source so the other word can later be assessed');
  assert.equal(consolidation.status.eligible, false);
  assert.equal(consolidation.status.policy, 'different-word-spaced', 'never relabel a two-word pool as singleton');
  const before = structuredClone(profile.byKc);
  const observation = applyLearningObservation(profile, consolidation.exercise, { type: 'question', outcome: 'correct', questionId: 'ii-consolidation', eventId: 'ii-consolidation:event', at }, catalog);
  assert.equal(observation.support.source, 'rehearsal');
  assert.equal(observation.profile.assessment.pending[key].failures, 1);
  assert.equal(observation.profile.assessment.byTarget[key].independentCorrect, 0);
  assert.equal(observation.profile.assessment.byTarget[key].assistedOriginalCorrect, 1);
  assert.deepEqual(observation.profile.byKc, before, 'consolidation never changes independent mastery');
  profile = observation.profile;
  assert.equal(plan(profile, 'adjectiveIBase').kind, 'spacing');
  profile = gap(profile);
  const transfer = plan(profile, 'adjectiveIBase');
  assert.equal(transfer.kind, 'retest');
  assert.equal(transfer.exercise.id, secondWord.id);
  const completed = applyLearningObservation(profile, transfer.exercise, { type: 'question', outcome: 'correct', questionId: 'ii-transfer', eventId: 'ii-transfer:event', at }, catalog);
  assert.equal(completed.support.independent, true);
  assert.equal(completed.profile.assessment.pending[key], undefined);
  assert.equal(completed.profile.assessment.byTarget[key].independentCorrect, 1);
});

test('filtered course access cannot manufacture the two-word exhaustion recovery', () => {
  const first = get('見る', 'potentialNegative', 'potential'), second = get('食べる', 'potentialNegative', 'potential');
  const third = get('教える', 'potentialNegative', 'voiceCompound'), basic = get('書く', null, 'classify');
  const completePool = [first, second, third, basic], registry = assessmentCatalog(completePool);
  let profile = gap(record(fresh(), first, 'first-failed'));
  profile = applyLearningObservation(profile, second, { type: 'hint', outcome: 'shown', questionId: 'second-hinted', eventId: 'three:hint', at }, registry).profile;
  profile = gap(profile);
  const restricted = plan(profile, 'potential', { exercises: completePool });
  assert.equal(restricted.kind, 'spacing');
  assert.equal(restricted.exercise.form, null);
  const unrestricted = plan(profile, 'adaptive', { exercises: completePool });
  assert.equal(unrestricted.kind, 'retest');
  assert.equal(unrestricted.exercise.id, third.id);
});

test('recency improves retest variety but cannot block all eligible questions', () => {
  const failed = get('乗る', 'teiruNegative');
  const profile = gap(record(fresh(), failed, 'q1'));
  const eligible = model.exercises.filter(exercise => assessmentTarget(exercise).key === assessmentTarget(failed).key);
  const everyWordRecent = { ...profile, recentWordKeys: eligible.map(exercise => `verb:${exercise.item.surface}`) };
  assert.equal(plan(everyWordRecent).kind, 'retest');
  const available = eligible.find(exercise => exercise.item.surface !== failed.item.surface);
  const mostlyRecent = { ...profile, recentWordKeys: eligible.filter(exercise => exercise.item.surface !== available.item.surface).map(exercise => `verb:${exercise.item.surface}`) };
  assert.equal(plan(mostlyRecent).exercise.item.surface, available.item.surface);
});

test('filler prerequisite gates apply even inside an open course', () => {
  const failed = get('乗る', 'teiruNegative'), blocked = { ...get('読む', 'teiruNegative'), prerequisites: ['never-introduced-rule'] };
  const classification = get('書く', null, 'classify');
  const profile = record(fresh(), failed, 'q1');
  const choice = plan(profile, 'aspect', { exercises: [failed, blocked, classification] });
  assert.equal(choice.kind, 'spacing');
  assert.equal(choice.exercise, classification);
});
