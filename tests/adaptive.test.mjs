import assert from "node:assert/strict";
import test from "node:test";
import { advanceIntroductions, balanceComponentsForCourse, componentConfidence, confidenceOf, correctAnswersNeeded, emptySkillStats, evidenceValue, findNextIntroducible, isComponentMastered, makeRoundPlan, makeUniqueAssignments, rankExercisesForFocus, selectFocus, updateKnowledgeStats, updateSkillStats } from "../app/lib/adaptive.mjs";

const skills = [
  { id: "a", order: 0 },
  { id: "b", order: 1 },
  { id: "c", order: 2 },
];

test("scores answers without any calendar or interval input", () => {
  assert.equal(evidenceValue({ correct: true }), 1);
  assert.equal(evidenceValue({ correct: true, hintUsed: true }), 0.7);
  assert.equal(evidenceValue({ correct: false }), 0);
  assert.equal(evidenceValue({ correct: true, revealed: true }), 0);
});

test("requires five strong samples to reach target confidence", () => {
  let stats = emptySkillStats();
  for (let index = 0; index < 4; index += 1) stats = updateSkillStats(stats, { correct: true });
  assert.ok(stats.confidence < 1);
  stats = updateSkillStats(stats, { correct: true });
  assert.equal(stats.confidence, 1);
  assert.equal(confidenceOf(1, 5), 1);
});

test("estimates how many clean answers an atom still needs", () => {
  const regular = { id: "regular", coverageKcIds: [] };
  assert.equal(correctAnswersNeeded(regular, {}), 5);
  let stats = emptySkillStats();
  for (let index = 0; index < 4; index += 1) stats = updateSkillStats(stats, { correct: true });
  assert.equal(correctAnswersNeeded(regular, { regular: stats }), 1);
  const covered = { id: "parent", coverageKcIds: ["one", "two"] };
  assert.equal(correctAnswersNeeded(covered, { parent: { ...stats, confidence: 1 }, one: { correct: 1 } }), 1);
});

test("a regression lowers current confidence but preserves best confidence", () => {
  let stats = emptySkillStats();
  for (let index = 0; index < 5; index += 1) stats = updateSkillStats(stats, { correct: true });
  stats = updateSkillStats(stats, { correct: false });
  assert.ok(stats.confidence < 1);
  assert.equal(stats.bestConfidence, 1);
});

test("focuses the least confident included skill using current confidence", () => {
  const focus = selectFocus(skills, {
    a: { ...emptySkillStats(), confidence: 1, bestConfidence: 1 },
    b: { ...emptySkillStats(), confidence: 0.4, bestConfidence: 1 },
    c: { ...emptySkillStats(), confidence: 0.8, bestConfidence: 0.8 },
  });
  assert.equal(focus.id, "b");
});

test("always ranks an unmastered atom ahead of a mastered atom", () => {
  const components = [
    { id: "suffix.te", order: 0, coverageKcIds: [] },
    { id: "fast-a", order: 1, coverageKcIds: [] },
    { id: "fast-b", order: 2, coverageKcIds: [] },
    { id: "suffix.masu", order: 3, coverageKcIds: ["facet.form.masu.suru"] },
  ];
  const timedStats = (millisecondsPerCharacter) => ({ ...emptySkillStats(), attempts: 7, correct: 7, filteredAccuracy: 1, confidence: 1, bestConfidence: 1, cleanTimeCount: 3, cleanTimeTotal: millisecondsPerCharacter * 3 });
  const focus = selectFocus(components, {
    "suffix.te": timedStats(2000),
    "fast-a": timedStats(100),
    "fast-b": timedStats(100),
    "suffix.masu": { ...emptySkillStats(), attempts: 6, correct: 6, filteredAccuracy: 1, confidence: 1, bestConfidence: 1 },
  });

  assert.equal(componentConfidence(components[0], { "suffix.te": timedStats(2000) }), 1);
  assert.equal(componentConfidence(components[3], { "suffix.masu": { confidence: 1 } }), 0.99);
  assert.equal(focus.id, "suffix.masu");
});

test("does not use answer speed to break equal-confidence ties", () => {
  const components = [
    { id: "fast", order: 0, coverageKcIds: [] },
    { id: "slow", order: 1, coverageKcIds: [] },
    { id: "baseline", order: 2, coverageKcIds: [] },
  ];
  const stats = (millisecondsPerCharacter) => ({ ...emptySkillStats(), attempts: 4, correct: 4, filteredAccuracy: 0.8, confidence: 0.8, cleanTimeCount: 3, cleanTimeTotal: millisecondsPerCharacter * 3 });
  const focus = selectFocus(components, {
    fast: stats(100),
    slow: stats(2000),
    baseline: stats(100),
  });

  assert.equal(focus.id, "fast");
});

