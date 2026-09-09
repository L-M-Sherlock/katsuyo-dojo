import { assessmentTarget, selectRetest, retestStatus } from './learning-assessment.mjs';
import { isComponentMastered } from './adaptive.mjs';
import { assignPracticeExercises, wordKey } from './exercise-selection.mjs';
import { summarizeUnifiedCourse } from './unified-progress.mjs';

/** exercises must be the complete current catalog; mode/readiness filters are
 * applied here and may not be used to infer a limited vocabulary policy.
 * Choose a real original question without mutating assessment. The selection
 * is frozen until that question is finished; score changes must not replace it
 * while its feedback or diagnostic steps are on screen. */
export function planRetestQuestion(profile, mode, { exercises, components, courses, courseKcIds, seed = 0, at = new Date().toISOString() }) {
  const assessment = profile.assessment;
  if (!assessment || !Object.keys(assessment.pending).length) return null;
  const byId = new Map(components.map(kc => [kc.id, kc]));
  const open = new Set(courses.filter(course => summarizeUnifiedCourse(course,
    (courseKcIds[course.id] ?? []).map(id => byId.get(id)).filter(Boolean), profile.introducedKcIds, profile).unlocked).map(course => course.id));
  const entries = Object.values(assessment.pending).filter(p => mode === 'adaptive' || p.courseId === mode);
  if (!entries.length) return null;
  const active = { ...assessment, pending: Object.fromEntries(entries.map(p => [p.key, p])) };
  const eligiblePool = exercises.filter(e => open.has(e.courseId) && (mode === 'adaptive' || e.courseId === mode));
  const recent = new Set(profile.recentWordKeys ?? []);
  const excluded = [...new Set(eligiblePool.filter(e => recent.has(wordKey(e))).map(e => assessmentTarget(e).wordKey))];
  const retest = selectRetest(active, eligiblePool, { at, catalogExercises: exercises, excludeWordKeys: excluded })
    ?? selectRetest(active, eligiblePool, { at, catalogExercises: exercises });
  if (retest) return { kind: 'retest', ...retest };

  const waitingEntries = [...entries].sort((a, b) => a.lastPresentedOrdinal - b.lastPresentedOrdinal || a.createdOrdinal - b.createdOrdinal || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  // With exactly two catalog words, a failure on A and assistance on B can
  // exclude both. An explicitly unqualified rehearsal of A makes A the most
  // recent practice again; only after two OTHER original questions may B be
  // a transfer check. This never calls a multiword target a singleton or
  // changes its scoring/clearing rules. Singletons also use question-count spacing, never elapsed time.
  const catalogWords = new Map();
  for (const exercise of exercises) {
    const target = assessmentTarget(exercise);
    if (!active.pending[target.key]) continue;
    if (!catalogWords.has(target.key)) catalogWords.set(target.key, new Set());
    catalogWords.get(target.key).add(target.wordKey);
  }
  for (const entry of waitingEntries) {
    const words = catalogWords.get(entry.key), blocked = new Set([entry.lastWordKey, entry.lastPresentedWordKey ?? entry.lastWordKey]);
    if (!words || words.size < 2 || [...words].some(word => !blocked.has(word))) continue;
    const exercise = eligiblePool.find(candidate => assessmentTarget(candidate).key === entry.key && assessmentTarget(candidate).wordKey === entry.lastWordKey);
    if (!exercise) continue;
    const status = retestStatus(entry, exercise, { originalCount: assessment.originalCount, at });
    if (!status.remainingQuestions) return { kind: 'rehearsal', pending: entry, exercise, status };
  }

  // Protect the oldest waiting target's gap. Excluding *all* pending targets
  // would deadlock a small course when every available target needs a retest.
  const waiting = waitingEntries[0];
  const ready = e => (e.prerequisites ?? []).every(id => byId.has(id) && isComponentMastered(byId.get(id), profile.byKc));
  let fillers = eligiblePool.filter(e => assessmentTarget(e).key !== waiting.key && ready(e));
  if (!fillers.length && mode !== 'adaptive') fillers = exercises.filter(e => open.has(e.courseId) && e.form === null && assessmentTarget(e).key !== waiting.key && ready(e));
  if (!fillers.length) return { kind: 'waiting', pending: waiting, exercise: null, status: null };
  const marker = { id: 'retest-spacing' };
  const selected = assignPracticeExercises([marker], { candidatesFor: () => fillers, alternativesFor: () => [],
    byKc: profile.byKc, seed: seed + assessment.originalCount + (profile.rotation ?? 0), recentWordKeys: profile.recentWordKeys ?? [] })[0];
  return { kind: 'spacing', pending: waiting, exercise: selected.candidate, status: null };
}
