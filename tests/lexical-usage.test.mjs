import test from 'node:test';
import assert from 'node:assert/strict';
import { assessFormUsage, eligibleVerbForm, supportsVerbForm, supportsAdjectiveForm, USAGE_REVIEW_VERSION, verbUsageFamily } from '../app/lib/form-eligibility.mjs';
import { REVIEWED_VERB_SENSES, REVIEWED_ADJECTIVE_SENSES, REVIEWED_LEXICAL_SENSES, reviewedLexicalSense } from '../app/lib/lexical-usage.mjs';
import { ADJECTIVES } from '../app/lib/adjective-catalog.mjs';
import { FORM_LABELS } from '../app/lib/form-labels.mjs';
const word = surface => REVIEWED_LEXICAL_SENSES.find(item => item.surface === surface);
const usage = (surface, form) => assessFormUsage(word(surface), form);
const available = (surface, form) => eligibleVerbForm(word(surface), form);

test('all 156 verb and 91 adjective senses are explicitly reviewed, without a permissive unknown-word fallback', () => {
  assert.equal(REVIEWED_VERB_SENSES.length, 156);
  assert.equal(REVIEWED_ADJECTIVE_SENSES.length, 91);
  assert.equal(new Set(REVIEWED_LEXICAL_SENSES.map(item => item.id)).size, 247);
  for (const item of REVIEWED_LEXICAL_SENSES) {
    assert.ok(item.reading && item.meaning && item.profile && item.id);
    assert.equal(item.reviewVersion, USAGE_REVIEW_VERSION);
    assert.equal(reviewedLexicalSense(item), item);
    assert.equal(assessFormUsage(item, null).status, 'allowed', item.surface);
  }
  for (const item of ADJECTIVES) assert.ok(reviewedLexicalSense(item), item.surface);
  for (const item of [
    { domain: 'verb', surface: '試す', reading: 'ためす', class: 'godan', meaning: '尝试' },
    { ...word('開く'), reading: 'ひらく' },
    { ...word('開く'), meaning: '开设；举办' },
    { ...word('帰る'), class: 'ichidan' },
  ]) {
    assert.equal(assessFormUsage(item, 'negative').reasonCode, 'unreviewed-lexeme');
    assert.equal(eligibleVerbForm(item, 'negative'), false);
  }
  assert.equal(eligibleVerbForm(word('書く'), 'futureUnknownForm'), false);
});

test('hard morphology limits are separate from semantic and contextual teaching decisions', () => {
  assert.equal(supportsVerbForm(word('食べる'), 'causativePassiveContracted'), false);
  assert.equal(supportsVerbForm(word('話す'), 'causativePassiveContracted'), false);
  assert.equal(supportsVerbForm(word('書く'), 'causativePassiveContracted'), true);
  assert.equal(usage('食べる', 'causativePassiveContracted').category, 'morphology');
  assert.equal(supportsVerbForm(word('降る'), 'tai'), true);
  assert.equal(usage('降る', 'tai').status, 'blocked');
  assert.equal(usage('降る', 'tai').category, 'semantic');
  assert.equal(supportsVerbForm(word('開く'), 'tearu'), true);
  assert.equal(usage('開く', 'tearu').reasonCode, 'tearu-intransitive-sense');
  assert.equal(usage('咲く', 'volitional').status, 'context-required');
  assert.equal(usage('咲く', 'volitional').context, undefined);
  assert.equal(available('咲く', 'volitional'), false);
  assert.equal(usage('降る', 'passive').status, 'context-required');
  assert.ok(usage('降る', 'passive').context);
  assert.equal(available('降る', 'passive'), true);
  assert.equal(supportsVerbForm({ domain: 'verb', surface: '借りてある', reading: 'かりてある', class: 'godan', tailClass: 'aru' }, 'negative'), true);
});

test('nonvolitional is not a universal ban: wishes, passive adversity, aspect and event hopes have independent rules', () => {
  for (const [surface, form] of [
    ['分かる', 'tai'], ['知る', 'tagaru'], ['忘れる', 'tai'], ['喜ぶ', 'tai'],
    ['変わる', 'tai'], ['眠る', 'tai'], ['寝る', 'potential'],
    ['降る', 'tehoshii'], ['咲く', 'tehoshii'], ['咲く', 'youtosuru'],
    ['降る', 'passive'], ['死ぬ', 'passive'], ['泣く', 'passive'], ['咲く', 'causative'],
    ['増える', 'teiku'], ['壊れる', 'teshimau'], ['死ぬ', 'teiru'],
    ['いる', 'potential'], ['いる', 'causativePassive'], ['いる', 'tagaru'],
  ]) assert.equal(available(surface, form), true, `${surface}/${form}`);
  for (const [surface, form] of [
    ['降る', 'tagaru'], ['咲く', 'imperative'], ['できる', 'potential'],
    ['いる', 'teiru'], ['要る', 'teoru'], ['要る', 'tehoshii'],
    ['知る', 'nagara'], ['分かる', 'tsutsu'], ['終わる', 'nagara'], ['着く', 'tsutsu'],
    ['間に合う', 'temiru'], ['生まれる', 'causative'],
    ['咲く', 'youtosuruNegative'], ['降る', 'youtosuruNegativePast'],
  ]) assert.equal(available(surface, form), false, `${surface}/${form}`);
  assert.equal(available('死ぬ', 'te'), true, 'keep the only ぬ-ending example for ordinary conjugation');
  assert.equal(available('死ぬ', 'past'), true);
  assert.equal(available('咲く', 'youtosuruPast'), true);
});

