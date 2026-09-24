import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {createDelivery} from '../.agents/skills/write-katsuyo-usage-cards/scripts/delivery-store.mjs';
import {cardHash, pair, sha} from '../.agents/skills/write-katsuyo-usage-cards/scripts/staged-quality.mjs';
import {exportIntegrationBatches, readReleaseProof, verifyReleaseProof} from '../scripts/export-integration-batches.mjs';
import {auditIntegrationCoverage} from '../scripts/audit-integration-coverage.mjs';

const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

// Synthetic infrastructure records only: no language judgement or personal
// learning data is needed to verify the publication evidence contract.
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'katsuyo-coverage-proof-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const taskRoot = path.join(root, 'task');
  fs.mkdirSync(taskRoot);
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, encode(value));
  };
  const card = {id: 'usage:synthetic-new', senseId: 'sense:synthetic-new', meaning: 'synthetic', form: 'integration-test',
    scene: 'Synthetic fixture', before: [{text: 'prefix ', reading: 'prefix '}], after: [{text: ' suffix', reading: ' suffix'}],
    translation: 'Synthetic translation', review: 'draft'};
  const historical = {...card, id: 'usage:synthetic-historical', senseId: 'sense:synthetic-historical', review: 'approved'};
  const unrelated = {...historical, id: 'usage:synthetic-other-stage', senseId: 'sense:other-stage', form: 'other-stage-test'};
  const assignment = [{senseId: card.senseId, form: card.form, answer: 'target', answerReading: 'target-reading'}];
  const authorArtifacts = {scope: assignment, cards: [card], notes: [{id: card.id, roles: 'Synthetic role'}], readings: {candidates: []}};
  const authorPaths = Object.fromEntries(Object.keys(authorArtifacts).map(name => [name, `author-work/demo/00/${name}.json`]));
  const author = createDelivery({root: taskRoot, batch: 'demo/00', phase: 'author', revision: 1,
    artifacts: new Map(Object.entries(authorArtifacts).map(([name, value]) => [authorPaths[name], encode(value)]))});
  const scopeHash = sha(encode(assignment)), cardSnapshotHash = sha(encode([card]));
  const reviewers = ['/root/synthetic_reviewer_one', '/root/synthetic_reviewer_two'];
  const reviews = Object.fromEntries(reviewers.map((reviewer, index) => {
    const report = {reviewer, selfReview: false, authorReceipt: author.receipt, scopeHash, cardSnapshotHash, count: 1,
      rows: [{id: card.id, hash: cardHash(card), sentence: 'prefix target suffix', status: 'approved',
        reason: 'Synthetic evidence fixture', roles: 'Synthetic roles', time: 'Synthetic time', negation: 'No synthetic negation',
        translation: card.translation, reading: 'Synthetic reading'}], candidates: []};
    const reportPath = `reviews/report-${index}.json`;
    const delivery = createDelivery({root: taskRoot, batch: 'demo/00', phase: 'review', revision: index + 1,
      artifacts: new Map([[reportPath, encode(report)]])});
    return [reviewer, {report: reportPath, receipt: delivery.receipt, delivery, review: report}];
  }));
  const summary = {version: 1, stage: 'pilot-01', batch: 'demo/00', status: 'approved', policy: 'coordinator-only', requiredReviews: 2,
    authorReceipt: author.receipt, scopeHash, cardSnapshotHash, count: 1,
    reviewerReceipts: Object.fromEntries(reviewers.map(reviewer => [reviewer, reviews[reviewer].receipt])),
    decisions: [{id: card.id, pair: pair(card), hash: cardHash(card), status: 'approved'}], candidates: []};
  const finalizationPath = 'reviews/finalization.json';
  const finalization = createDelivery({root: taskRoot, batch: 'demo/00', phase: 'review', revision: 3,
    artifacts: new Map([[finalizationPath, encode(summary)]])});
  const merged = [{...card, review: 'approved'}];
  const entry = {lane: 'demo', batch: 0, count: 1, assignment: 'demo/00.assignment.json', cards: 'demo/00.cards.json', hash: scopeHash};
  const stage = {id: 'pilot-01', batch: 'demo/00', kind: 'pilot', owner: '/root/synthetic_author', status: 'approved',
    paths: authorPaths, scopeHash, cardSnapshotHash, pairs: [pair(card)], delivery: author, reviewers, reviews,
    finalization: {report: finalizationPath, delivery: finalization}};
  write(path.join(taskRoot, 'manifest.json'), [entry]);
  write(path.join(taskRoot, entry.assignment), assignment);
  write(path.join(taskRoot, entry.cards), merged);
  write(path.join(taskRoot, 'staged-state/state.json'), {version: 3, requiredReviews: 2,
    batches: {'demo/00': {assignmentHash: scopeHash, entryHash: sha(JSON.stringify(entry)), stages: [stage], merged: {count: 1, hash: sha(encode(merged))}}}});
  const project = {resolveUsageCard: () => ({target: {text: 'target', reading: 'target-reading'}})};
  const result = exportIntegrationBatches({taskRoot, project, batches: ['demo/00'], baseline: [historical], outputDirectory: path.join(root, 'release')});
  const cards = [unrelated, historical, ...merged];
  const required = [historical, card].map(value => ({senseId: value.senseId, form: value.form, answerReading: 'target-reading'}));
  const requirements = path.join(root, 'requirements.json');
  write(requirements, {required, approved: required.map(pair), deferred: [], open: []});
  const runtimePath = path.join(root, 'app/lib/usage-cards.mjs');
  const setRuntime = value => {
    fs.mkdirSync(path.dirname(runtimePath), {recursive: true});
    fs.writeFileSync(runtimePath, `export const USAGE_CARDS = ${JSON.stringify(value)};\n`
      + 'export const resolveUsageCard = () => ({target:{text:"target",reading:"target-reading"}});\n'
      + 'export const usageCardIssues = () => [];\n'
      + `export const usageCardStageRequirements = stage => stage === 'integration' ? ${JSON.stringify(required.map(pair))} : [];\n`);
  };
  setRuntime(cards);
  const cardFile = path.join(root, 'formal-cards.json');
  write(cardFile, cards);
  const options = {project: root, requirements, proofPath: result.proofPath, strict: true};
  const setCards = value => write(cardFile, value);
  const setProof = value => write(result.proofPath, value);
  fs.rmSync(taskRoot, {recursive: true, force: true});
  return {root, options, cards, cardFile, setCards, setRuntime, setProof, proof: result.proof};
}

