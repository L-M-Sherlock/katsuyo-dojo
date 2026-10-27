import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {TEACHING_PAIR_DEFERRALS} from '../app/lib/teaching-pair-deferrals.mjs';
import {USAGE_CARDS, REVIEWED_USAGE_CARDS, usageCardItem, usageCardFor, createUsageCardLookup, resolveUsageCard} from '../app/lib/usage-cards.mjs';
import {EN_USAGE_CARD_OVERLAYS} from '../app/lib/i18n/content/en/current-usage-cards.mjs';
import {eligibleVerbForm, supportsVerbForm, assessFormUsage, USAGE_REVIEW_VERSION} from '../app/lib/form-eligibility.mjs';
import {deriveUnified} from '../app/lib/unified-knowledge.mjs';
import {recognizeForms} from '../app/lib/form-recognition.mjs';
import {normalizeAnswer} from '../app/lib/answer-analysis.mjs';
import {createPracticePlanner} from '../app/lib/practice-planning.mjs';
import {createChallengePlanner} from '../app/lib/challenge-planning.mjs';
import {emptySkillStats} from '../app/lib/adaptive.mjs';
import {assessmentTarget, emptyAssessment, recordIndependentAttempt, reconcileAssessmentCatalog} from '../app/lib/learning-assessment.mjs';
import {verifyTeachingPairHolds} from '../scripts/lib/teaching-pair-holds.mjs';
import {EXPECTED_PRIOR_TEACHING_HOLD_IDS, EXPECTED_CURRENT_TEACHING_HOLD_IDS} from './helpers/current-teaching-hold-scope.mjs';

const id='usage:chau:verb:役立つ:やくだつ',senseId='verb:役立つ:やくだつ',form='chau';
const source=REVIEWED_USAGE_CARDS.find(card=>card.id===id),item=usageCardItem(senseId);
const record=JSON.parse(readFileSync(new URL('../docs/usage-card-shimau-teaching-hold-20261026.json',import.meta.url)));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
let server,model;
before(async()=>{server=await createServer({appType:'custom',logLevel:'silent',server:{middlewareMode:true}});model=(await server.ssrLoadModule('/app/page.tsx')).KNOWLEDGE;});
after(async()=>{await server?.close();});

test('the original exact shimau hold keeps its frozen evidence after later user choices',()=>{
  const hold=TEACHING_PAIR_DEFERRALS.find(row=>row.id===id);
  assert.ok(hold);
  assert.equal(hold.pair,`${senseId}/${form}`);
  assert.equal(hold.evidenceFile,'docs/usage-card-shimau-teaching-hold-20261026.json');
  assert.deepEqual(record.sourceRows.map(row=>row.card),[source]);
  assert.equal(record.sourceRows[0].sourceHash,hash(source));
  assert.equal(record.sourceRows[0].englishHash,hash(record.sourceRows[0].english));
  assert.equal(record.sourceRows[0].previousUsage.status,'allowed');
  assert.equal(EXPECTED_PRIOR_TEACHING_HOLD_IDS.size,9);
  assert.ok(EXPECTED_PRIOR_TEACHING_HOLD_IDS.has(id));
  const priorCards=REVIEWED_USAGE_CARDS.filter(card=>EXPECTED_PRIOR_TEACHING_HOLD_IDS.has(card.id));
  assert.equal(verifyTeachingPairHolds(priorCards),9,'the separately documented original nine choices remain verifiable');
  assert.equal(EXPECTED_CURRENT_TEACHING_HOLD_IDS.size,112);
  assert.deepEqual(new Set(TEACHING_PAIR_DEFERRALS.map(row=>row.id)),EXPECTED_CURRENT_TEACHING_HOLD_IDS);
  assert.equal(verifyTeachingPairHolds(REVIEWED_USAGE_CARDS),112);
  assert.ok(!USAGE_CARDS.some(card=>card.id===id));
  assert.ok(!EN_USAGE_CARD_OVERLAYS.some(row=>row.id===id));
  assert.equal(usageCardFor(item,form),null);
  assert.equal(createUsageCardLookup([{...source,id:'future:yakudatsu-chau'}])(item,form),null);
  assert.equal(resolveUsageCard(source),null);
  assert.ok(resolveUsageCard(source,{allowTeachingHolds:true}));
});

test('the pair remains constructible and recognizable while other completion contexts retain their own decisions',()=>{
  assert.equal(supportsVerbForm(item,form),true);
  assert.equal(eligibleVerbForm(item,form),false);
  assert.equal(assessFormUsage(item,form).reasonCode,'user-directed-pair-hold');
  assert.equal(deriveUnified(item,form).answer,'役立っちゃう');
  const match=recognizeForms(item,'役立っちゃう',normalizeAnswer).find(row=>row.form===form);
  assert.equal(match.usage.reasonCode,'user-directed-pair-hold');
  for(const sibling of ['teshimau','teshimauPast','teshimauNegative','teshimauNegativePast'])assert.ok(usageCardFor(item,sibling),sibling);
  for(const sibling of ['verb:できる:できる','verb:勝つ:かつ'])assert.ok(usageCardFor(usageCardItem(sibling),'chau'),sibling);
});

test('normal practice and challenge exclude the exact pair without clearing its old retest anchors',()=>{
  const held=model.registryExercises.find(e=>e.form===form&&e.item.surface==='役立つ');
  assert.ok(held);
  assert.ok(!model.exercises.some(e=>e.id===held.id));
  const byKc=Object.fromEntries(model.components.map(kc=>[kc.id,{...emptySkillStats(),attempts:5,correct:5,confidence:1,bestConfidence:1,filteredAccuracy:1}]));
  const profile={byKc,assessment:emptyAssessment(),rotation:0,introducedKcIds:model.components.filter(kc=>kc.gating).map(kc=>kc.id),coursePractice:{},recentWordKeys:[]};
  const practice=createPracticePlanner(model),challenge=createChallengePlanner(model);
  for(let seed=0;seed<4;seed++){
    const questions=practice.assign(practice.plan('teshimauChau',profile),profile,{seed});
    assert.ok(questions.length);
    assert.ok(questions.every(({candidate})=>candidate.id!==held.id));
    const challenges=challenge.questions('teshimauChau',profile,{seed,length:64});
    assert.ok(challenges.length);
    assert.ok(challenges.every(({candidate})=>candidate.id!==held.id));
  }
  const failed=recordIndependentAttempt(emptyAssessment(),{exercise:held,questionId:'historical-yakudatsu-chau',correct:false,at:'2026-10-26T00:00:00Z'});
  const before=structuredClone(failed),key=assessmentTarget(held).key;
  const reconciled=reconcileAssessmentCatalog(failed,model.exercises,USAGE_REVIEW_VERSION);
  assert.deepEqual(reconciled.pending[key],failed.pending[key]);
  for(const field of ['byTarget','independentByKc','assistedByKc','originalCount'])assert.deepEqual(reconciled[field],failed[field]);
  assert.deepEqual(failed,before);
});
