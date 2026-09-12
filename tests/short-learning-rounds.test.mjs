import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { emptySkillStats } from '../app/lib/adaptive.mjs';
import { createPracticePlanner } from '../app/lib/practice-planning.mjs';
import { simulateLearning } from '../app/lib/perfect-simulation.mjs';
import { exerciseKey } from '../app/lib/exercise-selection.mjs';

const mastered = { ...emptySkillStats(), attempts: 5, correct: 5, filteredAccuracy: 1, confidence: 1, bestConfidence: 1 };
const failed = { ...emptySkillStats(), attempts: 1, filteredAccuracy: 0 };
const component = (id, order, extra = {}) => ({ id, order, gating: true, firstCourseId: 'course', firstCourseIndex: 0, prerequisites: [], coverageKcIds: [], ...extra });
const exercise = (surface, kcIds, form = 'masu') => ({ id: `course:${form}:${surface}`, item: { domain: 'verb', surface }, form, kcIds, courseId: 'course', courseIndex: 0 });
const small = [exercise('する', ['weak', 'known']), exercise('来る', ['weak', 'known'])];
const fillers = Array.from({ length: 16 }, (_, i) => exercise(`known-${i}`, ['known', 'class.godan']));
const components = [component('weak', 0), component('known', 1), component('class.godan', 2)];
const model = { components, exercises: [...small, ...fillers], courseKcIds: { course: components.map(k => k.id) } };
const profile = () => ({ byKc: { weak: { ...failed }, known: { ...mastered }, 'class.godan': { ...mastered } }, introducedKcIds: components.map(k => k.id), rotation: 0 });

test('a two-example learning pool ends after its two useful questions instead of using mastered fillers', () => {
  const planner = createPracticePlanner(model), p = profile(), planned = planner.plan('adaptive', p);
  const assigned = planner.assign(planned, p);
  assert.deepEqual(new Set(assigned.map(a => a.candidate.id)), new Set(small.map(e => e.id)));
  assert.equal(assigned.length, 2);
  assert.equal(planner.assign(planned, p, { usedKeys: [exerciseKey(small[0])] }).length, 1);
  assert.deepEqual(planner.assign(planned, p, { usedKeys: small.map(exerciseKey) }), []);
  assert.deepEqual(p, profile(), 'planning cannot change scores');
});

test('source classification gaps cannot turn unrelated conjugations into useful learning', () => {
  const planner = createPracticePlanner(model), p = profile();
  p.byKc['class.godan'] = { ...failed };
  assert.equal(planner.hasLearningOpportunity(fillers[0], p), false);
  assert.equal(planner.hasLearningOpportunity(exercise('読む', ['class.godan'], null), p), true);
});

test('a parent waiting only for coverage uses the missing facet, not arbitrary parent examples', () => {
  const parent = component('parent', 0, { coverageKcIds: ['facet.a', 'facet.b'] });
  const a = exercise('a', ['parent', 'facet.a']), b = exercise('b', ['parent', 'facet.b']);
  const ordinary = exercise('ordinary', ['parent']);
  const m = { components: [parent], exercises: [a, b, ordinary], courseKcIds: { course: ['parent'] } };
  const planner = createPracticePlanner(m), p = { byKc: { parent: { ...mastered }, 'facet.a': { correct: 1 } }, introducedKcIds: ['parent'], rotation: 0 };
  assert.equal(planner.hasLearningOpportunity(a, p), false);
  assert.equal(planner.hasLearningOpportunity(ordinary, p), false);
  assert.deepEqual(planner.assign(planner.plan('adaptive', p), p).map(x => x.candidate), [b]);
});

test('short rounds preserve recovery thresholds and review still supports a full round', () => {
  const p = profile();
  const result = simulateLearning(model, { initialProfile: p });
  assert.equal(result.completed, true);
  assert.equal(result.questionCount, 9, 'one failure still needs nine independent successes');
  assert.deepEqual(result.rounds.map(r => r.questionCount), [2, 2, 2, 2, 1]);
  assert.equal(result.masteredOnlyQuestions, 0);
  const planner = createPracticePlanner(model), complete = { ...p, byKc: { ...p.byKc, weak: { ...mastered } } };
  const review = planner.plan('adaptive', complete);
  assert.equal(review.review, true);
  assert.equal(planner.assign(review, complete).length, 12);
});

test('mastered-only telemetry includes planned balancing questions, not just the nominal focus', () => {
  const m = { ...model, exercises: [...Array.from({ length: 16 }, (_, i) => exercise(`weak-${i}`, ['weak'])), ...fillers] };
  const p = profile(); p.byKc.weak = emptySkillStats();
  const result = simulateLearning(m, { initialProfile: p });
  assert.equal(result.completed, true);
  assert.equal(result.masteredOnlyQuestions, 1);
  assert.deepEqual(result.masteredOnlyByFocus, { known: 1 });
  assert.equal(result.redundantFocusQuestions, 0, 'the old narrow metric alone missed this balancing question');
});

test('the real mixed learner no longer pads the final masu recovery with mastered forms', async () => {
  const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  try {
    const { KNOWLEDGE } = await server.ssrLoadModule('/app/page.tsx');
    const attempts = new Map(), rows = [];
    const report = simulateLearning(KNOWLEDGE, { answerFor: ({ focus, exercise: e, byKc }) => {
      const n = attempts.get(focus.id) ?? 0; attempts.set(focus.id, n + 1);
      if (e.courseId === 'masu') rows.push({ surface: e.item.surface, byKc });
      return n === 0 ? { correct: false, failedKcId: focus.id } : n === 1 ? { correct: true, hintUsed: true }
        : n === 2 ? { correct: false, revealed: true, failedKcId: focus.id } : n === 3 ? { correct: false } : { correct: true };
    } });
    assert.equal(report.completed, true);
    assert.equal(report.masteredCount, 119);
    assert.equal(report.completedFacetCount, 89);
    assert.ok(rows.length < 60, `previously 97 masu questions; got ${rows.length}`);
    const tail = rows.filter(row => ['stem.ichidan.drop-ru', 'stem.godan.i', 'suffix.masu'].every(id => row.byKc[id]?.confidence >= 1)
      && ['facet.form.masu.suru', 'facet.form.masu.kuru'].every(id => row.byKc[id]?.correct >= 1));
    // The corrected route may finish the shared suffix after the stem. Also
    // replay the exact bottleneck independently of that incidental order.
    const bottleneck = {
      byKc: Object.fromEntries(KNOWLEDGE.components.map(k => [k.id, { ...mastered }])),
      introducedKcIds: KNOWLEDGE.components.filter(k => k.gating).map(k => k.id), rotation: 0,
    };
    bottleneck.byKc['stem.irregular.connective'] = { ...failed };
    const recoveryWords = [];
    const recovery = simulateLearning(KNOWLEDGE, { initialProfile: bottleneck, answerFor: ({ exercise: e }) => {
      recoveryWords.push(e.item.surface); return { correct: true };
    } });
    assert.equal(recovery.completed, true);
    assert.equal(recovery.questionCount, 9);
    assert.equal(recovery.masteredOnlyQuestions, 0);
    assert.ok(recoveryWords.every(word => ['する', '来る'].includes(word)));
    assert.ok(tail.every(row => ['する', '来る'].includes(row.surface)), 'no mastered ordinary forms after only the irregular rule remains');
  } finally { await server.close(); }
});
