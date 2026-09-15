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
