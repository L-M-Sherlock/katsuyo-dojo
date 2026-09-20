import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createStagedWorkflow} from '../.agents/skills/write-katsuyo-usage-cards/scripts/staged-workflow.mjs';
import {sha, pair, cardHash, sentenceOf} from '../.agents/skills/write-katsuyo-usage-cards/scripts/staged-quality.mjs';

/*
 * Scaling contract tests.  These intentionally exercise the public workflow
 * boundary rather than writing formal cards.  A coordinator may dispatch more
 * than the original two/three workers, while each submitted snapshot remains
 * independently reviewable and conflicting reports cannot silently approve a
 * stage.
 */
function fixture(t, count = 8, laneCount = 6, workflowOptions = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'katsuyo-scale-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const rows = Array.from({length: count}, (_, i) => ({
    senseId: `verb:scale${i}:kana${i}`, meaning: `动作${i}`, class: 'godan',
    form: 'temiruDesire', answer: `ためす${i}`, answerReading: `ためす${i}`,
  }));
  const project = {
    usageCardItem: senseId => rows.find(r => r.senseId === senseId),
    resolveUsageCard: card => {
      const row = rows.find(r => pair(r) === pair(card));
      return row && row.meaning === card.meaning ? {...card, target: {text: row.answer, reading: row.answerReading}} : null;
    },
    usageCardIssues: () => [],
  };
  const manifest = [];
  for (let i = 0; i < laneCount; i++) {
    const lane = `scale${i}`;
    fs.mkdirSync(path.join(root, lane));
    const bytes = `${JSON.stringify(rows, null, 2)}\n`;
    fs.writeFileSync(path.join(root, lane, '00.assignment.json'), bytes);
    manifest.push({lane, batch: 0, course: 'multiStepCompound', count: rows.length,
      assignment: `${lane}/00.assignment.json`, cards: `${lane}/00.cards.json`, hash: sha(bytes)});
  }
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  const workflow = createStagedWorkflow({taskRoot: root, project, ...workflowOptions});
  const select = subset => subset.map(pair);
  const dispatch = (lane, owner) => workflow.run('dispatch', {actor: '/root', owner, batch: `${lane}/00`, kind: 'pilot', pairs: select(rows.slice(0, 3))});
  const write = job => {
    const scope = JSON.parse(fs.readFileSync(job.assignment));
    const cards = scope.map((r, i) => ({id: `usage:${r.form}:${r.senseId}`, senseId: r.senseId,
      meaning: r.meaning, form: r.form, scene: `在周末的练习记录中确认第${i + 1}项变化`, before: [{text: `文${i}を`, reading: `ぶん${i}を`}],
      after: [{text: '。', reading: '。'}], translation: `译文${i}`, review: 'draft'}));
    fs.writeFileSync(job.writable[0], JSON.stringify(cards));
    fs.writeFileSync(job.writable[1], JSON.stringify(cards.map(c => ({id: c.id, roles: '说话人和对象', object: '实际对象', time: '当前时段', negation: '不含否定'}))));
    return cards;
  };
  const readingRunner = async (input, output) => {
    const cards = JSON.parse(fs.readFileSync(input));
    fs.writeFileSync(output, JSON.stringify({cardsChecked: cards.length, structuralIssues: [], candidates: [], reviewCandidateCount: 0}));
  };
  const review = (cards, status = 'approved', suffix = '') => ({candidates: [], rows: cards.map((c, i) => ({
    id: c.id, hash: cardHash(c), sentence: sentenceOf(c, project).sentence, status,
    reason: `独立核对 ${i} ${suffix}`, roles: '核对角色', time: '核对时间', negation: '核对范围',
    translation: '核对译文', reading: '核对读音',
  }))});
  const submit = async job => {
    const options = {batch: job.batch, stage: job.stage, actor: job.owner};
    const checked = await workflow.run('check', {...options, readingRunner});
    if (checked.issues?.length) throw new Error(JSON.stringify(checked.issues));
    return workflow.run('submit', options);
  };
  return {root, rows, project, workflow, dispatch, write, submit, review, readingRunner};
}

