import assert from "node:assert/strict";
import test from "node:test";
import { COMPOUND_FORM_LABELS, COMPOUND_FORM_SPECS, MULTI_STEP_FORMS } from "../app/lib/compound-forms.mjs";

test("generates past, negative, and negative-past continuations for every predicate-producing construction", () => {
  const specs = Object.values(COMPOUND_FORM_SPECS);
  assert.equal(specs.length, 48);
  assert.deepEqual(new Set(specs.map((spec) => spec.ending)), new Set(["past", "negative", "negativePast"]));
  assert.deepEqual(new Set(specs.map((spec) => spec.outputType)), new Set(["verb", "iAdjective"]));
  assert.equal(MULTI_STEP_FORMS.length, 49);
  assert.equal(MULTI_STEP_FORMS.at(-1), "passiveDesireNegativePast");
  assert.equal(COMPOUND_FORM_LABELS.teiruPast, "ている・过去形");
  assert.equal(COMPOUND_FORM_LABELS.taiNegativePast, "たい・否定过去形");
});
