const ACCURACY_TARGET = 0.85;
const EMA_ALPHA = 0.2;
const MIN_ATTEMPTS = 5;

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

export function evidenceValue({ correct, hintUsed = false, revealed = false }) {
  if (!correct || revealed) return 0;
  return hintUsed ? 0.7 : 1;
}

export function confidenceOf(filteredAccuracy, attempts) {
  if (filteredAccuracy == null || attempts === 0) return 0;
  const evidence = Math.min(attempts / MIN_ATTEMPTS, 1);
  return Math.min((filteredAccuracy / ACCURACY_TARGET) * evidence, 1);
}

export function updateSkillStats(current, result) {
  const stats = current ?? emptySkillStats();
  const evidence = evidenceValue(result);
  const filteredAccuracy = stats.filteredAccuracy == null
    ? evidence
    : stats.filteredAccuracy + EMA_ALPHA * (evidence - stats.filteredAccuracy);
  const attempts = stats.attempts + 1;
  const confidence = confidenceOf(filteredAccuracy, attempts);
  const cleanTime = result.correct && !result.hintUsed && !result.revealed &&
    Number.isFinite(result.responseMs) && result.responseMs >= 300 && result.responseMs <= 60000
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

function speedPenalty(stats, baseline) {
  if (!stats || stats.cleanTimeCount < 3 || !baseline) return 0;
  const speed = stats.cleanTimeTotal / stats.cleanTimeCount;
  return Math.min(Math.max(speed / baseline - 1, 0), 1) * 0.05;
}

export function rankExercisesForFocus(exercises, focusId, byKc, coverageKcIds = []) {
  const lexicalConfidence = (exercise) => {
    const lexicalId = exercise.kcIds.find((id) => id.startsWith("lexeme."));
    return lexicalId ? byKc[lexicalId]?.confidence ?? 0 : 1;
  };
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

export function componentConfidence(component, byKc) {
  const confidence = byKc[component.id]?.confidence ?? 0;
  const coverageComplete = (component.coverageKcIds ?? []).every((id) => (byKc[id]?.correct ?? 0) >= 1);
  return coverageComplete ? confidence : Math.min(confidence, 0.99);
}

export function isComponentMastered(component, byKc) {
  return componentConfidence(component, byKc) >= 1;
}

export function selectFocus(components, byKc) {
  const timed = components
    .map((component) => byKc[component.id])
    .filter((stats) => stats?.cleanTimeCount >= 3)
    .map((stats) => stats.cleanTimeTotal / stats.cleanTimeCount)
    .sort((a, b) => a - b);
  const baseline = timed.length ? timed[Math.floor(timed.length / 2)] : null;

  return [...components].sort((a, b) => {
    const aStats = byKc[a.id] ?? emptySkillStats();
    const bStats = byKc[b.id] ?? emptySkillStats();
    const aScore = componentConfidence(a, byKc) - speedPenalty(aStats, baseline);
    const bScore = componentConfidence(b, byKc) - speedPenalty(bStats, baseline);
    return aScore - bScore || a.order - b.order || a.id.localeCompare(b.id);
  })[0] ?? null;
}

export function updateKnowledgeStats(byKc, { kcIds, focusId, failedKcId = /** @type {string | null} */ (null), ...result }) {
  const next = { ...byKc };
  const affected = result.correct ? [...new Set(kcIds)] : [failedKcId ?? focusId].filter(Boolean);
  for (const kcId of affected) {
    next[kcId] = updateSkillStats(next[kcId], {
      ...result,
      responseMs: kcId === focusId ? result.responseMs : undefined,
    });
  }
  return next;
}

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

/** Assign a candidate to every planned item without repeating the caller's exercise key. */
export function makeUniqueAssignments(preferredItems, options) {
  const { alternativesFor, candidatesFor, keyOf, orderedCandidates = false, seed = 0 } = options;
  const used = new Set();

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
