import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {createPracticePlanner} from '../app/lib/practice-planning.mjs';
import {emptySkillStats,updateSkillStats} from '../app/lib/adaptive.mjs';
import {scoreLearningEvidence} from '../app/lib/learning-evidence.mjs';
const server=await createServer({appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
let model;try{model=(await server.ssrLoadModule('/app/page.tsx')).KNOWLEDGE;}finally{await server.close();}
const planner=createPracticePlanner(model);
const mastered={attempts:5,correct:5,filteredAccuracy:1,confidence:1,bestConfidence:1,cleanTimeCount:0,cleanTimeTotal:0};
const fresh=()=>({byKc:Object.fromEntries(model.components.map(k=>[k.id,{...mastered}])),introducedKcIds:model.components.filter(k=>k.gating).map(k=>k.id),rotation:10,recentWordKeys:[],practiceGoalCourseId:'direction'});
function withNewCourse(p) {
  for(const id of ['apply.teiku.continuation','apply.tekuru.continuation']) {
    p.byKc[id]=emptySkillStats();
    for(const facet of model.components.find(k=>k.id===id).coverageKcIds)p.byKc[facet]=emptySkillStats();
  }
  return p;
}

test('a genuine earlier classification regression is recovered before new zero-confidence applications',()=>{
  let p=withNewCourse(fresh());p.byKc['adj.class.i']=updateSkillStats(p.byKc['adj.class.i'],{correct:false});
  const unrelatedBefore=structuredClone(p.byKc['apply.teiku.continuation']);
  for(let i=0;i<2;i++) {
    const plan=planner.plan('adaptive',p);
    assert.equal(plan.goalCourseId,'direction');assert.equal(plan.globalRecovery,true);assert.equal(plan.focus.id,'adj.class.i');
    const {item,candidate}=planner.assign(plan,p,{seed:i})[0];
    assert.equal(candidate.form,null);assert.equal(candidate.courseId,'adjectiveClassify');
    const result=scoreLearningEvidence({byKc:p.byKc},{kcIds:candidate.kcIds,form:null,focusId:item.id,correct:true,support:{independent:true,source:'independent'}});
    p={...p,byKc:result.byKc};
  }
  assert.equal(p.byKc['adj.class.i'].confidence,1);
  assert.deepEqual(p.byKc['apply.teiku.continuation'],unrelatedBefore);
  const next=planner.plan('adaptive',p);assert.equal(next.goalCourseId,'direction');assert.equal(next.globalRecovery,false);assert.equal(next.focus.id,'apply.teiku.continuation');
});

test('unfinished new skills and assisted records do not fabricate global regressions; specialties remain scoped',()=>{
  const p=withNewCourse(fresh());p.byKc['adj.class.i']=emptySkillStats();
  assert.equal(planner.plan('adaptive',p).globalRecovery,false);
  p.byKc['adj.class.i']=updateSkillStats(mastered,{correct:false});
  const special=planner.plan('direction',p);
  assert.equal(special.globalRecovery,false);assert.equal(special.goalCourseId,'direction');assert.notEqual(special.focus.id,'adj.class.i');
});