test('coordinator can keep four author stages in flight, beyond the old three-stage cap', async t => {
  const f = fixture(t);
  await f.workflow.run('init', {actor: '/root', maxAuthors: 4, maxReviewQueue: 4, maxReviewers: 3, reviewPolicy: 'coordinator-only'});
  const jobs = [];
  for (let i = 0; i < 4; i++) jobs.push(await f.dispatch(`scale${i}`, `/root/author_${i}`));
  assert.equal(jobs.length, 4);
  for (const job of jobs) assert.equal(job.dispatched, true);
});

test('configured six-author pool backpressures the seventh stage', async t => {
  const f = fixture(t, 8, 7);
  await f.workflow.run('init', {
    actor: '/root', maxAuthors: 6, maxReviewQueue: 6, maxReviewers: 8,
    requiredReviews: 2, reviewPolicy: 'coordinator-only',
  });
  const jobs = [];
  for (let i = 0; i < 6; i++) jobs.push(await f.dispatch(`scale${i}`, `/root/author_${i}`));
  assert.equal(jobs.length, 6);
  await assert.rejects(
    f.dispatch('scale6', '/root/author_6'),
    /Author limit reached/,
  );
  const status = await f.workflow.run('status');
  assert.equal(status.config.maxAuthors, 6);
  assert.equal(status.stages.filter(stage => stage.status === 'writing').length, 6);
});

test('one submitted snapshot can be assigned three independent reviewers', async t => {
  const f = fixture(t);
  await f.workflow.run('init', {actor: '/root', maxAuthors: 4, maxReviewQueue: 4, maxReviewers: 3, reviewPolicy: 'coordinator-only'});
  const job = await f.dispatch('scale0', '/root/author');
  const cards = f.write(job);
  await f.submit(job);
  await f.workflow.run('assign-review', {actor: '/root', batch: job.batch, stage: job.stage, reviewer: '/root/reviewer_1'});
  await f.workflow.run('assign-review', {actor: '/root', batch: job.batch, stage: job.stage, reviewer: '/root/reviewer_2'});
  const first = f.review(cards, 'approved', '/root/reviewer_1');
  const second = f.review(cards, 'approved', '/root/reviewer_2');
  second.rows[0].status = 'rejected';
  await f.workflow.run('review', {actor: '/root/reviewer_1', batch: job.batch, stage: job.stage, review: first});
  await f.workflow.run('review', {actor: '/root/reviewer_2', batch: job.batch, stage: job.stage, review: second});
  const thirdPacket = await f.workflow.run('assign-review', {actor: '/root', batch: job.batch, stage: job.stage, reviewer: '/root/reviewer_3'});
  const state = JSON.parse(fs.readFileSync(path.join(f.root, 'staged-state/state.json')));
  assert.equal(state.batches[job.batch].stages[0].reviewers.length, 3);
  const thirdReview = f.review(cards, 'approved', '/root/reviewer_3');
  thirdReview.rows = [thirdReview.rows[0]];
  const result = await f.workflow.run('review', {actor: '/root/reviewer_3', batch: job.batch, stage: job.stage, review: thirdReview});
  assert.equal(result.status, 'submitted');
  const thirdPairs = thirdPacket.packet.reviewPairs
    ?? thirdPacket.packet.reviewScope?.pairs
    ?? thirdPacket.packet.reviewScope?.cardIds?.map(id => pair(cards.find(card => card.id === id)));
  assert.deepEqual(thirdPairs, [pair(cards[0])]);
});

