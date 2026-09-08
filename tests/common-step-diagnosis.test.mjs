import { assertGenericOrTerminal } from './helpers/diagnosis-assertions.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { unifiedDiagnosticSteps } from '../app/lib/unified-knowledge.mjs';

const write={domain:'verb',class:'godan',surface:'書く',reading:'かく'};
test('new local suffix edits become attributable in a supplied base without grading source atoms',()=>{
  for(const [form,input,failed] of [
    ['taiPast','かきたかた','adj.suffix.i-past'],
    ['teageruPast','かいてあげたた','suffix.past'],
    ['tekuruNegative','かいてきない','suffix.negative'],
    ['teikuPast','かいていったた','suffix.past'],
  ]) {
    const step=unifiedDiagnosticSteps(write,form).at(-1);
    const result=createAnswerAnalyzer(write,form,{step})(input);
    assert.equal(result.kind,'incorrect',input);
    assert.equal(result.diagnosis?.kcId,failed,input);
    assert.deepEqual(result.diagnosis.confirmedKcIds,[],input);
    assert.equal(createAnswerAnalyzer(write,form)(input).diagnosis?.kcId??null,null,`${input} whole`);
  }
});

test('a long causative probe cannot silently interpret a short godan base as ichidan',()=>{
  for(const [form,input] of [['causativePast','書かだ'],['causativePast','書かたた'],['causativeNegative','書かないい']]) {
    const step=unifiedDiagnosticSteps(write,form).at(-1);
    assert.ok(step.providedAnswers.every(base=>base.endsWith('る')));
    assert.equal(createAnswerAnalyzer(write,form,{step})(input).diagnosis,null,input);
  }
  const step=unifiedDiagnosticSteps(write,'causativePast').at(-1);
  assert.equal(createAnswerAnalyzer(write,'causativePast',{step})('かかせたた').diagnosis?.kcId,'suffix.past');
  assert.equal(createAnswerAnalyzer(write,'causativePast',{step})('かかせた').kind,'correct');
});

test('a provided base exposes regular class ambiguity without erasing special-tail protection',()=>{
  for(const [form,input] of [['teageruPast','書いてあげった'],['teiruPast','書いていった'],['teikuPast','かいていた']]) {
    const step=unifiedDiagnosticSteps(write,form).at(-1);
    const result=createAnswerAnalyzer(write,form,{step})(input);
    assert.equal(result.diagnosis?.kcId??null,null,input);
    assert.deepEqual(result.diagnosis?.confirmedKcIds??[],[],input);
    if(form==='teikuPast')assertGenericOrTerminal(result,step.kcIds);else assert.equal(result.steps.length,2,input);
    if(form==='teikuPast')assert.equal(result.diagnosis,null,input);
    else assert.equal(result.diagnosis.stage.form,'past',input);
  }
  assert.ok(unifiedDiagnosticSteps(write,'teikuPast').at(-1).providedAnswers.every(base=>base.endsWith('いく')));
});
