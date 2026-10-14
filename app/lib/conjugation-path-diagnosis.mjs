import { acceptedConjugations } from './conjugation.mjs';
import { commonVerbErrorCandidates } from './verb-common-errors.mjs';
import { atomicSteps, buildDiagnosticPlan } from './diagnostic-plan.mjs';
import { diagnosticMessage, diagnosticText, legacyDiagnosticMessage } from './i18n/diagnostics.mjs';

const unique = values => [...new Set(values)];
const labels = {godan:'五段动词',ichidan:'一段动词',irregular:'不规则动词'};
const localRule = id => /^(stem\.|onbin\.|suffix\.|construction\.|exception\.)/.test(id);
const cache = new Map();

// Invert only the suffix replacement declared by the correct recipe. The
// forward check below ensures that no arbitrary substring or edit distance
// can establish a candidate stage. Internal errors survive only when later
// operations really preserve them (e.g. past + ら, or ない -> なかった).
function transfer(value, n, writing, reverse = false) {
  const input = n.input[writing], output = n.output[writing], fixed = n.fixed?.[writing];
  if (typeof fixed !== 'string' || !input.startsWith(fixed) || !output.startsWith(fixed)) return null;
  const from = (reverse ? output : input).slice(fixed.length);
  const to = (reverse ? input : output).slice(fixed.length);
  if (!value.endsWith(from)) return null;
  return (from ? value.slice(0,-from.length) : value) + to;
}

function candidates(stage, writing) {
  const source = stage.source, word = source[writing] ?? source.surface;
  const key = JSON.stringify([word,source.class,source.tailClass,stage.form]);
  if (cache.has(key)) return cache.get(key);
  // Auxiliary exceptions use their own dictionary entry, preserving the
  // entire supplied prefix. Treating a derived てある as an ordinary る verb
  // would fabricate candidates from the wrong correct conjugation.
  const tail = {aru:'ある',iku:'いく',kuru:'くる',irregular:'する'}[source.tailClass];
  if (tail && !word.endsWith(tail)) return [];
  const prefix = tail ? word.slice(0,-tail.length) : '', native = tail ?? word;
  const correct = new Set(acceptedConjugations(native,source.class,stage.form));
  const result = commonVerbErrorCandidates({domain:'verb',surface:native,reading:native,class:source.class},stage.form)
    .map(candidate => ({answer:prefix+candidate.answer,kcId:candidate.kcId,classConflict:false,message:candidate.message}));
  // A real dictionary る ending can plausibly be classified under the other
  // verb class. Non-る godan words do not gain fictitious ichidan readings.
  if (native.endsWith('る')) for (const cls of source.class === 'irregular' ? ['godan','ichidan'] : ['godan','ichidan'].filter(c => c !== source.class)) {
    let alternative;
    try { alternative = acceptedConjugations(native,cls,stage.form); } catch { continue; }
    // If both classes lead to the same accepted construction (e.g. passive
    // 見られる), the spelling cannot make classification a useful question.
    if (!alternative.length || alternative.some(value => correct.has(value))) continue;
    for (const answer of alternative) result.push({answer:prefix+answer,kcId:null,classConflict:true,localError:false});
    for (const candidate of commonVerbErrorCandidates({domain:'verb',surface:native,reading:native,class:cls},stage.form)) {
      result.push({answer:prefix+candidate.answer,kcId:null,classConflict:true,localError:true});
    }
  }
  const filtered = result.filter(candidate => !correct.has(candidate.answer.slice(prefix.length)));
  if (cache.size >= 256) cache.delete(cache.keys().next().value);
  cache.set(key,filtered);
  return filtered;
}

/** Locate native conjugation errors through every enclosing correct recipe.
 * Exact complete-form recognition must run first. A candidate class is an
 * invitation to diagnose, never a failed KC or positive evidence by itself.
 */
