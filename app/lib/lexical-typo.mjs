// @ts-check

/**
 * Only the unchanged lexical prefix is eligible: never forgive an inflection,
 * an irregular stem, or an answer with additional errors elsewhere.
 * @param {{ domain: string, class: string, iiFamily?: boolean }} item
 * @param {string} word
 */
function fixedPrefix(item, word) {
  if (item.domain === "verb") {
    if (item.class === "irregular") {
      return /(?:する|くる|来る)$/.test(word) ? word.slice(0, -2) : "";
    }
    return Array.from(word).slice(0, -1).join("");
  }
  if (item.domain === "adjective") {
    return item.class === "na" ? word : Array.from(word).slice(0, item.iiFamily ? -2 : -1).join("");
  }
  return "";
}

/** @param {string} char */
function scriptOf(char) {
  if (/\p{Script=Hiragana}/u.test(char)) return "hiragana";
  if (/\p{Script=Katakana}/u.test(char)) return "katakana";
  if (/\p{Script=Han}/u.test(char)) return "han";
  return null;
}

/**
 * Detect a single substitution, omission, insertion or adjacent transposition
 * in the fixed lexical prefix, while keeping the entire inflection intact.
 * An omission needs at least two surviving lexical characters and must not
 * also be explainable as deleting part of an accepted inflection.
 * This is a request to re-enter the word, not a correct-answer judgment.
 * @param {{ domain: string, surface: string, reading: string, class: string, iiFamily?: boolean }} item
 * @param {string} answer
 * @param {string[]} surfaceAnswers
 * @param {string[]} readingAnswers
 * @param {(value: string) => string} normalize
 */
export function hasLexicalTypo(item, answer, surfaceAnswers, readingAnswers, normalize = (value) => value) {
  const normalized = normalize(answer);
  if ([...surfaceAnswers, ...readingAnswers].some((candidate) => normalize(candidate) === normalized)) return false;
  const actual = Array.from(normalized);
  const corrections = new Set();
  let ambiguousBoundary = false;
  for (const [word, candidates] of /** @type {[string, string[]][]} */ ([
    [item.surface, surfaceAnswers], [item.reading, readingAnswers],
  ])) {
    const prefix = normalize(fixedPrefix(item, word));
    if (!prefix) continue;
    const prefixLength = Array.from(prefix).length;
    for (const candidate of candidates) {
      const expected = normalize(candidate);
      if (!expected.startsWith(prefix)) continue;
      const chars = Array.from(expected);
      if (chars.length === actual.length + 1) {
        const deletions = chars.flatMap((_, index) =>
          chars.slice(0, index).concat(chars.slice(index + 1)).join("") === normalized ? [index] : []);
        if (!deletions.length) continue;
        // Repeated letters can make an apparently lexical omission equally
        // compatible with an omitted suffix. Keep such answers for diagnosis.
        if (deletions.some((index) => index >= prefixLength)) {
          ambiguousBoundary = true;
          continue;
        }
        // A lone surviving character is too little evidence for a lexical
        // retry; in particular, never forgive deleting the entire word stem.
        if (prefixLength < 3) continue;
        if (deletions.every((index) => scriptOf(chars[index]) || chars[index] === "ー")) corrections.add(expected);
        continue;
      }
      if (actual.length === chars.length + 1) {
        const insertions = actual.flatMap((_, index) =>
          actual.slice(0, index).concat(actual.slice(index + 1)).join("") === expected ? [index] : []);
        if (!insertions.length) continue;
        // At the stem/ending boundary an extra letter may be a grammar error.
        // Every equivalent edit must therefore be strictly inside the prefix.
        if (insertions.some((index) => index >= prefixLength)) {
          ambiguousBoundary = true;
          continue;
        }
        if (prefixLength < 2) continue;
        if (insertions.every((index) => {
          const neighbors = [chars[index - 1], chars[index]].filter(Boolean);
          const script = scriptOf(actual[index]);
          return script ? neighbors.some((char) => scriptOf(char) === script)
            : actual[index] === "ー" && neighbors.some((char) => ["hiragana", "katakana"].includes(scriptOf(char) ?? ""));
        })) corrections.add(expected);
        continue;
      }
      if (chars.length !== actual.length) continue;
      const differences = chars.flatMap((char, index) => char === actual[index] ? [] : [index]);
      if (differences.length === 2) {
        const [first, second] = differences;
        if (second === first + 1 && chars[first] === actual[second] && chars[second] === actual[first]) {
          if (second >= prefixLength) {
            ambiguousBoundary = true;
            continue;
          }
          const script = scriptOf(chars[first]);
          if (prefixLength >= 2 && script && script === scriptOf(chars[second])) corrections.add(expected);
        }
        continue;
      }
      if (differences.length !== 1 || differences[0] >= prefixLength) continue;
      const index = differences[0];
      // Do not mistake a missing kana for a kanji-to-kana substitution, or
      // make a kana answer ambiguous against its kanji spelling.
      const script = scriptOf(chars[index]);
      if (script && script === scriptOf(actual[index])) corrections.add(expected);
    }
  }
  // Ambiguous alternatives cannot establish that the entire ending was correct.
  return !ambiguousBoundary && corrections.size === 1;
}
