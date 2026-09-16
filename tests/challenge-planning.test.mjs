import assert from 'node:assert/strict';
import test from 'node:test';
import {createChallengePlanner} from '../app/lib/challenge-planning.mjs';
import {exerciseKey} from '../app/lib/exercise-selection.mjs';

const model={components:[{id:'class.godan',gating:true},{id:'advanced',gating:true,prerequisites:['unknown']}],
  exercises:['a','b','c','d'].flatMap(form=>Array.from({length:8},(_,i)=>({id:`${form}:${i}`,courseId:'high',form,
    item:{domain:'verb',surface:`word-${i}`,class:'godan'},kcIds:['class.godan','advanced'],prerequisites:['unknown']}))),courseKcIds:{high:['advanced']}};
const profile={byKc:{},introducedKcIds:[],accessibleCourseIds:[],recentWordKeys:[],rotation:0};

test('challenge selection bypasses mastery gates without changing a profile or crossing its catalog',()=>{
  const p=structuredClone(profile),planner=createChallengePlanner(model);
  const selected=planner.questions('high',p);
  assert.equal(selected.length,12);assert.deepEqual(p,profile);
  assert.ok(selected.every(q=>q.candidate.courseId==='high'&&q.item.id==='advanced'));
  assert.equal(new Set(selected.map(q=>exerciseKey(q.candidate))).size,12);
  const counts=Object.fromEntries(['a','b','c','d'].map(form=>[form,selected.filter(q=>q.candidate.form===form).length]));
  assert.deepEqual(counts,{a:3,b:3,c:3,d:3});
  assert.equal(new Set(selected.slice(0,8).map(q=>q.candidate.item.surface)).size,8);
  assert.deepEqual(planner.questions('absent',p),[]);
});

test('mastered content remains challengeable and small pools end without exact repeats',()=>{
  const tiny={...model,exercises:model.exercises.slice(0,2)},planner=createChallengePlanner(tiny);
  const p={...profile,byKc:{advanced:{confidence:1}}};
  assert.equal(planner.questions('high',p).length,2);
  assert.equal(planner.questions('high',p,{length:1}).length,1);
  assert.deepEqual(planner.questions('high',p),planner.questions('high',p));
});

test('classification challenges balance actual classes rather than conjugation rules',()=>{
  const classes=['godan','ichidan','irregular'];
  const m={components:classes.map(c=>({id:`class.${c}`,gating:true})),exercises:classes.flatMap(c=>Array.from({length:6},(_,i)=>({id:`${c}:${i}`,courseId:'classification',form:null,item:{domain:'verb',surface:`${c}-${i}`,class:c},kcIds:[`class.${c}`]})))};
  const r=createChallengePlanner(m).questions('classification',profile);
  for(const cls of classes)assert.equal(r.filter(q=>q.candidate.item.class===cls).length,4);
});

test('conjugation challenges balance verb classes as well as forms',()=>{
  const m={...model,exercises:['a','b','c','d'].flatMap(form=>['godan','ichidan','irregular'].flatMap(cls=>Array.from({length:5},(_,i)=>({id:`${form}:${cls}:${i}`,courseId:'high',form,item:{domain:'verb',surface:`${cls}-${i}`,class:cls},kcIds:['advanced']}))))};
  const round=createChallengePlanner(m).questions('high',profile);
  for(const form of ['a','b','c','d']){
    const group=round.filter(q=>q.candidate.form===form);
    assert.equal(group.length,3);
    assert.deepEqual(new Set(group.map(q=>q.candidate.item.class)),new Set(['godan','ichidan','irregular']));
  }
});

test('mixed rounds balance courses before forms, and redistribute exhausted course slots',()=>{
  const courses=[['small',1],['second',20],['third',20]];
  const m={...model,exercises:courses.flatMap(([courseId,n])=>Array.from({length:n},(_,i)=>({id:`${courseId}:${i}`,courseId,form:'past',item:{domain:'verb',surface:`${courseId}-${i}`,class:'godan'},kcIds:['advanced']})))};
  const planner=createChallengePlanner(m),round=planner.questions(courses.map(([id])=>id),profile);
  assert.equal(round.length,12);assert.equal(new Set(round.map(q=>exerciseKey(q.candidate))).size,12);
  const counts=Object.fromEntries(courses.map(([id])=>[id,round.filter(q=>q.candidate.courseId===id).length]));
  assert.equal(counts.small,1);assert.equal(counts.second+counts.third,11);assert.ok(Math.abs(counts.second-counts.third)<=1);
  assert.ok(round.every(q=>courses.some(([id])=>id===q.candidate.courseId)));
});

