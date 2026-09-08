import { acceptedConjugations } from './conjugation.mjs';
import { diagnoseCommonVerbError } from './verb-common-errors.mjs';

const classLabels = { godan: '五段动词', ichidan: '一段动词' };
const sharedRule = id => /^(stem\.|onbin\.|suffix\.)/.test(id);
const unique = values => [...new Set(values)];
const pastBodies = ['', 'っ', 'つ', 'ん', 'い', 'し', 'り', 'る'];

function conflictContext(item, step, family) {
  if (item.domain !== 'verb' || !step.continuation || step.kind || step.providedClass
    || family?.ending !== 'past' || !['godan', 'ichidan'].includes(family.outputClass)) return null;
  const cls = family.outputClass;
  const application = `apply.${family.form}.continuation`;
  const rule = cls === 'godan' ? 'onbin.sokuon' : 'suffix.past';
  if (![application, rule].every(id => step.kcIds.includes(id))) return null;
  const bases = unique(step.providedAnswers ?? [step.surface, step.reading]);
  // Only る endings have the actual godan/ichidan ambiguity addressed here.
  // The generic conjugator can mechanically "drop" other endings as ichidan,
  // but that is not evidence of this specific grammatical confusion.
  if (!bases.length || bases.some(base => typeof base !== 'string' || !base.endsWith('る'))) return null;
  return { cls, application, rule, bases };
}

/** A missing/extra っ also reproduces the other class's past construction. */
export function diagnoseContinuationClassConflict(item, step, family, answer, normalize = value => value) {
  const context = conflictContext(item, step, family);
  if (!context || typeof answer !== 'string') return null;
  const actual = normalize(answer);
  if ([...step.answers, ...step.readings].some(correct => normalize(correct) === actual)) return null;
  const { cls, application, rule, bases } = context;
  if (!bases.some(base => normalize(base.slice(0, -1) + (cls === 'godan' ? 'た' : 'った')) === actual)) return null;
  return {
    kcId: null,
    confirmedKcIds: [],
    message: `已定位到「${family.label}」的过去变化，但还不能区分词类判断与变化规则。先确认词类，再按给定词类检查变化；本次尚未更新知识点。`,
    stage: { form: 'past', label: `${family.label}的过去变化`, candidateKcIds: [application, rule] },
  };
}

export function buildContinuationClassProbes(item, step, family) {
  const context = conflictContext(item, step, family);
  if (!context) return [];
  const { cls, rule, bases } = context;
  const provided = { domain: 'verb', class: cls, surface: step.surface, reading: step.reading };
  const valid = new Set(bases.flatMap(base => acceptedConjugations(base, cls, 'past')));
  // Keep the parent's admissible contractions, but never restore a short
  // causative form whose godan ending was excluded from an ichidan probe.
  const answers = step.answers.filter(answer => valid.has(answer));
  const readings = step.readings.filter(answer => valid.has(answer));
  const kcIds = step.kcIds.filter(sharedRule);
  // Giving the class removes that question from the next assessment. Neither
  // this choice nor guided conjugation demonstrates independent application.
  return [
    {
      kind: 'classification', diagnosticOnly: true, analysisItem: provided,
      surface: provided.surface, reading: provided.reading, form: 'past',
      classChoices: [
        { value: 'godan', label: classLabels.godan },
        { value: 'ichidan', label: classLabels.ichidan },
      ],
      expectedClass: cls, answers: [cls], readings: [cls], kcIds: [], focusId: null,
      continuation: true, targetLabel: '动词类别',
      note: '这里只确认中间形式的类别，不计入知识点统计。',
      classificationExplanation: `「${family.label}」构成的中间形式继续按${classLabels[cls]}变化。`,
    },
    {
      kind: 'conjugation', providedClass: cls, analysisItem: provided,
      surface: provided.surface, reading: provided.reading, form: 'past',
      providedAnswers: bases, answers, readings, kcIds, focusId: rule,
      continuation: true, targetLabel: '过去形',
      note: `已知这个中间形式是${classLabels[cls]}，本步只检查过去变化。`,
      reviewContext: {
        sourceItem: { domain: item.domain, class: item.class, surface: item.surface, reading: item.reading },
        family: { form: family.form, ending: 'past', outputClass: cls, label: family.label },
        kcIds: [...step.kcIds],
      },
    },
  ];
}

function sourcePrefix(item, word) {
  if (typeof word !== 'string') return '';
  if (item.class === 'irregular') return /(?:する|くる|来る)$/.test(word) ? word.slice(0, -2) : '';
  return word.slice(0, -1);
}

function kanaScript(char) {
  if (/^[ぁ-ゖ]$/u.test(char)) return 'hiragana';
  if (/^[ァ-ヺ]$/u.test(char)) return 'katakana';
  return null;
}

