import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import UsageCardView from '../app/lib/usage-card-view.mjs';
import {USAGE_CARDS, createUsageCardLookup, usageCardIssues, usageCardItem, resolveUsageCard, usageSentenceParts, usageCardClassRequirements, basicUsageCardRequirements, usageCardStageRequirements, usageCardWritingReview, usageCardFor} from '../app/lib/usage-cards.mjs';
import {DEFERRED_ACTION_PAIRS, eligibleVerbForm, assessFormUsage, supportsVerbForm} from '../app/lib/form-eligibility.mjs';
import {conjugate} from '../app/lib/conjugation.mjs';
import {recognizeForms} from '../app/lib/form-recognition.mjs';
import {normalizeAnswer} from '../app/lib/answer-analysis.mjs';
import {UNIFIED_COURSES} from '../app/lib/unified-curriculum.mjs';
import intentionWordCards from '../app/lib/usage-cards/intention-words/index.mjs';
import actionWordCards from '../app/lib/usage-cards/actions-generated.mjs';
import actionSeedCards from '../app/lib/usage-cards/actions.mjs';
import classActionCards1 from '../app/lib/usage-cards/class-actions-1.mjs';
import classActionCards2 from '../app/lib/usage-cards/class-actions-2.mjs';
import reviewedActionReplacements from '../app/lib/usage-cards/actions-naturalness-20260923.mjs';
import integrationWordCards from '../app/lib/usage-cards/integration-generated.mjs';
import {USER_DIRECTED_DEFERRED_PAIRS} from '../app/lib/usage-cards/user-directed-deferrals.mjs';
import {RETIRED_TEORU_NEGATIVE_FORMS} from '../app/lib/compound-forms.mjs';
const integrationIds = new Set(integrationWordCards.map(card => card.id));
const actionReview = JSON.parse(readFileSync(new URL('../docs/usage-card-actions-review.json', import.meta.url), 'utf8'));
const naturalnessReview = JSON.parse(readFileSync(new URL('../docs/usage-card-naturalness-20260923.json', import.meta.url), 'utf8'));
const fullNaturalnessSummary = JSON.parse(readFileSync(new URL('../docs/usage-card-naturalness-full-progress.v1.json', import.meta.url), 'utf8'));
const fullNaturalnessBytes = readFileSync(new URL('../docs/usage-card-naturalness-full-progress.v1.json.gz', import.meta.url));
const fullNaturalnessProof = JSON.parse(gunzipSync(fullNaturalnessBytes));
const naturalnessDeferred = new Set(naturalnessReview.deferred.map(row => row.pair));
const naturalnessPrevious = new Map(naturalnessReview.approvedRevisions.map(row => [row.id, row.previousCard]));
const beforeNaturalness = cards => cards.map(card => naturalnessPrevious.get(card.id) ?? card);
const fullNaturalnessSource = fullNaturalnessProof.sourceCards;
const fullNaturalnessStatus = new Map(fullNaturalnessProof.statuses.map(row => [row.id, row]));
const fullNaturalnessDeferred = new Set(fullNaturalnessProof.deferrals.map(row=>row.pair));
const actionIds = new Set(actionReview.approvedIds);

const intentionReview = JSON.parse(readFileSync(new URL('../docs/usage-card-intentions-review.json', import.meta.url),'utf8'));
const deferredIntentionPairs = new Set(intentionReview.deferred.map(card=>card.pair));

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

test('reviewed stages retain exact eligible coverage and preserve the original representative cards', () => {
  assert.deepEqual(usageCardIssues(USAGE_CARDS,{requireBasicCoverage:true,requireStageCoverage:['voice','linking','intentions','actions']}),[]);
  const seed=JSON.parse(readFileSync(new URL('./fixtures/usage-card-seed-pairs.json',import.meta.url),'utf8'));
  const expected=new Set([...seed,...basicUsageCardRequirements(),...usageCardStageRequirements('voice'),...usageCardStageRequirements('linking'),
    ...usageCardStageRequirements('intentions'),...usageCardStageRequirements('actions'),...integrationWordCards.map(card=>`${card.senseId}/${card.form}`)]
    .filter(pair=>!USER_DIRECTED_DEFERRED_PAIRS.has(pair)&&!RETIRED_TEORU_NEGATIVE_FORMS.has(pair.split('/')[1])));
  const actual=new Set(USAGE_CARDS.map(c=>`${c.senseId}/${c.form}`));
  assert.deepEqual(actual,expected);
  assert.equal(USAGE_CARDS.length,expected.size);
  assert.ok(USAGE_CARDS.every(c=>c.form!==null));
});

