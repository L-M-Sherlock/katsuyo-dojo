import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { preferredLocaleDestination } from "../app/root-locale-redirect.mjs";

const SITE_ORIGIN = "https://l-m-sherlock.github.io/katsuyo-dojo";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("declares localized entry points with complete metadata", async () => {
  const [root, zh, en, favicon] = await Promise.all([
    read("../index.html"),
    read("../zh-CN/index.html"),
    read("../en/index.html"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
  ]);

  assert.match(root, /<html lang="en">/);
  assert.match(root, /<script type="module" src="\/app\/root-locale-redirect\.mjs"><\/script>/);
  assert.match(root, /href="\.\/en\/"/);
  assert.match(root, /href="\.\/zh-CN\/"/);

  for (const [html, locale, title, image] of [
    [zh, "zh-CN", "日语动词与形容词活用练习", "og.png"],
    [en, "en", "Japanese Verb and Adjective Conjugation Practice", "og-en.png"],
  ]) {
    assert.match(html, new RegExp(`<html lang="${locale}">`));
    assert.match(html, new RegExp(`<link rel="canonical" href="${SITE_ORIGIN}/${locale}/" />`));
    assert.match(html, new RegExp(`<link rel="alternate" hreflang="zh-CN" href="${SITE_ORIGIN}/zh-CN/" />`));
    assert.match(html, new RegExp(`<link rel="alternate" hreflang="en" href="${SITE_ORIGIN}/en/" />`));
    assert.match(html, new RegExp(`<link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}/" />`));
    assert.match(html, new RegExp(`<meta property="og:url" content="${SITE_ORIGIN}/${locale}/" />`));
    assert.match(html, new RegExp(`<meta property="og:image" content="${SITE_ORIGIN}/${image}" />`));
    assert.match(html, new RegExp(`<meta name="twitter:image" content="${SITE_ORIGIN}/${image}" />`));
    assert.match(html, new RegExp(title));
    assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/);
    assert.match(html, locale === 'en'
      ? /<script type="module" src="\/en\/start\.ts"><\/script>/
      : /<script type="module" src="\/main\.tsx"><\/script>/);
  }

  assert.match(favicon, /<title>活用道場<\/title>/);
  assert.match(favicon, />活<\/text>/);
});

async function runRedirect({ savedLocale = null, browserLocales = ["en-US"], search = "", hash = "", storageError = false } = {}) {
  const location = {
    origin: "https://l-m-sherlock.github.io",
    pathname: "/katsuyo-dojo/",
    search,
    hash,
  };
  const localStorage = {
    getItem(key) {
      assert.equal(key, "katsuyo-ui-locale-v1");
      if (storageError) throw new Error("storage disabled");
      return savedLocale;
    },
  };

  return preferredLocaleDestination({
    location,
    storage: localStorage,
    languages: browserLocales,
    basePath: "/katsuyo-dojo/",
  });
}

test("root entry prefers a saved locale and preserves the deep link", async () => {
  assert.equal(
    await runRedirect({ savedLocale: "zh-CN", browserLocales: ["en-US"], search: "?source=old", hash: "#/stats" }),
    `${SITE_ORIGIN}/zh-CN/?source=old#/stats`,
  );
  assert.equal(
    await runRedirect({ savedLocale: "en", browserLocales: ["zh-CN"], hash: "#/principles/selection" }),
    `${SITE_ORIGIN}/en/#/principles/selection`,
  );
});

test("root entry detects Chinese and otherwise defaults to English", async () => {
  assert.equal(await runRedirect({ browserLocales: ["zh-Hant"] }), `${SITE_ORIGIN}/zh-CN/`);
  assert.equal(await runRedirect({ browserLocales: ["ja-JP", "zh-CN"] }), `${SITE_ORIGIN}/zh-CN/`);
  assert.equal(await runRedirect({ browserLocales: ["ja-JP"] }), `${SITE_ORIGIN}/en/`);
  assert.equal(await runRedirect({ browserLocales: ["zh-CN"], storageError: true }), `${SITE_ORIGIN}/zh-CN/`);
  assert.equal(await runRedirect({ savedLocale: "unsupported", browserLocales: ["de-DE"] }), `${SITE_ORIGIN}/en/`);
});

test("uses learner-facing knowledge-point language", async () => {
  const [catalogs, readme] = await Promise.all([
    readFile(new URL("../app/lib/i18n/site-catalogs.mjs", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(catalogs, /原子|ATOMIC/);
  assert.doesNotMatch(readme, /原子|ATOMIC/);
  assert.match(catalogs, /拆开规律/);
  assert.match(catalogs, /本题重点/);
  assert.match(catalogs, /下一轮重点/);
});
