import { CHAIN_FORM_SPECS, chainOutputClass } from './multi-step-forms.mjs';
import { deriveExercise, diagnoseConjugation, diagnoseCommonConjugationError, classificationKcIds } from './knowledge-model.mjs';
import { deriveAdjectiveExercise } from './adjective-knowledge-model.mjs';
import { diagnoseAdjective, diagnoseCommonAdjectiveError } from './adjective-conjugation.mjs';
import { COMPOUND_FORM_SPECS } from './compound-forms.mjs';
import { conjugate } from './conjugation.mjs';
import { continuationAnswers } from './continuation-answers.mjs';
import { diagnoseEndingOmission } from './ending-omission.mjs';
import { hasLexicalTypo } from './lexical-typo.mjs';
import { diagnoseContinuationClassConflict, buildContinuationClassProbes, diagnoseGivenClassPast, diagnoseMixedContinuationPast } from './continuation-class-probes.mjs';
import { diagnosePassiveStageError } from './passive-stage-diagnosis.mjs';
import { prioritizeContinuation } from './probe-routing.mjs';
import { UNIFIED_COURSES, COURSE_BY_ID, sourceForForm, VOICE_BASE_FORMS } from './unified-curriculum.mjs';

const unique = (ids) => [...new Set(ids)];
const stemForms = new Set(['tai', 'nagara', 'tsutsu', 'sugiru', 'tagaru', 'nasai']);
const teForms = new Set(['teageru', 'temorau', 'tekureru', 'tekudasai', 'teiru', 'teru', 'tearu', 'teoru', 'toru', 'tehoshii', 'temo', 'tewa', 'temoIi', 'temiru', 'teiku', 'teku', 'tekuru', 'teshimau', 'chau', 'teoku', 'toku']);
const negativeForms = new Set(['nakute', 'naide', 'naideKudasai', 'nakutemoIi', 'nakerebaNaranai', 'nakutewaIkenai', 'naitoIkenai']);
const otherBases = { tara: 'past', tari: 'past', tatte: 'past', masenka: 'masu', youtosuru: 'volitional' };
const iRules = {
  past: ['adj.suffix.i-past'],
  negative: ['adj.stem.i-ku', 'adj.suffix.i-negative'],
  negativePast: ['adj.stem.i-ku', 'adj.suffix.i-negative', 'adj.suffix.i-past', 'adj.compound.i-negative-past'],
  te: ['adj.stem.i-ku', 'adj.suffix.i-te'],
};
const endingLabels = { past: '过去形', negative: '否定形', negativePast: '否定过去形' };
const legacyFor = (item, form) => item.domain === 'verb' ? deriveExercise(item, form) : deriveAdjectiveExercise(item, form);
const asReading = (item) => ({ ...item, surface: item.reading, lexicalSurface: item.surface });
function familyFor(form) {
  if (COMPOUND_FORM_SPECS[form]) return COMPOUND_FORM_SPECS[form];
  const voice = form?.match(/^(passive|potential|causative|causativePassive)(Past|Negative|NegativePast)$/);
  if (voice) return { form: voice[1], ending: voice[2][0].toLowerCase() + voice[2].slice(1), outputType: 'verb', outputClass: 'ichidan' };
  return null;
}
const applicationLabels = { tai: 'たい', tehoshii: 'てほしい', passive: '受身形', potential: '可能形', causative: '使役形', causativePassive: '使役受身形', ...Object.fromEntries(Object.values(COMPOUND_FORM_SPECS).map(spec => [spec.form, spec.label])) };
function applicationId(base) { return `apply.${base}.continuation`; }
function applicationFacet(base, ending) { return `facet.apply.${base}.${ending}`; }

