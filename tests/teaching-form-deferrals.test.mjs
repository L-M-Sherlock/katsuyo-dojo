import { EXPECTED_CURRENT_FORM_HOLDS, EXPECTED_DEFERRED_COMPONENT_IDS } from './helpers/four-form-teaching-hold-scope.mjs';
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createServer } from 'vite';
import { isTeachingFormDeferred, USER_DIRECTED_FORM_DEFERRALS } from '../app/lib/teaching-form-deferrals.mjs';
import { USAGE_REVIEW_VERSION, assessFormUsage, eligibleVerbForm, supportsVerbForm } from '../app/lib/form-eligibility.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { recognizeForms } from '../app/lib/form-recognition.mjs';
import { normalizeAnswer } from '../app/lib/answer-analysis.mjs';
import { REVIEWED_USAGE_CARDS, USAGE_CARDS, usageCardItem, usageCardFor, createUsageCardLookup } from '../app/lib/usage-cards.mjs';
import { reviewedLexicalSense } from '../app/lib/lexical-usage.mjs';
import { assessmentTarget, emptyAssessment, reconcileAssessmentCatalog, recordIndependentAttempt } from '../app/lib/learning-assessment.mjs';
import { emptySkillStats, isComponentMastered } from '../app/lib/adaptive.mjs';
import { createPracticePlanner } from '../app/lib/practice-planning.mjs';
import { createChallengePlanner } from '../app/lib/challenge-planning.mjs';
import { planRetestQuestion } from '../app/lib/retest-planning.mjs';
import { UNIFIED_COURSES } from '../app/lib/unified-curriculum.mjs';
import { auditKnowledgeModel } from '../app/lib/knowledge-model.mjs';
import { parseUnifiedImport, createUnifiedExport } from '../app/lib/unified-profile.mjs';

const form = 'temiruNegativePast', facetId = 'facet.apply.temiru.negativePast';
const at = '2026-10-17T00:00:00Z', today = '2026-10-17';
const heldCards = REVIEWED_USAGE_CARDS.filter(card => card.form === form);
let server, page, model, oldExercises;
before(async () => {
  server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  page = await server.ssrLoadModule('/app/page.tsx');
  model = page.KNOWLEDGE;
  oldExercises = heldCards.map(card => {
    const exercise = model.registryExercises.find(candidate => candidate.form === form
      && reviewedLexicalSense(candidate.item)?.id === card.senseId);
    assert.ok(exercise, `${card.id}: historical morphology remains registered`);
    return exercise;
  });
});
after(async () => { await server?.close(); });
const mastered = () => Object.fromEntries(model.components.map(kc => [kc.id,
  { ...emptySkillStats(), attempts: 5, correct: 5, filteredAccuracy: 1, confidence: 1, bestConfidence: 1 }]));
const profile = () => ({ byKc: mastered(), assessment: emptyAssessment(), rotation: 0,
  introducedKcIds: model.components.filter(kc => kc.gating).map(kc => kc.id),
  accessibleCourseIds: UNIFIED_COURSES.map(course => course.id), coursePractice: {}, recentWordKeys: [] });

