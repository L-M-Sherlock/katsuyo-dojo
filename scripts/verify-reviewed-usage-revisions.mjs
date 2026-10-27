/** Verify portable successor reviews without rewriting any historical proof. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { USAGE_CARDS, PRE_REVIEWED_USAGE_CARDS, usageCardIssues, resolveUsageCard, usageCardItem } from '../app/lib/usage-cards.mjs';
import { REVIEWED_USAGE_CARD_REVISIONS, REVIEWED_USAGE_CARD_DEFERRALS } from '../app/lib/usage-cards/reviewed-revisions.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { EN_USAGE_CARD_OVERLAYS as BASELINE_ENGLISH } from '../app/lib/i18n/content/en/usage-cards.mjs';
import { EN_REVIEWED_USAGE_CARD_OVERLAYS } from '../app/lib/i18n/content/en/reviewed-usage-card-revisions.mjs';
import { validateEnglishUsageAgentOverlay } from './generate-english-usage-overlay.mjs';
import { isUsageCardTeachingDeferred } from '../app/lib/teaching-pair-deferrals.mjs';
import { verifyTeachingPairHolds } from './lib/teaching-pair-holds.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REVIEWED_REVISIONS_PROOF = path.join(ROOT, 'docs/usage-card-reviewed-revisions.v1.json');
export const revisionHash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ensure = (ok, message) => { if (!ok) throw Error(message); };
const HEX = /^[a-f0-9]{64}$/u;
const CHECKS = ['englishNatural', 'meaning', 'roles', 'timeAndPolarity', 'register', 'scene', 'noAnswerLeak'];
const sorted = values => [...values].sort();
const text = value => typeof value === 'string' && value.trim().length >= 2;
// Actor identities use the canonical collaboration task path. Reject aliases,
// whitespace and path normalization tricks before comparing independent roles.
const actorHandle = value => typeof value === 'string' && value.trim() === value
  && /^\/root(?:\/[a-z0-9_]+)+$/u.test(value);
const rolesPresent = value => text(value) || (value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length >= 2 && Object.values(value).every(text));
const indexById = (rows, label) => {
  ensure(Array.isArray(rows), `${label}: expected array`);
  const result = new Map();
  for (const row of rows) {
    ensure(typeof row?.id === 'string' && row.id && !result.has(row.id), `${label}: missing or duplicate ID`);
    result.set(row.id, row);
  }
  return result;
};
const safePath = value => typeof value === 'string' && value && !value.includes('\\')
  && !value.includes(':') && !value.startsWith('/') && value.split('/').every(part => part && part !== '.' && part !== '..');

/** The embedded bytes are exactly those frozen by delivery-store.createDelivery. */
export function verifyPortableRevisionDelivery(portable, phase, batchId) {
  ensure(portable && typeof portable === 'object', 'Missing portable revision delivery');
  const { artifacts, manifest: manifestPath, receipt, ...manifest } = portable;
  ensure(same(sorted(Object.keys(manifest)), sorted(['version', 'batch', 'phase', 'revision', 'root', 'files', 'hashes', 'sourceHashes']))
    && manifest.version === 1 && manifest.phase === phase && manifest.batch === batchId
    && /^[A-Za-z0-9][A-Za-z0-9_-]*\/[0-9]{2,}$/u.test(batchId)
    && Number.isSafeInteger(manifest.revision) && manifest.revision >= 1, 'Invalid portable delivery metadata');
  const prefix = `deliveries/${batchId}/rev-${manifest.revision}-${phase}-`;
  ensure(manifest.root?.startsWith(prefix) && /^[0-9a-f-]{36}$/u.test(manifest.root.slice(prefix.length))
    && manifestPath === `${manifest.root}/snapshot.json` && HEX.test(receipt ?? ''), 'Invalid portable delivery location');
  // createDelivery writes these fields in this order, with two-space indentation.
  const snapshot = { version: manifest.version, batch: manifest.batch, phase: manifest.phase,
    revision: manifest.revision, root: manifest.root, files: manifest.files,
    hashes: manifest.hashes, sourceHashes: manifest.sourceHashes };
  ensure(sha(`${JSON.stringify(snapshot, null, 2)}\n`) === receipt, 'Portable delivery receipt drift');
  const sources = Object.keys(manifest.files ?? {});
  ensure(sources.length > 0 && artifacts && typeof artifacts === 'object'
    && same(sorted(sources), sorted(Object.keys(artifacts)))
    && same(sorted(sources), sorted(Object.keys(manifest.sourceHashes ?? {})))
    && same(sorted(Object.values(manifest.files)), sorted(Object.keys(manifest.hashes ?? {}))), 'Portable delivery file set drift');
  const files = new Map();
  const targets = new Set();
  for (const source of sources) {
    const target = manifest.files[source];
    ensure(safePath(source) && path.posix.basename(source) !== 'snapshot.json'
      && target === `${manifest.root}/${path.posix.basename(source)}` && !targets.has(target), 'Unsafe portable delivery path');
    targets.add(target);
    ensure(typeof artifacts[source] === 'string', `Missing portable bytes: ${source}`);
    const bytes = Buffer.from(artifacts[source], 'base64');
    ensure(bytes.toString('base64') === artifacts[source]
      && sha(bytes) === manifest.hashes[target] && sha(bytes) === manifest.sourceHashes[source], `Portable artifact drift: ${source}`);
    files.set(source, bytes);
  }
  return files;
}

