import { canContinueRound, shouldReplan } from "./practice-session.mjs";
import {
  advanceIntroductions,
  isComponentMastered,
} from "./adaptive.mjs";
import { exerciseKey, recordRecentWord, wordKey } from "./exercise-selection.mjs";
import { evidenceCondition, scoreLearningEvidence } from "./learning-evidence.mjs";
import { createPracticePlanner } from "./practice-planning.mjs";

export function simulatePerfectLearning(model, options = {}) {
  return simulateLearning(model, options);
}

export function simulateLearning(model, { maxRounds = 1000, sessionLength = 12, answerFor = () => ({ correct: true }), initialProfile = null, mode = "adaptive", goalCourseId = null, stopWhen = null } = {}) {
  const gating = model.components.filter((component) => component.gating);
  const byId = new Map(model.components.map((component) => [component.id, component]));
  const planner = createPracticePlanner(model);
  let introducedKcIds = initialProfile?.introducedKcIds ? [...initialProfile.introducedKcIds] : gating.length ? [gating[0].id] : [];
  let byKc = structuredClone(initialProfile?.byKc ?? {});
  let recentWordKeys = [...initialProfile?.recentWordKeys ?? []];
  let rotation = initialProfile?.rotation ?? 0;
  let heldCourseId = goalCourseId;
  const state = () => ({ ...initialProfile, introducedKcIds, byKc, recentWordKeys, rotation });
  const targetReached = () => Boolean(stopWhen?.(state()));
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
    if (targetReached() || (introduced.length === gating.length && introduced.every((component) => isComponentMastered(component, byKc)))) break;
    const roundFocusIds = new Set();
    const usedKeys = new Set();
    const usedWordKeys = [];
    let roundCourseId = null;
    let previousFocus = null;
    let answered = 0;
    let coverageQuestions = 0;
    let roundRedundantFocusQuestions = 0;

    while (answered < sessionLength) {
      introduced = introducedKcIds.map((id) => byId.get(id)).filter(Boolean);
      const next = planner.plan(mode, state(), sessionLength - answered, heldCourseId);
      heldCourseId = next.goalCourseId;
      const { focus } = next;
      if (!focus || isComponentMastered(focus, byKc)) break;
      if (roundCourseId == null) roundCourseId = next.goalCourseId;
      if (next.goalCourseId !== roundCourseId) break;
      if (previousFocus && !canContinueRound(previousFocus, next, byKc, false)) break;
      roundFocusIds.add(focus.id);
      const assignments = planner.assign(next, state(), { seed: rounds.length + 1, usedKeys: [...usedKeys], usedWordKeys });
      if (!assignments.length || assignments.some(({ candidate }) => !candidate)) {
        return { completed: false, reason: "incomplete-round", focusId: focus.id, rounds, byKc, introducedKcIds };
      }

      let mastered = false;
      for (const { item, candidate } of assignments) {
        const key = exerciseKey(candidate);
        if (usedKeys.has(key)) return { completed: false, reason: "duplicate-round-exercise", focusId: focus.id, rounds, byKc, introducedKcIds };
        usedKeys.add(key);
        usedWordKeys.push(wordKey(candidate));
        recentWordKeys = recordRecentWord(recentWordKeys, candidate);
        if (item.id === focus.id && isComponentMastered(focus, byKc)) {
          redundantFocusQuestions += 1;
          roundRedundantFocusQuestions += 1;
          redundantByFocus.set(focus.id, (redundantByFocus.get(focus.id) ?? 0) + 1);
        }
        if (focus.coverageKcIds.some((id) => candidate.kcIds.includes(id))) coverageQuestions += 1;
        const answer = answerFor({ questionCount, focus: item, exercise: candidate, byKc });
        byKc = scoreLearningEvidence({ byKc }, { kcIds: candidate.kcIds, form: candidate.form, focusId: item.id,
          responseMs: 1200, answerLength: 4, ...answer, support: evidenceCondition(answer) }).byKc;
        answered += 1;
        questionCount += 1;
        if (targetReached() || shouldReplan(focus, byKc, next.review)) {
          mastered = true;
          break;
        }
        if (answered >= sessionLength) break;
      }
      if (!mastered || targetReached()) break;
      previousFocus = focus;

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
    rounds.push({ index: rounds.length + 1, courseId: roundCourseId, questionCount: answered, focusIds: [...roundFocusIds], coverageQuestions, redundantFocusQuestions: roundRedundantFocusQuestions, wordKeys: usedWordKeys });
    rotation += 1;
  }

  const completed = targetReached() || introducedKcIds.length === gating.length && gating.every((component) => introducedKcIds.includes(component.id) && isComponentMastered(component, byKc));
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
