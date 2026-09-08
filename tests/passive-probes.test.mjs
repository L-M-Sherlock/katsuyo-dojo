import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { unifiedDiagnosticSteps } from '../app/lib/unified-knowledge.mjs';

const word = { domain: 'verb', class: 'godan', surface: '騒ぐ', reading: 'さわぐ' };
const form = 'passiveDesireNegativePast';

test('a localized passive error opens independent stem, attachment, desire and ending probes', () => {
  for (const input of ['騒ぎられたくなかった', 'さわぎられたくなかった']) {
    const result = createAnswerAnalyzer(word, form)(input);
    assert.equal(result.diagnosis.stage.form, 'passive');
    assert.equal(result.diagnosis.kcId, null);
    assert.deepEqual(result.diagnosis.confirmedKcIds, []);
    assert.deepEqual(result.steps.map(step => step.surface), ['騒ぐ', '騒が', '騒がれる', '騒がれたい']);
    assert.deepEqual(result.steps.map(step => step.answers[0]), ['騒が', '騒がれる', '騒がれたい', '騒がれたくなかった']);
    assert.deepEqual(result.steps.map(step => step.readings[0]), ['さわが', 'さわがれる', 'さわがれたい', 'さわがれたくなかった']);
    assert.deepEqual(result.steps[0].kcIds, ['stem.godan.a']);
    assert.deepEqual(result.steps[1].kcIds, ['suffix.passive']);
    for (const step of result.steps) {
      assert.equal(createAnswerAnalyzer(word, step.form, { step })(step.answers[0]).kind, 'correct');
      assert.equal(createAnswerAnalyzer(word, step.form, { step })(step.readings[0]).kind, 'correct');
    }
  }
});

test('provided passive substeps isolate one failed rule without class or earlier-step evidence', () => {
  const [stem, attachment] = createAnswerAnalyzer(word, form)('さわぎられたくなかった').steps;
  for (const [step, input, failed] of [[stem, 'さわぎ', 'stem.godan.a'], [attachment, 'さわがられる', 'suffix.passive'], [attachment, 'さわが', 'suffix.passive']]) {
    const result = createAnswerAnalyzer(word, step.form, { step })(input);
    assert.equal(result.diagnosis.kcId, failed);
    assert.deepEqual(result.diagnosis.confirmedKcIds, []);
  }
  for (const [step, input] of [[stem, 'さわぎら'], [attachment, 'さわぎられる']]) {
    assert.equal(createAnswerAnalyzer(word, step.form, { step })(input).diagnosis, null);
  }
  const buy = { domain: 'verb', class: 'godan', surface: '買う', reading: 'かう' };
  const first = createAnswerAnalyzer(buy, form)('かいられたくなかった').steps[0];
  assert.equal(createAnswerAnalyzer(buy, first.form, { step: first })('かあ').diagnosis.kcId, 'stem.godan.u-wa');
  assert.equal(createAnswerAnalyzer(buy, first.form, { step: first })('かい').diagnosis.kcId, 'stem.godan.a');
});

test('unknown multi-step answers retain all three goals and never grade independent chaining from guidance', () => {
  for (const item of [word, { domain: 'verb', class: 'ichidan', surface: '食べる', reading: 'たべる' }, { domain: 'verb', class: 'irregular', surface: '来る', reading: 'くる' }]) {
    const steps = unifiedDiagnosticSteps(item, form);
    assert.deepEqual(steps.map(step => step.form), ['passive', 'tai', 'taiNegativePast']);
    assert.match(steps[1].targetLabel, /たい/);
    assert.match(steps[2].targetLabel, /たい.*否定过去/);
    const ids = steps.flatMap(step => step.kcIds);
    assert.equal(ids.length, new Set(ids).size);
    assert.equal(ids.includes('compound.multi-step'), false);
    assert.equal(steps[2].kcIds.includes('construction.tai'), false);
    for (const step of steps) assert.equal(createAnswerAnalyzer(item, step.form, { step })(step.readings[0]).kind, 'correct');
  }
});

test('completed passive and desire intermediates skip precisely the work already observed', () => {
  for (const [answer, expectedForms] of [['さわがれる', ['tai', 'taiNegativePast']], ['さわがれたい', ['taiNegativePast']]]) {
    const result = createAnswerAnalyzer(word, form)(answer);
    assert.deepEqual(result.steps.map(step => step.form), expectedForms);
    assert.ok(result.steps.every(step => !step.kcIds.includes('compound.multi-step')));
    assert.ok(result.steps.every(step => step.kcIds.every(id => !result.diagnosis.confirmedKcIds.includes(id))));
  }
});

test('precise diagnoses retain precedence and a broken later operation does not identify the passive stage', () => {
  assert.equal(createAnswerAnalyzer(word, 'passive')('さわぎれる').diagnosis.kcId, 'stem.godan.a');
  assert.equal(createAnswerAnalyzer(word, 'passive')('さわられる').diagnosis.kcId, 'class.godan');
  assert.equal(createAnswerAnalyzer(word, form)('さわぎられたくなかた').diagnosis, null);
  const [stem, attachment] = createAnswerAnalyzer(word, 'passive')('さわぎられる').steps;
  assert.equal(stem.kind, 'stem');
  assert.equal(attachment.kind, 'attachment');
});