function readArtifact(files, key, label) {
  ensure(files.has(key), `${label}: missing frozen artifact ${key}`);
  try { return JSON.parse(files.get(key).toString('utf8')); }
  catch (error) { throw Error(`${label}: invalid JSON in ${key}: ${error.message}`); }
}

// A deferred pair keeps its morphology, even though current teaching
// eligibility deliberately makes resolveUsageCard return null for that pair.
function morphologicalTarget(card) {
  const item = usageCardItem(card.senseId);
  ensure(item && item.meaning === card.meaning, `${card.id}: changed lexical sense`);
  return { text: deriveUnified(item, card.form).answer,
    reading: deriveUnified({ ...item, surface: item.reading, lexicalSurface: item.surface }, card.form).answer };
}

const deferralRuntimeRow = row => ({ id: row.id, pair: row.pair, sourceHash: row.sourceHash,
  basis: row.basis, reason: row.reason, restoreCondition: row.restoreCondition });

function verifyRevisionDeferral(deferral, previous, englishBefore) {
  ensure(previous && deferral.pair === `${previous.senseId}/${previous.form}`
    && deferral.sourceHash === revisionHash(previous) && deferral.basis === 'three-failed-repair-attempts'
    && text(deferral.reason) && text(deferral.restoreCondition)
    && (deferral.previousUsage?.status === 'allowed' || (deferral.previousUsage?.status === 'context-required'
      && text(deferral.previousUsage.context?.text))), `${deferral.id}: stale or incomplete exact-pair deferral`);
  ensure(Array.isArray(deferral.attempts) && deferral.attempts.length === 3,
    `${deferral.id}: exact deferral needs three recorded repair attempts`);
  const receipts = new Set(), failures = new Set();
  for (const [index, attempt] of deferral.attempts.entries()) {
    ensure(attempt.attemptNumber === index + 1 && actorHandle(attempt.author)
      && attempt.authorModel === 'gpt-6-luna' && attempt.authorEffort === 'max'
      && ['no-credible-candidate', 'rejected-draft'].includes(attempt.kind), `${deferral.id}: invalid repair-attempt identity or order`);
    const files = verifyPortableRevisionDelivery(attempt.authorDelivery, 'author', attempt.authorDelivery?.batch);
    ensure(!receipts.has(attempt.authorDelivery.receipt), `${deferral.id}: repeated repair-attempt receipt`);
    receipts.add(attempt.authorDelivery.receipt);
    const required = ['input', 'assignment', 'cards', 'notes'];
    const paths = attempt.paths;
    const pathKeys = attempt.kind === 'rejected-draft' ? [...required, 'readings', 'checks', 'report'] : required;
    ensure(paths && same(sorted(Object.keys(paths)), sorted(pathKeys))
      && same(sorted(files.keys()), sorted(pathKeys.filter(key => key !== 'report').map(key => paths[key]))),
    `${deferral.id}: incomplete frozen repair-attempt artifacts`);
    const input = readArtifact(files, paths.input, deferral.id);
    const source = indexById(input.rows, 'Deferral input').get(deferral.id);
    const assignment = indexById(readArtifact(files, paths.assignment, deferral.id), 'Deferral assignment').get(deferral.id);
    const drafted = indexById(readArtifact(files, paths.cards, deferral.id), 'Deferral drafts').get(deferral.id);
    const note = indexById(readArtifact(files, paths.notes, deferral.id), 'Deferral notes').get(deferral.id);
    const target = morphologicalTarget(previous), item = usageCardItem(previous.senseId);
    ensure(source && same(source.card, previous) && source.sourceHash === deferral.sourceHash
      && same(source.english, englishBefore) && assignment
      && ['senseId', 'meaning', 'form'].every(key => assignment[key] === previous[key])
      && assignment.class === item.class && assignment.answer === target.text && assignment.answerReading === target.reading,
    `${deferral.id}: repair attempt changed the frozen source or target`);
    ensure(note && typeof note.reason === 'string' && note.reason.trim().length >= 30
      && rolesPresent(note.roles) && text(note.time) && text(note.negation)
      && Array.isArray(note.evidence) && note.evidence.length > 0
      && note.evidence.every(row => text(row.route) && text(row.finding)), `${deferral.id}: repair attempt lacks a concrete route and evidence`);
    let failure;
    if (attempt.kind === 'no-credible-candidate') {
      ensure(note.disposition === 'no-credible-candidate' && !drafted,
        `${deferral.id}: no-candidate attempt submitted a draft or lacks its explicit finding`);
      failure = `search:${revisionHash(note)}`;
    } else {
      ensure(actorHandle(attempt.reviewer) && attempt.reviewer !== attempt.author
        && attempt.reviewerModel === 'gpt-6-sol' && attempt.reviewerEffort === 'medium'
        && ['naturalness', 'meaning'].includes(attempt.rejectionBasis), `${deferral.id}: rejected draft lacks an independent language reviewer`);
      ensure(drafted && drafted.review === 'draft' && note.disposition === 'revise'
        && ['id', 'senseId', 'meaning', 'form'].every(key => drafted[key] === previous[key])
        && !same({ ...drafted, review: 'approved' }, previous), `${deferral.id}: rejected draft is unchanged or outside the fixed pair`);
      const readings = readArtifact(files, paths.readings, deferral.id);
      readArtifact(files, paths.checks, deferral.id);
      ensure(Array.isArray(readings.candidates) && !(readings.structuralIssues?.length), `${deferral.id}: a structural failure is not a language repair failure`);
      const reviewFiles = verifyPortableRevisionDelivery(attempt.reviewDelivery, 'review', attempt.authorDelivery.batch);
      ensure(same([...reviewFiles.keys()], [paths.report]), `${deferral.id}: rejected review artifact scope drift`);
      const report = readArtifact(reviewFiles, paths.report, deferral.id);
      const reports = indexById(report.rows, 'Deferral independent report');
      const row = reports.get(deferral.id);
      const final = { ...drafted, review: 'approved' };
      const english = { id: deferral.id, sourceHash: revisionHash(final), ...note.english };
      const sentence = [...drafted.before, morphologicalTarget(drafted), ...drafted.after].map(part => part.text).join('');
      ensure(report.schemaVersion === 1 && report.batchId === attempt.authorDelivery.batch
        && report.reviewer === attempt.reviewer && report.selfReview === false
        && report.sourceReceipt === attempt.authorDelivery.receipt && report.count === reports.size
        && row?.status === 'revise' && row.hash === revisionHash(drafted)
        && row.sourceHash === revisionHash(final) && row.englishHash === revisionHash(english)
        && row.sentence === sentence && typeof row.reason === 'string' && row.reason.trim().length >= 20
        && rolesPresent(row.roles) && ['time', 'negation', 'translation', 'reading'].every(key => text(row[key])),
      `${deferral.id}: missing or stale independent language rejection`);
      failure = `draft:${revisionHash(drafted)}`;
    }
    ensure(!failures.has(failure), `${deferral.id}: the same repair failure was counted twice`);
    failures.add(failure);
  }
  return deferralRuntimeRow(deferral);
}