test('reviewer registration is bounded at eight and rejects duplicate identities', async t => {
  const f = fixture(t);
  await f.workflow.run('init', {
    actor: '/root', maxAuthors: 6, maxReviewQueue: 6, maxReviewers: 8,
    requiredReviews: 2, reviewPolicy: 'coordinator-only',
  });
  const job = await f.dispatch('scale0', '/root/author');
  const cards = f.write(job);
  await f.submit(job);
  for (const reviewer of ['/root/reviewer_1', '/root/reviewer_2']) {
    await f.workflow.run('assign-review', {actor: '/root', batch: job.batch, stage: job.stage, reviewer});
  }
  const first = f.review(cards, 'approved', '/root/reviewer_1');
  const second = f.review(cards, 'approved', '/root/reviewer_2');
  second.rows[0].status = 'rejected';
  await f.workflow.run('review', {actor: '/root/reviewer_1', batch: job.batch, stage: job.stage, review: first});
  await f.workflow.run('review', {actor: '/root/reviewer_2', batch: job.batch, stage: job.stage, review: second});
  for (let i = 3; i <= 8; i++) {
    const reviewer = `/root/reviewer_${i}`;
    const {packet} = await f.workflow.run('assign-review', {actor: '/root', batch: job.batch, stage: job.stage, reviewer});
    const report = f.review(cards, 'approved', reviewer);
    report.rows = [report.rows[0]];
    fs.writeFileSync(packet.output, JSON.stringify({...report, reviewer, authorReceipt: packet.receipt}));
    await f.workflow.run('review', {actor: reviewer, batch: job.batch, stage: job.stage, reviewPath: packet.output});
  }
  await assert.rejects(
    f.workflow.run('assign-review', {
      actor: '/root', batch: job.batch, stage: job.stage, reviewer: '/root/reviewer_8',
    }),
    /already assigned/,
  );
  await assert.rejects(
    f.workflow.run('assign-review', {
      actor: '/root', batch: job.batch, stage: job.stage, reviewer: '/root/reviewer_9',
    }),
    /Reviewer limit reached/,
  );
});

test('concurrent author submissions serialize through the workflow lock', async t => {
  const f = fixture(t, 8, 2);
  await f.workflow.run('init', {
    actor: '/root', maxAuthors: 6, maxReviewQueue: 6, maxReviewers: 8,
    requiredReviews: 2, reviewPolicy: 'coordinator-only',
  });
  const first = await f.dispatch('scale0', '/root/author_a');
  const second = await f.dispatch('scale1', '/root/author_b');
  f.write(first); f.write(second);
  const [a, b] = await Promise.all([f.submit(first), f.submit(second)]);
  assert.equal(a.status, 'submitted');
  assert.equal(b.status, 'submitted');
  const status = await f.workflow.run('status');
  assert.equal(status.stages.filter(stage => stage.status === 'submitted').length, 2);
  assert.equal(fs.existsSync(path.join(f.root, 'staged-state/operation.lock')), false);
});

test('author leases heartbeat and require explicit reclaim after expiry', async t => {
  let at = '2026-09-20T00:00:00.000Z';
  const f = fixture(t, 8, 1, {now: () => at});
  await f.workflow.run('init', {
    actor: '/root', maxAuthors: 6, maxReviewQueue: 6, maxReviewers: 8,
    requiredReviews: 2, reviewPolicy: 'coordinator-only',
  });
  const job = await f.dispatch('scale0', '/root/lease_owner');
  assert.ok(job.leaseToken, 'dispatch must return an owner lease token');
  const heartbeat = await f.workflow.run('heartbeat', {
    actor: '/root/lease_owner', batch: job.batch, stage: job.stage, leaseToken: job.leaseToken,
  });
  assert.equal(heartbeat.owner, '/root/lease_owner');
  const before = JSON.parse(fs.readFileSync(path.join(f.root, 'staged-state/state.json')));
  const expiry = before.batches[job.batch].stages[0].lease.expiresAt;
  assert.ok(expiry);
  at = new Date(Date.parse(expiry) + 60_000).toISOString();
  await assert.rejects(
    f.workflow.run('heartbeat', {
      actor: '/root/lease_owner', batch: job.batch, stage: job.stage, leaseToken: job.leaseToken,
    }),
    /expired|lease/i,
  );
  const reclaimed = await f.workflow.run('reclaim', {
    actor: '/root', batch: job.batch, stage: job.stage, owner: '/root/recovered', reason: 'owner heartbeat expired',
  });
  assert.equal(reclaimed.owner, '/root/recovered');
  const after = JSON.parse(fs.readFileSync(path.join(f.root, 'staged-state/state.json')));
  const stage = after.batches[job.batch].stages[0];
  assert.equal(stage.owner, '/root/recovered');
  assert.ok(stage.previousOwners.some(row => row.owner === '/root/lease_owner'));
});

