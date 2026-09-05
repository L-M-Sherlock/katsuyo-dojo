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
 * @param {{adaptive?: boolean, length?: number, rotation?: number}} options
 */
export function planPractice(candidates, byKc, courseKcIds, { adaptive = true, length = 12, rotation = 0 } = {}) {
  const review = candidates.length > 0 && candidates.every((kc) => isComponentMastered(kc, byKc));
  let focus = selectFocus(candidates, byKc);
  if (review) {
    const courses = [...new Set(candidates.map((kc) => kc.firstCourseId))];
    const course = courses[rotation % courses.length];
    const owned = candidates.filter((kc) => kc.firstCourseId === course);
    focus = owned[Math.floor(rotation / courses.length) % owned.length];
  }
  const balanced = adaptive && focus
    ? balanceComponentsForCourse(focus, candidates, courseKcIds[focus.firstCourseId] ?? [])
    : candidates;
  return { focus, review, plan: makeRoundPlan(focus, balanced, length, rotation) };
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
