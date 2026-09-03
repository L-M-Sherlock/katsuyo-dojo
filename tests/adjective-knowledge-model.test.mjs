import assert from "node:assert/strict";
import test from "node:test";
import { ADJECTIVES } from "../app/lib/adjective-catalog.mjs";
import { buildAdjectiveKnowledgeModel, deriveAdjectiveExercise, requiredAdjectiveKcIds } from "../app/lib/adjective-knowledge-model.mjs";
import { ADJECTIVE_COURSES } from "../app/lib/curriculum.mjs";
import { auditKnowledgeModel } from "../app/lib/knowledge-model.mjs";

const bySurface = new Map(ADJECTIVES.map((item) => [item.surface, item]));

test("maps adjective forms to class, stem, connection, compound, and exception atoms", () => {
  assert.deepEqual(requiredAdjectiveKcIds(bySurface.get("高い"), "adjectiveNegative"), ["adj.class.i", "adj.stem.i-ku", "adj.suffix.i-negative"]);
  assert.deepEqual(requiredAdjectiveKcIds(bySurface.get("いい"), "adjectiveNegativePast"), ["adj.class.i", "adj.stem.i-ku", "adj.suffix.i-negative", "adj.compound.i-negative-past", "adj.exception.ii-yo"]);
  assert.deepEqual(requiredAdjectiveKcIds(bySurface.get("静か"), "adjectiveNaNegativePast"), ["adj.class.na", "facet.adj.class.na.regular", "adj.suffix.na-negative", "adj.compound.na-negative-past"]);
});

test("models い-ending な-adjectives as coverage instead of isolated gates", () => {
  const model = buildAdjectiveKnowledgeModel(ADJECTIVE_COURSES, ADJECTIVES);
  const naClass = model.components.find((component) => component.id === "adj.class.na");
  assert.deepEqual(naClass.coverageKcIds, ["facet.adj.class.na.regular", "facet.adj.class.na.i-ending"]);
  assert.equal(model.components.find((component) => component.id === "facet.adj.class.na.i-ending").gating, false);
  assert.equal(model.components.some((component) => component.id.startsWith("lexeme.adj")), false);
});

test("builds an auditable six-course adjective catalog", () => {
  const model = buildAdjectiveKnowledgeModel(ADJECTIVE_COURSES, ADJECTIVES);
  assert.equal(ADJECTIVE_COURSES.length, 6);
  assert.equal(model.components.filter((component) => component.gating).length, 18);
  assert.deepEqual(auditKnowledgeModel(model), []);
  assert.ok(model.components.every((component) => component.id.startsWith("adj.") || component.id.startsWith("facet.adj.")));
  assert.ok(model.exercises.every((exercise) => exercise.item.domain === "adjective"));
  assert.ok(model.exercises.every((exercise) => exercise.courseId.startsWith("adjective")));
});

test("returns structured adjective derivation evidence and accepted variants", () => {
  const derivation = deriveAdjectiveExercise(bySurface.get("静か"), "adjectiveNaNegative");
  assert.equal(derivation.answer, "静かではない");
  assert.ok(derivation.acceptedVariants.includes("静かじゃない"));
  assert.ok(derivation.operations.every((operation) => operation.kcIds.length === 1));
});
