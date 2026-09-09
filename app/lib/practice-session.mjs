// @ts-check
import { balanceComponentsForCourse, correctAnswersNeeded, isComponentMastered, makeRoundPlan, selectFocus } from './adaptive.mjs';

/** @typedef {import('./adaptive.mjs').Component} Component */
/** @typedef {import('./adaptive.mjs').StatsMap} StatsMap */

/** @returns {{shown: boolean, used: boolean}} */
export function emptyHintState() { return { shown: false, used: false }; }
/** @param {{shown: boolean, used: boolean}} state */
export function toggleHint(state) { return { shown: !state.shown, used: true }; }

/**
 * Shared by the UI and learning simulations. Once everything available is
 * mastered, rotate courses first, then their owned atoms on successive visits.
 * @template {Component} C
 * @param {C[]} candidates
 * @param {StatsMap} byKc
 * @param {Record<string, string[]>} courseKcIds
 * @param {{adaptive?: boolean, length?: number, rotation?: number, components?: C[], goalCourseId?: string | null, recoveryIds?: string[], candidatesFor?: (component: C, courseId: string) => unknown[]}} options
 */
export function planPractice(candidates, byKc, courseKcIds, { adaptive = true, length = 12, rotation = 0, components = candidates, goalCourseId = null, recoveryIds = [], candidatesFor } = {}) {
  const review = candidates.length > 0 && candidates.every((kc) => isComponentMastered(kc, byKc));
  let focus = selectFocus(candidates, byKc);
  const byId = new Map(components.map(kc => [kc.id, kc]));
  const retained = goalCourseId && candidates.some(kc => (kc.firstCourseId === goalCourseId || courseKcIds[goalCourseId]?.includes(kc.id)) && !isComponentMastered(kc, byKc));
  let goal = retained ? goalCourseId : focus?.firstCourseId ?? null;
  let scoped = candidates;
  let globalRecovery = false;
  if (review) {
    if (!adaptive && goalCourseId) {
      goal = goalCourseId;
      scoped = candidatesFor ? candidates.filter(kc => candidatesFor(kc, goalCourseId).length) : candidates;
      focus = scoped[rotation % scoped.length] ?? null;
    } else {
      const courses = [...new Set(candidates.map((kc) => kc.firstCourseId))];
      const course = courses[rotation % courses.length];
      const owned = candidates.filter((kc) => kc.firstCourseId === course);
      focus = owned[Math.floor(rotation / courses.length) % owned.length];
      goal = focus.firstCourseId;
    }
  } else if (focus && candidatesFor) {
    // Recover the prerequisites of this course before trying a downstream
    // atom with an empty pool. A supplied full model also lets a specialty
    // recover prerequisites taught in another course.
    scoped = candidates.filter(kc => kc.firstCourseId === goal || courseKcIds[goal ?? '']?.includes(kc.id));
    /** @type {Map<string, C>} */
    const leaves = new Map();
    /** @param {C} kc @param {Set<string>} path */
    const visit = (kc, path = new Set()) => {
      if (isComponentMastered(kc, byKc) || path.has(kc.id)) return;
      const nextPath = new Set([...path, kc.id]);
      const missing = kc.prerequisites.map(id => byId.get(id)).filter(prerequisite => prerequisite !== undefined && !isComponentMastered(prerequisite, byKc));
      if (missing.length) { for (const prerequisite of missing) if (prerequisite) visit(prerequisite, nextPath); return; }
      if (candidatesFor(kc, goal ?? kc.firstCourseId).length) leaves.set(kc.id, kc);
    };
    const recoveries = recoveryIds.map(id => byId.get(id)).filter(kc => kc !== undefined && !isComponentMastered(kc, byKc));
    for (const kc of recoveries) if (kc) visit(kc);
    globalRecovery = leaves.size > 0;
    if (!globalRecovery) for (const kc of scoped) visit(kc);
    focus = selectFocus([...leaves.values()], byKc);
    scoped = [...new Map([...scoped, ...leaves.values()].map(kc => [kc.id, kc])).values()];
  }
  const balanced = adaptive && focus
    ? balanceComponentsForCourse(focus, scoped, courseKcIds[goal ?? focus.firstCourseId] ?? [])
    : scoped;
  const available = candidatesFor ? balanced.filter(kc => candidatesFor(kc, goal ?? kc.firstCourseId).length) : balanced;
  return { focus, review, goalCourseId: goal, globalRecovery, available, plan: makeRoundPlan(focus, available, length, rotation) };
}

/**
 * A review round lasts its full length even when the selected atom is mastered.
 * @param {Component | null} focus
 * @param {StatsMap} byKc
 * @param {boolean} review
 */
export function shouldReplan(focus, byKc, review) {
  return !review && !!focus && isComponentMastered(focus, byKc);
}

/** @param {Component | null} previous @param {{focus: Component | null, plan: Component[]}} next @param {StatsMap} byKc @param {boolean} adaptive */
export function canContinueRound(previous, next, byKc, adaptive) {
  return !!next.focus && next.focus.id !== previous?.id &&
    !isComponentMastered(next.focus, byKc) &&
    (!adaptive || next.focus.firstCourseId === previous?.firstCourseId) &&
    correctAnswersNeeded(next.focus, byKc) <= next.plan.filter((kc) => kc.id === next.focus?.id).length;
}
