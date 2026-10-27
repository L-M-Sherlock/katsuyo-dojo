import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDelivery} from '../.agents/skills/write-katsuyo-usage-cards/scripts/delivery-store.mjs';
import {readReviewedUsageRevisionsProof, verifyPortableRevisionDelivery} from '../scripts/verify-reviewed-usage-revisions.mjs';
import {readShimauUserResolution, verifyShimauUserResolution} from '../scripts/verify-shimau-user-resolution.mjs';
import {TEACHING_PAIR_DEFERRALS} from '../app/lib/teaching-pair-deferrals.mjs';
import {EXPECTED_COMPLETION_TONE_USER_HOLD_IDS} from './helpers/current-teaching-hold-scope.mjs';

test('the frozen 24/94 choice stays intact while all 17 text findings need approved successors', () => {
  assert.deepEqual(verifyShimauUserResolution(undefined,{requireAncillaryClosure:true}), {
    sourceCount: 118, retainedJapanese: 24, newTeachingHolds: 94, ancillaryOpen: 17,
    currentAncillaryOpen:0, ancillaryResolved:17,
  });
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../docs/usage-card-shimau-user-resolution-20261026.json.gz',import.meta.url))).digest('hex'),
    '204fc175caa21d8b61c4a793ba3446bba296fcf8d20ba22b4cd506b6a5fd3327','the original user choice bytes are immutable');
  const record = readShimauUserResolution();
  assert.equal(new Set([...record.retainedIds, ...record.holdIds]).size, 118);
  const originalHolds = new Set([...record.priorHoldIds, ...record.holdIds]);
  assert.equal(originalHolds.size, 103);
  assert.equal(TEACHING_PAIR_DEFERRALS.length, 112);
  assert.deepEqual(new Set(TEACHING_PAIR_DEFERRALS.filter(row => !originalHolds.has(row.id)).map(row => row.id)),
    EXPECTED_COMPLETION_TONE_USER_HOLD_IDS);
  for (const id of [
    'usage:teshimauNegative:verb:逃げる:にげる',
    'usage:teshimauNegative:verb:呼ぶ:よぶ',
    'usage:teshimauNegative:verb:迎える:むかえる',
    'usage:teshimauNegativePast:verb:住む:すむ',
  ]) assert.ok(record.holdIds.includes(id), id);
  for (const id of ['usage:chau:verb:伝える:つたえる', 'usage:teshimau:verb:座る:すわる', 'usage:teshimauNegativePast:verb:覚える:おぼえる']) {
    assert.ok(record.retainedIds.includes(id), id);
  }
});

test('user choices cannot conceal edited sources, missing entries, inflated approvals or lost ancillary findings', () => {
  const record = readShimauUserResolution();
  const edited = structuredClone(record), file = edited.paths.assessment;
  edited.sourceDelivery.artifacts[file] = Buffer.from('Replacement assessment').toString('base64');
  assert.throws(() => verifyShimauUserResolution(edited), /artifact drift/);
  assert.throws(() => verifyShimauUserResolution({...record, decisions: record.decisions.slice(1)}), /decision drift/);
  assert.throws(() => verifyShimauUserResolution({...record, summary: {...record.summary, ancillaryOpen: 0}}), /summary differs/);
  assert.throws(() => verifyShimauUserResolution({...record, priorHoldsHash: '0'.repeat(64)}), /Earlier user holds changed/);
  const emptyHash = createHash('sha256').update('[]').digest('hex');
  assert.throws(() => verifyShimauUserResolution({...record, priorHoldIds: [], priorHoldsHash: emptyHash}), /partition the complete registry/);
  const substituted = structuredClone(record);
  substituted.priorHoldIds[0] = [...EXPECTED_COMPLETION_TONE_USER_HOLD_IDS][0];
  assert.throws(() => verifyShimauUserResolution(substituted), /partition the complete registry/);
});


function reseal(t,batch,phase,files) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'katsuyo-invalid-text-proof-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const original=phase==='author'?batch.authorDelivery:batch.reviewDelivery;
  const delivery=createDelivery({root,batch:batch.id,phase,revision:original.revision+1,artifacts:files});
  return {...delivery,artifacts:Object.fromEntries([...files].map(([file,bytes])=>[file,bytes.toString('base64')]))};
}
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const textRounds=proof=>proof.rounds.filter(round=>round.id.startsWith('shimau-text-fix-20261026-'));

