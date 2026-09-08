import { assertGenericOrTerminal } from './helpers/diagnosis-assertions.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { unifiedDiagnosticSteps, unifiedStepDiagnosticSteps } from '../app/lib/unified-knowledge.mjs';
import { emptySkillStats, updateKnowledgeStats } from '../app/lib/adaptive.mjs';

const wrap = { domain: 'verb', class: 'godan', surface: '包む', reading: 'つつむ' };
const write = { domain: 'verb', class: 'godan', surface: '書く', reading: 'かく' };
const analyze = (item, form, input, step = unifiedDiagnosticSteps(item, form).at(-1)) =>
  createAnswerAnalyzer(item, form, { step })(input);
const score = (stats, step, result) => updateKnowledgeStats(stats, {
  kcIds: step.kcIds, focusId: step.focusId, correct: result.kind === 'correct',
  failedKcId: result.diagnosis?.kcId, confirmedKcIds: result.diagnosis?.confirmedKcIds ?? [],
});

test('the screenshot adds a non-scoring class check followed by explicit godan past practice', () => {
  const parent = unifiedDiagnosticSteps(wrap, 'tagaruPast').at(-1);
  for (const input of ['つつみたがた', '包みたがた']) {
    const result = analyze(wrap, 'tagaruPast', input, parent);
    assert.equal(result.kind, 'incorrect');
    assert.equal(result.diagnosis.kcId, null);
    assert.deepEqual(result.diagnosis.confirmedKcIds, []);
    assert.deepEqual(result.diagnosis.stage, { form: 'past', label: 'たがる的过去变化',
      candidateKcIds: ['apply.tagaru.continuation', 'onbin.sokuon'] });
    assert.doesNotMatch(result.diagnosis.message, /たがった|促音|五段|一段/);
    assert.deepEqual(result.steps, unifiedStepDiagnosticSteps(wrap, parent, { answer: input }));
    assert.equal(result.steps.length, 2);
    const [classification, conjugation] = result.steps;
    assert.equal(classification.kind, 'classification');
    assert.equal(classification.diagnosticOnly, true);
    assert.equal(classification.expectedClass, 'godan');
    assert.deepEqual(classification.classChoices, [
      { value: 'godan', label: '五段动词' }, { value: 'ichidan', label: '一段动词' },
    ]);
    assert.deepEqual(classification.kcIds, []);
    assert.equal(classification.focusId, null);
    assert.equal(conjugation.kind, 'conjugation');
    assert.equal(conjugation.providedClass, 'godan');
    assert.equal(conjugation.form, 'past');
    assert.deepEqual(conjugation.kcIds, ['onbin.sokuon', 'suffix.past']);
    assert.match(conjugation.note, /已知.*五段动词/);
    assert.deepEqual(conjugation.readings, ['つつみたがった']);
  }
});

test('classification choices change no statistics and never generate more checks', () => {
  const parent = unifiedDiagnosticSteps(wrap, 'tagaruPast').at(-1);
  const [step] = analyze(wrap, 'tagaruPast', 'つつみたがた', parent).steps;
  const stats = Object.fromEntries(parent.kcIds.map(id => [id, { ...emptySkillStats() }]));
  for (const [choice, kind] of [['godan', 'correct'], ['ichidan', 'incorrect']]) {
    const result = analyze(wrap, 'tagaruPast', choice, step);
    assert.equal(result.kind, kind);
    assert.equal(result.diagnosis, null);
    assert.deepEqual(result.steps, []);
    assert.deepEqual(score(stats, step, result), stats);
    assert.deepEqual(unifiedStepDiagnosticSteps(wrap, step, { answer: choice }), []);
  }
});

