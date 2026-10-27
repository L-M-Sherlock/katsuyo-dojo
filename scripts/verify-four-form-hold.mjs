import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {USAGE_CARDS, REVIEWED_USAGE_CARDS} from '../app/lib/usage-cards.mjs';
import {UNIFIED_COURSES} from '../app/lib/unified-curriculum.mjs';
import {USER_DIRECTED_FORM_DEFERRALS, isTeachingFormDeferred} from '../app/lib/teaching-form-deferrals.mjs';
import {TEACHING_PAIR_DEFERRALS} from '../app/lib/teaching-pair-deferrals.mjs';
import {EN_USAGE_CARD_OVERLAYS} from '../app/lib/i18n/content/en/current-usage-cards.mjs';
import {EN_USAGE_CARD_OVERLAYS as BASE_ENGLISH} from '../app/lib/i18n/content/en/usage-cards.mjs';
import {EN_REVIEWED_USAGE_CARD_OVERLAYS} from '../app/lib/i18n/content/en/reviewed-usage-card-revisions.mjs';
import {verifyPortableRevisionDelivery} from './verify-reviewed-usage-revisions.mjs';
import {readVerifiedReviewedUsageCheckpoint, verifyReviewedProofPrefix} from './lib/reviewed-usage-history.mjs';

