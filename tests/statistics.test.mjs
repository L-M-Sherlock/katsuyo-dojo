import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyStatistics, recordStatisticsEvent, recordActiveTime, initializeStatistics, parseStatistics, statisticsSeries } from '../app/lib/statistics.mjs';
import { createStatisticsClock } from '../app/lib/statistics-clock.mjs';
import { emptyAssessment, recordIndependentAttempt } from '../app/lib/learning-assessment.mjs';

const at = '2026-09-15T01:00:00.000Z';
const event = (sequence, extra = {}) => ({ id: `event-${sequence}`, sequence, questionId: `q-${sequence}`, at, type: 'question', outcome: 'correct',
  exercise: { domain: 'verb', courseId: 'past', form: 'past' }, support: { independent: true, source: 'independent' }, diagnosis: { kcId: null, resolution: 'correct' },
  totals: { after: { date: '2026-09-15' } }, ...extra });
const snapshot = { all: { mastered: 2, unlocked: 4, kcs: 119, courses: 0, courseTotal: 43, pending: 1, suspended: 0 } };

test('statistics count whole questions once and keep independent, assisted, revealed and probes separate', () => {
  let s = emptyStatistics(at), previous = structuredClone(s);
  s = recordStatisticsEvent(s, event(1), { answerMs: 2100, progress: snapshot });
  assert.deepEqual(previous, emptyStatistics(at));
  s = recordStatisticsEvent(s, event(2, { outcome: 'incorrect', diagnosis: { kcId: 'suffix.past', resolution: 'rule' } }));
  s = recordStatisticsEvent(s, event(3, { support: { independent: false, source: 'hinted' } }), { answerMs: 100 });
  s = recordStatisticsEvent(s, event(4, { outcome: 'revealed', support: { independent: false, source: 'revealed' } }));
  s = recordStatisticsEvent(s, event(5, { type: 'step' }));
  s = recordStatisticsEvent(s, event(6, { type: 'hint', outcome: 'shown' }));
  s = recordStatisticsEvent(s, event(7, { outcome: 'typo' }));
  assert.equal(s.totals.questions, 4); assert.equal(s.totals.correct, 2);
  assert.equal(s.totals.independent, 2); assert.equal(s.totals.independentCorrect, 1);
  assert.equal(s.totals.assisted, 2); assert.equal(s.totals.revealed, 1);
  assert.equal(s.totals.steps, 1); assert.equal(s.totals.hints, 1); assert.equal(s.totals.typos, 1);
  assert.equal(s.totals.answerMs, 2100); assert.equal(s.totals.answerSamples, 1);
  assert.deepEqual(s.kcErrors, { 'suffix.past': 1 });
  assert.deepEqual(s.errorsByDomain.verb, { 'kc:suffix.past': 1 });
  assert.equal(recordStatisticsEvent(s, event(7)), s);
  const repeated = recordStatisticsEvent(s, event(8, { questionId: 'q-1' }));
  assert.equal(repeated.totals.questions, 4);
  assert.equal(repeated.throughSequence, 8);
  assert.equal(parseStatistics(s, { sequence: 7, ordinal: 4 }).totals.questions, 4);
});

test('retest rates exclude help, pauses, and unrelated removals of obligations', () => {
  let s = emptyStatistics(at);
  s = recordStatisticsEvent(s, event(1, { assessment: { eligibility: { eligible: true } } }));
  s = recordStatisticsEvent(s, event(2, { outcome: 'incorrect', assessment: { eligibility: { eligible: true } } }));
  s = recordStatisticsEvent(s, event(3, { assessment: { eligibility: { eligible: true } }, support: { independent: false, source: 'hinted' } }), { retestAttempt: true });
  s = recordStatisticsEvent(s, event(4, { type: 'migration', outcome: 'migrated' }));
  assert.equal(s.totals.retests, 2); assert.equal(s.totals.retestCorrect, 1); assert.equal(s.totals.assistedRetests, 1);
});

