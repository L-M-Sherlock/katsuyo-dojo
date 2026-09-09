import { emptySkillStats } from './adaptive.mjs';
import { parsePracticeLog } from './practice-log.mjs';
import { assessmentTarget, emptyAssessment, recordAssessmentExposure, recordAssistedAttempt, recordHintExposure, recordIndependentAttempt, retestStatus } from './learning-assessment.mjs';
import { evidenceCondition, isLocalPracticeRule, scoreLearningEvidence } from './learning-evidence.mjs';
import { isFalseNaraClassification } from './score-corrections.mjs';

const STAT_KEYS = ['attempts', 'correct', 'filteredAccuracy', 'confidence', 'bestConfidence', 'cleanTimeTotal', 'cleanTimeCount'];
const realOutcomes = new Set(['correct', 'incorrect', 'revealed']);
const exposureOnlyReasons = new Set(['hinted', 'hint', 'assisted', 'retry', 'feedback-retry']);
const clone = value => structuredClone(value);
const equalStats = (left, right) => left == null || right == null ? left == null && right == null : STAT_KEYS.every(key => left[key] === right[key]);

function invalid(detail = '') { throw new Error(`学习评估数据不完整或不一致，未导入该备份。${detail}`); }
function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(); return value; }
function text(value, nonempty = false) { if (typeof value !== 'string' || (nonempty && !value)) invalid(); return value; }
function count(value) { if (!Number.isSafeInteger(value) || value < 0) invalid(); return value; }
function number(value, maximum = Infinity) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) invalid(); return value; }
function timestamp(value) { text(value, true); if (!Number.isFinite(Date.parse(value))) invalid(); return value; }
function uniqueStrings(value, allowed) {
  if (!Array.isArray(value)) invalid();
  for (const id of value) if (!text(id, true) || (allowed && !allowed.has(id))) invalid();
  if (new Set(value).size !== value.length) invalid();
  return value;
}
function stats(value) {
  const result = object(value);
  count(result.attempts); count(result.correct); count(result.cleanTimeCount);
  number(result.confidence, 1); number(result.bestConfidence, 1); number(result.cleanTimeTotal);
  if (result.filteredAccuracy !== null) number(result.filteredAccuracy, 1);
  if (result.correct > result.attempts || result.cleanTimeCount > result.correct || result.bestConfidence < result.confidence) invalid();
  return result;
}
function statsMap(value, allowed, local = false) {
  const result = object(value);
  for (const [id, entry] of Object.entries(result)) {
    if (!allowed.has(id) || (local && !isLocalPracticeRule(id))) invalid();
    stats(entry);
  }
  return result;
}

