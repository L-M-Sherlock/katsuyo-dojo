import { CURRICULUM_VERSION } from '../app/lib/unified-curriculum.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createServer } from 'vite';
import { parseUnifiedImport, createUnifiedExport, UNIFIED_STORAGE_KEY, LEGACY_STORAGE_KEY, LEGACY_V5_STORAGE_KEY } from '../app/lib/unified-profile.mjs';
import { createProfileStore } from '../app/lib/profile-store.mjs';
import { assessmentTarget, emptyAssessment, recordIndependentAttempt } from '../app/lib/learning-assessment.mjs';
import { appendPracticeEvent, emptyPracticeLog, parsePracticeLog } from '../app/lib/practice-log.mjs';
import { applyLearningObservation } from '../app/lib/learning-profile.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';

const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
let page;
try { page = await server.ssrLoadModule('/app/page.tsx'); } finally { await server.close(); }
const options = { today: '2026-09-09', at: '2026-09-09T12:00:00.000Z', components: page.KNOWLEDGE.components,
  legacyComponents: [...page.VERB_KNOWLEDGE.components, ...page.ADJECTIVE_KNOWLEDGE.components], exercises: page.KNOWLEDGE.exercises };
const frozen = JSON.parse(await readFile(new URL('./fixtures/independent-learning-evidence.json', import.meta.url), 'utf8'));
const find = (surface, form) => options.exercises.find(exercise => exercise.item.surface === surface && exercise.form === form);

function legacyNoru() {
  const events = frozen.sourceExport.observedLatestQuestion.map(event => ({ ...structuredClone(event),
    id: `real-legacy-${event.sequence}`, questionId: 'real-legacy-noru', answerLength: Array.from(event.answer).length, answerTruncated: false }));
  const byKc = {};
  for (const event of events) for (const change of event.changes) {
    if (change.after === null) delete byKc[change.kcId]; else byKc[change.kcId] = structuredClone(change.after);
  }
  return { version: 6, curriculumVersion: 3, date: '2026-09-09', attempted: 9, correct: 7, streak: 0, rotation: 2,
    byKc, introducedKcIds: ['class.godan'], accessibleCourseIds: ['aspect'], coursePractice: {}, recentWordKeys: ['verb:乗る'],
    practiceLog: { version: 1, totalEvents: 20, droppedEntries: 16, events }, legacy: null, migration: null };
}

test('v6 real-log suffix migrates to v7 with one correction event and intact historical rows', () => {
  const old = legacyNoru(), before = structuredClone(old);
  const migrated = parseUnifiedImport({ format: 'katsuyo-dojo-profile', formatVersion: 4, profile: old }, options);
  assert.deepEqual(old, before);
  assert.equal(migrated.version, 7);
  assert.equal(migrated.assessment.version, 2);
  assert.equal(migrated.practiceLog.version, 2);
  assert.equal(migrated.practiceLog.totalEvents, 21);
  assert.equal(migrated.practiceLog.droppedEntries, 16);
  assert.deepEqual(migrated.practiceLog.events.slice(0, 4), old.practiceLog.events);
  assert.equal(migrated.byKc['apply.teiru.continuation'].attempts, 2);
  assert.equal(migrated.byKc['apply.teiru.continuation'].correct, 2);
  assert.equal(migrated.byKc['facet.apply.teiru.negative'], undefined);
  assert.equal(migrated.assessment.assistedByKc['suffix.negative'].correct, 1);
  assert.equal(migrated.assessment.assistedByKc['apply.teiru.continuation'], undefined);
  assert.ok(migrated.assessment.pending[assessmentTarget(find('乗る', 'teiruNegative')).key]);
  const migration = migrated.practiceLog.events.at(-1);
  assert.equal(migration.type, 'migration'); assert.equal(migration.outcome, 'migrated');
  assert.deepEqual(migration.support, { independent: false, source: 'migration', provided: [] });
  assert.deepEqual(migration.totals.before, migration.totals.after);
  assert.equal(migration.changes.find(change => change.kcId === 'apply.teiru.continuation').before.attempts, 3);
  assert.equal(migration.changes.find(change => change.kcId === 'apply.teiru.continuation').after.attempts, 2);
  assert.equal(migration.assistedChanges.find(change => change.kcId === 'suffix.negative').after.correct, 1);
  assert.equal(migrated.assessment.migration.throughSequence, 20);
  assert.equal(migrated.attempted, 9); assert.equal(migrated.correct, 7);
});

