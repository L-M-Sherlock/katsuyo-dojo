/** Verify sample reports and prepare deterministic, complete author-batch expansion packets. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { USAGE_CARDS } from '../app/lib/usage-cards.mjs';
import { EN_USAGE_CARD_OVERLAYS } from '../app/lib/i18n/content/en/usage-cards.mjs';
import { englishUsageReviewRow, loadFrozenBatches } from './sample-english-usage-review.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_WORK = path.join(ROOT, 'work/i18n-english-usage-cards-gpt');
const DEFAULT_REVIEW = path.join(ROOT, 'work/i18n-english-usage-cards-review');
const DEFAULT_REPAIR = path.join(ROOT, 'work/i18n-english-usage-cards-repair');
const DEFAULT_MODULE = path.join(ROOT, 'app/lib/i18n/content/en/usage-cards.mjs');
const CHECKS = ['englishNatural', 'meaning', 'roles', 'timeAndPolarity', 'register', 'scene', 'noAnswerLeak'];
const STATUSES = ['approved', 'revise', 'uncertain', 'source_issue'];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const jsonBytes = value => `${JSON.stringify(value, null, 2)}\n`;

export function verifySampleReport(report, packet, packetInfo, usedReasons = new Set()) {
  ensure(report?.schemaVersion === 1 && report.packetId === packet.packetId
    && report.packetSha256 === packetInfo.sha256 && report.count === packet.count
    && typeof report.reviewer === 'string' && report.reviewer.trim()
    && report.reviewer !== 'gpt-6-luna-max' && report.selfReview === false,
  `${packet.packetId}: invalid report header or reviewer identity`);
  ensure(Array.isArray(report.rows) && report.rows.length === packet.cards.length,
    `${packet.packetId}: report count differs from packet`);
  const counts = Object.fromEntries(STATUSES.map(status => [status, 0]));
  for (const [index, card] of packet.cards.entries()) {
    const row = report.rows[index];
    ensure(row?.id === card.id && row.sourceHash === card.sourceHash && row.englishHash === card.englishHash,
      `${packet.packetId}: row ${index} differs in order, ID, or hash`);
    ensure(STATUSES.includes(row.status), `${card.id}: invalid review status`);
    ensure(typeof row.reason === 'string' && row.reason.trim().length >= 12,
      `${card.id}: missing card-specific reason`);
    const reason = row.reason.trim();
    ensure(!usedReasons.has(reason), `${card.id}: repeated reason is not card-specific`);
    usedReasons.add(reason);
    ensure(row.checks && typeof row.checks === 'object' && !Array.isArray(row.checks)
      && same(Object.keys(row.checks).sort(), [...CHECKS].sort())
      && CHECKS.every(check => typeof row.checks[check] === 'boolean'),
    `${card.id}: expected seven boolean checks`);
    ensure(row.status !== 'approved' || CHECKS.every(check => row.checks[check]),
      `${card.id}: approved row has a failed check`);
    counts[row.status] += 1;
  }
  return counts;
}

export function verifyExpansionReport(report, packet, info, usedReasons = new Set()) {
  ensure(report?.batchId === packet.batchId && !Object.hasOwn(report, 'packetId'),
    `${packet.batchId}: report batchId differs from assigned packet`);
  return verifySampleReport({ ...report, packetId: report.batchId },
    { packetId: packet.batchId, count: packet.count, cards: packet.cards }, info, usedReasons);
}

export function buildEnglishUsageExpansions(batches, cardById, overlayById, failureByBatch, final) {
  return batches.filter(batch => failureByBatch.has(batch.id)).map(batch => {
    const cards = batch.ids.map(id => englishUsageReviewRow(cardById.get(id), overlayById.get(id), batch, []));
    ensure(cards.length > 0 && cards.length <= 64, `${batch.id}: invalid expansion count`);
    return { schemaVersion: 1, algorithmVersion: 1, batchId: batch.id,
      authorBatchReceipt: batch.receipt, finalReceipt: final.receipt,
      englishOverlayHash: final.overlayHash, englishModuleHash: final.moduleHash,
      count: cards.length, triggerSampleRows: failureByBatch.get(batch.id), cards };
  });
}

export async function verifyEnglishUsageReview({ cards = USAGE_CARDS, overlays = EN_USAGE_CARD_OVERLAYS,
  workDir = DEFAULT_WORK, reviewDir = DEFAULT_REVIEW, modulePath = DEFAULT_MODULE } = {}) {
  const frozen = await loadFrozenBatches(workDir, cards, overlays, modulePath);
  const manifestBytes = await fs.readFile(path.join(reviewDir, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  ensure(manifest.schemaVersion === 1 && manifest.algorithmVersion === 2
    && manifest.frozenRuntimeHash === frozen.manifest.runtimeHash
    && manifest.frozenManifestSha256 === sha(frozen.manifestBytes)
    && manifest.finalReceipt === frozen.final.receipt
    && manifest.englishOverlayHash === frozen.final.overlayHash
    && manifest.englishModuleHash === frozen.final.moduleHash
    && manifest.canonicalCount === cards.length
    && manifest.authorBatchCount === frozen.batches.length,
  'Sample manifest differs from current canonical, English overlay, or final receipt');
  ensure(Array.isArray(manifest.packets) && Array.isArray(manifest.sampleIds)
    && manifest.sampleCount === manifest.sampleIds.length,
  'Sample manifest packet or ID list is incomplete');
  const reportDir = path.join(reviewDir, 'reports');
  const reportFiles = (await fs.readdir(reportDir)).filter(name => name.endsWith('.json')).sort();
  const expectedFiles = manifest.packets.map(info => info.file).sort();
  ensure(same(reportFiles, expectedFiles), 'Sample report file set differs from packet manifest');
  const counts = Object.fromEntries(STATUSES.map(status => [status, 0]));
  const failureByBatch = new Map();
  const usedReasons = new Set();
  const verifiedIds = [];
  const reportDigests = [];
  const nonApprovedRows = [];
  for (const info of manifest.packets) {
    const bytes = await fs.readFile(path.join(reviewDir, info.file));
    ensure(sha(bytes) === info.sha256, `${info.file}: packet bytes differ from frozen manifest`);
    const packet = JSON.parse(bytes);
    ensure(packet.schemaVersion === 1 && packet.algorithmVersion === manifest.algorithmVersion
      && packet.count === info.count && packet.count > 0 && packet.count <= 64
      && packet.cards?.length === info.count && info.file === `${packet.packetId}.json`
      && packet.cards[0].id === info.firstId && packet.cards.at(-1).id === info.lastId,
    `${info.file}: packet metadata differs from manifest`);
    const reportBytes = await fs.readFile(path.join(reportDir, info.file));
    const report = JSON.parse(reportBytes);
    const packetCounts = verifySampleReport(report, packet, info, usedReasons);
    for (const status of STATUSES) counts[status] += packetCounts[status];
    for (const [index, row] of report.rows.entries()) {
      const card = packet.cards[index];
      verifiedIds.push(card.id);
      if (row.status !== 'approved') {
        nonApprovedRows.push({ ...row, authorBatch: card.authorBatch, authorBatchReceipt: card.authorBatchReceipt,
          packetId: packet.packetId, packetSha256: info.sha256, reviewer: report.reviewer });
        const failures = failureByBatch.get(card.authorBatch) ?? [];
        failures.push({ id: card.id, status: row.status });
        failureByBatch.set(card.authorBatch, failures);
      }
    }
    reportDigests.push({ file: info.file, reviewer: report.reviewer, sha256: sha(reportBytes) });
  }
  ensure(same(verifiedIds, manifest.sampleIds) && new Set(verifiedIds).size === manifest.sampleCount,
    'Sample reports do not cover exact manifest IDs in order');
  const cardById = new Map(cards.map(card => [card.id, card]));
  const overlayById = new Map(overlays.map(row => [row.id, row]));
  const expansions = buildEnglishUsageExpansions(frozen.batches, cardById, overlayById,
    failureByBatch, frozen.final);
  return { manifest, manifestSha256: sha(manifestBytes), counts, reportDigests, nonApprovedRows, expansions };
}

export async function writeEnglishUsageReviewExpansion(options = {}) {
  const reviewDir = options.reviewDir ?? DEFAULT_REVIEW;
  const result = await verifyEnglishUsageReview(options);
  const outputDir = options.outputDir ?? path.join(reviewDir, 'expansion');
  const packets = result.expansions.map(packet => ({ file: `${packet.batchId}.json`, bytes: jsonBytes(packet) }));
  const summary = {
    schemaVersion: 1, algorithmVersion: 1, sampleManifestSha256: result.manifestSha256,
    finalReceipt: result.manifest.finalReceipt, englishOverlayHash: result.manifest.englishOverlayHash,
    englishModuleHash: result.manifest.englishModuleHash,
    sampleCount: result.manifest.sampleCount, statuses: result.counts,
    reportDigests: result.reportDigests,
    expansionBatchCount: packets.length,
    expansionCardCount: result.expansions.reduce((total, packet) => total + packet.count, 0),
    packets: packets.map(({ file, bytes }, index) => ({ file, count: result.expansions[index].count,
      authorBatchReceipt: result.expansions[index].authorBatchReceipt, sha256: sha(bytes) })),
  };
  await fs.mkdir(outputDir, { recursive: true });
  const expected = new Set(packets.map(packet => packet.file));
  for (const name of await fs.readdir(outputDir)) if (/^batch-\d+\.json$/.test(name) && !expected.has(name)) {
    await fs.unlink(path.join(outputDir, name));
  }
  for (const packet of packets) await fs.writeFile(path.join(outputDir, packet.file), packet.bytes);
  await fs.writeFile(path.join(outputDir, 'summary.json'), jsonBytes(summary));
  return summary;
}

/** Keep the original report result as evidence after English hashes change. */
export async function verifyOriginalExpansionEvidence(reviewDir = DEFAULT_REVIEW) {
  const summaryBytes = await fs.readFile(path.join(reviewDir, 'expansion/summary.json'));
  const summary = JSON.parse(summaryBytes);
  const sampleBytes = await fs.readFile(path.join(reviewDir, 'manifest.json'));
  const sample = JSON.parse(sampleBytes);
  ensure(summary.schemaVersion === 1 && summary.sampleManifestSha256 === sha(sampleBytes)
    && summary.sampleCount === sample.sampleCount && summary.finalReceipt === sample.finalReceipt
    && summary.englishOverlayHash === sample.englishOverlayHash
    && summary.englishModuleHash === sample.englishModuleHash,
  'Original expansion summary differs from frozen sample manifest');
  const counts = Object.fromEntries(STATUSES.map(status => [status, 0]));
  const failures = new Map();
  const batchReceipts = new Map();
  const reportDigests = [];
  const ids = [];
  const reasons = new Set();
  for (const info of sample.packets) {
    const packetBytes = await fs.readFile(path.join(reviewDir, info.file));
    ensure(sha(packetBytes) === info.sha256, `${info.file}: original sample packet changed`);
    const packet = JSON.parse(packetBytes);
    const reportBytes = await fs.readFile(path.join(reviewDir, 'reports', info.file));
    const report = JSON.parse(reportBytes);
    const result = verifySampleReport(report, packet, info, reasons);
    for (const status of STATUSES) counts[status] += result[status];
    for (const [index, card] of packet.cards.entries()) {
      const row = report.rows[index];
      ids.push(card.id);
      const prior = batchReceipts.get(card.authorBatch);
      ensure(!prior || prior === card.authorBatchReceipt, `${card.authorBatch}: conflicting original author receipts`);
      batchReceipts.set(card.authorBatch, card.authorBatchReceipt);
      if (row.status !== 'approved') {
        const trigger = failures.get(card.authorBatch) ?? [];
        trigger.push({ id: card.id, status: row.status });
        failures.set(card.authorBatch, trigger);
      }
    }
    reportDigests.push({ file: info.file, reviewer: report.reviewer, sha256: sha(reportBytes) });
  }
  ensure(same(ids, sample.sampleIds) && same(counts, summary.statuses)
    && same(reportDigests, summary.reportDigests),
  'Original sample reports differ from expansion summary');
  ensure(summary.expansionBatchCount === failures.size && Array.isArray(summary.packets)
    && summary.packets.length === failures.size,
  'Original expansion batch count differs from report failures');
  const files = [...failures.keys()].map(id => `${id}.json`).sort();
  ensure(same(summary.packets.map(packet => packet.file).sort(), files),
    'Original expansion packet set differs from failed sample batches');
  let expanded = 0;
  for (const info of summary.packets) {
    const bytes = await fs.readFile(path.join(reviewDir, 'expansion', info.file));
    ensure(sha(bytes) === info.sha256, `${info.file}: original expansion packet changed`);
    const packet = JSON.parse(bytes);
    ensure(packet.batchId === path.basename(info.file, '.json') && packet.count === info.count
      && packet.count === packet.cards?.length && packet.count > 0 && packet.count <= 64
      && packet.authorBatchReceipt === info.authorBatchReceipt
      && packet.authorBatchReceipt === batchReceipts.get(packet.batchId)
      && packet.finalReceipt === summary.finalReceipt
      && same(packet.triggerSampleRows, failures.get(packet.batchId)),
    `${info.file}: original expansion differs from report triggers`);
    expanded += packet.count;
  }
  ensure(expanded === summary.expansionCardCount, 'Original expansion card count differs from packets');
  return { summary, summarySha256: sha(summaryBytes), sample, reportDigests, failures };
}

