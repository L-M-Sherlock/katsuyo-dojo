import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

// Exercise the actual page controller in isolated storage. The synthetic
// learner supplies an exactly attributed error for each focus's first attempt;
// subsequent answers are correct, with no hints or diagnostic practice.
// This measures scheduling/assessment, not the natural-language analyzer.
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--output')) {
  throw new Error('Usage: npm run simulate:first-error -- [--output report.json]');
}
const root = fileURLToPath(new URL('..', import.meta.url));
const pageUrl = new URL('../app/page.tsx', import.meta.url);
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/katsuyo-dojo/', pretendToBeVisual: true,
});
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'StorageEvent']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
for (const key of ['requestAnimationFrame', 'cancelAnimationFrame', 'addEventListener', 'removeEventListener']) {
  globalThis[key] = dom.window[key].bind(dom.window);
}
Object.defineProperty(globalThis.navigator, 'locks', { configurable: true, value: { request: async (_key, callback) => callback() } });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement } = await import('react');
const { render, act, waitFor, cleanup } = await import('@testing-library/react');
const { UNIFIED_COURSES } = await import('../app/lib/unified-curriculum.mjs');
const { summarizeUnifiedCourse } = await import('../app/lib/unified-progress.mjs');
const { isComponentMastered } = await import('../app/lib/adaptive.mjs');
const { assessmentTarget } = await import('../app/lib/learning-assessment.mjs');
const originalSource = readFileSync(pageUrl, 'utf8');
const anchor = '  return <main className="site-shell">';
assert.equal(originalSource.split(anchor).length, 2, 'the page replay seam must be unique');
const source = originalSource.replace(anchor, `  globalThis.__katsuyoReplay = {
    grade, nextQuestion, start, targetKc, exercise, profile, loading, finished,
    activeVerification, planningProfile, roundState, questionIndex, PRACTICE_PLANNER
  };\n${anchor}`);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replace(/from ["']([^"']+)["']/g, (_match, specifier) =>
  `from ${JSON.stringify(specifier.startsWith('.') ? new URL(specifier, pageUrl).href : import.meta.resolve(specifier))}`);
const { default: Page, KNOWLEDGE } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const byId = new Map(KNOWLEDGE.components.map(kc => [kc.id, kc]));
const gating = KNOWLEDGE.components.filter(kc => kc.gating);
const required = course => (KNOWLEDGE.courseKcIds[course.id] ?? []).map(id => byId.get(id));
const completedCourses = profile => UNIFIED_COURSES.filter(course =>
  summarizeUnifiedCourse(course, required(course), profile.introducedKcIds, profile).complete).length;
const state = () => globalThis.__katsuyoReplay;
const seen = new Set(), sequence = [];
let rounds = 1, completed = false;
try {
  render(createElement(Page));
  await waitFor(() => assert.equal(state()?.loading, false));
  for (let index = 0; index < 3000; index++) {
    const current = state();
    const wrong = !seen.has(current.targetKc.id);
    seen.add(current.targetKc.id);
    const targetKey = assessmentTarget(current.exercise).key;
    const pendingBefore = Object.keys(current.profile.assessment.pending);
    const row = {
      number: index + 1, round: rounds, focus: current.targetKc.id,
      course: current.exercise.courseId, form: current.exercise.form, word: current.exercise.item.surface,
      correct: !wrong, verification: current.activeVerification?.kind ?? null,
      spacingPurpose: current.activeVerification?.spacingPurpose ?? null,
      focusAlreadyMastered: isComponentMastered(current.targetKc, current.profile.byKc),
      roundFocus: current.roundState.focus?.id,
      preferred: current.roundState.plan[current.questionIndex]?.id,
      usefulAtPlanning: current.PRACTICE_PLANNER.hasLearningOpportunity(current.exercise, current.planningProfile),
      usefulAtAnswer: current.PRACTICE_PLANNER.hasLearningOpportunity(current.exercise, current.profile),
      pendingTargetCollision: current.activeVerification?.kind === 'spacing' && pendingBefore.includes(targetKey),
    };
    await act(async () => { await current.grade(!wrong, false, wrong ? current.targetKc.id : null); });
    const profile = state().profile;
    assert.equal(profile.assessment.originalCount, index + 1, 'each synthetic submission must be recorded exactly once');
    row.independent = profile.practiceLog.events.at(-1).support.independent;
    row.clearedPending = pendingBefore.filter(key => !profile.assessment.pending[key]);
    sequence.push(row);
    if (completedCourses(profile) === UNIFIED_COURSES.length) { completed = true; break; }
    await act(async () => { await state().nextQuestion(); });
    if (state().finished) {
      rounds++;
      await act(async () => { await state().start('adaptive'); });
    }
  }
  const profile = state().profile;
  const staleFallbacks = sequence.filter(row => !row.verification && row.usefulAtPlanning && !row.usefulAtAnswer
    && row.preferred === row.roundFocus && row.focus !== row.preferred);
  const count = predicate => sequence.filter(predicate).length;
  const summary = {
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    workingTreeDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
    policy: 'Each displayed focus fails first; all later answers are correct, without hints; errors are uniquely attributed.',
    method: 'Actual React page grade/next/start handlers in isolated JSDOM. No real browser progress is accessed.',
    completed, questions: sequence.length, incorrect: count(row => !row.correct), correct: count(row => row.correct), rounds,
    mastered: gating.filter(kc => isComponentMastered(kc, profile.byKc)).length,
    coverage: KNOWLEDGE.components.filter(kc => kc.id.startsWith('facet.') && profile.byKc[kc.id]?.correct >= 1).length,
    completedCourses: completedCourses(profile), pending: Object.keys(profile.assessment.pending).length,
    verification: Object.fromEntries(Object.entries(Object.groupBy(sequence, row => row.verification ?? 'ordinary')).map(([key, rows]) => [key, rows.length])),
    spacingWithoutLearning: count(row => row.verification === 'spacing' && !row.usefulAtAnswer),
    pendingSpacingCollisions: count(row => row.pendingTargetCollision),
    avoidablePendingCollisions: count(row => row.pendingTargetCollision && row.spacingPurpose !== 'pending-fallback'),
    staleFallbackQuestions: staleFallbacks.map(row => row.number),
    ordinaryWithoutLearning: count(row => !row.verification && !row.usefulAtAnswer),
    firstErrorsAfterMastery: count(row => !row.correct && row.focusAlreadyMastered),
    clearedPending: sequence.reduce((sum, row) => sum + row.clearedPending.length, 0),
  };
  if (args.length) writeFileSync(args[1], `${JSON.stringify({ ...summary, sequence }, null, 2)}\n`);
  console.log(JSON.stringify(summary));
  assert.equal(completed, true, 'the actual page must finish all courses within the bounded replay');
  assert.equal(summary.pending, 0);
  assert.equal(staleFallbacks.length, 0, 'unseen learning substitutes must not survive after their rules recover');
  assert.equal(summary.avoidablePendingCollisions, 0);
} finally {
  cleanup();
  dom.window.close();
  delete globalThis.__katsuyoReplay;
}
