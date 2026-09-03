import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("declares a deployable site favicon", async () => {
  const [html, favicon] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
  ]);

  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/katsuyo-dojo\/favicon\.svg" \/>/);
  assert.match(html, /日语动词与形容词活用练习/);
  assert.match(favicon, /<title>活用道場<\/title>/);
  assert.match(favicon, />活<\/text>/);
});