test('export format v5 roundtrips v7 exactly and does not append or replay another migration event', () => {
  const migrated = parseUnifiedImport(legacyNoru(), options);
  const exported = createUnifiedExport(migrated, options.at);
  assert.equal(exported.formatVersion, 5);
  for (let count = 0; count < 3; count++) {
    const restored = parseUnifiedImport(exported, options);
    assert.deepEqual(restored, migrated);
    assert.equal(restored.practiceLog.events.filter(event => event.type === 'migration').length, 1);
    assert.equal(restored.assessment.migration.at, options.at);
  }
});

test('a completed versioned retest stays completed despite the retained original-failure log', () => {
  let migrated = parseUnifiedImport(legacyNoru(), options);
  let assessment = migrated.assessment;
  for (const [index, exercise] of [find('食べる', 'masu'), find('高い', 'adjectivePast'), find('待つ', 'teiruNegative')].entries()) {
    assessment = recordIndependentAttempt(assessment, { exercise, questionId: `later-${index}`, correct: true, at: options.at });
  }
  migrated = { ...migrated, assessment };
  assert.deepEqual(assessment.pending, {});
  const restored = parseUnifiedImport(createUnifiedExport(migrated), options);
  assert.deepEqual(restored, migrated);
  assert.equal(restored.practiceLog.totalEvents, 21);
});

test('cross-day restore resets only daily counts and preserves independent chronology, pending and original logs', () => {
  const migrated = parseUnifiedImport(legacyNoru(), options);
  const nextDay = parseUnifiedImport(createUnifiedExport(migrated), { ...options, today: '2026-09-10' });
  assert.equal(nextDay.attempted, 0); assert.equal(nextDay.correct, 0); assert.equal(nextDay.streak, 0);
  assert.equal(nextDay.date, '2026-09-10');
  assert.deepEqual(nextDay.assessment, migrated.assessment);
  assert.deepEqual(nextDay.byKc, migrated.byKc);
  assert.deepEqual(nextDay.practiceLog, migrated.practiceLog);
});

test('v7 strict restore rejects damaged authoritative scores instead of clamping or silently falling back to old history', () => {
  const migrated = parseUnifiedImport(legacyNoru(), options);
  const invalids = [
    value => { delete value.assessment; },
    value => { value.assessment.version = 3; },
    value => { value.byKc['apply.teiru.continuation'].confidence = 3; },
    value => { value.byKc['apply.teiru.continuation'].correct = 99; },
    value => { value.byKc['unknown-kc'] = value.byKc['apply.teiru.continuation']; },
  ];
  for (const mutate of invalids) {
    const invalid = structuredClone(migrated); mutate(invalid);
    assert.throws(() => parseUnifiedImport(createUnifiedExport(invalid), options));
  }
  assert.throws(() => parseUnifiedImport({ format: 'katsuyo-dojo-profile', formatVersion: 6, profile: migrated }, options));
});

test('old cumulative-only profiles retain their history and explicitly log the limits of reconstruction', () => {
  const old = legacyNoru(); delete old.practiceLog;
  const migrated = parseUnifiedImport(old, options);
  assert.deepEqual(migrated.byKc, old.byKc);
  assert.deepEqual(migrated.assessment.independentByKc, {});
  assert.deepEqual(migrated.assessment.pending, {});
  assert.ok(migrated.assessment.migration.uncertain.some(entry => entry.reason === 'no-practice-log'));
  assert.equal(migrated.practiceLog.events.length, 1);
  assert.equal(migrated.practiceLog.events[0].changes.length, 0);
  assert.deepEqual(parseUnifiedImport(createUnifiedExport(migrated), options), migrated);
});