test('the exact teaching hold blocks every old and newly supplied card while preserving sibling forms', () => {
  const historicalHold = USER_DIRECTED_FORM_DEFERRALS.filter(row => row.requestedAt === '2026-10-17');
  assert.deepEqual(historicalHold.map(row => row.form), [form]);
  assert.deepEqual(new Set(USER_DIRECTED_FORM_DEFERRALS.map(row => row.form)), EXPECTED_CURRENT_FORM_HOLDS);
  assert.ok(heldCards.length > 0);
  assert.equal(USAGE_CARDS.some(card => card.form === form), false);
  assert.equal(model.exercises.some(exercise => exercise.form === form), false);
  assert.equal(UNIFIED_COURSES.find(course => course.id === 'temiru').forms.includes(form), true);
  for (const exercise of model.registryExercises.filter(exercise => exercise.form === form)) {
    const usage = assessFormUsage(exercise.item, form);
    assert.equal(supportsVerbForm(exercise.item, form), true, exercise.id);
    assert.equal(eligibleVerbForm(exercise.item, form), false, exercise.id);
    // Unreviewed senses keep their own lexical warning; every formerly usable
    // exact pair must now be held regardless of a card's publication identity.
    if (reviewedLexicalSense(exercise.item)) {
      assert.equal(usage.status, 'context-required', exercise.id);
      assert.equal(usage.context, undefined, exercise.id);
      assert.equal(usage.reasonCode, 'user-directed-form-hold', exercise.id);
    }
  }
  for (const card of heldCards) {
    const item = usageCardItem(card.senseId);
    assert.equal(usageCardFor(item, form), null, card.id);
    const futureCard = { ...card, id: `future:${card.id}` };
    assert.equal(createUsageCardLookup([futureCard])(item, form), null, futureCard.id);
  }
  for (const sibling of ['temiru', 'temiruNegative', 'temiruPast']) {
    assert.equal(isTeachingFormDeferred(sibling), false);
    assert.ok(model.exercises.some(exercise => exercise.form === sibling), sibling);
    assert.ok(USAGE_CARDS.some(card => card.form === sibling), sibling);
  }
  for (const sibling of ['temiruDesire', 'temiruDesirePast', 'temiruRequest', 'temiruTara']) {
    assert.equal(isTeachingFormDeferred(sibling), false);
    assert.ok(model.exercises.some(exercise => exercise.form === sibling), sibling);
  }
});

test('whole forms remain constructible and recognizable for regular and irregular stems', () => {
  for (const surface of ['書く', '読む', '行く', '食べる', 'する', '来る']) {
    const exercise = model.registryExercises.find(candidate => candidate.form === form && candidate.item.surface === surface);
    assert.ok(exercise, surface);
    const target = deriveUnified(exercise.item, form);
    assert.ok(target.answer.endsWith('てみなかった') || target.answer.endsWith('でみなかった'), surface);
    assert.ok(target.requiredKcIds.includes(facetId));
    for (const item of [exercise.item, { ...exercise.item, surface: exercise.item.reading, lexicalSurface: exercise.item.surface }]) {
      const answer = deriveUnified(item, form).answer;
      const recognized = recognizeForms(exercise.item, answer, normalizeAnswer).find(candidate => candidate.form === form);
      assert.ok(recognized, `${surface}: ${answer}`);
      assert.equal(recognized.usage.reasonCode, 'user-directed-form-hold');
    }
  }
});

test('the current teaching projection pauses exclusive held rules without weakening shared rules', () => {
  assert.equal(model.components.filter(component => component.gating).length, 131);
  assert.deepEqual(new Set(model.components.filter(component => component.teachingDeferred).map(component => component.id)), EXPECTED_DEFERRED_COMPONENT_IDS);
  const parent = model.components.find(component => component.id === 'apply.temiru.continuation');
  assert.deepEqual(parent.coverageKcIds, ['facet.apply.temiru.past', 'facet.apply.temiru.negative']);
  assert.equal(model.courseKcIds.temiru.includes(facetId), false);
  assert.equal(model.components.some(component => component.coverageKcIds.includes(facetId)), false);
  for (const id of ['suffix.negative', 'adj.suffix.i-past', 'compound.negative-past']) {
    assert.ok(model.components.find(component => component.id === id)?.gating, id);
    assert.ok(model.exercises.some(exercise => exercise.kcIds.includes(id)), id);
  }
  const stats = mastered();
  delete stats[facetId];
  assert.equal(isComponentMastered(parent, stats), true, 'past and negative coverage can complete the taught parent');
  assert.deepEqual(auditKnowledgeModel(model), []);
});

