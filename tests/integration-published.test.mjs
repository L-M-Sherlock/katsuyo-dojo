import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readReleaseProof, verifyReleaseProof} from '../scripts/export-integration-batches.mjs';
import {auditIntegrationCoverage} from '../scripts/audit-integration-coverage.mjs';
import {USAGE_CARDS, usageCardStageRequirements, usageCardIssues} from '../app/lib/usage-cards.mjs';
import generated from '../app/lib/usage-cards/integration-generated.mjs';
import {USER_DIRECTED_USAGE_DEFERRALS} from '../app/lib/usage-cards/user-directed-deferrals.mjs';
import {USER_DIRECTED_USAGE_CORRECTIONS} from '../app/lib/usage-cards/user-directed-corrections.mjs';
import {RETIRED_TEORU_NEGATIVE_FORMS} from '../app/lib/compound-forms.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const actionReview = JSON.parse(fs.readFileSync(new URL('../docs/usage-card-actions-review.json', import.meta.url)));
const naturalnessReview = JSON.parse(fs.readFileSync(new URL('../docs/usage-card-naturalness-20260923.json', import.meta.url)));
const revisions = new Map(actionReview.editorialRevisions.map(entry => [entry.id, entry]));
const naturalnessRevisions = new Map(naturalnessReview.approvedRevisions.map(entry => [entry.id, entry]));
const withdrawals = actionReview.editorialWithdrawals;
const proofPath = fileURLToPath(new URL('../docs/integration-release-proof.v3.json.gz', import.meta.url));
const proof = readReleaseProof(proofPath);
const fullNaturalness = JSON.parse(gunzipSync(fs.readFileSync(new URL('../docs/usage-card-naturalness-full-progress.v1.json.gz', import.meta.url))));
const frozen = JSON.parse(fs.readFileSync(new URL('../docs/integration-stage-requirements.v3.json', import.meta.url)));
const ids = new Set(generated.map(card => card.id));
const userHeld = new Map(USER_DIRECTED_USAGE_DEFERRALS.map(row => [row.id, row]));
const userCorrected = new Map(USER_DIRECTED_USAGE_CORRECTIONS.map(row => [row.id, row]));

// Recover the exact published source that preceded the later full-card audit.
// Every current object must still match its final reviewed hash, and deferred
// objects must be absent; the old release proof itself is never rewritten.
function preNaturalnessView() {
  const current = new Map(USAGE_CARDS.map(card => [card.id, card]));
  const statuses = new Map(fullNaturalness.statuses.map(row => [row.id, row]));
  assert.equal(current.size, USAGE_CARDS.length);
  assert.equal(fullNaturalness.sourceCards.length, fullNaturalness.activeCount);
  assert.equal(statuses.size, fullNaturalness.activeCount);
  assert.equal(userCorrected.size, USER_DIRECTED_USAGE_CORRECTIONS.length);
  const matchedCorrections = new Set();
  for (const source of fullNaturalness.sourceCards) {
    const status = statuses.get(source.id);
    assert.equal(status.sourceHash, digest(source), `Frozen source drift: ${source.id}`);
    if (status.status === 'deferred' || userHeld.has(source.id) || RETIRED_TEORU_NEGATIVE_FORMS.has(source.form)) {
      assert.equal(current.has(source.id), false);
      if (userHeld.has(source.id)) {
        const held = userHeld.get(source.id);
        assert.equal(status.status, 'approved');
        assert.equal(held.cardHash, status.cardHash);
        assert.equal(held.pair, `${source.senseId}/${source.form}`);
      }
    }
    else {
      assert.equal(status.status, 'approved');
      const correction = userCorrected.get(source.id);
      if (correction) {
        assert.equal(correction.pair, `${source.senseId}/${source.form}`);
        assert.equal(correction.previousHash, status.cardHash);
        assert.equal(correction.finalHash, digest(correction.card));
        assert.equal(digest(current.get(source.id)), correction.finalHash,
          `Unreviewed user correction: ${source.id}`);
        matchedCorrections.add(source.id);
      } else assert.equal(digest(current.get(source.id)), status.cardHash,
        `Unreviewed current edit: ${source.id}`);
      current.delete(source.id);
    }
  }
  assert.deepEqual(matchedCorrections, new Set(userCorrected.keys()));
  assert.equal(current.size, 0, 'No runtime card may appear outside the full-card proof');
  return fullNaturalness.sourceCards;
}

