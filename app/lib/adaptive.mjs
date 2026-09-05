// @ts-check
/** @typedef {{attempts: number, correct: number, filteredAccuracy: number | null, confidence: number, bestConfidence: number, cleanTimeTotal: number, cleanTimeCount: number}} SkillStats */
/** @typedef {Record<string, SkillStats>} StatsMap */
/** @typedef {{id: string, order: number, gating: boolean, firstCourseId: string, firstCourseIndex: number, prerequisites: string[], coverageKcIds: string[], coverageOnly?: boolean}} Component */
/** @typedef {{correct: boolean, hintUsed?: boolean, revealed?: boolean, responseMs?: number, answerLength?: number}} Evidence */

const ACCURACY_TARGET = 0.85;
const EMA_ALPHA = 0.2;
const MIN_ATTEMPTS = 5;

/** @returns {SkillStats} */
export function emptySkillStats() {
  return {
    attempts: 0,
    correct: 0,
    filteredAccuracy: null,
    confidence: 0,
    bestConfidence: 0,
    cleanTimeTotal: 0,
    cleanTimeCount: 0,
  };
}

/** @param {Evidence} result */
export function evidenceValue({ correct, hintUsed = false, revealed = false }) {
  if (!correct || revealed) return 0;
  return hintUsed ? 0.7 : 1;
}

/** @param {number | null} filteredAccuracy @param {number} attempts */
export function confidenceOf(filteredAccuracy, attempts) {
  if (filteredAccuracy == null || attempts === 0) return 0;
  const evidence = Math.min(attempts / MIN_ATTEMPTS, 1);
  return Math.min((filteredAccuracy / ACCURACY_TARGET) * evidence, 1);
}

/** @param {SkillStats | undefined} current @param {Evidence} result */
export function updateSkillStats(current, result) {
  const stats = current ?? emptySkillStats();
  const evidence = evidenceValue(result);
  const filteredAccuracy = stats.filteredAccuracy == null
    ? evidence
    : stats.filteredAccuracy + EMA_ALPHA * (evidence - stats.filteredAccuracy);
  const attempts = stats.attempts + 1;
  const confidence = confidenceOf(filteredAccuracy, attempts);
  const cleanTime = result.correct && !result.hintUsed && !result.revealed &&
    typeof result.responseMs === "number" && Number.isFinite(result.responseMs) && result.responseMs >= 300 && result.responseMs <= 60000
    ? result.responseMs / Math.max(result.answerLength ?? 1, 1)
    : null;

  return {
    attempts,
    correct: stats.correct + (result.correct ? 1 : 0),
    filteredAccuracy,
    confidence,
    bestConfidence: Math.max(stats.bestConfidence, confidence),
    cleanTimeTotal: stats.cleanTimeTotal + (cleanTime ?? 0),
    cleanTimeCount: stats.cleanTimeCount + (cleanTime == null ? 0 : 1),
  };
}

/** @template {{id: string, kcIds: string[]}} E @param {E[]} exercises @param {string} focusId @param {StatsMap} byKc @param {string[]} coverageKcIds */
export function rankExercisesForFocus(exercises, focusId, byKc, coverageKcIds = []) {
  /** @param {E} exercise */
  const lexicalConfidence = (exercise) => {
    const lexicalId = exercise.kcIds.find((id) => id.startsWith("lexeme."));
    return lexicalId ? byKc[lexicalId]?.confidence ?? 0 : 1;
  };
  /** @param {E} exercise */
  const burden = (exercise) => exercise.kcIds.reduce((sum, id) => sum + (id === focusId ? 0 : 1 - (byKc[id]?.confidence ?? 0)), 0);
  if (coverageKcIds.length) {
    const groups = new Map();
    for (const exercise of [...exercises].sort((a, b) => burden(a) - burden(b) || a.id.localeCompare(b.id))) {
      const facetId = exercise.kcIds.find((id) => coverageKcIds.includes(id)) ?? "other";
      if (!groups.has(facetId)) groups.set(facetId, []);
      groups.get(facetId).push(exercise);
    }
    const orderedGroups = [...groups].sort(([a], [b]) => {
      const aCovered = Math.min(byKc[a]?.correct ?? 0, 1);
      const bCovered = Math.min(byKc[b]?.correct ?? 0, 1);
      return aCovered - bCovered || a.localeCompare(b);
    }).map(([, group]) => group);
    return [...orderedGroups.map((group) => group[0]), ...orderedGroups.flatMap((group) => group.slice(1))];
  }
  if (focusId === "class.irregular") {
    const groups = new Map();
    for (const exercise of [...exercises].sort((a, b) => burden(a) - burden(b) || a.id.localeCompare(b.id))) {
      const facetId = exercise.kcIds.find((id) => id.startsWith("facet.class.irregular.")) ?? "other";
      if (!groups.has(facetId)) groups.set(facetId, []);
      groups.get(facetId).push(exercise);
    }
    const orderedGroups = [...groups].sort(([a], [b]) => {
      const aCovered = Math.min(byKc[a]?.correct ?? 0, 1);
      const bCovered = Math.min(byKc[b]?.correct ?? 0, 1);
      return aCovered - bCovered || a.localeCompare(b);
    }).map(([, group]) => group);
    return [...orderedGroups.map((group) => group[0]), ...orderedGroups.flatMap((group) => group.slice(1))];
  }
  return [...exercises].sort((a, b) => {
    if (focusId === "exception.ru-godan") {
      const lexicalDifference = lexicalConfidence(a) - lexicalConfidence(b);
      if (lexicalDifference) return lexicalDifference;
    }
    return burden(a) - burden(b) || a.id.localeCompare(b.id);
  });
}

