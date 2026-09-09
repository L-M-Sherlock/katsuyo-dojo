import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { ADJECTIVES } from '../app/lib/adjective-catalog.mjs';
import { adjectiveTargetLabel, diagnoseAdjective } from '../app/lib/adjective-conjugation.mjs';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { correctNaraClassification } from '../app/lib/score-corrections.mjs';
import { parseUnifiedImport, createUnifiedExport } from '../app/lib/unified-profile.mjs';
import { updateSkillStats } from '../app/lib/adaptive.mjs';
import { appendPracticeEvent } from '../app/lib/practice-log.mjs';
import { legacyNaraProfile, oldVersionedNaraProfile, naraBaseline } from './helpers/nara-profile.mjs';
const server=await createServer({appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
let model;try{model=(await server.ssrLoadModule('/app/page.tsx')).KNOWLEDGE;}finally{await server.close();}
const options={today:'2026-09-09',at:'2026-09-09T10:00:00.000Z',components:model.components,exercises:model.exercises,legacyComponents:model.components};
const read=p=>parseUnifiedImport(p,options);
const key='adj.class.i';

test('all native i-adjectives accept nara as a different condition without a classification or suffix penalty',()=>{
  for(const item of ADJECTIVES.filter(a=>a.class==='i'))for(const base of new Set([item.surface,item.reading]))for(const suffix of ['なら','ならば']) {
    const r=createAnswerAnalyzer({...item,domain:'adjective'},'adjectiveBa')(`${base}${suffix}`);
    assert.equal(r.kind,'incorrect');assert.equal(r.diagnosis.kcId,null);
    assert.equal(r.diagnosis.targetMismatch,true);assert.deepEqual(r.diagnosis.confirmedKcIds,[]);
    assert.equal(r.feedback.resolution,'target-form');assert.ok(r.steps.length>0);
    assert.equal(adjectiveTargetLabel(item,'adjectiveBa'),'ば条件形');
  }
  const cold={domain:'adjective',surface:'冷たい',reading:'つめたい',class:'i'};
  assert.equal(createAnswerAnalyzer(cold,'adjectiveBa')(' ツメタイナラ。 ').diagnosis.kcId,null);
  assert.equal(createAnswerAnalyzer(cold,'adjectiveBa')('つめたければ').kind,'correct');
  assert.equal(diagnoseAdjective(cold,'adjectiveBa','冷たいであれば').kcId,key);
  assert.equal(createAnswerAnalyzer({domain:'adjective',surface:'静か',reading:'しずか',class:'na'},'adjectiveBa')('しずかなら').kind,'correct');
});

test('legacy migration omits this known false classification while keeping the original outcomes',()=>{
  const old=legacyNaraProfile(model), before=structuredClone(old), p=read(old);
  assert.deepEqual(p.byKc[key],naraBaseline);assert.equal(p.assessment.independentByKc[key],undefined);
  assert.equal(p.attempted,3);assert.equal(p.correct,2);
  assert.deepEqual(p.practiceLog.events.slice(0,3),old.practiceLog.events);
  assert.ok(Object.values(p.assessment.pending).every(p=>!p.failedKcIds.includes(key)));
  assert.deepEqual(old,before);
});

test('existing versioned data restores the verified pre-error baseline once and records the correction',()=>{
  const old=oldVersionedNaraProfile(model), before=structuredClone(old), p=read(old);
  assert.equal(old.byKc[key].confidence,0.8917553603403158);
  assert.deepEqual(p.byKc[key],naraBaseline);assert.equal(p.assessment.independentByKc[key],undefined);
  assert.deepEqual(p.practiceLog.events.slice(0,4),old.practiceLog.events);
  const event=p.practiceLog.events.at(-1);
  assert.equal(event.diagnosis.resolution,'score-correction');assert.equal(event.changes.length,1);
  assert.equal(event.changes[0].kcId,key);assert.equal(event.changes[0].after.confidence,1);
  assert.deepEqual(event.totals.before,event.totals.after);assert.deepEqual(old,before);
  assert.deepEqual(read(createUnifiedExport(p)),p);
  assert.deepEqual(read(read(p)),p);
});

function appendClassResult(p,{badNara=false,correct=false}={}) {
  const previous=p, source=structuredClone(p.practiceLog.events[0]);
  p={...p,byKc:{...p.byKc,[key]:updateSkillStats(p.byKc[key],{correct})},assessment:{...p.assessment,independentByKc:{...p.assessment.independentByKc,[key]:updateSkillStats(p.assessment.independentByKc[key],{correct})}}};
  return appendPracticeEvent(previous,p,{id:`extra-${previous.practiceLog.totalEvents}`,questionId:'new-class-question',type:'question',outcome:correct?'correct':'incorrect',
    exercise:badNara?source.exercise:{...source.exercise,form:null},target:badNara?source.target:{...source.target,form:null},
    answer:badNara?'つめたいなら':correct?'i':'na',support:{independent:true,source:'independent',provided:[]},
    diagnosis:{kcId:correct?null:key,confirmedKcIds:[],resolution:'rule',message:'Recorded independent classification'},at:options.at});
}

test('later genuine classification failures and successes survive removal of the nara mistake',()=>{
  const old=appendClassResult(appendClassResult(oldVersionedNaraProfile(model)),{correct:true});
  const p=correctNaraClassification(old,{at:options.at});
  const expected=updateSkillStats(updateSkillStats(naraBaseline,{correct:false}),{correct:true});
  assert.deepEqual(p.byKc[key],expected);
  assert.equal(p.assessment.independentByKc[key].attempts,2);assert.equal(p.assessment.independentByKc[key].correct,1);
  assert.ok(p.byKc[key].confidence<1,'a real later mistake cannot be erased');
});

test('new errors from an older client can be corrected after a previous correction without replaying that correction',()=>{
  const first=read(oldVersionedNaraProfile(model));
  const later=appendClassResult(first,{badNara:true});
  const p=correctNaraClassification(later,{at:options.at});
  assert.deepEqual(p.byKc[key],naraBaseline);
  assert.equal(p.scoreCorrections.iNaraClassification.suppressedEventIds.length,2);
  assert.equal(p.practiceLog.totalEvents,later.practiceLog.totalEvents+1);
  assert.deepEqual(correctNaraClassification(p),p);
});

test('retained correction events prevent double correction even if an older client drops the optional ledger',()=>{
  const first=read(oldVersionedNaraProfile(model));
  const withoutLedger={...first};delete withoutLedger.scoreCorrections;
  assert.deepEqual(correctNaraClassification(withoutLedger),withoutLedger);
  const later=appendClassResult(withoutLedger,{badNara:true});
  const repaired=correctNaraClassification(later,{at:options.at});
  assert.deepEqual(repaired.byKc[key],naraBaseline);
  assert.equal(repaired.practiceLog.totalEvents,later.practiceLog.totalEvents+1);
});

test('missing evidence or a broken score chain never resets unverifiable progress',()=>{
  const old=oldVersionedNaraProfile(model);
  const broken={...old,byKc:{...old.byKc,[key]:updateSkillStats(old.byKc[key],{correct:true})}};
  assert.deepEqual(correctNaraClassification(broken),broken);
  const noEvent={...old,practiceLog:{version:2,totalEvents:4,droppedEntries:4,events:[]}};
  assert.deepEqual(correctNaraClassification(noEvent),noEvent);
});
