import assert from "node:assert/strict";
import test from "node:test";
import { COMPOUND_FORM_SPECS } from "../app/lib/compound-forms.mjs";
import { FORM_SEMANTICS, semanticsForForm } from "../app/lib/form-semantics.mjs";
import { UNIFIED_COURSES } from "../app/lib/unified-curriculum.mjs";

const curriculumForms = [...new Set(
  UNIFIED_COURSES.flatMap((course) => course.forms),
)];

test("provides non-empty semantic help for every curriculum form", () => {
  for (const form of curriculumForms) {
    const entry = semanticsForForm(form);
    assert.ok(entry, `missing semantics for ${form}`);
    assert.equal(typeof entry.concise, "string", `${form} concise must be text`);
    assert.equal(typeof entry.coreMeaning, "string", `${form} coreMeaning must be text`);
    assert.ok(entry.concise.trim(), `${form} concise must not be empty`);
    assert.doesNotMatch(entry.concise, /[（）()\u3040-\u30ff]|否定|缩约|书面|普通体|礼貌体/, `${form} must explain its meaning in natural Chinese without form or register labels`);
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

test("describes each complete compound meaning while preserving usage and form metadata", () => {
  for (const [form, spec] of Object.entries(COMPOUND_FORM_SPECS)) {
    const compound = semanticsForForm(form);
    const base = semanticsForForm(spec.form);
    assert.ok(compound, `missing compound semantics for ${form}`);
    assert.equal(compound.baseForm, spec.form);
    assert.equal(compound.continuation, spec.ending);
    assert.equal(compound.form, form);
    for (const field of ["register", "usageNote", "contrast"]) {
      assert.equal(compound[field], base[field], `${form} must retain its base ${field}`);
    }
    assert.doesNotMatch(compound.coreMeaning, /整体.*变为/, `${form} must explain the resulting meaning rather than describe another conjugation`);
  }

  assert.match(semanticsForForm("taiPast").concise, /过去想做/);
  assert.match(semanticsForForm("taiNegative").concise, /不想做/);
  assert.match(semanticsForForm("taiNegativePast").concise, /过去不想做/);
  assert.match(semanticsForForm("teageruNegativePast").concise, /过去没有为别人做/);
  assert.match(semanticsForForm("tehoshiiNegative").concise, /不希望别人做/);
  assert.doesNotMatch(semanticsForForm("tehoshiiNegative").concise, /希望别人不做/);
  assert.match(semanticsForForm("tagaruNegative").concise, /没有表现出.*意愿/);
  assert.match(semanticsForForm("tearuNegative").coreMeaning, /结果状态/);
  for (const form of ["teshimauNegative", "teshimauNegativePast"]) {
    assert.match(semanticsForForm(form).concise, /全部做完/);
    assert.doesNotMatch(semanticsForForm(form).concise, /不小心|意外/);
  }
  assert.match(semanticsForForm("teiruPast").coreMeaning, /ている|动作|状态/);
  assert.match(semanticsForForm("teiruPast").coreMeaning, /过去/);
  assert.match(semanticsForForm("taiNegativePast").coreMeaning, /过去不希望自己/);
});

test("returns null for classification and unknown forms", () => {
  assert.equal(semanticsForForm(null), null);
  assert.equal(semanticsForForm("classify"), null);
  assert.equal(semanticsForForm("not-a-form"), null);
});
