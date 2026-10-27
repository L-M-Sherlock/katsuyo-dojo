import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createServer } from 'vite';
import { emptySkillStats } from '../app/lib/adaptive.mjs';
import { curriculumSupportsVerbForm } from '../app/lib/curriculum-shapes.mjs';
import { buildUnifiedKnowledge } from '../app/lib/unified-knowledge.mjs';
import { USER_DIRECTED_DEFERRED_FORMS } from '../app/lib/teaching-form-deferrals.mjs';
import { USAGE_REVIEW_VERSION } from '../app/lib/form-eligibility.mjs';
import { UNIFIED_COURSES } from '../app/lib/unified-curriculum.mjs';
import { emptyAssessment, assessmentTarget, recordIndependentAttempt } from '../app/lib/learning-assessment.mjs';
import { createUnifiedExport, parseUnifiedImport } from '../app/lib/unified-profile.mjs';
import { createPracticePlanner } from '../app/lib/practice-planning.mjs';
import { simulateLearning } from '../app/lib/perfect-simulation.mjs';
import { statisticsSnapshot } from '../app/lib/statistics.mjs';

const heldGate='exception.aru-negative';
const heldFacets=['facet.apply.tearu.negative','facet.apply.tearu.negativePast','facet.apply.temiru.negativePast',
  'facet.chain.temiruDesireNegative','facet.chain.temiruDesireNegativePast'];
