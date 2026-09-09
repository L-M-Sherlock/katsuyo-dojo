import test from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, generateErrorCases } from '../scripts/lib/error-patterns.mjs';
import { auditGeneratedCase, evaluateGeneratedCase } from '../scripts/lib/diagnosis-audit.mjs';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';

const verb=(surface,reading,cls='godan')=>({domain:'verb',surface,reading,class:cls});
const adj=(surface,reading,cls='i',iiFamily=false)=>({domain:'adjective',surface,reading,class:cls,iiFamily});
const fixtures=[
  [verb('始める','はじめる','ichidan'),'teageruPast'],
  [verb('楽しむ','たのしむ'),'teageruNegativePast'],
  [verb('頼む','たのむ'),'taiPast'],
  [verb('申し込む','もうしこむ'),'taiPast'],
  [adj('早い','はやい'),'adjectiveNegative'],
  [adj('大きい','おおきい'),'adjectivePast'],
  [adj('遠い','とおい'),'adjectiveNegativePast'],
  [adj('静か','しずか','na'),'adjectiveNaNegativePast'],
  [adj('静か','しずか','na'),'adjectiveNaPast'],
  [adj('快適','かいてき','na'),'adjectiveNaPast'],
  [adj('きれい','きれい','na'),'adjectiveNaPast'],
  [adj('嫌い','きらい','na'),'adjectiveNaPast'],
  [adj('幸せ','しあわせ','na'),'adjectiveNaNegative'],
  [adj('いい','いい','i',true),'adjectiveNegative'],
  [adj('かっこいい','かっこいい','i',true),'adjectivePast'],
  [verb('書く','かく'),'te'], [verb('泳ぐ','およぐ'),'past'],
  [verb('行く','いく'),'past'], [verb('死ぬ','しぬ'),'te'],
  [verb('買う','かう'),'past'], [verb('する','する','irregular'),'masu'],
  [verb('来る','くる','irregular'),'negative'],
  [verb('食べる','たべる','ichidan'),'potential'],
  [verb('読む','よむ'),'causativePassivePast'],
  [verb('包む','つつむ'),'tagaruPast'],
  [verb('食べる','たべる','ichidan'),'teiruPast'],
  [verb('閉める','しめる','ichidan'),'tagaruPast'],
  ...['masu','nasai','masenka','nakute','nakutemoIi','naide','naideKudasai','chau','tai','teiru','tearuNegative','prohibitive'].map(form=>[verb('書く','かく'),form]),
  [verb('待つ','まつ'),'te'], [verb('取る','とる'),'potential'],
  [adj('暖かい','あたたかい'),'adjectivePast'],
  [verb('教える','おしえる','ichidan'),'potential'],
  ...['adjectivePast','adjectiveBa','adjectiveNegative','adjectiveTe','adjectiveAdverb','adjectiveNegativePast'].map(form=>[adj('白い','しろい'),form]),
  ...['taiPast','taiNegative','taiNegativePast','tehoshiiPast','tehoshiiNegative','tehoshiiNegativePast','negativePast','passiveDesireNegativePast'].map(form=>[verb('書く','かく'),form]),
  [adj('いい','いい','i',true),'adjectiveNegativePast'],
].map(([item,form])=>({item,form}));
const generated=fixtures.flatMap(f=>generateErrorCases(f).cases);

test('every declared pattern has a generated example and IDs are stable across course reordering', () => {
  for(const p of PATTERNS)assert.ok(generated.some(c=>c.pattern===p.id),p.id);
  assert.equal(new Set(generated.map(c=>c.id)).size,generated.length);
  const original=generateErrorCases(fixtures[0]);
  assert.deepEqual(generateErrorCases({...fixtures[0],courseId:'moved',courseIndex:99}),original);
});

