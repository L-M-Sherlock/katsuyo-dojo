import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDiagnosticPlan,atomicSteps } from '../app/lib/diagnostic-plan.mjs';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { unifiedDiagnosticSteps,deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { planDiagnosticTransition } from '../app/lib/diagnostic-session.mjs';
import { auditPlan } from '../scripts/lib/diagnostic-oracle.mjs';
import { wholeErrorCases,atomicErrorCases,shrinkCounterexample } from '../scripts/lib/universal-error-cases.mjs';
import { auditUniversalCase,auditFlow } from '../scripts/lib/universal-diagnosis-audit.mjs';
import { mergeDiagnosticPaths } from '../scripts/lib/merge-diagnostic-paths.mjs';

const close={domain:'verb',surface:'閉める',reading:'しめる',class:'ichidan'};
const write={domain:'verb',surface:'書く',reading:'かく',class:'godan'};
const exercise=(item,form)=>({item,form,kcIds:deriveUnified(item,form).requiredKcIds});
const inspect=(c)=>auditUniversalCase(c,createAnswerAnalyzer(c.item,c.form,c.step?{step:c.step}:{}));
test('independent plan assertions reject deleted steps, swapped operations, wrong classes, rules and targets',()=>{
  const item=close,form='tagaruNegativePast',plan=buildDiagnosticPlan(item,form);
  assert.deepEqual(auditPlan(item,form,plan),[]);
  for(const change of [p=>p.nodes.pop(),p=>p.nodes.reverse(),p=>p.nodes[0].item.class='godan',
    p=>p.nodes[0].ruleKcIds=['stem.godan.a'],p=>p.nodes.at(-1).output.reading='しめたがりない',p=>p.nodes.at(-1).label='现在形']) {
    const bad=structuredClone(plan);change(bad);
    assert.ok(auditPlan(item,form,bad).length);
  }
});

test('every generated family has explicit feedback or scoring obligations; all representative mutations are deterministic',()=>{
  const e=exercise(close,'tagaruNegativePast');
  const first=[...wholeErrorCases(e,{representative:true})],again=[...wholeErrorCases(e,{representative:true})];
  assert.deepEqual(first,again);
  for(const family of ['accepted','invalid','unreadable','omit','repeat','transpose','voicing','size','row','other-form','stop','lexical','pair','lexical-pair','three-plus','fuzz'])assert.ok(first.some(c=>c.family===family),family);
  const analyze=createAnswerAnalyzer(e.item,e.form);
  for(const c of first)assert.deepEqual(auditUniversalCase(c,analyze).problems,[],`${c.family}: ${c.input}`);
  for(const step of atomicSteps(buildDiagnosticPlan(e.item,e.form),e.form,e.kcIds))for(const c of atomicErrorCases(e,step))assert.deepEqual(inspect(c).problems,[],`${step.targetLabel}: ${c.input}`);
});

test('the audit catches empty fallbacks, wrong-KC leaf scoring, answer leakage and contradictory labels',()=>{
  const e=exercise(close,'tagaruNegativePast'),parent=unifiedDiagnosticSteps(close,e.form).at(-1);
  const c={...e,step:parent,kcIds:parent.kcIds,input:'しめたがりない',expected:{mode:'guided'}};
  const good=inspect(c).result;assert.deepEqual(inspect(c).problems,[]);
  for(const bad of [
    {...good,steps:[],feedback:{...good.feedback,terminal:true}},
    {...good,feedback:{...good.feedback,message:'正确答案是しめたがらなかった'}},
    {...good,steps:good.steps.map((s,i)=>i?s:{...s,targetLabel:'过去形'})},
    {...good,steps:good.steps.map((s,i)=>i?s:{...s,answers:['別の答え']})},
  ])assert.ok(auditUniversalCase(c,()=>bad).problems.length);
  const leaf=good.steps[0],lc={...c,step:leaf,kcIds:leaf.kcIds,input:'しめたがり',expected:{mode:'leaf',failed:'stem.godan.a'}};
  const valid=inspect(lc).result;
  assert.ok(auditUniversalCase(lc,()=>({...valid,diagnosis:{kcId:'apply.tagaru.continuation',confirmedKcIds:[]}})).problems.some(p=>p.code==='wrong-leaf-evidence'));
});

test('a supplied operation accepts legitimate contracted outputs and retains its unchanged material',()=>{
  for(const [form,input] of [['teikuPast','かいてく'],['teoru','かいとる'],['teshimau','かいちゃう'],['teoku','かいとく'],['toru','かいとる']]) {
    const e=exercise(write,form),step=atomicSteps(buildDiagnosticPlan(write,form),form,e.kcIds).find(s=>s.kcIds.some(id=>id.startsWith('construction.')));
    assert.equal(createAnswerAnalyzer(write,form,{step})(input).kind,'correct',form);
    assert.equal(createAnswerAnalyzer(write,form,{step})('さ'+input.slice(1)).diagnosis,null,'a damaged given prefix never becomes construction evidence');
  }
  const come={domain:'verb',surface:'来る',reading:'くる',class:'irregular'};
  const e=exercise(come,'negative'),step=atomicSteps(buildDiagnosticPlan(come,e.form),e.form,e.kcIds)[0];
  assert.equal(createAnswerAnalyzer(come,e.form,{step})('来な').diagnosis.kcId,'suffix.negative');
});

test('queue transitions skip evaluated rules, prevent repeated nodes, and do not mutate state before saving',()=>{
  const e=exercise(close,'tagaruNegativePast'),steps=atomicSteps(buildDiagnosticPlan(close,e.form),e.form,e.kcIds);
  const snapshot=structuredClone(steps),known=['stem.ichidan.drop-ru'];
  const next=planDiagnosticTransition(steps,0,{kind:'correct',diagnosis:null,steps:[steps[0],steps[1],steps[1]]},known,[]);
  assert.deepEqual(steps,snapshot);assert.deepEqual(known,['stem.ichidan.drop-ru']);
  assert.deepEqual(next.writes,[]);
  const ids=next.nextSteps.slice(1).map(s=>s.nodeId);assert.equal(ids.length,new Set(ids).size);
  assert.ok(next.nextSteps.slice(1).every(s=>!s.kcIds.includes('stem.ichidan.drop-ru')));
});

test('whole fallback, correct probes, unknown probes and alternating outcomes terminate without duplicate writes',()=>{
  const e=exercise(close,'tagaruNegativePast'),initial=createAnswerAnalyzer(close,e.form)('xyz§');
  for(const route of ['correct','unknown','alternating']) {
    const result=auditFlow({exercise:e,initial,bound:24,transition:planDiagnosticTransition,
      analyzerForStep:step=>createAnswerAnalyzer(close,e.form,{step}),
      answerForStep:(s,i)=>route==='correct'||route==='alternating'&&i%2?s.readings[0]:'xyz§'});
    assert.deepEqual(result.problems,[]);assert.ok(result.steps>0&&result.steps<24);
  }
});

test('shrinking preserves an independent failing obligation and replayable input instead of teaching the oracle a result',()=>{
  const e=exercise(close,'tagaruNegativePast'),c={...e,family:'fuzz',id:'original',input:'xyzxyz§',expected:{mode:'guided'}};
  const broken=()=>({kind:'incorrect',diagnosis:null,steps:[],feedback:{message:'核对输入',observations:[],terminal:true}});
  const minimal=shrinkCounterexample(c,x=>auditUniversalCase(x,broken).problems.some(p=>p.code==='missing-path'));
  assert.ok(minimal.input.length<c.input.length);assert.ok(minimal.input.length>0);assert.equal(minimal.originalId,'original');
  assert.ok(auditUniversalCase(minimal,broken).problems.length);assert.deepEqual(inspect(minimal).problems,[]);
});

test('given-class composite probes must still supply a finite native fallback',()=>{
  const e=exercise(close,'tagaruPast'),parent=unifiedDiagnosticSteps(close,e.form).at(-1);
  const review=createAnswerAnalyzer(close,e.form,{step:parent})('しめたがだ');
  const supplied=review.steps.find(s=>s.kind==='conjugation'&&s.providedClass);
  assert.ok(supplied);
  const c={...e,step:supplied,kcIds:supplied.kcIds,input:'xyz§',expected:{mode:'unreadable'}};
  const checked=inspect(c);
  assert.deepEqual(checked.problems,[]);
  assert.deepEqual(checked.result.steps.map(s=>s.kcIds),[['onbin.sokuon'],['suffix.past']]);
  const stopped={...checked.result,steps:[],planFallback:false,feedback:{...checked.result.feedback,terminal:true}};
  assert.ok(auditUniversalCase(c,()=>stopped).problems.some(p=>p.code==='missing-path'));
});

test('whole-answer shrinking never sends a legal answer to the failure predicate',()=>{
  const e=exercise(write,'prohibitive'),answer='かくな';
  const c={...e,family:'fuzz',id:'accepted-substring',input:`§${answer}§`,expected:{mode:'guided'}};
  const minimal=shrinkCounterexample(c,candidate=>{
    assert.notEqual(candidate.input,answer,'合法答案不能被当作错误样本继续缩减');
    return candidate.input.includes(answer);
  });
  assert.ok(minimal.input.includes(answer));
  assert.notEqual(minimal.input,answer);
  assert.ok(minimal.input.length<c.input.length);
});

test('merged audits reject missing, duplicate or stale form shards instead of claiming full coverage',()=>{
  const families=Object.fromEntries(['accepted','invalid','unreadable','omit','repeat','transpose','voicing','size','row','other-form','stop','lexical','pair','lexical-pair','three-plus','fuzz'].map(name=>[name,1]));
  const shard=(form,cls=0)=>({forms:[form],report:{schemaVersion:1,scope:`forms:${form}`,seed:1,forms:1,coverageErrors:[],
    contexts:1,classifications:cls,plans:1,paths:1,nodes:1,atomicContexts:1,cases:16,flows:1,flowSteps:2,failures:0,savedFailures:0,structuralRepresentatives:1,
    learningAudit:{version:1,cases:16,checks:192,flows:1,flowChecks:29},
    families:{...families},outcomes:{incorrect:16},failureCodes:{},dimensions:{[form]:1}}});
  const complete=mergeDiagnosticPaths([shard('past',1),shard('te')],['past','te']);
  assert.equal(complete.cases,32);assert.deepEqual(complete.coverageErrors,[]);
  assert.deepEqual(complete.learningAudit,{version:1,cases:32,checks:384,flows:2,flowChecks:58});
  assert.throws(()=>mergeDiagnosticPaths([shard('past',1)],['past','te']),/Incomplete/);
  assert.throws(()=>mergeDiagnosticPaths([shard('past',1),shard('past')],['past','te']),/Duplicate/);
  const stale=shard('te');stale.report.scope='all';assert.throws(()=>mergeDiagnosticPaths([shard('past',1),stale],['past','te']),/Inconsistent/);
  const counts=shard('past',1);counts.report.cases++;assert.throws(()=>mergeDiagnosticPaths([counts],['past']),/counts/);
  const noChannels=shard('past',1);delete noChannels.report.learningAudit;
  assert.throws(()=>mergeDiagnosticPaths([noChannels],['past']),/learning-evidence audit/);
  const noFlowChannels=shard('past',1);noFlowChannels.report.learningAudit.flowChecks=0;
  assert.throws(()=>mergeDiagnosticPaths([noFlowChannels],['past']),/learning-evidence audit/);
  const missingFamily=shard('past',1);delete missingFamily.report.families.pair;missingFamily.report.families.omit++;
  assert.ok(mergeDiagnosticPaths([missingFamily],['past']).coverageErrors.includes('未生成 pair'));
});
