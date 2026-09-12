import assert from 'node:assert/strict';
import test from 'node:test';
import { appendPracticeEvent, emptyPracticeLog, parsePracticeLog, PRACTICE_LOG_LIMIT, PRACTICE_LOG_MAX_CHARS } from '../app/lib/practice-log.mjs';
import { emptySkillStats, updateKnowledgeStats } from '../app/lib/adaptive.mjs';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { planDiagnosticTransition } from '../app/lib/diagnostic-session.mjs';
import { parseUnifiedImport, createUnifiedExport } from '../app/lib/unified-profile.mjs';
import { createProfileStore } from '../app/lib/profile-store.mjs';
import { emptyAssessment, assessmentTarget } from '../app/lib/learning-assessment.mjs';
import { applyLearningObservation } from '../app/lib/learning-profile.mjs';

const item = { domain: 'verb', surface: '増える', reading: 'ふえる', class: 'ichidan' };
const exercise = { id: 'test:tagaruNegative:増える', courseId: 'tagaru', form: 'tagaruNegative', surface: item.surface, reading: item.reading, wordClass: item.class, domain: item.domain };
const target = { surface: item.surface, reading: item.reading, form: exercise.form, label: 'たがる・否定形', kind: 'question',
  kcIds: ['stem.godan.a'], answers: ['増えたがらない'], readings: ['ふえたがらない'], stepIndex: null, totalSteps: 0, nextTotalSteps: 2 };
const profile = () => ({ version: 6, curriculumVersion: 3, date: '2026-09-08', attempted: 0, correct: 0, streak: 0, rotation: 0,
  byKc: {}, introducedKcIds: [], accessibleCourseIds: [], coursePractice: {}, recentWordKeys: [], legacy: null, migration: null, practiceLog: emptyPracticeLog() });
const detail = overrides => ({ questionId: 'question-1', type: 'question', outcome: 'incorrect', exercise, target, answer: 'ふえたがない', at: '2026-09-08T14:13:31.000Z', ...overrides });

test('logs the supplied 増える example with exact per-step writes and unchanged original totals', () => {
  let current = profile();
  const original = createAnswerAnalyzer(item, exercise.form)('ふえたがない');
  current = appendPracticeEvent(current, { ...current, attempted: 1 }, detail({ id: 'original' }));
  assert.deepEqual(current.practiceLog.events[0].changes, []);
  let steps = original.steps, evaluated = [], examined = [];
  const inputs = ['ふえたがる', 'ふせたがれない', 'ふえたがら', 'ふえたがらない'];
  const expected = [['class.ichidan', 'heuristic.ru-ie', 'stem.ichidan.drop-ru', 'construction.tagaru'], [], ['stem.godan.a'], ['suffix.negative']];
  for (const [index, answer] of inputs.entries()) {
    const step = steps[index], analysis = createAnswerAnalyzer(item, exercise.form, { step })(answer);
    const transition = planDiagnosticTransition(steps, index, analysis, evaluated, examined);
    const byKc = updateKnowledgeStats(current.byKc, { kcIds: transition.assessed.kcIds, correct: analysis.kind === 'correct',
      failedKcId: analysis.diagnosis?.kcId ?? null, confirmedKcIds: analysis.diagnosis?.confirmedKcIds ?? [] });
    current = appendPracticeEvent(current, { ...current, byKc }, detail({ id: `step-${index}`, type: 'step', outcome: analysis.kind, answer,
      target: { ...target, surface: step.surface, reading: step.reading, form: step.form, kind: step.kind ?? 'conjugation',
        label: step.targetLabel ?? step.form, kcIds: transition.assessed.kcIds, answers: step.answers, readings: step.readings,
        stepIndex: index + 1, totalSteps: steps.length, nextTotalSteps: transition.nextSteps.length },
      diagnosis: { kcId: analysis.diagnosis?.kcId, confirmedKcIds: analysis.diagnosis?.confirmedKcIds, message: analysis.feedback?.message } }));
    const event = current.practiceLog.events.at(-1);
    assert.deepEqual(event.changes.map(c => c.kcId), expected[index]);
    for (const change of event.changes) {
      assert.equal(change.before, null);
      assert.equal(change.after.attempts, 1); assert.equal(change.after.correct, 1);
    }
    assert.deepEqual(event.totals.before, event.totals.after);
    steps = transition.nextSteps; evaluated = transition.evaluated; examined = transition.examined;
  }
  assert.equal(current.practiceLog.events[2].answer, 'ふせたがれない');
  assert.equal(current.practiceLog.events[2].target.totalSteps, 2);
  assert.equal(current.practiceLog.events[2].target.nextTotalSteps, 4);
  current = appendPracticeEvent(current, current, detail({ type: 'diagnostic-end', outcome: 'completed', answer: '', id: 'done' }));
  assert.equal(current.practiceLog.events.length, 6);
  assert.deepEqual(current.practiceLog.events.map(e => e.sequence), [1, 2, 3, 4, 5, 6]);
  assert.equal(new Set(current.practiceLog.events.map(e => e.questionId)).size, 1);
  assert.deepEqual(current.practiceLog.events.at(-1).changes, []);
  assert.equal(current.attempted, 1); assert.equal(current.correct, 0);
  assert.equal(current.byKc['apply.tagaru.continuation'], undefined);
});

