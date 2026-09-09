import { emptyAssessment, assessmentTarget, retestStatus, recordIndependentAttempt, recordAssistedAttempt, recordAssessmentExposure, recordHintExposure } from './learning-assessment.mjs';
import { evidenceCondition, scoreLearningEvidence } from './learning-evidence.mjs';

/** Index only the complete catalog; a filtered pool cannot establish that an
 * exception has only one usable word. */
export function assessmentCatalog(exercises) {
  const targets = new Map();
  for (const exercise of exercises) {
    const target = assessmentTarget(exercise);
    if (!targets.has(target.key)) targets.set(target.key, { exercises: [], words: new Set() });
    const group = targets.get(target.key);
    group.exercises.push(exercise); group.words.add(target.wordKey);
  }
  return targets;
}

/** Apply one actual observation; the caller atomically saves its returned
 * profile and log. Question identities and auxiliary event ids are stable. */
export function applyLearningObservation(profile, exercise, observation, catalog) {
  const assessment = profile.assessment ?? emptyAssessment();
  const { type = 'question', outcome, questionId, eventId, at, hintUsed = false, step = null } = observation;
  const target = assessmentTarget(exercise), pending = assessment.pending[target.key];
  const singleWord = catalog?.get(target.key)?.words.size === 1;
  const status = pending ? retestStatus(pending, exercise, { originalCount: assessment.originalCount, at, singleWord }) : null;
  if (type === 'hint') {
    if (outcome !== 'shown') throw new Error('A hint observation must describe a shown hint');
    const support = { independent: false, source: 'hinted', provided: ['hint'] };
    if (assessment.seenExposureIds.includes(eventId)) return { profile, support, retest: status, duplicate: true };
    const next = recordHintExposure(assessment, { exercise, questionId, eventId, at });
    return { profile: { ...profile, assessment: next }, support,
      retest: retestStatus(next.pending[target.key], exercise, { originalCount: next.originalCount, at, singleWord }), duplicate: false };
  }
  if (['typo', 'invalid'].includes(outcome)) {
    const support = { independent: false, source: outcome, provided: outcome === 'typo' ? ['lexical-retry'] : [] };
    // The original lexical-only retry discloses no grammar and must leave its
    // first genuine submission eligible. A retry inside an already supplied
    // step is a recorded assisted operation, even though it is not scoreable.
    if (type !== 'step') return { profile, support, retest: status, duplicate: false };
    if (assessment.seenExposureIds.includes(eventId)) return { profile, support, retest: status, duplicate: true };
    const next = recordAssessmentExposure(assessment, { exercise, questionId, eventId, at });
    return { profile: { ...profile, assessment: next }, support, retest: status, duplicate: false };
  }
  if (type === 'diagnostic-end') {
    if (assessment.seenExposureIds.includes(eventId)) return { profile, support: { independent: false, source: 'completion', provided: [] }, retest: status, duplicate: true };
    const next = recordAssessmentExposure(assessment, { exercise, questionId, eventId, at });
    return { profile: { ...profile, assessment: next }, support: { independent: false, source: 'completion', provided: ['answer'] }, retest: status, duplicate: false };
  }
  if (type === 'question' ? assessment.seenQuestionIds.includes(questionId) : assessment.seenAssistedIds.includes(eventId) || assessment.seenExposureIds.includes(eventId)) {
    return { profile, support: { independent: false, source: 'duplicate', provided: [] }, retest: status, duplicate: true };
  }
  const rawSupport = evidenceCondition({ type, hintUsed, revealed: outcome === 'revealed', hadFeedback: observation.hadGrammarFeedback ?? false, step });
  const support = rawSupport.independent && status && !status.eligible
    ? evidenceCondition({ rehearsal: true }) : rawSupport;
  if (observation.lexicalRetry) support.provided = [...new Set([...support.provided, 'lexical-retry'])];
  const correct = outcome === 'correct';
  const scored = scoreLearningEvidence({ byKc: profile.byKc, independentByKc: assessment.independentByKc, assistedByKc: assessment.assistedByKc }, {
    kcIds: observation.kcIds ?? step?.kcIds ?? target.kcIds,
    form: step?.form ?? exercise.form, focusId: observation.focusId ?? step?.focusId ?? '', correct,
    failedKcId: outcome === 'revealed' ? null : observation.failedKcId ?? null,
    confirmedKcIds: observation.confirmedKcIds ?? [], hintUsed, revealed: outcome === 'revealed',
    responseMs: observation.responseMs, answerLength: observation.answerLength,
    support, diagnosticOnly: step?.diagnosticOnly ?? false,
  });
  let nextAssessment = { ...assessment, independentByKc: scored.independentByKc, assistedByKc: scored.assistedByKc };
  if (type === 'question') {
    nextAssessment = recordIndependentAttempt(nextAssessment, { exercise, questionId, at, correct,
      independent: rawSupport.independent, reason: rawSupport.independent ? outcome : rawSupport.source,
      failedKcIds: support.independent && observation.failedKcId ? [observation.failedKcId] : [], singleWord });
  } else {
    nextAssessment = recordAssistedAttempt(nextAssessment, { exercise, questionId, eventId, at, correct });
    nextAssessment = recordAssessmentExposure(nextAssessment, { exercise, questionId, eventId, at });
  }
  return { profile: { ...profile, byKc: scored.byKc, assessment: nextAssessment }, support, retest: status, duplicate: false };
}