test('the generator reproduces the reported inputs without reading analyzer candidates', () => {
  for(const [form,input,pattern] of [
    ['teageruPast','はじめてあげない','compound-ending-switch'],
    ['teageruNegativePast','なのしんであげなかった','lexical-substitution'],
    ['taiPast','たのんだいた','blended-rules'],
    ['taiPast','もしこみたかった','lexical-deletion'],
    ['adjectiveNegative','はやく','ku-omission'],
    ['adjectivePast','おおきくない','adjective-form-switch'],
    ['adjectiveNegativePast','とおくない','negative-intermediate'],
    ['adjectivePast','しろいた','i-bare-ending'],
    ['adjectivePast','白いかった','i-ending-retained'],
    ['adjectiveNaPast','かいてきたっだ','na-past-voicing'],
    ['adjectiveNaNegative','しあわせない','na-suffix-span-omission'],
  ])assert.ok(generated.some(c=>c.form===form&&c.input===input&&c.pattern===pattern),`${form}: ${input}`);
});

test('generated contract cases use the shared production analyzer, including supplied-base contexts', () => {
  for(const fixture of fixtures) {
    const analyzers=new Map();
    for(const c of generateErrorCases(fixture).cases) {
      const contextKey=JSON.stringify(c.step);
      if(!analyzers.has(contextKey))analyzers.set(contextKey,createAnswerAnalyzer(c.item,c.form,{step:c.step}));
      const result=evaluateGeneratedCase(c,analyzers.get(contextKey)(c.input));
      assert.notEqual(result.status,'regression',`${c.id} ${c.pattern} ${c.input}: ${JSON.stringify(result.problems)}`);
    }
  }
});

test('valid surface collisions and colloquial variants are never mislabeled as error inputs', () => {
  const f={item:verb('食べる','たべる','ichidan'),form:'potential'};
  const {cases,collisions}=generateErrorCases(f);
  assert.ok(collisions>0);
  assert.ok(cases.some(c=>c.input==='食べれる'&&c.expected.kind==='correct'));
  assert.ok(cases.filter(c=>c.input==='食べられる').every(c=>c.expected.kind==='correct'));
});

test('audit catches false acceptance, wrong attribution, fabricated evidence and repeated diagnostic steps', () => {
  const missing=generated.find(c=>c.pattern==='ku-omission');
  const expected=createAnswerAnalyzer(missing.item,missing.form)(missing.input);
  assert.equal(evaluateGeneratedCase(missing,expected).status,'pass');
  for(const altered of [
    {...expected,kind:'correct'},
    {...expected,diagnosis:{...expected.diagnosis,kcId:'adj.class.i'}},
    {...expected,diagnosis:{...expected.diagnosis,confirmedKcIds:['adj.stem.i-ku','invented']}},
  ])assert.equal(evaluateGeneratedCase(missing,altered).status,'regression');
  const intermediate=generated.find(c=>c.pattern==='negative-intermediate');
  const analysis=createAnswerAnalyzer(intermediate.item,intermediate.form)(intermediate.input);
  assert.equal(evaluateGeneratedCase(intermediate,{...analysis,steps:[...analysis.steps,...analysis.steps]}).status,'regression');
  const noise=generated.find(c=>c.pattern==='noise');
  assert.equal(evaluateGeneratedCase(noise,{kind:'incorrect',diagnosis:{kcId:noise.kcIds[0],confirmedKcIds:[]},steps:[]}).status,'regression');
});

test('reasonable conservative handling and exploratory gaps are reported separately', () => {
  const compound=generated.find(c=>c.pattern==='compound-ending-switch');
  assert.equal(evaluateGeneratedCase(compound,createAnswerAnalyzer(compound.item,compound.form)(compound.input)).status,'pass');
  const explore=generated.find(c=>c.level==='explore');
  assert.equal(evaluateGeneratedCase(explore,{kind:'incorrect',diagnosis:null,steps:[],feedback:{message:'输入片段不足，请核对原词。',observations:[],terminal:true}}).status,'gap');
  assert.equal(evaluateGeneratedCase(explore,{kind:'incorrect',diagnosis:null,steps:[{kcIds:[explore.kcIds[0]]}],feedback:{message:'请继续确认。',observations:[],terminal:false}}).status,'deferred');
});

