import { matchAcceptedAnswer } from './answer-variants.mjs';
import { hasLexicalTypo } from './lexical-typo.mjs';
import { deriveUnified, diagnoseUnified, diagnoseUnifiedStep, unifiedDiagnosticSteps, unifiedStepDiagnosticSteps, diagnoseUnifiedStepReview } from './unified-knowledge.mjs';
import { planForContext, atomicSteps, diagnoseAtomicStep } from './diagnostic-plan.mjs';
import { diagnosticFeedback } from './diagnostic-feedback.mjs';

export function normalizeAnswer(value) { return value.normalize('NFKC').replace(/[\s。．.！!？?]/g, ''); }

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
    if (step?.kind === 'classification') return { kind: 'incorrect', match, diagnosis: null, steps: [] };
    if(!form) {
      const kcId=surface.requiredKcIds.find(id=>/^(class\.|adj\.class\.)/.test(id));
      return {kind:'incorrect',match,diagnosis:{kcId,confirmedKcIds:[],message:'词类判断有误，请对照正确类别及分类依据。'},steps:[],
        feedback:{resolution:'rule',observations:[],terminal:true,message:'词类判断有误，请对照正确类别及分类依据。'}};
    }
    let diagnosis = step?.kind==='atomic' ? diagnoseAtomicStep(step,answer,normalize) : step ? diagnoseUnifiedStep(item, step, answer, normalize)
      : diagnoseUnified(item, form, answer, normalize) ?? diagnoseUnified(readingItem, form, answer, normalize);
    if (!diagnosis && hasLexicalTypo(item, answer, surface.acceptedVariants, reading.acceptedVariants, normalize)) {
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
    return {kind:'incorrect',match,diagnosis,steps,feedback,planFallback};
  };
}