function reviewedNaturalnessSuccessor(f) {
  const old = f.proof.release.cards[1];
  const draft = {...old, scene: 'Reviewed replacement scene', review: 'draft'};
  const final = {...draft, review: 'approved'};
  const authorReceipt = 'a'.repeat(64), reviewReceipt = 'b'.repeat(64);
  const naturalness = {schemaVersion: 1, sourceCommit: 'synthetic-commit', activeCount: 2,
    sourceCards: f.proof.release.cards,
    statuses: f.proof.release.cards.map(card => ({id: card.id, sourceHash: sha(JSON.stringify(card)),
      status: 'approved', cardHash: sha(JSON.stringify(card.id === old.id ? final : card)),
      reviewReceipt: card.id === old.id ? reviewReceipt : 'c'.repeat(64)})),
    repairs: [{repairId: 'synthetic-repair-01', author: '/root/synthetic_author',
      reviewer: '/root/synthetic_independent_reviewer', authorReceipt, reviewReceipt,
      draft: [draft], rows: [{id: old.id, hash: sha(JSON.stringify(draft)), status: 'approved'}]}]};
  const naturalnessPath = path.join(f.root, 'naturalness-proof.json.gz');
  const setNaturalness = value => fs.writeFileSync(naturalnessPath, gzipSync(encode(value)));
  setNaturalness(naturalness);
  f.setRuntime(f.cards.map(card => card.id === old.id ? final : card));
  f.setCards(f.cards.map(card => card.id === old.id ? final : card));
  return {old, final, naturalness, naturalnessPath, setNaturalness,
    options: {...f.options, cards: f.cardFile, naturalnessProofPath: naturalnessPath}};
}

