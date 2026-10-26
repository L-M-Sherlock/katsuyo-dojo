import { EXPECTED_SHIMAU_USER_HELD_IDS } from './helpers/shimau-user-teaching-hold-scope.mjs';
import { EXPECTED_CURRENT_TEACHING_HOLD_IDS, EXPECTED_PRIOR_TEACHING_HOLD_IDS } from './helpers/current-teaching-hold-scope.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { USAGE_CARDS, PRE_REVIEWED_USAGE_CARDS, REVIEWED_USAGE_CARDS } from '../app/lib/usage-cards.mjs';
import { EN_USAGE_CARD_OVERLAYS } from '../app/lib/i18n/content/en/current-usage-cards.mjs';
import { EN_USAGE_CARD_OVERLAYS as BASELINE_ENGLISH } from '../app/lib/i18n/content/en/usage-cards.mjs';
import { EN_REVIEWED_USAGE_CARD_OVERLAYS } from '../app/lib/i18n/content/en/reviewed-usage-card-revisions.mjs';
import { REVIEWED_USAGE_CARD_DEFERRALS } from '../app/lib/usage-cards/reviewed-revisions.mjs';
import { isTeachingFormDeferred } from '../app/lib/teaching-form-deferrals.mjs';
import { TEACHING_PAIR_DEFERRALS } from '../app/lib/teaching-pair-deferrals.mjs';
import { verifyEnglishUsageReleaseProof } from '../scripts/verify-english-usage-release.mjs';

test('committed English release proof and successor evidence match current canonical and English rows', () => {
  const proof = verifyEnglishUsageReleaseProof();
  assert.equal(proof.canonicalCount, 17261);
  assert.equal(proof.expansion.count, 7469);
  assert.equal(proof.unresolvedCount, 0);
  assert.equal(proof.baselineCount, 17261);
  assert.equal(proof.currentCount, 17035);
  assert.equal(proof.currentCount, USAGE_CARDS.length);
  assert.equal(proof.subsequentReviews.teachingHeldCount, 225);
  assert.equal(proof.subsequentReviews.baselineCount - proof.subsequentReviews.deferredCount
    - proof.subsequentReviews.teachingHeldCount, proof.currentCount);
  assert.equal(createHash('sha256').update(readFileSync(new URL('../docs/english-usage-release-proof.v1.json.gz', import.meta.url))).digest('hex'),
    'fc4d475af511b1423c45ac3a522c7f9d7b43eb9d4097c0e187deafd92823f329');
});

test('the English display projection holds the same IDs while preserving approved rows and earlier exact deferrals', () => {
  const formHeldIds = new Set(REVIEWED_USAGE_CARDS.filter(card => isTeachingFormDeferred(card.form)).map(card => card.id));
  const pairHeldIds = new Set(TEACHING_PAIR_DEFERRALS.map(row => row.id));
  const heldIds = new Set([...formHeldIds, ...pairHeldIds]);
  const exactDeferredIds = new Set(REVIEWED_USAGE_CARD_DEFERRALS.map(row => row.id));
  const revisions = new Map(EN_REVIEWED_USAGE_CARD_OVERLAYS.map(row => [row.id, row]));
  const reviewedEnglish = BASELINE_ENGLISH.filter(row => !exactDeferredIds.has(row.id)).map(row => revisions.get(row.id) ?? row);
  const byId = new Map(EN_USAGE_CARD_OVERLAYS.map(row => [row.id, row]));
  assert.equal(BASELINE_ENGLISH.length, 17261);
  assert.equal(reviewedEnglish.length, 17260);
  assert.equal(formHeldIds.size, 122);
  assert.deepEqual(pairHeldIds, EXPECTED_CURRENT_TEACHING_HOLD_IDS);
  assert.equal(heldIds.size, 225);
  assert.equal(EN_USAGE_CARD_OVERLAYS.length, 17035);
  assert.deepEqual(new Set(EN_USAGE_CARD_OVERLAYS.map(row => row.id)), new Set(USAGE_CARDS.map(card => card.id)));
  assert.deepEqual(EN_USAGE_CARD_OVERLAYS, reviewedEnglish.filter(row => !heldIds.has(row.id)));
  for (const row of reviewedEnglish) {
    if (heldIds.has(row.id)) assert.ok(!byId.has(row.id), row.id);
    else assert.strictEqual(byId.get(row.id), row, `${row.id}: English outside the exact held IDs is unchanged`);
  }
  assert.ok([...exactDeferredIds].every(id => !heldIds.has(id) && !byId.has(id)), 'earlier exact deferrals stay separate and absent');
  assert.throws(() => verifyEnglishUsageReleaseProof({ cards: REVIEWED_USAGE_CARDS, overlays: reviewedEnglish }), /Current cards differ/,
    'retained historical approvals do not authorize restoring held teaching cards');
});

test('a teaching hold cannot conceal drift in historical Chinese or English source content', () => {
  const formHeld = PRE_REVIEWED_USAGE_CARDS.find(card => isTeachingFormDeferred(card.form));
  const pairHeld = PRE_REVIEWED_USAGE_CARDS.filter(card => EXPECTED_CURRENT_TEACHING_HOLD_IDS.has(card.id));
  assert.equal(pairHeld.length,103);
  const newlyHeld=[...EXPECTED_SHIMAU_USER_HELD_IDS];
  const driftSample=new Set([...EXPECTED_PRIOR_TEACHING_HOLD_IDS,newlyHeld[0],newlyHeld.at(-1)]);
  assert.equal(driftSample.size,11,'keep all original nine drift checks and add two boundaries from the new evidence group');
  for (const held of [formHeld, ...pairHeld.filter(card=>driftSample.has(card.id))]) {
    assert.ok(held);
    assert.throws(() => verifyEnglishUsageReleaseProof({
      baselineCards: PRE_REVIEWED_USAGE_CARDS.map(card => card.id === held.id ? { ...card, scene: `${card.scene}修改` } : card),
    }), /missing or stale English overlay/);
    assert.throws(() => verifyEnglishUsageReleaseProof({
      baselineOverlays: BASELINE_ENGLISH.map(row => row.id === held.id ? { ...row, translation: 'Unreviewed hidden English edit.' } : row),
    }), /differs from current canonical cards or English overlay/);
  }
});

test('committed proof rejects canonical or English card drift', () => {
  const changedCards = [{ ...USAGE_CARDS[0], scene: `${USAGE_CARDS[0].scene}修改` }, ...USAGE_CARDS.slice(1)];
  assert.throws(() => verifyEnglishUsageReleaseProof({ cards: changedCards,
    overlays: EN_USAGE_CARD_OVERLAYS }), /missing or stale English overlay/);
  const changedEnglish = [{ ...EN_USAGE_CARD_OVERLAYS[0], scene: 'Changed English scene.' },
    ...EN_USAGE_CARD_OVERLAYS.slice(1)];
  assert.throws(() => verifyEnglishUsageReleaseProof({ cards: USAGE_CARDS,
    overlays: changedEnglish }), /differs from current canonical cards or English overlay/);
});