test('stale reviewer reports and immutable author snapshots cannot finalize', async t => {
  const f = fixture(t);
  await f.workflow.run('init', {
    actor: '/root', maxAuthors: 6, maxReviewQueue: 6, maxReviewers: 8,
    requiredReviews: 2, reviewPolicy: 'coordinator-only',
  });
  const job = await f.dispatch('scale0', '/root/author');
  const cards = f.write(job);
  await f.submit(job);
  const packet = (await f.workflow.run('assign-review', {
    actor: '/root', batch: job.batch, stage: job.stage, reviewer: '/root/reviewer_1',
  })).packet;
  const report = {...f.review(cards, 'approved', 'r1'), reviewer: '/root/reviewer_1', authorReceipt: packet.receipt};
  fs.writeFileSync(packet.output, JSON.stringify(report));
  await f.workflow.run('review', {
    actor: '/root/reviewer_1', batch: job.batch, stage: job.stage, reviewPath: packet.output,
  });
  const packet2 = (await f.workflow.run('assign-review', {
    actor: '/root', batch: job.batch, stage: job.stage, reviewer: '/root/reviewer_2',
  })).packet;
  fs.writeFileSync(packet2.output, JSON.stringify({
    ...f.review(cards, 'approved', 'r2'), reviewer: '/root/reviewer_2', authorReceipt: packet2.receipt,
  }));
  await f.workflow.run('review', {
    actor: '/root/reviewer_2', batch: job.batch, stage: job.stage, reviewPath: packet2.output,
  });
  const statePath = path.join(f.root, 'staged-state/state.json');
  const state = JSON.parse(fs.readFileSync(statePath));
  const stage = state.batches[job.batch].stages[0];
  const immutableCards = path.join(f.root, stage.delivery.files[stage.paths.cards]);
  fs.appendFileSync(immutableCards, ' ');
  await assert.rejects(
    f.workflow.run('finalize', {actor: '/root', batch: job.batch, stage: job.stage}),
    /artifact drift/,
  );
});

test('repairing reviewer packets invalidates old reports before a fresh review', async t => {
  const f = fixture(t);
  await f.workflow.run('init', {
    actor: '/root', maxAuthors: 6, maxReviewQueue: 6, maxReviewers: 8,
    requiredReviews: 2, reviewPolicy: 'coordinator-only',
  });
  const job = await f.dispatch('scale0', '/root/author');
  const cards = f.write(job);
  await f.submit(job);
  const packets = [];
  for (const reviewer of ['/root/reviewer_1', '/root/reviewer_2']) {
    const {packet} = await f.workflow.run('assign-review', {
      actor: '/root', batch: job.batch, stage: job.stage, reviewer,
    });
    packets.push({reviewer, packet});
    fs.writeFileSync(packet.output, JSON.stringify({
      ...f.review(cards, 'approved', reviewer), reviewer, authorReceipt: packet.receipt,
    }));
    await f.workflow.run('review', {
      actor: reviewer, batch: job.batch, stage: job.stage, reviewPath: packet.output,
    });
  }
  const before = JSON.parse(fs.readFileSync(path.join(f.root, 'staged-state/state.json')));
  const oldReceipts = Object.values(before.batches[job.batch].stages[0].reviews).map(entry => entry.receipt);
  const repaired = await f.workflow.run('repair-review-packets', {
    actor: '/root', batch: job.batch, stage: job.stage,
  });
  assert.equal(repaired.status, 'submitted');
  await assert.rejects(
    f.workflow.run('finalize', {actor: '/root', batch: job.batch, stage: job.stage}),
    /Missing independent reviewer report|immutable reviewer delivery|repair|stale/i,
  );
  const after = JSON.parse(fs.readFileSync(path.join(f.root, 'staged-state/state.json')));
  const newReviews = after.batches[job.batch].stages[0].reviews ?? {};
  assert.equal(Object.keys(newReviews).length, 0, 'repair must clear reports tied to the old packet');
  assert.ok(oldReceipts.length > 0);
  assert.notDeepEqual(repaired.packets.map(packet => packet.output), packets.map(({packet}) => packet.output));
});

