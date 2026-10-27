/** Verify the frozen tone/perspective audit and its separately reviewed English repairs. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {USAGE_CARDS, REVIEWED_USAGE_CARDS, usageCardItem} from '../app/lib/usage-cards.mjs';
import {deriveUnified} from '../app/lib/unified-knowledge.mjs';
import {EN_USAGE_CARD_OVERLAYS} from '../app/lib/i18n/content/en/current-usage-cards.mjs';
import {TEACHING_PAIR_DEFERRALS} from '../app/lib/teaching-pair-deferrals.mjs';
import {readReviewedUsageRevisionsProof, verifyCurrentReviewedUsageRevisions,
  verifyPortableRevisionDelivery} from './verify-reviewed-usage-revisions.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = value => sha(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ensure = (ok, message) => { if (!ok) throw Error(message); };
const sorted = values => [...values].sort();
const text = value => typeof value === 'string' && value.trim().length > 0;
const outcomes = ['consistent', 'optional-polish', 'revise', 'uncertain'];
const fields = new Set(['zh-scene', 'zh-translation', 'japanese-tone', 'en-scene', 'en-translation']);
export const COMPLETION_TONE_EXCLUDED_ID = 'usage:chau:verb:拾う:ひろう';
export const COMPLETION_TONE_FIX_ROUND = 'completion-tone-fix-20261027-teshimau';
export const COMPLETION_TONE_FIX_IDS = [
  'usage:teshimau:verb:呼ぶ:よぶ', 'usage:teshimau:verb:分かる:わかる',
];
export const COMPLETION_TONE_USER_HOLDS_FILE = 'docs/usage-card-completion-tone-user-holds-20261027.json';
export const readCompletionToneAudit = () => JSON.parse(zlib.gunzipSync(fs.readFileSync(
  new URL('../docs/usage-card-completion-tone-audit-20261027.json.gz', import.meta.url))));
export const readCompletionToneTeachingHolds = () => JSON.parse(fs.readFileSync(
  new URL(`../${COMPLETION_TONE_USER_HOLDS_FILE}`, import.meta.url), 'utf8'));

// Only this later, documented user choice left the frozen 281-card scope.
// Earlier holds in the same forms were already absent from that scope.
function heldToneSources(proof, current, english) {
  const holds = new Map(TEACHING_PAIR_DEFERRALS.filter(row => row.evidenceFile === COMPLETION_TONE_USER_HOLDS_FILE)
    .map(row => [row.id, row]));
  ensure(proof?.schemaVersion === 1 && proof.kind === 'user-directed-exact-pair-hold'
    && /^[a-f0-9]{40}$/u.test(proof.sourceCommit) && text(proof.request)
    && Array.isArray(proof.sourceRows), 'Invalid completion-tone historical teaching-hold evidence');
  const sources = new Map(proof.sourceRows.map(row => [row.id, row]));
  ensure(sources.size === proof.sourceRows.length && same(sorted(sources.keys()), sorted(holds.keys())),
    'Completion-tone historical teaching-hold scope differs from its registry');
  const canonical = new Map(REVIEWED_USAGE_CARDS.map(card => [card.id, card]));
  for (const source of sources.values()) {
    const hold = holds.get(source.id);
    ensure(hold && Object.keys(hold).every(key => same(source[key], hold[key]))
      && ['teshimau', 'chau'].includes(source.form) && source.id !== COMPLETION_TONE_EXCLUDED_ID
      && same(source.card, canonical.get(source.id)) && hash(source.card) === source.sourceHash
      && source.english?.id === source.id && source.english.sourceHash === source.sourceHash
      && hash(source.english) === source.englishHash
      && (source.previousUsage?.status === 'allowed' || (source.previousUsage?.status === 'context-required'
        && text(source.previousUsage.context?.text)))
      && !current.has(source.id) && !english.has(source.id),
    `${source.id}: stale completion-tone historical teaching-hold source`);
  }
  return sources;
}

function summary(rows) {
  return {sourceCount: rows.length, consistent: rows.filter(row => row.status === 'consistent').length,
    optionalPolish: rows.filter(row => row.status === 'optional-polish').length,
    revise: rows.filter(row => row.status === 'revise').length,
    uncertain: rows.filter(row => row.status === 'uncertain').length};
}

function reportRows(batch, delivery, packet) {
  const files = verifyPortableRevisionDelivery(delivery, 'review', batch.id);
  ensure(same([...files.keys()], [batch.reportPath]), `${batch.id}: unexpected review artifacts`);
  const report = JSON.parse(files.get(batch.reportPath));
  ensure(report.schemaVersion === 1 && report.batchId === batch.id
    && report.reviewer === batch.reviewer && /^\/root\/completion_tone_review_[0-5]$/u.test(report.reviewer)
    && report.model === 'gpt-6-sol' && report.reasoningEffort === 'medium'
    && report.sourceReceipt === batch.sourceDelivery.receipt && report.inputSha256 === batch.inputSha256
    && report.count === batch.count && Array.isArray(report.rows) && report.rows.length === batch.count,
  `${batch.id}: incomplete independent tone review`);
  for (const [index, row] of report.rows.entries()) {
    const source = packet.rows[index];
    ensure(row.id === source.id && row.sourceHash === source.sourceHash && row.englishHash === source.englishHash
      && row.fullSentence === source.fullSentence && outcomes.includes(row.status)
      && typeof row.reason === 'string' && row.reason.trim().length >= 16
      && Array.isArray(row.issueFields) && new Set(row.issueFields).size === row.issueFields.length
      && row.issueFields.every(field => fields.has(field))
      && (row.status === 'consistent' ? row.issueFields.length === 0
        : row.status === 'optional-polish' || row.issueFields.length > 0)
      && (!Object.hasOwn(row, 'proposal') || text(row.proposal)), `${source.id}: incomplete or stale tone judgment`);
  }
  return report.rows;
}

function resolutionRows(proof, revisionProof, audited, current, currentEnglish, requireResolution) {
  const round = revisionProof.rounds.find(row => row.id === COMPLETION_TONE_FIX_ROUND);
  if (!round) {
    ensure(!requireResolution && !proof.resolution, 'Missing independent completion-tone English closure');
    return [];
  }
  ensure(proof.resolution && same(proof.resolution, round)
    && round.form === 'teshimau' && same(sorted(round.scopeIds ?? []), sorted(COMPLETION_TONE_FIX_IDS))
    && round.sourceCount === 2 && round.batches.length > 0 && !(round.deferrals?.length),
  'Completion-tone closure has incomplete exact scope or frozen round drift');
  const resolved = [], seen = new Set();
  for (const batch of round.batches) {
    const files = verifyPortableRevisionDelivery(batch.authorDelivery, 'author', batch.id);
    const reviewed = verifyPortableRevisionDelivery(batch.reviewDelivery, 'review', batch.id);
    const inputs = JSON.parse(files.get(batch.paths.input)).rows;
    const cards = JSON.parse(files.get(batch.paths.cards));
    const notes = JSON.parse(files.get(batch.paths.notes));
    const report = JSON.parse(reviewed.get(batch.paths.report));
    for (const [index, source] of inputs.entries()) {
      const original = audited.get(source.id), draft = cards[index], note = notes[index], row = report.rows[index];
      const final = {...draft, review: 'approved'};
      const english = {id: source.id, sourceHash: hash(final), ...note.english};
      ensure(original && original.status === 'revise' && same(original.issueFields, ['en-translation'])
        && COMPLETION_TONE_FIX_IDS.includes(source.id) && !seen.has(source.id)
        && same(source.card, original.card) && source.sourceHash === original.sourceHash
        && same(source.english, original.english) && note.disposition === 'retain'
        && same(draft, original.card) && same(final, original.card)
        && english.sourceHash === original.sourceHash && english.translation !== original.english.translation
        && row.status === 'approved' && row.sourceHash === original.sourceHash && row.englishHash === hash(english)
        && same(current.get(source.id), original.card) && same(currentEnglish.get(source.id), english),
      `${source.id}: tone closure changed canonical source or lacks an approved English translation change`);
      seen.add(source.id);
      resolved.push({id: source.id, sourceHash: original.sourceHash, previousEnglishHash: original.englishHash,
        englishHash: hash(english), translation: english.translation, author: batch.author, reviewer: batch.reviewer,
        sourceReceipt: batch.authorDelivery.receipt, reviewReceipt: batch.reviewDelivery.receipt});
    }
  }
  ensure(same(sorted(seen), sorted(COMPLETION_TONE_FIX_IDS)), 'Completion-tone closure has missing cards');
  return resolved;
}

/** Historical revise votes stay historical; only verified successors close current findings. */
export function verifyCompletionToneAudit(proof = readCompletionToneAudit(), {
  revisionProof = readReviewedUsageRevisionsProof(), requireResolution = true,
  teachingHoldProof = readCompletionToneTeachingHolds(),
} = {}) {
  // A historical input is usable only after the complete ordered chain and its
  // current runtime projection have been independently verified.
  verifyCurrentReviewedUsageRevisions({proof: revisionProof});
  const current = new Map(USAGE_CARDS.filter(card => ['teshimau', 'chau'].includes(card.form)
    && card.id !== COMPLETION_TONE_EXCLUDED_ID).map(card => [card.id, card]));
  const english = new Map(EN_USAGE_CARD_OVERLAYS.map(row => [row.id, row]));
  const heldSources = heldToneSources(teachingHoldProof, current, english);
  const scope = new Map([...current, ...[...heldSources.values()].map(row => [row.id, row.card])]);
  const historicalPairs = new Map();
  const addPair = (card, overlay) => {
    if (!historicalPairs.has(card.id)) historicalPairs.set(card.id, new Set());
    historicalPairs.get(card.id).add(`${hash(card)}:${hash(overlay)}`);
  };
  for (const card of current.values()) addPair(card, english.get(card.id));
  for (const source of heldSources.values()) addPair(source.card, source.english);
  for (const round of revisionProof.rounds) for (const batch of round.batches) {
    const files = verifyPortableRevisionDelivery(batch.authorDelivery, 'author', batch.id);
    for (const row of JSON.parse(files.get(batch.paths.input)).rows) addPair(row.card, row.english);
  }
  ensure(proof.schemaVersion === 1 && proof.kind === 'completion-tone-perspective-audit'
    && /^[a-f0-9]{40}$/u.test(proof.sourceCommit)
    && same(proof.scope, {forms: ['teshimau', 'chau'], excludedIds: [COMPLETION_TONE_EXCLUDED_ID], count: 281})
    && same(proof.snapshotProvenance, {actor: '/root', role: 'coordinator',
      operation: 'freeze-existing-published-objects', authorPhaseMeaning: 'storage-only', newAuthor: false})
    && scope.size === 281 && Array.isArray(proof.batches), 'Invalid completion-tone audit baseline');
  const seen = new Set(), batchIds = new Set(), rows = [], initialRows = [], changes = [];
  for (const batch of proof.batches) {
    ensure(!batchIds.has(batch.id), 'Duplicate completion-tone batch'); batchIds.add(batch.id);
    const sourceFiles = verifyPortableRevisionDelivery(batch.sourceDelivery, 'author', batch.id);
    const bytes = sourceFiles.get(batch.sourcePath);
    ensure(same([...sourceFiles.keys()], [batch.sourcePath]) && bytes && sha(bytes) === batch.inputSha256,
      `${batch.id}: stale or missing tone packet`);
    const packet = JSON.parse(bytes);
    ensure(packet.schemaVersion === 1 && packet.batch === batch.id && packet.sourceKind === 'published-card-snapshot'
      && packet.sourceCommit === proof.sourceCommit && packet.count === batch.count
      && Array.isArray(packet.rows) && packet.rows.length === batch.count && batch.count > 0 && batch.count <= 16,
    `${batch.id}: incomplete tone packet`);
    for (const source of packet.rows) {
      const currentCard = scope.get(source.id), item = currentCard && usageCardItem(source.card.senseId);
      const target = item && deriveUnified(item, source.card.form).answer;
      const sentence = item && [...source.card.before, {text: target}, ...source.card.after].map(part => part.text).join('');
      ensure(currentCard && !seen.has(source.id) && source.card.id === source.id
        && ['senseId', 'meaning', 'form'].every(key => source.card[key] === currentCard[key])
        && source.sourceHash === hash(source.card) && source.english?.id === source.id
        && source.englishHash === hash(source.english) && source.english.sourceHash === source.sourceHash
        && historicalPairs.get(source.id)?.has(`${source.sourceHash}:${source.englishHash}`)
        && source.fullSentence === sentence, `${source.id}: source or joint historical input drift`);
      seen.add(source.id);
    }
    ensure(batch.initialReviewDelivery?.revision === 1, `${batch.id}: missing immutable initial review`);
    const initial = reportRows(batch, batch.initialReviewDelivery, packet);
    const final = reportRows(batch, batch.reviewDelivery, packet);
    const originalBytes = verifyPortableRevisionDelivery(batch.initialReviewDelivery, 'review', batch.id).get(batch.reportPath);
    const finalBytes = verifyPortableRevisionDelivery(batch.reviewDelivery, 'review', batch.id).get(batch.reportPath);
    ensure(originalBytes.equals(finalBytes)
      ? same(batch.initialReviewDelivery, batch.reviewDelivery)
      : batch.reviewDelivery.revision === 2 && batch.reviewDelivery.receipt !== batch.initialReviewDelivery.receipt,
    `${batch.id}: final review overwrote or misrepresented its initial evidence`);
    for (const [index, row] of final.entries()) {
      const source = packet.rows[index], before = initial[index];
      rows.push({...row, card: source.card, english: source.english, reviewer: batch.reviewer, batch: batch.id});
      initialRows.push(before);
      if (!same(row, before)) changes.push({batch: batch.id, id: row.id, fromStatus: before.status,
        toStatus: row.status, initialReason: before.reason, finalReason: row.reason});
    }
  }
  ensure(seen.size === scope.size && proof.batches.length === 18, 'Completion-tone audit scope has missing cards');
  ensure(same(sorted(rows.map(row => row.id)), proof.scopeIds)
    && same(summary(rows), proof.summary) && same(summary(initialRows), proof.initialSummary)
    && same(changes, proof.reviewChanges), 'Completion-tone audit summary or review history differs');
  const revised = rows.filter(row => row.status === 'revise');
  ensure(same(sorted(revised.map(row => row.id)), sorted(COMPLETION_TONE_FIX_IDS)), 'Unexpected confirmed tone repair scope');
  const resolved = resolutionRows(proof, revisionProof, new Map(rows.map(row => [row.id, row])), current, english, requireResolution);
  return {...proof.summary, currentOpen: rows.filter(row => ['revise', 'uncertain'].includes(row.status)).length - resolved.length,
    resolved: resolved.length,
    initialSummary: summary(initialRows), reviewChanges: changes, rows, resolutions: resolved};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyCompletionToneAudit();
  delete result.rows;
  delete result.resolutions;
  delete result.reviewChanges;
  delete result.initialSummary;
  console.log(JSON.stringify(result));
}
