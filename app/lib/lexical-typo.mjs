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
 * Detect a single substituted character in the original word's fixed prefix.
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
      if (chars.length !== actual.length) continue;
      const differences = chars.flatMap((char, index) => char === actual[index] ? [] : [index]);
      if (differences.length !== 1 || differences[0] >= prefixLength) continue;
      const index = differences[0];
      // Do not mistake a missing kana for a kanji-to-kana substitution, or
      // make a kana answer ambiguous against its kanji spelling.
      const script = scriptOf(chars[index]);
      if (script && script === scriptOf(actual[index])) corrections.add(expected);
    }
  }
  // Ambiguous alternatives cannot establish that the entire ending was correct.
  return corrections.size === 1;
}
