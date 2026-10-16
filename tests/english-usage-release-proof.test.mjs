import assert from 'node:assert/strict';
import test from 'node:test';

import { USAGE_CARDS } from '../app/lib/usage-cards.mjs';
import { EN_USAGE_CARD_OVERLAYS } from '../app/lib/i18n/content/en/current-usage-cards.mjs';
import { verifyEnglishUsageReleaseProof } from '../scripts/verify-english-usage-release.mjs';

test('committed English release proof and successor evidence match current canonical and English rows', () => {
  const proof = verifyEnglishUsageReleaseProof();
  assert.equal(proof.canonicalCount, 17261);
  assert.equal(proof.expansion.count, 7469);
  assert.equal(proof.unresolvedCount, 0);
  assert.equal(proof.baselineCount, 17261);
  assert.equal(proof.currentCount, USAGE_CARDS.length);
  assert.equal(proof.subsequentReviews.baselineCount - proof.subsequentReviews.deferredCount, proof.currentCount);
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
