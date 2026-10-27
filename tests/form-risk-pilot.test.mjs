import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test, { before } from 'node:test';
import { USAGE_CARDS, REVIEWED_USAGE_CARDS, usageCardItem } from '../app/lib/usage-cards.mjs';
import { EN_USAGE_CARD_OVERLAYS as BASELINE_ENGLISH } from '../app/lib/i18n/content/en/usage-cards.mjs';
import { EN_REVIEWED_USAGE_CARD_OVERLAYS } from '../app/lib/i18n/content/en/reviewed-usage-card-revisions.mjs';
import { EN_USAGE_CARD_OVERLAYS as CURRENT_ENGLISH } from '../app/lib/i18n/content/en/current-usage-cards.mjs';
import { USER_DIRECTED_FORM_DEFERRALS } from '../app/lib/teaching-form-deferrals.mjs';
import { TEACHING_PAIR_DEFERRALS } from '../app/lib/teaching-pair-deferrals.mjs';
import {
  PILOT_PROOF, PILOT_REPORT, PILOT_LIST, loadFormRiskPilotProof,
  verifyFormRiskPilot, verifyPortablePilotDelivery,
  renderFormRiskPilotReport, renderFormRiskPilotList,
} from '../scripts/verify-form-risk-pilot.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const assessmentFields = ['morphology', 'goalAndAmbiguity', 'collocation', 'rolesAndMeaning',
  'timeAndNegation', 'registerAndPragmatics', 'chinese', 'english', 'reading'];
const reconsideredId = 'usage:teshimauNegativePast:verb:困る:こまる';
let frozenProof, verified;

before(async () => {
  // Use the actual archived evidence. Missing reports or a missing archive must
  // fail this suite rather than silently turn real verification into a skip.
  frozenProof = loadFormRiskPilotProof();
  verified = await verifyFormRiskPilot();
});

const verifyMutation = proof => verifyFormRiskPilot({ proof, verifyPolicy: false, verifyRendered: false });
const jsonArtifact = (delivery, sourcePath) => JSON.parse(Buffer.from(delivery.artifacts[sourcePath], 'base64'));

// Recompute the storage receipt to distinguish semantic checks from byte checks.
// These are altered test copies and never become a new language review.
function replaceArtifact(delivery, sourcePath, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  delivery.artifacts[sourcePath] = bytes.toString('base64');
  delivery.sourceHashes[sourcePath] = sha(bytes);
  delivery.hashes[delivery.files[sourcePath]] = sha(bytes);
  const manifest = { version: delivery.version, batch: delivery.batch, phase: delivery.phase,
    revision: delivery.revision, root: delivery.root, files: delivery.files,
    hashes: delivery.hashes, sourceHashes: delivery.sourceHashes };
  delivery.receipt = sha(`${JSON.stringify(manifest, null, 2)}\n`);
  return bytes;
}

function changeReport(proof, change) {
  const batch = proof.batches[0], report = jsonArtifact(batch.reviewDelivery, batch.reportPath);
  change(report, batch);
  replaceArtifact(batch.reviewDelivery, batch.reportPath, report);
}

function changePacket(proof, change) {
  const batch = proof.batches[0], packet = jsonArtifact(batch.sourceDelivery, batch.sourcePath);
  change(packet, batch);
  const bytes = replaceArtifact(batch.sourceDelivery, batch.sourcePath, packet);
  batch.inputSha256 = sha(bytes);
  const report = jsonArtifact(batch.reviewDelivery, batch.reportPath);
  report.sourceReceipt = batch.sourceDelivery.receipt;
  report.inputSha256 = batch.inputSha256;
  replaceArtifact(batch.reviewDelivery, batch.reportPath, report);
}

function refreshSummary(proof) {
  const statuses = new Map(proof.batches.flatMap(batch => {
    const report = jsonArtifact(batch.reviewDelivery, batch.reportPath);
    return report.rows.map(row => [row.id, row.status]);
  }));
  for (const status of ['approved', 'revise', 'uncertain']) {
    proof.summary.counts[status] = [...statuses.values()].filter(value => value === status).length;
    for (const form of proof.summary.byForm) {
      form[status] = verified.samples.filter(row => row.card.form === form.form && statuses.get(row.id) === status).length;
    }
  }
}

