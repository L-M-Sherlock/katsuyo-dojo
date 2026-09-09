import { acceptedConjugations } from '../../app/lib/conjugation.mjs';
import { COURSES } from '../../app/lib/curriculum.mjs';

// Independent routing contract. Only the correct-form engine and course
// inventory are shared; no production routing or diagnosis function is used.
const families = {
  tagaruPast: ['tagaru', 'godan'], teoruPast: ['teoru', 'godan'],
  teageruPast: ['teageru', 'ichidan'], tekureruPast: ['tekureru', 'ichidan'],
  teiruPast: ['teiru', 'ichidan'], temiruPast: ['temiru', 'ichidan'], sugiruPast: ['sugiru', 'ichidan'],
  passivePast: ['passive', 'ichidan'], potentialPast: ['potential', 'ichidan'],
  causativePast: ['causative', 'ichidan'], causativePassivePast: ['causativePassive', 'ichidan'],
};
// The complete sibling matrix is fixed independently of the production
// selector and registry. Inventory tests compare this list with the supported
// curriculum so that adding a family requires an explicit test expectation.
export const CONTINUATION_FORM_MATRIX = {
  teageru: 'ichidan', temorau: 'u', tekureru: 'ichidan', teiru: 'ichidan',
  tearu: 'aru', teoru: 'ru', tai: 'i', tehoshii: 'i', youtosuru: 'suru',
  temiru: 'ichidan', teshimau: 'u', teoku: 'ku', teiku: 'iku', tekuru: 'kuru',
  sugiru: 'ichidan', tagaru: 'ru', passive: 'ichidan', potential: 'ichidan',
  causative: 'ichidan', causativePassive: 'ichidan',
};
const continuations = ['Past', 'Negative', 'NegativePast'];
const forms = [...new Set(COURSES.flatMap(course => course.forms))];
const normalize = text => text.normalize('NFKC').replace(/[ァ-ヶヽヾ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60)).replace(/[\s。．.！!？?]/g, '');
const correctCache = new Map();
const unknown = { kind: 'incorrect', failed: null, confirmed: [], stage: null, review: null };

function correctForms(item) {
  const key = JSON.stringify([item.surface, item.reading, item.class]);
  if (!correctCache.has(key)) {
    const map = new Map();
    for (const word of new Set([item.surface, item.reading])) for (const form of forms) {
      if (form === 'causativePassiveContracted' && (item.class !== 'godan' || word.endsWith('す'))) continue;
      for (const answer of acceptedConjugations(word, item.class, form)) {
        const text = normalize(answer);
        if (!map.has(text)) map.set(text, new Set());
        map.get(text).add(form);
      }
    }
    if (correctCache.size >= 256) correctCache.delete(correctCache.keys().next().value);
    correctCache.set(key, map);
  }
  return correctCache.get(key);
}

function generatePastConflictCases(item, form) {
  if (item.domain !== 'verb' || !families[form]) return [];
  const [baseForm, cls] = families[form], valid = correctForms(item), cases = [], seen = new Set();
  const emit = (input, expected, writing, pattern) => {
    if (seen.has(input)) return;
    seen.add(input); cases.push({ input, expected, writing, pattern });
  };
  const fallback = { ...unknown, priority: false, probes: [{ form: baseForm, continuation: false }] };
  for (const [writing, word] of [['surface', item.surface], ['reading', item.reading]]) {
    for (const base of acceptedConjugations(word, item.class, baseForm)) {
      // Short causatives have a separate godan path and are not the supplied
      // long causative in this two-stage curriculum exercise.
      if (!base.endsWith('る')) continue;
      const input = base.slice(0, -1) + (cls === 'godan' ? 'た' : 'った');
      const acceptedIn = valid.get(normalize(input)) ?? new Set();
      if (acceptedIn.has(form)) continue;
      if (acceptedIn.size) {
        emit(input, fallback, writing, 'priority-guard');
        continue;
      }
      emit(input, { ...unknown, priority: true, steps: 2, continuation: true,
        probes: [{ kind: 'classification', diagnosticOnly: true, expectedClass: cls }, { kind: 'conjugation', providedClass: cls, form: 'past' }],
        probeKcIds: [[], cls === 'godan' ? ['onbin.sokuon', 'suffix.past'] : ['stem.ichidan.drop-ru', 'suffix.past']],
      }, writing, 'priority-stage');
      emit((input[0] === '字' ? '文' : '字') + input.slice(1), fallback, writing, 'priority-guard');
    }
  }
  return cases;
}

