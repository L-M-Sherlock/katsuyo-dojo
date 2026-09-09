import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createServer } from 'vite';
import { updateKnowledgeStats } from '../app/lib/adaptive.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { restoreLearningAssessment } from '../app/lib/assessment-transfer.mjs';
import { assessmentTarget, recordIndependentAttempt } from '../app/lib/learning-assessment.mjs';

const frozen = JSON.parse(await readFile(new URL('./fixtures/independent-learning-evidence.json', import.meta.url), 'utf8'));
const seedById = new Map(frozen.cases.map(seed => [seed.id, seed]));
const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
let knowledge;
try { knowledge = (await server.ssrLoadModule('/app/page.tsx')).KNOWLEDGE; }
finally { await server.close(); }
const migrateAt = '2026-09-09T12:00:00.000Z';
const restore = source => restoreLearningAssessment(source, { components: knowledge.components, exercises: knowledge.exercises, at: migrateAt });
const findExercise = (surface, form) => {
  const exercise = knowledge.exercises.find(candidate => candidate.item.surface === surface && candidate.form === form);
  assert.ok(exercise, `${surface}/${form} must exist in the full current catalog`);
  return exercise;
};
const noru = findExercise('乗る', 'teiruNegative'), toru = findExercise('取る', 'teiruNegative');
const fillerExercises = [findExercise('食べる', 'masu'), findExercise('高い', 'adjectivePast')];

function actualLatestProfile() {
  const events = frozen.sourceExport.observedLatestQuestion.map(event => ({ ...structuredClone(event),
    id: `independent-real-log-${event.sequence}`, questionId: 'independent-real-noru',
    answerLength: Array.from(event.answer).length, answerTruncated: false }));
  const byKc = {};
  for (const event of events) for (const change of event.changes) {
    if (change.after === null) delete byKc[change.kcId]; else byKc[change.kcId] = structuredClone(change.after);
  }
  // This is the independently frozen suffix of the real user log, not a new
  // diagnosis of the user's old text. Keep its original recorded score values.
  return { byKc, practiceLog: { version: 1, totalEvents: 20, droppedEntries: 16, events } };
}

function syntheticLegacyHistory(specs) {
  let byKc = {}, attempted = 0, correct = 0, streak = 0;
  const events = [];
  for (const [index, spec] of specs.entries()) {
    const exercise = spec.exercise ?? noru, original = spec.type !== 'step', type = spec.type ?? 'question';
    const outcome = spec.outcome ?? 'correct', real = ['correct', 'incorrect', 'revealed'].includes(outcome);
    const required = deriveUnified(exercise.item, exercise.form).requiredKcIds;
    const scope = spec.kcIds ?? required, before = structuredClone(byKc), beforeTotals = { date: '2026-09-09', attempted, correct, streak };
    // Deliberately reproduce the old coarse byKc write format. Expectations
    // come from the frozen evidence contract, not the new scorer's outputs.
    if (real) byKc = updateKnowledgeStats(byKc, { kcIds: scope, focusId: '', correct: outcome === 'correct',
      failedKcId: spec.failedKcId ?? null, confirmedKcIds: spec.confirmedKcIds ?? [], hintUsed: spec.hintUsed ?? false,
      revealed: outcome === 'revealed' });
    if (original && real) { attempted++; correct += Number(outcome === 'correct'); streak = outcome === 'correct' ? streak + 1 : 0; }
    const changes = [...new Set([...Object.keys(before), ...Object.keys(byKc)])].flatMap(kcId =>
      JSON.stringify(before[kcId]) === JSON.stringify(byKc[kcId]) ? [] : [{ kcId, label: kcId,
        before: before[kcId] ?? null, after: structuredClone(byKc[kcId] ?? null) }]);
    const given = spec.given ?? exercise.item.surface, reading = spec.givenReading ?? (spec.given ? spec.given : exercise.item.reading);
    const answer = spec.answer ?? (outcome === 'correct' ? deriveUnified({ ...exercise.item, surface: exercise.item.reading }, exercise.form).answer : 'のっていた');
    events.push({ id: `independent-legacy-${index + 1}`, sequence: index + 1, questionId: spec.questionId ?? `independent-question-${index + 1}`,
      at: spec.at ?? `2026-09-09T02:00:${String(index).padStart(2, '0')}.000Z`, type, outcome,
      exercise: { id: exercise.id, courseId: exercise.courseId, form: exercise.form, surface: exercise.item.surface,
        reading: exercise.item.reading, wordClass: exercise.item.class, domain: exercise.item.domain },
      target: { surface: given, reading, form: spec.targetForm ?? exercise.form, label: spec.targetForm ?? exercise.form,
        kind: original ? 'question' : spec.kind ?? 'conjugation', kcIds: scope, answers: [answer], readings: [answer],
        stepIndex: original ? null : 1, totalSteps: original ? 0 : 1, nextTotalSteps: original ? 0 : 1 },
      answer, answerLength: Array.from(answer).length, answerTruncated: false, hintUsed: spec.hintUsed ?? false,
      diagnosis: { kcId: spec.failedKcId ?? null, confirmedKcIds: spec.confirmedKcIds ?? [], resolution: outcome,
        message: spec.message ?? 'Independently specified old-format event.' },
      changes, totals: { before: beforeTotals, after: { date: '2026-09-09', attempted, correct, streak } } });
  }
  return { byKc, practiceLog: { version: 1, totalEvents: events.length, droppedEntries: 0, events } };
}

