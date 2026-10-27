import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test, {before} from 'node:test';
import {USAGE_CARDS, REVIEWED_USAGE_CARDS} from '../app/lib/usage-cards.mjs';
import {EN_USAGE_CARD_OVERLAYS as CURRENT_ENGLISH} from '../app/lib/i18n/content/en/current-usage-cards.mjs';
import {USER_DIRECTED_FORM_DEFERRALS} from '../app/lib/teaching-form-deferrals.mjs';
import {TEACHING_PAIR_DEFERRALS} from '../app/lib/teaching-pair-deferrals.mjs';
import {readReviewedUsageRevisionsProof} from '../scripts/verify-reviewed-usage-revisions.mjs';
import {
  FEEDBACK_REQUEST, FEEDBACK_HOLDS, FEEDBACK_REPORT, FEEDBACK_LIST,
  loadRiskPilotFeedbackRequest, loadRiskPilotFeedbackHolds, verifyRiskPilotFeedback,
  renderRiskPilotFeedbackReport, renderRiskPilotFeedbackList,
} from '../scripts/verify-risk-pilot-feedback.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const objectHash = value => sha(JSON.stringify(value));
const jsonArtifact = (delivery, file) => JSON.parse(Buffer.from(delivery.artifacts[file], 'base64'));
const prefix = 'pilot-feedback-fix-20261027-';
const forms = ['zu', 'teoru', 'toru', 'teoruPast', 'teageruNegative', 'teikuNegative',
  'tearuNegative', 'tearuNegativePast', 'teshimauNegativePast'];
const heldForms = ['tearuNegative', 'tearuNegativePast', 'temiruDesireNegative', 'temiruDesireNegativePast'];
let frozenRequest, frozenHolds, frozenRevisions, verified;

// Resealing test copies is solely a corruption test. It does not create a real
// delivery, new language review, or permission to edit the archived evidence.
function replaceArtifact(delivery, sourcePath, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  delivery.artifacts[sourcePath] = bytes.toString('base64');
  delivery.sourceHashes[sourcePath] = sha(bytes);
  delivery.hashes[delivery.files[sourcePath]] = sha(bytes);
  const manifest = {version: delivery.version, batch: delivery.batch, phase: delivery.phase,
    revision: delivery.revision, root: delivery.root, files: delivery.files,
    hashes: delivery.hashes, sourceHashes: delivery.sourceHashes};
  delivery.receipt = sha(`${JSON.stringify(manifest, null, 2)}\n`);
}

const verifyMutation = options => verifyRiskPilotFeedback({...options, verifyRendered: false});
const successor = proof => proof.rounds.find(round => round.id.startsWith(prefix));
const successors = proof => proof.rounds.filter(round => round.id.startsWith(prefix));

before(async () => {
  // Missing successor reports must fail, rather than turn the real evidence
  // check into a skipped test or synthesize approval from a count.
  frozenRequest = loadRiskPilotFeedbackRequest();
  frozenHolds = loadRiskPilotFeedbackHolds();
  frozenRevisions = readReviewedUsageRevisionsProof();
  verified = await verifyRiskPilotFeedback();
});

test('18 frozen user dispositions partition into seven holds, eight revisions, and three retained cards', () => {
  assert.deepEqual(verified.summary, {sourceCount: 18, userHeld: 7, revised: 8, retained: 3,
    newActiveExits: 3, alreadyFormHeld: 4, currentCards: 16790, currentForms: 165});
  assert.equal(verified.rows.length, 18);
  assert.equal(new Set(verified.rows.map(row => row.source.id)).size, 18);
  assert.deepEqual(verified.rows.map(row => row.source.id), frozenRequest.rows.map(row => row.id));
  for (const action of ['hold', 'revise', 'retain']) {
    assert.equal(verified.rows.filter(row => row.action === action).length, frozenRequest.counts[action]);
  }
  assert.equal(verified.requestReceipt, frozenRequest.sourceDelivery.receipt);
  assert.equal(verified.requestSha256, sha(fs.readFileSync(FEEDBACK_REQUEST)));
  assert.equal(verified.pilotProofSha256, frozenRequest.pilotProofSha256);
});