test('diagnostic class choices are the sole explicit empty-KC probe and never create evidence',()=>{
  const item=verb('包む','つつむ'),form='tagaruPast';
  const cases=generateErrorCases({item,form}).cases;
  const original=cases.find(c=>c.input==='つつみたがた'&&c.expected.stage?.form==='past');
  assert.ok(original);
  const analysis=createAnswerAnalyzer(item,form,{step:original.step})(original.input);
  assert.equal(evaluateGeneratedCase(original,analysis).status,'pass');
  for(const patch of [
    {diagnosticOnly:false},{kind:'conjugation'}, {expectedClass:'ichidan'},
    {answers:[]}, {classChoices:[]}, {kcIds:['apply.tagaru.continuation']},
  ]) {
    const altered={...analysis,steps:[{...analysis.steps[0],...patch},analysis.steps[1]]};
    assert.equal(evaluateGeneratedCase(original,altered).status,'regression',JSON.stringify(patch));
  }
  assert.equal(evaluateGeneratedCase(original,{...analysis,diagnosis:null,steps:[]}).status,'regression');
  assert.equal(evaluateGeneratedCase(original,{...analysis,steps:[analysis.steps[0],{...analysis.steps[1],kcIds:['apply.tagaru.continuation']}]}).status,'regression');
  for(const c of cases.filter(c=>c.pattern==='continuation-classification')) {
    assert.equal(c.expected.classification.expectedClass,'godan');
    const actual=createAnswerAnalyzer(item,form,{step:c.step})(c.input);
    assert.equal(evaluateGeneratedCase(c,actual).status,'pass');
    for(const diagnosis of [
      {kcId:'class.godan',confirmedKcIds:[]},
      {kcId:'apply.tagaru.continuation',confirmedKcIds:[]},
      {kcId:null,confirmedKcIds:['onbin.sokuon']},
    ])assert.equal(evaluateGeneratedCase(c,{...actual,diagnosis}).status,'regression');
  }
  const choice=cases.find(c=>c.pattern==='continuation-classification');
  const fake={...choice,step:{...choice.step,kind:'conjugation'},expected:{kind:'incorrect',failed:null,confirmed:[]}};
  assert.equal(evaluateGeneratedCase(fake,{kind:'incorrect',diagnosis:null,steps:[]}).status,'regression','ordinary probes cannot use an empty knowledge scope');
});

test('newly attributable subsets have explicit independent contracts, including conflicting explanations', () => {
  const find=(surface,form,input,pattern)=>generated.find(c=>c.item.surface===surface&&c.form===form&&c.input===input&&c.pattern===pattern);
  assert.deepEqual(find('書く','masu','書き','operation-stop').expected,{kind:'incorrect',failed:'suffix.masu',confirmed:['stem.godan.i'],steps:0});
  assert.deepEqual(find('書く','masu','書きま','ending-deletion').expected,{kind:'incorrect',failed:'suffix.masu',confirmed:['stem.godan.i'],steps:0});
  assert.deepEqual(find('書く','masenka','書き','operation-stop').expected,{kind:'incorrect',failed:null,confirmed:['stem.godan.i'],steps:2,continuation:true});
  assert.deepEqual(find('書く','nakutemoIi','書かない','operation-stop').expected,{kind:'incorrect',failed:null,confirmed:['stem.godan.a','suffix.negative'],steps:1,continuation:true});
  assert.deepEqual(find('書く','masu','書かない','other-form-switch').expected,{kind:'incorrect',failed:'suffix.masu',confirmed:[],steps:0});
  assert.deepEqual(find('待つ','te','待て','other-form-switch').expected,{kind:'incorrect',failed:null,confirmed:[],steps:0});
  assert.deepEqual(find('取る','potential','取られる','other-form-switch').expected,{kind:'incorrect',failed:null,confirmed:[],steps:0});
  for(const input of ['取れ','とれ']) {
    const c=find('取る','potential',input,'ending-deletion');
    assert.deepEqual(c.expected,{kind:'incorrect',failed:'suffix.potential',confirmed:[],steps:0});
    assert.deepEqual(createAnswerAnalyzer(c.item,c.form)(c.input).diagnosis.confirmedKcIds,[]);
  }
  assert.deepEqual(find('書く','naideKudasai','書かないで','nested-operation-stop').expected,{kind:'incorrect',failed:'construction.naideKudasai',confirmed:['stem.godan.a','suffix.negative','construction.naide'],steps:0});
  assert.deepEqual(find('書く','masenka','書きません','ending-deletion').expected,{kind:'incorrect',failed:'construction.masenka',confirmed:['stem.godan.i'],steps:0});
  assert.deepEqual(find('書く','prohibitive','書く','ending-deletion').expected,{kind:'incorrect',failed:'suffix.prohibitive',confirmed:[],steps:0});
  assert.deepEqual(find('書く','tearuNegative','書いてある','partial-step-unchanged').expected,{kind:'incorrect',failed:'exception.aru-negative',confirmed:[],steps:0});
  for(const pattern of ['operation-stop','ending-deletion'])assert.deepEqual(find('書く','nakute','書かなく',pattern).expected,{kind:'incorrect',failed:null,confirmed:['stem.godan.a','suffix.negative','adj.stem.i-ku'],steps:1,continuation:true});
  assert.deepEqual(find('書く','nakute','書かなく','partial-step-unchanged').expected,{kind:'incorrect',failed:'adj.suffix.i-te',confirmed:[],steps:0});
  assert.equal(find('申し込む','taiPast','もしこみたかった','lexical-deletion').expected.kind,'typo');
  // Deleting the last stem か is indistinguishable from deleting the suffix か.
  assert.equal(find('暖かい','adjectivePast','あたたかった','lexical-deletion').expected.kind,'explore');
  // Retaining only a single lexical character is not enough evidence for retry.
  assert.equal(find('書く','masu','きます','lexical-deletion').expected.kind,'explore');
  // おしえられる with an omission and おしえれる with a substitution are
  // different accepted correction targets, so a retry is not established.
  assert.equal(find('教える','potential','おしられる','lexical-deletion').expected.kind,'explore');
  assert.deepEqual(find('書く','teiru','書てる','wrong-class').expected,{kind:'incorrect',failed:null,confirmed:[],minSteps:1});
  assert.equal(find('書く','teiru','書てる','wrong-class').level,'contract');
});