test('intentional completion tearu is not restricted to visible changes in objects', () => {
  assert.equal(usage('開ける', 'tearu').status, 'allowed');
  assert.equal(usage('置く', 'tearu').status, 'allowed');
  for (const surface of ['読む', '話す', '調べる', '待つ']) {
    const result = usage(surface, 'tearu');
    assert.equal(result.status, 'context-required');
    assert.ok(result.context);
    assert.equal(available(surface, 'tearu'), true);
  }
  assert.equal(available('忘れる', 'tearu'), false);
  assert.equal(available('信じる', 'tearu'), false);
  assert.equal(available('開く', 'tearu'), false);
});

test('continuations and contractions inherit the reviewed family without requiring intentional intermediates', () => {
  for (const [surface, base, forms] of [
    ['降る', 'tehoshii', ['tehoshiiPast', 'tehoshiiNegative', 'tehoshiiNegativePast']],
    ['降る', 'passive', ['passivePast', 'passiveNegative', 'passiveNegativePast']],
    ['読む', 'tearu', ['tearuPast', 'tearuNegative', 'tearuNegativePast']],
    ['いる', 'teiru', ['teiruPast', 'teiruNegative', 'teru']],
    ['書く', 'teoku', ['teokuNegativePast', 'toku']],
    ['要る', 'tehoshii', ['tehoshiiPast', 'tehoshiiNegative', 'tehoshiiNegativePast']],
  ]) for (const form of forms) {
    assert.equal(verbUsageFamily(form), base);
    assert.deepEqual(usage(surface, form), usage(surface, base), `${surface}/${form}`);
  }
  for (const [surface, form] of [['読む', 'temiruDesirePast'], ['書く', 'passiveProgressivePast'], ['行く', 'causativeReceivePast'], ['待つ', 'passiveDesireNegativePast']]) {
    assert.equal(available(surface, form), true);
    assert.equal(supportsVerbForm(word(surface), form), true);
  }
  for (const form of ['temiruDesirePast', 'passiveProgressivePast', 'causativeReceivePast', 'passiveDesireNegativePast']) {
    assert.equal(available('咲く', form), false, form);
    assert.equal(supportsVerbForm(word('咲く'), form), true, 'recognition retains structurally supported combinations');
  }
});

test('adjective classes and sense-specific attributive or adverbial uses are reviewed too', () => {
  assert.equal(supportsAdjectiveForm(word('高い'), 'adjectiveNaPast'), false);
  assert.equal(supportsAdjectiveForm(word('静か'), 'adjectivePast'), false);
  assert.equal(usage('高い', 'adjectiveNaPast').category, 'morphology');
  assert.equal(usage('普通', 'adjectiveAttributive').status, 'blocked');
  assert.equal(usage('普通', 'adjectiveAttributive').category, 'semantic');
  for (const form of ['adjectivePredicative', 'adjectiveNaPast', 'adjectiveNaNegative', 'adjectiveNaTe']) assert.equal(available('普通', form), true);
  for (const surface of ['好き', '嫌い', '欲しい', '心配', '可能']) {
    assert.equal(usage(surface, 'adjectiveAdverb').status, 'context-required');
    assert.match(usage(surface, 'adjectiveAdverb').context.text, /状态变化/);
    assert.equal(available(surface, 'adjectiveAdverb'), true);
  }
  for (const surface of ['早い', '静か', '丁寧']) assert.equal(usage(surface, 'adjectiveAdverb').status, 'allowed');
});

test('every reviewed word/form decision has a reason; teaching contexts give roles without Japanese answers or forced tense/polarity', () => {
  const statuses = new Set(), categories = new Set(), contexts = new Map();
  for (const item of REVIEWED_LEXICAL_SENSES) for (const form of Object.keys(FORM_LABELS)) {
    const result = assessFormUsage(item, form);
    statuses.add(result.status); categories.add(result.category);
    assert.equal(result.reviewVersion, USAGE_REVIEW_VERSION);
    assert.ok(result.reason.length > 5);
    assert.equal(eligibleVerbForm(item, form), result.status === 'allowed' || (result.status === 'context-required' && Boolean(result.context)));
    if (result.context) {
      assert.equal(result.status, 'context-required');
      assert.ok(result.context.id && result.context.text);
      assert.doesNotMatch(result.context.text, /[ぁ-ゖァ-ヺ]/, result.context.text);
      assert.doesNotMatch(result.context.text, /已经|过去|曾经|从来|没有|尚未|了[。，]/, result.context.text);
      if (contexts.has(result.context.id)) assert.equal(contexts.get(result.context.id), result.context.text);
      contexts.set(result.context.id, result.context.text);
    }
  }
  assert.deepEqual(statuses, new Set(['allowed', 'blocked', 'context-required']));
  assert.deepEqual(categories, new Set(['semantic', 'morphology', 'context']));
  assert.ok(contexts.size > 50);
});