export const FOUR_HELD_FORMS = ['tearuNegative', 'tearuNegativePast', 'temiruDesireNegative', 'temiruDesireNegativePast'];
export const FOUR_FORM_HOLD_BASELINE_SHA256 = '15dec7356008ccbf65efa86e8c55ec8d7706c29b7bbaa616e702cdaec7e3cb80';
export const LATER_EXACT_PAIR_HOLD_IDS = [
  'usage:temorauNegativePast:verb:勝つ:かつ', 'usage:teikuNegative:verb:届く:とどく',
  'usage:tekuruNegativePast:verb:足りる:たりる', 'usage:tearuNegative:verb:読む:よむ',
  'usage:tearuNegative:verb:食べる:たべる', 'usage:tearuNegativePast:verb:読む:よむ',
  'usage:tearuNegativePast:verb:食べる:たべる',
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = value => sha(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = values => [...values].sort();
const ensure = (condition, message) => { if (!condition) throw Error(message); };
export const readFourFormHoldBaseline = () => {
  const bytes = fs.readFileSync(new URL('../docs/form-hold-baseline-20261027.json.gz', import.meta.url));
  ensure(sha(bytes) === FOUR_FORM_HOLD_BASELINE_SHA256, 'Four-form baseline bytes changed');
  return JSON.parse(zlib.gunzipSync(bytes));
};

/** Validate policy/source preservation independently of the report-only pilot. */
export function verifyFourFormHold({model, baseline = readFourFormHoldBaseline()} = {}) {
  ensure(baseline.schemaVersion === 1 && baseline.kind === 'user-directed-form-hold-baseline'
    && /^[a-f0-9]{40}$/u.test(baseline.sourceCommit), 'Invalid four-form baseline');
  const files = verifyPortableRevisionDelivery(baseline.sourceDelivery, 'author', 'formhold/00');
  ensure(same(baseline, readFourFormHoldBaseline()), 'Supplied four-form baseline differs from frozen bytes');
  ensure(same(sorted(files.keys()), sorted(Object.values(baseline.paths))), 'Four-form baseline artifact scope drift');
  const scope = JSON.parse(files.get(baseline.paths.scope));
  const original = JSON.parse(files.get(baseline.paths.active));
  const held = JSON.parse(files.get(baseline.paths.held));
  const graph = JSON.parse(files.get(baseline.paths.graph));
  ensure(scope.sourceCommit === baseline.sourceCommit && same(scope.holdForms, FOUR_HELD_FORMS)
    && scope.registeredForms === 170 && scope.activeForms.length === 169
    && scope.riskTargets.length === 39 && scope.riskInventory.length === 4542 && scope.sampleIds.length === 156
    && original.length === 17026 && new Set(original.map(r => r.id)).size === 17026
    && held.length === 235 && new Set(held.map(r => r.id)).size === 235 && graph.gating === 132,
  'Four-form frozen source/count drift');
  for (const [file, expected] of Object.entries(scope.proofHashes)) {
    ensure(/^docs\/[a-zA-Z0-9_.-]+$/u.test(file), 'Unsafe historical proof path');
    if (file === 'docs/usage-card-reviewed-revisions.v1.json') verifyReviewedProofPrefix(expected, 17);
    else ensure(sha(fs.readFileSync(new URL(`../${file}`, import.meta.url))) === expected,
      `${file}: historical review proof changed`);
  }
  ensure(scope.priorPairHolds.length === 112 && same(TEACHING_PAIR_DEFERRALS.slice(0, 112), scope.priorPairHolds),
    'Earlier exact teaching holds changed');
  const laterPairHolds = TEACHING_PAIR_DEFERRALS.slice(112);
  ensure(same(sorted(laterPairHolds.map(row => row.id)), sorted(LATER_EXACT_PAIR_HOLD_IDS))
    && laterPairHolds.every(row => row.evidenceFile === 'docs/usage-card-risk-pilot-feedback-holds-20261027.json'
      && row.requestedAt === '2026-10-27'), 'Later exact teaching holds differ from separately authorized evidence');
  const previous = USER_DIRECTED_FORM_DEFERRALS.filter(row => !FOUR_HELD_FORMS.includes(row.form));
  ensure(same(previous, scope.priorFormHolds) && USER_DIRECTED_FORM_DEFERRALS.length === 5
    && new Set(USER_DIRECTED_FORM_DEFERRALS.map(row => row.form)).size === 5,
  'Earlier form holds changed or new scope is incomplete');
  for (const form of FOUR_HELD_FORMS) {
    const row = USER_DIRECTED_FORM_DEFERRALS.find(row => row.form === form);
    ensure(row?.basis === 'user-directed-teaching-hold' && row.requestedAt === '2026-10-27'
      && row.reason?.trim() && row.restoreCondition?.trim()
      && row.evidenceFile === 'docs/form-hold-baseline-20261027.json.gz', `${form}: missing user teaching policy`);
  }
  // Always verify the complete successor chain before using its old checkpoint.
  // A caller cannot waive this check when current content differs from 17 rounds.
  const history = readVerifiedReviewedUsageCheckpoint(17);
  const canonical = new Map(REVIEWED_USAGE_CARDS.map(card => [card.id, card]));
  const rawEnglish = new Map([...BASE_ENGLISH, ...EN_REVIEWED_USAGE_CARD_OVERLAYS].map(row => [row.id, row]));
  const active = new Map(USAGE_CARDS.map(card => [card.id, card]));
  const english = new Map(EN_USAGE_CARD_OVERLAYS.map(row => [row.id, row]));
  const expectedAfterForms = original.filter(row => !FOUR_HELD_FORMS.includes(history.cards.get(row.id)?.form));
  const expectedActive = expectedAfterForms.filter(row => !LATER_EXACT_PAIR_HOLD_IDS.includes(row.id));
  ensure(expectedAfterForms.length === 16793 && expectedActive.length === 16790
    && same(USAGE_CARDS.map(card => card.id), expectedActive.map(row => row.id))
    && same(sorted(english.keys()), sorted(expectedActive.map(row => row.id))),
  'Current bilingual inventory differs from the exact four-form projection');
  for (const row of original) {
    ensure(hash(history.cards.get(row.id)) === row.sourceHash && hash(history.english.get(row.id)) === row.englishHash,
      `${row.id}: pre-hold canonical or English checkpoint changed`);
    if (active.has(row.id)) ensure(same(active.get(row.id), canonical.get(row.id))
      && same(english.get(row.id), rawEnglish.get(row.id)), `${row.id}: retained object differs from verified successor`);
  }
  const expectedHeld = REVIEWED_USAGE_CARDS.filter(card => FOUR_HELD_FORMS.includes(card.form));
  ensure(same(held.map(row => row.id), expectedHeld.map(card => card.id)), 'Four-form raw source scope drift');
  for (const row of held) ensure(same(row.card, history.cards.get(row.id)) && row.sourceHash === hash(row.card)
    && same(row.english, history.english.get(row.id)) && row.englishHash === hash(row.english)
    && !active.has(row.id) && !english.has(row.id), `${row.id}: missing or edited held source`);
  const formHeld = REVIEWED_USAGE_CARDS.filter(card => isTeachingFormDeferred(card.form));
  const pairIds = new Set(TEACHING_PAIR_DEFERRALS.map(row => row.id));
  const overlap = formHeld.filter(card => pairIds.has(card.id)).length;
  const allHeld = new Set([...formHeld.map(card => card.id), ...pairIds]);
  const activeForms = new Set(USAGE_CARDS.map(card => card.form));
  ensure(new Set(UNIFIED_COURSES.flatMap(course => course.forms)).size === 170
    && activeForms.size === 165 && FOUR_HELD_FORMS.every(form => !activeForms.has(form))
    && formHeld.length === 357 && overlap === 6 && allHeld.size === 470,
  'Four-form teaching inventory or overlap count differs');
  if (model) {
    const deferred = new Set(['exception.aru-negative', 'facet.apply.tearu.negative', 'facet.apply.tearu.negativePast',
      'facet.apply.temiru.negativePast', 'facet.chain.temiruDesireNegative', 'facet.chain.temiruDesireNegativePast']);
    const current = new Map(model.components.map(row => [row.id, row]));
    ensure(same(sorted(current.keys()), sorted(graph.components.map(row => row.id)))
      && model.components.filter(row => row.gating).length === 131
      && same(model.components.filter(row => row.teachingDeferredGating).map(row => row.id), ['exception.aru-negative'])
      && same(sorted(model.components.filter(row => row.teachingDeferred).map(row => row.id)), sorted(deferred)),
    'Current graph removed history or lost its exclusive teaching pauses');
    for (const old of graph.components) ensure(current.get(old.id).gating === (old.id === 'exception.aru-negative' ? false : old.gating),
      `${old.id}: shared gating policy changed`);
    for (const row of model.components) ensure(![...row.prerequisites, ...row.coverageKcIds,
      ...(row.masteryPrerequisites ?? []).map(row => row.id)].some(id => deferred.has(id)),
    `${row.id}: active graph still requires paused knowledge`);
    ensure(Object.values(model.courseKcIds).every(ids => ids.every(id => !deferred.has(id)))
      && model.exercises.every(exercise => !isTeachingFormDeferred(exercise.form)
        && exercise.kcIds.every(id => !deferred.has(id))), 'Current courses/exercises still require paused targets');
  }
  return {newForms: 4, newlyHeld: 233, laterExactPairHolds: 7, laterNewlyHeld: 3,
    activeForms: 165, activeCards: 16790, totalTeachingHeld: 470, formHeld: 357, exactPairHeld: 119, overlap: 6};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(verifyFourFormHold()));
}