test('ordinary practice, free challenge and retest planning cannot issue held targets', () => {
  const ordinary = createPracticePlanner(model), challenge = createChallengePlanner(model);
  for (let rotation = 0; rotation < 6; rotation++) {
    const current = { ...profile(), rotation };
    current.byKc['apply.temiru.continuation'] = emptySkillStats();
    const planned = ordinary.plan('temiru', current);
    const assigned = ordinary.assign(planned, current, { seed: 17 });
    assert.ok(assigned.length > 0);
    assert.ok(assigned.every(({ candidate }) => candidate.form !== form));
    const questions = challenge.questions('temiru', current, { length: 36, seed: 17 });
    assert.ok(questions.length > 0);
    assert.ok(questions.every(({ candidate }) => candidate.form !== form));
  }
  const exercise = oldExercises[0];
  for (const mode of ['practice', 'challenge']) {
    const failed = recordIndependentAttempt(emptyAssessment(), { exercise, questionId: `held-${mode}`, correct: false, mode, at });
    const current = { ...profile(), assessment: failed };
    assert.equal(planRetestQuestion(current, 'adaptive', { ...model, courses: UNIFIED_COURSES, at }), null);
    assert.ok(challenge.questions('temiru', current).every(({ candidate }) => candidate.form !== form));
    assert.deepEqual(current.assessment, failed, 'planning preserves original evidence');
  }
});

test('every former pending target suspends with intact anchors and resumes only when its path returns', () => {
  const unrelated = model.exercises.find(exercise => exercise.form === 'teiruNegative');
  for (const exercise of oldExercises) {
    let failed = recordIndependentAttempt(emptyAssessment(), { exercise, questionId: `held:${exercise.id}`, correct: false, at });
    failed = recordIndependentAttempt(failed, { exercise: unrelated, questionId: `other:${exercise.id}`, correct: false, at });
    const before = structuredClone(failed), key = assessmentTarget(exercise).key, otherKey = assessmentTarget(unrelated).key;
    const suspended = reconcileAssessmentCatalog(failed, model.exercises, USAGE_REVIEW_VERSION);
    assert.equal(suspended.pending[key], undefined);
    const { suspension, ...original } = suspended.suspendedPending[key];
    assert.equal(suspension.reason, 'no-eligible-exercise');
    assert.deepEqual(original, failed.pending[key]);
    assert.deepEqual(suspended.pending[otherKey], failed.pending[otherKey]);
    for (const field of ['byTarget', 'independentByKc', 'assistedByKc', 'originalCount', 'seenQuestionIds']) assert.deepEqual(suspended[field], failed[field], `${exercise.id}: ${field}`);
    assert.equal(suspended.byTarget[key].eligibleRetestCorrect, 0);
    assert.deepEqual(failed, before);
    const resumed = reconcileAssessmentCatalog(suspended, [...model.exercises, exercise], USAGE_REVIEW_VERSION);
    assert.deepEqual(resumed.pending[key], failed.pending[key]);
    assert.equal(resumed.suspendedPending[key], undefined);
  }
});

test('strict profile restore preserves the paused facet scores, historical failures and roundtrip state', () => {
  const options = { today, at, components: model.components, exercises: model.exercises,
    legacyComponents: [...page.VERB_KNOWLEDGE.components, ...page.ADJECTIVE_KNOWLEDGE.components] };
  const source = parseUnifiedImport({ version: 5, date: today, attempted: 0, correct: 0, streak: 0, rotation: 0,
    byKc: {}, introducedKcIds: [] }, options);
  source.version = 7;
  delete source.statistics;
  source.byKc[facetId] = { ...emptySkillStats(), attempts: 1, correct: 0, filteredAccuracy: 0 };
  source.assessment = recordIndependentAttempt(source.assessment, { exercise: oldExercises[0], questionId: 'old-held-profile', correct: false, at });
  const before = structuredClone(source), key = assessmentTarget(oldExercises[0]).key;
  const restored = parseUnifiedImport(createUnifiedExport(source, at), options);
  assert.deepEqual(restored.byKc, source.byKc);
  assert.deepEqual(restored.assessment.byTarget, source.assessment.byTarget);
  assert.deepEqual(restored.practiceLog, source.practiceLog);
  assert.equal(restored.assessment.pending[key], undefined);
  const { suspension, ...pending } = restored.assessment.suspendedPending[key];
  assert.equal(suspension.reason, 'no-eligible-exercise');
  assert.deepEqual(pending, source.assessment.pending[key]);
  assert.deepEqual(parseUnifiedImport(createUnifiedExport(restored, at), options), restored);
  assert.deepEqual(source, before);
});
