import assert from 'node:assert/strict';
import test from 'node:test';
import { generateProbeRoutingCases } from '../scripts/lib/probe-routing-cases.mjs';
import { generateErrorCases } from '../scripts/lib/error-patterns.mjs';
import { evaluateGeneratedCase } from '../scripts/lib/diagnosis-audit.mjs';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { unifiedDiagnosticSteps } from '../app/lib/unified-knowledge.mjs';

const late = { domain: 'verb', surface: '遅れる', reading: 'おくれる', class: 'ichidan' };
const write = { domain: 'verb', surface: '書く', reading: 'かく', class: 'godan' };
const assess = (c, a) => evaluateGeneratedCase(c, a).status;

test('independent routing expectations reject a restored base-first sequence and invented scoring', () => {
  const c = generateErrorCases({ item: late, form: 'tagaruPast' }).cases.find(c => c.pattern === 'priority-stage' && c.input === 'おくれたがた');
  const actual = createAnswerAnalyzer(late, c.form)(c.input);
  assert.equal(assess(c, actual), 'pass');
  assert.equal(assess(c, { ...actual, steps: unifiedDiagnosticSteps(late, c.form) }), 'regression');
  assert.equal(assess(c, { ...actual, diagnosis: { kcId: 'onbin.sokuon', confirmedKcIds: [] } }), 'regression');
  assert.equal(assess(c, { ...actual, diagnosis: { kcId: null, confirmedKcIds: ['construction.tagaru'] } }), 'regression');
  assert.equal(assess(c, { ...actual, steps: [actual.steps[0], { ...actual.steps[1], kcIds: ['suffix.past'] }] }), 'regression');
  assert.equal(assess(c, { ...actual, feedback: { ...actual.feedback, resolution: 'unresolved' } }), 'regression');
});

test('guard contracts reject early priority for lexical damage or a different complete expression', () => {
  for (const [item, form, input] of [[late, 'tagaruPast', '字くれたがた'], [write, 'teiruPast', 'かいていった']]) {
    const c = generateErrorCases({ item, form }).cases.find(c => c.pattern === 'priority-guard' && c.input === input);
    assert.ok(c, input);
    const actual = createAnswerAnalyzer(item, form)(input);
    assert.equal(assess(c, actual), 'pass', input);
    assert.equal(assess(c, { ...actual, steps: [{ ...actual.steps[0], probeSelection: { strategy: 'bogus' } }, ...actual.steps.slice(1)] }), 'regression');
  }
});

test('the independent cases and generated native followups cover shared-rule restoration and score-free classes', () => {
  for (const [item, form, ids] of [
    [{ domain: 'verb', surface: '待つ', reading: 'まつ', class: 'godan' }, 'teoruPast', ['onbin.sokuon', 'suffix.past']],
    [{ domain: 'verb', surface: '食べる', reading: 'たべる', class: 'ichidan' }, 'teageruPast', ['stem.ichidan.drop-ru', 'suffix.past']],
  ]) {
    const seeds = generateProbeRoutingCases(item, form).filter(c => c.pattern === 'priority-stage');
    assert.ok(seeds.length);
    for (const c of seeds) assert.deepEqual(c.expected.probeKcIds, [[], ids]);
    const generated = generateErrorCases({ item, form }).cases;
    const contexts = generated.filter(c => c.step && seeds.some(seed => seed.input === c.originalInput));
    assert.ok(contexts.some(c => c.step.kind === 'classification'));
    assert.ok(contexts.some(c => c.step.providedClass));
    for (const c of contexts) assert.equal(assess(c, createAnswerAnalyzer(item, form, { step: c.step })(c.input)), 'pass', c.input);
  }
});

test('complete sibling contracts reject restarting construction, invented evidence, and lost shared tail rules', () => {
  const item = { domain: 'verb', surface: '待つ', reading: 'まつ', class: 'godan' };
  const form = 'temorauPast';
  const c = generateErrorCases({ item, form }).cases.find(c => c.pattern === 'priority-form-switch' && c.input === 'まってもらわなかった');
  assert.ok(c);
  const actual = createAnswerAnalyzer(item, form)(c.input);
  assert.equal(assess(c, actual), 'pass');
  assert.equal(assess(c, { ...actual, steps: unifiedDiagnosticSteps(item, form) }), 'regression');
  assert.equal(assess(c, { ...actual, diagnosis: { kcId: 'suffix.past', confirmedKcIds: [] } }), 'regression');
  assert.equal(assess(c, { ...actual, diagnosis: { kcId: null, confirmedKcIds: ['construction.temorau'] } }), 'regression');
  assert.equal(assess(c, { ...actual, steps: [{ ...actual.steps[0], kcIds: ['suffix.past'] }] }), 'regression');
  assert.equal(assess(c, { ...actual, steps: [{ ...actual.steps[0], kcIds: [...actual.steps[0].kcIds, 'apply.temorau.continuation'] }] }), 'regression');
});

test('negative-to-negative-past contracts reject repeating the negative step and replay the native past assessment', () => {
  const form = 'tagaruNegativePast';
  const generated = generateErrorCases({ item: write, form }).cases;
  const c = generated.find(c => c.pattern === 'priority-form-switch' && c.input === 'かきたがらない');
  assert.ok(c);
  const actual = createAnswerAnalyzer(write, form)(c.input);
  assert.equal(assess(c, actual), 'pass');
  assert.equal(actual.steps[0].kind, 'atomic');
  assert.equal(assess(c, { ...actual, steps: unifiedDiagnosticSteps(write, form).slice(1) }), 'regression');
  assert.equal(assess(c, { ...actual, diagnosis: { kcId: null, confirmedKcIds: ['stem.godan.a', 'suffix.negative'] } }), 'regression');
  const followups = generated.filter(c => c.step?.form === 'adjectivePast' && c.step.reading === 'かきたがらない');
  assert.ok(followups.some(c => c.pattern === 'step-negative-unchanged'));
  for (const c of followups) assert.equal(assess(c, createAnswerAnalyzer(write, form, { step: c.step })(c.input)), 'pass', c.input);
});
