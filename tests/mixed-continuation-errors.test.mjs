import { assertGenericOrTerminal } from './helpers/diagnosis-assertions.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { unifiedDiagnosticSteps, unifiedStepDiagnosticSteps } from '../app/lib/unified-knowledge.mjs';
import { emptySkillStats, updateKnowledgeStats } from '../app/lib/adaptive.mjs';

const close = { domain: 'verb', class: 'ichidan', surface: '閉める', reading: 'しめる' };
const write = { domain: 'verb', class: 'godan', surface: '書く', reading: 'かく' };
const defaultStep = (item = close, form = 'tagaruPast') => unifiedDiagnosticSteps(item, form).at(-1);
const analyze = (answer, step = defaultStep(), item = close, form = 'tagaruPast') =>
  createAnswerAnalyzer(item, form, { step })(answer);
const assertReview = (result, count) => {
  assert.equal(result.kind, 'incorrect');
  assert.equal(result.diagnosis.kcId, null);
  assert.deepEqual(result.diagnosis.confirmedKcIds, []);
  assert.equal(result.diagnosis.stage, undefined);
  assert.equal(result.diagnosis.review.kind, 'mixed-past');
  assert.equal(result.diagnosis.review.form, 'past');
  if(count)assert.equal(result.steps.length,count);
  else {
    assert.ok(result.planFallback);assert.ok(result.steps.length>=1&&result.steps.length<=2);
    assert.ok(result.steps.every(step=>step.kind==='atomic'&&step.kcIds.every(id=>['onbin.sokuon','suffix.past','stem.ichidan.drop-ru'].includes(id))));
  }
  assert.doesNotMatch(result.diagnosis.message, /った|促音|五段|一段/);
};

test('the screenshot reports both observable differences without choosing a failed rule or disclosing the past answer', () => {
  for (const [answer, expected, actual] of [['しまたがだ', 'しめ', 'しま'], ['閉またがだ', '閉め', '閉ま']]) {
    const result = analyze(answer);
    assertReview(result, 2);
    assert.deepEqual(result.diagnosis.review, { kind: 'mixed-past', form: 'past', label: 'たがる的过去变化',
      rootMismatch: { expected, actual, operation: 'substitution' } });
    assert.ok(result.diagnosis.message.includes(`给定前部「${expected}」`));
    assert.ok(result.diagnosis.message.includes(`写成了「${actual}」`));
    assert.match(result.diagnosis.message, /过去变化末尾也不同/);
    assert.deepEqual(result.steps, unifiedStepDiagnosticSteps(close, defaultStep(), { answer }));
  }
});

test('an intact lexical prefix with multiple ending differences offers review rather than forced onbin attribution', () => {
  for (const answer of ['しめたがだ', 'しめたがつだ', 'しめたがんだ', 'しめたがいだ', 'しめたがるだ']) {
    const result = analyze(answer);
    assertReview(result, 2);
    assert.equal(result.diagnosis.review.rootMismatch, null);
  }
});

test('a single lexical kana edit composes only with the finite sixteen-cell past-ending table', () => {
  for (const [prefix, operation] of [
    ['しま', 'substitution'], ['し', 'deletion'], ['ししめ', 'insertion'], ['めし', 'transposition'],
  ]) {
    for (const body of ['', 'っ', 'つ', 'ん', 'い', 'し', 'り', 'る']) for (const terminal of ['た', 'だ']) {
      const tail = body + terminal;
      if (tail === 'った') continue;
      const result = analyze(prefix + 'たが' + tail);
      assertReview(result, 2);
      assert.deepEqual(result.diagnosis.review.rootMismatch, { expected: 'しめ', actual: prefix, operation });
    }
  }
});

test('the original mixed response and both observations in the guided sequence do not write knowledge statistics', () => {
  const parent = defaultStep(), original = analyze('しまたがだ', parent);
  const [classification, given] = original.steps;
  const stats = Object.fromEntries(['stem.ichidan.drop-ru', ...parent.kcIds]
    .map(id => [id, { ...emptySkillStats(), attempts: 2, correct: 1, filteredAccuracy: .5 }]));
  const score = (step, result) => updateKnowledgeStats(stats, { kcIds: step.kcIds, focusId: step.focusId,
    correct: result.kind === 'correct', failedKcId: result.diagnosis?.kcId,
    confirmedKcIds: result.diagnosis?.confirmedKcIds ?? [] });
  assert.deepEqual(score(parent, original), stats);
  assert.equal(classification.diagnosticOnly, true);
  assert.deepEqual(classification.kcIds, []);
  for (const choice of ['godan', 'ichidan']) assert.deepEqual(score(classification, analyze(choice, classification)), stats);
  assert.deepEqual(given.reviewContext.sourceItem, close);
  assert.deepEqual(given.kcIds, ['onbin.sokuon', 'suffix.past']);
  const again = analyze('しまたがだ', given);
  assertReview(again, 0);
  assert.deepEqual(again.diagnosis.review.rootMismatch, { expected: 'しめ', actual: 'しま', operation: 'substitution' });
  assert.deepEqual(score(given, again), stats);
  assert.deepEqual(unifiedStepDiagnosticSteps(close, given, { answer: 'しまたがだ' }), []);
  // Knowing the class still permits a genuine single-rule response to count.
  assert.equal(analyze('しめたがた', given).diagnosis.kcId, 'onbin.sokuon');
});