test('selecting more than twelve courses rotates through every course over subsequent rounds',()=>{
  const ids=Array.from({length:43},(_,i)=>`course-${i}`);
  const m={...model,exercises:ids.flatMap(courseId=>Array.from({length:3},(_,i)=>({id:`${courseId}:${i}`,courseId,form:'past',item:{domain:'verb',surface:`${courseId}-${i}`,class:'godan'},kcIds:['advanced']})))};
  const planner=createChallengePlanner(m),seen=new Set();
  for(let rotation=1;rotation<=4;rotation++){
    const round=planner.questions(ids,{...profile,rotation});
    assert.equal(round.length,12);assert.equal(new Set(round.map(q=>q.candidate.courseId)).size,12);
    round.forEach(q=>seen.add(q.candidate.courseId));
  }
  assert.equal(seen.size,43);
});

test('selection normalization supports old preferences and rejects unknown or malformed choices',async()=>{
  const {normalizeChallengeCourses}=await import('../app/lib/challenge-planning.mjs');
  const ids=['first','second'];
  assert.deepEqual(normalizeChallengeCourses('first',ids),['first']);
  assert.deepEqual(normalizeChallengeCourses('["second","first","first","unknown"]',ids),ids);
  assert.deepEqual(normalizeChallengeCourses(['second',null,4,'second'],ids),['second']);
  for(const value of [null,{},'[]','[bad','unknown','x'.repeat(8193)])assert.deepEqual(normalizeChallengeCourses(value,ids),[]);
});

test('continuous challenge crosses former round boundaries and rotates every selected course',()=>{
  const ids=Array.from({length:43},(_,i)=>`course-${i}`);
  const m={...model,exercises:ids.flatMap(courseId=>Array.from({length:3},(_,i)=>({id:`${courseId}:${i}`,courseId,form:'past',item:{domain:'verb',surface:`${courseId}-${i}`,class:'godan'},kcIds:['advanced']})))};
  const planner=createChallengePlanner(m),counts=new Map();let recent=[];
  for(let position=0;position<172;position++){
    const next=planner.nextQuestion(ids,profile,{position,recentQuestionKeys:recent});
    assert.ok(next);
    assert.equal(next.candidate.courseId,ids[position%ids.length]);
    counts.set(next.candidate.courseId,(counts.get(next.candidate.courseId)??0)+1);
    recent=[...recent,exerciseKey(next.candidate)].slice(-36);
  }
  assert.ok([...counts.values()].every(count=>count===4));
  assert.equal(planner.nextQuestion('absent',profile),null);
});

test('continuous tiny pools recycle only when needed and never impose a question limit',()=>{
  for(const size of [1,2]){
    const planner=createChallengePlanner({...model,exercises:model.exercises.slice(0,size)});
    let recent=[],last=null;
    for(let position=0;position<150;position++){
      const before=[...recent],next=planner.nextQuestion('high',profile,{position,recentQuestionKeys:recent});
      assert.deepEqual(recent,before);
      assert.ok(next);
      const key=exerciseKey(next.candidate);
      if(size===2&&last)assert.notEqual(key,last);
      last=key;recent=[...recent,key].slice(-36);
    }
  }
});

test('continuous scheduling balances forms and classes and avoids exact repeats across question twelve',()=>{
  const m={...model,exercises:['a','b','c','d'].flatMap(form=>['godan','ichidan','irregular'].flatMap(cls=>Array.from({length:8},(_,i)=>({id:`${form}:${cls}:${i}`,courseId:'high',form,item:{domain:'verb',surface:`${cls}-${i}`,class:cls},kcIds:['advanced']}))))};
  const planner=createChallengePlanner(m),seen=[],p=structuredClone(profile);
  let recent=[];
  for(let position=0;position<48;position++){
    const next=planner.nextQuestion('high',p,{position,recentQuestionKeys:recent});
    assert.ok(next);seen.push(next.candidate);
    assert.ok(!recent.includes(exerciseKey(next.candidate)));
    recent=[...recent,exerciseKey(next.candidate)].slice(-36);
    p.recentWordKeys=[...p.recentWordKeys,`verb:${next.candidate.item.surface}`].slice(-36);
  }
  for(const form of ['a','b','c','d'])for(const cls of ['godan','ichidan','irregular'])
    assert.equal(seen.filter(e=>e.form===form&&e.item.class===cls).length,4);
});
