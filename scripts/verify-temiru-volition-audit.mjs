import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {REVIEWED_USAGE_CARDS, usageCardItem} from '../app/lib/usage-cards.mjs';
import {deriveUnified} from '../app/lib/unified-knowledge.mjs';
import {verifyPortableRevisionDelivery, verifyCurrentReviewedUsageRevisions, readReviewedUsageRevisionsProof} from './verify-reviewed-usage-revisions.mjs';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const sourceHash = value => hash(JSON.stringify(value));
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const readTemiruAudit = () => JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../docs/usage-card-temiru-volition-audit-20261026.json.gz', import.meta.url))));

/** Validate the original reports without rewriting their historical verdicts. */
export function verifyTemiruAudit(proof = readTemiruAudit()) {
  // Later repairs do not overwrite the judgments on this frozen audit input.
  // Validate the full successor chain before accepting its historical sources.
  verifyCurrentReviewedUsageRevisions();
  // This audit predates the later four-form teaching choice. Its published
  // input excluded only the original, separately frozen negative-past hold;
  // current teaching eligibility must not shrink that historical sample.
  const historicalHold = JSON.parse(fs.readFileSync(new URL('../docs/usage-card-temiru-negative-past-hold-20261017.json', import.meta.url), 'utf8'));
  ensure(historicalHold.form === 'temiruNegativePast' && historicalHold.sourceCount === 122,
    'Invalid historical temiru teaching-hold scope');
  const expected = new Map(REVIEWED_USAGE_CARDS.filter(card => card.form.startsWith('temiru')
    && card.form !== historicalHold.form).map(card => [card.id, card]));
  const historical = new Map();
  for (const card of [...expected.values(), ...readReviewedUsageRevisionsProof().rounds.flatMap(round => round.sourceCards)]) {
    if (!historical.has(card.id)) historical.set(card.id, new Set());
    historical.get(card.id).add(sourceHash(card));
  }
  ensure(proof.schemaVersion === 1 && /^[a-f0-9]{40}$/.test(proof.sourceCommit), 'Invalid audit baseline');
  const seen = new Set(), batches = new Set(), rows = [];
  for (const batch of proof.batches) {
    ensure(!batches.has(batch.id), 'Duplicate audit batch'); batches.add(batch.id);
    const inputFiles = verifyPortableRevisionDelivery(batch.sourceDelivery, 'author', batch.id);
    const reviewFiles = verifyPortableRevisionDelivery(batch.reviewDelivery, 'review', batch.id);
    const inputBytes = inputFiles.get(batch.sourcePath), reportBytes = reviewFiles.get(batch.reportPath);
    ensure(inputBytes && reportBytes && hash(inputBytes) === batch.inputSha256, `${batch.id}: missing or stale packet`);
    const input = JSON.parse(inputBytes), report = JSON.parse(reportBytes);
    ensure(input.batch === batch.id && input.sourceCommit === proof.sourceCommit
      && input.rows.length > 0 && input.rows.length <= 16 && input.rows.length === batch.count
      && report.batch === batch.id && report.inputSha256 === batch.inputSha256
      && report.inputReceipt === batch.sourceDelivery.receipt
      && /^\/root\/[a-z0-9_]+$/.test(report.reviewer)
      && report.model === 'gpt-6-sol' && report.reasoningEffort === 'medium'
      && report.rows.length === input.rows.length, `${batch.id}: incomplete independent review`);
    for (let index = 0; index < input.rows.length; index++) {
      const source = input.rows[index], row = report.rows[index], card = expected.get(source.id);
      const item = card && usageCardItem(source.card.senseId);
      const target = item && deriveUnified(item, source.card.form).answer;
      const sentence = card && [...source.card.before, {text: target}, ...source.card.after].map(part => part.text).join('');
      ensure(card && !seen.has(source.id)
        && ['id', 'senseId', 'meaning', 'form'].every(key => source.card[key] === card[key])
        && historical.get(source.id)?.has(source.sourceHash)
        && source.sourceHash === sourceHash(source.card) && row.id === source.id
        && row.sourceHash === source.sourceHash && row.fullSentence === source.fullSentence
        && source.fullSentence === sentence,
      `${source.id}: source or review row drift`);
      ensure(['approved', 'revise', 'uncertain'].includes(row.status)
        && ['retain', 'revise', 'uncertain'].includes(row.translation)
        && ['retain', 'revise', 'uncertain'].includes(row.reading)
        && ['reason', 'roles', 'time', 'negation'].every(key => typeof row[key] === 'string' && row[key].trim())
        && row.directDeferral === false && row.deferralBasis === null,
      `${source.id}: incomplete or unsupported review judgment`);
      seen.add(source.id); rows.push({...row, form: card.form, senseId: card.senseId, reviewer: report.reviewer});
    }
  }
  ensure(seen.size === expected.size, 'Audit scope has missing cards');
  const counts = {sourceCount: seen.size, approved: rows.filter(row => row.status === 'approved').length,
    revise: rows.filter(row => row.status === 'revise').length, uncertain: rows.filter(row => row.status === 'uncertain').length,
    directDeferrals: 0};
  ensure(same(counts, proof.summary), 'Audit summary differs from individual judgments');
  return {...counts, rows};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = verifyTemiruAudit();
  delete summary.rows;
  console.log(JSON.stringify(summary));
}