test('published action cards match the approved review ledger and leave the historical baseline intact', () => {
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const sourceHash = file => createHash('sha256').update(readFileSync(new URL(file, import.meta.url))).digest('hex');
  assert.equal(sourceHash('../docs/usage-card-actions-review.json'), '1b195bef937989ebe48837136e972006383533939456e9948960af13b330ed52');
  assert.equal(sourceHash('../app/lib/usage-cards/actions-generated.mjs'), 'e6f4f17d81f9a1bb872b4c545d9c117cd67e8e718b828d1b215d833878ecf87b');
  assert.equal(actionWordCards.length, actionReview.approvedCards);
  assert.deepEqual(new Set(actionWordCards.map(card => card.id)), actionIds);
  assert.equal(hash(actionWordCards), actionReview.approvedCardsSha256);
  assert.equal(createHash('sha256').update(fullNaturalnessBytes).digest('hex'),fullNaturalnessSummary.proof.sha256);
  assert.equal(fullNaturalnessProof.sourceCommit,fullNaturalnessSummary.sourceCommit);
  assert.equal(fullNaturalnessSource.length,fullNaturalnessSummary.activeCount);
  const old = beforeNaturalness(fullNaturalnessSource.filter(card => !actionIds.has(card.id) && !integrationIds.has(card.id)));
  assert.equal(old.length, actionReview.originalCards);
  assert.equal(hash(old), actionReview.originalCardsSha256);
  const approvedPairs = new Set(actionWordCards.map(card => `${card.senseId}/${card.form}`));
  const pendingPairs = new Set(actionReview.unresolved.map(entry => entry.pair));
  assert.equal(approvedPairs.size, actionReview.approvedCards);
  assert.ok([...pendingPairs].every(pair => !approvedPairs.has(pair)));
  const required = new Set(usageCardStageRequirements('actions'));
  const actionForms = new Set(UNIFIED_COURSES.filter(course=>course.stageId==='actions').flatMap(course=>course.forms));
  const fullDeferredActions = new Set([...fullNaturalnessDeferred].filter(pair=>actionForms.has(pair.split('/')[1])));
  const userDeferredActions = new Set([...USER_DIRECTED_DEFERRED_PAIRS].filter(pair=>actionForms.has(pair.split('/')[1])));
  const retiredActions = new Set(fullNaturalnessSource.filter(card=>RETIRED_TEORU_NEGATIVE_FORMS.has(card.form))
    .map(card=>`${card.senseId}/${card.form}`));
  const covered = new Set(USAGE_CARDS.map(card => `${card.senseId}/${card.form}`).filter(pair => required.has(pair)));
  assert.equal(required.size, actionReview.effectiveRequiredPairs - naturalnessDeferred.size - fullDeferredActions.size
    - userDeferredActions.size - retiredActions.size);
  assert.equal(pendingPairs.size, 0);
  assert.equal(pendingPairs.size, actionReview.pendingPairs);
  assert.equal(actionReview.deferredPairs, 32);
  assert.equal(actionReview.effectiveRequiredPairs, 6972);
  assert.deepEqual(new Set([...actionReview.deferred.map(entry => entry.pair), ...naturalnessDeferred]), DEFERRED_ACTION_PAIRS);
  assert.equal(actionReview.complete, true);
  const deferred = DEFERRED_ACTION_PAIRS;
  for (const pair of pendingPairs) assert.ok(!covered.has(pair), pair);
  for (const pair of approvedPairs) assert.equal(required.has(pair), !naturalnessDeferred.has(pair) && !fullDeferredActions.has(pair)
    && !userDeferredActions.has(pair) && !retiredActions.has(pair), pair);
  assert.ok([...deferred].every(pair=>!required.has(pair)&&!pendingPairs.has(pair)));
  assert.deepEqual(new Set([...covered, ...pendingPairs]), required);
  assert.equal(required.size+deferred.size+fullDeferredActions.size+userDeferredActions.size+retiredActions.size,actionReview.originalRequiredPairs);
  const userDeferredNewActions = [...userDeferredActions].filter(pair=>approvedPairs.has(pair)).length;
  const retiredNewActions=[...retiredActions].filter(pair=>approvedPairs.has(pair)).length;
  assert.equal(covered.size - (approvedPairs.size - naturalnessDeferred.size - fullDeferredActions.size
    - userDeferredNewActions - retiredNewActions), actionReview.originalActionPairs
    - (userDeferredActions.size - userDeferredNewActions) - (retiredActions.size - retiredNewActions));
  assert.ok(actionWordCards.every(card => card.review === 'approved'));
});

