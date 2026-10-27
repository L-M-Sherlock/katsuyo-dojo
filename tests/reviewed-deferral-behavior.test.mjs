import { EXPECTED_CURRENT_TEACHING_HOLD_IDS } from './helpers/current-teaching-hold-scope.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { REVIEWED_USAGE_CARD_DEFERRALS, REVIEWED_USAGE_CARD_DEFERRED_PAIRS } from '../app/lib/usage-cards/reviewed-revisions.mjs';
import { PRE_REVIEWED_USAGE_CARDS, REVIEWED_USAGE_CARDS, USAGE_CARDS, usageCardFor, usageCardItem, resolveUsageCard } from '../app/lib/usage-cards.mjs';
import { isTeachingFormDeferred } from '../app/lib/teaching-form-deferrals.mjs';
import { TEACHING_PAIR_DEFERRALS } from '../app/lib/teaching-pair-deferrals.mjs';
import { EN_USAGE_CARD_OVERLAYS as CURRENT_ENGLISH } from '../app/lib/i18n/content/en/current-usage-cards.mjs';
import { EN_USAGE_CARD_OVERLAYS as BASELINE_ENGLISH } from '../app/lib/i18n/content/en/usage-cards.mjs';
import { assessFormUsage, eligibleVerbForm, supportsVerbForm, USAGE_REVIEW_VERSION } from '../app/lib/form-eligibility.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { recognizeForms } from '../app/lib/form-recognition.mjs';
import { normalizeAnswer } from '../app/lib/answer-analysis.mjs';
import { assessmentTarget, emptyAssessment, reconcileAssessmentCatalog, recordIndependentAttempt } from '../app/lib/learning-assessment.mjs';
import { revisionHash, verifyCurrentReviewedUsageRevisions } from '../scripts/verify-reviewed-usage-revisions.mjs';
import { reviewedDeferralHistory } from './helpers/reviewed-deferral-history.mjs';

test('reviewed exact deferrals remove current bilingual cards while retaining source objects and complete morphology', () => {
  const summary = verifyCurrentReviewedUsageRevisions();
  assert.equal(summary.deferredCount, 1);
  assert.equal(summary.deferredCount, REVIEWED_USAGE_CARD_DEFERRALS.length);
  assert.equal(PRE_REVIEWED_USAGE_CARDS.length - REVIEWED_USAGE_CARDS.length, REVIEWED_USAGE_CARD_DEFERRALS.length);
  assert.equal(summary.teachingHeldCount, 234);
  assert.equal(REVIEWED_USAGE_CARDS.length - USAGE_CARDS.length, summary.teachingHeldCount);
  assert.equal(PRE_REVIEWED_USAGE_CARDS.length - USAGE_CARDS.length, REVIEWED_USAGE_CARD_DEFERRALS.length + summary.teachingHeldCount);
  assert.equal(REVIEWED_USAGE_CARD_DEFERRED_PAIRS.size, REVIEWED_USAGE_CARD_DEFERRALS.length);
  for (const row of REVIEWED_USAGE_CARD_DEFERRALS) {
    const source = PRE_REVIEWED_USAGE_CARDS.find(card => card.id === row.id);
    assert.equal(revisionHash(source), row.sourceHash);
    assert.equal(BASELINE_ENGLISH.find(english => english.id === row.id)?.sourceHash, row.sourceHash);
    assert.equal(USAGE_CARDS.some(card => card.id === row.id), false);
    assert.equal(CURRENT_ENGLISH.some(english => english.id === row.id), false);
    const item = usageCardItem(source.senseId), form = source.form;
    assert.equal(usageCardFor(item, form), null);
    assert.equal(resolveUsageCard(source), null);
    assert.equal(supportsVerbForm(item, form), true);
    assert.equal(eligibleVerbForm(item, form), false);
    const usage = assessFormUsage(item, form);
    assert.equal(usage.status, 'context-required');
    assert.equal(usage.context, undefined);
    assert.equal(usage.reasonCode, 'reviewed-revision-deferred');
    assert.equal(usage.reason, row.reason);
    const answer = deriveUnified(item, form).answer;
    const recognized = recognizeForms(item, answer, normalizeAnswer).find(candidate => candidate.form === form);
    assert.ok(recognized, `${row.pair}: complete form remains recognizable`);
    assert.equal(recognized.usage.reasonCode, 'reviewed-revision-deferred');
  }
});

