import { EXPECTED_CURRENT_TEACHING_HOLD_IDS } from './helpers/current-teaching-hold-scope.mjs';
import { EXPECTED_TEMIRU_FOLLOWUP_REVIEW_IDS } from './helpers/temiru-teaching-hold-scope.mjs';
import { EXPECTED_SHIMAU_TEXT_FIX_IDS } from './helpers/shimau-text-fix-scope.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { USAGE_CARDS, PRE_REVIEWED_USAGE_CARDS, REVIEWED_USAGE_CARDS, resolveUsageCard, usageCardItem } from '../app/lib/usage-cards.mjs';
import { EN_USAGE_CARD_OVERLAYS } from '../app/lib/i18n/content/en/usage-cards.mjs';
import { EN_REVIEWED_USAGE_CARD_OVERLAYS } from '../app/lib/i18n/content/en/reviewed-usage-card-revisions.mjs';
import { REVIEWED_USAGE_CARD_REVISIONS, REVIEWED_USAGE_CARD_DEFERRALS } from '../app/lib/usage-cards/reviewed-revisions.mjs';
import { isTeachingFormDeferred } from '../app/lib/teaching-form-deferrals.mjs';
import { TEACHING_PAIR_DEFERRALS } from '../app/lib/teaching-pair-deferrals.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { createDelivery } from '../.agents/skills/write-katsuyo-usage-cards/scripts/delivery-store.mjs';
import { revisionHash, verifyPortableRevisionDelivery, verifyReviewedUsageRevisions, verifyCurrentReviewedUsageRevisions } from '../scripts/verify-reviewed-usage-revisions.mjs';
import { verifyEnglishUsageReleaseProof } from '../scripts/verify-english-usage-release.mjs';

const teachingPairHeldIds = new Set(TEACHING_PAIR_DEFERRALS.map(row => row.id));
const clone = value => JSON.parse(JSON.stringify(value));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const ordered = rows => [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const checks = () => Object.fromEntries(['englishNatural', 'meaning', 'roles', 'timeAndPolarity', 'register', 'scene', 'noAnswerLeak'].map(key => [key, true]));

function fixture(t, otherForm) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'katsuyo-revision-proof-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const scope = PRE_REVIEWED_USAGE_CARDS.filter(card => card.form === 'temorauNegative').slice(0, 2);
  const other = PRE_REVIEWED_USAGE_CARDS.find(card => otherForm ? card.form === otherForm : card.form !== 'temorauNegative');
  const baselineCards = clone([...scope, other]);
  const englishById = new Map(EN_USAGE_CARD_OVERLAYS.map(row => [row.id, row]));
  const baselineOverlays = baselineCards.map(card => clone(englishById.get(card.id)));
  const draft = clone(scope);
  draft[0].review = 'draft';
  draft[0].translation += '（测试）';
  const notes = draft.map((card, index) => ({ id: card.id, disposition: index === 0 ? 'revise' : 'retain',
    reason: '隔离机械测试说明，不是正式教材审核。', roles: '隔离测试中的参与者关系。', time: '非过去。', negation: '否定受益动作。',
    english: { scene: 'This is isolated validation test material.', translation: 'The speaker does not ask for that help.',
      ...(card.note === undefined ? {} : { note: 'This note belongs only to an isolated test fixture.' }) } }));
  const revisions = draft.map((card, index) => {
    const final = { ...card, review: 'approved' };
    return { id: card.id, pair: `${card.senseId}/${card.form}`,
      previousHash: revisionHash(scope[index]), finalHash: revisionHash(final), card: final };
  });
  const englishRevisions = revisions.map((row, index) => ({ id: row.id, sourceHash: row.finalHash, ...notes[index].english }));
  const assignment = scope.map(card => ({ id: card.id, senseId: card.senseId, form: card.form, meaning: card.meaning,
    class: usageCardItem(card.senseId).class, answer: resolveUsageCard(card).target.text, answerReading: resolveUsageCard(card).target.reading }));
  const input = { version: 1, batch: 'fixture/00', count: scope.length, form: 'temorauNegative',
    rows: scope.map((card, index) => ({ id: card.id, sourceHash: revisionHash(card), card, english: baselineOverlays[index] })) };
  const paths = Object.fromEntries(['assignment', 'input', 'cards', 'notes', 'readings', 'checks', 'report']
    .map(key => [key, `fixture/${key}.json`]));
  const artifacts = new Map(Object.entries({ assignment, input, cards: draft, notes,
    readings: { candidates: [{ id: draft[0].id }], structuralIssues: [] }, checks: { fixture: true } })
    .map(([key, value]) => [paths[key], Buffer.from(`${JSON.stringify(value, null, 2)}\n`)]));
  const portable = (phase, files) => ({ ...createDelivery({ root, batch: 'fixture/00', phase, revision: 1, artifacts: files }),
    artifacts: Object.fromEntries([...files].map(([key, bytes]) => [key, bytes.toString('base64')])) });
  const authorDelivery = portable('author', artifacts);
  const report = { schemaVersion: 1, batchId: 'fixture/00', reviewer: '/root/fixture_reviewer', selfReview: false,
    sourceReceipt: authorDelivery.receipt, count: draft.length,
    rows: draft.map((card, index) => ({ id: card.id, hash: revisionHash(card), sourceHash: revisions[index].finalHash,
      sentence: [...card.before, resolveUsageCard(card).target, ...card.after].map(part => part.text).join(''),
      englishHash: revisionHash(englishRevisions[index]), status: 'approved',
      reason: `这是第${index + 1}条隔离测试证据，专门验证已冻结稿件的哈希绑定链，不是真实语言批准。`,
      roles: '机械测试角色。', time: '机械测试时间。', negation: '机械测试否定范围。',
      translation: '机械测试译文。', reading: '机械测试读音。',
      english: { reason: 'This is isolated mechanical validation evidence only.', checks: checks() } })),
    candidates: [{ id: draft[0].id, decision: 'retain', reason: '隔离测试的读音判断。' }] };
  const reviewDelivery = portable('review', new Map([[paths.report, Buffer.from(`${JSON.stringify(report, null, 2)}\n`)]]));
  const naturalnessProofSha256 = sha(fs.readFileSync(new URL('../docs/usage-card-naturalness-full-progress.v1.json.gz', import.meta.url)));
  const englishProofSha256 = 'b'.repeat(64);
  const proof = { schemaVersion: 1, baseline: { naturalnessProofSha256, englishProofSha256 },
    rounds: [{ id: 'isolated-fixture', form: 'temorauNegative', sourceCount: scope.length, sourceCards: clone(scope),
      batches: [{ id: 'fixture/00', author: '/root/fixture_author', authorModel: 'gpt-6-luna', authorEffort: 'max',
        reviewer: '/root/fixture_reviewer', reviewerModel: 'gpt-6-sol', reviewerEffort: 'medium',
        authorDelivery, reviewDelivery, paths }] }] };
  return { root, cards: [...revisions.map(row => row.card), other], baselineCards, baselineOverlays,
    revisions: ordered(revisions), englishRevisions: ordered(englishRevisions), proof,
    naturalnessProofSha256, englishProofSha256 };
}

