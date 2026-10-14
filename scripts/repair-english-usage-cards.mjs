/** Prepare and merge English repairs triggered by verified sample reports. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { USAGE_CARDS } from '../app/lib/usage-cards.mjs';
import { EN_USAGE_CARD_OVERLAYS } from '../app/lib/i18n/content/en/usage-cards.mjs';
import { mergeEnglishUsageAgentOutputs, validateEnglishUsageAgentOverlay } from './generate-english-usage-overlay.mjs';
import { englishUsageReviewRow, loadFrozenBatches } from './sample-english-usage-review.mjs';
import { verifyEnglishUsageExpansionReports, verifyEnglishUsageFinalReports, verifyEnglishUsageRereviewReports, verifyEnglishUsageReview } from './verify-english-usage-review.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_WORK = path.join(ROOT, 'work/i18n-english-usage-cards-gpt');
const DEFAULT_REVIEW = path.join(ROOT, 'work/i18n-english-usage-cards-review');
const DEFAULT_REPAIR = path.join(ROOT, 'work/i18n-english-usage-cards-repair');
const DEFAULT_EXPANSION_REPAIR = path.join(ROOT, 'work/i18n-english-usage-cards-expansion-repair');
const DEFAULT_FINAL_REPAIR = path.join(ROOT, 'work/i18n-english-usage-cards-final-repair');
const DEFAULT_LAST_REPAIR = path.join(ROOT, 'work/i18n-english-usage-cards-last-repair');
const DEFAULT_MODULE = path.join(ROOT, 'app/lib/i18n/content/en/usage-cards.mjs');
const PROVIDER = 'gpt-6-luna-max';
const LIMIT = 16;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const jsonHash = value => sha(JSON.stringify(value));
const jsonBytes = value => `${JSON.stringify(value, null, 2)}\n`;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const ensure = (condition, message) => { if (!condition) throw new Error(message); };

function assignmentFor(rows, index, source) {
  const batchId = `repair-${String(index).padStart(4, '0')}`;
  return { schemaVersion: 1, workflow: 'english-usage-card-repair', translatorId: PROVIDER,
    batchId, count: rows.length, source,
    cards: rows.map(({ context, review, requiredNote }) => ({ ...context, requiredNote, review })) };
}

export function repairAssignments({ nonApprovedRows, cards, overlays, frozen, sample }) {
  const cardById = new Map(cards.map(card => [card.id, card]));
  const overlayById = new Map(overlays.map(row => [row.id, row]));
  const batchById = new Map(frozen.batches.flatMap(batch => batch.ids.map(id => [id, batch])));
  const rows = [...nonApprovedRows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(review => {
    const card = cardById.get(review.id);
    const localized = overlayById.get(review.id);
    const batch = batchById.get(review.id);
    ensure(card && localized && batch && review.sourceHash === localized.sourceHash
      && review.englishHash === jsonHash(localized), `${review.id}: stale repair trigger`);
    return { context: englishUsageReviewRow(card, localized, batch, []),
      requiredNote: Object.hasOwn(card, 'note'),
      review: { status: review.status, reason: review.reason, checks: review.checks,
        reviewer: review.reviewer, packetId: review.packetId, packetSha256: review.packetSha256 } };
  });
  const source = { sampleManifestSha256: sample.manifestSha256, finalReceipt: frozen.final.receipt,
    englishOverlayHash: frozen.final.overlayHash, englishModuleHash: frozen.final.moduleHash };
  const assignments = [];
  for (let start = 0; start < rows.length; start += LIMIT) {
    assignments.push(assignmentFor(rows.slice(start, start + LIMIT), assignments.length, source));
  }
  return assignments;
}

async function currentEvidence(options) {
  const cards = options.cards ?? USAGE_CARDS;
  const overlays = options.overlays ?? EN_USAGE_CARD_OVERLAYS;
  const workDir = options.workDir ?? DEFAULT_WORK;
  const reviewDir = options.reviewDir ?? DEFAULT_REVIEW;
  const modulePath = options.modulePath ?? DEFAULT_MODULE;
  const stage = options.stage ?? 'sample';
  ensure(['sample', 'expansion', 'rereview', 'final'].includes(stage), `Unsupported repair stage: ${stage}`);
  const sample = stage === 'final'
    ? await verifyEnglishUsageFinalReports({ cards, overlays, workDir, reviewDir, modulePath,
      expansionRepairDir: options.expansionRepairDir, finalRepairDir: options.finalRepairDir })
    : stage === 'rereview'
    ? await verifyEnglishUsageRereviewReports({ cards, overlays, workDir, reviewDir, modulePath,
      expansionRepairDir: options.expansionRepairDir })
    : stage === 'expansion'
      ? await verifyEnglishUsageExpansionReports({ cards, overlays, workDir, reviewDir, modulePath })
      : await verifyEnglishUsageReview({ cards, overlays, workDir, reviewDir, modulePath });
  const frozen = await loadFrozenBatches(workDir, cards, overlays, modulePath);
  return { cards, overlays, workDir, reviewDir, modulePath, sample, frozen, stage };
}

export async function prepareEnglishUsageRepairs(options = {}) {
  const evidence = await currentEvidence(options);
  const repairDir = options.repairDir ?? (evidence.stage === 'final' ? DEFAULT_LAST_REPAIR
    : evidence.stage === 'rereview' ? DEFAULT_FINAL_REPAIR
    : evidence.stage === 'expansion' ? DEFAULT_EXPANSION_REPAIR : DEFAULT_REPAIR);
  const assignments = repairAssignments({ nonApprovedRows: evidence.sample.nonApprovedRows,
    cards: evidence.cards, overlays: evidence.overlays, frozen: evidence.frozen, sample: evidence.sample });
  const files = assignments.map(assignment => ({ file: `assignments/${assignment.batchId}.json`,
    bytes: jsonBytes(assignment) }));
  const manifest = { schemaVersion: 1, workflow: 'english-usage-card-repair', translatorId: PROVIDER,
    source: { stage: evidence.stage, sampleManifestSha256: evidence.sample.manifestSha256,
      reportDigests: evidence.sample.reportDigests,
      finalReceipt: evidence.frozen.final.receipt,
      englishOverlayHash: evidence.frozen.final.overlayHash,
      englishModuleHash: evidence.frozen.final.moduleHash },
    cardCount: evidence.sample.nonApprovedRows.length, batchSize: LIMIT, batchCount: assignments.length,
    cards: assignments.flatMap(assignment => assignment.cards.map(row => ({ id: row.id,
      sourceHash: row.sourceHash, originalEnglishHash: row.englishHash }))),
    assignments: files.map(({ file, bytes }, index) => ({ batchId: assignments[index].batchId,
      file, count: assignments[index].count, assignmentHash: sha(bytes) })),
  };
  await fs.mkdir(path.join(repairDir, 'assignments'), { recursive: true });
  let existing;
  try { existing = await fs.readFile(path.join(repairDir, 'manifest.json'), 'utf8'); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  if (existing && existing !== jsonBytes(manifest)) {
    const outputs = await fs.readdir(path.join(repairDir, 'outputs')).catch(error => {
      if (error?.code === 'ENOENT') return [];
      throw error;
    });
    ensure(outputs.length === 0, 'Repair evidence changed while author outputs exist; preserve the old task directory');
  }
  for (const row of files) await fs.writeFile(path.join(repairDir, row.file), row.bytes);
  await fs.writeFile(path.join(repairDir, 'manifest.json'), jsonBytes(manifest));
  return manifest;
}

export function validateRepairOutput(document, assignment, assignmentHash, canonicalById) {
  ensure(document && typeof document === 'object' && !Array.isArray(document)
    && same(Object.keys(document).sort(), ['schemaVersion', 'translatorId', 'batchId', 'assignmentHash', 'cards'].sort())
    && document.schemaVersion === 1 && document.translatorId === PROVIDER
    && document.batchId === assignment.batchId && document.assignmentHash === assignmentHash
    && Array.isArray(document.cards) && document.cards.length === assignment.count,
  `${assignment.batchId}: output header or count differs from assignment`);
  return document.cards.map((row, index) => {
    const task = assignment.cards[index];
    ensure(row && typeof row === 'object' && !Array.isArray(row)
      && same(Object.keys(row).sort(), ['id', 'sourceHash', 'originalEnglishHash', 'scene', 'translation',
        ...(task.requiredNote ? ['note'] : [])].sort())
      && row.id === task.id && row.sourceHash === task.sourceHash
      && row.originalEnglishHash === task.englishHash,
    `${assignment.batchId}: output row ${index} has wrong identity, order, hash, or note presence`);
    const overlay = { id: row.id, sourceHash: row.sourceHash, scene: row.scene,
      translation: row.translation, ...(task.requiredNote ? { note: row.note } : {}) };
    return validateEnglishUsageAgentOverlay(canonicalById.get(row.id), overlay);
  });
}

export async function mergeEnglishUsageRepairs(options = {}) {
  const evidence = await currentEvidence(options);
  const repairDir = options.repairDir ?? (evidence.stage === 'final' ? DEFAULT_LAST_REPAIR
    : evidence.stage === 'rereview' ? DEFAULT_FINAL_REPAIR
    : evidence.stage === 'expansion' ? DEFAULT_EXPANSION_REPAIR : DEFAULT_REPAIR);
  const manifestBytes = await fs.readFile(path.join(repairDir, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  ensure(manifest.schemaVersion === 1 && manifest.workflow === 'english-usage-card-repair'
    && manifest.translatorId === PROVIDER && manifest.batchSize === LIMIT
    && manifest.cardCount === evidence.sample.nonApprovedRows.length
    && (manifest.source.stage ?? 'sample') === evidence.stage
    && manifest.source.sampleManifestSha256 === evidence.sample.manifestSha256
    && same(manifest.source.reportDigests, evidence.sample.reportDigests)
    && manifest.source.finalReceipt === evidence.frozen.final.receipt
    && manifest.source.englishOverlayHash === evidence.frozen.final.overlayHash
    && manifest.source.englishModuleHash === evidence.frozen.final.moduleHash,
  'Repair manifest differs from current verified reports or English overlay');
  const expected = repairAssignments({ nonApprovedRows: evidence.sample.nonApprovedRows,
    cards: evidence.cards, overlays: evidence.overlays, frozen: evidence.frozen, sample: evidence.sample });
  ensure(manifest.batchCount === expected.length && manifest.assignments?.length === expected.length,
    'Repair assignment count differs from verified reports');
  const outputDir = path.join(repairDir, 'outputs');
  const outputFiles = (await fs.readdir(outputDir)).filter(name => name.endsWith('.json')).sort();
  ensure(same(outputFiles, expected.map(row => `${row.batchId}.json`).sort()),
    'Repair output file set differs from assignments');
  const canonicalById = new Map(evidence.cards.map(card => [card.id, card]));
  const replacements = new Map();
  const outputProof = [];
  for (const [index, assignment] of expected.entries()) {
    const entry = manifest.assignments[index];
    const file = `assignments/${assignment.batchId}.json`;
    const bytes = await fs.readFile(path.join(repairDir, file));
    ensure(entry.batchId === assignment.batchId && entry.file === file && entry.count === assignment.count
      && entry.assignmentHash === sha(bytes) && bytes.toString() === jsonBytes(assignment),
    `${assignment.batchId}: frozen repair assignment differs from verified reports`);
    const outputBytes = await fs.readFile(path.join(outputDir, `${assignment.batchId}.json`));
    const repaired = validateRepairOutput(JSON.parse(outputBytes), assignment, entry.assignmentHash, canonicalById);
    for (const row of repaired) {
      ensure(!replacements.has(row.id), `${row.id}: duplicate repair output`);
      if (evidence.stage !== 'sample') {
        const prior = evidence.overlays.find(value => value.id === row.id);
        ensure(jsonHash(row) !== jsonHash(prior), `${row.id}: expansion repair did not change English fields`);
      }
      replacements.set(row.id, row);
    }
    outputProof.push({ batchId: assignment.batchId, assignmentHash: entry.assignmentHash,
      outputSha256: sha(outputBytes), rows: repaired.map(row => ({ id: row.id,
        sourceHash: row.sourceHash, originalEnglishHash: assignment.cards.find(card => card.id === row.id).englishHash,
        repairedEnglishHash: jsonHash(row) })) });
  }
  ensure(replacements.size === manifest.cardCount && same(manifest.cards,
    expected.flatMap(assignment => assignment.cards.map(row => ({ id: row.id, sourceHash: row.sourceHash,
      originalEnglishHash: row.englishHash })))), 'Repair outputs do not exactly cover non-approved sample cards');
  const affected = evidence.frozen.batches.filter(batch => batch.ids.some(id => replacements.has(id)));
  const originals = new Map();
  const changed = [];
  for (const batch of affected) {
    const file = path.join(evidence.workDir, 'outputs', `${batch.id}.json`);
    const bytes = await fs.readFile(file);
    originals.set(file, bytes);
    const output = JSON.parse(bytes);
    output.cards = output.cards.map(row => replacements.get(row.id) ?? row);
    changed.push({ file, bytes: jsonBytes(output) });
  }
  const receiptDir = path.join(evidence.workDir, 'receipts');
  for (const name of await fs.readdir(receiptDir)) if (name.endsWith('.json')) {
    const file = path.join(receiptDir, name);
    originals.set(file, await fs.readFile(file));
  }
  originals.set(evidence.modulePath, await fs.readFile(evidence.modulePath));
  let merged;
  try {
    for (const row of changed) await fs.writeFile(row.file, row.bytes);
    merged = await mergeEnglishUsageAgentOutputs({ cards: evidence.cards,
      workDir: evidence.workDir, outputPath: evidence.modulePath });
  } catch (error) {
    for (const [file, bytes] of originals) await fs.writeFile(file, bytes);
    throw error;
  }
  const receiptPayload = { schemaVersion: 1, workflow: 'english-usage-card-repair',
    provider: PROVIDER, repairStage: evidence.stage, repairManifestSha256: sha(manifestBytes),
    triggerSampleManifestSha256: evidence.sample.manifestSha256,
    triggerReportDigests: evidence.sample.reportDigests,
    originalFinalReceipt: evidence.frozen.final.receipt,
    originalOverlayHash: evidence.frozen.final.overlayHash,
    repairedCount: replacements.size, affectedOfficialBatches: affected.map(batch => batch.id),
    outputReceipts: outputProof.map(proof => ({ batchId: proof.batchId,
      receipt: jsonHash({ schemaVersion: 1, provider: PROVIDER,
        repairManifestSha256: sha(manifestBytes), ...proof }) })),
    finalReceipt: merged.finalReceipt.receipt,
    finalOverlayHash: merged.finalReceipt.overlayHash, finalModuleHash: merged.finalReceipt.moduleHash };
  const receipt = { ...receiptPayload, receipt: jsonHash(receiptPayload) };
  const repairReceiptDir = path.join(repairDir, 'receipts');
  await fs.mkdir(repairReceiptDir, { recursive: true });
  for (const proof of outputProof) {
    const payload = { schemaVersion: 1, provider: PROVIDER,
      repairManifestSha256: sha(manifestBytes), ...proof };
    await fs.writeFile(path.join(repairReceiptDir, `${proof.batchId}.json`),
      jsonBytes({ ...payload, receipt: jsonHash(payload) }));
  }
  await fs.writeFile(path.join(repairDir, 'merge-receipt.json'), jsonBytes(receipt));
  if (evidence.stage !== 'sample') await writeExpansionRepairRereview({ evidence, repairDir,
    repaired: merged.overlays, replacements, mergeReceipt: receipt });
  return receipt;
}

async function writeExpansionRepairRereview({ evidence, repairDir, repaired, replacements, mergeReceipt }) {
  const outputDir = path.join(repairDir, evidence.stage === 'final' ? 'last-rereview'
    : evidence.stage === 'rereview' ? 'final-rereview' : 'rereview');
  const newBatchReceipts = new Map(mergeReceipt.affectedOfficialBatches.map(id => [id,
    mergedBatchReceipt(evidence.workDir, id)]));
  const receipts = new Map();
  for (const [id, promise] of newBatchReceipts) receipts.set(id, await promise);
  const currentBatches = evidence.frozen.batches.map(batch => ({ ...batch,
    receipt: receipts.get(batch.id) ?? batch.receipt }));
  const { packets, carriedApproved, ids } = buildExpansionRepairRereview({
    cards: evidence.cards, overlays: repaired, batches: currentBatches,
    replacements, review: evidence.sample, mergeReceipt, repairStage: evidence.stage });
  const files = packets.map(packet => ({ file: `${packet.packetId}.json`, bytes: jsonBytes(packet) }));
  const manifest = { schemaVersion: 1, workflow: evidence.stage === 'final'
    ? 'english-usage-card-last-rereview' : evidence.stage === 'rereview'
      ? 'english-usage-card-final-rereview' : 'english-usage-card-expansion-rereview',
    repairStage: evidence.stage,
    expansionSummarySha256: evidence.sample.manifestSha256,
    expansionReportDigests: evidence.sample.reportDigests,
    mergeReceipt: mergeReceipt.receipt, finalReceipt: mergeReceipt.finalReceipt,
    finalOverlayHash: mergeReceipt.finalOverlayHash, finalModuleHash: mergeReceipt.finalModuleHash,
    cardCount: ids.length, packetCount: packets.length, ids,
    carriedApprovedCount: carriedApproved.length,
    carriedApprovedSha256: sha(jsonBytes(carriedApproved)),
    packets: files.map((file, index) => ({ file: file.file, count: packets[index].count,
      sha256: sha(file.bytes) })) };
  await fs.mkdir(outputDir, { recursive: true });
  for (const file of files) await fs.writeFile(path.join(outputDir, file.file), file.bytes);
  await fs.writeFile(path.join(outputDir, 'carried-approved.json'), jsonBytes(carriedApproved));
  await fs.writeFile(path.join(outputDir, 'manifest.json'), jsonBytes(manifest));
}

export function buildExpansionRepairRereview({ cards, overlays, batches, replacements, review, mergeReceipt,
  repairStage = 'expansion' }) {
  const batchById = new Map(batches.flatMap(batch => batch.ids.map(id => [id, batch])));
  const cardById = new Map(cards.map(card => [card.id, card]));
  const overlayById = new Map(overlays.map(row => [row.id, row]));
  const reviewById = new Map(review.nonApprovedRows.map(row => [row.id, row]));
  const carriedApproved = review.approvedRows.map(row => {
    const current = overlayById.get(row.id);
    ensure(current && current.sourceHash === row.sourceHash && jsonHash(current) === row.englishHash,
      `${row.id}: approved expansion row changed during repair`);
    return { id: row.id, sourceHash: row.sourceHash, englishHash: row.englishHash,
      batchId: row.authorBatch, reviewer: row.reviewer, packetSha256: row.packetSha256 };
  });
  const ids = [...replacements.keys()].sort();
  const rows = ids.map(id => {
    const context = englishUsageReviewRow(cardById.get(id), overlayById.get(id), batchById.get(id), []);
    const trigger = reviewById.get(id);
    const reviewField = repairStage === 'expansion' ? 'expansionReview' : 'focusedReview';
    return { ...context, [reviewField]: { status: trigger.status, reason: trigger.reason,
      checks: trigger.checks, reviewer: trigger.reviewer, batchId: trigger.packetId,
      packetSha256: trigger.packetSha256, originalEnglishHash: trigger.englishHash } };
  });
  const packets = [];
  for (let start = 0; start < rows.length; start += LIMIT) {
    const packetId = `rereview-${String(packets.length).padStart(4, '0')}`;
    packets.push({ schemaVersion: 1, packetId, count: Math.min(LIMIT, rows.length - start),
      mergeReceipt: mergeReceipt.receipt, finalReceipt: mergeReceipt.finalReceipt,
      cards: rows.slice(start, start + LIMIT) });
  }
  return { packets, carriedApproved, ids };
}

async function mergedBatchReceipt(workDir, batchId) {
  const value = JSON.parse(await fs.readFile(path.join(workDir, 'receipts', `${batchId}.json`)));
  return value.receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, ...args] = process.argv.slice(2);
  const option = (name, fallback) => {
    const index = args.indexOf(name);
    return index < 0 ? fallback : args[index + 1];
  };
  const allowed = new Set(['--work-dir', '--review-dir', '--repair-dir', '--expansion-repair-dir',
    '--final-repair-dir', '--stage']);
  for (let index = 0; index < args.length; index += 2) {
    if (!allowed.has(args[index]) || !args[index + 1]) throw new Error('Usage: node scripts/repair-english-usage-cards.mjs prepare|merge [--work-dir PATH] [--review-dir PATH] [--repair-dir PATH]');
  }
  const stage = option('--stage', 'sample');
  const options = { stage, workDir: path.resolve(option('--work-dir', DEFAULT_WORK)),
    reviewDir: path.resolve(option('--review-dir', DEFAULT_REVIEW)),
    expansionRepairDir: path.resolve(option('--expansion-repair-dir', DEFAULT_EXPANSION_REPAIR)),
    finalRepairDir: path.resolve(option('--final-repair-dir', DEFAULT_FINAL_REPAIR)),
    repairDir: path.resolve(option('--repair-dir', stage === 'final' ? DEFAULT_LAST_REPAIR
      : stage === 'rereview' ? DEFAULT_FINAL_REPAIR
      : stage === 'expansion' ? DEFAULT_EXPANSION_REPAIR : DEFAULT_REPAIR)) };
  if (mode === 'prepare') {
    const manifest = await prepareEnglishUsageRepairs(options);
    console.log(JSON.stringify({ cardCount: manifest.cardCount, batchCount: manifest.batchCount,
      repairDir: options.repairDir }));
  } else if (mode === 'merge') {
    const receipt = await mergeEnglishUsageRepairs(options);
    console.log(JSON.stringify({ repairedCount: receipt.repairedCount,
      affectedOfficialBatches: receipt.affectedOfficialBatches.length, receipt: receipt.receipt }));
  } else throw new Error('Usage: node scripts/repair-english-usage-cards.mjs prepare|merge');
}
