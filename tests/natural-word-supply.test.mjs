import { currentEligibilityBaseline } from '../scripts/lib/eligibility-baseline.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { assessmentTarget, emptyAssessment, reconcileAssessmentCatalog, recordIndependentAttempt, retestStatus } from '../app/lib/learning-assessment.mjs';
import { restoreLearningAssessment } from '../app/lib/assessment-transfer.mjs';
import { emptySkillStats, updateSkillStats } from '../app/lib/adaptive.mjs';
import { reviewedLexicalSense } from '../app/lib/lexical-usage.mjs';

const before = JSON.parse(readFileSync(new URL('./fixtures/natural-word-supply-before.json', import.meta.url), 'utf8'));
const voiceReview = JSON.parse(readFileSync(new URL('./fixtures/voice-usage-review-before.json', import.meta.url), 'utf8'));
const linkingReview = JSON.parse(readFileSync(new URL('./fixtures/linking-usage-review-before.json', import.meta.url), 'utf8'));
const intentionReview = JSON.parse(readFileSync(new URL('./fixtures/intentions-usage-review-before.json', import.meta.url), 'utf8'));
const actionReview = JSON.parse(readFileSync(new URL('../docs/usage-card-actions-review.json', import.meta.url), 'utf8'));
const naturalnessReview = JSON.parse(readFileSync(new URL('../docs/usage-card-naturalness-20260923.json', import.meta.url), 'utf8'));
const actionContexts = new Map((actionReview.contextChanges ?? []).map(row => [row.pair, row]));
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
const originalFormIds = new Set(Object.keys(before.chains));
const addedChain = exercise => exercise.kcIds.some(id=>id.startsWith('facet.chain.')) && !originalFormIds.has(exercise.form);
const deliberateExpansion = exercise => addedChain(exercise) || (approvedExistingPairs[exercise.form]?.includes(exercise.item.surface) ?? false);

const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
let model, reviewedWords;
try {
  const [page, lexical] = await Promise.all([
    server.ssrLoadModule('/app/page.tsx'), server.ssrLoadModule('/app/lib/lexical-usage.mjs'),
  ]);
  model = page.KNOWLEDGE;
  reviewedWords = lexical.REVIEWED_LEXICAL_SENSES;
} finally { await server.close(); }
const actionDeferred = [...(actionReview.deferred ?? []), ...naturalnessReview.deferred].map(entry => {
  const exercise = model.registryExercises.find(e => `${reviewedLexicalSense(e.item)?.id}/${e.form}` === entry.pair);
  assert.ok(exercise, entry.pair);
  return {...exercise, context: entry.previousUsage?.context};
});
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

