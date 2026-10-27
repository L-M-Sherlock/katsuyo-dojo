import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {readFourFormHoldBaseline, verifyFourFormHold} from '../scripts/verify-four-form-hold.mjs';

let server, model;
before(async () => {
  server=await createServer({appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
  model=(await server.ssrLoadModule('/app/page.tsx')).KNOWLEDGE;
});
after(async () => { await server?.close(); });

test('four exact form policies preserve source objects and count overlapping pair holds once', () => {
  assert.deepEqual(verifyFourFormHold({model}), {newForms:4, newlyHeld:233, activeForms:165, activeCards:16790,
    totalTeachingHeld:470, formHeld:357, exactPairHeld:119, overlap:6, laterExactPairHolds:7, laterNewlyHeld:3});
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../docs/form-hold-baseline-20261027.json.gz',import.meta.url))).digest('hex'),
    '15dec7356008ccbf65efa86e8c55ec8d7706c29b7bbaa616e702cdaec7e3cb80');
});

test('the source baseline rejects modified or omitted frozen artifacts', () => {
  const baseline=readFourFormHoldBaseline(), changed=structuredClone(baseline);
  changed.sourceDelivery.artifacts[baseline.paths.held]=Buffer.from('[]').toString('base64');
  assert.throws(()=>verifyFourFormHold({baseline:changed}),/artifact drift/);
  assert.throws(()=>verifyFourFormHold({baseline:{...baseline,kind:'language-error'}}),/Invalid four-form baseline/);
  const omitted=structuredClone(baseline);
  delete omitted.sourceDelivery.artifacts[baseline.paths.active];
  assert.throws(()=>verifyFourFormHold({baseline:omitted}),/file set drift/);
});