/** Keep a simpler candidate while an additional dependent rule is not mastered. */
/** @template {{kcIds: string[]}} E @param {E[]} exercises @param {string} focusId @param {Component[]} components @param {StatsMap} byKc */
export function filterReadyExercises(exercises, focusId, components, byKc) {
  const byId = new Map(components.map((component) => [component.id, component]));
  const ready = exercises.filter((exercise) => exercise.kcIds.every((id) => {
    if (id === focusId) return true;
    const component = byId.get(id);
    if (!component?.gating || component.prerequisites.length === 0) return true;
    return component.prerequisites.every((prerequisiteId) => {
      const prerequisite = byId.get(prerequisiteId);
      return !prerequisite || isComponentMastered(prerequisite, byKc);
    });
  }));
  return ready.length ? ready : exercises;
}

/** @param {Component} component @param {StatsMap} byKc */
export function componentConfidence(component, byKc) {
  const confidence = byKc[component.id]?.confidence ?? 0;
  const coverageComplete = (component.coverageKcIds ?? []).every((id) => (byKc[id]?.correct ?? 0) >= 1);
  // Coverage is historical; recent independent performance still determines
  // whether a previously covered atom needs recovery. Legacy facet-only data
  // has no parent accuracy and retains its existing coverage interpretation.
  if (component.coverageOnly && coverageComplete) {
    const accuracy = byKc[component.id]?.filteredAccuracy;
    return accuracy == null ? 1 : Math.min(accuracy / ACCURACY_TARGET, 1);
  }
  return coverageComplete ? confidence : Math.min(confidence, 0.99);
}

/** @param {Component} component @param {StatsMap} byKc */
export function isComponentMastered(component, byKc) {
  return componentConfidence(component, byKc) >= 1;
}

/** @param {Component} component @param {StatsMap} byKc @param {number} maximum */
export function correctAnswersNeeded(component, byKc, maximum = 100) {
  if (isComponentMastered(component, byKc)) return 0;
  const missingCoverage = (component.coverageKcIds ?? []).filter((id) => (byKc[id]?.correct ?? 0) < 1).length;
  if (component.coverageOnly) {
    let stats = byKc[component.id];
    let needed = 0;
    while (needed < maximum && (needed < missingCoverage ||
      (stats?.filteredAccuracy != null && stats.filteredAccuracy < ACCURACY_TARGET))) {
      stats = updateSkillStats(stats, { correct: true });
      needed += 1;
    }
    return needed;
  }
  let stats = byKc[component.id];
  let correctAnswers = 0;
  while ((stats?.confidence ?? 0) < 1 && correctAnswers < maximum) {
    stats = updateSkillStats(stats, { correct: true });
    correctAnswers += 1;
  }
  return Math.max(correctAnswers, missingCoverage);
}

/** @template {Component} C @param {C[]} components @param {StatsMap} byKc @returns {C | null} */
export function selectFocus(components, byKc) {
  return [...components].sort((a, b) => {
    const aMastered = isComponentMastered(a, byKc);
    const bMastered = isComponentMastered(b, byKc);
    if (aMastered !== bMastered) return aMastered ? 1 : -1;
    const confidenceDifference = componentConfidence(a, byKc) - componentConfidence(b, byKc);
    return confidenceDifference || a.order - b.order || a.id.localeCompare(b.id);
  })[0] ?? null;
}

/** @param {StatsMap} byKc @param {Evidence & {kcIds: string[], focusId: string, failedKcId?: string | null, confirmedKcIds?: string[]}} result */
export function updateKnowledgeStats(byKc, { kcIds, focusId, failedKcId = /** @type {string | null} */ (null), confirmedKcIds = [], ...result }) {
  const next = { ...byKc };
  const affected = result.correct ? [...new Set(kcIds)] : [failedKcId ?? focusId].filter(Boolean);
  for (const kcId of affected) {
    next[kcId] = updateSkillStats(next[kcId], {
      ...result,
      responseMs: kcId === focusId ? result.responseMs : undefined,
    });
  }
  if (!result.correct && !result.revealed && failedKcId) {
    const required = new Set(kcIds);
    for (const kcId of new Set(confirmedKcIds)) {
      if (kcId === failedKcId || !required.has(kcId)) continue;
      next[kcId] = updateSkillStats(next[kcId], { ...result, correct: true, responseMs: undefined });
    }
  }
  return next;
}

