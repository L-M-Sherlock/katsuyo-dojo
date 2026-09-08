import assert from 'node:assert/strict';
import test from 'node:test';
import {createAnswerAnalyzer} from '../app/lib/answer-analysis.mjs';
import {deriveUnified,unifiedDiagnosticSteps} from '../app/lib/unified-knowledge.mjs';
import {updateKnowledgeStats,emptySkillStats} from '../app/lib/adaptive.mjs';

const white={domain:'adjective',surface:'白い',reading:'しろい',class:'i',iiFamily:false};
const reading={domain:'verb',surface:'読む',reading:'よむ',class:'godan'};
const sorted=ids=>[...ids].sort();

test('the reported dictionary-form plus ta fails only the adjective past connection',()=>{
  for(const input of ['しろいた','白いた','しろいかった',' 白いかった。 ']) {
    const result=createAnswerAnalyzer(white,'adjectivePast')(input);
    assert.equal(result.kind,'incorrect');
    assert.equal(result.diagnosis?.kcId,'adj.suffix.i-past',input);
    assert.deepEqual(result.diagnosis.confirmedKcIds,[]);
    assert.equal(result.steps.length,0);
    assert.match(result.diagnosis.message,/「い」.*「かった」/);
    for(const hintUsed of [false,true]) {
      const kcIds=deriveUnified(white,'adjectivePast').requiredKcIds;
      const before=Object.fromEntries([...kcIds,'adj.suffix.i-negative'].map(id=>[id,{...emptySkillStats(),attempts:5,correct:5,filteredAccuracy:1}]));
      const after=updateKnowledgeStats(before,{kcIds,focusId:'adj.class.i',failedKcId:result.diagnosis.kcId,confirmedKcIds:[],correct:false,hintUsed});
      assert.equal(after['adj.suffix.i-past'].attempts,6);
      assert.equal(after['adj.suffix.i-past'].correct,5);
      assert.equal(after['adj.suffix.i-past'].filteredAccuracy,.8);
      assert.deepEqual(after['adj.class.i'],before['adj.class.i']);
      assert.deepEqual(after['adj.suffix.i-negative'],before['adj.suffix.i-negative']);
    }
  }
});

test('retained i in ku-based forms identifies the stem, not the already present suffix',()=>{
  for(const [form,inputs] of [
    ['adjectiveNegative',['白いない','しろいくない']],
    ['adjectiveTe',['白いて','しろいくて']],
    ['adjectiveAdverb',['白いく','しろいく']],
    ['adjectiveNegativePast',['白いなかった','しろいくなかった']],
  ])for(const input of inputs) {
    const result=createAnswerAnalyzer(white,form)(input);
    assert.equal(result.diagnosis?.kcId,'adj.stem.i-ku',`${form}: ${input}`);
    assert.deepEqual(result.diagnosis.confirmedKcIds,[]);
    assert.equal(result.steps.length,0);
  }
  for(const input of ['白いば','しろいければ']) {
    assert.equal(createAnswerAnalyzer(white,'adjectiveBa')(input).diagnosis?.kcId,'adj.suffix.i-ba');
  }
});

test('lexical damage, different malformed tails and ii exceptions are not swallowed by the new patterns',()=>{
  for(const [form,input] of [
    ['adjectivePast','しるいた'],['adjectivePast','白いたxyz'],['adjectivePast','白いかた'],
    ['adjectiveNegative','しるいない'],['adjectiveNegativePast','白くないた'],
    ['adjectiveNegativePast','白いかった'],['adjectiveNegativePast','白いくない'],
  ]) {
    const result=createAnswerAnalyzer(white,form)(input);
    assert.equal(result.diagnosis?.kcId??null,null,`${form}: ${input}`);
    assert.deepEqual(result.diagnosis?.confirmedKcIds??[],[]);
  }
  for(const item of [
    {domain:'adjective',surface:'いい',reading:'いい',class:'i',iiFamily:true},
    {domain:'adjective',surface:'かっこいい',reading:'かっこいい',class:'i',iiFamily:true},
  ])for(const [form,tail] of [['adjectivePast','た'],['adjectivePast','かった'],['adjectiveNegative','くない'],['adjectiveNegativePast','くなかった']]) {
    const result=createAnswerAnalyzer(item,form)(item.surface+tail);
    assert.equal(result.diagnosis?.kcId??null,null,item.surface+tail);
    assert.deepEqual(result.diagnosis?.confirmedKcIds??[],[]);
  }
});

test('valid forms, na-class misuse and the established ii regularization keep their own behavior',()=>{
  assert.equal(createAnswerAnalyzer(white,'adjectivePast')('しろかった').kind,'correct');
  assert.equal(createAnswerAnalyzer(white,'adjectivePast')('白いだった').diagnosis?.kcId,'adj.class.i');
  assert.equal(createAnswerAnalyzer(white,'adjectiveNegative')('白いではない').diagnosis?.kcId,'adj.class.i');
  const ii={domain:'adjective',surface:'いい',reading:'いい',class:'i',iiFamily:true};
  assert.equal(createAnswerAnalyzer(ii,'adjectivePast')('いかった').diagnosis?.kcId,'adj.exception.ii-yo');
});

test('derived i-adjective errors are localized only after the correct base has been supplied',()=>{
  for(const [form,input,failed] of [
    ['taiPast','読みたいた','adj.suffix.i-past'],
    ['taiPast','よみたいかった','adj.suffix.i-past'],
    ['tehoshiiPast','読んでほしいた','adj.suffix.i-past'],
    ['taiNegative','よみたいない','adj.stem.i-ku'],
    ['taiNegativePast','読みたいくなかった','adj.stem.i-ku'],
  ]) {
    const whole=createAnswerAnalyzer(reading,form)(input);
    assert.equal(whole.diagnosis?.kcId??null,null,input);
    assert.ok(whole.steps.length>0);
    const tail=unifiedDiagnosticSteps(reading,form).at(-1);
    const result=createAnswerAnalyzer(reading,form,{step:tail})(input);
    assert.equal(result.diagnosis?.kcId,failed,`${form}: supplied base`);
    assert.deepEqual(result.diagnosis.confirmedKcIds,[]);
    assert.ok(tail.kcIds.includes(failed));
  }
});

test('provided negative past probes use the supplied nai form regardless of the original domain or ii exception',()=>{
  for(const [item,form] of [
    [reading,'negativePast'],[white,'adjectiveNegativePast'],
    [{domain:'adjective',surface:'いい',reading:'いい',class:'i',iiFamily:true},'adjectiveNegativePast'],
    [{domain:'adjective',surface:'静か',reading:'しずか',class:'na'},'adjectiveNaNegativePast'],
  ]) {
    const step=unifiedDiagnosticSteps(item,form).at(-1);
    for(const base of step.providedAnswers)for(const tail of ['た','かった']) {
      const result=createAnswerAnalyzer(item,form,{step})(base+tail);
      assert.equal(result.diagnosis?.kcId,'adj.suffix.i-past',base+tail);
      assert.deepEqual(result.diagnosis.confirmedKcIds,[]);
    }
  }
});

test('a supplied ku stem does not allow a new failure outside the current step',()=>{
  const [step]=createAnswerAnalyzer(white,'adjectiveNegativePast')('白く').steps;
  assert.deepEqual(sorted(step.kcIds),['adj.suffix.i-negative']);
  const result=createAnswerAnalyzer(white,step.form,{step})('白いない');
  assert.equal(result.diagnosis,null);
});
