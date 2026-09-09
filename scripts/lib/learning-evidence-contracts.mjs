import { applyLearningObservation } from '../../app/lib/learning-profile.mjs';
import { assessmentTarget, emptyAssessment, recordIndependentAttempt } from '../../app/lib/learning-assessment.mjs';

// An independently declared write policy. Do not import the production
// positive-scope/local-scope predicates to decide what the audit expects.
const sourceClass = id => /^(class\.|adj\.class\.|heuristic\.|lexeme\.|facet\.class\.|facet\.adj\.class\.)/.test(id) || id === 'exception.ru-godan';
const local = id => /^(stem\.|onbin\.|suffix\.|construction\.|contraction\.|adj\.(stem|suffix|exception)\.|compound\.polite-)/.test(id) || id === 'exception.aru-negative';
const statKeys = ['attempts', 'correct', 'filteredAccuracy', 'confidence', 'bestConfidence', 'cleanTimeTotal', 'cleanTimeCount'];
const unrelated = 'suffix.__independent_audit_unrelated';
const at = '2026-09-09T12:00:00.000Z';
const seedStats = Object.freeze({ attempts: 5, correct: 3, filteredAccuracy: .6, confidence: .6 / .85,
  bestConfidence: 1, cleanTimeTotal: 900, cleanTimeCount: 3 });
const itemContexts = new WeakMap();
export const LEARNING_AUDIT_VERSION = 1;

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
const sameStats = (left, right) => left === right || Boolean(left && right && statKeys.every(key => left[key] === right[key]));

function contextFor(c) {
  if (!c.item || !Array.isArray(c.kcIds)) throw new Error('Generated scoring case needs its item and KC scope');
  let forms = itemContexts.get(c.item);
  if (!forms) { forms = new Map(); itemContexts.set(c.item, forms); }
  const formKey = c.form ?? 'classify';
  let context = forms.get(formKey);
  if (!context) {
    // Reuse the same original exercise object so the production target cache
    // sees the actual complete question, never the narrowed supplied KC scope.
    const exercise = { item: c.item, form: c.form ?? null, courseId: c.courseId ?? '' }, target = assessmentTarget(exercise);
    const failure = recordIndependentAttempt(emptyAssessment(), { exercise, questionId: 'audit-seed-failure', correct: false, at });
    if (!failure.pending[target.key]) throw new Error('The audit seed failed to create a pending original failure');
    context = { exercise, target, failure, scopes: new Map() }; forms.set(formKey, context);
  }
  const scopeKey = c.kcIds.join('\0');
  let scope = context.scopes.get(scopeKey);
  if (!scope) {
    const kcIds = [...new Set(c.kcIds)], byKc = freeze(Object.fromEntries([...kcIds, unrelated].map(id => [id, seedStats])));
    const maps = { independentByKc: freeze({ [unrelated]: seedStats }), assistedByKc: freeze({ [unrelated]: seedStats }) };
    const blank = freeze({ byKc, assessment: { ...emptyAssessment(), ...maps } });
    const pending = freeze({ byKc, assessment: { ...context.failure, ...maps } });
    scope = { kcIds, blank, pending }; context.scopes.set(scopeKey, scope);
  }
  return { ...context, ...scope };
}

function checkMap(before, after, expected, positive, hintUsed, allowSpeed, focusId, problem, label) {
  if (!after || typeof after !== 'object' || Array.isArray(after)) { problem('learning-invalid-map', label); return; }
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const old = before[id], next = after[id];
    if (!expected.has(id)) {
      if (!sameStats(old, next)) problem('learning-forbidden-write', `${label}: ${id}`);
      continue;
    }
    if (!next || next.attempts !== (old?.attempts ?? 0) + 1 || next.correct !== (old?.correct ?? 0) + Number(positive.has(id))) {
      problem('learning-wrong-count', `${label}: ${id}`); continue;
    }
    const value = positive.has(id) ? hintUsed ? .7 : 1 : 0;
    const accuracy = old?.filteredAccuracy == null ? value : old.filteredAccuracy + .2 * (value - old.filteredAccuracy);
    if (Math.abs(next.filteredAccuracy - accuracy) > 1e-9) problem('learning-wrong-local-weight', `${label}: ${id}`);
    const speed = allowSpeed && positive.has(id) && id === focusId;
    if (next.cleanTimeCount !== (old?.cleanTimeCount ?? 0) + Number(speed)
      || Math.abs(next.cleanTimeTotal - (old?.cleanTimeTotal ?? 0) - (speed ? 300 : 0)) > 1e-7) problem('learning-assisted-or-partial-speed', `${label}: ${id}`);
  }
  for (const id of expected) if (!(id in after)) problem('learning-missing-observation', `${label}: ${id}`);
}

