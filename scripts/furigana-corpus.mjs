/** Build-time inventory of every current field that can reach a ruby renderer. */
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {USAGE_CARDS, resolveUsageCard, usageCardItem} from '../app/lib/usage-cards.mjs';
import {REVIEWED_LEXICAL_SENSES} from '../app/lib/lexical-usage.mjs';
import {UNIFIED_COURSES} from '../app/lib/unified-curriculum.mjs';
import {deriveUnified, unifiedDiagnosticSteps} from '../app/lib/unified-knowledge.mjs';
import {buildDiagnosticPlan} from '../app/lib/diagnostic-plan.mjs';
import {explainConjugation} from '../app/lib/conjugation.mjs';
import {explainAdjectiveConjugation} from '../app/lib/adjective-conjugation.mjs';
import {alignFuriganaParts, furiganaPairKey, isFuriganaHanGroup, knownFuriganaPairs} from '../app/lib/furigana-corpus.mjs';

const compare = (a, b) => a.text < b.text ? -1 : a.text > b.text ? 1 : a.reading < b.reading ? -1 : a.reading > b.reading ? 1 : 0;
let cached;

// Audited boundaries for the only two clauses with no unique existing-group
// alignment. These merely divide their unchanged, authored complete readings.
// In particular 何度話 is なんどはな in 話して, but なんどはなし in 話を.
export const EXACT_FURIGANA_LAYOUTS = [
  {text: '昨夜は何度話を聞いても、相手の真意が', reading: 'さくやはなんどはなしをきいても、あいてのしんいが', parts: [
    {text: '昨夜', reading: 'さくや'}, {text: 'は'}, {text: '何度話', reading: 'なんどはなし'}, {text: 'を'},
    {text: '聞', reading: 'き'}, {text: 'いても、'}, {text: '相手', reading: 'あいて'}, {text: 'の'}, {text: '真意', reading: 'しんい'}, {text: 'が'},
  ]},
  {text: '調査会社が休業中で、土地の安全性を', reading: 'ちょうさがいしゃがきゅうぎょうちゅうで、とちのあんぜんせいを', parts: [
    {text: '調査会社', reading: 'ちょうさがいしゃ'}, {text: 'が'}, {text: '休業中', reading: 'きゅうぎょうちゅう'}, {text: 'で、'},
    {text: '土地', reading: 'とち'}, {text: 'の'}, {text: '安全性', reading: 'あんぜんせい'}, {text: 'を'},
  ]},
];

