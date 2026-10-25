import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { atomicSteps, buildDiagnosticPlan } from '../app/lib/diagnostic-plan.mjs';
import { formatDiagnosticMessage } from '../app/lib/i18n/diagnostics.mjs';

const irregulars = [
  { domain:'verb', surface:'来る', reading:'くる', class:'irregular' },
  { domain:'verb', surface:'する', reading:'する', class:'irregular' },
];
const english = (step, field) => {
  const descriptor = step.i18n[field];
  return formatDiagnosticMessage(descriptor.messageKey, descriptor.params, 'en');
};
const atoms = (item, form) => {
  const plan = buildDiagnosticPlan(item, form);
  return atomicSteps(plan, form, [...new Set(plan.nodes.flatMap(node => node.ruleKcIds))]);
};
function assertNoTargetAnswer(step) {
  const instructions = ['stepTitle', 'targetLabel', 'prompt'].map(field => english(step, field)).join('\n');
  for (const answer of [...step.answers, ...step.readings]) {
    assert.ok(!instructions.includes(answer), `instruction exposes ${answer}: ${instructions}`);
  }
}

test('来る and する masu steps request only the stem before ます without showing it', () => {
  for (const item of irregulars) {
    const [step] = createAnswerAnalyzer(item, 'masu')('xyz').steps;
    assert.equal(step.focusId, 'stem.irregular.connective');
    assert.equal(english(step, 'stepTitle'), 'Write the ます-stem');
    assert.equal(english(step, 'prompt'), 'Write only the ます-stem. Do not add “ます” yet. Enter the complete stem.');
    assert.match(english(step, 'prompt'), /Enter the complete stem/);
    assert.doesNotMatch(english(step, 'prompt'), /ます-form/);
    assertNoTargetAnswer(step);
    assert.equal(createAnswerAnalyzer(item, 'masu', { step })(item.surface).kind, 'incorrect');
    assert.equal(createAnswerAnalyzer(item, 'masu', { step })(step.readings[0]).kind, 'correct');
  }
});

test('the same irregular stem operation names the actual following ending', () => {
  for (const [form, ending] of [
    ['nasai', 'なさい'], ['tai', 'たい'], ['nagara', 'ながら'],
    ['tsutsu', 'つつ'], ['sugiru', 'すぎる'], ['tagaru', 'たがる'],
  ]) {
    for (const item of irregulars) {
      const step = atoms(item, form).find(value => value.focusId === 'stem.irregular.connective');
      assert.ok(step, `${item.surface}/${form}`);
      const prompt = english(step, 'prompt');
      assert.ok(prompt.includes('ます-stem'), prompt);
      assert.ok(prompt.includes(`Do not add “${ending}” yet`), prompt);
      assert.doesNotMatch(prompt, /ます-form/);
      assertNoTargetAnswer(step);
    }
  }
});

test('compound goals keep the local stem target instead of requesting the final whole form', () => {
  for (const [form, stage, ending] of [
    ['masuPast', 'masu', 'ます'], ['masuNegativePast', 'masu', 'ます'],
    ['taiNegativePast', 'tai', 'たい'], ['sugiruPast', 'sugiru', 'すぎる'],
    ['tagaruNegativePast', 'tagaru', 'たがる'],
  ]) {
    for (const item of irregulars) {
      const step = atoms(item, form).find(value => value.focusId === 'stem.irregular.connective');
      assert.equal(step.goalForm, stage);
      const prompt = english(step, 'prompt');
      assert.ok(prompt.includes('ます-stem'), prompt);
      assert.ok(prompt.includes(`Do not add “${ending}” yet`), prompt);
      assert.doesNotMatch(prompt, /past|negative/i);
      assertNoTargetAnswer(step);
    }
  }
});

test('a compound intermediate ichidan stem keeps its own instruction and next ending', () => {
  for (const item of irregulars) {
    const step = atoms(item, 'temiruDesirePast').find(value => value.focusId === 'stem.ichidan.drop-ru');
    assert.ok(step.surface.endsWith('てみる'));
    assert.equal(step.goalForm, 'tai');
    assert.equal(english(step, 'stepTitle'), 'Write the ます-stem');
    assert.equal(english(step, 'prompt'), 'Write only the ます-stem. Do not add “たい” yet. Enter the complete stem.');
    assertNoTargetAnswer(step);
  }
});

test('the masu attachment asks for the given stem plus ます without showing the complete answer', () => {
  for (const item of irregulars) {
    const step = createAnswerAnalyzer(item, 'masu')('xyz').steps[1];
    assert.equal(step.focusId, 'suffix.masu');
    assert.equal(english(step, 'prompt'), 'Add “ます” to the given stem. Enter the complete ます-form.');
    assertNoTargetAnswer(step);
    assert.equal(createAnswerAnalyzer(item, 'masu', { step })(step.readings[0]).kind, 'correct');
  }
});

test('compound masu attachments retain the local goal and any following-ending restriction', () => {
  for (const form of ['masuPast', 'masuNegative', 'masuNegativePast', 'masenka', 'potentialPolitePast']) {
    for (const item of irregulars) {
      const step = atoms(item, form).find(value => value.focusId === 'suffix.masu');
      assert.equal(step.goalForm, 'masu');
      assert.equal(english(step, 'prompt'), 'Add “ます” to the given stem. Enter the complete ます-form.');
      assertNoTargetAnswer(step);
      assert.equal(english(step, 'stepTitle'), 'Write the complete ます-form');
      assert.doesNotMatch(english(step, 'prompt'), /past|negative/i);
    }
  }
});