export function deriveUnified(item, form) {
  const original = legacyFor(item, form);
  const operation = (input, output, kcIds, exerciseForm = form, providedItem = item) => ({ input, output, kcIds: unique(kcIds), form: exerciseForm, item: providedItem });
  if (!form) return { ...original, operations: [operation(item.surface, original.answer, original.requiredKcIds)] };
  if (item.domain === 'adjective') {
    if (item.class === 'i' && ['adjectiveNegative', 'adjectiveTe'].includes(form)) {
      const suffixId = form === 'adjectiveNegative' ? 'adj.suffix.i-negative' : 'adj.suffix.i-te';
      const stem = original.answer.slice(0, form === 'adjectiveNegative' ? -2 : -1);
      return { ...original, operations: [
        operation(item.surface, stem, original.requiredKcIds.filter(id => id !== suffixId)),
        operation(stem, original.answer, [suffixId]),
      ] };
    }
    if (form === 'adjectiveNaNegativePast') {
      const base = deriveUnified(item, 'adjectiveNaNegative');
      const ids = ['adj.suffix.i-past', 'adj.compound.na-negative-past'];
      return { ...original, requiredKcIds: unique([...base.requiredKcIds, ...ids]), operations: [...base.operations, operation(base.answer, original.answer, ids)], prerequisiteIds: ['adj.suffix.i-past', 'adj.suffix.na-negative'] };
    }
    if (form === 'adjectiveNegativePast') {
      const base = deriveUnified(item, 'adjectiveNegative');
      return { ...original, requiredKcIds: unique([...base.requiredKcIds, ...iRules.negativePast]),
        operations: [...base.operations, operation(base.answer, original.answer, ['adj.suffix.i-past', 'adj.compound.i-negative-past'])], prerequisiteIds: ['adj.suffix.i-past', 'adj.suffix.i-negative'] };
    }
    return { ...original, operations: [operation(item.surface, original.answer, original.requiredKcIds)] };
  }
  const chain = CHAIN_FORM_SPECS[form];
  if (chain) {
    const base = deriveUnified(item, chain.base);
    const intermediate = {domain:'verb',surface:base.answer,reading:base.answer,class:chainOutputClass(chain,base.answer)};
    const tail = deriveUnified(intermediate,chain.tail);
    const relevant = id => !/^(class\.|heuristic\.|lexeme\.|facet\.class\.)/.test(id);
    const requiredKcIds = unique([...base.requiredKcIds,...tail.requiredKcIds.filter(relevant),chain.kcId]);
    return {...original,requiredKcIds,
      operations:[...base.operations,...tail.operations.map((op,index)=>({...op,kcIds:unique([...op.kcIds.filter(relevant),...(index===tail.operations.length-1?[chain.kcId]:[])])}))],
      prerequisiteIds:requiredKcIds.filter(id=>id!==chain.kcId&&!id.startsWith('facet.')&&!id.startsWith('lexeme.'))};
  }
  const family = familyFor(form);
  if (family) {
    const base = deriveUnified(item, family.form);
    const continuationItem = { domain: family.outputType === 'iAdjective' ? 'adjective' : 'verb', surface: base.answer, reading: base.answer,
      class: family.outputType === 'iAdjective' ? 'i' : ['aru', 'iku'].includes(family.outputClass) ? 'godan' : family.outputClass === 'kuru' ? 'irregular' : family.outputClass };
    const ruleItem = family.outputClass === 'kuru' ? { ...continuationItem, surface: '来る', reading: 'くる' } : family.outputClass === 'irregular' ? { ...continuationItem, surface: 'する', reading: 'する' } : family.outputClass === 'iku' ? { ...continuationItem, surface: '行く', reading: 'いく' } : family.outputClass === 'aru' ? { ...continuationItem, surface: 'ある', reading: 'ある' } : continuationItem;
    const rules = family.outputClass === 'aru' && family.ending !== 'past' ? ['exception.aru-negative', ...(family.ending === 'negativePast' ? ['adj.suffix.i-past'] : [])] : family.outputType === 'iAdjective' ? iRules[family.ending]
      : deriveUnified(ruleItem, family.ending).requiredKcIds.filter((id) => !id.startsWith('class.') && !id.startsWith('heuristic.') && !id.startsWith('lexeme.') && !id.startsWith('facet.class.'));
    const ids = unique([...rules, applicationId(family.form), applicationFacet(family.form, family.ending)]);
    return { ...original, requiredKcIds: unique([...base.requiredKcIds, ...ids]),
      operations: [...base.operations, operation(base.answer, original.answer, ids)],
      prerequisiteIds: unique([...base.requiredKcIds, ...rules]).filter((id) => !id.startsWith('facet.') && !id.startsWith('lexeme.')) };
  }
  if (form === 'passiveDesireNegativePast') {
    const base = deriveUnified(item, 'passive');
    const intermediate = { domain: 'verb', surface: base.answer, reading: base.answer, class: 'ichidan' };
    const tail = deriveUnified(intermediate, 'taiNegativePast');
    return { ...original, requiredKcIds: unique([...base.requiredKcIds, ...tail.requiredKcIds.filter(id => !id.startsWith('class.') && !id.startsWith('heuristic.')), 'compound.multi-step']),
      operations: [...base.operations, ...tail.operations.map((op, index) => ({ ...op, kcIds: [...op.kcIds.filter(id => !id.startsWith('class.') && !id.startsWith('heuristic.')), ...(index === tail.operations.length - 1 ? ['compound.multi-step'] : [])] }))],
      prerequisiteIds: unique([...base.requiredKcIds, applicationId('tai'), ...iRules.negativePast]) };
  }
  if (/^masu(Past|Negative|NegativePast)$/.test(form)) {
    const base = deriveUnified(item, 'masu');
    const ids = original.requiredKcIds.filter(id => id.startsWith('compound.polite-'));
    return { ...original, requiredKcIds: unique([...base.requiredKcIds, ...ids]), operations: [...base.operations, operation(base.answer, original.answer, ids)], prerequisiteIds: ['suffix.masu'] };
  }
  if (form === 'negativePast') {
    const base = deriveUnified(item, 'negative');
    const ids = ['adj.suffix.i-past', 'compound.negative-past'];
    return { ...original, requiredKcIds: unique([...base.requiredKcIds, ...ids]), operations: [...base.operations, operation(base.answer, original.answer, ids)], prerequisiteIds: ['suffix.negative', 'adj.suffix.i-past'] };
  }
  if (form === 'masu' || stemForms.has(form)) {
    const stem = conjugate(item.surface, item.class, 'masu').slice(0, -2);
    const stemIds = item.class === 'irregular' ? ['stem.irregular.connective', `facet.stem.connective.${item.surface.endsWith('する') ? 'suru' : 'kuru'}`]
      : [item.class === 'ichidan' ? 'stem.ichidan.drop-ru' : 'stem.godan.i'];
    const ids = form === 'masu' ? original.requiredKcIds.filter(id => id.startsWith('suffix.') || id.startsWith('facet.form.')) : [form === 'nasai' ? 'suffix.nasai' : `construction.${form}`];
    return { ...original, requiredKcIds: unique([...classificationKcIds(item), ...stemIds, ...ids]),
      operations: [operation(item.surface, stem, [...classificationKcIds(item), ...stemIds]), operation(stem, original.answer, ids)],
      prerequisiteIds: form === 'masu' ? [] : stemIds.filter(id => !id.startsWith('facet.')) };
  }
  const baseForm = teForms.has(form) ? 'te' : negativeForms.has(form) ? 'negative' : otherBases[form];
  if (baseForm) {
    const base = deriveUnified(item, baseForm);
    const suffixIds = original.requiredKcIds.filter(id => id.startsWith('construction.'));
    const shared = form === 'nakute' || form === 'nakutemoIi' || form === 'nakutewaIkenai' ? iRules.te : form === 'nakerebaNaranai' ? ['adj.suffix.i-ba'] : [];
    const ids = unique([...shared, ...suffixIds]);
    if (form === 'nakute') {
      const ku = base.answer.slice(0,-1) + 'く';
      return { ...original, requiredKcIds:unique([...base.requiredKcIds,...ids]),
        operations:[...base.operations,operation(base.answer,ku,['adj.stem.i-ku']),operation(ku,original.answer,['adj.suffix.i-te','construction.nakute'])],
        prerequisiteIds:['suffix.negative',...shared] };
    }
    return { ...original, requiredKcIds: unique([...base.requiredKcIds, ...ids]), operations: [...base.operations, operation(base.answer, original.answer, ids)], prerequisiteIds: [`suffix.${baseForm}`, ...shared, ...({ naideKudasai: ['construction.naide'], nakutemoIi: ['construction.nakute'] }[form] ?? [])] };
  }
  return { ...original, operations: [operation(item.surface, original.answer, original.requiredKcIds)] };
}

function negativeIntermediate(item, form, answer, normalize) {
  if (item.domain !== 'adjective' || typeof answer !== 'string') return null;
  const baseForm = { adjectiveNegativePast: 'adjectiveNegative', adjectiveNaNegativePast: 'adjectiveNaNegative' }[form];
  if (!baseForm) return null;
  const base = deriveUnified(item, baseForm);
  const reading = deriveUnified(asReading(item), baseForm);
  if (![...base.acceptedVariants, ...reading.acceptedVariants].some(value => normalize(value) === normalize(answer))) return null;
  return {
    kcId: null,
    message: '已写对否定形，但尚未完成过去变化。已完成的步骤无需重做，只需检查剩余的过去变化。',
    confirmedKcIds: base.requiredKcIds.filter(id => id.startsWith('adj.stem.') || id.startsWith('adj.suffix.') || id.startsWith('adj.exception.')),
  };
}

