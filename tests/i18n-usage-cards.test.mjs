import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UsageCardLocaleError,
  applyUsageCardLocale,
  createLocalizedUsageCardLookup,
  loadLocalizedUsageCardLookup,
  loadUsageCardLocale,
  usageCardLocaleIssues,
} from '../app/lib/i18n/usage-card-locales.mjs';
import { USAGE_CARDS, createUsageCardLookup, usageCardFor, usageCardItem } from '../app/lib/usage-cards.mjs';
import {
  contentParityIssues,
  englishUsageCardIssues,
  lexicalMeaningIssues,
  usageCardSourceHash,
} from '../scripts/audit-i18n.mjs';

const canonical = Object.freeze([
  Object.freeze({
    id: 'usage:test', senseId: 'verb:読む:よむ', meaning: '阅读', form: 'masu',
    scene: '中文场景', before: Object.freeze([{text: '新聞を', reading: 'しんぶんを'}]),
    after: Object.freeze([{text: '。'}]), translation: '中文译文。', note: '中文注释', review: 'approved',
  }),
]);
const localized = Object.freeze([Object.freeze({
  id: 'usage:test', sourceHash: 'a'.repeat(64), scene: 'A daily reading habit.',
  translation: 'I read the newspaper every day.', note: 'This form is polite.',
})]);

test('usage-card locale merge is immutable and never retains a Chinese note', () => {
  const cardsBefore = JSON.stringify(canonical);
  const rowsBefore = JSON.stringify(localized);
  const result = applyUsageCardLocale(canonical, 'en', localized);
  assert.notEqual(result, canonical);
  assert.notEqual(result[0], canonical[0]);
  assert.equal(result[0].scene, localized[0].scene);
  assert.equal(result[0].translation, localized[0].translation);
  assert.equal(result[0].note, localized[0].note);
  assert.equal(JSON.stringify(canonical), cardsBefore);
  assert.equal(JSON.stringify(localized), rowsBefore);

  const withoutNote = [{...localized[0]}];
  delete withoutNote[0].note;
  assert.equal(Object.hasOwn(applyUsageCardLocale(canonical, 'en', withoutNote)[0], 'note'), false);
  assert.equal(applyUsageCardLocale(canonical, 'zh-CN', [])[0], canonical[0]);
});

test('English usage cards cannot fall back when an overlay is missing', () => {
  assert.throws(() => applyUsageCardLocale(canonical, 'en', []), error => (
    error instanceof UsageCardLocaleError
      && error.issues.includes('usage:test: missing locale overlay')
  ));
  assert.throws(() => applyUsageCardLocale(canonical, 'fr', localized), UsageCardLocaleError);
});

test('usage-card locale audit reports duplicate, extra, stale, CJK, and schema errors', () => {
  const rows = [
    {...localized[0], sourceHash: 'b'.repeat(64), scene: '残留中文'},
    {...localized[0]},
    {id: 'usage:extra', sourceHash: 'c'.repeat(64), scene: 'Extra.', translation: 'Extra.', extra: true},
  ];
  const issues = usageCardLocaleIssues(rows, {
    canonicalCards: canonical,
    expectedHashes: new Map([['usage:test', 'a'.repeat(64)]]),
    englishOnly: true,
  });
  assert.ok(issues.some(issue => issue.includes('duplicate overlay id')));
  assert.ok(issues.some(issue => issue.includes('extra locale overlay')));
  assert.ok(issues.some(issue => issue.includes('stale sourceHash')));
  assert.ok(issues.some(issue => issue.includes('contains unrecognized Han text')));
  assert.ok(issues.some(issue => issue.includes('unexpected fields')));
});

test('English overlays may name Japanese forms but reject unrelated Han text', () => {
  const row = {...localized[0], scene: 'Use ず in this context.', note: 'The form 来る is irregular.'};
  const allowed = new Map([['usage:test', '来る']]);
  assert.deepEqual(usageCardLocaleIssues([row], {
    canonicalCards: canonical,
    expectedHashes: new Map([['usage:test', 'a'.repeat(64)]]),
    allowedJapaneseById: allowed,
    englishOnly: true,
  }), []);
  assert.ok(usageCardLocaleIssues([{...row, note: '残留中文'}], {
    canonicalCards: canonical,
    allowedJapaneseById: allowed,
    englishOnly: true,
  }).some(issue => issue.includes('unrecognized Han text')));
});

test('canonical source hashes bind overlays to the final displayed card object', () => {
  const card = USAGE_CARDS[0];
  const row = {
    id: card.id,
    sourceHash: usageCardSourceHash(card),
    scene: 'A routine newspaper-reading context.',
    translation: 'I read the newspaper every morning.',
  };
  assert.deepEqual(englishUsageCardIssues([row], [card]), []);
  assert.ok(englishUsageCardIssues([{...row, sourceHash: '0'.repeat(64)}], [card])
    .some(issue => issue.includes('stale sourceHash')));
  assert.ok(englishUsageCardIssues([{...row, translation: 'No final punctuation'}], [card])
    .some(issue => issue.includes('terminal punctuation')));
});