function deferralFixture(t) {
  const data = fixture(t), round = data.proof.rounds[0], batch = round.batches[0];
  const deferredCard = data.baselineCards[1], id = deferredCard.id;
  const authorArtifacts = Object.fromEntries(Object.entries(batch.authorDelivery.artifacts)
    .map(([key, value]) => [key, JSON.parse(Buffer.from(value, 'base64'))]));
  const publish = (batchId, phase, revision, values) => {
    const files = new Map(Object.entries(values).map(([key, value]) => [key, Buffer.from(`${JSON.stringify(value, null, 2)}\n`)]));
    return { ...createDelivery({ root: data.root, batch: batchId, phase, revision, artifacts: files }),
      artifacts: Object.fromEntries([...files].map(([key, bytes]) => [key, bytes.toString('base64')])) };
  };
  const originalReport = JSON.parse(Buffer.from(batch.reviewDelivery.artifacts[batch.paths.report], 'base64'));
  const activeFiles = clone(authorArtifacts);
  for (const key of ['assignment', 'cards', 'notes']) activeFiles[batch.paths[key]] = activeFiles[batch.paths[key]].slice(0, 1);
  activeFiles[batch.paths.input].rows = activeFiles[batch.paths.input].rows.slice(0, 1);
  activeFiles[batch.paths.input].count = 1;
  batch.authorDelivery = publish(batch.id, 'author', 2, activeFiles);
  const activeReport = { ...originalReport, sourceReceipt: batch.authorDelivery.receipt, count: 1, rows: originalReport.rows.slice(0, 1) };
  batch.reviewDelivery = publish(batch.id, 'review', 2, { [batch.paths.report]: activeReport });
  const attempts = [];
  for (let number = 1; number <= 3; number++) {
    const rejected = number === 3;
    const paths = Object.fromEntries((rejected ? ['input', 'assignment', 'cards', 'notes', 'readings', 'checks', 'report']
      : ['input', 'assignment', 'cards', 'notes']).map(key => [key, `isolated-attempt-${number}/${key}.json`]));
    const draft = { ...clone(deferredCard), review: 'draft', translation: `${deferredCard.translation}（隔离测试新稿）` };
    const note = { ...clone(authorArtifacts[batch.paths.notes][1]),
      disposition: rejected ? 'revise' : 'no-credible-candidate',
      reason: `这是第${number}次隔离测试路线的完整失败说明，仅用于验证证据链，不代表真实教材句已审核或该语法不存在。`,
      evidence: [{ route: `隔离测试路线${number}`, finding: `第${number}次机械测试的独立证据摘要。` }] };
    const input = { ...clone(authorArtifacts[batch.paths.input]), count: 1,
      rows: [clone(authorArtifacts[batch.paths.input].rows[1])] };
    const values = { [paths.input]: input, [paths.assignment]: [authorArtifacts[batch.paths.assignment][1]],
      [paths.cards]: rejected ? [draft] : [], [paths.notes]: [note],
      ...(rejected ? { [paths.readings]: { candidates: [], structuralIssues: [] }, [paths.checks]: { fixture: true } } : {}) };
    const authorDelivery = publish('attempt/00', 'author', number, values);
    const attempt = { attemptNumber: number, kind: rejected ? 'rejected-draft' : 'no-credible-candidate',
      author: `/root/isolated_attempt_${number}`, authorModel: 'gpt-6-luna', authorEffort: 'max', authorDelivery, paths };
    if (rejected) {
      const final = { ...draft, review: 'approved' };
      const english = { id, sourceHash: revisionHash(final), ...note.english };
      const row = { ...clone(originalReport.rows[1]), hash: revisionHash(draft), sourceHash: revisionHash(final),
        englishHash: revisionHash(english), status: 'revise',
        sentence: [...draft.before, resolveUsageCard(draft).target, ...draft.after].map(part => part.text).join('') };
      row.english.checks.scene = false;
      const reviewer = '/root/isolated_rejection_reviewer';
      const report = { ...originalReport, batchId: 'attempt/00', reviewer, sourceReceipt: authorDelivery.receipt,
        count: 1, rows: [row], candidates: [] };
      Object.assign(attempt, { reviewer, reviewerModel: 'gpt-6-sol', reviewerEffort: 'medium', rejectionBasis: 'meaning',
        reviewDelivery: publish('attempt/00', 'review', number, { [paths.report]: report }) });
    }
    attempts.push(attempt);
  }
  const deferral = { id, pair: `${deferredCard.senseId}/${deferredCard.form}`, sourceHash: revisionHash(deferredCard),
    basis: 'three-failed-repair-attempts', reason: '隔离测试：三次不同的实际返修均未通过。', restoreCondition: '新证据和新句经独立审核后恢复。',
    previousUsage: { status: 'allowed', reason: '隔离测试中先前允许的精确配对。' }, attempts };
  round.deferrals = [deferral];
  data.cards = data.cards.filter(card => card.id !== id);
  data.revisions = data.revisions.filter(row => row.id !== id);
  data.englishRevisions = data.englishRevisions.filter(row => row.id !== id);
  data.deferrals = [{ id, pair: deferral.pair, sourceHash: deferral.sourceHash, basis: deferral.basis,
    reason: deferral.reason, restoreCondition: deferral.restoreCondition }];
  return data;
}

