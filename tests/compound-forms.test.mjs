import assert from "node:assert/strict";
import test from "node:test";
import { COMPOUND_FORM_LABELS, COMPOUND_FORM_SPECS, MULTI_STEP_FORMS, RETIRED_TEORU_NEGATIVE_FORMS } from "../app/lib/compound-forms.mjs";
import { conjugate, acceptedConjugations } from '../app/lib/conjugation.mjs';
import { UNIFIED_COURSES } from '../app/lib/unified-curriculum.mjs';
import { USAGE_CARDS } from '../app/lib/usage-cards.mjs';
import { supportsVerbForm } from '../app/lib/form-eligibility.mjs';
import { recognizableForms } from '../app/lib/form-recognition.mjs';

test("omits retired ておる negatives while retaining the supported continuations", () => {
  const specs = Object.values(COMPOUND_FORM_SPECS);
  assert.equal(specs.length, 46);
  assert.deepEqual(new Set(specs.map((spec) => spec.ending)), new Set(["past", "negative", "negativePast"]));
  assert.deepEqual(new Set(specs.map((spec) => spec.outputType)), new Set(["verb", "iAdjective"]));
  assert.equal(MULTI_STEP_FORMS.length, 88);
  assert.deepEqual(RETIRED_TEORU_NEGATIVE_FORMS,new Set(['teoruNegative','teoruNegativePast']));
  for(const form of RETIRED_TEORU_NEGATIVE_FORMS){
    assert.equal(COMPOUND_FORM_SPECS[form],undefined);
    assert.equal(COMPOUND_FORM_LABELS[form],undefined);
    assert.ok(!MULTI_STEP_FORMS.includes(form));
  }
  assert.equal(COMPOUND_FORM_LABELS.teoruPast, "ておる・过去形");
  assert.ok(MULTI_STEP_FORMS.includes("passiveDesireNegativePast"));
  assert.equal(COMPOUND_FORM_LABELS.teiruPast, "ている・过去形");
  assert.equal(COMPOUND_FORM_LABELS.taiNegativePast, "たい・否定过去形");
});

test('retired ておらない forms cannot re-enter lessons, cards, conjugation, or recognition',()=>{
  const item={domain:'verb',surface:'読む',reading:'よむ',class:'godan'};
  for(const form of RETIRED_TEORU_NEGATIVE_FORMS){
    assert.ok(UNIFIED_COURSES.every(course=>!course.forms.includes(form)),form);
    assert.ok(USAGE_CARDS.every(card=>card.form!==form),form);
    assert.equal(supportsVerbForm(item,form),false,form);
    assert.ok(!recognizableForms(item).includes(form),form);
    assert.throws(()=>conjugate(item.surface,item.class,form),/Retired conjugation form/);
    assert.throws(()=>acceptedConjugations(item.surface,item.class,form),/Retired conjugation form/);
  }
  assert.equal(conjugate('読む','godan','teoru'),'読んでおる');
  assert.equal(conjugate('読む','godan','teoruPast'),'読んでおった');
});
