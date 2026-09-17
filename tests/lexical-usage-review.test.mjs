import assert from 'node:assert/strict';
import test from 'node:test';
import { assessFormUsage, eligibleVerbForm, supportsVerbForm } from '../app/lib/form-eligibility.mjs';
import { REVIEWED_VERB_SENSES } from '../app/lib/lexical-usage.mjs';

const word = surface => {
  const item = REVIEWED_VERB_SENSES.find(sense => sense.surface === surface);
  assert.ok(item, `Missing reviewed lexical sense: ${surface}`);
  return item;
};

test('ordinary direct passive waiting is not lost to a transitivity annotation', () => {
  // 待つ takes the awaited person/object: 私は家族に待たれている.
  for (const form of ['passive', 'passivePast', 'passiveNegative', 'passiveNegativePast']) {
    assert.equal(eligibleVerbForm(word('待つ'), form), true, form);
  }
});

test('human flight expressions include a reviewed ordinary aviation context', () => {
  for (const form of ['tai', 'volitional', 'imperative', 'temiru', 'causativePassive']) {
    const usage = assessFormUsage(word('飛ぶ'), form);
    assert.equal(usage.status, 'context-required', form);
    assert.ok(usage.context?.text, form);
    assert.match(usage.context.text, /飞行|飞机|航空|滑翔/, form);
    assert.equal(eligibleVerbForm(word('飛ぶ'), form), true, form);
  }
});

test('concessive knowing is not presented as the simultaneous-actions lesson', () => {
  // JF distinguishes simultaneous Vながら from concessive 知りながら(も):
  // https://www.kyozai.jpf.go.jp/kyozai/material/BTS00121/ja/render.do
  // https://www.jpf.go.jp/j/project/japanese/teach/tsushin/grammar/201703.html
  for (const surface of ['知る', '分かる']) {
    for (const form of ['nagara', 'tsutsu']) {
      assert.equal(supportsVerbForm(word(surface), form), true, `${surface}:${form}`);
      assert.equal(eligibleVerbForm(word(surface), form), false, `${surface}:${form}`);
    }
  }
  for (const surface of ['歩く', '読む', '泣く']) {
    assert.equal(eligibleVerbForm(word(surface), 'nagara'), true, surface);
  }
});

test('natural Chinese hopes cannot authorize an unnatural Japanese need expression', () => {
  assert.equal(supportsVerbForm(word('要る'), 'tehoshii'), true);
  assert.equal(eligibleVerbForm(word('要る'), 'tehoshii'), false);
  for (const surface of ['降る', '咲く']) {
    const usage = assessFormUsage(word(surface), 'tehoshii');
    assert.equal(usage.status, 'context-required', surface);
    assert.ok(usage.context?.text, surface);
    assert.equal(eligibleVerbForm(word(surface), 'tehoshii'), true, surface);
  }
});

test('birth sense does not borrow idea-generation contexts to license its causative', () => {
  assert.equal(word('生まれる').meaning, '出生');
  assert.equal(supportsVerbForm(word('生まれる'), 'causative'), true);
  assert.equal(eligibleVerbForm(word('生まれる'), 'causative'), false);
  assert.equal(eligibleVerbForm(word('生まれる'), 'past'), true);
  assert.equal(eligibleVerbForm(word('生まれる'), 'tehoshii'), true);
});

test('lexical event restrictions cover the whole causative family without changing conjugation support', () => {
  for(const surface of ['壊れる','落ちる','動く','開く','変わる']) for(const form of ['causative','causativePast','causativeNegative','causativeNegativePast']) {
    assert.equal(supportsVerbForm(word(surface),form),true,`${surface}:${form}`);
    assert.equal(eligibleVerbForm(word(surface),form),false,`${surface}:${form}`);
    assert.equal(assessFormUsage(word(surface),form).reasonCode,'non-default-event-causative');
  }
  for(const surface of ['壊れる','落ちる']) for(const form of ['past','te','teshimau']) assert.equal(eligibleVerbForm(word(surface),form),true,`${surface}:${form}`);
  for(const surface of ['咲く','届く','喜ぶ']) assert.equal(eligibleVerbForm(word(surface),'causative'),true,surface);
  for(const surface of ['開ける','変える','終わる','着く']) assert.equal(eligibleVerbForm(word(surface),'causative'),true,surface);
});

test('causative-passive restrictions cannot borrow another sense or a homographic transitive passive', () => {
  for(const surface of ['動く','変わる','楽しむ','着く']) {
    for(const form of ['causativePassive','causativePassiveContracted','causativePassivePast','causativePassiveNegative','causativePassiveNegativePast']) {
      assert.equal(supportsVerbForm(word(surface),form),true,`${surface}:${form}`);
      assert.equal(eligibleVerbForm(word(surface),form),false,`${surface}:${form}`);
    }
    assert.equal(eligibleVerbForm(word(surface),'potential'),true,surface);
  }
  for(const surface of ['泣く','考える','信じる','勝つ','終わる']) assert.equal(eligibleVerbForm(word(surface),'causativePassive'),true,surface);
});

test('negative bereavement passives stay out of teaching while affirmative passive and nu sound change remain', () => {
  for(const surface of ['死ぬ','いる']) for(const form of ['passiveNegative','passiveNegativePast']) {
    assert.equal(supportsVerbForm(word(surface),form),true);
    assert.equal(eligibleVerbForm(word(surface),form),false);
  }
  for(const form of ['passive','passivePast','past','te','negative']) assert.equal(eligibleVerbForm(word('死ぬ'),form),true,form);
  for(const form of ['passiveNegative','passiveNegativePast']) assert.equal(eligibleVerbForm(word('泣く'),form),true,form);
});

test('learning and receiving passives require a reviewed sense rather than a mechanical object subject', () => {
  for(const form of ['passive','passivePast','passiveNegative','passiveNegativePast']) {
    assert.equal(supportsVerbForm(word('習う'),form),true);
    assert.equal(eligibleVerbForm(word('習う'),form),false);
    const usage=assessFormUsage(word('受ける'),form);
    assert.equal(usage.status,'context-required');
    assert.ok(usage.context);
    assert.equal(eligibleVerbForm(word('受ける'),form),true);
  }
  for(const form of ['potential','causative','causativePassive']) assert.equal(eligibleVerbForm(word('習う'),form),true,form);
});
