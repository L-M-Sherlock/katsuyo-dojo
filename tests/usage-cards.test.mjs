import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import UsageCardView from '../app/lib/usage-card-view.mjs';
import {USAGE_CARDS, createUsageCardLookup, usageCardIssues, usageCardItem, resolveUsageCard, usageSentenceParts, usageCardClassRequirements, basicUsageCardRequirements, usageCardWritingReview, usageCardFor} from '../app/lib/usage-cards.mjs';
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

test('every eligible form and word class retains approved and fully specified usage cards', () => {
  assert.deepEqual(usageCardIssues(USAGE_CARDS,{requireCoverage:true,requireClassCoverage:true}),[]);
  const forms=new Set(UNIFIED_COURSES.flatMap(course=>course.forms));
  const required=usageCardClassRequirements();
  assert.equal(new Set(USAGE_CARDS.map(c=>c.form)).size,forms.size);
  assert.deepEqual(new Set(USAGE_CARDS.map(c=>`${c.form}/${usageCardItem(c.senseId).class}`)),new Set(required));
  assert.ok(USAGE_CARDS.every(c=>c.review==='approved'));
});

test('all eligible basic conjugations are covered without adding classification cards or losing existing pairs', () => {
  assert.deepEqual(usageCardIssues(USAGE_CARDS,{requireBasicCoverage:true}),[]);
  const seed=JSON.parse(readFileSync(new URL('./fixtures/usage-card-seed-pairs.json',import.meta.url),'utf8'));
  const expected=new Set([...seed,...basicUsageCardRequirements()]);
  const actual=new Set(USAGE_CARDS.map(c=>`${c.senseId}/${c.form}`));
  assert.deepEqual(actual,expected);
  assert.equal(USAGE_CARDS.length,expected.size);
  assert.ok(USAGE_CARDS.every(c=>c.form!==null));
});

test('a basic word gap cannot be hidden by another card for the same form and class', () => {
  const pair='verb:書く:かく/masu';
  const reduced=USAGE_CARDS.filter(c=>`${c.senseId}/${c.form}`!==pair);
  assert.deepEqual(usageCardIssues(reduced,{requireCoverage:true,requireClassCoverage:true}),[]);
  assert.ok(usageCardIssues(reduced,{requireBasicCoverage:true}).includes(`Missing approved basic card for ${pair}`));
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

test('commas preserve the reading boundary between adjacent kanji words', () => {
  assert.deepEqual(usageSentenceParts({text:'彼は昨日、授業に',reading:'かれはきのう、じゅぎょうに'}),[
    {text:'彼',reading:'かれ'},{text:'は'},{text:'昨日',reading:'きのう'},{text:'、'},
    {text:'授業',reading:'じゅぎょう'},{text:'に'},
  ]);
  const missingBoundary={text:'昨日、先生に',reading:'きのうせんせいに'};
  assert.deepEqual(usageSentenceParts(missingBoundary),[missingBoundary]);
  const spacing={text:'昨日 先生に',reading:'きのう せんせいに'};
  assert.deepEqual(usageSentenceParts(spacing),[spacing]);
  const repeatedKana={text:'昨日の部屋は',reading:'きのうのへやは'};
  assert.deepEqual(usageSentenceParts(repeatedKana),[repeatedKana]);
});

test('the late-for-class card shows standard spelling and ruby without exposing its answer', () => {
  const resolved=usageCardFor(usageCardItem('verb:遅れる:おくれる'),'past');
  const front=renderToStaticMarkup(h(UsageCardView,{card:resolved}));
  assert.match(baseText(front),/彼は昨日、授業に/);
  for(const word of ['彼<rt>かれ</rt>','昨日<rt>きのう</rt>','授業<rt>じゅぎょう</rt>']) assert.ok(front.includes(word));
  assert.ok(!front.includes('遅れた'));
  assert.ok(!front.includes('おくれた'));
});

test('writing review surfaces long kana drafts without forbidding natural kana', () => {
  const draft={...card,before:[{text:'かれはきのうじゅぎょうに'}]};
  assert.equal(usageCardWritingReview([draft]).length,1);
  assert.deepEqual(usageCardWritingReview([{...draft,before:[{text:'彼は昨日、授業に',reading:'かれはきのう、じゅぎょうに'}]}]),[]);
  const natural={...card,before:[{text:'ここでは'}]};
  assert.deepEqual(usageCardIssues([natural]),[]);
  assert.deepEqual(usageCardWritingReview([natural]),[]);
});

test('reading validation catches stale okurigana and truncated kana without guessing kanji readings', () => {
  for (const part of [
    {text:'、舌がしびれました。',reading:'、ぜんぶたべました。'},
    {text:'、ろうそくをつけました。',reading:'、'},
  ]) assert.match(usageCardIssues([{...card,after:[part]}]).join('\n'),/reading does not match written kana/);
  assert.deepEqual(usageCardIssues([{...card,after:[{text:'、舌がしびれました。',reading:'、したがしびれました。'}]}]),[]);
  // A valid spelling shape cannot establish a homograph's meaning.
  assert.deepEqual(usageCardIssues([{...card,before:[{text:'表は',reading:'おもては'}]}]),[]);
});

test('reviewed source readings retain the intended word sense and revised sentence', () => {
  const cases=[
    ['usage:adjectiveNaNegativePast:adjective:複雑:ふくざつ','before','まえのひょうはいぜんは'],
    ['usage:teageruPast:verb:調べる:しらべる','before','どうりょうのかわりにみちじゅんを'],
    ['usage:adjectiveNegative:adjective:多い:おおい','before','きょうはじむしょにきたひとが'],
    ['usage:adjectivePast:adjective:優しい:やさしい','before','となりのひとはいつも'],
    ['usage:adjectiveTe:adjective:多い:おおい','before','えきにひとが'],
    ['usage:adjectiveTe:adjective:暗い:くらい','after','、ろうそくをつけました。'],
    ['usage:adjectiveTe:adjective:辛い:からい','after','、したがしびれました。'],
    ['usage:adjectiveNaTe:adjective:残念:ざんねん','after','、みんなだまりました。'],
    ['usage:masuNegativePast:verb:脱ぐ:ぬぐ','before','あまぐがひつようだったため、わたしはレインコートを'],
    ['usage:negative:verb:要る:いる','before','どうぐはじさんしたので、ついかのこうぐは'],
    ['usage:te:verb:要る:いる','after','、すぐにははじめられません。'],
    ['usage:masuPast:verb:生まれる:うまれる','before','そふはせんきゅうひゃくごじゅうねんに'],
  ];
  const byId=new Map(USAGE_CARDS.map(c=>[c.id,c]));
  for(const [id,side,expected] of cases) assert.equal(byId.get(id)[side].map(p=>p.reading??p.text).join(''),expected,id);
});

test('ideographic zero stays inside the year ruby rather than breaking its reading', () => {
  assert.deepEqual(usageSentenceParts({text:'祖父は一九五〇年に',reading:'そふはせんきゅうひゃくごじゅうねんに'}),[
    {text:'祖父',reading:'そふ'},{text:'は'},{text:'一九五〇年',reading:'せんきゅうひゃくごじゅうねん'},{text:'に'},
  ]);
});
