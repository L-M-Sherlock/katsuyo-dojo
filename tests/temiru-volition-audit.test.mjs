import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyTemiruAudit, readTemiruAudit} from '../scripts/verify-temiru-volition-audit.mjs';

test('the independent review covers all frozen temiru-family cards and preserves open findings',()=>{
  const report=verifyTemiruAudit();
  assert.equal(report.sourceCount,627);
  assert.equal(report.approved,607);
  assert.equal(report.revise,19);
  assert.equal(report.uncertain,1);
  assert.equal(report.directDeferrals,0);
  assert.equal(new Set(report.rows.map(row=>row.id)).size,627);
  assert.ok(report.rows.some(row=>row.id==='usage:temiruPast:verb:笑う:わらう'&&row.status==='revise'));
  assert.ok(report.rows.some(row=>row.id==='usage:temiruNegative:verb:終わる:おわる'&&row.status==='uncertain'));
  assert.ok(!report.rows.some(row=>row.id.includes('temiruNegativePast')));
});

test('review proof rejects stale receipts, missing scope and inflated approval counts',()=>{
  const source=readTemiruAudit();
  const edited=structuredClone(source);
  const batch=edited.batches[0],file=batch.reportPath;
  const report=JSON.parse(Buffer.from(batch.reviewDelivery.artifacts[file],'base64'));
  report.rows[0].reason='Unverified replacement judgment.';
  batch.reviewDelivery.artifacts[file]=Buffer.from(JSON.stringify(report)).toString('base64');
  assert.throws(()=>verifyTemiruAudit(edited),/artifact drift/);
  assert.throws(()=>verifyTemiruAudit({...source,batches:source.batches.slice(1)}),/missing cards/);
  assert.throws(()=>verifyTemiruAudit({...source,summary:{...source.summary,approved:627,revise:0,uncertain:0}}),/summary differs/);
});
