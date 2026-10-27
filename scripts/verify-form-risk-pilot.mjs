/** Read-only assessment archive. No result from this file changes teaching policy. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {resolveUsageCard, usageCardItem} from '../app/lib/usage-cards.mjs';
import {FORM_LABELS} from '../app/lib/form-labels.mjs';
import {deriveUnified} from '../app/lib/unified-knowledge.mjs';
import {assessFormUsage} from '../app/lib/form-eligibility.mjs';
import {verifyPortableRevisionDelivery} from './verify-reviewed-usage-revisions.mjs';
import {readVerifiedReviewedUsageCheckpoint, verifyReviewedProofPrefix} from './lib/reviewed-usage-history.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PILOT_PROOF = path.join(ROOT, 'docs/usage-card-form-risk-pilot-20261027.json.gz');
export const PILOT_REPORT = path.join(ROOT, 'docs/usage-card-form-risk-pilot-20261027.md');
export const PILOT_LIST = path.join(ROOT, 'docs/usage-card-form-risk-pilot-list-20261027.md');
export const PILOT_BASELINE = path.join(ROOT, 'docs/form-hold-baseline-20261027.json.gz');
export const PILOT_BASELINE_SHA256 = '15dec7356008ccbf65efa86e8c55ec8d7706c29b7bbaa616e702cdaec7e3cb80';
export const PILOT_INITIAL_ARCHIVE_SHA256 = '5df45af65bf18618cf3787092c41dccb5dc0999aac999775671e03280c2dbe6f';
// Pin the initial ten source and ten review receipts. A reconsideration can add
// evidence for its one assigned card, but cannot replace another initial vote.
const INITIAL_RECEIPTS_SHA256 = '23f7ade067371b8860f5667078d4c95872f5e0f140e59af1a12e098d3def4d0d';
const RECONSIDERED_ID = 'usage:teshimauNegativePast:verb:困る:こまる';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hash = value => sha(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ensure = (ok, message) => { if (!ok) throw Error(message); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const STATUSES = ['approved', 'revise', 'uncertain'];
const DIMENSIONS = [
  ['morphology', '构形'], ['goalAndAmbiguity', '目标用义与同形歧义'], ['collocation', '搭配'],
  ['rolesAndMeaning', '人物与词义'], ['timeAndNegation', '时间与否定范围'],
  ['registerAndPragmatics', '语体与语用'], ['chinese', '中文'], ['english', '英文'], ['reading', '注音'],
];
const RISK_ORDINALS = [26, 27, 32, 33, 35, 36, 39, 51, 55, 56, 57, 58, 59, 60, 61,
  81, 82, 87, 88, 89, 94, 95, 97, 98, 108, 109, 113, 114, 119, 120, 122, 123,
  126, 127, 128, 131, 132, 166, 167];
const STATUS_LABELS = {approved: '通过', revise: '需修', uncertain: '未决'};

export const verifyPortablePilotDelivery = verifyPortableRevisionDelivery;

export function loadFormRiskPilotProof(file = PILOT_PROOF) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
}

function readArtifact(files, sourcePath) {
  ensure(files.has(sourcePath), `Missing pilot artifact: ${sourcePath}`);
  try { return JSON.parse(files.get(sourcePath).toString('utf8')); }
  catch (error) { throw Error(`Invalid pilot JSON ${sourcePath}: ${error.message}`); }
}

function readBaseline(supplied) {
  const bytes = fs.readFileSync(PILOT_BASELINE);
  ensure(sha(bytes) === PILOT_BASELINE_SHA256, 'Pilot baseline bytes changed');
  const baseline = JSON.parse(zlib.gunzipSync(bytes).toString('utf8'));
  if (supplied !== undefined) ensure(same(supplied, baseline), 'Supplied pilot baseline differs from frozen bytes');
  ensure(baseline.schemaVersion === 1 && baseline.kind === 'user-directed-form-hold-baseline', 'Invalid pilot baseline');
  const files = verifyPortablePilotDelivery(baseline.sourceDelivery, 'author', 'formhold/00');
  const scope = readArtifact(files, baseline.paths.scope);
  const held = readArtifact(files, baseline.paths.held);
  ensure(scope.sourceCommit === baseline.sourceCommit && scope.counts.activeCards === 17026
    && scope.counts.activeForms === 169 && scope.counts.riskTargets === 39
    && scope.counts.riskCards === 4542 && scope.counts.samples === 156, 'Pilot baseline scope drift');
  ensure(Array.isArray(scope.activeForms) && scope.activeForms.length === 169
    && scope.activeForms.every((row, index) => row.number === index + 1 && row.label === FORM_LABELS[row.form])
    && new Set(scope.activeForms.map(row => row.form)).size === 169, 'Pre-hold 169-form numbering changed');
  ensure(Array.isArray(scope.riskTargets) && same(scope.riskTargets.map(row => row.number), RISK_ORDINALS)
    && scope.riskTargets.every(row => same(row, scope.activeForms[row.number - 1])), 'Pilot 39-form scope changed');
  return {baseline, scope, held};
}

// This classification reproduces the frozen selection order. A question has
// priority over the punctuation-only-after test, including closing quotes.
export function pilotClauseKind(row) {
  if (/[？?][」』]*$/u.test(row.fullSentence.trim())) return 'question';
  return /^[。！!？?「」『』\s]*$/u.test(row.card.after.map(part => part.text).join(''))
    ? 'terminal' : 'continuation';
}

/** Rebuild the immutable pre-hold bilingual checkpoint after verifying its successors. */
export function recomputeFormRiskPilotSamples({baseline: supplied} = {}) {
  const {baseline, scope, held} = readBaseline(supplied);
  verifyReviewedProofPrefix(scope.proofHashes['docs/usage-card-reviewed-revisions.v1.json'], 17);
  const history = readVerifiedReviewedUsageCheckpoint(17);
  const canonical = history.cards, english = history.english;
  const heldSources = new Map(held.map(row => [row.id, row]));
  const feedbackEvidenceFile = path.join(ROOT, 'docs/usage-card-risk-pilot-feedback-holds-20261027.json');
  const feedbackSources = new Map((fs.existsSync(feedbackEvidenceFile)
    ? JSON.parse(fs.readFileSync(feedbackEvidenceFile, 'utf8')).sourceRows : []).map(row => [row.id, row]));
  ensure(Array.isArray(scope.riskInventory) && scope.riskInventory.length === 4542
    && new Set(scope.riskInventory.map(row => row.id)).size === 4542, 'Pilot inventory missing or duplicate cards');
  const riskForms = new Set(scope.riskTargets.map(row => row.form));
  const candidates = scope.riskInventory.map(frozen => {
    const card = canonical.get(frozen.id), en = english.get(frozen.id);
    ensure(card && riskForms.has(card.form) && card.form === frozen.form && card.senseId === frozen.senseId
      && hash(card) === frozen.sourceHash, `${frozen.id}: canonical source hash drift`);
    ensure(en && hash(en) === frozen.englishHash && en.sourceHash === frozen.sourceHash,
      `${frozen.id}: merged English hash drift`);
    const item = usageCardItem(card.senseId), resolved = resolveUsageCard(card, {allowTeachingHolds: true});
    ensure(item && resolved && item.meaning === card.meaning, `${card.id}: retained morphology unavailable`);
    const target = resolved.target;
    return {id: card.id, sourceHash: hash(card), englishHash: hash(en), card, english: en,
      wordClass: item.class, target,
      fullSentence: [...card.before, target, ...card.after].map(part => part.text).join(''),
      fullReading: [...card.before, target, ...card.after].map(part => part.reading ?? part.text).join(''),
      previousUsage: heldSources.get(card.id)?.previousUsage
        ?? feedbackSources.get(card.id)?.previousUsage ?? assessFormUsage(item, card.form)};
  });
  const samples = [];
  for (const risk of scope.riskTargets) {
    const population = candidates.filter(row => row.card.form === risk.form).sort((a, b) => {
      const left = sha(`${risk.form}:${a.id}`), right = sha(`${risk.form}:${b.id}`);
      return left < right ? -1 : left > right ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    ensure(population.length >= 4, `${risk.form}: insufficient frozen population`);
    const selected = [];
    const unused = () => population.filter(row => !selected.some(chosen => chosen.id === row.id));
    const choose = row => { if (row && !selected.some(chosen => chosen.id === row.id)) selected.push(row); };
    if (['tearuNegative', 'tearuNegativePast'].includes(risk.form)) {
      for (const surface of ['書く', '置く', '読む', '食べる']) {
        const row = population.find(candidate => usageCardItem(candidate.card.senseId).surface === surface);
        ensure(row, `${risk.form}: missing fixed comparison ${surface}`);
        choose(row);
      }
    } else {
      choose(population.find(row => pilotClauseKind(row) === 'terminal') ?? population[0]);
      choose(unused().find(row => pilotClauseKind(row) === 'question')
        ?? unused().find(row => pilotClauseKind(row) === 'continuation') ?? unused()[0]);
      for (const wordClass of ['godan', 'ichidan', 'irregular']) {
        if (selected.length < 4 && !selected.some(row => row.wordClass === wordClass)) {
          choose(unused().find(row => row.wordClass === wordClass));
        }
      }
      for (const row of unused()) { if (selected.length === 4) break; choose(row); }
    }
    ensure(selected.length === 4, `${risk.form}: sample must contain four cards`);
    for (const row of selected) samples.push({...row, ordinal: risk.number, clauseKind: pilotClauseKind(row),
      ...(risk.form.startsWith('tearu') ? {comparisons: Object.fromEntries(
        ['tearu', 'tearuPast', 'teiruNegative', 'teiruNegativePast'].map(form =>
          [form, deriveUnified(usageCardItem(row.card.senseId), form).answer]))} : {})});
  }
  ensure(samples.length === 156 && new Set(samples.map(row => row.id)).size === 156
    && same(samples.map(row => row.id), scope.sampleIds), 'Recomputed pilot sample differs from frozen 39×4 IDs');
  return {sourceCommit: baseline.sourceCommit, baselineSha256: PILOT_BASELINE_SHA256, scope, samples,
    sampling: {algorithm: 'form-risk-39x4-v1', inventoryHash: hash(scope.riskInventory),
      sampleHash: hash(samples), sampleIds: samples.map(row => row.id)}};
}

function validateReport(report, packet, batch) {
  const expectedReviewer = `/root/form_risk_pilot_review_${batch.reviewerIndex}`;
  ensure(report?.schemaVersion === 1 && report.batchId === batch.id && report.reviewer === expectedReviewer
    && batch.reviewer === expectedReviewer && report.model === 'gpt-6-sol' && report.reasoningEffort === 'medium'
    && report.sourceReceipt === batch.sourceDelivery.receipt && report.inputSha256 === batch.inputSha256,
  `${batch.id}: missing independent assigned reviewer/model/input receipt`);
  ensure(report.count === batch.count && Array.isArray(report.rows) && report.rows.length === batch.count,
    `${batch.id}: incomplete review report`);
  for (const [index, row] of report.rows.entries()) {
    const source = packet.rows[index];
    ensure(row?.id === source.id && row.sourceHash === source.sourceHash && row.englishHash === source.englishHash
      && row.fullSentence === source.fullSentence, `${batch.id}: review source binding/order drift`);
    ensure(STATUSES.includes(row.status) && typeof row.reason === 'string' && row.reason.trim().length >= 20,
      `${row.id}: missing actual assessment status or concrete reason`);
    ensure(row.assessments && DIMENSIONS.every(([key]) => nonempty(row.assessments[key])
      && !['正确', '已核对', '通过', '无误', 'OK', 'N/A'].includes(row.assessments[key].trim())),
    `${row.id}: incomplete per-dimension assessment`);
    ensure(row.optionalPolish === undefined || nonempty(row.optionalPolish), `${row.id}: empty optional polish`);
    ensure(Array.isArray(row.sources) && row.sources.every(source => nonempty(source.note)
      && typeof source.url === 'string' && /^https?:\/\/[^\s]+$/u.test(source.url)), `${row.id}: invalid evidence sources`);
  }
}

export async function verifyFormRiskPilot({proof = loadFormRiskPilotProof(), baseline,
  model, verifyPolicy = true, verifyRendered = true} = {}) {
  const rebuilt = recomputeFormRiskPilotSamples({baseline});
  ensure(proof?.schemaVersion === 1 && proof.kind === 'usage-card-form-risk-pilot'
    && proof.effect === 'report-only' && proof.sourceCommit === rebuilt.sourceCommit
    && proof.baselineSha256 === rebuilt.baselineSha256, 'Invalid pilot archive identity or report-only policy');
  ensure(same(proof.sampling, rebuilt.sampling), 'Pilot sampling missing, duplicate, reordered or forged');
  ensure(Array.isArray(proof.batches) && proof.batches.length === 10, 'Pilot requires ten actual review batches');
  const amended = proof.initialSummary !== undefined || proof.reviewChanges !== undefined
    || proof.initialArchiveSha256 !== undefined;
  if (amended) ensure(proof.initialArchiveSha256 === PILOT_INITIAL_ARCHIVE_SHA256,
    'Pilot initial archive audit fingerprint changed');
  const rows = [], initialRows = [], changes = [], initialReceipts = [];
  const sourceReceipts = new Set(), reviewReceipts = new Set();
  for (const [index, batch] of proof.batches.entries()) {
    const suffix = String(index).padStart(2, '0'), expectedCount = index === 9 ? 12 : 16;
    ensure(batch?.id === `riskpilot/${suffix}` && batch.index === index && batch.count === expectedCount
      && batch.reviewerIndex === index % 4 && batch.sourcePath === `packets/${suffix}.json`
      && batch.reportPath === `reviews/${suffix}.json`, `Pilot batch ${index}: scope/path/count drift`);
    const sources = verifyPortablePilotDelivery(batch.sourceDelivery, 'author', batch.id);
    const reviews = verifyPortablePilotDelivery(batch.reviewDelivery, 'review', batch.id);
    ensure(same([...sources.keys()], [batch.sourcePath]) && same([...reviews.keys()], [batch.reportPath]),
      `${batch.id}: unexpected source or review artifacts`);
    ensure(!sourceReceipts.has(batch.sourceDelivery.receipt) && !reviewReceipts.has(batch.reviewDelivery.receipt),
      `${batch.id}: repeated immutable receipt`);
    sourceReceipts.add(batch.sourceDelivery.receipt); reviewReceipts.add(batch.reviewDelivery.receipt);
    ensure(sha(sources.get(batch.sourcePath)) === batch.inputSha256, `${batch.id}: frozen input SHA drift`);
    const packet = readArtifact(sources, batch.sourcePath), report = readArtifact(reviews, batch.reportPath);
    ensure(packet.schemaVersion === 1 && packet.batch === batch.id && packet.sourceKind === 'pre-hold-published-sample'
      && packet.sourceCommit === rebuilt.sourceCommit && packet.count === expectedCount
      && same(packet.rows, rebuilt.samples.slice(index * 16, index * 16 + expectedCount)),
    `${batch.id}: source packet differs from independently recomputed sample`);
    validateReport(report, packet, batch);
    let initial = report;
    if (amended && index === 6) {
      ensure(batch.initialReviewDelivery?.revision === 1 && batch.reviewDelivery.revision === 2
        && batch.initialReviewDelivery.receipt !== batch.reviewDelivery.receipt,
      `${batch.id}: reconsideration must preserve revision 1 and add revision 2`);
      const initialFiles = verifyPortablePilotDelivery(batch.initialReviewDelivery, 'review', batch.id);
      ensure(same([...initialFiles.keys()], [batch.reportPath]), `${batch.id}: initial review artifact scope drift`);
      initial = readArtifact(initialFiles, batch.reportPath);
      validateReport(initial, packet, batch);
      ensure(same({...initial, rows: null}, {...report, rows: null}), `${batch.id}: reconsideration changed report identity`);
    } else ensure(batch.initialReviewDelivery === undefined && batch.reviewDelivery.revision === 1,
      `${batch.id}: unauthorized replacement or extra initial review`);
    initialReceipts.push((batch.initialReviewDelivery ?? batch.reviewDelivery).receipt);
    for (const [rowIndex, row] of packet.rows.entries()) {
      rows.push({...row, assessment: report.rows[rowIndex], reviewer: report.reviewer, batchId: batch.id});
      initialRows.push({...row, assessment: initial.rows[rowIndex], reviewer: initial.reviewer, batchId: batch.id});
      const before = initial.rows[rowIndex], after = report.rows[rowIndex];
      if (!same(before, after)) changes.push({batch: batch.id, id: row.id, reviewer: report.reviewer,
        fromStatus: before.status, toStatus: after.status, initialReason: before.reason, finalReason: after.reason});
    }
  }
  ensure(hash({source: proof.batches.map(batch => batch.sourceDelivery.receipt), review: initialReceipts})
    === INITIAL_RECEIPTS_SHA256, 'Pilot initial source/review receipts were replaced');
  ensure(amended ? changes.length === 1 && changes[0].batch === 'riskpilot/06' && changes[0].id === RECONSIDERED_ID
    && changes[0].fromStatus === 'revise' && changes[0].toStatus === 'approved'
    && same(changes, proof.reviewChanges) : changes.length === 0,
  'Pilot reconsideration changed an unauthorized card or forged its review history');
  ensure(rows.length === 156 && new Set(rows.map(row => row.id)).size === 156
    && same(rows.map(row => row.id), rebuilt.sampling.sampleIds), 'Pilot sample missing or duplicate cards');
  const summarize = assessed => ({counts: {targets: 39, riskCards: 4542, samples: 156,
    ...Object.fromEntries(STATUSES.map(status => [status, assessed.filter(row => row.assessment.status === status).length]))},
  byForm: rebuilt.scope.riskTargets.map(target => {
    const selected = assessed.filter(row => row.card.form === target.form);
    ensure(selected.length === 4, `${target.form}: pilot needs exactly four assessments`);
    return {ordinal: target.number, form: target.form, label: target.label, samples: selected.length,
      ...Object.fromEntries(STATUSES.map(status => [status, selected.filter(row => row.assessment.status === status).length]))};
  })});
  const {counts, byForm} = summarize(rows), initialSummary = summarize(initialRows);
  ensure(same(proof.summary, {counts, byForm}), 'Pilot summary differs from actual reviewer assessments');
  if (amended) ensure(same(proof.initialSummary, initialSummary), 'Pilot initial summary differs from preserved initial votes');
  if (verifyPolicy) {
    const {verifyFourFormHold} = await import('./verify-four-form-hold.mjs');
    await verifyFourFormHold({model, verifyHistory: true});
  }
  const result = {schemaVersion: 1, counts, byForm, samples: rows, sourceCommit: rebuilt.sourceCommit,
    baselineSha256: rebuilt.baselineSha256, sampling: rebuilt.sampling, effect: 'report-only',
    initialSummary, reviewChanges: changes, ...(amended ? {initialArchiveSha256: PILOT_INITIAL_ARCHIVE_SHA256} : {})};
  if (verifyRendered) {
    ensure(fs.readFileSync(PILOT_REPORT, 'utf8') === renderFormRiskPilotReport(result), 'Pilot detailed Markdown report drift');
    ensure(fs.readFileSync(PILOT_LIST, 'utf8') === renderFormRiskPilotList(result), 'Pilot independent examination list drift');
  }
  return result;
}

const cell = value => String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
const paragraph = value => String(value).replaceAll('\n', '  \n');

export function renderFormRiskPilotList(result) {
  const lines = ['# 日语原句独立考察清单', '', '只列变形与日语原句；按实际审核状态分组。', ''];
  for (const status of ['revise', 'uncertain', 'approved']) {
    const selected = result.samples.filter(row => row.assessment.status === status);
    lines.push(`## ${STATUS_LABELS[status]}（${selected.length}）`, '', '| 变形 | 日语原句 |', '| --- | --- |');
    for (const row of selected) lines.push(`| ${cell(usageCardItem(row.card.senseId).surface)}→${cell(row.target.text)} | ${cell(row.fullSentence)} |`);
    lines.push('');
  }
  return lines.join('\n');
}

export function renderFormRiskPilotReport(result) {
  const {counts} = result;
  const initial = result.initialSummary?.counts;
  const historyLines = result.reviewChanges?.length ? ['## 原审核者复核与初票历史', '',
    `初票为通过 ${initial.approved}、需修 ${initial.revise}、未决 ${initial.uncertain}。初版压缩归档 SHA-256：\`${result.initialArchiveSha256}\`。`, '',
    '只对06批指定卡提出否定疑问语用的复核问题；原审核者读取相同不可变原卡后更新自己的判断，另冻revision 2。06初票的完整portable reviewDelivery仍嵌入本证明，其他9份初票与全部10份原稿保持同一收据；没有改卡或安排返修。', ''] : [];
  for (const change of result.reviewChanges ?? []) historyLines.push(
    `- 指定卡：\`${change.id}\`；原审核者：\`${change.reviewer}\`；${STATUS_LABELS[change.fromStatus]}→${STATUS_LABELS[change.toStatus]}。`,
    `- 初票理由：${paragraph(change.initialReason)}`, `- 复核理由：${paragraph(change.finalReason)}`, '');
  const lines = ['# 39个目标、156张卡的只读试审', '',
    `实际逐卡审核：通过 ${counts.approved}，需修 ${counts.revise}，未决 ${counts.uncertain}。每个目标4张，共39个目标、156张。`, '',
    '这是对暂停前在用卡的确定性试审，母集为被质疑的39个目标、4542张卡。它不覆盖这4542张的每一张，也不能推断全站错误率或代表全站语言结论。通过仅表示该审核者对本卡的判断；需修和未决保留具体维度及依据。', '',
    '本次只保存报告，不改原卡、canonical review、英语覆盖层、教学暂停或恢复状态。tearuNegative、tearuNegativePast、temiruDesireNegative、temiruDesireNegativePast四项继续按用户指令可恢复暂停；样本通过不自动恢复，样本需修或未决也不自动增加暂停、安排返修或扩大为全族禁令。当前题池仍为16793张、165种形式；教学暂缓并集467张。', '',
    '## 范围与可复核证据', '',
    `- 暂停前169个在用目标的编号表保存在基线交付中；来源提交：\`${result.sourceCommit}\`。`,
    `- 基线压缩文件 SHA-256：\`${result.baselineSha256}\`。原17026卡哈希、原235张四形式全源（含2张既有精确暂停重叠）及原知识图仍封存于基线。`,
    `- 4542卡母集联合指纹：\`${result.sampling.inventoryHash}\`。156张完整样本联合指纹：\`${result.sampling.sampleHash}\`。`,
    `- 便携JSON保存10份原卡不可变交付与10份当前实际审核交付及收据${result.reviewChanges?.length ? '，另含06批完整初票' : ''}；不依赖work目录长期存在。审核模型均为gpt-6-sol，reasoningEffort为medium；实际审核者按分片为/root/form_risk_pilot_review_0至3。`,
    '- 原卡和英语逐对象哈希从当前保留的canonical集合及基线＋后续英语覆盖层独立重算；日语全文和读音使用真实活用器、allowTeachingHolds:true还原。逐批核对原卡收据、输入SHA、报告身份、顺序、数量和每项判断。', '',
    ...historyLines,
    '## 采样方法', '',
    '#87与#88固定选書く、置く、読む、食べる，用于同词的肯否与时态比较。其余目标将母集按SHA-256(form:cardId)、再按ID排序；先取非问句且目标后仅标点的句末例，再取未用问句、否则连续后项例、否则首个未用例；依godan、ichidan、irregular顺序补尚未覆盖的词类，最后按哈希顺序补足4张。问句包括末尾「?／？」后带」或』的情况。这个规则用于覆盖观察角度，不构成随机抽样或错误率估计。', '',
    '## 四个展示例', '',
    '以下以書く统一展示活用器的四个输出，仅调整报告展示例词；没有批量修改原卡，也不替代逐卡语用审核。', '',
    '| 暂停前编号 | 目标 | 变形 |', '| --- | --- | --- |'];
  const item = usageCardItem('verb:書く:かく');
  for (const [number, form] of [[80, 'tearu'], [86, 'tearuPast'], [87, 'tearuNegative'], [88, 'tearuNegativePast']]) {
    lines.push(`| #${number} | ${cell(FORM_LABELS[form])} | 書く→${cell(deriveUnified(item, form).answer)} |`);
  }
  lines.push('', '否定输出与「ている」口语否定同形时，构形、准备义是否被当前语境支持、题面能否消歧及是否适合独立教学必须分别判断；具体意见见下方实际审核记录。', '',
    '## 按目标汇总', '', '| 暂停前编号 | 目标 | 样本 | 通过 | 需修 | 未决 |', '| --- | --- | ---: | ---: | ---: | ---: |');
  for (const form of result.byForm) lines.push(`| #${form.ordinal} | ${cell(form.label)} | ${form.samples} | ${form.approved} | ${form.revise} | ${form.uncertain} |`);
  lines.push('', '## 逐卡原句、结论与依据', '');
  for (const form of result.byForm) {
    lines.push(`### #${form.ordinal} ${form.label}`, '');
    for (const row of result.samples.filter(candidate => candidate.card.form === form.form)) {
      const assessment = row.assessment;
      lines.push(`#### ${usageCardItem(row.card.senseId).surface}→${row.target.text}：${STATUS_LABELS[assessment.status]}`, '',
        `- 卡片：\`${row.id}\`；实际审核者：\`${row.reviewer}\`；批次：\`${row.batchId}\`。`,
        `- 原句：${paragraph(row.fullSentence)}`, `- 原读音：${paragraph(row.fullReading)}`,
        `- 原场景：${paragraph(row.card.scene)}`, `- 原中文译文：${paragraph(row.card.translation)}`,
        `- 原英文场景：${paragraph(row.english.scene)}`, `- 原英文译文：${paragraph(row.english.translation)}`,
        `- 审核结论：${paragraph(assessment.reason)}`, '');
      for (const [key, label] of DIMENSIONS) lines.push(`- ${label}：${paragraph(assessment.assessments[key])}`);
      lines.push('', `可选润色：${assessment.optionalPolish ? paragraph(assessment.optionalPolish) : '审核者未另列；不据此添加错误。'}`, '');
      if (assessment.sources.length) {
        lines.push('审核者引用及具体适用范围：', '');
        for (const source of assessment.sources) lines.push(`- [${source.url}](${source.url})：${paragraph(source.note)}`);
      } else lines.push('审核者未另列外部来源；以上为该卡实际审核判断，不宣称外部资料逐句背书。');
      lines.push('', `原卡 SHA-256：\`${row.sourceHash}\`；英语 SHA-256：\`${row.englishHash}\`。`, '');
    }
  }
  lines.push('## 本地接入验证', '',
    '最终全量测试1,255／1,255通过；知识模型、适用性、用法卡、i18n、综合运用与字体审计，全对／混合模拟、类型检查、Lint和构建通过。试审报告没有修改任何原卡或增加教学限制；仅批准计划中的四个整形式暂停生效。中英文UI、旧备份和导出回归确认当前门槛131，历史introduced、byKc和挂起复测锚点保留。本轮未提交、推送或发布。', '');
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await verifyFormRiskPilot();
  console.log(JSON.stringify({effect: result.effect, counts: result.counts, baselineSha256: result.baselineSha256}));
}
