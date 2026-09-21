import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {usageCardStageRequirements} from '../app/lib/usage-cards.mjs';

const file = 'docs/integration-stage-requirements.v1.json';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('integration requirement snapshot is immutable and partitions the current scope', () => {
  const bytes = fs.readFileSync(file);
  const snapshot = JSON.parse(bytes);
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.stage, 'integration');
  assert.deepEqual(snapshot.required, usageCardStageRequirements('integration'));
  for (const name of ['required', 'approved', 'deferred', 'open']) {
    assert.ok(Array.isArray(snapshot[name]));
    assert.equal(new Set(snapshot[name]).size, snapshot[name].length, `${name} has duplicates`);
  }
  const required = new Set(snapshot.required);
  const approved = new Set(snapshot.approved);
  const deferred = new Set(snapshot.deferred);
  const open = new Set(snapshot.open);
  assert.equal(snapshot.required.length, 1301);
  assert.equal(snapshot.approved.length, 107);
  assert.equal(snapshot.deferred.length, 0);
  assert.equal(snapshot.open.length, 1194);
  assert.equal([...approved, ...deferred, ...open].filter((pair, index, all) => all.indexOf(pair) === index).length, required.size);
  assert.deepEqual([...approved].filter(pair => deferred.has(pair) || open.has(pair)), []);
  assert.deepEqual([...deferred].filter(pair => open.has(pair)), []);
  assert.equal(snapshot.counts.required, required.size);
  assert.equal(snapshot.counts.approved, approved.size);
  assert.equal(snapshot.counts.deferred, deferred.size);
  assert.equal(snapshot.counts.open, open.size);
  assert.equal(digest(bytes), 'b36fb12d736a3c9e0b462b19c900a6751cb2452be4c7ef3ec7474a21f7b42d88', 'preserve the original frozen requirement bytes');
});
