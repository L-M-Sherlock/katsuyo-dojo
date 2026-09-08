import assert from 'node:assert/strict';
import { referenceNodeOutputs } from '../../scripts/lib/diagnostic-oracle.mjs';

// Old boundary guards still forbid invented class/stage evidence. Generic
// supplied-rule probes are now required when the original remains ungraded.
export function assertGenericOrTerminal(result,scope) {
  assert.equal(result.diagnosis?.stage,undefined);
  assert.equal(result.diagnosis?.review,undefined);
  if(!result.planFallback) {assert.deepEqual(result.steps,[]);return;}
  assert.equal(result.diagnosis?.kcId??null,null);
  assert.ok(result.steps.length);
  for(const step of result.steps) {
    assert.equal(step.kind,'atomic');assert.ok(step.note.includes('已提供正确输入和词类'));
    assert.ok(step.kcIds.length&&step.kcIds.every(id=>scope.includes(id)));
    assert.ok(step.readings.every(input=>referenceNodeOutputs(step.atomic).includes(input)));
  }
}