test('missing or narrowed correction rounds cannot erase historical outstanding findings',()=>{
  const record=readShimauUserResolution(),proof=readReviewedUsageRevisionsProof();
  const originalOnly={...proof,rounds:proof.rounds.slice(0,9)};
  assert.throws(()=>verifyShimauUserResolution(record,{revisionProof:originalOnly,requireAncillaryClosure:true}),/Missing independent text-correction closure/);
  const missing=structuredClone(proof);
  missing.rounds=missing.rounds.filter(round=>round.id!==textRounds(proof)[0].id);
  assert.throws(()=>verifyShimauUserResolution(record,{revisionProof:missing,requireAncillaryClosure:true}),/rounds are missing/);
  const narrowed=structuredClone(proof),round=textRounds(narrowed)[0];
  round.scopeIds.pop();round.sourceCards.pop();round.sourceCount--;
  assert.throws(()=>verifyShimauUserResolution(record,{revisionProof:narrowed,requireAncillaryClosure:true}),/incomplete exact text-correction scope|incomplete or stale frozen form scope|incomplete or reordered author scope|invalid exact subset scope|input baseline drift or duplicate review/);
  const stale=structuredClone(proof);
  textRounds(stale)[0].sourceCards[0].scene+='changed original';
  assert.throws(()=>verifyShimauUserResolution(record,{revisionProof:stale,requireAncillaryClosure:true}),/source does not match the frozen user choice|incomplete or stale frozen form scope/);
});

test('freshly sealed non-approval and self-review cannot close a text finding',t=>{
  const record=readShimauUserResolution(),proof=readReviewedUsageRevisionsProof();
  const rejected=structuredClone(proof),batch=textRounds(rejected)[0].batches[0];
  const files=verifyPortableRevisionDelivery(batch.reviewDelivery,'review',batch.id);
  const report=JSON.parse(files.get(batch.paths.report));
  report.rows[0].status='uncertain';
  files.set(batch.paths.report,Buffer.from(JSON.stringify(report)));
  batch.reviewDelivery=reseal(t,batch,'review',files);
  assert.throws(()=>verifyShimauUserResolution(record,{revisionProof:rejected,requireAncillaryClosure:true}),/unresolved.*bilingual.*approval/);
  const self=structuredClone(proof),selfBatch=textRounds(self)[0].batches[0];
  selfBatch.reviewer=selfBatch.author;
  assert.throws(()=>verifyShimauUserResolution(record,{revisionProof:self,requireAncillaryClosure:true}),/independent text-correction report|invalid independent reviewer or author/);
});

test('an English-only correction requires changed English prose and preserves the complete canonical source',t=>{
  const record=readShimauUserResolution(),proof=readReviewedUsageRevisionsProof();
  const selected=record.decisions.find(row=>row.action==='retain-japanese'&&JSON.stringify(row.ancillaryOpen)==='["english"]');
  assert.ok(selected);
  const noop=structuredClone(proof),round=textRounds(noop).find(row=>row.scopeIds.includes(selected.id)),batch=round.batches[0];
  const author=verifyPortableRevisionDelivery(batch.authorDelivery,'author',batch.id);
  const notes=JSON.parse(author.get(batch.paths.notes)),input=JSON.parse(author.get(batch.paths.input));
  const index=notes.findIndex(row=>row.id===selected.id);
  const oldEnglish=input.rows[index].english;
  const {id,sourceHash,...prose}=oldEnglish;
  assert.equal(id,selected.id);assert.equal(sourceHash,selected.sourceHash);
  notes[index].english=prose;
  author.set(batch.paths.notes,Buffer.from(JSON.stringify(notes)));
  batch.authorDelivery=reseal(t,batch,'author',author);
  const review=verifyPortableRevisionDelivery(batch.reviewDelivery,'review',batch.id);
  const report=JSON.parse(review.get(batch.paths.report));
  report.sourceReceipt=batch.authorDelivery.receipt;
  report.rows[index].englishHash=hash(oldEnglish);
  review.set(batch.paths.report,Buffer.from(JSON.stringify(report)));
  batch.reviewDelivery=reseal(t,batch,'review',review);
  assert.throws(()=>verifyShimauUserResolution(record,{revisionProof:noop,requireAncillaryClosure:true}),/outstanding text finding has no corresponding correction|Runtime revision data differs/);
});


test('a supplied correction proof must satisfy the complete author and reviewer protocol',()=>{
  const record=readShimauUserResolution(),proof=readReviewedUsageRevisionsProof();
  for(const change of [
    batch=>{batch.authorModel='gpt-6-sol';},
    batch=>{batch.authorEffort='medium';},
    batch=>{batch.reviewerModel='gpt-6-luna';},
    batch=>{batch.reviewerEffort='low';},
    batch=>{batch.author=batch.reviewer;},
  ]){
    const invalid=structuredClone(proof);
    change(textRounds(invalid)[0].batches[0]);
    assert.throws(()=>verifyShimauUserResolution(record,{revisionProof:invalid,requireAncillaryClosure:true}),/invalid independent reviewer or author/);
  }
});