// Completed transformations are observable evidence. Classification, coverage,
// and transfer/application are not established merely by reaching an output.
const observableRule = id => id !== 'exception.ru-godan' && /^(stem\.|onbin\.|suffix\.|construction\.|exception\.|adj\.(stem|suffix|exception)\.)/.test(id);
const transformationRule = id => !/^(class\.|adj\.class\.|heuristic\.|facet\.|lexeme\.)/.test(id);

// A complete negative of a supplied intermediate is observable progress. It
// does not establish whether the remaining past rule or its application failed.
// Derive each supplied variant independently; an arbitrary matching suffix is
// insufficient evidence when the given lexical prefix has been changed.
function suppliedNegativeIntermediate(item, step, answer, normalize) {
  const family = item.domain === 'verb' && step.continuation ? familyFor(step.form) : null;
  if (family?.ending !== 'negativePast' || typeof answer !== 'string') return null;
  const actual = normalize(answer), matches = [];
  for (const base of unique(step.providedAnswers ?? [step.surface, step.reading])) {
    let prefix = '', word = base;
    const tails = { aru: ['ある'], iku: ['行く', 'いく'], kuru: ['来る', 'くる'], irregular: ['する'] }[family.outputClass];
    if (tails) {
      const tail = tails.find(tail => base.endsWith(tail));
      if (!tail) continue;
      prefix = base.slice(0, -tail.length);
      word = tail;
    }
    const adjective = family.outputType === 'iAdjective';
    const proxy = { domain: adjective ? 'adjective' : 'verb', surface: word, reading: word,
      class: adjective ? 'i' : ['aru', 'iku'].includes(family.outputClass) ? 'godan'
        : ['kuru', 'irregular'].includes(family.outputClass) ? 'irregular' : family.outputClass,
      ...(adjective ? { iiFamily: false } : {}) };
    const negative = family.outputClass === 'aru'
      ? { acceptedVariants: ['ない'], requiredKcIds: ['exception.aru-negative'] }
      : deriveUnified(proxy, adjective ? 'adjectiveNegative' : 'negative');
    if (!negative.acceptedVariants.some(value => normalize(prefix + value) === actual)) continue;
    matches.push(negative.requiredKcIds.filter(id => observableRule(id) && step.kcIds.includes(id)));
  }
  if (!matches.length) return null;
  return { kcId: null,
    confirmedKcIds: matches[0].filter(id => matches.every(ids => ids.includes(id))),
    message: '已写对给定形式的否定变化，但尚未完成过去变化。已确认的规则不重复评估，下面只检查剩余的过去变化。' };
}

function operationEvidence(item, form, answer, normalize) {
  if (!form || typeof answer !== 'string') return null;
  const surface = deriveUnified(item, form), reading = deriveUnified(asReading(item), form);
  const actual = normalize(answer);
  if ([...surface.acceptedVariants, ...reading.acceptedVariants].some(value => normalize(value) === actual)) return null;
  const matches = [];
  for (const derived of [surface, reading]) {
    for (let index = 0; index < derived.operations.length - 1; index++) {
      const op = derived.operations[index];
      let matchesOutput = normalize(op.output) === actual;
      if (!matchesOutput) {
        // A completed form may have accepted short/contracted variants. A
        // stem operation is not the whole form and cannot borrow its variants.
        const whole = legacyFor(op.item, op.form);
        matchesOutput = op.output === whole.answer && whole.acceptedVariants.some(value => normalize(value) === actual);
      }
      if (!matchesOutput || normalize(op.input) === actual) continue;
      matches.push(index);
    }
  }
  // A surface shared by different stages does not identify how far the learner
  // got. Do not infer the latest stage just because it appears later in a list.
  if (!matches.length || new Set(matches).size !== 1) return null;
  const index = matches[0];
  const completed = surface.operations.slice(0, index + 1);
  const confirmedKcIds = unique(completed.filter(op => normalize(op.input) !== normalize(op.output)).flatMap(op => op.kcIds)).filter(observableRule);
  const remaining = surface.operations.slice(index + 1);
  const remainingIds = unique(remaining.flatMap(op => op.kcIds)).filter(transformationRule);
  const kcId = remaining.length === 1 && remainingIds.length === 1 ? remainingIds[0] : null;
  return { surface, reading, index, kcId, confirmedKcIds };
}

function stoppedOperationDiagnosis(evidence) {
  return { kcId: evidence.kcId, confirmedKcIds: evidence.confirmedKcIds,
    message: evidence.kcId
      ? '已完成前面的变化，但漏掉了最后的接续。已确认完成的步骤，仅将缺少的接续记错。'
      : '已写出正确的中间形式。已完成的步骤无需重做，剩余变化还涉及多个知识点，请继续单独检查。' };
}

function unfinishedAppendDiagnosis(item, form, answer, normalize) {
  const actual = normalize(answer);
  const candidates = [];
  for (const word of [item, asReading(item)]) {
    const derived = deriveUnified(word, form), last = derived.operations.at(-1);
    if (derived.operations.length < 2) continue;
    const ids = last.kcIds.filter(transformationRule);
    if (ids.length !== 1) continue;
    const base = normalize(last.input), target = normalize(last.output);
    // Only an appended grammatical suffix with at least one surviving suffix
    // character. Root deletion and changed stems are handled separately.
    if (!target.startsWith(base) || !actual.startsWith(base) || actual.length <= base.length) continue;
    if (Array.from(target).slice(0, -1).join('') !== actual) continue;
    const confirmedKcIds = unique(derived.operations.slice(0, -1).filter(op => normalize(op.input) !== normalize(op.output)).flatMap(op => op.kcIds)).filter(observableRule);
    candidates.push({ kcId: ids[0], confirmedKcIds, message: '前面的形式正确，最后接续少写了末尾字符。仅将未完成的接续记错。' });
  }
  return candidates.length && new Set(candidates.map(candidate => candidate.kcId)).size === 1 ? candidates[0] : null;
}

