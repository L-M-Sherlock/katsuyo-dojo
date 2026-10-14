import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { USAGE_CARDS } from '../app/lib/usage-cards.mjs';
import { buildEnglishUsageExpansions, verifyExpansionReport, verifyOriginalExpansionEvidence, verifyPostRepairBinding, verifySampleReport } from '../scripts/verify-english-usage-review.mjs';

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const checks = () => ({ englishNatural: true, meaning: true, roles: true, timeAndPolarity: true,
  register: true, scene: true, noAnswerLeak: true });
const card = { id: 'usage:test', sourceHash: 'source', englishHash: 'english', authorBatch: 'batch-0000' };
const packet = { packetId: 'review-0000', count: 1, cards: [card] };
const info = { sha256: 'packet-hash' };
const report = () => ({ schemaVersion: 1, reviewer: '/root/english-reviewer', selfReview: false,
  packetId: packet.packetId, packetSha256: info.sha256, count: 1,
  rows: [{ id: card.id, sourceHash: card.sourceHash, englishHash: card.englishHash,
    status: 'approved', reason: 'The scene and sentence describe the same action.', checks: checks() }] });

test('sample report requires exact packet identity and seven card judgments', () => {
  assert.equal(verifySampleReport(report(), packet, info).approved, 1);
  const badHash = report(); badHash.rows[0].englishHash = 'changed';
  assert.throws(() => verifySampleReport(badHash, packet, info), /row 0 differs/);
  const badPacket = report(); badPacket.packetSha256 = 'changed';
  assert.throws(() => verifySampleReport(badPacket, packet, info), /invalid report header/);
  const self = report(); self.selfReview = true;
  assert.throws(() => verifySampleReport(self, packet, info), /reviewer identity/);
  const missingCheck = report(); delete missingCheck.rows[0].checks.roles;
  assert.throws(() => verifySampleReport(missingCheck, packet, info), /seven boolean checks/);
  const failedApproval = report(); failedApproval.rows[0].checks.meaning = false;
  assert.throws(() => verifySampleReport(failedApproval, packet, info), /approved row has a failed check/);
  const generic = report(); generic.rows[0].reason = 'Looks fine.';
  assert.throws(() => verifySampleReport(generic, packet, info), /card-specific reason/);
  const repeated = new Set([report().rows[0].reason]);
  assert.throws(() => verifySampleReport(report(), packet, info, repeated), /repeated reason/);
  const validConcern = report(); validConcern.rows[0].status = 'source_issue'; validConcern.rows[0].checks.meaning = false;
  assert.equal(verifySampleReport(validConcern, packet, info).source_issue, 1);
});

test('expansion report uses the official batch identity and exact current card hashes', () => {
  const batchPacket = { batchId: 'batch-0000', count: 1, cards: [card] };
  const batchReport = { ...report(), batchId: 'batch-0000' };
  delete batchReport.packetId;
  assert.equal(verifyExpansionReport(batchReport, batchPacket, info).approved, 1);
  assert.throws(() => verifyExpansionReport({ ...batchReport, batchId: 'batch-0001' },
    batchPacket, info), /batchId differs/);
  const stale = structuredClone(batchReport); stale.rows[0].englishHash = 'stale';
  assert.throws(() => verifyExpansionReport(stale, batchPacket, info), /row 0 differs/);
});

test('expansion includes every card in each affected official batch once', () => {
  const cards = [USAGE_CARDS[0], USAGE_CARDS[1], USAGE_CARDS[2]];
  const overlays = cards.map(row => ({ id: row.id, sourceHash: hash(row),
    scene: 'Context.', translation: 'Sentence.' }));
  const batches = [{ id: 'batch-0000', ids: cards.slice(0, 2).map(row => row.id), receipt: 'author-0' },
    { id: 'batch-0001', ids: [cards[2].id], receipt: 'author-1' }];
  const failures = new Map([['batch-0000', [{ id: cards[0].id, status: 'revise' }]]]);
  const final = { receipt: 'final', overlayHash: 'overlay', moduleHash: 'module' };
  const expansions = buildEnglishUsageExpansions(batches, new Map(cards.map(row => [row.id, row])),
    new Map(overlays.map(row => [row.id, row])), failures, final);
  assert.equal(expansions.length, 1);
  assert.deepEqual(expansions[0].cards.map(row => row.id), batches[0].ids);
  assert.equal(expansions[0].authorBatchReceipt, 'author-0');
  assert.equal(expansions[0].finalReceipt, 'final');
  assert.equal(expansions[0].cards[1].englishHash, hash(overlays[1]));
  assert.deepEqual(expansions[0].triggerSampleRows, failures.get('batch-0000'));
});