test('complete naturalness proof permits an exact independently reviewed integration successor', async t => {
  const f = fixture(t), successor = reviewedNaturalnessSuccessor(f);
  const report = await auditIntegrationCoverage(successor.options);
  assert.equal(report.valid, true, report.errors.join('\n'));
  assert.deepEqual(report.proof.changed, []);
  assert.equal(report.proof.reviewedSuccessors.length, 1);
  assert.equal(report.proof.reviewedSuccessors[0].id, successor.old.id);
  assert.equal(report.proof.reviewedSuccessors[0].author, '/root/synthetic_author');
  assert.equal(report.proof.reviewedSuccessors[0].reviewer, '/root/synthetic_independent_reviewer');
  assert.equal(report.integrity.fileIntegrityBasis, 'verified-proof-content');
});

test('naturalness successor cannot hide a changed source, stale final hash, or unreviewed edit', async t => {
  const f = fixture(t), successor = reviewedNaturalnessSuccessor(f);
  const altered = structuredClone(successor.naturalness);
  altered.sourceCards[1].scene = 'Different historical source';
  successor.setNaturalness(altered);
  let report = await auditIntegrationCoverage(successor.options);
  assert.equal(report.valid, false);
  assert.match(report.proof.naturalness.error, /missing or stale source status|source differs from integration release/);

  altered.sourceCards[1] = successor.old;
  altered.statuses[1].cardHash = '0'.repeat(64);
  successor.setNaturalness(altered);
  report = await auditIntegrationCoverage(successor.options);
  assert.equal(report.valid, false);
  assert.match(report.proof.naturalness.error, /final approval is missing or stale/);

  successor.setNaturalness(successor.naturalness);
  f.setCards(f.cards.map(card => card.id === successor.old.id
    ? {...successor.final, translation: 'Unreviewed translation'} : card));
  report = await auditIntegrationCoverage(successor.options);
  assert.equal(report.valid, false);
  assert.deepEqual(report.proof.changed, [successor.old.id]);
});

test('naturalness proof must cover the full frozen inventory with an independent repair reviewer', async t => {
  const f = fixture(t), successor = reviewedNaturalnessSuccessor(f);
  const altered = structuredClone(successor.naturalness);
  altered.statuses[0].status = 'uncertain';
  successor.setNaturalness(altered);
  let report = await auditIntegrationCoverage(successor.options);
  assert.equal(report.valid, false);
  assert.match(report.proof.naturalness.error, /unfinished reviews/);

  altered.statuses[0].status = 'approved';
  altered.repairs[0].reviewer = altered.repairs[0].author;
  successor.setNaturalness(altered);
  report = await auditIntegrationCoverage(successor.options);
  assert.equal(report.valid, false);
  assert.match(report.proof.naturalness.error, /provenance is invalid/);
});

test('reviewed successors still require the exact historical integration ID set', async t => {
  const f = fixture(t), successor = reviewedNaturalnessSuccessor(f);
  f.setCards(f.cards.filter(card => card.id !== successor.old.id));
  let report = await auditIntegrationCoverage(successor.options);
  assert.equal(report.valid, false);
  assert.deepEqual(report.proof.missing, [successor.old.id]);

  const extra = {...successor.final, id: 'usage:synthetic-extra', senseId: 'sense:synthetic-extra'};
  f.setCards([...f.cards.map(card => card.id === successor.old.id ? successor.final : card), extra]);
  report = await auditIntegrationCoverage(successor.options);
  assert.equal(report.valid, false);
  assert.deepEqual(report.proof.extra, [extra.id]);
});

test('strict proof coverage accepts exact historical objects and reviewed new cards without invented receipts', async t => {
  const f = fixture(t);
  const report = await auditIntegrationCoverage(f.options);
  assert.equal(report.valid, true, report.errors.join('\n'));
  assert.equal(report.proof.chainValid, true);
  assert.equal(report.proof.historicalCount, 1);
  assert.equal(report.proof.protocol3Count, 1);
  assert.equal(report.proof.sourceCount, 2);
  assert.equal(report.cards.count, 3, 'unrelated-stage card is permitted');
  assert.deepEqual(report.integrity.receiptMissing, []);
  assert.equal(report.integrity.fileIntegrityBasis, 'verified-proof-content');
  assert.equal(report.proof.sourceContentHash, report.proof.releaseContentHash);
});

test('explicit JSON sources can contain unrelated cards and reorder their exact integration objects', async t => {
  const f = fixture(t);
  f.setCards([...f.cards].reverse());
  const report = await auditIntegrationCoverage({...f.options, cards: f.cardFile});
  assert.equal(report.valid, true, report.errors.join('\n'));
  assert.equal(report.proof.contentMatches, true);
});