test('removing, duplicating, reordering, or replacing a frozen user decision is rejected', async () => {
  for (const change of [
    rows => rows.pop(),
    rows => { rows[1] = clone(rows[0]); },
    rows => { [rows[0], rows[1]] = [rows[1], rows[0]]; },
    rows => { rows[0].id = 'usage:unrequested:missing'; },
    rows => { rows[0].action = 'hold'; },
    rows => { rows[0].proposedSentence += '。'; },
    rows => { rows[0].sourceHash = '0'.repeat(64); },
    rows => { rows[0].englishHash = '0'.repeat(64); },
  ]) {
    const request = clone(frozenRequest);
    change(request.rows);
    await assert.rejects(() => verifyMutation({request}));
  }
});

test('original user feedback, source delivery bytes, and source receipt cannot be replaced', async () => {
  const byteDrift = clone(frozenRequest), file = byteDrift.paths.sources;
  byteDrift.sourceDelivery.artifacts[file] = Buffer.concat([
    Buffer.from(byteDrift.sourceDelivery.artifacts[file], 'base64'), Buffer.from(' '),
  ]).toString('base64');
  await assert.rejects(() => verifyMutation({request: byteDrift}));

  for (const name of ['feedback', 'instruction']) {
    const request = clone(frozenRequest), file = request.paths[name];
    const bytes = Buffer.from(request.sourceDelivery.artifacts[file], 'base64');
    request.sourceDelivery.artifacts[file] = Buffer.concat([bytes, Buffer.from('篡改用户原话')]).toString('base64');
    await assert.rejects(() => verifyMutation({request}));
  }
  const receipt = clone(frozenRequest);
  receipt.sourceDelivery.receipt = '0'.repeat(64);
  await assert.rejects(() => verifyMutation({request: receipt}));
});

test('a resealed request cannot change canonical, English, target, sentence, reading, or prior usage', async () => {
  for (const change of [
    row => { row.card.translation += '（测试篡改）'; },
    row => { row.english.scene += ' Altered test scene.'; },
    row => { row.target.text += 'ない'; },
    row => { row.fullSentence += '。'; },
    row => { row.fullReading += 'あ'; },
    row => { row.previousUsage.reason += '（伪造历史依据）'; },
    row => { row.usageAtRequest.status = 'blocked'; },
  ]) {
    const request = clone(frozenRequest), file = request.paths.sources;
    const sources = jsonArtifact(request.sourceDelivery, file);
    change(sources[0]);
    replaceArtifact(request.sourceDelivery, file, sources);
    await assert.rejects(() => verifyMutation({request}));
  }
});

test('seven held sources retain their exact objects and keep real pre-form-hold provenance', () => {
  const sources = new Map(jsonArtifact(frozenRequest.sourceDelivery, frozenRequest.paths.sources)
    .map(row => [row.id, row]));
  const currentCards = new Map(REVIEWED_USAGE_CARDS.map(card => [card.id, card]));
  const activeIds = new Set(USAGE_CARDS.map(card => card.id));
  const englishIds = new Set(CURRENT_ENGLISH.map(row => row.id));
  const runtime = new Map(TEACHING_PAIR_DEFERRALS.map(row => [row.id, row]));
  assert.equal(frozenHolds.sourceRows.length, 7);
  for (const row of frozenHolds.sourceRows) {
    const source = sources.get(row.id), hold = runtime.get(row.id);
    assert.ok(source && hold, row.id);
    assert.deepEqual(row.card, source.card, row.id);
    assert.deepEqual(row.english, source.english, row.id);
    assert.deepEqual(row.previousUsage, source.previousUsage, row.id);
    assert.deepEqual(row.usageAtRequest, source.usageAtRequest, row.id);
    assert.equal(row.previousUsageProvenance.proofSha256, frozenRequest.pilotProofSha256);
    assert.equal(row.previousUsageProvenance.sourceReceipt, source.sourceReceipt);
    assert.equal(row.basis, 'user-directed-teaching-hold');
    assert.equal(row.attempts, undefined);
    assert.equal(objectHash(currentCards.get(row.id)), row.sourceHash);
    assert.ok(!activeIds.has(row.id), row.id);
    assert.ok(!englishIds.has(row.id), row.id);
  }
  assert.equal(frozenHolds.sourceRows.filter(row => row.usageAtRequest.reasonCode === 'user-directed-form-hold').length, 4);
});

