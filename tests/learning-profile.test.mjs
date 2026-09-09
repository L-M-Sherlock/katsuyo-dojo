import assert from 'node:assert/strict';
import test from 'node:test';
import { assessmentCatalog, applyLearningObservation } from '../app/lib/learning-profile.mjs';
import { assessmentTarget, emptyAssessment, retestStatus } from '../app/lib/learning-assessment.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { updateSkillStats } from '../app/lib/adaptive.mjs';

const at = '2026-09-09T02:00:00.000Z';
const make = (surface, reading, cls, form, courseId = 'aspect') => {
  const item = { domain: 'verb', surface, reading, class: cls };
  return { id: `${courseId}:${form}:${surface}`, courseId, item, form, kcIds: deriveUnified(item, form).requiredKcIds };
};
const noru = make('乗る', 'のる', 'godan', 'teiruNegative');
const matsu = make('待つ', 'まつ', 'godan', 'teiruNegative');
const toru = make('取る', 'とる', 'godan', 'teiruNegative');
const yomu = make('読む', 'よむ', 'godan', 'teiruNegative');
const fillers = [make('食べる', 'たべる', 'ichidan', 'masu', 'masu'), make('書く', 'かく', 'godan', 'tai', 'desire')];
const catalog = assessmentCatalog([noru, matsu, toru, yomu, ...fillers]);
const fresh = () => ({ date: '2026-09-09', attempted: 7, correct: 6, streak: 2, byKc: {}, assessment: emptyAssessment() });
const observe = (profile, exercise, questionId, outcome, extra = {}, registry = catalog) => applyLearningObservation(profile, exercise,
  { type: 'question', questionId, eventId: `${questionId}:event`, at, outcome, ...extra }, registry);
const target = (profile, exercise = noru) => profile.assessment.byTarget[assessmentTarget(exercise).key];
const pending = (profile, exercise = noru) => profile.assessment.pending[assessmentTarget(exercise).key];
const gap = profile => fillers.reduce((state, exercise, i) => observe(state, exercise, `filler-${profile.assessment.originalCount}-${i}`, 'correct').profile, profile);

test('a wrong whole form plus all successful supplied steps never becomes independent application credit', () => {
  const before = fresh();
  before.byKc['apply.teiru.continuation'] = updateSkillStats(undefined, { correct: true });
  const initial = structuredClone(before);
  let profile = observe(before, noru, 'q1', 'incorrect').profile;
  assert.ok(pending(profile));
  assert.deepEqual(profile.byKc, before.byKc);
  assert.equal(profile.assessment.originalCount, 1);
  assert.deepEqual(before, initial, 'input profile is immutable');
  const step = { form: 'teiruNegative', continuation: true, providedClass: 'ichidan', kind: 'continuation',
    kcIds: [...noru.kcIds], focusId: 'suffix.negative' };
  const result = observe(profile, noru, 'q1', 'correct', { type: 'step', eventId: 'q1:step:1', step, responseMs: 5000, answerLength: 6, at: '2026-09-09T03:00:00Z' });
  profile = result.profile;
  assert.deepEqual(result.support, { independent: false, source: 'guided', provided: ['subgoal', 'intermediate', 'word-class'] });
  assert.deepEqual(profile.byKc, before.byKc);
  assert.deepEqual(profile.assessment.independentByKc, {});
  assert.equal(profile.assessment.assistedByKc['suffix.negative'].correct, 1);
  assert.equal(profile.assessment.assistedByKc['suffix.negative'].cleanTimeCount, 0);
  for (const id of ['class.godan', 'heuristic.ru-other', 'apply.teiru.continuation', 'facet.apply.teiru.negative']) assert.equal(profile.assessment.assistedByKc[id], undefined, id);
  assert.equal(pending(profile).lastPresentedAt, '2026-09-09T03:00:00.000Z');
  assert.equal(profile.assessment.originalCount, 1);
  assert.equal(target(profile).independentCorrect, 0);
  assert.equal(target(profile).assistedStepCorrect, 1);
  assert.equal(profile.attempted, before.attempted, 'wrapper leaves daily counters for the atomic page save');
});