function appendSubsetRound(data) {
  const previous = clone(data.cards[0]), id = previous.id;
  const originalBatch = data.proof.rounds[0].batches[0];
  const originalNotes = JSON.parse(Buffer.from(originalBatch.authorDelivery.artifacts[originalBatch.paths.notes], 'base64'));
  const originalAssignment = JSON.parse(Buffer.from(originalBatch.authorDelivery.artifacts[originalBatch.paths.assignment], 'base64'));
  const originalReport = JSON.parse(Buffer.from(originalBatch.reviewDelivery.artifacts[originalBatch.paths.report], 'base64'));
  const previousEnglish = clone(data.englishRevisions.find(row => row.id === id));
  const draft = { ...clone(previous), review: 'draft', translation: `${previous.translation}（后续测试）` };
  const final = { ...draft, review: 'approved' };
  const note = { ...clone(originalNotes.find(row => row.id === id)), disposition: 'revise',
    english: { ...clone(originalNotes.find(row => row.id === id).english),
      scene: 'An isolated follow-up review revises this one card.', translation: 'The speaker no longer needs this particular help.' } };
  const english = { id, sourceHash: revisionHash(final), ...note.english };
  const paths = Object.fromEntries(['assignment', 'input', 'cards', 'notes', 'readings', 'checks', 'report']
    .map(key => [key, `subset/${key}.json`]));
  const publish = (phase, values) => {
    const artifacts = new Map(Object.entries(values).map(([key, value]) => [key, Buffer.from(`${JSON.stringify(value, null, 2)}\n`)]));
    return { ...createDelivery({ root: data.root, batch: 'subset/00', phase, revision: 1, artifacts }),
      artifacts: Object.fromEntries([...artifacts].map(([key, bytes]) => [key, bytes.toString('base64')])) };
  };
  const authorDelivery = publish('author', {
    [paths.assignment]: [originalAssignment.find(row => row.id === id)],
    [paths.input]: { count: 1, form: previous.form, rows: [{ id, sourceHash: revisionHash(previous), card: previous, english: previousEnglish }] },
    [paths.cards]: [draft], [paths.notes]: [note], [paths.readings]: { candidates: [], structuralIssues: [] }, [paths.checks]: { fixture: true },
  });
  const reviewer = '/root/subset_fixture_reviewer';
  const report = { ...originalReport, batchId: 'subset/00', reviewer, sourceReceipt: authorDelivery.receipt, count: 1,
    rows: [{ ...clone(originalReport.rows.find(row => row.id === id)), hash: revisionHash(draft), sourceHash: revisionHash(final), englishHash: revisionHash(english),
      sentence: [...draft.before, resolveUsageCard(draft).target, ...draft.after].map(part => part.text).join(''),
      reason: '这份隔离测试报告只覆盖后续指定的一张卡，验证它以前次批准对象为源且未改其他对象。' }], candidates: [] };
  const batch = { id: 'subset/00', author: '/root/subset_fixture_author', authorModel: 'gpt-6-luna', authorEffort: 'max',
    reviewer, reviewerModel: 'gpt-6-sol', reviewerEffort: 'medium', authorDelivery,
    reviewDelivery: publish('review', { [paths.report]: report }), paths };
  data.proof.rounds.push({ id: 'isolated-subset-followup', form: previous.form, scopeIds: [id],
    sourceCount: 1, sourceCards: [previous], batches: [batch] });
  const revision = { id, pair: `${previous.senseId}/${previous.form}`, previousHash: revisionHash(previous), finalHash: revisionHash(final), card: final };
  data.cards = data.cards.map(card => card.id === id ? final : card);
  data.revisions = ordered(data.revisions.map(row => row.id === id ? revision : row));
  data.englishRevisions = ordered(data.englishRevisions.map(row => row.id === id ? english : row));
  return data;
}

test('portable bilingual revisions verify retained and changed cards against actual delivery-store bytes', t => {
  const data = fixture(t);
  assert.deepEqual(verifyReviewedUsageRevisions(data), { rounds: 1, sourceCount: 2, reviewedCount: 2, approvedCount: 2,
    deferredCount: 0, changedCount: 1, baselineCount: 3, cardCount: 3, teachingHeldCount: 0 });
  const delivery = data.proof.rounds[0].batches[0].authorDelivery;
  const changed = clone(delivery);
  changed.artifacts[Object.keys(changed.artifacts)[0]] = Buffer.from('[]').toString('base64');
  assert.throws(() => verifyPortableRevisionDelivery(changed, 'author', 'fixture/00'), /artifact drift/);
  const receipt = clone(delivery); receipt.receipt = '0'.repeat(64);
  assert.throws(() => verifyPortableRevisionDelivery(receipt, 'author', 'fixture/00'), /receipt drift/);
});

