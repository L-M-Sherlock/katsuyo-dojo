import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { unifiedDiagnosticSteps } from '../app/lib/unified-knowledge.mjs';
import { planDiagnosticTransition } from '../app/lib/diagnostic-session.mjs';

const read = async name => JSON.parse(await readFile(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const cases = await read('independent-inputs');
const reviews = await read('independent-input-reviews');
const provenance = await read('independent-input-provenance');

function stepFor(c) {
  if (!c.stepSelector) return undefined;
  const matches = unifiedDiagnosticSteps(c.item, c.form).filter((s, index) =>
    (c.stepSelector.index === undefined || c.stepSelector.index === index)
    && (c.stepSelector.form === undefined || c.stepSelector.form === s.form)
    && (c.stepSelector.reading === undefined || c.stepSelector.reading === s.reading));
  assert.equal(matches.length, 1, `${c.id}: selector must identify one provided step`);
  return matches[0];
}

test('independent seeds stay frozen and every reviewed expectation has an explicit reason', () => {
  assert.equal(cases.length, 444);
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length);
  for (const [group, record] of Object.entries(provenance)) {
    const originals = cases.filter(c => c.group === group).map(c => {
      const original = { ...c }; delete original.group; return original;
    });
    assert.equal(originals.length, record.count, group);
    assert.equal(createHash('sha256').update(JSON.stringify(originals)).digest('hex'), record.canonicalSha256, `${group}: change the review, not frozen seed expectations`);
  }
  for (const [id, review] of Object.entries(reviews)) {
    assert.ok(cases.some(c => c.id === id), id);
    assert.ok(review.reason?.length, id);
    assert.ok(review.expect || review.scope === 'engine-extension', id);
  }
  assert.equal(Object.values(reviews).filter(r => r.scope === 'engine-extension').length, 4);
});

for (const group of Object.keys(provenance)) test(`reviewed independent ${group} inputs satisfy their declared contracts`, () => {
  for (const c of cases.filter(c => c.group === group)) {
    const review = reviews[c.id] ?? reviews[c.sourceSeed];
    // Out-of-vocabulary engine probes remain in the artifact with their
    // original expectations; they are explicitly not counted as passing UI cases.
    if (review?.scope === 'engine-extension') continue;
    const expected = { ...c.expect, ...review?.expect };
    const actual = createAnswerAnalyzer(c.item, c.form, { step: stepFor(c) })(c.input);
    const label = `${c.id} ${c.form} ${c.input}`;
    assert.equal(actual.kind, expected.kind, label);
    if (Object.hasOwn(expected, 'failedKcId')) assert.equal(actual.diagnosis?.kcId ?? null, expected.failedKcId, label);
    const evidence = [actual.diagnosis?.kcId, ...(actual.diagnosis?.confirmedKcIds ?? [])];
    for (const id of expected.forbiddenKcIds ?? []) assert.ok(!evidence.includes(id), `${label}: forbidden ${id}`);
    if (expected.confirmedKcIds) assert.deepEqual([...(actual.diagnosis?.confirmedKcIds ?? [])].sort(), [...expected.confirmedKcIds].sort(), label);
    if (Object.hasOwn(expected, 'needsGuidance')) assert.equal(Boolean(actual.steps.length), expected.needsGuidance, label);
    if (actual.kind === 'incorrect') assert.ok(actual.diagnosis?.kcId || actual.steps.length || actual.feedback?.terminal, `${label}: diagnosis or finite guidance`);
  }
});

const flowIds = ['tagaru-mixed-source-tail', 'tagaru-past-missing-small-tsu', 'teiru-extra-small-tsu',
  'teiru-short-kept-ru-excluded-scope', 'tearu-regularized-negative-whole', 'teiku-multiple-tail-errors',
  'tekuru-dictionary-kana-in-past', 'teageru-fixed-te-prefix-damaged', 'passive-desire-mixed-passive',
  'passive-desire-skipped-desire', 'passive-desire-skipped-passive', 'causative-passive-extra-small-tsu',
  'causative-long-step-short-output', 'teoru-class-confusion', 'temiru-extra-small-tsu', 'sugiru-adjective-confusion'];

test('48 independently selected diagnostic flows terminate without duplicate or out-of-scope writes', () => {
  for (const id of flowIds) for (const mode of ['correct', 'unknown', 'wrong-class']) {
    const c = cases.find(c => c.id === `compound-${id}`), provided = stepFor(c);
    const initial = createAnswerAnalyzer(c.item, c.form, { step: provided })(c.input);
    let steps = initial.steps, index = 0;
    let evaluated = [initial.diagnosis?.kcId, ...(initial.diagnosis?.confirmedKcIds ?? [])].filter(Boolean), examined = [];
    const writes = new Set(evaluated), nodes = new Set();
    while (index < steps.length && index < 40) {
      const step = steps[index];
      const wrongClass = step.classChoices?.find(choice => choice.value !== step.expectedClass)?.value;
      const input = mode === 'unknown' ? wrongClass ?? 'わからない'
        : mode === 'wrong-class' && wrongClass ? wrongClass : step.readings[0];
      const analysis = createAnswerAnalyzer(c.item, c.form, { step })(input);
      assert.ok(!['invalid', 'typo'].includes(analysis.kind), `${id}: bad flow input`);
      const snapshot = JSON.stringify({ steps, evaluated, examined });
      const transition = planDiagnosticTransition(steps, index, analysis, evaluated, examined);
      assert.equal(JSON.stringify({ steps, evaluated, examined }), snapshot, `${id}: mutated source state`);
      const replay = planDiagnosticTransition(transition.nextSteps, index, analysis, transition.evaluated, transition.examined);
      assert.deepEqual(replay.writes, [], `${id}: repeated submission scored again`);
      if (step.diagnosticOnly) assert.deepEqual(transition.writes, []);
      for (const kcId of transition.writes) {
        assert.ok(!writes.has(kcId), `${id}: duplicate ${kcId}`);
        if (provided) assert.ok(provided.kcIds.includes(kcId), `${id}: outside provided scope ${kcId}`);
        writes.add(kcId);
      }
      if (step.nodeId) { assert.ok(!nodes.has(step.nodeId), `${id}: duplicate atomic node`); nodes.add(step.nodeId); }
      steps = transition.nextSteps; evaluated = transition.evaluated; examined = transition.examined; index++;
    }
    assert.ok(index >= steps.length, `${id}: did not terminate`);
  }
});
