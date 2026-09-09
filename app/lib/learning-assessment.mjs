import { buildDiagnosticPlan } from './diagnostic-plan.mjs';
import { deriveUnified } from './unified-knowledge.mjs';
import { isRuGodanException } from './knowledge-model.mjs';

/**
 * Independent whole-question evidence is separate from assisted atom evidence.
 * Counters are lifetime counters, not a copy of the current day's totals.
 * Callers own independentByKc/assistedByKc; this module never awards atom credit.
 *
 * @typedef {{item: {domain?: string, surface: string, reading?: string, class: string, iiFamily?: boolean, tailClass?: string}, form?: string | null, courseId?: string, kcIds?: string[]}} AssessmentExercise
 * @typedef {{key: string, form: string | null, courseId: string, domain: string, ruleSignature: string, kcIds: string[], wordKey: string, surface: string, reading: string}} AssessmentTarget
 * @typedef {{target: AssessmentTarget, attempts: number, independentAttempts: number, independentCorrect: number, assistedOriginalAttempts: number, assistedOriginalCorrect: number, assistedStepAttempts: number, assistedStepCorrect: number, eligibleRetestCorrect: number, lastAt: string, lastQuestionId: string, lastWordKey: string, lastOrdinal: number, lastOutcome: string, lastRetestPolicy: string | null}} TargetEvidence
 * @typedef {{key: string, target: AssessmentTarget, courseId: string, kcIds: string[], failedKcIds: string[], reason: string, createdAt: string, createdOrdinal: number, lastFailureAt: string | null, lastFailureOrdinal: number | null, lastWordKey: string, lastQuestionId: string, lastPresentedOrdinal: number, lastPresentedAt: string, lastPresentedWordKey: string, failures: number}} PendingRetest
 * @typedef {{version: 1, originalCount: number, byTarget: Record<string, TargetEvidence>, pending: Record<string, PendingRetest>, independentByKc: Record<string, import('./adaptive.mjs').SkillStats>, assistedByKc: Record<string, import('./adaptive.mjs').SkillStats>, seenQuestionIds: string[], seenAssistedIds: string[], seenExposureIds: string[]}} LearningAssessment
 * @typedef {{eligible: boolean, reason: string, remainingQuestions: number, availableAt: string | null, policy: string}} RetestStatus
 */

export const RETEST_MIN_INTERVENING_QUESTIONS = 2;
export const SINGLE_WORD_RETEST_DELAY_MS = 24 * 60 * 60 * 1000;
const unique = values => [...new Set(values)];
const ruleOnly = id => !/^(class\.|adj\.class\.|heuristic\.|facet\.class\.|facet\.adj\.class\.|lexeme\.)/.test(id);
const sameText = value => value.normalize('NFKC').replace(/[\u30a1-\u30f6]/g, character => String.fromCharCode(character.charCodeAt(0) - 0x60)).replace(/\s/g, '');
const ignoredReasons = new Set(['typo', 'invalid']);
const assistanceReasons = new Set(['hinted', 'hint', 'revealed', 'assisted', 'retry', 'feedback-retry']);
const targetCache = new WeakMap();

/** @returns {LearningAssessment} */
export function emptyAssessment() {
  return { version: 1, originalCount: 0, byTarget: {}, pending: {}, independentByKc: {}, assistedByKc: {}, seenQuestionIds: [], seenAssistedIds: [], seenExposureIds: [] };
}

function nativeKind(item) {
  const reading = item.reading ?? item.surface;
  if (item.tailClass) return item.tailClass;
  if (item.class === 'irregular') return reading.endsWith('する') ? 'suru' : 'kuru';
  if (item.class === 'godan' && ['行く', 'いく'].includes(item.surface)) return 'iku';
  if (item.class === 'godan' && item.surface === 'ある') return 'aru';
  return null;
}

function operationKind(node) {
  const kind = nativeKind(node.item);
  if (node.item.class === 'irregular') return kind;
  if (node.operation === 'sound' && kind === 'iku') return 'iku';
  if (node.ruleKcIds.includes('exception.aru-negative')) return 'aru';
  return null;
}