test('the teaching projection applies after complete review verification and leaves the frozen round unchanged', t => {
  const data = fixture(t, 'temiruNegativePast'), reviewedCards = [...data.cards], frozenProof = clone(data.proof);
  const held = reviewedCards[2];
  assert.ok(isTeachingFormDeferred(held.form));
  data.cards = reviewedCards.filter(card => !isTeachingFormDeferred(card.form));
  const summary = verifyReviewedUsageRevisions(data);
  assert.equal(summary.baselineCount, 3);
  assert.equal(summary.reviewedCount, 2);
  assert.equal(summary.deferredCount, 0, 'a user-directed form hold is separate from language-review exact deferrals');
  assert.equal(summary.teachingHeldCount, 1);
  assert.equal(summary.cardCount, 2);
  assert.deepEqual(data.proof, frozenProof);
  assert.deepEqual(data.cards, reviewedCards.slice(0, 2));
  assert.throws(() => verifyReviewedUsageRevisions({ ...data, cards: reviewedCards }), /Current cards differ/,
    'historical approval does not restore a held form');
  assert.throws(() => verifyReviewedUsageRevisions({ ...data, cards: data.cards.slice(1) }), /Current cards differ/,
    'a form hold cannot hide removal of a card outside that form');
  const changed = clone(data);
  changed.cards[0].scene += '范围外修改';
  assert.throws(() => verifyReviewedUsageRevisions(changed), /Current cards differ/);
});

