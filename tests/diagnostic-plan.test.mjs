import assert from 'node:assert/strict';
import test from 'node:test';
import { UNIFIED_COURSES } from '../app/lib/unified-curriculum.mjs';
import { DIAGNOSTIC_FORMS, buildDiagnosticPlan, atomicSteps } from '../app/lib/diagnostic-plan.mjs';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { deriveUnified, unifiedDiagnosticSteps } from '../app/lib/unified-knowledge.mjs';
import { emptySkillStats, updateKnowledgeStats } from '../app/lib/adaptive.mjs';
import { replayCase, auditGuidance } from '../scripts/lib/diagnostic-contracts.mjs';

const close={domain:'verb',class:'ichidan',surface:'閉める',reading:'しめる'};
const verbs=[...['買う','書く','泳ぐ','話す','待つ','死ぬ','遊ぶ','読む','取る','行く'].map((surface,i)=>({domain:'verb',class:'godan',surface,reading:['かう','かく','およぐ','はなす','まつ','しぬ','あそぶ','よむ','とる','いく'][i]})),close,
  {domain:'verb',class:'irregular',surface:'勉強する',reading:'べんきょうする'},{domain:'verb',class:'irregular',surface:'来る',reading:'くる'}];
const adjectives=[{domain:'adjective',class:'i',surface:'早い',reading:'はやい'},
  {domain:'adjective',class:'i',surface:'いい',reading:'いい',iiFamily:true},{domain:'adjective',class:'na',surface:'綺麗',reading:'きれい'}];
const fixture=()=>{
  const form='tagaruNegativePast',step=unifiedDiagnosticSteps(close,form).at(-1),input='しめたがりない';
  return {item:close,form,step,input,kcIds:step.kcIds,requiredSteps:[['stem.godan.a'],['suffix.negative'],['adj.suffix.i-past']],noEvidence:true};
};

test('all 134 forms have declared plans and every representative accepted branch reaches the right answer',()=>{
  const courses=new Map(UNIFIED_COURSES.flatMap(c=>c.forms.map(form=>[form,c])));
  assert.equal(courses.size,134);assert.deepEqual(new Set(DIAGNOSTIC_FORMS),new Set(courses.keys()));
  for(const [form,c] of courses)for(const item of c.domain==='verb'?verbs:adjectives) {
    if(form==='causativePassiveContracted'&&(item.class!=='godan'||item.surface.endsWith('す')))continue;
    if(item.domain==='adjective'&&form!=='adjectiveAdverb'&&form!=='adjectiveBa'
      &&(item.class==='na')!==(['adjectiveAttributive','adjectivePredicative','adjectiveNaNegative','adjectiveNaPast','adjectiveNaNegativePast','adjectiveNaTe'].includes(form)))continue;
    const plan=buildDiagnosticPlan(item,form),correct=deriveUnified(item,form);
    assert.deepEqual(new Set(plan.paths.map(p=>p.state.surface)),new Set(correct.acceptedVariants),`${item.surface}/${form}`);
    for(const path of plan.paths) {
      assert.ok(path.nodes.length);assert.equal(path.nodes[0].input.surface,item.surface);
      for(let i=1;i<path.nodes.length;i++)assert.equal(path.nodes[i].input.surface,path.nodes[i-1].output.surface,`${item.surface}/${form}`);
      assert.ok(path.nodes.every(n=>n.ruleKcIds.length&&n.label&&!n.output.surface.includes('undefined')));
    }
  }
  assert.throws(()=>buildDiagnosticPlan(close,'newUnsupportedForm'),/Missing diagnostic recipe/);
});

test('the reported negative-past error has three independent, ordered checks and no original penalty',()=>{
  const c=fixture(),analyze=createAnswerAnalyzer(c.item,c.form,{step:c.step}),result=analyze(c.input);
  assert.deepEqual(replayCase(c,analyze),[]);
  assert.match(result.feedback.message,/り/);assert.match(result.feedback.message,/ない/);
  assert.doesNotMatch(result.feedback.message,/なかった/);
  assert.deepEqual(result.steps.map(s=>s.reading),['しめたがる','しめたがら','しめたがらない']);
  const stats=Object.fromEntries(c.kcIds.map(id=>[id,{...emptySkillStats()}]));
  assert.deepEqual(updateKnowledgeStats(stats,{kcIds:c.kcIds,correct:false,failedKcId:result.diagnosis?.kcId}),stats);
  const bad=['しめたがり','しめたがら','しめたがらない'];
  for(const [i,step] of result.steps.entries()) {
    const answer=createAnswerAnalyzer(close,c.form,{step})(bad[i]);
    assert.equal(answer.diagnosis.kcId,c.requiredSteps[i][0]);assert.deepEqual(answer.steps,[]);
    const after=updateKnowledgeStats(stats,{kcIds:step.kcIds,correct:false,failedKcId:answer.diagnosis.kcId});
    for(const id of c.kcIds)assert.equal(after[id].attempts,Number(id===c.requiredSteps[i][0]),id);
  }
});

