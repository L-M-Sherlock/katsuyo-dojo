import assert from "node:assert/strict";
import test from "node:test";
import { advanceIntroductions, confidenceOf, emptySkillStats, evidenceValue, findNextIntroducible, makeRoundPlan, makeUniqueAssignments, rankExercisesForFocus, selectFocus, updateKnowledgeStats, updateSkillStats } from "../app/lib/adaptive.mjs";

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

test("builds a 3:1 Japanese-style focus rotation", () => {
  const plan = makeRoundPlan(skills[0], skills, 12, 0);
  assert.equal(plan.filter((skill) => skill.id === "a").length, 9);
  assert.deepEqual(plan.filter((_, index) => (index + 1) % 4 === 0).map((skill) => skill.id), ["b", "c", "b"]);
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