test('committed successor evidence preserves both old rounds while new reviews and teaching holds remain distinct', () => {
  const proof = JSON.parse(fs.readFileSync(new URL('../docs/usage-card-reviewed-revisions.v1.json', import.meta.url)));
  const historicalRounds = proof.rounds.slice(0, 2);
  assert.deepEqual(historicalRounds.map(round => round.id), [
    'temorau-negative-20261016', 'temorau-negative-mamoru-followup-20261016',
  ]);
  assert.deepEqual(historicalRounds.map(revisionHash), [
    'e8893d2134e5715dace44a786f0a8736727483093d5cac0bb77bfc740a4244cd',
    '1e67ebc5ebbc947ef2818861bf92593c320a84b04ea8b3b185d9af2c2cfcc278',
  ], 'every source, frozen delivery and independent report in each old round is immutable');
  const historicalProof = { schemaVersion: proof.schemaVersion, baseline: proof.baseline,
    rounds: historicalRounds, scopePreservation: {
      unaffectedCardCount: 17137,
      unaffectedCardsHash: 'eb4474a4117f05559c92d03a19f620066f9cbf2adc8b34be17d14911a7966c80',
      unaffectedEnglishCount: 17137,
      unaffectedEnglishHash: '94e91b1c5b9e83e1c483ed168580271e4a4fd6ce00a43e323881d1de4252df3c',
    } };
  assert.equal(sha(`${JSON.stringify(historicalProof, null, 2)}\n`),
    'ddd0f0e6aba0fed7e772ccbd7c30ad2eb1075de1c96e8da17647234e6065975b',
    'the original portable proof can still be reconstructed byte for byte');
  const historicalRevisions = REVIEWED_USAGE_CARD_REVISIONS.filter(row => row.card.form === 'temorauNegative');
  const historicalIds = new Set(historicalRounds[0].sourceCards.map(card => card.id));
  const historicalEnglish = EN_REVIEWED_USAGE_CARD_OVERLAYS.filter(row => historicalIds.has(row.id));
  const historicalDeferrals = REVIEWED_USAGE_CARD_DEFERRALS.filter(row => historicalIds.has(row.id));
  assert.equal(revisionHash(historicalRevisions), 'f67d4f4db1cb3bebca392f2280c099b5d9f7c17a91961c07865f2755ef405ca1');
  assert.equal(revisionHash(historicalEnglish), 'a341212843d2f503564bf105b2a9e16649676ef29716f857bb9fe118c8674ebd');
  assert.equal(revisionHash(historicalDeferrals), '8bd58979b68a56b18079971bb56a9ccb99e12719728586e8c59d1b7b9b632942');
  assert.equal(historicalRounds.reduce((sum,round)=>sum+round.sourceCount,0),125);
  assert.equal(historicalRevisions.length,123);
  assert.equal(historicalRevisions.filter(row=>row.previousHash!==row.finalHash).length,76);
  for(const round of historicalRounds)for(const batch of round.batches){
    verifyPortableRevisionDelivery(batch.authorDelivery,'author',batch.id);
    verifyPortableRevisionDelivery(batch.reviewDelivery,'review',batch.id);
  }
  // Current exact holds bind a later source version. Verify the frozen prefix
  // as history and let the complete live verifier replay every old round first.
  assert.equal(revisionHash(proof.rounds.slice(0,3)),
    '5a3cfce61cd315cd4c20ca69dbaae3ce0bc591da535bc3eba2410b7b5aa5e224');
  const invitation = proof.rounds[2];
  assert.equal(invitation.id,'temiru-negative-invitation-20261017');
  assert.equal(revisionHash(invitation),'03678576ffdfe12e63c4e95193ab751571783c7da9036397d1aef9d4f20a7276');
  assert.equal(invitation.sourceCount,123);
  const followups=proof.rounds.slice(3,9);
  assert.equal(followups.length,6);
  assert.ok(followups.every(round=>Array.isArray(round.scopeIds)&&round.scopeIds.length===round.sourceCount));
  assert.equal(followups.reduce((sum,round)=>sum+round.sourceCount,0),13);
  const followupIds=followups.flatMap(round=>round.scopeIds);
  assert.equal(new Set(followupIds).size,13);
  assert.deepEqual(new Set(followupIds),EXPECTED_TEMIRU_FOLLOWUP_REVIEW_IDS);
  assert.ok(followupIds.every(id=>!teachingPairHeldIds.has(id)));
  const previousRounds=proof.rounds.slice(0,9);
  assert.equal(revisionHash(previousRounds),
    '49eeb59cee4eaec0a23c76c12dc36a9d33b8491ac12e588d2c323fabbe12b42b',
    'the nine rounds before shimau text repairs remain immutable');
  assert.equal(previousRounds.reduce((sum,round)=>sum+round.sourceCount,0),261);
  const previousRows=new Map();
  let previousReviewedCount=0;
  for(const round of previousRounds){
    const sources=new Map(round.sourceCards.map(card=>[card.id,card]));
    for(const batch of round.batches){
      const authorFiles=verifyPortableRevisionDelivery(batch.authorDelivery,'author',batch.id);
      const reviewFiles=verifyPortableRevisionDelivery(batch.reviewDelivery,'review',batch.id);
      const cards=JSON.parse(authorFiles.get(batch.paths.cards));
      const report=JSON.parse(reviewFiles.get(batch.paths.report));
      assert.deepEqual(report.rows.map(row=>row.id),cards.map(card=>card.id));
      for(const [index,card] of cards.entries()){
        const final={...card,review:'approved'},row=report.rows[index];
        assert.equal(row.status,'approved',card.id);
        assert.equal(row.sourceHash,revisionHash(final),card.id);
        previousRows.set(card.id,{previousHash:revisionHash(sources.get(card.id)),finalHash:revisionHash(final)});
        previousReviewedCount++;
      }
    }
    for(const row of round.deferrals??[])previousRows.delete(row.id);
  }
  assert.equal(previousReviewedCount,260);
  assert.equal([...previousRows.values()].filter(row=>row.previousHash!==row.finalHash).length,202);
  const textFixes=proof.rounds.slice(9);
  assert.equal(textFixes.length,6);
  assert.deepEqual(textFixes.map(round=>round.id),[
    'shimau-text-fix-20261026-chau', 'shimau-text-fix-20261026-teshimau',
    'shimau-text-fix-20261026-teshimauPast', 'shimau-text-fix-20261026-teshimauNegative',
    'shimau-text-fix-20261026-teshimauNegativePast', 'shimau-text-fix-20261026-passiveCompletionPast',
  ]);
  assert.equal(textFixes.reduce((sum,round)=>sum+round.sourceCount,0),17);
  const textFixIds=textFixes.flatMap(round=>round.scopeIds);
  assert.equal(new Set(textFixIds).size,17);
  assert.deepEqual(new Set(textFixIds),EXPECTED_SHIMAU_TEXT_FIX_IDS);
  for(const round of textFixes){
    assert.equal(round.scopeIds.length,round.sourceCount,round.id);
    assert.deepEqual(round.sourceCards.map(card=>card.id),round.scopeIds,round.id);
    assert.ok(round.sourceCards.every(card=>card.form===round.form),round.id);
    assert.deepEqual(round.deferrals??[],[],round.id);
  }
  assert.ok(textFixIds.every(id=>!teachingPairHeldIds.has(id)));
  const summary = verifyCurrentReviewedUsageRevisions();
  const {changedCount,...currentScopeSummary}=summary;
  assert.deepEqual(currentScopeSummary,{rounds:15,sourceCount:278,reviewedCount:277,approvedCount:277,
    deferredCount:1,baselineCount:17261,cardCount:17035,teachingHeldCount:225});
  // The original nine-round count remains 202. The approved successor adds
  // ten changed canonical cards while retaining seven canonical objects.
  assert.equal(changedCount,212);
  assert.equal(changedCount,REVIEWED_USAGE_CARD_REVISIONS.filter(row=>row.previousHash!==row.finalHash).length);
  assert.equal(REVIEWED_USAGE_CARDS.length,summary.baselineCount-summary.deferredCount);
  assert.equal(USAGE_CARDS.length,REVIEWED_USAGE_CARDS.length-summary.teachingHeldCount);
  const reviewedIds = new Set(REVIEWED_USAGE_CARDS.map(card => card.id));
  const currentIds = new Set(USAGE_CARDS.map(card => card.id));
  const formHeldIds = new Set(REVIEWED_USAGE_CARDS.filter(card => isTeachingFormDeferred(card.form)).map(card => card.id));
  assert.equal(formHeldIds.size, 122);
  assert.deepEqual(teachingPairHeldIds, EXPECTED_CURRENT_TEACHING_HOLD_IDS);
  const heldIds = new Set([...formHeldIds, ...teachingPairHeldIds]);
  assert.equal(heldIds.size, 225);
  assert.deepEqual(new Set([...reviewedIds].filter(id => !currentIds.has(id))), heldIds);
  for (const row of REVIEWED_USAGE_CARD_DEFERRALS) {
    assert.ok(!reviewedIds.has(row.id) && !currentIds.has(row.id) && !heldIds.has(row.id), row.id);
  }
  const options = { cards: REVIEWED_USAGE_CARDS, baselineCards: PRE_REVIEWED_USAGE_CARDS,
    baselineOverlays: EN_USAGE_CARD_OVERLAYS, revisions: REVIEWED_USAGE_CARD_REVISIONS,
    englishRevisions: EN_REVIEWED_USAGE_CARD_OVERLAYS, deferrals: REVIEWED_USAGE_CARD_DEFERRALS };
  assert.throws(() => verifyReviewedUsageRevisions(options), /Current cards differ/,
    'a full set of previous approvals does not bypass the current teaching hold');
});

