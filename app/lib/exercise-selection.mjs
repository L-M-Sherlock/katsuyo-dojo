export const RECENT_WORD_LIMIT = 36;

/** @param {{item: {domain?: string, surface: string}, form?: string | null}} exercise */
export const exerciseKey = (exercise) => `${exercise.item.domain ?? 'verb'}:${exercise.form ?? 'classify'}:${exercise.item.surface}`;
/** @param {{item: {domain?: string, surface: string}}} exercise */
export const wordKey = (exercise) => `${exercise.item.domain ?? 'verb'}:${exercise.item.surface}`;

// This is a chronological window of original submissions, including errors and
// revealed answers. Do not deduplicate it or infer it from coursePractice.
export function normalizeRecentWordKeys(value) {
  return Array.isArray(value)
    ? value.filter(key => typeof key === 'string' && /^(verb|adjective):[^\s\p{Cc}]{1,64}$/u.test(key)).slice(-RECENT_WORD_LIMIT)
    : [];
}

export function recordRecentWord(history, exercise) {
  return [...normalizeRecentWordKeys(history), wordKey(exercise)].slice(-RECENT_WORD_LIMIT);
}

// Deterministic across browser locales and candidate enumeration order. The
// avalanche keeps adjacent seeds from favoring the same lexicographic prefix.
function seededOrder(key, seed) {
  let hash = 2166136261;
  for (const char of `${seed}:${key}`) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

/**
 * Assign original questions after the caller's course/prerequisite filtering.
 * Missing coverage and weak exception lexemes take precedence over diversity.
 * Otherwise prefer unused round words, then words outside the recent window,
 * balanced coverage, lower rule burden, and a seeded tie break.
 *
 * @template {{id: string, coverageKcIds?: string[]}} C
 * @template {{item: {domain?: string, surface: string}, form?: string | null, kcIds: string[]}} E
 * @param {C[]} preferredItems
 * @param {{alternativesFor: (item: C, index: number) => C[], candidatesFor: (item: C) => E[], byKc?: Record<string, {confidence?: number, correct?: number}>, seed?: number, usedKeys?: string[], usedWordKeys?: string[], recentWordKeys?: string[]}} options
 */
export function assignPracticeExercises(preferredItems, options) {
  const { alternativesFor, candidatesFor, byKc = {}, seed = 0, usedKeys = [], usedWordKeys = [], recentWordKeys = [] } = options;
  const used = new Set(usedKeys);
  const wordCounts = new Map();
  // Keep per-round word counts across replans; a different form is the same word.
  for (const key of usedWordKeys) wordCounts.set(key, (wordCounts.get(key) ?? 0) + 1);
  const recent = new Map(normalizeRecentWordKeys(recentWordKeys).map((key, index) => [key, index]));
  const pools = new Map();
  const poolFor = item => {
    if (!pools.has(item.id)) pools.set(item.id, candidatesFor(item));
    return pools.get(item.id);
  };

  function select(item, pool, index, allowUsed = false) {
    let candidates = pool.filter(exercise => allowUsed || !used.has(exerciseKey(exercise)));
    if (!candidates.length) return undefined;
    const facets = item.coverageKcIds?.length ? item.coverageKcIds
      : item.id === 'class.irregular' ? [...new Set(pool.flatMap(e => e.kcIds.filter(id => id.startsWith('facet.class.irregular.'))))] : [];
    const facetOf = exercise => exercise.kcIds.find(id => facets.includes(id)) ?? 'other';
    const facetCounts = new Map();
    for (const exercise of pool) {
      if (used.has(exerciseKey(exercise))) {
        const facet = facetOf(exercise);
        facetCounts.set(facet, (facetCounts.get(facet) ?? 0) + 1);
      }
    }
    const missing = new Set(facets.filter(id => !(byKc[id]?.correct >= 1) && !facetCounts.has(id)));
    const required = candidates.filter(exercise => missing.has(facetOf(exercise)));
    if (required.length) candidates = required;

    const score = exercise => {
      const word = wordKey(exercise);
      const lexicalId = exercise.kcIds.find(id => id.startsWith('lexeme.'));
      return [
        item.id === 'exception.ru-godan' ? (lexicalId ? byKc[lexicalId]?.confidence ?? 0 : 1) : 0,
        wordCounts.get(word) ?? 0,
        recent.get(word) ?? -1,
        facetCounts.get(facetOf(exercise)) ?? 0,
        exercise.kcIds.reduce((sum, id) => sum + (id === item.id ? 0 : 1 - (byKc[id]?.confidence ?? 0)), 0),
        seededOrder(`${item.id}:${exerciseKey(exercise)}`, `${seed}:${index}`),
      ];
    };
    const ranked = candidates.map(candidate => ({ candidate, score: score(candidate), key: exerciseKey(candidate) }));
    ranked.sort((a, b) => {
      for (let i = 0; i < a.score.length; i++) if (a.score[i] !== b.score[i]) return a.score[i] - b.score[i];
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
    return ranked[0].candidate;
  }

  return preferredItems.map((preferred, index) => {
    const choices = [preferred, ...alternativesFor(preferred, index)].filter((item, i, items) => items.findIndex(other => other.id === item.id) === i);
    const assign = (item, candidate) => {
      used.add(exerciseKey(candidate));
      const word = wordKey(candidate);
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
      return { item, candidate };
    };
    for (const item of choices) {
      const candidate = select(item, poolFor(item), index);
      if (candidate) return assign(item, candidate);
    }
    // Only repeat an exact question when every eligible alternative is exhausted.
    for (const item of choices) {
      const candidate = select(item, poolFor(item), index, true);
      if (candidate) return assign(item, candidate);
    }
    return { item: preferred, candidate: undefined };
  });
}
