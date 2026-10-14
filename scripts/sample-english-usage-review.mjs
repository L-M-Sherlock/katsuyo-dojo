/** Deterministic English usage-card review packets; no language judgments. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { USAGE_CARDS, resolveUsageCard, usageCardItem, usageCardClassRequirements } from '../app/lib/usage-cards.mjs';
import { UNIFIED_COURSES, COURSE_STAGES } from '../app/lib/unified-curriculum.mjs';
import { EN_USAGE_CARD_OVERLAYS } from '../app/lib/i18n/content/en/usage-cards.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_WORK = path.join(ROOT, 'work/i18n-english-usage-cards-gpt');
const DEFAULT_OUTPUT = path.join(ROOT, 'work/i18n-english-usage-cards-review');
const DEFAULT_MODULE = path.join(ROOT, 'app/lib/i18n/content/en/usage-cards.mjs');
const PROVIDER = 'gpt-6-luna-max';
const VERSION = 2;
const PACKET_SIZE = 64;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const jsonHash = value => hash(JSON.stringify(value));
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

function uniqueMap(rows, label) {
  requireValue(Array.isArray(rows), `${label} must be an array`);
  const map = new Map();
  for (const row of rows) {
    requireValue(typeof row?.id === 'string' && row.id && !map.has(row.id), `${label}: missing or duplicate ID ${row?.id}`);
    map.set(row.id, row);
  }
  return map;
}

/** The same immutable review context is used for sampled and full-batch packets. */
export function englishUsageReviewRow(card, localized, batch, reasons = []) {
  requireValue(localized?.id === card.id && localized.sourceHash === jsonHash(card), `${card.id}: stale English overlay`);
  const item = usageCardItem(card.senseId);
  requireValue(item, `${card.id}: unknown sense`);
  const course = UNIFIED_COURSES.filter(row => row.domain === item.domain && row.forms.includes(card.form));
  requireValue(course.length === 1, `${card.id}: expected one course; found ${course.length}`);
  const resolved = resolveUsageCard(card);
  requireValue(resolved?.target?.text, `${card.id}: target cannot resolve`);
  return {
    id: card.id, sourceHash: localized.sourceHash, englishHash: jsonHash(localized),
    authorBatch: batch.id, authorBatchReceipt: batch.receipt,
    courseId: course[0].id, stageId: course[0].stageId, wordClass: item.class, reasons,
    canonical: { senseId: card.senseId, form: card.form, meaning: card.meaning,
      scene: card.scene, translation: card.translation,
      ...(card.note === undefined ? {} : { note: card.note }),
      before: card.before, after: card.after, review: card.review },
    japanese: {
      sentence: [...card.before.map(part => part.text), resolved.target.text,
        ...card.after.map(part => part.text)].join(''),
      reading: [...card.before.map(part => part.reading ?? part.text), resolved.target.reading,
        ...card.after.map(part => part.reading ?? part.text)].join(''),
      target: resolved.target,
    },
    english: { scene: localized.scene, translation: localized.translation,
      ...(localized.note === undefined ? {} : { note: localized.note }) },
  };
}

