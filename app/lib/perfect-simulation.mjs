import {
  advanceIntroductions,
  balanceComponentsForCourse,
  isComponentMastered,
  makeRoundPlan,
  makeUniqueAssignments,
  rankExercisesForFocus,
  selectFocus,
  updateKnowledgeStats,
} from "./adaptive.mjs";

export function simulatePerfectLearning(model, { maxRounds = 1000, sessionLength = 12 } = {}) {
  const gating = model.components.filter((component) => component.gating);
  const byId = new Map(model.components.map((component) => [component.id, component]));
  let introducedKcIds = gating.length ? [gating[0].id] : [];
  let byKc = {};
  let rotation = 0;
  let redundantFocusQuestions = 0;
  let preMasteredIntroductions = 0;
  let longestFocusRun = { id: null, rounds: 0 };
  let currentFocusRun = { id: null, rounds: 0 };
  const focusRounds = new Map();
  const redundantByFocus = new Map();
  const courseRounds = new Map();
  const unlockEvents = [];
  const rounds = [];

  while (rounds.length < maxRounds) {
    const introduced = introducedKcIds.map((id) => byId.get(id)).filter(Boolean);
    if (introduced.length === gating.length && introduced.every((component) => isComponentMastered(component, byKc))) break;
    const focus = selectFocus(introduced, byKc);
    if (!focus) return { completed: false, reason: "no-focus", rounds, byKc, introducedKcIds };
    const balanced = balanceComponentsForCourse(focus, introduced, model.courseKcIds[focus.firstCourseId] ?? []);
    const plan = makeRoundPlan(focus, balanced, sessionLength, rotation);
    const assignments = makeUniqueAssignments(plan, {
      alternativesFor: (preferred, index) => {
        const others = balanced.filter((component) => component.id !== preferred.id);
        return others.length ? [...others.slice(index % others.length), ...others.slice(0, index % others.length)] : [];
      },
      candidatesFor: (component) => rankExercisesForFocus(
        model.exercises.filter((exercise) => exercise.courseIndex === focus.firstCourseIndex && exercise.kcIds.includes(component.id)),
        component.id,
        byKc,
        component.coverageKcIds,
      ),
      keyOf: (_component, exercise) => `${exercise.form ?? "classify"}:${exercise.verb.surface}`,
      orderedCandidates: (component) => component.coverageKcIds.length > 0 || component.id === "exception.ru-godan",
      seed: rotation + 1,
    });
    if (assignments.length !== sessionLength || assignments.some(({ candidate }) => !candidate)) {
      return { completed: false, reason: "incomplete-round", focusId: focus.id, rounds, byKc, introducedKcIds };
    }

    let focusQuestions = 0;
    let coverageQuestions = 0;
    let roundRedundantFocusQuestions = 0;
    for (const { item, candidate } of assignments) {
      if (item.id === focus.id) {
        focusQuestions += 1;
        if (isComponentMastered(focus, byKc)) {
          redundantFocusQuestions += 1;
          roundRedundantFocusQuestions += 1;
          redundantByFocus.set(focus.id, (redundantByFocus.get(focus.id) ?? 0) + 1);
        }
      }
      if (focus.coverageKcIds.some((id) => candidate.kcIds.includes(id))) coverageQuestions += 1;
      byKc = updateKnowledgeStats(byKc, {
        kcIds: candidate.kcIds,
        focusId: item.id,
        correct: true,
        responseMs: 1200,
        answerLength: 4,
      });
    }

    const advanced = advanceIntroductions(model.components, introducedKcIds, byKc);
    for (const component of advanced.added) {
      if (isComponentMastered(component, byKc)) preMasteredIntroductions += 1;
    }
    introducedKcIds = advanced.introducedKcIds;
    unlockEvents.push(...advanced.added.map((component) => ({ round: rounds.length + 1, id: component.id, courseId: component.firstCourseId })));
    focusRounds.set(focus.id, (focusRounds.get(focus.id) ?? 0) + 1);
    courseRounds.set(focus.firstCourseId, (courseRounds.get(focus.firstCourseId) ?? 0) + 1);
    currentFocusRun = currentFocusRun.id === focus.id ? { id: focus.id, rounds: currentFocusRun.rounds + 1 } : { id: focus.id, rounds: 1 };
    if (currentFocusRun.rounds > longestFocusRun.rounds) longestFocusRun = { ...currentFocusRun };
    rounds.push({ index: rounds.length + 1, focusId: focus.id, courseId: focus.firstCourseId, focusQuestions, coverageQuestions, redundantFocusQuestions: roundRedundantFocusQuestions, introduced: advanced.added.map((component) => component.id) });
    rotation += 1;
  }

  const completed = introducedKcIds.length === gating.length && gating.every((component) => introducedKcIds.includes(component.id) && isComponentMastered(component, byKc));
  const attempts = gating.map((component) => byKc[component.id]?.attempts ?? 0);
  const repeatedFocusKcs = [...focusRounds].filter(([, count]) => count > 1).map(([id, count]) => ({ id, rounds: count }));
  return {
    completed,
    reason: completed ? null : "max-rounds",
    roundCount: rounds.length,
    questionCount: rounds.length * sessionLength,
    gatingCount: gating.length,
    facetCount: model.components.filter((component) => component.id.startsWith("facet.")).length,
    introducedCount: introducedKcIds.length,
    masteredCount: gating.filter((component) => isComponentMastered(component, byKc)).length,
    redundantFocusQuestions,
    redundantByFocus: Object.fromEntries(redundantByFocus),
    preMasteredIntroductions,
    longestFocusRun,
    minGatingAttempts: attempts.length ? Math.min(...attempts) : 0,
    maxGatingAttempts: attempts.length ? Math.max(...attempts) : 0,
    focusRounds: Object.fromEntries(focusRounds),
    repeatedFocusKcs,
    courseRounds: Object.fromEntries(courseRounds),
    completedFacetCount: model.components.filter((component) => component.id.startsWith("facet.") && (byKc[component.id]?.correct ?? 0) >= 1).length,
    unlockEvents,
    rounds,
    byKc,
    introducedKcIds,
  };
}
