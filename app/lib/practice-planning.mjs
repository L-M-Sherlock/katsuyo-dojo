import { adaptiveConstants, filterReadyExercises, isComponentMastered } from './adaptive.mjs';
import { assignPracticeExercises } from './exercise-selection.mjs';
import { isSourceClassification } from './learning-evidence.mjs';
import { planPractice } from './practice-session.mjs';

// An independent correct answer must improve performance or supply a missing
// coverage facet; source classification is assessed only by classification.
/** @param {any} exercise @param {any} byKc @param {Map<string, any>} byId @param {Set<string> | null} introduced */
export function exerciseHasLearningOpportunity(exercise, byKc, byId, introduced = null) {
  return exercise.kcIds.some(id => {
    if (introduced && !introduced.has(id)) return false;
    const kc = byId.get(id);
    if (!kc?.gating || isComponentMastered(kc, byKc)
      || (exercise.form != null && isSourceClassification(id))) return false;
    const stats = byKc[id];
    const missingCoverage = (kc.coverageKcIds ?? []).some(facet => exercise.kcIds.includes(facet) && !(byKc[facet]?.correct >= 1));
    // A parent waiting only for a particular facet cannot be advanced by
    // ordinary examples that omit that facet, even though it is not mastered.
    const needsPerformance = kc.coverageOnly
      ? stats?.filteredAccuracy != null && stats.filteredAccuracy < adaptiveConstants.accuracyTarget
      : (stats?.confidence ?? 0) < 1;
    return needsPerformance || missingCoverage;
  });
}

/** Page and simulations share the same eligibility and assignment rules.
 * @template {import('./adaptive.mjs').Component} C
 * @template {{id: string, courseId: string, courseIndex: number, form?: string | null, item: {surface: string, domain?: string}, kcIds: string[], prerequisites?: string[]}} E
 * @param {{components: C[], exercises: E[], courseKcIds: Record<string, string[]>}} model
 */
export function createPracticePlanner(model) {
  const byId = new Map(model.components.map(kc => [kc.id, kc]));
  /** @type {Map<string, E[]>} */
  const pools = new Map();
  for (const exercise of model.exercises) for (const id of exercise.kcIds) {
    // Conjugation success deliberately does not assess the source word's
    // classification. Such questions must not occupy classification slots.
    if (exercise.form != null && isSourceClassification(id)) continue;
    const key = `${exercise.courseId}:${id}`;
    if (!pools.has(key)) pools.set(key, []);
    pools.get(key).push(exercise);
  }
  const hasLearningOpportunity = (exercise, profile) => exerciseHasLearningOpportunity(exercise, profile.byKc, byId);
  function needsRefreshAfterAnswer(planned, plannedProfile, currentProfile, assignments, answeredIndex) {
    if (planned.review) return false;
    const remaining = assignments.slice(answeredIndex + 1);
    const next = remaining[0]?.candidate;
    if (!next) return true;
    if (hasLearningOpportunity(next, currentProfile)) return false;
    // Preserve deliberate balancing while useful questions remain, but do not
    // consume a queued learning substitute after its rule has already recovered.
    return hasLearningOpportunity(next, plannedProfile)
      || !remaining.some(({ candidate }) => hasLearningOpportunity(candidate, currentProfile));
  }
  const courseComponents = id => (model.courseKcIds[id] ?? []).map(id => byId.get(id)).filter(kc => kc !== undefined);
  function candidatesFor(kc, profile, goalCourseId = kc.firstCourseId) {
    const ready = courseId => filterReadyExercises(pools.get(`${courseId}:${kc.id}`) ?? [], kc.id, model.components, profile.byKc);
    const local = ready(goalCourseId);
    return local.length || goalCourseId === kc.firstCourseId || isComponentMastered(kc, profile.byKc) ? local : ready(kc.firstCourseId);
  }
  /** @param {string} mode @param {any} profile @param {number} length @param {string | null} preferredCourseId */
  function plan(mode, profile, length = 12, preferredCourseId = null) {
    const adaptive = mode === 'adaptive';
    const candidates = adaptive ? profile.introducedKcIds.map(id => byId.get(id)).filter(Boolean)
      : courseComponents(mode).filter(kc => kc.gating);
    return planPractice(candidates, profile.byKc, model.courseKcIds, { adaptive, length, rotation: profile.rotation,
      components: model.components, goalCourseId: adaptive ? preferredCourseId ?? profile.practiceGoalCourseId ?? null : mode,
      recoveryIds: adaptive ? candidates.filter(kc => (profile.byKc[kc.id]?.bestConfidence ?? 0) >= 1
        && (profile.byKc[kc.id]?.confidence ?? 0) < 1 && !isComponentMastered(kc, profile.byKc)).map(kc => kc.id) : [],
      candidatesFor: (kc, courseId) => candidatesFor(kc, profile, courseId) });
  }
  /** @param {ReturnType<typeof plan>} planned @param {any} profile @param {{seed?: number, usedKeys?: string[], usedWordKeys?: string[], restrictCourseId?: string | null}} options */
  function assign(planned, profile, { seed = 0, usedKeys = [], usedWordKeys = [], restrictCourseId = null } = {}) {
    return assignPracticeExercises(planned.plan, { allowReview: item => isComponentMastered(item, profile.byKc), isUseful: planned.review ? undefined : candidate => hasLearningOpportunity(candidate, profile), seed: seed + profile.rotation, byKc: profile.byKc,
      recentWordKeys: profile.recentWordKeys,
      usedKeys: planned.review ? [...new Set([...usedKeys, ...(profile.coursePractice?.[planned.goalCourseId] ?? [])])] : usedKeys,
      usedWordKeys,
      alternativesFor: (preferred, index) => {
        const others = planned.available.filter(kc => kc.id !== preferred.id);
        return others.length ? [...others.slice(index % others.length), ...others.slice(0, index % others.length)] : [];
      },
      candidatesFor: kc => candidatesFor(kc, profile, planned.goalCourseId).filter(exercise => !restrictCourseId || exercise.courseId === restrictCourseId) });
  }
  return { plan, assign, candidatesFor, courseComponents, hasLearningOpportunity, needsRefreshAfterAnswer };
}