/** Pure selection logic, also used by the focused tests. */
export function selectEnglishUsageReview({ cards, overlays, batches, validFormClasses, courses = UNIFIED_COURSES, stages = COURSE_STAGES }) {
  const cardById = uniqueMap(cards, 'canonical cards');
  const overlayById = uniqueMap(overlays, 'English overlays');
  requireValue(cardById.size === overlayById.size, 'English overlay count differs from canonical cards');
  const rows = [...cardById.values()].sort(byId).map(card => {
    const localized = overlayById.get(card.id);
    requireValue(localized && localized.sourceHash === jsonHash(card), `${card.id}: missing or stale English overlay`);
    const item = usageCardItem(card.senseId);
    requireValue(item, `${card.id}: unknown sense`);
    const owners = courses.filter(course => course.domain === item.domain && course.forms.includes(card.form));
    requireValue(owners.length === 1, `${card.id}: expected one course; found ${owners.length}`);
    const resolved = resolveUsageCard(card);
    requireValue(resolved?.target?.text, `${card.id}: target cannot resolve`);
    return { card, localized, wordClass: item.class, course: owners[0], resolved };
  });
  for (const id of overlayById.keys()) requireValue(cardById.has(id), `${id}: extra English overlay`);
  const batchById = new Map();
  for (const batch of batches) for (const id of batch.ids) {
    requireValue(cardById.has(id) && !batchById.has(id), `${id}: missing card or duplicate author assignment`);
    batchById.set(id, batch);
  }
  requireValue(batchById.size === rows.length, 'Author assignments do not cover all canonical cards');
  const reasons = new Map();
  const add = (id, reason) => reasons.set(id, [...(reasons.get(id) ?? []), reason]);
  const firstBy = (key, prefix, predicate = () => true) => {
    const seen = new Set();
    for (const row of rows) {
      if (!predicate(row)) continue;
      const value = key(row);
      if (!seen.has(value)) { seen.add(value); add(row.card.id, `${prefix}:${value}`); }
    }
  };
  const valid = new Set(validFormClasses);
  const available = new Set(rows.map(row => `${row.card.form}/${row.wordClass}`));
  for (const pair of valid) requireValue(available.has(pair), `No canonical card for valid form/class ${pair}`);
  firstBy(row => `${row.card.form}/${row.wordClass}`, 'formClass', row => valid.has(`${row.card.form}/${row.wordClass}`));
  firstBy(row => batchById.get(row.card.id).id, 'authorBatch');
  for (const row of rows) if (Object.hasOwn(row.localized, 'note')) add(row.card.id, 'localizedNote');
  const remaining = rows.filter(row => !reasons.has(row.card.id));
  const randomCount = Math.ceil(remaining.length * 0.05);
  remaining.sort((a, b) => hash(a.card.id).localeCompare(hash(b.card.id)) || byId(a.card, b.card));
  for (const row of remaining.slice(0, randomCount)) add(row.card.id, 'remainingFivePercent');
  const selected = new Set(reasons.keys());
  for (const course of courses) {
    const candidate = rows.find(row => row.course.id === course.id);
    if (candidate && !rows.some(row => row.course.id === course.id && selected.has(row.card.id))) {
      add(candidate.card.id, `courseGap:${course.id}`); selected.add(candidate.card.id);
    }
  }
  for (const stage of stages) {
    const candidate = rows.find(row => row.course.stageId === stage.id);
    if (candidate && !rows.some(row => row.course.stageId === stage.id && selected.has(row.card.id))) {
      add(candidate.card.id, `stageGap:${stage.id}`); selected.add(candidate.card.id);
    }
  }
  for (const course of courses.filter(course => course.forms.length)) {
    requireValue(rows.some(row => row.course.id === course.id && selected.has(row.card.id)), `No sample for course ${course.id}`);
  }
  for (const stage of stages) requireValue(rows.some(row => row.course.stageId === stage.id && selected.has(row.card.id)),
    `No sample for stage ${stage.id}`);
  return {
    rows: rows.filter(row => reasons.has(row.card.id)).map(row =>
      englishUsageReviewRow(row.card, row.localized, batchById.get(row.card.id), reasons.get(row.card.id))),
    remainingCount: remaining.length,
    hashSampleCount: randomCount,
  };
}

