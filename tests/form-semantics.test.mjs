import assert from "node:assert/strict";
import test from "node:test";
import { COMPOUND_FORM_SPECS } from "../app/lib/compound-forms.mjs";
import { ADJECTIVE_COURSES, COURSES } from "../app/lib/curriculum.mjs";
import { FORM_SEMANTICS, semanticsForForm } from "../app/lib/form-semantics.mjs";

const curriculumForms = [...new Set(
  [...COURSES, ...ADJECTIVE_COURSES].flatMap((course) => course.forms),
)];

test("provides non-empty semantic help for every curriculum form", () => {
  for (const form of curriculumForms) {
    const entry = semanticsForForm(form);
    assert.ok(entry, `missing semantics for ${form}`);
    assert.equal(typeof entry.concise, "string", `${form} concise must be text`);
    assert.equal(typeof entry.coreMeaning, "string", `${form} coreMeaning must be text`);
    assert.ok(entry.concise.trim(), `${form} concise must not be empty`);
    assert.ok(entry.coreMeaning.trim(), `${form} coreMeaning must not be empty`);
    assert.equal(entry.core, entry.coreMeaning, `${form} must expose the compact UI core alias`);
    if (entry.usageNote) assert.equal(entry.usage, entry.usageNote, `${form} must expose the compact UI usage alias`);
  }
});

test("distinguishes easily confused aspect, voice, and negative connectives", () => {
  assert.match(FORM_SEMANTICS.teiru.coreMeaning, /进行|习惯|结果状态/);
  assert.match(FORM_SEMANTICS.tearu.coreMeaning, /有意|结果状态/);
  assert.match(FORM_SEMANTICS.teoru.coreMeaning, /ている/);
  assert.match(FORM_SEMANTICS.teoru.register, /自谦/);
  assert.match(FORM_SEMANTICS.toru.coreMeaning, /缩/);
  assert.match(FORM_SEMANTICS.toru.register, /方言|角色/);

  assert.match(FORM_SEMANTICS.passive.coreMeaning, /被动|承受/);
  assert.match(FORM_SEMANTICS.passive.contrast, /可能形/);
  assert.match(FORM_SEMANTICS.potential.coreMeaning, /能力|可以实现/);
  assert.match(FORM_SEMANTICS.potential.contrast, /受身形/);

  assert.match(FORM_SEMANTICS.nakute.coreMeaning, /状态|原因/);
  assert.match(FORM_SEMANTICS.nakute.contrast, /ないで/);
  assert.match(FORM_SEMANTICS.naide.coreMeaning, /不进行|不做/);
  assert.match(FORM_SEMANTICS.naide.contrast, /なくて/);
});

test("derives multi-step semantics from the base expression", () => {
  for (const [form, spec] of Object.entries(COMPOUND_FORM_SPECS)) {
    const compound = semanticsForForm(form);
    const base = semanticsForForm(spec.form);
    assert.ok(compound, `missing compound semantics for ${form}`);
    assert.equal(compound.baseForm, spec.form);
    assert.equal(compound.continuation, spec.ending);
    assert.match(compound.coreMeaning, new RegExp(base.coreMeaning.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/。$/, "")));
  }

  assert.match(semanticsForForm("teiruPast").coreMeaning, /ている|动作|状态/);
  assert.match(semanticsForForm("teiruPast").coreMeaning, /过去/);
  assert.match(semanticsForForm("taiNegativePast").coreMeaning, /希望自己/);
  assert.match(semanticsForForm("taiNegativePast").coreMeaning, /否定过去/);
});

test("returns null for classification and unknown forms", () => {
  assert.equal(semanticsForForm(null), null);
  assert.equal(semanticsForForm("classify"), null);
  assert.equal(semanticsForForm("not-a-form"), null);
});