// Undo only documented later edits, then check the original frozen hash. Do not
// compare unchanged cards to a baseline constructed from those same cards.
function historicalView(cards) {
  assert.deepEqual(new Set(revisions.keys()), new Set([
    'usage:teikuNegativePast:verb:笑う:わらう',
    'usage:teikuNegative:verb:違う:ちがう',
    'usage:teikuNegativePast:verb:違う:ちがう',
  ]));
  assert.deepEqual(withdrawals.map(row => row.id), ['usage:teikuNegativePast:verb:死ぬ:しぬ']);
  const result = cards.map(card => {
    const naturalness = naturalnessRevisions.get(card.id);
    if (naturalness) {
      assert.equal(digest(card), naturalness.currentHash, `Unreviewed naturalness edit: ${card.id}`);
      assert.equal(digest(naturalness.previousCard), naturalness.previousHash);
      card = naturalness.previousCard;
    }
    const revision = revisions.get(card.id);
    if (!revision) return card;
    assert.equal(digest(card), revision.currentHash, `Unreviewed edit: ${card.id}`);
    assert.equal(digest(revision.previousCard), revision.previousHash);
    return revision.previousCard;
  });
  for (const row of withdrawals) {
    assert.ok(!result.some(card => card.id === row.id), 'Withdrawn card must not be published');
    assert.equal(digest(row.previousCard), row.previousHash);
    const index = result.findIndex(card => card.id === row.insertBeforeId);
    assert.ok(index >= 0, 'Keep the historical ordering anchor');
    result.splice(index, 0, row.previousCard);
  }
  for (const row of [...naturalnessReview.deferred].sort((a, b) => a.sourceIndex - b.sourceIndex)) {
    assert.ok(!result.some(card => card.id === row.id), 'Deferred card must not be published');
    assert.equal(digest(row.publishedCard), row.publishedHash);
    const index = result.findIndex(card => card.id === row.insertBeforeId);
    assert.ok(index >= 0, `Keep the historical ordering anchor: ${row.id}`);
    result.splice(index, 0, row.publishedCard);
  }
  return result;
}

test('integration proof stays immutable while documented later edits reconstruct the original content hash', () => {
  assert.equal(verifyReleaseProof(proof).valid, true);
  assert.equal(createHash('sha256').update(fs.readFileSync(proofPath)).digest('hex'), frozen.proof.sha256);
  assert.deepEqual(generated, proof.batches.flatMap(batch => batch.merged.value));
  assert.equal(ids.size, generated.length);
  const prior = preNaturalnessView().filter(card => !ids.has(card.id));
  assert.equal(prior.length, 16411 - naturalnessReview.deferredCount);
  const historical = historicalView(prior);
  assert.equal(historical.length, 16412);
  assert.equal(digest(historical), '775ff7fcd7a0a2bdfb27a9408202d92d58a1dc76712e6bd5b43d6d0dceb7167d');
  assert.equal(digest(proof.baseline.cards), '770d6cf0a58f97a147ae263254788a2e28de01400ba58ea91bfa73ec845da94c');
  const byId = new Map(preNaturalnessView().map(card => [card.id, card]));
  for (const card of proof.release.cards) assert.deepEqual(byId.get(card.id), card);
});