export function getFuriganaCorpus() {
  if (cached) return cached;
  const sourceMap = new Map(), errors = [], unsupportedPairs = [];
  function add(part, source, lexical = false) {
    if (!part || typeof part.text !== 'string' || typeof part.reading !== 'string' || !part.reading || !/\p{Script=Han}/u.test(part.text)) return;
    const key = furiganaPairKey(part);
    if (!sourceMap.has(key)) sourceMap.set(key, {text: part.text, reading: part.reading, sources: new Set(), lexical});
    const row = sourceMap.get(key);
    row.sources.add(source);
    row.lexical ||= lexical;
  }
  const addPair = (part, source, lexical = true) => part && add({text: part.surface, reading: part.reading}, source, lexical);
  for (const card of USAGE_CARDS) {
    for (const [side, parts] of [['before', card.before], ['after', card.after]]) parts.forEach((part, index) => add(part, `card:${card.id}:${side}:${index}`));
    const resolved = resolveUsageCard(card);
    if (!resolved) throw new Error(`In-use card has no resolved target: ${card.id}`);
    add(resolved.target, `card:${card.id}:target`, true);
  }
  for (const sense of REVIEWED_LEXICAL_SENSES) {
    const item = usageCardItem(sense.id), kana = {...item, surface: item.reading, lexicalSurface: item.surface};
    addPair(item, `lexicon:${sense.id}`);
    const forms = [...new Set(UNIFIED_COURSES.filter(course => course.domain === item.domain).flatMap(course => course.forms))];
    for (const form of forms) {
      const source = `form:${sense.id}:${form}`;
      // Include even restricted pairs: old log/retest entries still render their
      // correct transformations. This grants no exercise eligibility.
      try {
        const surface = deriveUnified(item, form), reading = deriveUnified(kana, form);
        add({text: surface.answer, reading: reading.answer}, `${source}:answer`, true);
        surface.acceptedVariants.forEach((text, index) => add({text, reading: reading.acceptedVariants[index] ?? reading.answer}, `${source}:variant:${index}`, true));
        surface.operations.forEach((operation, index) => {
          add({text: operation.input, reading: reading.operations[index]?.input}, `${source}:operation:${index}:input`, true);
          add({text: operation.output, reading: reading.operations[index]?.output}, `${source}:operation:${index}:output`, true);
        });
        const explain = item.domain === 'verb' ? (value => explainConjugation(value.surface, value.class, form)) : (value => explainAdjectiveConjugation(value, form));
        const detail = explain(item), detailKana = explain(kana);
        detail.parts.forEach((text, index) => add({text, reading: detailKana.parts[index]}, `${source}:detail:${index}`, true));
        const plan = buildDiagnosticPlan(item, form);
        for (const [pathIndex, path] of plan.paths.entries()) for (const [nodeIndex, node] of path.nodes.entries()) {
          const nodeSource = `${source}:diagnostic:${pathIndex}:${nodeIndex}`;
          addPair(node.input, `${nodeSource}:input`);
          addPair(node.output, `${nodeSource}:output`);
          for (const [index, output] of (node.acceptedOutputs ?? []).entries()) addPair(output, `${nodeSource}:variant:${index}`);
        }
        for (const [index, step] of unifiedDiagnosticSteps(item, form).entries()) {
          addPair(step, `${source}:progressive:${index}`);
          step.answers.forEach((text, answerIndex) => add({text, reading: step.readings[answerIndex] ?? step.readings[0]}, `${source}:progressive:${index}:answer:${answerIndex}`, true));
        }
      } catch (error) {
        const row = {senseId: sense.id, form, message: error.message};
        if (/^Unsupported (?:contracted causative-passive verb|い-adjective form|な-adjective form):/u.test(error.message)) unsupportedPairs.push(row);
        else errors.push(row);
      }
    }
  }
  const sources = [...sourceMap.values()].map(row => ({...row, sources: [...row.sources].sort()})).sort(compare);
  const partsBySource = new Map(), unresolved = [];
  for (const row of sources) {
    const parts = alignFuriganaParts(row);
    if (parts) partsBySource.set(furiganaPairKey(row), parts);
    else unresolved.push(row);
  }
  let pending = unresolved;
  const constrained = [];
  while (pending.length) {
    const known = knownFuriganaPairs([...partsBySource.values()].flat());
    const next = [];
    for (const row of pending) {
      const parts = alignFuriganaParts(row, known);
      if (parts) { partsBySource.set(furiganaPairKey(row), parts); constrained.push({...row, parts}); }
      else next.push(row);
    }
    if (next.length === pending.length) break;
    pending = next;
  }
  const exact = new Map(EXACT_FURIGANA_LAYOUTS.map(row => [furiganaPairKey(row), row.parts]));
  const audited = [];
  pending = pending.filter(row => {
    const parts = exact.get(furiganaPairKey(row));
    if (!parts) return true;
    if (parts.map(part => part.text).join('') !== row.text || parts.map(part => part.reading ?? part.text).join('') !== row.reading) throw new Error(`Exact ruby layout changed authored text: ${row.text}`);
    partsBySource.set(furiganaPairKey(row), parts);
    audited.push({...row, parts});
    return false;
  });
  const unique = new Map(), lexical = new Map();
  for (const row of sources) for (const part of partsBySource.get(furiganaPairKey(row)) ?? []) if (part.reading) {
    if (!isFuriganaHanGroup(part.text)) throw new Error(`Non-Han font source: ${part.text}`);
    unique.set(furiganaPairKey(part), part);
    if (row.lexical) lexical.set(furiganaPairKey(part), part);
  }
  const pairs = [...unique.values()].sort(compare);
  cached = {pairs, lexicalPairs: [...lexical.values()].sort(compare), sources, constrained, audited,
    fallbacks: pending, extractionErrors: errors, unsupportedPairs,
    coverage: {cards: USAGE_CARDS.length, sourcePairs: sources.length, direct: sources.length - unresolved.length,
      constrained: constrained.length, audited: audited.length, fallbacks: pending.length, fontPairs: pairs.length,
      lexicalFontPairs: lexical.size, extractionErrors: errors.length, unsupportedPairs: unsupportedPairs.length}};
  return cached;
}

export const getFuriganaPairs = () => getFuriganaCorpus().pairs;
export const getLexicalFuriganaPairs = () => getFuriganaCorpus().lexicalPairs;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const corpus = getFuriganaCorpus();
  if (process.argv.includes('--write-layouts')) {
    const artifact = {version: 1, method: 'unique-kana-anchor-alignment-constrained-by-existing-authored-Han-pairs',
      sourceHash: createHash('sha256').update(JSON.stringify(corpus.sources.map(({text, reading}) => ({text, reading})))).digest('hex'),
      coverage: corpus.coverage,
      layouts: [...corpus.constrained, ...corpus.audited].map(({text, reading, parts}) => ({text, reading, parts})).sort(compare)};
    await writeFile(new URL('../app/data/furigana-layouts.json', import.meta.url), `${JSON.stringify(artifact, null, 2)}\n`);
  }
  console.log(JSON.stringify({coverage: corpus.coverage, extractionErrors: corpus.extractionErrors.slice(0, 10), fallbacks: corpus.fallbacks}, null, 2));
}