function nestedAppendDiagnosis(item, form, answer, normalize) {
  if (item.domain !== 'verb' || !['naideKudasai','nakutemoIi','nakutewaIkenai','nakerebaNaranai'].includes(form)) return null;
  const target = deriveUnified(item,form), actual = normalize(answer);
  for (const word of [item,asReading(item)]) {
    const baseForm = form === 'naideKudasai' ? 'naide' : form === 'nakerebaNaranai' ? 'negative' : 'nakute';
    const base = deriveUnified(word,baseForm);
    const intermediate = form === 'nakerebaNaranai' ? base.answer.slice(0,-1)+'ければ' : base.answer;
    const canonical = legacyFor(word,form).answer;
    if (actual !== normalize(intermediate) && actual !== normalize(Array.from(canonical).slice(0,-1).join(''))) continue;
    const rules = [...base.requiredKcIds,...(form === 'nakerebaNaranai' ? ['adj.suffix.i-ba'] : [])];
    return {kcId:`construction.${form}`, confirmedKcIds:unique(rules).filter(id => observableRule(id) && target.requiredKcIds.includes(id)),
      message:'前面的接续形式正确，最后的表达尚未完成。已确认前置变化，仅将最后的接续记错。'};
  }
  return null;
}

function commonDiagnosis(item, form, answer, normalize, required) {
  const diagnose = item.domain === 'verb' ? diagnoseCommonConjugationError : diagnoseCommonAdjectiveError;
  const matches = [item, asReading(item)].map(word => diagnose(word,form,answer,normalize,required)).filter(Boolean);
  return matches.length && unique(matches.map(match => match.kcId)).length === 1 ? matches[0] : null;
}

export function diagnoseUnified(item, form, answer, normalize = value => value) {
  const intermediate = negativeIntermediate(item, form, answer, normalize);
  if (intermediate) return intermediate;
  const evidence = operationEvidence(item, form, answer, normalize);
  if (evidence) {
    const diagnosis = stoppedOperationDiagnosis(evidence);
    if (item.domain === 'adjective' && ['adjectiveNegative', 'adjectiveTe'].includes(form)) {
      const specific = diagnoseAdjective(item, form, answer, normalize) ?? diagnoseAdjective(asReading(item), form, answer, normalize);
      if (specific?.kcId === diagnosis.kcId) diagnosis.message = specific.message;
    }
    return diagnosis;
  }
  const diagnose = item.domain === 'verb' ? diagnoseConjugation : diagnoseAdjective;
  // Exhaust explicit candidates in both writings before a truncation fallback
  // can interpret the same kana input as an incompletely appended suffix.
  const diagnostic = diagnose(item, form, answer, normalize) ?? diagnose(asReading(item), form, answer, normalize);
  if (diagnostic?.targetMismatch) return diagnostic;
  const nested = nestedAppendDiagnosis(item, form, answer, normalize);
  if (nested && diagnostic?.kcId === nested.kcId) return nested;
  if (!diagnostic) return unfinishedAppendDiagnosis(item, form, answer, normalize)
    ?? nested
    ?? diagnoseEndingOmission(item, form, answer, normalize, deriveUnified(item,form).requiredKcIds)
    ?? commonDiagnosis(item,form,answer,normalize,deriveUnified(item,form).requiredKcIds)
    ?? diagnosePassiveStageError(item,form,answer,normalize);
  const family = familyFor(form);
  // A wrong continuation can be a rule error or a transfer error. The old
  // composite label cannot establish which one; use a supplied-base probe.
  if (family && (diagnostic.kcId.startsWith('composition.') || diagnostic.kcId === 'compound.voice-stack')) return null;
  const required = deriveUnified(item, form).requiredKcIds;
  if (!required.includes(diagnostic.kcId)) return null;
  return { ...diagnostic, confirmedKcIds: (diagnostic.confirmedKcIds ?? []).filter(id => required.includes(id)) };
}

function passiveProbes(item, splitStem = false) {
  const base = deriveUnified(item, 'passive'), kana = deriveUnified(asReading(item), 'passive');
  if (!splitStem) return [{ surface: item.surface, reading: item.reading, form: 'passive',
    answers: base.acceptedVariants, readings: kana.acceptedVariants,
    kcIds: base.requiredKcIds, focusId: 'suffix.passive', continuation: false, targetLabel: '受身形' }];
  const stem = base.answer.slice(0, -2), stemReading = kana.answer.slice(0, -2);
  const stemIds = base.requiredKcIds.filter(id => id.startsWith('stem.godan.'));
  return [
    { kind: 'stem', analysisItem: item, surface: item.surface, reading: item.reading, form: 'passive',
      answers: [stem], readings: [stemReading], kcIds: stemIds, focusId: stemIds.at(-1),
      continuation: false, targetLabel: 'ア段词干', note: '已知这是五段动词，本步只变化词尾，暂不接受身词尾。' },
    { kind: 'attachment', analysisItem: item, surface: stem, reading: stemReading, form: 'passive',
      providedAnswers: [stem, stemReading], answers: base.acceptedVariants, readings: kana.acceptedVariants,
      kcIds: ['suffix.passive'], focusId: 'suffix.passive', continuation: true, targetLabel: '受身形',
      note: '已提供正确词干，本步只检查受身接续。' },
  ];
}

function passiveDesireProbes(item, splitStem) {
  const steps = passiveProbes(item, splitStem);
  const base = deriveUnified(item, 'passive'), kana = deriveUnified(asReading(item), 'passive');
  const provided = { domain: 'verb', class: 'ichidan', surface: base.answer, reading: kana.answer };
  const desire = deriveUnified(provided, 'tai'), desireKana = deriveUnified(asReading(provided), 'tai');
  const target = deriveUnified(provided, 'taiNegativePast'), targetKana = deriveUnified(asReading(provided), 'taiNegativePast');
  // A supplied passive base establishes the route; only assess newly performed
  // rules. Reconstructing a guided path is not evidence of independent chaining.
  const completed = new Set(base.requiredKcIds);
  const desireIds = desire.requiredKcIds.filter(id => !completed.has(id) && transformationRule(id));
  desire.requiredKcIds.forEach(id => completed.add(id));
  const endingIds = target.requiredKcIds.filter(id => !completed.has(id));
  steps.push(
    { analysisItem: provided, surface: provided.surface, reading: provided.reading, form: 'tai',
      providedAnswers: [...base.acceptedVariants, ...kana.acceptedVariants],
      answers: desire.acceptedVariants, readings: desireKana.acceptedVariants, kcIds: desireIds,
      focusId: 'construction.tai', continuation: true, targetLabel: 'たい（愿望）' },
    { analysisItem: provided, surface: desire.answer, reading: desireKana.answer, form: 'taiNegativePast',
      providedAnswers: [...desire.acceptedVariants, ...desireKana.acceptedVariants],
      answers: target.acceptedVariants, readings: targetKana.acceptedVariants, kcIds: endingIds,
      focusId: applicationId('tai'), continuation: true, targetLabel: 'たい的否定过去形' },
  );
  return steps;
}

