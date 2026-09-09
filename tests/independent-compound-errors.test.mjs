import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { deriveUnified, unifiedDiagnosticSteps } from '../app/lib/unified-knowledge.mjs';
import { emptySkillStats, updateKnowledgeStats } from '../app/lib/adaptive.mjs';
import { planDiagnosticTransition } from '../app/lib/diagnostic-session.mjs';

const write = {domain:'verb',class:'godan',surface:'書く',reading:'かく'};
const read = {domain:'verb',class:'godan',surface:'読む',reading:'よむ'};
const eat = {domain:'verb',class:'ichidan',surface:'食べる',reading:'たべる'};
const noisy = {domain:'verb',class:'godan',surface:'騒ぐ',reading:'さわぐ'};
const tailStep = (item, form) => unifiedDiagnosticSteps(item, form).at(-1);
const run = (item, form, input, step=tailStep(item,form)) => createAnswerAnalyzer(item,form,{step})(input);
const empty = ids => Object.fromEntries(ids.map(id=>[id,emptySkillStats()]));

test('supplied てある regularized negative identifies only its exception', () => {
  const form='tearuNegative', step=tailStep(write,form);
  for(const input of ['書いてあらない','かいてあらない']) {
    const r=run(write,form,input,step);
    assert.equal(r.kind,'incorrect');assert.equal(r.diagnosis.kcId,'exception.aru-negative');
    assert.deepEqual(r.diagnosis.confirmedKcIds,[]);assert.deepEqual(r.steps,[]);
    const stats=updateKnowledgeStats(empty(step.kcIds),{kcIds:step.kcIds,correct:false,failedKcId:r.diagnosis.kcId});
    for(const id of step.kcIds)assert.equal(stats[id].attempts,Number(id==='exception.aru-negative'),id);
    assert.equal(createAnswerAnalyzer(write,form)(input).diagnosis?.kcId??null,null,'whole question retains transfer ambiguity');
  }
  for(const input of ['書いてない','かいてない'])assert.equal(run(write,form,input,step).kind,'correct');
});

test('ある exception diagnosis requires the entire supplied prefix and exact simple-negative tail', () => {
  for(const input of ['さいてあらない','書きてあらない','かいてあらないない','かいてあらなかった']) {
    const r=run(write,'tearuNegative',input);
    assert.equal(r.diagnosis?.kcId??null,null,input);
    assert.deepEqual(r.diagnosis?.confirmedKcIds??[],[],input);
  }
  assert.equal(run(write,'tearuNegativePast','かいてあらなかった').diagnosis?.kcId??null,null);
  const noException={...tailStep(write,'tearuNegative'),kcIds:['apply.tearu.continuation']};
  assert.equal(run(write,'tearuNegative','かいてあらない',noException).diagnosis?.kcId??null,null);
});

const negatives = [
  [read,'tagaruNegativePast','よみたがらない',['stem.godan.a','suffix.negative']],
  [read,'teiruNegativePast','読んでいない',['stem.ichidan.drop-ru','suffix.negative']],
  [read,'teiruNegativePast','よんでない',['stem.ichidan.drop-ru','suffix.negative']],
  [eat,'teiruNegativePast','たべてない',['suffix.negative']],
  [write,'tearuNegativePast','かいてない',['exception.aru-negative']],
  [read,'teokuNegativePast','よんでおかない',['stem.godan.a','suffix.negative']],
  [read,'teokuNegativePast','よんどかない',['stem.godan.a','suffix.negative']],
  [write,'teikuNegativePast','かいていかない',['stem.godan.a','suffix.negative']],
  [read,'tekuruNegativePast','よんでこない',['suffix.negative']],
  [read,'youtosuruNegativePast','よもうとしない',['suffix.negative']],
  [read,'teshimauNegativePast','よんじゃわない',['stem.godan.a','stem.godan.u-wa','suffix.negative']],
  [read,'taiNegativePast','よみたくない',['adj.stem.i-ku','adj.suffix.i-negative']],
  [read,'tehoshiiNegativePast','よんでほしくない',['adj.stem.i-ku','adj.suffix.i-negative']],
  [read,'potentialNegativePast','よめない',['stem.ichidan.drop-ru','suffix.negative']],
  [write,'causativePassiveNegativePast','かかされない',['stem.ichidan.drop-ru','suffix.negative']],
  [write,'causativeNegativePast','かかせない',['stem.ichidan.drop-ru','suffix.negative']],
  [noisy,'passiveDesireNegativePast','さわがれたくない',['adj.stem.i-ku','adj.suffix.i-negative']],
];