test('independent real-log migration removes proven assisted application and coverage writes while retaining a pending original failure', () => {
  assert.ok(seedById.has('legacy-log-failure-plus-assisted-success'));
  const source = actualLatestProfile(), snapshot = structuredClone(source), result = restore(source);
  const key = assessmentTarget(noru).key;
  assert.equal(result.byKc['apply.teiru.continuation'].attempts, 2);
  assert.equal(result.byKc['apply.teiru.continuation'].correct, 2);
  assert.equal(result.byKc['apply.teiru.continuation'].confidence, 0.4705882352941177);
  assert.equal(result.byKc['facet.apply.teiru.negative'], undefined);
  for (const event of source.practiceLog.events) for (const change of event.changes) {
    if (change.before === null) assert.equal(result.byKc[change.kcId], undefined, change.kcId);
    else assert.deepEqual(result.byKc[change.kcId], change.before, change.kcId);
  }
  assert.deepEqual(Object.keys(result.assessment.assistedByKc).sort(), ['construction.teiru', 'onbin.sokuon', 'stem.ichidan.drop-ru', 'suffix.negative', 'suffix.te']);
  assert.deepEqual(result.assessment.independentByKc, {});
  assert.ok(result.assessment.pending[key]);
  assert.equal(result.assessment.pending[key].lastPresentedAt, source.practiceLog.events.at(-1).at);
  assert.equal(result.assessment.byTarget[key].independentAttempts, 1);
  assert.equal(result.assessment.byTarget[key].independentCorrect, 0);
  assert.equal(result.assessment.byTarget[key].assistedStepCorrect, 2);
  assert.equal(result.assessment.originalCount, 1);
  assert.equal(result.assessment.migration.changes.length, 9);
  assert.deepEqual(source, snapshot, 'migration cannot rewrite original snapshots or old events');
});

test('versioned import is authoritative and idempotent rather than replaying retained old failures', () => {
  assert.ok(seedById.has('export-import-after-assisted-end'));
  const source = actualLatestProfile(), initial = restore(source), key = assessmentTarget(noru).key;
  const imported = { ...source, ...initial };
  assert.deepEqual(restore(imported), initial);
  assert.deepEqual(restoreLearningAssessment(imported, { components: knowledge.components, exercises: knowledge.exercises,
    at: '2026-09-10T12:00:00.000Z' }), initial, 'cross-day import cannot mutate spacing or evidence');
  let assessment = initial.assessment;
  for (const [index, exercise] of fillerExercises.entries()) assessment = recordIndependentAttempt(assessment, {
    exercise, questionId: `after-migration-filler-${index}`, correct: true, at: '2026-09-09T12:00:00.000Z' });
  assessment = recordIndependentAttempt(assessment, { exercise: toru, questionId: 'after-migration-independent-retest',
    correct: true, at: '2026-09-09T12:05:00.000Z' });
  assert.equal(assessment.pending[key], undefined);
  const withResolvedRetest = { ...imported, assessment };
  const restored = restore(withResolvedRetest);
  assert.equal(restored.assessment.pending[key], undefined, 'old logs must not reopen a subsequently resolved target');
  assert.deepEqual(restored.assessment, assessment);
  assert.deepEqual(restored.byKc, initial.byKc);
});

