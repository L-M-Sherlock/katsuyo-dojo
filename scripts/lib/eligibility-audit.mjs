import { assessmentTarget } from '../../app/lib/learning-assessment.mjs';
import { emptySkillStats, filterReadyExercises } from '../../app/lib/adaptive.mjs';

const distinct = values => [...new Set(values)].sort();
const formKey = exercise => exercise.form ?? 'classify';
const courseFormKey = exercise => `${exercise.courseId}:${formKey(exercise)}`;
const countWords = exercises => distinct(exercises.map(exercise => assessmentTarget(exercise).wordKey)).length;
const bucket = count => count > 2 ? '3+' : String(count);
const summarize = exercises => ({ exercises: exercises.length, distinctWords: countWords(exercises), contexts: exercises.filter(exercise => exercise.context).length });

function indexExercises(exercises, keysFor) {
  const result = new Map();
  for (const exercise of exercises) for (const key of keysFor(exercise)) {
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(exercise);
  }
  return result;
}

function compareGroups(before, after, keysFor, expectedKeys = []) {
  const oldGroups = indexExercises(before, keysFor), newGroups = indexExercises(after, keysFor);
  return distinct([...oldGroups.keys(), ...newGroups.keys(), ...expectedKeys]).map(key => ({
    key, before: summarize(oldGroups.get(key) ?? []), after: summarize(newGroups.get(key) ?? []),
  }));
}

function snapshotComponent(component) {
  return { id: component.id, gating: component.gating, firstCourseId: component.firstCourseId,
    prerequisites: component.prerequisites, coverageKcIds: component.coverageKcIds };
}

/** Audit teaching supply against the declared, pre-usage-filter catalog.
 * The frozen snapshot protects the old knowledge requirements. Retest paths
 * may disappear, but are explicitly reported for suspension, never counted
 * as fulfilled. Full learning simulations check the actual lesson sequence.
 */
