import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { USAGE_CARDS, PRE_REVIEWED_USAGE_CARDS, REVIEWED_USAGE_CARDS, usageCardItem, resolveUsageCard } from '../app/lib/usage-cards.mjs';
import { REVIEWED_USAGE_CARD_REVISIONS, REVIEWED_USAGE_CARD_DEFERRALS } from '../app/lib/usage-cards/reviewed-revisions.mjs';
import { EN_REVIEWED_USAGE_CARD_OVERLAYS } from '../app/lib/i18n/content/en/reviewed-usage-card-revisions.mjs';
import { EN_USAGE_CARD_OVERLAYS as BASELINE_ENGLISH } from '../app/lib/i18n/content/en/usage-cards.mjs';
import { EN_USAGE_CARD_OVERLAYS as CURRENT_ENGLISH } from '../app/lib/i18n/content/en/current-usage-cards.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { recognizeForms } from '../app/lib/form-recognition.mjs';
import { normalizeAnswer } from '../app/lib/answer-analysis.mjs';
import { isTeachingFormDeferred, USER_DIRECTED_FORM_DEFERRALS } from '../app/lib/teaching-form-deferrals.mjs';
import { TEACHING_PAIR_DEFERRALS } from '../app/lib/teaching-pair-deferrals.mjs';
import { EXPECTED_TEMIRU_TEACHING_HOLD_IDS } from './helpers/temiru-teaching-hold-scope.mjs';
import { revisionHash, verifyCurrentReviewedUsageRevisions, verifyPortableRevisionDelivery } from '../scripts/verify-reviewed-usage-revisions.mjs';

const FORM = 'temiruNegative';
const ROUND = 'temiru-negative-invitation-20261017';
const EXPECTED_FOLLOWUP_IDS = new Set([
  'usage:temiru:verb:取る:とる', 'usage:temiru:verb:持つ:もつ',
  'usage:temiruNegative:verb:変わる:かわる', 'usage:temiruNegative:verb:届ける:とどける',
  'usage:temiruNegative:verb:見る:みる', 'usage:temiruNegative:verb:持つ:もつ', 'usage:temiruNegative:verb:騒ぐ:さわぐ',
  'usage:temiruPast:verb:助ける:たすける', 'usage:temiruPast:verb:落とす:おとす', 'usage:temiruPast:verb:持つ:もつ',
  'usage:temiruRequest:verb:開ける:あける', 'usage:temiruDesireNegative', 'usage:temiruDesirePast:verb:買う:かう',
]);
const ENGLISH_CHECKS = ['englishNatural', 'meaning', 'roles', 'timeAndPolarity', 'register', 'scene', 'noAnswerLeak'];
const byId = rows => new Map(rows.map(row => [row.id, row]));
const text = parts => parts.map(part => part.text).join('');
const reading = parts => parts.map(part => part.reading ?? part.text).join('');

function reviewedProof() {
  const proof = JSON.parse(fs.readFileSync(new URL('../docs/usage-card-reviewed-revisions.v1.json', import.meta.url)));
  assert.equal(revisionHash(proof.rounds.slice(0, 3)), '5a3cfce61cd315cd4c20ca69dbaae3ce0bc591da535bc3eba2410b7b5aa5e224',
    'the original three independent rounds remain unchanged');
  return proof;
}

function invitationRound() {
  const round = reviewedProof().rounds[2];
  assert.equal(round.id, ROUND);
  assert.equal(revisionHash(round), '03678576ffdfe12e63c4e95193ab751571783c7da9036397d1aef9d4f20a7276');
  return round;
}

function frozenBatch(batch) {
  const author = verifyPortableRevisionDelivery(batch.authorDelivery, 'author', batch.id);
  const review = verifyPortableRevisionDelivery(batch.reviewDelivery, 'review', batch.id);
  return Object.fromEntries(Object.entries(batch.paths).map(([key, file]) =>
    [key, JSON.parse((key === 'report' ? review : author).get(file))]));
}

