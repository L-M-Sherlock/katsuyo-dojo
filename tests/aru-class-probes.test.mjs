import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { unifiedDiagnosticSteps, deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { planDiagnosticTransition } from '../app/lib/diagnostic-session.mjs';
import { emptyAssessment } from '../app/lib/learning-assessment.mjs';
import { applyLearningObservation, assessmentCatalog } from '../app/lib/learning-profile.mjs';

const item={domain:'verb',surface:'借りる',reading:'かりる',class:'ichidan'};
const analyze=(word,form,input,step)=>createAnswerAnalyzer(word,form,step?{step}:{})(input);

test('てある past ambiguity asks the auxiliary class before revealing its past rule',()=>{
  const parent=unifiedDiagnosticSteps(item,'tearuPast')[1];
  const result=analyze(item,'tearuPast','かりてあた',parent);
  assert.equal(result.diagnosis.kcId,null);assert.ok(result.diagnosis.stage);
  const [classification,past]=result.steps;
  assert.equal(classification.kind,'classification');assert.equal(classification.expectedClass,'godan');
  assert.equal(classification.diagnosticOnly,true);assert.deepEqual(classification.kcIds,[]);
  assert.match(classification.note,/末尾「ある」/);
  assert.doesNotMatch(classification.note,/五段|一段/);
  assert.equal(past.providedClass,'godan');assert.equal(past.form,'past');
  assert.deepEqual(past.kcIds,['onbin.sokuon','suffix.past']);
  assert.equal(analyze(item,'past','ichidan',classification).kind,'incorrect');
  assert.equal(analyze(item,'past','godan',classification).kind,'correct');
  assert.equal(analyze(item,'past','かりてあた',past).diagnosis.kcId,'onbin.sokuon');
  assert.equal(analyze(item,'past','かりてあった',past).kind,'correct');
});

test('an intact whole answer prioritizes classification; a damaged original prefix still checks the base',()=>{
  const intact=analyze(item,'tearuPast','かりてあた');
  assert.equal(intact.steps[0].kind,'classification');
  assert.equal(intact.feedback.resolution,'stage-priority');
  const damaged=analyze(item,'tearuPast','ありてあた');
  assert.equal(damaged.steps[0].form,'tearu');
  assert.equal(analyze(item,'tearu','ありてある',damaged.steps[0]).kind,'typo');
  assert.equal(analyze(item,'tearuPast','かりてあった').kind,'correct');
  const negative=unifiedDiagnosticSteps(item,'tearuNegative')[1];
  assert.equal(analyze(item,'tearuNegative','かりてあらない',negative).diagnosis.kcId,'exception.aru-negative');
});

test('already assessed original-word sound rules are not reassessed in the auxiliary class probe',()=>{
  const word={domain:'verb',surface:'待つ',reading:'まつ',class:'godan'};
  const parent=unifiedDiagnosticSteps(word,'tearuPast')[1];
  assert.ok(!parent.kcIds.includes('onbin.sokuon'));
  const r=analyze(word,'tearuPast','まってあた',parent);
  assert.equal(r.steps[0].kind,'classification');
  assert.deepEqual(r.steps[0].kcIds,[]);
  assert.deepEqual(r.steps[1].kcIds,['suffix.past']);
  assert.notEqual(analyze(word,'past','まってあた',r.steps[1]).diagnosis?.kcId,'suffix.past');
});

test('the reported multi-error flow separates class evidence from given-class conjugation and keeps independent scores unchanged',()=>{
  const exercise={id:'aspect:tearuPast:借りる',courseId:'aspect',form:'tearuPast',item,kcIds:deriveUnified(item,'tearuPast').requiredKcIds};
  const full={attempts:5,correct:5,filteredAccuracy:1,confidence:1,bestConfidence:1,cleanTimeTotal:0,cleanTimeCount:0};
  const before={byKc:Object.fromEntries(exercise.kcIds.map(id=>[id,{...full}])),assessment:emptyAssessment()};
  const catalog=assessmentCatalog([exercise]);
  const at='2026-09-09T09:12:22.000Z';
  let profile=applyLearningObservation(before,exercise,{type:'question',outcome:'incorrect',questionId:'q',eventId:'original',at},catalog).profile;
  let steps=analyze(item,'tearuPast','ありてあた').steps, evaluated=[],examined=[];
  for(const [index,input] of ['かりてある','かりてあた','ichidan','かりてあた'].entries()) {
    const step=steps[index],result=analyze(item,step.form,input,step);
    const transition=planDiagnosticTransition(steps,index,result,evaluated,examined);
    profile=applyLearningObservation(profile,exercise,{type:'step',outcome:result.kind,questionId:'q',eventId:`step-${index}`,at,
      step:transition.assessed,failedKcId:result.diagnosis?.kcId,confirmedKcIds:result.diagnosis?.confirmedKcIds??[]},catalog).profile;
    assert.deepEqual(profile.byKc,before.byKc);
    if(index===2){assert.equal(step.kind,'classification');assert.equal(profile.assessment.assistedByKc['class.ichidan'],undefined);assert.equal(profile.assessment.assistedByKc['class.godan'],undefined);}
    steps=transition.nextSteps;evaluated=transition.evaluated;examined=transition.examined;
  }
  assert.equal(steps.length,4);
  assert.equal(profile.assessment.assistedByKc['onbin.sokuon'].attempts,1);
  assert.equal(profile.assessment.assistedByKc['onbin.sokuon'].correct,0);
  assert.equal(profile.assessment.assistedByKc['apply.tearu.continuation'],undefined);
  assert.equal(Object.keys(profile.assessment.pending).length,1);
});
