import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const SITE_ORIGIN = 'https://l-m-sherlock.github.io/katsuyo-dojo';
const PROJECT_BASE = '/katsuyo-dojo/';

function localAssetPaths(html) {
  return [...html.matchAll(/(?:src|href)="(\/katsuyo-dojo\/[^"?#]+)"/g)]
    .map(match => match[1])
    .filter(path => !path.startsWith(`${PROJECT_BASE}en/`) && !path.startsWith(`${PROJECT_BASE}zh-CN/`));
}

test('the production build emits complete localized entry points and assets', { timeout: 30_000 }, t => {
  const output = mkdtempSync(join(tmpdir(), 'katsuyo-i18n-build-'));
  t.after(() => rmSync(output, { recursive: true, force: true }));

  const vite = resolve('node_modules/vite/bin/vite.js');
  const result = spawnSync(process.execPath, [vite, 'build', '--outDir', output, '--emptyOutDir'], {
    cwd: resolve('.'),
    encoding: 'utf8',
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const entries = {
    root: readFileSync(join(output, 'index.html'), 'utf8'),
    'zh-CN': readFileSync(join(output, 'zh-CN/index.html'), 'utf8'),
    en: readFileSync(join(output, 'en/index.html'), 'utf8'),
  };

  assert.match(entries.root, /<html lang="en">/);
  assert.match(entries.root, /src="\/katsuyo-dojo\/assets\/root-[^" ]+\.js"/);
  assert.match(entries['zh-CN'], /<html lang="zh-CN">/);
  assert.match(entries.en, /<html lang="en">/);

  for (const locale of ['zh-CN', 'en']) {
    const html = entries[locale];
    assert.match(html, new RegExp(`<link rel="canonical" href="${SITE_ORIGIN}/${locale}/"`));
    assert.match(html, new RegExp(`property="og:url" content="${SITE_ORIGIN}/${locale}/"`));
    assert.match(html, new RegExp(`hreflang="zh-CN" href="${SITE_ORIGIN}/zh-CN/"`));
    assert.match(html, new RegExp(`hreflang="en" href="${SITE_ORIGIN}/en/"`));
    assert.match(html, new RegExp(`hreflang="x-default" href="${SITE_ORIGIN}/"`));
    assert.match(html, /src="\/katsuyo-dojo\/assets\/[^" ]+\.js"/);
    assert.match(html, /href="\/katsuyo-dojo\/assets\/[^" ]+\.css"/);
  }

  assert.match(entries['zh-CN'], new RegExp(`property="og:image" content="${SITE_ORIGIN}/og\\.png"`));
  assert.match(entries.en, new RegExp(`property="og:image" content="${SITE_ORIGIN}/og-en\\.png"`));
  assert.ok(existsSync(join(output, 'og.png')), 'missing Chinese Open Graph image');
  assert.ok(existsSync(join(output, 'og-en.png')), 'missing English Open Graph image');

  const englishEntryPath = entries.en.match(/src="\/katsuyo-dojo\/([^" ]+\.js)"/)?.[1];
  assert.ok(englishEntryPath);
  const englishEntry = readFileSync(join(output, englishEntryPath), 'utf8');
  assert.match(englishEntry, /import\([`"]\.\/main-[^`"]+\.js[`"]\)/,
    'the small English entry starts the shared app without waiting for the full usage-card download');
  assert.doesNotMatch(entries['zh-CN'], /modulepreload[^>]+usage-cards-/,
    'the Chinese entry must not preload English usage text');

  for (const [entry, html] of Object.entries(entries)) {
    for (const assetPath of localAssetPaths(html)) {
      const relative = assetPath.slice(PROJECT_BASE.length);
      assert.ok(existsSync(join(output, relative)), `${entry} references missing asset: ${assetPath}`);
    }
  }
});