test('partial release keeps unreviewed requirements open and still rejects missing proof cards', async t => {
  const f = fixture(t);
  const requirements = JSON.parse(fs.readFileSync(f.options.requirements));
  const pending = 'sense:pending/integration-test';
  requirements.required.push(pending);
  requirements.open = [pending];
  fs.writeFileSync(f.options.requirements, encode(requirements));
  const valid = await auditIntegrationCoverage(f.options);
  assert.equal(valid.valid, true, valid.errors.join('\n'));
  assert.equal(valid.cards.approvedPairs.length, 2);
  assert.deepEqual(valid.open.pairs, [pending]);
  requirements.open.push(pair(f.proof.release.cards[1]));
  fs.writeFileSync(f.options.requirements, encode(requirements));
  assert.equal((await auditIntegrationCoverage(f.options)).valid, false, 'published cards cannot also be open');
  requirements.open = [pending];
  fs.writeFileSync(f.options.requirements, encode(requirements));
  f.setCards(f.cards.filter(card => card.id !== f.proof.release.cards[1].id));
  const omitted = await auditIntegrationCoverage({...f.options, cards: f.cardFile});
  assert.equal(omitted.valid, false);
  assert.deepEqual(omitted.proof.missing, [f.proof.release.cards[1].id]);
});

test('proof coverage rejects missing historical or protocol-3 cards', async t => {
  const f = fixture(t);
  for (const card of f.proof.release.cards) {
    f.setCards(f.cards.filter(value => value.id !== card.id));
    const report = await auditIntegrationCoverage({...f.options, cards: f.cardFile});
    assert.equal(report.valid, false);
    assert.deepEqual(report.proof.missing, [card.id]);
    assert.ok(report.errors.some(error => error.startsWith('Proof cards missing')));
  }
});

test('proof coverage rejects extra integration cards even outside the frozen eligible pairs', async t => {
  const f = fixture(t);
  const extra = {...f.cards[2], id: 'usage:synthetic-extra', senseId: 'sense:synthetic-extra'};
  f.setCards([...f.cards, extra]);
  const report = await auditIntegrationCoverage({...f.options, cards: f.cardFile});
  assert.equal(report.valid, false);
  assert.deepEqual(report.proof.extra, [extra.id]);
});

test('proof coverage detects content drift in both historical and newly reviewed objects', async t => {
  const f = fixture(t);
  for (const card of f.proof.release.cards) {
    f.setCards(f.cards.map(value => value.id === card.id ? {...value, translation: 'Unreviewed change'} : value));
    const report = await auditIntegrationCoverage({...f.options, cards: f.cardFile});
    assert.equal(report.valid, false);
    assert.deepEqual(report.proof.changed, [card.id]);
    assert.ok(report.integrity.receiptMissing.includes(card.id));
  }
});

test('runtime cards are compared to the proof as strictly as an explicit card file', async t => {
  const f = fixture(t);
  f.setRuntime(f.cards.map(value => value.id === f.cards[2].id ? {...value, scene: 'Unreviewed runtime change'} : value));
  const report = await auditIntegrationCoverage(f.options);
  assert.equal(report.valid, false);
  assert.deepEqual(report.proof.changed, [f.cards[2].id]);
});

test('a plausible receipt string cannot replace a valid portable review chain', async t => {
  const f = fixture(t);
  const altered = structuredClone(f.proof);
  const stage = altered.batches[0].stages[0];
  stage.reviews[1] = structuredClone(stage.reviews[0]);
  f.setProof(altered);
  const receiptPath = path.join(f.root, 'receipts.json');
  fs.writeFileSync(receiptPath, encode(Object.fromEntries(f.proof.release.cards.map(card => [card.id, 'a'.repeat(64)]))));
  const report = await auditIntegrationCoverage({...f.options, receipts: receiptPath, fileHash: sha(fs.readFileSync(path.join(f.root, 'app/lib/usage-cards.mjs')))});
  assert.equal(report.valid, false);
  assert.equal(report.proof.chainValid, false);
  assert.match(report.proof.error, /duplicate reviewer/);
});

