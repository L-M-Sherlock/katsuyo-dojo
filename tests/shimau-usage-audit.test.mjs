import test from 'node:test';
import assert from 'node:assert/strict';
import {isShimauAuditForm} from '../scripts/lib/shimau-audit-scope.mjs';
import {verifyShimauAudit, readShimauAudit} from '../scripts/verify-shimau-usage-audit.mjs';

test('the audit scope covers completion, contraction, continuations and actual passive-completion chains',()=>{
  for(const form of ['teshimau','chau','teshimauPast','teshimauNegative','teshimauNegativePast','passiveCompletion','passiveCompletionPast'])assert.ok(isShimauAuditForm(form),form);
  for(const form of [null,'teoku','temiru','causativeReceivePast'])assert.equal(isShimauAuditForm(form),false,form);
  const report=verifyShimauAudit();
  assert.equal(report.sourceCount,761);
  assert.equal(report.approved,643);
  assert.equal(report.revise,78);
  assert.equal(report.uncertain,40);
  assert.equal(new Set(report.rows.map(row=>row.id)).size,761);
  assert.equal(report.rows.filter(row=>row.form==='teshimauNegativePast'&&row.status!=='approved').length,67);
  assert.equal(report.rows.filter(row=>row.form==='chau'&&row.status!=='approved').length,8);
});

test('the frozen audit rejects edited reviewer bytes, missing scope and inflated approvals',()=>{
  const proof=readShimauAudit(),edited=structuredClone(proof),batch=edited.batches[0],file=batch.reportPath;
  const report=JSON.parse(Buffer.from(batch.reviewDelivery.artifacts[file],'base64'));
  report.rows[0].reason='Unverified replacement review.';
  batch.reviewDelivery.artifacts[file]=Buffer.from(JSON.stringify(report)).toString('base64');
  assert.throws(()=>verifyShimauAudit(edited),/artifact drift/);
  assert.throws(()=>verifyShimauAudit({...proof,batches:proof.batches.slice(1)}),/missing cards/);
  assert.throws(()=>verifyShimauAudit({...proof,summary:{...proof.summary,approved:761,revise:0,uncertain:0}}),/summary differs/);
});
