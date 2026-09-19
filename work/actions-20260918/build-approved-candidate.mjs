import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import { createPipeline } from './pipeline.mjs';
import { readDelivery } from '../../.agents/skills/write-katsuyo-usage-cards/scripts/delivery-store.mjs';
import { USAGE_CARDS, resolveUsageCard } from '../../app/lib/usage-cards.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const pipeline = createPipeline();
const listing = await pipeline.run('list');
const baseline = JSON.parse(fs.readFileSync(path.join(dir, 'baseline.json'), 'utf8'));
const oldCards = JSON.parse(fs.readFileSync(path.join(dir, 'baseline-cards.json'), 'utf8'));
if (crypto.createHash('sha256').update(JSON.stringify(oldCards)).digest('hex') !== baseline.oldCardHash) throw Error('Original card baseline changed');
const currentById = new Map(USAGE_CARDS.map(card => [card.id, card]));
for (const old of oldCards) if (JSON.stringify(currentById.get(old.id)) !== JSON.stringify(old)) throw Error(`Original card changed: ${old.id}`);
const oldIds = new Set(oldCards.map(card => card.id));
const oldPairs = new Set(oldCards.map(card => `${card.senseId}/${card.form}`));
const cards = [];
const batches = [];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const readReviewedDelivery = (state, batch) => {
  const delivery = state.reviewFreeze?.delivery;
  if (!delivery?.files || !delivery.hashes || !delivery.sourceHashes) throw Error(`${batch}: reviewed batch is not sealed; run seal-reviewed before publishing`);
  const artifacts = readDelivery(dir, delivery);
  for (const [source, expected] of Object.entries(state.reviewFreeze.files)) {
    if (!artifacts.has(source) || sha(artifacts.get(source)) !== expected) throw Error(`${batch}: delivery differs from accepted freeze: ${source}`);
  }
  for (const [source, bytes] of artifacts) {
    const sourcePath = path.join(dir, source);
    if (!fs.existsSync(sourcePath) || sha(fs.readFileSync(sourcePath)) !== delivery.sourceHashes[source]) throw Error(`${batch}: source changed after sealing: ${source}`);
  }
  return artifacts;
};

for (const batch of listing.batches.filter(item => item.status === 'reviewed')) {
  const stem = path.join(dir, batch.batch);
  console.error('PUBLISH_BATCH', batch.batch);
  const cardsFile = `${stem}.cards.json`;
  const state = await pipeline.run('describe', {batch: batch.batch});
  const delivered = readReviewedDelivery(state, batch.batch);
  for(const [file, expected] of Object.entries(state.reviewFreeze.files)){
    const absolute=path.join(dir,file);
    if(!fs.existsSync(absolute)||sha(fs.readFileSync(absolute))!==expected)throw Error(`Frozen artifact drift: ${file}`);
  }
  const reviewFile = `${stem}.review.json`;
  if (!fs.existsSync(cardsFile) || !fs.existsSync(reviewFile)) throw Error(`Missing frozen source: ${batch.batch}`);
  const source = JSON.parse(delivered.get(`${batch.batch}.cards.json`));
  const ledger = JSON.parse(delivered.get(`${batch.batch}.review.json`));
  const reasons = ledger.map(row => row.reason?.trim().replace(/\s+/gu, ' '));
  if (new Set(reasons).size !== reasons.length) throw Error(`Repeated review reasons require actual re-review: ${batch.batch}`);
  const ledgerById = new Map(ledger.map(row => [row.id, row]));
  if(ledger.length!==source.length||ledgerById.size!==source.length||ledger.some(r=>!source.some(c=>c.id===r.id)))throw Error(`Ledger ID mismatch: ${batch.batch}`);
  const approved = [];
  for (const card of source) {
    const row = ledgerById.get(card.id);
    if (!row || row.status !== 'approved') continue;
    const resolved = resolveUsageCard(card);
    if (!resolved) throw new Error(`${batch.batch}: cannot resolve ${card.id}`);
    if (sha(JSON.stringify(card)) !== row.hash) throw new Error(`${batch.batch}: stale hash ${card.id}`);
    const sentence = [...card.before, resolved.target, ...card.after].map(part => part.text).join('');
    if (sentence !== row.sentence) throw new Error(`${batch.batch}: stale sentence ${card.id}`);
    if (oldIds.has(card.id)) throw new Error(`${batch.batch}: old ID collision ${card.id}`);
    const pair = `${card.senseId}/${card.form}`;
    if (oldPairs.has(pair)) throw new Error(`${batch.batch}: old pair collision ${pair}`);
    approved.push(card);
  }
  if (approved.length) {
    cards.push(...approved);
    batches.push({batch: batch.batch, cards: approved.length, sourceHash: sha(JSON.stringify(approved)), stateRevision: state.revision});
  }
}

// Candidate export is deliberately a checkpoint; it never mutates the app.

const pairs = new Set();
for (const card of cards) {
  const pair = `${card.senseId}/${card.form}`;
  if (pairs.has(pair)) throw new Error(`Duplicate new pair ${pair}`);
  pairs.add(pair);
}
const out = path.join(dir, 'approved-candidate.json');
fs.writeFileSync(out, JSON.stringify(cards, null, 2) + '\n');
fs.writeFileSync(path.join(dir, 'approved-candidate-manifest.json'), JSON.stringify({cards: cards.length, pairs: pairs.size, batches, sha256: sha(JSON.stringify(cards))}, null, 2) + '\n');
console.log(JSON.stringify({cards: cards.length, pairs: pairs.size, batches: batches.length, output: out}, null, 2));