export async function loadFrozenBatches(workDir, cards, overlays, modulePath = DEFAULT_MODULE) {
  const manifestBytes = await fs.readFile(path.join(workDir, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  requireValue(manifest.schemaVersion === 1 && manifest.workflow === 'english-usage-card-agent-files', 'Unsupported author manifest');
  requireValue(Array.isArray(manifest.assignments) && manifest.assignments.length > 0
    && manifest.cardCount === cards.length && manifest.translatorId === PROVIDER,
  'Frozen author manifest differs from current cards or provider');
  const current = cards.map(card => ({ id: card.id, sourceHash: jsonHash(card) })).sort(byId);
  requireValue(manifest.runtimeHash === jsonHash(current) && JSON.stringify(manifest.cards) === JSON.stringify(current), 'Frozen author manifest differs from current runtime cards');
  const frozenById = new Map(manifest.cards.map(row => [row.id, row.sourceHash]));
  requireValue(frozenById.size === cards.length, 'Frozen manifest has duplicate card IDs');
  const manifestHash = jsonHash(manifest);
  const overlayById = uniqueMap(overlays, 'English overlays');
  requireValue(overlayById.size === cards.length, 'English overlay count differs from canonical cards');
  const final = JSON.parse(await fs.readFile(path.join(workDir, 'receipts/final.json')));
  const { receipt: finalDigest, ...finalPayload } = final;
  requireValue(finalDigest === jsonHash(finalPayload) && final.schemaVersion === 1 && final.provider === PROVIDER
    && final.manifestHash === manifestHash && final.count === cards.length,
  'Final English receipt differs from frozen manifest');
  requireValue(final.overlayHash === jsonHash(overlays), 'Final English overlay differs from final receipt');
  requireValue(final.moduleHash === hash(await fs.readFile(modulePath)), 'Final English module bytes differ from final receipt');
  requireValue(Array.isArray(final.batchReceipts) && final.batchReceipts.length === manifest.assignments.length,
    'Final receipt batch count differs from frozen manifest');
  const batches = [];
  const assigned = new Set();
  for (const [index, entry] of manifest.assignments.entries()) {
    requireValue(entry.count > 0 && entry.count <= PACKET_SIZE && entry.batchId === final.batchReceipts[index]?.batchId,
      `${entry.batchId}: invalid batch size or final receipt order`);
    const bytes = await fs.readFile(path.join(workDir, entry.file));
    requireValue(hash(bytes) === entry.assignmentHash, `${entry.batchId}: assignment bytes differ from frozen hash`);
    const assignment = JSON.parse(bytes);
    requireValue(assignment.batchId === entry.batchId && assignment.count === entry.count
      && assignment.sourceHash === entry.sourceHash && assignment.cards?.length === entry.count,
    `${entry.batchId}: assignment metadata differs from frozen manifest`);
    requireValue(assignment.translatorId === PROVIDER, `${entry.batchId}: assignment provider differs`);
    const assignedPairs = assignment.cards.map(row => ({ id: row.id, sourceHash: row.sourceHash }));
    requireValue(entry.sourceHash === jsonHash(assignedPairs), `${entry.batchId}: assignment source hash differs`);
    for (const row of assignment.cards) {
      requireValue(frozenById.get(row.id) === row.sourceHash && !assigned.has(row.id),
        `${entry.batchId}: duplicate or stale assignment card ${row.id}`);
      assigned.add(row.id);
    }
    const output = JSON.parse(await fs.readFile(path.join(workDir, 'outputs', `${entry.batchId}.json`)));
    requireValue(output.batchId === entry.batchId && output.translatorId === PROVIDER
      && output.assignmentHash === entry.assignmentHash && output.cards?.length === entry.count,
    `${entry.batchId}: author output differs from frozen assignment`);
    const batchOverlays = assignment.cards.map((row, rowIndex) => {
      const authored = output.cards[rowIndex];
      const localized = overlayById.get(row.id);
      requireValue(authored?.id === row.id && authored?.sourceHash === row.sourceHash
        && localized?.sourceHash === row.sourceHash && JSON.stringify(authored) === JSON.stringify(localized),
      `${entry.batchId}: output or final overlay differs for ${row.id}`);
      return localized;
    });
    const batchReceipt = JSON.parse(await fs.readFile(path.join(workDir, 'receipts', `${entry.batchId}.json`)));
    const { receipt: batchDigest, ...batchPayload } = batchReceipt;
    requireValue(batchDigest === jsonHash(batchPayload) && batchDigest === final.batchReceipts[index].receipt
      && batchReceipt.schemaVersion === 1 && batchReceipt.provider === PROVIDER
      && batchReceipt.batchId === entry.batchId && batchReceipt.manifestHash === manifestHash
      && batchReceipt.count === entry.count && batchReceipt.sourceHash === entry.sourceHash
      && batchReceipt.outputHash === jsonHash(batchOverlays),
    `${entry.batchId}: author receipt differs from assignment, output, or final receipt`);
    const receiptRows = batchOverlays.map(row => ({ id: row.id, sourceHash: row.sourceHash, outputHash: jsonHash(row) }));
    requireValue(JSON.stringify(batchReceipt.rows) === JSON.stringify(receiptRows),
      `${entry.batchId}: author receipt row hashes differ from final overlay`);
    batches.push({ id: entry.batchId, ids: assignment.cards.map(row => row.id), receipt: batchDigest });
  }
  requireValue(assigned.size === cards.length, 'Frozen author assignments do not cover every current card exactly once');
  return { manifest, manifestBytes, batches, final };
}

export async function writeEnglishUsageReview({ cards = USAGE_CARDS, overlays = EN_USAGE_CARD_OVERLAYS,
  workDir = DEFAULT_WORK, outputDir = DEFAULT_OUTPUT, modulePath = DEFAULT_MODULE } = {}) {
  const frozen = await loadFrozenBatches(workDir, cards, overlays, modulePath);
  const selection = selectEnglishUsageReview({ cards, overlays, batches: frozen.batches,
    validFormClasses: usageCardClassRequirements() });
  const packets = [];
  for (let start = 0; start < selection.rows.length; start += PACKET_SIZE) {
    const packetId = `review-${String(packets.length).padStart(4, '0')}`;
    const cards = selection.rows.slice(start, start + PACKET_SIZE);
    packets.push({ schemaVersion: 1, algorithmVersion: VERSION, packetId, count: cards.length, cards });
  }
  const packetBytes = packets.map(packet => `${JSON.stringify(packet, null, 2)}\n`);
  const reviewManifest = {
    schemaVersion: 1, algorithmVersion: VERSION, frozenRuntimeHash: frozen.manifest.runtimeHash,
    frozenManifestSha256: hash(frozen.manifestBytes), canonicalCount: cards.length,
    finalReceipt: frozen.final.receipt, englishOverlayHash: frozen.final.overlayHash,
    englishModuleHash: frozen.final.moduleHash,
    authorBatchCount: frozen.batches.length, sampleCount: selection.rows.length,
    remainingCount: selection.remainingCount, hashSampleCount: selection.hashSampleCount,
    sampleIds: selection.rows.map(row => row.id),
    packets: packets.map((packet, index) => ({ file: `${packet.packetId}.json`, count: packet.count,
      firstId: packet.cards[0].id, lastId: packet.cards.at(-1).id, sha256: hash(packetBytes[index]) })),
  };
  await fs.mkdir(outputDir, { recursive: true });
  const expected = new Set(packets.map(packet => `${packet.packetId}.json`));
  for (const name of await fs.readdir(outputDir)) if (/^review-\d{4}\.json$/.test(name) && !expected.has(name)) {
    await fs.unlink(path.join(outputDir, name));
  }
  for (const [index, packet] of packets.entries()) await fs.writeFile(path.join(outputDir, `${packet.packetId}.json`), packetBytes[index]);
  await fs.writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(reviewManifest, null, 2)}\n`);
  return reviewManifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const index = args.indexOf(name);
    return index < 0 ? fallback : args[index + 1];
  };
  const allowed = new Set(['--work-dir', '--output-dir']);
  for (let index = 0; index < args.length; index += 2) {
    if (!allowed.has(args[index]) || !args[index + 1]) throw new Error('Usage: node scripts/sample-english-usage-review.mjs [--work-dir PATH] [--output-dir PATH]');
  }
  const manifest = await writeEnglishUsageReview({ workDir: path.resolve(option('--work-dir', DEFAULT_WORK)),
    outputDir: path.resolve(option('--output-dir', DEFAULT_OUTPUT)) });
  console.log(JSON.stringify({ sampleCount: manifest.sampleCount, packetCount: manifest.packets.length,
    authorBatchCount: manifest.authorBatchCount, outputDir: path.resolve(option('--output-dir', DEFAULT_OUTPUT)) }));
}
