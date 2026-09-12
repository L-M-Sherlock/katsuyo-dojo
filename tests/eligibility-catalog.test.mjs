import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { buildEligibilityReport } from '../scripts/lib/eligibility-audit.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';

const allowed = () => ({ status: 'allowed', category: 'semantic', reason: '已审核' });
const sample = (surface, reading, cls = 'godan') => {
  const item = { domain: 'verb', surface, reading, class: cls }, form = 'past';
  return { id: `past:${surface}`, item, form, courseId: 'past', courseIndex: 0,
    kcIds: deriveUnified(item, form).requiredKcIds, prerequisites: [] };
};
const words = [
  ['書く', 'かく'], ['聞く', 'きく'], ['働く', 'はたらく'], ['歩く', 'あるく'],
  ['読む', 'よむ'], ['飲む', 'のむ'], ['休む', 'やすむ'], ['呼ぶ', 'よぶ'],
  ['待つ', 'まつ'], ['買う', 'かう'], ['帰る', 'かえる'], ['使う', 'つかう'],
];
function fixture() {
  const exercises = words.map(([surface, reading]) => sample(surface, reading));
  const components = [...new Set(exercises.flatMap(exercise => exercise.kcIds))].map(id => ({
    id, gating: id === 'suffix.past', firstCourseId: 'past', firstCourseIndex: 0,
    prerequisites: [], coverageKcIds: [], unlockByPrerequisites: true,
  }));
  return { components, exercises, registryExercises: [...exercises] };
}
const reportFor = (model, options = {}) => buildEligibilityReport(model, {
  courses: [{ id: 'past' }], assessFormUsage: allowed, reviewVersion: 1, ...options,
});

test('catalog audit refuses to infer requirements from the already filtered exercises', () => {
  const model = fixture();
  delete model.registryExercises;
  assert.throws(() => reportFor(model), /pre-filter registryExercises/);
});

test('catalog audit detects lost course forms and facets even when the current catalog hides them', () => {
  const model = fixture();
  model.components.find(component => component.id === 'suffix.past').coverageKcIds = ['facet.required'];
  model.components.push({ id: 'facet.required', gating: false, firstCourseId: 'past', prerequisites: [], coverageKcIds: [] });
  model.exercises = [];
  const report = reportFor(model);
  assert.ok(report.issues.some(issue => issue.code === 'empty-course-form'));
  assert.ok(report.issues.some(issue => issue.code === 'undersupplied-gating-requirement'));
  assert.ok(report.issues.some(issue => issue.code === 'unreachable-declared-facet' && issue.id === 'facet.required'));
  assert.equal(report.courseForms[0].before.exercises, 12);
  assert.equal(report.courseForms[0].after.exercises, 0);
});

test('context-required exercises need the exact reviewed context and cannot leak a Japanese answer', () => {
  const model = fixture(), usage = { status: 'context-required', category: 'context', reason: '参与者需要明确', context: { id: 'reviewed', text: '谈论日常工作。' } };
  let report = reportFor(model, { assessFormUsage: () => usage });
  assert.equal(report.issues.filter(issue => issue.code === 'missing-reviewed-context').length, 12);
  model.exercises = model.exercises.map(exercise => ({ ...exercise, context: usage.context }));
  report = reportFor(model, { assessFormUsage: () => usage });
  assert.deepEqual(report.issues, []);
  model.exercises[0] = { ...model.exercises[0], context: { id: 'reviewed', text: '这里使用書いた。' } };
  report = reportFor(model, { assessFormUsage: () => usage });
  assert.ok(report.issues.some(issue => issue.code === 'missing-reviewed-context'));
  assert.ok(report.issues.some(issue => issue.code === 'japanese-answer-leak-in-context'));
});

test('unknown lexical senses and forbidden exercises cannot slip into the active catalog', () => {
  const model = fixture();
  const report = reportFor(model, { reviewedLexicalSense: () => null, assessFormUsage: () => ({ status: 'blocked', category: 'semantic', reason: '未审核' }) });
  assert.equal(report.issues.filter(issue => issue.code === 'unreviewed-lexical-sense').length, 12);
  assert.equal(report.issues.filter(issue => issue.code === 'blocked-exercise-in-practice').length, 12);
});

test('old rule paths with no usable words remain visible as suspended obligations in the diff', () => {
  const model = fixture(), removed = sample('する', 'する', 'irregular');
  model.registryExercises.push(removed);
  const report = reportFor(model, { assessFormUsage: item => item.surface === 'する' ? { status: 'blocked', category: 'semantic', reason: '测试词义限制' } : allowed() });
  assert.equal(report.summary.retestPaths.afterWordBuckets['0'], 1);
  assert.ok(report.retestPaths.some(path => path.before.distinctWords === 1 && path.after.distinctWords === 0));
  assert.equal(report.removed[0].reason, '测试词义限制');
  assert.equal(report.removedReasons[0].exercises, 1);
  assert.deepEqual(report.issues, []);
});

test('eligibility cannot weaken a frozen knowledge requirement to hide a catalog gap', () => {
  const model = fixture();
  const original = structuredClone(model.components.find(component => component.id === 'suffix.past'));
  delete original.firstCourseIndex;
  delete original.unlockByPrerequisites;
  original.coverageKcIds = ['facet.old'];
  const report = reportFor(model, { baseline: { sourceCommit: 'old', components: [original], courseForms: {} } });
  assert.ok(report.issues.some(issue => issue.code === 'changed-original-requirements' && issue.id === 'suffix.past'));
});

test('all declared courses, forms, gating knowledge and coverage remain trainable after usage filtering', async () => {
  const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  try {
    const [{ KNOWLEDGE }, { UNIFIED_COURSES }, usage, { reviewedLexicalSense }] = await Promise.all([
      server.ssrLoadModule('/app/page.tsx'), server.ssrLoadModule('/app/lib/unified-curriculum.mjs'),
      server.ssrLoadModule('/app/lib/form-eligibility.mjs'), server.ssrLoadModule('/app/lib/lexical-usage.mjs'),
    ]);
    const baseline = JSON.parse(readFileSync(new URL('./fixtures/eligibility-baseline.json', import.meta.url), 'utf8'));
    const report = buildEligibilityReport(KNOWLEDGE, { courses: UNIFIED_COURSES, assessFormUsage: usage.assessFormUsage,
      reviewVersion: usage.USAGE_REVIEW_VERSION, reviewedLexicalSense, baseline });
    assert.deepEqual(report.issues, []);
    for (const field of ['courses', 'forms', 'components', 'gating', 'facets']) assert.equal(report.summary[field], baseline.summary[field], field);
    assert.ok(report.summary.before.exercises >= baseline.summary.exercises, "new words may grow the fixed registry, never shrink it");
    assert.equal(report.summary.retestPaths.before, 845);
    assert.ok(report.summary.removed > 0);
    assert.ok(report.summary.after.contexts > 0);
  } finally { await server.close(); }
});
