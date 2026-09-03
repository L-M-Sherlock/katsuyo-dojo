import {
  advanceIntroductions,
  balanceComponentsForCourse,
  correctAnswersNeeded,
  isComponentMastered,
  makeRoundPlan,
  makeUniqueAssignments,
  rankExercisesForFocus,
  selectFocus,
  updateKnowledgeStats,
} from "./adaptive.mjs";

function assignmentSegment(model, focus, introduced, byKc, length, rotation, usedKeys) {
  const balanced = balanceComponentsForCourse(focus, introduced, model.courseKcIds[focus.firstCourseId] ?? []);
  const plan = makeRoundPlan(focus, balanced, length, rotation);
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
    usedKeys,
  });
  return { assignments, plan };
}

export function simulatePerfectLearning(model, { maxRounds = 1000, sessionLength = 12 } = {}) {
  const gating = model.components.filter((component) => component.gating);
  const byId = new Map(model.components.map((component) => [component.id, component]));
  let introducedKcIds = gating.length ? [gating[0].id] : [];
  let byKc = {};
  let rotation = 0;
  let questionCount = 0;
  let redundantFocusQuestions = 0;
  let preMasteredIntroductions = 0;
  const focusRounds = new Map();
  const redundantByFocus = new Map();
  const courseRounds = new Map();
  const unlockEvents = [];
  const rounds = [];

  while (rounds.length < maxRounds) {
    let introduced = introducedKcIds.map((id) => byId.get(id)).filter(Boolean);
    if (introduced.length === gating.length && introduced.every((component) => isComponentMastered(component, byKc))) break;
    const roundFocusIds = new Set();
    const usedKeys = new Set();
    let roundCourseId = null;
    let answered = 0;
    let coverageQuestions = 0;
    let roundRedundantFocusQuestions = 0;

    while (answered < sessionLength) {
      introduced = introducedKcIds.map((id) => byId.get(id)).filter(Boolean);
      const focus = selectFocus(introduced, byKc);
      if (!focus || isComponentMastered(focus, byKc)) break;
      if (roundCourseId == null) roundCourseId = focus.firstCourseId;
      if (focus.firstCourseId !== roundCourseId) break;
      const remaining = sessionLength - answered;
      const segment = assignmentSegment(model, focus, introduced, byKc, remaining, rotation, [...usedKeys]);
      const focusOpportunities = segment.plan.filter((component) => component.id === focus.id).length;
      if (correctAnswersNeeded(focus, byKc) > focusOpportunities) break;
      roundFocusIds.add(focus.id);
      const { assignments } = segment;
      if (!assignments.length || assignments.some(({ candidate }) => !candidate)) {
        return { completed: false, reason: "incomplete-round", focusId: focus.id, rounds, byKc, introducedKcIds };
      }

      let mastered = false;
      for (const { item, candidate } of assignments) {
        const key = `${candidate.form ?? "classify"}:${candidate.verb.surface}`;
        if (usedKeys.has(key)) return { completed: false, reason: "duplicate-round-exercise", focusId: focus.id, rounds, byKc, introducedKcIds };
        usedKeys.add(key);
        if (item.id === focus.id && isComponentMastered(focus, byKc)) {
          redundantFocusQuestions += 1;
          roundRedundantFocusQuestions += 1;
          redundantByFocus.set(focus.id, (redundantByFocus.get(focus.id) ?? 0) + 1);
        }
        if (focus.coverageKcIds.some((id) => candidate.kcIds.includes(id))) coverageQuestions += 1;
        byKc = updateKnowledgeStats(byKc, { kcIds: candidate.kcIds, focusId: item.id, correct: true, responseMs: 1200, answerLength: 4 });
        answered += 1;
        questionCount += 1;
        if (isComponentMastered(focus, byKc)) {
          mastered = true;
          break;
        }
        if (answered >= sessionLength) break;
      }
      if (!mastered) break;

      const advanced = advanceIntroductions(model.components, introducedKcIds, byKc);
      for (const component of advanced.added) {
        if (isComponentMastered(component, byKc)) preMasteredIntroductions += 1;
      }
      introducedKcIds = advanced.introducedKcIds;
      unlockEvents.push(...advanced.added.map((component) => ({ round: rounds.length + 1, id: component.id, courseId: component.firstCourseId })));
    }

    if (answered === 0) return { completed: false, reason: "no-progress", rounds, byKc, introducedKcIds };
    for (const id of roundFocusIds) focusRounds.set(id, (focusRounds.get(id) ?? 0) + 1);
    courseRounds.set(roundCourseId, (courseRounds.get(roundCourseId) ?? 0) + 1);
    rounds.push({ index: rounds.length + 1, courseId: roundCourseId, questionCount: answered, focusIds: [...roundFocusIds], coverageQuestions, redundantFocusQuestions: roundRedundantFocusQuestions });
    rotation += 1;
  }

  const completed = introducedKcIds.length === gating.length && gating.every((component) => introducedKcIds.includes(component.id) && isComponentMastered(component, byKc));
  const attempts = gating.map((component) => byKc[component.id]?.attempts ?? 0);
  const repeatedFocusKcs = [...focusRounds].filter(([, count]) => count > 1).map(([id, count]) => ({ id, rounds: count }));
  const longestFocusRun = repeatedFocusKcs.sort((a, b) => b.rounds - a.rounds)[0] ?? { id: [...focusRounds.keys()][0] ?? null, rounds: focusRounds.size ? 1 : 0 };
  return {
    completed,
    reason: completed ? null : "max-rounds",
    roundCount: rounds.length,
    questionCount,
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
