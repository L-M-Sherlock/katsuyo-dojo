#!/usr/bin/env node
/*
 * Deterministic checks that belong before language review.  This script never
 * approves a sentence: it removes bookkeeping and serialization work from the
 * reviewer and emits a small queue of cards that deserve extra attention.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const pair = row => `${row.senseId}/${row.form}`;
const compact = value => String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
const kana = /[\u3040-\u30ff]/u;
const japanesePunctuation = /[「」『』、]/u;
const placeholder = /(具体的?人物|具体场景|某人|某事|这项(?:动作|行为)|占位|待补|TODO|placeholder|按词义|语义(?:一致|对应)即可)/iu;
const genericReason = /(完整句.*(?:一致|通过)|场景、?译文、?目标(?:语义)?(?:均)?一致|按(?:卡片)?序号|逐卡.*(?:一致|通过)|课程用义.*(?:一致|通过))/iu;

function read(root, relative) {
  return fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');
}
function readJson(root, relative) { return JSON.parse(read(root, relative).replace(/^\uFEFF/u, '')); }
function report(code, severity, message, cards = []) { return {code, severity, message, cards}; }

function similarity(left, right) {
  const a = new Set(compact(left).replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, '').match(/[\p{L}\p{N}\u3400-\u9fff]{2}/gu) ?? []);
  const b = new Set(compact(right).replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, '').match(/[\p{L}\p{N}\u3400-\u9fff]{2}/gu) ?? []);
  if (!a.size || !b.size) return 0;
  let common = 0; for (const token of a) if (b.has(token)) common++;
  return common / (a.size + b.size - common);
}

function resolveSentence(card, project) {
  const resolved = project.resolveUsageCard(card);
  if (!resolved) return {sentence: null, reading: null};
  const parts = [...card.before, resolved.target, ...card.after];
  return {sentence: parts.map(part => part.text).join(''), reading: parts.map(part => part.reading ?? part.text).join('')};
}

export async function runReviewPreflight({taskRoot, batch, phase = 'review', project: suppliedProject} = {}) {
  if (!taskRoot || !batch || !/^[A-Za-z0-9][A-Za-z0-9_-]*\/[0-9]{2,}$/u.test(batch)) {
    throw new Error('review-preflight requires a safe batch lane/NN and taskRoot');
  }
  const root = path.resolve(taskRoot);
  const projectRoot = path.resolve(root, '../..');
  const project = suppliedProject ?? await import(pathToFileURL(path.join(projectRoot, 'app/lib/usage-cards.mjs')).href);
  const manifest = readJson(root, 'manifest.json');
  const row = manifest.find(item => `${item.lane}/${String(item.batch).padStart(2, '0')}` === batch);
  if (!row) throw new Error(`Batch is absent from manifest: ${batch}`);
  const assignment = readJson(root, row.assignment);
  const cards = readJson(root, row.cards);
  const blockers = [];
  const attention = [];
  const expected = new Map(assignment.map(item => [pair(item), item]));
  const seenPairs = new Set();
  const seenIds = new Set();
  const visible = new Map();

  if (!Array.isArray(cards) || cards.length !== row.count) blockers.push(report('scope.count', 'blocker', `Expected ${row.count} cards, got ${cards?.length ?? 'non-array'}.`));
  if (!Array.isArray(cards)) return {batch, phase, cards: 0, assignment: assignment.length, blockers, attention, summary:{blocking:blocks(blockers), attention:attention.length}};
  if (sha(fs.readFileSync(path.join(root, row.assignment))) !== row.hash) blockers.push(report('scope.assignment-drift', 'blocker', 'Assignment bytes differ from manifest hash.'));
  for (const card of cards) {
    const key = pair(card);
    if (seenPairs.has(key)) blockers.push(report('scope.duplicate-pair', 'blocker', `Duplicate assignment pair ${key}.`, [card.id]));
    seenPairs.add(key);
    if (seenIds.has(card.id)) blockers.push(report('scope.duplicate-id', 'blocker', `Duplicate card id ${card.id}.`, [card.id]));
    seenIds.add(card.id);
    const target = expected.get(key);
    if (!target) blockers.push(report('scope.out-of-assignment', 'blocker', `Card is outside the fixed assignment: ${key}.`, [card.id]));
    if (card.review !== 'draft') blockers.push(report('scope.source-not-draft', 'blocker', `Source card is not draft: ${card.id}.`, [card.id]));
    const structural = project.usageCardIssues([card]);
    if (structural.length) blockers.push(report('structure.card', 'blocker', structural.join(' | '), [card.id]));
    for (const field of ['scene', 'translation']) {
      const value = String(card[field] ?? '');
      if (!value.trim()) blockers.push(report(`content.empty-${field}`, 'blocker', `${field} is empty.`, [card.id]));
      if (kana.test(value) || japanesePunctuation.test(value)) blockers.push(report(`content.japanese-${field}`, 'blocker', `${field} contains Japanese kana or punctuation; likely field mix-up.`, [card.id]));
      if (placeholder.test(value)) blockers.push(report(`content.placeholder-${field}`, 'blocker', `${field} contains placeholder/template wording.`, [card.id]));
    }
    const resolved = resolveSentence(card, project);
    if (!resolved.sentence) blockers.push(report('sentence.unresolvable', 'blocker', `Cannot resolve target for ${card.id}.`, [card.id]));
    else {
      const outside = [...(card.before ?? []), ...(card.after ?? [])].map(part => part.text).join('');
      if (resolved.sentence.length > 2 && outside.includes(resolved.sentence)) blockers.push(report('sentence.answer-leak', 'blocker', `Complete sentence appears outside the target slot.`, [card.id]));
      if (resolved.sentence.length > 2 && outside.includes(project.resolveUsageCard(card).target.text)) blockers.push(report('sentence.target-leak', 'blocker', `Target text appears outside the target slot.`, [card.id]));
    }
    const fingerprint = JSON.stringify({scene:card.scene,before:card.before,after:card.after,translation:card.translation});
    const prior = visible.get(fingerprint);
    if (prior) blockers.push(report('content.duplicate-visible', 'blocker', `Visible teaching content is identical to ${prior}.`, [prior, card.id]));
    else visible.set(fingerprint, card.id);
    if (String(card.form).match(/Negative|Past/u) || String(card.form).includes('teshimau') || String(card.form).includes('tearu')) attention.push({id:card.id, reason:'negative/past/completion or preparation form needs explicit scope review'});
    if (!/[㐀-鿿]/u.test(resolved.sentence ?? '')) attention.push({id:card.id, reason:'full sentence has no kanji; confirm this is natural rather than a template shortcut'});
  }
  if (seenPairs.size !== assignment.length) blockers.push(report('scope.missing-pair', 'blocker', `Assignment has ${assignment.length} pairs; cards cover ${seenPairs.size}.`));

  if (phase === 'review') {
    const ledgerPath = `${batch}.review.json`;
    const ledger = readJson(root, ledgerPath);
    const cardById = new Map(cards.map(card => [card.id, card]));
    const reasons = new Map();
    for (const record of ledger) {
      const card = cardById.get(record.id);
      const current = card ? resolveSentence(card, project) : {sentence:null};
      if (!card || record.hash !== sha(JSON.stringify(card)) || record.sentence !== current.sentence) blockers.push(report('review.stale-ledger', 'blocker', `Review record does not match the current card: ${record.id}.`, [record.id]));
      const normalized = compact(record.reason);
      if (!normalized || genericReason.test(normalized)) blockers.push(report('review.generic-reason', 'blocker', `Reason is empty or generic for ${record.id}.`, [record.id]));
      if (reasons.has(normalized)) blockers.push(report('review.duplicate-reason', 'blocker', `Reason repeats ${reasons.get(normalized)}.`, [reasons.get(normalized), record.id]));
      else reasons.set(normalized, record.id);
    }
    if (ledger.length !== cards.length) blockers.push(report('review.scope', 'blocker', `Ledger has ${ledger.length} records for ${cards.length} cards.`));
  }
  return {batch, phase, cards: cards.length, assignment: assignment.length, blockers, attention, summary:{blocking:blocks(blockers), attention:attention.length}};
}
function blocks(items) { return items.filter(item => item.severity === 'blocker').length; }

function parseArgs(argv) {
  const out = {}; for (let i=0;i<argv.length;i++) { const arg=argv[i]; if (arg==='--task-root') out.taskRoot=argv[++i]; else if (arg==='--batch') out.batch=argv[++i]; else if (arg==='--phase') out.phase=argv[++i]; else if (arg==='--output') out.output=argv[++i]; else if (arg==='--fail-on-blockers') out.fail=true; else throw new Error(`Unknown option ${arg}`); }
  return out;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const options=parseArgs(process.argv.slice(2)); const result=await runReviewPreflight(options); const text=JSON.stringify(result,null,2)+'\n'; if(options.output)fs.writeFileSync(path.resolve(options.output),text); else process.stdout.write(text); if(options.fail && result.blockers.length)process.exitCode=1; }
  catch(error) { console.error(error.stack ?? error.message); process.exitCode=1; }
}
