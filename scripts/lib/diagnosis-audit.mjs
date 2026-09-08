import { updateKnowledgeStats, emptySkillStats } from '../../app/lib/adaptive.mjs';
import { auditGuidance } from './diagnostic-contracts.mjs';

const sameIds=(a,b)=>JSON.stringify([...new Set(a)].sort())===JSON.stringify([...new Set(b)].sort());
function diagnosticClassification(step) {
  return step?.kind==='classification'&&step.diagnosticOnly===true
    &&['godan','ichidan'].includes(step.expectedClass)&&Array.isArray(step.kcIds)&&step.kcIds.length===0
    &&step.focusId===null&&Array.isArray(step.answers)&&Array.isArray(step.readings)
    &&sameIds(step.answers,[step.expectedClass])&&sameIds(step.readings,[step.expectedClass])
    &&Array.isArray(step.classChoices)&&step.classChoices.length===2
    &&sameIds(step.classChoices.map(choice=>choice.value),['godan','ichidan'])
    &&step.classChoices.every(choice=>typeof choice.label==='string'&&choice.label.length>0);
}
export function auditGeneratedCase(testCase, analyze) {
  try { return evaluateGeneratedCase(testCase, analyze(testCase.input)); }
  catch (error) {
    return { status:'regression', actual:{kind:'exception',failed:null,confirmed:[],steps:0,continuation:false,message:String(error.message??error)},
      problems:[{code:'analyzer-exception',detail:String(error.message??error)}] };
  }
}
export function observeAnalysis(analysis) {
  return { kind:analysis.kind, failed:analysis.diagnosis?.kcId??null, confirmed:analysis.diagnosis?.confirmedKcIds??[],
    stage:analysis.diagnosis?.stage??null,review:analysis.diagnosis?.review??null,
    steps:analysis.steps.length, continuation:analysis.steps.length>0&&analysis.steps.every(step=>step.continuation),
    message:analysis.diagnosis?.message??null };
}
export function evaluateGeneratedCase(testCase, analysis) {
  const actual=observeAnalysis(analysis), expected=testCase.expected, problems=[];
  const problem=(code,detail)=>problems.push({code,detail});
  // Previous zero-probe guards forbid a spurious *specific* diagnosis. The
  // new generic fallback instead checks native rules under supplied facts;
  // its full scope/target/termination contract is checked independently.
  problems.push(...auditGuidance(testCase,analysis));
  const required=new Set(testCase.kcIds);
  if(actual.failed&&!required.has(actual.failed))problem('unsafe-failure','扣分原子不属于本题／本步');
  if(actual.confirmed.some(id=>!required.has(id)||id===actual.failed))problem('unsafe-confirmation','加分原子越界或同时被判错');
  if(actual.stage) {
    if(actual.kind!=='incorrect'||actual.failed||actual.confirmed.length)problem('unsafe-stage-evidence','阶段定位不得被直接当作原子扣分或正证');
    if(typeof actual.stage.form!=='string'||typeof actual.stage.label!=='string'||!Array.isArray(actual.stage.candidateKcIds)||!actual.stage.candidateKcIds.length)problem('invalid-stage','阶段定位缺少目标、标签或候选知识点');
    else if(actual.stage.candidateKcIds.some(id=>!required.has(id)))problem('unsafe-stage','阶段候选知识点不属于本题／本步');
  }
  if(actual.review) {
    if(actual.kind!=='incorrect'||actual.failed||actual.confirmed.length||actual.stage)problem('unsafe-review-evidence','混合错误补查不得直接计分或冒充已定位阶段');
    if(actual.review.kind!=='mixed-past')problem('invalid-review','补查缺少明确的混合过去错误类型');
    if(testCase.step?.providedClass) {
      if(analysis.steps.length&&(!analysis.planFallback||analysis.steps.some(step=>step.kind!=='atomic')))problem('recursive-review','给定类别后的补查只能进入终止的基本操作，不得重复分类');
    } else if(analysis.steps.length!==2||!diagnosticClassification(analysis.steps[0])||analysis.steps[1]?.kind!=='conjugation'||analysis.steps[1]?.form!=='past')problem('invalid-review-probes','补查必须先做不计分类别选择，再给定类别检查过去变化');
    if(actual.review.rootMismatch) {
      const observation=actual.review.rootMismatch;
      if(typeof observation.expected!=='string'||typeof observation.actual!=='string'||!['substitution','deletion','insertion','transposition'].includes(observation.operation))problem('invalid-root-observation','词汇差异观察缺少明确的局部编辑');
      const source=testCase.step?.reviewContext?.sourceItem??testCase.item;
      const trim=source.class==='irregular'?2:1;
      if(![source.surface,source.reading].map(value=>value.slice(0,-trim)).includes(observation.expected))problem('revealed-ending','词汇差异只能展示原词固定前部，不能透露完整正确过去形');
    }
  }
  if(testCase.step&&!testCase.kcIds.length&&!diagnosticClassification(testCase.step))problem('empty-probe','拆步没有可评估的知识点');
  if(testCase.step?.kind==='classification'&&!diagnosticClassification(testCase.step))problem('invalid-classification-probe','不计分分类必须明确类别、选项和空知识点集合');
  if(testCase.sourceKcIds&&testCase.kcIds.some(id=>!testCase.sourceKcIds.includes(id)))problem('unsafe-followup','后续探针引入原步骤之外的知识点');
  if(testCase.step?.providedClass&&testCase.kcIds.some(id=>!['stem.ichidan.drop-ru','onbin.sokuon','suffix.past'].includes(id)))problem('unsafe-provided-class','已给定类别的过去探针只能评估当前共享变化');
  if(testCase.completedKcIds?.some(id=>required.has(id)))problem('repeated-evidence','当前拆步重复评估原题已确认的知识点');
  if(testCase.semanticTargets) {
    const normalize=value=>value.normalize('NFKC').replace(/[\s。．.！!？?]/g,'');
    if([...testCase.step.answers,...testCase.step.readings].some(answer=>!testCase.semanticTargets.includes(normalize(answer))))problem('step-target-mismatch','拆步标签、提供的词项与正确答案不是同一个活用目标');
  }
  for(const step of analysis.steps) {
    if(!step.kcIds?.length&&!diagnosticClassification(step))problem('empty-probe','后续拆步没有可评估的知识点');
    if(step.kind==='classification'&&!diagnosticClassification(step))problem('invalid-classification-probe','不计分分类必须明确类别、选项和空知识点集合');
    if(step.providedClass&&step.kcIds?.some(id=>!['stem.ichidan.drop-ru','onbin.sokuon','suffix.past'].includes(id)))problem('unsafe-provided-class','已给定类别的过去探针不能重复分类或评估应用原子');
    if(step.kcIds?.some(id=>!required.has(id)))problem('unsafe-probe','后续拆步引入本题以外的知识点');
    if(step.kcIds?.some(id=>actual.confirmed.includes(id)))problem('repeated-evidence','后续拆步重复评估本题已经确认的知识点');
  }
  if(analysis.kind!=='incorrect'&&(actual.failed||actual.confirmed.length||actual.steps||actual.stage||actual.review))problem('invalid-accepted-state','正确答案／重试不得携带错误证据');
  if(expected.kind!=='explore') {
    if(expected.classification&&(!diagnosticClassification(testCase.step)
      ||testCase.step.expectedClass!==expected.classification.expectedClass
      ||!sameIds(testCase.step.classChoices.map(choice=>choice.value),expected.classification.choices)))problem('wrong-classification-target','诊断性分类与独立派生词类别约定不同');
    if(actual.kind!==expected.kind)problem('wrong-action',`应为 ${expected.kind}，实际 ${actual.kind}`);
    if('failed' in expected && actual.failed!==expected.failed)problem('wrong-failure',`应扣 ${expected.failed??'无'}，实际 ${actual.failed??'无'}`);
    if(expected.confirmed&&!sameIds(actual.confirmed,expected.confirmed))problem('wrong-confirmation','已确认步骤与独立模式约定不同');
    if('stage' in expected) {
      if(expected.stage===null) {if(actual.stage)problem('unexpected-stage','此输入没有足够证据定位阶段');}
      else if(!actual.stage)problem('missing-stage','应定位出错阶段，不能退化成普通未归因');
      else if(actual.stage.form!==expected.stage.form||actual.stage.label!==expected.stage.label||!Array.isArray(actual.stage.candidateKcIds)||!sameIds(actual.stage.candidateKcIds,expected.stage.candidateKcIds))problem('wrong-stage','阶段目标、标签或候选知识点与独立约定不同');
    }
    if('review' in expected) {
      if(expected.review===null) {if(actual.review)problem('unexpected-review','此输入不属于约定的有限混合错误补查范围');}
      else if(!actual.review)problem('missing-review','应提供独立补查，不能只返回未知错误');
      else if(Object.entries(expected.review).some(([key,value])=>JSON.stringify(actual.review[key])!==JSON.stringify(value)))problem('wrong-review','补查类型或观察与独立约定不同');
    }
    if('steps' in expected&&actual.steps!==expected.steps&&!(expected.steps===0&&analysis.planFallback&&!expected.failed&&!expected.stage))problem('wrong-step-count',`应有 ${expected.steps} 个剩余步骤，实际 ${actual.steps}`);
    for(const [index,probe] of (expected.probes??[]).entries()) {
      const step=analysis.steps[index];
      if(!step||Object.entries(probe).some(([field,value])=>step[field]!==value))problem('wrong-probe-target',`第 ${index+1} 步没有检查约定的构造目标`);
    }
    if(expected.minSteps&&actual.steps<expected.minSteps)problem('missing-probe','需要进一步拆步确认');
    if(expected.continuation&&!actual.continuation)problem('repeated-base','重复要求已经完成的前置步骤');
  } else if(actual.kind==='correct')problem('false-accept','生成的非接受变体被判为正确');

  // Check both hint states against observable writes, including duplicate
  // evidence, untouched unrelated atoms and speed credit on partial answers.
  if(actual.kind==='incorrect')for(const hintUsed of [false,true]) {
    const seed={...emptySkillStats(),attempts:5,correct:5,filteredAccuracy:1,confidence:1,bestConfidence:1};
    const before=Object.fromEntries([...required,'audit.unrelated'].map(id=>[id,{...seed}]));
    const after=updateKnowledgeStats(before,{kcIds:testCase.kcIds,focusId:testCase.kcIds[0],correct:false,failedKcId:actual.failed,confirmedKcIds:actual.confirmed,hintUsed});
    for(const [id,stats] of Object.entries(before)) {
      const failed=id===actual.failed, confirmed=actual.confirmed.includes(id)&&!failed;
      if(!failed&&!confirmed) {if(JSON.stringify(after[id])!==JSON.stringify(stats))problem('unrelated-write',id);continue;}
      if(after[id].attempts!==stats.attempts+1||after[id].correct!==stats.correct+Number(confirmed))problem('duplicate-or-wrong-count',id);
      const accuracy=failed ? 0.8 : hintUsed ? 0.94 : 1;
      if(Math.abs(after[id].filteredAccuracy-accuracy)>1e-9)problem('wrong-hint-weight',id);
      if(after[id].cleanTimeCount!==stats.cleanTimeCount)problem('partial-speed-credit',id);
    }
    for(const id of Object.keys(after))if(!(id in before))problem('out-of-scope-write',id);
  }
  const status=problems.length?'regression':expected.kind==='explore'?(actual.failed||actual.confirmed.length?'recognized':actual.kind==='typo'?'retry':actual.steps?'deferred':'gap'):'pass';
  return {status,actual,problems};
}
