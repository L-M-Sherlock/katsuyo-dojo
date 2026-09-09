import { acceptedConjugations } from './conjugation.mjs';
import { DIAGNOSTIC_FORMS, diagnosticFamily, buildDiagnosticPlan, atomicSteps } from './diagnostic-plan.mjs';
import { diagnoseContinuationClassConflict, buildContinuationClassProbes } from './continuation-class-probes.mjs';

const identity = value => value;
const verbForms = DIAGNOSTIC_FORMS.filter(form => !form.startsWith('adjective'));
const otherFormsCache = new WeakMap();

// A complete different expression is a competing explanation outside this
// stage. E.g. 書いていった may be ていく past rather than ている + extra っ.
function matchingForms(item, answer, normalize) {
  let cache = otherFormsCache.get(normalize);
  if (!cache) { cache = new Map(); otherFormsCache.set(normalize, cache); }
  const key = JSON.stringify([item.surface, item.reading, item.class]);
  if (!cache.has(key)) {
    const byAnswer = new Map();
    for (const word of new Set([item.surface, item.reading])) for (const other of verbForms) {
      if (other === 'causativePassiveContracted' && (item.class !== 'godan' || word.endsWith('す'))) continue;
      for (const value of acceptedConjugations(word, item.class, other)) {
        const normalized = normalize(value);
        if (!byAnswer.has(normalized)) byAnswer.set(normalized, new Set());
        byAnswer.get(normalized).add(other);
      }
    }
    if (cache.size >= 256) cache.delete(cache.keys().next().value);
    cache.set(key, byAnswer);
  }
  return [...(cache.get(key).get(normalize(answer)) ?? [])];
}

function matchesAnotherForm(item, form, answer, normalize, permitted = []) {
  return matchingForms(item, answer, normalize).some(other => other !== form && !permitted.includes(other));
}

const localRule = id => /^(stem\.|onbin\.|suffix\.|exception\.|adj\.(stem|suffix|exception)\.)/.test(id);
const endingLabels = { past: '过去形', negative: '否定形', negativePast: '否定过去形' };

// This inventory is about expression identity. A sibling must preserve the
// same constructed expression; an arbitrary form of the same original verb
// cannot establish which stage to check. Accepted contractions are supplied
// by each sibling's correct-form engine, rather than stripped suffixes.
function familyForms(family) {
  return verbForms.filter(form => diagnosticFamily(form)?.form === family.form);
}

function remainingPastProbe(source, family, answer, normalize) {
  const negativeForm = `${family.form}Negative`;
  const surfaces = acceptedConjugations(source.surface, source.class, negativeForm);
  const readings = acceptedConjugations(source.reading, source.class, negativeForm);
  const actual = normalize(answer), pairs = new Map();
  for (const [index, surface] of surfaces.entries()) {
    const reading = (readings[index] ?? readings[0]).replaceAll('出来', 'でき');
    if (![surface, readings[index]].filter(Boolean).some(value => normalize(value) === actual)) continue;
    if (!surface.endsWith('ない') || !reading.endsWith('ない')) continue;
    pairs.set(JSON.stringify([surface, reading]), { surface, reading });
  }
  if (pairs.size !== 1) return null;
  const { surface, reading } = [...pairs.values()][0];
  const provided = { domain: 'adjective', class: 'i', surface, reading, iiFamily: false };
  const [past] = atomicSteps(buildDiagnosticPlan(provided, 'adjectivePast'), 'adjectivePast', ['adj.suffix.i-past']);
  return { ...past, providedAnswers: [...new Set([surface, reading])], targetLabel: '过去形' };
}