test('proof coverage rejects a self-consistent release containing an unreviewed addition', async t => {
  const f = fixture(t);
  const altered = structuredClone(f.proof);
  altered.release.cards.push({...altered.release.cards[1], id: 'usage:unreviewed', senseId: 'sense:unreviewed'});
  const bytes = encode(altered.release.cards);
  altered.release.bytes = bytes.toString('base64');
  altered.release.fileHash = sha(bytes);
  f.setProof(altered);
  const report = await auditIntegrationCoverage(f.options);
  assert.equal(report.valid, false);
  assert.match(report.proof.error, /release differs from approved batches/);
});

test('explicit file hashes remain binding even when proof content is exact', async t => {
  const f = fixture(t);
  const goodHash = sha(fs.readFileSync(f.cardFile));
  const valid = await auditIntegrationCoverage({...f.options, cards: f.cardFile, fileHash: goodHash});
  assert.equal(valid.valid, true, valid.errors.join('\n'));
  assert.equal(valid.integrity.fileHashMatches, true);
  assert.equal(valid.integrity.fileIntegrityBasis, 'explicit-file-hash');
  const invalid = await auditIntegrationCoverage({...f.options, cards: f.cardFile, fileHash: '0'.repeat(64)});
  assert.equal(invalid.valid, false);
  assert.equal(invalid.proof.valid, true, 'valid proof never bypasses a contradictory explicit source hash');
  assert.ok(invalid.errors.some(error => error.startsWith('Formal card file hash mismatch')));
});

test('no-proof report and strict behavior retain their existing receipt and hash rules', async t => {
  const f = fixture(t);
  const options = {...f.options};
  delete options.proofPath;
  const report = await auditIntegrationCoverage({...options, strict: false});
  assert.equal(report.valid, true, report.errors.join('\n'));
  assert.equal(report.proof, undefined);
  assert.equal(report.integrity.receiptMissing.length, 2);
  const strict = await auditIntegrationCoverage(options);
  assert.equal(strict.valid, false);
  assert.ok(strict.errors.some(error => error.startsWith('Missing card receipts')));
  assert.ok(strict.errors.includes('Missing expected formal card file hash'));
});

test('CLI accepts --strict --proof-path and reports the verified formal subset', t => {
  const f = fixture(t);
  const script = fileURLToPath(new URL('../scripts/audit-integration-coverage.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--project', f.root, '--requirements', f.options.requirements,
    '--cards', f.cardFile, '--strict', '--proof-path', f.options.proofPath], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.valid, true, report.errors.join('\n'));
  assert.equal(report.proof.valid, true);
});

test('gzip proofs share the same reader and verification chain as JSON proofs', async t => {
  const f = fixture(t);
  const compressedPath = `${f.options.proofPath}.gz`;
  const bytes = gzipSync(encode(f.proof));
  fs.writeFileSync(compressedPath, bytes);
  assert.deepEqual(readReleaseProof(compressedPath), f.proof);
  assert.equal(verifyReleaseProof(compressedPath).valid, true);
  const report = await auditIntegrationCoverage({...f.options, proofPath: compressedPath});
  assert.equal(report.valid, true, report.errors.join('\n'));
  assert.equal(report.proof.fileHash, sha(bytes), 'audit identifies the actual compressed file');
  assert.equal(report.proof.sourceContentHash, report.proof.releaseContentHash);
});

test('damaged gzip streams and compressed proofs with broken receipts are both rejected', async t => {
  const f = fixture(t);
  const compressedPath = `${f.options.proofPath}.gz`;
  fs.writeFileSync(compressedPath, gzipSync(encode(f.proof)).subarray(0, 30));
  assert.throws(() => verifyReleaseProof(compressedPath), /cannot decompress proof/);
  const damaged = await auditIntegrationCoverage({...f.options, proofPath: compressedPath});
  assert.equal(damaged.valid, false);
  assert.match(damaged.proof.error, /cannot decompress proof/);
  const altered = structuredClone(f.proof);
  altered.batches[0].stages[0].reviews[0].delivery.manifest.receipt = '0'.repeat(64);
  fs.writeFileSync(compressedPath, gzipSync(encode(altered)));
  assert.throws(() => verifyReleaseProof(compressedPath), /receipt mismatch/);
  const brokenChain = await auditIntegrationCoverage({...f.options, proofPath: compressedPath});
  assert.equal(brokenChain.valid, false);
  assert.match(brokenChain.proof.error, /receipt mismatch/);
});
