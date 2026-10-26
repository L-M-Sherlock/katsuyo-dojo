import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {USAGE_CARDS, REVIEWED_USAGE_CARDS} from '../app/lib/usage-cards.mjs';
import {TEACHING_PAIR_DEFERRALS} from '../app/lib/teaching-pair-deferrals.mjs';
import {EN_USAGE_CARD_OVERLAYS} from '../app/lib/i18n/content/en/current-usage-cards.mjs';
import {verifyShimauAudit} from './verify-shimau-usage-audit.mjs';
import {verifyPortableRevisionDelivery, readReviewedUsageRevisionsProof, verifyCurrentReviewedUsageRevisions} from './verify-reviewed-usage-revisions.mjs';
import {verifyTeachingPairHolds} from './lib/teaching-pair-holds.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hash = value => sha(JSON.stringify(value));
const ensure = (value, message) => { if (!value) throw new Error(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const readShimauUserResolution = () => JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../docs/usage-card-shimau-user-resolution-20261026.json.gz', import.meta.url))));

const TEXT_FIX_PREFIX = 'shimau-text-fix-20261026-';
const TEXT_FIX_FORMS = ['chau', 'teshimau', 'teshimauPast', 'teshimauNegative', 'teshimauNegativePast', 'passiveCompletionPast'];
const INITIAL_ROUNDS_HASH = '49eeb59cee4eaec0a23c76c12dc36a9d33b8491ac12e588d2c323fabbe12b42b';
const ENGLISH_CHECKS = ['englishNatural', 'meaning', 'roles', 'timeAndPolarity', 'register', 'scene', 'noAnswerLeak'];
const japanese = (card, side) => card[side].map(part => part.text).join('');
const readings = card => ['before', 'after'].map(side => card[side].map(part => part.reading ?? part.text));
const englishProse = row => ({scene: row.scene, translation: row.translation, ...(row.note === undefined ? {} : {note: row.note})});

// Reuse the sealed review protocol. A later text correction is a successor of
// the user's unchanged choice record, not an edit to its old source hashes.
function textSuccessors(record, sources, proof, requireClosure) {
  const expected = new Map(record.decisions.filter(row => row.action === 'retain-japanese' && row.ancillaryOpen.length)
    .map(row => [row.id, row]));
  ensure(expected.size === 17 && proof?.rounds?.length >= 9
    && hash(proof.rounds.slice(0, 9)) === INITIAL_ROUNDS_HASH, 'Text-correction historical review prefix drift');
  const rounds = proof.rounds.filter(round => round.id.startsWith(TEXT_FIX_PREFIX));
  if (!rounds.length) {
    ensure(!requireClosure, 'Missing independent text-correction closure for 17 outstanding cards');
    return new Map();
  }
  ensure(rounds.length === TEXT_FIX_FORMS.length
    && same(rounds.map(round => round.id).sort(), TEXT_FIX_FORMS.map(form => `${TEXT_FIX_PREFIX}${form}`).sort()),
  'Text-correction rounds are missing or outside the exact six-form scope');
  // Validate the supplied chain as well as the actual chain checked by the
  // frozen audit. Receipts alone do not establish reviewer independence or
  // complete bilingual approval, and cannot authorize a different projection.
  verifyCurrentReviewedUsageRevisions({proof});
  const seen = new Map();
  const canonical = new Map(REVIEWED_USAGE_CARDS.map(card => [card.id, card]));
  const active = new Map(USAGE_CARDS.map(card => [card.id, card]));
  const currentEnglish = new Map(EN_USAGE_CARD_OVERLAYS.map(row => [row.id, row]));
  for (const round of rounds) {
    const ids = [...expected.values()].filter(row => row.form === round.form).map(row => row.id);
    ensure(round.id === `${TEXT_FIX_PREFIX}${round.form}` && ids.length > 0
      && Array.isArray(round.scopeIds) && round.scopeIds.length === ids.length
      && new Set(round.scopeIds).size === ids.length
      && same([...round.scopeIds].sort(), [...ids].sort()) && round.sourceCount === ids.length
      && round.sourceCards.length === ids.length && !(round.deferrals ?? []).length,
    `${round.id}: incomplete exact text-correction scope`);
    const sourceById = new Map(round.sourceCards.map(card => [card.id, card]));
    ensure(sourceById.size === ids.length && ids.every(id => same(sourceById.get(id), sources.get(id)?.card)),
      `${round.id}: source does not match the frozen user choice`);
    for (const batch of round.batches) {
      const authorFiles = verifyPortableRevisionDelivery(batch.authorDelivery, 'author', batch.id);
      const reviewFiles = verifyPortableRevisionDelivery(batch.reviewDelivery, 'review', batch.id);
      const input = JSON.parse(authorFiles.get(batch.paths.input));
      const cards = JSON.parse(authorFiles.get(batch.paths.cards));
      const notes = JSON.parse(authorFiles.get(batch.paths.notes));
      const report = JSON.parse(reviewFiles.get(batch.paths.report));
      ensure(batch.author !== batch.reviewer && report.reviewer === batch.reviewer && report.selfReview === false
        && report.sourceReceipt === batch.authorDelivery.receipt && report.batchId === batch.id
        && input.count === cards.length && input.rows.length === cards.length && notes.length === cards.length
        && report.count === cards.length && report.rows.length === cards.length,
      `${batch.id}: missing or stale independent text-correction report`);
      for (const [index, draft] of cards.entries()) {
        const original = expected.get(draft.id), source = sources.get(draft.id), inputRow = input.rows[index];
        const note = notes[index], reviewed = report.rows[index];
        ensure(original && original.form === round.form && round.scopeIds.includes(draft.id) && !seen.has(draft.id)
          && inputRow.id === draft.id && note.id === draft.id && reviewed.id === draft.id
          && inputRow.sourceHash === original.sourceHash && same(inputRow.card, source.card)
          && same(inputRow.english, source.english) && hash(source.card) === original.sourceHash
          && hash(source.english) === original.englishHash,
        `${draft.id}: duplicate or stale text-correction input`);
        const final = {...draft, review: 'approved'};
        const editable = new Set(['scene', 'translation', 'before', 'after', 'review']);
        ensure([...new Set([...Object.keys(source.card), ...Object.keys(final)])]
          .every(key => editable.has(key) || same(final[key], source.card[key]))
          && ['before', 'after'].every(side => japanese(final, side) === japanese(source.card, side)),
        `${draft.id}: fixed identity or Japanese sentence changed during a text correction`);
        ensure(['retain', 'revise'].includes(note.disposition)
          && (note.disposition === 'retain' ? same(draft, source.card)
            : draft.review === 'draft' && hash(final) !== original.sourceHash),
        `${draft.id}: unsupported or unchanged canonical revision`);
        const english = {id: draft.id, sourceHash: hash(final), ...note.english};
        ensure(english.id === draft.id && english.sourceHash === hash(final)
          && reviewed.status === 'approved' && reviewed.hash === hash(draft)
          && reviewed.sourceHash === hash(final) && reviewed.englishHash === hash(english)
          && reviewed.sentence === original.fullSentence
          && ['translation', 'reading'].every(key => typeof reviewed[key] === 'string' && reviewed[key].trim())
          && ENGLISH_CHECKS.every(key => reviewed.english?.checks?.[key] === true),
        `${draft.id}: unresolved or stale bilingual text-correction approval`);
        ensure((!original.ancillaryOpen.includes('reading') || !same(readings(final), readings(source.card)))
          && (!original.ancillaryOpen.includes('translation') || final.translation !== source.card.translation)
          && (!original.ancillaryOpen.includes('english') || !same(englishProse(english), englishProse(source.english))),
        `${draft.id}: outstanding text finding has no corresponding correction`);
        ensure(same(canonical.get(draft.id), final) && same(active.get(draft.id), final)
          && same(currentEnglish.get(draft.id), english), `${draft.id}: current text differs from the approved successor`);
        seen.set(draft.id, {card: final, english});
      }
    }
  }
  ensure(seen.size === expected.size && [...expected.keys()].every(id => seen.has(id)), 'Text-correction scope has missing cards');
  return seen;
}

/** Verify a user teaching choice, without manufacturing new language approvals. */
export function verifyShimauUserResolution(record = readShimauUserResolution(), {
  revisionProof = readReviewedUsageRevisionsProof(), requireAncillaryClosure = false,
} = {}) {
  const audit = verifyShimauAudit();
  const open = new Map(audit.rows.filter(row => row.status !== 'approved').map(row => [row.id, row]));
  ensure(record.schemaVersion === 1 && record.kind === 'user-directed-teaching-choice'
    && /^[a-f0-9]{40}$/.test(record.sourceCommit)
    && record.auditProofSha256 === sha(fs.readFileSync(new URL('../docs/usage-card-shimau-audit-20261026.json.gz', import.meta.url))),
  'Invalid user-resolution audit baseline');
  // The receipt freezes user input and mapping. Its author phase is a storage
  // protocol field, not a claim that a model wrote or reviewed new examples.
  const files = verifyPortableRevisionDelivery(record.sourceDelivery, 'author', 'shimau-user/00');
  for (const name of ['instruction', 'assessment', 'decisions', 'sources', 'mapping']) {
    ensure(files.has(record.paths[name]), `Missing frozen ${name}`);
  }
  ensure(files.get(record.paths.instruction).toString('utf8').trim() === '只保留自然的，剩下的全部暂缓出题。'
    && sha(files.get(record.paths.assessment)) === record.sourceAttachmentSha256,
  'User instruction or assessment drift');
  const frozenDecisions = JSON.parse(files.get(record.paths.decisions));
  const frozenSources = JSON.parse(files.get(record.paths.sources));
  const mapping = JSON.parse(files.get(record.paths.mapping));
  ensure(same(frozenDecisions, record.decisions) && frozenSources.length === open.size
    && mapping.source.sha256 === record.sourceAttachmentSha256
    && mapping.decisions.length === open.size, 'Frozen scope or decision drift');
  const sources = new Map(frozenSources.map(row => [row.id, row]));
  const mapped = new Map(mapping.decisions.map(row => [row.id, row]));
  ensure(sources.size === open.size && mapped.size === open.size, 'Duplicate frozen source or mapping');
  const successors = textSuccessors(record, sources, revisionProof, requireAncillaryClosure);
  const canonical = new Map(REVIEWED_USAGE_CARDS.map(card => [card.id, card]));
  const active = new Map(USAGE_CARDS.map(card => [card.id, card]));
  const english = new Map(EN_USAGE_CARD_OVERLAYS.map(row => [row.id, row]));
  const holds = new Map(TEACHING_PAIR_DEFERRALS.map(row => [row.id, row]));
  const seen = new Set(), retained = [], held = []; let ancillaryOpen = 0;
  for (const row of record.decisions) {
    const original = open.get(row.id), source = sources.get(row.id), decision = mapped.get(row.id);
    ensure(original && source && decision && !seen.has(row.id)
      && row.senseId === original.senseId && row.form === original.form
      && row.sourceHash === original.sourceHash && row.fullSentence === original.fullSentence
      && source.sourceHash === row.sourceHash && hash(source.card) === row.sourceHash
      && source.englishHash === row.englishHash && hash(source.english) === row.englishHash
      && source.english.sourceHash === row.sourceHash
      && decision.fullSentence === row.fullSentence && decision.sourceSubgroup === row.userGroup,
    `${row.id}: missing, duplicate or stale user decision`);
    seen.add(row.id);
    if (row.action === 'hold') {
      const hold = holds.get(row.id);
      ensure(decision.decision === 'hold' && hold?.basis === 'user-directed-teaching-hold'
        && hold.sourceHash === row.sourceHash && hold.englishHash === row.englishHash
        && hold.pair === `${row.senseId}/${row.form}`
        && hold.evidenceFile === 'docs/usage-card-shimau-user-holds-20261026.json'
        && hash(canonical.get(row.id)) === row.sourceHash
        && !active.has(row.id) && !english.has(row.id) && same(row.ancillaryOpen, []),
      `${row.id}: unverified exact teaching hold`);
      held.push(row.id);
    } else {
      const ancillary = ['translation', 'reading', 'english'].filter(key => original[key] !== 'retain');
      const successor = successors.get(row.id);
      ensure(row.action === 'retain-japanese' && decision.decision === 'retain' && !holds.has(row.id)
        && hash(canonical.get(row.id)) === (successor ? hash(successor.card) : row.sourceHash)
        && hash(active.get(row.id)) === (successor ? hash(successor.card) : row.sourceHash)
        && hash(english.get(row.id)) === (successor ? hash(successor.english) : row.englishHash)
        && same(row.ancillaryOpen, ancillary), `${row.id}: retained content or outstanding findings drift`);
      retained.push(row.id); if (ancillary.length) ancillaryOpen++;
    }
  }
  ensure(seen.size === open.size && same(retained, record.retainedIds) && same(held, record.holdIds),
    'User-resolution partition has omissions or overlapping decisions');
  const priorIds = new Set(record.priorHoldIds);
  ensure(priorIds.size === 9 && priorIds.size === record.priorHoldIds.length
    && held.every(id => !priorIds.has(id))
    && same([...priorIds, ...held].sort(), [...holds.keys()].sort()),
  'Earlier and new holds do not partition the complete registry');
  const previous = TEACHING_PAIR_DEFERRALS.filter(row => record.priorHoldIds.includes(row.id));
  ensure(previous.length === record.priorHoldIds.length && hash(previous) === record.priorHoldsHash,
    'Earlier user holds changed');
  const expectedBorders = mapping.borderItems.filter(row => row.decision === 'hold');
  ensure(same(record.borderItems, expectedBorders) && record.borderItems.every(row => held.includes(row.id)),
    'Criticized green-heading examples were not held');
  const summary = {sourceCount: seen.size, retainedJapanese: retained.length, newTeachingHolds: held.length, ancillaryOpen};
  ensure(same(summary, record.summary), 'User-resolution summary differs from actual decisions');
  verifyTeachingPairHolds(REVIEWED_USAGE_CARDS);
  return {...summary, currentAncillaryOpen: ancillaryOpen - successors.size, ancillaryResolved: successors.size};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(verifyShimauUserResolution()));
}