// Replay frozen delivery bytes rather than treating a later runtime revision
// as the card that an earlier reviewer approved.
function frozenState(rounds) {
  const cards = byId(PRE_REVIEWED_USAGE_CARDS), english = byId(BASELINE_ENGLISH), revisions = new Map();
  for (const round of rounds) {
    for (const source of round.sourceCards) assert.deepEqual(cards.get(source.id), source, source.id);
    for (const batch of round.batches) {
      const {cards: drafts, notes, report} = frozenBatch(batch);
      for (const [index, draft] of drafts.entries()) {
        const previous = cards.get(draft.id), final = {...draft, review: 'approved'}, row = report.rows[index];
        assert.ok(previous, draft.id);
        assert.equal(row.status, 'approved', draft.id);
        assert.equal(row.hash, revisionHash(draft), draft.id);
        assert.equal(row.sourceHash, revisionHash(final), draft.id);
        const overlay = {id: final.id, sourceHash: revisionHash(final), ...notes[index].english};
        assert.equal(row.englishHash, revisionHash(overlay), draft.id);
        cards.set(final.id, final); english.set(final.id, overlay);
        revisions.set(final.id, {id: final.id, pair: `${final.senseId}/${final.form}`,
          previousHash: revisionHash(previous), finalHash: revisionHash(final), card: final});
      }
    }
    for (const row of round.deferrals ?? []) { cards.delete(row.id); english.delete(row.id); revisions.delete(row.id); }
  }
  return {cards: PRE_REVIEWED_USAGE_CARDS.filter(card => cards.has(card.id)).map(card => cards.get(card.id)),
    english: BASELINE_ENGLISH.filter(row => english.has(row.id)).map(row => english.get(row.id)),
    revisions};
}

test('the invitation round accounts for all 123 frozen sources before later exact teaching holds', () => {
  const round = invitationRound();
  assert.equal(round.form, FORM);
  assert.equal(round.sourceCount, 123);
  assert.equal(Object.hasOwn(round, 'scopeIds'), false, 'this is a complete form review, not a narrowed subset');
  assert.equal(round.sourceCards.length, 123);
  assert.equal(new Set(round.sourceCards.map(card => card.id)).size, 123);
  // These constants were frozen before authoring. The work directory is not a release dependency.
  assert.equal(revisionHash(round.sourceCards), 'bcbecdb5772d457953d861ce2e1d58b58053f313a15b08fec8ff82adde71a0ed');
  assert.equal(revisionHash(round.sourceCards.map(card => ({ id: card.id, sourceHash: revisionHash(card) }))),
    '3bca418eb052bb29a2e0d85b61b2d3b3cd14539c7c9a01eb28e1f1f576d8749b');
  const englishBefore = byId(BASELINE_ENGLISH);
  assert.equal(revisionHash(round.sourceCards.map(card => englishBefore.get(card.id))),
    'eafd4e1ef984001bd20b6b18f1775106033ac4b62d50149eb5708fcccd8ca3f9');
  assert.ok(round.sourceCards.every(card => card.form === FORM));
  const sources = new Set(round.sourceCards.map(card => card.id));
  const approved = new Set();
  for (const batch of round.batches) {
    const { cards, report } = frozenBatch(batch);
    assert.deepEqual(report.rows.map(row => row.id), cards.map(card => card.id));
    for (const row of report.rows) {
      assert.equal(row.status, 'approved', row.id);
      assert.ok(sources.has(row.id) && !approved.has(row.id), row.id);
      approved.add(row.id);
    }
  }
  const deferred = new Set((round.deferrals ?? []).map(row => row.id));
  assert.equal(deferred.size, (round.deferrals ?? []).length);
  for (const id of deferred) assert.ok(sources.has(id) && !approved.has(id), id);
  assert.deepEqual(new Set([...approved, ...deferred]), sources);
  const heldIds = new Set(TEACHING_PAIR_DEFERRALS.map(row => row.id));
  assert.deepEqual(heldIds, EXPECTED_TEMIRU_TEACHING_HOLD_IDS);
  assert.deepEqual(new Set(USAGE_CARDS.filter(card => card.form === FORM).map(card => card.id)),
    new Set([...approved].filter(id => !heldIds.has(id))));
  assert.deepEqual(new Set(REVIEWED_USAGE_CARDS.filter(card => card.form === FORM).map(card => card.id)), approved);
  assert.deepEqual(new Set(REVIEWED_USAGE_CARD_DEFERRALS.filter(row => sources.has(row.id)).map(row => row.id)), deferred);
  const historical = frozenState(reviewedProof().rounds.slice(0, 3));
  assert.deepEqual(new Set(historical.cards.filter(card => card.form === FORM).map(card => card.id)), approved);
  const summary = verifyCurrentReviewedUsageRevisions();
  assert.equal(summary.sourceCount, 125 + 123 + 13);
  assert.equal(summary.reviewedCount, 124 + approved.size + 13);
  assert.equal(summary.deferredCount, 1 + deferred.size);
});