test('the naturalness release replaces only independently approved cards and withdraws nine exact pairs', () => {
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const historical = new Map([...actionSeedCards, ...actionWordCards, ...classActionCards1, ...classActionCards2]
    .map(card => [card.id, card]));
  const releasedAtNaturalnessFreeze = new Map(fullNaturalnessSource.map(card => [card.id, card]));
  assert.equal(naturalnessReview.scopeCount, 45);
  assert.equal(naturalnessReview.approvedCount, 36);
  assert.equal(naturalnessReview.deferredCount, 9);
  assert.deepEqual(reviewedActionReplacements,
    naturalnessReview.approvedRevisions.map(row => row.currentCard));
  const touched = new Set();
  for (const row of naturalnessReview.approvedRevisions) {
    assert.ok(!touched.has(row.id), row.id);
    touched.add(row.id);
    assert.equal(hash(row.previousCard), row.previousHash);
    assert.equal(hash(row.currentCard), row.currentHash);
    assert.deepEqual(historical.get(row.id), row.previousCard);
    assert.deepEqual(releasedAtNaturalnessFreeze.get(row.id), row.currentCard);
    if(RETIRED_TEORU_NEGATIVE_FORMS.has(row.currentCard.form))assert.ok(!USAGE_CARDS.some(card=>card.id===row.id));
    assert.ok(row.authorReceipt && row.reviewReceipt);
    assert.equal(row.languageReview.status, 'approved');
    assert.equal(row.languageReview.id, row.id);
    assert.equal(row.languageReview.hash, row.draftHash);
  }
  for (const row of naturalnessReview.deferred) {
    assert.ok(!touched.has(row.id), row.id);
    touched.add(row.id);
    assert.equal(hash(row.publishedCard), row.publishedHash);
    assert.deepEqual(historical.get(row.id), row.publishedCard);
    assert.ok(!USAGE_CARDS.some(card=>card.id===row.id), row.id);
    assert.equal(row.attempts.length, 3);
    for (const attempt of row.attempts) {
      assert.ok(attempt.authorReceipt && attempt.reviewReceipt);
      if (attempt.kind === 'rejected-draft') {
        assert.equal(attempt.languageReview.status, 'rejected');
        assert.equal(attempt.languageReview.hash, attempt.cardHash);
      } else {
        assert.equal(attempt.kind, 'no-credible-candidate');
        assert.ok(attempt.author && attempt.route && attempt.authorNote);
      }
    }
  }
  assert.equal(touched.size, naturalnessReview.scopeCount);
});

test('reviewed and user-requested action deferrals remain recognizable at exact-pair scope', () => {
  assert.equal(DEFERRED_ACTION_PAIRS.size, actionReview.deferredPairs + naturalnessReview.deferredCount);
  for (const pair of DEFERRED_ACTION_PAIRS) {
    const [senseId, form] = pair.split('/');
    const item = usageCardItem(senseId);
    assert.ok(item, pair);
    assert.equal(supportsVerbForm(item, form), true, pair);
    assert.equal(eligibleVerbForm(item, form), false, pair);
    const usage = assessFormUsage(item, form);
    assert.equal(usage.status, 'context-required', pair);
    assert.equal(usage.context, undefined, pair);
    const match=recognizeForms(item,conjugate(item.surface,item.class,form),normalizeAnswer).find(r=>r.form===form);
    assert.ok(match,pair);
    assert.equal(match.usage.reasonCode,'action-pair-deferred');
    const record=actionReview.deferred.find(row=>row.pair===pair)
      ?? naturalnessReview.deferred.find(row=>row.pair===pair);
    assert.equal(record.reason,usage.reason);
    assert.ok(record.attempts.length>=(['user-request','post-publication-review'].includes(record.deferralBasis)?1:2));
    assert.equal(resolveUsageCard(record.sourceCard),null);
    assert.equal(eligibleVerbForm(item,'past'),true);
  }
  for(const row of actionReview.unresolved){const [senseId,form]=row.pair.split('/');assert.equal(eligibleVerbForm(usageCardItem(senseId),form),true,row.pair);}
});

test('another action card in the same form cannot fill an exact sense gap', () => {
  const card = actionWordCards[0];
  const pair = `${card.senseId}/${card.form}`;
  const reduced = USAGE_CARDS.filter(candidate => candidate.id !== card.id);
  assert.ok(reduced.some(candidate => candidate.form === card.form));
  assert.equal(createUsageCardLookup(reduced)(usageCardItem(card.senseId), card.form), null);
  assert.ok(usageCardIssues(reduced, {requireStageCoverage:['actions']}).includes(`Missing approved actions card for ${pair}`));
});

