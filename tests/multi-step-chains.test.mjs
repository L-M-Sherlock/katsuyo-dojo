import test from 'node:test';
import assert from 'node:assert/strict';
import {conjugate,acceptedConjugations,explainConjugation} from '../app/lib/conjugation.mjs';
import {deriveUnified} from '../app/lib/unified-knowledge.mjs';
import {createAnswerAnalyzer} from '../app/lib/answer-analysis.mjs';
import {buildDiagnosticPlan} from '../app/lib/diagnostic-plan.mjs';
import {scoreLearningEvidence} from '../app/lib/learning-evidence.mjs';
import {auditPlan} from '../scripts/lib/diagnostic-oracle.mjs';

const cases=[
  {form:'temiruDesirePast',item:{domain:'verb',surface:'読む',reading:'よむ',class:'godan'},answer:'読んでみたかった',kana:'よんでみたかった',steps:['読んでみる','読んでみたい','読んでみたかった'],probeForms:['temiru','tai','taiPast']},
  {form:'passiveProgressivePast',item:{domain:'verb',surface:'書く',reading:'かく',class:'godan'},answer:'書かれていた',kana:'かかれていた',steps:['書かれる','書かれている','書かれていた'],probeForms:['passive','teiru','teiruPast']},
  {form:'causativeReceivePast',item:{domain:'verb',surface:'行く',reading:'いく',class:'godan'},answer:'行かせてもらった',kana:'いかせてもらった',steps:['行かせる','行かせてもらう','行かせてもらった'],probeForms:['causative','temorau','temorauPast']},
];
for(const c of cases)test(`${c.form}: independent expected answers, complete explanations, isolated steps and scoring`,()=>{
  assert.equal(conjugate(c.item.surface,c.item.class,c.form),c.answer);
  assert.deepEqual(explainConjugation(c.item.surface,c.item.class,c.form).steps,c.steps);
  const analyze=createAnswerAnalyzer(c.item,c.form);
  assert.equal(analyze(c.answer).kind,'correct');assert.equal(analyze(c.kana).kind,'correct');
  const derived=deriveUnified(c.item,c.form),id=derived.requiredKcIds.find(id=>id.startsWith('compound.chain.'));
  assert.ok(id);assert.equal(derived.requiredKcIds.includes('compound.multi-step'),false);
  const result=analyze('xyz');assert.equal(result.diagnosis,null);
  assert.deepEqual(result.steps.map(step=>step.form),c.probeForms);
  const original=scoreLearningEvidence({byKc:{}},{form:c.form,kcIds:derived.requiredKcIds,correct:true,support:{independent:true,source:'independent'}});
  assert.equal(original.byKc[id].correct,1);
  for(const step of result.steps){
    const r=createAnswerAnalyzer(c.item,step.form,{step})(step.readings[0]);assert.equal(r.kind,'correct');
    const assisted=scoreLearningEvidence({byKc:{}},{form:step.form,kcIds:step.kcIds,correct:true,support:{independent:false,source:'guided'}});
    assert.deepEqual(assisted.byKc,{});assert.equal(assisted.assistedByKc[id],undefined);
  }
  assert.deepEqual(auditPlan(c.item,c.form,buildDiagnosticPlan(c.item,c.form)),[]);
});
test('valid contractions follow their actual class and a retained intermediate skips completed work',()=>{
  assert.ok(acceptedConjugations('行く','godan','causativeReceivePast').includes('行かしてもらった'));
  assert.ok(acceptedConjugations('書く','godan','passiveProgressivePast').includes('書かれてた'));
  const c=cases[0],r=createAnswerAnalyzer(c.item,c.form)('よんでみたい');
  assert.deepEqual(r.steps.map(step=>step.form),['taiPast']);
  assert.ok(r.steps.every(step=>!step.kcIds.some(id=>r.diagnosis.confirmedKcIds.includes(id))));
});

test('supplied long causative keeps its own path and the independent oracle detects a missing middle stage',()=>{
  const c=cases[2],analysis=createAnswerAnalyzer(c.item,c.form)('いかせる');
  const last=analysis.steps.at(-1);
  assert.ok(last.answers.includes('行かせてもらった'));
  assert.ok(!last.answers.includes('行かしてもらった'));
  const plan=buildDiagnosticPlan(cases[0].item,cases[0].form);
  const broken={...plan,nodes:plan.nodes.filter(node=>!node.ruleKcIds.includes('construction.tai'))};
  assert.ok(auditPlan(cases[0].item,cases[0].form,broken).length>0);
});