export function buildEligibilityReport(model, { courses, assessFormUsage, reviewedLexicalSense, reviewVersion, baseline = null }) {
  if (!Array.isArray(model.registryExercises)) throw new Error('Eligibility audit requires the pre-filter registryExercises');
  const before = model.registryExercises, after = model.exercises, issues = [];
  const byId = new Map(model.components.map(component => [component.id, component]));
  const currentIds = new Set(after.map(exercise => exercise.id));
  const registryIds = new Set(before.map(exercise => exercise.id));
  const components = compareGroups(before, after, exercise => exercise.kcIds, model.components.map(component => component.id));
  const coursesReport = compareGroups(before, after, exercise => [exercise.courseId], courses.map(course => course.id));
  const forms = compareGroups(before, after, exercise => [formKey(exercise)]);
  const courseForms = compareGroups(before, after, exercise => [courseFormKey(exercise)]);
  const retestPaths = compareGroups(before, after, exercise => [assessmentTarget(exercise).key]);
  const oldPaths = indexExercises(before, exercise => [assessmentTarget(exercise).key]);
  const newPaths = indexExercises(after, exercise => [assessmentTarget(exercise).key]);
  const wordExamples = exercises => [...new Map(exercises.map(exercise => [assessmentTarget(exercise).wordKey,
    { surface: exercise.item.surface, reading: exercise.item.reading }])).values()];
  for (const path of retestPaths) {
    const originals = oldPaths.get(path.key) ?? [], current = newPaths.get(path.key) ?? [];
    path.form = (originals[0] ?? current[0]).form;
    path.courseIds = distinct([...originals, ...current].map(exercise => exercise.courseId));
    path.beforeWords = wordExamples(originals);
    path.afterWords = wordExamples(current);
  }
  const usageById = new Map(), removed = [];
  for (const exercise of before) {
    if (reviewedLexicalSense && !reviewedLexicalSense(exercise.item)) issues.push({ code: 'unreviewed-lexical-sense', exerciseId: exercise.id });
    const usage = assessFormUsage(exercise.item, exercise.form);
    usageById.set(exercise.id, usage);
    if (!usage || !['allowed', 'blocked', 'context-required'].includes(usage.status)) {
      issues.push({ code: 'unreviewed-exercise', exerciseId: exercise.id });
      continue;
    }
    const suitable = usage.status === 'allowed' || usage.status === 'context-required' && Boolean(usage.context?.id && usage.context?.text);
    if (suitable && !currentIds.has(exercise.id)) issues.push({ code: 'suitable-exercise-omitted', exerciseId: exercise.id });
    if (!currentIds.has(exercise.id)) removed.push({ exerciseId: exercise.id, courseId: exercise.courseId,
      form: exercise.form, surface: exercise.item.surface, reading: exercise.item.reading,
      status: usage.status, category: usage.category ?? null, reason: usage.reason ?? null });
  }
  for (const exercise of after) {
    if (!registryIds.has(exercise.id)) issues.push({ code: 'exercise-outside-declared-registry', exerciseId: exercise.id });
    const usage = usageById.get(exercise.id);
    if (usage?.status === 'blocked') issues.push({ code: 'blocked-exercise-in-practice', exerciseId: exercise.id });
    if (usage?.status === 'context-required' && (!exercise.context?.id || !exercise.context?.text ||
      exercise.context.id !== usage.context?.id || exercise.context.text !== usage.context?.text)) {
      issues.push({ code: 'missing-reviewed-context', exerciseId: exercise.id });
    }
    if (exercise.context && /[\u3041-\u3096\u30a1-\u30fa]/u.test(exercise.context.text)) {
      issues.push({ code: 'japanese-answer-leak-in-context', exerciseId: exercise.id });
    }
    for (const id of [...exercise.kcIds, ...exercise.prerequisites ?? []]) {
      if (!byId.has(id)) issues.push({ code: 'unknown-exercise-requirement', id, exerciseId: exercise.id });
    }
  }
  for (const group of courseForms) if (group.after.exercises === 0) issues.push({ code: 'empty-course-form', id: group.key });
  for (const group of coursesReport) if (group.after.exercises < 12) issues.push({ code: 'undersupplied-course', id: group.key, exercises: group.after.exercises });
  const mastered = Object.fromEntries(model.components.map(component => [component.id, { ...emptySkillStats(), attempts: 5, correct: 5, filteredAccuracy: 1, confidence: 1 }]));
  const introductionSupply = [];
  for (const component of model.components) {
    for (const id of [...component.prerequisites, ...component.coverageKcIds]) {
      if (!byId.has(id)) issues.push({ code: 'missing-declared-requirement', id, componentId: component.id });
    }
    const candidates = after.filter(exercise => exercise.courseId === component.firstCourseId && exercise.kcIds.includes(component.id));
    const prior = { ...mastered, [component.id]: emptySkillStats() };
    for (const id of component.coverageKcIds) prior[id] = emptySkillStats();
    const ready = filterReadyExercises(candidates, component.id, model.components, prior);
    introductionSupply.push({ id: component.id, courseId: component.firstCourseId, ...summarize(ready) });
    if (component.id.startsWith('facet.') && !ready.length) issues.push({ code: 'untrainable-facet', id: component.id });
    if (component.gating) {
      const minimum = component.coverageOnly ? component.coverageKcIds.length : 5;
      if (ready.length < minimum) issues.push({ code: 'undersupplied-gating-requirement', id: component.id, exercises: ready.length, minimum });
    }
    for (const id of component.coverageKcIds) if (!ready.some(exercise => exercise.kcIds.includes(id))) {
      issues.push({ code: 'unreachable-declared-facet', id, parentId: component.id });
    }
  }
  if (baseline) {
    for (const original of baseline.components) {
      const current = byId.get(original.id);
      if (!current) issues.push({ code: 'removed-original-component', id: original.id });
      else if (JSON.stringify(snapshotComponent(current)) !== JSON.stringify(original)) {
        issues.push({ code: 'changed-original-requirements', id: original.id });
      }
    }
    for (const group of courseForms) {
      const original = baseline.courseForms[group.key];
      if (original && (group.before.exercises < original.exercises || group.before.distinctWords < original.distinctWords)) {
        issues.push({ code: 'shrunk-declared-registry', id: group.key });
      }
    }
    const courseFormIds = new Set(courseForms.map(group => group.key));
    for (const id of Object.keys(baseline.courseForms)) if (!courseFormIds.has(id)) issues.push({ code: 'removed-original-course-form', id });
    const pathsById = new Map(retestPaths.map(path => [path.key, path]));
    for (const [id, original] of Object.entries(baseline.targets ?? {})) {
      const current = pathsById.get(id);
      if (!current || current.before.exercises < original.exercises || current.before.distinctWords < original.distinctWords) {
        issues.push({ code: 'changed-original-rule-path', id });
      }
    }
  }
  const pathBuckets = side => Object.fromEntries(['0', '1', '2', '3+'].map(key => [key, retestPaths.filter(path => bucket(path[side].distinctWords) === key).length]));
  const removedReasons = Object.entries(Object.groupBy(removed, item => `${item.category ?? 'unspecified'}:${item.reason ?? item.status}`))
    .map(([reason, entries]) => ({ reason, exercises: entries.length, examples: entries.slice(0, 3).map(entry => entry.exerciseId) }))
    .sort((a, b) => b.exercises - a.exercises || a.reason.localeCompare(b.reason));
  const counts = { courses: courses.length, forms: forms.filter(form => form.key !== 'classify').length,
    components: model.components.length, gating: model.components.filter(component => component.gating).length,
    facets: model.components.filter(component => component.id.startsWith('facet.')).length };
  if (baseline?.summary) for (const [field, value] of Object.entries(counts)) {
    if (value !== baseline.summary[field]) issues.push({ code: 'changed-curriculum-size', field, before: baseline.summary[field], after: value });
  }
  return {
    reviewVersion, baselineCommit: baseline?.sourceCommit ?? null,
    summary: { ...counts,
      before: summarize(before), after: summarize(after), removed: removed.length,
      retestPaths: { before: retestPaths.filter(path => path.before.exercises).length, after: retestPaths.filter(path => path.after.exercises).length,
        beforeWordBuckets: pathBuckets('before'), afterWordBuckets: pathBuckets('after') } },
    courses: coursesReport, forms, courseForms, components,
    facets: components.filter(component => component.key.startsWith('facet.')),
    introductionSupply, retestPaths, removedReasons, removed, issues,
  };
}
