import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { reviewedLexicalSense } from '../../app/lib/lexical-usage.mjs';
import { revisionHash, verifyPortableRevisionDelivery } from '../../scripts/verify-reviewed-usage-revisions.mjs';
import { readVerifiedReviewedUsageCheckpoint } from '../../scripts/lib/reviewed-usage-history.mjs';

// Policy expectations are independent of the production registry. The original
// 2026-10-17 form hold and all exact-pair decisions retain their own evidence.
export const EXPECTED_NEW_FORM_HOLDS = new Set([
  'tearuNegative',
  'tearuNegativePast',
  'temiruDesireNegative',
  'temiruDesireNegativePast',
]);

export const EXPECTED_CURRENT_FORM_HOLDS = new Set([
  'temiruNegativePast',
  ...EXPECTED_NEW_FORM_HOLDS,
]);

export const EXPECTED_DEFERRED_COMPONENT_IDS = new Set([
  'exception.aru-negative',
  'facet.apply.tearu.negative',
  'facet.apply.tearu.negativePast',
  'facet.apply.temiru.negativePast',
  'facet.chain.temiruDesireNegative',
  'facet.chain.temiruDesireNegativePast',
]);

/** Rebuild the pre-policy exercises from frozen applicability evidence. */
export function newFormHoldHistory(model) {
  const proof=JSON.parse(gunzipSync(readFileSync(new URL('../../docs/form-hold-baseline-20261027.json.gz',import.meta.url))));
  const files=verifyPortableRevisionDelivery(proof.sourceDelivery,'author','formhold/00');
  const rows=JSON.parse(files.get(proof.paths.held));
  const scope=JSON.parse(files.get(proof.paths.scope));
  const priorPairHoldIds=new Set(scope.priorPairHolds.map(row=>row.id));
  assert.equal(rows.length,235);
  const checkpoint=readVerifiedReviewedUsageCheckpoint(17);
  const missing=[],history=[];
  for(const row of rows){
    assert.ok(EXPECTED_NEW_FORM_HOLDS.has(row.card.form),row.id);
    assert.equal(revisionHash(row.card),row.sourceHash,row.id);
    assert.deepEqual(checkpoint.cards.get(row.id),row.card,row.id);
    assert.deepEqual(checkpoint.english.get(row.id),row.english,row.id);
    if(priorPairHoldIds.has(row.id))continue;
    assert.ok(row.previousUsage.status==='allowed'||row.previousUsage.status==='context-required'&&row.previousUsage.context,row.id);
    const exercise=model.registryExercises.find(candidate=>`${reviewedLexicalSense(candidate.item)?.id}/${candidate.form}`===`${row.card.senseId}/${row.card.form}`);
    if(!exercise){missing.push(row.id);continue;}
    history.push({...exercise,context:row.previousUsage.context});
  }
  assert.deepEqual(missing,['usage:tearuNegative:verb:呼ぶ:よぶ','usage:tearuNegativePast:verb:呼ぶ:よぶ'],
    'these two retained cards were already absent from the pre-policy exercise registry');
  assert.equal(history.length,231);
  assert.equal(new Set(history.map(exercise=>exercise.id)).size,231);
  return history;
}