/** @param {{answer?: string, normalize?: (value: string) => string}} [options] */
export function unifiedDiagnosticSteps(item, form, options = {}) {
  const { answer, normalize = value => value } = options;
  const evidence = operationEvidence(item, form, answer, normalize);
  if (evidence && !negativeIntermediate(item, form, answer, normalize)) {
    if (evidence.kcId) return [];
    const { surface, reading, index } = evidence;
    const completedIds = new Set(surface.operations.slice(0, index + 1).flatMap(op => op.kcIds));
    const groups = [];
    for (let absolute = index + 1; absolute < surface.operations.length; absolute++) {
      const op = surface.operations[absolute], previous = groups.at(-1);
      if (previous && surface.operations[previous.start].form === op.form) previous.end = absolute;
      else groups.push({start:absolute,end:absolute});
    }
    return groups.map(({start,end}) => {
      const op = surface.operations[start], last = surface.operations[end], kanaOp = reading.operations[start];
      const isLast = end === surface.operations.length - 1;
      const allIds = unique(surface.operations.slice(start,end + 1).flatMap(operation => operation.kcIds));
      const kcIds = allIds.filter(id => !completedIds.has(id) && id !== 'compound.multi-step' && !id.startsWith('compound.chain.'));
      allIds.forEach(id => completedIds.add(id));
      const continuation = familyFor(op.form);
      const variants = continuationAnswers({baseForm:continuation?.form, ending:continuation?.ending,
        surfaceBase:op.input, readingBase:kanaOp.input,
        answers:CHAIN_FORM_SPECS[form] ? deriveUnified(op.item,op.form).acceptedVariants : isLast ? surface.acceptedVariants : [last.output], readings:CHAIN_FORM_SPECS[form] ? deriveUnified(kanaOp.item,op.form).acceptedVariants : isLast ? reading.acceptedVariants : [reading.operations[end].output]});
      return { surface: op.input, reading: kanaOp.input, form: op.form,
        analysisItem: { ...op.item, reading: kanaOp.item.surface },
        targetLabel: op.form === 'tai' ? 'たい（愿望）' : op.form === 'taiNegativePast' ? 'たい的否定过去形' : endingLabels[continuation?.ending],
        note: continuation?.form === 'causative' ? '本步请按给定的长使役形式继续变化；短使役形式使用另一套词尾变化。' : undefined,
        ...variants,
        providedAnswers: [op.input, kanaOp.input], kcIds, focusId: kcIds.filter(transformationRule).at(-1), continuation: true };
    }).filter(step => step.kcIds.length);
  }
  const chain = CHAIN_FORM_SPECS[form];
  if (chain) {
    const base=deriveUnified(item,chain.base),kana=deriveUnified(asReading(item),chain.base);
    const intermediate={domain:'verb',surface:base.answer,reading:kana.answer,class:chainOutputClass(chain,base.answer)};
    const tailSteps=unifiedDiagnosticSteps(intermediate,chain.tail).map(step=>({...step,
      analysisItem:step.analysisItem??intermediate,
      kcIds:step.kcIds.filter(id=>!/^(class\.|heuristic\.|lexeme\.|facet\.class\.)/.test(id)),
    }));
    const first={kind:'conjugation',surface:item.surface,reading:item.reading,form:chain.base,answers:base.acceptedVariants,readings:kana.acceptedVariants,
      kcIds:base.requiredKcIds,focusId:base.requiredKcIds.filter(id=>!id.startsWith('facet.')).at(-1),continuation:false};
    const stopped=[...base.acceptedVariants,...kana.acceptedVariants].some(value=>normalize(value)===normalize(answer??''));
    return stopped?tailSteps:[first,...tailSteps];
  }
  if (form === 'nakute' && item.domain === 'verb') {
    const base = deriveUnified(item, 'negative'), kana = deriveUnified(asReading(item), 'negative');
    const provided = { domain: 'adjective', class: 'i', surface: base.answer, reading: kana.answer, iiFamily: false };
    const ending = deriveUnified(provided, 'adjectiveTe'), endingKana = deriveUnified(asReading(provided), 'adjectiveTe');
    const steps = [
      { kind: 'conjugation', surface: item.surface, reading: item.reading, form: 'negative',
        answers: base.acceptedVariants, readings: kana.acceptedVariants, kcIds: base.requiredKcIds,
        focusId: 'suffix.negative', targetLabel: '否定形', continuation: false,
        probeSelection: { label: '否定变化', message: '先检查否定形，再检查后续变化；需要时再细分步骤。本次尚未更新知识点。' } },
      { kind: 'conjugation', surface: base.answer, reading: kana.answer, form: 'adjectiveTe', analysisItem: provided,
        answers: ending.acceptedVariants, readings: endingKana.acceptedVariants,
        kcIds: ending.requiredKcIds.filter(id => !id.startsWith('adj.class.') && !base.requiredKcIds.includes(id)),
        focusId: 'adj.suffix.i-te', targetLabel: 'なくて形', continuation: true },
    ];
    return [...base.acceptedVariants, ...kana.acceptedVariants].some(value => normalize(value) === normalize(answer ?? '')) ? steps.slice(1) : steps;
  }
  const stage = diagnosePassiveStageError(item, form, answer, normalize);
  if (form === 'passiveDesireNegativePast') {
    const steps = passiveDesireProbes(item, Boolean(stage));
    if (stage) return steps;
    const ending = steps.at(-1), source = ending.analysisItem;
    const base = deriveUnified(source, 'tai'), target = deriveUnified(source, 'taiNegativePast');
    const preferred = prioritizeContinuation(item, answer, [{ step: ending,
      family: { ...familyFor('taiNegativePast'), label: applicationLabels.tai },
      scope: unique(target.operations.slice(base.operations.length).flatMap(op => op.kcIds)),
    }], normalize);
    return preferred && !diagnoseUnified(item, form, answer, normalize)?.kcId
      && !diagnoseUnified(asReading(item), form, answer, normalize)?.kcId ? preferred : steps;
  }
  if (stage && form === 'passive') return passiveProbes(item, true);
  const family = item.domain === 'verb' ? familyFor(form) : null;
  const baseForm = family?.form ?? ({ passiveDesireNegativePast: 'passive', negativePast: 'negative', masuPast: 'masu', masuNegative: 'masu', masuNegativePast: 'masu', adjectiveNegativePast: 'adjectiveNegative', adjectiveNaNegativePast: 'adjectiveNaNegative' }[form] ?? null);
  if (!baseForm) return [];
  const base = deriveUnified(item, baseForm), baseReading = deriveUnified(asReading(item), baseForm);
  const target = deriveUnified(item, form), reading = deriveUnified(asReading(item), form);
  const last = target.operations.at(-1);
  const variants = continuationAnswers({baseForm:family?.form, ending:family?.ending,
    surfaceBase:base.answer, readingBase:baseReading.answer, answers:target.acceptedVariants, readings:reading.acceptedVariants});
  const steps = [
    { surface: item.surface, reading: item.reading, form: baseForm, answers: base.acceptedVariants, readings: baseReading.acceptedVariants, kcIds: base.requiredKcIds, focusId: base.requiredKcIds.filter(id => !id.startsWith('facet.')).at(-1), continuation: false },
    { surface: base.answer, reading: baseReading.answer, form, ...variants,
      note: family?.form === 'causative' ? '本步请按给定的长使役形式继续变化；短使役形式使用另一套词尾变化。' : undefined,
      targetLabel: ['negativePast', 'adjectiveNegativePast', 'adjectiveNaNegativePast'].includes(form) ? '过去形' : endingLabels[family?.ending],
      providedAnswers: [...base.acceptedVariants, ...baseReading.acceptedVariants].filter(answer =>
        (family?.form !== 'causative' || answer.endsWith('る'))
        && (family?.outputClass !== 'iku' || /(?:いく|行く)$/.test(answer))),
      kcIds: unique(target.operations.slice(base.operations.length).flatMap(op => op.kcIds)).filter(id => !base.requiredKcIds.includes(id)), focusId: family ? applicationId(baseForm) : last.kcIds.filter(id => !id.startsWith('facet.')).at(-1), continuation: true },
  ];
  if (stage) return [...passiveProbes(item, true), ...steps.slice(1)];
  const preferred = prioritizeContinuation(item, answer, [{ step: steps[1],
    family: family && { ...family, label: applicationLabels[family.form] },
    scope: unique(target.operations.slice(base.operations.length).flatMap(op => op.kcIds)),
  }], normalize);
  // A standalone caller must preserve the same explicit-diagnosis precedence
  // as createAnswerAnalyzer. Priority alone never confirms the skipped base.
  if (preferred && !diagnoseUnified(item, form, answer, normalize)?.kcId
    && !diagnoseUnified(asReading(item), form, answer, normalize)?.kcId) return preferred;
  return negativeIntermediate(item, form, answer, normalize) ? steps.slice(1) : steps;
}
export function diagnoseUnifiedStep(item, step, answer, normalize = value => value) {
  item = step.analysisItem ?? item;
  if (step.kind === 'classification') return null;
  if (step.providedClass) return diagnoseGivenClassPast(step, answer, normalize);
  if (step.kind === 'stem') {
    const actual = normalize(answer);
    const rows = { う:'わいうえおあ', く:'かきくけこ', ぐ:'がぎぐげご', す:'さしすせそ', つ:'たちつてと', ぬ:'なにぬねの', ぶ:'ばびぶべぼ', む:'まみむめも', る:'らりるれろ' };
    for (const word of [item, asReading(item)]) {
      const root = word.surface.slice(0, -1), ending = word.surface.at(-1);
      for (const row of rows[ending] ?? '') {
        if (actual !== normalize(root + row) || [...step.answers, ...step.readings].some(value => actual === normalize(value))) continue;
        const kcId = ending === 'う' && row === 'あ' ? 'stem.godan.u-wa' : 'stem.godan.a';
        if (step.kcIds.includes(kcId)) return { kcId, confirmedKcIds: [], message: '本步只检查五段词干，需要变为ア段；「う」结尾在这里变为「わ」。' };
      }
    }
    return null;
  }
  if (step.kind === 'attachment') {
    const actual = normalize(answer);
    for (const base of step.providedAnswers ?? [step.surface, step.reading]) {
      for (const tail of ['', 'られる', 'られ', 'る', 'れ', 'れるる', 'られれる', 'られられる']) {
        if (actual === normalize(base + tail)) return { kcId: 'suffix.passive', confirmedKcIds: [],
          message: '已提供正确的五段ア段词干，本步应接「れる」构成受身形。' };
      }
    }
    return null;
  }
  const unchanged = step.continuation && (step.providedAnswers ?? [step.surface,step.reading]).some(value => normalize(answer) === normalize(value));
  if (unchanged && step.form === 'nakute' && step.surface.endsWith('く') && step.kcIds.includes('adj.suffix.i-te')) {
    return {kcId:'adj.suffix.i-te',message:'已提供「く」形词干，本步只需接上「て」。',confirmedKcIds:[]};
  }
  if (unchanged && step.form === 'tearuNegative' && step.kcIds.includes('exception.aru-negative')) {
    return {kcId:'exception.aru-negative',message:'已提供「てある」，本步需要按「ある」的例外否定变化，将「ある」变为「ない」。',confirmedKcIds:[]};
  }
  if (step.continuation && step.form === 'tearuNegative' && step.kcIds.includes('exception.aru-negative')
    && (step.providedAnswers ?? [step.surface, step.reading]).some(base => base.endsWith('ある') && normalize(answer) === normalize(base.slice(0, -2) + 'あらない'))) {
    return { kcId: 'exception.aru-negative', confirmedKcIds: [],
      message: '给定的前部已保留，但「ある」的否定是「ない」，不能按普通五段动词变为「あらない」。' };
  }
  if (unchanged && step.kcIds.includes('adj.suffix.i-past') && ['negativePast', 'adjectiveNegativePast', 'adjectiveNaNegativePast'].includes(step.form)) {
    return { kcId: 'adj.suffix.i-past', message: '已提供否定形式，本步还需要将「ない」变为「なかった」。', confirmedKcIds: [] };
  }
  const intermediate = suppliedNegativeIntermediate(item, step, answer, normalize);
  if (intermediate) return intermediate;
  if (step.continuation) {
    const family = item.domain === 'verb' ? familyFor(step.form) : null;
    const diagnostics = [];
    for (const base of unique(step.providedAnswers ?? [step.surface,step.reading])) {
      if (!base.endsWith('い')) continue;
      const providedNegative = ['negativePast','adjectiveNegativePast','adjectiveNaNegativePast'].includes(step.form) && base.endsWith('ない');
      const nativeForm = providedNegative ? 'adjectivePast' : family?.outputType === 'iAdjective'
        ? {past:'adjectivePast',negative:'adjectiveNegative',negativePast:'adjectiveNegativePast'}[family.ending] : null;
      if (!nativeForm) continue;
      // Judge every accepted supplied base, including ではない / じゃない,
      // without carrying over the original word's class or いい exception.
      const proxy = {domain:'adjective',class:'i',surface:base,iiFamily:false};
      const diagnostic = diagnoseAdjective(proxy,nativeForm,answer,normalize);
      if (diagnostic && step.kcIds.includes(diagnostic.kcId)) diagnostics.push(diagnostic);
    }
    if (diagnostics.length) {
      if (unique(diagnostics.map(diagnostic => diagnostic.kcId)).length !== 1) return null;
      const first = diagnostics[0];
      return {...first,confirmedKcIds:first.confirmedKcIds.filter(id => step.kcIds.includes(id) && diagnostics.every(diagnostic => diagnostic.confirmedKcIds.includes(id)))};
    }
  }
  if (step.continuation && item.domain === 'verb') {
    const family = familyFor(step.form);
    const exact = diagnoseConjugation(item, step.form, answer, normalize) ?? diagnoseConjugation(asReading(item), step.form, answer, normalize);
    if (family && exact && (exact.kcId.startsWith('composition.') || exact.kcId === 'compound.voice-stack')) {
      // Compatible complete negatives were handled above. A negative that is
      // legal only for a different supplied variant (notably short causative)
      // must not be relabeled as a failed negative-past rule of this base.
      if (family.ending === 'negativePast') {
        const negativeForm = `${family.form}Negative`;
        const negatives = [item, asReading(item)].flatMap(word => deriveUnified(word, negativeForm).acceptedVariants);
        if (negatives.some(value => normalize(value) === normalize(answer))) return null;
      }
      const ids = family.outputType === 'iAdjective'
        ? { past: 'adj.suffix.i-past', negative: 'adj.suffix.i-negative', negativePast: 'adj.compound.i-negative-past' }
        : { past: 'suffix.past', negative: 'suffix.negative', negativePast: 'compound.negative-past' };
      const kcId = ids[family.ending];
      if (step.kcIds.includes(kcId)) return { kcId, message: exact.message, confirmedKcIds: [] };
    }
  }
  const diagnosis = diagnoseUnified(item, step.form, answer, normalize) ?? diagnoseUnified(asReading(item), step.form, answer, normalize);
  if (diagnosis?.targetMismatch) return diagnosis;
  if (diagnosis?.stage && !step.continuation) return diagnosis;
  if (diagnosis && step.kcIds.includes(diagnosis.kcId)) {
    return { ...diagnosis, confirmedKcIds: diagnosis.confirmedKcIds.filter(id => step.kcIds.includes(id)) };
  }
  if (!step.continuation) return null;
  // Supplied bases remove the uncertainty about applying a rule to a newly
  // derived word. Evaluate only that actual base and only this step's rules.
  const family = item.domain === 'verb' ? familyFor(step.form) : null;
  const matches = [];
  for (const base of unique(step.providedAnswers ?? [step.surface,step.reading])) {
    const providedNegative = ['negativePast','adjectiveNegativePast','adjectiveNaNegativePast'].includes(step.form) && base.endsWith('ない');
    if (providedNegative || family?.outputType === 'iAdjective') {
      const nativeForm = providedNegative ? 'adjectivePast' : {past:'adjectivePast',negative:'adjectiveNegative',negativePast:'adjectiveNegativePast'}[family.ending];
      const proxy = {domain:'adjective',class:'i',surface:base,reading:base,iiFamily:false};
      const diagnostic = diagnoseCommonAdjectiveError(proxy,nativeForm,answer,normalize,step.kcIds);
      if (diagnostic) matches.push(diagnostic);
    } else if (family) {
      const cls = ['aru','iku'].includes(family.outputClass) ? 'godan'
        : ['kuru','irregular'].includes(family.outputClass) ? 'irregular' : family.outputClass;
      const proxy = {domain:'verb',class:cls,surface:base,reading:base};
      const diagnostic = diagnoseCommonConjugationError(proxy,family.ending,answer,normalize,step.kcIds,{providedBase:true,outputClass:family.outputClass});
      if (diagnostic) matches.push(diagnostic);
    }
  }
  if (matches.length && unique(matches.map(match => match.kcId)).length === 1) return {...matches[0],confirmedKcIds:[]};
  return diagnoseContinuationClassConflict(item, step, family && { ...family, label: applicationLabels[family.form] }, answer, normalize);
}

