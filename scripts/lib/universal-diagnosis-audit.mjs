import { auditGuidance } from './diagnostic-contracts.mjs';
import { referenceNodeOutputs, referenceLabelMatches, correctSpellings } from './diagnostic-oracle.mjs';
import { updateKnowledgeStats, emptySkillStats } from '../../app/lib/adaptive.mjs';
import { applyLearningObservation } from '../../app/lib/learning-profile.mjs';
import { emptyAssessment } from '../../app/lib/learning-assessment.mjs';
import { auditLearningCase, auditLearningFlowWrite } from './learning-evidence-contracts.mjs';

const norm=s=>s.normalize('NFKC').replace(/[\s。．.！!？?]/g,'');
export function auditUniversalCase(c,analyze,options = {}) {
  let result;
  try {result=analyze(c.input);}catch(error){return {result:null,problems:[{code:'analyzer-exception',detail:error.message}]};}
  const problems=auditGuidance(c,result),problem=(code,detail)=>problems.push({code,detail});
  const failed=result.diagnosis?.kcId,confirmed=result.diagnosis?.confirmedKcIds??[],mode=c.expected.mode;
  if(failed&&!c.kcIds.includes(failed)||confirmed.some(id=>!c.kcIds.includes(id)||id===failed))problem('unsafe-evidence','归因知识点越出当前范围');
  if(mode==='correct'&&result.kind!=='correct')problem('rejected-correct','拒绝了独立核对的合法答案');
  if(mode==='invalid'&&(result.kind!=='invalid'||failed||confirmed.length||result.steps.length))problem('invalid-input-scored','无效输入必须重新填写且不计分');
  if(mode==='leaf'&&(failed!==c.expected.failed||confirmed.length||result.steps.length))problem('wrong-leaf-evidence',`隔离步骤应仅评估 ${c.expected.failed}，实际 ${failed??'无'}`);
  if(['unreadable','no-evidence','lexical','mixed'].includes(mode)&&(failed||confirmed.length))problem('invented-evidence','未保留完整依据的输入被用来推断掌握度');
  if(!['correct','invalid'].includes(mode)&&result.kind==='correct') {
    const accepted=c.step?[...c.step.answers,...c.step.readings]:['surface','reading'].flatMap(w=>correctSpellings({...c.item,surface:c.item[w]},c.form));
    if(!accepted.some(a=>norm(a)===norm(c.input)))problem('false-accept','非接受变体被当作正确答案');
  }
  if(result.kind==='incorrect') {
    const refinable=!c.step?.kind||c.step.kind==='conjugation';
    if(!failed&&!result.steps.length&&refinable)problem('missing-path','没有归因，也没有有限的补查路径');
    const known=new Set(confirmed);
    for(const step of result.steps) {
      if(step.kcIds.some(id=>!c.kcIds.includes(id)||known.has(id)))problem('repeated-or-unsafe-probe','探针重复已确认规则或引入原题以外规则');
      if(step.kind==='atomic')for(const w of ['surface','reading']) {
        if(!referenceLabelMatches(step.atomic,step.targetLabel))problem('wrong-probe-label','显示目标与所测规则不一致');
        const expected=referenceNodeOutputs(step.atomic,w);
        if(step[w==='surface'?'answers':'readings'].some(a=>!expected.includes(a)))problem('wrong-probe-answer','给定输入、规则与接受答案不一致');
      }
    }
    // Check visible prose, not serialized hidden answers. A given intermediate
    // is allowed; the as-yet-unanswered final target must remain hidden.
    if(result.steps.length) {
      const target=c.step?[...c.step.answers,...c.step.readings]:['surface','reading'].flatMap(w=>correctSpellings({...c.item,surface:c.item[w]},c.form));
      const visible=[result.feedback?.message,...result.steps.flatMap(s=>[s.note,s.classificationExplanation])].filter(Boolean).join(' ');
      for(const answer of target.filter(a=>a.length>=4&&!result.steps.some(s=>[s.surface,s.reading].some(given=>given.includes(a)))))if(visible.includes(answer))problem('answer-leak','未作答步骤的完整目标提前出现在提示中');
    }
  }
  const learning = auditLearningCase(c,result,options);
  problems.push(...learning.problems);
  return {result,problems,learningChecks:learning.checks};
}