test('after class is supplied, the original omission measures onbin without crediting transfer or classification', () => {
  const parent = unifiedDiagnosticSteps(wrap, 'tagaruPast').at(-1);
  const original = analyze(wrap, 'tagaruPast', 'つつみたがた', parent);
  const step = original.steps[1];
  const stats = Object.fromEntries(['class.godan', ...parent.kcIds].map(id => [id, { ...emptySkillStats() }]));
  assert.deepEqual(score(stats, parent, original), stats);
  const wrong = analyze(wrap, 'tagaruPast', 'つつみたがた', step);
  assert.equal(wrong.diagnosis.kcId, 'onbin.sokuon');
  assert.deepEqual(wrong.diagnosis.confirmedKcIds, []);
  assert.deepEqual(wrong.steps, []);
  const changed = score(stats, step, wrong);
  assert.equal(changed['onbin.sokuon'].attempts, 1);
  for (const id of Object.keys(stats).filter(id => id !== 'onbin.sokuon')) assert.deepEqual(changed[id], stats[id], id);
  const right = analyze(wrap, 'tagaruPast', 'つつみたがった', step);
  const passed = score(stats, step, right);
  for (const id of step.kcIds) assert.equal(passed[id].correct, 1, id);
  for (const id of ['class.godan', 'apply.tagaru.continuation', 'facet.apply.tagaru.past']) assert.deepEqual(passed[id], stats[id], id);
});

test('eleven regular ru-ending derived verb past families share the bounded collision path', () => {
  const families = [
    ['tagaruPast', 'かきたがた', 'godan'],
    ['teoruPast', 'かいておた', 'godan'],
    ['teageruPast', 'かいてあげった', 'ichidan'],
    ['tekureruPast', 'かいてくれった', 'ichidan'],
    ['teiruPast', 'かいていった', 'ichidan'],
    ['temiruPast', 'かいてみった', 'ichidan'],
    ['sugiruPast', 'かきすぎった', 'ichidan'],
    ['passivePast', 'かかれった', 'ichidan'],
    ['potentialPast', 'かけった', 'ichidan'],
    ['causativePast', 'かかせった', 'ichidan'],
    ['causativePassivePast', 'かかせられった', 'ichidan'],
  ];
  for (const [form, input, cls] of families) {
    const result = analyze(write, form, input);
    assert.equal(result.diagnosis?.kcId ?? null, null, input);
    assert.equal(result.steps.length, 2, input);
    const step = result.steps[1];
    assert.equal(step.providedClass, cls);
    assert.ok(step.kcIds.every(id => /^(stem\.|onbin\.|suffix\.)/.test(id)));
    const retried = analyze(write, form, input, step);
    assert.equal(retried.diagnosis?.kcId, cls === 'godan' ? 'onbin.sokuon' : 'suffix.past', input);
    assert.deepEqual(retried.diagnosis.confirmedKcIds, [], input);
    assert.deepEqual(retried.steps, [], input);
  }
});

test('partial-answer contexts also diagnose the supplied intermediate instead of the original verb', () => {
  const initial = createAnswerAnalyzer(wrap, 'tagaruPast')('包みたがる');
  assert.equal(initial.steps.length, 1);
  const result = analyze(wrap, 'tagaruPast', 'つつみたがた', initial.steps[0]);
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[1].analysisItem.surface, '包みたがる');
  assert.deepEqual(result.steps[1].kcIds, ['onbin.sokuon', 'suffix.past']);
});

test('a sound rule already evaluated in the original base is not silently reintroduced into follow-up scoring', () => {
  const wait = { domain: 'verb', class: 'godan', surface: '待つ', reading: 'まつ' };
  for (const [form, input] of [
    ['teoruPast', 'まっておた'], ['temorauPast', 'まってもらた'], ['teshimauPast', 'まってしまた'],
  ]) {
    const parent = unifiedDiagnosticSteps(wait, form).at(-1);
    assert.equal(parent.kcIds.includes('onbin.sokuon'), false);
    const result = analyze(wait, form, input, parent);
    assert.equal(result.diagnosis, null, input);
    assertGenericOrTerminal(result,parent.kcIds);
    assert.ok(result.steps.every(probe=>!probe.kcIds.includes('onbin.sokuon')));
    assert.deepEqual(unifiedStepDiagnosticSteps(wait, parent, { answer: input }), []);
  }
});

test('existing accepted contractions remain valid while short causative answers remain excluded', () => {
  const followup = analyze(write, 'teiruPast', 'かいていった').steps[1];
  for (const answer of ['書いていた', '書いてた', 'かいていた', 'かいてた']) {
    assert.equal(analyze(write, 'teiruPast', answer, followup).kind, 'correct', answer);
  }
  const causative = analyze(write, 'causativePast', 'かかせった').steps[1];
  assert.equal(analyze(write, 'causativePast', 'かかせた', causative).kind, 'correct');
  assert.notEqual(analyze(write, 'causativePast', 'かかした', causative).kind, 'correct');
});

