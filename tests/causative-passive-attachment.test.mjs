import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnswerAnalyzer,normalizeAnswer} from '../app/lib/answer-analysis.mjs';
import {deriveUnified,unifiedDiagnosticSteps} from '../app/lib/unified-knowledge.mjs';
import {scoreLearningEvidence} from '../app/lib/learning-evidence.mjs';
import {generateCommonErrorCases} from '../scripts/lib/common-error-patterns.mjs';

const words=[['買う','かう','買わ','かわ'],['書く','かく','書か','かか'],['泳ぐ','およぐ','泳が','およが'],['話す','はなす','話さ','はなさ'],['待つ','まつ','待た','また'],['死ぬ','しぬ','死な','しな'],['飛ぶ','とぶ','飛ば','とば'],['読む','よむ','読ま','よま'],['取る','とる','取ら','とら']];
const tails={causativePassive:'させられる',causativePassivePast:'させられた',causativePassiveNegative:'させられない',causativePassiveNegativePast:'させられなかった'};
const kc='suffix.causativePassive';
for(const [surface,reading,stem,kana] of words)test(`${surface}: intact a-row plus ichidan-style attachment identifies only the causative-passive suffix`,()=>{
  const item={domain:'verb',surface,reading,class:'godan'};
  for(const [form,tail] of Object.entries(tails)) {
    const analyze=createAnswerAnalyzer(item,form),scope=deriveUnified(item,form).requiredKcIds;
    for(const base of [stem,kana]){
      const input=base+tail,result=analyze(input);
      assert.equal(result.diagnosis?.kcId,kc,input);assert.deepEqual(result.diagnosis.confirmedKcIds,[]);
      assert.equal(result.steps.length,0);assert.match(result.feedback.message,/ア段词干.*已正确.*多了一个「さ」/);
      const scored=scoreLearningEvidence({byKc:{}},{form,kcIds:scope,correct:false,failedKcId:result.diagnosis.kcId,support:{independent:true,source:'independent'}});
      assert.deepEqual(Object.keys(scored.byKc),[kc]);assert.equal(scored.byKc[kc].correct,0);
      const generated=generateCommonErrorCases(item,form).cases.find(c=>normalizeAnswer(c.input)===normalizeAnswer(input));
      assert.equal(generated?.expected.failed,kc);
    }
    const correct=stem+tail.slice(1);assert.equal(analyze(correct).kind,'correct');
  }
});
test('reported guided step records an assisted suffix failure without repeating the a-row check',()=>{
  const item={domain:'verb',surface:'飛ぶ',reading:'とぶ',class:'godan'};
  const step=unifiedDiagnosticSteps(item,'causativePassiveNegativePast')[0];
  const r=createAnswerAnalyzer(item,step.form,{step})('とばさせられる');
  assert.equal(r.diagnosis.kcId,kc);assert.deepEqual(r.steps,[]);
  const scored=scoreLearningEvidence({byKc:{}},{form:step.form,kcIds:step.kcIds,correct:false,failedKcId:r.diagnosis.kcId,support:{independent:false,source:'guided'}});
  assert.deepEqual(scored.byKc,{});assert.deepEqual(Object.keys(scored.assistedByKc),[kc]);
});
test('mixed stem, vocabulary or ending errors and a separate contraction requirement are not forced into this diagnosis',()=>{
  const item={domain:'verb',surface:'飛ぶ',reading:'とぶ',class:'godan'};
  for(const [form,input] of [['causativePassive','とびさせられる'],['causativePassive','ととばさせられる'],['causativePassiveNegativePast','とばさせられなっかった'],['causativePassiveContracted','とばさせられる']])assert.notEqual(createAnswerAnalyzer(item,form)(input).diagnosis?.kcId,kc,input);
  for(const other of [{domain:'verb',surface:'食べる',reading:'たべる',class:'ichidan'},{domain:'verb',surface:'来る',reading:'くる',class:'irregular'}]){
    const correct=deriveUnified(other,'causativePassiveNegativePast').answer;
    assert.equal(createAnswerAnalyzer(other,'causativePassiveNegativePast')(correct).kind,'correct');
  }
});
