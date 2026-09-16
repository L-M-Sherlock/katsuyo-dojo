// Queue membership controls where a task is scheduled, not whether genuine
// learning evidence counts. Old records have no recoverable mode: keep them
// in practice rather than guessing from their course or difficulty.
export function retestQueue(entry) { return entry?.queue ?? 'practice'; }
export const isPracticeRetest = entry => retestQueue(entry) === 'practice';
export const isChallengeRetest = entry => retestQueue(entry) === 'challenge';
export function observationQueue(mode = 'practice') {
  if (!['practice','challenge'].includes(mode)) throw new Error('Unknown practice mode');
  return mode;
}
export function failureQueue(previous, mode) {
  const requested=observationQueue(mode);
  return previous && isPracticeRetest(previous) ? 'practice' : requested;
}

// Moving a task is an explicit user choice. Preserve every failure/exposure
// anchor, score and counter; repeated clicks and stale cleared tasks are no-ops.
export function moveRetestQueue(assessment, key, queue) {
  observationQueue(queue);
  const bucket=assessment.pending[key] ? 'pending' : 'suspendedPending';
  const entry=assessment[bucket]?.[key];
  if (!entry || retestQueue(entry) === queue) return assessment;
  return {...assessment,[bucket]:{...assessment[bucket],[key]:{...entry,queue}}};
}

export const addToPracticeRetests = (assessment,key) => moveRetestQueue(assessment,key,'practice');
