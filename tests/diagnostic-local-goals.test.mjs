import assert from 'node:assert/strict';
import test from 'node:test';
import {createAnswerAnalyzer} from '../app/lib/answer-analysis.mjs';
import {atomicSteps, buildDiagnosticPlan} from '../app/lib/diagnostic-plan.mjs';
import {formatDiagnosticMessage} from '../app/lib/i18n/diagnostics.mjs';
import {formLabel} from '../app/lib/i18n/content-forms.mjs';
import {UNIFIED_COURSES} from '../app/lib/unified-curriculum.mjs';

const verb = (surface, reading, verbClass) => ({domain: 'verb', surface, reading, class: verbClass});
const write = verb('書く', 'かく', 'godan');
const high = {domain: 'adjective', surface: '高い', reading: 'たかい', class: 'i'};
const copy = (step, field, locale = 'en') => {
  const descriptor = step.i18n[field];
  return formatDiagnosticMessage(descriptor.messageKey, descriptor.params, locale);
};
const atoms = (item, form) => {
  const plan = buildDiagnosticPlan(item, form);
  return atomicSteps(plan, form, [...new Set(plan.nodes.flatMap(node => node.ruleKcIds))]);
};
const instruction = (step, locale = 'en') => ['stepTitle', 'targetLabel', 'prompt']
  .map(field => copy(step, field, locale)).join('\n');

test('a complete ます-form and a ます-stem are different requests for every verb class', () => {
  for (const [item, stem, polite] of [
    [verb('脱ぐ', 'ぬぐ', 'godan'), '脱ぎ', '脱ぎます'],
    [verb('食べる', 'たべる', 'ichidan'), '食べ', '食べます'],
    [verb('来る', 'くる', 'irregular'), '来', '来ます'],
    [verb('する', 'する', 'irregular'), 'し', 'します'],
    [verb('勉強する', 'べんきょうする', 'irregular'), '勉強し', '勉強します'],
  ]) {
    const fullQuestion = createAnswerAnalyzer(item, 'masu');
    assert.equal(fullQuestion(polite).kind, 'correct', item.surface);
    assert.notEqual(fullQuestion(stem).kind, 'correct', item.surface);
    const [preparation, attachment] = atoms(item, 'masu');
    assert.deepEqual(preparation.answers, [stem]);
    assert.equal(copy(preparation, 'stepTitle'), 'Write the ます-stem');
    assert.doesNotMatch(instruction(preparation), /ます-form/u);
    assert.match(copy(preparation, 'prompt'), /Do not add “ます” yet/u);
    assert.match(copy(preparation, 'stepTitle', 'zh-CN'), /词干.*不含ます/u);
    assert.equal(createAnswerAnalyzer(item, 'masu', {step: preparation})(stem).kind, 'correct');
    assert.notEqual(createAnswerAnalyzer(item, 'masu', {step: preparation})(polite).kind, 'correct');
    assert.equal(copy(attachment, 'stepTitle'), 'Write the complete ます-form');
    assert.match(copy(attachment, 'prompt'), /Add “ます” to the given stem/u);
    assert.match(copy(attachment, 'stepTitle', 'zh-CN'), /完整ます形.*包含ます/u);
    assert.equal(createAnswerAnalyzer(item, 'masu', {step: attachment})(polite).kind, 'correct');
    assert.notEqual(createAnswerAnalyzer(item, 'masu', {step: attachment})(stem).kind, 'correct');
  }
});