test('actual removed する passive-desire path suspends on import without losing history or other pending targets', () => {
  const item = { domain: 'verb', surface: 'する', reading: 'する', class: 'irregular' };
  const removed = { id: 'multiStepCompound:passiveDesireNegativePast:する', courseId: 'multiStepCompound',
    item, form: 'passiveDesireNegativePast', kcIds: deriveUnified(item, 'passiveDesireNegativePast').requiredKcIds };
  const key = assessmentTarget(removed).key;
  assert.equal(options.exercises.some(e => assessmentTarget(e).key === key), false, 'the revised catalog has no regular practice context for this actual old target');
  const source = parseUnifiedImport(legacyNoru(), options);
  source.assessment = recordIndependentAttempt(source.assessment, { exercise: removed, questionId: 'removed-actual-target', correct: false, at: options.at });
  source.assessment.version = 1; delete source.assessment.suspendedPending;
  const before = structuredClone(source), restored = parseUnifiedImport(createUnifiedExport(source), options);
  assert.deepEqual(source, before);
  assert.deepEqual(restored.byKc, source.byKc);
  assert.deepEqual(restored.practiceLog, source.practiceLog);
  assert.equal(restored.assessment.originalCount, source.assessment.originalCount);
  assert.deepEqual(restored.assessment.byTarget, source.assessment.byTarget);
  assert.equal(restored.assessment.pending[key], undefined);
  assert.equal(restored.assessment.suspendedPending[key].suspension.reason, 'no-eligible-exercise');
  assert.ok(restored.assessment.pending[assessmentTarget(find('乗る', 'teiruNegative')).key]);
  assert.deepEqual(parseUnifiedImport(createUnifiedExport(restored), options), restored);
  const resumed = parseUnifiedImport(createUnifiedExport(restored), { ...options, exercises: [...options.exercises, removed] });
  assert.deepEqual(resumed.assessment.pending[key], source.assessment.pending[key]);
  assert.equal(resumed.assessment.suspendedPending[key], undefined);
});

test('legacy v4 and v5 remain importable without claiming unseen independent observations', () => {
  const old = { version: 4, date: options.today, attempted: 4, correct: 3, streak: 0, rotation: 2, bySkill: {} };
  for (const source of [old, { ...old, version: 5, byKc: {}, introducedKcIds: [] }]) {
    const migrated = parseUnifiedImport(source, options);
    assert.equal(migrated.version, 7);
    assert.equal(migrated.attempted, 4);
    assert.deepEqual(migrated.assessment.independentByKc, {});
    assert.equal(migrated.assessment.originalCount, 0);
    assert.equal(migrated.practiceLog.events.length, 1);
    assert.deepEqual(parseUnifiedImport(createUnifiedExport(migrated), options), migrated);
  }
});

test('saving a migrated v7 profile uses its new key and leaves both v6 and v5 stored snapshots intact', async () => {
  const source = legacyNoru(), raw = JSON.stringify(source), oldV5 = JSON.stringify({ version: 5 });
  const values = new Map([[LEGACY_STORAGE_KEY, raw], [LEGACY_V5_STORAGE_KEY, oldV5]]), writes = [];
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { writes.push(key); values.set(key, value); } };
  assert.equal(UNIFIED_STORAGE_KEY, 'katsuyo-practice-profile-v7');
  assert.equal(LEGACY_STORAGE_KEY, 'katsuyo-practice-profile-v6');
  const store = createProfileStore(() => storage, UNIFIED_STORAGE_KEY, callback => callback());
  assert.equal(store.read().raw, null);
  const migrated = parseUnifiedImport(JSON.parse(storage.getItem(LEGACY_STORAGE_KEY)), options);
  assert.equal(await store.save(migrated), 'saved');
  assert.deepEqual(writes, [UNIFIED_STORAGE_KEY]);
  assert.equal(values.get(LEGACY_STORAGE_KEY), raw);
  assert.equal(values.get(LEGACY_V5_STORAGE_KEY), oldV5);
  assert.deepEqual(parseUnifiedImport(JSON.parse(values.get(UNIFIED_STORAGE_KEY)), options), migrated);
});