test('post-repair binding rejects stale final hashes and edited trigger reports', () => {
  const original = { summary: { sampleManifestSha256: 'sample', finalReceipt: 'old-final',
    englishOverlayHash: 'old-overlay', statuses: { approved: 4, revise: 2, uncertain: 0, source_issue: 0 } },
    reportDigests: [{ file: 'review-0000.json', reviewer: 'reviewer', sha256: 'report' }] };
  const final = { receipt: 'new-final', overlayHash: 'new-overlay', moduleHash: 'new-module' };
  const payload = { schemaVersion: 1, workflow: 'english-usage-card-repair', provider: 'gpt-6-luna-max',
    repairManifestSha256: 'repair', triggerSampleManifestSha256: 'sample',
    triggerReportDigests: original.reportDigests, originalFinalReceipt: 'old-final',
    originalOverlayHash: 'old-overlay', repairedCount: 2,
    finalReceipt: 'new-final', finalOverlayHash: 'new-overlay', finalModuleHash: 'new-module' };
  const receipt = { ...payload, receipt: hash(payload) };
  assert.doesNotThrow(() => verifyPostRepairBinding({ original, repairReceipt: receipt,
    repairManifestSha256: 'repair', final }));
  assert.throws(() => verifyPostRepairBinding({ original, repairReceipt: receipt,
    repairManifestSha256: 'changed', final }), /stale or differs/);
  assert.throws(() => verifyPostRepairBinding({ original, repairReceipt: receipt,
    repairManifestSha256: 'repair', final: { ...final, overlayHash: 'changed' } }), /stale or differs/);
  assert.throws(() => verifyPostRepairBinding({ original: { ...original,
    reportDigests: [{ ...original.reportDigests[0], sha256: 'changed' }] }, repairReceipt: receipt,
    repairManifestSha256: 'repair', final }), /stale or differs/);
  assert.throws(() => verifyPostRepairBinding({ original, repairReceipt: { ...receipt, repairedCount: 3 },
    repairManifestSha256: 'repair', final }), /stale or differs/);
});

test('original expansion evidence rejects edited report bytes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'review-evidence-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'reports'));
  await fs.mkdir(path.join(root, 'expansion'));
  const bytes = value => `${JSON.stringify(value)}\n`;
  const write = (file, value) => fs.writeFile(path.join(root, file), bytes(value));
  const samplePacket = { schemaVersion: 1, algorithmVersion: 2, packetId: 'review-0000', count: 1,
    cards: [{ ...card, authorBatchReceipt: 'author' }] };
  const packetSha = crypto.createHash('sha256').update(bytes(samplePacket)).digest('hex');
  const sampleReport = { ...report(), packetSha256: packetSha,
    rows: [{ ...report().rows[0], status: 'revise', checks: { ...checks(), meaning: false } }] };
  const reportSha = crypto.createHash('sha256').update(bytes(sampleReport)).digest('hex');
  const sampleManifest = { sampleCount: 1, sampleIds: [card.id], finalReceipt: 'old-final',
    englishOverlayHash: 'old-overlay', englishModuleHash: 'old-module',
    packets: [{ file: 'review-0000.json', sha256: packetSha, count: 1 }] };
  const sampleSha = crypto.createHash('sha256').update(bytes(sampleManifest)).digest('hex');
  const expansion = { batchId: card.authorBatch, count: 1, cards: [samplePacket.cards[0]],
    authorBatchReceipt: 'author', finalReceipt: 'old-final',
    triggerSampleRows: [{ id: card.id, status: 'revise' }] };
  const expansionSha = crypto.createHash('sha256').update(bytes(expansion)).digest('hex');
  const summary = { schemaVersion: 1, sampleManifestSha256: sampleSha, sampleCount: 1,
    finalReceipt: 'old-final', englishOverlayHash: 'old-overlay', englishModuleHash: 'old-module',
    statuses: { approved: 0, revise: 1, uncertain: 0, source_issue: 0 },
    reportDigests: [{ file: 'review-0000.json', reviewer: sampleReport.reviewer, sha256: reportSha }],
    expansionBatchCount: 1, expansionCardCount: 1,
    packets: [{ file: 'batch-0000.json', count: 1, authorBatchReceipt: 'author', sha256: expansionSha }] };
  await write('review-0000.json', samplePacket);
  await write('reports/review-0000.json', sampleReport);
  await write('manifest.json', sampleManifest);
  await write('expansion/batch-0000.json', expansion);
  await write('expansion/summary.json', summary);
  assert.equal((await verifyOriginalExpansionEvidence(root)).failures.size, 1);
  await write('reports/review-0000.json', { ...sampleReport, reviewer: 'tampered' });
  await assert.rejects(verifyOriginalExpansionEvidence(root), /Original sample reports differ/);
});
