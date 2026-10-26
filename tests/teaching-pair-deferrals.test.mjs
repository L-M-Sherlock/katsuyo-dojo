import {EXPECTED_TEMIRU_TEACHING_HOLD_IDS, EXPECTED_TEMIRU_TEACHING_HOLD_PAIRS} from './helpers/temiru-teaching-hold-scope.mjs';
import assert from 'node:assert/strict';
import {test, before, after} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {TEACHING_PAIR_DEFERRALS, isUsageCardTeachingDeferred} from '../app/lib/teaching-pair-deferrals.mjs';
import {USAGE_CARDS, REVIEWED_USAGE_CARDS, usageCardFor, usageCardItem, createUsageCardLookup} from '../app/lib/usage-cards.mjs';
import {EN_USAGE_CARD_OVERLAYS} from '../app/lib/i18n/content/en/current-usage-cards.mjs';
import {assessFormUsage, eligibleVerbForm, supportsVerbForm, USAGE_REVIEW_VERSION} from '../app/lib/form-eligibility.mjs';
import {deriveUnified} from '../app/lib/unified-knowledge.mjs';
import {recognizeForms} from '../app/lib/form-recognition.mjs';
import {normalizeAnswer} from '../app/lib/answer-analysis.mjs';
import {assessmentTarget, emptyAssessment, recordIndependentAttempt, reconcileAssessmentCatalog} from '../app/lib/learning-assessment.mjs';
import {emptySkillStats} from '../app/lib/adaptive.mjs';
import {createPracticePlanner} from '../app/lib/practice-planning.mjs';
import {createChallengePlanner} from '../app/lib/challenge-planning.mjs';
import {verifyTeachingPairHolds} from '../scripts/lib/teaching-pair-holds.mjs';

