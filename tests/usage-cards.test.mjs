import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import UsageCardView from '../app/lib/usage-card-view.mjs';
import {USAGE_CARDS, createUsageCardLookup, usageCardIssues, usageCardItem, resolveUsageCard, usageSentenceParts, usageCardClassRequirements} from '../app/lib/usage-cards.mjs';
import {UNIFIED_COURSES} from '../app/lib/unified-curriculum.mjs';

const card = {id:'test-negative',senseId:'verb:飲む:のむ',meaning:'喝',form:'negative',
  scene:'明天要早起，今晚决定不喝酒。',before:[{text:'今夜はお酒を',reading:'こんやはおさけを'}],
  after:[{text:'。'}],translation:'今晚不喝酒。',note:'描述今晚的决定。',review:'approved'};
const baseText = html => html.replace(/<rt>.*?<\/rt>/g, '').replace(/<[^>]+>/g, '');
const kanaText = html => html.replace(/<ruby>.*?<rt>(.*?)<\/rt><\/ruby>/g, '$1').replace(/<[^>]+>/g, '');

test('usage cards require an exact reviewed sense and target, with no representative fallback', () => {
  const lookup=createUsageCardLookup([card]), item=usageCardItem(card.senseId);
  assert.equal(lookup(item,'negative').target.text,'飲まない');
  assert.equal(lookup(item,'negative').target.reading,'のまない');
  assert.equal(lookup({...item,meaning:'别的意思'},'negative'),null);
  assert.equal(lookup({...item,reading:'ちがう'},'negative'),null);
  assert.equal(lookup({...item,class:'ichidan'},'negative'),null);
  assert.equal(lookup(usageCardItem('verb:読む:よむ'),'negative'),null);
  assert.equal(lookup(item,'past'),null);
  assert.equal(lookup(item,null),null);
  assert.equal(createUsageCardLookup([{...card,review:'draft'}])(item,'negative'),null);
  assert.equal(createUsageCardLookup([{...card,meaning:'changed'}])(item,'negative'),null);
});

test('the front mounts only context and a whole-form blank, while the back supplies the example', () => {
  const resolved=resolveUsageCard(card);
  const front=renderToStaticMarkup(h(UsageCardView,{card:resolved}));
  for(const hidden of [resolved.target.text,resolved.target.reading,card.translation,card.note]) assert.ok(!front.includes(hidden),hidden);
  assert.match(front,/填写变化后的完整形式/);
  assert.match(baseText(front),/今夜はお酒を/);
  const back=renderToStaticMarkup(h(UsageCardView,{card:resolved,revealed:true}));
  for(const shown of [resolved.target.text,card.translation,card.note]) assert.ok(baseText(back).includes(shown),shown);
  assert.ok(kanaText(back).includes(resolved.target.reading));
  assert.equal(renderToStaticMarkup(h(UsageCardView,{card:null})), '');
});

test('usage card audit catches changed identity, missing readings, duplicate coverage and answer leakage', () => {
  assert.deepEqual(usageCardIssues([card]),[]);
  for(const bad of [
    {...card,meaning:'changed'}, {...card,form:'unknown'}, {...card,review:'unknown'},
    {...card,scene:'长'.repeat(33)}, {...card,note:'长'.repeat(61)},
    {...card,before:[{text:'今夜'}]}, {...card,after:[{text:'のまない。'}]},
    {...card,before:null}, {...card,after:[null]}, {...card,scene:'请输入飲まない'},
    {...card,after:[{text:'{{target}}'}]},
    {...card,senseId:'verb:降る:ふる',meaning:'下（雨雪）',form:'tai'},
  ]) assert.ok(usageCardIssues([bad]).length,JSON.stringify(bad));
  assert.match(usageCardIssues([card,card]).join('\n'),/duplicate/);
});

test('every eligible form and word class has one approved and fully specified usage card', () => {
  assert.deepEqual(usageCardIssues(USAGE_CARDS,{requireCoverage:true,requireClassCoverage:true}),[]);
  const forms=new Set(UNIFIED_COURSES.flatMap(course=>course.forms));
  const required=usageCardClassRequirements();
  assert.equal(USAGE_CARDS.length,required.length);
  assert.equal(new Set(USAGE_CARDS.map(c=>c.form)).size,forms.size);
  assert.deepEqual(new Set(USAGE_CARDS.map(c=>`${c.form}/${usageCardItem(c.senseId).class}`)),new Set(required));
  assert.ok(USAGE_CARDS.every(c=>c.review==='approved'));
});

test('form-only coverage cannot hide a missing ichidan representative', () => {
  const reduced=USAGE_CARDS.filter(c=>!(c.form==='negative'&&usageCardItem(c.senseId).class==='ichidan'));
  assert.deepEqual(usageCardIssues(reduced,{requireCoverage:true}),[]);
  assert.ok(usageCardIssues(reduced,{requireClassCoverage:true}).includes('Missing approved card for form/class negative/ichidan'));
});

test('sentence readings align to kanji while kana and punctuation remain independently wrappable', () => {
  assert.deepEqual(usageSentenceParts({text:'私は先生に作文を',reading:'わたしはせんせいにさくぶんを'}),[
    {text:'私',reading:'わたし'},{text:'は'},{text:'先生',reading:'せんせい'},{text:'に'},{text:'作文',reading:'さくぶん'},{text:'を'},
  ]);
  assert.deepEqual(usageSentenceParts({text:'昨日、メールを',reading:'きのうめーるを'}),[
    {text:'昨日',reading:'きのう'},{text:'、メールを'},
  ]);
  assert.deepEqual(usageSentenceParts({text:'読ませてもらえなかった',reading:'よませてもらえなかった'}),[
    {text:'読',reading:'よ'},{text:'ませてもらえなかった'},
  ]);
});
