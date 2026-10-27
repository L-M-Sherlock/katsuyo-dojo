/** Verify the user's 18 pilot dispositions and their actual reviewed successors. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {USAGE_CARDS, REVIEWED_USAGE_CARDS, resolveUsageCard, usageCardItem} from '../app/lib/usage-cards.mjs';
import {EN_USAGE_CARD_OVERLAYS as CURRENT_ENGLISH} from '../app/lib/i18n/content/en/current-usage-cards.mjs';
import {EN_USAGE_CARD_OVERLAYS as BASE_ENGLISH} from '../app/lib/i18n/content/en/usage-cards.mjs';
import {EN_REVIEWED_USAGE_CARD_OVERLAYS} from '../app/lib/i18n/content/en/reviewed-usage-card-revisions.mjs';
import {USER_DIRECTED_FORM_DEFERRALS, isTeachingFormDeferred} from '../app/lib/teaching-form-deferrals.mjs';
import {TEACHING_PAIR_DEFERRALS} from '../app/lib/teaching-pair-deferrals.mjs';
import {assessFormUsage, eligibleVerbForm, supportsVerbForm} from '../app/lib/form-eligibility.mjs';
import {recognizeForms} from '../app/lib/form-recognition.mjs';
import {normalizeAnswer} from '../app/lib/answer-analysis.mjs';
import {readVerifiedReviewedUsageCheckpoint, verifyReviewedProofPrefix} from './lib/reviewed-usage-history.mjs';
import {loadFormRiskPilotProof, PILOT_PROOF, PILOT_BASELINE_SHA256, verifyFormRiskPilot} from './verify-form-risk-pilot.mjs';
import {readReviewedUsageRevisionsProof, verifyCurrentReviewedUsageRevisions,
  verifyPortableRevisionDelivery} from './verify-reviewed-usage-revisions.mjs';
import {verifyFourFormHold} from './verify-four-form-hold.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FEEDBACK_REQUEST = path.join(ROOT, 'docs/usage-card-risk-pilot-feedback-request-20261027.json.gz');
export const FEEDBACK_HOLDS = path.join(ROOT, 'docs/usage-card-risk-pilot-feedback-holds-20261027.json');
export const FEEDBACK_REPORT = path.join(ROOT, 'docs/usage-card-risk-pilot-feedback-20261027.md');
export const FEEDBACK_LIST = path.join(ROOT, 'docs/usage-card-risk-pilot-feedback-list-20261027.md');
export const FEEDBACK_REQUEST_SHA256 = '8ffec9c7db0397ed8c194dea0f4170d82a0605c776bc8e1428f70d4080a11cc0';
const HOLDS_SHA256 = '5cb82617766924699fabd260180f90b1aa9a6ac63390603d56aed168e6245051';
const PILOT_SHA256 = '96d3e4f426d9a0f552d7db182ac943fd1e34233464e90b465f99b4097cab16b3';
const REQUEST_RECEIPT = '923e800b87cc1a05c6eeda4751aae38545bec176a8e30f39b62d4449af9fd22f';
const FEEDBACK_SHA256 = '4018f76a476d909c92fe5ea1fa89c600d24e921cf41a990d7ec2925d0e268901';
const INITIAL_ROUNDS_HASH = 'a594afb55b09a9777523c99a8babc4d9aeefe89b2663e4a46d1e4cf835bf23e5';
const INITIAL_PROOF_SHA256 = '0f16416753140b77e7e8241984a53fad6028422ff47702498bf28be6ef5d9e14';
// Actual final deliveries, all three rejected copies, and the candid 05 sealing
// note are fixed together. Resealing a plausible vote cannot replace one.
const ACTUAL_REVIEW_RECEIPTS_SHA256 = '3694c306592801099df20a583d4ca85b211958b7132f458a7d9ec3ac14be0db9';
const ROUND_PREFIX = 'pilot-feedback-fix-20261027-';
export const FEEDBACK_FORMS = ['zu', 'teoru', 'toru', 'teoruPast', 'teageruNegative', 'teikuNegative',
  'tearuNegative', 'tearuNegativePast', 'teshimauNegativePast'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hash = value => sha(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = values => [...values].sort();
const ensure = (ok, message) => { if (!ok) throw Error(message); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const indexById = (rows, label) => {
  ensure(Array.isArray(rows) && rows.every(row => nonempty(row?.id)), `${label}: missing rows or ID`);
  const result = new Map(rows.map(row => [row.id, row]));
  ensure(result.size === rows.length, `${label}: duplicate ID`);
  return result;
};
const artifact = (files, key) => {
  ensure(files.has(key), `Missing feedback artifact ${key}`);
  return JSON.parse(files.get(key).toString('utf8'));
};
const fullText = (card, target, reading = false) => [...card.before, target, ...card.after]
  .map(part => reading ? part.reading ?? part.text : part.text).join('');

export function loadRiskPilotFeedbackRequest(file = FEEDBACK_REQUEST) {
  const bytes = fs.readFileSync(file);
  ensure(sha(bytes) === FEEDBACK_REQUEST_SHA256, 'Frozen user feedback request bytes changed');
  return JSON.parse(zlib.gunzipSync(bytes));
}

export function loadRiskPilotFeedbackHolds(file = FEEDBACK_HOLDS) {
  const bytes = fs.readFileSync(file);
  ensure(sha(bytes) === HOLDS_SHA256, 'Frozen feedback hold evidence bytes changed');
  return JSON.parse(bytes);
}

function verifyRequest(request, pilot, pilotProof, history) {
  ensure(request?.schemaVersion === 1 && request.kind === 'user-directed-pilot-dispositions'
    && request.sourceCommit === pilot.sourceCommit && request.pilotProofSha256 === PILOT_SHA256
    && request.baselineProofSha256 === PILOT_BASELINE_SHA256 && request.initialRounds === 17
    && request.initialRoundsHash === INITIAL_ROUNDS_HASH
    && request.initialReviewedProofSha256 === INITIAL_PROOF_SHA256,
  'Invalid feedback request identity or historical checkpoint');
  const files = verifyPortableRevisionDelivery(request.sourceDelivery, 'author', 'pilotchoice/00');
  ensure(request.sourceDelivery.receipt === REQUEST_RECEIPT
    && same(request.paths, {sources: 'scope/sources.json', decisions: 'scope/decisions.json',
      feedback: 'scope/user-feedback.txt', instruction: 'scope/instruction.txt'})
    && same(sorted(files.keys()), sorted(Object.values(request.paths)))
    && sha(files.get(request.paths.feedback)) === FEEDBACK_SHA256
    && files.get(request.paths.instruction).toString('utf8') === '根据这个反馈，如果是必须换动词或换活用表达，直接暂缓，剩下的按照建议微调。\n用户另明确确认：勝ってもらわなかった、届いていかない两项直接暂缓，避免勉强造句。\n',
  'Frozen user feedback text, instruction or source receipt changed');
  const sources = artifact(files, request.paths.sources), decisions = artifact(files, request.paths.decisions);
  const sourceById = indexById(sources, 'Feedback sources'), decisionById = indexById(decisions, 'Feedback decisions');
  const original = pilot.samples.filter(row => row.assessment.status !== 'approved');
  ensure(original.length === 18 && pilot.counts.approved === 138 && pilot.counts.revise === 7 && pilot.counts.uncertain === 11
    && same(sources.map(row => row.id), original.map(row => row.id))
    && same(decisions.map(row => row.id), original.map(row => row.id)) && request.rows?.length === 18,
  'Feedback must cover exactly the historical seven revise and eleven uncertain cards');
  const rawSources = new Map();
  for (const batch of pilotProof.batches) {
    const packetFiles = verifyPortableRevisionDelivery(batch.sourceDelivery, 'author', batch.id);
    for (const row of artifact(packetFiles, batch.sourcePath).rows) rawSources.set(row.id, {...row,
      sourceReceipt: batch.sourceDelivery.receipt});
  }
  for (const [index, old] of original.entries()) {
    const source = sourceById.get(old.id), decision = decisionById.get(old.id), raw = rawSources.get(old.id);
    const {assessment, sourceReceipt, action, proposedSentence, usageAtRequest, ...frozenOld} = source;
    const {sourceReceipt: rawReceipt, ...rawOld} = raw;
    ensure(same(frozenOld, rawOld) && same(source.card, history.cards.get(old.id))
      && same(source.english, history.english.get(old.id))
      && hash(source.card) === source.sourceHash && hash(source.english) === source.englishHash
      && source.english.sourceHash === source.sourceHash && sourceReceipt === rawReceipt
      && same(assessment, old.assessment) && same(source.previousUsage, old.previousUsage),
    `${old.id}: feedback source is not the joint historical card/English/pilot snapshot`);
    ensure(decision.id === old.id && decision.senseId === source.card.senseId && decision.form === source.card.form
      && decision.sourceHash === source.sourceHash && decision.englishHash === source.englishHash
      && decision.fullSentence === source.fullSentence && decision.action === action
      && decision.proposedSentence === proposedSentence && ['hold', 'revise', 'retain'].includes(action)
      && (action === 'revise' ? nonempty(proposedSentence) && proposedSentence !== source.fullSentence : proposedSentence === null)
      && same(request.rows[index], {id: old.id, action, sourceHash: source.sourceHash,
        englishHash: source.englishHash, fullSentence: source.fullSentence, proposedSentence}),
    `${old.id}: frozen decision or identity drift`);
    const formHold = request.priorFormHolds.find(row => row.form === source.card.form);
    const expectedUsageAtRequest = formHold ? {status: 'context-required', category: 'context',
      reason: formHold.reason, reviewVersion: source.previousUsage.reviewVersion, reasonCode: 'user-directed-form-hold'}
      : source.previousUsage;
    ensure(same(usageAtRequest, expectedUsageAtRequest), `${old.id}: request-time teaching status was backdated or forged`);
  }
  const counts = Object.fromEntries(['hold', 'revise', 'retain'].map(action =>
    [action, sources.filter(row => row.action === action).length]));
  ensure(same(counts, {hold: 7, revise: 8, retain: 3}) && same(request.counts, counts), 'Feedback decision counts drift');
  ensure(request.priorPairHoldIds?.length === 112 && new Set(request.priorPairHoldIds).size === 112
    && same(TEACHING_PAIR_DEFERRALS.slice(0, 112).map(row => row.id), request.priorPairHoldIds)
    && hash(TEACHING_PAIR_DEFERRALS.slice(0, 112)) === request.priorPairHoldsHash
    && same(USER_DIRECTED_FORM_DEFERRALS, request.priorFormHolds),
  'Earlier 112 exact holds or complete form-hold policy changed');
  return sources;
}

function verifyHolds(holds, request, sources, canonical, rawEnglish, active, english) {
  ensure(holds?.schemaVersion === 1 && holds.kind === 'user-directed-exact-pair-hold'
    && holds.sourceCommit === request.sourceCommit
    && holds.request === '根据反馈，须换动词或换目标活用则直接暂缓；勝ってもらわなかった和届いていかない两项也由用户明确选择暂缓，避免勉强造句。'
    && holds.requestFile === 'docs/usage-card-risk-pilot-feedback-request-20261027.json.gz', 'Invalid feedback hold evidence');
  const sourceById = indexById(holds.sourceRows, 'Feedback held sources');
  const held = sources.filter(row => row.action === 'hold');
  ensure(same([...sourceById.keys()], held.map(row => row.id)) && TEACHING_PAIR_DEFERRALS.length === 119,
    'Feedback hold evidence must cover exactly seven separately authorized pairs');
  const newRegistry = TEACHING_PAIR_DEFERRALS.slice(112);
  ensure(same(newRegistry.map(row => row.id), held.map(row => row.id)), 'New exact hold registry scope or order drift');
  let alreadyFormHeld = 0;
  for (const [index, source] of held.entries()) {
    const row = sourceById.get(source.id), hold = newRegistry[index], item = usageCardItem(source.card.senseId);
    ensure(row.pair === `${source.card.senseId}/${source.card.form}` && row.senseId === source.card.senseId
      && row.form === source.card.form && row.basis === 'user-directed-teaching-hold'
      && row.requestedAt === '2026-10-27' && nonempty(row.reason) && nonempty(row.restoreCondition)
      && row.evidenceFile === 'docs/usage-card-risk-pilot-feedback-holds-20261027.json'
      && same(Object.keys(row), ['id', 'pair', 'senseId', 'form', 'sourceHash', 'englishHash', 'basis',
        'requestedAt', 'reason', 'restoreCondition', 'evidenceFile', 'card', 'english', 'previousUsage',
        'usageAtRequest', 'previousUsageProvenance'])
      && Object.keys(hold).every(key => same(hold[key], row[key]))
      && row.sourceHash === source.sourceHash && row.englishHash === source.englishHash
      && same(row.card, source.card) && same(row.english, source.english)
      && same(row.previousUsage, source.previousUsage) && same(row.usageAtRequest, source.usageAtRequest)
      && same(row.previousUsageProvenance, {kind: 'pre-form-hold-published-pilot-snapshot',
        proof: 'docs/usage-card-form-risk-pilot-20261027.json.gz', proofSha256: request.pilotProofSha256,
        sourceReceipt: source.sourceReceipt, id: source.id, sourceHash: source.sourceHash, englishHash: source.englishHash}),
    `${source.id}: held source, user basis or original pilot provenance changed`);
    ensure(same(canonical.get(source.id), source.card) && same(rawEnglish.get(source.id), source.english)
      && !active.has(source.id) && !english.has(source.id) && supportsVerbForm(item, row.form)
      && !eligibleVerbForm(item, row.form), `${source.id}: held bilingual object changed or teaching was restored`);
    const recognition = recognizeForms(item, source.target.text, normalizeAnswer).find(row => row.form === source.card.form);
    const reasonCode = isTeachingFormDeferred(row.form) ? 'user-directed-form-hold' : 'user-directed-pair-hold';
    ensure(recognition?.usage.reasonCode === reasonCode && assessFormUsage(item, row.form).reasonCode === reasonCode,
      `${source.id}: complete target morphology or held answer recognition was removed`);
    if (source.usageAtRequest.reasonCode === 'user-directed-form-hold') alreadyFormHeld++;
  }
  ensure(alreadyFormHeld === 4, 'Four feedback pairs were already under whole-form holds');
  return alreadyFormHeld;
}

function verifySuccessors(proof, sources, canonical, rawEnglish, active, english) {
  ensure(proof?.rounds?.length === 26 && hash(proof.rounds.slice(0, 17)) === INITIAL_ROUNDS_HASH,
    'Feedback successors must preserve 17 historical rounds and append nine actual review rounds');
  const historySummary = verifyCurrentReviewedUsageRevisions({proof});
  const rounds = proof.rounds.slice(17);
  ensure(same(sorted(rounds.map(round => round.id)), sorted(FEEDBACK_FORMS.map(form => `${ROUND_PREFIX}${form}`))),
    'Missing or out-of-scope feedback review rounds');
  const expected = sources.filter(row => row.action !== 'hold'), sourceById = new Map(expected.map(row => [row.id, row]));
  const seen = new Map(), reviews = [], earlierReviews = [], receipts = new Set();
  for (const round of rounds) {
    const ids = expected.filter(row => row.card.form === round.form).map(row => row.id);
    ensure(round.id === `${ROUND_PREFIX}${round.form}` && ids.length > 0 && same(round.scopeIds, ids)
      && round.sourceCount === ids.length && same(round.sourceCards, ids.map(id => sourceById.get(id).card))
      && !(round.deferrals ?? []).length, `${round.id}: exact feedback scope or original source changed`);
    for (const batch of round.batches) {
      const reviewerGroup = FEEDBACK_FORMS.indexOf(round.form) < 6 ? 'a' : 'b';
      ensure(batch.id === `pilotfix/${String(FEEDBACK_FORMS.indexOf(round.form)).padStart(2, '0')}`
        && batch.author === '/root/pilot_feedback_author'
        && batch.reviewer === `/root/pilot_feedback_review_${reviewerGroup}`,
      `${batch.id}: feedback author or reviewer differs from the actual assignment`);
      const authorFiles = verifyPortableRevisionDelivery(batch.authorDelivery, 'author', batch.id);
      const reviewFiles = verifyPortableRevisionDelivery(batch.reviewDelivery, 'review', batch.id);
      const drafts = artifact(authorFiles, batch.paths.cards), notes = artifact(authorFiles, batch.paths.notes);
      const input = artifact(authorFiles, batch.paths.input), report = artifact(reviewFiles, batch.paths.report);
      ensure(!receipts.has(batch.authorDelivery.receipt) && !receipts.has(batch.reviewDelivery.receipt),
        `${batch.id}: reused feedback receipt`);
      receipts.add(batch.authorDelivery.receipt); receipts.add(batch.reviewDelivery.receipt);
      reviews.push({roundId: round.id, form: round.form, batchId: batch.id,
        author: batch.author, authorModel: batch.authorModel, authorEffort: batch.authorEffort,
        reviewer: batch.reviewer, reviewerModel: batch.reviewerModel, reviewerEffort: batch.reviewerEffort,
        authorReceipt: batch.authorDelivery.receipt, reviewReceipt: batch.reviewDelivery.receipt, count: drafts.length});
      const oldSubmissions = batch.earlierSubmissions ?? [];
      const expectedOldCount = round.form === 'teageruNegative' ? 2 : round.form === 'teshimauNegativePast' ? 1 : 0;
      ensure(Array.isArray(oldSubmissions) && oldSubmissions.length === expectedOldCount
        && batch.authorDelivery.revision === expectedOldCount + 1
        && batch.reviewDelivery.revision === expectedOldCount + 1,
      `${batch.id}: missing actual rejected submission or unexpected replacement`);
      for (const [oldIndex, earlier] of oldSubmissions.entries()) {
        const oldAuthor = verifyPortableRevisionDelivery(earlier.authorDelivery, 'author', batch.id);
        const oldReview = verifyPortableRevisionDelivery(earlier.reviewDelivery, 'review', batch.id);
        ensure(earlier.authorDelivery.revision === oldIndex + 1 && earlier.reviewDelivery.revision === oldIndex + 1
          && same(sorted(oldAuthor.keys()), sorted(authorFiles.keys()))
          && same([...oldReview.keys()], [batch.paths.report]) && nonempty(earlier.reason)
          && !receipts.has(earlier.authorDelivery.receipt) && !receipts.has(earlier.reviewDelivery.receipt),
        `${batch.id}: rejected submission order, scope or receipt drift`);
        receipts.add(earlier.authorDelivery.receipt); receipts.add(earlier.reviewDelivery.receipt);
        const oldInput = artifact(oldAuthor, batch.paths.input), oldAssignment = artifact(oldAuthor, batch.paths.assignment);
        const oldDrafts = artifact(oldAuthor, batch.paths.cards), oldNotes = artifact(oldAuthor, batch.paths.notes);
        const oldReadings = artifact(oldAuthor, batch.paths.readings), oldReport = artifact(oldReview, batch.paths.report);
        artifact(oldAuthor, batch.paths.checks);
        ensure(same(oldInput, input) && same(oldAssignment, artifact(authorFiles, batch.paths.assignment))
          && same(oldDrafts.map(row => row.id), drafts.map(row => row.id))
          && same(oldNotes.map(row => row.id), drafts.map(row => row.id))
          && oldReadings.structuralIssues?.length === 0 && Array.isArray(oldReadings.candidates)
          && oldReport.schemaVersion === 1 && oldReport.batchId === batch.id
          && oldReport.reviewer === batch.reviewer && oldReport.selfReview === false
          && oldReport.sourceReceipt === earlier.authorDelivery.receipt
          && oldReport.count === drafts.length && same(oldReport.rows.map(row => row.id), drafts.map(row => row.id)),
        `${batch.id}: stale or incomplete actual rejection report`);
        for (const [oldRowIndex, oldDraft] of oldDrafts.entries()) {
          const source = sourceById.get(oldDraft.id), final = {...drafts[oldRowIndex], review: 'approved'};
          const oldFinal = {...oldDraft, review: 'approved'}, oldNote = oldNotes[oldRowIndex];
          const oldEnglish = {id: oldDraft.id, sourceHash: hash(oldFinal), ...oldNote.english};
          const target = resolveUsageCard(oldDraft, {allowTeachingHolds: true})?.target;
          const vote = oldReport.rows[oldRowIndex];
          ensure(source && same({...oldFinal, translation: null}, {...final, translation: null})
            && oldDraft.review === 'draft' && oldNote.disposition === 'revise'
            && same(target, source.target) && fullText(oldDraft, target) === source.proposedSentence
            && vote.status === 'revise' && vote.hash === hash(oldDraft) && vote.sourceHash === hash(oldFinal)
            && vote.englishHash === hash(oldEnglish) && vote.sentence === source.proposedSentence
            && nonempty(vote.reason) && ['roles', 'time', 'negation', 'translation', 'reading'].every(key => nonempty(vote[key]))
            && nonempty(vote.english?.reason) && Object.values(vote.english.checks ?? {}).some(value => value === false),
          `${oldDraft.id}: actual rejected copy or bilingual hash binding changed`);
          earlierReviews.push({batchId: batch.id, revision: oldIndex + 1, id: oldDraft.id,
            reviewer: batch.reviewer, authorReceipt: earlier.authorDelivery.receipt,
            reviewReceipt: earlier.reviewDelivery.receipt, reason: vote.reason,
            sourceHash: vote.sourceHash, englishHash: vote.englishHash});
        }
      }
      for (const [index, draft] of drafts.entries()) {
        const source = sourceById.get(draft.id), note = notes[index], reviewed = report.rows[index];
        ensure(source && !seen.has(draft.id) && round.scopeIds.includes(draft.id)
          && same(input.rows[index].card, source.card) && same(input.rows[index].english, source.english)
          && input.rows[index].sourceHash === source.sourceHash && note.id === draft.id && reviewed.id === draft.id,
        `${draft.id}: duplicate or stale feedback source in successor`);
        const final = {...draft, review: 'approved'}, target = resolveUsageCard(final, {allowTeachingHolds: true})?.target;
        const en = {id: final.id, sourceHash: hash(final), ...note.english};
        ensure(target && ['id', 'senseId', 'meaning', 'form'].every(key => final[key] === source.card[key])
          && same(target, source.target), `${draft.id}: fixed lexical identity or complete target changed`);
        if (source.action === 'retain') ensure(note.disposition === 'retain' && same(final, source.card)
          && same(en, source.english), `${draft.id}: retained canonical or English original changed`);
        else ensure(source.action === 'revise' && note.disposition === 'revise' && draft.review === 'draft'
          && hash(final) !== source.sourceHash && fullText(final, target) === source.proposedSentence,
        `${draft.id}: successor does not exactly implement the frozen user sentence`);
        ensure(same(canonical.get(draft.id), final) && same(rawEnglish.get(draft.id), en)
          && (isTeachingFormDeferred(final.form) ? !active.has(draft.id) && !english.has(draft.id)
            : same(active.get(draft.id), final) && same(english.get(draft.id), en)),
        `${draft.id}: current canonical or English differs from the actual final review`);
        seen.set(draft.id, {card: final, english: en, target, fullSentence: fullText(final, target),
          fullReading: fullText(final, target, true), sourceHash: hash(final), englishHash: hash(en),
          review: {...reviewed, author: batch.author, reviewer: batch.reviewer, batchId: batch.id,
            authorReceipt: batch.authorDelivery.receipt, reviewReceipt: batch.reviewDelivery.receipt}});
      }
    }
  }
  ensure(seen.size === 11 && expected.every(source => seen.has(source.id)), 'Feedback successors omit an assigned card');
  ensure(historySummary.rounds === 26 && historySummary.sourceCount === 292
    && historySummary.reviewedCount === 291 && historySummary.changedCount === 221,
  'Actual reviewed revision totals differ from the exact eleven-card successor');
  const receiptLedgerHash = hash({final: reviews, earlier: earlierReviews,
    preSeal: rounds.flatMap(round => round.batches).map(batch => ({batchId: batch.id,
      note: batch.preSealReconsideration ?? null}))});
  ensure(receiptLedgerHash === ACTUAL_REVIEW_RECEIPTS_SHA256,
    'Actual feedback review receipts or the pre-sealing history were replaced');
  return {successors: seen, reviews, earlierReviews, historySummary, receiptLedgerHash};
}

export async function verifyRiskPilotFeedback({request = loadRiskPilotFeedbackRequest(),
  holds = loadRiskPilotFeedbackHolds(), revisionProof = readReviewedUsageRevisionsProof(), verifyRendered = true} = {}) {
  ensure(sha(fs.readFileSync(PILOT_PROOF)) === PILOT_SHA256, 'Historical pilot proof bytes changed');
  verifyReviewedProofPrefix(INITIAL_PROOF_SHA256, 17);
  const history = readVerifiedReviewedUsageCheckpoint(17);
  const pilotProof = loadFormRiskPilotProof();
  const pilot = await verifyFormRiskPilot({proof: pilotProof, verifyPolicy: false});
  const sources = verifyRequest(request, pilot, pilotProof, history);
  const canonical = new Map(REVIEWED_USAGE_CARDS.map(card => [card.id, card]));
  const rawEnglish = new Map([...BASE_ENGLISH, ...EN_REVIEWED_USAGE_CARD_OVERLAYS].map(row => [row.id, row]));
  const active = new Map(USAGE_CARDS.map(card => [card.id, card]));
  const english = new Map(CURRENT_ENGLISH.map(row => [row.id, row]));
  const alreadyFormHeld = verifyHolds(holds, request, sources, canonical, rawEnglish, active, english);
  const {successors, reviews, earlierReviews, historySummary, receiptLedgerHash} = verifySuccessors(revisionProof, sources, canonical, rawEnglish, active, english);
  const policy = verifyFourFormHold();
  ensure(policy.exactPairHeld === 119 && policy.formHeld === 357 && policy.overlap === 6
    && policy.totalTeachingHeld === 470 && USAGE_CARDS.length === 16790 && english.size === 16790
    && new Set(USAGE_CARDS.map(card => card.form)).size === 165, 'Current teaching policy or bilingual inventory drift');
  const rows = sources.map(source => ({source, action: source.action,
    ...(successors.get(source.id) ?? {card: source.card, english: source.english, target: source.target,
      fullSentence: source.fullSentence, fullReading: source.fullReading,
      sourceHash: source.sourceHash, englishHash: source.englishHash})}));
  const result = {summary: {sourceCount: sources.length, userHeld: 7, revised: 8, retained: 3,
    newActiveExits: 7 - alreadyFormHeld, alreadyFormHeld, currentCards: active.size, currentForms: 165},
  rows, reviews, earlierReviews, requestReceipt: request.sourceDelivery.receipt, requestSha256: FEEDBACK_REQUEST_SHA256,
  pilotProofSha256: request.pilotProofSha256, historySummary, policy, receiptLedgerHash};
  if (verifyRendered) {
    ensure(fs.readFileSync(FEEDBACK_REPORT, 'utf8') === renderRiskPilotFeedbackReport(result), 'Feedback detailed report drift');
    ensure(fs.readFileSync(FEEDBACK_LIST, 'utf8') === renderRiskPilotFeedbackList(result), 'Feedback independent list drift');
  }
  return result;
}

const cell = value => String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
const formAndTarget = row => `${usageCardItem(row.card.senseId).surface}→${row.target.text}`;
const actionLabel = {hold: '暂缓', revise: '微调后', retain: '原样保留'};

export function renderRiskPilotFeedbackList(result) {
  const lines = ['# 本次反馈处理后的日语句清单', '', '只列变形与日语句；暂缓项保留源句，其余列本次核验后的句子。', ''];
  for (const action of ['hold', 'revise', 'retain']) {
    const rows = result.rows.filter(row => row.action === action);
    lines.push(`## ${actionLabel[action]}（${rows.length}）`, '', '| 变形 | 日语原句 |', '| --- | --- |');
    for (const row of rows) lines.push(`| ${cell(formAndTarget(row))} | ${cell(row.fullSentence)} |`);
    lines.push('');
  }
  return lines.join('\n');
}

export function renderRiskPilotFeedbackReport(result) {
  const {summary, historySummary, policy} = result;
  const lines = ['# 18 项试评反馈处理记录（2026-10-27）', '',
    '本次按用户逐句反馈及后续明确选择，暂缓 7 个精确词义／形式配对、微调 8 张卡，原样保留 3 张卡。8 张微调和 3 张保留均有本轮真实独立审核及中英、注音记录；暂缓项记录为用户教学选择，不虚构返修失败次数。', '',
    '**教学状态：**四个整形式暂停继续有效。本次文字与双语核对不消除 `tearuNegative`／`tearuNegativePast` 的目标同形疑点；原试评的 8 个 `tearu` 样本仍保留其历史 `uncertain` 结论。用户保留的 3 个原句也仍受整形式暂停限制，本报告不将它们恢复为可出题。', '',
    `当前题池 ${summary.currentCards} 张、${summary.currentForms} 个形式。7 个精确暂停中，${summary.alreadyFormHeld} 个在请求时已被整形式暂停覆盖，本次新退出当前题池的是 ${summary.newActiveExits} 个。精确暂停合计 ${policy.exactPairHeld}，整形式覆盖 ${policy.formHeld}，重叠 ${policy.overlap}，去重后暂停 ${policy.totalTeachingHeld}。`, '',
    '## 用户来源与历史边界', '',
    '- 原始 156 卡试评保持最终 138 通过／7 需修／11 未决；本次范围恰为后两组 18 项，未改写旧试评报告或审核票。',
    '- 用户要求：“根据这个反馈，如果是必须换动词或换活用表达，直接暂缓，剩下的按照建议微调。”另明确确认「勝ってもらわなかった」「届いていかない」两项直接暂缓。',
    `- 原用户反馈全文、确认及 18 项源卡／决策封存在 [请求快照](usage-card-risk-pilot-feedback-request-20261027.json.gz)；SHA-256：\`${result.requestSha256}\`。`,
    `- 用户来源收据：\`${result.requestReceipt}\`。该收据的 author 只是存储协议阶段，不代表模型创作或语言审核。`,
    `- [原试评快照](usage-card-form-risk-pilot-20261027.json.gz) SHA-256：\`${result.pilotProofSha256}\`。`,
    '- 源 canonical 与 English 联合回放到第 17 轮检查点；完整后继链验证后才使用该历史快照，不能拼接两个不同版本。旧 112 个精确暂停对象及全部整形式暂停政策保持不变。', '',
    '## 用户指定暂缓（7）', '',
    '保留原 canonical／English 对象、源句和旧批准历史，退出当前教学供应并保留构形与完整词形识别。`previousUsage` 来自原试评快照，并保存源收据与 proof SHA-256；`usageAtRequest` 如实记录请求时已存在的整形式暂停。', '',
    '| 固定配对 | 变形 | 源日语句 | 请求时状态 |', '| --- | --- | --- | --- |'];
  for (const row of result.rows.filter(row => row.action === 'hold')) lines.push(`| ${cell(`${row.card.senseId}/${row.card.form}`)} | ${cell(formAndTarget(row))} | ${cell(row.source.fullSentence)} | ${row.source.usageAtRequest.reasonCode === 'user-directed-form-hold' ? '已整形式暂停' : '本次新退出题池'} |`);
  lines.push('', '暂缓证据见 [7 项来源与恢复条件](usage-card-risk-pilot-feedback-holds-20261027.json)。恢复须符合该精确配对的用户恢复条件；整形式暂停仍需单独的明确恢复指令。', '', '## 微调（8）', '');
  for (const row of result.rows.filter(row => row.action === 'revise')) {
    lines.push(`### ${formAndTarget(row)}`, '', `- 固定 ID：\`${row.card.id}\`；词义：${row.card.meaning}；形式：\`${row.card.form}\`。`,
      `- 修改前：${row.source.fullSentence}`, `- 修改后：${row.fullSentence}`,
      `- 原完整读音：${row.source.fullReading}`, `- 新完整读音：${row.fullReading}`,
      `- 原中文场景：${row.source.card.scene}`, `- 新中文场景：${row.card.scene}`,
      `- 原中文译文：${row.source.card.translation}`, `- 新中文译文：${row.card.translation}`,
      `- Original English scene: ${row.source.english.scene}`, `- Revised English scene: ${row.english.scene}`,
      `- Original English translation: ${row.source.english.translation}`, `- Revised English translation: ${row.english.translation}`,
      `- canonical SHA-256：\`${row.source.sourceHash}\` → \`${row.sourceHash}\`。`,
      `- English SHA-256：\`${row.source.englishHash}\` → \`${row.englishHash}\`。`,
      `- 本轮审核：${row.review.reviewer}；${row.review.reason}`, '');
  }
  lines.push('## 原样保留（3）', '', '以下 canonical 与 English 均保持原对象及原哈希；本轮仍逐卡核对文字、译文与读音。它们的形式继续暂停，审核记录只支持此次原文核对。', '');
  for (const row of result.rows.filter(row => row.action === 'retain')) {
    lines.push(`### ${formAndTarget(row)}`, '', `- 固定 ID：\`${row.card.id}\`；词义：${row.card.meaning}；形式：\`${row.card.form}\`。`,
      `- 原句：${row.fullSentence}`, `- 完整读音：${row.fullReading}`,
      `- 中文场景：${row.card.scene}`, `- 中文译文：${row.card.translation}`,
      `- English scene: ${row.english.scene}`, `- English translation: ${row.english.translation}`,
      `- canonical SHA-256：\`${row.sourceHash}\`；English SHA-256：\`${row.englishHash}\`。`,
      `- 本轮审核：${row.review.reviewer}；${row.review.reason}`, '');
  }
  lines.push('## 实际作者与独立审核', '',
    '每条收据均随 [增量证明](usage-card-reviewed-revisions.v1.json) 保存不可变原始字节；逐卡批准绑定 draft hash、final sourceHash、English hash 与完整日语句。作者与审核者为不同代理，作者使用 gpt-6-luna／max，审核者使用 gpt-6-sol／medium。', '',
    '| round / batch | 数量 | 作者 | 审核者 | 作者收据 | 审核收据 |', '| --- | --- | --- | --- | --- | --- |');
  for (const review of result.reviews) lines.push(`| ${cell(`${review.roundId} / ${review.batchId}`)} | ${review.count} | ${review.author} | ${review.reviewer} | \`${review.authorReceipt}\` | \`${review.reviewReceipt}\` |`);
  lines.push('', '### 真实返修与封存边界', '',
    '04（教える）有两份实际拒收：第一稿的英文译文搭配生硬，第二稿译文已修好但英文场景仍有同样词组；08（来る）第一稿的中英译文添加了日语未明说的出错者。以下旧稿和拒收票均保留原字节收据；这些是文字与双语返修，不算固定配对的三次自然度失败。', '',
    '| batch / 原 revision | 原作者收据 | 原拒收收据 | 实际理由 |', '| --- | --- | --- | --- |');
  for (const earlier of result.earlierReviews) lines.push(`| ${earlier.batchId} / ${earlier.revision} | \`${earlier.authorReceipt}\` | \`${earlier.reviewReceipt}\` | ${cell(earlier.reason)} |`);
  lines.push('', '05（していかない）曾因英语场景使用第三人称、译文使用第一人称被提出角色疑点；原审核者复核为同一角色发话后批准，作者稿未改。协调者先发起复核才封存，初评文件已被覆盖，未取得该初评逐字不可变收据；此处只保留真实通信摘要，不声称初票字节或收据完整。当前 approved 报告是该稿首次正式封存的有效票，此事不计作者返修失败。');
  lines.push('', `本轮最终票、3 份旧拒收票及 05 封存边界说明的联合来源摘要 SHA-256：\`${result.receiptLedgerHash}\`。`);
  lines.push('', `完整链为 ${historySummary.rounds} 轮，累计源条目 ${historySummary.sourceCount}、实际审核条目 ${historySummary.reviewedCount}、当前修订对象 ${historySummary.changedCount}。本次新增 9 个精确 scope round，覆盖 11 个源 ID，无缺漏或越界。`, '',
    '本报告由 `node scripts/verify-risk-pilot-feedback.mjs` 从封存请求、真实收据和当前对象重建。它验证内容与来源绑定，不代替语言审核；整仓测试、构建与最终未提交状态由本轮交付说明另列。用户本轮未授权提交或发布。', '');
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify((await verifyRiskPilotFeedback()).summary));
}
