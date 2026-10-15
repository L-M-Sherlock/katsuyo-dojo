import test from 'node:test';
import assert from 'node:assert/strict';
import manifest from '../app/data/furifont-runtime.json' with {type: 'json'};
import {createFurifontLoader, furifontEntry, furifontFeatures, furifontStyle, getFurifontLoader} from '../app/lib/furifont.mjs';

test('font choices require exact source readings and keep the intended family and overhang', () => {
  for (const entry of manifest.entries) {
    assert.equal(furifontEntry(entry), entry);
    assert.match(furifontFeatures(entry.families.sans.salt), /"rclt" 1/u);
    for (const family of ['sans', 'serif', 'display']) {
      if (!entry.families[family]) {
        assert.equal(furifontEntry(entry, family), undefined);
        continue;
      }
      const style = furifontStyle(entry, family);
      assert.ok(style.fontFamily.includes(`"${manifest.families[family].family}"`));
      assert.equal(style.fontFeatureSettings, `"rclt" 1, "salt" ${entry.families[family].salt}`);
      const overhang = entry.families?.[family]?.inkOverhangEm ?? entry.inkOverhangEm;
      assert.equal(style.paddingInlineStart, overhang?.left ? `${overhang.left}em` : undefined);
      assert.equal(style.paddingInlineEnd, overhang?.right ? `${overhang.right}em` : undefined);
    }
  }
  assert.equal(furifontEntry({text: '来', reading: 'not a reviewed reading'}), undefined);
  assert.equal(furifontEntry({text: '来る', reading: 'くる'}), undefined);
});

test('each exact font face loads once and becomes ready only after it is registered', async () => {
  for (const family of ['sans', 'serif', 'display']) {
    let loads = 0, constructions = 0, release;
    const faces = [];
    class FontFace {
      constructor(name, source, descriptors) { this.family = name; this.source = source; this.descriptors = descriptors; constructions++; }
      load() { loads++; return new Promise(resolve => { release = () => resolve(this); }); }
    }
    const loader = createFurifontLoader({fontSet: {add: face => faces.push(face)}, FontFace, family, baseUrl: 'https://example.test/katsuyo-dojo/'});
    let notices = 0;
    const unsubscribe = loader.subscribe(() => notices++);
    const first = loader.load(), second = loader.load();
    assert.equal(loader.getSnapshot(), false);
    assert.equal(loads, 1);
    assert.equal(constructions, 1);
    release();
    assert.equal(await first, true);
    assert.equal(await second, true);
    assert.equal(loader.getSnapshot(), true);
    assert.equal(notices, 1);
    assert.equal(faces[0].family, manifest.families[family].family);
    assert.ok(faces[0].source.includes(`https://example.test/katsuyo-dojo/${manifest.families[family].fontUrl}?v=${manifest.families[family].sha256}`));
    unsubscribe();
    assert.equal(await loader.load(), true);
    assert.equal(notices, 1);
  }
});

test('a fallback font check, absent APIs or rejected face cannot hide native ruby', async () => {
  for (const result of ['reject', [], {}, undefined, 'loading', 'error']) {
    let adds = 0, notices = 0;
    class FontFace {
      constructor() { this.status = result; }
      load() {
        if (result === 'reject') return Promise.reject(new Error('offline'));
        return Promise.resolve(typeof result === 'string' ? this : result);
      }
    }
    const loader = createFurifontLoader({fontSet: {add: () => adds++, check: () => true, load: async () => []}, FontFace, baseUrl: 'https://example.test/'});
    loader.subscribe(() => notices++);
    assert.equal(await loader.load(), false);
    assert.equal(loader.getSnapshot(), false);
    assert.equal(adds, 0);
    assert.equal(notices, 0);
  }
  for (const args of [{fontSet: undefined, FontFace: class {}}, {fontSet: {}, FontFace: undefined}]) {
    assert.equal(await createFurifontLoader({...args, baseUrl: 'https://example.test/'}).load(), false);
  }
  class FontFace { load() { return Promise.resolve(this); } }
  const failedAdd = createFurifontLoader({fontSet: {add: () => { throw new Error('registration failure'); }}, FontFace, baseUrl: 'https://example.test/'});
  assert.equal(await failedAdd.load(), false);
  assert.equal(failedAdd.getSnapshot(), false);
});

test('font loaders are shared per font set and family without poisoning later documents', async () => {
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const savedFont = Object.getOwnPropertyDescriptor(globalThis, 'FontFace');
  const firstSet = {add: () => {}}, secondSet = {add: () => {}};
  const page = {fonts: firstSet, baseURI: 'https://example.test/katsuyo-dojo/'};
  Object.defineProperty(globalThis, 'document', {configurable: true, value: page});
  Object.defineProperty(globalThis, 'FontFace', {configurable: true, value: undefined});
  try {
    const missing = getFurifontLoader();
    assert.equal(await missing.load(), false);
    class FontFace { load() { return Promise.resolve(this); } }
    Object.defineProperty(globalThis, 'FontFace', {configurable: true, value: FontFace});
    const first = getFurifontLoader();
    assert.notEqual(first, missing);
    assert.equal(getFurifontLoader(), first);
    assert.notEqual(getFurifontLoader('serif'), first);
    assert.notEqual(getFurifontLoader('display'), getFurifontLoader('serif'));
    assert.equal(await first.load(), true);
    page.fonts = secondSet;
    const second = getFurifontLoader();
    assert.notEqual(second, first);
    assert.equal(second.getSnapshot(), false);
    assert.equal(await second.load(), true);
    assert.equal(first.getSnapshot(), true);
  } finally {
    if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument); else delete globalThis.document;
    if (savedFont) Object.defineProperty(globalThis, 'FontFace', savedFont); else delete globalThis.FontFace;
  }
});