test('lexical meaning audit requires exact English sense coverage', () => {
  const senses = [{id: 'verb:読む:よむ'}, {id: 'verb:書く:かく'}];
  assert.deepEqual(lexicalMeaningIssues({
    'verb:読む:よむ': 'read',
    'verb:書く:かく': 'write',
  }, senses), []);
  const issues = lexicalMeaningIssues({
    'verb:読む:よむ': '阅读',
    extra: 'extra',
  }, senses);
  assert.ok(issues.some(issue => issue.includes('contains CJK text')));
  assert.ok(issues.some(issue => issue.includes('missing English lexical meaning')));
  assert.ok(issues.some(issue => issue.includes('extra English lexical meaning')));
});

test('domain content sidecars cover the same stable IDs in both languages', () => {
  assert.deepEqual(contentParityIssues(), []);
});

test('domain content audit rejects untranslated Han text in English fields', () => {
  const courses = {
    'zh-CN': { sample: { title: '课程', description: '说明' } },
    en: { sample: { title: 'Course', description: '残留中文' } },
  };
  const issues = contentParityIssues({ courses,
    courseStages: { 'zh-CN': {}, en: {} }, forms: { 'zh-CN': {}, en: {} },
    knowledgeFamilies: { 'zh-CN': {}, en: {} }, semantics: { 'zh-CN': {}, en: {} },
    lexicon: { 'zh-CN': {}, en: {} } });
  assert.ok(issues.some(issue => issue.includes('English description contains Han text for sample')));
});

test('English usage overlays use a separate lazy module', async () => {
  assert.equal(await loadUsageCardLocale('zh-CN'), null);
  const english = await loadUsageCardLocale('en');
  assert.ok(Array.isArray(english));
});

test('canonical lookup validates only requested cards and caches resolved Japanese targets', () => {
  const source = USAGE_CARDS[0];
  let sentenceReads = 0;
  const card = {...source, get before() { sentenceReads += 1; return source.before; }};
  const lookup = createUsageCardLookup([card]);
  assert.equal(sentenceReads, 0, 'startup must not parse the complete sentence catalog');
  const item = usageCardItem(card.senseId);
  const result = lookup(item, card.form);
  assert.ok(result?.target.text);
  assert.ok(sentenceReads > 0, 'requested cards still undergo the runtime guard');
  const afterFirst = sentenceReads;
  assert.equal(lookup(item, card.form), result);
  assert.equal(sentenceReads, afterFirst, 'repeat lookup must reuse validation and Japanese derivation');
  assert.equal(lookup(item, null), null);
  const invalidLookup = createUsageCardLookup([{...source, translation: ''}]);
  assert.equal(invalidLookup(item, source.form), null, 'lazy lookup must still reject invalid cards');
});

test('English lookup reuses resolved Japanese and never runs Chinese editorial rules on English prose', () => {
  const source = USAGE_CARDS[0];
  const item = usageCardItem(source.senseId);
  const canonicalLookup = createUsageCardLookup([source]);
  const original = canonicalLookup(item, source.form);
  const overlay = {id: source.id, sourceHash: usageCardSourceHash(source),
    scene: 'A detailed English scene that is longer than the Chinese thirty-two-character editorial limit.',
    translation: 'The speaker describes the situation.', note: 'The Japanese form stays the same.'};
  const lookup = createLocalizedUsageCardLookup([source], canonicalLookup, 'en', [overlay]);
  const localized = lookup(item, source.form);
  assert.equal(localized.scene, overlay.scene);
  for (const key of ['before', 'after', 'target']) assert.equal(localized[key], original[key]);
  assert.equal(lookup(item, source.form), localized);
  assert.equal(original.scene, source.scene);
  assert.equal(createLocalizedUsageCardLookup([source], canonicalLookup, 'zh-CN', []), canonicalLookup);
  assert.throws(() => createLocalizedUsageCardLookup([source], canonicalLookup, 'en', []), UsageCardLocaleError);
  const withoutNote = {...overlay}; delete withoutNote.note;
  assert.equal(Object.hasOwn(createLocalizedUsageCardLookup([source], canonicalLookup, 'en', [withoutNote])(item, source.form), 'note'), false);
});

test('English lookup is cached across locale switches and preserves every active card', async () => {
  const first = loadLocalizedUsageCardLookup(USAGE_CARDS, usageCardFor, 'en');
  assert.equal(loadLocalizedUsageCardLookup(USAGE_CARDS, usageCardFor, 'en-US'), first);
  const lookup = await first;
  assert.equal(await loadLocalizedUsageCardLookup(USAGE_CARDS, usageCardFor, 'zh-CN'), usageCardFor);
  assert.equal(await loadLocalizedUsageCardLookup(USAGE_CARDS, usageCardFor, 'en'), lookup);
  const overlays = new Map((await loadUsageCardLocale('en')).map(row => [row.id, row]));
  for (const card of USAGE_CARDS) {
    const item = usageCardItem(card.senseId);
    const localized = lookup(item, card.form);
    assert.equal(localized?.id, card.id, card.id);
    assert.equal(localized.scene, overlays.get(card.id).scene, card.id);
    assert.equal(localized.translation, overlays.get(card.id).translation, card.id);
    assert.equal(localized.target, usageCardFor(item, card.form).target, card.id);
  }
});