/** Every generated input is scored under its actual UI context plus explicit
 * supplied, hinted, feedback, reveal, and too-early same-word controls. The
 * optional observer exists solely to prove these contracts reject regressions.
 * No condition is skipped merely because the analyzer returned no diagnosis.
 */
export function auditLearningCase(c, analysis, { observe = applyLearningObservation } = {}) {
  const problems = [], problem = (code, detail) => problems.push({ code, detail });
  let checks = 0;
  try {
    const context = contextFor(c), { exercise, target, kcIds } = context;
    const retryable = ['typo', 'invalid'].includes(analysis.kind), correct = analysis.kind === 'correct';
    const failed = analysis.diagnosis?.kcId, confirmed = analysis.diagnosis?.confirmedKcIds ?? [];
    const focusId = kcIds.find(local) ?? kcIds[0] ?? '';
    const suppliedStep = c.step ?? { kind: 'conjugation', continuation: true, form: c.form ?? null, kcIds };
    const conditions = [
      { name: 'actual', type: c.step ? 'step' : 'question', step: c.step ?? null, independent: !c.step, outcome: analysis.kind },
      { name: 'supplied', type: 'step', step: suppliedStep, independent: false, outcome: analysis.kind },
      { name: 'hinted', type: 'question', independent: false, hintUsed: true, outcome: analysis.kind },
      { name: 'feedback-retry', type: 'question', independent: false, hadGrammarFeedback: true, outcome: analysis.kind },
      { name: 'revealed', type: 'question', independent: false, outcome: 'revealed' },
      { name: 'rehearsal', type: 'question', independent: false, pending: true, outcome: analysis.kind },
    ];
    for (const condition of conditions) {
      const before = condition.pending || condition.type === 'step' ? context.pending : context.blank;
      const diagnosticOnly = Boolean(condition.step?.diagnosticOnly), revealed = condition.outcome === 'revealed';
      const ignored = !revealed && retryable;
      const evidenceAllowed = !ignored && !revealed && !diagnosticOnly;
      const positiveScope = kcIds.filter(id => condition.independent ? (condition.step?.form ?? c.form) == null || !sourceClass(id) : local(id));
      const bad = evidenceAllowed && failed && kcIds.includes(failed) && (condition.independent || local(failed)) ? failed : null;
      const positive = new Set(evidenceAllowed ? correct ? positiveScope : confirmed.filter(id => id !== bad && positiveScope.includes(id) && local(id)) : []);
      const expected = new Set([...positive, ...(!correct && bad ? [bad] : [])]);
      const observation = { type: condition.type, outcome: condition.outcome, questionId: 'audit-current-question',
        eventId: 'audit-current-event', at, kcIds, focusId, step: condition.step,
        hintUsed: condition.hintUsed ?? false, hadGrammarFeedback: condition.hadGrammarFeedback ?? false,
        failedKcId: failed ?? null, confirmedKcIds: confirmed, responseMs: 1200, answerLength: 4 };
      const result = observe(before, exercise, observation), after = result.profile; checks++;
      if (!after?.assessment) { problem('learning-missing-assessment', condition.name); continue; }
      if (!ignored && result.support?.independent !== condition.independent) problem('learning-wrong-support', condition.name);
      const independentExpected = condition.independent ? expected : new Set(), assistedExpected = condition.independent ? new Set() : expected;
      checkMap(before.byKc, after.byKc, independentExpected, positive, false, condition.independent && correct, focusId, problem, `${condition.name}/byKc`);
      checkMap(before.assessment.independentByKc, after.assessment.independentByKc, independentExpected, positive, false,
        condition.independent && correct, focusId, problem, `${condition.name}/independentByKc`);
      checkMap(before.assessment.assistedByKc, after.assessment.assistedByKc, assistedExpected, positive, observation.hintUsed,
        false, focusId, problem, `${condition.name}/assistedByKc`);
      for (const id of Object.keys(after.assessment.assistedByKc)) if (!local(id) || sourceClass(id) || /^(apply\.|facet\.)/.test(id)) problem('learning-nonlocal-practice', `${condition.name}: ${id}`);
      const expectedOrdinal = before.assessment.originalCount + Number(condition.type === 'question' && !ignored);
      if (after.assessment.originalCount !== expectedOrdinal) problem('learning-wrong-original-count', condition.name);
      const hadPending = Boolean(before.assessment.pending[target.key]);
      if ((hadPending || !ignored && condition.type === 'question' && (!correct || !condition.independent)) && !after.assessment.pending[target.key]) problem('learning-lost-pending', condition.name);
      if (ignored && Boolean(after.assessment.pending[target.key]) !== hadPending) problem('learning-retry-created-pending', condition.name);
      if (condition.type === 'step') {
        const oldTarget = before.assessment.byTarget[target.key], newTarget = after.assessment.byTarget[target.key];
        if (oldTarget.independentAttempts !== newTarget?.independentAttempts || oldTarget.independentCorrect !== newTarget?.independentCorrect
          || oldTarget.eligibleRetestCorrect !== newTarget?.eligibleRetestCorrect) problem('learning-guidance-became-independent', condition.name);
      }
      if (!ignored) {
        const replay = observe(after, exercise, observation); checks++;
        if (!replay.duplicate) problem('learning-unprotected-repeat', condition.name);
        checkMap(after.byKc, replay.profile?.byKc, new Set(), new Set(), false, false, '', problem, `${condition.name}/duplicate/byKc`);
        checkMap(after.assessment.independentByKc, replay.profile?.assessment?.independentByKc, new Set(), new Set(), false, false, '', problem, `${condition.name}/duplicate/independentByKc`);
        checkMap(after.assessment.assistedByKc, replay.profile?.assessment?.assistedByKc, new Set(), new Set(), false, false, '', problem, `${condition.name}/duplicate/assistedByKc`);
        if (replay.profile?.assessment?.originalCount !== after.assessment.originalCount) problem('learning-duplicate-original-count', condition.name);
      }
    }
  } catch (error) { problem('learning-observer-exception', String(error.message ?? error)); }
  return { problems, checks };
}