test('the later form-wide hold preserves its source hashes while exact-pair holds remain separate', () => {
  const record = JSON.parse(readFileSync(new URL('../docs/usage-card-temiru-negative-past-hold-20261017.json', import.meta.url)));
  const heldCards = REVIEWED_USAGE_CARDS.filter(card => isTeachingFormDeferred(card.form));
  const heldIds = new Set(heldCards.map(card => card.id));
  const pairHeldIds = new Set(TEACHING_PAIR_DEFERRALS.map(row => row.id));
  const allHeldIds = new Set([...heldIds, ...pairHeldIds]);
  const reviewedIds = new Set(REVIEWED_USAGE_CARDS.map(card => card.id));
  const currentById = new Map(USAGE_CARDS.map(card => [card.id, card]));
  assert.equal(record.sourceCount, 122);
  assert.equal(heldIds.size, 122);
  assert.deepEqual(record.sourceRows.map(row => row.card), heldCards);
  assert.equal(revisionHash(heldCards), record.sourceCardsHash);
  assert.equal(revisionHash(record.sourceRows.map(row => row.english)), record.sourceEnglishHash);
  assert.deepEqual(pairHeldIds, EXPECTED_CURRENT_TEACHING_HOLD_IDS);
  assert.equal(allHeldIds.size, heldIds.size + 112);
  assert.deepEqual(new Set([...reviewedIds].filter(id => !currentById.has(id))), allHeldIds);
  assert.deepEqual(USAGE_CARDS, REVIEWED_USAGE_CARDS.filter(card => !allHeldIds.has(card.id)));
  for (const card of REVIEWED_USAGE_CARDS) {
    if (!allHeldIds.has(card.id)) assert.strictEqual(currentById.get(card.id), card, `${card.id}: outside-scope card is unchanged`);
  }
  for (const row of record.sourceRows) {
    assert.equal(row.sourceHash, revisionHash(row.card), row.id);
    assert.equal(row.englishHash, revisionHash(row.english), row.id);
    assert.deepEqual(BASELINE_ENGLISH.find(english => english.id === row.id), row.english, row.id);
    assert.ok(!REVIEWED_USAGE_CARD_DEFERRED_PAIRS.has(row.pair), row.id);
    assert.ok(!CURRENT_ENGLISH.some(english => english.id === row.id), row.id);
  }
  for (const row of REVIEWED_USAGE_CARD_DEFERRALS) assert.ok(!reviewedIds.has(row.id) && !heldIds.has(row.id), row.id);
});

test('reviewed deferrals preserve old failures for compatible retests and suspend only unavailable paths', async () => {
  const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  let model;
  try { model = (await server.ssrLoadModule('/app/page.tsx')).KNOWLEDGE; }
  finally { await server.close(); }
  for (const exercise of reviewedDeferralHistory(model)) {
    assert.equal(model.exercises.some(candidate => candidate.id === exercise.id), false);
    const target = assessmentTarget(exercise);
    const failed = recordIndependentAttempt(emptyAssessment(), {
      exercise, questionId: `reviewed-deferral:${exercise.id}`, correct: false, at: '2026-10-16T00:00:00Z',
    });
    const snapshot = structuredClone(failed);
    const restored = reconcileAssessmentCatalog(failed, model.exercises, USAGE_REVIEW_VERSION);
    const alternatives = model.exercises.filter(candidate => assessmentTarget(candidate).key === target.key);
    assert.ok(alternatives.some(candidate => assessmentTarget(candidate).wordKey !== target.wordKey), exercise.id);
    assert.deepEqual(restored.pending[target.key], failed.pending[target.key]);
    assert.deepEqual(restored.byTarget, failed.byTarget);
    assert.deepEqual(restored.independentByKc, failed.independentByKc);
    assert.equal(restored.originalCount, failed.originalCount);
    assert.deepEqual(failed, snapshot);
    const unavailable = model.exercises.filter(candidate => assessmentTarget(candidate).key !== target.key);
    const suspended = reconcileAssessmentCatalog(failed, unavailable, USAGE_REVIEW_VERSION);
    const { suspension, ...preserved } = suspended.suspendedPending[target.key];
    assert.deepEqual(preserved, failed.pending[target.key]);
    assert.equal(suspension.reason, 'no-eligible-exercise');
    assert.deepEqual(suspended.byTarget, failed.byTarget);
    const resumed = reconcileAssessmentCatalog(suspended, model.exercises, USAGE_REVIEW_VERSION);
    assert.deepEqual(resumed.pending[target.key], failed.pending[target.key]);
  }
});
