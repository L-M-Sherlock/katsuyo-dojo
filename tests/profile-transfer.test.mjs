import assert from "node:assert/strict";
import test from "node:test";
import { createProfileExport, parseProfileImport } from "../app/lib/profile-transfer.mjs";

const options = { today: "2026-09-03", kcIds: ["class.godan", "class.irregular", "facet.class.irregular.suru", "facet.class.irregular.kuru", "suffix.negative"], gatingKcIds: ["class.godan", "class.irregular", "suffix.negative"], initialKcIds: ["class.godan"] };
const stats = { attempts: 5, correct: 4, filteredAccuracy: 0.8, confidence: 0.9, bestConfidence: 1, cleanTimeTotal: 6000, cleanTimeCount: 3 };
const profile = {
  version: 5,
  date: "2026-09-03",
  attempted: 8,
  correct: 6,
  streak: 2,
  introducedKcIds: ["class.godan", "suffix.negative"],
  rotation: 4,
  byKc: { "class.godan": stats },
};

test("exports and restores an atomic learning profile", () => {
  const backup = createProfileExport(profile, "2026-09-03T10:00:00.000Z");
  assert.equal(backup.format, "katsuyo-dojo-profile");
  assert.equal(backup.formatVersion, 2);
  assert.deepEqual(parseProfileImport(backup, options), profile);
});

test("resets only daily counters when a v5 backup comes from another day", () => {
  const imported = parseProfileImport(createProfileExport({ ...profile, date: "2026-09-02" }), options);
  assert.equal(imported.attempted, 0);
  assert.equal(imported.correct, 0);
  assert.equal(imported.streak, 0);
  assert.deepEqual(imported.byKc, profile.byKc);
});

test("migrates v4 by retaining same-day totals and restarting atomic assessment", () => {
  const legacy = { version: 4, date: "2026-09-03", attempted: 9, correct: 7, streak: 3, rotation: 2, introducedSkillCount: 20, bySkill: { old: stats } };
  assert.deepEqual(parseProfileImport({ format: "katsuyo-dojo-profile", formatVersion: 1, profile: legacy }, options), {
    version: 5, date: "2026-09-03", attempted: 9, correct: 7, streak: 3, rotation: 2, introducedKcIds: ["class.godan"], byKc: {},
  });
});

test("rejects unsupported backups and removes unknown KCs", () => {
  assert.throws(() => parseProfileImport({ format: "something-else", formatVersion: 2, profile }, options), /不是受支持/);
  const imported = parseProfileImport({ ...profile, introducedKcIds: [...profile.introducedKcIds, "unknown"], byKc: { ...profile.byKc, unknown: stats } }, options);
  assert.deepEqual(imported.introducedKcIds, profile.introducedKcIds);
  assert.deepEqual(Object.keys(imported.byKc), ["class.godan"]);
});

test("clamps unsafe numeric values during import", () => {
  const imported = parseProfileImport({ ...profile, attempted: -2, byKc: { "class.godan": { ...stats, confidence: 3, cleanTimeTotal: -1 } } }, options);
  assert.equal(imported.attempted, 0);
  assert.equal(imported.byKc["class.godan"].confidence, 1);
  assert.equal(imported.byKc["class.godan"].cleanTimeTotal, 0);
});

test("merges legacy irregular-class atoms into non-gating coverage facets", () => {
  const imported = parseProfileImport({ ...profile, introducedKcIds: ["class.godan", "class.irregular", "exception.suru.class", "exception.kuru.class"], byKc: { "class.irregular": stats, "exception.suru.class": stats, "exception.kuru.class": { ...stats, attempts: 4, correct: 4 } } }, options);
  assert.deepEqual(imported.introducedKcIds, ["class.godan", "class.irregular"]);
  assert.equal(imported.byKc["facet.class.irregular.suru"].correct, 4);
  assert.equal(imported.byKc["facet.class.irregular.kuru"].attempts, 4);
  assert.equal(imported.byKc["exception.kuru.class"], undefined);
});

test("moves legacy per-form irregular atoms under the form coverage facet", () => {
  const imported = parseProfileImport({ ...profile, introducedKcIds: ["class.godan", "exception.kuru.negative"], byKc: { "exception.kuru.negative": stats } }, { ...options, kcIds: [...options.kcIds, "facet.form.negative.kuru"], gatingKcIds: [...options.gatingKcIds, "suffix.negative"] });
  assert.equal(imported.byKc["facet.form.negative.kuru"].correct, 4);
  assert.equal(imported.byKc["exception.kuru.negative"], undefined);
});
