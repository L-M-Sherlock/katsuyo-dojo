import assert from "node:assert/strict";
import test from "node:test";
import { simulatePerfectLearning } from "../app/lib/perfect-simulation.mjs";

test("a perfect learner completes a small knowledge graph", () => {
  const component = (id, order, course) => ({ id, order, gating: true, firstCourseId: course, firstCourseIndex: order, prerequisites: order ? [`kc-${order - 1}`] : [], coverageKcIds: [] });
  const components = [component("kc-0", 0, "course-0"), component("kc-1", 1, "course-1")];
  const exercises = components.flatMap((kc) => Array.from({ length: 12 }, (_, index) => ({ id: `${kc.id}-${index}`, courseId: kc.firstCourseId, courseIndex: kc.firstCourseIndex, form: kc.id, item: { surface: `${kc.id}-${index}` }, kcIds: [kc.id] })));
  const model = { components, exercises, courseKcIds: { "course-0": ["kc-0"], "course-1": ["kc-1"] } };
  const report = simulatePerfectLearning(model);
  assert.equal(report.completed, true);
  assert.equal(report.roundCount, 2);
  assert.equal(report.questionCount, 10);
  assert.equal(report.masteredCount, 2);
  assert.equal(report.longestFocusRun.rounds, 1);
  assert.deepEqual(report.repeatedFocusKcs, []);
  assert.equal(report.redundantFocusQuestions, 0);
});

test("packs a second atom into the same round when enough focus slots remain", () => {
  const component = (id, order) => ({ id, order, gating: true, firstCourseId: "course", firstCourseIndex: 0, prerequisites: order ? [`kc-${order - 1}`] : [], coverageKcIds: [] });
  const components = [component("kc-0", 0), component("kc-1", 1)];
  const exercises = components.flatMap((kc) => Array.from({ length: 12 }, (_, index) => ({ id: `${kc.id}-${index}`, courseId: "course", courseIndex: 0, form: kc.id, item: { surface: `${kc.id}-${index}` }, kcIds: [kc.id] })));
  const report = simulatePerfectLearning({ components, exercises, courseKcIds: { course: ["kc-0", "kc-1"] } });
  assert.equal(report.completed, true);
  assert.equal(report.roundCount, 1);
  assert.equal(report.questionCount, 11);
  assert.deepEqual(report.rounds[0].focusIds, ["kc-0", "kc-1"]);
});
