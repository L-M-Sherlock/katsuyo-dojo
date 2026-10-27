import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {USAGE_CARDS, REVIEWED_USAGE_CARDS, usageCardItem} from '../app/lib/usage-cards.mjs';
import {EN_USAGE_CARD_OVERLAYS} from '../app/lib/i18n/content/en/current-usage-cards.mjs';
import {EN_USAGE_CARD_OVERLAYS as BASELINE_ENGLISH} from '../app/lib/i18n/content/en/usage-cards.mjs';
import {EN_REVIEWED_USAGE_CARD_OVERLAYS} from '../app/lib/i18n/content/en/reviewed-usage-card-revisions.mjs';
import {TEACHING_PAIR_DEFERRALS} from '../app/lib/teaching-pair-deferrals.mjs';
import {verifyPortableRevisionDelivery} from './verify-reviewed-usage-revisions.mjs';
import {readShimauUserResolution} from './verify-shimau-user-resolution.mjs';
import {verifyCompletionToneAudit} from './verify-completion-tone-audit.mjs';
import {verifyTeachingPairHolds} from './lib/teaching-pair-holds.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const hash = value => sha(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ensure = (condition, message) => { if (!condition) throw Error(message); };
const sorted = iterable => [...iterable].sort();
const holdPairs = [
  ['chau', '喜ぶ'], ['teshimau', '注ぐ'], ['teshimau', '始める'], ['teshimau', '生まれる'],
  ['teshimau', '止める'], ['teshimau', '集める'], ['teshimau', 'する'], ['chau', '咲く'], ['chau', '見せる'],
];
const retainPairs = [
  ['chau', '歌う'], ['chau', '貸す'], ['chau', '申し込む'], ['teshimau', '眠る'],
  ['teshimau', '浴びる'], ['teshimau', 'できる'], ['chau', '弾く'], ['chau', '立つ'],
  ['chau', '打つ'], ['chau', '焼く'], ['chau', '注ぐ'], ['chau', '返す'], ['chau', '勝つ'],
  ['chau', '送る'], ['chau', '乗る'], ['chau', '残る'],
];
export const readCompletionToneUserResolution = () => JSON.parse(zlib.gunzipSync(fs.readFileSync(
  new URL('../docs/usage-card-completion-tone-user-resolution-20261027.json.gz', import.meta.url))));

