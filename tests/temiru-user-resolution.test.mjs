import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyTemiruResolution, readTemiruResolution} from '../scripts/verify-temiru-user-resolution.mjs';
import {USAGE_CARDS, REVIEWED_USAGE_CARDS, resolveUsageCard, usageCardIssues, usageCardItem} from '../app/lib/usage-cards.mjs';
import {assessFormUsage} from '../app/lib/form-eligibility.mjs';
import { EXPECTED_CURRENT_FORM_HOLDS } from './helpers/four-form-teaching-hold-scope.mjs';

test('every user-adjudicated finding is held, repaired or retained with a complete independent chain',()=>{
  assert.deepEqual(verifyTemiruResolution(),{userHeld:8,revised:8,retained:5,openFindings:0});
  const take=USAGE_CARDS.find(card=>card.id==='usage:temiru:verb:取る:とる');
  const resolved=resolveUsageCard(take);
  assert.equal([...take.before,resolved.target,...take.after].map(part=>part.text).join(''),'内側のサイズ表示を確かめるため、その帽子を手に取ってみるね。');
  const change=USAGE_CARDS.find(card=>card.id==='usage:temiruNegative:verb:変わる:かわる');
  assert.equal([...change.before,resolveUsageCard(change).target,...change.after].map(part=>part.text).join(''),'いつも聞き役だけど、たまには少し変わってみない？');
  for(const id of ['usage:temiruNegative:verb:届ける:とどける','usage:temiruRequest:verb:開ける:あける','usage:temiruDesireNegative']){
    const card=REVIEWED_USAGE_CARDS.find(row=>row.id===id);
    assert.ok(card,id);
    assert.equal(USAGE_CARDS.includes(card),!EXPECTED_CURRENT_FORM_HOLDS.has(card.form),id);
    const text=card.before.map(part=>part.text).join(''),reading=card.before.map(part=>part.reading??part.text).join('');
    const katakana=text.match(/トマト|ドア|コーヒー/)[0];
    assert.ok(reading.includes(katakana),id);
  }
});

test('historical proof inspection is explicit and cannot reopen teaching or bypass other semantic exclusions',()=>{
  const held=REVIEWED_USAGE_CARDS.find(card=>card.id==='usage:temiruNegative:verb:運ぶ:はこぶ');
  assert.equal(resolveUsageCard(held),null);
  assert.ok(resolveUsageCard(held,{allowTeachingHolds:true}));
  assert.ok(usageCardIssues([held]).length);
  assert.deepEqual(usageCardIssues([held],{allowTeachingHolds:true}),[]);
  assert.equal(assessFormUsage(usageCardItem(held.senseId),held.form).reasonCode,'user-directed-pair-hold');
  const blockedItem=usageCardItem('verb:間に合う:まにあう');
  const blocked={...held,id:'semantic-exclusion',senseId:blockedItem.id,meaning:blockedItem.meaning,form:'temiru'};
  assert.equal(assessFormUsage(blockedItem,'temiru').context,undefined);
  assert.equal(resolveUsageCard(blocked,{allowTeachingHolds:true}),null);
});

test('resolution proof rejects omitted findings, stale final hashes and reclassified user holds',()=>{
  const proof=readTemiruResolution();
  assert.throws(()=>verifyTemiruResolution({...proof,rows:proof.rows.slice(1)}),/missing findings/);
  const changed=structuredClone(proof);
  changed.rows.find(row=>row.action==='revise').finalHash='0'.repeat(64);
  assert.throws(()=>verifyTemiruResolution(changed),/stale independent repair/);
  const reopened=structuredClone(proof);
  reopened.rows[0].action='retain';
  assert.throws(()=>verifyTemiruResolution(reopened),/independent repair/);
});