test('a third reviewer receives only conflicting cards and cannot alter settled cards', async t => {
  const f = fixture(t);
  await f.workflow.run('init', {
    actor: '/root', maxAuthors: 6, maxReviewQueue: 6, maxReviewers: 3,
    requiredReviews: 2, reviewPolicy: 'coordinator-only',
  });
  const job = await f.dispatch('scale0', '/root/author');
  const cards = f.write(job);
  await f.submit(job);
  for (const reviewer of ['/root/reviewer_1', '/root/reviewer_2']) {
    const {packet} = await f.workflow.run('assign-review', {
      actor: '/root', batch: job.batch, stage: job.stage, reviewer,
    });
    const statuses = reviewer.endsWith('_1') ? 'approved' : 'rejected';
    const report = f.review(cards, 'approved', reviewer);
    if (reviewer.endsWith('_2')) report.rows[0].status = statuses;
    fs.writeFileSync(packet.output, JSON.stringify({...report, reviewer, authorReceipt: packet.receipt}));
    await f.workflow.run('review', {
      actor: reviewer, batch: job.batch, stage: job.stage, reviewPath: packet.output,
    });
  }
  const third = await f.workflow.run('assign-review', {
    actor: '/root', batch: job.batch, stage: job.stage, reviewer: '/root/reviewer_3',
  });
  const thirdPairs = third.packet.reviewPairs
    ?? third.packet.reviewScope?.pairs
    ?? third.packet.reviewScope?.cardIds?.map(id => pair(cards.find(card => card.id === id)));
  assert.deepEqual(thirdPairs, [pair(cards[0])]);
  const full = f.review(cards, 'approved', '/root/reviewer_3');
  const scoped = {...full, rows: [full.rows[0]], reviewer: '/root/reviewer_3', authorReceipt: third.packet.receipt};
  fs.writeFileSync(third.packet.output, JSON.stringify(scoped));
  await f.workflow.run('review', {
    actor: '/root/reviewer_3', batch: job.batch, stage: job.stage, reviewPath: third.packet.output,
  });
  const finalized = await f.workflow.run('finalize', {actor: '/root', batch: job.batch, stage: job.stage});
  assert.equal(finalized.status, 'approved');
  assert.deepEqual(finalized.conflicts, []);
});