/** Verify exact user teaching choices; preserve all earlier language judgments. */
export function verifyCompletionToneUserResolution(record = readCompletionToneUserResolution()) {
  const audit = verifyCompletionToneAudit(), expected = new Map(audit.rows
    .filter(row => row.status === 'optional-polish').map(row => [row.id, row]));
  ensure(record.schemaVersion === 1 && record.kind === 'user-directed-teaching-choice'
    && /^[a-f0-9]{40}$/u.test(record.sourceCommit)
    && record.auditProofSha256 === sha(fs.readFileSync(new URL('../docs/usage-card-completion-tone-audit-20261027.json.gz', import.meta.url))),
  'User choice audit baseline drift');
  const files = verifyPortableRevisionDelivery(record.sourceDelivery, 'author', 'tonechoice/00');
  ensure(same(sorted(files.keys()), sorted(Object.values(record.paths)))
    && files.get(record.paths.instruction)?.toString('utf8').trim() === '只保留自然合格的，剩下的暂缓出题。',
  'Missing or changed user choice instruction');
  const classification = JSON.parse(files.get(record.paths.classification));
  ensure(classification.kind === 'mechanical-extract-not-verbatim-full-feedback'
    && same(classification.groups, {'user-unnatural': holdPairs.slice(0, 4), 'user-needs-context-or-polish': holdPairs.slice(4)})
    && same(classification.retained, retainPairs), 'User classification scope drift');
  const frozen = JSON.parse(files.get(record.paths.sources)), sources = new Map(frozen.map(row => [row.id, row]));
  ensure(expected.size === 25 && sources.size === 25 && frozen.length === 25
    && same(JSON.parse(files.get(record.paths.decisions)), record.decisions), 'Missing or duplicate user choice sources');
  const byPair = new Map([...expected.values()].map(row => [`${row.card.form}/${usageCardItem(row.card.senseId).surface}`, row.id]));
  const holdsExpected = new Set(holdPairs.map(pair => byPair.get(pair.join('/'))));
  const retainedExpected = new Set(retainPairs.map(pair => byPair.get(pair.join('/'))));
  ensure(!holdsExpected.has(undefined) && !retainedExpected.has(undefined), 'User choice pair cannot be mapped');
  const canonical = new Map(REVIEWED_USAGE_CARDS.map(card => [card.id, card]));
  const active = new Map(USAGE_CARDS.map(card => [card.id, card]));
  const english = new Map(EN_USAGE_CARD_OVERLAYS.map(row => [row.id, row]));
  const rawEnglish = new Map([...BASELINE_ENGLISH, ...EN_REVIEWED_USAGE_CARD_OVERLAYS].map(row => [row.id, row]));
  const registry = new Map(TEACHING_PAIR_DEFERRALS.map(row => [row.id, row]));
  const seen = new Set(), held = [], retained = [];
  for (const row of record.decisions) {
    const original = expected.get(row.id), source = sources.get(row.id);
    ensure(original && source && !seen.has(row.id)
      && row.senseId === original.card.senseId && row.form === original.card.form
      && row.sourceHash === original.sourceHash && row.englishHash === original.englishHash
      && row.fullSentence === original.fullSentence && same(source.card, original.card)
      && same(source.english, original.english) && source.sourceHash === hash(source.card)
      && source.englishHash === hash(source.english) && hash(canonical.get(row.id)) === row.sourceHash
      && hash(rawEnglish.get(row.id)) === row.englishHash, `${row.id}: duplicate, stale or changed choice source`);
    seen.add(row.id);
    if (holdsExpected.has(row.id)) {
      const hold = registry.get(row.id), group = holdPairs.slice(0, 4).some(pair => byPair.get(pair.join('/')) === row.id)
        ? 'user-unnatural' : 'user-needs-context-or-polish';
      ensure(row.action === 'hold' && row.userGroup === group
        && hold?.sourceHash === row.sourceHash && hold.englishHash === row.englishHash
        && hold.pair === `${row.senseId}/${row.form}` && hold.basis === 'user-directed-teaching-hold'
        && hold.evidenceFile === 'docs/usage-card-completion-tone-user-holds-20261027.json'
        && !active.has(row.id) && !english.has(row.id), `${row.id}: incomplete exact user hold`);
      held.push(row.id);
    } else {
      ensure(retainedExpected.has(row.id) && row.action === 'retain' && row.userGroup === 'user-natural'
        && !registry.has(row.id) && hash(active.get(row.id)) === row.sourceHash
        && hash(english.get(row.id)) === row.englishHash, `${row.id}: retained card was changed or removed`);
      retained.push(row.id);
    }
  }
  const previousChoice = readShimauUserResolution();
  const historicalIds = [...previousChoice.priorHoldIds, ...previousChoice.holdIds];
  ensure(historicalIds.length === 103 && same(record.priorHoldIds, historicalIds)
    && hash(TEACHING_PAIR_DEFERRALS.filter(row => historicalIds.includes(row.id))) === record.priorHoldsHash,
  'Earlier 103 teaching holds changed');
  ensure(seen.size === 25 && held.length === 9 && retained.length === 16
    && same(held, record.holdIds) && same(retained, record.retainedIds)
    && same(sorted(held), sorted(holdsExpected)) && same(sorted(retained), sorted(retainedExpected)),
  'User choice does not partition the complete 25-card scope');
  const summary = {sourceCount: 25, retained: 16, userHeld: 9};
  ensure(same(summary, record.summary), 'User choice summary differs from individual decisions');
  verifyTeachingPairHolds(REVIEWED_USAGE_CARDS, [...rawEnglish.values()]);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(verifyCompletionToneUserResolution()));
}
