import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { buildDiagnosticPlan, atomicSteps } from '../app/lib/diagnostic-plan.mjs';
import { diagnosePassiveStageError } from '../app/lib/passive-stage-diagnosis.mjs';
import { catalogKeys, messageAt, messageParameters } from '../app/lib/i18n/catalogs.mjs';
import { DIAGNOSTIC_CATALOGS, formatDiagnosticMessage } from '../app/lib/i18n/diagnostics.mjs';

const write={domain:'verb',surface:'書く',reading:'かく',class:'godan'};

test('diagnostic catalogs have identical keys and interpolation parameters',()=>{
  const zhKeys=catalogKeys(DIAGNOSTIC_CATALOGS['zh-CN']);
  const enKeys=catalogKeys(DIAGNOSTIC_CATALOGS.en);
  assert.deepEqual(enKeys,zhKeys);
  for(const key of zhKeys)assert.deepEqual(
    messageParameters(messageAt(DIAGNOSTIC_CATALOGS.en,key)),
    messageParameters(messageAt(DIAGNOSTIC_CATALOGS['zh-CN'],key)),key);
});

test('answer analysis keeps Chinese copy and adds stable message payloads',()=>{
  const analyze=createAnswerAnalyzer(write,'past');
  for(const [answer,key,copy] of [
    ['', 'diagnostics.answer.invalid.empty','请输入答案后再检查。'],
    ['あ'.repeat(257),'diagnostics.answer.invalid.tooLong','输入过长，请只填写活用后的词形（最多 256 个字符）。'],
  ]){
    const feedback=analyze(answer).feedback;
    assert.equal(feedback.messageKey,key);
    assert.deepEqual(feedback.params,{});
    assert.equal(feedback.message,copy);
    assert.equal(formatDiagnosticMessage(key,feedback.params,'zh-CN'),copy);
    assert.doesNotMatch(formatDiagnosticMessage(key,feedback.params,'en'),/[\u3400-\u9fff]/u);
  }
});

test('atomic instructions expose translatable descriptors without changing their Chinese fields',()=>{
  const plan=buildDiagnosticPlan({domain:'verb',surface:'売る',reading:'うる',class:'godan'},'passive');
  const step=atomicSteps(plan,'passive',['stem.godan.a','suffix.passive']).find(value=>value.reading==='うら');
  assert.ok(step?.i18n);
  for(const field of ['goalLabel','stepTitle','targetLabel','prompt','note']){
    const descriptor=step.i18n[field];
    assert.equal(formatDiagnosticMessage(descriptor.messageKey,descriptor.params,'zh-CN'),step[field]);
    const english=formatDiagnosticMessage(descriptor.messageKey,descriptor.params,'en');
    assert.ok(english.length,field);
    assert.doesNotMatch(english.replaceAll('売る',''),/[\u3400-\u9fff]/u,`${field}: ${english}`);
  }
});

test('stage diagnoses include stable keys and an English rendering',()=>{
  const item={domain:'verb',surface:'騒ぐ',reading:'さわぐ',class:'godan'};
  const diagnosis=diagnosePassiveStageError(item,'passiveDesireNegativePast','さわぎられたくなかった');
  assert.equal(diagnosis.messageKey,'diagnostics.passive.ambiguousConstruction');
  assert.deepEqual(diagnosis.params,{});
  assert.equal(formatDiagnosticMessage(diagnosis.messageKey,diagnosis.params,'zh-CN'),diagnosis.message);
  assert.doesNotMatch(formatDiagnosticMessage(diagnosis.messageKey,diagnosis.params,'en'),/[\u3400-\u9fff]/u);
});

test('legacy rule copy stays exact in Chinese and has a locale-safe English summary',()=>{
  const analysis=createAnswerAnalyzer(write,'past')('かきた');
  assert.equal(analysis.kind,'incorrect');
  assert.ok(analysis.feedback.messageKey);
  assert.equal(formatDiagnosticMessage(analysis.feedback.messageKey,analysis.feedback.params,'zh-CN'),analysis.feedback.message);
  assert.doesNotMatch(formatDiagnosticMessage(analysis.feedback.messageKey,analysis.feedback.params,'en'),/[\u3400-\u9fff]/u);
});

test('recognized forms render from stable form IDs in English',()=>{
  const sit={domain:'verb',surface:'座る',reading:'すわる',class:'godan'};
  const analysis=createAnswerAnalyzer(sit,'negativePast')('すわりませんでした');
  assert.equal(analysis.feedback.resolution,'target-form');
  const english=formatDiagnosticMessage(analysis.feedback.messageKey,analysis.feedback.params,'en');
  assert.match(english,/polite negative past/i);
  assert.match(english,/plain negative past/i);
  assert.doesNotMatch(english,/[\u3400-\u9fff]/u);
});