test('complete negative intermediates confirm only observed in-scope rules then check past once', () => {
  for(const [item,form,input,confirmed] of negatives) {
    const step=tailStep(item,form), r=run(item,form,input,step), context=`${item.surface}/${form}/${input}`;
    assert.equal(r.kind,'incorrect',context);assert.equal(r.diagnosis?.kcId??null,null,context);
    assert.deepEqual(new Set(r.diagnosis?.confirmedKcIds),new Set(confirmed),context);
    assert.equal(r.steps.length,1,context);assert.equal(r.steps[0].kind,'atomic',context);
    assert.deepEqual(r.steps[0].kcIds,['adj.suffix.i-past'],context);
    assert.ok(r.steps[0].reading.endsWith('ない'),context);
    assert.match(r.diagnosis.message,/剩余的过去/);
    assert.ok(!r.diagnosis.confirmedKcIds.some(id=>/^(apply|facet|class|heuristic|compound)\./.test(id)),context);
    const followup=r.steps[0];
    assert.equal(run(item,form,followup.readings[0],followup).kind,'correct',context);
    const stopped=run(item,form,followup.reading,followup);
    assert.equal(stopped.diagnosis?.kcId,'adj.suffix.i-past',context);assert.deepEqual(stopped.steps,[],context);
    for(const answer of [...step.answers,...step.readings])assert.equal(run(item,form,answer,step).kind,'correct',context);
  }
});

test('observed negative evidence and its final past probe cannot count a rule twice', () => {
  for(const [item,form,input,confirmed] of negatives) {
    const step=tailStep(item,form), analysis=run(item,form,input,step);
    let stats=empty(step.kcIds);
    const transition=planDiagnosticTransition([step],0,analysis);
    assert.deepEqual(new Set(transition.writes),new Set(confirmed));
    stats=updateKnowledgeStats(stats,{kcIds:transition.assessed.kcIds,correct:false,
      failedKcId:analysis.diagnosis.kcId,confirmedKcIds:analysis.diagnosis.confirmedKcIds});
    const leaf=transition.followups[0], answer=run(item,form,leaf.readings[0],leaf);
    const next=planDiagnosticTransition(transition.nextSteps,1,answer,transition.evaluated,transition.examined);
    assert.deepEqual(next.writes,['adj.suffix.i-past']);
    stats=updateKnowledgeStats(stats,{kcIds:next.assessed.kcIds,correct:true});
    const expected=new Set([...confirmed,'adj.suffix.i-past']);
    for(const id of step.kcIds)assert.equal(stats[id].attempts,Number(expected.has(id)),`${form}/${id}`);
    assert.deepEqual(planDiagnosticTransition(next.nextSteps,1,answer,next.evaluated,next.examined).writes,[]);
  }
});

test('incomplete or damaged prefixes cannot establish a complete negative', () => {
  for(const [item,form,input] of [
    [read,'tagaruNegativePast','のみたがらない'],
    [read,'tagaruNegativePast','よみたがりない'],
    [read,'teiruNegativePast','よみでない'],
    [read,'teokuNegativePast','よむどかない'],
    [noisy,'passiveDesireNegativePast','さばがれたくない'],
    [noisy,'passiveDesireNegativePast','さわがれたくな'],
  ]) {
    const r=run(item,form,input);
    assert.deepEqual(r.diagnosis?.confirmedKcIds??[],[],input);
    assert.doesNotMatch(r.diagnosis?.message??'',/已写对给定形式的否定/);
  }
});

test('short causative alternatives cannot replace the supplied long base for observed-negative evidence', () => {
  const form='causativeNegativePast', step=tailStep(write,form);
  assert.ok(step.providedAnswers.every(base=>base.endsWith('る')));
  const r=run(write,form,'かかさない',step);
  assert.equal(r.kind,'incorrect');assert.equal(r.diagnosis?.kcId??null,null);
  assert.deepEqual(r.diagnosis?.confirmedKcIds??[],[]);
  assert.ok(r.steps.length);
  assert.equal(createAnswerAnalyzer(write,form)('かかさなかった').kind,'correct');
});

test('scope filtering never restores already assessed rules or penalizes whole-question application', () => {
  const form='tagaruNegativePast', original=tailStep(read,form);
  const step={...original,kcIds:['suffix.negative','adj.suffix.i-past','apply.tagaru.continuation']};
  const r=run(read,form,'よみたがらない',step);
  assert.deepEqual(r.diagnosis.confirmedKcIds,['suffix.negative']);assert.deepEqual(r.steps[0].kcIds,['adj.suffix.i-past']);
  for(const [item,target,input] of negatives) {
    const whole=createAnswerAnalyzer(item,target)(input);
    assert.equal(whole.diagnosis?.kcId??null,null,`${target} whole`);
    assert.ok(!(whole.diagnosis?.confirmedKcIds??[]).some(id=>/^(apply|facet|class|heuristic|compound)\./.test(id)));
    const targetScope=deriveUnified(item,target).requiredKcIds;
    for(const probe of whole.steps)assert.ok(probe.kcIds.every(id=>targetScope.includes(id)));
  }
});