test('conflicting independent decisions are surfaced and cannot be silently finalized', async t => {
  const f = fixture(t);
  await f.workflow.run('init', {actor: '/root', maxAuthors: 4, maxReviewQueue: 4, maxReviewers: 3, reviewPolicy: 'coordinator-only'});
  const job = await f.dispatch('scale0', '/root/author');
  const cards = f.write(job);
  await f.submit(job);
  await f.workflow.run('assign-review', {actor: '/root', batch: job.batch, stage: job.stage, reviewer: '/root/reviewer_1'});
  await f.workflow.run('assign-review', {actor: '/root', batch: job.batch, stage: job.stage, reviewer: '/root/reviewer_2'});
  await f.workflow.run('review', {actor: '/root/reviewer_1', batch: job.batch, stage: job.stage, review: f.review(cards, 'approved', 'approve')});
  await f.workflow.run('review', {actor: '/root/reviewer_2', batch: job.batch, stage: job.stage, review: f.review(cards, 'rejected', 'reject')});
  await assert.rejects(
    f.workflow.run('review', {actor: '/root', batch: job.batch, stage: job.stage, review: f.review(cards, 'approved', 'adjudication')}),
    /conflict|disagree|independent/i,
  );
  const result = await f.workflow.run('finalize', {actor: '/root', batch: job.batch, stage: job.stage});
  assert.equal(result.status, 'rejected');
  assert.equal(result.conflicts.length, cards.length);
});

test('coordinator finalization applies unanimous or majority rules without a semantic root review', async t => {
  const f = fixture(t);
  await f.workflow.run('init', {actor: '/root', maxAuthors: 4, maxReviewQueue: 4, maxReviewers: 3, reviewPolicy: 'consensus'});
  const job = await f.dispatch('scale0', '/root/author');
  const cards = f.write(job); await f.submit(job);
  for (const reviewer of ['/root/reviewer_1', '/root/reviewer_2']) {
    await f.workflow.run('assign-review', {actor: '/root', batch: job.batch, stage: job.stage, reviewer});
  }
  await f.workflow.run('review', {actor: '/root/reviewer_1', batch: job.batch, stage: job.stage, review: f.review(cards, 'approved', 'a')});
  const second = f.review(cards, 'approved', 'b');
  second.rows[0].status = 'rejected';
  await f.workflow.run('review', {actor: '/root/reviewer_2', batch: job.batch, stage: job.stage, review: second});
  // Introduce a disagreement, then add the third reviewer for the conflict set.
  const third = await f.workflow.run('assign-review', {actor: '/root', batch: job.batch, stage: job.stage, reviewer: '/root/reviewer_3'});
  const thirdPairs = third.packet.reviewPairs
    ?? third.packet.reviewScope?.pairs
    ?? third.packet.reviewScope?.cardIds?.map(id => pair(cards.find(card => card.id === id)));
  assert.deepEqual(thirdPairs, [pair(cards[0])]);
  const thirdReview = f.review(cards, 'approved', 'c');
  thirdReview.rows = [thirdReview.rows[0]];
  await f.workflow.run('review', {actor: '/root/reviewer_3', batch: job.batch, stage: job.stage, review: thirdReview});
  await assert.rejects(f.workflow.run('review', {actor: '/root', batch: job.batch, stage: job.stage, review: f.review(cards)}), /Coordinator-only/);
  const finalized = await f.workflow.run('finalize', {actor: '/root', batch: job.batch, stage: job.stage});
  assert.equal(finalized.status, 'approved');
});

