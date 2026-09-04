import assert from "node:assert/strict";
import test from "node:test";
import { advanceIntroductions, selectFocus } from "../app/lib/adaptive.mjs";
import { ADJECTIVE_COURSES, CORE_COURSE_COUNT, CORE_COURSE_IDS, COURSES, componentsForScope, coursesForScope, knowledgeModelForScope } from "../app/lib/curriculum.mjs";

const expectedCore = [
  "classify", "negative", "past", "te", "masu", "basicCompound", "imperative",
  "passive", "potential", "volitional", "ba", "causative", "causativePassive", "voiceCompound",
];

test("places the complete core conjugation route before the curriculum boundary", () => {
  assert.deepEqual(CORE_COURSE_IDS, expectedCore);
  assert.equal(CORE_COURSE_COUNT, expectedCore.length);
  assert.deepEqual(COURSES.slice(CORE_COURSE_COUNT, CORE_COURSE_COUNT + 5).map((course) => course.id), ["tara", "nasai", "prohibitive", "nakuteNaide", "zuZuni"]);
  assert.equal(COURSES.length, 36);
  assert.deepEqual(COURSES.find((course) => course.id === "causativePassive").forms, ["causativePassive", "causativePassiveContracted"]);
});

test("defaults the core scope to only the courses before the boundary", () => {
  assert.deepEqual(coursesForScope("core").map((course) => course.id), expectedCore);
  assert.equal(coursesForScope("full").length, COURSES.length);
  assert.throws(() => coursesForScope("unknown"), /Unknown curriculum scope/);
});

test("defines an independent adjective curriculum in Yokubi lesson order", () => {
  assert.deepEqual(ADJECTIVE_COURSES.map((course) => course.id), ["adjectiveClassify", "adjectiveIBase", "adjectiveITe", "adjectiveNaBase", "adjectiveConditional", "adjectiveAdverb"]);
  assert.deepEqual(ADJECTIVE_COURSES.map((course) => course.lesson), ["08", "08", "10", "15", "27", "31"]);
  assert.ok(ADJECTIVE_COURSES.every((course) => course.domain === "adjective"));
  assert.ok(COURSES.every((course) => course.domain === "verb"));
});

test("keeps existing downstream progress but excludes it from core focus and unlocking", () => {
  const component = (id, order, firstCourseId) => ({ id, order, firstCourseId, firstCourseIndex: order, gating: true, prerequisites: [], coverageKcIds: [] });
  const core = component("core", 0, "negative");
  const downstream = component("downstream", 1, "giving");
  const all = [core, downstream];
  const byKc = { core: { confidence: 0.6 }, downstream: { confidence: 0 } };
  const active = componentsForScope(all, "core");

  assert.deepEqual(active.map((item) => item.id), ["core"]);
  assert.equal(selectFocus(active, byKc).id, "core");
  assert.deepEqual(advanceIntroductions(active, ["core", "downstream"], byKc).introducedKcIds, ["core", "downstream"]);
  assert.equal(byKc.downstream.confidence, 0);
});

test("builds a core-only model without leaking downstream exercises", () => {
  const core = { id: "core", firstCourseId: "negative" };
  const downstream = { id: "downstream", firstCourseId: "giving" };
  const model = {
    components: [core, downstream],
    exercises: [
      { id: "core-exercise", courseId: "negative", kcIds: ["core"] },
      { id: "downstream-exercise", courseId: "giving", kcIds: ["core", "downstream"] },
    ],
    courseKcIds: { negative: ["core"], giving: ["core", "downstream"] },
  };
  const scoped = knowledgeModelForScope(model, "core");

  assert.deepEqual(scoped.components, [core]);
  assert.deepEqual(scoped.exercises.map((exercise) => exercise.id), ["core-exercise"]);
  assert.equal(scoped.courseKcIds.giving, undefined);
  assert.deepEqual(model.components, [core, downstream]);
});