function tailRules(cls, ending) {
  if (cls === 'i') return ending === 'Past' ? ['adj.suffix.i-past']
    : ['adj.stem.i-ku', 'adj.suffix.i-negative', ...(ending === 'NegativePast' ? ['adj.suffix.i-past'] : [])];
  if (cls === 'aru' && ending !== 'Past') return ['exception.aru-negative', ...(ending === 'NegativePast' ? ['adj.suffix.i-past'] : [])];
  if (ending === 'Past') return cls === 'ichidan' ? ['stem.ichidan.drop-ru', 'suffix.past']
    : ['suru', 'kuru'].includes(cls) ? ['suffix.past']
      : [cls === 'ku' ? 'onbin.i' : 'onbin.sokuon', 'suffix.past'];
  return [...(cls === 'ichidan' ? ['stem.ichidan.drop-ru'] : ['suru', 'kuru'].includes(cls) ? [] : ['stem.godan.a']),
    'suffix.negative', ...(cls === 'u' ? ['stem.godan.u-wa'] : []), ...(ending === 'NegativePast' ? ['adj.suffix.i-past'] : [])];
}

export function generateContinuationSwitchCases(item, form) {
  if (item.domain !== 'verb') return [];
  const nested = form === 'passiveDesireNegativePast';
  const base = nested ? 'tai' : Object.keys(CONTINUATION_FORM_MATRIX).find(base => continuations.some(ending => base + ending === form));
  if (!base) return [];
  const ending = nested ? 'NegativePast' : form.slice(base.length);
  const target = base + ending, siblings = continuations.map(ending => base + ending);
  // Nested 受身→たい uses the actual passive intermediate as its source;
  // the raw lexical verb has a different fixed prefix and is also guarded.
  const source = nested ? { domain: 'verb', class: 'ichidan',
    surface: acceptedConjugations(item.surface, item.class, 'passive')[0],
    reading: acceptedConjugations(item.reading, item.class, 'passive')[0] } : item;
  const valid = correctForms(source), original = correctForms(item), result = [], seen = new Set();
  const emit = (input, expected, writing, pattern) => {
    const key = pattern + ':' + input;
    if (!seen.has(key)) { seen.add(key); result.push({ input, expected, writing, pattern }); }
  };
  for (const [writing, word] of [['surface', source.surface], ['reading', source.reading]]) {
    for (const sibling of siblings.filter(sibling => sibling !== target)) {
      for (const input of acceptedConjugations(word, source.class, sibling)) {
        const acceptedIn = valid.get(normalize(input)) ?? new Set();
        if (acceptedIn.has(target)) continue;
        const collision = [...acceptedIn].some(other => !siblings.includes(other))
          || (nested && original.has(normalize(input)));
        const onlyPastRemains = ending === 'NegativePast' && sibling === base + 'Negative';
        const expected = collision ? { kind: 'incorrect', priority: false }
          : { ...unknown, priority: true, steps: 1, continuation: true,
            probes: [{ form: onlyPastRemains ? 'adjectivePast' : target, continuation: true }],
            probeKcIds: [onlyPastRemains ? ['adj.suffix.i-past'] : tailRules(CONTINUATION_FORM_MATRIX[base], ending)] };
        emit(input, expected, writing, collision ? 'priority-form-switch-guard' : 'priority-form-switch');
        emit((input[0] === '字' ? '文' : '字') + input.slice(1), { kind: 'incorrect', priority: false }, writing, 'priority-form-switch-guard');
      }
    }
  }
  return result;
}

export function generateProbeRoutingCases(item, form) {
  return [...generatePastConflictCases(item, form), ...generateContinuationSwitchCases(item, form)];
}