test('snapshots are immutable, include decreases, and compare values rather than object identity', () => {
  const before = profile();
  before.byKc.a = { ...emptySkillStats(), attempts: 5, correct: 5, filteredAccuracy: 1, confidence: 1, bestConfidence: 1 };
  const byKc = updateKnowledgeStats(before.byKc, { kcIds: ['a'], correct: false, failedKcId: 'a' });
  const logged = appendPracticeEvent(before, { ...before, byKc }, detail({ id: 'bad' }), id => `知识点 ${id}`);
  assert.equal(logged.practiceLog.events[0].changes[0].label, '知识点 a');
  assert.equal(logged.practiceLog.events[0].changes[0].after.correct, 5);
  assert.ok(logged.practiceLog.events[0].changes[0].after.confidence < 1);
  byKc.a.attempts = 999; before.byKc.a.correct = 0;
  assert.equal(logged.practiceLog.events[0].changes[0].before.correct, 5);
  assert.equal(logged.practiceLog.events[0].changes[0].after.attempts, 6);
  assert.equal(before.practiceLog.events.length, 0);
  const same = appendPracticeEvent(logged, { ...logged, byKc: structuredClone(logged.byKc) }, detail({ id: 'same' }));
  assert.deepEqual(same.practiceLog.events.at(-1).changes, []);
  assert.equal(appendPracticeEvent(same, { ...same, attempted: 99 }, detail({ id: 'same' })), same, 'retrying one operation cannot add a score without a log');
});

test('unscored retries preserve raw text and explicitly mark oversized input truncation', () => {
  const initial = profile(), answer = ' あ'.repeat(160);
  const logged = appendPracticeEvent(initial, initial, detail({ outcome: 'invalid', answer }));
  const event = logged.practiceLog.events[0];
  assert.equal(event.answer, answer.slice(0, 256)); assert.equal(event.answerLength, 320); assert.equal(event.answerTruncated, true);
  assert.deepEqual(event.changes, []); assert.deepEqual(event.totals.before, event.totals.after);
  assert.deepEqual(parsePracticeLog(logged.practiceLog), logged.practiceLog);
});

