import assert from 'node:assert/strict';
import { test } from 'node:test';
import { continuationAnswers } from '../app/lib/continuation-answers.mjs';

test('a provided long causative accepts only continuations of its ichidan tail', () => {
  for (const [ending, answers, readings, expected, expectedReading] of [
    ['past', ['書かせた', '書かした'], ['かかせた', 'かかした'], '書かせた', 'かかせた'],
    ['negative', ['書かせない', '書かさない'], ['かかせない', 'かかさない'], '書かせない', 'かかせない'],
    ['negativePast', ['書かせなかった', '書かさなかった'], ['かかせなかった', 'かかさなかった'], '書かせなかった', 'かかせなかった'],
  ]) {
    const result = continuationAnswers({ baseForm: 'causative', ending, surfaceBase: '書かせる', readingBase: 'かかせる', answers, readings });
    assert.deepEqual(result, { answers: [expected], readings: [expectedReading] });
    assert.equal(answers.length, 2, 'filtering must not change whole-question acceptance');
    assert.equal(readings.length, 2);
  }
});

test('causative continuation filtering depends on the supplied tail, not the original word class', () => {
  const result = continuationAnswers({ baseForm: 'causative', ending: 'past',
    surfaceBase: '食べさせる', readingBase: 'たべさせる',
    answers: ['食べさせた', '食べさした'], readings: ['たべさせた', 'たべさした'] });
  assert.deepEqual(result, { answers: ['食べさせた'], readings: ['たべさせた'] });
});

test('same-class teiru contractions remain available to supplied-base continuations', () => {
  for (const [ending, answers, readings] of [
    ['past', ['書いていた', '書いてた'], ['かいていた', 'かいてた']],
    ['negative', ['書いていない', '書いてない'], ['かいていない', 'かいてない']],
    ['negativePast', ['書いていなかった', '書いてなかった'], ['かいていなかった', 'かいてなかった']],
  ]) {
    assert.deepEqual(continuationAnswers({ baseForm: 'teiru', ending,
      surfaceBase: '書いている', readingBase: 'かいている', answers, readings }), { answers, readings });
  }
});

test('the causative filter does not restrict a supplied short causative or unrelated forms', () => {
  const short = { baseForm: 'causative', ending: 'negative', surfaceBase: '書かす', readingBase: 'かかす',
    answers: ['書かさない'], readings: ['かかさない'] };
  assert.deepEqual(continuationAnswers(short), { answers: short.answers, readings: short.readings });
  const passive = { baseForm: 'causativePassive', ending: 'past', surfaceBase: '書かせられる', readingBase: 'かかせられる',
    answers: ['書かせられた', '書かされた'], readings: ['かかせられた', 'かかされた'] };
  assert.deepEqual(continuationAnswers(passive), { answers: passive.answers, readings: passive.readings });
});
