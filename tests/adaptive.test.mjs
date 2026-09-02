import assert from "node:assert/strict";
import test from "node:test";
import { allConfident, confidenceOf, courseCountToSkillCount, emptySkillStats, evidenceValue, makeRoundPlan, makeUniqueAssignments, migrateSplitCourseProgress, selectFocus, updateSkillStats } from "../app/lib/adaptive.mjs";

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

test("migrates confidence and unlock position when cross-lesson courses split", () => {
  const stats = { confidence: 0.6 };
  const early = migrateSplitCourseProgress(2, { "pastTe:past:godan": stats });
  const afterPastTe = migrateSplitCourseProgress(3, { "pastTe:past:godan": stats, "pastTe:te:ichidan": stats });
  const afterStemAux = migrateSplitCourseProgress(32, { "stemAux:sugiru:godan": stats, "stemAux:tagaru:ichidan": stats });

  assert.equal(early.introducedCount, 2);
  assert.equal(afterPastTe.introducedCount, 4);
  assert.equal(afterStemAux.introducedCount, 34);
  assert.equal(afterPastTe.bySkill["past:past:godan"], stats);
  assert.equal(afterPastTe.bySkill["te:te:ichidan"], stats);
  assert.equal(afterStemAux.bySkill["sugiru:sugiru:godan"], stats);
  assert.equal(afterStemAux.bySkill["tagaru:tagaru:ichidan"], stats);
});

test("converts legacy course unlocks into rule unlocks", () => {
  const orderedSkills = [
    { courseIndex: 0 }, { courseIndex: 0 },
    { courseIndex: 1 }, { courseIndex: 1 }, { courseIndex: 1 },
    { courseIndex: 2 },
  ];

  assert.equal(courseCountToSkillCount(1, orderedSkills), 2);
  assert.equal(courseCountToSkillCount(2, orderedSkills), 5);
  assert.equal(courseCountToSkillCount(3, orderedSkills), 6);
});

test("unlocks only when all current skills are confident", () => {
  assert.equal(allConfident(skills, { a: { confidence: 1 }, b: { confidence: 1 }, c: { confidence: 1 } }), true);
  assert.equal(allConfident(skills, { a: { confidence: 1 }, b: { confidence: 0.99 }, c: { confidence: 1 } }), false);
});
