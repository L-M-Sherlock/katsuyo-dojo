import { EN_USAGE_CARD_OVERLAYS as baseline } from './usage-cards.mjs';
import { EN_REVIEWED_USAGE_CARD_OVERLAYS } from './reviewed-usage-card-revisions.mjs';
import { REVIEWED_USAGE_CARD_DEFERRALS } from '../../../usage-cards/reviewed-revisions.mjs';
import { REVIEWED_USAGE_CARDS } from '../../../usage-cards.mjs';
import { isTeachingFormDeferred } from '../../../teaching-form-deferrals.mjs';

const revisions = new Map(EN_REVIEWED_USAGE_CARD_OVERLAYS.map(row => [row.id, row]));
const deferred = new Set(REVIEWED_USAGE_CARD_DEFERRALS.map(row => row.id));
for (const card of REVIEWED_USAGE_CARDS) if (isTeachingFormDeferred(card.form)) deferred.add(card.id);
export const EN_USAGE_CARD_OVERLAYS = Object.freeze(baseline.filter(row => !deferred.has(row.id))
  .map(row => revisions.get(row.id) ?? row));
