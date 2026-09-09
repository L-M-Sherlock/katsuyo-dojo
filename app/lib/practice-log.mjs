/** @typedef {import('./adaptive.mjs').SkillStats} SkillStats */
/** @typedef {{date: string, attempted: number, correct: number, streak: number}} Totals */
/** @typedef {{surface: string, reading: string, form: string | null, label: string, kind: string, kcIds: string[], answers: string[], readings: string[], stepIndex: number | null, totalSteps: number, nextTotalSteps: number}} LogTarget */
/** @typedef {{id: string, courseId: string, form: string | null, surface: string, reading: string, wordClass: string, domain: string}} LogExercise */
/** @typedef {{kcId: string, label: string, before: SkillStats | null, after: SkillStats | null}} KnowledgeChange */
/** @typedef {{independent: boolean, source: string, provided: string[]}} EvidenceSupport */
/** @typedef {{pending: boolean, independentAttempts: number, independentCorrect: number, assistedOriginalAttempts: number, assistedOriginalCorrect: number, assistedStepAttempts: number, assistedStepCorrect: number, eligibleRetestCorrect: number, pendingReason: string | null, lastFailureAt: string | null, lastPresentedAt: string | null}} AssessmentSnapshot */
/** @typedef {{targetKey: string, before: AssessmentSnapshot, after: AssessmentSnapshot, eligibility: {eligible: boolean, reason: string, remainingQuestions: number, availableAt: string | null, policy: string} | null}} AssessmentChange */
/** @typedef {{id: string, sequence: number, questionId: string, at: string, type: string, outcome: string, exercise: LogExercise, target: LogTarget, answer: string, answerLength: number, answerTruncated: boolean, hintUsed: boolean, support?: EvidenceSupport, diagnosis: {kcId: string | null, confirmedKcIds: string[], resolution: string, message: string}, changes: KnowledgeChange[], assistedChanges?: KnowledgeChange[], assessment?: AssessmentChange, totals: {before: Totals, after: Totals}} PracticeEvent */
/** @typedef {{version: 1 | 2, totalEvents: number, droppedEntries: number, events: PracticeEvent[]}} PracticeLog */

export const PRACTICE_LOG_LIMIT = 500;
// Bound the serialized log as well as its count: a complex answer can update
// many rules. This leaves room for cumulative progress in localStorage.
export const PRACTICE_LOG_MAX_CHARS = 750_000;

/** @returns {PracticeLog} */
export function emptyPracticeLog() { return { version: 2, totalEvents: 0, droppedEntries: 0, events: [] }; }

export function practiceEventId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function invalid() { throw new Error('作答日志格式不完整或不受支持，未导入该备份。'); }
function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(); return value; }
function string(value, max = 256, nonempty = false) {
  if (typeof value !== 'string' || Array.from(value).length > max || (nonempty && !value.length)) invalid();
  return value;
}
function nullableString(value) { return value === null ? null : string(value); }
function integer(value) { if (!Number.isSafeInteger(value) || value < 0) invalid(); return value; }
function number(value, max = Infinity) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) invalid(); return value; }
function bool(value) { if (typeof value !== 'boolean') invalid(); return value; }
function list(value, read, max = 256) { if (!Array.isArray(value) || value.length > max) invalid(); return value.map(read); }
const strings = value => list(value, v => string(v));
const supportSources = new Set(['independent', 'guided', 'diagnostic', 'hinted', 'revealed', 'feedback-retry', 'rehearsal', 'completion', 'duplicate', 'typo', 'invalid', 'migration']);
const assistanceKinds = new Set(['subgoal', 'intermediate', 'word-class', 'target-rule', 'hint', 'answer', 'lexical-retry']);
const exposureOnlyReasons = new Set(['hinted', 'hint', 'assisted', 'retry', 'feedback-retry']);
function timestamp(value) {
  const result = string(value, 32, true);
  if (!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(result) || !Number.isFinite(Date.parse(result))) invalid();
  return result;
}
function readSupport(value) {
  const source = object(value);
  const result = { independent: bool(source.independent), source: string(source.source, 64, true), provided: strings(source.provided) };
  if (!supportSources.has(result.source) || result.independent !== (result.source === 'independent')
    || new Set(result.provided).size !== result.provided.length || result.provided.some(kind => !assistanceKinds.has(kind))
    || (result.independent && result.provided.some(kind => kind !== 'lexical-retry'))
    || (result.source === 'hinted' && !result.provided.includes('hint'))
    || (result.source === 'revealed' && !result.provided.includes('answer'))
    || (['guided', 'diagnostic'].includes(result.source) && !result.provided.includes('subgoal'))) invalid();
  return result;
}