test('daily and ordinal compaction preserve counts, time, and historical coverage', () => {
  let s = emptyStatistics('2024-01-01T00:00:00Z');
  for (let i = 1; i <= 1050; i++) s = recordStatisticsEvent(s, event(i));
  assert.equal(s.recent.length, 1000); assert.equal(s.totals.questions, 1050);
  const total = s.ranges.reduce((sum, r) => sum + r.period.all.questions, 0);
  assert.equal(total, 1050);
  s = recordActiveTime(s, [{ domain: 'verb', courseId: 'past', day: '2024-01-01', ms: 1234 }, { domain: 'verb', courseId: 'past', day: '2026-09-15', ms: 4567 }]);
  assert.equal(s.days['2024-01-01'], undefined); assert.equal(s.months['2024-01'].all.activeMs, 1234);
  assert.equal(s.totals.activeMs, 5801);
  assert.equal(statisticsSeries(s, 'ordinal', '100').reduce((sum, row) => sum + row.counts.questions, 0), 100);
  assert.deepEqual(parseStatistics(s), s);
  // Exercise the retention boundary without 50,000 expensive UI submissions.
  s.ranges = Array.from({ length: 1000 }, (_, i) => ({ from: i * 50 + 1, to: (i + 1) * 50, period: { all: { ...s.totals, questions: 50, correct: 50, independent: 50, independentCorrect: 50 }, progress: null } }));
  s.ordinal = 50000;
  const next = recordStatisticsEvent(s, event(1051), { ordinal: 50001 });
  assert.ok(next.ranges.length <= 1000);
  assert.equal(next.ranges.reduce((sum, r) => sum + r.period.all.questions, 0), 50001);
});

test('legacy cumulative counts survive partial backfill without invented time or mastery history', () => {
  const e = { item: { domain: 'verb', surface: '書く', reading: 'かく', class: 'godan' }, form: 'past', courseId: 'past' };
  let assessment = emptyAssessment();
  for (let i = 1; i <= 10; i++) assessment = recordIndependentAttempt(assessment, { exercise: e, questionId: `old-${i}`, correct: true, at });
  const profile = { assessment, practiceLog: { totalEvents: 10, droppedEntries: 8, events: [event(9), event(10)] } };
  const source = structuredClone(profile);
  const s = initializeStatistics(profile, at, snapshot);
  assert.equal(s.totals.questions, 10); assert.equal(s.earlyQuestions, 8); assert.equal(s.totals.independent, 10);
  assert.equal(s.recent.length, 2); assert.equal(s.recent[0].ordinal, 9); assert.equal(s.partialHistory, true);
  assert.equal(s.recent[0].progress, null); assert.equal(s.totals.activeMs, 0); assert.equal(s.totals.answerSamples, 0);
  assert.deepEqual(profile, source);
  assert.deepEqual(parseStatistics(s, { sequence: 10, ordinal: 10 }), s);
  assert.equal(statisticsSeries(s, 'date', 'all', 'all').at(-1).progress.mastered, snapshot.all.mastered);
  const bad = structuredClone(s); bad.totals.independentCorrect = 11;
  assert.throws(() => parseStatistics(bad));
  assert.throws(() => parseStatistics(s, { sequence: 11, ordinal: 10 }));
});

test('time statistics pause in background and after idle, preserve the answer timer and split midnight', () => {
  let now = 0; const start = new Date(2026, 8, 15, 23, 59, 50).getTime();
  const clock = createStatisticsClock({ now: () => now, wall: () => new Date(start + now) });
  clock.setContext({ enabled: true, answering: true, domain: 'verb', courseId: 'past' });
  now = 20000; assert.equal(clock.answerDuration(), 20000);
  let fragments = clock.drain(); assert.deepEqual(fragments.map(p => [p.day, p.ms]), [['2026-09-15', 10000], ['2026-09-16', 10000]]);
  clock.setContext({ enabled: false }); now += 100000; clock.setContext({ enabled: true });
  now += 90000; assert.equal(clock.answerDuration(), 80000, 'idle time stops at 60 seconds, hidden time never counts');
  clock.touch(); now += 5000; assert.equal(clock.answerDuration(), 85000);
  clock.resetAnswer(); clock.setContext({ answering: false }); now += 2000;
  assert.equal(clock.answerDuration(), 0, 'reading feedback contributes active time but not answer time');
  fragments = clock.drain(); assert.equal(fragments.reduce((sum, p) => sum + p.ms, 0), 67000);
  assert.deepEqual(clock.drain(), []); clock.restore(fragments); assert.equal(clock.drain().length, fragments.length);
});
