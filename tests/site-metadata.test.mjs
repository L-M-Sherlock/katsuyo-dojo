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

test("uses learner-facing knowledge-point language", async () => {
  const [page, readme] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /原子|ATOMIC/);
  assert.doesNotMatch(readme, /原子|ATOMIC/);
  assert.match(page, /拆开规律/);
  assert.match(page, /本题重点/);
  assert.match(page, /当前薄弱点/);
});
