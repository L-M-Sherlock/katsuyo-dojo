import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { mkdir, writeFile, open } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { PATTERNS, generateErrorCases } from './lib/error-patterns.mjs';
import { auditGeneratedCase } from './lib/diagnosis-audit.mjs';
import { LEARNING_AUDIT_VERSION } from './lib/learning-evidence-contracts.mjs';

const args=process.argv.slice(2), options={output:null,strict:false,pattern:null,forms:null,replay:null,cases:false,compare:null};
for(let i=0;i<args.length;i++) {
  const arg=args[i];
  if(arg==='--strict')options.strict=true;
  else if(arg==='--cases')options.cases=true;
  else if(['--output','--pattern','--forms','--replay','--compare'].includes(arg)&&args[i+1])options[arg.slice(2)]=args[++i];
  else throw new Error(`Unknown/missing option: ${arg}`);
}
if(options.pattern&&!PATTERNS.some(p=>p.id===options.pattern))throw new Error(`Unknown pattern ${options.pattern}`);
options.output??=options.replay?'outputs/diagnosis-replay':options.forms?'outputs/diagnosis-forms':options.pattern?`outputs/diagnosis-${options.pattern}`:'outputs/diagnosis-audit';
let replayExercise=null;
if(options.replay) {
  const input=createReadStream('outputs/diagnosis-audit/findings.jsonl');
  const lines=createInterface({input,crlfDelay:Infinity});
  try {for await(const line of lines) {const record=JSON.parse(line);if(record.id===options.replay){replayExercise=record;break;}}}
  catch(error) {if(error.code!=='ENOENT')throw error;}
  finally {lines.close();input.destroy();}
}
const server=await createServer({appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
let model;
try {model=(await server.ssrLoadModule('/app/page.tsx')).KNOWLEDGE;}finally{await server.close();}
const selectedForms=options.forms?new Set(options.forms.split(',').filter(Boolean)):null;
if(selectedForms) {
  const supported=new Set(model.exercises.map(e=>e.form).filter(Boolean));
  if(!selectedForms.size||[...selectedForms].some(form=>!supported.has(form)))throw new Error(`Unknown or empty forms: ${options.forms}`);
}
await mkdir(options.output,{recursive:true});
const issueFile=await open(path.join(options.output,'findings.jsonl'),'w');
const caseFile=options.cases?await open(path.join(options.output,'cases.jsonl'),'w'):null;
const rows=new Map(PATTERNS.filter(p=>!options.pattern||options.pattern===p.id).map(p=>[p.id,{...p,total:0,contractCases:0,exploratoryCases:0,pass:0,regression:0,recognized:0,retry:0,deferred:0,gap:0,examples:[]} ]));
const dimensions=new Map(), forms=new Set(), inputs=new Set(), exercises=new Set();
const knowledge=new Map(model.components.map(kc=>[kc.id,{id:kc.id,label:kc.label,gating:kc.gating,exposure:0,expectedFailure:0,expectedConfirmation:0}]));
let total=0,collisions=0,regressions=0,gaps=0,deferred=0,learningChecks=0,issueBuffer='',caseBuffer='';
try {
for(const exercise of model.exercises) {
  if(!exercise.form)continue;
  if(selectedForms&&!selectedForms.has(exercise.form))continue;
  if(replayExercise&&(exercise.item.domain!==replayExercise.domain||exercise.item.surface!==replayExercise.surface||exercise.form!==replayExercise.form))continue;
  const exerciseKey=JSON.stringify([exercise.item.domain,exercise.item.surface,exercise.form]);
  if(exercises.has(exerciseKey))continue;exercises.add(exerciseKey);
  const generated=generateErrorCases(exercise);collisions+=generated.collisions;
  const analyze=createAnswerAnalyzer(exercise.item,exercise.form),stepAnalyzers=new Map();
  for(const c of generated.cases) {
    if(options.pattern&&c.pattern!==options.pattern||options.replay&&c.id!==options.replay)continue;
    let analyzeCase=analyze;
    if(c.step) {
      const stepKey=JSON.stringify(c.step);
      if(!stepAnalyzers.has(stepKey))stepAnalyzers.set(stepKey,createAnswerAnalyzer(c.item,c.form,{step:c.step}));
      analyzeCase=stepAnalyzers.get(stepKey);
    }
    const result=auditGeneratedCase(c,analyzeCase);
    learningChecks += result.learningChecks ?? 0;
    for(const id of c.kcIds)if(knowledge.has(id))knowledge.get(id).exposure++;
    if(c.expected.failed&&knowledge.has(c.expected.failed))knowledge.get(c.expected.failed).expectedFailure++;
    for(const id of c.expected.confirmed??[])if(knowledge.has(id))knowledge.get(id).expectedConfirmation++;
    const record={id:c.id,pattern:c.pattern,level:c.level,domain:c.item.domain,class:c.item.class,surface:c.item.surface,reading:c.item.reading,form:c.form,input:c.input,writing:c.writing,stepIndex:c.stepIndex,...(c.originalInput?{originalInput:c.originalInput}:{}),expected:c.expected,...result};
    total++;forms.add(c.form);inputs.add(JSON.stringify([c.item.domain,c.item.surface,c.form,c.stepIndex,c.input,...(c.originalInput?[c.originalInput]:[])]));
    const row=rows.get(c.pattern);row.total++;row[result.status]++;
    row[c.expected.kind==='explore'?'exploratoryCases':'contractCases']++;
    const key=[c.item.domain,c.item.class,c.form,c.stepIndex===null?'whole':'step'].join('/');
    if(!dimensions.has(key))dimensions.set(key,{key,total:0,regression:0,gap:0,patterns:{}});
    const dimension=dimensions.get(key);dimension.total++;
    dimension.patterns[c.pattern]=(dimension.patterns[c.pattern]??0)+1;
    if(result.status==='regression') {regressions++;dimension.regression++;}
    if(result.status==='deferred')deferred++;
    if(result.status==='gap') {gaps++;dimension.gap++;}
    if(['regression','gap','deferred'].includes(result.status)) {
      issueBuffer+=JSON.stringify(record)+'\n';
      if(row.examples.length<3)row.examples.push(record);
      if(issueBuffer.length>131072){await issueFile.write(issueBuffer);issueBuffer='';}
    }
    if(caseFile) {caseBuffer+=JSON.stringify(record)+'\n';if(caseBuffer.length>131072){await caseFile.write(caseBuffer);caseBuffer='';}}
    if(options.replay)process.stdout.write(JSON.stringify(record,null,2)+'\n');
  }
}
if(issueBuffer)await issueFile.write(issueBuffer);if(caseBuffer)await caseFile.write(caseBuffer);
}finally {await issueFile.close();await caseFile?.close();}
if(!total)throw new Error('No cases matched; check replay ID or pattern.');
const coverageErrors=!options.pattern&&!options.replay&&!selectedForms?[...rows.values()].filter(row=>row.total===0).map(row=>`未生成模式 ${row.id}`):[];
const expectedFormCount=selectedForms?.size??new Set(model.exercises.map(e=>e.form).filter(Boolean)).size;
if(!options.pattern&&!options.replay&&forms.size!==expectedFormCount)coverageErrors.push(`仅覆盖 ${forms.size}/${expectedFormCount} 种形式`);
const knowledgeCoverage=[...knowledge.values()];
const gating=knowledgeCoverage.filter(kc=>kc.gating);
for(const row of rows.values())row.level=row.contractCases&&row.exploratoryCases?'mixed':row.contractCases?'contract':'explore';
const contractCases=[...rows.values()].reduce((sum,row)=>sum+row.contractCases,0);
const scope=selectedForms?`forms:${[...selectedForms].sort().join(',')}${options.pattern?`;pattern:${options.pattern}`:''}`:options.pattern??'all';
const report={schemaVersion:2,scope,replay:options.replay,total,contractCases,exploratoryCases:total-contractCases,uniqueInputs:inputs.size,forms:forms.size,exercises:exercises.size,acceptedCollisionsExcluded:collisions,regressions,gaps,deferred,coverageErrors,knowledgeCoverage,patterns:[...rows.values()],dimensions:[...dimensions.values()],
  learningAudit:{version:LEARNING_AUDIT_VERSION,cases:total,checks:learningChecks}};
if(options.compare) {
  const {readFile}=await import('node:fs/promises');
  const before=JSON.parse(await readFile(options.compare,'utf8'));
  if(before.scope!==report.scope||before.replay!==report.replay)throw new Error('Comparison summaries must have the same pattern/replay scope.');
  report.comparison={baseline:options.compare,metrics:Object.fromEntries(['total','regressions','gaps','deferred'].map(key=>[key,{before:before[key],after:report[key],delta:report[key]-before[key]}])),patterns:report.patterns.map(row=>{
    const old=before.patterns.find(p=>p.id===row.id);
    return {id:row.id,label:row.label,comparable:Boolean(old),...Object.fromEntries(['total','regression','gap','deferred'].map(key=>[key,{before:old?.[key]??0,after:row[key],delta:row[key]-(old?.[key]??0)}]))};
  })};
  report.comparison.existingPatterns=Object.fromEntries(['total','regression','gap','deferred'].map(key=>{
    const comparable=report.comparison.patterns.filter(row=>row.comparable);
    return [key,{before:comparable.reduce((sum,row)=>sum+row[key].before,0),after:comparable.reduce((sum,row)=>sum+row[key].after,0)}];
  }));
}
await writeFile(path.join(options.output,'summary.json'),JSON.stringify(report,null,2)+'\n');
const lines=['# 归因生成审计报告','',`生成用例：${total}；不同输入上下文：${inputs.size}；覆盖形式：${forms.size}。`,`约定回归或安全违规：${regressions}；探索模式未识别：${gaps}；仅有拆步回退：${deferred}。`,
`学习证据审计 v${LEARNING_AUDIT_VERSION}：${total} 个输入执行 ${learningChecks} 次真实计分／重放检查，覆盖独立、拆步、提示、反馈、揭晓和过早同词练习。`,'',
'“探索未识别”是待评审的能力缺口，不代表可以直接推断某个知识点错误；未知多错输入的保守处理属于通过。此报告不能证明覆盖所有自然错误。','',
'| 模式 | 级别 | 用例 | 约定通过 | 已识别（待语义评审） | 提示重试 | 仅拆步回退 | 探索未识别 | 回归／违规 |','|---|---|---:|---:|---:|---:|---:|---:|---:|',
...[...rows.values()].map(r=>`| ${r.label} | ${r.level} | ${r.total} | ${r.pass} | ${r.recognized} | ${r.retry} | ${r.deferred} | ${r.gap} | ${r.regression} |`),'',
'完整失败及缺口：`findings.jsonl`。可按 `id` 使用 `npm run audit:diagnosis -- --replay <id> --output outputs/diagnosis-replay` 重现。','',
'## 知识点约定覆盖','',`有直接扣分预期的达标知识点：${gating.filter(kc=>kc.expectedFailure>0).length}/${gating.length}；有明确部分正确预期：${gating.filter(kc=>kc.expectedConfirmation>0).length}/${gating.length}。`,'这些指标表示已有独立测试约定，不是知识点正确率。复合应用等无法唯一归因的原子不应为了提高覆盖率而强行扣分；逐原子明细见 summary.json。','',...coverageErrors.map(error=>`覆盖检查失败：${error}`),'','## 示例',''];
for(const row of rows.values())for(const e of row.examples)lines.push(`- **${row.label} / ${e.status}**：${e.surface} → ${e.form}；输入「${e.input}」。实际扣分：${e.actual.failed??'无'}；已确认：${e.actual.confirmed.join('、')||'无'}；剩余步骤：${e.actual.steps}。ID：\`${e.id}\`。`);
if(report.comparison)lines.push('','## 与基线比较','',`基线：\`${options.compare}\`。用例生成范围可能扩大；数量变化与诊断改善应分别解读。`,
  `既有模式的未识别：${report.comparison.existingPatterns.gap.before} → ${report.comparison.existingPatterns.gap.after}；仅拆步回退：${report.comparison.existingPatterns.deferred.before} → ${report.comparison.existingPatterns.deferred.after}。`,'',
  '| 模式 | 用例数（前 → 后） | 未识别（前 → 后） | 拆步回退（前 → 后） | 回归（前 → 后） |','|---|---:|---:|---:|---:|',...report.comparison.patterns.map(r=>`| ${r.label}${r.comparable?'':'（新增）'} | ${r.total.before} → ${r.total.after} | ${r.gap.before} → ${r.gap.after} | ${r.deferred.before} → ${r.deferred.after} | ${r.regression.before} → ${r.regression.after} |`));
await writeFile(path.join(options.output,'report.md'),lines.join('\n')+'\n');
process.stdout.write(JSON.stringify({total,uniqueInputs:inputs.size,forms:forms.size,regressions,gaps,deferred,report:path.join(options.output,'report.md')})+'\n');
if(coverageErrors.length||regressions||options.strict&&(gaps||deferred))process.exitCode=1;