test('published intention batches match the reviewed content and leave all old cards unchanged', async () => {
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const ids = new Set(intentionWordCards.map(card=>card.id));
  assert.equal(ids.size,intentionReview.approvedCards);
  assert.equal(intentionWordCards.length,intentionReview.approvedCards);
  assert.equal(hash(beforeNaturalness(fullNaturalnessSource.filter(card=>!ids.has(card.id)&&!actionIds.has(card.id)&&!integrationIds.has(card.id)))),intentionReview.originalCardsSha256);
  const reviewed = [];
  for(const batch of intentionReview.batches) {
    const cards=(await import(`../app/lib/usage-cards/intention-words/${batch.file}`)).default;
    assert.equal(cards.length,batch.cards,batch.file);
    assert.equal(hash(cards),batch.sha256,batch.file);
    reviewed.push(...cards);
  }
  assert.deepEqual(reviewed,intentionWordCards);
  assert.ok(intentionWordCards.every(card=>card.review==='approved'));
  assert.deepEqual(deferredIntentionPairs,new Set([
    'verb:間に合う:まにあう/naideKudasai',
    'verb:間に合う:まにあう/prohibitive',
    'verb:間に合う:まにあう/temoIi',
    'verb:間に合う:まにあう/masenka',
    'verb:分かる:わかる/masenka',
  ]), 'preserve the exact five deferred pairs in the editorial record');
  for(const entry of intentionReview.deferred) {
    assert.ok(!USAGE_CARDS.some(card=>`${card.senseId}/${card.form}`===entry.pair));
    assert.ok(entry.reason && entry.sourceHash);
    assert.ok(!usageCardStageRequirements('intentions').includes(entry.pair),entry.pair);
  }
});

test('an intention word gap cannot be hidden by another word using the same form', () => {
  const pair='verb:書く:かく/tai';
  const reduced=USAGE_CARDS.filter(card=>`${card.senseId}/${card.form}`!==pair);
  assert.deepEqual(usageCardIssues(reduced,{requireCoverage:true,requireClassCoverage:true}),[]);
  assert.ok(usageCardIssues(reduced,{requireStageCoverage:['intentions']}).includes(`Missing approved intentions card for ${pair}`));
});

test('a missing voice example is not hidden by the same word in another form', () => {
  const pair='verb:書く:かく/potentialNegative';
  const reduced=USAGE_CARDS.filter(c=>`${c.senseId}/${c.form}`!==pair);
  assert.deepEqual(usageCardIssues(reduced,{requireCoverage:true,requireClassCoverage:true,requireBasicCoverage:true}),[]);
  assert.ok(usageCardIssues(reduced,{requireStageCoverage:['voice']}).includes(`Missing approved voice card for ${pair}`));
});

test('a linking word gap cannot be hidden by another word or a different condition form', () => {
  const pair='verb:書く:かく/ba';
  const reduced=USAGE_CARDS.filter(c=>`${c.senseId}/${c.form}`!==pair);
  assert.deepEqual(usageCardIssues(reduced,{requireCoverage:true,requireClassCoverage:true,requireBasicCoverage:true,requireStageCoverage:['voice']}),[]);
  assert.ok(usageCardIssues(reduced,{requireStageCoverage:['linking']}).includes(`Missing approved linking card for ${pair}`));
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

test('a copied Japanese example cannot pass as its Chinese translation', () => {
  assert.match(usageCardIssues([{...card,translation:'今夜はお酒を飲まない。'}]).join('\n'),/translation must be Chinese/);
  assert.deepEqual(usageCardIssues([{...card,translation:'今晚不喝酒。'}]),[]);
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
  const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
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
  const sourceById=new Map(fullNaturalnessSource.map(c=>[c.id,c]));
  const byId=new Map(USAGE_CARDS.map(c=>[c.id,c]));
  for(const [id,side,expected] of cases) {
    const source=sourceById.get(id), current=byId.get(id), status=fullNaturalnessStatus.get(id);
    assert.ok(source&&current&&status,id);
    assert.equal(source[side].map(p=>p.reading??p.text).join(''),expected,`${id}: frozen source reading`);
    assert.equal(hash(source),status.sourceHash,`${id}: source content has not changed`);
    assert.equal(hash(current),status.cardHash,`${id}: displayed revision has current-hash approval`);
    assert.equal(current.senseId,source.senseId,id);
    assert.equal(current.form,source.form,id);
  }
});

test('ideographic zero stays inside the year ruby rather than breaking its reading', () => {
  assert.deepEqual(usageSentenceParts({text:'祖父は一九五〇年に',reading:'そふはせんきゅうひゃくごじゅうねんに'}),[
    {text:'祖父',reading:'そふ'},{text:'は'},{text:'一九五〇年',reading:'せんきゅうひゃくごじゅうねん'},{text:'に'},
  ]);
});