test('partial-answer probes have independent targets and cannot regrade completed knowledge', () => {
  const c=generated.find(c=>c.pattern==='partial-step-valid'&&c.completedKcIds.length);
  const analysis=createAnswerAnalyzer(c.item,c.form,{step:c.step})(c.input);
  assert.equal(evaluateGeneratedCase(c,analysis).status,'pass');
  for(const altered of [
    {...c,step:{...c.step,answers:['wrong target']}},
    {...c,kcIds:[]},
    {...c,kcIds:[...c.kcIds,c.completedKcIds[0]]},
  ])assert.equal(evaluateGeneratedCase(altered,analysis).status,'regression');
});

test('retained i and simplified endings have independent whole/step contracts rather than suffix guesses', () => {
  const find=(surface,form,input,pattern,stepIndex=null)=>generated.find(c=>c.item.surface===surface&&c.form===form&&c.input===input&&c.pattern===pattern&&c.stepIndex===stepIndex&&!c.originalInput);
  for(const [form,input,pattern,failed] of [
    ['adjectivePast','しろいた','i-bare-ending','adj.suffix.i-past'],
    ['adjectivePast','白いかった','i-ending-retained','adj.suffix.i-past'],
    ['adjectiveBa','しろいば','i-bare-ending','adj.suffix.i-ba'],
    ['adjectiveNegative','白いない','i-bare-ending','adj.stem.i-ku'],
    ['adjectiveTe','白いくて','i-ending-retained','adj.stem.i-ku'],
    ['adjectiveAdverb','白いく','i-ending-retained','adj.stem.i-ku'],
    ['adjectiveNegativePast','白いなかった','i-bare-ending','adj.stem.i-ku'],
  ])assert.deepEqual(find('白い',form,input,pattern).expected,{kind:'incorrect',failed,confirmed:[],steps:0});
  for(const input of ['白くないた','白いかった','白いくない'])assert.deepEqual(
    find('白い','adjectiveNegativePast',input,'i-affix-guard').expected,
    {kind:'incorrect',failed:null,confirmed:[],minSteps:1},
  );
  assert.deepEqual(find('かっこいい','adjectivePast','かっこいいた','i-bare-ending').expected,{kind:'incorrect',failed:null,confirmed:[],steps:0});
  assert.deepEqual(find('書く','taiPast','書きたいた','i-bare-ending').expected,{kind:'incorrect',failed:null,confirmed:[],minSteps:1});
  assert.deepEqual(find('書く','taiNegative','書きたいない','i-bare-ending',1).expected,{kind:'incorrect',failed:'adj.stem.i-ku',confirmed:[],steps:0});
  assert.deepEqual(find('書く','passiveDesireNegativePast','書かれたいなかった','i-bare-ending').expected,{kind:'incorrect',failed:null,confirmed:[],minSteps:1});
  assert.deepEqual(find('書く','passiveDesireNegativePast','書かれたいなかった','i-bare-ending',2).expected,{kind:'incorrect',failed:'adj.stem.i-ku',confirmed:[],steps:0});
  assert.deepEqual(find('いい','adjectiveNegativePast','よくないた','i-bare-ending',1).expected,{kind:'incorrect',failed:'adj.suffix.i-past',confirmed:[],steps:0});
  assert.deepEqual(find('書く','negativePast','書かないかった','i-ending-retained',1).expected,{kind:'incorrect',failed:'adj.suffix.i-past',confirmed:[],steps:0});
  for(const input of ['静かではないた','静かじゃないた'])assert.deepEqual(find('静か','adjectiveNaNegativePast',input,'i-bare-ending',1).expected,{kind:'incorrect',failed:'adj.suffix.i-past',confirmed:[],steps:0});
});

