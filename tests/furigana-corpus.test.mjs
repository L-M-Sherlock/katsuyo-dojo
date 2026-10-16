import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import layouts from '../app/data/furigana-layouts.json' with {type: 'json'};
import {alignFuriganaParts, furiganaPairKey, isFuriganaHanGroup, knownFuriganaPairs, splitFuriganaParts} from '../app/lib/furigana-corpus.mjs';
import {getFuriganaCorpus, getFuriganaPairs, getLexicalFuriganaPairs} from '../scripts/furigana-corpus.mjs';
import {USAGE_CARDS} from '../app/lib/usage-cards.mjs';

const normalized = text => text.normalize('NFKC').replace(/[ァ-ヶ]/gu, char => String.fromCharCode(char.charCodeAt(0) - 0x60))
  .replace(/\s/gu, '').replace(/,/gu, '、').replace(/\./gu, '。').replace(/[、。!?「」『』()：:；;]/gu, '');

test('splits kana anchors while preserving supplied conjugated readings', () => {
  for (const [text, reading, head] of [['来る', 'くる', 'く'], ['来た', 'きた', 'き'], ['来ない', 'こない', 'こ'], ['来れば', 'くれば', 'く']]) {
    assert.deepEqual(splitFuriganaParts({text, reading}), [{text: '来', reading: head}, {text: text.slice(1)}]);
  }
  assert.deepEqual(splitFuriganaParts({text: 'パーティーで歌う。', reading: 'パーティーでウタう。'}), [
    {text: 'パーティーで'}, {text: '歌', reading: 'ウタ'}, {text: 'う。'},
  ]);
  assert.deepEqual(splitFuriganaParts({text: '人々', reading: 'ひとびと'}), [{text: '人々', reading: 'ひとびと'}]);
});

test('retains whole authored ruby when kana boundaries are ambiguous', () => {
  const part = {text: '母は傷んだ', reading: 'はははいたんだ'};
  assert.equal(alignFuriganaParts(part), null);
  assert.deepEqual(splitFuriganaParts({text: '旧母は傷んだ', reading: 'はははいたんだ'}), [{text: '旧母は傷んだ', reading: 'はははいたんだ'}]);
  const known = knownFuriganaPairs([{text: '母', reading: 'はは'}, {text: '傷', reading: 'いた'}]);
  assert.deepEqual(alignFuriganaParts(part, known), [
    {text: '母', reading: 'はは'}, {text: 'は'}, {text: '傷', reading: 'いた'}, {text: 'んだ'},
  ]);
  const noSeparator = {text: '甲、乙', reading: 'あいう'};
  assert.equal(alignFuriganaParts(noSeparator), null);
  assert.deepEqual(splitFuriganaParts(noSeparator), [noSeparator]);
});

test('current sentence, lexical, answer, and diagnostic corpus is completely covered', () => {
  const corpus = getFuriganaCorpus();
  assert.equal(corpus.coverage.cards, USAGE_CARDS.length);
  assert.equal(corpus.coverage.sourcePairs, corpus.sources.length);
  assert.equal(corpus.coverage.direct + corpus.coverage.constrained + corpus.coverage.audited + corpus.coverage.fallbacks, corpus.sources.length);
  assert.deepEqual(corpus.extractionErrors, []);
  assert.deepEqual(corpus.fallbacks, []);
  assert.ok(corpus.unsupportedPairs.length > 0);
  assert.ok(corpus.sources.some(row => row.sources.some(source => source.includes(':diagnostic:'))));
  assert.ok(corpus.sources.some(row => row.sources.some(source => source.includes(':detail:'))));
  assert.ok(corpus.sources.some(row => row.sources.some(source => source.includes(':variant:'))));
  const pairs = new Set(getFuriganaPairs().map(furiganaPairKey));
  for (const row of corpus.sources) {
    const parts = splitFuriganaParts(row);
    assert.equal(parts.map(part => part.text).join(''), row.text, row.text);
    assert.equal(normalized(parts.map(part => part.reading ?? part.text).join('')), normalized(row.reading), `${row.text}: reading changed`);
    for (const part of parts) if (part.reading) {
      assert.ok(isFuriganaHanGroup(part.text), `${row.text}: native ruby fallback`);
      assert.ok(pairs.has(furiganaPairKey(part)), `${row.text}: missing compiled pair`);
    }
  }
  for (const pair of getLexicalFuriganaPairs()) assert.ok(pairs.has(furiganaPairKey(pair)));
  for (const reading of ['く', 'き', 'こ']) assert.ok(pairs.has(furiganaPairKey({text: '来', reading})));
});

test('generated exact layouts match current source readings and deterministic alignment', () => {
  const corpus = getFuriganaCorpus();
  const expected = [...corpus.constrained, ...corpus.audited].map(({text, reading, parts}) => ({text, reading, parts}))
    .sort((a, b) => a.text < b.text ? -1 : a.text > b.text ? 1 : a.reading < b.reading ? -1 : a.reading > b.reading ? 1 : 0);
  assert.deepEqual(layouts.layouts, expected);
  assert.deepEqual(layouts.coverage, corpus.coverage);
  const sourceHash = createHash('sha256').update(JSON.stringify(corpus.sources.map(({text, reading}) => ({text, reading})))).digest('hex');
  assert.equal(layouts.sourceHash, sourceHash);
  assert.ok(corpus.constrained.length > 500);
  assert.equal(corpus.audited.length, 2);
});
