import { recognizeForms, recognizedFormLabel, recognizedFormsIdentification } from './form-recognition.mjs';
import { matchAcceptedAnswer } from './answer-variants.mjs';
import { hasLexicalTypo } from './lexical-typo.mjs';
import { deriveUnified, diagnoseUnified, diagnoseUnifiedStep, unifiedDiagnosticSteps, unifiedStepDiagnosticSteps, diagnoseUnifiedStepReview } from './unified-knowledge.mjs';
import { planForContext, atomicSteps, diagnoseAtomicStep } from './diagnostic-plan.mjs';
import { diagnosticFeedback } from './diagnostic-feedback.mjs';

export function normalizeAnswer(value) {
  return value.normalize('NFKC')
    .replace(/[\u30A1-\u30F6\u30FD-\u30FE]/g, kana => String.fromCharCode(kana.charCodeAt(0) - 0x60))
    .replace(/[\s。．.！!？?]/g, '');
}

// The page and generated audit use exactly the same precedence: accepted
// variant, explicit diagnosis, lexical retry, then conservative diagnosis steps.
/** @param {{step?: any, normalize?: (value: string) => string}} [options] */
export function createAnswerAnalyzer(item, form, options = {}) {
  const { step, normalize = normalizeAnswer } = options;
  item = step?.analysisItem ?? item;
  const readingItem = { ...item, surface: item.reading, ...(item.domain === 'verb' ? { lexicalSurface: item.surface } : {}) };
  const surface = step ? { acceptedVariants: step.answers } : deriveUnified(item, form);
  const reading = step ? { acceptedVariants: step.readings } : deriveUnified(readingItem, form);
  let plan;
  const getPlan = () => plan ??= planForContext(item,form,step);
  return answer => {
    if(typeof answer!=='string'||!normalize(answer).length||Array.from(answer).length>256) {
      return {kind:'invalid',match:{correct:false,variant:null},diagnosis:null,steps:[],
        feedback:{resolution:'invalid',observations:[],terminal:true,message:typeof answer==='string'&&Array.from(answer).length>256?'输入过长，请只填写活用后的词形（最多 256 个字符）。':'请输入答案后再检查。'}};
    }
    const match = matchAcceptedAnswer(answer, surface.acceptedVariants, reading.acceptedVariants, normalize);
    if (match.correct) return { kind: 'correct', match, diagnosis: null, steps: [] };
    if (step?.kind === 'atomic' && step.laterOutputs?.some(value => normalize(value) === normalize(answer))) {
      return { kind: 'invalid', match, diagnosis: null, steps: [],
        feedback: { resolution: 'step-ahead', observations: [], terminal: false,
          message: '你已写出后续步骤的正确形式。本步只需填写当前要求的中间形式，请调整后重交；不记知识点错误。' } };
    }
    if (step?.kind === 'classification') return { kind: 'incorrect', match, diagnosis: null, steps: [] };
    if(!form) {
      const kcId=surface.requiredKcIds.find(id=>/^(class\.|adj\.class\.)/.test(id));
      return {kind:'incorrect',match,diagnosis:{kcId,confirmedKcIds:[],message:'词类判断有误，请对照正确类别及分类依据。'},steps:[],
        feedback:{resolution:'rule',observations:[],terminal:true,message:'词类判断有误，请对照正确类别及分类依据。'}};
    }
    const canRecognize = !step?.kind || step.kind === 'conjugation';
    const tailClass = ({tearu:'aru',teiku:'iku',tekuru:'kuru',youtosuru:'irregular'})[step?.reviewContext?.family?.form];
    const recognitionItem = {...item,...(tailClass?{tailClass}:{}),...(step?.analysisItem?{usageOrigin:'derived'}:{})};
    const recognizedForms = canRecognize ? recognizeForms(recognitionItem,answer,normalize).filter(match=>match.form!==form) : [];
    // A correctly completed prefix retains its existing, scoped follow-up.
    // Otherwise a complete supported form must not be blamed on a local rule.
    const inPath = recognizedForms.length && (
      [item.surface,item.reading,...(step?.providedAnswers??[])].filter(Boolean).some(value=>normalize(value)===normalize(answer))
      || (getPlan().paths??[]).some(path=>path.nodes.slice(0,-1).some(node=>[node.output.surface,node.output.reading].some(value=>normalize(value)===normalize(answer))))
    );
    let diagnosis = step?.kind==='atomic' ? diagnoseAtomicStep(step,answer,normalize) : step ? diagnoseUnifiedStep(item, step, answer, normalize)
      : diagnoseUnified(item, form, answer, normalize) ?? diagnoseUnified(readingItem, form, answer, normalize);
    if (!step && recognizedForms.length && !inPath && /^(class\.|heuristic\.|stem\.|onbin\.|exception\.)/.test(diagnosis?.kcId??'')) diagnosis = null;
    if (!diagnosis && !recognizedForms.length && hasLexicalTypo(item, answer, surface.acceptedVariants, reading.acceptedVariants, normalize)) {
      return { kind: 'typo', match, diagnosis: null, steps: [] };
    }
    if (!diagnosis && step && step.kind!=='atomic') diagnosis = diagnoseUnifiedStepReview(item, step, answer, normalize);
    let steps = step && (diagnosis?.stage || diagnosis?.review) ? unifiedStepDiagnosticSteps(item, step, { answer, normalize })
      : !step && !diagnosis?.kcId ? unifiedDiagnosticSteps(item, form, { answer, normalize }) : [];
    let planFallback=false;
    // A supplied-class conjugation can still contain several operations.
    // Only actual primitive leaves (and classification choices) terminate;
    // legacy class probes enter the same native plan when still unresolved.
    const maySplit=step?.kind==='conjugation'||!step?.kind;
    if(!steps.length&&!diagnosis?.kcId&&maySplit) {
      const scope=step?.kcIds??surface.requiredKcIds;
      steps=atomicSteps(getPlan(),form,scope,diagnosis?.confirmedKcIds??[],answer,normalize);
      planFallback=steps.length>0;
    }
    const feedback=diagnosticFeedback({item,answer,diagnosis,steps,plan:!diagnosis?getPlan():plan,step,normalize});
    if(recognizedForms.length && !inPath) {
      const target=step?.targetLabel??recognizedFormLabel(item,form);
      const identification=recognizedFormsIdentification(item,recognizedForms,target);
      if(!diagnosis?.message&&!steps[0]?.probeSelection) {
        feedback.message=identification+(steps.length?'本次不据此扣除具体知识点的掌握度；下面检查本题要求的变化。':'本次不据此扣除具体知识点的掌握度，请对照本题解析核对形式。');
        feedback.resolution='target-form';feedback.observations=[];
      } else if (!diagnosis?.message || !recognizedForms.every(match=>match.usage?.status==='allowed'&&diagnosis.message.includes(match.label))) feedback.message=identification+feedback.message;
    }

    return {kind:'incorrect',match,diagnosis,recognizedForms,steps,feedback,planFallback};
  };
}
