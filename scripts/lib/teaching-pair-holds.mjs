import fs from 'node:fs';
import crypto from 'node:crypto';
import {TEACHING_PAIR_DEFERRALS} from '../../app/lib/teaching-pair-deferrals.mjs';

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const evidence = () => JSON.parse(fs.readFileSync(new URL('../../docs/usage-card-temiru-teaching-hold-20261026.json', import.meta.url), 'utf8'));

/** Verify teaching choices against retained objects, after historical review checks. */
export function verifyTeachingPairHolds(cards, english, proof = evidence()) {
  if (proof.schemaVersion !== 1 || proof.kind !== 'user-directed-exact-pair-hold'
      || !/^[a-f0-9]{40}$/.test(proof.sourceCommit) || !proof.request
      || !Array.isArray(proof.sourceRows)) throw new Error('Invalid teaching-hold evidence');
  const sources = new Map(proof.sourceRows.map(row => [row.id, row]));
  const byId = new Map(cards.map(card => [card.id, card]));
  const englishById = english && new Map(english.map(row => [row.id, row]));
  const ids = new Set(), pairs = new Set();
  for (const hold of TEACHING_PAIR_DEFERRALS) {
    const source = sources.get(hold.id);
    const fail = message => { throw new Error(`${hold.id}: ${message}`); };
    if (ids.has(hold.id) || pairs.has(hold.pair)) fail('duplicate teaching hold');
    ids.add(hold.id); pairs.add(hold.pair);
    if (!source || hold.basis !== 'user-directed-teaching-hold'
        || !hold.reason || !hold.restoreCondition || !hold.requestedAt
        || hold.pair !== `${hold.senseId}/${hold.form}`
        || source.sourceHash !== hold.sourceHash || source.englishHash !== hold.englishHash
        || hash(source.card) !== hold.sourceHash || hash(source.english) !== hold.englishHash
        || source.card.id !== hold.id || source.card.senseId !== hold.senseId || source.card.form !== hold.form
        || !(source.previousUsage?.status === 'allowed'
          || (source.previousUsage?.status === 'context-required' && source.previousUsage.context?.text))
        || Object.keys(hold).some(key => source[key] !== hold[key])) fail('missing or stale teaching-hold evidence');
    // Synthetic verification scopes may not contain this published card.
    if (!byId.has(hold.id)) continue;
    if (hash(byId.get(hold.id)) !== hold.sourceHash) fail('held canonical source changed');
    if (englishById && (!englishById.has(hold.id) || hash(englishById.get(hold.id)) !== hold.englishHash)) fail('held English source changed');
  }
  if (sources.size !== ids.size) throw new Error('Teaching-hold evidence has extra or missing rows');
  return [...ids].filter(id => byId.has(id)).length;
}