test('reviewed supply changes retain every unrelated original teaching decision and context', () => {
  assert.equal(voiceReview.retired.length, 48);
  assert.equal(linkingReview.retired.length, 16);
  assert.equal(intentionReview.retired.length, 5);
  const retired = [...voiceReview.retired, ...linkingReview.retired, ...intentionReview.retired].map(entry => {
    assert.ok(!model.exercises.some(exercise => exercise.id === entry.id), `${entry.id}: explicitly retired by language review`);
    const exercise = model.registryExercises.find(exercise => exercise.id === entry.id);
    assert.ok(exercise, `${entry.id}: morphology remains in the registry`);
    return { ...exercise, context: entry.context };
  });
  // Reconstruct the old view without replacing or weakening its frozen hashes.
  // The only exceptions are the documented retirement/context delta and the
  // context IDs' review-version suffix; every unrelated text is still hashed.
  const originalExercises = [...model.exercises, ...retired, ...actionDeferred].filter(exercise => originalIdentities.has(identity(exercise.item)) && !deliberateExpansion(exercise));
  assert.equal(originalExercises.length, before.counts.eligibleExercises);
  assert.equal(hash(originalExercises.map(exercise => exercise.id).sort()), before.eligibleExerciseIdsSha256,
    'unrelated old exclusions must not be relaxed and old valid questions must not disappear');
  const priorContexts = new Map([...linkingReview.changedContexts, ...voiceReview.changedContexts].map(entry => [entry.id, entry.context]));
  const beforeRegionalReview = originalExercises.map(exercise => {
    const change = actionContexts.get(`${reviewedLexicalSense(exercise.item)?.id}/${exercise.form}`);
    if (!change) return exercise;
    assert.deepEqual({...exercise.context,id:exercise.context.id.replace(/:v\d+$/,`:v${change.currentUsage.reviewVersion}`)}, change.currentUsage.context);
    return {...exercise, context: change.previousUsage.context};
  });
  const contexts = beforeRegionalReview.map(exercise => ({ ...exercise,
    context: priorContexts.has(exercise.id) ? priorContexts.get(exercise.id) : exercise.context,
  })).filter(exercise => exercise.context).map(exercise => ({ id: exercise.id,
    context: { ...exercise.context, id: exercise.context.id.replace(/:v\d+$/, `:v${before.reviewVersion}`) },
  }))
    // The frozen fixture was sorted in the CI locale. Do not let a Chinese
    // desktop's default collation change the hash of otherwise identical data.
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
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

test('each retired voice question keeps a trainable retest obligation without granting independent success', () => {
  const at = '2026-09-17T00:00:00Z';
  const pathCounts = new Map();
  for (const exercise of model.exercises) {
    const key = assessmentTarget(exercise).key;
    pathCounts.set(key, (pathCounts.get(key) ?? 0) + 1);
  }
  for (const { id } of voiceReview.retired) {
    const exercise = model.registryExercises.find(exercise => exercise.id === id);
    const key = assessmentTarget(exercise).key;
    const failed = recordIndependentAttempt(emptyAssessment(), { exercise, questionId: `retired:${id}`, correct: false, at });
    const restored = reconcileAssessmentCatalog(failed, model.exercises, 2);
    assert.ok(pathCounts.get(key) >= 2, `${id}: enough replacement words to retest`);
    assert.deepEqual(restored.pending[key], failed.pending[key], `${id}: still pending`);
    assert.deepEqual(restored.byTarget[key], failed.byTarget[key], `${id}: no new success`);
    assert.deepEqual(restored.independentByKc, failed.independentByKc);
    assert.deepEqual(restored.suspendedPending, {});
  }
});

test('linking retirement transfers remaining paths and suspends only the two removed kuru paths without awarding mastery', () => {
  const removedPaths = new Set(['concurrent:nagara:来る', 'concurrent:tsutsu:来る']);
  const available = new Map();
  for (const exercise of model.exercises) {
    const key = assessmentTarget(exercise).key;
    available.set(key, (available.get(key) ?? 0) + 1);
  }
  for (const { id } of linkingReview.retired) {
    const exercise = model.registryExercises.find(exercise => exercise.id === id);
    const key = assessmentTarget(exercise).key;
    const failed = recordIndependentAttempt(emptyAssessment(), {
      exercise, questionId: `linking-retired:${id}`, correct: false, at: '2026-09-17T00:00:00Z',
    });
    const snapshot = structuredClone(failed);
    const restored = reconcileAssessmentCatalog(failed, model.exercises, 3);
    assert.deepEqual(failed, snapshot, `${id}: preserve input history`);
    assert.deepEqual(restored.byTarget, failed.byTarget, `${id}: no new independent success`);
    assert.deepEqual(restored.independentByKc, failed.independentByKc);
    assert.equal(restored.originalCount, failed.originalCount);
    if (removedPaths.has(id)) {
      assert.equal(available.get(key) ?? 0, 0, id);
      assert.equal(restored.pending[key], undefined);
      assert.deepEqual(restored.suspendedPending[key], {
        ...failed.pending[key], suspension: { reason: 'no-eligible-exercise', catalogVersion: 3 },
      });
    } else {
      assert.ok(available.get(key) >= 2, `${id}: enough alternatives`);
      assert.deepEqual(restored.pending[key], failed.pending[key]);
      assert.deepEqual(restored.suspendedPending, {});
    }
  }
});

test('the historical word expansion retains all original rule signatures and knowledge owners', () => {
  const targets = new Map(model.registryExercises.map(exercise => {
    const target = assessmentTarget(exercise);
    return [target.key, hash(target.ruleSignature)];
  }));
  assert.ok(before.targets.every(target => targets.has(target.key)));
  for (const target of before.targets) assert.equal(targets.get(target.key), target.ruleSignatureSha256, target.key);
  const actual = model.components.map(component => ({ id: component.id, gating: component.gating, firstCourseId: component.firstCourseId,
    prerequisites: component.prerequisites, coverageKcIds: component.coverageKcIds }));
  assert.deepEqual([...actual].sort((a,b)=>a.id.localeCompare(b.id)), [...currentEligibilityBaseline().components].sort((a,b)=>a.id.localeCompare(b.id)));
  assert.equal(model.components.filter(component => component.gating).length, 132);
  assert.equal(model.components.filter(component => component.id.startsWith('facet.')).length, 130);
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