test('retention bounds both record count and serialized capacity, exposing how many records were dropped', () => {
  let current = profile();
  for (let i = 0; i < PRACTICE_LOG_LIMIT + 4; i++) current = appendPracticeEvent(current, current, detail({ id: `small-${i}` }));
  assert.equal(current.practiceLog.events.length, PRACTICE_LOG_LIMIT);
  assert.equal(current.practiceLog.droppedEntries, 4);
  assert.equal(current.practiceLog.events[0].sequence, 5);
  for (let i = 0; i < 200; i++) current = appendPracticeEvent(current, current, detail({ id: `large-${i}`, diagnosis: { message: '长'.repeat(4000) } }));
  assert.ok(JSON.stringify(current.practiceLog).length <= PRACTICE_LOG_MAX_CHARS);
  assert.equal(current.practiceLog.events.at(-1).id, 'large-199');
  assert.equal(current.practiceLog.totalEvents, current.practiceLog.droppedEntries + current.practiceLog.events.length);
  assert.deepEqual(parsePracticeLog(current.practiceLog), current.practiceLog);
});

test('versioned exports and imports preserve logs as history without replaying them into authoritative current scores', () => {
  const initial = profile(), byKc = { 'stem.godan.a': { ...emptySkillStats(), attempts: 1, correct: 1, confidence: .23529411764705885, bestConfidence: .23529411764705885, filteredAccuracy: 1 } };
  const logged = { ...appendPracticeEvent(initial, { ...initial, byKc }, detail()), version: 7, assessment: emptyAssessment() };
  const options = { today: initial.date, components: [{ id: 'stem.godan.a', prerequisites: [] }], legacyComponents: [] };
  const exported = createUnifiedExport(logged);
  assert.equal(exported.formatVersion, 5);
  const restored = parseUnifiedImport(exported, options);
  assert.deepEqual(restored.practiceLog, logged.practiceLog);
  assert.equal(restored.byKc['stem.godan.a'].attempts, 1);
  const archived = parseUnifiedImport(createUnifiedExport({ ...logged, byKc: {} }), options);
  assert.deepEqual(archived.byKc, {}); assert.deepEqual(archived.practiceLog, logged.practiceLog);
  const old = { ...initial }; delete old.practiceLog;
  for (const source of [old, { format: 'katsuyo-dojo-profile', formatVersion: 3, profile: old }]) {
    const migrated = parseUnifiedImport(source, options);
    assert.equal(migrated.practiceLog.events.length, 1);
    assert.equal(migrated.practiceLog.events[0].type, 'migration');
    assert.equal(migrated.assessment.migration.originalLog.totalEvents, 0);
    assert.deepEqual(migrated.assessment.independentByKc, {});
  }
});

test('malformed history cannot silently discard evidence or be restored as valid events', () => {
  const p = profile(), valid = appendPracticeEvent(p, p, detail()).practiceLog;
  for (const mutate of [
    x => { x.version = 3; }, x => { x.totalEvents = 2; }, x => { x.events[0].at = 'not-a-date'; },
    x => { x.events[0].sequence = 7; }, x => { x.events[0].answerLength = 0; },
    x => { x.events[0].outcome = 'invented'; }, x => { x.events[0].changes = [{ kcId: 'a', label: 'a', before: {}, after: {} }]; },
  ]) {
    const bad = structuredClone(valid); mutate(bad);
    assert.throws(() => parsePracticeLog(bad), /作答日志/);
  }
  const duplicated = { ...valid, totalEvents: 2, events: [valid.events[0], { ...valid.events[0], sequence: 2 }] };
  assert.throws(() => parsePracticeLog(duplicated), /作答日志/);
});

test('scores and their log use one atomic store write, and a conflict publishes neither', async () => {
  let raw = JSON.stringify(profile()), writes = 0;
  const storage = { getItem: () => raw, setItem: (_key, value) => { raw = value; writes++; } };
  const store = createProfileStore(() => storage, 'profile', callback => callback());
  const before = JSON.parse(store.read().raw), byKc = updateKnowledgeStats({}, { kcIds: ['stem.godan.a'], correct: true });
  const next = appendPracticeEvent(before, { ...before, byKc }, detail());
  assert.equal(await store.save(next), 'saved'); assert.equal(writes, 1);
  assert.equal(JSON.parse(raw).practiceLog.events.length, 1); assert.equal(JSON.parse(raw).byKc['stem.godan.a'].attempts, 1);
  const external = JSON.stringify({ ...next, rotation: 9 }); raw = external;
  assert.equal(await store.save(appendPracticeEvent(next, next, detail())), 'conflict');
  assert.equal(writes, 1); assert.equal(raw, external);
});