test('the real archive binds 156 ordered cards to 39 four-card target assessments', () => {
  assert.equal(verified.effect, 'report-only');
  assert.equal(verified.counts.targets, 39);
  assert.equal(verified.counts.riskCards, 4542);
  assert.equal(verified.counts.samples, 156);
  assert.equal(verified.counts.approved + verified.counts.revise + verified.counts.uncertain, 156);
  assert.equal(verified.byForm.length, 39);
  assert.equal(verified.samples.length, 156);
  assert.equal(new Set(verified.samples.map(row => row.id)).size, 156);
  assert.deepEqual(verified.samples.map(row => row.id), frozenProof.sampling.sampleIds);
  for (const form of verified.byForm) {
    const rows = verified.samples.filter(row => row.card.form === form.form);
    assert.equal(form.samples, 4, form.form);
    assert.equal(rows.length, 4, form.form);
    for (const status of ['approved', 'revise', 'uncertain']) {
      assert.equal(form[status], rows.filter(row => row.assessment.status === status).length, `${form.form}: ${status}`);
    }
    for (const row of rows) {
      assert.ok(row.assessment.reason.trim().length >= 20, row.id);
      for (const field of assessmentFields) assert.ok(row.assessment.assessments[field].trim(), `${row.id}: ${field}`);
    }
  }
  for (const ordinal of [87, 88]) {
    assert.deepEqual(verified.samples.filter(row => row.ordinal === ordinal)
      .map(row => usageCardItem(row.card.senseId).surface), ['書く', '置く', '読む', '食べる']);
  }
});

test('source and report artifacts reject byte drift before parsing assessments', async () => {
  for (const [deliveryKey, pathKey] of [['sourceDelivery', 'sourcePath'], ['reviewDelivery', 'reportPath']]) {
    const proof = clone(frozenProof), batch = proof.batches[0], delivery = batch[deliveryKey];
    const bytes = Buffer.from(delivery.artifacts[batch[pathKey]], 'base64');
    delivery.artifacts[batch[pathKey]] = Buffer.concat([bytes, Buffer.from(' ')]).toString('base64');
    assert.throws(() => verifyPortablePilotDelivery(delivery, delivery.phase, batch.id));
    await assert.rejects(() => verifyMutation(proof));
  }
});

test('sample IDs cannot be removed, repeated, reordered, or replaced', async () => {
  const changes = [
    ids => ids.pop(),
    ids => { ids[1] = ids[0]; },
    ids => { [ids[0], ids[1]] = [ids[1], ids[0]]; },
    ids => { ids[0] = 'usage:unreviewed:missing'; },
  ];
  for (const change of changes) {
    const proof = clone(frozenProof);
    change(proof.sampling.sampleIds);
    await assert.rejects(() => verifyMutation(proof));
  }
});

test('sampling inventory and full-row hashes cannot be asserted without recomputation', async () => {
  for (const field of ['inventoryHash', 'sampleHash']) {
    const proof = clone(frozenProof);
    proof.sampling[field] = '0'.repeat(64);
    await assert.rejects(() => verifyMutation(proof));
  }
});

test('packet coverage cannot replace one target sample with a fifth sample from another target', async () => {
  const proof = clone(frozenProof);
  changePacket(proof, packet => {
    const otherTarget = packet.rows.find(row => row.card.form !== packet.rows[0].card.form);
    assert.ok(otherTarget);
    packet.rows[0] = clone(otherTarget);
  });
  await assert.rejects(() => verifyMutation(proof));
});