test('the portable form-hold record preserves every source object and its complete initial audit', () => {
  const record = JSON.parse(fs.readFileSync(new URL('../docs/usage-card-temiru-negative-past-hold-20261017.json', import.meta.url)));
  const heldCards = REVIEWED_USAGE_CARDS.filter(card => isTeachingFormDeferred(card.form));
  const englishById = new Map(EN_USAGE_CARD_OVERLAYS.map(row => [row.id, row]));
  const sourceById = new Map(record.sourceRows.map(row => [row.id, row]));
  assert.equal(record.form, 'temiruNegativePast');
  assert.equal(record.basis, 'user-directed-teaching-hold');
  assert.equal(record.sourceCount, 122);
  assert.equal(sourceById.size, 122);
  assert.deepEqual(record.sourceRows.map(row => row.card), heldCards);
  assert.equal(record.sourceCardsHash, revisionHash(heldCards));
  assert.equal(record.sourceEnglishHash, revisionHash(record.sourceRows.map(row => row.english)));
  for (const row of record.sourceRows) {
    assert.equal(row.pair, `${row.card.senseId}/${row.card.form}`, row.id);
    assert.equal(row.sourceHash, revisionHash(row.card), row.id);
    assert.deepEqual(row.english, englishById.get(row.id), row.id);
    assert.equal(row.english.sourceHash, row.sourceHash, row.id);
    assert.equal(row.englishHash, revisionHash(row.english), row.id);
  }
  assert.equal(record.initialAudit.batches.length, 8);
  const reviewedIds = new Set(), counts = { approved: 0, revise: 0 };
  for (const batch of record.initialAudit.batches) {
    const sourceFiles = verifyPortableRevisionDelivery(batch.sourceDelivery, 'author', batch.id);
    const reviewFiles = verifyPortableRevisionDelivery(batch.reviewDelivery, 'review', batch.id);
    assert.equal(sourceFiles.size, 1, batch.id);
    assert.equal(reviewFiles.size, 1, batch.id);
    const input = JSON.parse([...sourceFiles.values()][0]);
    const report = JSON.parse([...reviewFiles.values()][0]);
    assert.equal(input.count, input.rows.length, batch.id);
    assert.equal(report.count, report.rows.length, batch.id);
    assert.equal(report.sourceReceipt, batch.sourceDelivery.receipt, batch.id);
    assert.equal(report.reviewer, batch.reviewer, batch.id);
    assert.notEqual(batch.reviewer, batch.sourceOwner, batch.id);
    assert.equal(report.selfReview, false, batch.id);
    const reportById = new Map(report.rows.map(row => [row.id, row]));
    assert.deepEqual(new Set(input.rows.map(row => row.id)), new Set(reportById.keys()), batch.id);
    for (const source of input.rows) {
      const row = sourceById.get(source.id), review = reportById.get(source.id);
      assert.ok(row && review && !reviewedIds.has(source.id), source.id);
      reviewedIds.add(source.id);
      assert.deepEqual(source.card, row.card, source.id);
      assert.deepEqual(source.english, row.english, source.id);
      assert.equal(source.sourceHash, row.sourceHash, source.id);
      assert.equal(review.sourceHash, row.sourceHash, source.id);
      const target = deriveUnified(usageCardItem(row.card.senseId), row.card.form).answer;
      const sentence = [...row.card.before, { text: target }, ...row.card.after].map(part => part.text).join('');
      assert.equal(source.sentence, sentence, source.id);
      assert.equal(review.sentence, sentence, source.id);
      assert.ok(Object.hasOwn(counts, review.status), source.id);
      counts[review.status] += 1;
    }
  }
  assert.deepEqual(reviewedIds, new Set(sourceById.keys()));
  assert.deepEqual(counts, { approved: 56, revise: 66 });
  assert.deepEqual(record.initialAudit.counts, counts);
  assert.ok(record.stoppedRepairs.every(row => row.files.length === 0), 'interrupted authors supplied no approved successor cards');
  assert.ok(USAGE_CARDS.every(card => !reviewedIds.has(card.id)), 'all initial dispositions remain held pending an explicit restoration');
});

test('revision proof rejects incomplete scope, baseline drift, unreviewed edits and fabricated reviewer identity', t => {
  const data = fixture(t);
  for (const mutate of [
    value => { value.proof.rounds[0].sourceCards.pop(); },
    value => { value.proof.rounds[0].sourceCards[0].scene += '变化'; },
    value => { value.cards[2].scene += '变化'; },
    value => { value.revisions[0].finalHash = '0'.repeat(64); },
    value => { value.englishRevisions[0].translation = 'Unreviewed English.'; },
    value => { value.proof.rounds[0].batches[0].reviewer = '/root/fixture_author'; },
    value => { value.proof.baseline.englishProofSha256 = '0'.repeat(64); },
    value => { value.proof = null; },
  ]) {
    const changed = clone(data); mutate(changed);
    assert.throws(() => verifyReviewedUsageRevisions(changed));
  }
});

test('new receipts cannot turn a stale or incomplete independent report into approval', t => {
  const data = fixture(t);
  const mutations = [
    report => { report.rows[0].sentence = 'This sentence was not independently reviewed.'; },
    report => { report.rows[0].hash = '0'.repeat(64); },
    report => { report.rows[0].sourceHash = '0'.repeat(64); },
    report => { report.rows[0].englishHash = '0'.repeat(64); },
    report => { report.rows[0].english.checks.roles = false; },
    report => { report.rows[0].status = 'uncertain'; },
    report => { report.rows.pop(); },
    report => { report.candidates = []; },
    report => { report.candidates[0].decision = 'error'; },
    report => { report.sourceReceipt = '0'.repeat(64); },
  ];
  for (const mutate of mutations) {
    const changed = clone(data), batch = changed.proof.rounds[0].batches[0];
    const report = JSON.parse(Buffer.from(batch.reviewDelivery.artifacts[batch.paths.report], 'base64'));
    mutate(report);
    const files = new Map([[batch.paths.report, Buffer.from(JSON.stringify(report))]]);
    batch.reviewDelivery = { ...createDelivery({ root: data.root, batch: batch.id, phase: 'review', revision: 1, artifacts: files }),
      artifacts: Object.fromEntries([...files].map(([key, bytes]) => [key, bytes.toString('base64')])) };
    assert.throws(() => verifyReviewedUsageRevisions(changed));
  }
});

