import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { emptySkillStats, updateKnowledgeStats } from '../app/lib/adaptive.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';

// Independent learner inputs: each has both a complete wrong-class reading
// and a local sound/suffix omission or insertion. Neither cause is proven.
const cases = [
  ['買う', 'かう', 'godan', 'past', 'かた', 'onbin.sokuon'],
  ['取る', 'とる', 'godan', 'past', 'とた', 'onbin.sokuon'],
  ['書く', 'かく', 'godan', 'te', 'かて', 'onbin.i'],
  ['帰る', 'かえる', 'godan', 'past', 'かえた', 'onbin.sokuon'],
  ['起きる', 'おきる', 'ichidan', 'past', 'おきった', 'suffix.past'],
];

test('a supported local error cannot be shadowed by a classification candidate', () => {
  for (const [surface, reading, cls, form, input, rule] of cases) {
    const item = { domain: 'verb', surface, reading, class: cls };
    const result = createAnswerAnalyzer(item, form)(input);
    assert.equal(result.kind, 'incorrect', input);
    assert.equal(result.diagnosis?.kcId ?? null, null, input);
    assert.deepEqual(result.diagnosis?.confirmedKcIds ?? [], [], input);
    assert.ok(result.steps.some(step => step.kcIds.includes(rule)), input);
    assert.ok(result.steps.every(step => step.kind === 'atomic'), input);
    const kcIds = deriveUnified(item, form).requiredKcIds;
    const before = Object.fromEntries(kcIds.map(id => [id, emptySkillStats()]));
    assert.deepEqual(updateKnowledgeStats(before, { kcIds, correct: false,
      failedKcId: result.diagnosis?.kcId }), before, input);
    for (const step of result.steps) {
      assert.ok(step.kcIds.every(id => !/^(class\.|facet\.|lexeme\.|heuristic\.)/.test(id)), input);
      const checked = createAnswerAnalyzer(item, form, { step })(step.readings[0]);
      assert.equal(checked.kind, 'correct');
      assert.deepEqual(checked.steps, []);
    }
  }
});

test('unique sound errors and explicit classification answers remain assessable', () => {
  const item = { domain: 'verb', surface: '読む', reading: 'よむ', class: 'godan' };
  assert.equal(createAnswerAnalyzer(item, 'past')('よみた').diagnosis?.kcId, 'onbin.hatsuon');
  assert.equal(createAnswerAnalyzer(item, 'past')('よんた').diagnosis?.kcId, 'onbin.voicing');
  assert.equal(createAnswerAnalyzer(item, null)('一段动词').diagnosis?.kcId, 'class.godan');
});