test('hold scope, source objects, provenance, and request-time eligibility cannot be invented', async () => {
  for (const change of [
    rows => rows.pop(),
    rows => { rows[1] = clone(rows[0]); },
    rows => { rows[0].senseId = 'verb:書く:かく'; },
    rows => { rows[0].form = 'tearu'; },
    rows => { rows[0].card.scene += '（测试篡改）'; },
    rows => { rows[0].english.translation += ' Changed test text.'; },
    rows => { rows[0].sourceHash = '0'.repeat(64); },
    rows => { rows[0].englishHash = '0'.repeat(64); },
    rows => { rows[0].previousUsage = clone(rows[0].usageAtRequest); },
    rows => { rows[0].usageAtRequest = clone(rows[0].previousUsage); },
    rows => { rows[0].previousUsageProvenance.sourceReceipt = '0'.repeat(64); },
    rows => { rows[0].previousUsageProvenance.proofSha256 = '0'.repeat(64); },
    rows => { rows[0].basis = 'three-failed-repair-attempts'; rows[0].attempts = [{}, {}, {}]; },
  ]) {
    const holds = clone(frozenHolds);
    change(holds.sourceRows);
    await assert.rejects(() => verifyMutation({holds}));
  }
});

test('nine actual successor rounds cover exactly the eleven retained or revised source IDs', () => {
  const rounds = successors(frozenRevisions);
  assert.equal(rounds.length, 9);
  assert.deepEqual(rounds.map(round => round.form).sort(), [...forms].sort());
  assert.equal(frozenRevisions.rounds.length, 26);
  const ids = rounds.flatMap(round => round.scopeIds);
  assert.equal(ids.length, 11);
  assert.equal(new Set(ids).size, 11);
  assert.deepEqual([...ids].sort(), frozenRequest.rows.filter(row => row.action !== 'hold').map(row => row.id).sort());
  assert.equal(verified.reviews.reduce((total, review) => total + review.count, 0), 11);
  for (const review of verified.reviews) {
    assert.notEqual(review.author, review.reviewer);
    assert.equal(review.authorModel, 'gpt-6-luna');
    assert.equal(review.authorEffort, 'max');
    assert.equal(review.reviewerModel, 'gpt-6-sol');
    assert.equal(review.reviewerEffort, 'medium');
    assert.match(review.authorReceipt, /^[a-f0-9]{64}$/u);
    assert.match(review.reviewReceipt, /^[a-f0-9]{64}$/u);
  }
});

test('three actual rejected bilingual submissions remain archived before their final approvals', () => {
  const byForm = new Map(successors(frozenRevisions).map(round => [round.form, round.batches[0]]));
  const sources = new Map(jsonArtifact(frozenRequest.sourceDelivery, frozenRequest.paths.sources)
    .map(row => [row.id, row]));
  assert.equal(byForm.get('teageruNegative').earlierSubmissions.length, 2);
  assert.equal(byForm.get('teageruNegative').authorDelivery.revision, 3);
  assert.equal(byForm.get('teageruNegative').reviewDelivery.revision, 3);
  assert.equal(byForm.get('teshimauNegativePast').earlierSubmissions.length, 1);
  assert.equal(byForm.get('teshimauNegativePast').authorDelivery.revision, 2);
  assert.equal(byForm.get('teshimauNegativePast').reviewDelivery.revision, 2);
  assert.equal(byForm.get('teikuNegative').earlierSubmissions?.length ?? 0, 0);
  assert.equal(verified.earlierReviews.length, 3);
  assert.deepEqual(verified.earlierReviews.map(row => [row.batchId, row.revision]).sort(),
    [['pilotfix/04', 1], ['pilotfix/04', 2], ['pilotfix/08', 1]]);
  for (const batch of byForm.values()) {
    for (const [index, earlier] of (batch.earlierSubmissions ?? []).entries()) {
      assert.equal(earlier.authorDelivery.revision, index + 1);
      assert.equal(earlier.reviewDelivery.revision, index + 1);
      const cards = jsonArtifact(earlier.authorDelivery, batch.paths.cards);
      const notes = jsonArtifact(earlier.authorDelivery, batch.paths.notes);
      const report = jsonArtifact(earlier.reviewDelivery, batch.paths.report);
      assert.equal(report.sourceReceipt, earlier.authorDelivery.receipt);
      for (const [rowIndex, card] of cards.entries()) {
        const source = sources.get(card.id), vote = report.rows[rowIndex], final = {...card, review: 'approved'};
        const english = {id: card.id, sourceHash: objectHash(final), ...notes[rowIndex].english};
        const sentence = [...card.before, source.target, ...card.after].map(part => part.text).join('');
        assert.equal(vote.status, 'revise');
        assert.equal(vote.hash, objectHash(card));
        assert.equal(vote.sourceHash, objectHash(final));
        assert.equal(vote.englishHash, objectHash(english));
        assert.equal(vote.sentence, source.proposedSentence);
        assert.equal(sentence, source.proposedSentence);
        assert.ok(Object.values(vote.english.checks).some(value => value === false));
      }
    }
  }
});