function guidedLog() {
  const assessmentExercise = { id: exercise.id, courseId: exercise.courseId, form: exercise.form, item };
  const initial = { ...profile(), version: 7, assessment: emptyAssessment() };
  const original = applyLearningObservation(initial, assessmentExercise, { type: 'question', outcome: 'incorrect',
    questionId: 'question-1', eventId: 'original', at: '2026-09-08T14:13:31.000Z' });
  let current = appendPracticeEvent(initial, { ...original.profile, attempted: 1 }, detail({ id: 'original',
    support: original.support, assessmentKey: assessmentTarget(assessmentExercise).key, eligibility: original.retest }));
  const step = { kind: 'conjugation', form: 'tagaru', kcIds: ['stem.ichidan.drop-ru', 'construction.tagaru'] };
  const assisted = applyLearningObservation(current, assessmentExercise, { type: 'step', outcome: 'correct',
    questionId: 'question-1', eventId: 'guided', at: '2026-09-08T14:14:00.000Z', step });
  const before = current;
  current = appendPracticeEvent(before, assisted.profile, detail({ id: 'guided', type: 'step', outcome: 'correct',
    at: '2026-09-08T14:14:00.000Z', answer: 'ふえたがる', target: { ...target, ...step },
    support: assisted.support, assessmentKey: assessmentTarget(assessmentExercise).key, eligibility: assisted.retest }));
  return { initial, before, current };
}

test('v2 records assistance, local practice changes and pending snapshots without aliasing the live profile', () => {
  const { before, current } = guidedLog(), event = current.practiceLog.events.at(-1);
  assert.equal(current.practiceLog.version, 2);
  assert.deepEqual(event.changes, []);
  assert.deepEqual(event.assistedChanges.map(change => change.kcId), ['stem.ichidan.drop-ru', 'construction.tagaru']);
  assert.deepEqual(event.support, { independent: false, source: 'guided', provided: ['subgoal'] });
  assert.equal(event.assessment.before.pending, true);
  assert.equal(event.assessment.after.pending, true);
  assert.equal(event.assessment.after.assistedStepCorrect, 1);
  assert.equal(event.assessment.after.independentCorrect, 0);
  assert.equal(event.assessment.eligibility.reason, 'same-word');
  assert.deepEqual(parsePracticeLog(current.practiceLog), current.practiceLog);
  current.assessment.assistedByKc['construction.tagaru'].correct = 999;
  assert.equal(event.assistedChanges.find(change => change.kcId === 'construction.tagaru').after.correct, 1);
  assert.equal(before.assessment.assistedByKc['construction.tagaru'], undefined);
});

test('legacy v1 events remain intact when a new v2 event is appended', () => {
  const { before } = guidedLog();
  const legacy = structuredClone(before);
  legacy.practiceLog.version = 1;
  for (const event of legacy.practiceLog.events) {
    delete event.assessment; delete event.assistedChanges; delete event.support;
  }
  assert.deepEqual(parsePracticeLog(legacy.practiceLog), legacy.practiceLog);
  const appended = appendPracticeEvent(legacy, legacy, detail({ type: 'diagnostic-end', outcome: 'skipped', id: 'skip',
    support: { independent: false, source: 'completion', provided: ['answer'] } }));
  assert.equal(appended.practiceLog.version, 2);
  assert.deepEqual(appended.practiceLog.events[0], legacy.practiceLog.events[0]);
  assert.equal(appended.practiceLog.events.length, 2);
});