/** Inspect an actual sequential guided transition in addition to isolated
 * controls. This checks evidence accumulation without coupling the oracle to
 * the legacy queue's broader set of eligible primitive IDs.
 */
export function auditLearningFlowWrite(before, after, step, analysis, problem) {
  checkMap(before.byKc, after.byKc, new Set(), new Set(), false, false, '', problem, 'flow/byKc');
  checkMap(before.assessment.independentByKc, after.assessment.independentByKc, new Set(), new Set(), false, false, '', problem, 'flow/independentByKc');
  const scope = step.kcIds.filter(local), diagnosticOnly = Boolean(step.diagnosticOnly), correct = analysis.kind === 'correct';
  const failed = !diagnosticOnly && scope.includes(analysis.diagnosis?.kcId) ? analysis.diagnosis.kcId : null;
  const positive = new Set(diagnosticOnly ? [] : correct ? scope : (analysis.diagnosis?.confirmedKcIds ?? []).filter(id => scope.includes(id) && id !== failed));
  const expected = new Set([...positive, ...(!correct && failed ? [failed] : [])]);
  checkMap(before.assessment.assistedByKc, after.assessment.assistedByKc, expected, positive, false, false, '', problem, 'flow/assistedByKc');
  if (after.assessment.originalCount !== before.assessment.originalCount) problem('learning-flow-original-count', '辅助流程不增加原题数');
  for (const key of Object.keys(before.assessment.pending)) if (!after.assessment.pending[key]) problem('learning-flow-cleared-pending', key);
}
