import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {REVIEWED_USAGE_CARDS} from '../app/lib/usage-cards.mjs';
import {TEACHING_PAIR_DEFERRALS} from '../app/lib/teaching-pair-deferrals.mjs';
import {isTeachingFormDeferred} from '../app/lib/teaching-form-deferrals.mjs';
import {EN_USAGE_CARD_OVERLAYS} from '../app/lib/i18n/content/en/current-usage-cards.mjs';
import {EN_USAGE_CARD_OVERLAYS as BASELINE_ENGLISH} from '../app/lib/i18n/content/en/usage-cards.mjs';
import {EN_REVIEWED_USAGE_CARD_OVERLAYS} from '../app/lib/i18n/content/en/reviewed-usage-card-revisions.mjs';
import {verifyTemiruAudit} from './verify-temiru-volition-audit.mjs';
import {readReviewedUsageRevisionsProof, revisionHash, verifyPortableRevisionDelivery} from './verify-reviewed-usage-revisions.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const readTemiruResolution = () => JSON.parse(fs.readFileSync(new URL('../docs/usage-card-temiru-user-resolution-20261026.json', import.meta.url)));

/** Close each original finding through an explicit user hold or a reviewed successor. */
export function verifyTemiruResolution(record = readTemiruResolution()) {
  const audit = verifyTemiruAudit(), original = new Map(audit.rows.map(row => [row.id, row]));
  const proof = readReviewedUsageRevisionsProof(), rounds = proof.rounds.slice(0, record.appliedReviewRounds);
  ensure(record.schemaVersion === 1 && record.auditProofSha256 === sha(fs.readFileSync(new URL('../docs/usage-card-temiru-volition-audit-20261026.json.gz', import.meta.url)))
    && record.initialReviewRounds === 3 && record.appliedReviewRounds === 9
    && rounds.length === record.appliedReviewRounds && revisionHash(rounds) === record.appliedReviewRoundsHash
    && revisionHash(rounds.slice(0, 3)) === record.initialReviewRoundsHash,
  'Resolution baseline or frozen review prefix drift');
  ensure(same(rounds.slice(3).map(round => round.id), record.newReviewRoundIds), 'Resolution round scope drift');
  const reviewed = new Map();
  for (const round of rounds.slice(3)) for (const batch of round.batches) {
    const files = verifyPortableRevisionDelivery(batch.authorDelivery, 'author', batch.id);
    const notes = JSON.parse(files.get(batch.paths.notes));
    for (const note of notes) {
      ensure(!reviewed.has(note.id), 'Repeated resolution review');
      reviewed.set(note.id, {disposition: note.disposition, reviewer: batch.reviewer});
    }
  }
  const cards = new Map(REVIEWED_USAGE_CARDS.map(card => [card.id, card]));
  const english = new Map(EN_USAGE_CARD_OVERLAYS.map(row => [row.id, row]));
  const retainedEnglish = new Map([...BASELINE_ENGLISH, ...EN_REVIEWED_USAGE_CARD_OVERLAYS].map(row => [row.id, row]));
  const holds = new Map(TEACHING_PAIR_DEFERRALS.map(row => [row.id, row]));
  const expected = new Set([...audit.rows.filter(row => row.status !== 'approved').map(row => row.id), 'usage:temiruPast:verb:いる:いる']);
  const seen = new Set(); let userHeld = 0, revised = 0, retained = 0;
  for (const row of record.rows) {
    const source = original.get(row.id);
    ensure(expected.has(row.id) && !seen.has(row.id) && source?.sourceHash === row.sourceHash,
      `${row.id}: missing, duplicate or stale resolution source`);
    seen.add(row.id);
    if (row.action === 'hold') {
      const hold = holds.get(row.id);
      ensure(hold?.sourceHash === row.sourceHash && hold.basis === row.basis
        && revisionHash(cards.get(row.id)) === row.sourceHash && !english.has(row.id)
        && !reviewed.has(row.id), `${row.id}: unverified user hold`);
      userHeld++;
    } else {
      const review = reviewed.get(row.id);
      // A later whole-form hold removes current exercises and English output,
      // while this older resolution still binds its approved retained object.
      const overlay = english.get(row.id) ?? (isTeachingFormDeferred(cards.get(row.id)?.form)
        ? retainedEnglish.get(row.id) : undefined);
      ensure(['revise', 'retain'].includes(row.action) && review?.disposition === row.action
        && review.reviewer === row.reviewer && !holds.has(row.id)
        && revisionHash(cards.get(row.id)) === row.finalHash
        && overlay && revisionHash(overlay) === row.englishHash,
      `${row.id}: missing or stale independent repair`);
      if (row.action === 'retain') {
        ensure(row.finalHash === row.sourceHash, `${row.id}: retained source changed`); retained++;
      } else {
        ensure(row.finalHash !== row.sourceHash, `${row.id}: unchanged repair`); revised++;
      }
    }
  }
  ensure(seen.size === expected.size && seen.size === record.sourceCount && reviewed.size === revised + retained,
    'Resolution scope has missing findings');
  const summary = {userHeld, revised, retained, openFindings: 0};
  ensure(same(summary, record.summary), 'Resolution summary differs from actual dispositions');
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(verifyTemiruResolution()));
}