test('native and derived negatives, pasts, adjectives and special tails all have finite fallback',()=>{
  const cases=[...verbs.flatMap(item=>['negative','past','te','negativePast','tagaruNegative','tagaruNegativePast','tearuNegativePast','tekuruNegativePast','teikuNegativePast'].map(form=>({item,form}))),
    ...adjectives.map(item=>({item,form:item.class==='na'?'adjectiveNaNegativePast':'adjectiveNegativePast'}))];
  for(const {item,form} of cases) {
    const analyze=createAnswerAnalyzer(item,form),r=analyze('xyz§');
    assert.equal(r.kind,'incorrect');assert.equal(r.diagnosis,null);assert.ok(r.feedback.message);assert.ok(r.steps.length,`${item.surface}/${form}`);
    const ids=deriveUnified(item,form).requiredKcIds;
    assert.deepEqual(auditGuidance({item,form,kcIds:ids},r),[]);
    for(const step of r.steps) {
      const response=createAnswerAnalyzer(item,form,{step})('xyz§');
      assert.ok(response.feedback.message);
      if(step.kind==='atomic')assert.deepEqual(response.steps,[]);
      else for(const leaf of response.steps) {
        assert.equal(leaf.kind,'atomic');assert.deepEqual(createAnswerAnalyzer(item,form,{step:leaf})('xyz§').steps,[]);
      }
    }
  }
});

test('guided nodes accept compatible variants, skip confirmed rules and never score application',()=>{
  const plan=buildDiagnosticPlan(close,'potential'),scope=deriveUnified(close,'potential').requiredKcIds;
  const steps=atomicSteps(plan,'potential',scope,['stem.ichidan.drop-ru']);
  assert.equal(steps.length,1);assert.deepEqual(steps[0].readings,['しめられる','しめれる']);
  for(const answer of steps[0].readings)assert.equal(createAnswerAnalyzer(close,'potential',{step:steps[0]})(answer).kind,'correct');
  const c=fixture(),result=createAnswerAnalyzer(close,c.form,{step:c.step})(c.input);
  assert.ok(result.steps.flatMap(s=>s.kcIds).every(id=>!/^apply\.|facet\.|compound\./.test(id)));
});

test('empty and excessive inputs ask for re-entry and malformed leaf inputs terminate without evidence',()=>{
  const c=fixture(),analyze=createAnswerAnalyzer(close,c.form,{step:c.step});
  for(const input of ['', ' 。 ', 'あ'.repeat(257),null,undefined,17]) {
    const r=analyze(input);assert.equal(r.kind,'invalid');assert.equal(r.diagnosis,null);assert.deepEqual(r.steps,[]);assert.ok(r.feedback.message);
  }
  for(const step of analyze(c.input).steps)for(const answer of ['§','abc','😺','\ud800','別の単語','さまたがりない']) {
    const r=createAnswerAnalyzer(close,c.form,{step})(answer);
    assert.equal(r.kind,'incorrect');assert.equal(r.diagnosis,null);assert.deepEqual(r.steps,[]);assert.ok(r.feedback.message);
  }
});

test('the independent audit rejects missing probes, wrong rules, missing feedback and recursive leaves',()=>{
  const c=fixture(),run=createAnswerAnalyzer(close,c.form,{step:c.step}),good=run(c.input);
  for(const broken of [{...good,steps:[]},{...good,feedback:null},
    {...good,steps:good.steps.map((s,i)=>i? s : {...s,kcIds:['onbin.sokuon']})},
    {...good,diagnosis:{kcId:'stem.godan.a',confirmedKcIds:[]}}])assert.ok(replayCase(c,()=>broken).length);
  const leaf=good.steps[0],response=createAnswerAnalyzer(close,c.form,{step:leaf})('§');
  assert.ok(auditGuidance({...c,step:leaf,kcIds:leaf.kcIds},{...response,steps:[leaf]}).some(p=>p.code==='recursive-atomic'));
});