test('whole failures score only the supplied valid attribution and partial observable evidence', () => {
  const failed = observe(fresh(), noru, 'q1', 'incorrect', { failedKcId: 'suffix.negative', confirmedKcIds: ['stem.ichidan.drop-ru', 'class.godan', 'not.in.scope'] }).profile;
  assert.equal(failed.byKc['suffix.negative'].attempts, 1);
  assert.equal(failed.byKc['suffix.negative'].correct, 0);
  assert.equal(failed.byKc['stem.ichidan.drop-ru'].correct, 1);
  assert.equal(failed.byKc['class.godan'], undefined);
  assert.equal(failed.byKc['apply.teiru.continuation'], undefined);
  assert.deepEqual(pending(failed).failedKcIds, ['suffix.negative']);
  const invalid = observe(fresh(), noru, 'q1', 'incorrect', { failedKcId: 'adj.suffix.na-past' }).profile;
  assert.deepEqual(invalid.byKc, {});
  assert.deepEqual(pending(invalid).failedKcIds, []);
});

test('first-original and step event receipts make rescoring exact-once', () => {
  const first = observe(fresh(), noru, 'q1', 'incorrect', { failedKcId: 'suffix.negative' });
  const duplicate = observe(first.profile, noru, 'q1', 'correct', { eventId: 'different-button-event' });
  assert.equal(duplicate.profile, first.profile);
  assert.equal(duplicate.duplicate, true);
  const step = { kind: 'atomic', form: 'negative', kcIds: ['suffix.negative'], focusId: 'suffix.negative' };
  const second = observe(first.profile, noru, 'q1', 'correct', { type: 'step', eventId: 'q1:step:1', step });
  const repeated = observe(second.profile, noru, 'q1', 'correct', { type: 'step', eventId: 'q1:step:1', step });
  assert.equal(repeated.profile, second.profile);
  assert.equal(repeated.duplicate, true);
  assert.equal(target(repeated.profile).assistedStepAttempts, 1);
  assert.equal(repeated.profile.assessment.assistedByKc['suffix.negative'].attempts, 1);
});

test('typographical or invalid original retries do not count; a lexical-only retry can still qualify', () => {
  const before = fresh();
  for (const outcome of ['typo', 'invalid']) {
    const retry = observe(before, noru, 'q1', outcome);
    assert.equal(retry.profile, before);
    assert.equal(retry.support.independent, false);
    assert.equal(retry.profile.assessment.originalCount, 0);
    assert.equal(retry.profile.assessment.seenQuestionIds.length, 0);
  }
  const corrected = observe(before, noru, 'q1', 'correct', { lexicalRetry: true });
  assert.equal(corrected.support.independent, true);
  assert.deepEqual(corrected.support.provided, ['lexical-retry']);
  assert.equal(target(corrected.profile).independentCorrect, 1);
  assert.equal(corrected.profile.byKc['apply.teiru.continuation'].correct, 1);
  assert.equal(pending(corrected.profile), undefined);
  const grammarFeedback = observe(before, noru, 'q2', 'correct', { lexicalRetry: true, hadGrammarFeedback: true });
  assert.equal(grammarFeedback.support.independent, false);
  assert.equal(grammarFeedback.support.source, 'feedback-retry');
  assert.equal(grammarFeedback.profile.byKc['apply.teiru.continuation'], undefined);
  assert.ok(pending(grammarFeedback.profile));
});

test('hinted and revealed originals retain pending, and revealing never guesses a failed atom', () => {
  for (const extra of [{ hintUsed: true }, { hadGrammarFeedback: true }, { outcome: 'revealed' }]) {
    const result = observe(fresh(), noru, 'q1', 'correct', { failedKcId: 'suffix.negative', ...extra });
    assert.equal(result.support.independent, false);
    assert.deepEqual(result.profile.byKc, {});
    assert.deepEqual(result.profile.assessment.independentByKc, {});
    assert.equal(target(result.profile).independentAttempts, 0);
    assert.equal(target(result.profile).assistedOriginalAttempts, 1);
    assert.deepEqual(pending(result.profile).failedKcIds, []);
    if (extra.outcome === 'revealed') {
      assert.deepEqual(result.profile.assessment.assistedByKc, {});
      assert.equal(pending(result.profile).failures, 1);
    } else {
      assert.equal(pending(result.profile).failures, 0);
      assert.equal(pending(result.profile).lastFailureAt, null);
      assert.equal(pending(result.profile).lastFailureOrdinal, null);
    }
  }
});

