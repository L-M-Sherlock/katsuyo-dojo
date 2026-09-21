// Structural and editorial screening only. This module never approves language.
import crypto from 'node:crypto';

export const sha = value => crypto.createHash('sha256').update(value).digest('hex');
export const pair = row => `${row.senseId}/${row.form}`;
export const cardHash = card => sha(JSON.stringify(card));
const normalized = text => String(text ?? '').normalize('NFKC').replace(/[\s。，、,.!！?？:：;；]/gu, '');
export function sentenceOf(card, project) {
  const resolved = project.resolveUsageCard(card);
  if (!resolved) throw new Error(`Unresolvable pair or metadata: ${card.id}`);
  const parts = [...card.before, resolved.target, ...card.after];
  return {sentence: parts.map(p => p.text).join(''), reading: parts.map(p => p.reading ?? p.text).join('')};
}

export function validateAssignment(rows, project) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Assignment must be a nonempty array');
  const seen = new Set();
  return rows.map(row => {
    const problems = [];
    if (seen.has(pair(row))) problems.push('duplicate-pair');
    seen.add(pair(row));
    const item = project.usageCardItem(row.senseId);
    const resolved = project.resolveUsageCard({senseId: row.senseId, meaning: row.meaning, form: row.form});
    if (!item || item.meaning !== row.meaning || item.class !== row.class) problems.push('lexical-metadata');
    if (!resolved) problems.push('unresolvable');
    if (resolved && (resolved.target.text !== row.answer || resolved.target.reading !== row.answerReading)) problems.push('target-changed');
    return {pair: pair(row), senseId: row.senseId, form: row.form, meaning: row.meaning,
      expected: {text: row.answer, reading: row.answerReading}, resolved: resolved?.target ?? null,
      status: problems.length ? 'pending-resolution' : 'valid', problems};
  });
}

export function screenCards(cards, assignment, project, {exact = true, requireReadings = true} = {}) {
  const issues = [], attention = [];
  if (!Array.isArray(cards) || !cards.length) return {issues: [{code: 'empty-cards'}], attention};
  const expected = new Map(assignment.map(row => [pair(row), row])), seen = new Set(), frames = new Map();
  const add = (code, card, detail) => issues.push({code, id: card.id, detail});
  for (const card of cards) {
    const key = pair(card), row = expected.get(key);
    if (/\?{3,}|\uFFFD/u.test(JSON.stringify(card))) add('encoding-damage', card);
    if (!row) add('outside-assignment', card, key);
    if (seen.has(key)) add('duplicate-pair', card, key);
    seen.add(key);
    if (card.id !== `usage:${card.form}:${card.senseId}`) add('id-mismatch', card);
    if (row && card.meaning !== row.meaning) add('meaning-mismatch', card, `Expected ${row.meaning}; got ${card.meaning}`);
    if (card.review !== 'draft') add('source-not-draft', card);
    for (const issue of project.usageCardIssues([card])) add('structure', card, issue);
    for (const field of ['scene', 'translation']) {
      if (/[ぁ-ゖァ-ヺ]/u.test(card[field] ?? '')) add(`japanese-${field}`, card);
      if (/(?:具体场景|具体安排下|某人|某事|这一行动|该动作|占位|待补|TODO|placeholder|……)/iu.test(card[field] ?? '')) add(`placeholder-${field}`, card);
    }
    if (normalized(card.scene) === normalized(card.translation)) add('translation-copies-scene', card);
    const outside = ['before', 'after'].flatMap(k => Array.isArray(card[k]) ? card[k] : []);
    if (requireReadings) for (const part of outside) {
      if (typeof part.reading !== 'string' || !part.reading.trim()) add('missing-reading', card, part.text);
    }
    const scaffold = outside.map(p => p?.text ?? '').join('');
    if (scaffold.length <= 24) {
      const frame = frames.get(scaffold) ?? [];
      frame.push(card); frames.set(scaffold, frame);
    }
    // Only flag vague processing when it replaces a different lexical action.
    // 扱う can legitimately mean 处理; this is not a banned Chinese word.
    if (/^passive/u.test(card.form) && /处理/u.test(card.translation) && !/处理|对待/u.test(card.meaning)) add('generic-passive-translation', card);
    attention.push({id: card.id, code: 'manual-semantics', detail: '核对角色、对象、时间、否定范围与译文；程序未判定自然度。'});
  }
  for (const group of frames.values()) if (new Set(group.map(c => c.senseId)).size > 1) {
    for (const card of group) add('repeated-short-scaffold', card);
  }
  if (exact) for (const row of assignment) if (!seen.has(pair(row))) issues.push({code: 'missing-pair', pair: pair(row)});
  return {issues, attention};
}

export function familyOf(form) {
  if (form.startsWith('causativeReceive')) return '使役＋てもらう';
  if (form.startsWith('causativeRequest')) return '使役许可请求';
  if (form.startsWith('temorau')) return 'てもらう＋愿望／可能／请求';
  if (form.startsWith('temiru')) return 'てみる＋愿望／请求／条件';
  if (form.startsWith('teoku')) return 'ておく＋请求／条件';
  if (form.startsWith('passive')) return '受身＋愿望／状态／遗憾';
  if (form.startsWith('potential')) return '可能＋礼貌／条件';
  if (form.startsWith('sugiru')) return 'すぎる＋否定请求';
  return '愿望条件';
}

export function makeReviewTable(cards, notes, project, readings = {candidates: []}) {
  const byNote = new Map(notes.map(row => [row.id, row]));
  const candidates = new Map(readings.candidates.map(row => [row.id, row]));
  const groups = new Map();
  for (const card of cards) {
    const family = familyOf(card.form);
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family).push(card);
  }
  const lines = ['# 主代理审核表', '', '角色、时间和否定范围来自作者说明，尚未核准；空白结论保持待审。', ''];
  const esc = x => String(x && typeof x === 'object' ? Object.entries(x).map(([k, v]) => `${k}：${v}`).join('；') : x ?? '待补').replaceAll('|', '\\|').replaceAll('\n', '<br>');
  for (const [family, rows] of groups) {
    lines.push(`## ${family}`, '', '| ID／形式 | 完整句／场景 | 角色／对象（作者） | 时间／否定范围（作者） | 译文 | reading／词典候选 | 主代理结论 |', '|---|---|---|---|---|---|---|');
    for (const card of rows) {
      const note = byNote.get(card.id), full = sentenceOf(card, project), candidate = candidates.get(card.id);
      lines.push(`| ${esc(card.id)} | ${esc(full.sentence)}<br>${esc(card.scene)} | ${esc(note?.roles)}<br>${esc(note?.object)} | ${esc(note?.time)}<br>${esc(note?.negation)} | ${esc(card.translation)} | ${esc(full.reading)}<br>${esc(candidate?.dictionaryReading ?? '无词典差异')} | 待审 |`);
    }
    lines.push('');
  }
  return lines.join('\n') + '\n';
}