function stats(value) {
  if (value === null) return null;
  const s = object(value);
  const result = { attempts: integer(s.attempts), correct: integer(s.correct), filteredAccuracy: s.filteredAccuracy === null ? null : number(s.filteredAccuracy, 1),
    confidence: number(s.confidence, 1), bestConfidence: number(s.bestConfidence, 1), cleanTimeTotal: number(s.cleanTimeTotal), cleanTimeCount: integer(s.cleanTimeCount) };
  if (result.correct > result.attempts || result.cleanTimeCount > result.correct || result.bestConfidence < result.confidence) invalid();
  return result;
}

function totals(value) {
  const s = object(value);
  const result = { date: string(s.date, 10), attempted: integer(s.attempted), correct: integer(s.correct), streak: integer(s.streak) };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result.date) || result.correct > result.attempted || result.streak > result.attempted) invalid();
  return result;
}

function knowledgeChanges(value) {
  return list(value, c => { c = object(c); return { kcId: string(c.kcId, 256, true), label: string(c.label), before: stats(c.before), after: stats(c.after) }; });
}
const assessmentCounts = ['independentAttempts', 'independentCorrect', 'assistedOriginalAttempts', 'assistedOriginalCorrect', 'assistedStepAttempts', 'assistedStepCorrect', 'eligibleRetestCorrect'];
function assessmentSnapshot(state, key) {
  const entry = state?.byTarget?.[key], pending = state?.pending?.[key];
  return { pending: Boolean(pending), ...Object.fromEntries(assessmentCounts.map(name => [name, entry?.[name] ?? 0])),
    pendingReason: pending?.reason ?? null, lastFailureAt: pending?.lastFailureAt ?? null, lastPresentedAt: pending?.lastPresentedAt ?? null };
}
function readAssessmentSnapshot(value) {
  const s = object(value);
  const result = { pending: bool(s.pending), ...Object.fromEntries(assessmentCounts.map(name => [name, integer(s[name])])),
    pendingReason: nullableString(s.pendingReason), lastFailureAt: nullableString(s.lastFailureAt), lastPresentedAt: nullableString(s.lastPresentedAt) };
  if (result.independentCorrect > result.independentAttempts || result.assistedOriginalCorrect > result.assistedOriginalAttempts
    || result.assistedStepCorrect > result.assistedStepAttempts || result.eligibleRetestCorrect > result.independentCorrect) invalid();
  if (result.pending) {
    if (!result.pendingReason || result.lastPresentedAt === null || (result.lastFailureAt === null && !exposureOnlyReasons.has(result.pendingReason))) invalid();
    timestamp(result.lastPresentedAt);
    if (result.lastFailureAt !== null) {
      timestamp(result.lastFailureAt);
      if (Date.parse(result.lastPresentedAt) < Date.parse(result.lastFailureAt)) invalid();
    }
  } else if (result.pendingReason !== null || result.lastFailureAt !== null || result.lastPresentedAt !== null) invalid();
  return result;
}
function readEligibility(value) {
  if (value === null) return null;
  const source = object(value);
  const result = { eligible: bool(source.eligible), reason: string(source.reason, 64, true), remainingQuestions: integer(source.remainingQuestions),
    availableAt: nullableString(source.availableAt), policy: string(source.policy, 64, true) };
  if (!['single-word-spaced', 'single-word-delayed', 'different-word-spaced'].includes(result.policy)
    || !['eligible', 'different-rule-path', 'same-word', 'needs-spacing', 'needs-delay'].includes(result.reason)
    || result.eligible !== (result.reason === 'eligible') || (result.eligible && result.remainingQuestions)
    || (result.reason === 'needs-spacing' && !result.remainingQuestions)
    || (result.reason === 'needs-delay' && result.availableAt === null)
    || (result.policy === 'single-word-delayed') !== (result.availableAt !== null)) invalid();
  if (result.availableAt !== null) timestamp(result.availableAt);
  return result;
}
function readAssessment(value) {
  const source = object(value);
  const result = { targetKey: string(source.targetKey, 256, true), before: readAssessmentSnapshot(source.before), after: readAssessmentSnapshot(source.after),
    eligibility: readEligibility(source.eligibility) };
  if (!/^v1:(verb|adjective):[^:]+:[0-9a-f]{16}$/.test(result.targetKey)
    || assessmentCounts.some(name => result.after[name] < result.before[name])) invalid();
  return result;
}