test('a resealed source cannot alter canonical card, English, target, reading, or sentence', async () => {
  const changes = [
    row => { row.card.translation += '（机械测试）'; },
    row => { row.english.translation += ' Altered test text.'; },
    row => { row.target.text += 'ない'; },
    row => { row.fullReading += 'あ'; },
    row => { row.fullSentence += '。'; },
  ];
  for (const change of changes) {
    const proof = clone(frozenProof);
    changePacket(proof, packet => change(packet.rows[0]));
    await assert.rejects(() => verifyMutation(proof));
  }
});

test('a packet or assessment cannot omit, repeat, or reorder a card', async () => {
  for (const change of [
    rows => rows.pop(),
    rows => { rows[1] = clone(rows[0]); },
    rows => { [rows[0], rows[1]] = [rows[1], rows[0]]; },
  ]) {
    const proof = clone(frozenProof);
    changeReport(proof, report => change(report.rows));
    await assert.rejects(() => verifyMutation(proof));
  }
  const proof = clone(frozenProof);
  changePacket(proof, packet => packet.rows.pop());
  await assert.rejects(() => verifyMutation(proof));
});

test('a missing review, pending status, or incomplete assessment cannot count as reviewed', async () => {
  const missing = clone(frozenProof);
  delete missing.batches[0].reviewDelivery;
  await assert.rejects(() => verifyMutation(missing));
  const pending = clone(frozenProof);
  changeReport(pending, report => { report.rows[0].status = 'pending'; });
  await assert.rejects(() => verifyMutation(pending));
  for (const field of assessmentFields) {
    const proof = clone(frozenProof);
    changeReport(proof, report => { report.rows[0].assessments[field] = ' '; });
    await assert.rejects(() => verifyMutation(proof));
  }
  const reason = clone(frozenProof);
  changeReport(reason, report => { report.rows[0].reason = '已核对'; });
  await assert.rejects(() => verifyMutation(reason));
});

test('review author, required model and effort, receipt, and source bindings are enforced', async () => {
  const changes = [
    report => { report.reviewer = '/root/unassigned_reviewer'; },
    report => { report.model = 'gpt-6-luna'; },
    report => { report.reasoningEffort = 'low'; },
    report => { report.sourceReceipt = '0'.repeat(64); },
    report => { report.inputSha256 = '0'.repeat(64); },
    report => { report.rows[0].sourceHash = '0'.repeat(64); },
    report => { report.rows[0].englishHash = '0'.repeat(64); },
    report => { report.rows[0].fullSentence += '改'; },
  ];
  for (const change of changes) {
    const proof = clone(frozenProof);
    changeReport(proof, change);
    await assert.rejects(() => verifyMutation(proof));
  }
});

test('counts and per-form summaries must be derived from actual assessment rows', async () => {
  for (const change of [
    proof => { proof.summary.counts.approved += 1; },
    proof => { proof.summary.counts.samples -= 1; },
    proof => { proof.summary.byForm[0].samples = 3; },
    proof => { proof.summary.byForm[0].revise += 1; },
  ]) {
    const proof = clone(frozenProof);
    change(proof);
    await assert.rejects(() => verifyMutation(proof));
  }
});