test('independent review actor handles reject whitespace and path aliases', t => {
  const data = fixture(t);
  for (const [role, handle] of [
    ['author', '/root/fixture_reviewer '],
    ['author', ' /root/fixture_reviewer'],
    ['reviewer', '/root/fixture_reviewer\n'],
    ['author', '/root/fixture_reviewer/'],
    ['author', '/root//fixture_reviewer'],
    ['author', '/root/fixture_author/../fixture_reviewer'],
    ['author', 'fixture_reviewer'],
  ]) {
    const changed = clone(data);
    changed.proof.rounds[0].batches[0][role] = handle;
    assert.throws(() => verifyReviewedUsageRevisions(changed), /invalid independent reviewer or author/, `${role}: ${JSON.stringify(handle)}`);
  }
});

test('an explicit later subset binds the preceding approved card and preserves all other objects', t => {
  const data = fixture(t), before = clone(data);
  appendSubsetRound(data);
  const summary = verifyReviewedUsageRevisions(data);
  assert.equal(summary.rounds, 2);
  assert.equal(summary.sourceCount, 3);
  assert.equal(summary.approvedCount, 3);
  assert.equal(summary.cardCount, 3);
  assert.deepEqual(data.proof.rounds[0], before.proof.rounds[0], 'the previous full-form round is unchanged');
  assert.deepEqual(data.cards.slice(1), before.cards.slice(1), 'unreviewed objects remain byte-for-byte identical');
  const later = data.proof.rounds[1];
  assert.deepEqual(later.sourceCards, [before.cards[0]]);
  assert.equal(data.revisions.find(row => row.id === later.scopeIds[0]).previousHash, revisionHash(before.cards[0]));
});

test('subset scope rejects empty, repeated, unknown, cross-form and mismatched IDs without weakening old full-form rounds', t => {
  const data = appendSubsetRound(fixture(t));
  for (const mutate of [
    value => { delete value.proof.rounds[1].scopeIds; },
    value => { value.proof.rounds[1].scopeIds = []; },
    value => { value.proof.rounds[1].scopeIds = null; },
    value => { value.proof.rounds[1].scopeIds.push(value.proof.rounds[1].scopeIds[0]); },
    value => { value.proof.rounds[1].scopeIds = ['usage:unknown']; },
    value => { value.proof.rounds[1].scopeIds = [value.cards[2].id]; },
    value => { value.proof.rounds[1].scopeIds = [value.cards[1].id]; },
    value => { value.proof.rounds[1].scopeIds = [value.cards[1].id]; value.proof.rounds[1].sourceCards = [value.cards[1]]; },
    value => { value.proof.rounds[1].scopeIds.push(value.cards[1].id); value.proof.rounds[1].sourceCards.push(value.cards[1]); value.proof.rounds[1].sourceCount = 2; },
    value => { value.proof.rounds[1].sourceCount = 2; },
    value => { value.proof.rounds[1].sourceCards = [value.baselineCards[0]]; },
    value => { value.cards[1].translation += '范围外修改'; },
    value => { value.cards[2].translation += '另一形式的范围外修改'; },
  ]) {
    const changed = clone(data); mutate(changed);
    assert.throws(() => verifyReviewedUsageRevisions(changed));
  }
  const truncated = clone(data);
  truncated.proof.rounds[0].sourceCount = 1;
  truncated.proof.rounds[0].sourceCards.pop();
  assert.throws(() => verifyReviewedUsageRevisions(truncated), /incomplete or stale frozen form scope/);
});

test('a later exact subset preserves existing deferrals and cannot silently restore a deferred ID', t => {
  const data = deferralFixture(t), before = clone(data);
  appendSubsetRound(data);
  const summary = verifyReviewedUsageRevisions(data);
  assert.equal(summary.rounds, 2);
  assert.equal(summary.deferredCount, 1);
  assert.equal(summary.cardCount, 2);
  assert.deepEqual(data.deferrals, before.deferrals);
  assert.deepEqual(data.proof.rounds[0], before.proof.rounds[0]);
  const changed = clone(data);
  changed.proof.rounds[1].scopeIds = [data.deferrals[0].id];
  assert.throws(() => verifyReviewedUsageRevisions(changed), /invalid exact subset scope/);
});

test('a complete form scope partitions into bilingual approvals and three-evidence exact deferrals', t => {
  const data = deferralFixture(t);
  assert.deepEqual(verifyReviewedUsageRevisions(data), { rounds: 1, sourceCount: 2, reviewedCount: 1, approvedCount: 1,
    deferredCount: 1, changedCount: 1, baselineCount: 3, cardCount: 2, teachingHeldCount: 0 });
  for (const mutate of [
    value => { value.proof.rounds[0].deferrals[0].attempts.pop(); },
    value => { value.proof.rounds[0].deferrals[0].attempts[1].authorDelivery = clone(value.proof.rounds[0].deferrals[0].attempts[0].authorDelivery); },
    value => { value.proof.rounds[0].deferrals[0].attempts[2].reviewer = value.proof.rounds[0].deferrals[0].attempts[2].author; },
    value => { value.proof.rounds[0].deferrals[0].sourceHash = '0'.repeat(64); },
    value => { value.deferrals = []; },
    value => { value.cards.push(value.baselineCards[1]); },
    value => { value.cards.pop(); },
    value => { value.englishRevisions.push(value.baselineOverlays[1]); },
  ]) {
    const changed = clone(data); mutate(changed);
    assert.throws(() => verifyReviewedUsageRevisions(changed));
  }
});