test('omitting the optional migration clock produces a valid current timestamp', () => {
  const noClock = { ...options }; delete noClock.at;
  const start = Date.now();
  const migrated = parseUnifiedImport({ ...legacyNoru(), practiceLog: emptyPracticeLog() }, noClock);
  assert.ok(Date.parse(migrated.assessment.migration.at) >= start);
  assert.ok(Date.parse(migrated.assessment.migration.at) <= Date.now());
});

function hintOnlyProfile() {
  const old = legacyNoru(), exercise = find('乗る', 'teiruNegative');
  const initial = { ...old, version: 7, curriculumVersion: CURRICULUM_VERSION, assessment: emptyAssessment(), byKc: {}, attempted: 0, correct: 0,
    introducedKcIds: [], practiceLog: emptyPracticeLog() };
  const observation = applyLearningObservation(initial, exercise, { type: 'hint', outcome: 'shown', questionId: 'unsubmitted', eventId: 'hint', at: options.at });
  return appendPracticeEvent(initial, observation.profile, { id: 'hint', type: 'hint', outcome: 'shown', questionId: 'unsubmitted', at: options.at,
    hintUsed: true, support: observation.support, assessmentKey: assessmentTarget(exercise).key, eligibility: observation.retest,
    exercise: old.practiceLog.events[0].exercise, target: old.practiceLog.events[0].target });
}

test('a displayed hint is persisted before submission and remains pending through v7 export and repeated restore', () => {
  const hinted = hintOnlyProfile(), exercise = find('乗る', 'teiruNegative'), key = assessmentTarget(exercise).key;
  const event = hinted.practiceLog.events[0];
  assert.equal(event.type, 'hint'); assert.equal(event.outcome, 'shown');
  assert.deepEqual(event.changes, []); assert.deepEqual(event.assistedChanges, []);
  assert.equal(event.support.source, 'hinted'); assert.equal(event.hintUsed, true);
  assert.equal(event.assessment.before.pending, false); assert.equal(event.assessment.after.pending, true);
  assert.equal(event.assessment.after.lastFailureAt, null);
  assert.equal(event.assessment.after.independentAttempts, 0);
  assert.deepEqual(event.totals.before, event.totals.after);
  let restored = parseUnifiedImport(createUnifiedExport(hinted), options);
  assert.deepEqual(restored, hinted);
  restored = parseUnifiedImport(createUnifiedExport(restored), options);
  assert.deepEqual(restored, hinted);
  assert.equal(restored.assessment.pending[key].failures, 0);
  const afterRefresh = applyLearningObservation(restored, exercise, { type: 'question', outcome: 'correct', questionId: 'after-refresh', eventId: 'answer', at: options.at });
  assert.equal(afterRefresh.support.source, 'rehearsal');
  assert.equal(afterRefresh.profile.assessment.byTarget[key].independentCorrect, 0);
  assert.ok(afterRefresh.profile.assessment.pending[key]);
  assert.deepEqual(afterRefresh.profile.byKc, {});
  assert.deepEqual(parseUnifiedImport(createUnifiedExport(afterRefresh.profile), options), afterRefresh.profile);
});

test('hint log validation rejects invented scoring, missing help conditions and fabricated failures', () => {
  const valid = hintOnlyProfile().practiceLog;
  const phantom = { kcId: 'suffix.negative', label: '否定', before: null,
    after: { attempts: 1, correct: 1, filteredAccuracy: 1, confidence: 0.23529411764705885, bestConfidence: 0.23529411764705885, cleanTimeTotal: 0, cleanTimeCount: 0 } };
  for (const mutate of [
    event => { event.hintUsed = false; },
    event => { event.support = { independent: true, source: 'independent', provided: [] }; },
    event => { event.support.provided = []; },
    event => { event.changes = [phantom]; },
    event => { event.assistedChanges = [phantom]; },
    event => { event.assessment.after.assistedOriginalAttempts = 1; },
    event => { event.outcome = 'correct'; },
  ]) {
    const invalid = structuredClone(valid); mutate(invalid.events[0]);
    assert.throws(() => parsePracticeLog(invalid), /作答日志/);
  }
});