const id='usage:temiruPast:verb:いる:いる',form='temiruPast',senseId='verb:いる:いる';
const source=REVIEWED_USAGE_CARDS.find(card=>card.id===id),item=usageCardItem(senseId);
const evidence=JSON.parse(readFileSync(new URL('../docs/usage-card-temiru-teaching-hold-20261026.json',import.meta.url)));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
let server,model;
before(async()=>{
  server=await createServer({appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
  model=(await server.ssrLoadModule('/app/page.tsx')).KNOWLEDGE;
});
after(async()=>{await server?.close();});

test('exact user teaching holds retain their bilingual sources and remove only the documented pairs',()=>{
  assert.deepEqual(new Set(TEACHING_PAIR_DEFERRALS.map(row=>row.pair)),EXPECTED_TEMIRU_TEACHING_HOLD_PAIRS);
  assert.deepEqual(new Set(TEACHING_PAIR_DEFERRALS.map(row=>row.id)),EXPECTED_TEMIRU_TEACHING_HOLD_IDS);
  for(const hold of TEACHING_PAIR_DEFERRALS){
    const original=REVIEWED_USAGE_CARDS.find(card=>card.id===hold.id),record=evidence.sourceRows.find(row=>row.id===hold.id);
    assert.equal(hash(original),hold.sourceHash,hold.id);
    assert.deepEqual(original,record.card,hold.id);
    assert.equal(USAGE_CARDS.some(card=>card.id===hold.id),false,hold.id);
    assert.equal(EN_USAGE_CARD_OVERLAYS.some(row=>row.id===hold.id),false,hold.id);
  }
  assert.equal(verifyTeachingPairHolds(REVIEWED_USAGE_CARDS),8);
  assert.deepEqual(USAGE_CARDS,REVIEWED_USAGE_CARDS.filter(card=>!isUsageCardTeachingDeferred(card)));
  assert.equal(USAGE_CARDS.some(card=>card.id===id),false);
  assert.equal(EN_USAGE_CARD_OVERLAYS.some(row=>row.id===id),false);
  assert.equal(usageCardFor(item,form),null);
  assert.equal(createUsageCardLookup([{...source,id:'future:held-pair'}])(item,form),null);
  for(const sibling of ['temiru','temiruNegative'])assert.ok(usageCardFor(item,sibling),sibling);
  for(const word of ['verb:待つ:まつ','verb:残る:のこる','verb:住む:すむ'])assert.ok(usageCardFor(usageCardItem(word),form),word);
});

test('each exact hold preserves complete morphology and answer recognition',()=>{
  for(const hold of TEACHING_PAIR_DEFERRALS){
    const heldItem=usageCardItem(hold.senseId),heldForm=hold.form;
    assert.equal(supportsVerbForm(heldItem,heldForm),true,hold.id);
    assert.equal(eligibleVerbForm(heldItem,heldForm),false,hold.id);
    const usage=assessFormUsage(heldItem,heldForm);
    assert.equal(usage.status,'context-required',hold.id);
    assert.equal(usage.context,undefined,hold.id);
    assert.equal(usage.reasonCode,'user-directed-pair-hold',hold.id);
    const answer=deriveUnified(heldItem,heldForm).answer;
    const recognized=recognizeForms(heldItem,answer,normalizeAnswer).find(row=>row.form===heldForm);
    assert.ok(recognized,hold.id);
    assert.equal(recognized.usage.reasonCode,'user-directed-pair-hold',hold.id);
  }
  assert.equal(deriveUnified(item,form).answer,'いてみた');
});

test('practice and challenge cannot select the held pair and historical retest evidence is preserved',()=>{
  const mastered=Object.fromEntries(model.components.map(kc=>[kc.id,{...emptySkillStats(),attempts:5,correct:5,filteredAccuracy:1,confidence:1,bestConfidence:1}]));
  const profile={byKc:mastered,assessment:emptyAssessment(),rotation:0,introducedKcIds:model.components.filter(kc=>kc.gating).map(kc=>kc.id),coursePractice:{},recentWordKeys:[]};
  const practice=createPracticePlanner(model),challenge=createChallengePlanner(model);
  for(const hold of TEACHING_PAIR_DEFERRALS){
    const held=model.registryExercises.find(e=>e.form===hold.form&&e.item.surface===usageCardItem(hold.senseId).surface);
    assert.ok(held,hold.id);
    assert.ok(!model.exercises.some(e=>e.id===held.id),hold.id);
    for(let seed=0;seed<2;seed++){
      const planned=practice.assign(practice.plan(held.courseId,profile),profile,{seed});
      assert.ok(planned.length,hold.id);
      assert.ok(planned.every(({candidate})=>candidate.id!==held.id),hold.id);
      const questions=challenge.questions(held.courseId,profile,{length:48,seed});
      assert.ok(questions.length,hold.id);
      assert.ok(questions.every(({candidate})=>candidate.id!==held.id),hold.id);
    }
    const failed=recordIndependentAttempt(emptyAssessment(),{exercise:held,questionId:`historical:${hold.id}`,correct:false,at:'2026-10-26T00:00:00Z'});
    const before=structuredClone(failed),key=assessmentTarget(held).key;
    const reconciled=reconcileAssessmentCatalog(failed,model.exercises,USAGE_REVIEW_VERSION);
    assert.deepEqual(reconciled.pending[key],failed.pending[key],`${hold.id}: compatible other-word retests still satisfy the same target`);
    for(const field of ['byTarget','independentByKc','assistedByKc','originalCount'])assert.deepEqual(reconciled[field],failed[field],`${hold.id}/${field}`);
    assert.deepEqual(failed,before);
  }
});

test('a hidden teaching card cannot conceal changed historical canonical or English content',()=>{
  assert.throws(()=>verifyTeachingPairHolds(REVIEWED_USAGE_CARDS.map(card=>card.id===id?{...card,scene:'changed hidden source'}:card)),/held canonical source changed/);
  assert.throws(()=>verifyTeachingPairHolds(REVIEWED_USAGE_CARDS,[{...evidence.sourceRows[0].english,scene:'Changed hidden English.'}]),/held English source changed/);
  const corrupted=structuredClone(evidence);
  corrupted.sourceRows[0].card.scene='changed snapshot';
  assert.throws(()=>verifyTeachingPairHolds(REVIEWED_USAGE_CARDS,undefined,corrupted),/stale teaching-hold evidence/);
});
