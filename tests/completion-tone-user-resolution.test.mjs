import test from 'node:test';
import assert from 'node:assert/strict';
import {readCompletionToneUserResolution, verifyCompletionToneUserResolution} from '../scripts/verify-completion-tone-user-resolution.mjs';

test('the user preserves 16 of the 25 optional examples and holds exactly the other nine pairs', () => {
  assert.deepEqual(verifyCompletionToneUserResolution(), {sourceCount: 25, retained: 16, userHeld: 9});
});

test('a user teaching choice cannot change source bytes, lose entries or rewrite earlier holds', () => {
  const record = readCompletionToneUserResolution(), changed = structuredClone(record);
  changed.sourceDelivery.artifacts[changed.paths.instruction] = Buffer.from('改为全部保留').toString('base64');
  assert.throws(() => verifyCompletionToneUserResolution(changed), /artifact drift/);
  assert.throws(() => verifyCompletionToneUserResolution({...record, decisions: record.decisions.slice(1)}), /duplicate user choice sources/);
  assert.throws(() => verifyCompletionToneUserResolution({...record, summary: {...record.summary, userHeld: 0}}), /summary differs/);
  assert.throws(() => verifyCompletionToneUserResolution({...record, priorHoldIds: []}), /Earlier 103 teaching holds changed/);
  assert.throws(() => verifyCompletionToneUserResolution({...record, priorHoldsHash: '0'.repeat(64)}), /Earlier 103 teaching holds changed/);
});