test('compound stem preparation keeps the complete given prefix and excludes the later ending', () => {
  for (const [item, form, source, expected, later] of [
    [verb('脱ぐ', 'ぬぐ', 'godan'), 'masuNegativePast', '脱ぐ', '脱ぎ', 'ます'],
    [verb('来る', 'くる', 'irregular'), 'temiruDesirePast', '来てみる', '来てみ', 'たい'],
    [verb('勉強する', 'べんきょうする', 'irregular'), 'taiNegativePast', '勉強する', '勉強し', 'たい'],
  ]) {
    const step = atoms(item, form).find(value => value.surface === source);
    assert.ok(step, `${source}/${form}`);
    assert.deepEqual(step.answers, [expected]);
    assert.equal(copy(step, 'stepTitle'), 'Write the ます-stem');
    assert.ok(copy(step, 'prompt').includes(`Do not add “${later}” yet`));
    assert.doesNotMatch(instruction(step), /negative past|trying \+ desire/u);
    assert.equal(createAnswerAnalyzer(item, form, {step})(expected).kind, 'correct');
    assert.notEqual(createAnswerAnalyzer(item, form, {step})(expected + later).kind, 'correct');
  }
});

test('a-row, e-row and o-row preparation asks for a stem rather than the full target form', () => {
  for (const [form, expected, ending] of [
    ['negative', '書か', 'ない'], ['passive', '書か', 'れる'],
    ['potential', '書け', 'る'], ['volitional', '書こ', 'う'],
    ['causative', '書か', 'せる'],
  ]) {
    const step = atoms(write, form)[0];
    assert.deepEqual(step.answers, [expected]);
    assert.equal(copy(step, 'stepTitle'), `Write the stem before “${ending}”`);
    assert.ok(copy(step, 'prompt').includes(`Do not add “${ending}” yet`));
    assert.match(copy(step, 'prompt'), /complete stem/u);
    assert.ok(!instruction(step).includes(formLabel('en', form)), form);
    assert.ok(!instruction(step, 'zh-CN').includes(formLabel('zh-CN', form)), form);
    assert.equal(createAnswerAnalyzer(write, form, {step})(expected).kind, 'correct');
    assert.notEqual(createAnswerAnalyzer(write, form, {step})(expected + ending).kind, 'correct');
  }
});

test('sound preparation stops before the ending and the attachment still tests the voiced choice', () => {
  const read = verb('読む', 'よむ', 'godan');
  for (const [form, expected, final, wrong] of [
    ['past', '読ん', '読んだ', '読んた'], ['te', '読ん', '読んで', '読んて'],
  ]) {
    const [preparation, attachment] = atoms(read, form);
    assert.deepEqual(preparation.answers, [expected]);
    assert.match(copy(preparation, 'prompt'), /sound change/u);
    assert.doesNotMatch(copy(preparation, 'prompt'), /plain past:|て-form:/u);
    assert.equal(createAnswerAnalyzer(read, form, {step: preparation})(expected).kind, 'correct');
    assert.notEqual(createAnswerAnalyzer(read, form, {step: preparation})(final).kind, 'correct');
    // Naming the exact voiced ending here would supply the choice being assessed.
    assert.doesNotMatch(copy(attachment, 'prompt'), /Add “[だで]”/u);
    assert.equal(createAnswerAnalyzer(read, form, {step: attachment})(final).kind, 'correct');
    assert.notEqual(createAnswerAnalyzer(read, form, {step: attachment})(wrong).kind, 'correct');
  }
});

test('adjective preparation and attachments describe only the characters still required', () => {
  for (const [form, ending, full] of [
    ['adjectiveNegative', 'ない', '高くない'], ['adjectiveTe', 'て', '高くて'],
  ]) {
    const [preparation, attachment] = atoms(high, form);
    assert.deepEqual(preparation.answers, ['高く']);
    assert.equal(copy(preparation, 'stepTitle'), 'Change final い to く');
    assert.ok(copy(preparation, 'prompt').includes(`Do not add “${ending}” yet`));
    assert.doesNotMatch(instruction(preparation), /adjective negative|adjective て-form/u);
    assert.doesNotMatch(instruction(attachment), /Attach くて|Attach くない|Add “くて”|Add “くない”/u);
    assert.equal(createAnswerAnalyzer(high, form, {step: preparation})('高く').kind, 'correct');
    assert.notEqual(createAnswerAnalyzer(high, form, {step: preparation})(full).kind, 'correct');
    assert.equal(createAnswerAnalyzer(high, form, {step: attachment})(full).kind, 'correct');
    assert.notEqual(createAnswerAnalyzer(high, form, {step: attachment})('高くく' + ending).kind, 'correct');
  }
});

