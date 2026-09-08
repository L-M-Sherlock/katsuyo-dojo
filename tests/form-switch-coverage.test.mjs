import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acceptedConjugations } from '../app/lib/conjugation.mjs';
import { acceptedAdjectiveConjugations, diagnoseAdjective } from '../app/lib/adjective-conjugation.mjs';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { diagnoseConjugation } from '../app/lib/knowledge-model.mjs';

const verbForms = ['negative', 'past', 'te', 'masu', 'potential', 'passive', 'volitional', 'ba', 'imperative'];
const naSuffixes = {
  adjectiveAttributive: 'adj.suffix.na-attributive',
  adjectivePredicative: 'adj.suffix.na-predicative',
  adjectiveNaNegative: 'adj.suffix.na-negative',
  adjectiveNaPast: 'adj.suffix.na-past',
  adjectiveNaTe: 'adj.suffix.na-te',
  adjectiveBa: 'adj.suffix.na-conditional',
  adjectiveAdverb: 'adj.suffix.na-adverb',
};
const verb = (surface, reading, cls = 'godan') => ({ domain: 'verb', surface, reading, class: cls });
const adjective = (surface, reading, cls = 'na') => ({ domain: 'adjective', surface, reading, class: cls });
const kaku = verb('書く', 'かく');

test('complete simple verb form switches identify only the requested ending', () => {
  const items = [kaku, verb('泳ぐ', 'およぐ'), verb('話す', 'はなす'), verb('待つ', 'まつ'),
    verb('死ぬ', 'しぬ'), verb('遊ぶ', 'あそぶ'), verb('読む', 'よむ'), verb('買う', 'かう'),
    verb('取る', 'とる'), verb('切る', 'きる'), verb('行く', 'いく'),
    verb('食べる', 'たべる', 'ichidan'), verb('見る', 'みる', 'ichidan'),
    verb('する', 'する', 'irregular'), verb('勉強する', 'べんきょうする', 'irregular'),
    verb('来る', 'くる', 'irregular')];
  for (const item of items) for (const form of verbForms) {
    const analyze = createAnswerAnalyzer(item, form);
    for (const surface of new Set([item.surface, item.reading])) {
      const accepted = new Set(acceptedConjugations(surface, item.class, form));
      for (const alternative of verbForms.filter(value => value !== form)) {
        for (const answer of acceptedConjugations(surface, item.class, alternative)) {
          const observed = analyze(answer);
          const label = `${item.surface}: ${form} ← ${alternative}: ${answer}`;
          if (accepted.has(answer)) { assert.equal(observed.kind, 'correct', label); continue; }
          // These surfaces also result from treating the word as ichidan.
          // The answer alone cannot distinguish classification from form choice.
          const ambiguous = item.class === 'godan' && (
            (surface.endsWith('つ') && form === 'te' && alternative === 'imperative') ||
            (surface.endsWith('る') && form === 'potential' && alternative === 'passive'));
          assert.equal(observed.kind, 'incorrect', label);
          assert.equal(observed.diagnosis?.kcId ?? null, ambiguous ? null : `suffix.${form}`, label);
          assert.deepEqual(observed.diagnosis?.confirmedKcIds ?? [], [], label);
        }
      }
    }
  }
});

test('na-adjective complete form switches include colloquial and conditional alternatives', () => {
  for (const item of [adjective('静か', 'しずか'), adjective('きれい', 'きれい'), adjective('有名', 'ゆうめい')]) {
    for (const [form, expectedId] of Object.entries(naSuffixes)) {
      const analyze = createAnswerAnalyzer(item, form);
      for (const surface of new Set([item.surface, item.reading])) {
        for (const alternative of [...Object.keys(naSuffixes), 'adjectiveNaNegativePast'].filter(value => value !== form)) {
          for (const answer of acceptedAdjectiveConjugations({ ...item, surface }, alternative)) {
            const observed = analyze(answer);
            const label = `${item.surface}: ${form} ← ${alternative}: ${answer}`;
            assert.equal(observed.kind, 'incorrect', label);
            assert.equal(observed.diagnosis?.kcId, expectedId, label);
            assert.deepEqual(observed.diagnosis.confirmedKcIds, [], label);
          }
        }
      }
    }
  }
});

