import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {REVIEWED_USAGE_CARDS, usageCardItem} from '../app/lib/usage-cards.mjs';
import {deriveUnified} from '../app/lib/unified-knowledge.mjs';
import {isShimauAuditForm} from './lib/shimau-audit-scope.mjs';
import {EN_USAGE_CARD_OVERLAYS as BASELINE_ENGLISH} from '../app/lib/i18n/content/en/usage-cards.mjs';
import {EN_REVIEWED_USAGE_CARD_OVERLAYS} from '../app/lib/i18n/content/en/reviewed-usage-card-revisions.mjs';
import {verifyPortableRevisionDelivery, verifyCurrentReviewedUsageRevisions, readReviewedUsageRevisionsProof} from './verify-reviewed-usage-revisions.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hash = value => sha(JSON.stringify(value));
const ensure = (value, message) => { if (!value) throw new Error(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const outcomes = ['retain', 'revise', 'uncertain'];
const issueKinds = new Set(['naturalness', 'sense', 'roles', 'time-negation', 'translation', 'reading', 'english', 'register']);
export const readShimauAudit = () => JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../docs/usage-card-shimau-audit-20261026.json.gz', import.meta.url))));

/** Validate the original independent audit without converting open findings to approval. */
export function verifyShimauAudit(proof = readShimauAudit()) {
  verifyCurrentReviewedUsageRevisions();
  // Use the retained reviewed inventory: later teaching holds do not change
  // the independently reviewed historical shimau audit input.
  const expected = new Map(REVIEWED_USAGE_CARDS.filter(card => isShimauAuditForm(card.form)).map(card => [card.id, card]));
  const history = readReviewedUsageRevisionsProof(), canonical = new Map(), english = new Map();
  const add = (map, row) => { if (!map.has(row.id)) map.set(row.id, new Set()); map.get(row.id).add(hash(row)); };
  for (const card of [...expected.values(), ...history.rounds.flatMap(round => round.sourceCards)]) add(canonical, card);
  for (const row of [...BASELINE_ENGLISH, ...EN_REVIEWED_USAGE_CARD_OVERLAYS]) add(english, row);
  for (const round of history.rounds) for (const batch of round.batches) {
    const files = verifyPortableRevisionDelivery(batch.authorDelivery, 'author', batch.id);
    const input = JSON.parse(files.get(batch.paths.input));
    for (const row of input.rows) add(english, row.english);
  }
  ensure(proof.schemaVersion === 1 && /^[a-f0-9]{40}$/.test(proof.sourceCommit), 'Invalid shimau audit baseline');
  const seen = new Set(), batches = new Set(), rows = [];
  for (const batch of proof.batches) {
    ensure(!batches.has(batch.id), 'Duplicate shimau audit batch'); batches.add(batch.id);
    const sourceFiles = verifyPortableRevisionDelivery(batch.sourceDelivery, 'author', batch.id);
    const reviewFiles = verifyPortableRevisionDelivery(batch.reviewDelivery, 'review', batch.id);
    const bytes = sourceFiles.get(batch.sourcePath), reportBytes = reviewFiles.get(batch.reportPath);
    ensure(bytes && reportBytes && sha(bytes) === batch.inputSha256, `${batch.id}: stale or missing packet`);
    const input = JSON.parse(bytes), report = JSON.parse(reportBytes);
    ensure(input.batch === batch.id && input.sourceCommit === proof.sourceCommit
      && input.rows.length > 0 && input.rows.length <= 16 && input.rows.length === batch.count
      && report.batch === batch.id && report.inputSha256 === batch.inputSha256
      && report.inputReceipt === batch.sourceDelivery.receipt
      && /^\/root\/[a-z0-9_]+$/.test(report.reviewer)
      && report.model === 'gpt-6-sol' && report.reasoningEffort === 'medium'
      && report.rows.length === input.rows.length, `${batch.id}: incomplete independent review`);
    for (let index = 0; index < input.rows.length; index++) {
      const source = input.rows[index], row = report.rows[index], current = expected.get(source.id);
      const item = current && usageCardItem(source.card.senseId);
      const target = item && deriveUnified(item, source.card.form).answer;
      const sentence = current && [...source.card.before, {text: target}, ...source.card.after].map(part => part.text).join('');
      ensure(current && !seen.has(source.id)
        && ['id', 'senseId', 'meaning', 'form'].every(key => source.card[key] === current[key])
        && source.sourceHash === hash(source.card) && canonical.get(source.id)?.has(source.sourceHash)
        && source.english?.sourceHash === source.sourceHash && english.get(source.id)?.has(hash(source.english))
        && row.id === source.id && row.sourceHash === source.sourceHash
        && row.fullSentence === source.fullSentence && row.fullSentence === sentence,
      `${source.id}: source or report drift`);
      ensure(['approved', 'revise', 'uncertain'].includes(row.status)
        && outcomes.includes(row.translation) && outcomes.includes(row.reading) && outcomes.includes(row.english)
        && ['route', 'reason', 'roles', 'time', 'negation'].every(key => typeof row[key] === 'string' && row[key].trim())
        && Array.isArray(row.issues) && new Set(row.issues).size === row.issues.length
        && row.issues.every(issue => issueKinds.has(issue))
        && (row.status === 'approved' ? row.issues.length === 0 && [row.translation, row.reading, row.english].every(value => value === 'retain') : row.issues.length > 0),
      `${source.id}: incomplete or inconsistent review judgment`);
      seen.add(source.id); rows.push({...row, form: current.form, senseId: current.senseId, reviewer: report.reviewer});
    }
  }
  ensure(seen.size === expected.size, 'Shimau audit scope has missing cards');
  const summary = {sourceCount: seen.size, approved: rows.filter(row => row.status === 'approved').length,
    revise: rows.filter(row => row.status === 'revise').length, uncertain: rows.filter(row => row.status === 'uncertain').length};
  ensure(same(summary, proof.summary), 'Shimau audit summary differs from individual judgments');
  return {...summary, rows};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = verifyShimauAudit(); delete summary.rows; console.log(JSON.stringify(summary));
}