/** @template {Component} C @param {C[]} components @param {string[]} introducedKcIds @param {StatsMap} byKc @returns {C | null} */
export function findNextIntroducible(components, introducedKcIds, byKc) {
  const introduced = new Set(introducedKcIds);
  const active = components.filter((component) => component.gating && introduced.has(component.id));
  if (active.some((component) => !isComponentMastered(component, byKc))) return null;

  return components.find((component) => {
    if (!component.gating || introduced.has(component.id)) return false;
    const prerequisitesReady = component.prerequisites.every((id) => {
      const prerequisite = components.find((candidate) => candidate.id === id);
      return prerequisite ? isComponentMastered(prerequisite, byKc) : false;
    });
    const earlierCoursesReady = components
      .filter((other) => other.gating && other.firstCourseIndex < component.firstCourseIndex)
      .every((other) => introduced.has(other.id) && isComponentMastered(other, byKc));
    return prerequisitesReady && earlierCoursesReady;
  }) ?? null;
}

/** @template {Component} C @param {C[]} components @param {string[]} introducedKcIds @param {StatsMap} byKc */
export function advanceIntroductions(components, introducedKcIds, byKc) {
  const introduced = [...introducedKcIds];
  const added = [];
  while (true) {
    const next = findNextIntroducible(components, introduced, byKc);
    if (!next) break;
    introduced.push(next.id);
    added.push(next);
    // Skip atoms that already gathered enough incidental or manual evidence,
    // but stop as soon as there is a genuinely new weakest atom to practise.
    if (!isComponentMastered(next, byKc)) break;
  }
  return { introducedKcIds: introduced, added };
}

/** Build the same 3:1 focus/balance rhythm used by kanabr's Japanese generator. */
/** @template {{id: string}} C @param {C | null} focus @param {C[]} includedSkills @param {number} length @param {number} rotationStart @returns {C[]} */
export function makeRoundPlan(focus, includedSkills, length = 12, rotationStart = 0) {
  if (!focus || includedSkills.length === 0) return [];
  const others = includedSkills.filter((skill) => skill.id !== focus.id);
  const plan = [];
  let otherIndex = rotationStart;
  for (let index = 0; index < length; index += 1) {
    if ((index + 1) % 4 === 0 && others.length > 0) {
      plan.push(others[otherIndex % others.length]);
      otherIndex += 1;
    } else {
      plan.push(focus);
    }
  }
  return plan;
}

/** @template {{id: string}} C @param {C | null} focus @param {C[]} introducedComponents @param {string[]} courseKcIds @returns {C[]} */
export function balanceComponentsForCourse(focus, introducedComponents, courseKcIds) {
  if (!focus) return [];
  const allowed = new Set(courseKcIds);
  return [focus, ...introducedComponents.filter((component) => component.id !== focus.id && allowed.has(component.id))];
}

/** Assign a candidate to every planned item without repeating the caller's exercise key. */
/**
 * @template {{order?: number}} C
 * @template E
 * @param {C[]} preferredItems
 * @param {{alternativesFor: (item: C, index: number) => C[], candidatesFor: (item: C) => E[], keyOf: (item: C, candidate: E) => string, orderedCandidates?: boolean | ((item: C) => boolean), seed?: number, usedKeys?: string[]}} options
 */
export function makeUniqueAssignments(preferredItems, options) {
  const { alternativesFor, candidatesFor, keyOf, orderedCandidates = false, seed = 0, usedKeys = [] } = options;
  const used = new Set(usedKeys);

  return preferredItems.map((preferred, index) => {
    const choices = [preferred, ...alternativesFor(preferred, index)]
      .filter((item, itemIndex, items) => items.indexOf(item) === itemIndex);

    for (const item of choices) {
      const candidates = candidatesFor(item);
      if (candidates.length === 0) continue;
      const preserveOrder = typeof orderedCandidates === "function" ? orderedCandidates(item) : orderedCandidates;
      const start = preserveOrder ? 0 : (seed * 7 + index * 5 + (item.order ?? 0) * 3) % candidates.length;
      for (let offset = 0; offset < candidates.length; offset += 1) {
        const candidate = candidates[(start + offset) % candidates.length];
        const key = keyOf(item, candidate);
        if (!used.has(key)) {
          used.add(key);
          return { item, candidate };
        }
      }
    }

    const candidates = candidatesFor(preferred);
    return { item: preferred, candidate: candidates[0] };
  });
}

export const adaptiveConstants = {
  accuracyTarget: ACCURACY_TARGET,
  emaAlpha: EMA_ALPHA,
  minAttempts: MIN_ATTEMPTS,
};
