import assert from "node:assert/strict";
import test from "node:test";
import { ADJECTIVES } from "../app/lib/adjective-catalog.mjs";
import { acceptedAdjectiveConjugations, conjugateAdjective, diagnoseAdjective, explainAdjectiveClass, explainAdjectiveConjugation } from "../app/lib/adjective-conjugation.mjs";

const adjective = (surface, adjectiveClass, extra = {}) => ({ domain: "adjective", surface, reading: surface, meaning: "", class: adjectiveClass, iiFamily: false, ...extra });
const takai = adjective("高い", "i");
const shizuka = adjective("静か", "na");

test("conjugates the complete plain い-adjective paradigm", () => {
  const cases = {
    adjectiveNegative: "高くない",
    adjectivePast: "高かった",
    adjectiveNegativePast: "高くなかった",
    adjectiveTe: "高くて",
    adjectiveBa: "高ければ",
    adjectiveAdverb: "高く",
  };
  for (const [form, expected] of Object.entries(cases)) assert.equal(conjugateAdjective(takai, form), expected);
  assert.deepEqual(explainAdjectiveConjugation(takai, "adjectiveNegativePast").steps, ["高くない", "高くなかった"]);
});

test("uses the よ stem only for the explicit いい family", () => {
  const ii = adjective("いい", "i", { iiFamily: true });
  const kakkoii = adjective("かっこいい", "i", { iiFamily: true });
  const kawaii = adjective("かわいい", "i");
  assert.equal(conjugateAdjective(ii, "adjectivePast"), "よかった");
  assert.equal(conjugateAdjective(ii, "adjectiveBa"), "よければ");
  assert.equal(conjugateAdjective(kakkoii, "adjectiveNegative"), "かっこよくない");
  assert.equal(conjugateAdjective(kawaii, "adjectiveNegative"), "かわいくない");
  assert.equal(diagnoseAdjective(ii, "adjectiveNegative", "いくない")?.kcId, "adj.exception.ii-yo");
});

test("conjugates the complete plain な-adjective paradigm and accepts common variants", () => {
  const cases = {
    adjectiveAttributive: "静かな",
    adjectivePredicative: "静かだ",
    adjectiveNaNegative: "静かではない",
    adjectiveNaPast: "静かだった",
    adjectiveNaNegativePast: "静かではなかった",
    adjectiveNaTe: "静かで",
    adjectiveBa: "静かなら",
    adjectiveAdverb: "静かに",
  };
  for (const [form, expected] of Object.entries(cases)) assert.equal(conjugateAdjective(shizuka, form), expected);
  assert.deepEqual(acceptedAdjectiveConjugations(shizuka, "adjectiveNaNegative"), ["静かではない", "静かじゃない"]);
  assert.deepEqual(acceptedAdjectiveConjugations(shizuka, "adjectiveNaNegativePast"), ["静かではなかった", "静かじゃなかった"]);
  assert.deepEqual(acceptedAdjectiveConjugations(shizuka, "adjectiveBa"), ["静かなら", "静かならば", "静かであれば"]);
});

test("diagnoses an adjective-class mix-up conservatively", () => {
  assert.equal(diagnoseAdjective(shizuka, "adjectiveNaNegative", "静かくない")?.kcId, "adj.class.na");
  assert.equal(diagnoseAdjective(takai, "adjectiveNegative", "高いではない")?.kcId, "adj.class.i");
  assert.equal(diagnoseAdjective(takai, "adjectiveNegative", "xyz"), null);
});

test("keeps common い-ending な-adjectives in the curated lexicon", () => {
  const bySurface = new Map(ADJECTIVES.map((item) => [item.surface, item]));
  assert.equal(bySurface.get("きれい").class, "na");
  assert.equal(bySurface.get("嫌い").class, "na");
  assert.match(explainAdjectiveClass(bySurface.get("きれい")), /な形容词分类例外/);
  assert.ok(ADJECTIVES.filter((item) => item.class === "i").length >= 48);
  assert.ok(ADJECTIVES.filter((item) => item.class === "na").length >= 36);
});