function reviewBatch(batch, expected, englishBefore, roundSeen, reasons) {
  ensure(actorHandle(batch.author) && actorHandle(batch.reviewer) && batch.author !== batch.reviewer
    && batch.authorModel === 'gpt-6-luna' && batch.authorEffort === 'max'
    && batch.reviewerModel === 'gpt-6-sol' && batch.reviewerEffort === 'medium', `${batch.id}: invalid independent reviewer or author`);
  const authorFiles = verifyPortableRevisionDelivery(batch.authorDelivery, 'author', batch.id);
  const reviewFiles = verifyPortableRevisionDelivery(batch.reviewDelivery, 'review', batch.id);
  const paths = batch.paths;
  ensure(paths && same(sorted(Object.keys(paths)), sorted(['assignment', 'input', 'cards', 'notes', 'readings', 'checks', 'report']))
    && same(sorted(authorFiles.keys()), sorted(['assignment', 'input', 'cards', 'notes', 'readings', 'checks'].map(key => paths[key])))
    && same([...reviewFiles.keys()], [paths.report]), `${batch.id}: unexpected frozen artifact scope`);
  const assignment = readArtifact(authorFiles, paths.assignment, batch.id);
  const input = readArtifact(authorFiles, paths.input, batch.id);
  const draft = readArtifact(authorFiles, paths.cards, batch.id);
  const notes = readArtifact(authorFiles, paths.notes, batch.id);
  const readings = readArtifact(authorFiles, paths.readings, batch.id);
  readArtifact(authorFiles, paths.checks, batch.id);
  const report = readArtifact(reviewFiles, paths.report, batch.id);
  const assigned = indexById(assignment, `${batch.id}/assignment`);
  const inputs = indexById(input.rows, `${batch.id}/input`);
  const drafted = indexById(draft, `${batch.id}/cards`);
  const noted = indexById(notes, `${batch.id}/notes`);
  const ids = [...assigned.keys()];
  ensure(ids.length > 0 && ids.length <= 16 && input.count === ids.length
    && same([...inputs.keys()], ids) && same([...drafted.keys()], ids) && same([...noted.keys()], ids), `${batch.id}: incomplete or reordered author scope`);
  ensure(report.schemaVersion === 1 && report.batchId === batch.id && report.reviewer === batch.reviewer
    && report.selfReview === false && report.sourceReceipt === batch.authorDelivery.receipt
    && report.count === ids.length && Array.isArray(report.rows)
    && same(report.rows.map(row => row.id), ids), `${batch.id}: incomplete or stale independent report`);
  ensure(Array.isArray(readings.candidates) && !(readings.structuralIssues?.length), `${batch.id}: missing or invalid reading audit`);
  const candidates = indexById(readings.candidates, `${batch.id}/reading candidates`);
  const decisions = indexById(report.candidates, `${batch.id}/candidate decisions`);
  ensure([...candidates.keys()].every(id => assigned.has(id))
    && same(sorted(candidates.keys()), sorted(decisions.keys()))
    && [...decisions.values()].every(row => row.decision === 'retain' && text(row.reason)), `${batch.id}: unresolved or mismatched reading candidates`);
  const rows = [];
  for (const [index, id] of ids.entries()) {
    const previous = expected.get(id), source = inputs.get(id), card = drafted.get(id), note = noted.get(id);
    ensure(previous && !roundSeen.has(id) && same(source.card, previous)
      && source.sourceHash === revisionHash(previous) && same(source.english, englishBefore.get(id)), `${id}: input baseline drift or duplicate review`);
    const requirement = assigned.get(id), resolved = resolveUsageCard(previous, {allowTeachingHolds: true}), item = usageCardItem(previous.senseId);
    ensure(['senseId', 'form', 'meaning'].every(key => requirement[key] === previous[key])
      && requirement.class === item?.class && requirement.answer === resolved?.target.text
      && requirement.answerReading === resolved?.target.reading, `${id}: assignment target drift`);
    ensure(['id', 'senseId', 'form', 'meaning'].every(key => card[key] === previous[key])
      && ['retain', 'revise'].includes(note.disposition) && text(note.reason)
      && rolesPresent(note.roles) && text(note.time) && text(note.negation), `${id}: changed fixed identity or incomplete author notes`);
    if (note.disposition === 'retain') ensure(same(card, previous), `${id}: retained card differs from input`);
    else ensure(card.review === 'draft' && !same({ ...card, review: 'approved' }, previous), `${id}: revision is not a changed draft`);
    const finalCard = { ...card, review: 'approved' };
    ensure(usageCardIssues([card], {allowTeachingHolds: true}).length === 0
      && usageCardIssues([finalCard], {allowTeachingHolds: true}).length === 0, `${id}: invalid revised card structure`);
    const english = validateEnglishUsageAgentOverlay(finalCard, {
      id, sourceHash: revisionHash(finalCard), ...note.english,
    }, {allowTeachingHolds: true});
    const target = resolveUsageCard(card, {allowTeachingHolds: true}).target;
    const sentence = [...card.before, target, ...card.after].map(part => part.text).join('');
    const row = report.rows[index];
    const reason = typeof row.reason === 'string' ? row.reason.trim().replace(/\s+/gu, ' ') : '';
    ensure(row.status === 'approved' && row.sentence === sentence && row.hash === revisionHash(card)
      && row.sourceHash === revisionHash(finalCard) && row.englishHash === revisionHash(english)
      && reason.length >= 20 && !reasons.has(reason) && rolesPresent(row.roles)
      && ['time', 'negation', 'translation', 'reading'].every(key => text(row[key]))
      && typeof row.english?.reason === 'string' && row.english.reason.trim().length >= 12
      && row.english.checks && same(sorted(Object.keys(row.english.checks)), sorted(CHECKS))
      && CHECKS.every(key => row.english.checks[key] === true), `${id}: unresolved, incomplete or stale bilingual approval`);
    reasons.add(reason);
    roundSeen.add(id);
    rows.push({ revision: { id, pair: `${previous.senseId}/${previous.form}`,
      previousHash: revisionHash(previous), finalHash: revisionHash(finalCard), card: finalCard }, english });
  }
  return rows;
}