test('actual rejected submissions cannot be deleted or duplicated to rewrite repair history', async () => {
  for (const change of [
    batch => { delete batch.earlierSubmissions; },
    batch => { batch.earlierSubmissions.pop(); },
    batch => { batch.earlierSubmissions[1] = clone(batch.earlierSubmissions[0]); },
  ]) {
    const revisionProof = clone(frozenRevisions);
    const batch = successors(revisionProof).find(round => round.form === 'teageruNegative').batches[0];
    change(batch);
    await assert.rejects(() => verifyMutation({revisionProof}));
  }
});

test('a resealed rejected vote cannot become approved or lose its original English binding', async () => {
  for (const change of [
    vote => { vote.status = 'approved'; },
    vote => { vote.englishHash = '0'.repeat(64); },
  ]) {
    const revisionProof = clone(frozenRevisions);
    const batch = successors(revisionProof).find(round => round.form === 'teageruNegative').batches[0];
    const earlier = batch.earlierSubmissions[0];
    const report = jsonArtifact(earlier.reviewDelivery, batch.paths.report);
    change(report.rows[0]);
    replaceArtifact(earlier.reviewDelivery, batch.paths.report, report);
    await assert.rejects(() => verifyMutation({revisionProof}));
  }
});

test('a coherently resealed rejected draft cannot replace its original Japanese sentence', async () => {
  const revisionProof = clone(frozenRevisions);
  const batch = successors(revisionProof).find(round => round.form === 'teshimauNegativePast').batches[0];
  const earlier = batch.earlierSubmissions[0];
  const cards = jsonArtifact(earlier.authorDelivery, batch.paths.cards);
  const notes = jsonArtifact(earlier.authorDelivery, batch.paths.notes);
  const card = cards[0];
  card.before[0].text += '実は';
  const final = {...card, review: 'approved'};
  replaceArtifact(earlier.authorDelivery, batch.paths.cards, cards);
  const report = jsonArtifact(earlier.reviewDelivery, batch.paths.report), vote = report.rows[0];
  const source = jsonArtifact(frozenRequest.sourceDelivery, frozenRequest.paths.sources)
    .find(row => row.id === card.id);
  report.sourceReceipt = earlier.authorDelivery.receipt;
  vote.hash = objectHash(card);
  vote.sourceHash = objectHash(final);
  vote.englishHash = objectHash({id: card.id, sourceHash: objectHash(final), ...notes[0].english});
  vote.sentence = [...card.before, source.target, ...card.after].map(part => part.text).join('');
  replaceArtifact(earlier.reviewDelivery, batch.paths.report, report);
  await assert.rejects(() => verifyMutation({revisionProof}));
});

test('a missing, duplicate, extra, or expanded successor cannot close this request', async () => {
  for (const change of [
    proof => { proof.rounds.pop(); },
    proof => { proof.rounds.push(clone(successor(proof))); },
    proof => { successor(proof).id += '-extra'; },
    proof => { successor(proof).scopeIds.push(frozenRequest.rows.find(row => row.action === 'hold').id); },
    proof => { successor(proof).scopeIds[0] = 'usage:unrequested:missing'; },
    proof => { successor(proof).sourceCards[0].translation += '（源对象篡改）'; },
  ]) {
    const revisionProof = clone(frozenRevisions);
    change(revisionProof);
    await assert.rejects(() => verifyMutation({revisionProof}));
  }
});

