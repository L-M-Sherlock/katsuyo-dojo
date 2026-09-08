import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { updateKnowledgeStats } from '../app/lib/adaptive.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';

const verb = { domain:'verb', surface:'書く', reading:'かく', class:'godan' };
const sorted = values => [...values].sort();

test('a completed stem and one missing suffix identify exactly the missing rule', () => {
  for (const [form, answers, failed, confirmed] of [
    ['masu', ['書き','かき','書きま'], 'suffix.masu', ['stem.godan.i']],
    ['nasai', ['書き','かき','書きなさ'], 'suffix.nasai', ['stem.godan.i']],
    ['naide', ['書かない','かかない'], 'construction.naide', ['stem.godan.a','suffix.negative']],
    ['masenka', ['書きます','かきます'], 'construction.masenka', ['stem.godan.i','suffix.masu']],
    ['teiru', ['書いて','かいて','書いてい'], 'construction.teiru', ['onbin.i','suffix.te']],
  ]) for (const answer of answers) {
    const result = createAnswerAnalyzer(verb,form)(answer);
    assert.equal(result.kind,'incorrect',answer);
    assert.equal(result.diagnosis?.kcId,failed,`${form}: ${answer}`);
    assert.deepEqual(sorted(result.diagnosis.confirmedKcIds),sorted(confirmed),answer);
    assert.equal(result.steps.length,0);
  }
});

test('multiple remaining rules credit completed transformations and supply only remaining work', () => {
  for (const [form, answer, confirmed, remaining] of [
    ['nakute','書かない',['stem.godan.a','suffix.negative'],1],
    ['naideKudasai','書かない',['stem.godan.a','suffix.negative'],1],
    ['toru','書いて',['onbin.i','suffix.te'],1],
    ['toku','書いて',['onbin.i','suffix.te'],1],
    ['chau','書いて',['onbin.i','suffix.te'],1],
    ['masenka','書き',['stem.godan.i'],2],
    ['taiPast','書きたい',['stem.godan.i','construction.tai'],1],
  ]) {
    const result = createAnswerAnalyzer(verb,form)(answer);
    assert.equal(result.kind,'incorrect');
    assert.equal(result.diagnosis?.kcId,null,form);
    assert.deepEqual(sorted(result.diagnosis.confirmedKcIds),sorted(confirmed),form);
    assert.equal(result.steps.length,remaining,form);
    assert.equal(result.steps[0].surface,answer);
    assert.ok(result.steps.every(step=>step.continuation));
    for (const step of result.steps) assert.ok(step.kcIds.every(id=>!confirmed.includes(id)));
    const initial = updateKnowledgeStats({}, {correct:false,kcIds:deriveUnified(verb,form).requiredKcIds,confirmedKcIds:confirmed});
    for (const step of result.steps) {
      const correct = createAnswerAnalyzer(verb,form,{step})(step.answers[0]);
      assert.equal(correct.kind,'correct',`${form}: supplied intermediate`);
      const next = updateKnowledgeStats(initial, {correct:true,kcIds:step.kcIds});
      for (const id of confirmed) assert.deepEqual(next[id],initial[id],`${form}: duplicate ${id}`);
    }
  }
});

test('compound ending alternatives and truncated roots do not prove a completed operation', () => {
  for (const [form, answer] of [
    ['taiPast','書きたくない'], ['masu','書'], ['masu','か'],
    ['masu','書ま'], ['teiru','書いでい'], ['masu','書きますxyz'],
  ]) {
    const result=createAnswerAnalyzer(verb,form)(answer);
    assert.equal(result.diagnosis?.kcId??null,null,`${form}: ${answer}`);
    assert.deepEqual(result.diagnosis?.confirmedKcIds??[],[],`${form}: ${answer}`);
  }
  // The complete connective stem survives; only the requested invitation
  // suffix is truncated. This does not establish any prerequisite mastery.
  const invitation=createAnswerAnalyzer(verb,'masenka')('書きま');
  assert.equal(invitation.diagnosis?.kcId,'construction.masenka');
  assert.deepEqual(invitation.diagnosis.confirmedKcIds,[]);
});

test('correct variants always win over operation-stop and suffix truncation matches', () => {
  for (const [form, answer] of [['teiru','書いてる'],['nasai','書きな'],['potential','書ける']]) {
    const result=createAnswerAnalyzer(verb,form)(answer);
    assert.equal(result.kind,'correct');
    assert.equal(result.diagnosis,null);
  }
});

test('new supplied-stem steps diagnose only their own suffix, including adjective negative-past', () => {
  const adjective={domain:'adjective',surface:'遠い',reading:'とおい',class:'i'};
  const result=createAnswerAnalyzer(adjective,'adjectiveNegativePast')('とおく');
  assert.equal(result.diagnosis.kcId,null);
  assert.deepEqual(result.diagnosis.confirmedKcIds,['adj.stem.i-ku']);
  assert.equal(result.steps.length,2);
  for (const [index, failed] of ['adj.suffix.i-negative','adj.suffix.i-past'].entries()) {
    const step=result.steps[index];
    const repeated=createAnswerAnalyzer(adjective,step.form,{step})(step.surface);
    assert.equal(repeated.diagnosis?.kcId,failed);
    assert.deepEqual(repeated.diagnosis.confirmedKcIds,[]);
    assert.ok(step.kcIds.includes(failed));
    assert.equal(createAnswerAnalyzer(adjective,step.form,{step})(step.answers[0]).kind,'correct');
  }
});