test('passive-stage generation covers every godan ending, writing and supported continuation with an explicit stage contract',()=>{
  const words=[['買う','かう'],['書く','かく'],['騒ぐ','さわぐ'],['話す','はなす'],['待つ','まつ'],['死ぬ','しぬ'],['遊ぶ','あそぶ'],['読む','よむ'],['取る','とる']];
  const forms=['passive','passivePast','passiveNegative','passiveNegativePast','passiveDesireNegativePast'];
  const stage={form:'passive',label:'受身形构造',candidateKcIds:['stem.godan.a','suffix.passive']};
  for(const [surface,reading] of words)for(const form of forms) {
    const item=verb(surface,reading),cases=generateErrorCases({item,form}).cases;
    const mixed=cases.filter(c=>c.pattern==='passive-stage-mixed');
    assert.equal(mixed.length,8,`${surface}/${form}: four wrong rows in each writing`);
    for(const writing of ['surface','reading'])assert.equal(mixed.filter(c=>c.writing===writing).length,4);
    const analyze=createAnswerAnalyzer(item,form);
    for(const c of mixed) {
      assert.deepEqual(c.expected.stage,stage);
      assert.equal(c.expected.steps,form==='passive'?2:form==='passiveDesireNegativePast'?4:3);
      const result=auditGeneratedCase(c,analyze);
      assert.equal(result.status,'pass',`${surface}/${form}/${c.input}: ${JSON.stringify(result.problems)}`);
    }
    for(const c of cases.filter(c=>c.pattern==='passive-stage-guard')) {
      assert.equal(c.expected.stage,null);
      assert.equal(auditGeneratedCase(c,analyze).status,'pass',`${surface}/${form}/${c.input}`);
    }
    const probes=cases.filter(c=>c.pattern==='passive-stage-probe');
    assert.ok(probes.some(c=>c.step.kind==='stem'));
    assert.ok(probes.some(c=>c.step.kind==='attachment'));
    const analyzers=new Map();
    for(const c of probes) {
      assert.ok(!c.kcIds.some(id=>/^(class\.|heuristic\.|facet\.)/.test(id)));
      const key=JSON.stringify(c.step);if(!analyzers.has(key))analyzers.set(key,createAnswerAnalyzer(item,form,{step:c.step}));
      const result=auditGeneratedCase(c,analyzers.get(key));
      assert.equal(result.status,'pass',`${surface}/${form}/${c.input}: ${JSON.stringify(result.problems)}`);
    }
  }
  for(const item of [verb('食べる','たべる','ichidan'),verb('する','する','irregular'),adj('白い','しろい')]) {
    const form=item.domain==='verb'?'passive':'adjectivePast';
    assert.ok(!generateErrorCases({item,form}).cases.some(c=>c.pattern==='passive-stage-mixed'));
  }
});

