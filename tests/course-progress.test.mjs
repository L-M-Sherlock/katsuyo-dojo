import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCourseProgress } from "../app/lib/course-progress.mjs";

const stats = (confidence, bestConfidence = confidence) => ({
  attempts: 5,
  correct: confidence >= 1 ? 5 : 4,
  filteredAccuracy: confidence,
  confidence,
  bestConfidence,
});

test("a shared prerequisite regression only weakens the course that owns it", () => {
  const ichidan = { id: "class.ichidan", firstCourseId: "classify", coverageKcIds: [] };
  const negative = { id: "suffix.negative", firstCourseId: "negative", coverageKcIds: [] };
  const introduced = new Set([ichidan.id, negative.id]);
  const byKc = { [ichidan.id]: stats(0.6, 1), [negative.id]: stats(1) };

  const classifySummary = summarizeCourseProgress({ id: "classify", forms: [] }, [ichidan], introduced, byKc);
  const negativeSummary = summarizeCourseProgress({ id: "negative", forms: ["negative"] }, [ichidan, negative], introduced, byKc);

  assert.equal(classifySummary.status, "需加强");
  assert.equal(classifySummary.percent, 60);
  assert.equal(negativeSummary.status, "已达标");
  assert.equal(negativeSummary.percent, 100);
  assert.deepEqual(negativeSummary.required, [ichidan, negative]);
  assert.deepEqual(negativeSummary.owned, [negative]);
});

test("course unlock counts include only knowledge introduced by that course", () => {
  const reused = { id: "class.godan", firstCourseId: "classify", coverageKcIds: [] };
  const first = { id: "onbin.i", firstCourseId: "past", coverageKcIds: [] };
  const second = { id: "suffix.past", firstCourseId: "past", coverageKcIds: [] };
  const summary = summarizeCourseProgress(
    { id: "past", forms: ["past"] },
    [reused, first, second],
    new Set([reused.id, first.id]),
    { [reused.id]: stats(1), [first.id]: stats(0.4) },
  );

  assert.equal(summary.status, "知识点 1/2");
  assert.equal(summary.percent, 0);
});
