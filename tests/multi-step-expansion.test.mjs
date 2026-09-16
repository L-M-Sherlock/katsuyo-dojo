import { createChallengePlanner } from '../app/lib/challenge-planning.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { CHAIN_FORM_SPECS } from '../app/lib/multi-step-forms.mjs';
import { conjugate, acceptedConjugations, explainConjugation } from '../app/lib/conjugation.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { buildDiagnosticPlan } from '../app/lib/diagnostic-plan.mjs';
import { auditPlan } from '../scripts/lib/diagnostic-oracle.mjs';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { scoreLearningEvidence } from '../app/lib/learning-evidence.mjs';
import { assessmentTarget, emptyAssessment, recordIndependentAttempt, reconcileAssessmentCatalog } from '../app/lib/learning-assessment.mjs';
import { restoreLearningAssessment } from '../app/lib/assessment-transfer.mjs';
import { assignPracticeExercises } from '../app/lib/exercise-selection.mjs';

// Fixed expected strings, independent of the production recipe composition.
const expected = {
  temiruDesire:'読んでみたい', temiruDesirePast:'読んでみたかった', temiruDesireNegative:'読んでみたくない', temiruDesireNegativePast:'読んでみたくなかった',
  passiveProgressive:'読まれている', passiveProgressivePast:'読まれていた', passiveProgressiveNegative:'読まれていない', passiveProgressiveNegativePast:'読まれていなかった',
  causativeReceive:'読ませてもらう', causativeReceivePast:'読ませてもらった',
  temiruRequest:'読んでみてください', temiruTara:'読んでみたら',
  teokuRequest:'読んでおいてください', teokuBa:'読んでおけば', teokuTara:'読んでおいたら', causativeRequest:'読ませてください',
  temorauDesire:'読んでもらいたい', temorauDesirePast:'読んでもらいたかった', temorauDesireNegative:'読んでもらいたくない', temorauDesireNegativePast:'読んでもらいたくなかった',
  temorauPotential:'読んでもらえる', temorauPotentialPast:'読んでもらえた', temorauPotentialNegative:'読んでもらえない', temorauPotentialNegativePast:'読んでもらえなかった', temorauPoliteRequest:'読んでもらえませんか',
  potentialPolite:'読めます', potentialPolitePast:'読めました', potentialPoliteNegative:'読めません', potentialPoliteNegativePast:'読めませんでした',
  desireBa:'読みたければ', sugiruNegativeRequest:'読みすぎないでください',
  passiveCompletion:'読まれてしまう', passiveCompletionPast:'読まれてしまった',
  causativeReceiveDesire:'読ませてもらいたい', causativeReceivePoliteRequest:'読ませてもらえませんか',
  causativeReceivePotential:'読ませてもらえる', causativeReceivePotentialPast:'読ませてもらえた', causativeReceivePotentialNegative:'読ませてもらえない', causativeReceivePotentialNegativePast:'読ませてもらえなかった',
  potentialBa:'読めれば', potentialTara:'読めたら',
};
const item = {domain:'verb',surface:'読む',reading:'よむ',class:'godan'};
const server = await createServer({appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
let page;
try { page = await server.ssrLoadModule('/app/page.tsx'); } finally { await server.close(); }
const model = page.KNOWLEDGE;

test('the expanded course contains 42 curated targets in 17 application families',()=>{
  assert.deepEqual(Object.keys(CHAIN_FORM_SPECS).sort(),Object.keys(expected).sort());
  assert.equal(new Set(Object.values(CHAIN_FORM_SPECS).map(s=>s.kcId)).size,16);
  assert.equal(new Set(model.exercises.filter(e=>e.courseId==='multiStepCompound').map(e=>e.form)).size,42);
});
for(const [form,answer] of Object.entries(expected))test(`${form}: spelling, recognition, full path and guided continuation`,()=>{
  const kana=answer.replace('読','よ'), spec=CHAIN_FORM_SPECS[form];
  assert.equal(conjugate(item.surface,item.class,form),answer);
  assert.equal(conjugate(item.reading,item.class,form),kana);
  assert.equal(explainConjugation(item.surface,item.class,form).steps.at(-1),answer);
  const analyze=createAnswerAnalyzer(item,form);
  assert.equal(analyze(kana).kind,'correct');
  const unknown=analyze('xyz');
  assert.ok(unknown.steps.length>=2, `${form}: missing a continuation`);
  assert.ok(unknown.steps.at(-1).answers.includes(answer));
  for(const step of unknown.steps)assert.equal(createAnswerAnalyzer(item,step.form,{step})(step.readings[0]).kind,'correct');
  assert.deepEqual(auditPlan(item,form,buildDiagnosticPlan(item,form)),[]);
  const ids=deriveUnified(item,form).requiredKcIds;
  assert.ok(ids.includes(spec.kcId)&&ids.includes(spec.facetId));
  const evidence=scoreLearningEvidence({byKc:{}},{form,kcIds:ids,correct:true,support:{independent:true,source:'independent'}});
  assert.equal(evidence.byKc[spec.kcId].correct,1);
  assert.equal(evidence.byKc[spec.facetId].correct,1);
  const guided=scoreLearningEvidence({byKc:{}},{form,kcIds:ids,correct:true,support:{independent:false,source:'guided'}});
  assert.deepEqual(guided.byKc,{});
});

test('derived classes, contractions and deeper chains retain every semantic stage',()=>{
  assert.equal(conjugate('教える','ichidan','temorauPoliteRequest'),'教えてもらえませんか');
  assert.equal(conjugate('行く','godan','causativeReceivePotentialNegativePast'),'行かせてもらえなかった');
  assert.equal(conjugate('する','irregular','potentialPoliteNegativePast'),'できませんでした');
  assert.equal(conjugate('来る','irregular','desireBa'),'来たければ');
  assert.ok(acceptedConjugations('行く','godan','causativeReceivePotentialNegativePast').includes('行かしてもらえなかった'));
  assert.ok(acceptedConjugations('書く','godan','passiveProgressiveNegativePast').includes('書かれてなかった'));
  assert.deepEqual(explainConjugation('教える','ichidan','temorauPoliteRequest').steps,['教えてもらう','教えてもらえる','教えてもらえます','教えてもらえませんか']);
  assert.deepEqual(explainConjugation('行く','godan','causativeReceivePotentialNegativePast').steps,['行かせる','行かせてもらう','行かせてもらえる','行かせてもらえない','行かせてもらえなかった']);
  const desire=deriveUnified(item,'desireBa');
  assert.ok(desire.requiredKcIds.includes('adj.suffix.i-ba'));
  assert.ok(!desire.requiredKcIds.includes('suffix.ba'));
  assert.ok(!desire.requiredKcIds.includes('adj.class.i'));
});

test('common errors inside the new chains are diagnosed and correct other forms are recognized',()=>{
  const wrongSound=createAnswerAnalyzer(item,'teokuRequest')('よんでおってください');
  assert.ok(wrongSound.diagnosis||wrongSound.steps.length);
  const wrongForm=createAnswerAnalyzer(item,'potentialPoliteNegativePast')('よめなかった');
  assert.ok(wrongForm.recognizedForms?.some(match=>match.form==='potentialNegativePast'),JSON.stringify(wrongForm));
  const stopped=createAnswerAnalyzer(item,'temorauPoliteRequest')('よんでもらえる');
  assert.ok(stopped.steps.length);
  assert.ok(stopped.steps.every(step=>step.surface!=='読む'));
});

test('every family has enough natural words, explicit coverage ownership and usable variant pools',()=>{
  for(const [form,spec] of Object.entries(CHAIN_FORM_SPECS)){
    const pool=model.exercises.filter(e=>e.courseId==='multiStepCompound'&&e.form===form);
    assert.ok(new Set(pool.map(e=>e.item.surface)).size>=12,form);
    assert.ok(pool.every(e=>!['いる','できる','降る','要る'].includes(e.item.surface)),form);
    if(spec.context&&form!=='causativeReceivePast')assert.ok(pool.every(e=>e.context?.text),form);
    const parents=model.components.filter(kc=>kc.coverageKcIds.includes(spec.facetId));
    assert.deepEqual(parents.map(kc=>kc.id),[spec.kcId]);
    assert.equal(parents[0].firstCourseId,'multiStepCompound');
    assert.equal(model.components.find(kc=>kc.id===spec.facetId).gating,false);
  }
});

test('overlapping inner and outer facets cannot starve the polite request variant',()=>{
  const focus=model.components.find(kc=>kc.id==='compound.chain.receive-potential');
  const pool=model.exercises.filter(e=>e.courseId==='multiStepCompound'&&e.kcIds.includes(focus.id));
  for(let seed=0;seed<12;seed++){
    const selected=assignPracticeExercises(Array(12).fill(focus),{candidatesFor:()=>pool,alternativesFor:()=>[],seed});
    for(const facet of focus.coverageKcIds)assert.ok(selected.some(({candidate})=>candidate.kcIds.includes(facet)),facet);
  }
});

test('expanding a family preserves historical rule keys and pending retests without granting unseen coverage',()=>{
  const frozen=JSON.parse(readFileSync(new URL('./fixtures/eligibility-baseline.json',import.meta.url)));
  for(const form of ['temiruDesirePast','passiveProgressivePast','causativeReceivePast']){
    const exercise=model.exercises.find(e=>e.form===form), spec=CHAIN_FORM_SPECS[form];
    const old={...exercise,kcIds:exercise.kcIds.filter(id=>!id.startsWith('facet.chain.'))};
    const target=assessmentTarget(old);
    assert.ok(frozen.targets[target.key],form);
    assert.equal(assessmentTarget(exercise).key,target.key);
    const assessment=recordIndependentAttempt(emptyAssessment(),{exercise:old,questionId:`old-${form}`,correct:false,at:'2026-09-15T12:00:00Z'});
    const input={byKc:{},assessment},snapshot=structuredClone(input);
    const restored=restoreLearningAssessment(input,{components:model.components,exercises:model.exercises,at:'2026-09-16T12:00:00Z'});
    assert.deepEqual(restored,input);assert.deepEqual(input,snapshot);
    assert.ok(reconcileAssessmentCatalog(restored.assessment,model.exercises,6).pending[target.key]);
    assert.equal(restored.byKc[spec.facetId],undefined);
    assert.equal(restored.assessment.independentByKc[spec.facetId],undefined);
  }
});


test('a supplied potential stem is retained when several polite-request operations remain',()=>{
  const step=createAnswerAnalyzer(item,'temorauPoliteRequest')('xyz').steps.at(-1);
  const result=createAnswerAnalyzer(item,step.form,{step})('よんでもらえ');
  assert.equal(result.diagnosis?.kcId,null);
  assert.deepEqual(result.diagnosis?.confirmedKcIds,['stem.ichidan.drop-ru']);
  assert.ok(result.steps.length);
  assert.ok(result.steps.every(probe=>!probe.kcIds.includes('stem.ichidan.drop-ru')));
});


test('four challenge rounds visit all 42 forms and the first round varies application families',()=>{
  const planner=createChallengePlanner(model),forms=new Set();
  for(let rotation=0;rotation<4;rotation++){
    const round=planner.questions(['multiStepCompound'],{byKc:{},rotation,recentWordKeys:[]},{seed:19});
    assert.equal(round.length,12);
    round.forEach(({candidate})=>forms.add(candidate.form));
    if(!rotation)assert.equal(new Set(round.map(({candidate})=>CHAIN_FORM_SPECS[candidate.form]?.kcId??'compound.multi-step')).size,12);
  }
  assert.equal(forms.size,42);
});


test('a provided auxiliary cannot borrow partial confirmation from the original lexical stem',()=>{
  const source={domain:'verb',surface:'食べる',reading:'たべる',class:'ichidan'};
  const step=createAnswerAnalyzer(source,'teiruPast')('xyz').steps.at(-1);
  const result=createAnswerAnalyzer(source,step.form,{step})('食べて');
  assert.equal(result.diagnosis?.kcId,'suffix.past');
  assert.ok(!result.diagnosis?.confirmedKcIds.includes('stem.ichidan.drop-ru'));
});