test('showing a hint before any submission persists a zero-attempt obligation through refresh', () => {
  const before = fresh();
  const shown = observe(before, noru, 'not-yet-submitted', 'shown', { type: 'hint', eventId: 'hint:first' });
  assert.equal(shown.support.independent, false);
  assert.equal(shown.support.source, 'hinted');
  assert.deepEqual(shown.support.provided, ['hint']);
  assert.equal(shown.profile.byKc, before.byKc);
  assert.equal(shown.profile.assessment.originalCount, 0);
  assert.deepEqual(shown.profile.assessment.seenQuestionIds, []);
  assert.deepEqual(shown.profile.assessment.seenAssistedIds, []);
  assert.equal(target(shown.profile).attempts, 0);
  assert.equal(target(shown.profile).assistedOriginalAttempts, 0);
  assert.equal(pending(shown.profile).failures, 0);
  assert.equal(pending(shown.profile).lastFailureAt, null);
  assert.equal(pending(shown.profile).lastFailureOrdinal, null);
  assert.equal(pending(shown.profile).createdOrdinal, 0);
  assert.equal(pending(shown.profile).reason, 'hinted');
  assert.equal(shown.retest.eligible, false);
  const reloaded = JSON.parse(JSON.stringify(shown.profile));
  const repeated = observe(reloaded, noru, 'not-yet-submitted', 'shown', { type: 'hint', eventId: 'hint:first', at: '2026-09-09T23:00:00Z' });
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.profile, reloaded);
  const refreshedOriginal = observe(reloaded, noru, 'new-question-after-refresh', 'correct');
  assert.equal(refreshedOriginal.support.source, 'rehearsal');
  assert.equal(target(refreshedOriginal.profile).independentCorrect, 0);
  assert.equal(target(refreshedOriginal.profile).assistedOriginalCorrect, 1);
  assert.equal(pending(refreshedOriginal.profile).failures, 0, 'correct rehearsal is not rewritten as an error');
  const available = gap(refreshedOriginal.profile);
  const retest = observe(available, matsu, 'qualified-new-word', 'correct');
  assert.equal(retest.support.independent, true);
  assert.equal(target(retest.profile).independentCorrect, 1);
  assert.equal(pending(retest.profile), undefined);
});

test('showing a hint for an already-due target restarts its gap without inventing a new failure', () => {
  const before = gap(observe(fresh(), noru, 'failed', 'incorrect').profile);
  assert.equal(retestStatus(pending(before), matsu, { originalCount: before.assessment.originalCount, at }).eligible, true);
  const hint = observe(before, matsu, 'due-but-hinted', 'shown', { type: 'hint', eventId: 'hint:due', at: '2026-09-09T04:00:00Z' });
  assert.equal(hint.profile.assessment.originalCount, before.assessment.originalCount);
  assert.equal(hint.profile.assessment.byTarget, before.assessment.byTarget);
  assert.equal(pending(hint.profile).lastPresentedOrdinal, before.assessment.originalCount);
  assert.equal(pending(hint.profile).lastPresentedAt, '2026-09-09T04:00:00.000Z');
  assert.equal(pending(hint.profile).lastFailureAt, pending(before).lastFailureAt);
  assert.equal(pending(hint.profile).failures, 1);
  assert.equal(hint.retest.eligible, false);
  assert.equal(hint.retest.remainingQuestions, 2);
  const refreshed = observe(JSON.parse(JSON.stringify(hint.profile)), matsu, 'refreshed', 'correct', { at: '2026-09-09T04:01:00Z' });
  assert.equal(refreshed.support.source, 'rehearsal');
  assert.equal(target(refreshed.profile).independentCorrect, 0);
});

test('rehearsal qualification agrees across support, target totals, atomic buckets and eventual retest clearing', () => {
  let profile = observe(fresh(), noru, 'q1', 'incorrect').profile;
  const early = observe(profile, matsu, 'q2', 'correct');
  assert.equal(early.support.source, 'rehearsal');
  assert.equal(early.support.independent, false);
  assert.equal(target(early.profile).independentAttempts, 1);
  assert.equal(target(early.profile).independentCorrect, 0);
  assert.equal(target(early.profile).assistedOriginalCorrect, 1);
  assert.equal(early.profile.byKc['apply.teiru.continuation'], undefined);
  assert.equal(early.profile.assessment.assistedByKc['suffix.negative'].correct, 1);
  profile = gap(early.profile);
  const retest = observe(profile, toru, 'q5', 'correct');
  assert.equal(retest.support.independent, true);
  assert.equal(retest.retest.eligible, true);
  assert.equal(pending(retest.profile), undefined);
  assert.equal(target(retest.profile).independentCorrect, 1);
  assert.equal(target(retest.profile).assistedOriginalCorrect, 1);
  assert.equal(retest.profile.byKc['apply.teiru.continuation'].correct, 1);
  assert.equal(retest.profile.byKc['facet.apply.teiru.negative'].correct, 1);
});

