import assert from 'node:assert/strict';
import test from 'node:test';
import {createAnswerAnalyzer} from '../app/lib/answer-analysis.mjs';
import {deriveUnified} from '../app/lib/unified-knowledge.mjs';
import {emptySkillStats,updateKnowledgeStats} from '../app/lib/adaptive.mjs';

const comfortable={domain:'adjective',class:'na',surface:'快適',reading:'かいてき',iiFamily:false};
const form='adjectiveNaPast';

test('the reported suffix voicing swap identifies only the na-adjective past connection',()=>{
  for(const input of ['かいてきたっだ','快適たっだ',' かいてきたっだ。 ']) {
    const result=createAnswerAnalyzer(comfortable,form)(input);
    assert.equal(result.kind,'incorrect');
    assert.equal(result.diagnosis?.kcId,'adj.suffix.na-past');
    assert.deepEqual(result.diagnosis.confirmedKcIds,[]);
    assert.deepEqual(result.steps,[]);
    assert.match(result.diagnosis.message,/「たっだ」.*「だった」/);
    for(const hintUsed of [false,true]) {
      const kcIds=deriveUnified(comfortable,form).requiredKcIds;
      const before=Object.fromEntries([...kcIds,'onbin.voicing','adj.suffix.i-past'].map(id=>[id,{...emptySkillStats(),attempts:5,correct:5,filteredAccuracy:1}]));
      const after=updateKnowledgeStats(before,{kcIds,focusId:'adj.class.na',failedKcId:result.diagnosis.kcId,confirmedKcIds:result.diagnosis.confirmedKcIds,correct:false,hintUsed});
      assert.equal(after['adj.suffix.na-past'].attempts,6);
      assert.equal(after['adj.suffix.na-past'].correct,5);
      assert.equal(after['adj.suffix.na-past'].filteredAccuracy,.8);
      assert.deepEqual(Object.keys(after).filter(id=>JSON.stringify(after[id])!==JSON.stringify(before[id])),['adj.suffix.na-past']);
    }
  }
});

test('both voicing positions are checked across na-adjective words and writings',()=>{
  for(const item of [comfortable,
    {...comfortable,surface:'静か',reading:'しずか'},
    {...comfortable,surface:'きれい',reading:'きれい'},
    {...comfortable,surface:'嫌い',reading:'きらい'},
  ])for(const base of new Set([item.surface,item.reading]))for(const ending of ['たっだ','たった','だっだ']) {
    const result=createAnswerAnalyzer(item,form)(base+ending);
    assert.equal(result.diagnosis?.kcId,'adj.suffix.na-past',base+ending);
    assert.deepEqual(result.diagnosis.confirmedKcIds,[]);
  }
});

test('damaged words, extra endings and unrelated target forms are not diagnosed by suffix similarity',()=>{
  for(const input of ['かいてけたっだ','かいてたっだ','快適たっだた','かいてきたっだたっだ','かいてきたっだった']) {
    const result=createAnswerAnalyzer(comfortable,form)(input);
    assert.equal(result.kind,'incorrect',input);
    assert.equal(result.diagnosis,null,input);
  }
  for(const otherForm of ['adjectiveNaNegative','adjectiveNaNegativePast','adjectiveNaTe','adjectiveBa','adjectiveAdverb']) {
    const result=createAnswerAnalyzer(comfortable,otherForm)('かいてきたっだ');
    assert.equal(result.diagnosis,null,otherForm);
  }
  const white={domain:'adjective',class:'i',surface:'白い',reading:'しろい',iiFamily:false};
  assert.equal(createAnswerAnalyzer(white,'adjectivePast')('しろいたっだ').diagnosis,null);
  const read={domain:'verb',class:'godan',surface:'読む',reading:'よむ'};
  assert.equal(createAnswerAnalyzer(read,'taiPast')('よみたいたっだ').diagnosis,null);
});

test('valid answers and existing class/form diagnoses keep their meaning',()=>{
  const analyze=createAnswerAnalyzer(comfortable,form);
  for(const answer of ['快適だった','かいてきだった'])assert.equal(analyze(answer).kind,'correct');
  assert.equal(analyze('かいてきかった').diagnosis?.kcId,'adj.class.na');
  assert.equal(analyze('かいてきではない').diagnosis?.kcId,'adj.suffix.na-past');
  assert.equal(analyze('かいてきだっ').diagnosis?.kcId,'adj.suffix.na-past');
});