// The signature deliberately contains no literal stem or answer. Branches
// retain operation identity, actual auxiliary class, sound family and lexical
// exceptions, so a different but easier rule cannot discharge a pending task.
function rulePath(item, form) {
  if (!form) {
    const exception = item.domain === 'adjective'
      ? item.class === 'na' && item.surface.endsWith('い') ? 'na-i-ending' : null
      : item.class === 'godan' && isRuGodanException({ ...item, reading: item.reading ?? item.surface }) ? 'ru-godan' : null;
    return JSON.stringify(['classify', item.domain ?? 'verb', item.class, item.class === 'irregular' ? nativeKind(item) : null, exception]);
  }
  const plan = buildDiagnosticPlan({ ...item, domain: item.domain ?? 'verb' }, form);
  const paths = plan.paths.map(path => JSON.stringify(path.nodes.map(node => [
    node.operation, node.ruleKcIds.filter(ruleOnly).sort(), node.item.domain ?? 'verb', node.item.class, operationKind(node),
  ])));
  return JSON.stringify(unique(paths).sort().map(path => JSON.parse(path)));
}

// Two independent 32-bit digests keep persistent keys small. Full signatures
// remain in the record and are compared as well; a collision cannot authorize
// a different rule path or silently overwrite existing target evidence.
function signatureKey(domain, form, ruleSignature) {
  let first = 2166136261, second = 5381;
  for (const character of `${domain}:${form ?? 'classify'}:${ruleSignature}`) {
    const code = character.codePointAt(0);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return `v1:${domain}:${form ?? 'classify'}:${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

/** @param {AssessmentExercise} exercise @returns {AssessmentTarget} */
export function assessmentTarget(exercise) {
  const fingerprint = JSON.stringify([exercise.form, exercise.courseId, exercise.item.domain, exercise.item.surface,
    exercise.item.reading, exercise.item.class, exercise.item.iiFamily, exercise.item.tailClass, exercise.kcIds]);
  const cached = targetCache.get(exercise);
  if (cached?.fingerprint === fingerprint) return cached.target;
  const item = { ...exercise.item, domain: exercise.item.domain ?? 'verb', surface: sameText(exercise.item.surface), reading: sameText(exercise.item.reading ?? exercise.item.surface) };
  const form = exercise.form ?? null, ruleSignature = rulePath(item, form);
  const derivedIds = exercise.kcIds ?? deriveUnified(item, form).requiredKcIds;
  const target = {
    key: signatureKey(item.domain, form, ruleSignature), form,
    courseId: exercise.courseId ?? '', domain: item.domain, ruleSignature,
    kcIds: unique(derivedIds), wordKey: `${item.domain}:${item.class}:${sameText(item.reading ?? item.surface)}`,
    surface: exercise.item.surface, reading: exercise.item.reading ?? exercise.item.surface,
  };
  targetCache.set(exercise, { fingerprint, target });
  return target;
}

function timestamp(at) {
  const date = new Date(at ?? Date.now());
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid assessment timestamp');
  return date.toISOString();
}

function assertQuestionId(questionId) {
  if (typeof questionId !== 'string' || !questionId) throw new Error('Assessment requires a stable questionId');
}

/** @param {PendingRetest} pending @param {AssessmentExercise} exercise */
export function compatibleRetest(pending, exercise) {
  const target = assessmentTarget(exercise);
  return pending.key === target.key && pending.target.ruleSignature === target.ruleSignature;
}

/**
 * originalCount is the number BEFORE the proposed original submission. A
 * failure at ordinal 1 needs ordinals 2 and 3 between it and a retest at 4.
 * singleWord is an explicit catalog fact, never inferred from a filtered pool.
 * @param {PendingRetest} pending
 * @param {AssessmentExercise} exercise
 * @param {{originalCount: number, at?: string | number, singleWord?: boolean}} options
 * @returns {RetestStatus}
 */
export function retestStatus(pending, exercise, { originalCount, at, singleWord = false }) {
  const target = assessmentTarget(exercise);
  // A too-early correct rehearsal also exposed this recipe. Waiting only from
  // the original failure would allow the very next copy of that rehearsal to
  // count as spaced retrieval once unrelated older questions fill the gap.
  const spacingOrdinal = Math.max(pending.lastFailureOrdinal ?? pending.createdOrdinal, pending.lastPresentedOrdinal);
  const remainingQuestions = Math.max(0, RETEST_MIN_INTERVENING_QUESTIONS - (originalCount - spacingOrdinal));
  const sameWord = target.wordKey === pending.lastWordKey || target.wordKey === (pending.lastPresentedWordKey ?? pending.lastWordKey);
  const policy = sameWord && singleWord ? 'single-word-delayed' : 'different-word-spaced';
  const availableAt = policy === 'single-word-delayed' ? new Date(Date.parse(pending.lastPresentedAt) + SINGLE_WORD_RETEST_DELAY_MS).toISOString() : null;
  const base = { remainingQuestions, availableAt, policy };
  if (target.key !== pending.key || target.ruleSignature !== pending.target.ruleSignature) return { ...base, eligible: false, reason: 'different-rule-path' };
  if (sameWord && !singleWord) return { ...base, eligible: false, reason: 'same-word' };
  if (remainingQuestions) return { ...base, eligible: false, reason: 'needs-spacing' };
  if (availableAt && Date.parse(timestamp(at)) < Date.parse(availableAt)) return { ...base, eligible: false, reason: 'needs-delay' };
  return { ...base, eligible: true, reason: 'eligible' };
}

function blankTarget(target) {
  return { target, attempts: 0, independentAttempts: 0, independentCorrect: 0, assistedOriginalAttempts: 0,
    assistedOriginalCorrect: 0, assistedStepAttempts: 0, assistedStepCorrect: 0, eligibleRetestCorrect: 0,
    lastAt: '', lastQuestionId: '', lastWordKey: '', lastOrdinal: 0, lastOutcome: '', lastRetestPolicy: null };
}

function unscoredPending(target, questionId, at, ordinal, reason) {
  return { key: target.key, target, courseId: target.courseId, kcIds: target.kcIds, failedKcIds: [], reason,
    createdAt: at, createdOrdinal: ordinal, lastFailureAt: null, lastFailureOrdinal: null,
    lastWordKey: target.wordKey, lastQuestionId: questionId, lastPresentedOrdinal: ordinal, lastPresentedAt: at,
    lastPresentedWordKey: target.wordKey, failures: 0 };
}

/**
 * Only the first real original submission counts. Invalid/typo submissions do
 * not consume the question id; a later valid first submission can still count.
 * The caller's independent flag means the raw no-assistance condition, including
 * hints, correct answers, or feedback before that submission. The target's
 * independent counters additionally require a qualified retest if pending;
 * same-word or early originals belong to the assisted rehearsal counters.
 * @param {LearningAssessment} assessment
 * @param {{exercise: AssessmentExercise, questionId: string, at?: string | number, correct: boolean, independent?: boolean, reason?: string, failedKcIds?: string[], singleWord?: boolean}} attempt
 * @returns {LearningAssessment}
 */
export function recordIndependentAttempt(assessment, attempt) {
  const { exercise, questionId, correct: answeredCorrectly, reason = answeredCorrectly ? 'correct' : 'incorrect', failedKcIds = [], singleWord = false } = attempt;
  assertQuestionId(questionId);
  if (ignoredReasons.has(reason) || assessment.seenQuestionIds.includes(questionId)) return assessment;
  const independent = (attempt.independent ?? true) && !assistanceReasons.has(reason);
  const correct = answeredCorrectly && reason !== 'revealed';
  const target = assessmentTarget(exercise), at = timestamp(attempt.at), ordinal = assessment.originalCount + 1;
  const oldPending = assessment.pending[target.key], old = assessment.byTarget[target.key] ?? blankTarget(target);
  if (old.target.ruleSignature !== target.ruleSignature) throw new Error('Assessment target key collision');
  const status = oldPending ? retestStatus(oldPending, exercise, { originalCount: assessment.originalCount, at, singleWord }) : null;
  const qualifiedIndependent = independent && (!oldPending || status.eligible);
  const outcomePrefix = !independent ? 'assisted' : qualifiedIndependent ? 'independent' : 'rehearsal';
  const cleared = Boolean(correct && independent && status?.eligible);
  const nextTarget = { ...old, target, attempts: old.attempts + 1,
    independentAttempts: old.independentAttempts + Number(qualifiedIndependent), independentCorrect: old.independentCorrect + Number(qualifiedIndependent && correct),
    assistedOriginalAttempts: old.assistedOriginalAttempts + Number(!qualifiedIndependent), assistedOriginalCorrect: old.assistedOriginalCorrect + Number(!qualifiedIndependent && correct),
    eligibleRetestCorrect: old.eligibleRetestCorrect + Number(cleared), lastAt: at, lastQuestionId: questionId,
    lastWordKey: target.wordKey, lastOrdinal: ordinal, lastOutcome: `${outcomePrefix}-${correct ? 'correct' : 'incorrect'}`,
    lastRetestPolicy: cleared ? status.policy : null };
  const pending = { ...assessment.pending };
  if (!correct) {
    pending[target.key] = { key: target.key, target, courseId: target.courseId, kcIds: target.kcIds,
      failedKcIds: unique([...oldPending?.failedKcIds ?? [], ...failedKcIds]).filter(id => target.kcIds.includes(id)),
      reason, createdAt: oldPending?.createdAt ?? at, createdOrdinal: oldPending?.createdOrdinal ?? ordinal,
      lastFailureAt: at, lastFailureOrdinal: ordinal, lastWordKey: target.wordKey, lastQuestionId: questionId,
      lastPresentedOrdinal: ordinal, lastPresentedAt: at, lastPresentedWordKey: target.wordKey, failures: (oldPending?.failures ?? 0) + 1 };
  } else if (cleared) delete pending[target.key];
  else if (oldPending) pending[target.key] = { ...oldPending, lastPresentedOrdinal: ordinal, lastPresentedAt: at, lastPresentedWordKey: target.wordKey };
  else if (!independent) pending[target.key] = unscoredPending(target, questionId, at, ordinal, reason === 'correct' ? 'assisted' : reason);
  return { ...assessment, originalCount: ordinal, byTarget: { ...assessment.byTarget, [target.key]: nextTarget }, pending,
    seenQuestionIds: [...assessment.seenQuestionIds, questionId] };
}

/**
 * Assisted steps are tracked separately and never change originalCount,
 * pending, eligible retests, or either caller-owned atom statistics map.
 * @param {LearningAssessment} assessment
 * @param {{exercise: AssessmentExercise, questionId: string, eventId: string, at?: string | number, correct: boolean, reason?: string}} attempt
 * @returns {LearningAssessment}
 */
export function recordAssistedAttempt(assessment, { exercise, questionId, eventId, at, correct, reason = '' }) {
  assertQuestionId(questionId); assertQuestionId(eventId);
  if (ignoredReasons.has(reason) || assessment.seenAssistedIds.includes(eventId)) return assessment;
  const target = assessmentTarget(exercise), old = assessment.byTarget[target.key] ?? blankTarget(target);
  const nextTarget = { ...old, assistedStepAttempts: old.assistedStepAttempts + 1, assistedStepCorrect: old.assistedStepCorrect + Number(correct) };
  // Validate timestamps consistently, without replacing last original attempt.
  timestamp(at);
  return { ...assessment, byTarget: { ...assessment.byTarget, [target.key]: nextTarget }, seenAssistedIds: [...assessment.seenAssistedIds, eventId] };
}

/**
 * Record an explicit assisted action (step submission, completion or skipping)
 * as the latest recorded work on a still-pending target. This does not claim
 * to know when the user viewed the screen. It creates no attempt/atom credit,
 * never creates or clears pending, and never advances original question count.
 * Call separately from recordAssistedAttempt so statistics and exposure are
 * explicit operations, with their own replay-safe event receipts.
 * @param {LearningAssessment} assessment
 * @param {{exercise: AssessmentExercise, questionId: string, eventId: string, at?: string | number}} exposure
 * @returns {LearningAssessment}
 */
export function recordAssessmentExposure(assessment, { exercise, questionId, eventId, at }) {
  assertQuestionId(questionId); assertQuestionId(eventId);
  if (assessment.seenExposureIds.includes(eventId)) return assessment;
  const target = assessmentTarget(exercise), recordedAt = timestamp(at), pending = assessment.pending[target.key];
  // An older out-of-order event must not move the time backwards or restart
  // spacing at the current ordinal as though it had just happened.
  const update = pending && Date.parse(recordedAt) >= Date.parse(pending.lastPresentedAt);
  return { ...assessment, seenExposureIds: [...assessment.seenExposureIds, eventId],
    pending: update ? { ...assessment.pending, [target.key]: { ...pending, lastPresentedAt: recordedAt, lastPresentedWordKey: target.wordKey,
      lastPresentedOrdinal: Math.max(pending.lastPresentedOrdinal, assessment.originalCount) } } : assessment.pending };
}

/**
 * Showing a hint must survive refresh even before the first submission. It
 * establishes a need for a later independent check, not an incorrect answer.
 * A hint-only pending record therefore has failures=0 and null failure time /
 * ordinal. Its target row also has zero original and assisted attempts.
 * @param {LearningAssessment} assessment
 * @param {{exercise: AssessmentExercise, questionId: string, eventId: string, at?: string | number}} exposure
 * @returns {LearningAssessment}
 */
export function recordHintExposure(assessment, { exercise, questionId, eventId, at }) {
  assertQuestionId(questionId); assertQuestionId(eventId);
  if (assessment.seenExposureIds.includes(eventId)) return assessment;
  const target = assessmentTarget(exercise);
  if (assessment.pending[target.key]) return recordAssessmentExposure(assessment, { exercise, questionId, eventId, at });
  const recordedAt = timestamp(at), ordinal = assessment.originalCount;
  const pending = unscoredPending(target, questionId, recordedAt, ordinal, 'hinted');
  return { ...assessment, byTarget: assessment.byTarget[target.key] ? assessment.byTarget : { ...assessment.byTarget, [target.key]: blankTarget(target) },
    pending: { ...assessment.pending, [target.key]: pending }, seenExposureIds: [...assessment.seenExposureIds, eventId] };
}

/** @param {LearningAssessment} assessment @param {string} courseId */
export function pendingForCourse(assessment, courseId) {
  return Object.values(assessment.pending).filter(pending => pending.courseId === courseId);
}

/** @param {LearningAssessment} assessment @param {string} kcId */
export function pendingForKc(assessment, kcId) {
  return Object.values(assessment.pending).filter(pending => pending.kcIds.includes(kcId));
}

/**
 * Eligible items are round-robin by last original presentation. Waiting items
 * remain pending but do not occupy a slot: the caller may supply ordinary
 * practice when null is returned. catalogExercises must be the complete model,
 * not readiness/course/recency-filtered candidates, for singleton inference.
 * @template {AssessmentExercise} E
 * @param {LearningAssessment} assessment
 * @param {E[]} exercises
 * @param {{at?: string | number, catalogExercises?: AssessmentExercise[], excludeWordKeys?: string[], excludeTargetKeys?: string[]}} options
 * @returns {{exercise: E, pending: PendingRetest, status: RetestStatus} | null}
 */
export function selectRetest(assessment, exercises, { at, catalogExercises, excludeWordKeys = [], excludeTargetKeys = [] } = {}) {
  const excludedWords = new Set(excludeWordKeys), excludedTargets = new Set(excludeTargetKeys);
  const catalogWords = new Map();
  if (catalogExercises) for (const exercise of catalogExercises) {
    const target = assessmentTarget(exercise);
    if (!catalogWords.has(target.key)) catalogWords.set(target.key, new Set());
    catalogWords.get(target.key).add(target.wordKey);
  }
  const entries = Object.values(assessment.pending).filter(pending => !excludedTargets.has(pending.key)).sort((a, b) =>
    a.lastPresentedOrdinal - b.lastPresentedOrdinal || a.createdOrdinal - b.createdOrdinal || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const indexed = exercises.map(exercise => ({ exercise, target: assessmentTarget(exercise) }));
  for (const pending of entries) {
    const candidates = indexed.filter(({ target }) => target.key === pending.key && !excludedWords.has(target.wordKey))
      .sort((a, b) => a.target.wordKey < b.target.wordKey ? -1 : a.target.wordKey > b.target.wordKey ? 1 : 0);
    for (const { exercise } of candidates) {
      const singleWord = catalogWords.get(pending.key)?.size === 1;
      const status = retestStatus(pending, exercise, { originalCount: assessment.originalCount, at, singleWord });
      if (status.eligible) return { exercise, pending, status };
    }
  }
  return null;
}