test("builds a 3:1 Japanese-style focus rotation", () => {
  const plan = makeRoundPlan(skills[0], skills, 12, 0);
  assert.equal(plan.filter((skill) => skill.id === "a").length, 9);
  assert.deepEqual(plan.filter((_, index) => (index + 1) % 4 === 0).map((skill) => skill.id), ["b", "c", "b"]);
});

test("balances an adaptive round only with atoms used by the focus course", () => {
  const introduced = [
    { id: "class.godan", firstCourseId: "classify" },
    { id: "suffix.negative", firstCourseId: "negative" },
    { id: "onbin.i", firstCourseId: "past" },
    { id: "suffix.past", firstCourseId: "past" },
  ];
  const balanced = balanceComponentsForCourse(introduced[2], introduced, ["class.godan", "onbin.i", "suffix.past"]);
  assert.deepEqual(balanced.map(({ id }) => id), ["onbin.i", "class.godan", "suffix.past"]);
  const plan = makeRoundPlan(introduced[2], balanced, 12, 0);
  assert.equal(plan.some(({ id }) => id === "suffix.negative"), false);
});

test("assigns unique exercises within a round", () => {
  const focus = { id: "focus", order: 0 };
  const balance = { id: "balance", order: 1 };
  const assignments = makeUniqueAssignments([focus, focus, focus, focus], {
    alternativesFor: () => [balance],
    candidatesFor: (item) => item === focus ? ["a", "b"] : ["c", "d"],
    keyOf: (_item, candidate) => candidate,
  });

  assert.deepEqual(assignments.map(({ candidate }) => candidate).sort(), ["a", "b", "c", "d"]);
  assert.equal(new Set(assignments.map(({ candidate }) => candidate)).size, 4);
});

test("keeps replanned segments unique against earlier questions", () => {
  const focus = { id: "focus", order: 0 };
  const assignments = makeUniqueAssignments([focus, focus], {
    alternativesFor: () => [],
    candidatesFor: () => ["used", "fresh-1", "fresh-2"],
    keyOf: (_item, candidate) => candidate,
    orderedCandidates: true,
    usedKeys: ["used"],
  });
  assert.deepEqual(assignments.map(({ candidate }) => candidate), ["fresh-1", "fresh-2"]);
});

test("keeps the preferred skill until its unique exercises are exhausted", () => {
  const focus = { id: "focus", order: 0 };
  const balance = { id: "balance", order: 1 };
  const assignments = makeUniqueAssignments([focus, focus, focus], {
    alternativesFor: () => [balance],
    candidatesFor: (item) => item === focus ? ["a", "b"] : ["c"],
    keyOf: (_item, candidate) => candidate,
  });

  assert.deepEqual(assignments.map(({ item }) => item.id), ["focus", "focus", "balance"]);
});

test("a correct answer updates every required KC but records time only for the focus", () => {
  const byKc = updateKnowledgeStats({}, {
    kcIds: ["class.godan", "onbin.hatsuon", "suffix.past"],
    focusId: "onbin.hatsuon",
    correct: true,
    responseMs: 1200,
    answerLength: 4,
  });
  assert.deepEqual(Object.keys(byKc), ["class.godan", "onbin.hatsuon", "suffix.past"]);
  assert.equal(byKc["class.godan"].confidence, byKc["suffix.past"].confidence);
  assert.equal(byKc["class.godan"].cleanTimeCount, 0);
  assert.equal(byKc["onbin.hatsuon"].cleanTimeCount, 1);
});

test("an incorrect answer changes only the uniquely diagnosed KC", () => {
  const byKc = updateKnowledgeStats({}, {
    kcIds: ["class.godan", "onbin.hatsuon", "suffix.past"],
    focusId: "suffix.past",
    failedKcId: "onbin.hatsuon",
    correct: false,
  });
  assert.deepEqual(Object.keys(byKc), ["onbin.hatsuon"]);
});

test("an ambiguous error falls back to the focused KC", () => {
  const byKc = updateKnowledgeStats({}, {
    kcIds: ["class.godan", "onbin.hatsuon", "suffix.past"],
    focusId: "suffix.past",
    correct: false,
  });
  assert.deepEqual(Object.keys(byKc), ["suffix.past"]);
});

test("introduces one prerequisite-ready gating KC at a time", () => {
  const components = [
    { id: "a", gating: true, firstCourseIndex: 0, prerequisites: [] },
    { id: "lexeme", gating: false, firstCourseIndex: 0, prerequisites: ["a"] },
    { id: "b", gating: true, firstCourseIndex: 0, prerequisites: ["a"] },
    { id: "c", gating: true, firstCourseIndex: 1, prerequisites: ["b"] },
  ];
  const mastered = { a: { confidence: 1 }, b: { confidence: 1 } };
  assert.equal(findNextIntroducible(components, ["a"], mastered).id, "b");
  assert.equal(findNextIntroducible(components, ["a", "b"], mastered).id, "c");
  assert.equal(findNextIntroducible(components, ["a", "b", "c"], { ...mastered, c: { confidence: 0.8 } }), null);
});