test('v2 rejects contradictory help conditions, impossible target counts and malformed pending clocks', () => {
  const valid = guidedLog().current.practiceLog;
  const mutations = [
    event => { event.support.independent = true; },
    event => { event.support.source = 'invented'; },
    event => { event.support.provided = ['subgoal', 'subgoal']; },
    event => { event.support.provided = ['unknown-help']; },
    event => { event.assistedChanges.push(event.assistedChanges[0]); },
    event => { event.assistedChanges[0].after.correct = 99; },
    event => { event.assessment.after.assistedStepCorrect = 99; },
    event => { event.assessment.after.independentCorrect = 1; },
    event => { event.assessment.after.lastPresentedAt = 'bad-date'; },
    event => { event.assessment.after.lastPresentedAt = '2020-01-01T00:00:00Z'; },
    event => { event.assessment.after.pending = false; },
    event => { event.assessment.targetKey = ''; },
    event => { event.assessment.eligibility.eligible = true; },
    event => { event.assessment.eligibility.policy = 'invented'; },
    event => { event.assessment.eligibility.availableAt = 'bad-date'; },
    event => { event.outcome = 'migrated'; },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const copy = structuredClone(valid); mutate(copy.events.at(-1));
    assert.throws(() => parsePracticeLog(copy), /作答日志/, `mutation ${index}`);
  }
});

test('a lexical-only retry marker is compatible with independent grammar evidence, unlike a provided hint', () => {
  const before = profile();
  const logged = appendPracticeEvent(before, before, detail({ outcome: 'correct', support: { independent: true, source: 'independent', provided: ['lexical-retry'] } }));
  assert.deepEqual(parsePracticeLog(logged.practiceLog), logged.practiceLog);
  const bad = structuredClone(logged.practiceLog);
  bad.events[0].support.provided.push('hint');
  assert.throws(() => parsePracticeLog(bad), /作答日志/);
});

test('v2 retention counts assistance and assessment fields toward the size limit and preserves the retained tail exactly', () => {
  const current = guidedLog().current;
  const original = structuredClone(current.practiceLog.events.at(-1));
  const entries = [];
  for (let index = 0; index < 210; index++) {
    const event = { ...structuredClone(original), id: `size-${index}`, sequence: index + 1,
      diagnosis: { ...original.diagnosis, message: '帮助条件与待复测状态。'.repeat(300) } };
    entries.push(event);
  }
  const parsed = parsePracticeLog({ version: 2, totalEvents: entries.length, droppedEntries: 0, events: entries });
  assert.ok(JSON.stringify(parsed).length <= PRACTICE_LOG_MAX_CHARS);
  assert.ok(parsed.droppedEntries > 0);
  assert.deepEqual(parsed.events, entries.slice(parsed.droppedEntries));
  assert.deepEqual(parsePracticeLog(parsed), parsed);
});


test('reviewed question context survives export parsing without counting as a hint', () => {
  const context = { id: 'verb:降る:passive:v1', text: '有人外出时遇上降雨，描述这件事对他的影响。', reviewVersion: 1 };
  const before = profile();
  const after = appendPracticeEvent(before, before, detail({ exercise: { ...exercise, context },
    support: { independent: true, source: 'independent', provided: [] } }));
  const restored = parsePracticeLog(JSON.parse(JSON.stringify(after.practiceLog)));
  assert.deepEqual(restored.events[0].exercise.context, context);
  assert.equal(restored.events[0].hintUsed, false);
  assert.equal(restored.events[0].support.independent, true);
  context.text = '后续修改';
  assert.notEqual(restored.events[0].exercise.context.text, context.text);
  const invalid = structuredClone(after.practiceLog);
  invalid.events[0].exercise.context.reviewVersion = 0;
  assert.throws(() => parsePracticeLog(invalid));
});