export function readReviewedUsageRevisionsProof(proofPath = REVIEWED_REVISIONS_PROOF) {
  return fs.existsSync(proofPath) ? JSON.parse(fs.readFileSync(proofPath, 'utf8')) : null;
}

/** Prove exact reviewed forms and preserve every object outside those forms. */
export function verifyReviewedUsageRevisions({ cards, baselineCards, baselineOverlays, revisions = [], englishRevisions = [], deferrals = [],
  proof = readReviewedUsageRevisionsProof(),
  checkpointRound, onCheckpoint,
  naturalnessProofSha256 = sha(fs.readFileSync(path.join(ROOT, 'docs/usage-card-naturalness-full-progress.v1.json.gz'))),
  englishProofSha256 = sha(fs.readFileSync(path.join(ROOT, 'docs/english-usage-release-proof.v1.json.gz'))),
} = {}) {
  indexById(cards, 'Current cards');
  const expected = indexById(baselineCards, 'Revision baseline cards');
  const beforeEnglish = indexById(baselineOverlays, 'Revision baseline English');
  indexById(revisions, 'Runtime revision rows');
  indexById(englishRevisions, 'Runtime English revision rows');
  indexById(deferrals, 'Runtime deferral rows');
  if (!proof) {
    verifyTeachingPairHolds(baselineCards, baselineOverlays);
    const teachingCards = baselineCards.filter(card => !isUsageCardTeachingDeferred(card));
    ensure(revisions.length === 0 && englishRevisions.length === 0 && deferrals.length === 0 && same(cards, teachingCards), 'Missing independent revision proof');
    return { rounds: 0, sourceCount: 0, reviewedCount: 0, approvedCount: 0, deferredCount: 0,
      changedCount: 0, baselineCount: baselineCards.length, cardCount: cards.length,
      teachingHeldCount: baselineCards.length - teachingCards.length };
  }
  ensure(proof.schemaVersion === 1 && proof.baseline?.naturalnessProofSha256 === naturalnessProofSha256
    && proof.baseline?.englishProofSha256 === englishProofSha256
    && Array.isArray(proof.rounds) && proof.rounds.length > 0, 'Invalid revision proof or historical proof binding');
  const latest = new Map(), latestEnglish = new Map(), latestDeferrals = new Map(), roundIds = new Set();
  let reviewedCount = 0, sourceCount = 0;
  // Observers receive copies and are only useful after the complete verifier
  // returns successfully. They cannot modify the replay used for validation.
  const checkpoint = roundCount => {
    if (roundCount === checkpointRound) onCheckpoint?.({roundCount,
      cards: structuredClone([...expected.values()]), english: structuredClone([...beforeEnglish.values()])});
  };
  checkpoint(0);
  for (const round of proof.rounds) {
    ensure(text(round.id) && !roundIds.has(round.id) && text(round.form) && Array.isArray(round.batches)
      && round.batches.length > 0, 'Invalid or duplicate revision round');
    roundIds.add(round.id);
    const explicitSubset = Object.hasOwn(round, 'scopeIds');
    if (explicitSubset) ensure(Array.isArray(round.scopeIds) && round.scopeIds.length > 0
      && new Set(round.scopeIds).size === round.scopeIds.length
      && round.scopeIds.every(id => typeof id === 'string' && expected.get(id)?.form === round.form),
    `${round.id}: invalid exact subset scope`);
    // Older rounds retain their original full-form contract. Only an explicit
    // list narrows scope, and each source comes from the preceding rounds.
    const scope = explicitSubset ? round.scopeIds.map(id => expected.get(id))
      : [...expected.values()].filter(card => card.form === round.form);
    ensure(scope.length > 0 && round.sourceCount === scope.length && same(round.sourceCards, scope), `${round.id}: incomplete or stale frozen form scope`);
    const scopeById = new Map(scope.map(card => [card.id, card]));
    const roundDeferrals = indexById(round.deferrals ?? [], `${round.id}/deferrals`);
    const deferredRows = [...roundDeferrals.values()].map(row => verifyRevisionDeferral(row, scopeById.get(row.id), beforeEnglish.get(row.id)));
    const activeScope = new Map(scope.filter(card => !roundDeferrals.has(card.id)).map(card => [card.id, card]));
    const roundSeen = new Set(), batchIds = new Set(), reasons = new Set();
    const results = [];
    for (const batch of round.batches) {
      ensure(!batchIds.has(batch.id), `${round.id}: duplicate batch`);
      batchIds.add(batch.id);
      results.push(...reviewBatch(batch, activeScope, beforeEnglish, roundSeen, reasons));
    }
    ensure(roundSeen.size + roundDeferrals.size === scope.length, `${round.id}: approved and deferred IDs do not partition the frozen form scope`);
    for (const { revision, english } of results) {
      latest.set(revision.id, revision); latestEnglish.set(english.id, english);
      expected.set(revision.id, revision.card); beforeEnglish.set(english.id, english);
    }
    for (const row of deferredRows) {
      latestDeferrals.set(row.id, row); latest.delete(row.id); latestEnglish.delete(row.id);
      expected.delete(row.id); beforeEnglish.delete(row.id);
    }
    reviewedCount += roundSeen.size;
    sourceCount += scope.length;
    checkpoint(roundIds.size);
  }
  const expectedRevisions = [...latest.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const expectedEnglish = [...latestEnglish.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const expectedDeferrals = [...latestDeferrals.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  ensure(same(revisions, expectedRevisions) && same(englishRevisions, expectedEnglish)
    && same(deferrals, expectedDeferrals), 'Runtime revision data differs from independent approved deliveries or exact deferrals');
  const reviewedCards = [...expected.values()];
  verifyTeachingPairHolds(reviewedCards, [...beforeEnglish.values()]);
  const teachingCards = reviewedCards.filter(card => !isUsageCardTeachingDeferred(card));
  ensure(same(cards, teachingCards), 'Current cards differ from reviewed revisions or an out-of-scope card changed');
  return { rounds: proof.rounds.length, sourceCount, reviewedCount, approvedCount: reviewedCount, deferredCount: latestDeferrals.size,
    changedCount: revisions.filter(row => row.previousHash !== row.finalHash).length,
    baselineCount: baselineCards.length, cardCount: cards.length, teachingHeldCount: reviewedCards.length - teachingCards.length };
}

export function verifyCurrentReviewedUsageRevisions(options = {}) {
  return verifyReviewedUsageRevisions({ cards: USAGE_CARDS, baselineCards: PRE_REVIEWED_USAGE_CARDS,
    baselineOverlays: BASELINE_ENGLISH, revisions: REVIEWED_USAGE_CARD_REVISIONS,
    englishRevisions: EN_REVIEWED_USAGE_CARD_OVERLAYS, deferrals: REVIEWED_USAGE_CARD_DEFERRALS, ...options });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(verifyCurrentReviewedUsageRevisions()));
}
