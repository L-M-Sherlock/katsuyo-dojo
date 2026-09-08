import assert from 'node:assert/strict';
import test from 'node:test';
import {createAnswerAnalyzer} from '../app/lib/answer-analysis.mjs';
import {deriveUnified,unifiedDiagnosticSteps} from '../app/lib/unified-knowledge.mjs';
import {emptySkillStats,updateKnowledgeStats} from '../app/lib/adaptive.mjs';

const happy={domain:'adjective',class:'na',surface:'幸せ',reading:'しあわせ',iiFamily:false};

test('the reported nai-only negative fails the na connection without class evidence',()=>{
  const form='adjectiveNaNegative';
  for(const input of ['幸せない','しあわせない',' しあわせない。 ']) {
    const result=createAnswerAnalyzer(happy,form)(input);
    assert.equal(result.kind,'incorrect');
    assert.equal(result.diagnosis?.kcId,'adj.suffix.na-negative');
    assert.deepEqual(result.diagnosis.confirmedKcIds,[]);
    assert.deepEqual(result.steps,[]);
    assert.match(result.diagnosis.message,/否定形接续不完整.*ではない/);
    for(const hintUsed of [false,true]) {
      const kcIds=deriveUnified(happy,form).requiredKcIds;
      const before=Object.fromEntries([...kcIds,'adj.suffix.i-negative','adj.suffix.na-past'].map(id=>[id,{...emptySkillStats(),attempts:5,correct:5,filteredAccuracy:1}]));
      const after=updateKnowledgeStats(before,{kcIds,focusId:'adj.class.na',failedKcId:result.diagnosis.kcId,confirmedKcIds:[],correct:false,hintUsed});
      assert.deepEqual(Object.keys(after).filter(id=>JSON.stringify(after[id])!==JSON.stringify(before[id])),['adj.suffix.na-negative']);
      assert.equal(after['adj.suffix.na-negative'].filteredAccuracy,.8);
    }
  }
});

test('omissions at the beginning, middle, end and entire simple na suffix are covered',()=>{
  for(const [form,tails,failed] of [
    ['adjectiveNaNegative',['ない','では','ではな','じゃい','じない',''],'adj.suffix.na-negative'],
    ['adjectiveNaPast',['った','た','だた','だっ',''],'adj.suffix.na-past'],
    ['adjectiveBa',['らば','なば','であれ',''],'adj.suffix.na-conditional'],
    ['adjectiveAttributive',[''],'adj.suffix.na-attributive'],
    ['adjectivePredicative',[''],'adj.suffix.na-predicative'],
    ['adjectiveNaTe',[''],'adj.suffix.na-te'],
    ['adjectiveAdverb',[''],'adj.suffix.na-adverb'],
  ])for(const tail of tails) {
    const result=createAnswerAnalyzer(happy,form)(happy.reading+tail);
    assert.equal(result.diagnosis?.kcId,failed,`${form}: ${tail}`);
    assert.deepEqual(result.diagnosis.confirmedKcIds,[]);
  }
});

test('denai and denakatta are accepted in whole answers and supplied-base practice',()=>{
  for(const item of [happy,{...happy,surface:'きれい',reading:'きれい'},{...happy,surface:'嫌い',reading:'きらい'}]) {
    for(const [form,tail] of [['adjectiveNaNegative','でない'],['adjectiveNaNegativePast','でなかった']]) {
      for(const base of new Set([item.surface,item.reading]))assert.equal(createAnswerAnalyzer(item,form)(base+tail).kind,'correct');
    }
    const partial=createAnswerAnalyzer(item,'adjectiveNaNegativePast')(item.reading+'でない');
    assert.equal(partial.diagnosis?.kcId,null);
    assert.deepEqual(partial.diagnosis.confirmedKcIds,['adj.suffix.na-negative']);
    assert.equal(partial.steps.length,1);
    const result=createAnswerAnalyzer(item,'adjectiveNaNegativePast',{step:partial.steps[0]})(item.reading+'でなかった');
    assert.equal(result.kind,'correct');
    const steps=unifiedDiagnosticSteps(item,'adjectiveNaNegativePast');
    assert.equal(createAnswerAnalyzer(item,steps[0].form,{step:steps[0]})(item.reading+'でない').kind,'correct');
    assert.equal(createAnswerAnalyzer(item,steps[1].form,{step:steps[1]})(item.reading+'でないた').diagnosis?.kcId,'adj.suffix.i-past');
  }
});

test('legitimate shorter conditionals and existing specific diagnoses keep precedence',()=>{
  for(const tail of ['なら','ならば','であれば'])assert.equal(createAnswerAnalyzer(happy,'adjectiveBa')(happy.reading+tail).kind,'correct');
  assert.match(createAnswerAnalyzer(happy,'adjectiveNaNegative')('しあわせで').diagnosis.message,/て形/);
  assert.equal(createAnswerAnalyzer(happy,'adjectiveNaNegative')('しあわせくない').diagnosis?.kcId,'adj.class.na');
  assert.match(createAnswerAnalyzer(happy,'adjectiveNaPast')('しあわせたっだ').diagnosis.message,/接续部分写成了/);
});

test('root damage, multiple edits and negative-past do not borrow the simple suffix rule',()=>{
  for(const input of ['しあわぜない','しあわない','幸せないない','しあわせなxい'])assert.equal(createAnswerAnalyzer(happy,'adjectiveNaNegative')(input).diagnosis,null,input);
  for(const input of ['しあわせなかった','しあわせではなかた']) {
    const result=createAnswerAnalyzer(happy,'adjectiveNaNegativePast')(input);
    assert.equal(result.diagnosis?.kcId??null,null,input);
    assert.ok(result.steps.length>0);
  }
  const white={domain:'adjective',class:'i',surface:'白い',reading:'しろい',iiFamily:false};
  assert.equal(createAnswerAnalyzer(white,'adjectiveNegative')('しろない').diagnosis?.kcId,'adj.stem.i-ku');
});