export function diagnoseConjugationPath(plan, answer, {scope,normalize=value=>value,step,diagnoseNative} = {}) {
  if (!plan.paths?.length || typeof answer !== 'string' || step?.pathClassGiven
    || step?.kind && !['conjugation'].includes(step.kind)) return null;
  const actual = normalize(answer), allowed = new Set(scope ?? []), found = new Map();
  for (const path of plan.paths) for (let index=0;index<path.nodes.length;index++) {
    const start = path.nodes[index], stage = start.conjugationStage;
    if (!stage || stage.source.domain !== 'verb') continue;
    const stageNodes = path.nodes.slice(index,index+stage.length), rest = path.nodes.slice(index+stage.length);
    const rules = unique(stageNodes.flatMap(n=>n.ruleKcIds)).filter(id=>allowed.has(id)&&localRule(id));
    if (!rules.length) continue;
    for (const writing of ['surface','reading']) {
      let written = actual;
      // Plans are normalized per writing, retaining explicit operation edges.
      const normalized = rest.map(n=>({...n,input:{[writing]:normalize(n.input[writing])},output:{[writing]:normalize(n.output[writing])},fixed:{[writing]:normalize(n.fixed?.[writing]??n.input[writing])}}));
      for (const n of [...normalized].reverse()) { written = transfer(written,n,writing,true); if (written === null) break; }
      if (written === null || written === normalize(stage.output[writing])) continue;
      const matches = candidates(stage,writing).filter(candidate=>normalize(candidate.answer)===written);
      if (!matches.length) continue;
      let forward = written;
      for (const n of normalized) { forward = transfer(forward,n,writing); if (forward === null) break; }
      if (forward !== actual) continue;
      const key = JSON.stringify([stage.source.surface,stage.source.reading,stage.source.class,stage.form]);
      const entry = found.get(key) ?? {stage,start,rules,rest:rest.length,written,matches:[],
        direct:index===0&&rest.every(n=>n.operation==='append'&&n.output.surface.startsWith(n.input.surface)&&n.output.reading.startsWith(n.input.reading))};
      entry.direct &&= index===0&&rest.every(n=>n.operation==='append'&&n.output.surface.startsWith(n.input.surface)&&n.output.reading.startsWith(n.input.reading));
      entry.matches.push(...matches); found.set(key,entry);
    }
  }
  // Competing locations/accepted branches cannot pick a winner by order.
  if (found.size !== 1) return null;
  const {stage,start,rules,rest,written,matches,direct} = [...found.values()][0];
  const classConflict = matches.some(candidate=>candidate.classConflict);
  const failures = unique(matches.filter(candidate=>!candidate.classConflict).map(candidate=>candidate.kcId));
  if (direct && !classConflict && failures.length===1 && allowed.has(failures[0]) && rules.includes(failures[0])
    && diagnoseNative?.(stage.source,stage.form,written,normalize)?.kcId===failures[0]) {
    const detail=matches.find(candidate=>candidate.kcId===failures[0]).message;
    const descriptor=diagnosticMessage(rest
      ? 'diagnostics.path.direct.withRemainder'
      : 'diagnostics.path.direct',{
        source:stage.source.surface,stageLabel:stage.label,stageForm:stage.form,detail,failedKcId:failures[0],
      });
    return {diagnosis:{kcId:failures[0],confirmedKcIds:[],...descriptor},steps:[]};
  }
  if (!classConflict) return null;
  const given = step?.providedClass === stage.source.class
    && step.surface === stage.source.surface && step.reading === stage.source.reading;
  const nativePlan = buildDiagnosticPlan(stage.source,stage.form);
  const categoryNote=diagnosticMessage('diagnostics.path.classification.note');
  const categoryExplanation=diagnosticMessage('diagnostics.path.classification.explanation',{
    source:stage.source.surface,classLabel:labels[stage.source.class],classId:stage.source.class,
  });
  const conjugationNote=diagnosticMessage('diagnostics.path.conjugation.note');
  const category = {
    kind:'classification',diagnosticOnly:true,nodeId:`${start.id}:class`,analysisItem:stage.source,
    surface:stage.source.surface,reading:stage.source.reading,form:stage.form,
    classChoices:Object.entries(labels).map(([value,label])=>({value,label})),
    expectedClass:stage.source.class,answers:[stage.source.class],readings:[stage.source.class],kcIds:[],focusId:null,
    continuation:indexIsDerived(plan,stage.source),targetLabel:'动词类别',targetKind:'verb-class',
    note:categoryNote.message,
    classificationExplanation:categoryExplanation.message,
    i18n: {
      note:diagnosticText(categoryNote.messageKey,categoryNote.params),
      classificationExplanation:diagnosticText(categoryExplanation.messageKey,categoryExplanation.params),
    },
  };
  const conjugation = {
    kind:'conjugation',nodeId:`${start.id}:given`,pathClassGiven:true,providedClass:stage.source.class,analysisItem:stage.source,
    surface:stage.source.surface,reading:stage.source.reading,form:stage.form,
    providedAnswers:[stage.source.surface,stage.source.reading],answers:nativePlan.acceptedVariants,readings:nativePlan.readingVariants,
    kcIds:rules,focusId:rules.at(-1),continuation:true,targetLabel:stage.label,targetForm:stage.form,
    note:conjugationNote.message,
    i18n:{note:diagnosticText(conjugationNote.messageKey,conjugationNote.params)},
  };
  const steps = given ? atomicSteps(nativePlan,stage.form,rules) : [category,conjugation];
  const descriptor=diagnosticMessage(`diagnostics.path.candidate.${given?'givenClass':'unknownClass'}${rest?'WithRemainder':''}`,{
    written,source:stage.source.surface,stageLabel:stage.label,stageForm:stage.form,
  });
  if (steps[0]) steps[0].probeSelection={strategy:'conjugation-path',label:stage.label,form:stage.form,candidateKcIds:rules,...descriptor};
  return {diagnosis:null,steps,...descriptor,classConflict:true,refineClass:matches.some(candidate=>!candidate.classConflict||candidate.localError)};
}

function indexIsDerived(plan, source) {
  const original = plan.nodes[0]?.input;
  return original?.surface !== source.surface || original?.reading !== source.reading;
}

export function diagnoseProvidedConjugation(step, answer, normalize=value=>value) {
  if (!step.pathClassGiven || !step.providedClass || step.analysisItem?.class !== step.providedClass) return null;
  const stage={source:step.analysisItem,form:step.form}, actual=normalize(answer);
  const matches=['surface','reading'].flatMap(writing=>candidates(stage,writing))
    .filter(candidate=>!candidate.classConflict && normalize(candidate.answer)===actual);
  const ids=unique(matches.map(candidate=>candidate.kcId));
  if(ids.length!==1||!step.kcIds.includes(ids[0]))return null;
  return {kcId:ids[0],confirmedKcIds:[],...legacyDiagnosticMessage('rule',matches[0].message)};
}
