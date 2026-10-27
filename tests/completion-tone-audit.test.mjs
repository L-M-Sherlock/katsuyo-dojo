import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createDelivery} from '../.agents/skills/write-katsuyo-usage-cards/scripts/delivery-store.mjs';
import {readReviewedUsageRevisionsProof, verifyPortableRevisionDelivery} from '../scripts/verify-reviewed-usage-revisions.mjs';
import {readCompletionToneAudit, verifyCompletionToneAudit, COMPLETION_TONE_FIX_IDS,
  COMPLETION_TONE_FIX_ROUND, COMPLETION_TONE_EXCLUDED_ID,
  readCompletionToneTeachingHolds} from '../scripts/verify-completion-tone-audit.mjs';
import {USAGE_CARDS} from '../app/lib/usage-cards.mjs';
import {EN_USAGE_CARD_OVERLAYS} from '../app/lib/i18n/content/en/current-usage-cards.mjs';
import {TEACHING_PAIR_DEFERRALS} from '../app/lib/teaching-pair-deferrals.mjs';
import {EXPECTED_COMPLETION_TONE_USER_HOLD_IDS} from './helpers/current-teaching-hold-scope.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const hash = value => sha(JSON.stringify(value));
function reseal(t, batchId, phase, revision, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'katsuyo-invalid-tone-proof-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const delivery = createDelivery({root, batch: batchId, phase, revision, artifacts: files});
  return {...delivery, artifacts: Object.fromEntries([...files].map(([file, bytes]) => [file, bytes.toString('base64')]))};
}

test('the 281-card perspective audit retains historical judgments and closes exactly two English findings', () => {
  const result = verifyCompletionToneAudit();
  const {rows, reviewChanges, initialSummary, resolutions, ...summary} = result;
  assert.deepEqual(summary, {sourceCount: 281, consistent: 254, optionalPolish: 25, revise: 2,
    uncertain: 0, currentOpen: 0, resolved: 2});
  assert.deepEqual(initialSummary, {sourceCount: 281, consistent: 251, optionalPolish: 20, revise: 10, uncertain: 0});
  assert.equal(new Set(rows.map(row => row.id)).size, 281);
  assert.equal(rows.some(row => row.id === COMPLETION_TONE_EXCLUDED_ID), false);
  assert.ok(rows.every(row => ['teshimau', 'chau'].includes(row.card.form)));
  assert.equal(reviewChanges.length, 9);
  assert.equal(reviewChanges.filter(row => row.fromStatus !== row.toStatus).length, 8);
  assert.deepEqual(resolutions.map(row => row.id).sort(), [...COMPLETION_TONE_FIX_IDS].sort());
  assert.ok(resolutions.every(row => row.previousEnglishHash !== row.englishHash && row.author !== row.reviewer));
  const proof = readCompletionToneAudit();
  assert.equal(proof.batches.filter(batch => batch.reviewDelivery.revision === 2).length, 6);
  assert.ok(proof.batches.every(batch => batch.initialReviewDelivery.revision === 1));
  assert.equal(sha(fs.readFileSync(new URL('../docs/usage-card-completion-tone-audit-20261027.json.gz', import.meta.url))),
    'f70a34ce3d86bb445e34240e3ccdbd72bf55995fd5d6f69d9993c342f76bbe6d', 'the source, initial and final evidence bytes stay frozen');
});

test('the later nine user holds preserve all historical votes without restoring the earlier fourteen holds', () => {
  const {rows, resolutions} = verifyCompletionToneAudit();
  const active = new Set(USAGE_CARDS.map(card => card.id));
  const english = new Set(EN_USAGE_CARD_OVERLAYS.map(row => row.id));
  const audited = new Set(rows.map(row => row.id));
  const historicalHeld = rows.filter(row => !active.has(row.id));
  assert.deepEqual(new Set(historicalHeld.map(row => row.id)), EXPECTED_COMPLETION_TONE_USER_HOLD_IDS);
  assert.ok(historicalHeld.every(row => row.status === 'optional-polish' && !english.has(row.id)));
  const earlier = TEACHING_PAIR_DEFERRALS.filter(row => ['teshimau', 'chau'].includes(row.form)
    && !EXPECTED_COMPLETION_TONE_USER_HOLD_IDS.has(row.id));
  assert.equal(earlier.length, 14);
  assert.ok(earlier.every(row => !audited.has(row.id)));
  assert.ok(resolutions.every(row => active.has(row.id) && english.has(row.id)));
});