test('the completed integration release covers every eligible pair with no open or deferred gap', async () => {
  const original = JSON.parse(fs.readFileSync(new URL('../docs/integration-stage-requirements.v1.json', import.meta.url)));
  assert.deepEqual(frozen.required, original.required);
  const current = new Set(usageCardStageRequirements('integration'));
  assert.deepEqual(new Set([...current, ...frozen.deferred]), new Set(original.required));
  const covered = USAGE_CARDS.filter(card => current.has(`${card.senseId}/${card.form}`));
  assert.deepEqual(new Set(covered.map(card => `${card.senseId}/${card.form}`)), new Set(frozen.approved));
  const partition = [...frozen.approved, ...frozen.deferred, ...frozen.open];
  assert.equal(new Set(partition).size, partition.length, 'release partitions must not overlap');
  assert.deepEqual(new Set(partition), new Set(original.required));
  for (const name of ['required', 'approved', 'deferred', 'open']) assert.equal(frozen.counts[name], frozen[name].length);
  assert.equal(frozen.releaseStatus, 'complete');
  assert.deepEqual(frozen.open, []);
  assert.deepEqual(frozen.deferred, []);
  assert.deepEqual(usageCardIssues(USAGE_CARDS, {requireStageCoverage:['integration']}), []);
  const report = await auditIntegrationCoverage({project: fileURLToPath(new URL('../', import.meta.url)),
    requirements: 'docs/integration-stage-requirements.v3.json', proofPath, strict: true});
  assert.equal(report.valid, true, report.errors.join('\n'));
  assert.deepEqual(new Set(report.cards.approvedPairs), new Set(frozen.approved));
  assert.deepEqual(new Set(report.open.pairs), new Set(frozen.open));
});

test('completion retains the previous 245 additions and the frozen prior-release hash after documented edits', () => {
  const priorBytes = fs.readFileSync(new URL('../docs/integration-stage-requirements.v2.json', import.meta.url));
  assert.equal(createHash('sha256').update(priorBytes).digest('hex'), 'b2b3081a95f67ec8f127deed0852b1e7beaf1994e815f0e1b8a1565930e5c563');
  const priorState = JSON.parse(priorBytes);
  const oldPath = fileURLToPath(new URL('../' + priorState.proof.path, import.meta.url));
  assert.equal(createHash('sha256').update(fs.readFileSync(oldPath)).digest('hex'), priorState.proof.sha256);
  const oldProof = readReleaseProof(oldPath);
  assert.equal(verifyReleaseProof(oldProof).valid, true);
  const current = new Map(preNaturalnessView().map(card => [card.id, card]));
  for (const old of oldProof.release.cards) assert.deepEqual(current.get(old.id), old);
  const oldIds = new Set(oldProof.release.cards.map(card => card.id));
  const added = generated.filter(card => !oldIds.has(card.id));
  assert.equal(added.length, 245);
  assert.deepEqual(new Set(added.map(card => `${card.senseId}/${card.form}`)), new Set(priorState.open));
  const addedIds = new Set(added.map(card => card.id));
  const priorRuntime = preNaturalnessView().filter(card => !addedIds.has(card.id));
  assert.equal(priorRuntime.length, frozen.previousRelease.cards - withdrawals.length - naturalnessReview.deferredCount);
  const historical = historicalView(priorRuntime);
  assert.equal(historical.length, frozen.previousRelease.cards);
  assert.equal(digest(historical), frozen.previousRelease.sha256);
});

test('historical verification detects unrelated drift and changes to a reviewed replacement', () => {
  const prior = preNaturalnessView().filter(card => !ids.has(card.id));
  const changed = prior.map((card, index) => index === 0 ? {...card, translation: 'unreviewed'} : card);
  assert.notEqual(digest(historicalView(changed)), digest(historicalView(prior)));
  const revisedId = [...revisions.keys()][0];
  assert.throws(() => historicalView(prior.map(card => card.id === revisedId
    ? {...card, translation: 'unreviewed'} : card)), /Unreviewed edit/);
});
