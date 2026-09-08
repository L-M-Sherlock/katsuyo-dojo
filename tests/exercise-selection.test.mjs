import assert from 'node:assert/strict';
import test from 'node:test';
import { assignPracticeExercises, exerciseKey, normalizeRecentWordKeys, recordRecentWord, RECENT_WORD_LIMIT, wordKey } from '../app/lib/exercise-selection.mjs';

const focus = { id: 'application', coverageKcIds: ['facet.past', 'facet.negative', 'facet.negativePast'] };
const exercise = (surface, form = 'past', kcIds = [focus.id, `facet.${form}`]) => ({ item: { domain: 'verb', surface }, form, kcIds });
const pool = Array.from({ length: 50 }, (_, i) => ['past', 'negative', 'negativePast'].map(form => exercise(i === 0 ? '包む' : `単語${i}`, form))).flat();
const select = (options = {}, plan = Array(12).fill(focus)) => assignPracticeExercises(plan, { alternativesFor: () => [], candidatesFor: () => pool, ...options });
const words = assignments => assignments.map(({ candidate }) => wordKey(candidate));

test('every missing form is scheduled while different forms use different words', () => {
  for (let seed = 0; seed < 64; seed++) {
    const assigned = select({ seed });
    assert.equal(new Set(words(assigned)).size, 12);
    assert.equal(new Set(assigned.slice(0, 3).map(({ candidate }) => candidate.form)).size, 3);
    assert.equal(new Set(assigned.map(({ candidate }) => exerciseKey(candidate))).size, 12);
  }
});

test('selection ignores locale and pool order but changes with seed', () => {
  const original = String.prototype.localeCompare;
  try {
    String.prototype.localeCompare = () => { throw new Error('locale-dependent selection'); };
    assert.deepEqual(select({ seed: 17 }), select({ seed: 17, candidatesFor: () => [...pool].reverse() }));
    const firstWords = new Set(Array.from({ length: 32 }, (_, seed) => words(select({ seed }))[0]));
    assert.ok(firstWords.size > 12, `seeds selected only ${firstWords.size} first words`);
  } finally { String.prototype.localeCompare = original; }
});

test('successive rounds avoid the previous 36 answered words even across forms', () => {
  let recentWordKeys = [];
  for (let seed = 0; seed < 12; seed++) {
    const recent = new Set(recentWordKeys);
    const assigned = select({ seed, recentWordKeys });
    assert.ok(words(assigned).every(key => !recent.has(key)));
    for (const { candidate } of assigned) recentWordKeys = recordRecentWord(recentWordKeys, candidate);
    assert.equal(recentWordKeys.length, Math.min((seed + 1) * 12, RECENT_WORD_LIMIT));
  }
});

test('replanning keeps consumed words and coverage from the earlier segment', () => {
  const consumed = select({}, Array(3).fill(focus));
  const usedKeys = consumed.map(({ candidate }) => exerciseKey(candidate));
  const usedWordKeys = words(consumed);
  const assigned = select({ seed: 4, usedKeys, usedWordKeys }, Array(9).fill(focus));
  assert.equal(new Set([...usedWordKeys, ...words(assigned)]).size, 12);
  assert.equal(new Set([...usedKeys, ...assigned.map(({ candidate }) => exerciseKey(candidate))]).size, 12);
});

test('mandatory coverage and weak exception lexemes take priority over recency', () => {
  const rare = exercise('来る', 'past', [focus.id, 'facet.past']);
  const common = exercise('読む', 'negative', [focus.id, 'facet.negative']);
  const assigned = select({ candidatesFor: () => [common, rare], byKc: { 'facet.negative': { correct: 1 } }, recentWordKeys: ['verb:来る'] }, [focus]);
  assert.equal(assigned[0].candidate, rare);
  const exception = { id: 'exception.ru-godan', coverageKcIds: [] };
  const weak = exercise('帰る', null, [exception.id, 'lexeme.kaeru']);
  const known = exercise('切る', null, [exception.id, 'lexeme.kiru']);
  assert.equal(select({ candidatesFor: () => [known, weak], byKc: { 'lexeme.kaeru': { confidence: .2 }, 'lexeme.kiru': { confidence: .9 } }, recentWordKeys: ['verb:帰る'] }, [exception])[0].candidate, weak);
});

test('constrained pools balance words, prefer older words and exhaust alternatives before exact repeats', () => {
  const smallPool = pool.slice(0, 6);
  const assigned = select({ candidatesFor: () => smallPool, recentWordKeys: ['verb:単語1', 'verb:包む'] });
  assert.equal(words(assigned)[0], 'verb:単語1');
  assert.equal(new Set(assigned.slice(0, 6).map(({ candidate }) => exerciseKey(candidate))).size, 6);
  assert.equal(words(assigned).filter(key => key === 'verb:包む').length, 6);
  assert.ok(assigned.every(({ candidate }) => candidate));
  const alternative = { id: 'alternative' };
  const first = exercise('包む'), second = exercise('読む');
  const result = select({ candidatesFor: item => item === focus ? [first] : [second], alternativesFor: () => [alternative] }, [focus, focus]);
  assert.deepEqual(result.map(({ candidate }) => candidate), [first, second]);
});

test('fallback uses a valid alternative when the preferred pool is empty', () => {
  const alternative = { id: 'alternative' };
  const available = exercise('読む');
  const result = select({ candidatesFor: item => item === focus ? [] : [available], alternativesFor: () => [alternative] }, [focus, focus]);
  assert.deepEqual(result.map(({ candidate }) => candidate), [available, available]);
});

test('history validation preserves chronological repeats, drops invalid values, and never mutates input', () => {
  const history = ['verb:包む', null, 10, 'bad', 'verb:', 'verb:含\n换行', `verb:${'字'.repeat(65)}`, 'adjective:早い', 'verb:包む'];
  const original = [...history];
  assert.deepEqual(normalizeRecentWordKeys(history), ['verb:包む', 'adjective:早い', 'verb:包む']);
  assert.deepEqual(recordRecentWord(history, exercise('読む')), ['verb:包む', 'adjective:早い', 'verb:包む', 'verb:読む']);
  assert.deepEqual(history, original);
  assert.deepEqual(normalizeRecentWordKeys({}), []);
  const long = Array.from({ length: 80 }, (_, i) => `verb:単語${i}`);
  assert.deepEqual(normalizeRecentWordKeys(long), long.slice(-36));
  assert.notEqual(wordKey(exercise('同形')), wordKey({ item: { domain: 'adjective', surface: '同形' } }));
});