test('successor approval needs the actual independent author, reviewer, model, effort, and receipt', async () => {
  for (const change of [
    batch => { batch.reviewer = batch.author; },
    batch => { batch.authorModel = 'gpt-6-sol'; },
    batch => { batch.authorEffort = 'low'; },
    batch => { batch.reviewerModel = 'gpt-6-luna'; },
    batch => { batch.reviewerEffort = 'high'; },
    batch => { delete batch.reviewDelivery; },
    batch => { batch.reviewDelivery.receipt = '0'.repeat(64); },
    batch => { batch.authorDelivery.receipt = '0'.repeat(64); },
  ]) {
    const revisionProof = clone(frozenRevisions);
    change(successor(revisionProof).batches[0]);
    await assert.rejects(() => verifyMutation({revisionProof}));
  }
});

test('a resealed successor report cannot count pending status or stale bilingual bindings as approval', async () => {
  for (const change of [
    report => { report.rows.pop(); },
    report => { report.reviewer = '/root/unassigned_feedback_reviewer'; },
    report => { report.selfReview = true; },
    report => { report.sourceReceipt = '0'.repeat(64); },
    report => { report.rows[0].status = 'uncertain'; },
    report => { report.rows[0].hash = '0'.repeat(64); },
    report => { report.rows[0].sourceHash = '0'.repeat(64); },
    report => { report.rows[0].englishHash = '0'.repeat(64); },
    report => { report.rows[0].sentence += '。'; },
    report => { report.rows[0].reading = ''; },
    report => { report.rows[0].english.checks.scene = false; },
  ]) {
    const revisionProof = clone(frozenRevisions), batch = successor(revisionProof).batches[0];
    const report = jsonArtifact(batch.reviewDelivery, batch.paths.report);
    change(report);
    replaceArtifact(batch.reviewDelivery, batch.paths.report, report);
    await assert.rejects(() => verifyMutation({revisionProof}));
  }
});

test('a coherently resealed delivery cannot replace the assigned reviewer or the actual final vote', async () => {
  for (const replacement of ['reviewer', 'final-vote']) {
    const revisionProof = clone(frozenRevisions), batch = successor(revisionProof).batches[0];
    const report = jsonArtifact(batch.reviewDelivery, batch.paths.report);
    if (replacement === 'reviewer') {
      // Both sides agree on this valid-looking actor path. Rejection therefore
      // depends on the assigned identity, rather than a one-sided mismatch.
      batch.reviewer = '/root/replacement_feedback_reviewer';
      report.reviewer = batch.reviewer;
    } else {
      // The objects, language status, and every content hash remain unchanged.
      // A new storage receipt still cannot replace the actual delivered vote.
      report.rows[0].reason += '（最终票被重签的机械测试）';
    }
    replaceArtifact(batch.reviewDelivery, batch.paths.report, report);
    await assert.rejects(() => verifyMutation({revisionProof}));
  }
});

test('retained canonical and English objects cannot be changed by resealing a successor', async () => {
  const retainedId = frozenRequest.rows.find(row => row.action === 'retain').id;
  for (const language of ['canonical', 'english']) {
    const revisionProof = clone(frozenRevisions);
    const round = successors(revisionProof).find(row => row.scopeIds.includes(retainedId));
    const batch = round.batches.find(row => jsonArtifact(row.authorDelivery, row.paths.cards)
      .some(card => card.id === retainedId));
    const cards = jsonArtifact(batch.authorDelivery, batch.paths.cards);
    const notes = jsonArtifact(batch.authorDelivery, batch.paths.notes);
    const card = cards.find(row => row.id === retainedId), note = notes.find(row => row.id === retainedId);
    if (language === 'canonical') {
      card.scene += '（伪造保留对象改动）';
      card.review = 'draft';
      note.disposition = 'revise';
    } else note.english.scene += ' Changed retained English.';
    replaceArtifact(batch.authorDelivery, batch.paths.cards, cards);
    replaceArtifact(batch.authorDelivery, batch.paths.notes, notes);
    const report = jsonArtifact(batch.reviewDelivery, batch.paths.report);
    const reviewed = report.rows.find(row => row.id === retainedId), final = {...card, review: 'approved'};
    report.sourceReceipt = batch.authorDelivery.receipt;
    reviewed.hash = objectHash(card);
    reviewed.sourceHash = objectHash(final);
    reviewed.englishHash = objectHash({id: retainedId, sourceHash: objectHash(final), ...note.english});
    replaceArtifact(batch.reviewDelivery, batch.paths.report, report);
    await assert.rejects(() => verifyMutation({revisionProof}));
  }
});

