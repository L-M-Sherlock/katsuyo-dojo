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

export function selectFocus(skills, bySkill) {
  const timed = skills
    .map((skill) => bySkill[skill.id])
    .filter((stats) => stats?.cleanTimeCount >= 3)
    .map((stats) => stats.cleanTimeTotal / stats.cleanTimeCount)
    .sort((a, b) => a - b);
  const baseline = timed.length ? timed[Math.floor(timed.length / 2)] : null;

  return [...skills].sort((a, b) => {
    const aStats = bySkill[a.id] ?? emptySkillStats();
    const bStats = bySkill[b.id] ?? emptySkillStats();
    const aScore = aStats.confidence - speedPenalty(aStats, baseline);
    const bScore = bStats.confidence - speedPenalty(bStats, baseline);
    return aScore - bScore || a.order - b.order || a.id.localeCompare(b.id);
  })[0] ?? null;
}

export function allConfident(skills, bySkill) {
  return skills.length > 0 && skills.every((skill) => (bySkill[skill.id]?.confidence ?? 0) >= 1);
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
  const { alternativesFor, candidatesFor, keyOf, seed = 0 } = options;
  const used = new Set();

  return preferredItems.map((preferred, index) => {
    const choices = [preferred, ...alternativesFor(preferred, index)]
      .filter((item, itemIndex, items) => items.indexOf(item) === itemIndex);

    for (const item of choices) {
      const candidates = candidatesFor(item);
      if (candidates.length === 0) continue;
      const start = (seed * 7 + index * 5 + (item.order ?? 0) * 3) % candidates.length;
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

/** Preserve skill confidence when the two cross-lesson courses are split. */
export function migrateSplitCourseProgress(introducedCount, bySkill) {
  const migratedSkills = {};
  for (const [oldId, stats] of Object.entries(bySkill ?? {})) {
    const newId = oldId
      .replace(/^pastTe:past:/, "past:past:")
      .replace(/^pastTe:te:/, "te:te:")
      .replace(/^stemAux:sugiru:/, "sugiru:sugiru:")
      .replace(/^stemAux:tagaru:/, "tagaru:tagaru:");
    migratedSkills[newId] = stats;
  }

  const oldCount = Math.max(introducedCount ?? 1, 1);
  const migratedCount = oldCount <= 2 ? oldCount : oldCount <= 31 ? oldCount + 1 : oldCount + 2;
  return { introducedCount: migratedCount, bySkill: migratedSkills };
}

export function courseCountToSkillCount(courseCount, skills) {
  const count = Math.max(courseCount ?? 1, 1);
  return skills.filter((skill) => skill.courseIndex < count).length;
}

export const adaptiveConstants = {
  accuracyTarget: ACCURACY_TARGET,
  emaAlpha: EMA_ALPHA,
  minAttempts: MIN_ATTEMPTS,
};
