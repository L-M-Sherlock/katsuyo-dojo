import assert from "node:assert/strict";
import test from "node:test";
import { auditKnowledgeModel, buildKnowledgeModel, deriveExercise, diagnoseConjugation, isRuGodanException, requiredKcIds } from "../app/lib/knowledge-model.mjs";

const yomu = { surface: "読む", reading: "よむ", meaning: "阅读", class: "godan" };
const kaku = { surface: "書く", reading: "かく", meaning: "书写", class: "godan" };
const taberu = { surface: "食べる", reading: "たべる", meaning: "吃", class: "ichidan" };
const shaberu = { surface: "喋る", reading: "しゃべる", meaning: "聊天", class: "godan" };
const suru = { surface: "する", reading: "する", meaning: "做", class: "irregular" };
const kuru = { surface: "来る", reading: "くる", meaning: "来", class: "irregular" };
const iku = { surface: "行く", reading: "いく", meaning: "去", class: "godan" };

test("maps a godan past item to class, sound change, voicing, and suffix KCs", () => {
  assert.deepEqual(requiredKcIds(yomu, "past"), ["class.godan", "onbin.hatsuon", "onbin.voicing", "suffix.past"]);
  assert.deepEqual(requiredKcIds(kaku, "te"), ["class.godan", "onbin.i", "suffix.te"]);
});

test("shares sound-change KCs between past, te, and derived constructions", () => {
  assert.ok(requiredKcIds(yomu, "past").includes("onbin.hatsuon"));
  assert.ok(requiredKcIds(yomu, "te").includes("onbin.hatsuon"));
  const compound = requiredKcIds(yomu, "teshimau");
  assert.ok(compound.includes("onbin.hatsuon"));
  assert.ok(compound.includes("suffix.te"));
  assert.ok(compound.includes("construction.teshimau"));
});

test("tracks ru-ending godan exceptions as a shared and per-word fact", () => {
  assert.equal(isRuGodanException(shaberu), true);
  const ids = requiredKcIds(shaberu, null);
  assert.ok(ids.includes("exception.ru-godan"));
  assert.ok(ids.includes("lexeme.ru-godan.喋る"));
  assert.ok(requiredKcIds(taberu, null).includes("heuristic.ru-ie"));
});

test("models suru and kuru as coverage facets of one irregular-class atom", () => {
  assert.deepEqual(requiredKcIds(suru, null), ["class.irregular", "facet.class.irregular.suru"]);
  assert.deepEqual(requiredKcIds(kuru, null), ["class.irregular", "facet.class.irregular.kuru"]);
  const model = buildKnowledgeModel([{ id: "classify", lesson: "04", forms: [] }], [suru, kuru]);
  const parent = model.components.find((kc) => kc.id === "class.irregular");
  assert.equal(parent.coverageOnly, true);
  assert.deepEqual(parent.coverageKcIds, ["facet.class.irregular.suru", "facet.class.irregular.kuru"]);
  assert.equal(model.components.find((kc) => kc.id === "facet.class.irregular.kuru").gating, false);
  assert.equal(model.components.some((kc) => kc.id === "exception.kuru.class"), false);
});

test("models irregular form variants as non-gating coverage facets of the form", () => {
  assert.deepEqual(requiredKcIds(kuru, "negative"), ["class.irregular", "facet.class.irregular.kuru", "suffix.negative", "facet.form.negative.kuru"]);
  const model = buildKnowledgeModel([{ id: "negative", lesson: "07", forms: ["negative"] }], [kuru]);
  const negative = model.components.find((kc) => kc.id === "suffix.negative");
  assert.deepEqual(negative.coverageKcIds, ["facet.form.negative.kuru"]);
  assert.equal(model.components.find((kc) => kc.id === "facet.form.negative.kuru").gating, false);
});

test("models the iku exception as coverage of the shared sokuon rule", () => {
  assert.deepEqual(requiredKcIds(iku, "past"), ["class.godan", "onbin.sokuon", "facet.onbin.sokuon.iku", "suffix.past"]);
  const model = buildKnowledgeModel([{ id: "past", lesson: "09", forms: ["past"] }], [iku]);
  const sokuon = model.components.find((kc) => kc.id === "onbin.sokuon");
  assert.deepEqual(sokuon.coverageKcIds, ["facet.onbin.sokuon.iku"]);
  assert.equal(model.components.find((kc) => kc.id === "facet.onbin.sokuon.iku").gating, false);
  assert.equal(model.components.some((kc) => kc.id === "exception.iku-onbin"), false);
});

test("builds a Q-matrix catalog and makes lexical facts non-gating", () => {
  const courses = [
    { id: "classify", lesson: "04", forms: [] },
    { id: "past", lesson: "09", forms: ["past"] },
  ];
  const model = buildKnowledgeModel(courses, [yomu, shaberu, taberu], { formLabels: { past: "过去形" } });
  assert.equal(model.exercises.length, 6);
  assert.equal(model.components.find((kc) => kc.id === "lexeme.ru-godan.喋る").gating, false);
  assert.ok(model.courseKcIds.past.includes("onbin.hatsuon"));
  assert.ok(model.components.every((kc) => kc.prerequisites.every((id) => model.components.some((candidate) => candidate.id === id))));
});

test("audits gating support, coverage parents, and course supply", () => {
  const healthy = buildKnowledgeModel([{ id: "classify", lesson: "04", forms: [] }], [yomu, kaku, taberu, shaberu, suru, kuru]);
  assert.deepEqual(auditKnowledgeModel(healthy, { minEvidence: 1, sessionLength: 1 }), []);
  const broken = {
    components: [{ id: "exception.kuru.negative", gating: true, firstCourseIndex: 0, coverageKcIds: [] }],
    exercises: [{ id: "one", courseId: "negative", courseIndex: 0, form: "negative", item: kuru, kcIds: ["exception.kuru.negative"] }],
  };
  const codes = auditKnowledgeModel(broken).map(({ code }) => code);
  assert.ok(codes.includes("undersupplied-gating-kc"));
  assert.ok(codes.includes("isolated-lexical-gate"));
  assert.ok(codes.includes("undersupplied-course"));
});

test("returns structured derivation evidence", () => {
  const derivation = deriveExercise(yomu, "past");
  assert.equal(derivation.answer, "読んだ");
  assert.ok(derivation.operations.every((operation) => operation.kcIds.length > 0));
  assert.ok(derivation.operations.every((operation) => Array.isArray(operation.diagnosticAlternatives)));
  assert.deepEqual(derivation.requiredKcIds, requiredKcIds(yomu, "past"));
});

test("diagnoses only exact, unique single-rule near misses", () => {
  assert.equal(diagnoseConjugation(yomu, "past", "読みた")?.kcId, "onbin.hatsuon");
  assert.equal(diagnoseConjugation(yomu, "past", "読んた")?.kcId, "onbin.voicing");
  assert.equal(diagnoseConjugation(yomu, "teshimau", "読みてしまう")?.kcId, "onbin.hatsuon");
  assert.equal(diagnoseConjugation(yomu, "past", "xyz"), null);
  assert.equal(diagnoseConjugation(iku, "past", "行きた")?.kcId, "facet.onbin.sokuon.iku");
  const kanaException = { ...shaberu, surface: shaberu.reading, lexicalSurface: shaberu.surface };
  assert.equal(diagnoseConjugation(kanaException, "negative", "しゃべない")?.kcId, "lexeme.ru-godan.喋る");
});