test('the 17-round checkpoint and previous hold registry cannot be rewritten by the new request', async () => {
  for (const change of [
    request => { request.initialRounds = 18; },
    request => { request.initialRoundsHash = '0'.repeat(64); },
    request => { request.initialReviewedProofSha256 = '0'.repeat(64); },
    request => { request.priorPairHoldsHash = '0'.repeat(64); },
    request => { request.priorPairHoldIds.pop(); },
    request => { request.priorFormHolds.pop(); },
  ]) {
    const request = clone(frozenRequest);
    change(request);
    await assert.rejects(() => verifyMutation({request}));
  }
  const revisionProof = clone(frozenRevisions);
  revisionProof.rounds[16].reviewPurpose += '-altered';
  await assert.rejects(() => verifyMutation({revisionProof}));
});

test('eight revised sentences equal the requested Japanese and three retained bilingual objects stay unchanged', () => {
  for (const row of verified.rows) {
    if (row.action === 'hold') continue;
    assert.equal(row.card.id, row.source.card.id);
    assert.equal(row.card.senseId, row.source.card.senseId);
    assert.equal(row.card.meaning, row.source.card.meaning);
    assert.equal(row.card.form, row.source.card.form);
    assert.deepEqual(row.target, row.source.target);
    if (row.action === 'revise') {
      assert.equal(row.fullSentence, row.source.proposedSentence);
      assert.notDeepEqual(row.card, row.source.card);
    } else {
      assert.deepEqual(row.card, row.source.card);
      assert.deepEqual(row.english, row.source.english);
      assert.equal(row.fullSentence, row.source.fullSentence);
    }
  }
  assert.equal(USAGE_CARDS.length, 16790);
  assert.equal(new Set(USAGE_CARDS.map(card => card.form)).size, 165);
  for (const form of heldForms) {
    assert.ok(USER_DIRECTED_FORM_DEFERRALS.some(row => row.form === form), form);
    assert.ok(USAGE_CARDS.every(card => card.form !== form), form);
  }
});

test('saved Markdown is derived from evidence, while its examination list has only two columns', () => {
  assert.equal(fs.readFileSync(FEEDBACK_REPORT, 'utf8'), renderRiskPilotFeedbackReport(verified));
  const list = renderRiskPilotFeedbackList(verified);
  assert.equal(fs.readFileSync(FEEDBACK_LIST, 'utf8'), list);
  const tableRows = list.split('\n').filter(line => line.startsWith('|'));
  const dataRows = tableRows.filter(line => !/^\|\s*[-:]/u.test(line) && !/变形.*日语原句/u.test(line));
  assert.equal(dataRows.length, 18);
  for (const row of tableRows) assert.equal(row.split('|').length, 4, row);
  assert.doesNotMatch(list, /usage:|sourceHash|englishHash|理由|具体依据/u);
  for (const row of verified.rows) assert.ok(list.includes(row.fullSentence.replaceAll('|', '\\|')), row.source.id);
});

test('verification and rendering preserve all current objects and the old pilot evidence', async () => {
  const files = [FEEDBACK_REQUEST, FEEDBACK_HOLDS,
    new URL('../docs/usage-card-form-risk-pilot-20261027.json.gz', import.meta.url),
    new URL('../docs/usage-card-form-risk-pilot-20261027.md', import.meta.url),
    new URL('../docs/usage-card-form-risk-pilot-list-20261027.md', import.meta.url),
    new URL('../docs/form-hold-baseline-20261027.json.gz', import.meta.url)];
  const beforeFiles = files.map(file => sha(fs.readFileSync(file)));
  const objects = {cards: USAGE_CARDS, reviewed: REVIEWED_USAGE_CARDS, english: CURRENT_ENGLISH,
    pairHolds: TEACHING_PAIR_DEFERRALS, formHolds: USER_DIRECTED_FORM_DEFERRALS};
  const beforeObjects = objectHash(objects);
  const result = await verifyRiskPilotFeedback();
  renderRiskPilotFeedbackReport(result);
  renderRiskPilotFeedbackList(result);
  assert.deepEqual(files.map(file => sha(fs.readFileSync(file))), beforeFiles);
  assert.equal(objectHash(objects), beforeObjects);
});