/** @returns {PracticeEvent} */
function readEvent(value) {
  const s = object(value), exercise = object(s.exercise), target = object(s.target), diagnosis = object(s.diagnosis), daily = object(s.totals);
  const result = {
    id: string(s.id, 128, true), sequence: integer(s.sequence), questionId: string(s.questionId, 128, true), at: timestamp(s.at),
    type: string(s.type), outcome: string(s.outcome),
    exercise: { id: string(exercise.id), courseId: string(exercise.courseId), form: nullableString(exercise.form), surface: string(exercise.surface),
      reading: string(exercise.reading), wordClass: string(exercise.wordClass), domain: string(exercise.domain) },
    target: { surface: string(target.surface), reading: string(target.reading), form: nullableString(target.form), label: string(target.label), kind: string(target.kind),
      kcIds: strings(target.kcIds), answers: list(target.answers, v => string(v), 32), readings: list(target.readings, v => string(v), 32),
      stepIndex: target.stepIndex === null ? null : integer(target.stepIndex), totalSteps: integer(target.totalSteps), nextTotalSteps: integer(target.nextTotalSteps) },
    answer: string(s.answer), answerLength: integer(s.answerLength), answerTruncated: bool(s.answerTruncated), hintUsed: bool(s.hintUsed),
    diagnosis: { kcId: nullableString(diagnosis.kcId), confirmedKcIds: strings(diagnosis.confirmedKcIds), resolution: string(diagnosis.resolution), message: string(diagnosis.message, 4000) },
    changes: knowledgeChanges(s.changes),
    ...(s.support === undefined ? {} : { support: readSupport(s.support) }),
    ...(s.assistedChanges === undefined ? {} : { assistedChanges: knowledgeChanges(s.assistedChanges) }),
    ...(s.assessment === undefined ? {} : { assessment: readAssessment(s.assessment) }),
    totals: { before: totals(daily.before), after: totals(daily.after) },
  };
  if (!['question', 'step', 'diagnostic-end', 'migration', 'hint'].includes(result.type)
    || !['correct', 'incorrect', 'revealed', 'typo', 'invalid', 'completed', 'skipped', 'migrated', 'shown'].includes(result.outcome)
    || !result.sequence || result.answerLength < Array.from(result.answer).length
    || result.answerTruncated !== (result.answerLength > Array.from(result.answer).length)
    || new Set(result.changes.map(c => c.kcId)).size !== result.changes.length
    || new Set((result.assistedChanges ?? []).map(c => c.kcId)).size !== (result.assistedChanges ?? []).length
    || (result.type === 'migration') !== (result.outcome === 'migrated')
    || (result.type === 'hint') !== (result.outcome === 'shown')
    || (result.type === 'diagnostic-end') !== ['completed', 'skipped'].includes(result.outcome)
    || (result.support?.independent && (result.hintUsed || result.type !== 'question'))
    || (result.support?.source === 'migration' && result.type !== 'migration')
    || (result.support?.source === 'completion' && result.type !== 'diagnostic-end')
    || (result.assessment?.eligibility?.eligible && result.assessment.eligibility.availableAt !== null
      && Date.parse(result.assessment.eligibility.availableAt) > Date.parse(result.at))) invalid();
  if (result.type === 'hint' && (!result.hintUsed || result.support?.source !== 'hinted'
    || !result.support.provided.includes('hint') || result.changes.length || (result.assistedChanges ?? []).length
    || (result.assessment && assessmentCounts.some(name => result.assessment.before[name] !== result.assessment.after[name])))) invalid();
  if (result.assessment && ['step', 'diagnostic-end'].includes(result.type)) {
    const { before, after } = result.assessment;
    const unchangedCounts = result.type === 'diagnostic-end' ? assessmentCounts
      : ['independentAttempts', 'independentCorrect', 'assistedOriginalAttempts', 'assistedOriginalCorrect', 'eligibleRetestCorrect'];
    if (unchangedCounts.some(name => before[name] !== after[name]) || before.pending !== after.pending
      || before.pendingReason !== after.pendingReason || before.lastFailureAt !== after.lastFailureAt) invalid();
  }
  return result;
}