test("skips pre-mastered atoms when advancing to the next weak atom", () => {
  const components = [
    { id: "a", gating: true, firstCourseIndex: 0, prerequisites: [] },
    { id: "b", gating: true, firstCourseIndex: 0, prerequisites: [] },
    { id: "c", gating: true, firstCourseIndex: 0, prerequisites: [] },
  ];
  const advanced = advanceIntroductions(components, ["a"], { a: { confidence: 1 }, b: { confidence: 1 } });
  assert.deepEqual(advanced.introducedKcIds, ["a", "b", "c"]);
  assert.deepEqual(advanced.added.map(({ id }) => id), ["b", "c"]);
});

test("does not skip a high-confidence parent with missing coverage", () => {
  const components = [
    { id: "a", gating: true, firstCourseIndex: 0, prerequisites: [], coverageKcIds: [] },
    { id: "b", gating: true, firstCourseIndex: 0, prerequisites: [], coverageKcIds: ["facet.b"] },
    { id: "facet.b", gating: false, firstCourseIndex: 0, prerequisites: ["b"], coverageKcIds: [] },
    { id: "c", gating: true, firstCourseIndex: 0, prerequisites: [], coverageKcIds: [] },
  ];
  const advanced = advanceIntroductions(components, ["a"], { a: { confidence: 1 }, b: { confidence: 1 } });
  assert.deepEqual(advanced.introducedKcIds, ["a", "b"]);
});

test("a shared exception focus prioritizes the weakest individual exception word", () => {
  const exercises = [
    { id: "known", kcIds: ["exception.ru-godan", "lexeme.ru-godan.切る"] },
    { id: "weak", kcIds: ["exception.ru-godan", "lexeme.ru-godan.喋る"] },
  ];
  const ranked = rankExercisesForFocus(exercises, "exception.ru-godan", {
    "lexeme.ru-godan.切る": { confidence: 1 },
    "lexeme.ru-godan.喋る": { confidence: 0.2 },
  });
  assert.equal(ranked[0].id, "weak");
});

test("an irregular-class parent requires both coverage facets", () => {
  const component = { id: "class.irregular", coverageKcIds: ["facet.class.irregular.suru", "facet.class.irregular.kuru"] };
  const partial = {
    "class.irregular": { confidence: 1 },
    "facet.class.irregular.suru": { correct: 5 },
  };
  assert.equal(componentConfidence(component, partial), 0.99);
  assert.equal(isComponentMastered(component, partial), false);
  const complete = { ...partial, "facet.class.irregular.kuru": { correct: 1 } };
  assert.equal(componentConfidence(component, complete), 1);
  assert.equal(isComponentMastered(component, complete), true);
});

test("an irregular-class focus prioritizes its missing coverage facet", () => {
  const exercises = [
    { id: "suru-1", kcIds: ["class.irregular", "facet.class.irregular.suru"] },
    { id: "suru-2", kcIds: ["class.irregular", "facet.class.irregular.suru"] },
    { id: "kuru", kcIds: ["class.irregular", "facet.class.irregular.kuru"] },
  ];
  const ranked = rankExercisesForFocus(exercises, "class.irregular", {
    "facet.class.irregular.suru": { correct: 4, confidence: 1 },
  });
  assert.equal(ranked[0].id, "kuru");
  const assigned = makeUniqueAssignments([{ id: "class.irregular", order: 0 }], {
    alternativesFor: () => [],
    candidatesFor: () => ranked,
    keyOf: (_item, candidate) => candidate.id,
    orderedCandidates: true,
    seed: 99,
  });
  assert.equal(assigned[0].candidate.id, "kuru");
  const initiallyBalanced = rankExercisesForFocus(exercises, "class.irregular", {});
  assert.equal(new Set(initiallyBalanced.slice(0, 2).flatMap(({ kcIds }) => kcIds.filter((id) => id.startsWith("facet.")))).size, 2);
});

test("a form parent with missing coverage consumes ordered facet candidates first", () => {
  const focus = { id: "suffix.past", order: 0, coverageKcIds: ["facet.form.past.suru", "facet.form.past.kuru"] };
  const exercises = [
    { id: "regular", kcIds: ["suffix.past", "class.godan"] },
    { id: "suru", kcIds: ["suffix.past", "facet.form.past.suru"] },
    { id: "kuru", kcIds: ["suffix.past", "facet.form.past.kuru"] },
  ];
  const ranked = rankExercisesForFocus(exercises, focus.id, {}, focus.coverageKcIds);
  const assignments = makeUniqueAssignments([focus, focus, focus], {
    alternativesFor: () => [],
    candidatesFor: () => ranked,
    keyOf: (_item, candidate) => candidate.id,
    orderedCandidates: (item) => item.coverageKcIds.length > 0,
    seed: 17,
  });
  assert.deepEqual(new Set(assignments.slice(0, 2).map(({ candidate }) => candidate.id)), new Set(["suru", "kuru"]));
});
