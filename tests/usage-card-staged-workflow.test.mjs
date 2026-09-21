import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStagedWorkflow} from '../.agents/skills/write-katsuyo-usage-cards/scripts/staged-workflow.mjs';
import {sha, pair, cardHash, screenCards, validateAssignment, sentenceOf, makeReviewTable} from '../.agents/skills/write-katsuyo-usage-cards/scripts/staged-quality.mjs';

function fixture(t, {invalid = false} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'katsuyo-stages-'));
  t.after(() => { assert.ok(path.basename(root).startsWith('katsuyo-stages-')); fs.rmSync(root, {recursive: true, force: true}); });
  const rows = Array.from({length: 12}, (_, i) => ({senseId: `verb:word${i}:kana${i}`, meaning: `动作${i}`, class: i === 2 ? 'irregular' : 'godan',
    form: i === 1 ? 'temiruDesirePast' : 'temiruDesire', answer: `ためす${i}`, answerReading: `ためす${i}`}));
  const project = {
    usageCardItem: senseId => rows.find(r => r.senseId === senseId),
    resolveUsageCard: card => { const r = rows.find(r => pair(r) === pair(card)); return r && card.meaning === r.meaning ? {...card, target: {text: r.answer, reading: r.answerReading}} : null; },
    usageCardIssues: () => [],
  };
  const stored = structuredClone(rows); if (invalid) stored[0].answer = 'stale';
  const manifest = ['demo', 'second', 'third', 'fourth'].map(lane => {
    fs.mkdirSync(path.join(root, lane));
    const bytes = JSON.stringify(stored, null, 2) + '\n';
    fs.writeFileSync(path.join(root, lane, '00.assignment.json'), bytes);
    return {lane, batch: 0, course: 'multiStepCompound', count: rows.length, assignment: `${lane}/00.assignment.json`, cards: `${lane}/00.cards.json`, hash: sha(bytes)};
  });
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  const w = createStagedWorkflow({taskRoot: root, project});
  const select = list => list.map(pair);
  const dispatch = (kind, subset, batch = 'demo/00', owner = '/root/writer') => w.run('dispatch', {actor: '/root', owner, batch, kind, pairs: select(subset)});
  const write = job => {
    const scope = JSON.parse(fs.readFileSync(job.assignment));
    const cards = scope.map(r => ({id: `usage:${r.form}:${r.senseId}`, senseId: r.senseId, meaning: r.meaning, form: r.form,
      scene: `场景${r.senseId}`, before: [{text: `対象${rows.indexOf(rows.find(x => pair(x) === pair(r)))}を`, reading: `たいしょう${rows.indexOf(rows.find(x => pair(x) === pair(r)))}を`}], after: [{text: '。', reading: '。'}], translation: `译文${r.senseId}`, review: 'draft'}));
    const notes = cards.map(c => ({id: c.id, roles: '作者说明角色', object: '目标对象', time: '本句时间', negation: '未否定'}));
    fs.writeFileSync(job.writable[0], JSON.stringify(cards)); fs.writeFileSync(job.writable[1], JSON.stringify(notes)); return cards;
  };
  const readingRunner = async (input, output) => {
    const cards = JSON.parse(fs.readFileSync(input));
    fs.writeFileSync(output, JSON.stringify({cardsChecked: cards.length, structuralIssues: [], candidates: [], reviewCandidateCount: 0}));
  };
  const review = cards => ({candidates: [], rows: cards.map((c, i) => ({id: c.id, hash: cardHash(c), sentence: sentenceOf(c, project).sentence,
    status: 'approved', reason: `Synthetic infrastructure decision ${i}`, roles: '核对角色', time: '核对时间', negation: '核对否定', translation: '核对译文', reading: '核对读音'}))});
  const submit = async job => {
    const options = {batch: job.batch, stage: job.stage, actor: job.owner};
    assert.deepEqual((await w.run('check', {...options, readingRunner})).issues, []);
    return w.run('submit', options);
  };
  const approve = async (job, cards) => w.run('review', {actor: '/root', batch: job.batch, stage: job.stage, review: review(cards)});
  return {root, rows, project, w, dispatch, write, readingRunner, submit, review, approve};
}