/** @param {{answer?: string, normalize?: (value: string) => string}} [options] */
export function unifiedStepDiagnosticSteps(item, step, options = {}) {
  item = step.analysisItem ?? item;
  const { answer, normalize = value => value } = options;
  if (step.kind || step.providedClass) return [];
  if (typeof answer !== 'string') return [];
  item = step.analysisItem ?? item;
  // This helper is also used directly by audits and future callers. Preserve
  // the analyzer's precedence rather than manufacturing follow-ups for an
  // already attributable response or a simple lexical retry.
  const explicit = diagnoseUnifiedStep(item, step, answer, normalize);
  if (explicit && !explicit.stage) return [];
  if (!explicit && hasLexicalTypo(item, answer, step.answers, step.readings, normalize)) return [];
  const family = item.domain === 'verb' ? familyFor(step.form) : null;
  const labeled = family && { ...family, label: applicationLabels[family.form] };
  return (diagnoseContinuationClassConflict(item, step, labeled, answer, normalize)
    || diagnoseMixedContinuationPast(item, step, labeled, answer, normalize))
    ? buildContinuationClassProbes(item, step, labeled) : [];
}

export function diagnoseUnifiedStepReview(item, step, answer, normalize = value => value) {
  item = step.analysisItem ?? item;
  const family = item.domain === 'verb' ? familyFor(step.form) : null;
  return diagnoseMixedContinuationPast(item, step,
    family && { ...family, label: applicationLabels[family.form] }, answer, normalize);
}