test('only the assigned 06 card changes its actual review while the complete first vote remains archived', () => {
  assert.equal(frozenProof.initialArchiveSha256, '5df45af65bf18618cf3787092c41dccb5dc0999aac999775671e03280c2dbe6f');
  assert.deepEqual(verified.initialSummary, frozenProof.initialSummary);
  assert.deepEqual(verified.reviewChanges, frozenProof.reviewChanges);
  assert.deepEqual(['approved', 'revise', 'uncertain'].map(status => verified.initialSummary.counts[status]), [137, 8, 11]);
  assert.deepEqual(['approved', 'revise', 'uncertain'].map(status => verified.counts[status]), [138, 7, 11]);
  assert.equal(verified.reviewChanges.length, 1);
  const change = verified.reviewChanges[0];
  assert.equal(change.batch, 'riskpilot/06');
  assert.equal(change.id, reconsideredId);
  assert.equal(change.reviewer, '/root/form_risk_pilot_review_2');
  assert.equal(change.fromStatus, 'revise');
  assert.equal(change.toStatus, 'approved');
  for (const [index, batch] of frozenProof.batches.entries()) {
    if (index !== 6) {
      assert.equal(batch.reviewDelivery.revision, 1, batch.id);
      assert.equal(batch.initialReviewDelivery, undefined, batch.id);
      continue;
    }
    assert.equal(batch.initialReviewDelivery.revision, 1);
    assert.equal(batch.reviewDelivery.revision, 2);
    assert.notEqual(batch.initialReviewDelivery.receipt, batch.reviewDelivery.receipt);
    const initial = jsonArtifact(batch.initialReviewDelivery, batch.reportPath);
    const current = jsonArtifact(batch.reviewDelivery, batch.reportPath);
    assert.deepEqual({ ...initial, rows: null }, { ...current, rows: null });
    assert.deepEqual(initial.rows.map(row => row.id), current.rows.map(row => row.id));
    const changedIds = initial.rows.filter((row, rowIndex) => JSON.stringify(row) !== JSON.stringify(current.rows[rowIndex]))
      .map(row => row.id);
    assert.deepEqual(changedIds, [reconsideredId]);
    const previous = initial.rows.find(row => row.id === reconsideredId);
    const final = current.rows.find(row => row.id === reconsideredId);
    assert.equal(previous.status, 'revise');
    assert.equal(final.status, 'approved');
    assert.equal(previous.reason, change.initialReason);
    assert.equal(final.reason, change.finalReason);
    for (const field of ['id', 'sourceHash', 'englishHash', 'fullSentence']) assert.equal(previous[field], final[field], field);
  }
});

test('the original 06 review bytes cannot be altered, removed, or replaced by a resealed vote', async () => {
  const changedBytes = clone(frozenProof), originalBatch = changedBytes.batches[6];
  const initialDelivery = originalBatch.initialReviewDelivery;
  const bytes = Buffer.from(initialDelivery.artifacts[originalBatch.reportPath], 'base64');
  initialDelivery.artifacts[originalBatch.reportPath] = Buffer.concat([bytes, Buffer.from(' ')]).toString('base64');
  await assert.rejects(() => verifyMutation(changedBytes), /artifact drift/u);

  const missing = clone(frozenProof);
  delete missing.batches[6].initialReviewDelivery;
  await assert.rejects(() => verifyMutation(missing), /preserve revision 1/u);

  const resealed = clone(frozenProof), batch = resealed.batches[6];
  const report = jsonArtifact(batch.initialReviewDelivery, batch.reportPath);
  report.rows.find(row => row.id === reconsideredId).reason += '（篡改原票的机械测试）';
  replaceArtifact(batch.initialReviewDelivery, batch.reportPath, report);
  await assert.rejects(() => verifyMutation(resealed), /initial source\/review receipts were replaced/u);
});

test('initial archive identity and initial statistics cannot be rewritten as the final result', async () => {
  for (const change of [
    proof => { proof.initialArchiveSha256 = '0'.repeat(64); },
    proof => { proof.initialSummary = clone(proof.summary); },
    proof => { proof.initialSummary.counts.revise -= 1; },
    proof => { proof.initialSummary.byForm[0].approved += 1; },
  ]) {
    const proof = clone(frozenProof);
    change(proof);
    await assert.rejects(() => verifyMutation(proof), /initial archive|initial summary/u);
  }
});

test('the review-change entry must reproduce the actual assigned card and both original reasons', async () => {
  for (const change of [
    row => { row.id = verified.samples[0].id; },
    row => { row.initialReason += '伪造初票理由'; },
    row => { row.finalReason += '伪造复核理由'; },
    row => { row.fromStatus = 'uncertain'; },
    row => { row.reviewer = '/root/form_risk_pilot_review_0'; },
  ]) {
    const proof = clone(frozenProof);
    change(proof.reviewChanges[0]);
    await assert.rejects(() => verifyMutation(proof), /unauthorized card|review history/u);
  }
});

