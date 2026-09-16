import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {emptyAssessment,assessmentTarget,recordIndependentAttempt} from '../app/lib/learning-assessment.mjs';
import {applyLearningObservation,assessmentCatalog} from '../app/lib/learning-profile.mjs';
import {retestQueue,addToPracticeRetests,moveRetestQueue} from '../app/lib/retest-queue.mjs';
import {planRetestQuestion} from '../app/lib/retest-planning.mjs';
import {createChallengePlanner} from '../app/lib/challenge-planning.mjs';
import {restoreLearningAssessment} from '../app/lib/assessment-transfer.mjs';
import {summarizeUnifiedCourse} from '../app/lib/unified-progress.mjs';
import {UNIFIED_COURSES} from '../app/lib/unified-curriculum.mjs';
import {emptyPracticeLog,appendPracticeEvent,parsePracticeLog} from '../app/lib/practice-log.mjs';

const server=await createServer({appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
let model;try{model=(await server.ssrLoadModule('/app/page.tsx')).KNOWLEDGE}finally{await server.close()}
const catalog=assessmentCatalog(model.exercises);
const find=(surface,form)=>model.exercises.find(e=>e.item.surface===surface&&e.form===form);
const target=find('書く','negative'),other=find('聞く','negative'),key=assessmentTarget(target).key;
const mastered={attempts:5,correct:5,filteredAccuracy:1,confidence:1,bestConfidence:1,cleanTimeTotal:0,cleanTimeCount:0};
const fresh=()=>({version:8,date:'2026-09-16',attempted:0,correct:0,streak:0,rotation:0,
  byKc:Object.fromEntries(model.components.map(k=>[k.id,{...mastered}])),introducedKcIds:model.components.filter(k=>k.gating).map(k=>k.id),
  accessibleCourseIds:[],coursePractice:{},recentWordKeys:[],assessment:emptyAssessment(),practiceLog:emptyPracticeLog()});
const at='2026-09-16T12:00:00.000Z';
const observe=(profile,exercise,extra={})=>applyLearningObservation(profile,exercise,{type:'question',outcome:'incorrect',questionId:`q-${profile.assessment.originalCount}`,eventId:`e-${profile.practiceLog.totalEvents}-${profile.assessment.originalCount}`,at,...extra},catalog).profile;
const fill=profile=>[find('食べる',null),find('読む',null)].reduce((p,e)=>observe(p,e,{outcome:'correct'}),profile);
const planner=p=>planRetestQuestion(p,'adaptive',{...model,courses:UNIFIED_COURSES});

test('challenge errors keep shared evidence but create no practice retest, filler round or completion blocker',()=>{
  const before=fresh(),after=fill(observe(before,target,{mode:'challenge'}));
  assert.equal(retestQueue(after.assessment.pending[key]),'challenge');
  assert.equal(planner(after),null);
  const course=UNIFIED_COURSES.find(c=>c.id==='negative');
  const components=model.components.filter(k=>model.courseKcIds.negative.includes(k.id));
  assert.equal(summarizeUnifiedCourse(course,components,after.introducedKcIds,after).pendingCount,0);
  assert.equal(summarizeUnifiedCourse(course,components,after.introducedKcIds,after).complete,true);
  const precise=observe(before,target,{mode:'challenge',failedKcId:'stem.godan.a'});
  assert.equal(precise.byKc['stem.godan.a'].attempts,before.byKc['stem.godan.a'].attempts+1,'genuine failure evidence is still shared');
});

test('hints, reveals, guidance and diagnostic completion cannot leak new challenge tasks into practice',()=>{
  for(const outcome of ['incorrect','revealed'])assert.equal(retestQueue(observe(fresh(),target,{mode:'challenge',outcome}).assessment.pending[key]),'challenge');
  let p=observe(fresh(),target,{mode:'challenge',type:'hint',outcome:'shown',eventId:'hint',questionId:'q'});
  assert.equal(p.assessment.pending[key].failures,0);assert.equal(p.assessment.originalCount,0);
  p=observe(p,target,{mode:'challenge',outcome:'correct',hintUsed:true,questionId:'q'});
  for(const [type,outcome] of [['step','correct'],['step','invalid'],['diagnostic-end','completed'],['diagnostic-end','skipped']]){
    p=observe(p,target,{mode:'challenge',type,outcome,eventId:`${type}-${outcome}`,questionId:'q',kcIds:['stem.godan.a']});
    assert.equal(retestQueue(p.assessment.pending[key]),'challenge');
  }
  assert.equal(planner(p),null);
});

test('explicit enrollment changes only scheduling and is idempotent, including a stale cleared task',()=>{
  const p=fill(observe(fresh(),target,{mode:'challenge'})),before=structuredClone(p.assessment);
  const after=addToPracticeRetests(p.assessment,key);
  assert.deepEqual(p.assessment,before);
  assert.deepEqual(after,{...before,pending:{...before.pending,[key]:{...before.pending[key],queue:'practice'}}});
  assert.equal(addToPracticeRetests(after,key),after);
  assert.equal(addToPracticeRetests(after,'missing'),after);
  assert.equal(planner({...p,assessment:after}).kind,'retest');
  assert.equal(planner({...p,assessment:after}).pending.key,key);
});

test('a practice obligation stays in practice, and a new practice failure creates its own requirement',()=>{
  const p=observe(fresh(),target);
  assert.equal(retestQueue(observe(p,target,{mode:'challenge'}).assessment.pending[key]),'practice');
  const challenge=observe(fresh(),target,{mode:'challenge'});
  assert.equal(retestQueue(observe(challenge,target).assessment.pending[key]),'practice');
  assert.equal(retestQueue(observe(challenge,target,{type:'hint',outcome:'shown',eventId:'practice-hint'}).assessment.pending[key]),'practice');
});

test('challenge review prioritizes eligible tasks only within the selected courses',()=>{
  const p=fill(observe(fresh(),target,{mode:'challenge'}));
  const challenge=createChallengePlanner(model),round=challenge.questions(['negative'],p);
  assert.equal(round[0].challengeRetest,true);
  assert.equal(assessmentTarget(round[0].candidate).key,key);
  assert.notEqual(assessmentTarget(round[0].candidate).wordKey,assessmentTarget(target).wordKey);
  assert.ok(round.every(q=>q.candidate.courseId==='negative'));
  assert.equal(new Set(round.map(q=>q.candidate.id)).size,round.length);
  assert.ok(challenge.questions(['past'],p).every(q=>!q.challengeRetest));
  const practiceOnly={...p,assessment:addToPracticeRetests(p.assessment,key)};
  assert.ok(challenge.questions(['negative'],practiceOnly).every(q=>!q.challengeRetest));
  assert.equal(challenge.nextQuestion(['negative'],p).challengeRetest,true);
  assert.equal(assessmentTarget(challenge.nextQuestion(['negative'],p).candidate).key,key);
  assert.ok(!challenge.nextQuestion(['past'],p).challengeRetest);
  assert.ok(!challenge.nextQuestion(['negative'],practiceOnly).challengeRetest);
  const unqualified=observe(fresh(),target,{mode:'challenge'});
  assert.ok(!challenge.nextQuestion(['negative'],unqualified).challengeRetest);
});

test('either mode can satisfy the same qualified evidence requirement without duplicating retests',()=>{
  for(const origin of ['practice','challenge'])for(const mode of ['practice','challenge']){
    const failed=fill(observe(fresh(),target,{mode:origin}));
    const passed=observe(failed,other,{mode,outcome:'correct'});
    assert.equal(passed.assessment.pending[key],undefined);
    assert.equal(passed.assessment.byTarget[key].eligibleRetestCorrect,1);
  }
  const early=observe(observe(fresh(),target,{mode:'challenge'}),other,{outcome:'correct'});
  assert.equal(retestQueue(early.assessment.pending[key]),'challenge','changing modes never bypasses independent retest conditions');
});

test('old ambiguous tasks remain practice tasks and queue metadata survives restoration',()=>{
  const p=observe(fresh(),target,{mode:'challenge'});
  const restored=restoreLearningAssessment(p,{components:model.components,exercises:model.exercises,at});
  assert.deepEqual(restored.assessment,p.assessment);
  const old=structuredClone(p);old.assessment.version=2;delete old.assessment.pending[key].queue;
  const copy=structuredClone(old),migrated=restoreLearningAssessment(old,{components:model.components,exercises:model.exercises,at});
  assert.deepEqual(old,copy);
  assert.equal(migrated.assessment.version,3);
  assert.deepEqual(migrated.assessment.pending[key],old.assessment.pending[key]);
  assert.equal(retestQueue(migrated.assessment.pending[key]),'practice');
  const broken=structuredClone(p);broken.assessment.pending[key].queue='automatic';
  assert.throws(()=>restoreLearningAssessment(broken,{components:model.components,exercises:model.exercises,at}));
  assert.throws(()=>recordIndependentAttempt(emptyAssessment(),{exercise:target,questionId:'bad',correct:false,mode:'unexpected'}));
});

test('enrollment is an auditable metadata event without new attempts, scores or exposure anchors',()=>{
  const before=observe(fresh(),target,{mode:'challenge'}),after={...before,assessment:addToPracticeRetests(before.assessment,key)};
  const logged=appendPracticeEvent(before,after,{id:'move',at,questionId:before.assessment.pending[key].lastQuestionId,mode:'challenge',type:'retest-transfer',outcome:'queued',
    exercise:{id:target.id,courseId:target.courseId,form:target.form,surface:target.item.surface,reading:target.item.reading,wordClass:target.item.class,domain:'verb'},
    target:{surface:target.item.surface,reading:target.item.reading,form:target.form,label:'加入练习复测',kind:'retest-transfer',kcIds:[],answers:[],readings:[],stepIndex:null,totalSteps:0,nextTotalSteps:0},assessmentKey:key});
  const event=logged.practiceLog.events[0];
  assert.equal(event.assessment.before.queue,'challenge');assert.equal(event.assessment.after.queue,'practice');
  assert.deepEqual(event.changes,[]);assert.deepEqual(event.assistedChanges,[]);assert.deepEqual(event.totals.before,event.totals.after);
  assert.equal(logged.assessment.originalCount,before.assessment.originalCount);
  assert.deepEqual(parsePracticeLog(logged.practiceLog),logged.practiceLog);
  const broken=structuredClone(logged.practiceLog);broken.events[0].assessment.after.independentCorrect++;
  assert.throws(()=>parsePracticeLog(broken));
});


test('manually moving a legacy practice task to challenge preserves all historical evidence',()=>{
  const p=observe(fresh(),target);delete p.assessment.pending[key].queue;
  const before=structuredClone(p.assessment),moved=moveRetestQueue(p.assessment,key,'challenge');
  assert.deepEqual(p.assessment,before);
  assert.deepEqual(moved.pending[key],{...before.pending[key],queue:'challenge'});
  assert.equal(planner({...p,assessment:moved}),null);
  assert.deepEqual(addToPracticeRetests(moved,key).pending[key],{...before.pending[key],queue:'practice'});
  assert.throws(()=>moveRetestQueue(moved,key,'invalid'));
});


test('an early challenge task cannot lock normal beginner scoring, nor can mode switching clear it early',()=>{
  const godan=find('書く',null),another=find('聞く',null),targetKey=assessmentTarget(godan).key;
  const before=fresh();before.byKc={};before.introducedKcIds=['class.godan'];
  const failed=observe(before,godan,{mode:'challenge'});
  const result=applyLearningObservation(failed,another,{mode:'practice',type:'question',outcome:'correct',questionId:'normal',eventId:'normal',at},catalog);
  assert.equal(result.support.independent,true);
  assert.equal(result.profile.byKc['class.godan'].correct,1);
  assert.equal(result.profile.assessment.byTarget[targetKey].independentCorrect,1);
  assert.equal(result.profile.assessment.byTarget[targetKey].eligibleRetestCorrect,0);
  assert.equal(retestQueue(result.profile.assessment.pending[targetKey]),'challenge');
  assert.equal(planner(result.profile),null);
  const copy=applyLearningObservation(failed,godan,{mode:'practice',type:'question',outcome:'correct',questionId:'copy',eventId:'copy',at},catalog);
  assert.equal(copy.support.independent,true,'ordinary unassisted scoring uses its own mode, while clearing a task has stricter conditions');
  assert.equal(copy.profile.assessment.byTarget[targetKey].eligibleRetestCorrect,0);
  const ownMode=applyLearningObservation(failed,another,{mode:'challenge',type:'question',outcome:'correct',questionId:'challenge',eventId:'challenge',at},catalog);
  assert.equal(ownMode.support.independent,false);
  assert.equal(ownMode.profile.byKc['class.godan'],undefined);
});