test('three stage gates prevent premature full generation, stale handoff and incomplete merge', async t => {
  const f = fixture(t); await f.w.run('init', {actor: '/root'});
  await assert.rejects(f.dispatch('expansion', f.rows.slice(0, 10)), /Pilot needs/);
  const pilot = await f.dispatch('pilot', f.rows.slice(0, 3)), cards = f.write(pilot);
  await assert.rejects(f.w.run('submit', {batch: pilot.batch, stage: pilot.stage, actor: pilot.owner}), /Check final/);
  await f.submit(pilot);
  await assert.rejects(f.dispatch('expansion', f.rows.slice(0, 10)), /active or submitted/);
  await assert.rejects(f.w.run('review', {actor: pilot.owner, batch: pilot.batch, stage: pilot.stage, review: f.review(cards)}), /Only main agent or assigned reviewer/);
  const stale = f.review(cards); stale.rows[0].hash = 'bad';
  await assert.rejects(f.w.run('review', {actor: '/root', batch: pilot.batch, stage: pilot.stage, review: stale}), /stale review/);
  await f.approve(pilot, cards);
  await assert.rejects(f.w.run('merge', {actor: '/root', batch: pilot.batch}), /expansion gates/);
  const expansion = await f.dispatch('expansion', f.rows.slice(0, 10)), expanded = f.write(expansion);
  await f.submit(expansion); await f.approve(expansion, expanded);
  await assert.rejects(f.w.run('merge', {actor: '/root', batch: pilot.batch}), /Unreviewed pair/);
  assert.equal(fs.existsSync(path.join(f.root, 'demo/00.cards.json')), false);
  const tail = await f.dispatch('remaining', f.rows.slice(10)), last = f.write(tail);
  await f.submit(tail); await f.approve(tail, last);
  await assert.rejects(f.w.run('merge', {actor: '/root/writer', batch: pilot.batch}), /Main agent only/);
  const merged = await f.w.run('merge', {actor: '/root', batch: pilot.batch});
  assert.equal(merged.count, 12);
  assert.deepEqual(new Set(JSON.parse(fs.readFileSync(merged.output)).map(pair)), new Set(f.rows.map(pair)));
  const metrics = (await f.w.run('metrics')).metrics;
  assert.equal(metrics.approvedPairs, 12); assert.equal(metrics.approvedLastHour, 12); assert.equal(metrics.firstPassRate, 1);
});

test('invalid assignment blocks dispatch and records exact pending pairs without changing the source', async t => {
  const f = fixture(t, {invalid: true}); await f.w.run('init', {actor: '/root'});
  const before = fs.readFileSync(path.join(f.root, 'demo/00.assignment.json'));
  const result = await f.dispatch('pilot', f.rows.slice(0, 3));
  assert.equal(result.dispatched, false); assert.equal(result.pending.length, 1);
  assert.deepEqual(result.pending[0].problems, ['target-changed']);
  assert.deepEqual(fs.readFileSync(path.join(f.root, 'demo/00.assignment.json')), before);
});

test('revoked merge preserves evidence and permits a fresh review before merging again', async t => {
  const f = fixture(t); await f.w.run('init', {actor: '/root'});
  const pilot = await f.dispatch('pilot', f.rows.slice(0, 3)), cards = f.write(pilot);
  await f.submit(pilot); await f.approve(pilot, cards);
  const expansion = await f.dispatch('expansion', f.rows), expanded = f.write(expansion);
  await f.submit(expansion); await f.approve(expansion, expanded);
  const merged = await f.w.run('merge', {actor: '/root', batch: pilot.batch});
  const before = JSON.parse(fs.readFileSync(merged.output));
  const options = {actor: '/root', batch: expansion.batch, stage: expansion.stage, reason: 'Reviewer withdrew report validity'};
  await assert.rejects(f.w.run('invalidate-merge', {...options, actor: '/root/writer'}), /Main agent only/);
  const withdrawn = await f.w.run('invalidate-merge', options);
  assert.deepEqual(JSON.parse(fs.readFileSync(withdrawn.backup)), before);
  assert.equal(fs.existsSync(merged.output), false);
  await assert.rejects(f.w.run('merge', {actor: '/root', batch: pilot.batch}), /finish reviews/);
  const state = JSON.parse(fs.readFileSync(path.join(f.root, 'staged-state/state.json')));
  assert.equal(state.batches[pilot.batch].mergeHistory.length, 1);
  assert.equal(state.batches[pilot.batch].stages.at(-1).status, 'submitted');
  assert.equal(state.protected['demo/00.cards.json'], null);
});

test('isolated authors cannot submit another owner stage or overwrite protected formal files', async t => {
  const f = fixture(t); await f.w.run('init', {actor: '/root'});
  const job = await f.dispatch('pilot', f.rows.slice(0, 3)); f.write(job);
  await assert.rejects(f.w.run('check', {batch: job.batch, stage: job.stage, actor: '/root/other', readingRunner: f.readingRunner}), /active stage author/);
  fs.writeFileSync(path.join(f.root, 'demo/00.cards.json'), '[]');
  await assert.rejects(f.w.run('check', {batch: job.batch, stage: job.stage, actor: job.owner, readingRunner: f.readingRunner}), /Protected file changed/);
});