const today='2026-10-27',at='2026-10-27T00:00:00Z';
const mastered=()=>({...emptySkillStats(),attempts:5,correct:5,filteredAccuracy:1,confidence:1,bestConfidence:1});
const failed=()=>({...emptySkillStats(),attempts:1,correct:0,filteredAccuracy:0});
let server,page,model,options;
before(async()=>{
  server=await createServer({appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
  page=await server.ssrLoadModule('/app/page.tsx');
  model=page.KNOWLEDGE;
  options={today,at,components:model.components,exercises:model.exercises,
    legacyComponents:[...page.VERB_KNOWLEDGE.components,...page.ADJECTIVE_KNOWLEDGE.components]};
});
after(async()=>{await server?.close();});

function historicalProfile(){
  const source=parseUnifiedImport({version:5,date:today,attempted:0,correct:0,streak:0,rotation:0,
    byKc:{},introducedKcIds:[]},options);
  source.version=7;
  delete source.statistics;
  source.byKc=Object.fromEntries(model.components.map(kc=>[kc.id,kc.teachingDeferred?failed():mastered()]));
  source.introducedKcIds=[...model.components.filter(kc=>kc.gating).map(kc=>kc.id),heldGate,...heldFacets];
  source.assessment=emptyAssessment();
  const exercise=model.registryExercises.find(candidate=>candidate.form==='tearuNegative'&&candidate.item.surface==='閉める');
  assert.ok(exercise);
  source.assessment=recordIndependentAttempt(source.assessment,{exercise,questionId:'old-aru-negative',correct:false,
    failedKcIds:[heldGate],at});
  return {source,exercise};
}

test('the paused original gate retains its introduction eligibility while historical facets do not acquire it',()=>{
  const gate=model.components.find(kc=>kc.id===heldGate);
  assert.equal(gate.gating,false);
  assert.equal(gate.teachingDeferred,true);
  assert.equal(gate.teachingDeferredGating,true);
  assert.deepEqual(model.components.filter(kc=>kc.teachingDeferredGating).map(kc=>kc.id),[heldGate]);
  for(const id of heldFacets){
    const facet=model.components.find(kc=>kc.id===id);
    assert.equal(facet.gating,false,id);
    assert.equal(facet.teachingDeferred,true,id);
    assert.equal(facet.teachingDeferredGating,undefined,id);
  }
});

test('real profile import and repeated exports retain a paused introduction, scores and the original retest anchors',()=>{
  const {source,exercise}=historicalProfile(),before=structuredClone(source),key=assessmentTarget(exercise).key;
  const restored=parseUnifiedImport(createUnifiedExport(source,at),options);
  assert.ok(restored.introducedKcIds.includes(heldGate));
  assert.deepEqual(new Set(restored.introducedKcIds),new Set([...model.components.filter(kc=>kc.gating).map(kc=>kc.id),heldGate]));
  for(const id of heldFacets)assert.ok(!restored.introducedKcIds.includes(id),id);
  assert.deepEqual(restored.byKc,source.byKc);
  for(const field of ['byTarget','independentByKc','assistedByKc','originalCount','seenQuestionIds']){
    assert.deepEqual(restored.assessment[field],source.assessment[field],field);
  }
  assert.equal(restored.assessment.pending[key],undefined);
  const {suspension,...preserved}=restored.assessment.suspendedPending[key];
  assert.deepEqual(preserved,source.assessment.pending[key]);
  assert.equal(suspension.reason,'no-eligible-exercise');
  assert.equal(suspension.catalogVersion,USAGE_REVIEW_VERSION);
  assert.equal(restored.assessment.byTarget[key].eligibleRetestCorrect,0);
  const again=parseUnifiedImport(createUnifiedExport(restored,at),options);
  assert.deepEqual(again,restored);
  assert.deepEqual(source,before,'restoring a backup never rewrites its evidence');
});

test('scores do not invent a paused introduction when the saved profile did not contain one',()=>{
  const {source}=historicalProfile();
  source.introducedKcIds=source.introducedKcIds.filter(id=>id!==heldGate);
  const restored=parseUnifiedImport(createUnifiedExport(source,at),options);
  assert.ok(!restored.introducedKcIds.includes(heldGate));
  assert.deepEqual(restored.byKc[heldGate],source.byKc[heldGate]);
});

test('a saved paused introduction cannot manufacture active prerequisite introductions',()=>{
  const {source}=historicalProfile();
  source.introducedKcIds=[heldGate];
  const restored=parseUnifiedImport(createUnifiedExport(source,at),options);
  assert.deepEqual(restored.introducedKcIds,[heldGate]);
  assert.ok(!restored.introducedKcIds.includes('construction.tearu'));
  const snapshot=statisticsSnapshot(restored,{components:model.components,courses:UNIFIED_COURSES,courseKcIds:model.courseKcIds});
  assert.equal(snapshot.all.unlocked,0);
});

test('a retained weak historical introduction cannot prevent active review or inflate current progress',()=>{
  const {source}=historicalProfile();
  const restored=parseUnifiedImport(createUnifiedExport(source,at),options),before=structuredClone(restored);
  const planner=createPracticePlanner(model),planned=planner.plan('adaptive',restored);
  assert.equal(planned.review,true,'all 131 active gates are mastered despite the retained paused weakness');
  assert.ok(planned.focus&&planned.focus.id!==heldGate);
  assert.ok(planned.available.every(kc=>kc.gating&&!kc.teachingDeferred));
  assert.ok(planned.plan.every(kc=>kc.id!==heldGate));
  const assigned=planner.assign(planned,restored,{seed:19});
  assert.equal(assigned.length,12);
  assert.ok(assigned.every(({candidate})=>!candidate.kcIds.includes(heldGate)));
  const context={components:model.components,courses:UNIFIED_COURSES,courseKcIds:model.courseKcIds};
  const snapshot=statisticsSnapshot(restored,context);
  assert.equal(snapshot.all.kcs,131);
  assert.equal(snapshot.all.mastered,131);
  assert.equal(snapshot.all.unlocked,131);
  assert.deepEqual(snapshot,statisticsSnapshot({...restored,introducedKcIds:restored.introducedKcIds.filter(id=>id!==heldGate)},context));
  const simulated=simulateLearning(model,{initialProfile:restored,maxRounds:1});
  assert.equal(simulated.completed,true);
  assert.equal(simulated.questionCount,0);
  assert.equal(simulated.introducedCount,131);
  assert.equal(simulated.introducedKcIds.length,132);
  assert.ok(simulated.introducedKcIds.includes(heldGate),'simulation keeps the saved history separate from its active completion check');
  assert.deepEqual(simulated.byKc[heldGate],restored.byKc[heldGate]);
  assert.deepEqual(restored,before);
});

test('a graph rebuild clears the historical-only flag when the original gate becomes active again',()=>{
  const {source,exercise}=historicalProfile(),key=assessmentTarget(exercise).key;
  const paused=parseUnifiedImport(createUnifiedExport(source,at),options);
  const words=domain=>[...new Map(model.registryExercises.filter(exercise=>exercise.item.domain===domain)
    .map(exercise=>[exercise.item.surface,exercise.item])).values()];
  const before=[...USER_DIRECTED_DEFERRED_FORMS];
  USER_DIRECTED_DEFERRED_FORMS.delete('tearuNegative');
  try{
    const resumed=buildUnifiedKnowledge(page.VERB_KNOWLEDGE,page.ADJECTIVE_KNOWLEDGE,
      words('verb'),words('adjective'),curriculumSupportsVerbForm);
    const gate=resumed.components.find(kc=>kc.id===heldGate);
    assert.equal(gate.gating,true);
    assert.equal(gate.teachingDeferred,undefined);
    assert.equal(gate.teachingDeferredGating,undefined);
    // Rebuilding the graph alone does not release teaching supply. Supply the
    // original catalog entry explicitly to model its separately reviewed return.
    const restored=parseUnifiedImport(createUnifiedExport(paused,at),{...options,components:resumed.components,
      exercises:[...resumed.exercises,exercise]});
    assert.ok(restored.introducedKcIds.includes(heldGate));
    assert.deepEqual(restored.byKc,paused.byKc);
    assert.deepEqual(restored.assessment.pending[key],source.assessment.pending[key]);
    assert.equal(restored.assessment.suspendedPending[key],undefined);
    assert.deepEqual(restored.assessment.byTarget,source.assessment.byTarget);
    for(const id of heldFacets)assert.ok(!restored.introducedKcIds.includes(id),id);
  }finally{
    USER_DIRECTED_DEFERRED_FORMS.clear();
    for(const form of before)USER_DIRECTED_DEFERRED_FORMS.add(form);
  }
});