test('accepted contracted intermediate forms receive the same evidence as canonical forms', () => {
  const item={domain:'verb',surface:'読む',reading:'よむ',class:'godan'};
  const result=createAnswerAnalyzer(item,'causativePassivePast')('よまされる');
  assert.equal(result.diagnosis.kcId,null);
  assert.deepEqual(sorted(result.diagnosis.confirmedKcIds),['stem.godan.a','suffix.causativePassive']);
  assert.equal(result.steps.length,1);
  assert.ok(result.steps[0].continuation);
});

test('class exception memory is not credited from reaching an intermediate output', () => {
  const item={domain:'verb',surface:'帰る',reading:'かえる',class:'godan'};
  const result=createAnswerAnalyzer(item,'masu')('かえり');
  assert.equal(result.diagnosis.kcId,'suffix.masu');
  assert.deepEqual(result.diagnosis.confirmedKcIds,['stem.godan.i']);
});

test('provided negative remains a past omission in the unified verb route', () => {
  const [step]=createAnswerAnalyzer(verb,'negativePast')('書かない').steps;
  const result=createAnswerAnalyzer(verb,step.form,{step})('かかない');
  assert.equal(result.diagnosis?.kcId,'adj.suffix.i-past');
  assert.deepEqual(result.diagnosis.confirmedKcIds,[]);
});

test('multilayer continuations ask for complete forms and use the provided intermediate word', () => {
  for (const item of [verb,{domain:'verb',surface:'食べる',reading:'たべる',class:'ichidan'}]) {
    const passive=deriveUnified(item,'passive').answer;
    const result=createAnswerAnalyzer(item,'passiveDesireNegativePast')(passive);
    assert.equal(result.steps.length,2);
    const [desire,past]=result.steps;
    assert.equal(desire.form,'tai');
    assert.equal(desire.analysisItem.surface,passive);
    assert.equal(desire.answers[0],passive.slice(0,-1)+'たい');
    assert.ok(result.steps.every(step=>step.kcIds.length&&step.focusId));
    assert.equal(createAnswerAnalyzer(item,desire.form,{step:desire})(desire.answers[0]).kind,'correct');
    assert.equal(createAnswerAnalyzer(item,desire.form,{step:desire})(passive.slice(0,-1)).diagnosis?.kcId,'construction.tai');
    const repeated=createAnswerAnalyzer(item,past.form,{step:past})(past.surface);
    assert.equal(repeated.diagnosis?.kcId,'adj.compound.i-negative-past');
  }
});

test('short causatives do not establish ichidan continuation in a supplied long-causative step', () => {
  const result=createAnswerAnalyzer(verb,'causativeNegative')('書かす');
  assert.equal(result.steps.length,1);
  const step=result.steps[0];
  assert.equal(createAnswerAnalyzer(verb,'causativeNegative')('書かさない').kind,'correct');
  assert.equal(createAnswerAnalyzer(verb,step.form,{step})('書かさない').kind,'incorrect');
  assert.ok(!step.answers.includes('書かさない'));
  assert.equal(createAnswerAnalyzer(verb,step.form,{step})('書かせない').kind,'correct');
});

test('completed inner negative constructions isolate an omitted outer expression', () => {
  for (const [form, inputs, confirmed] of [
    ['naideKudasai',['書かないで','かかないでくださ'],['stem.godan.a','suffix.negative','construction.naide']],
    ['nakutemoIi',['書かなくて','かかなくてもい'],['stem.godan.a','suffix.negative','adj.stem.i-ku','adj.suffix.i-te','construction.nakute']],
    ['nakutewaIkenai',['書かなくて','かかなくてはいけな'],['stem.godan.a','suffix.negative','adj.stem.i-ku','adj.suffix.i-te']],
    ['nakerebaNaranai',['書かなければ','かかなければならな'],['stem.godan.a','suffix.negative','adj.suffix.i-ba']],
  ]) for (const answer of inputs) {
    const result=createAnswerAnalyzer(verb,form)(answer);
    assert.equal(result.diagnosis?.kcId,`construction.${form}`,answer);
    assert.deepEqual(sorted(result.diagnosis.confirmedKcIds),sorted(confirmed),answer);
  }
});

test('the last invitation and prohibition markers are independent omissions', () => {
  for (const [form,answer,failed,confirmed] of [
    ['masenka','かきません','construction.masenka',['stem.godan.i']],
    ['prohibitive','書く','suffix.prohibitive',[]],
  ]) {
    const result=createAnswerAnalyzer(verb,form)(answer);
    assert.equal(result.diagnosis?.kcId,failed);
    assert.deepEqual(result.diagnosis.confirmedKcIds,confirmed);
  }
});

test('negative ku intermediates establish only performed rules and narrow the remaining te probe', () => {
  const result=createAnswerAnalyzer(verb,'nakute')('かかなく');
  assert.equal(result.diagnosis.kcId,null);
  assert.deepEqual(sorted(result.diagnosis.confirmedKcIds),['adj.stem.i-ku','stem.godan.a','suffix.negative']);
  assert.equal(result.steps.length,1);
  const [step]=result.steps;
  assert.deepEqual(step.kcIds,['adj.suffix.i-te','construction.nakute']);
  const repeated=createAnswerAnalyzer(verb,step.form,{step})('かかなく');
  assert.equal(repeated.diagnosis?.kcId,'adj.suffix.i-te');
  assert.deepEqual(repeated.diagnosis.confirmedKcIds,[]);
});

test('supplied aru has one negative exception, while its negative-past still has two unperformed rules', () => {
  for (const [form,failed] of [['tearuNegative','exception.aru-negative'],['tearuNegativePast',null]]) {
    const [step]=createAnswerAnalyzer(verb,form)('書いてある').steps;
    const repeated=createAnswerAnalyzer(verb,step.form,{step})('書いてある');
    assert.equal(repeated.diagnosis?.kcId??null,failed);
    assert.deepEqual(repeated.diagnosis?.confirmedKcIds??[],[]);
  }
});