test('changed draft, scope, or immutable submission invalidates checked handoffs', async t => {
  const f = fixture(t); await f.w.run('init', {actor: '/root'});
  const job = await f.dispatch('pilot', f.rows.slice(0, 3)), cards = f.write(job);
  const opts = {batch: job.batch, stage: job.stage, actor: job.owner};
  await f.w.run('check', {...opts, readingRunner: f.readingRunner});
  fs.appendFileSync(job.writable[0], ' ');
  await assert.rejects(f.w.run('submit', opts), /Stale stage check/);
  await f.submit(job);
  const state = JSON.parse(fs.readFileSync(path.join(f.root, 'staged-state/state.json'))), stage = state.batches[job.batch].stages[0];
  fs.appendFileSync(path.join(f.root, stage.delivery.files[stage.paths.cards]), ' ');
  await assert.rejects(f.approve(job, cards), /artifact drift/);
});

test('concurrency and review queue limits provide backpressure instead of large author waves', async t => {
  const f = fixture(t); await f.w.run('init', {actor: '/root', maxAuthors: 3, maxReviewQueue: 3});
  const a = await f.dispatch('pilot', f.rows.slice(0, 3)), b = await f.dispatch('pilot', f.rows.slice(0, 3), 'second/00', '/root/second');
  const c = await f.dispatch('pilot', f.rows.slice(0, 3), 'third/00', '/root/third');
  await assert.rejects(f.dispatch('pilot', f.rows.slice(0, 3), 'fourth/00', '/root/fourth'), /Author limit/);
  f.write(a); f.write(b); f.write(c); await f.submit(a); await f.submit(b); await f.submit(c);
  await assert.rejects(f.dispatch('pilot', f.rows.slice(0, 3), 'fourth/00', '/root/fourth'), /Review queue full/);
});

test('two actual failed revisions force a new pilot and first-pass metrics include mechanical failures', async t => {
  const f = fixture(t); await f.w.run('init', {actor: '/root'});
  const job = await f.dispatch('pilot', f.rows.slice(0, 3)), cards = f.write(job);
  const opts = {batch: job.batch, stage: job.stage, actor: job.owner, readingRunner: f.readingRunner};
  cards[0].translation = cards[0].scene; fs.writeFileSync(job.writable[0], JSON.stringify(cards));
  assert.equal((await f.w.run('check', opts)).incidents, 1);
  assert.equal((await f.w.run('check', opts)).incidents, 1, 'repeating same checker output is not a new revision');
  cards[1].translation = cards[1].scene; fs.writeFileSync(job.writable[0], JSON.stringify(cards));
  const result = await f.w.run('check', opts); assert.equal(result.needsPilot, true); assert.equal(result.status, 'rejected');
  await assert.rejects(f.dispatch('expansion', f.rows.slice(0, 10)), /Pilot needs/);
  const metrics = (await f.w.run('metrics')).metrics;
  assert.equal(metrics.firstPassApproved, 0); assert.equal(metrics.approvedPairs, 0);
});

test('screening detects observed placeholders but distinguishes actual assignment errors from card metadata errors', t => {
  const f = fixture(t), scope = f.rows.slice(0, 3);
  assert.ok(validateAssignment(scope, f.project).every(row => row.status === 'valid'));
  const cards = scope.map((r, i) => ({id: `usage:${r.form}:${r.senseId}`, senseId: r.senseId, form: r.form, meaning: r.meaning, review: 'draft',
    scene: `场景${i}`, translation: `译文${i}`, before: [{text: 'ここで', reading: ''}], after: [{text: '。', reading: '。'}]}));
  cards[0].meaning = 'changed'; cards[1].translation = 'これは日文'; cards[2].translation = cards[2].scene;
  const codes = screenCards(cards, scope, f.project).issues.map(i => i.code);
  for (const code of ['meaning-mismatch', 'japanese-translation', 'translation-copies-scene', 'missing-reading', 'repeated-short-scaffold']) assert.ok(codes.includes(code), code);
});

test('review tables group expressions and leave conclusions blank instead of manufacturing language evidence', t => {
  const f = fixture(t), r = f.rows[0];
  const c = {id: `usage:${r.form}:${r.senseId}`, ...r, before: [{text: '文を', reading: 'ぶんを'}], after: [{text: '。', reading: '。'}], scene: '场景', translation: '译文'};
  const notes = [{id: c.id, roles: '说话人执行', object: '文章', time: '过去愿望', negation: '不否定'}];
  const table = makeReviewTable([c], notes, f.project);
  for (const value of ['てみる＋愿望', '说话人执行', '过去愿望', '不否定', '待审']) assert.ok(table.includes(value));
  assert.ok(!table.includes('approved'));
});
