import { updateKnowledgeStats } from './adaptive.mjs';

// Source classification is observed directly in classification questions. A
// correct conjugated string does not establish which heuristic was used.
export const isSourceClassification = id => /^(class\.|adj\.class\.|heuristic\.|lexeme\.|facet\.class\.|facet\.adj\.class\.)/.test(id) || id === 'exception.ru-godan';
export const isLocalPracticeRule = id => /^(stem\.|onbin\.|suffix\.|construction\.|contraction\.|adj\.(stem|suffix|exception)\.|compound\.polite-)/.test(id) || id === 'exception.aru-negative';

/** Record the actual assistance condition, including automatic guidance that
 * the old manual hint flag did not capture. */
export function evidenceCondition({ type = 'question', hintUsed = false, revealed = false, hadFeedback = false, rehearsal = false, step = null } = {}) {
  const provided = [];
  if (type === 'step') {
    provided.push('subgoal');
    if (step?.continuation) provided.push('intermediate');
    if (step?.providedClass || ['atomic', 'stem'].includes(step?.kind)) provided.push('word-class');
    if (['atomic', 'stem'].includes(step?.kind)) provided.push('target-rule');
  }
  if (hintUsed) provided.push('hint');
  if (revealed) provided.push('answer');
  const source = revealed ? 'revealed' : type === 'step' ? step?.diagnosticOnly ? 'diagnostic' : 'guided'
    : hintUsed ? 'hinted' : hadFeedback ? 'feedback-retry' : rehearsal ? 'rehearsal' : 'independent';
  return { independent: source === 'independent', source, provided: [...new Set(provided)] };
}

/**
 * byKc retains the historical baseline plus new independent evidence.
 * independentByKc contains only the known independent evidence since migration;
 * assistedByKc is a separate practice record and never drives mastery/coverage.
 * @param {{byKc: any, independentByKc?: any, assistedByKc?: any}} maps
 * @param {{kcIds: string[], form?: string | null, focusId?: string, correct: boolean, failedKcId?: string | null, confirmedKcIds?: string[], support: {independent: boolean, source: string}, hintUsed?: boolean, revealed?: boolean, responseMs?: number, answerLength?: number, diagnosticOnly?: boolean}} result
 */
export function scoreLearningEvidence({ byKc, independentByKc = {}, assistedByKc = {} }, result) {
  const { support, diagnosticOnly = false, form, ...evidence } = result;
  const scope = [...new Set(result.kcIds)];
  if (diagnosticOnly || support.source === 'diagnostic' || result.revealed || support.source === 'revealed') {
    return { byKc, independentByKc, assistedByKc, assessedKcIds: [] };
  }
  const independent = support.independent;
  const positiveScope = independent ? scope.filter(id => form == null || !isSourceClassification(id)) : scope.filter(isLocalPracticeRule);
  const failedKcId = result.failedKcId && scope.includes(result.failedKcId)
    && (independent || isLocalPracticeRule(result.failedKcId)) ? result.failedKcId : null;
  const confirmedKcIds = (result.confirmedKcIds ?? []).filter(id => positiveScope.includes(id) && isLocalPracticeRule(id));
  const assessedKcIds = result.correct ? positiveScope : [...new Set([failedKcId, ...confirmedKcIds].filter(Boolean))];
  const observation = { ...evidence, kcIds: result.correct ? positiveScope : scope,
    focusId: result.focusId ?? '', failedKcId, confirmedKcIds,
    // Timing on assisted or partial activity cannot become independent speed.
    ...(!independent ? { responseMs: undefined } : {}) };
  if (independent) return {
    byKc: updateKnowledgeStats(byKc, observation),
    independentByKc: updateKnowledgeStats(independentByKc, observation),
    assistedByKc, assessedKcIds,
  };
  return { byKc, independentByKc,
    assistedByKc: updateKnowledgeStats(assistedByKc, { ...observation, kcIds: scope.filter(isLocalPracticeRule) }), assessedKcIds };
}