/** @param {PracticeLog} log @returns {PracticeLog} */
function retain(log) {
  const sizes = log.events.map(event => JSON.stringify(event).length + 1);
  let chars = JSON.stringify({ ...log, events: [] }).length + sizes.reduce((sum, size) => sum + size, 0), start = 0;
  while (log.events.length - start > PRACTICE_LOG_LIMIT || chars > PRACTICE_LOG_MAX_CHARS) chars -= sizes[start++];
  return { ...log, droppedEntries: log.droppedEntries + start, events: log.events.slice(start) };
}

/** Validate and retain snapshots, including old KC labels. This reader never
 * applies evidence itself; the separate legacy assessment migration reconciles
 * only those historical changes whose full snapshot chains can be verified.
 * @param {unknown} value @returns {PracticeLog} */
export function parsePracticeLog(value) {
  if (value === undefined) return emptyPracticeLog();
  const s = object(value);
  if (![1, 2].includes(s.version) || !Array.isArray(s.events)) invalid();
  const totalEvents = integer(s.totalEvents), droppedEntries = integer(s.droppedEntries);
  if (totalEvents !== droppedEntries + s.events.length) invalid();
  const events = s.events.map(readEvent), ids = new Set();
  for (const [index, event] of events.entries()) {
    if (event.sequence !== droppedEntries + index + 1 || ids.has(event.id)) invalid();
    ids.add(event.id);
  }
  return retain({ version: s.version, totalEvents, droppedEntries, events });
}

/** Append to the same profile snapshot as the score change. The caller commits
 * both with one storage write, or retains both in its existing unsaved buffer.
 * @param {any} before @param {any} after
 * @param {{questionId: string, type: string, outcome: string, exercise: LogExercise, target: LogTarget, answer?: string, hintUsed?: boolean, support?: EvidenceSupport, assessmentKey?: string, eligibility?: AssessmentChange['eligibility'], diagnosis?: {kcId?: string | null, confirmedKcIds?: string[], resolution?: string, message?: string}, id?: string, at?: string}} detail
 * @param {(id: string) => string} labelFor */
export function appendPracticeEvent(before, after, detail, labelFor = id => id) {
  const log = before.practiceLog ?? emptyPracticeLog(), id = detail.id ?? practiceEventId();
  if (log.events.some(event => event.id === id)) return before;
  const keys = new Set([...Object.keys(before.byKc), ...Object.keys(after.byKc)]);
  const changes = [...keys].flatMap(kcId => {
    const previous = before.byKc[kcId] ?? null, next = after.byKc[kcId] ?? null;
    return JSON.stringify(previous) === JSON.stringify(next) ? [] : [{ kcId, label: labelFor(kcId), before: previous, after: next }];
  });
  const beforeAssisted = before.assessment?.assistedByKc ?? {}, afterAssisted = after.assessment?.assistedByKc ?? {};
  const assistedChanges = [...new Set([...Object.keys(beforeAssisted), ...Object.keys(afterAssisted)])].flatMap(kcId =>
    JSON.stringify(beforeAssisted[kcId] ?? null) === JSON.stringify(afterAssisted[kcId] ?? null) ? []
      : [{ kcId, label: labelFor(kcId), before: beforeAssisted[kcId] ?? null, after: afterAssisted[kcId] ?? null }]);
  const input = Array.from(detail.answer ?? '');
  const event = readEvent({ id, sequence: log.totalEvents + 1, questionId: detail.questionId, at: detail.at ?? new Date().toISOString(),
    type: detail.type, outcome: detail.outcome, exercise: detail.exercise, target: detail.target,
    answer: input.slice(0, 256).join(''), answerLength: input.length, answerTruncated: input.length > 256, hintUsed: detail.hintUsed ?? false,
    diagnosis: { kcId: detail.diagnosis?.kcId ?? null, confirmedKcIds: detail.diagnosis?.confirmedKcIds ?? [],
      resolution: detail.diagnosis?.resolution ?? detail.outcome, message: detail.diagnosis?.message ?? '' },
    changes, assistedChanges, ...(detail.support ? { support: detail.support } : {}),
    ...(detail.assessmentKey ? { assessment: { targetKey: detail.assessmentKey, before: assessmentSnapshot(before.assessment, detail.assessmentKey),
      after: assessmentSnapshot(after.assessment, detail.assessmentKey), eligibility: detail.eligibility ?? null } } : {}), totals: { before, after },
  });
  return { ...after, practiceLog: retain({ version: 2, totalEvents: event.sequence, droppedEntries: log.droppedEntries, events: [...log.events, event] }) };
}