export function prioritizeContinuationFormSwitch(item, answer, contexts, normalize = identity) {
  if (item.domain !== 'verb' || typeof answer !== 'string') return null;
  const matches = [];
  for (const { step, family, scope } of contexts) {
    if (!family || !step.continuation || step.kind || step.providedClass) continue;
    const source = step.analysisItem ?? item;
    const siblings = familyForms(family);
    const complete = matchingForms(source, answer, normalize);
    // The standalone selector has the same accepted-answer guard as the page.
    if (complete.includes(step.form)) continue;
    const alternatives = complete.filter(form => siblings.includes(form));
    if (!alternatives.length || matchesAnotherForm(source, step.form, answer, normalize, siblings)) continue;
    // A nested stage is evaluated against its actual supplied source. Also
    // reject a complete competing expression of the original lexical item.
    if (source !== item && matchingForms(item, answer, normalize).length) continue;
    const kcIds = [...new Set(scope)].filter(localRule);
    if (!kcIds.length) continue;
    matches.push({ step, source, family, alternatives, kcIds });
  }
  if (matches.length !== 1) return null;
  const { step, source, family, alternatives, kcIds } = matches[0];
  const written = [...new Set(alternatives.map(form => endingLabels[diagnosticFamily(form).ending]))].join('／');
  const target = endingLabels[family.ending];
  const remainingPast = family.ending === 'negativePast' && kcIds.includes('adj.suffix.i-past')
    && alternatives.every(form => diagnosticFamily(form).ending === 'negative')
    ? remainingPastProbe(source, family, answer, normalize) : null;
  const selected = remainingPast ?? { ...step, kcIds, focusId: kcIds.at(-1) };
  const probeSelection = {
    strategy: 'continuation-form-switch', form: step.form,
    label: `${family.label}的${target}`, candidateKcIds: selected.kcIds,
    matchedForms: alternatives,
    message: `你的答案匹配到「${family.label}」的${written}，本题要求${target}。${remainingPast
      ? '下面保留这个否定形式，只检查剩余的过去变化。'
      : '先给出这个表达的中间形式，只检查后续变化。'}前面的构成步骤未单独检查，不会因这次定位而记对。`,
  };
  // Retain shared tail rules even when they also occur in the skipped base.
  // This route provides no evidence about that base or independent chaining.
  return [{ ...selected, probeSelection }];
}

export function prioritizeContinuation(item, answer, contexts, normalize = identity) {
  const past = prioritizeContinuationPast(item, answer, contexts, normalize);
  const switched = prioritizeContinuationFormSwitch(item, answer, contexts, normalize);
  // Multiple distinct candidate routes cannot choose a winner by order.
  return past && switched ? null : past ?? switched;
}

// This selects questions, never scoring evidence. Candidates come from exact
// whole-input matches with a grammar-defined fixed prefix, not edit distance.
// Multiple matched contexts or a different legal expression retain the caller's
// full plan. Mixed lexical errors do not match the strict class/っ contract.
export function prioritizeContinuationPast(item, answer, contexts, normalize = identity) {
  if (item.domain !== 'verb' || typeof answer !== 'string') return null;
  const matches = [];
  for (const { step, family, scope } of contexts) {
    // Earlier steps will not be assessed. Restore shared rules required by the
    // actual continuation; their presence in the skipped base is not evidence
    // that they have already been evaluated.
    const parent = { ...step, kcIds: [...new Set(scope)] };
    const diagnosis = diagnoseContinuationClassConflict(item, parent, family, answer, normalize);
    if (diagnosis) matches.push({ parent, family, stage: diagnosis.stage });
  }
  if (matches.length !== 1) return null;
  const { parent, family, stage } = matches[0];
  if (matchesAnotherForm(item, parent.form, answer, normalize)) return null;
  const probes = buildContinuationClassProbes(item, parent, family);
  if (probes.length !== 2) return null;
  const probeSelection = {
    strategy: 'continuation-past', form: parent.form, label: stage.label,
    candidateKcIds: stage.candidateKcIds,
    message: `你的答案匹配到「${family.label}」过去变化的候选错误，先确认中间形式的词类，再检查过去变化。前面的构成步骤未单独检查，不会因这次定位而记对。`,
  };
  return [{ ...probes[0], probeSelection }, probes[1]];
}
