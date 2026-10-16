import assert from 'node:assert/strict';
import { REVIEWED_USAGE_CARD_DEFERRALS } from '../../app/lib/usage-cards/reviewed-revisions.mjs';
import { reviewedLexicalSense } from '../../app/lib/lexical-usage.mjs';
import { readReviewedUsageRevisionsProof, revisionHash } from '../../scripts/verify-reviewed-usage-revisions.mjs';

/** Reconstruct only documented retired exercises; never regenerate old hashes. */
export function reviewedDeferralHistory(model) {
  const proof = readReviewedUsageRevisionsProof();
  const records = (proof?.rounds ?? []).flatMap(round => (round.deferrals ?? []).map(row => ({ row, round })));
  return REVIEWED_USAGE_CARD_DEFERRALS.map(current => {
    const evidence = records.findLast(({ row }) => row.id === current.id);
    assert.ok(evidence, `${current.id}: exact deferral has portable evidence`);
    const { row, round } = evidence;
    assert.equal(row.pair, current.pair);
    assert.equal(row.sourceHash, current.sourceHash);
    assert.equal(revisionHash(round.sourceCards.find(card => card.id === current.id)), row.sourceHash);
    assert.ok(row.previousUsage.status === 'allowed'
      || (row.previousUsage.status === 'context-required' && row.previousUsage.context));
    const exercise = model.registryExercises.find(candidate => `${reviewedLexicalSense(candidate.item)?.id}/${candidate.form}` === row.pair);
    assert.ok(exercise, `${row.pair}: morphology remains in the registry`);
    return { ...exercise, context: row.previousUsage.context };
  });
}
