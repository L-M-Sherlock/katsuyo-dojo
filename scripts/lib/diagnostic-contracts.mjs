// Independent behavioral contracts for the new universal fallback. This module
// must not import the production plan builder or infer success from its output.
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const allowable=id=>/^(stem\.|onbin\.|suffix\.|construction\.|contraction\.|exception\.aru-negative|adj\.(stem|suffix|exception)\.|compound\.polite-)/.test(id);

export function auditGuidance(testCase,analysis) {
  const problems=[];
  const problem=(code,detail)=>problems.push({code,detail});
  if(analysis.kind!=='incorrect'||testCase.step?.kind==='classification')return problems;
  if(!analysis.feedback?.message||!Array.isArray(analysis.feedback.observations))problem('missing-feedback','错误输入必须具有说明和可观察差异接口');
  if(analysis.feedback?.terminal!==(analysis.steps.length===0))problem('wrong-terminal','反馈结束状态与剩余步骤不同');
  if(testCase.step?.kind==='atomic'&&analysis.steps.length)problem('recursive-atomic','基本步骤不得继续递归');
  if(analysis.planFallback) {
    if(analysis.diagnosis?.kcId||!analysis.steps.length)problem('false-fallback','只有未确认的规则才能进入基本步骤补查');
    const seen=new Set();
    for(const step of analysis.steps) {
      if(step.kind!=='atomic'||!step.nodeId||!step.atomic||!step.note||!step.targetLabel)problem('invalid-atomic','基本步骤缺少明确输入、规则、目标或给定条件');
      if(seen.has(step.nodeId))problem('repeated-node','不能重复检查同一个节点');
      seen.add(step.nodeId);
      if(!step.kcIds.length||step.kcIds.some(id=>!testCase.kcIds.includes(id)||!allowable(id)))problem('unsafe-atomic-scope','基本步骤引入未知／已提供／整体应用知识点');
      if(!same(step.surface,step.atomic?.input.surface)||!same(step.reading,step.atomic?.input.reading))problem('wrong-provided-input','所展示的中间词形与实际受测步骤不同');
      if(!step.answers.includes(step.atomic?.output.surface)||!step.readings.includes(step.atomic?.output.reading))problem('wrong-atomic-answer','本步目标和接受答案不同');
    }
    const ids=analysis.steps.flatMap(s=>s.kcIds);
    if(new Set(ids).size!==ids.length)problem('repeated-rule','一次补查不得重复评估同一知识点');
  }
  return problems;
}

// Error families are linguistic operations, not production rule candidates.
export const MUTATION_FAMILIES=['omit','repeat','transpose','voicing','size','row','other-form','stop','lexical'];
export function localMutations(value) {
  const chars=Array.from(value),out=[];
  const emit=(family,input)=>{if(input!==value)out.push({family,input});};
  for(let start=0;start<chars.length;start++)for(let end=start+1;end<=chars.length;end++) {
    emit('omit',chars.slice(0,start).concat(chars.slice(end)).join(''));
    emit('repeat',chars.slice(0,end).concat(chars.slice(start,end),chars.slice(end)).join(''));
  }
  for(let left=0;left<chars.length;left++)for(let right=left+2;right<chars.length;right++) {
    emit('omit',chars.slice(0,left).concat(chars.slice(left+1,right),chars.slice(right+1)).join(''));
  }
  const groups=['かが','きぎ','くぐ','けげ','こご','さざ','しじ','すず','せぜ','そぞ','ただ','ちぢ','つづ','てで','とど','はばぱ','ひびぴ','ふぶぷ','へべぺ','ほぼぽ','っつ','ゃや','ゅゆ','ょよ','ぁあ','ぃい','ぅう','ぇえ','ぉお'];
  for(let i=0;i<chars.length;i++) {
    for(const g of groups.filter(g=>g.includes(chars[i])))for(const c of g)if(c!==chars[i])emit('っつゃやゅゆょよぁあぃいぅうぇえぉお'.includes(chars[i])?'size':'voicing',chars.map((v,j)=>i===j?c:v).join(''));
    if(i+1<chars.length&&chars[i]!==chars[i+1]) {const changed=[...chars];[changed[i],changed[i+1]]=[changed[i+1],changed[i]];emit('transpose',changed.join(''));}
  }
  return out;
}

export function replayCase(testCase,analyze) {
  let result;
  try{result=analyze(testCase.input);}catch(error){return [{code:'analyzer-exception',detail:error.message}];}
  const problems=auditGuidance(testCase,result);
  if(testCase.requiredSteps&&result.steps.length!==testCase.requiredSteps.length)problems.push({code:'missing-required-steps',detail:'缺少独立约定的基本操作'});
  for(const [i,ids] of (testCase.requiredSteps??[]).entries())if(!same(result.steps[i]?.kcIds,ids))problems.push({code:'wrong-required-step',detail:`第 ${i+1} 步知识点错误`});
  if(testCase.noEvidence&&(result.diagnosis?.kcId||result.diagnosis?.confirmedKcIds?.length))problems.push({code:'invented-evidence',detail:'混合原答不能直接计分'});
  return problems;
}