test('every original invitation approval binds its target, bilingual rewrite and reading decisions to frozen independent review', () => {
  const round = invitationRound();
  const original = frozenState(reviewedProof().rounds.slice(0, 3));
  const sources = byId(round.sourceCards), active = byId(original.cards);
  const currentEnglish = byId(original.english), oldEnglish = byId(BASELINE_ENGLISH);
  const revisions = original.revisions, reviewedEnglish = byId(original.english);
  for (const batch of round.batches) {
    assert.notEqual(batch.author, batch.reviewer, batch.id);
    assert.equal(batch.authorModel, 'gpt-6-luna');
    assert.equal(batch.authorEffort, 'max');
    assert.equal(batch.reviewerModel, 'gpt-6-sol');
    assert.equal(batch.reviewerEffort, 'medium');
    const { assignment, input, cards, notes, readings, checks, report } = frozenBatch(batch);
    assert.equal(report.reviewer, batch.reviewer);
    assert.equal(report.selfReview, false);
    assert.equal(report.sourceReceipt, batch.authorDelivery.receipt);
    assert.equal(report.count, cards.length);
    assert.deepEqual(input.rows.map(row => row.id), cards.map(card => card.id));
    assert.deepEqual(assignment.map(row => row.id), cards.map(card => card.id));
    assert.deepEqual(notes.map(row => row.id), cards.map(card => card.id));
    assert.equal(readings.cardsChecked, cards.length);
    assert.deepEqual(readings.structuralIssues, []);
    assert.equal(checks.cardsHash, revisionHash(cards));
    assert.equal(checks.notesHash, revisionHash(notes));
    assert.equal(checks.assignmentHash, revisionHash(assignment));
    assert.equal(checks.inputHash, revisionHash(input));
    assert.deepEqual(checks.structuralIssues, []);
    assert.deepEqual(checks.englishIssues, []);
    assert.deepEqual(report.candidates.map(row => row.id), readings.candidates.map(row => row.id));
    for (const decision of report.candidates) {
      assert.equal(decision.decision, 'retain', decision.id);
      assert.ok(decision.reason.trim(), decision.id);
    }
    for (const [index, draft] of cards.entries()) {
      const source = sources.get(draft.id), requirement = assignment[index];
      const note = notes[index], row = report.rows[index], final = active.get(draft.id);
      assert.ok(source && final, draft.id);
      assert.deepEqual(input.rows[index].card, source, draft.id);
      assert.equal(input.rows[index].sourceHash, revisionHash(source), draft.id);
      assert.deepEqual(input.rows[index].english, oldEnglish.get(draft.id), draft.id);
      for (const key of ['id', 'senseId', 'form', 'meaning']) assert.equal(draft[key], source[key], `${draft.id}/${key}`);
      assert.equal(draft.review, 'draft', draft.id);
      assert.equal(note.disposition, 'revise', draft.id);
      assert.deepEqual(final, { ...draft, review: 'approved' }, draft.id);
      assert.equal(revisions.get(draft.id).previousHash, revisionHash(source), draft.id);
      assert.equal(revisions.get(draft.id).finalHash, revisionHash(final), draft.id);
      const item = usageCardItem(final.senseId);
      const resolved = resolveUsageCard(final);
      const target = resolved?.target ?? {text: deriveUnified(item, FORM).answer,
        reading: deriveUnified({...item, surface: item.reading, lexicalSurface: item.surface}, FORM).answer};
      assert.equal(resolved === null, EXPECTED_TEMIRU_TEACHING_HOLD_IDS.has(final.id), final.id);
      assert.equal(target.text, deriveUnified(item, FORM).answer, final.id);
      assert.equal(target.reading, deriveUnified({ ...item, surface: item.reading, lexicalSurface: item.surface }, FORM).answer, final.id);
      assert.equal(requirement.answer, target.text, final.id);
      assert.equal(requirement.answerReading, target.reading, final.id);
      assert.match(target.text, /[てで]みない$/u, final.id);
      assert.doesNotMatch(target.text, /[？?]/u, 'question punctuation belongs outside the complete target slot');
      assert.match(text(final.after), /[？?]/u, final.id);
      assert.deepEqual(reading(final.after).match(/[？?]/gu), text(final.after).match(/[？?]/gu), final.id);
      assert.equal(text([...final.before, ...final.after]).includes(target.text), false, `${final.id}: target leaked outside its slot`);
      const sentence = `${text(final.before)}${target.text}${text(final.after)}`;
      const sentenceReading = `${reading(final.before)}${target.reading}${reading(final.after)}`;
      assert.ok(sentenceReading.length > target.reading.length, final.id);
      assert.equal(row.sentence, sentence, final.id);
      assert.equal(row.hash, revisionHash(draft), final.id);
      assert.equal(row.sourceHash, revisionHash(final), final.id);
      assert.equal(row.status, 'approved', final.id);
      for (const key of ['reason', 'roles', 'time', 'negation', 'translation', 'reading']) assert.ok(row[key], `${final.id}/${key}`);
      const english = { id: final.id, sourceHash: revisionHash(final), ...note.english };
      assert.deepEqual(currentEnglish.get(final.id), english, final.id);
      assert.deepEqual(reviewedEnglish.get(final.id), english, final.id);
      assert.equal(row.englishHash, revisionHash(english), final.id);
      assert.deepEqual(Object.keys(row.english.checks).sort(), [...ENGLISH_CHECKS].sort(), final.id);
      assert.ok(ENGLISH_CHECKS.every(key => row.english.checks[key] === true), final.id);
      assert.ok(row.english.reason.trim().length >= 12, final.id);
      // Changed prose and hash-bound independent language review guard against retaining
      // the former negative statements. Punctuation alone is not a semantic audit.
      for (const key of ['scene', 'translation']) {
        assert.notEqual(final[key], source[key], `${final.id}: stale Chinese ${key}`);
        assert.notEqual(english[key], oldEnglish.get(final.id)[key], `${final.id}: stale English ${key}`);
      }
    }
  }
});

