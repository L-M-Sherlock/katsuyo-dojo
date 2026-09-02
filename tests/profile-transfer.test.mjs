import assert from "node:assert/strict";
import test from "node:test";
import { createProfileExport, parseProfileImport } from "../app/lib/profile-transfer.mjs";

const options = { today: "2026-09-03", skillIds: ["skill-a"], maxSkills: 5 };
const profile = {
  version: 4,
  date: "2026-09-03",
  attempted: 8,
  correct: 6,
  streak: 2,
  introducedSkillCount: 3,
  rotation: 4,
  bySkill: {
    "skill-a": { attempts: 5, correct: 4, filteredAccuracy: 0.8, confidence: 0.9, bestConfidence: 1, cleanTimeTotal: 6000, cleanTimeCount: 3 },
  },
};

test("exports and restores a current learning profile", () => {
  const backup = createProfileExport(profile, "2026-09-03T10:00:00.000Z");
  assert.equal(backup.format, "katsuyo-dojo-profile");
  assert.deepEqual(parseProfileImport(backup, options), profile);
});

test("resets daily counters when a backup comes from another day", () => {
  const imported = parseProfileImport(createProfileExport({ ...profile, date: "2026-09-02" }), options);
  assert.equal(imported.attempted, 0);
  assert.equal(imported.correct, 0);
  assert.equal(imported.streak, 0);
  assert.deepEqual(imported.bySkill, profile.bySkill);
});

test("rejects unsupported backups and removes unknown skills", () => {
  assert.throws(() => parseProfileImport({ format: "something-else", formatVersion: 1, profile }, options), /不是受支持/);
  const imported = parseProfileImport({ ...profile, bySkill: { ...profile.bySkill, unknown: profile.bySkill["skill-a"] } }, options);
  assert.deepEqual(Object.keys(imported.bySkill), ["skill-a"]);
});

test("clamps unsafe numeric values during import", () => {
  const imported = parseProfileImport({ ...profile, attempted: -2, introducedSkillCount: 99, bySkill: { "skill-a": { ...profile.bySkill["skill-a"], confidence: 3, cleanTimeTotal: -1 } } }, options);
  assert.equal(imported.attempted, 0);
  assert.equal(imported.introducedSkillCount, 5);
  assert.equal(imported.bySkill["skill-a"].confidence, 1);
  assert.equal(imported.bySkill["skill-a"].cleanTimeTotal, 0);
});
