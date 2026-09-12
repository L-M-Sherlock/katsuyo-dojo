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