test('later exact subset reviews and teaching choices preserve the original invitation baseline', () => {
  const proof = reviewedProof(), followups = proof.rounds.slice(3);
  assert.equal(followups.length, 6);
  assert.deepEqual(new Set(followups.flatMap(round => round.scopeIds)), EXPECTED_FOLLOWUP_IDS);
  assert.equal(followups.reduce((sum, round) => sum + round.sourceCount, 0), 13);
  for (const round of followups) {
    assert.equal(round.scopeIds.length, round.sourceCount, round.id);
    assert.equal(new Set(round.scopeIds).size, round.sourceCount, round.id);
    assert.ok(round.sourceCards.every(card => card.form === round.form), round.id);
    assert.deepEqual(round.sourceCards.map(card => card.id), round.scopeIds, round.id);
    assert.deepEqual(round.deferrals ?? [], [], 'these user choices are teaching holds, not newly invented review deferrals');
  }
  const heldIds = new Set(TEACHING_PAIR_DEFERRALS.map(row => row.id));
  assert.deepEqual(heldIds, EXPECTED_TEMIRU_TEACHING_HOLD_IDS);
  const historical = frozenState(proof.rounds.slice(0, 3)), latest = frozenState(proof.rounds);
  const historicalCards = historical.cards.filter(card => card.form !== FORM && !isTeachingFormDeferred(card.form));
  const historicalIds = new Set(historicalCards.map(card => card.id));
  const historicalEnglish = historical.english.filter(row => historicalIds.has(row.id));
  assert.equal(historicalCards.length, 17015);
  assert.equal(historicalEnglish.length, 17015);
  assert.equal(revisionHash(historicalCards), 'a18ab642dca021106d85d0072dcfe22f91b57039a235d647e8d32462b4b19208');
  assert.equal(revisionHash(historicalEnglish), 'dfe9222ec82970512035009ef4f7c499bfb79e120c39ec1bd5b9de5bb3aed714');

  // Verify the final projection against all frozen approvals, with only the
  // eight explicit teaching choices removed after review verification.
  assert.deepEqual(REVIEWED_USAGE_CARDS, latest.cards);
  const expectedCards = latest.cards.filter(card => !isTeachingFormDeferred(card.form) && !heldIds.has(card.id));
  const expectedIds = new Set(expectedCards.map(card => card.id));
  const expectedEnglish = latest.english.filter(row => expectedIds.has(row.id));
  assert.equal(expectedCards.length, 17130);
  assert.deepEqual(USAGE_CARDS, expectedCards);
  assert.deepEqual(CURRENT_ENGLISH, expectedEnglish);
  const sortById = rows => [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  assert.deepEqual(REVIEWED_USAGE_CARD_REVISIONS, sortById([...latest.revisions.values()]));
  assert.deepEqual(EN_REVIEWED_USAGE_CARD_OVERLAYS, sortById(latest.english.filter(row => latest.revisions.has(row.id))));
  const currentById = byId(USAGE_CARDS), currentEnglishById = byId(CURRENT_ENGLISH);
  const historicalEnglishById = byId(historicalEnglish);
  for (const card of historicalCards) {
    if (heldIds.has(card.id)) {
      assert.ok(!currentById.has(card.id) && !currentEnglishById.has(card.id), card.id);
    } else if (!EXPECTED_FOLLOWUP_IDS.has(card.id)) {
      assert.deepEqual(currentById.get(card.id), card, `${card.id}: only the exact reviewed subset may change`);
      assert.deepEqual(currentEnglishById.get(card.id), historicalEnglishById.get(card.id), card.id);
    }
  }
});

test('the past-negative teaching hold keeps its original sources and morphology during the invitation rewrite', () => {
  const heldForm = 'temiruNegativePast';
  const record = JSON.parse(fs.readFileSync(new URL('../docs/usage-card-temiru-negative-past-hold-20261017.json', import.meta.url)));
  const held = REVIEWED_USAGE_CARDS.filter(card => card.form === heldForm);
  assert.deepEqual(USER_DIRECTED_FORM_DEFERRALS.map(row => row.form), [heldForm]);
  assert.equal(isTeachingFormDeferred(FORM), false);
  assert.equal(USAGE_CARDS.filter(card => card.form === heldForm).length, 0);
  assert.equal(held.length, 122);
  assert.equal(revisionHash(held), '8a0556b6df3b6e81a9512f7677070ff6c60ea3ea7e5d019123d83e50c8eea56f');
  assert.equal(revisionHash(record), '43a399b2e7531c3b9ed814f36c7175a2b7fce1dc3fc9fdb3986613afd71e96d1');
  assert.deepEqual(record.sourceRows.map(row => row.card), held);
  for (const surface of ['書く', '読む', '行く', '食べる', 'する', '来る']) {
    const card = held.find(card => usageCardItem(card.senseId).surface === surface);
    assert.ok(card, surface);
    const item = usageCardItem(card.senseId);
    for (const candidate of [item, { ...item, surface: item.reading, lexicalSurface: item.surface }]) {
      const answer = deriveUnified(candidate, heldForm).answer;
      const recognized = recognizeForms(item, answer, normalizeAnswer).find(row => row.form === heldForm);
      assert.ok(recognized, `${surface}: ${answer}`);
      assert.equal(recognized.usage.reasonCode, 'user-directed-form-hold');
    }
  }
});

test('the actual practice page displays the invitation purpose in Chinese and English', async t => {
  const { JSDOM } = await import('jsdom');
  const { default: ts } = await import('typescript');
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/katsuyo-dojo/zh-CN/', pretendToBeVisual: true,
  });
  const values = Object.fromEntries(['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'StorageEvent']
    .map(key => [key, dom.window[key]]));
  for (const key of ['requestAnimationFrame', 'cancelAnimationFrame', 'addEventListener', 'removeEventListener']) values[key] = dom.window[key].bind(dom.window);
  values.IS_REACT_ACT_ENVIRONMENT = true;
  const previousGlobals = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const { createElement } = await import('react');
  const { render, cleanup, fireEvent, waitFor } = await import('@testing-library/react');
  t.after(() => {
    cleanup();
    dom.window.close();
    for (const [key, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  let lockTail = Promise.resolve();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_key, callback) => {
    const job = lockTail.then(callback); lockTail = job.catch(() => {}); return job;
  } } });
  const pageUrl = new URL('../app/page.tsx', import.meta.url);
  const compiled = ts.transpileModule(fs.readFileSync(pageUrl, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText.replace(/from ["']([^"']+)["']/g, (_match, specifier) =>
    `from ${JSON.stringify(specifier.startsWith('.') ? new URL(specifier, pageUrl).href : import.meta.resolve(specifier))}`);
  const { default: Page, KNOWLEDGE, ALL_KCS } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const { assessmentTarget, emptyAssessment, recordIndependentAttempt } = await import('../app/lib/learning-assessment.mjs');
  const { emptyPracticeLog } = await import('../app/lib/practice-log.mjs');
  const { CURRICULUM_VERSION } = await import('../app/lib/unified-curriculum.mjs');
  const { reviewedLexicalSense } = await import('../app/lib/lexical-usage.mjs');
  const { wordKey } = await import('../app/lib/exercise-selection.mjs');
  const authored = USAGE_CARDS.find(card => card.form === FORM);
  assert.ok(authored);
  const exercise = KNOWLEDGE.exercises.find(row => row.form === FORM && reviewedLexicalSense(row.item)?.id === authored.senseId);
  assert.ok(exercise);
  const target = assessmentTarget(exercise);
  const group = KNOWLEDGE.exercises.filter(row => assessmentTarget(row).key === target.key);
  const prior = group.find(row => assessmentTarget(row).wordKey !== target.wordKey);
  assert.ok(prior, 'an eligible second word supplies independent retest history');
  let assessment = recordIndependentAttempt(emptyAssessment(), { exercise: prior, questionId: 'invitation-purpose-prior', correct: false });
  for (const [index, filler] of KNOWLEDGE.exercises.filter(row => row.form === null).slice(0, 2).entries()) {
    assessment = recordIndependentAttempt(assessment, { exercise: filler, questionId: `invitation-purpose-filler-${index}`, correct: true });
  }
  const date = new Date();
  const profile = { version: 7, assessment, curriculumVersion: CURRICULUM_VERSION,
    recentWordKeys: [...new Set(group.filter(row => wordKey(row) !== wordKey(exercise)).map(wordKey))],
    practiceLog: emptyPracticeLog(), accessibleCourseIds: [], coursePractice: {}, legacy: null, migration: null,
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    attempted: 3, correct: 2, streak: 2, rotation: 0,
    introducedKcIds: ALL_KCS.filter(kc => kc.gating).map(kc => kc.id),
    byKc: Object.fromEntries(ALL_KCS.map(kc => [kc.id, {
      attempts: 5, correct: 5, filteredAccuracy: 1, confidence: 1, bestConfidence: 1, cleanTimeTotal: 0, cleanTimeCount: 0,
    }])) };
  dom.window.localStorage.setItem('katsuyo-practice-profile-v8', JSON.stringify(profile));
  const view = render(createElement(Page));
  const assertPurpose = (label, concise) => {
    assert.equal(view.container.querySelector('.exercise-card')?.dataset.form, FORM);
    const spans = view.container.querySelector('.semantic-brief')?.children;
    assert.equal(spans?.[0].textContent, label);
    assert.equal(spans?.[1].textContent, concise);
  };
  await waitFor(() => assertPurpose('表达作用', '要不要试着……？'), { timeout: 5000 });
  fireEvent.click(view.getByRole('button', { name: '语言: 简体中文' }));
  fireEvent.click(view.getByRole('menuitemradio', { name: 'English' }));
  await waitFor(() => {
    assertPurpose('Purpose', 'Would you like to try ...?');
    assert.equal(Boolean(view.queryByText('Loading English usage cards…')), false);
  }, { timeout: 5000 });
});