test('historical hold sources must retain their complete documented scope and bound original objects', () => {
  const oldHold = JSON.parse(fs.readFileSync(new URL('../docs/usage-card-shimau-user-holds-20261026.json', import.meta.url)))
    .sourceRows.find(row => ['teshimau', 'chau'].includes(row.form));
  assert.ok(oldHold);
  for (const mutate of [
    evidence => { evidence.sourceRows.pop(); },
    evidence => { evidence.sourceRows.push(evidence.sourceRows[0]); },
    evidence => { evidence.sourceRows[0] = oldHold; },
    evidence => { delete evidence.sourceRows[0].previousUsage; },
    evidence => { evidence.sourceRows[0].english.translation += 'Changed'; },
    evidence => { evidence.sourceRows[0].card.scene += 'Changed'; },
  ]) {
    const teachingHoldProof = readCompletionToneTeachingHolds(); mutate(teachingHoldProof);
    assert.throws(() => verifyCompletionToneAudit(undefined, {teachingHoldProof}),
      /historical teaching-hold scope|historical teaching-hold source/);
  }
});

test('edited review bytes, missing scope, duplicate IDs and inflated summaries are rejected', () => {
  const proof = readCompletionToneAudit(), edited = structuredClone(proof), batch = edited.batches[0];
  const report = JSON.parse(Buffer.from(batch.reviewDelivery.artifacts[batch.reportPath], 'base64'));
  report.rows[0].reason = 'Unverified replacement';
  batch.reviewDelivery.artifacts[batch.reportPath] = Buffer.from(JSON.stringify(report)).toString('base64');
  assert.throws(() => verifyCompletionToneAudit(edited), /artifact drift/);
  assert.throws(() => verifyCompletionToneAudit({...proof, batches: proof.batches.slice(1)}), /missing cards/);
  assert.throws(() => verifyCompletionToneAudit({...proof, batches: [...proof.batches, proof.batches[0]]}), /Duplicate completion-tone batch/);
  assert.throws(() => verifyCompletionToneAudit({...proof, scopeIds: proof.scopeIds.slice(1)}), /summary or review history differs/);
  assert.throws(() => verifyCompletionToneAudit({...proof, summary: {...proof.summary, consistent: 256, revise: 0}}), /summary or review history differs/);
  const lostInitial = structuredClone(proof);
  delete lostInitial.batches[0].initialReviewDelivery;
  assert.throws(() => verifyCompletionToneAudit(lostInitial), /missing immutable initial review/);
  const overwritten = structuredClone(proof);
  overwritten.batches[0].initialReviewDelivery = overwritten.batches[0].reviewDelivery;
  assert.throws(() => verifyCompletionToneAudit(overwritten), /missing immutable initial review/);
});

test('a newly sealed fake packet cannot manufacture a verified historical source/English pair', t => {
  const proof = readCompletionToneAudit(), batch = proof.batches[0];
  const files = verifyPortableRevisionDelivery(batch.sourceDelivery, 'author', batch.id);
  const packet = JSON.parse(files.get(batch.sourcePath));
  packet.rows[0].english.translation = 'A replacement that was never in a verified revision input.';
  packet.rows[0].englishHash = hash(packet.rows[0].english);
  const bytes = Buffer.from(JSON.stringify(packet));
  files.set(batch.sourcePath, bytes);
  batch.sourceDelivery = reseal(t, batch.id, 'author', 2, files);
  batch.inputSha256 = sha(bytes);
  assert.throws(() => verifyCompletionToneAudit(proof), /joint historical input drift/);
});

test('a newly sealed packet cannot duplicate an ID or add the excluded card', t => {
  for (const mutate of [
    packet => { packet.rows[1] = structuredClone(packet.rows[0]); },
    packet => { packet.rows[0].id = COMPLETION_TONE_EXCLUDED_ID; },
  ]) {
    const proof = readCompletionToneAudit(), batch = proof.batches[0];
    const files = verifyPortableRevisionDelivery(batch.sourceDelivery, 'author', batch.id);
    const packet = JSON.parse(files.get(batch.sourcePath)); mutate(packet);
    const bytes = Buffer.from(JSON.stringify(packet)); files.set(batch.sourcePath, bytes);
    batch.sourceDelivery = reseal(t, batch.id, 'author', 2, files); batch.inputSha256 = sha(bytes);
    assert.throws(() => verifyCompletionToneAudit(proof), /joint historical input drift/);
  }
});

test('re-sealed final votes cannot change the reviewer, model, input binding or evidence revision', t => {
  for (const mutate of [
    report => { report.reviewer = '/root/a_different_reviewer'; },
    report => { report.model = 'gpt-6-luna'; },
    report => { report.reasoningEffort = 'low'; },
    report => { report.sourceReceipt = '0'.repeat(64); },
    report => { report.inputSha256 = '0'.repeat(64); },
  ]) {
    const proof = readCompletionToneAudit(), batch = proof.batches[0];
    const files = verifyPortableRevisionDelivery(batch.reviewDelivery, 'review', batch.id);
    const report = JSON.parse(files.get(batch.reportPath)); mutate(report);
    files.set(batch.reportPath, Buffer.from(JSON.stringify(report)));
    batch.reviewDelivery = reseal(t, batch.id, 'review', 2, files);
    assert.throws(() => verifyCompletionToneAudit(proof), /incomplete independent tone review/);
  }
  const proof = readCompletionToneAudit(), batch = proof.batches[0];
  const files = verifyPortableRevisionDelivery(batch.reviewDelivery, 'review', batch.id);
  batch.reviewDelivery = reseal(t, batch.id, 'review', 1, files);
  assert.throws(() => verifyCompletionToneAudit(proof), /overwrote or misrepresented its initial evidence/);
});