test('a cropped legacy log containing only steps cannot invent a missing original failure or an independent success', () => {
  assert.ok(seedById.has('legacy-log-cropped-before-failure'));
  const source = actualLatestProfile();
  source.practiceLog.events.shift(); source.practiceLog.droppedEntries++;
  const result = restore(source), target = result.assessment.byTarget[assessmentTarget(noru).key];
  assert.deepEqual(result.assessment.pending, {});
  assert.deepEqual(result.assessment.independentByKc, {});
  assert.equal(result.assessment.originalCount, 0);
  assert.equal(target.independentAttempts, 0);
  assert.equal(target.independentCorrect, 0);
  assert.equal(target.assistedStepCorrect, 2);
  assert.ok(result.assessment.migration.uncertain.some(entry => entry.reason === 'older-events-not-retained'));
  assert.equal(result.byKc['apply.teiru.continuation'].attempts, 2, 'known assisted positive can still be reconciled without inventing the missing original');
  assert.equal(result.byKc['facet.apply.teiru.negative'], undefined);
});

test('a cumulative-only legacy profile is preserved as unverified history without fabricated target outcomes', () => {
  assert.ok(seedById.has('legacy-profile-without-events'));
  const source = { byKc: actualLatestProfile().byKc }, snapshot = structuredClone(source), result = restore(source);
  assert.deepEqual(result.byKc, source.byKc);
  assert.deepEqual(result.assessment.pending, {});
  assert.deepEqual(result.assessment.independentByKc, {});
  assert.deepEqual(result.assessment.assistedByKc, {});
  assert.deepEqual(result.assessment.byTarget, {});
  assert.ok(result.assessment.migration.uncertain.some(entry => entry.reason === 'no-practice-log'));
  assert.deepEqual([...result.assessment.migration.unverifiedKcIds].sort(), Object.keys(source.byKc).sort());
  assert.deepEqual(restore({ ...source, ...result }), result);
  assert.deepEqual(source, snapshot);
});

test('a broken cumulative snapshot chain is isolated rather than rolled back by guessed subtraction', () => {
  const source = actualLatestProfile(), id = 'apply.teiru.continuation';
  source.byKc[id].attempts++; source.byKc[id].correct++;
  const before = structuredClone(source.byKc[id]), result = restore(source);
  assert.deepEqual(result.byKc[id], before);
  assert.ok(result.assessment.migration.unverifiedKcIds.includes(id));
  assert.ok(result.assessment.migration.uncertain.some(entry => entry.kcId === id && entry.reason === 'snapshot-chain-mismatch'));
  assert.equal(result.assessment.assistedByKc[id], undefined);
  assert.equal(result.byKc['facet.apply.teiru.negative'], undefined, 'a different, valid chain remains independently reconcilable');
  assert.ok(result.assessment.pending[assessmentTarget(noru).key], 'known whole failure does not require guessing a score rollback');
});

test('unknown exercise metadata retains unverified scores and cannot create a guessed target identity', () => {
  const source = actualLatestProfile();
  for (const event of source.practiceLog.events) event.exercise.reading = 'ふめいなよみ';
  const before = structuredClone(source.byKc), result = restore(source);
  assert.deepEqual(result.byKc, before);
  assert.deepEqual(result.assessment.pending, {});
  assert.deepEqual(result.assessment.byTarget, {});
  assert.deepEqual(result.assessment.independentByKc, {});
  assert.deepEqual(result.assessment.assistedByKc, {});
  assert.equal(result.assessment.originalCount, 1, 'a known original event remains an intervening event without invented metadata');
  assert.ok(result.assessment.migration.uncertain.some(entry => entry.reason === 'exercise-metadata-unavailable'));
});

test('later qualified same-path independent success clears the legacy failure whereas an earlier success or assisted success cannot', () => {
  assert.ok(seedById.has('legacy-later-valid-independent-retest'));
  assert.ok(seedById.has('legacy-known-failure-after-earlier-correct'));
  const failed = { exercise: noru, outcome: 'incorrect', answer: 'のっていた', questionId: 'q-failure' };
  const assisted = { exercise: noru, type: 'step', outcome: 'correct', given: '乗っている', givenReading: 'のっている',
    answer: 'のっていない', kcIds: ['stem.ichidan.drop-ru', 'suffix.negative', 'apply.teiru.continuation', 'facet.apply.teiru.negative'], questionId: 'q-failure' };
  const prefix = [{ exercise: toru, outcome: 'correct', questionId: 'q-earlier-success' }, failed, assisted];
  const earlier = restore(syntheticLegacyHistory(prefix)), key = assessmentTarget(noru).key;
  assert.ok(earlier.assessment.pending[key]);
  assert.equal(earlier.assessment.byTarget[key].eligibleRetestCorrect, 0);
  const completed = restore(syntheticLegacyHistory([...prefix,
    ...fillerExercises.map((exercise, index) => ({ exercise, questionId: `q-filler-${index}` })),
    { exercise: toru, outcome: 'correct', answer: 'とっていない', questionId: 'q-real-retest' }]));
  assert.equal(completed.assessment.pending[key], undefined);
  assert.equal(completed.assessment.byTarget[key].eligibleRetestCorrect, 1);
  assert.equal(completed.assessment.byTarget[key].independentCorrect, 2);
  assert.equal(completed.byKc['apply.teiru.continuation'].correct, 2, 'only the earlier independent answer and the later retest count');
  assert.equal(completed.assessment.assistedByKc['suffix.negative'].correct, 1);
});

