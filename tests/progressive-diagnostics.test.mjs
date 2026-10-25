import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnswerAnalyzer} from '../app/lib/answer-analysis.mjs';
import {atomicSteps,buildDiagnosticPlan,progressiveSteps} from '../app/lib/diagnostic-plan.mjs';
import {deriveUnified,unifiedDiagnosticSteps} from '../app/lib/unified-knowledge.mjs';
import {planDiagnosticTransition} from '../app/lib/diagnostic-session.mjs';
import {scoreLearningEvidence} from '../app/lib/learning-evidence.mjs';
import {auditGuidance} from '../scripts/lib/diagnostic-contracts.mjs';

const write={domain:'verb',class:'godan',surface:'書く',reading:'かく'};
const close={domain:'verb',class:'ichidan',surface:'閉める',reading:'しめる'};
const unknown=(item,form,step)=>createAnswerAnalyzer(item,form,{step})('xyz§');

test('a te-based expression first checks a full te form, then expands only if that remains unresolved',()=>{
  const whole=unknown(write,'temo');
  assert.deepEqual(whole.steps.map(s=>[s.kind,s.form,s.reading]),[['conjugation','te','かく'],['atomic','temo','かいて']]);
  assert.deepEqual(whole.steps[0].readings,['かいて']);
  assert.equal(whole.steps[0].continuation,false,'the original dictionary word is not a supplied intermediate');
  assert.deepEqual(auditGuidance({item:write,form:'temo',kcIds:deriveUnified(write,'temo').requiredKcIds},whole),[]);
  const smaller=unknown(write,'te',whole.steps[0]);
  assert.ok(smaller.steps.every(s=>s.kind==='atomic'));
  assert.match(smaller.steps[0].prompt,/音便/);
  assert.doesNotMatch(smaller.steps[0].prompt,/て形：/);
  assert.match(smaller.steps[0].prompt,/不要接「て」/);
});

test('a partial instruction requests only its own output and keeps the construction goal as metadata',()=>{
  const result=unknown(write,'negative');
  assert.ok(result.steps.every(s=>s.kind==='atomic'));
  const [stem,suffix]=result.steps;
  assert.equal(stem.readings[0],'かか');
  assert.match(stem.prompt,/只变化词尾.*不要接「ない」.*完整词干/);
  assert.doesNotMatch(stem.prompt,/否定形/);
  assert.equal(stem.goalLabel,'普通体否定形');
  assert.match(stem.note,/ア段/);
  assert.match(suffix.prompt,/接上否定词尾.*本步变化后的整个形式/);
  assert.ok(!stem.prompt.includes('かか'));
});

test('godan preparation steps name the requested stem instead of the completed conjugation',()=>{
  for(const [form,ending,row] of [['negative','ない','ア'],['masu','ます','イ'],['potential','る','エ'],['volitional','う','オ']]){
    const stem=unknown(write,form).steps[0];
    assert.match(stem.prompt,new RegExp('不要接「'+ending+'」'));
    assert.match(stem.prompt,/完整词干/);
    assert.match(stem.note,new RegExp(row+'段'));
    assert.match(stem.stepTitle,/词干/);
    assert.notEqual(stem.targetLabel,row+'段词干');
  }
});

test('provided negative-past goals first check full negative, retaining the correct derived word',()=>{
  const originalStep=unifiedDiagnosticSteps(close,'tagaruNegativePast').at(-1);
  const next=unknown(close,'tagaruNegativePast',originalStep);
  assert.deepEqual(next.steps.map(s=>s.readings[0]),['しめたがらない','しめたがらなかった']);
  assert.deepEqual(next.steps[0].analysisItem.surface,'閉めたがる');
  const mixed=createAnswerAnalyzer(close,'tagaruNegativePast',{step:originalStep})('しめたがりない');
  assert.doesNotMatch(mixed.feedback.message,/ア段|a段/);
  const narrow=unknown(close,'negative',next.steps[0]);
  assert.deepEqual(narrow.steps.map(s=>s.readings[0]),['しめたがら','しめたがらない']);
});

