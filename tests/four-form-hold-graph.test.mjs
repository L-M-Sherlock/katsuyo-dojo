import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createServer } from 'vite';
import { USER_DIRECTED_FORM_DEFERRALS, USER_DIRECTED_DEFERRED_FORMS, isTeachingFormDeferred } from '../app/lib/teaching-form-deferrals.mjs';
import { buildUnifiedKnowledge, deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { auditKnowledgeModel, deriveExercise } from '../app/lib/knowledge-model.mjs';
import { curriculumSupportsVerbForm } from '../app/lib/curriculum-shapes.mjs';
import { USAGE_REVIEW_VERSION } from '../app/lib/form-eligibility.mjs';
import { UNIFIED_COURSES } from '../app/lib/unified-curriculum.mjs';
import { emptySkillStats, isComponentMastered } from '../app/lib/adaptive.mjs';
import { createPracticePlanner } from '../app/lib/practice-planning.mjs';
import { summarizeUnifiedCourse } from '../app/lib/unified-progress.mjs';
import { statisticsSnapshot } from '../app/lib/statistics.mjs';
import { recognizeForms } from '../app/lib/form-recognition.mjs';
import { normalizeAnswer } from '../app/lib/answer-analysis.mjs';
import { emptyAssessment, recordIndependentAttempt, assessmentTarget, reconcileAssessmentCatalog } from '../app/lib/learning-assessment.mjs';
import { parseUnifiedImport, createUnifiedExport } from '../app/lib/unified-profile.mjs';

const newForms = ['tearuNegative', 'tearuNegativePast', 'temiruDesireNegative', 'temiruDesireNegativePast'];
const heldIds = ['exception.aru-negative', 'facet.apply.tearu.negative', 'facet.apply.tearu.negativePast',
  'facet.apply.temiru.negativePast', 'facet.chain.temiruDesireNegative', 'facet.chain.temiruDesireNegativePast'];
const at = '2026-10-27T00:00:00Z', today = '2026-10-27';
let server, page, model, byId;
before(async () => {
  server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  page = await server.ssrLoadModule('/app/page.tsx');
  model = page.KNOWLEDGE;
  byId = new Map(model.components.map(component => [component.id, component]));
});
after(async () => { await server?.close(); });
const mastered = () => Object.fromEntries(model.components.filter(kc => !kc.teachingDeferred).map(kc => [kc.id,
  { ...emptySkillStats(), attempts: 5, correct: 5, filteredAccuracy: 1, confidence: 1, bestConfidence: 1 }]));
const profile = () => ({ byKc: mastered(), assessment: emptyAssessment(), rotation: 0, recentWordKeys: [],
  introducedKcIds: model.components.filter(kc => kc.gating).map(kc => kc.id),
  accessibleCourseIds: UNIFIED_COURSES.map(course => course.id), coursePractice: {} });

test('the four explicit reversible holds preserve the earlier form hold and all registered forms', () => {
  assert.deepEqual(USER_DIRECTED_FORM_DEFERRALS.map(row => row.form), ['temiruNegativePast', ...newForms]);
  assert.equal(USER_DIRECTED_FORM_DEFERRALS[0].requestedAt, '2026-10-17');
  for (const row of USER_DIRECTED_FORM_DEFERRALS.slice(1)) {
    assert.equal(row.basis, 'user-directed-teaching-hold');
    assert.equal(row.requestedAt, today);
    assert.equal(row.evidenceFile, 'docs/form-hold-baseline-20261027.json.gz');
    assert.match(row.reason, /教学安排.*不认定.*不存在/u);
    assert.match(row.restoreCondition, /用户明确恢复指令.*复核.*教学供应.*历史复测路径/u);
    assert.equal(isTeachingFormDeferred(row.form), true);
    assert.ok(model.registryExercises.some(exercise => exercise.form === row.form));
    assert.equal(model.exercises.some(exercise => exercise.form === row.form), false);
  }
  assert.equal(new Set(model.registryExercises.map(exercise => exercise.form).filter(Boolean)).size, 170);
  assert.equal(new Set(model.exercises.map(exercise => exercise.form).filter(Boolean)).size, 165);
  for (const form of ['tearu', 'tearuPast', 'teiruNegative', 'teiruNegativePast', 'temiruDesire', 'temiruDesirePast']) {
    assert.equal(isTeachingFormDeferred(form), false, form);
    assert.ok(model.exercises.some(exercise => exercise.form === form), form);
  }
});

test('only registry-exclusive held atoms leave current gates, coverage and prerequisites', () => {
  assert.equal(model.components.filter(component => component.gating).length, 131);
  assert.deepEqual(model.components.filter(component => component.teachingDeferred).map(component => component.id), heldIds);
  for (const id of heldIds) {
    assert.equal(byId.get(id).gating, false, id);
    const declared = model.registryExercises.filter(exercise => exercise.kcIds.includes(id));
    assert.ok(declared.length > 0, id);
    assert.ok(declared.every(exercise => isTeachingFormDeferred(exercise.form)), id);
    assert.ok(model.exercises.every(exercise => !exercise.kcIds.includes(id) && !exercise.prerequisites.includes(id)), id);
    assert.ok(Object.values(model.courseKcIds).every(ids => !ids.includes(id)), id);
    for (const component of model.components) {
      assert.equal(component.prerequisites.includes(id), false, `${component.id}: ${id}`);
      assert.equal(component.coverageKcIds.includes(id), false, `${component.id}: ${id}`);
      assert.equal(component.masteryPrerequisites?.some(prerequisite => prerequisite.id === id) ?? false, false, `${component.id}: ${id}`);
    }
  }
  assert.deepEqual(new Set(model.registryExercises.filter(exercise => exercise.kcIds.includes('exception.aru-negative')).map(exercise => exercise.form)),
    new Set(['tearuNegative', 'tearuNegativePast']));
  assert.ok(model.registryExercises.some(exercise => exercise.prerequisites.includes('exception.aru-negative')),
    'the original rule path remains in the registry');
  const parent = byId.get('apply.tearu.continuation');
  assert.deepEqual(parent.coverageKcIds, ['facet.apply.tearu.past']);
  assert.deepEqual(parent.masteryPrerequisites.map(component => component.id), parent.prerequisites);
  for (const id of ['suffix.negative', 'compound.negative-past', 'adj.suffix.i-negative', 'adj.suffix.i-past', 'apply.tai.continuation']) {
    assert.equal(byId.get(id).gating, true, id);
    assert.ok(model.exercises.some(exercise => exercise.kcIds.includes(id)), id);
  }
  assert.deepEqual(auditKnowledgeModel(model), []);
});

test('paused atoms cannot block mastery, course completion, statistics or ordinary selection', () => {
  const current = profile();
  assert.equal(isComponentMastered(byId.get('apply.tearu.continuation'), current.byKc), true);
  for (const id of ['aspect', 'multiStepCompound']) {
    const course = UNIFIED_COURSES.find(course => course.id === id);
    const summary = summarizeUnifiedCourse(course, model.courseKcIds[id].map(kcId => byId.get(kcId)), current.introducedKcIds, current);
    assert.equal(summary.complete, true, id);
  }
  const snapshot = statisticsSnapshot(current, { ...model, courses: UNIFIED_COURSES });
  assert.equal(snapshot.all.kcs, 131);
  assert.equal(snapshot.all.mastered, 131);
  current.byKc['apply.tearu.continuation'] = emptySkillStats();
  const planner = createPracticePlanner(model);
  const assigned = planner.assign(planner.plan('aspect', current), current, { seed: 27 });
  assert.ok(assigned.length > 0);
  assert.ok(assigned.every(({ candidate }) => !isTeachingFormDeferred(candidate.form)));
  assert.ok(assigned.some(({ candidate }) => candidate.form === 'tearuPast'));
});

test('held forms retain original whole-form answers, accepted variants and recognition', () => {
  for (const form of newForms) {
    const examples = model.registryExercises.filter(exercise => exercise.form === form
      && ['書く', '読む', '食べる', 'する', '来る'].includes(exercise.item.surface));
    assert.ok(examples.length >= 3, form);
    for (const exercise of examples) {
      const original = deriveExercise(exercise.item, form), derived = deriveUnified(exercise.item, form);
      assert.equal(derived.answer, original.answer, exercise.id);
      assert.deepEqual(derived.acceptedVariants, original.acceptedVariants, exercise.id);
      for (const item of [exercise.item, { ...exercise.item, surface: exercise.item.reading, lexicalSurface: exercise.item.surface }]) {
        const answer = deriveUnified(item, form).answer;
        const recognized = recognizeForms(exercise.item, answer, normalizeAnswer).find(candidate => candidate.form === form);
        assert.ok(recognized, `${exercise.id}: ${answer}`);
        assert.equal(recognized.usage.reasonCode, 'user-directed-form-hold', exercise.id);
      }
    }
  }
});

test('a graph rebuild restores the original gate and dependencies when a declared form returns', () => {
  const words = domain => [...new Map(model.registryExercises.filter(exercise => exercise.item.domain === domain)
    .map(exercise => [exercise.item.surface, exercise.item])).values()];
  const before = [...USER_DIRECTED_DEFERRED_FORMS];
  // This isolates the graph projection. Releasing teaching supply additionally
  // requires the explicit user decision and content checks in the hold record.
  USER_DIRECTED_DEFERRED_FORMS.delete('tearuNegative');
  try {
    const restored = buildUnifiedKnowledge(page.VERB_KNOWLEDGE, page.ADJECTIVE_KNOWLEDGE,
      words('verb'), words('adjective'), curriculumSupportsVerbForm);
    const definitions = new Map(restored.components.map(component => [component.id, component]));
    assert.equal(definitions.get('exception.aru-negative').gating, true);
    assert.equal(definitions.get('exception.aru-negative').teachingDeferred, undefined);
    assert.deepEqual(definitions.get('exception.aru-negative').prerequisites, ['construction.tearu']);
    const parent = definitions.get('apply.tearu.continuation');
    assert.ok(parent.prerequisites.includes('exception.aru-negative'));
    assert.ok(parent.masteryPrerequisites.some(component => component.id === 'exception.aru-negative'));
    assert.ok(parent.coverageKcIds.includes('facet.apply.tearu.negative'));
    assert.ok(!parent.coverageKcIds.includes('facet.apply.tearu.negativePast'));
    assert.ok(restored.courseKcIds.aspect.includes('exception.aru-negative'));
    assert.deepEqual(restored.registryExercises, model.registryExercises);
  } finally {
    USER_DIRECTED_DEFERRED_FORMS.clear();
    for (const form of before) USER_DIRECTED_DEFERRED_FORMS.add(form);
  }
});

test('profile restore preserves paused rule scores and original failures without awarding credit', () => {
  const options = { today, at, components: model.components, exercises: model.exercises,
    legacyComponents: [...page.VERB_KNOWLEDGE.components, ...page.ADJECTIVE_KNOWLEDGE.components] };
  const source = parseUnifiedImport({ version: 5, date: today, attempted: 0, correct: 0, streak: 0, rotation: 0,
    byKc: {}, introducedKcIds: [] }, options);
  source.version = 7;
  delete source.statistics;
  for (const id of heldIds) source.byKc[id] = { ...emptySkillStats(), attempts: 1, correct: 0, filteredAccuracy: 0 };
  const oldExercises = newForms.map(form => model.registryExercises.find(exercise => exercise.form === form));
  for (const exercise of oldExercises) source.assessment = recordIndependentAttempt(source.assessment,
    { exercise, questionId: `historic:${exercise.form}`, correct: false, failedKcIds: exercise.kcIds.filter(id => heldIds.includes(id)), at });
  const before = structuredClone(source);
  const restored = parseUnifiedImport(createUnifiedExport(source, at), options);
  assert.deepEqual(restored.byKc, source.byKc);
  for (const field of ['byTarget', 'independentByKc', 'assistedByKc', 'originalCount', 'seenQuestionIds']) {
    assert.deepEqual(restored.assessment[field], source.assessment[field], field);
  }
  for (const exercise of oldExercises) {
    const key = assessmentTarget(exercise).key;
    assert.equal(restored.assessment.pending[key], undefined);
    const { suspension, ...pending } = restored.assessment.suspendedPending[key];
    assert.equal(suspension.reason, 'no-eligible-exercise');
    assert.deepEqual(pending, source.assessment.pending[key]);
    assert.equal(restored.assessment.byTarget[key].eligibleRetestCorrect, 0);
  }
  const resumed = reconcileAssessmentCatalog(restored.assessment, [...model.exercises, ...oldExercises], USAGE_REVIEW_VERSION);
  assert.deepEqual(resumed.pending, source.assessment.pending);
  assert.deepEqual(resumed.byTarget, source.assessment.byTarget);
  assert.deepEqual(parseUnifiedImport(createUnifiedExport(restored, at), options), restored);
  assert.deepEqual(source, before);
});

test('audit accepts only registry-proven exclusive holds and keeps ordinary undersupply checks', () => {
  const id = 'exception.aru-negative';
  const component = { id, gating: false, teachingDeferred: true, firstCourseIndex: 0,
    prerequisites: [], coverageKcIds: [] };
  const exercise = { id: 'historic', form: 'tearuNegative', item: { surface: '書く' },
    kcIds: [id], prerequisites: [], courseId: 'aspect', courseIndex: 0 };
  const fixture = () => ({ components: [structuredClone(component)], exercises: [],
    registryExercises: [structuredClone(exercise)], courseKcIds: { aspect: [] } });
  assert.deepEqual(auditKnowledgeModel(fixture()), []);
  for (const type of ['missing-registry', 'shared-rule', 'active-exercise', 'exercise-prerequisite', 'parent-prerequisite', 'parent-mastery', 'parent-coverage', 'course-requirement']) {
    const invalid = fixture();
    if (type === 'missing-registry') delete invalid.registryExercises;
    if (type === 'shared-rule') invalid.registryExercises.push({ ...exercise, form: 'tearuPast' });
    if (type === 'active-exercise') invalid.exercises.push(exercise);
    if (type === 'exercise-prerequisite') invalid.exercises.push({ ...exercise, form: 'tearuPast', kcIds: [], prerequisites: [id] });
    if (type.startsWith('parent-')) invalid.components.push({ id: 'parent', gating: false,
      prerequisites: type === 'parent-prerequisite' ? [id] : [], coverageKcIds: type === 'parent-coverage' ? [id] : [],
      masteryPrerequisites: type === 'parent-mastery' ? [component] : [] });
    if (type === 'course-requirement') invalid.courseKcIds.aspect.push(id);
    assert.ok(auditKnowledgeModel(invalid).some(issue => issue.code === 'invalid-teaching-deferred-kc' && issue.id === id), type);
  }
  const ordinaryGap = fixture();
  ordinaryGap.components[0] = { ...component, id: 'ordinary.rule', gating: true, teachingDeferred: undefined };
  assert.ok(auditKnowledgeModel(ordinaryGap).some(issue => issue.code === 'undersupplied-gating-kc' && issue.id === 'ordinary.rule'));
  const ordinaryFacet = fixture();
  ordinaryFacet.components[0] = { ...component, id: 'facet.ordinary', teachingDeferred: undefined };
  assert.ok(auditKnowledgeModel(ordinaryFacet).some(issue => issue.code === 'facet-parent-count'));
});