test('wrong verb class is recognized in accepted contracted and continued variants', () => {
  for (const [form, answer] of [['teiru', '書てる'], ['teoru', '書とる'], ['teshimau', '書ちゃう'],
    ['teoku', '書とく'], ['teiku', '書てく'], ['teiruPast', '書てた'],
    ['potential', '書れる'], ['teiru', 'かてる'], ['causative', '書さす']]) {
    const observed = createAnswerAnalyzer(kaku, form)(answer);
    assert.equal(observed.kind, 'incorrect', `${form}: ${answer}`);
    assert.equal(observed.diagnosis?.kcId, 'class.godan', `${form}: ${answer}`);
    assert.deepEqual(observed.diagnosis.confirmedKcIds, []);
  }
  const exception = createAnswerAnalyzer(verb('喋る', 'しゃべる'), 'teiru')('しゃべてる');
  assert.equal(exception.diagnosis?.kcId, 'lexeme.ru-godan.喋る');
  const irregular = createAnswerAnalyzer(verb('来る', 'くる', 'irregular'), 'teiru')('くてる');
  assert.equal(irregular.diagnosis?.kcId, 'facet.class.irregular.kuru');
});

test('adjective wrong-class recognition includes na contractions without crediting source classification', () => {
  const takai = adjective('高い', 'たかい', 'i');
  for (const [form, answer] of [['adjectiveNegative', '高いじゃない'],
    ['adjectiveNegativePast', '高いじゃなかった'], ['adjectiveBa', '高いであれば']]) {
    const diagnosis = diagnoseAdjective(takai, form, answer);
    assert.equal(diagnosis?.kcId, 'adj.class.i');
    assert.deepEqual(diagnosis.confirmedKcIds, []);
  }
});

test('surface collisions stay unknown and accepted synonyms remain correct', () => {
  assert.equal(diagnoseConjugation(verb('待つ', 'まつ'), 'te', '待て'), null);
  assert.equal(diagnoseConjugation(verb('取る', 'とる'), 'potential', '取られる'), null);
  assert.equal(diagnoseConjugation(verb('切る', 'きる'), 'potential', '切られる'), null);
  for (const [item, form, answers] of [
    [verb('食べる', 'たべる', 'ichidan'), 'potential', ['食べられる', '食べれる']],
    [verb('食べる', 'たべる', 'ichidan'), 'passive', ['食べられる']],
    [verb('来る', 'くる', 'irregular'), 'potential', ['来られる', '来れる', 'こられる', 'これる']],
    [kaku, 'teiru', ['書いている', '書いてる']],
    [adjective('静か', 'しずか'), 'adjectiveBa', ['静かなら', '静かならば', '静かであれば']],
  ]) for (const answer of answers) assert.equal(createAnswerAnalyzer(item, form)(answer).kind, 'correct', answer);
});

test('form-switch diagnoses preserve lexical boundaries and keep omission feedback distinct', () => {
  for (const answer of ['書かないxyz', '字かない', '書か', '書いてあげなかった']) {
    assert.equal(diagnoseConjugation(kaku, 'masu', answer), null, answer);
  }
  const shizuka = adjective('静か', 'しずか');
  for (const answer of ['静かだったxyz', '静だった', 'しずくなら']) {
    assert.equal(diagnoseAdjective(shizuka, 'adjectiveNaNegative', answer), null, answer);
  }
  const omission = diagnoseAdjective(shizuka, 'adjectiveNaNegative', '静かじゃ');
  assert.equal(omission.kcId, 'adj.suffix.na-negative');
  assert.deepEqual(omission.confirmedKcIds, []);
  assert.match(omission.message, /本题要求的否定形接续不完整/);
});