test('same-word legacy answer copying is practice and a different sound path cannot clear the old target', () => {
  const failed = { exercise: noru, outcome: 'incorrect', answer: 'のっていた', questionId: 'q-failure' }, key = assessmentTarget(noru).key;
  const copied = restore(syntheticLegacyHistory([failed, { exercise: noru, outcome: 'correct', questionId: 'q-copy' }]));
  assert.ok(copied.assessment.pending[key]);
  assert.equal(copied.assessment.byTarget[key].eligibleRetestCorrect, 0);
  assert.equal(copied.byKc['apply.teiru.continuation'], undefined);
  assert.equal(copied.assessment.independentByKc['apply.teiru.continuation'], undefined);
  assert.equal(copied.assessment.assistedByKc['suffix.negative'].correct, 1);
  const differentPath = restore(syntheticLegacyHistory([failed,
    ...fillerExercises.map((exercise, index) => ({ exercise, questionId: `q-filler-${index}` })),
    { exercise: findExercise('書く', 'teiruNegative'), answer: 'かいていない', questionId: 'q-other-path' }]));
  assert.ok(differentPath.assessment.pending[key]);
  assert.equal(differentPath.assessment.byTarget[key].eligibleRetestCorrect, 0);
});

test('legacy lexical retries and invalid input keep the later unassisted first answer independent', () => {
  const exercise = findExercise('待つ', 'teiruNegative'), source = syntheticLegacyHistory([
    { exercise, outcome: 'typo', answer: 'めっていない', questionId: 'q-lexical' },
    { exercise, outcome: 'invalid', answer: 'invalid', questionId: 'q-lexical' },
    { exercise, outcome: 'correct', answer: 'まっていない', questionId: 'q-lexical' },
  ]);
  const result = restore(source), key = assessmentTarget(exercise).key;
  assert.equal(result.assessment.originalCount, 1);
  assert.equal(result.assessment.byTarget[key].independentAttempts, 1);
  assert.equal(result.assessment.byTarget[key].independentCorrect, 1);
  assert.deepEqual(result.assessment.pending, {});
  assert.equal(result.assessment.independentByKc['apply.teiru.continuation'].correct, 1);
  assert.equal(result.assessment.assistedByKc['apply.teiru.continuation'], undefined);
});

test('legacy manual hints and answer reveals never become independent coverage or fabricated primitive mistakes', () => {
  const hinted = restore(syntheticLegacyHistory([{ exercise: noru, outcome: 'correct', hintUsed: true, questionId: 'q-hinted' }]));
  assert.ok(hinted.assessment.pending[assessmentTarget(noru).key]);
  assert.deepEqual(hinted.assessment.independentByKc, {});
  assert.deepEqual(hinted.byKc, {});
  assert.ok(hinted.assessment.assistedByKc['suffix.negative']);
  const revealed = restore(syntheticLegacyHistory([{ exercise: noru, outcome: 'revealed', failedKcId: 'suffix.negative', questionId: 'q-revealed' }]));
  assert.deepEqual(revealed.byKc, {});
  assert.deepEqual(revealed.assessment.independentByKc, {});
  assert.deepEqual(revealed.assessment.assistedByKc, {});
  const pending = revealed.assessment.pending[assessmentTarget(noru).key];
  assert.ok(pending);
  assert.deepEqual(pending.failedKcIds, [], 'the old revealed-focus penalty is not evidence of that atom failing');
});

test('versioned assessment preserves exposure clocks and rejects impossible independent maps', () => {
  const source = actualLatestProfile(), result = restore(source), complete = { ...source, ...result };
  const again = restore(complete);
  assert.deepEqual(again.assessment.seenExposureIds, result.assessment.seenExposureIds);
  assert.ok(again.assessment.seenExposureIds.length >= 2);
  assert.deepEqual(again.assessment.pending, result.assessment.pending);
  const tampered = structuredClone(complete);
  tampered.assessment.independentByKc['apply.teiru.continuation'] = { ...tampered.byKc['apply.teiru.continuation'], attempts: 1000, correct: 1000 };
  assert.throws(() => restore(tampered), /学习评估数据/);
});