/** Reject stale or edited repair evidence before reusing the original expansion scope. */
export function verifyPostRepairBinding({ original, repairReceipt, repairManifestSha256, final }) {
  const { receipt, ...payload } = repairReceipt;
  ensure(receipt === sha(JSON.stringify(payload)) && repairReceipt.schemaVersion === 1
    && repairReceipt.workflow === 'english-usage-card-repair'
    && repairReceipt.provider === 'gpt-6-luna-max'
    && repairReceipt.repairManifestSha256 === repairManifestSha256
    && repairReceipt.triggerSampleManifestSha256 === original.summary.sampleManifestSha256
    && same(repairReceipt.triggerReportDigests, original.reportDigests)
    && repairReceipt.originalFinalReceipt === original.summary.finalReceipt
    && repairReceipt.originalOverlayHash === original.summary.englishOverlayHash
    && repairReceipt.finalReceipt === final.receipt
    && repairReceipt.finalOverlayHash === final.overlayHash
    && repairReceipt.finalModuleHash === final.moduleHash,
  'Repair merge receipt is stale or differs from original review and current English overlay');
  ensure(repairReceipt.repairedCount === ['revise', 'uncertain', 'source_issue']
    .reduce((total, status) => total + original.summary.statuses[status], 0),
  'Repair merge count differs from original non-approved sample count');
}

