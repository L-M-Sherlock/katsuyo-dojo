/** Authoritative reading alignment only. This module does not load the card catalog. */
import reviewedLayouts from '../data/furigana-layouts.json' with {type: 'json'};

const layouts = new Map(reviewedLayouts.layouts.map(part => [furiganaPairKey(part), part.parts]));
const HAN = /\p{Script=Han}/u;
const GROUPS = /\p{Script=Han}+|[^\p{Script=Han}]+/gu;
const PUNCTUATION = /[、。!?「」『』()：:；;]/gu;

export function furiganaPairKey({text, reading}) { return `${text}\0${reading ?? ''}`; }
export const isFuriganaHanGroup = text => /^\p{Script=Han}+$/u.test(text);

function normalized(text, compact = false) {
  return text.normalize('NFKC').replace(/[ァ-ヶ]/gu, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s/gu, '').replace(/,/gu, '、').replace(/\./gu, '。')
    .replace(compact ? PUNCTUATION : /$^/gu, '');
}

function readingOffsets(reading, compact) {
  let key = '';
  const starts = [], ends = [];
  let position = 0;
  for (const character of reading) {
    const token = normalized(character, compact);
    for (let index = 0; index < token.length; index++) {
      starts.push(position);
      ends.push(position + character.length);
    }
    key += token;
    position += character.length;
  }
  return {key, capture: (start, end) => reading.slice(starts[start], ends[end - 1])};
}

/**
 * Return at most two complete alignments. A single path is safe; multiple paths
 * are ambiguous. Optional known pairs constrain captures to existing authored
 * Han readings, rather than choosing a shortest or longest pronunciation.
 */
export function alignFuriganaParts(part, knownPairs = null) {
  if (!part.reading || !HAN.test(part.text)) return [{text: part.text}];
  const groups = part.text.match(GROUPS) ?? [];
  for (const compact of [false, true]) {
    const anchors = groups.map(text => HAN.test(text) ? null : normalized(text, compact));
    // Removing the only separator between two Han groups removes its boundary.
    if (anchors.some((anchor, index) => index > 0 && index < groups.length - 1 && anchor === ''
      && HAN.test(groups[index - 1]) && HAN.test(groups[index + 1]))) continue;
    const source = readingOffsets(part.reading, compact);
    const memo = new Map();
    function paths(index, offset) {
      const cacheKey = `${index}:${offset}`;
      if (memo.has(cacheKey)) return memo.get(cacheKey);
      if (index === groups.length) return offset === source.key.length ? [[]] : [];
      const text = groups[index], anchor = anchors[index], result = [];
      if (anchor !== null) {
        if (source.key.startsWith(anchor, offset)) for (const tail of paths(index + 1, offset + anchor.length)) result.push([{text}, ...tail]);
      } else {
        const known = knownPairs?.get(text);
        for (let end = offset + 1; end <= source.key.length; end++) {
          if (known && !known.has(source.key.slice(offset, end))) continue;
          for (const tail of paths(index + 1, end)) {
            result.push([{text, reading: source.capture(offset, end)}, ...tail]);
            if (result.length === 2) break;
          }
          if (result.length === 2) break;
        }
      }
      memo.set(cacheKey, result);
      return result;
    }
    const alternatives = paths(0, 0);
    if (alternatives.length === 1) return alternatives[0];
  }
  return null;
}

/** Merge exact, already-authored Han pairs for a constrained corpus pass. */
export function knownFuriganaPairs(pairs) {
  const known = new Map();
  for (const {text, reading} of pairs) if (reading && isFuriganaHanGroup(text)) {
    if (!known.has(text)) known.set(text, new Set());
    known.get(text).add(normalized(reading));
  }
  return known;
}

/** Preserve authored text and reading. Unknown imported text retains native ruby. */
export function splitFuriganaParts(part) {
  return layouts.get(furiganaPairKey(part)) ?? alignFuriganaParts(part) ?? [{...part}];
}
