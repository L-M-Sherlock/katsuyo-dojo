import { EN_USAGE_CARD_OVERLAYS as baseline } from './usage-cards.mjs';
import { EN_REVIEWED_USAGE_CARD_OVERLAYS } from './reviewed-usage-card-revisions.mjs';
import { REVIEWED_USAGE_CARD_DEFERRALS } from '../../../usage-cards/reviewed-revisions.mjs';

const revisions = new Map(EN_REVIEWED_USAGE_CARD_OVERLAYS.map(row => [row.id, row]));
const deferred = new Set(REVIEWED_USAGE_CARD_DEFERRALS.map(row => row.id));
export const EN_USAGE_CARD_OVERLAYS = Object.freeze(baseline.filter(row => !deferred.has(row.id))
  .map(row => revisions.get(row.id) ?? row));