test('the audit rejects a missing or invented passive stage and cannot score stage candidates as atomic failures',()=>{
  const item=verb('騒ぐ','さわぐ'),form='passiveDesireNegativePast';
  const c=generateErrorCases({item,form}).cases.find(c=>c.pattern==='passive-stage-mixed'&&c.input==='さわぎられたくなかった');
  assert.ok(c,'the reported row-plus-ichidan passive error is generated');
  const actual=createAnswerAnalyzer(item,form)(c.input);
  assert.equal(evaluateGeneratedCase(c,actual).status,'pass');
  for(const changed of [
    {...actual,diagnosis:null},
    {...actual,diagnosis:{...actual.diagnosis,stage:{...actual.diagnosis.stage,form:'past'}}},
    {...actual,diagnosis:{...actual.diagnosis,stage:{...actual.diagnosis.stage,candidateKcIds:['stem.godan.a']}}},
    {...actual,diagnosis:{...actual.diagnosis,stage:{...actual.diagnosis.stage,candidateKcIds:['audit.unrelated']}}},
    {...actual,diagnosis:{...actual.diagnosis,kcId:'stem.godan.a'}},
    {...actual,steps:actual.steps.map((step,index)=>index===0?{...step,kind:undefined}:step)},
    {...actual,steps:actual.steps.map((step,index)=>index===2?{...step,form:'passive'}:step)},
  ])assert.equal(evaluateGeneratedCase(c,changed).status,'regression');
  const guard=generateErrorCases({item,form}).cases.find(c=>c.pattern==='passive-stage-guard');
  assert.equal(evaluateGeneratedCase(guard,{...actual,steps:[]}).status,'regression','a damaged root or continuation cannot inherit a stage');
});

test('the default passive-desire route explicitly supplies passive, then tai, without regrading the multi-step atom',()=>{
  const item=verb('騒ぐ','さわぐ'),form='passiveDesireNegativePast';
  const cases=generateErrorCases({item,form}).cases;
  const defaults=[...new Map(cases.filter(c=>c.step&&!c.originalInput).map(c=>[c.stepIndex,c.step])).values()];
  assert.deepEqual(defaults.map(step=>step.form),['passive','tai','taiNegativePast']);
  assert.equal(defaults[1].analysisItem.surface,'騒がれる');
  assert.equal(defaults[1].analysisItem.class,'ichidan');
  assert.ok(defaults[1].answers.includes('騒がれたい'));
  assert.ok(defaults[2].providedAnswers.includes('騒がれたい'));
  assert.ok(defaults[2].answers.includes('騒がれたくなかった'));
  assert.ok(defaults.every(step=>!step.kcIds.includes('compound.multi-step')));
  const ids=defaults.flatMap(step=>step.kcIds);
  assert.equal(new Set(ids).size,ids.length,'each guided rule is assessed at most once');
});

test('na past voicing errors retain the whole lexical base and fail only the past suffix', () => {
  for(const [surface,reading] of [['快適','かいてき'],['静か','しずか'],['きれい','きれい'],['嫌い','きらい']]) {
    const cases=generateErrorCases({item:adj(surface,reading,'na'),form:'adjectiveNaPast'}).cases;
    for(const base of new Set([surface,reading]))for(const ending of ['たっだ','たった','だっだ']) {
      const c=cases.find(c=>c.pattern==='na-past-voicing'&&c.input===base+ending);
      assert.ok(c,`${base}${ending}`);
      assert.deepEqual(c.expected,{kind:'incorrect',failed:'adj.suffix.na-past',confirmed:[],steps:0});
      assert.equal(auditGeneratedCase(c,createAnswerAnalyzer(c.item,c.form)).status,'pass');
    }
    for(const c of cases.filter(c=>c.pattern==='na-past-voicing-guard')) {
      assert.deepEqual(c.expected,{kind:'incorrect',failed:null,confirmed:[]});
      assert.equal(auditGeneratedCase(c,createAnswerAnalyzer(c.item,c.form)).status,'pass',c.input);
    }
  }
  const c=generated.find(c=>c.pattern==='na-past-voicing'&&c.input==='かいてきたっだ');
  const analysis=createAnswerAnalyzer(c.item,c.form)(c.input);
  for(const kcId of ['adj.class.na','onbin.voicing'])assert.equal(evaluateGeneratedCase(c,{
    ...analysis,diagnosis:{kcId,confirmedKcIds:[]},
  }).status,'regression');
  assert.equal(evaluateGeneratedCase(c,{
    ...analysis,diagnosis:{kcId:'adj.suffix.na-past',confirmedKcIds:['adj.class.na']},
  }).status,'regression');
});