test('retained ru in a supplied contraction stays grammatical when drop-ru is outside this step scope', () => {
  const eat = { domain: 'verb', class: 'ichidan', surface: '食べる', reading: 'たべる' };
  const original = unifiedDiagnosticSteps(eat, 'teiruPast').at(-1);
  const given = analyze(eat, 'teiruPast', '食べていった', original).steps[1];
  assert.deepEqual(given.kcIds, ['suffix.past']);
  const stats = Object.fromEntries(['stem.ichidan.drop-ru', ...original.kcIds]
    .map(id => [id, { ...emptySkillStats() }]));
  for (const input of ['食べてるた', 'たべてるた', '食べているた', 'たべているた']) {
    const result = analyze(eat, 'teiruPast', input, given);
    assert.equal(result.kind, 'incorrect', input);
    assert.equal(result.diagnosis.kcId, null, input);
    assert.deepEqual(result.diagnosis.confirmedKcIds, [], input);
    assert.equal(result.diagnosis.stage, undefined, input);
    assert.match(result.diagnosis.message, /保留.*る/);
    assert.ok(result.planFallback);
    assert.ok(result.steps.every(probe=>probe.kind==='atomic'&&probe.kcIds.every(id=>given.kcIds.includes(id))));
    assert.deepEqual(score(stats, given, result), stats, input);
  }
  // The exception concerns complete supplied bases, not arbitrary root edits.
  assert.equal(analyze(eat, 'teiruPast', 'なべていた', given).kind, 'typo');
  const withStem = analyze(write, 'teiruPast', '書いていった').steps[1];
  assert.ok(withStem.kcIds.includes('stem.ichidan.drop-ru'));
  const scoped = analyze(write, 'teiruPast', '書いてるた', withStem);
  assert.equal(scoped.kind, 'incorrect');
  assert.equal(scoped.diagnosis.kcId, 'stem.ichidan.drop-ru');
});

test('mixed reviews stay separate from strict class collisions and retain unsupported-form boundaries', () => {
  for (const [form, input] of [
    ['tagaruPast', 'かきたがった'], ['tagaruPast', 'さきたがた'],
    ['tagaruPast', 'かきたがだ'], ['tagaruPast', 'かきたがたた'],
    ['tagaruNegative', 'かきたがない'], ['tagaruNegativePast', 'かきたがなかった'],
    ['teageruPast', 'さいてあげった'], ['teageruPast', 'かいてあげっだ'],
    ['teikuPast', 'かいていた'], ['tearuPast', 'かいてあた'],
    ['tekuruPast', 'かいてくた'], ['youtosuruPast', 'かこうとした'],
    ['temorauPast', 'かいてもらた'], ['teshimauPast', 'かいてしまた'],
  ]) {
    const parent = unifiedDiagnosticSteps(write, form).at(-1);
    const result = analyze(write, form, input, parent);
    const mixed = ['さきたがた', 'かきたがだ', 'さいてあげった', 'かいてあげっだ'].includes(input);
    if(mixed)assert.equal(result.steps.length,2,input);else assertGenericOrTerminal(result,parent.kcIds);
    assert.equal(result.diagnosis?.stage, undefined, input);
    if (mixed) {
      assert.equal(result.diagnosis.review.kind, 'mixed-past', input);
      assert.equal(result.diagnosis.kcId, null, input);
      assert.deepEqual(result.diagnosis.confirmedKcIds, [], input);
    } else assert.deepEqual(unifiedStepDiagnosticSteps(write, parent, { answer: input }), []);
  }
  const given = analyze(wrap, 'tagaruPast', 'つつみたがた').steps[1];
  for (const input of ['たつみたがた', 'つつみたがだ', 'つつみたがたた', '§つつみたがた']) {
    const result = analyze(wrap, 'tagaruPast', input, given);
    if (['たつみたがた', 'つつみたがだ'].includes(input)) {
      assert.equal(result.diagnosis.review.kind, 'mixed-past', input);
      assert.equal(result.diagnosis.kcId, null, input);
    } else assert.equal(result.diagnosis, null, input);
    assert.ok(result.planFallback);
    assert.deepEqual(result.steps.map(probe=>probe.kcIds),[['onbin.sokuon'],['suffix.past']]);
  }
});
