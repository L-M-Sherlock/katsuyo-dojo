import assert from "node:assert/strict";
import test from "node:test";
import { acceptedVariantNote, matchAcceptedAnswer } from "../app/lib/answer-variants.mjs";

const normalize = (value) => value.replace(/\s/g, "");

test("keeps canonical kanji and kana answers on the default display", () => {
  const surface = ["浴びられる", "浴びれる"];
  const reading = ["あびられる", "あびれる"];
  assert.deepEqual(matchAcceptedAnswer("浴びられる", surface, reading, normalize), { correct: true, variant: null });
  assert.deepEqual(matchAcceptedAnswer("あびられる", surface, reading, normalize), { correct: true, variant: null });
});

test("maps a kana answer back to the corresponding accepted surface variant", () => {
  const match = matchAcceptedAnswer("あびれる", ["浴びられる", "浴びれる"], ["あびられる", "あびれる"], normalize);
  assert.deepEqual(match, { correct: true, variant: { surface: "浴びれる", reading: "あびれる" } });
  assert.equal(acceptedVariantNote({ domain: "verb" }, "potential", match.variant), "你使用了省略「ら」的常见口语可能形。");
});

test("labels other accepted variants without misclassifying them", () => {
  const adjective = { surface: "静かじゃない", reading: "しずかじゃない" };
  assert.equal(acceptedVariantNote({ domain: "adjective" }, "adjectiveNaNegative", adjective), "你使用了较口语的「じゃ」形式。");
  assert.equal(acceptedVariantNote({ domain: "verb" }, "imperative", { surface: "せよ" }), "你使用了本站接受的答案变体。");
  assert.deepEqual(matchAcceptedAnswer("wrong", ["浴びられる"], ["あびられる"], normalize), { correct: false, variant: null });
});