test('adjective negatives also stay whole before being split into ku and nai',()=>{
  const item={domain:'adjective',class:'i',surface:'高い',reading:'たかい'};
  const given={surface:item.surface,reading:item.reading,analysisItem:item,form:'adjectiveNegativePast',
    answers:['高くなかった'],readings:['たかくなかった'],kcIds:['adj.stem.i-ku','adj.suffix.i-negative','adj.suffix.i-past'],continuation:false};
  const result=unknown(item,given.form,given);
  assert.deepEqual(result.steps.map(s=>s.readings[0]),['たかくない','たかくなかった']);
  assert.equal(result.steps[0].kind,'conjugation');
  assert.ok(unknown(item,'adjectiveNegative',result.steps[0]).steps.every(s=>s.kind==='atomic'));
});

test('confirmed operations are never rebundled and contractions stay compatible with the supplied base',()=>{
  const plan=buildDiagnosticPlan(write,'temo'),ids=deriveUnified(write,'temo').requiredKcIds;
  const remaining=progressiveSteps(plan,'temo',ids,['onbin.i']);
  assert.ok(remaining.every(s=>s.kind==='atomic'));
  assert.ok(remaining.every(s=>!s.kcIds.includes('onbin.i')));
  const stopped=progressiveSteps(plan,'temo',ids,[],'かいて');
  assert.deepEqual(stopped.map(s=>s.readings[0]),['かいても']);
  const base={...close,surface:'閉めさせる',reading:'しめさせる'};
  const native=buildDiagnosticPlan(base,'negative');
  for(const s of atomicSteps(native,'negative',['stem.ichidan.drop-ru','suffix.negative']))assert.ok(!s.readings.includes('しめささない'));
});

test('recursive refinement records only performed local rules once and never changes independent mastery',()=>{
  let steps=unknown(write,'naideKudasai').steps,index=0,evaluated=[],examined=[];
  let state={byKc:{},independentByKc:{},assistedByKc:{}};
  let refinements=0;
  while(index<steps.length){
    assert.ok(index<12);
    const s=steps[index],answer=s.kind==='conjugation'?'xyz§':s.readings[0];
    const analysis=createAnswerAnalyzer(write,s.form,{step:s})(answer);
    if(analysis.steps.length)refinements++;
    const transition=planDiagnosticTransition(steps,index,analysis,evaluated,examined);
    state=scoreLearningEvidence(state,{form:s.form,kcIds:transition.assessed.kcIds,correct:analysis.kind==='correct',
      failedKcId:analysis.diagnosis?.kcId,confirmedKcIds:analysis.diagnosis?.confirmedKcIds,support:{independent:false,source:'guided'}});
    steps=transition.nextSteps;evaluated=transition.evaluated;examined=transition.examined;index++;
  }
  assert.equal(refinements,1);assert.deepEqual(state.byKc,{});assert.deepEqual(state.independentByKc,{});
  assert.ok(Object.values(state.assistedByKc).every(stats=>stats.attempts===1));
  assert.deepEqual(new Set(Object.keys(state.assistedByKc)),new Set(['stem.godan.a','suffix.negative','construction.naide','construction.naideKudasai']));
});

test('independent guidance checks reject a repeated whole form or invented grouped answers',()=>{
  const context={item:write,form:'temo',kcIds:deriveUnified(write,'temo').requiredKcIds},good=unknown(write,'temo');
  const step=good.steps[0];
  const wrong={...good,steps:[{...step,answers:['書く'],readings:['かく']},...good.steps.slice(1)]};
  assert.ok(auditGuidance(context,wrong).some(e=>e.code==='wrong-subform-answer'));
  assert.ok(auditGuidance({...context,step},good).some(e=>e.code==='repeated-whole-form'));
});


test('the supplied 売ら step asks for a passive ending and attributes godan to 売る',()=>{
  const item={domain:'verb',surface:'売る',reading:'うる',class:'godan'},form='passiveCompletion';
  const steps=atomicSteps(buildDiagnosticPlan(item,form),form,deriveUnified(item,form).requiredKcIds);
  const step=steps.find(s=>s.reading==='うら');
  assert.equal(step.stepTitle,'补上受身词尾');
  assert.match(step.prompt,/词尾变化已完成.*接上受身词尾.*本步变化后的整个形式/);
  assert.match(step.note,/「売る」按五段动词变化/);
  assert.doesNotMatch(step.note,/「売ら」.*五段/);
  assert.deepEqual(step.kcIds,['suffix.passive']);
  assert.equal(createAnswerAnalyzer(item,form,{step})('うられる').kind,'correct');
});
