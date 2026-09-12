import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { assessmentTarget, emptyAssessment, recordIndependentAttempt, retestStatus } from '../app/lib/learning-assessment.mjs';
import { restoreLearningAssessment } from '../app/lib/assessment-transfer.mjs';
import { emptySkillStats, updateSkillStats } from '../app/lib/adaptive.mjs';

const before = JSON.parse(readFileSync(new URL('./fixtures/natural-word-supply-before.json', import.meta.url), 'utf8'));
const frozenRequirements = JSON.parse(readFileSync(new URL('./fixtures/eligibility-baseline.json', import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identity = item => `${item.domain}:${item.surface}`;
const originalIdentities = new Set(before.words.map(identity));
const addedWords = new Map([
  ['誘う', 'さそう'], ['雇う', 'やとう'], ['扱う', 'あつかう'], ['疑う', 'うたがう'],
  ['嫌う', 'きらう'], ['からかう', 'からかう'], ['祝う', 'いわう'], ['追う', 'おう'],
]);
// These pairs are deliberately reviewed additions, not a general relaxation
// of the first usage audit. Every other original decision stays unchanged.
const approvedExistingPairs = {
  temiruDesirePast: ['脱ぐ', '稼ぐ', '注ぐ', '探す', '直す', '出す', '押す'],
  passiveProgressivePast: ['洗う', '払う'],
  passiveDesireNegativePast: ['笑う', '思う', '知る', '読む'],
};
const approvedNewPairs = {
  passiveDesireNegativePast: [...addedWords.keys()],
  passiveProgressivePast: ['扱う', '疑う', '雇う'],
};
const deliberateExpansion = exercise => approvedExistingPairs[exercise.form]?.includes(exercise.item.surface) ?? false;

const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
let model, reviewedWords;
try {
  const [page, lexical] = await Promise.all([
    server.ssrLoadModule('/app/page.tsx'), server.ssrLoadModule('/app/lib/lexical-usage.mjs'),
  ]);
  model = page.KNOWLEDGE;
  reviewedWords = lexical.REVIEWED_LEXICAL_SENSES;
} finally { await server.close(); }
const find = (surface, form) => {
  const exercise = model.exercises.find(candidate => candidate.item.surface === surface && candidate.form === form);
  assert.ok(exercise, `Expected reviewed exercise: ${surface}/${form}`);
  return exercise;
};
const wordsForTarget = exercise => {
  const target = assessmentTarget(exercise);
  return [...new Set(model.exercises.filter(candidate => assessmentTarget(candidate).key === target.key)
    .map(candidate => candidate.item.surface))].sort();
};

test('natural-word expansion adds eight reviewed godan words without changing an original lexical identity', () => {
  const existing = reviewedWords.filter(item => originalIdentities.has(identity(item))).map(({ domain, surface, reading, meaning, class: cls }) => ({ domain, surface, reading, meaning, class: cls }));
  assert.deepEqual(existing, before.words);
  const added = reviewedWords.filter(item => !originalIdentities.has(identity(item)));
  assert.equal(added.length, addedWords.size);
  for (const item of added) {
    assert.equal(item.domain, 'verb');
    assert.equal(item.class, 'godan');
    assert.equal(item.reading, addedWords.get(item.surface));
    assert.ok(item.meaning && item.profile && item.id);
  }
});

test('reviewed supply additions retain every other original teaching decision and context', () => {
  const originalExercises = model.exercises.filter(exercise => originalIdentities.has(identity(exercise.item)) && !deliberateExpansion(exercise));
  assert.equal(originalExercises.length, before.counts.eligibleExercises);
  assert.equal(hash(originalExercises.map(exercise => exercise.id).sort()), before.eligibleExerciseIdsSha256,
    'unrelated old exclusions must not be relaxed and old valid questions must not disappear');
  const contexts = originalExercises.filter(exercise => exercise.context).map(exercise => ({ id: exercise.id, context: exercise.context }))
    .sort((a, b) => a.id.localeCompare(b.id));
  assert.equal(hash(contexts), before.contextsSha256);
  for (const [form, words] of Object.entries(approvedExistingPairs)) for (const word of words) {
    assert.equal(before.chains[form].words.includes(word), false, 'newly approved pair must be visible as a deliberate expansion');
    const exercise = find(word, form);
    assert.ok(exercise.context?.id && exercise.context?.text, `${word}/${form}: an ordinary reviewed setting is required`);
    assert.doesNotMatch(exercise.context.text, /[ぁ-ゖァ-ヺ]/);
  }
  for (const [form, words] of Object.entries(approvedNewPairs)) for (const word of words) {
    const exercise = find(word, form);
    assert.ok(exercise.context?.id && exercise.context?.text, `${word}/${form}`);
  }
});

test('new examples use existing rule signatures and do not add knowledge requirements or reset their ownership', () => {
  const targets = new Map(model.registryExercises.map(exercise => {
    const target = assessmentTarget(exercise);
    return [target.key, hash(target.ruleSignature)];
  }));
  assert.deepEqual([...targets.keys()].sort(), before.targets.map(target => target.key).sort());
  for (const target of before.targets) assert.equal(targets.get(target.key), target.ruleSignatureSha256, target.key);
  const actual = model.components.map(component => ({ id: component.id, gating: component.gating, firstCourseId: component.firstCourseId,
    prerequisites: component.prerequisites, coverageKcIds: component.coverageKcIds }));
  assert.deepEqual(actual, frozenRequirements.components);
  assert.equal(model.components.filter(component => component.gating).length, 119);
  assert.equal(model.components.filter(component => component.id.startsWith('facet.')).length, 89);
});

test('the four deliberately expanded small transfer pools contain the reviewed words on the same actual rule paths', () => {
  const pools = [
    ['使う', 'passiveDesireNegativePast', ['使う', '言う', '手伝う', '笑う', '思う', ...addedWords.keys()]],
    ['泳ぐ', 'temiruDesirePast', ['泳ぐ', '脱ぐ', '稼ぐ', '注ぐ']],
    ['話す', 'temiruDesirePast', ['話す', '貸す', '探す', '直す', '出す', '押す']],
    ['買う', 'passiveProgressivePast', ['買う', '使う', '洗う', '払う', '扱う', '疑う', '雇う']],
  ];
  for (const [surface, form, expected] of pools) assert.deepEqual(wordsForTarget(find(surface, form)), expected.sort(), `${surface}/${form}`);
  for (const [form, original] of Object.entries(before.chains)) {
    const expected = [...original.words, ...approvedExistingPairs[form] ?? [], ...approvedNewPairs[form] ?? []].sort();
    assert.deepEqual(model.exercises.filter(exercise => exercise.courseId === 'multiStepCompound' && exercise.form === form)
      .map(exercise => exercise.item.surface).sort(), expected, `${form}: no unreviewed blanket expansion`);
  }
});

test('adding alternative words preserves prior scores and retest anchors and requires a spaced independent answer', () => {
  const original = find('使う', 'passiveDesireNegativePast'), replacement = find('誘う', 'passiveDesireNegativePast');
  const target = assessmentTarget(original), at = '2026-09-12T00:00:00Z';
  const oldPath = before.smallPaths.find(path => path.key === target.key);
  assert.equal(oldPath.words.length, 3);
  assert.equal(assessmentTarget(replacement).key, oldPath.key);
  assert.notEqual(assessmentTarget(replacement).wordKey, target.wordKey);
  const stats = updateSkillStats(updateSkillStats(emptySkillStats(), { correct: true }), { correct: false });
  const byKc = Object.fromEntries(target.kcIds.map(id => [id, { ...stats }]));
  const assessment = recordIndependentAttempt(emptyAssessment(), { exercise: original, questionId: 'before-expansion-failure', correct: false, at });
  assessment.independentByKc = structuredClone(byKc);
  const stored = { byKc, assessment }, snapshot = structuredClone(stored);
  const restored = restoreLearningAssessment(stored, { components: model.components, exercises: model.exercises, at });
  assert.deepEqual(stored, snapshot);
  assert.deepEqual(restored, stored, 'a larger catalog is not a new assessment and cannot award mastery or clear pending');
  const pending = restored.assessment.pending[target.key];
  assert.equal(retestStatus(pending, replacement, { originalCount: restored.assessment.originalCount }).eligible, false);
  let spaced = restored.assessment;
  for (const [index, exercise] of [find('書く', null), find('食べる', null)].entries()) {
    spaced = recordIndependentAttempt(spaced, { exercise, questionId: `after-expansion-filler-${index}`, correct: true, at });
  }
  assert.equal(retestStatus(spaced.pending[target.key], replacement, { originalCount: spaced.originalCount }).eligible, true);
  const completed = recordIndependentAttempt(spaced, { exercise: replacement, questionId: 'after-expansion-retest', correct: true, at });
  assert.equal(completed.pending[target.key], undefined);
  assert.equal(completed.byTarget[target.key].eligibleRetestCorrect, 1);
});