test('all eleven existing ru-ending continuation families can review an intact auxiliary after a lexical edit', () => {
  for (const form of ['tagaruPast', 'teoruPast', 'teageruPast', 'tekureruPast', 'teiruPast', 'temiruPast',
    'sugiruPast', 'passivePast', 'potentialPast', 'causativePast', 'causativePassivePast']) {
    const step = defaultStep(close, form);
    const body = step.reading.slice(0, -1);
    assert.ok(body.startsWith('しめ'));
    const answer = 'しま' + body.slice(2) + 'っだ';
    const result = analyze(answer, step, close, form);
    assertReview(result, 2);
    assert.equal(result.diagnosis.review.rootMismatch.expected, 'しめ');
    const again = analyze(answer, result.steps[1], close, form);
    assertReview(again, 0);
  }
});

test('exact diagnostics, strict class collisions, accepted forms and ordinary lexical retries keep precedence', () => {
  assert.equal(analyze('しめたがった').kind, 'correct');
  for (const answer of ['しまたがった', 'ししめたがった', 'めしたがった']) {
    const result = analyze(answer);
    assert.equal(result.kind, 'typo', answer);
    assert.equal(result.diagnosis, null);
    assert.deepEqual(result.steps, []);
  }
  const collision = analyze('しめたがた');
  assert.equal(collision.diagnosis.stage.form, 'past');
  assert.equal(collision.diagnosis.review, undefined);
  assert.equal(collision.steps.length, 2);
  const explicit = analyze('しめたがっだ');
  assert.equal(explicit.diagnosis.kcId, 'suffix.past');
  assert.equal(explicit.diagnosis.review, undefined);
  assert.deepEqual(explicit.steps, []);
  for (const answer of ['しめたがった', 'しめたがっだ', 'しめたがんた', 'しまたがった']) {
    assert.deepEqual(unifiedStepDiagnosticSteps(close, defaultStep(), { answer }), [], answer);
  }
});

test('multiple root edits, changed stem rows or auxiliaries, missing roots and unsupported tails do not receive mixed review', () => {
  for (const answer of ['さまたがだ', 'たがだ', 'しめたぎだ', 'しまたぎだ', 'しまたがたた', 'しまたがだった',
    'しまたがxyz', '§しまたがだ', 'しまたがだ§', '締めたがだ']) {
    const result = analyze(answer);
    assert.equal(result.diagnosis?.review, undefined, answer);
    assertGenericOrTerminal(result,defaultStep().kcIds);
  }
  // き is the godan connective stem, outside 書く's unchanged lexical か.
  for (const answer of ['かまたがだ', 'きたがだ']) {
    const result = analyze(answer, defaultStep(write), write);
    assert.equal(result.diagnosis?.review, undefined, answer);
    assertGenericOrTerminal(result,defaultStep(write).kcIds);
  }
  const given = analyze('しまたがだ').steps[1];
  assert.equal(analyze('しめたぎだ', given).diagnosis?.review, undefined);
});

test('conflicting contraction boundaries and insufficient original scoring scope stay conservative', () => {
  // The final い can belong to provided ている or be an error after てる.
  const ambiguous = analyze('しまていだ', defaultStep(close, 'teiruPast'), close, 'teiruPast');
  assert.equal(ambiguous.diagnosis?.review, undefined);
  assertGenericOrTerminal(ambiguous,defaultStep(close,'teiruPast').kcIds);
  const wait = { domain: 'verb', class: 'godan', surface: '待つ', reading: 'まつ' };
  const step = defaultStep(wait, 'teoruPast');
  assert.equal(step.kcIds.includes('onbin.sokuon'), false);
  const result = analyze('さっておだ', step, wait, 'teoruPast');
  assert.equal(result.diagnosis?.review, undefined);
  assertGenericOrTerminal(result,step.kcIds);
  assert.ok(result.steps.every(probe=>!probe.kcIds.includes('onbin.sokuon')));
});

test('non-ru and special auxiliaries or different target endings do not inherit this review', () => {
  for (const [form, answer] of [
    ['temorauPast', 'しまでもらだ'], ['teshimauPast', 'しまでしまだ'],
    ['teikuPast', 'しまでいだ'], ['tearuPast', 'しまであだ'],
    ['tekuruPast', 'しまでくた'], ['youtosuruPast', 'しまようとすだ'],
    ['tagaruNegative', 'しまたがない'], ['tagaruNegativePast', 'しまたがなかった'],
  ]) {
    const result = analyze(answer, defaultStep(close, form), close, form);
    assert.equal(result.diagnosis?.review, undefined, answer);
    assertGenericOrTerminal(result,defaultStep(close,form).kcIds);
  }
});