export function auditFlow({exercise,initial,analyzerForStep,transition,answerForStep,bound,observe = applyLearningObservation}) {
  const problems=[],writes=new Set(),nodes=new Set();let queue=initial.steps,index=0,evaluated=initial.diagnosis?.confirmedKcIds??[],examined=[];
  let byKc=Object.fromEntries(exercise.kcIds.map(id=>[id,{...emptySkillStats()}]));
  const problem = (code, detail) => problems.push({code,detail}), at = '2026-09-09T12:00:00.000Z';
  let learningProfile = {byKc,assessment:emptyAssessment()}, learningChecks = 0;
  try {
    learningProfile = observe(learningProfile,exercise,{type:'question',outcome:'incorrect',questionId:'audit-flow-original',at,
      kcIds:exercise.kcIds,failedKcId:initial.diagnosis?.kcId,confirmedKcIds:initial.diagnosis?.confirmedKcIds??[]}).profile;
    learningChecks++;
  } catch(error) {problem('learning-flow-exception',String(error.message??error));}
  while(index<queue.length&&index<bound) {
    const step=queue[index],input=answerForStep(step,index);
    const c={...exercise,step,kcIds:step.kcIds,input,expected:{mode:input==='xyz§'?'unreadable':'correct'}};
    const checked=auditUniversalCase(c,analyzerForStep(step),{observe});problems.push(...checked.problems);
    learningChecks += checked.learningChecks ?? 0;
    if(!checked.result)break;
    const result=checked.result,update=transition(queue,index,result,evaluated,examined);
    for(const id of update.writes){if(writes.has(id))problems.push({code:'duplicate-write',detail:id});writes.add(id);}
    if(step.nodeId){if(nodes.has(step.nodeId))problems.push({code:'duplicate-node',detail:step.nodeId});nodes.add(step.nodeId);}
    const before=byKc;
    byKc=step.diagnosticOnly?byKc:updateKnowledgeStats(byKc,{kcIds:update.assessed.kcIds,correct:result.kind==='correct',failedKcId:result.diagnosis?.kcId,confirmedKcIds:result.diagnosis?.confirmedKcIds??[]});
    for(const id of Object.keys(byKc))if(byKc[id].attempts-(before[id]?.attempts??0)!==Number(update.writes.includes(id)))problems.push({code:'wrong-flow-write',detail:id});
    try {
      const previous = learningProfile, observation = {type:'step',outcome:result.kind,questionId:'audit-flow-original',
        eventId:`audit-flow-step-${index}`,at,step:update.assessed,kcIds:update.assessed.kcIds,
        failedKcId:result.diagnosis?.kcId,confirmedKcIds:result.diagnosis?.confirmedKcIds??[]};
      learningProfile = observe(previous,exercise,observation).profile; learningChecks++;
      auditLearningFlowWrite(previous,learningProfile,update.assessed,result,problem);
      const replay = observe(learningProfile,exercise,observation); learningChecks++;
      if(!replay.duplicate)problem('learning-flow-unprotected-repeat',`第 ${index+1} 步`);
      auditLearningFlowWrite(learningProfile,replay.profile,{...update.assessed,kcIds:[]},result,problem);
    } catch(error) {problem('learning-flow-exception',String(error.message??error));}
    for(const future of update.nextSteps.slice(index+1))if(future.kcIds.some(id=>update.evaluated.includes(id)))problems.push({code:'redundant-probe',detail:'已评估的知识点仍出现在待答队列'});
    queue=update.nextSteps;evaluated=update.evaluated;examined=update.examined;index++;
  }
  if(index<queue.length)problems.push({code:'nonterminating-flow',detail:`补查超过独立路径上限 ${bound}`});
  return {problems,steps:index,writes:writes.size,learningChecks};
}
