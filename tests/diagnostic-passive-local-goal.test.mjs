import assert from 'node:assert/strict';
import test from 'node:test';
import {createAnswerAnalyzer} from '../app/lib/answer-analysis.mjs';
import {formatDiagnosticMessage} from '../app/lib/i18n/diagnostics.mjs';

const item = {domain: 'verb', surface: '騒ぐ', reading: 'さわぐ', class: 'godan'};
const copy = (step, field, locale) => {
  const descriptor = step.i18n[field];
  return formatDiagnosticMessage(descriptor.messageKey, descriptor.params, locale);
};

for (const [form, wrong] of [
  ['passive', '騒ぎられる'],
  ['passiveDesireNegativePast', 'さわぎられたくなかった'],
]) {
  test(`the legacy ${form} route names the stem and attachment as separate local goals`, () => {
    const [stem, attachment] = createAnswerAnalyzer(item, form)(wrong).steps;
    assert.equal(stem.kind, 'stem');
    assert.equal(stem.focusId, 'stem.godan.a');
    assert.deepEqual(stem.kcIds, ['stem.godan.a']);
    assert.equal(stem.continuation, false);
    assert.deepEqual(stem.answers, ['騒が']);
    assert.deepEqual(stem.readings, ['さわが']);
    assert.equal(attachment.kind, 'attachment');
    assert.equal(attachment.focusId, 'suffix.passive');
    assert.deepEqual(attachment.kcIds, ['suffix.passive']);
    assert.equal(attachment.continuation, true);
    assert.deepEqual(attachment.providedAnswers, ['騒が', 'さわが']);
    assert.deepEqual(attachment.answers, ['騒がれる']);
    for (const locale of ['zh-CN', 'en']) {
      const title = copy(stem, 'stepTitle', locale);
      const target = copy(stem, 'targetLabel', locale);
      const prompt = copy(stem, 'prompt', locale);
      assert.equal(target, title);
      assert.match(title, locale === 'en' ? /stem/i : /词干/);
      assert.doesNotMatch(title, /passive|受身形/);
      assert.match(prompt, locale === 'en' ? /Do not add “れる” yet/ : /不要接「れる」/);
      assert.match(copy(attachment, 'stepTitle', locale), locale === 'en' ? /passive ending/ : /受身词尾/);
      assert.match(copy(attachment, 'prompt', locale), locale === 'en' ? /given form|full result/i : /给定形式|完整/);
      for (const step of [stem, attachment]) {
        const instructions = ['stepTitle', 'targetLabel', 'prompt'].map(field => copy(step, field, locale)).join('\n');
        for (const answer of [...step.answers, ...step.readings]) assert.ok(!instructions.includes(answer));
      }
    }
    assert.equal(createAnswerAnalyzer(item, form, {step: stem})('騒が').kind, 'correct');
    assert.notEqual(createAnswerAnalyzer(item, form, {step: stem})('騒がれる').kind, 'correct');
    assert.equal(createAnswerAnalyzer(item, form, {step: attachment})('騒がれる').kind, 'correct');
    assert.notEqual(createAnswerAnalyzer(item, form, {step: attachment})('騒が').kind, 'correct');
  });
}
