/** Read-only checkpoints from a fully verified bilingual review replay. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import {REVIEWED_REVISIONS_PROOF, verifyCurrentReviewedUsageRevisions} from '../verify-reviewed-usage-revisions.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const ensure = (condition, message) => { if (!condition) throw Error(message); };

/** A later append must preserve the exact original JSON document at its boundary. */
export function verifyReviewedProofPrefix(expectedSha256, roundCount = 17) {
  const bytes = fs.readFileSync(REVIEWED_REVISIONS_PROOF);
  const proof = JSON.parse(bytes.toString('utf8'));
  ensure(Array.isArray(proof.rounds) && proof.rounds.length >= roundCount,
    'Reviewed history lost its frozen checkpoint');
  const original = {...proof, rounds: proof.rounds.slice(0, roundCount)};
  ensure(sha(`${JSON.stringify(original, null, 2)}\n`) === expectedSha256,
    'Historical reviewed proof prefix changed');
  return proof;
}

/**
 * Capture a single checkpoint, then finish verification of the entire current
 * chain before returning it. Cards and English come from the same replay step;
 * callers cannot combine arbitrary older versions of their two components.
 */
export function readVerifiedReviewedUsageCheckpoint(roundCount = 17) {
  ensure(Number.isSafeInteger(roundCount) && roundCount >= 0, 'Invalid reviewed checkpoint round');
  const proof = JSON.parse(fs.readFileSync(REVIEWED_REVISIONS_PROOF, 'utf8'));
  let checkpoint;
  const summary = verifyCurrentReviewedUsageRevisions({proof, checkpointRound: roundCount,
    onCheckpoint: value => { checkpoint = value; }});
  ensure(checkpoint, 'Requested reviewed checkpoint is absent');
  return {proof, summary, cards: new Map(checkpoint.cards.map(card => [card.id, card])),
    english: new Map(checkpoint.english.map(row => [row.id, row]))};
}