test('a て-based attachment requests みる after the supplied て-form without repeating て', () => {
  const step = atoms(write, 'temiruDesirePast').find(value => value.surface === '書いて');
  assert.deepEqual(step.answers, ['書いてみる']);
  assert.equal(copy(step, 'stepTitle'), 'Add “みる”');
  assert.match(copy(step, 'prompt'), /Add “みる” to the given form/u);
  assert.doesNotMatch(instruction(step), /Add “てみる”|trying \+ desire|past/u);
  assert.equal(createAnswerAnalyzer(write, 'temiruDesirePast', {step})('書いてみる').kind, 'correct');
  assert.notEqual(createAnswerAnalyzer(write, 'temiruDesirePast', {step})('書いててみる').kind, 'correct');
});

test('the いい-family preparation names the local よ-form rather than the final negative past', () => {
  const good = {domain: 'adjective', surface: 'いい', reading: 'いい', class: 'i', iiFamily: true};
  const step = atoms(good, 'adjectiveNegativePast')[0];
  assert.deepEqual(step.answers, ['よい']);
  assert.match(copy(step, 'stepTitle'), /よ-form/u);
  assert.doesNotMatch(instruction(step), /negative past/u);
  assert.doesNotMatch(instruction(step, 'zh-CN'), /否定过去/u);
  assert.equal(createAnswerAnalyzer(good, 'adjectiveNegativePast', {step})('よい').kind, 'correct');
  assert.notEqual(createAnswerAnalyzer(good, 'adjectiveNegativePast', {step})('よくなかった').kind, 'correct');
});

test('all 170 forms render local bilingual instructions without requesting a later whole answer', () => {
  const verbs = [write, verb('食べる', 'たべる', 'ichidan'), verb('来る', 'くる', 'irregular')];
  const adjectives = [high, {...high, surface: 'いい', reading: 'いい', iiFamily: true},
    {domain: 'adjective', surface: '静か', reading: 'しずか', class: 'na'}];
  const forms = new Map(UNIFIED_COURSES.flatMap(course => course.forms.map(form => [form, course])));
  let checked = 0;
  for (const [form, course] of forms) for (const item of course.domain === 'verb' ? verbs : adjectives) {
    if (form === 'causativePassiveContracted' && item.class !== 'godan') continue;
    if (item.domain === 'adjective' && !['adjectiveAdverb', 'adjectiveBa'].includes(form)
      && (item.class === 'na') !== ['adjectiveAttributive', 'adjectivePredicative', 'adjectiveNaNegative',
        'adjectiveNaPast', 'adjectiveNaNegativePast', 'adjectiveNaTe'].includes(form)) continue;
    const plan = buildDiagnosticPlan(item, form);
    for (const step of atomicSteps(plan, form, plan.nodes.flatMap(node => node.ruleKcIds))) {
      for (const field of ['goalLabel', 'stepTitle', 'targetLabel', 'prompt', 'note']) {
        assert.equal(copy(step, field, 'zh-CN'), step[field], `${item.surface}/${form}/${field}`);
        assert.ok(copy(step, field).trim(), `${item.surface}/${form}/${field}`);
      }
      const english = instruction(step);
      assert.doesNotMatch(english, /[\u3400-\u9fff]|undefined|\{\w+\}/u, `${item.surface}/${form}`);
      if (!step.answers.some(answer => plan.acceptedVariants.includes(answer))) {
        assert.ok(!copy(step, 'prompt').startsWith(`Write the ${formLabel('en', form)}.`), `${item.surface}/${form}`);
      }
      checked++;
    }
  }
  assert.equal(forms.size, 170);
  assert.ok(checked > 1000, checked);
});