test('na past voicing patterns do not cross target or adjective class boundaries', () => {
  const controls=[
    ...['adjectiveAttributive','adjectivePredicative','adjectiveNaNegative','adjectiveNaNegativePast','adjectiveNaTe','adjectiveBa','adjectiveAdverb'].map(form=>({item:adj('快適','かいてき','na'),form})),
    {item:adj('白い','しろい'),form:'adjectivePast'},
    {item:adj('いい','いい','i',true),form:'adjectivePast'},
  ];
  for(const fixture of controls) {
    const cases=generateErrorCases(fixture).cases;
    assert.equal(cases.some(c=>c.pattern==='na-past-voicing'),false,fixture.form);
    const guards=cases.filter(c=>c.pattern==='na-past-voicing-guard');
    assert.ok(guards.length,fixture.form);
    for(const c of guards)assert.equal(auditGeneratedCase(c,createAnswerAnalyzer(c.item,c.form)).status,'pass',`${c.form}: ${c.input}`);
  }
  const guards=generated.filter(c=>c.pattern==='na-past-voicing-guard'&&c.item.surface==='快適');
  for(const input of ['字適たっだ','あいてきたっだ','かいてきたっだた','かいてきたっだたっだ']) {
    assert.ok(guards.some(c=>c.input===input),input);
  }
});

test('na suffix omission enumerates head, interior, tail and whole spans, not only the last character', () => {
  const item=adj('幸せ','しあわせ','na');
  const cases=generateErrorCases({item,form:'adjectiveNaNegative'}).cases;
  for(const [position,input] of [
    ['head','しあわせない'],['interior','しあわせでい'],
    ['tail','しあわせでは'],['whole','しあわせ'],
    ['colloquial interior','しあわせじゃい'],
    ['third variant tail','しあわせでな'],
  ]) {
    const c=cases.find(c=>c.pattern==='na-suffix-span-omission'&&c.input===input);
    assert.ok(c,`${position}: ${input}`);
    assert.deepEqual(c.expected,{kind:'incorrect',failed:'adj.suffix.na-negative',confirmed:[],steps:0});
    assert.equal(auditGeneratedCase(c,createAnswerAnalyzer(c.item,c.form)).status,'pass',input);
  }
  // Three suffix characters have six contiguous nonempty deletion spans.
  // This fixed expected set checks all positions without sharing edit code.
  const past=generateErrorCases({item:adj('快適','かいてき','na'),form:'adjectiveNaPast'}).cases;
  assert.deepEqual(new Set(past.filter(c=>c.pattern==='na-suffix-span-omission'&&c.writing==='reading').map(c=>c.input)),
    new Set(['かいてきった','かいてきた','かいてき','かいてきだた','かいてきだ','かいてきだっ']));
});

test('na suffix omission keeps legal variants as positive controls and gives compound spans no guessed KC', () => {
  for(const [form,accepted] of [
    ['adjectiveNaNegative',['幸せではない','幸せじゃない','幸せでない']],
    ['adjectiveNaNegativePast',['幸せではなかった','幸せじゃなかった','幸せでなかった']],
    ['adjectiveBa',['幸せなら','幸せならば','幸せであれば']],
  ]) {
    const {cases,collisions}=generateErrorCases({item:adj('幸せ','しあわせ','na'),form});
    assert.ok(collisions>0,form);
    for(const input of accepted) {
      assert.ok(cases.some(c=>c.pattern==='valid'&&c.input===input),input);
      assert.equal(cases.some(c=>c.input===input&&c.expected.kind!=='correct'),false,input);
    }
    if(form==='adjectiveNaNegativePast') {
      const spans=cases.filter(c=>c.pattern==='na-suffix-span-omission');
      assert.ok(spans.length);
      assert.ok(spans.every(c=>c.expected.kind==='explore'&&!('failed' in c.expected)));
    }
  }
});