export function buildUnifiedKnowledge(verbModel, adjectiveModel, verbs, adjectives, eligibleFor) {
  const legacy = new Map([...verbModel.components, ...adjectiveModel.components].map(kc => [kc.id, kc]));
  const components = new Map();
  const exerciseList = [];
  const baseOwners = new Map();
  for (const c of UNIFIED_COURSES) for (const f of c.forms) if (!baseOwners.has(f)) baseOwners.set(f, c.id);
  // Ownership is declared from the original registry, with explicit changes.
  const owners = { 'stem.ichidan.drop-ru': 'masu', 'stem.godan.i': 'masu', 'stem.irregular.connective': 'masu', 'stem.godan.e': 'potential', 'adj.suffix.i-past': 'adjectiveIBase', 'exception.aru-negative': 'aspect' };
  function register(id) {
    if (components.has(id)) return;
    const old = legacy.get(id);
    const app = id.match(/^apply\.(.+)\.continuation$/), facet = id.match(/^facet\.apply\.(.+)\.(past|negative|negativePast)$/);
    const stemFacet = id.startsWith('facet.stem.connective.');
    const base = app?.[1] ?? facet?.[1];
    const owner = owners[id] ?? (base ? VOICE_BASE_FORMS.includes(base) ? 'voiceCompound' : baseOwners.get(base) : stemFacet ? 'masu' : old?.firstCourseId);
    if (!owner || !COURSE_BY_ID.has(owner)) throw new Error(`Missing explicit owner: ${id}`);
    const course = COURSE_BY_ID.get(owner);
    const label = app ? `${applicationLabels[base]}的后续变化应用` : facet ? `${applicationLabels[base]} · ${{past: '过去', negative: '否定', negativePast: '否定过去'}[facet[2]]}覆盖` : stemFacet ? `${id.endsWith('suru') ? 'する' : '来る'}连用词干覆盖` : id === 'stem.irregular.connective' ? 'する／来る的连用词干' : id === 'exception.aru-negative' ? '「ある」的否定为「ない」' : old?.label;
    components.set(id, { ...old, id, label, family: old?.family ?? (id === 'exception.aru-negative' ? 'exception' : stemFacet || id === 'stem.irregular.connective' ? 'stem' : 'compound'),
      gating: old?.gating ?? !(facet || stemFacet), coverageOnly: old?.coverageOnly ?? false,
      firstCourseId: owner, firstCourseIndex: course.order, firstLesson: course.lesson,
      prerequisites: old ? [...old.prerequisites].filter(id => !id.startsWith('composition.')) : [],
      coverageKcIds: old ? [...old.coverageKcIds] : [], unlockByPrerequisites: true });
  }
  for (const course of UNIFIED_COURSES) {
    const words = course.domain === 'verb' ? verbs : adjectives;
    for (const form of course.forms.length ? course.forms : [null]) for (const item of words) {
      if (course.domain === 'verb' && !eligibleFor(item, form)) continue;
      if (course.domain === 'adjective' && !adjectiveModel.exercises.some(e => e.form === form && e.item.surface === item.surface)) continue;
      const derived = deriveUnified(item, form);
      for (const id of derived.requiredKcIds) register(id);
      exerciseList.push({ id: `${course.id}:${form ?? 'classify'}:${item.surface}`, courseId: course.id, courseIndex: course.order, form, item,
        kcIds: derived.requiredKcIds, prerequisites: derived.prerequisiteIds ?? [], sourceUrl: sourceForForm(item.domain, form)?.url ?? course.url });
    }
  }
  for (const component of components.values()) {
    const app = component.id.match(/^apply\.(.+)\.continuation$/);
    if (app) {
      const examples = exerciseList.filter(e => familyFor(e.form)?.form === app[1]);
      component.prerequisites = unique(examples.flatMap(e => e.prerequisites)).filter(id => components.get(id)?.gating);
      component.coverageKcIds = ['past', 'negative', 'negativePast'].map(ending => applicationFacet(app[1], ending));
    }
    const chain=Object.values(CHAIN_FORM_SPECS).find(spec=>spec.kcId===component.id);
    if(chain)component.prerequisites=unique(exerciseList.filter(e=>e.kcIds.includes(chain.kcId)).flatMap(e=>e.prerequisites)).filter(id=>components.get(id)?.gating);
    if (component.id === 'stem.irregular.connective') { component.coverageOnly = true; component.prerequisites = ['class.irregular']; component.coverageKcIds = ['facet.stem.connective.suru', 'facet.stem.connective.kuru']; }
    if (component.id === 'exception.aru-negative') component.prerequisites = ['construction.tearu'];
    if (component.id === 'compound.negative-past') component.prerequisites = ['suffix.negative', 'adj.suffix.i-past'];
    if (component.id === 'adj.compound.na-negative-past') component.prerequisites = ['adj.suffix.na-negative', 'adj.suffix.i-past'];
    if (component.id === 'adj.compound.i-negative-past') component.prerequisites = ['adj.suffix.i-negative', 'adj.suffix.i-past'];
    if (component.id === 'compound.multi-step') component.prerequisites = ['suffix.passive', applicationId('tai')];
    if (component.id.startsWith('construction.')) {
      const form = component.id.slice(13);
      const sample = exerciseList.find(e => e.form === form);
      component.prerequisites = unique([...component.prerequisites, ...(sample?.prerequisites ?? [])]);
    }
    component.coverageKcIds = component.coverageKcIds.filter(id => components.has(id));
    for (const id of component.prerequisites) if (!components.has(id)) throw new Error(`Missing prerequisite ${id} for ${component.id}`);
  }
  const visiting = new Set(), visited = new Set();
  function visit(kc) {
    if (visiting.has(kc.id)) throw new Error(`Cyclic prerequisite ${kc.id}`);
    if (visited.has(kc.id)) return;
    visiting.add(kc.id); for (const id of kc.prerequisites) visit(components.get(id)); visiting.delete(kc.id); visited.add(kc.id);
  }
  for (const kc of components.values()) visit(kc);
  const localOrder = kc => kc.id === 'adj.exception.ii-yo' ? 9999 : legacy.get(kc.id)?.order ?? 10000;
  const ordered = [...components.values()].sort((a,b) => a.firstCourseIndex - b.firstCourseIndex || localOrder(a) - localOrder(b) || a.id.localeCompare(b.id));
  ordered.forEach((kc, order) => { kc.order = order; if (kc.gating && kc.family === 'compound') kc.masteryPrerequisites = kc.prerequisites.map(id => components.get(id)); });
  return { unified: true, components: ordered, exercises: exerciseList, courseKcIds: Object.fromEntries(UNIFIED_COURSES.map(c => [c.id, unique(exerciseList.filter(e => e.courseId === c.id).flatMap(e => e.kcIds))])) };
}
