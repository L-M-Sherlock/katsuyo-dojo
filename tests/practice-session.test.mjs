import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyHintState, toggleHint, planPractice, shouldReplan } from '../app/lib/practice-session.mjs';
import { updateSkillStats, componentConfidence, correctAnswersNeeded, updateKnowledgeStats } from '../app/lib/adaptive.mjs';
import { simulateLearning } from '../app/lib/perfect-simulation.mjs';

const component = (id, order, course) => ({ id, order, gating: true, firstCourseId: course, firstCourseIndex: order, prerequisites: [], coverageKcIds: [] });
const components = [component('a', 0, 'first'), component('b', 1, 'second'), component('c', 2, 'second')];
const courseKcIds = { first: ['a'], second: ['b', 'c'] };

test('closing a hint preserves its scoring penalty until the next question', () => {
  const hidden = toggleHint(toggleHint(emptyHintState()));
  assert.equal(hidden.shown, false);
  assert.equal(hidden.used, true);
  let stats;
  for (let i = 0; i < 5; i++) stats = updateSkillStats(stats, { correct: true, hintUsed: hidden.used });
  assert.ok(stats.confidence < 1);
  assert.equal(emptyHintState().used, false);
});

test('completed routes rotate across courses and their atoms without one-question rounds', () => {
  const byKc = Object.fromEntries(components.map((kc) => [kc.id, { confidence: 1 }]));
  const plans = Array.from({ length: 4 }, (_, rotation) => planPractice(components, byKc, courseKcIds, { rotation }));
  assert.deepEqual(plans.map(({ focus }) => focus.id), ['a', 'b', 'a', 'c']);
  for (const plan of plans) {
    assert.equal(plan.review, true);
    assert.equal(plan.plan.length, 12);
    assert.equal(shouldReplan(plan.focus, byKc, plan.review), false);
  }
  byKc.b = { confidence: .3 };
  const recovery = planPractice(components, byKc, courseKcIds, { rotation: 100 });
  assert.equal(recovery.review, false);
  assert.equal(recovery.focus.id, 'b');
});

test('coverage survives mistakes but current mastery drops and can recover', () => {
  const kc = { ...component('parent', 0, 'classify'), coverageOnly: true, coverageKcIds: ['suru', 'kuru'] };
  let byKc = {};
  for (const facet of kc.coverageKcIds) byKc = updateKnowledgeStats(byKc, { kcIds: ['parent', facet], focusId: 'parent', correct: true });
  assert.equal(componentConfidence(kc, byKc), 1);
  byKc = updateKnowledgeStats(byKc, { kcIds: ['parent', 'suru'], focusId: 'parent', correct: false });
  assert.ok(componentConfidence(kc, byKc) < 1);
  assert.equal(byKc.suru.correct, 1);
  const needed = correctAnswersNeeded(kc, byKc);
  assert.ok(needed > 0);
  for (let i = 0; i < needed; i++) byKc = updateKnowledgeStats(byKc, { kcIds: ['parent', 'suru'], focusId: 'parent', correct: true });
  assert.equal(componentConfidence(kc, byKc), 1);
});

test('hint-assisted coverage alone does not count as independent mastery', () => {
  const kc = { ...component('parent', 0, 'classify'), coverageOnly: true, coverageKcIds: ['suru', 'kuru'] };
  let byKc = {};
  for (const facet of kc.coverageKcIds) byKc = updateKnowledgeStats(byKc, { kcIds: ['parent', facet], focusId: 'parent', correct: true, hintUsed: true });
  assert.ok(componentConfidence(kc, byKc) < 1);
  assert.ok(correctAnswersNeeded(kc, byKc) > 0);
});

test('a learner with errors, hints and revealed answers eventually completes the shared flow', () => {
  const exercises = components.flatMap((kc) => Array.from({ length: 16 }, (_, index) => ({ id: `${kc.id}-${index}`, courseId: kc.firstCourseId, courseIndex: kc.firstCourseIndex, form: kc.id, item: { surface: `${kc.id}-${index}` }, kcIds: [kc.id] })));
  const seen = new Map();
  const report = simulateLearning({ components, exercises, courseKcIds }, { answerFor: ({ focus }) => {
    const n = seen.get(focus.id) ?? 0; seen.set(focus.id, n + 1);
    return n === 0 ? { correct: false } : n === 1 ? { correct: true, hintUsed: true } : n === 2 ? { correct: false, revealed: true } : { correct: true };
  } });
  assert.equal(report.completed, true);
  assert.ok(report.questionCount > 15);
  assert.equal(report.redundantFocusQuestions, 0);
});
