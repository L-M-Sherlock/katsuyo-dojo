/** Freeze a compact English usage-card release proof; verify it without ignored work files. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import { USAGE_CARDS } from '../app/lib/usage-cards.mjs';
import { EN_USAGE_CARD_OVERLAYS } from '../app/lib/i18n/content/en/usage-cards.mjs';
import { loadFrozenBatches } from './sample-english-usage-review.mjs';
import { verifyOriginalExpansionEvidence, verifySampleReport } from './verify-english-usage-review.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROOF = path.join(ROOT, 'docs/english-usage-release-proof.v1.json.gz');
const WORK = path.join(ROOT, 'work/i18n-english-usage-cards-gpt');
const REVIEW = path.join(ROOT, 'work/i18n-english-usage-cards-review');
const REPAIRS = ['work/i18n-english-usage-cards-repair',
  'work/i18n-english-usage-cards-expansion-repair',
  'work/i18n-english-usage-cards-final-repair',
  'work/i18n-english-usage-cards-last-repair'].map(value => path.join(ROOT, value));
const MODULE = path.join(ROOT, 'app/lib/i18n/content/en/usage-cards.mjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const jsonHash = value => hash(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ensure = (ok, message) => { if (!ok) throw new Error(message); };
const cardRows = (cards, overlays) => {
  ensure(cards.length === overlays.length, 'English coverage count differs from canonical cards');
  const byId = new Map(overlays.map(row => [row.id, row]));
  ensure(byId.size === overlays.length, 'English overlay has duplicate IDs');
  return [...cards].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(card => {
    const row = byId.get(card.id);
    const sourceHash = jsonHash(card);
    ensure(row?.sourceHash === sourceHash, `${card.id}: missing or stale English overlay`);
    return { id: card.id, sourceHash, englishHash: jsonHash(row) };
  });
};

export function verifyEnglishUsageReleaseProof({ cards = USAGE_CARDS, overlays = EN_USAGE_CARD_OVERLAYS,
  proofPath = PROOF, modulePath = MODULE } = {}) {
  const proof = JSON.parse(zlib.gunzipSync(fs.readFileSync(proofPath)));
  ensure(proof.schemaVersion === 1 && proof.translatorId === 'gpt-6-luna-max'
    && proof.unresolvedCount === 0 && proof.canonicalCount === cards.length
    && proof.englishCount === overlays.length && proof.sample.count > 0
    && proof.expansion.count > 0 && proof.expansion.approvedCount === proof.expansion.count,
  'English release proof metadata is incomplete or unresolved');
  const rows = cardRows(cards, overlays);
  ensure(same(rows, proof.cards)
    && proof.frozenRuntimeHash === jsonHash(rows.map(row => ({ id: row.id, sourceHash: row.sourceHash })))
    && proof.finalOverlayHash === jsonHash(overlays)
    && proof.finalModuleHash === hash(fs.readFileSync(modulePath)),
  'English release proof differs from current canonical cards or English overlay');
  return proof;
}

async function readReceipt(dir) {
  const bytes = await fsp.readFile(path.join(dir, 'merge-receipt.json'));
  const receipt = JSON.parse(bytes);
  const { receipt: digest, ...payload } = receipt;
  ensure(digest === jsonHash(payload), `${dir}: repair receipt digest differs`);
  return { receipt, sha256: hash(bytes) };
}

async function reportDigests(dir, infos) {
  const rows = [];
  for (const info of infos) {
    const bytes = await fsp.readFile(path.join(dir, info.file));
    const report = JSON.parse(bytes);
    rows.push({ file: info.file, reviewer: report.reviewer, sha256: hash(bytes) });
  }
  return rows;
}

export async function freezeEnglishUsageReleaseProof({ cards = USAGE_CARDS,
  overlays = EN_USAGE_CARD_OVERLAYS, proofPath = PROOF,
  workDir = WORK, reviewDir = REVIEW, repairDirs = REPAIRS,
  modulePath = MODULE } = {}) {
  const rows = cardRows(cards, overlays);
  const current = await loadFrozenBatches(workDir, cards, overlays, modulePath);
  const original = await verifyOriginalExpansionEvidence(reviewDir);
  const receipts = [];
  for (const dir of repairDirs) receipts.push(await readReceipt(dir));
  const postSummaryBytes = await fsp.readFile(path.join(reviewDir, 'expansion-after-repair/summary.json'));
  const postSummary = JSON.parse(postSummaryBytes);
  const expansionReportRows = await reportDigests(path.join(reviewDir, 'expansion-reports'), postSummary.packets);
  const focusedManifestBytes = await fsp.readFile(path.join(repairDirs[1], 'rereview/manifest.json'));
  const focusedManifest = JSON.parse(focusedManifestBytes);
  const focusedReportRows = await reportDigests(path.join(repairDirs[1], 'rereview/reports'), focusedManifest.packets);
  const finalManifestBytes = await fsp.readFile(path.join(repairDirs[2], 'final-rereview/manifest.json'));
  const finalManifest = JSON.parse(finalManifestBytes);
  const finalReportRows = await reportDigests(path.join(repairDirs[2], 'final-rereview/reports'), finalManifest.packets);
  const lastManifestBytes = await fsp.readFile(path.join(repairDirs[3], 'last-rereview/manifest.json'));
  const lastManifest = JSON.parse(lastManifestBytes);
  const lastReportsDir = path.join(repairDirs[3], 'last-rereview/reports');
  const lastReportRows = await reportDigests(lastReportsDir, lastManifest.packets);
  const [sampleRepair, expansionRepair, focusedRepair, lastRepair] = receipts.map(row => row.receipt);
  ensure((sampleRepair.repairStage ?? 'sample') === 'sample'
    && sampleRepair.triggerSampleManifestSha256 === original.summary.sampleManifestSha256
    && same(sampleRepair.triggerReportDigests, original.reportDigests)
    && sampleRepair.originalFinalReceipt === original.summary.finalReceipt
    && sampleRepair.finalReceipt === postSummary.finalReceipt
    && expansionRepair.repairStage === 'expansion'
    && expansionRepair.triggerSampleManifestSha256 === hash(postSummaryBytes)
    && same(expansionRepair.triggerReportDigests, expansionReportRows)
    && expansionRepair.originalFinalReceipt === postSummary.finalReceipt
    && expansionRepair.finalReceipt === focusedManifest.finalReceipt
    && focusedRepair.repairStage === 'rereview'
    && focusedRepair.triggerSampleManifestSha256 === hash(focusedManifestBytes)
    && same(focusedRepair.triggerReportDigests, focusedReportRows)
    && focusedRepair.originalFinalReceipt === focusedManifest.finalReceipt
    && focusedRepair.finalReceipt === finalManifest.finalReceipt
    && lastRepair.repairStage === 'final'
    && lastRepair.triggerSampleManifestSha256 === hash(finalManifestBytes)
    && same(lastRepair.triggerReportDigests, finalReportRows)
    && lastRepair.originalFinalReceipt === finalManifest.finalReceipt
    && lastRepair.finalReceipt === current.final.receipt,
  'English repair receipt chain differs from original reports or current final receipt');
  const carriedBytes = await fsp.readFile(path.join(repairDirs[3], 'last-rereview/carried-approved.json'));
  const carried = JSON.parse(carriedBytes);
  ensure(hash(carriedBytes) === lastManifest.carriedApprovedSha256
    && carried.length === lastManifest.carriedApprovedCount,
  'Final carried approval evidence differs from manifest');
  const byId = new Map(rows.map(row => [row.id, row]));
  const approved = new Map();
  for (const row of carried) {
    const currentRow = byId.get(row.id);
    ensure(currentRow && currentRow.sourceHash === row.sourceHash
      && currentRow.englishHash === row.englishHash && !approved.has(row.id),
    `${row.id}: carried expansion approval is stale or repeated`);
    approved.set(row.id, row.englishHash);
  }
  const usedReasons = new Set();
  let lastApproved = 0;
  const lastFiles = (await fsp.readdir(lastReportsDir)).filter(file => file.endsWith('.json')).sort();
  ensure(same(lastFiles, lastManifest.packets.map(packet => packet.file).sort()),
    'Last rereview report file set differs from manifest');
  for (const info of lastManifest.packets) {
    const packetBytes = await fsp.readFile(path.join(repairDirs[3], 'last-rereview', info.file));
    ensure(hash(packetBytes) === info.sha256, `${info.file}: last rereview packet changed`);
    const packet = JSON.parse(packetBytes);
    const report = JSON.parse(await fsp.readFile(path.join(lastReportsDir, info.file)));
    const counts = verifySampleReport(report, packet, info, usedReasons);
    ensure(counts.approved === packet.count && counts.revise === 0
      && counts.uncertain === 0 && counts.source_issue === 0,
    `${info.file}: unresolved last rereview card`);
    for (const row of report.rows) {
      const currentRow = byId.get(row.id);
      ensure(currentRow && currentRow.sourceHash === row.sourceHash
        && currentRow.englishHash === row.englishHash && !approved.has(row.id),
      `${row.id}: final approval is stale or repeated`);
      approved.set(row.id, row.englishHash);
      lastApproved += 1;
    }
  }
  const expandedIds = new Set();
  const expandedBatches = new Set();
  for (const info of original.summary.packets) {
    const packet = JSON.parse(await fsp.readFile(path.join(reviewDir, 'expansion', info.file)));
    expandedBatches.add(packet.batchId);
    for (const row of packet.cards) expandedIds.add(row.id);
  }
  ensure(approved.size === expandedIds.size && expandedIds.size === original.summary.expansionCardCount
    && [...approved.keys()].every(id => expandedIds.has(id))
    && carried.length === lastManifest.carriedApprovedCount
    && lastApproved === lastManifest.cardCount,
  'Final approvals do not exactly cover expanded cards');
  let outsideSampleApproved = 0;
  const sample = JSON.parse(await fsp.readFile(path.join(reviewDir, 'manifest.json')));
  for (const info of sample.packets) {
    const packet = JSON.parse(await fsp.readFile(path.join(reviewDir, info.file)));
    const report = JSON.parse(await fsp.readFile(path.join(reviewDir, 'reports', info.file)));
    for (const [index, row] of report.rows.entries()) {
      if (expandedBatches.has(packet.cards[index].authorBatch)) continue;
      const currentRow = byId.get(row.id);
      ensure(row.status === 'approved' && currentRow?.sourceHash === row.sourceHash
        && currentRow.englishHash === row.englishHash,
      `${row.id}: sampled approval outside expanded batches is stale`);
      outsideSampleApproved += 1;
    }
  }
  const proof = { schemaVersion: 1, translatorId: 'gpt-6-luna-max',
    canonicalCount: cards.length, englishCount: overlays.length,
    frozenRuntimeHash: current.manifest.runtimeHash,
    finalReceipt: current.final.receipt, finalOverlayHash: current.final.overlayHash,
    finalModuleHash: current.final.moduleHash,
    sample: { count: sample.sampleCount, outsideExpandedApproved: outsideSampleApproved,
      manifestSha256: original.summary.sampleManifestSha256,
      reportDigests: original.reportDigests },
    expansion: { count: expandedIds.size, approvedCount: approved.size,
      carriedApproved: carried.length, finalApproved: lastApproved,
      originalSummarySha256: original.summarySha256,
      reportDigests: expansionReportRows },
    repairReceipts: receipts.map((row, index) => ({ stage: ['sample', 'expansion', 'rereview', 'final'][index],
      receipt: row.receipt.receipt, sha256: row.sha256 })),
    focusedReportDigests: focusedReportRows,
    finalReportDigests: finalReportRows,
    lastReportDigests: lastReportRows,
    unresolvedCount: 0, cards: rows };
  await fsp.writeFile(proofPath, zlib.gzipSync(`${JSON.stringify(proof)}\n`, { level: 9, mtime: 0 }));
  verifyEnglishUsageReleaseProof({ cards, overlays, proofPath, modulePath });
  return proof;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'verify';
  if (mode === 'freeze') {
    const proof = await freezeEnglishUsageReleaseProof();
    console.log(JSON.stringify({ cards: proof.cards.length, sample: proof.sample.count,
      expansion: proof.expansion.count, unresolved: proof.unresolvedCount, proofPath: PROOF }));
  } else if (mode === 'verify') {
    const proof = verifyEnglishUsageReleaseProof();
    console.log(JSON.stringify({ cards: proof.cards.length, expansion: proof.expansion.count,
      unresolved: proof.unresolvedCount, proofPath: PROOF }));
  } else throw new Error('Usage: node scripts/verify-english-usage-release.mjs freeze|verify');
}
