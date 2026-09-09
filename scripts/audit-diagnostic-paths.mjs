import { mkdir,writeFile,readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { buildDiagnosticPlan,atomicSteps,DIAGNOSTIC_FORMS } from '../app/lib/diagnostic-plan.mjs';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { planDiagnosticTransition } from '../app/lib/diagnostic-session.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { auditPlan,referenceStages,referenceFamily } from './lib/diagnostic-oracle.mjs';
import { wholeErrorCases,atomicErrorCases,structuralKey,UNIVERSAL_FAMILIES,shrinkCounterexample } from './lib/universal-error-cases.mjs';
import { auditUniversalCase,auditFlow } from './lib/universal-diagnosis-audit.mjs';
import { LEARNING_AUDIT_VERSION } from './lib/learning-evidence-contracts.mjs';

const options={output:'outputs/diagnostic-paths',forms:null,replay:null,representatives:false,classifications:false,seed:20260908};
const args=process.argv.slice(2);
for(let i=0;i<args.length;i++) {
  const flag=args[i];
  if(flag==='--representatives')options.representatives=true;
  else if(flag==='--classifications')options.classifications=true;
  else if(['--output','--forms','--replay','--seed'].includes(flag)&&args[i+1])options[flag.slice(2)]=flag==='--seed'?Number(args[++i]):args[++i];
  else throw new Error(`Unknown option ${flag}`);
}
if(!Number.isSafeInteger(options.seed))throw new Error('Seed must be an integer');
await mkdir(options.output,{recursive:true});
const summary={schemaVersion:1,scope:options.replay?'replay':options.representatives?'structural-representatives':options.forms?`forms:${options.forms}`:'all',seed:options.seed,
  contexts:0,forms:0,classifications:0,plans:0,paths:0,nodes:0,atomicContexts:0,cases:0,flows:0,flowSteps:0,failures:0,
  families:Object.fromEntries(UNIVERSAL_FAMILIES.map(f=>[f,0])),outcomes:{},failureCodes:{},dimensions:{},coverageErrors:[],savedFailures:0};
const findings=[],shrunk=[],representatives=new Set(),forms=new Set(),atomicIds=new Set(),savedGroups=new Map();
summary.learningAudit={version:LEARNING_AUDIT_VERSION,cases:0,checks:0,flows:0,flowChecks:0};
function analyzer(item,form,step) {
  const run=createAnswerAnalyzer(item,form,step?{step}:{}),cache=new Map();
  return input=>{if(!cache.has(input))cache.set(input,run(input));return cache.get(input);};
}
function failure(c,problems,analyze) {
  summary.failures++;
  for(const p of problems)summary.failureCodes[p.code]=(summary.failureCodes[p.code]??0)+1;
  const group=JSON.stringify([c.form,c.step?.kcIds,problems.map(p=>p.code),c.family]);
  if(findings.length<1000&&(savedGroups.get(group)??0)<3){findings.push({case:c,problems});savedGroups.set(group,(savedGroups.get(group)??0)+1);}
  if(analyze&&shrunk.length<20) {
    const code=problems[0].code;
    shrunk.push({case:shrinkCounterexample(c,next=>auditUniversalCase(next,analyze).problems.some(p=>p.code===code)),code});
  }
}
function check(c,analyze) {
  if(!c)return;
  const {result,problems,learningChecks=0}=auditUniversalCase(c,analyze);
  summary.learningAudit.cases++;summary.learningAudit.checks+=learningChecks;
  summary.cases++;summary.families[c.family]=(summary.families[c.family]??0)+1;
  const key=result?.kind??'exception';summary.outcomes[key]=(summary.outcomes[key]??0)+1;
  if(problems.length)failure(c,problems,analyze);
}
if(options.replay) {
  for(const line of (await readFile(options.replay,'utf8')).split('\n').filter(Boolean)) {
    let {case:c}=JSON.parse(line);
    if(c.step?.kind==='atomic') {
      const plan=buildDiagnosticPlan(c.item,c.form);
      const current=plan.paths.flatMap(branch=>atomicSteps({...plan,nodes:branch.nodes},c.form,c.kcIds)).find(step=>step.nodeId===c.step.nodeId);
      if(!current){failure(c,[{code:'missing-replay-context',detail:'当前路径缺少该反例所测的节点'}]);continue;}
      c={...c,step:current};
    }
    if(c.family==='plan') {const problems=auditPlan(c.item,c.form,buildDiagnosticPlan(c.item,c.form));summary.plans++;if(problems.length)failure(c,problems);continue;}
    if(c.family==='flow') {
      const result=auditFlow({exercise:c,initial:c.startSteps?{steps:c.startSteps,diagnosis:null}:createAnswerAnalyzer(c.item,c.form)(c.input),transition:planDiagnosticTransition,bound:referenceStages(c.item,c.form).length*4+4,
        analyzerForStep:step=>createAnswerAnalyzer(c.item,c.form,{step}),answerForStep:(step,index)=>step.kind==='classification'?step.expectedClass:c.route==='correct'||c.route==='alternating'&&index%2?step.readings[0]:'xyz§'});
      summary.flows++;summary.flowSteps+=result.steps;summary.learningAudit.flows++;summary.learningAudit.flowChecks+=result.learningChecks??0;if(result.problems.length)failure(c,result.problems);continue;
    }
    check(c,analyzer(c.item,c.form,c.step));
  }
}else {
  const server=await createServer({appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
  let model;try{model=(await server.ssrLoadModule('/app/page.tsx')).KNOWLEDGE;}finally{await server.close();}
  const requested=options.forms?new Set(options.forms.split(',')):null;
  if(requested&&[...requested].some(f=>!DIAGNOSTIC_FORMS.includes(f)))throw new Error('Unknown requested form');
  const exercises=[...new Map(model.exercises.map(e=>[[e.item.domain,e.item.surface,e.form].join('/'),e])).values()];
  let logged=Date.now();
  for(const exercise of exercises) {
    const {item,form}=exercise;
    if(!form) {
      if(requested&&!options.classifications)continue;
      summary.classifications++;
      const correct=deriveUnified(item,null).answer,analyze=analyzer(item,null);
      const choices=item.domain==='verb'?['五段动词','一段动词','不规则动词']:['い形容词','な形容词'];
      for(const input of choices)check({...exercise,input,family:'classification',expected:{mode:input===correct?'correct':'guided'}},analyze);
      continue;
    }
    if(requested&&!requested.has(form))continue;
    const key=structuralKey(item,form),representative=!representatives.has(key);
    if(options.representatives&&!representative)continue;
    representatives.add(key);forms.add(form);summary.contexts++;
    summary.dimensions[key]=(summary.dimensions[key]??0)+1;
    const analyze=analyzer(item,form);let plan;
    try {
      plan=buildDiagnosticPlan(item,form);const problems=auditPlan(item,form,plan);
      if(problems.length){failure({...exercise,family:'plan',input:'xyz§',expected:{mode:'unreadable'}},problems);continue;}
    }catch(error){failure(exercise,[{code:'plan-exception',detail:error.message}]);continue;}
    summary.plans++;summary.paths+=plan.paths.length;summary.nodes+=plan.paths.reduce((n,p)=>n+p.nodes.length,0);
    for(const c of wholeErrorCases(exercise,{representative,seed:options.seed}))check(c,analyze);
    // Every accepted branch supplies an isolated operation context. Matching
    // node inputs share accepted variants; a short causative branch retains
    // its own class and is not borrowed by a long-form supplied-base question.
    for(const branch of plan.paths) {
      for(const step of atomicSteps({...plan,nodes:branch.nodes},form,exercise.kcIds)) {
        const key=JSON.stringify([item.surface,form,step.surface,step.reading,step.kcIds,step.answers]);
        if(atomicIds.has(key))continue;atomicIds.add(key);summary.atomicContexts++;
        const run=analyzer(item,form,step);
        for(const c of atomicErrorCases(exercise,step))check(c,run);
      }
    }
    const initial=analyze('xyz§'),bound=referenceStages(item,form).length*4+4,starts=[initial];
    // Exercise legacy derived-class probes through the same state machine.
    // The independent malformed ending is not read from diagnosis candidates.
    for(const step of initial.steps) {
      const family=referenceFamily(step.form);
      if(!step.continuation||family?.ending!=='past'||!['godan','ichidan'].includes(family.class)||!step.reading.endsWith('る'))continue;
      const input=step.reading.slice(0,-1)+(family.class==='godan'?'だ':'っだ');
      const c={...exercise,step,kcIds:step.kcIds,input,expected:{mode:'guided'}};
      const checked=auditUniversalCase(c,analyzer(item,form,step));
      if(checked.problems.length)failure({...c,family:'supplied-class'},checked.problems);
      if(checked.result?.steps.some(s=>s.providedClass))starts.push(checked.result);
    }
    for(const start of starts)for(const route of representative?['unknown','correct','alternating']:['unknown']) {
      const result=auditFlow({exercise,initial:start,transition:planDiagnosticTransition,bound,
        analyzerForStep:step=>createAnswerAnalyzer(item,form,{step}),
        answerForStep:(step,index)=>step.kind==='classification'?step.expectedClass:route==='correct'||route==='alternating'&&index%2?step.readings[0]:'xyz§'});
      summary.flows++;summary.flowSteps+=result.steps;summary.learningAudit.flows++;summary.learningAudit.flowChecks+=result.learningChecks??0;
      if(result.problems.length)failure({...exercise,route,startSteps:start.steps,input:'xyz§',family:'flow',expected:{mode:'unreadable'}},result.problems);
    }
    if(Date.now()-logged>20000){process.stdout.write(JSON.stringify({contexts:summary.contexts,cases:summary.cases,failures:summary.failures})+'\n');logged=Date.now();}
  }
  summary.forms=forms.size;
  if(forms.size!==(requested?.size??DIAGNOSTIC_FORMS.length))summary.coverageErrors.push('形式覆盖不完整');
  if(!requested)for(const family of UNIVERSAL_FAMILIES)if(!summary.families[family])summary.coverageErrors.push(`没有生成 ${family}`);
  if(summary.plans!==summary.contexts)summary.coverageErrors.push('存在无法校验的变化路径');
}
summary.savedFailures=findings.length;summary.structuralRepresentatives=representatives.size;
await writeFile(path.join(options.output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
await writeFile(path.join(options.output,'failures.jsonl'),findings.map(v=>JSON.stringify(v)).join('\n')+(findings.length?'\n':''));
await writeFile(path.join(options.output,'minimal-counterexamples.jsonl'),shrunk.map(v=>JSON.stringify(v)).join('\n')+(shrunk.length?'\n':''));
await writeFile(path.join(options.output,'report.md'),[
  '# 诊断路径与输入变异审计','',`范围：${summary.scope}；固定随机种子：${summary.seed}。`,
  `词条／形式上下文：${summary.contexts}；活用形式：${summary.forms}；分类词条：${summary.classifications}。`,
  `校验变化路径：${summary.paths}；操作节点：${summary.nodes}；独立拆步上下文：${summary.atomicContexts}。`,
  `输入用例：${summary.cases}；流程：${summary.flows}（实际执行 ${summary.flowSteps} 步）；违规：${summary.failures}。`,'',
  `学习证据审计 v${LEARNING_AUDIT_VERSION}：输入计分／重放 ${summary.learningAudit.checks} 次，连续流程计分／重放 ${summary.learningAudit.flowChecks} 次；两者均使用页面的实际独立／辅助渠道。`,'',
  '基本操作顺序由独立测试策略给出，不从生产归因候选反推；合法答案由既有活用器提供，再单独核对每个操作的语言规则。',
  '全词库覆盖单处变化、所有接受变体及基本拆步；不同节点两处错误、词汇＋规则混合、三处以上错误和固定种子模糊输入使用每种结构的代表词条。',
  '检查拒绝正确答案、错误扣分、缺少补查、给定词形／目标不一致、提前泄露答案、重复评估和不能结束。原答不能唯一归因时允许保守反馈与补查；这不等于宣称能从任意输入读出学习者的真实想法。','',
  '| 输入族 | 用例 |','|---|---:|',...Object.entries(summary.families).map(([k,v])=>`| ${k} | ${v} |`),'',
  `失败样本最多保存 1,000 条，当前 ${findings.length} 条；最小化反例最多保存 20 条，当前 ${shrunk.length} 条。失败总数以 summary.json 为准。`,
  '可用 `npm run audit:paths -- --replay outputs/diagnostic-paths/minimal-counterexamples.jsonl --output outputs/diagnostic-replay` 回放。',
  ...summary.coverageErrors.map(e=>`覆盖违规：${e}`),''].join('\n'));
process.stdout.write(JSON.stringify({contexts:summary.contexts,forms:summary.forms,cases:summary.cases,flows:summary.flows,failures:summary.failures,coverageErrors:summary.coverageErrors,report:path.join(options.output,'report.md')})+'\n');
if(summary.failures||summary.coverageErrors.length)process.exitCode=1;