test('diagnostic-only steps, completion and skipping update operation time but never atom or original scores', () => {
  let profile = gap(observe(fresh(), noru, 'q1', 'incorrect').profile);
  const oldOriginals = profile.assessment.originalCount, byKc = profile.byKc;
  const diagnostic = observe(profile, noru, 'q1', 'correct', { type: 'step', eventId: 'q1:class', at: '2026-09-09T05:00:00Z', step: { kind: 'classification', diagnosticOnly: true, kcIds: ['class.ichidan'], form: null } });
  assert.equal(diagnostic.support.source, 'diagnostic');
  assert.deepEqual(diagnostic.profile.assessment.assistedByKc, {});
  assert.equal(diagnostic.profile.byKc, byKc);
  profile = diagnostic.profile;
  for (const [index, outcome] of ['completed', 'skipped'].entries()) {
    const result = observe(profile, noru, 'q1', outcome, { type: 'diagnostic-end', eventId: `q1:${outcome}`, at: `2026-09-09T0${6 + index}:00:00Z` });
    assert.equal(result.profile.byKc, byKc);
    assert.equal(result.profile.assessment.originalCount, oldOriginals);
    assert.equal(result.profile.assessment.byTarget, profile.assessment.byTarget);
    assert.equal(pending(result.profile).lastPresentedOrdinal, oldOriginals);
    assert.equal(pending(result.profile).lastPresentedAt, `2026-09-09T0${6 + index}:00:00.000Z`);
    assert.equal(observe(result.profile, noru, 'q1', outcome, { type: 'diagnostic-end', eventId: `q1:${outcome}` }).duplicate, true);
    profile = result.profile;
  }
});

test('step typo and invalid retry operations restart assistance delay without becoming scored attempts', () => {
  let profile = gap(observe(fresh(), noru, 'q1', 'incorrect').profile);
  const beforeCounts = structuredClone(target(profile));
  for (const [index, outcome] of ['typo', 'invalid'].entries()) {
    const extra = { type: 'step', eventId: `q1:${outcome}`, at: `2026-09-09T0${7 + index}:00:00Z`, step: { kind: 'atomic', form: 'negative', kcIds: ['suffix.negative'] } };
    const retry = observe(profile, noru, 'q1', outcome, extra);
    assert.deepEqual(retry.profile.assessment.byTarget[assessmentTarget(noru).key], beforeCounts);
    assert.equal(retry.profile.byKc, profile.byKc);
    assert.equal(retry.profile.assessment.assistedByKc, profile.assessment.assistedByKc);
    assert.equal(retry.profile.assessment.originalCount, profile.assessment.originalCount);
    assert.equal(pending(retry.profile).lastPresentedAt, `2026-09-09T0${7 + index}:00:00.000Z`);
    assert.equal(pending(retry.profile).lastPresentedOrdinal, profile.assessment.originalCount);
    assert.equal(observe(retry.profile, noru, 'q1', outcome, extra).duplicate, true);
    assert.equal(observe(retry.profile, noru, 'q1', 'correct', extra).duplicate, true, 'an event id cannot be reinterpreted as a later scored step');
    profile = retry.profile;
  }
});

test('singleton eligibility uses the complete catalog and question gap after assistance', () => {
  const iku = make('行く', 'いく', 'godan', 'past', 'past');
  const full = assessmentCatalog([iku, ...fillers]);
  let profile = gap(observe(fresh(), iku, 'i1', 'incorrect', {}, full).profile);
  profile = observe(profile, iku, 'i1', 'completed', { type: 'diagnostic-end', eventId: 'i1:end', at: '2026-09-09T18:00:00Z' }, full).profile;
  profile = gap(profile);
  const tooSoon = observe(profile, iku, 'i2', 'correct', { at: '2026-09-10T02:00:00Z' }, full);
  assert.equal(tooSoon.support.source, 'independent');
  assert.equal(pending(tooSoon.profile, iku), undefined);
  assert.equal(tooSoon.retest.availableAt, null);
  assert.equal(target(tooSoon.profile, iku).independentCorrect, 1);
  const ready = profile;
  const eligible = observe(ready, iku, 'i3', 'correct', { at: '2026-09-11T02:00:00Z' }, full);
  assert.equal(eligible.retest.policy, 'single-word-spaced');
  assert.equal(eligible.support.independent, true);
  assert.equal(pending(eligible.profile, iku), undefined);
  const ordinary = gap(observe(fresh(), noru, 'n1', 'incorrect').profile);
  const sameWord = observe(ordinary, noru, 'n2', 'correct', { at: '2026-09-15T00:00:00Z' }, catalog);
  assert.equal(sameWord.retest.reason, 'same-word', 'other current catalog words prohibit singleton exception despite a long delay');
  assert.equal(retestStatus(pending(sameWord.profile), matsu, { originalCount: ordinary.assessment.originalCount, at }).eligible, false, 'new same-target rehearsal restarted spacing');
});
