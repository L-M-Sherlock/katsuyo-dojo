import test from 'node:test';
import assert from 'node:assert/strict';
import { REVIEWED_LEXICAL_SENSES } from '../app/lib/lexical-usage.mjs';
import { ADJECTIVES } from '../app/lib/adjective-catalog.mjs';
import { buildKnowledgeModel } from '../app/lib/knowledge-model.mjs';
import { buildAdjectiveKnowledgeModel } from '../app/lib/adjective-knowledge-model.mjs';
import { COURSES, ADJECTIVE_COURSES } from '../app/lib/curriculum.mjs';
import { FORM_LABELS } from '../app/lib/form-labels.mjs';
import { curriculumSupportsVerbForm } from '../app/lib/curriculum-shapes.mjs';
import { buildUnifiedKnowledge } from '../app/lib/unified-knowledge.mjs';
import { localizeKnowledgeComponents, KNOWLEDGE_FAMILY_LABELS } from '../app/lib/i18n/content-knowledge.mjs';
import { focusCopyForLocale } from '../app/lib/i18n/content-focus.mjs';

function model() {
  const verbs = REVIEWED_LEXICAL_SENSES.filter(value => value.domain === 'verb');
  const verbModel = buildKnowledgeModel(COURSES, verbs, { eligibleFor: curriculumSupportsVerbForm, formLabels: FORM_LABELS });
  const adjectiveModel = buildAdjectiveKnowledgeModel(ADJECTIVE_COURSES, ADJECTIVES, {
    courseIndexOffset: COURSES.length, componentOrderOffset: verbModel.components.length,
  });
  return buildUnifiedKnowledge(verbModel, adjectiveModel, verbs, ADJECTIVES, curriculumSupportsVerbForm);
}

test('English labels cover every unified knowledge component without changing identity or order', () => {
  const source = model().components;
  const localized = localizeKnowledgeComponents(source, 'en');
  assert.equal(source.length, 267);
  assert.deepEqual(localized.map(value => value.id), source.map(value => value.id));
  assert.deepEqual(localized.map(value => value.order), source.map(value => value.order));
  for (const component of localized) {
    assert.equal(typeof component.label, 'string', component.id);
    assert.ok(component.label.trim(), component.id);
    assert.doesNotMatch(component.label, /(?:词尾|变化|接续|覆盖|过去|否定|愿望|礼貌|条件|形容词|动词)/u, component.id);
  }
});

test('knowledge family catalogs have exact locale parity', () => {
  assert.deepEqual(Object.keys(KNOWLEDGE_FAMILY_LABELS.en).sort(), Object.keys(KNOWLEDGE_FAMILY_LABELS['zh-CN']).sort());
});

test('knowledge and focus accessors normalize supported locale variants', () => {
  const component = model().components.find(value => value.id === 'stem.godan.o');
  assert.equal(localizeKnowledgeComponents([component], 'en-US')[0].label, 'Move the godan ending to the o-row');
  assert.equal(focusCopyForLocale(component, 'zh')?.title, '五段动词意向形的词尾变化');
  assert.throws(() => localizeKnowledgeComponents([component], 'fr'), /Unsupported/);
});

test('every focus component has readable English copy when Chinese copy exists', () => {
  for (const component of model().components) {
    const chinese = focusCopyForLocale(component, 'zh-CN');
    const english = focusCopyForLocale(component, 'en');
    if (!chinese) continue;
    assert.ok(english?.title, component.id);
    assert.ok(english?.detail, component.id);
    assert.doesNotMatch(`${english.title} ${english.detail}`, /(?:例如|变化|接续|覆盖|过去|否定|愿望|礼貌|条件|形容词|动词)/u, component.id);
  }
});