test('real CLI consumes existing packet reports without overwriting them and pins every merge dependency', async t => {
  const f = fixture(t, 3);
  await f.workflow.run('init', {actor: '/root'});
  const job = await f.dispatch('scale0', '/root/author');
  const cards = f.write(job); await f.submit(job);
  const config = await f.workflow.run('configure', {actor: '/root', maxAuthors: 6, maxReviewQueue: 6, maxReviewers: 3, reviewPolicy: 'coordinator-only'});
  assert.equal(config.requiredReviews, 2);
  fs.mkdirSync(path.join(f.root, 'app/lib'), {recursive: true});
  fs.writeFileSync(path.join(f.root, 'app/lib/usage-cards.mjs'), `
    const rows = ${JSON.stringify(f.rows)};
    export const usageCardItem = senseId => rows.find(r => r.senseId === senseId);
    export const resolveUsageCard = card => {
      const r = rows.find(r => r.senseId === card.senseId && r.form === card.form);
      return r && r.meaning === card.meaning ? {...card, target: {text: r.answer, reading: r.answerReading}} : null;
    };
    export const usageCardIssues = () => [];
  `);
  const script = fileURLToPath(new URL('../.agents/skills/write-katsuyo-usage-cards/scripts/staged-workflow.mjs', import.meta.url));
  const cli = (command, args) => {
    const result = spawnSync(process.execPath, [script, command, '--project', f.root, '--task-root', f.root, ...args], {encoding: 'utf8', windowsHide: true});
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const options = {actor: '/root', batch: job.batch, stage: job.stage};
  for (let i = 1; i <= 2; i++) {
    const reviewer = `/root/reviewer_${i}`;
    const {packet} = await f.workflow.run('assign-review', {...options, reviewer});
    for (const key of ['cards', 'notes', 'readings', 'assignment']) {
      assert.ok(path.isAbsolute(packet[key]));
      assert.ok(packet[key].includes(`${path.sep}deliveries${path.sep}`));
      assert.ok(fs.existsSync(packet[key]));
    }
    const bytes = JSON.stringify({...f.review(cards, 'approved', reviewer), reviewer, authorReceipt: packet.receipt, auxiliaryMetadata: 'must not pollute canonical review'});
    fs.writeFileSync(packet.output, bytes);
    assert.equal(cli('review', ['--actor', reviewer, '--batch', job.batch, '--stage', job.stage, '--review', packet.output]).status, 'submitted');
    assert.equal(fs.readFileSync(packet.output, 'utf8'), bytes);
    if (i === 1) {
      await assert.rejects(f.workflow.run('finalize', options), /at least 2/);
      await assert.rejects(f.workflow.run('configure', {actor: '/root', reviewPolicy: 'consensus'}), /after reviewer reports/);
      await f.workflow.run('configure', {actor: '/root', maxAuthors: 7});
    }
  }
  assert.equal(cli('finalize', ['--actor', '/root', '--batch', job.batch, '--stage', job.stage]).status, 'approved');
  const state = JSON.parse(fs.readFileSync(path.join(f.root, 'staged-state/state.json')));
  const stage = state.batches[job.batch].stages[0];
  assert.deepEqual(Object.keys(stage.reviews['/root/reviewer_1'].review).sort(), ['candidates', 'rows']);
  const entry = stage.reviews['/root/reviewer_1'];
  const dependency = path.join(f.root, entry.delivery.files[entry.report]);
  const original = fs.readFileSync(dependency);
  fs.appendFileSync(dependency, ' ');
  await assert.rejects(f.workflow.run('merge', {actor: '/root', batch: job.batch}), /artifact drift/);
  fs.writeFileSync(dependency, original);
  assert.equal((await f.workflow.run('merge', {actor: '/root', batch: job.batch})).count, 3);
});

test('a waiting operation acquires the real check lock, while timeout never removes an active lock', async t => {
  const f = fixture(t);
  await f.workflow.run('init', {actor: '/root'});
  const job = await f.dispatch('scale0', '/root/author'); f.write(job);
  let entered, release;
  const ready = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const checking = f.workflow.run('check', {actor: job.owner, batch: job.batch, stage: job.stage,
    readingRunner: async (input, output) => { entered(); await gate; await f.readingRunner(input, output); }});
  await ready;
  const impatient = createStagedWorkflow({taskRoot: f.root, project: f.project, lockTimeoutMs: 20});
  await assert.rejects(impatient.run('status'), /lock is still held/);
  assert.ok(fs.existsSync(path.join(f.root, 'staged-state/operation.lock')));
  const waiting = f.workflow.run('status');
  release();
  assert.equal((await checking).status, 'checked');
  assert.equal((await waiting).stages[0].status, 'checked');
  assert.equal(fs.existsSync(path.join(f.root, 'staged-state/operation.lock')), false);
});
