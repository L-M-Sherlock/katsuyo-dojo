import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDiagnosticSteps, deriveExercise, diagnoseConjugation, diagnoseStep } from '../app/lib/knowledge-model.mjs';
import { COMPOUND_FORM_SPECS } from '../app/lib/compound-forms.mjs';
import { updateKnowledgeStats } from '../app/lib/adaptive.mjs';

const item = { domain: 'verb', surface: '頼む', reading: 'たのむ', class: 'godan' };
const reading = { ...item, surface: item.reading, lexicalSurface: item.surface };

test('the reported malformed tai past answer changes no component statistics', () => {
  assert.equal(diagnoseConjugation(reading, 'taiPast', 'たのんだいた'), null);
  const kcIds = deriveExercise(item, 'taiPast').requiredKcIds;
  const before = updateKnowledgeStats({}, { correct: true, kcIds, focusId: kcIds.at(-1) });
  assert.deepEqual(updateKnowledgeStats(before, { correct: false, kcIds, focusId: kcIds.at(-1) }), before);
});

test('tai past is split into construction then continuation without overlapping evidence', () => {
  const [base, tail] = buildDiagnosticSteps(item, 'taiPast');
  assert.equal(base.surface, '頼む');
  assert.equal(base.form, 'tai');
  assert.deepEqual(base.readings, ['たのみたい']);
  assert.equal(tail.surface, '頼みたい');
  assert.deepEqual(tail.readings, ['たのみたかった']);
  assert.deepEqual(tail.kcIds, ['composition.i-adjective.past']);
  const first = updateKnowledgeStats({}, { correct: true, kcIds: base.kcIds, focusId: base.focusId });
  const second = updateKnowledgeStats(first, { correct: true, kcIds: tail.kcIds, focusId: tail.focusId });
  for (const id of base.kcIds) assert.deepEqual(second[id], first[id]);
  assert.equal(second[tail.focusId].correct, 1);
});

test('continuation diagnosis cannot penalize or credit a provided base', () => {
  const [, tail] = buildDiagnosticSteps(item, 'taiPast');
  const diagnosis = diagnoseStep(item, tail, 'たのみたい');
  assert.equal(diagnosis.kcId, 'composition.i-adjective.past');
  assert.deepEqual(diagnosis.confirmedKcIds, []);
  assert.equal(diagnoseStep(item, tail, 'たのたかった'), null);
  assert.equal(diagnoseStep(item, tail, 'たのんだいた'), null);
});

test('all continuation families split into independent evidence and exclude unsupported forms', () => {
  for (const form of [...Object.keys(COMPOUND_FORM_SPECS), 'passivePast', 'potentialNegative',
    'causativePassiveNegativePast', 'masuPast', 'masuNegativePast', 'negativePast']) {
    const [base, tail] = buildDiagnosticSteps(item, form);
    assert.ok(base.kcIds.length, form);
    assert.ok(tail.kcIds.length, form);
    assert.ok(tail.kcIds.includes(tail.focusId), form);
    assert.equal(tail.kcIds.some((id) => base.kcIds.includes(id)), false, form);
    assert.deepEqual(tail.answers, deriveExercise(item, form).acceptedVariants);
  }
  assert.deepEqual(buildDiagnosticSteps(item, 'past'), []);
});