test('na suffix omission contracts preserve word boundaries and use an independent simple-form policy', () => {
  const targets={adjectiveAttributive:'adj.suffix.na-attributive',adjectivePredicative:'adj.suffix.na-predicative',
    adjectiveNaNegative:'adj.suffix.na-negative',adjectiveNaPast:'adj.suffix.na-past',adjectiveNaTe:'adj.suffix.na-te',
    adjectiveBa:'adj.suffix.na-conditional',adjectiveAdverb:'adj.suffix.na-adverb'};
  for(const [surface,reading] of [['幸せ','しあわせ'],['快適','かいてき'],['きれい','きれい'],['嫌い','きらい']]) {
    for(const [form,failed] of Object.entries(targets)) {
      const cases=generateErrorCases({item:adj(surface,reading,'na'),form}).cases;
      const spans=cases.filter(c=>c.pattern==='na-suffix-span-omission');
      assert.ok(spans.length,`${surface}: ${form}`);
      for(const c of spans) {
        assert.deepEqual(c.expected,{kind:'incorrect',failed,confirmed:[],steps:0});
        assert.equal(auditGeneratedCase(c,createAnswerAnalyzer(c.item,c.form)).status,'pass',`${form}: ${c.input}`);
      }
      for(const c of cases.filter(c=>c.pattern==='na-suffix-span-guard')) {
        assert.ok(c.expected.failed===null||c.expected.failed===failed);
        assert.deepEqual(c.expected.confirmed,[]);
        assert.equal(auditGeneratedCase(c,createAnswerAnalyzer(c.item,c.form)).status,'pass',`${form}: ${c.input}`);
      }
    }
  }
  for(const [item,form] of [[adj('白い','しろい'),'adjectiveNegative'],[verb('書く','かく'),'negative']]) {
    assert.equal(generateErrorCases({item,form}).cases.some(c=>c.pattern.startsWith('na-suffix-span-')),false);
  }
  const cases=generateErrorCases({item:adj('幸せ','しあわせ','na'),form:'adjectiveNaNegative'}).cases;
  for(const input of ['字せない','ああわせない','しあわせないないない'])assert.ok(
    cases.some(c=>c.pattern==='na-suffix-span-guard'&&c.input===input),input,
  );
});


test('mixed review contracts reject missing followups, false atomic credit and answer leakage',()=>{
  const item=verb('閉める','しめる','ichidan'),form='tagaruPast',cases=generateErrorCases({item,form}).cases;
  const c=cases.find(c=>c.input==='しまたがだ'&&c.expected.review&&c.expected.steps===2);
  assert.ok(c);
  const actual=createAnswerAnalyzer(item,form,{step:c.step})(c.input);
  assert.equal(evaluateGeneratedCase(c,actual).status,'pass');
  for(const altered of [
    {...actual,diagnosis:null}, {...actual,steps:[]},
    {...actual,diagnosis:{...actual.diagnosis,kcId:'apply.tagaru.continuation'}},
    {...actual,diagnosis:{...actual.diagnosis,confirmedKcIds:['suffix.past']}},
    {...actual,diagnosis:{...actual.diagnosis,review:{...actual.diagnosis.review,kind:'stage'}}},
    {...actual,diagnosis:{...actual.diagnosis,review:{...actual.diagnosis.review,rootMismatch:{expected:'しめたがった',actual:c.input,operation:'substitution'}}}},
  ])assert.equal(evaluateGeneratedCase(c,altered).status,'regression');
  const given=cases.find(c=>c.input==='しまたがだ'&&c.step?.providedClass);
  assert.ok(given);
  const observed=createAnswerAnalyzer(item,form,{step:given.step})(given.input);
  assert.equal(evaluateGeneratedCase(given,observed).status,'pass');
  assert.equal(evaluateGeneratedCase(given,{...observed,steps:actual.steps}).status,'regression','observations after the class is supplied must not recurse');
  const guard=cases.find(c=>c.pattern==='common-mixed-past-guard');
  const guarded=createAnswerAnalyzer(item,form,{step:guard.step})(guard.input);
  assert.equal(evaluateGeneratedCase(guard,{...guarded,diagnosis:actual.diagnosis,steps:actual.steps}).status,'regression');
});

test('a crashing analyzer produces a reportable failure instead of terminating the batch', () => {
  const result=auditGeneratedCase(generated[0],()=>{throw new Error('injected regression');});
  assert.equal(result.status,'regression');
  assert.equal(result.problems[0].code,'analyzer-exception');
});
