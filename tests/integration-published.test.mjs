import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readReleaseProof, verifyReleaseProof} from '../scripts/export-integration-batches.mjs';
import {auditIntegrationCoverage} from '../scripts/audit-integration-coverage.mjs';
import {USAGE_CARDS, usageCardStageRequirements, usageCardIssues} from '../app/lib/usage-cards.mjs';
import generated from '../app/lib/usage-cards/integration-generated.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const proofPath = fileURLToPath(new URL('../docs/integration-release-proof.json.gz', import.meta.url));
const proof = readReleaseProof(proofPath);
const frozen = JSON.parse(fs.readFileSync(new URL('../docs/integration-stage-requirements.v2.json', import.meta.url)));
const ids = new Set(generated.map(card => card.id));

test('published integration cards exactly match independent protocol-3 proof and preserve all historical content', () => {
  assert.equal(verifyReleaseProof(proof).valid, true);
  assert.equal(createHash('sha256').update(fs.readFileSync(proofPath)).digest('hex'), frozen.proof.sha256);
  assert.deepEqual(generated, proof.batches.flatMap(batch => batch.merged.value));
  assert.equal(ids.size, generated.length);
  const prior = USAGE_CARDS.filter(card => !ids.has(card.id));
  assert.equal(prior.length, 16412);
  assert.equal(digest(prior), '775ff7fcd7a0a2bdfb27a9408202d92d58a1dc76712e6bd5b43d6d0dceb7167d');
  assert.equal(digest(proof.baseline.cards), '770d6cf0a58f97a147ae263254788a2e28de01400ba58ea91bfa73ec845da94c');
  const byId = new Map(USAGE_CARDS.map(card => [card.id, card]));
  for (const card of proof.release.cards) assert.deepEqual(byId.get(card.id), card);
});

test('the published integration partition accounts for every approved and still-open pair', async () => {
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
  assert.equal(frozen.releaseStatus, frozen.open.length ? 'partial' : 'complete');
  assert.deepEqual(usageCardIssues(USAGE_CARDS), []);
  const report = await auditIntegrationCoverage({project: fileURLToPath(new URL('../', import.meta.url)),
    requirements: 'docs/integration-stage-requirements.v2.json', proofPath, strict: true});
  assert.equal(report.valid, true, report.errors.join('\n'));
  assert.deepEqual(new Set(report.cards.approvedPairs), new Set(frozen.approved));
  assert.deepEqual(new Set(report.open.pairs), new Set(frozen.open));
});