export async function writeEnglishUsagePostRepairExpansion({ cards = USAGE_CARDS,
  overlays = EN_USAGE_CARD_OVERLAYS, workDir = DEFAULT_WORK, reviewDir = DEFAULT_REVIEW,
  repairDir = DEFAULT_REPAIR, modulePath = DEFAULT_MODULE,
  outputDir = path.join(reviewDir, 'expansion-after-repair') } = {}) {
  const original = await verifyOriginalExpansionEvidence(reviewDir);
  const frozen = await loadFrozenBatches(workDir, cards, overlays, modulePath);
  ensure(original.sample.frozenRuntimeHash === frozen.manifest.runtimeHash
    && original.sample.frozenManifestSha256 === sha(frozen.manifestBytes),
  'Canonical cards or author assignments changed since original review');
  const repairManifestBytes = await fs.readFile(path.join(repairDir, 'manifest.json'));
  const repairReceiptBytes = await fs.readFile(path.join(repairDir, 'merge-receipt.json'));
  const repairReceipt = JSON.parse(repairReceiptBytes);
  verifyPostRepairBinding({ original, repairReceipt,
    repairManifestSha256: sha(repairManifestBytes), final: frozen.final });
  const cardById = new Map(cards.map(card => [card.id, card]));
  const overlayById = new Map(overlays.map(row => [row.id, row]));
  const expansions = buildEnglishUsageExpansions(frozen.batches, cardById, overlayById,
    original.failures, frozen.final);
  ensure(same(expansions.map(packet => `${packet.batchId}.json`).sort(),
    original.summary.packets.map(packet => packet.file).sort()),
  'Post-repair expansion scope differs from original failed batches');
  const packets = expansions.map(packet => ({ file: `${packet.batchId}.json`, bytes: jsonBytes(packet) }));
  const summary = { schemaVersion: 1, algorithmVersion: 1,
    originalExpansionSummarySha256: original.summarySha256,
    triggerSampleManifestSha256: original.summary.sampleManifestSha256,
    triggerReportDigests: original.reportDigests,
    repairMergeReceipt: repairReceipt.receipt,
    repairMergeReceiptSha256: sha(repairReceiptBytes),
    finalReceipt: frozen.final.receipt, englishOverlayHash: frozen.final.overlayHash,
    englishModuleHash: frozen.final.moduleHash,
    expansionBatchCount: packets.length,
    expansionCardCount: expansions.reduce((total, packet) => total + packet.count, 0),
    packets: packets.map(({ file, bytes }, index) => ({ file, count: expansions[index].count,
      authorBatchReceipt: expansions[index].authorBatchReceipt, sha256: sha(bytes) })) };
  await fs.mkdir(outputDir, { recursive: true });
  const expected = new Map([...packets, { file: 'summary.json', bytes: jsonBytes(summary) }]
    .map(row => [row.file, row.bytes]));
  const existing = await fs.readdir(outputDir);
  ensure(existing.length === 0 || same(existing.sort(), [...expected.keys()].sort()),
    'Post-repair expansion directory already contains a different file set');
  for (const [file, bytes] of expected) {
    try {
      const prior = await fs.readFile(path.join(outputDir, file), 'utf8');
      ensure(prior === bytes, `${file}: immutable post-repair expansion differs from current evidence`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await fs.writeFile(path.join(outputDir, file), bytes, { flag: 'wx' });
    }
  }
  return summary;
}

export async function verifyEnglishUsageExpansionReports({ cards = USAGE_CARDS,
  overlays = EN_USAGE_CARD_OVERLAYS, workDir = DEFAULT_WORK, reviewDir = DEFAULT_REVIEW,
  modulePath = DEFAULT_MODULE } = {}) {
  const frozen = await loadFrozenBatches(workDir, cards, overlays, modulePath);
  const original = await verifyOriginalExpansionEvidence(reviewDir);
  const summaryBytes = await fs.readFile(path.join(reviewDir, 'expansion-after-repair/summary.json'));
  const summary = JSON.parse(summaryBytes);
  ensure(summary.originalExpansionSummarySha256 === original.summarySha256
    && summary.triggerSampleManifestSha256 === original.summary.sampleManifestSha256
    && same(summary.triggerReportDigests, original.reportDigests)
    && summary.finalReceipt === frozen.final.receipt
    && summary.englishOverlayHash === frozen.final.overlayHash
    && summary.englishModuleHash === frozen.final.moduleHash
    && Array.isArray(summary.packets) && summary.expansionBatchCount === summary.packets.length,
  'Expansion review summary differs from original triggers or current English overlay');
  const reportDir = path.join(reviewDir, 'expansion-reports');
  const actual = (await fs.readdir(reportDir)).filter(name => name.endsWith('.json')).sort();
  ensure(same(actual, summary.packets.map(packet => packet.file).sort()),
    'Expansion report file set differs from current packet manifest');
  const counts = Object.fromEntries(STATUSES.map(status => [status, 0]));
  const reasonSet = new Set();
  const reportDigests = [];
  const nonApprovedRows = [];
  const approvedRows = [];
  let total = 0;
  for (const info of summary.packets) {
    const packetBytes = await fs.readFile(path.join(reviewDir, 'expansion-after-repair', info.file));
    ensure(sha(packetBytes) === info.sha256, `${info.file}: expansion packet bytes changed`);
    const packet = JSON.parse(packetBytes);
    const batch = frozen.batches.find(row => row.id === packet.batchId);
    ensure(batch && packet.count === info.count && packet.count > 0 && packet.count <= 64
      && packet.cards?.length === packet.count && packet.authorBatchReceipt === batch.receipt
      && packet.finalReceipt === frozen.final.receipt
      && same(packet.cards.map(row => row.id), batch.ids),
    `${info.file}: expansion packet differs from current official author batch`);
    for (const row of packet.cards) {
      const overlay = overlays.find(value => value.id === row.id);
      ensure(overlay && row.sourceHash === overlay.sourceHash
        && row.englishHash === sha(JSON.stringify(overlay))
        && row.authorBatch === batch.id && row.authorBatchReceipt === batch.receipt,
      `${row.id}: expansion packet differs from current English overlay`);
    }
    const reportBytes = await fs.readFile(path.join(reportDir, info.file));
    const report = JSON.parse(reportBytes);
    const result = verifyExpansionReport(report, packet, info, reasonSet);
    for (const status of STATUSES) counts[status] += result[status];
    for (const row of report.rows) {
      const evidence = { ...row, authorBatch: packet.batchId,
        authorBatchReceipt: packet.authorBatchReceipt, packetId: packet.batchId,
        packetSha256: info.sha256, reviewer: report.reviewer };
      if (row.status === 'approved') approvedRows.push(evidence);
      else nonApprovedRows.push(evidence);
    }
    total += packet.count;
    reportDigests.push({ file: info.file, reviewer: report.reviewer, sha256: sha(reportBytes) });
  }
  ensure(total === summary.expansionCardCount, 'Expansion reports do not cover exact current packet count');
  return { manifestSha256: sha(summaryBytes), summary, reportDigests,
    approvedRows, nonApprovedRows, counts };
}

export async function verifyEnglishUsageRereviewReports({ cards = USAGE_CARDS,
  overlays = EN_USAGE_CARD_OVERLAYS, workDir = DEFAULT_WORK,
  reviewDir = DEFAULT_REVIEW,
  expansionRepairDir = path.join(ROOT, 'work/i18n-english-usage-cards-expansion-repair'),
  finalRepairDir = path.join(ROOT, 'work/i18n-english-usage-cards-final-repair'),
  stage = 'rereview',
  modulePath = DEFAULT_MODULE } = {}) {
  const frozen = await loadFrozenBatches(workDir, cards, overlays, modulePath);
  ensure(['rereview', 'final'].includes(stage), `Unsupported focused review stage: ${stage}`);
  const sourceRepairDir = stage === 'final' ? finalRepairDir : expansionRepairDir;
  const rereviewDir = path.join(sourceRepairDir, stage === 'final' ? 'final-rereview' : 'rereview');
  const manifestBytes = await fs.readFile(path.join(rereviewDir, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  const merged = JSON.parse(await fs.readFile(path.join(sourceRepairDir, 'merge-receipt.json')));
  const { receipt, ...payload } = merged;
  ensure(receipt === sha(JSON.stringify(payload))
    && merged.repairStage === (stage === 'final' ? 'rereview' : 'expansion')
    && manifest.schemaVersion === 1
    && manifest.workflow === (stage === 'final'
      ? 'english-usage-card-final-rereview' : 'english-usage-card-expansion-rereview')
    && manifest.mergeReceipt === receipt && manifest.finalReceipt === frozen.final.receipt
    && manifest.finalOverlayHash === frozen.final.overlayHash
    && manifest.finalModuleHash === frozen.final.moduleHash
    && merged.finalReceipt === frozen.final.receipt
    && merged.finalOverlayHash === frozen.final.overlayHash
    && merged.finalModuleHash === frozen.final.moduleHash,
  'Focused rereview manifest or expansion repair receipt differs from current English overlay');
  const expansionSummaryBytes = await fs.readFile(stage === 'final'
    ? path.join(expansionRepairDir, 'rereview/manifest.json')
    : path.join(reviewDir, 'expansion-after-repair/summary.json'));
  ensure(manifest.expansionSummarySha256 === sha(expansionSummaryBytes),
    'Focused rereview trigger summary changed');
  for (const digest of manifest.expansionReportDigests) {
    const bytes = await fs.readFile(stage === 'final'
      ? path.join(expansionRepairDir, 'rereview/reports', digest.file)
      : path.join(reviewDir, 'expansion-reports', digest.file));
    ensure(sha(bytes) === digest.sha256, `${digest.file}: expansion report changed`);
  }
  ensure(same(manifest.expansionReportDigests, merged.triggerReportDigests),
    'Focused rereview report digests differ from expansion repair receipt');
  const carriedBytes = await fs.readFile(path.join(rereviewDir, 'carried-approved.json'));
  const carried = JSON.parse(carriedBytes);
  ensure(sha(carriedBytes) === manifest.carriedApprovedSha256
    && carried.length === manifest.carriedApprovedCount,
  'Carried expansion approvals changed');
  const overlayById = new Map(overlays.map(row => [row.id, row]));
  const approvedRows = carried.map(row => {
    const current = overlayById.get(row.id);
    ensure(current && current.sourceHash === row.sourceHash
      && sha(JSON.stringify(current)) === row.englishHash,
    `${row.id}: carried expansion approval is stale`);
    return { ...row, authorBatch: row.batchId };
  });
  const reportDir = path.join(rereviewDir, 'reports');
  const files = (await fs.readdir(reportDir)).filter(name => name.endsWith('.json')).sort();
  ensure(Array.isArray(manifest.packets) && manifest.packetCount === manifest.packets.length
    && same(files, manifest.packets.map(packet => packet.file).sort()),
  'Focused rereview report file set differs from manifest');
  const counts = Object.fromEntries(STATUSES.map(status => [status, 0]));
  const reasons = new Set();
  const nonApprovedRows = [];
  const reportDigests = [];
  const ids = [];
  for (const info of manifest.packets) {
    const packetBytes = await fs.readFile(path.join(rereviewDir, info.file));
    ensure(sha(packetBytes) === info.sha256, `${info.file}: focused packet changed`);
    const packet = JSON.parse(packetBytes);
    ensure(packet.schemaVersion === 1 && packet.count === info.count
      && packet.count > 0 && packet.count <= 16 && packet.cards?.length === packet.count
      && info.file === `${packet.packetId}.json`
      && packet.mergeReceipt === receipt && packet.finalReceipt === frozen.final.receipt,
    `${info.file}: focused packet metadata differs`);
    for (const row of packet.cards) {
      const overlay = overlayById.get(row.id);
      ensure(overlay && overlay.sourceHash === row.sourceHash
        && sha(JSON.stringify(overlay)) === row.englishHash,
      `${row.id}: focused packet is stale`);
      ids.push(row.id);
    }
    const reportBytes = await fs.readFile(path.join(reportDir, info.file));
    const report = JSON.parse(reportBytes);
    const result = verifySampleReport(report, packet, info, reasons);
    for (const status of STATUSES) counts[status] += result[status];
    for (const [index, row] of report.rows.entries()) {
      const context = packet.cards[index];
      const evidence = { ...row, authorBatch: context.authorBatch,
        authorBatchReceipt: context.authorBatchReceipt, packetId: packet.packetId,
        packetSha256: info.sha256, reviewer: report.reviewer };
      if (row.status === 'approved') approvedRows.push(evidence);
      else nonApprovedRows.push(evidence);
    }
    reportDigests.push({ file: info.file, reviewer: report.reviewer, sha256: sha(reportBytes) });
  }
  ensure(same(ids, manifest.ids) && ids.length === manifest.cardCount
    && new Set(ids).size === ids.length,
  'Focused rereview reports do not cover exact changed IDs');
  ensure(approvedRows.length + nonApprovedRows.length === manifest.carriedApprovedCount + manifest.cardCount,
    'Focused rereview approval and repair counts differ');
  return { manifestSha256: sha(manifestBytes), manifest, reportDigests,
    approvedRows, nonApprovedRows, counts, carriedApprovedCount: carried.length };
}

export async function verifyEnglishUsageFinalReports(options = {}) {
  return verifyEnglishUsageRereviewReports({ ...options, stage: 'final' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const postRepair = argv[0] === 'after-repair';
  const args = postRepair ? argv.slice(1) : argv;
  const option = (name, fallback) => {
    const index = args.indexOf(name);
    return index < 0 ? fallback : args[index + 1];
  };
  const allowed = new Set(['--work-dir', '--review-dir', '--repair-dir', '--output-dir']);
  for (let index = 0; index < args.length; index += 2) {
    if (!allowed.has(args[index]) || !args[index + 1]) throw new Error('Usage: node scripts/verify-english-usage-review.mjs [--work-dir PATH] [--review-dir PATH] [--output-dir PATH]');
  }
  const reviewDir = path.resolve(option('--review-dir', DEFAULT_REVIEW));
  const options = { workDir: path.resolve(option('--work-dir', DEFAULT_WORK)), reviewDir,
    outputDir: path.resolve(option('--output-dir', path.join(reviewDir,
      postRepair ? 'expansion-after-repair' : 'expansion'))) };
  const summary = postRepair
    ? await writeEnglishUsagePostRepairExpansion({ ...options,
      repairDir: path.resolve(option('--repair-dir', DEFAULT_REPAIR)) })
    : await writeEnglishUsageReviewExpansion(options);
  console.log(JSON.stringify({ ...(postRepair ? {} : { sampleCount: summary.sampleCount, statuses: summary.statuses }),
    expansionBatchCount: summary.expansionBatchCount, expansionCardCount: summary.expansionCardCount }));
}