test('exact deferrals reject a freshly sealed approval or stale sentence disguised as a third failure', t => {
  const data = deferralFixture(t);
  for (const mutate of [
    report => { report.rows[0].status = 'approved'; },
    report => { report.rows[0].sentence = 'An unreviewed sentence.'; },
    report => { report.sourceReceipt = '0'.repeat(64); },
    report => { report.rows[0].hash = '0'.repeat(64); },
  ]) {
    const changed = clone(data), attempt = changed.proof.rounds[0].deferrals[0].attempts[2];
    const report = JSON.parse(Buffer.from(attempt.reviewDelivery.artifacts[attempt.paths.report], 'base64'));
    mutate(report);
    const files = new Map([[attempt.paths.report, Buffer.from(JSON.stringify(report))]]);
    attempt.reviewDelivery = { ...createDelivery({ root: data.root, batch: 'attempt/00', phase: 'review', revision: 3, artifacts: files }),
      artifacts: Object.fromEntries([...files].map(([key, bytes]) => [key, bytes.toString('base64')])) };
    assert.throws(() => verifyReviewedUsageRevisions(changed));
  }
});

test('unified English gate verifies the immutable old proof plus current reviewed successors', t => {
  const data = fixture(t);
  const modulePath = path.join(data.root, 'baseline.mjs'); fs.writeFileSync(modulePath, '// isolated baseline\n');
  const rows = ordered(data.baselineCards.map(card => ({ id: card.id, sourceHash: revisionHash(card),
    englishHash: revisionHash(data.baselineOverlays.find(row => row.id === card.id)) })));
  const old = { schemaVersion: 1, translatorId: 'gpt-6-luna-max', unresolvedCount: 0,
    canonicalCount: data.baselineCards.length, englishCount: data.baselineOverlays.length,
    sample: { count: 1 }, expansion: { count: 1, approvedCount: 1 }, cards: rows,
    frozenRuntimeHash: revisionHash(rows.map(({ id, sourceHash }) => ({ id, sourceHash }))),
    finalOverlayHash: revisionHash(data.baselineOverlays), finalModuleHash: sha(fs.readFileSync(modulePath)) };
  const proofPath = path.join(data.root, 'english.json.gz');
  fs.writeFileSync(proofPath, zlib.gzipSync(JSON.stringify(old)));
  data.proof.baseline.englishProofSha256 = sha(fs.readFileSync(proofPath));
  const byId = new Map(data.englishRevisions.map(row => [row.id, row]));
  const options = { cards: data.cards, overlays: data.baselineOverlays.map(row => byId.get(row.id) ?? row),
    baselineCards: data.baselineCards, baselineOverlays: data.baselineOverlays,
    revisions: data.revisions, englishRevisions: data.englishRevisions, deferrals: [], revisionProof: data.proof, proofPath, modulePath };
  assert.equal(verifyEnglishUsageReleaseProof(options).subsequentReviews.reviewedCount, 2);
  const changed = clone(options); changed.overlays[2].translation = 'An unreviewed English edit.';
  assert.throws(() => verifyEnglishUsageReleaseProof(changed), /differs from current/);
  fs.appendFileSync(modulePath, '// unreviewed baseline byte change\n');
  assert.throws(() => verifyEnglishUsageReleaseProof(options), /differs from current/);
});

test('unified English gate retains the full historical inventory and removes only evidence-backed exact deferrals', t => {
  const data = deferralFixture(t);
  const modulePath = path.join(data.root, 'baseline.mjs'); fs.writeFileSync(modulePath, '// isolated old English module\n');
  const rows = ordered(data.baselineCards.map(card => ({ id: card.id, sourceHash: revisionHash(card),
    englishHash: revisionHash(data.baselineOverlays.find(row => row.id === card.id)) })));
  const old = { schemaVersion: 1, translatorId: 'gpt-6-luna-max', unresolvedCount: 0,
    canonicalCount: data.baselineCards.length, englishCount: data.baselineOverlays.length,
    sample: { count: 1 }, expansion: { count: 1, approvedCount: 1 }, cards: rows,
    frozenRuntimeHash: revisionHash(rows.map(({ id, sourceHash }) => ({ id, sourceHash }))),
    finalOverlayHash: revisionHash(data.baselineOverlays), finalModuleHash: sha(fs.readFileSync(modulePath)) };
  const proofPath = path.join(data.root, 'english.json.gz');
  fs.writeFileSync(proofPath, zlib.gzipSync(JSON.stringify(old)));
  data.proof.baseline.englishProofSha256 = sha(fs.readFileSync(proofPath));
  const byId = new Map(data.englishRevisions.map(row => [row.id, row]));
  const options = { cards: data.cards,
    overlays: data.baselineOverlays.filter(row => row.id !== data.deferrals[0].id).map(row => byId.get(row.id) ?? row),
    baselineCards: data.baselineCards, baselineOverlays: data.baselineOverlays,
    revisions: data.revisions, englishRevisions: data.englishRevisions, deferrals: data.deferrals,
    revisionProof: data.proof, proofPath, modulePath };
  const result = verifyEnglishUsageReleaseProof(options);
  assert.equal(result.canonicalCount, 3, 'old proof still describes every original card');
  assert.equal(result.baselineCount, 3);
  assert.equal(result.currentCount, 2);
  assert.equal(result.subsequentReviews.deferredCount, 1);
  assert.throws(() => verifyEnglishUsageReleaseProof({ ...options, overlays: [...options.overlays, data.baselineOverlays[1]] }), /coverage count differs/);
  assert.throws(() => verifyEnglishUsageReleaseProof({ ...options, deferrals: [] }), /differs from independent approved deliveries or exact deferrals/);
});