// These are edits within the original lexical prefix, never a whole-answer
// distance. The derived stem and auxiliary between this prefix and the past
// ending must match separately and exactly.
function singlePrefixEdit(expected, actual) {
  const before = Array.from(expected), after = Array.from(actual);
  if (!before.length || !after.length) return null;
  if (before.length === after.length) {
    const differences = before.flatMap((char, i) => char === after[i] ? [] : [i]);
    if (differences.length === 1) {
      const i = differences[0], script = kanaScript(before[i]);
      return script && script === kanaScript(after[i]) ? 'substitution' : null;
    }
    if (differences.length === 2) {
      const [a, b] = differences;
      if (b === a + 1 && before[a] === after[b] && before[b] === after[a]
        && kanaScript(before[a]) && kanaScript(before[a]) === kanaScript(before[b])) return 'transposition';
    }
  } else if (before.length === after.length + 1) {
    if (before.some((char, i) => kanaScript(char)
      && before.slice(0, i).concat(before.slice(i + 1)).join('') === actual)) return 'deletion';
  } else if (after.length === before.length + 1) {
    if (after.some((char, i) => kanaScript(char)
      && [before[i - 1], before[i]].some(neighbor => kanaScript(neighbor) === kanaScript(char))
      && after.slice(0, i).concat(after.slice(i + 1)).join('') === expected)) return 'insertion';
  }
  return null;
}

/**
 * Observe bounded mixed differences without inferring a failed rule. This is
 * deliberately separate from the strict class/っ collision diagnosis, and is
 * consulted only after exact diagnoses and ordinary lexical retries.
 */
export function diagnoseMixedContinuationPast(item, step, family, answer, normalize = value => value) {
  if (typeof answer !== 'string' || step.kind === 'classification') return null;
  const givenClass = step.kind === 'conjugation' && step.providedClass;
  if (givenClass) {
    const saved = step.reviewContext;
    if (!saved || saved.family?.outputClass !== step.providedClass) return null;
    item = saved.sourceItem;
    family = saved.family;
    step = { ...step, kind: undefined, providedClass: undefined, kcIds: saved.kcIds };
  }
  const context = conflictContext(item, step, family);
  if (!context) return null;
  const actual = normalize(answer);
  if ([...step.answers, ...step.readings].some(correct => normalize(correct) === actual)) return null;
  const correctTail = context.cls === 'godan' ? 'った' : 'た';
  const tails = pastBodies.flatMap(body => ['た', 'だ'].map(terminal => body + terminal))
    .filter(tail => tail !== correctTail);
  const prefixes = unique([item.surface, item.reading].map(word => normalize(sourcePrefix(item, word))).filter(Boolean));
  const observations = new Map();
  for (const base of context.bases) {
    const fixed = normalize(base.slice(0, -1));
    for (const tail of tails) {
      if (!actual.endsWith(normalize(tail))) continue;
      const actualFixed = actual.slice(0, -normalize(tail).length);
      if (actualFixed === fixed) {
        observations.set(JSON.stringify([fixed, actualFixed, null]), null);
        continue;
      }
      for (const prefix of prefixes) {
        if (!fixed.startsWith(prefix)) continue;
        const bridge = fixed.slice(prefix.length);
        if (bridge && !actualFixed.endsWith(bridge)) continue;
        const actualPrefix = bridge ? actualFixed.slice(0, -bridge.length) : actualFixed;
        const operation = singlePrefixEdit(prefix, actualPrefix);
        if (!operation) continue;
        const mismatch = { expected: prefix, actual: actualPrefix, operation };
        observations.set(JSON.stringify([fixed, actualFixed, mismatch]), mismatch);
      }
    }
  }
  // Accepted contractions can yield distinct ending boundaries. Do not pick a
  // convenient lexical correction or segmentation when the readings disagree.
  if (observations.size !== 1) return null;
  const rootMismatch = [...observations.values()][0];
  const observation = rootMismatch
    ? `给定前部「${rootMismatch.expected}」，你写成了「${rootMismatch.actual}」；过去变化末尾也不同。`
    : '给定的前部已保留，但过去变化末尾还有差异。';
  return {
    kcId: null, confirmedKcIds: [],
    message: observation + (givenClass
      ? '这些差异仍不能唯一对应某个知识点，本次未更新掌握度。'
      : '先确认中间形式的词类，再按给定词类检查变化；本次未更新知识点。'),
    review: { kind: 'mixed-past', form: 'past', label: `${family.label}的过去变化`, rootMismatch },
  };
}

/** Only explicit class-given probes may bypass the old class ambiguity guard. */
export function diagnoseGivenClassPast(step, answer, normalize = value => value) {
  const cls = step.providedClass;
  if (step.kind !== 'conjugation' || step.form !== 'past'
    || !['godan', 'ichidan'].includes(cls) || step.analysisItem?.class !== cls) return null;
  const bases = unique(step.providedAnswers ?? [step.surface, step.reading]);
  if (!bases.length || bases.some(base => typeof base !== 'string' || !base.endsWith('る'))) return null;
  const allowed = step.kcIds.filter(sharedRule);
  const diagnostics = bases.map(base => diagnoseCommonVerbError(
    { domain: 'verb', surface: base, reading: base, class: cls }, 'past', answer, normalize, allowed,
  )).filter(Boolean);
  // A supplied contraction is still a complete grammatical base. Retaining
  // its final る must not become a lexical typo against the longer variant
  // merely because drop-ru was excluded from this step's scoring scope.
  if (!diagnostics.length && cls === 'ichidan' && !allowed.includes('stem.ichidan.drop-ru')
    && bases.some(base => normalize(base + 'た') === normalize(answer))) {
    return { kcId: null, confirmedKcIds: [],
      message: '接续前仍保留了「る」。本步只评估过去接续，不额外评估去「る」规则。' };
  }
  if (!diagnostics.length || unique(diagnostics.map(diagnosis => diagnosis.kcId)).length !== 1) return null;
  return { ...diagnostics[0], confirmedKcIds: [] };
}
