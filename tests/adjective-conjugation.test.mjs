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
  assert.deepEqual(acceptedAdjectiveConjugations(shizuka, "adjectiveNaNegative"), ["静かではない", "静かじゃない", "静かでない"]);
  assert.deepEqual(acceptedAdjectiveConjugations(shizuka, "adjectiveNaNegativePast"), ["静かではなかった", "静かじゃなかった", "静かでなかった"]);
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

test('recognizes complete ku stems missing nai or te without crediting classification or adverb use', () => {
  for (const surface of ['早い', 'はやい']) {
    const item = adjective(surface, 'i');
    const stem = surface.slice(0, -1) + 'く';
    for (const [form, id] of [['adjectiveNegative', 'adj.suffix.i-negative'], ['adjectiveTe', 'adj.suffix.i-te']]) {
      const diagnosis = diagnoseAdjective(item, form, stem);
      assert.equal(diagnosis.kcId, id);
      assert.deepEqual(diagnosis.confirmedKcIds, ['adj.stem.i-ku']);
    }
  }
  for (const surface of ['いい', 'かっこいい']) {
    const item = adjective(surface, 'i', { iiFamily: true });
    const diagnosis = diagnoseAdjective(item, 'adjectiveNegative', conjugateAdjective(item, 'adjectiveAdverb'));
    assert.deepEqual(diagnosis.confirmedKcIds, ['adj.stem.i-ku', 'adj.exception.ii-yo']);
    assert.equal(diagnoseAdjective(item, 'adjectiveNegative', surface.slice(0, -1) + 'く'), null);
  }
});

test('recognizes exact same-class form confusion without crediting the unrequested form', () => {
  for (const surface of ['大きい', 'おおきい']) {
    const item = adjective(surface, 'i');
    const diagnosis = diagnoseAdjective(item, 'adjectivePast', conjugateAdjective(item, 'adjectiveNegative'));
    assert.equal(diagnosis.kcId, 'adj.suffix.i-past');
    assert.match(diagnosis.message, /写成了否定形.*要求过去形/);
    assert.deepEqual(diagnosis.confirmedKcIds, []);
  }
  assert.equal(diagnoseAdjective(takai, 'adjectiveNegative', '高かった').kcId, 'adj.suffix.i-negative');
  assert.equal(diagnoseAdjective(takai, 'adjectivePast', '高くて').kcId, 'adj.suffix.i-past');
});

test('does not diagnose arbitrary prefixes, misspellings or accepted complete answers as omissions', () => {
  const hayai = adjective('はやい', 'i');
  for (const answer of ['はや', 'はやくな', 'はやくなっ', 'はやくない', 'はゆく', 'はやくxyz', 'xyz']) {
    assert.equal(diagnoseAdjective(hayai, 'adjectiveNegative', answer), null, answer);
  }
  assert.equal(diagnoseAdjective(hayai, 'adjectiveNegativePast', 'はやく'), null);
  assert.equal(diagnoseAdjective(hayai, 'adjectivePast', 'はゆくない'), null);
  assert.equal(diagnoseAdjective(shizuka, 'adjectiveNaNegative', '静'), null);
});