test('none of the other nine first reports can be replaced even with a new receipt and matching summary', async () => {
  for (const [index, original] of frozenProof.batches.entries()) {
    if (index === 6) continue;
    const proof = clone(frozenProof), batch = proof.batches[index];
    const report = jsonArtifact(batch.reviewDelivery, batch.reportPath);
    report.rows[0].status = report.rows[0].status === 'approved' ? 'uncertain' : 'approved';
    report.rows[0].reason += '（重签其他原票的机械测试，不是真实审核）';
    replaceArtifact(batch.reviewDelivery, batch.reportPath, report);
    refreshSummary(proof);
    assert.notEqual(batch.reviewDelivery.receipt, original.reviewDelivery.receipt);
    await assert.rejects(() => verifyMutation(proof), /initial source\/review receipts were replaced/u);
  }
});

test('the new 06 delivery cannot change a second card after the assigned reconsideration', async () => {
  const proof = clone(frozenProof), batch = proof.batches[6];
  const report = jsonArtifact(batch.reviewDelivery, batch.reportPath);
  const unassigned = report.rows.find(row => row.id !== reconsideredId);
  assert.ok(unassigned);
  unassigned.reason += '（额外改动另一张原票的机械测试）';
  replaceArtifact(batch.reviewDelivery, batch.reportPath, report);
  refreshSummary(proof);
  await assert.rejects(() => verifyMutation(proof), /unauthorized card|review history/u);
});

test('saved reports reproduce the verified evidence and the independent list has two columns only', () => {
  assert.equal(fs.readFileSync(PILOT_REPORT, 'utf8'), renderFormRiskPilotReport(verified));
  const list = renderFormRiskPilotList(verified);
  assert.equal(fs.readFileSync(PILOT_LIST, 'utf8'), list);
  const tableRows = list.split('\n').filter(line => line.startsWith('|'));
  const dataRows = tableRows.filter(line => !/^\|\s*[-:]/u.test(line)
    && !/变形.*日语原句/u.test(line));
  assert.equal(dataRows.length, 156);
  for (const row of tableRows) assert.equal(row.split('|').length, 4, row);
  assert.doesNotMatch(list, /usage:|sourceHash|englishHash|理由|具体依据/u);
  for (const sample of verified.samples) assert.ok(list.includes(sample.fullSentence.replaceAll('|', '\\|')), sample.id);
});

test('verification and rendering leave current cards, review fields, English, holds and archived bytes unchanged', async () => {
  const state = () => JSON.stringify({ cards: USAGE_CARDS, reviewed: REVIEWED_USAGE_CARDS,
    baselineEnglish: BASELINE_ENGLISH, revisedEnglish: EN_REVIEWED_USAGE_CARD_OVERLAYS,
    currentEnglish: CURRENT_ENGLISH, formHolds: USER_DIRECTED_FORM_DEFERRALS, pairHolds: TEACHING_PAIR_DEFERRALS });
  const beforeState = state(), beforeProof = JSON.stringify(frozenProof);
  const filePaths = [PILOT_PROOF, PILOT_REPORT, PILOT_LIST,
    new URL('../docs/form-hold-baseline-20261027.json.gz', import.meta.url)];
  const beforeFiles = filePaths.map(file => sha(fs.readFileSync(file)));
  const result = await verifyFormRiskPilot({ proof: frozenProof, verifyPolicy: false });
  renderFormRiskPilotReport(result);
  renderFormRiskPilotList(result);
  assert.equal(state(), beforeState);
  assert.equal(JSON.stringify(frozenProof), beforeProof);
  assert.deepEqual(filePaths.map(file => sha(fs.readFileSync(file))), beforeFiles);
  assert.equal(USAGE_CARDS.length, 16790);
  assert.equal(new Set(USAGE_CARDS.map(card => card.form)).size, 165);
  for (const form of ['tearuNegative', 'tearuNegativePast', 'temiruDesireNegative', 'temiruDesireNegativePast']) {
    assert.ok(USER_DIRECTED_FORM_DEFERRALS.some(row => row.form === form));
    assert.ok(USAGE_CARDS.every(card => card.form !== form));
  }
});