test('closure cannot be omitted, narrowed, substituted, or taken from an invalid revision chain', () => {
  const record = readCompletionToneAudit(), proof = readReviewedUsageRevisionsProof();
  const missingSnapshot = structuredClone(record); delete missingSnapshot.resolution;
  assert.throws(() => verifyCompletionToneAudit(missingSnapshot), /closure has incomplete exact scope/);
  const narrowed = structuredClone(record); narrowed.resolution.scopeIds.pop();
  assert.throws(() => verifyCompletionToneAudit(narrowed), /closure has incomplete exact scope/);
  const substituted = structuredClone(record); substituted.resolution = proof.rounds.at(-2);
  assert.throws(() => verifyCompletionToneAudit(substituted), /closure has incomplete exact scope/);
  const missingRound = structuredClone(proof);
  missingRound.rounds = missingRound.rounds.filter(round => round.id !== COMPLETION_TONE_FIX_ROUND);
  assert.throws(() => verifyCompletionToneAudit(record, {revisionProof: missingRound}), /Runtime revision data differs/);
  for (const mutate of [
    round => { round.batches[0].author = round.batches[0].reviewer; },
    round => { round.batches[0].authorModel = 'gpt-6-sol'; },
    round => { round.sourceCards[0].scene += 'Changed'; },
    round => { round.scopeIds.pop(); },
  ]) {
    const invalid = structuredClone(proof); mutate(invalid.rounds.find(round => round.id === COMPLETION_TONE_FIX_ROUND));
    assert.throws(() => verifyCompletionToneAudit(record, {revisionProof: invalid}),
      /invalid independent reviewer or author|incomplete or stale frozen form scope/);
  }
});

test('freshly sealed non-approval and no-op English cannot count as completed repairs', t => {
  const record = readCompletionToneAudit(), rejected = readReviewedUsageRevisionsProof();
  const rejectedBatch = rejected.rounds.find(round => round.id === COMPLETION_TONE_FIX_ROUND).batches[0];
  const rejectedFiles = verifyPortableRevisionDelivery(rejectedBatch.reviewDelivery, 'review', rejectedBatch.id);
  const rejectedReport = JSON.parse(rejectedFiles.get(rejectedBatch.paths.report));
  rejectedReport.rows[0].status = 'uncertain';
  rejectedFiles.set(rejectedBatch.paths.report, Buffer.from(JSON.stringify(rejectedReport)));
  rejectedBatch.reviewDelivery = reseal(t, rejectedBatch.id, 'review', 2, rejectedFiles);
  assert.throws(() => verifyCompletionToneAudit(record, {revisionProof: rejected}), /unresolved, incomplete or stale bilingual approval/);

  const noop = readReviewedUsageRevisionsProof(), noopRound = noop.rounds.find(round => round.id === COMPLETION_TONE_FIX_ROUND);
  const batch = noopRound.batches[0], authorFiles = verifyPortableRevisionDelivery(batch.authorDelivery, 'author', batch.id);
  const input = JSON.parse(authorFiles.get(batch.paths.input)), notes = JSON.parse(authorFiles.get(batch.paths.notes));
  const {id, sourceHash, ...prose} = input.rows[0].english;
  assert.equal(id, COMPLETION_TONE_FIX_IDS[0]); assert.ok(sourceHash);
  notes[0].english = prose;
  authorFiles.set(batch.paths.notes, Buffer.from(JSON.stringify(notes)));
  batch.authorDelivery = reseal(t, batch.id, 'author', 2, authorFiles);
  const reviewFiles = verifyPortableRevisionDelivery(batch.reviewDelivery, 'review', batch.id);
  const report = JSON.parse(reviewFiles.get(batch.paths.report));
  report.sourceReceipt = batch.authorDelivery.receipt; report.rows[0].englishHash = hash(input.rows[0].english);
  reviewFiles.set(batch.paths.report, Buffer.from(JSON.stringify(report)));
  batch.reviewDelivery = reseal(t, batch.id, 'review', 2, reviewFiles);
  const matching = structuredClone(record); matching.resolution = noopRound;
  assert.throws(() => verifyCompletionToneAudit(matching, {revisionProof: noop}), /Runtime revision data differs|lacks an approved English translation change/);
});
