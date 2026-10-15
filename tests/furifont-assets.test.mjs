import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import manifest from '../app/data/furifont-manifest.json' with {type:'json'};
import runtimeManifest from '../app/data/furifont-runtime.json' with {type:'json'};
import layouts from '../app/data/furigana-layouts.json' with {type:'json'};
import {getFuriganaCorpus} from '../scripts/furigana-corpus.mjs';
import {createFurifontRuntimeManifest} from '../scripts/furifont-runtime-manifest.mjs';
import {auditFuriganaLayouts} from '../scripts/audit-furifont.mjs';

const key=part=>`${part.text}\0${part.reading}`;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const corpus=getFuriganaCorpus();
const expected=new Set(corpus.pairs.map(key));

test('the font audit rejects stale clause layouts even when font pairs stay the same',()=>{
  assert.doesNotThrow(()=>auditFuriganaLayouts(layouts,corpus));
  const changedLayout=structuredClone(layouts);
  changedLayout.layouts[0].parts.reverse();
  assert.throws(()=>auditFuriganaLayouts(changedLayout,corpus),/Exact layouts must match/);
  assert.throws(()=>auditFuriganaLayouts({...layouts,sourceHash:'stale'},corpus),/Authored text\/readings changed/);
  assert.throws(()=>auditFuriganaLayouts({...layouts,coverage:{...layouts.coverage,cards:0}},corpus),/Exact layout coverage is stale/);
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
  assert.equal(pkg.scripts['build:furifont'],'node scripts/furigana-corpus.mjs --write-layouts && node scripts/build-furifont.mjs');
});

test('the browser manifest is an exact compact projection of the audited font build',()=>{
  assert.deepEqual(runtimeManifest,createFurifontRuntimeManifest(manifest));
  assert.ok(JSON.stringify(runtimeManifest).length<JSON.stringify(manifest).length/2);
  assert.equal('metadata' in runtimeManifest,false);
  for(const entry of runtimeManifest.entries) {
    assert.deepEqual(Object.keys(entry),['text','reading','families']);
    for(const data of Object.values(entry.families)) {
      assert.ok(Object.keys(data).every(key=>key==='salt'||key==='inkOverhangEm'));
      for(const value of Object.values(data.inkOverhangEm??{}))assert.ok(value>0);
    }
  }
});

test('the Furifont manifest contains exactly the locally reviewed pairs and no dictionary readings',()=>{
  assert.equal(manifest.version,1);
  assert.equal(new Set(manifest.entries.map(key)).size,manifest.entries.length);
  assert.deepEqual(new Set(manifest.entries.map(key)),expected);
  assert.equal(manifest.metadata.source.sha256,sha256(JSON.stringify(corpus.pairs)));
  assert.equal(manifest.metadata.source.lexicalSha256,sha256(JSON.stringify(corpus.lexicalPairs)));
  assert.equal(manifest.metadata.readingSource,'reviewed-local-pairs-only');
  assert.equal(manifest.metadata.dictionaryUsed,false);
  for(const [family,definition]of Object.entries(manifest.families)) {
    const supplied=manifest.entries.filter(entry=>entry.families[family]);
    assert.deepEqual(new Set(supplied.map(key)),family==='display'?new Set(corpus.lexicalPairs.map(key)):expected);
    assert.equal(supplied.length,definition.pairs);
    const perInitial=new Map(),glyphs=new Set();
    for(const row of supplied) {
      assert.match(row.text,/^\p{Script=Han}+$/u,key(row));
      const entry=row.families[family];
      assert.ok(Number.isSafeInteger(entry.salt)&&entry.salt>0,key(row));
      assert.ok(Number.isSafeInteger(entry.glyphId)&&entry.glyphId>0,key(row));
      assert.equal(glyphs.has(entry.glyph),false,`${family}: duplicate glyph`);glyphs.add(entry.glyph);
      for(const edge of ['left','right'])assert.ok(Number.isFinite(entry.inkOverhangEm[edge])&&entry.inkOverhangEm[edge]>=0);
      const initial=[...row.text][0];if(!perInitial.has(initial))perInitial.set(initial,[]);perInitial.get(initial).push(entry.salt);
    }
    for(const [initial,salts]of perInitial)assert.deepEqual([...salts].sort((a,b)=>a-b),Array.from({length:salts.length},(_,index)=>index+1),`${family}: ${initial}`);
  }
});

test('shipped WOFF2 assets match the manifest and the delivered-font audit',()=>{
  assert.deepEqual(Object.keys(manifest.families),['sans','serif','display']);
  const report=JSON.parse(readFileSync(new URL('../public/fonts/furifont/audit.json',import.meta.url)));
  assert.equal(report.ok,true);assert.equal(report.failures,0);assert.equal(report.pairs,expected.size);
  assert.equal(report.sourceSha256,manifest.metadata.source.sha256);
  for(const [name,family]of Object.entries(manifest.families)) {
    assert.match(family.fontUrl,/^fonts\/furifont\/[^?#]+\.woff2$/u);
    const font=readFileSync(new URL(`../public/${family.fontUrl}`,import.meta.url));
    assert.equal(font.subarray(0,4).toString('ascii'),'wOF2');assert.ok(font.length>10000);
    assert.equal(family.sha256,sha256(font));assert.equal(family.bytes,font.length);
    assert.equal(report.families[name].sha256,family.sha256);assert.equal(report.families[name].bytes,font.length);
    assert.equal(report.families[name].pairs,family.pairs);
    assert.equal(report.families[name].shapes,family.pairs*report.families[name].weights.length);
    assert.ok(family.weights[0]<=400&&family.weights[1]>=700);
  }
  assert.equal(manifest.families.sans.metrics.rubyScale,0.5);
  assert.equal(manifest.families.serif.metrics.rubyScale,0.4);
  assert.equal(manifest.families.display.metrics.rubyScale,0.18);
  assert.ok(manifest.families.display.bytes<manifest.families.serif.bytes,'the large prompt font only needs lexical readings');
});

test('build inputs, compiler dependencies, and upstream license notices are pinned',()=>{
  assert.deepEqual(manifest.metadata.compiler,{package:'@furifont/compiler',version:'0.1.2',commit:'e971bb5f0f371355ed3ea0dffcd5df6cf823c2af'});
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
  for(const [name,version]of [['@furifont/compiler','0.1.2'],['@furifont/core','0.1.2'],['harfbuzzjs','1.6.3']])assert.equal(pkg.devDependencies[name],version);
  const dir=new URL('../public/fonts/furifont/',import.meta.url),notice=readFileSync(new URL('NOTICE.txt',dir),'utf8');
  for(const source of Object.values(manifest.metadata.bases)) {
    assert.match(source.sha256,/^[a-f0-9]{64}$/u);assert.match(source.commit,/^[a-f0-9]{40}$/u);
    assert.ok(source.url.includes(source.commit));assert.ok(notice.includes(source.commit));
    assert.match(readFileSync(new URL(source.license,dir),'utf8'),/SIL OPEN FONT LICENSE Version 1\.1/);
  }
  assert.match(readFileSync(new URL('FURIFONT-LICENSE.md',dir),'utf8'),/MIT License/);
  assert.match(notice,/dictionary datasets were not used/);
});