function digestKey(domain, form, signature) {
  let first = 2166136261, second = 5381;
  for (const character of `${domain}:${form ?? 'classify'}:${signature}`) {
    const code = character.codePointAt(0);
    first = Math.imul(first ^ code, 16777619); second = Math.imul(second, 33) ^ code;
  }
  return `v1:${domain}:${form ?? 'classify'}:${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function readTarget(value, allowed) {
  const target = object(value);
  for (const key of ['key', 'domain', 'ruleSignature', 'wordKey', 'surface', 'reading']) text(target[key], true);
  text(target.courseId);
  if (!['verb', 'adjective'].includes(target.domain) || (target.form !== null && !text(target.form, true))) invalid();
  uniqueStrings(target.kcIds, allowed);
  let signature;
  try { signature = JSON.parse(target.ruleSignature); } catch { invalid(); }
  if (!Array.isArray(signature) || !signature.length || target.key !== digestKey(target.domain, target.form, target.ruleSignature)
    || !target.wordKey.startsWith(`${target.domain}:`)) invalid();
  return target;
}

function validateMigration(value, allowed) {
  if (value === undefined) return;
  const migration = object(value);
  if (migration.version !== 1 || migration.from !== 'legacy-practice-log') invalid();
  timestamp(migration.at); count(migration.throughSequence);
  count(migration.knownIndependentEvents); count(migration.knownAssistedEvents);
  object(migration.originalLog);
  count(migration.unknownEvents); count(migration.originalLog.totalEvents); count(migration.originalLog.droppedEntries);
  if (migration.throughSequence > migration.originalLog.totalEvents || migration.originalLog.droppedEntries > migration.originalLog.totalEvents) invalid();
  uniqueStrings(migration.verifiedKcIds, allowed); uniqueStrings(migration.unverifiedKcIds, allowed);
  uniqueStrings(migration.unverifiedQuestionIds);
  for (const [id, baseline] of Object.entries(object(migration.baselineByKc))) {
    if (!allowed.has(id)) invalid(); if (baseline !== null) stats(baseline);
  }
  if (!Array.isArray(migration.changes) || !Array.isArray(migration.uncertain) || !Array.isArray(migration.events)) invalid();
  for (const change of migration.changes) {
    object(change);
    if (!allowed.has(change.kcId)) invalid();
    if (change.before !== null) stats(change.before); if (change.after !== null) stats(change.after);
  }
  for (const entry of migration.uncertain) {
    object(entry);
    text(entry.reason, true); if (entry.kcId !== undefined && !allowed.has(entry.kcId)) invalid();
    if (entry.eventId !== undefined) text(entry.eventId, true);
  }
  for (const entry of migration.events) {
    object(entry);
    text(entry.id, true); count(entry.sequence); text(entry.source, true);
    uniqueStrings(entry.assessedKcIds, allowed);
  }
}

// A versioned assessment is authoritative. Import validates it but never
// replays the retained historical log (which may predate a completed retest).
function restoreVersioned(source, allowed) {
  const assessment = object(source.assessment), byKc = statsMap(source.byKc, allowed);
  if (assessment.version !== 1) invalid();
  count(assessment.originalCount);
  uniqueStrings(assessment.seenQuestionIds); uniqueStrings(assessment.seenAssistedIds); uniqueStrings(assessment.seenExposureIds);
  if (assessment.seenQuestionIds.length !== assessment.originalCount) invalid();
  statsMap(assessment.independentByKc, allowed); statsMap(assessment.assistedByKc, allowed, true);
  for (const [id, known] of Object.entries(assessment.independentByKc)) {
    const total = byKc[id];
    if (!total || known.attempts > total.attempts || known.correct > total.correct
      || known.cleanTimeCount > total.cleanTimeCount || known.cleanTimeTotal > total.cleanTimeTotal + 1e-7) invalid();
  }
  let originals = 0, assisted = 0;
  for (const [key, entry] of Object.entries(object(assessment.byTarget))) {
    object(entry);
    const target = readTarget(entry.target, allowed);
    if (target.key !== key) invalid();
    for (const field of ['attempts', 'independentAttempts', 'independentCorrect', 'assistedOriginalAttempts', 'assistedOriginalCorrect',
      'assistedStepAttempts', 'assistedStepCorrect', 'eligibleRetestCorrect', 'lastOrdinal']) count(entry[field]);
    if (entry.attempts !== entry.independentAttempts + entry.assistedOriginalAttempts || entry.independentCorrect > entry.independentAttempts
      || entry.assistedOriginalCorrect > entry.assistedOriginalAttempts || entry.assistedStepCorrect > entry.assistedStepAttempts
      || entry.eligibleRetestCorrect > entry.independentCorrect || entry.lastOrdinal > assessment.originalCount) invalid();
    text(entry.lastAt); text(entry.lastQuestionId); text(entry.lastWordKey); text(entry.lastOutcome);
    if (![null, 'single-word-spaced', 'single-word-delayed', 'different-word-spaced'].includes(entry.lastRetestPolicy)) invalid();
    if (entry.attempts) {
      timestamp(entry.lastAt);
      if (!assessment.seenQuestionIds.includes(entry.lastQuestionId) || !entry.lastOrdinal || !entry.lastWordKey) invalid();
    } else if (entry.lastOrdinal || entry.lastAt || entry.lastQuestionId || entry.lastWordKey || entry.lastOutcome) invalid();
    originals += entry.attempts; assisted += entry.assistedStepAttempts;
  }
  // Unknown catalog items in a legacy log still count as intervening original
  // questions; their metadata cannot be invented into byTarget.
  validateMigration(assessment.migration, allowed);
  const unverifiedQuestionIds = assessment.migration?.unverifiedQuestionIds ?? [];
  if (unverifiedQuestionIds.some(id => !assessment.seenQuestionIds.includes(id))
    || originals + unverifiedQuestionIds.length !== assessment.originalCount || assisted !== assessment.seenAssistedIds.length) invalid();
  const pendingDefaults = {};
  for (const [key, entry] of Object.entries(object(assessment.pending))) {
    object(entry);
    const target = readTarget(entry.target, allowed), known = assessment.byTarget[key];
    if (entry.key !== key || target.key !== key || !known || target.ruleSignature !== known.target.ruleSignature) invalid();
    text(entry.courseId); text(entry.reason, true); text(entry.lastWordKey, true); text(entry.lastQuestionId, true);
    text(entry.lastPresentedWordKey === undefined ? entry.lastWordKey : entry.lastPresentedWordKey, true);
    if (entry.lastPresentedWordKey === undefined) pendingDefaults[key] = { ...entry, lastPresentedWordKey: entry.lastWordKey };
    uniqueStrings(entry.kcIds, allowed); uniqueStrings(entry.failedKcIds, new Set(entry.kcIds));
    for (const field of ['createdOrdinal', 'lastPresentedOrdinal', 'failures']) count(entry[field]);
    timestamp(entry.createdAt); timestamp(entry.lastPresentedAt);
    if (entry.createdOrdinal > entry.lastPresentedOrdinal || entry.lastPresentedOrdinal > assessment.originalCount
      || entry.courseId !== target.courseId || entry.kcIds.some(id => !target.kcIds.includes(id))) invalid();
    if (entry.failures === 0) {
      // Seeing a hint creates a retrieval obligation, not an invented failed
      // question. Its question id need not have been submitted yet.
      if (!exposureOnlyReasons.has(entry.reason) || entry.lastFailureAt !== null || entry.lastFailureOrdinal !== null || entry.failedKcIds.length) invalid();
    } else {
      count(entry.lastFailureOrdinal); timestamp(entry.lastFailureAt);
      if (!entry.lastFailureOrdinal || entry.createdOrdinal > entry.lastFailureOrdinal || entry.lastFailureOrdinal > entry.lastPresentedOrdinal
        || !assessment.seenQuestionIds.includes(entry.lastQuestionId) || Date.parse(entry.lastPresentedAt) < Date.parse(entry.lastFailureAt)) invalid();
    }
  }
  return { byKc: clone(byKc), assessment: clone({ ...assessment, pending: { ...assessment.pending, ...pendingDefaults } }) };
}

function catalogIndex(exercises) {
  const byId = new Map(), byWordForm = new Map(), wordsByTarget = new Map();
  for (const exercise of exercises ?? []) {
    if (exercise.id) byId.set(exercise.id, exercise);
    const key = JSON.stringify([exercise.item.domain ?? 'verb', exercise.item.surface, exercise.form ?? null]);
    if (!byWordForm.has(key)) byWordForm.set(key, []);
    byWordForm.get(key).push(exercise);
  }
  return { byId, byWordForm, wordsByTarget, exercises, complete: Array.isArray(exercises) };
}

function findExercise(entry, catalog) {
  const log = entry.exercise;
  const matching = candidate => candidate && candidate.item.surface === log.surface && (candidate.item.domain ?? 'verb') === log.domain
    && (candidate.form ?? null) === log.form && candidate.item.class === log.wordClass
    && (candidate.item.reading ?? candidate.item.surface) === log.reading;
  const byId = catalog.byId.get(log.id);
  if (byId) return matching(byId) ? byId : null;
  const candidates = catalog.byWordForm.get(JSON.stringify([log.domain, log.surface, log.form])) ?? [];
  const matches = candidates.filter(matching);
  if (!matches.length) return null;
  // Preserve full lexical metadata (notably iiFamily) from the catalog.
  const exercise = matches.find(candidate => candidate.courseId === log.courseId) ?? matches[0];
  return { ...exercise, courseId: log.courseId };
}

function isSingleWord(exercise, catalog) {
  if (!catalog.complete) return false;
  const target = assessmentTarget(exercise);
  if (!catalog.wordsByTarget.has(target.key)) {
    const words = new Set();
    // Full-catalog identity, never the subset of exercises appearing in a log.
    for (const candidate of catalog.exercises) if (candidate.form === exercise.form && (candidate.item.domain ?? 'verb') === (exercise.item.domain ?? 'verb')) {
      const candidateTarget = assessmentTarget(candidate);
      if (candidateTarget.key === target.key && candidateTarget.ruleSignature === target.ruleSignature) words.add(candidateTarget.wordKey);
    }
    catalog.wordsByTarget.set(target.key, words);
  }
  return catalog.wordsByTarget.get(target.key).size === 1;
}

function validChange(event, change) {
  const before = change.before ?? emptySkillStats(), after = change.after;
  if (!after || after.attempts - before.attempts !== 1 || ![0, 1].includes(after.correct - before.correct)
    || ![0, 1].includes(after.cleanTimeCount - before.cleanTimeCount) || after.cleanTimeTotal < before.cleanTimeTotal) return false;
  if (event.type === 'diagnostic-end' || !realOutcomes.has(event.outcome)) return false;
  if (!event.target.kcIds.includes(change.kcId)) return false;
  if (event.outcome === 'revealed') return true;
  const positive = after.correct === before.correct + 1;
  if (event.outcome === 'correct') return positive;
  return positive ? event.diagnosis.confirmedKcIds.includes(change.kcId) : event.diagnosis.kcId === change.kcId;
}

function withRecordedSpeed(previous, next, event, assessed) {
  const updated = { ...next };
  for (const change of event.changes) {
    if (!assessed.includes(change.kcId)) continue;
    const countDelta = change.after.cleanTimeCount - (change.before?.cleanTimeCount ?? 0);
    const timeDelta = change.after.cleanTimeTotal - (change.before?.cleanTimeTotal ?? 0);
    if (countDelta === 1 && timeDelta > 0 && updated[change.kcId]) updated[change.kcId] = {
      ...updated[change.kcId], cleanTimeTotal: (previous[change.kcId]?.cleanTimeTotal ?? 0) + timeDelta,
      cleanTimeCount: (previous[change.kcId]?.cleanTimeCount ?? 0) + countDelta,
    };
  }
  return updated;
}

/**
 * Restore version 1 exactly, or reconcile the auditable suffix of a legacy
 * log. The log is evidence of what was assessed at the time: this migration
 * never runs a newer answer analyzer against old text to invent a diagnosis.
 * Untouched history and any KC whose snapshot chain cannot be reconciled are
 * retained as unverified baseline, rather than cleared or guessed backwards.
 */
export function restoreLearningAssessment(sourceProfile, { components, exercises, at = new Date().toISOString() }) {
  const source = object(sourceProfile), allowed = new Set(components.map(component => component.id));
  if (source.assessment !== undefined) return restoreVersioned(source, allowed);
  const originalByKc = clone(statsMap(source.byKc, allowed)), log = parsePracticeLog(source.practiceLog);
  const catalog = catalogIndex(exercises), resolved = new Map(), histories = new Map(), uncertain = [], rejected = new Set();
  const note = entry => uncertain.push(entry);
  for (const event of log.events) {
    const exercise = findExercise(event, catalog);
    resolved.set(event.id, exercise);
    if (!exercise && event.type !== 'diagnostic-end') note({ eventId: event.id, reason: 'exercise-metadata-unavailable' });
    for (const change of event.changes) {
      if (!allowed.has(change.kcId)) continue;
      if (!histories.has(change.kcId)) histories.set(change.kcId, []);
      histories.get(change.kcId).push({ event, change });
    }
  }
  const baselineByKc = {}, reliable = new Set();
  let byKc = clone(originalByKc);
  for (const [id, history] of histories) {
    let cursor = originalByKc[id] ?? null, reason = '';
    for (const { event, change } of [...history].reverse()) {
      if (!equalStats(cursor, change.after)) { reason = 'snapshot-chain-mismatch'; break; }
      if (!resolved.get(event.id)) { reason = 'exercise-metadata-unavailable'; break; }
      if (!validChange(event, change)) { reason = 'unverifiable-recorded-change'; break; }
      cursor = change.before;
    }
    if (reason) { note({ kcId: id, reason }); rejected.add(id); continue; }
    reliable.add(id); baselineByKc[id] = clone(cursor);
    if (cursor === null) delete byKc[id]; else byKc[id] = clone(cursor);
  }
  if (!log.events.length) note({ reason: 'no-practice-log' });
  if (log.droppedEntries) note({ reason: 'older-events-not-retained', droppedEntries: log.droppedEntries });
  let assessment = emptyAssessment(), knownIndependentEvents = 0, knownAssistedEvents = 0, unknownEvents = 0;
  const feedbackQuestions = new Set(), replayEvents = [], unverifiedQuestionIds = [];
  for (const event of log.events) {
    if (event.type === 'hint') {
      const exercise = resolved.get(event.id);
      if (exercise) assessment = recordHintExposure(assessment, { exercise, questionId: event.questionId, eventId: event.id, at: event.at });
      feedbackQuestions.add(event.questionId);
      replayEvents.push({ id: event.id, sequence: event.sequence, source: exercise ? 'hinted' : 'unverified', assessedKcIds: [] });
      continue;
    }
    if (event.type === 'diagnostic-end') {
      const exercise = resolved.get(event.id);
      if (exercise) assessment = recordAssessmentExposure(assessment, { exercise, questionId: event.questionId, eventId: event.id, at: event.at });
      feedbackQuestions.add(event.questionId); continue;
    }
    // A rejected input or isolated lexical typo exposes no conjugation recipe.
    // It therefore does not spend a question or turn its later first real
    // submission into a grammar-feedback retry.
    if (!realOutcomes.has(event.outcome)) continue;
    const exercise = resolved.get(event.id), duplicate = assessment.seenQuestionIds.includes(event.questionId);
    const physical = evidenceCondition({ type: event.type, hintUsed: event.hintUsed, revealed: event.outcome === 'revealed',
      hadFeedback: feedbackQuestions.has(event.questionId) || duplicate,
      step: { diagnosticOnly: event.target.kind === 'classification', kind: event.target.kind,
        continuation: event.target.surface !== event.exercise.surface } });
    let support = physical;
    if (event.type === 'question' && !duplicate) {
      if (!exercise) {
        assessment = { ...assessment, originalCount: assessment.originalCount + 1, seenQuestionIds: [...assessment.seenQuestionIds, event.questionId] };
        unverifiedQuestionIds.push(event.questionId);
        unknownEvents++;
      } else {
        const target = assessmentTarget(exercise), pending = assessment.pending[target.key];
        const singleWord = pending ? isSingleWord(exercise, catalog) : false;
        if (physical.independent && pending && !retestStatus(pending, exercise, { originalCount: assessment.originalCount, at: event.at, singleWord }).eligible) {
          support = evidenceCondition({ rehearsal: true });
        }
        assessment = recordIndependentAttempt(assessment, { exercise, questionId: event.questionId, at: event.at,
          correct: event.outcome === 'correct', independent: physical.independent, reason: event.outcome === 'revealed' ? 'revealed' : physical.independent ? event.outcome : physical.source,
          failedKcIds: event.outcome === 'incorrect' && !isFalseNaraClassification(event) && reliable.has(event.diagnosis.kcId)
            && event.changes.some(change => change.kcId === event.diagnosis.kcId && change.after.correct === (change.before?.correct ?? 0)) ? [event.diagnosis.kcId] : [], singleWord });
        if (support.independent) knownIndependentEvents++; else knownAssistedEvents++;
      }
    } else if (exercise) {
      assessment = recordAssistedAttempt(assessment, { exercise, questionId: event.questionId, eventId: event.id, at: event.at,
        correct: event.outcome === 'correct', reason: event.outcome });
      assessment = recordAssessmentExposure(assessment, { exercise, questionId: event.questionId, eventId: event.id, at: event.at });
      knownAssistedEvents++;
    } else unknownEvents++;
    const actualScope = exercise ? event.changes.map(change => change.kcId).filter(id => reliable.has(id) && !(id === 'adj.class.i' && isFalseNaraClassification(event))) : [];
    const previous = { byKc, independentByKc: assessment.independentByKc, assistedByKc: assessment.assistedByKc };
    const scored = scoreLearningEvidence(previous, { kcIds: actualScope, form: event.type === 'question' ? event.exercise.form : event.target.form,
      correct: event.outcome === 'correct', failedKcId: actualScope.includes(event.diagnosis.kcId) ? event.diagnosis.kcId : null,
      confirmedKcIds: event.diagnosis.confirmedKcIds.filter(id => actualScope.includes(id)), support,
      hintUsed: event.hintUsed, revealed: event.outcome === 'revealed', diagnosticOnly: event.type === 'step' && event.target.kind === 'classification' });
    if (support.independent && event.outcome === 'correct') {
      scored.byKc = withRecordedSpeed(previous.byKc, scored.byKc, event, scored.assessedKcIds);
      scored.independentByKc = withRecordedSpeed(previous.independentByKc, scored.independentByKc, event, scored.assessedKcIds);
    }
    byKc = scored.byKc;
    assessment = { ...assessment, independentByKc: scored.independentByKc, assistedByKc: scored.assistedByKc };
    replayEvents.push({ id: event.id, sequence: event.sequence, source: exercise ? support.source : 'unverified', assessedKcIds: scored.assessedKcIds });
    feedbackQuestions.add(event.questionId);
  }
  const changedKeys = new Set([...Object.keys(originalByKc), ...Object.keys(byKc)]);
  const changes = [...changedKeys].filter(id => !equalStats(originalByKc[id], byKc[id])).map(kcId => ({ kcId, before: clone(originalByKc[kcId] ?? null), after: clone(byKc[kcId] ?? null) }));
  assessment.migration = { version: 1, from: 'legacy-practice-log', at: timestamp(at), throughSequence: log.totalEvents,
    originalLog: { totalEvents: log.totalEvents, droppedEntries: log.droppedEntries }, baselineByKc,
    verifiedKcIds: [...reliable], unverifiedKcIds: [...new Set([...Object.keys(originalByKc).filter(id => !reliable.has(id)), ...rejected])],
    changes, knownIndependentEvents, knownAssistedEvents, unknownEvents, unverifiedQuestionIds, uncertain, events: replayEvents };
  return { byKc, assessment };
}
