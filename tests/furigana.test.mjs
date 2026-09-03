import assert from "node:assert/strict";
import test from "node:test";
import { furiganaFor } from "../app/lib/furigana.mjs";

test("shows the changed reading above conjugated kanji answers", () => {
  assert.equal(furiganaFor("来られる", "こられる"), "こられる");
  assert.equal(furiganaFor("来た", "きた"), "きた");
  assert.equal(furiganaFor("来れば", "くれば"), "くれば");
});

test("does not add redundant furigana to kana-only text", () => {
  assert.equal(furiganaFor("こられる", "こられる"), null);
  assert.equal(furiganaFor("させる", "させる"), null);
});
