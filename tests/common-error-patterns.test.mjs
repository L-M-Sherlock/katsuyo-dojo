import { assertGenericOrTerminal } from './helpers/diagnosis-assertions.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMON_ERROR_PATTERNS, commonSuffixMutations, commonLexicalExpectation, generateCommonErrorCases } from '../scripts/lib/common-error-patterns.mjs';
import { generateErrorCases } from '../scripts/lib/error-patterns.mjs';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { evaluateGeneratedCase } from '../scripts/lib/diagnosis-audit.mjs';
import { deriveUnified, unifiedDiagnosticSteps } from '../app/lib/unified-knowledge.mjs';

const verb=(surface,reading,cls='godan')=>({domain:'verb',surface,reading,class:cls});
const adj=(surface,reading,cls='i',iiFamily=false)=>({domain:'adjective',surface,reading,class:cls,iiFamily});
const casesFor=(item,form,options={})=>generateCommonErrorCases(item,form,options).cases;
const find=(cases,input,pattern)=>cases.find(c=>c.input===input&&(!pattern||c.pattern===pattern));
const extraTargets=['naide','naideKudasai','nakutemoIi','nakutewaIkenai','nakerebaNaranai','naitoIkenai','tara','tari','tatte','youtosuru','zuni','masenka','masuPast','masuNegative','masuNegativePast'];

test('suffix operators enumerate local edits within one grammatical suffix',()=>{
  const mutations=commonSuffixMutations('ではない',{sokuon:false});
  for(const suffix of ['ない','では','でない','でい','ではな'])assert.ok(mutations.some(c=>c.operator==='span'&&c.suffix===suffix),suffix);
  for(const suffix of ['ではないない','ではではない','ではないではない','でではない'])assert.ok(mutations.some(c=>c.operator==='repeat'&&c.suffix===suffix),suffix);
  assert.ok(mutations.some(c=>c.operator==='order'&&c.suffix==='ではいな'));
  assert.ok(mutations.some(c=>c.operator==='voicing'&&c.suffix==='でぱない')===false);
  assert.ok(mutations.some(c=>c.operator==='voicing'&&c.suffix==='でぱない'));
  assert.ok(mutations.some(c=>c.operator==='kana-size'&&c.suffix==='ではなぃ'));
  assert.ok(!mutations.some(c=>c.suffix==='ないない'),'deletion plus duplication is not one mutation');
  assert.deepEqual(commonSuffixMutations(''),[],'bare imperative stems have no suffix to mutate');
});

test('independent adjective contracts distinguish ku stems from the following suffix',()=>{
  const item=adj('白い','しろい');
  for(const [form,input,failed] of [
    ['adjectiveNegative','しろぐない','adj.stem.i-ku'],
    ['adjectiveNegative','しろくくない','adj.stem.i-ku'],
    ['adjectiveNegative','しろない','adj.stem.i-ku'],
    ['adjectiveNegative','しろくいな','adj.suffix.i-negative'],
    ['adjectivePast','しろかた','adj.suffix.i-past'],
    ['adjectivePast','しろかったった','adj.suffix.i-past'],
    ['adjectiveBa','しろくければ','adj.suffix.i-ba'],
  ])assert.equal(find(casesFor(item,form),input)?.expected.failed,failed,`${form} ${input}`);
  assert.equal(find(casesFor(adj('静か','しずか','na'),'adjectiveNaNegative'),'しずかではないない')?.expected.failed,'adj.suffix.na-negative');
  assert.ok(!find(casesFor(adj('静か','しずか','na'),'adjectiveNaNegative'),'しずかないない'));
  assert.ok(!find(casesFor(adj('いい','いい','i',true),'adjectivePast'),'いかた'),'ii errors only use a correctly supplied yo stem');
});

test('verb rows, retained ru, irregular stems and onbin have independent KC owners',()=>{
  for(const [item,form,input,failed] of [
    [verb('書く','かく'),'negative','書けない',null], // Complete potential-negative form: not proof of an a-row error.
    [verb('買う','かう'),'negative','買あない','stem.godan.u-wa'],
    [verb('書く','かく'),'masu','書こます','stem.godan.i'],
    [verb('食べる','たべる','ichidan'),'negative','食べるない','stem.ichidan.drop-ru'],
    [verb('する','する','irregular'),'masu','さます','stem.irregular.connective'],
    [verb('する','する','irregular'),'masu','すます',null],
    [verb('読む','よむ'),'te','読っで','onbin.hatsuon'],
    [verb('行く','いく'),'past','行んた','facet.onbin.sokuon.iku'],
  ])assert.equal(find(casesFor(item,form),input)?.expected.failed,failed,`${item.surface} ${form} ${input}`);
});

test('valid contractions are excluded and old explicit evidence stays ahead of local edits',()=>{
  const item=verb('食べる','たべる','ichidan');
  assert.ok(!find(casesFor(item,'potential'),'食べれる'));
  const expected={kind:'incorrect',failed:'suffix.potential',confirmed:['stem.ichidan.drop-ru'],steps:0};
  const old=[{input:'食べれ',step:null,pattern:'ending-deletion',expected}];
  assert.deepEqual(find(casesFor(item,'potential',{existingCases:old}),'食べれ').expected,expected);
  const unrelated={...old[0],step:{form:'negative'}};
  assert.notEqual(find(casesFor(item,'potential',{existingCases:[unrelated]}),'食べれ').expected,expected,'step contracts cannot leak into another context');
});

test('lexical insertions and transpositions require an intact suffix and an internal unique correction',()=>{
  const item=verb('申し込む','もうしこむ');
  const cases=casesFor(item,'past');
  assert.equal(find(cases,'ももうしこんだ')?.expected.kind,'typo');
  assert.equal(find(cases,'うもしこんだ')?.expected.kind,'typo');
  assert.ok(!find(casesFor(verb('書く','かく'),'past'),'かかいた'),'one-character fixed roots do not establish insertion evidence');
  for(const c of cases.filter(c=>c.pattern==='common-multiple-guard'))assert.deepEqual(c.expected,{kind:'incorrect',failed:null,confirmed:[]});
  const search=verb('調べる','しらべる','ichidan');
  assert.equal(commonLexicalExpectation(search,'potential','しべられる').kind,'incorrect','a deletion and a transposition point at two different accepted answers');
  assert.equal(commonLexicalExpectation(verb('申し込む','もうしこむ'),'past','もしこんだ').kind,'typo');
});

test('completed prerequisites expose the final single attachment in fifteen additional targets',()=>{
  const item=verb('書く','かく');
  const examples={
    naide:'かかないて',naideKudasai:'かかないでくさい',nakutemoIi:'かかなくてももいい',
    nakutewaIkenai:'かかなくてはいない',nakerebaNaranai:'かかなければならい',naitoIkenai:'かかないといない',
    tara:'かいたらら',tari:'かいたりり',tatte:'かいたて',youtosuru:'かこうとすする',
    zuni:'かかずずに',masenka:'かきまんか',masuPast:'かきましだ',masuNegative:'かきまん',masuNegativePast:'かきませんでた',
  };
  const polite={masuPast:'compound.polite-past',masuNegative:'compound.polite-negative',masuNegativePast:'compound.polite-negative-past'};
  for(const form of extraTargets)assert.deepEqual(find(casesFor(item,form),examples[form])?.expected,{kind:'incorrect',failed:polite[form]??`construction.${form}`,confirmed:[],steps:0},form);
  for(const form of ['masenka','masuPast','masuNegative','masuNegativePast'])assert.deepEqual(find(casesFor(item,form),'書き')?.expected,{kind:'incorrect',failed:null,confirmed:['stem.godan.i'],steps:2,continuation:true},form);
});

test('supplied bases keep wrong-class ambiguity and never mutate completed ku or the iku lexical prefix',()=>{
  const item=verb('書く','かく');
  const old=generateErrorCases({item,form:'teikuPast'}).cases;
  const step=old.find(c=>c.step?.continuation&&c.step.surface==='書いていく')?.step;
  assert.ok(step);
  const generated=casesFor(item,'teikuPast',{step,existingCases:old.filter(c=>!c.pattern.startsWith('common-'))});
  assert.equal(find(generated,'書いていた')?.expected.failed,null);
  assert.ok(!generated.some(c=>c.input.startsWith('書いい')),'contracted bases are not silently treated as full iku');
  for(const c of generated)if(c.expected.failed)assert.ok(step.kcIds.includes(c.expected.failed));
});

test('ordinary derived past/class conflicts require a stage, then a supplied-class rule judgment',()=>{
  // This table is independent of both the generator and production candidates.
  const targets=[
    ['tagaruPast','tagaru','godan','たがる'],['teoruPast','teoru','godan','ておる'],['tearuPast','tearu','godan','てある'],
    ['teageruPast','teageru','ichidan','てあげる'],['tekureruPast','tekureru','ichidan','てくれる'],
    ['teiruPast','teiru','ichidan','ている'],['temiruPast','temiru','ichidan','てみる'],['sugiruPast','sugiru','ichidan','すぎる'],
    ['passivePast','passive','ichidan','受身形'],['potentialPast','potential','ichidan','可能形'],
    ['causativePast','causative','ichidan','使役形'],['causativePassivePast','causativePassive','ichidan','使役受身形'],
  ];
  for(const [form,baseForm,cls,label] of targets) {
    const item=verb('包む','つつむ'),step=unifiedDiagnosticSteps(item,form).at(-1);
    const all=generateErrorCases({item,form}).cases;
    for(const writing of ['surface','reading'])assert.ok(all.some(c=>c.writing===writing&&c.expected.review&&c.step?.form===form),`${form}/${writing} must generate actual mixed review contracts`);
    for(const c of all.filter(c=>c.pattern.startsWith('common-mixed-past-')))assert.equal(
      evaluateGeneratedCase(c,createAnswerAnalyzer(item,form,{step:c.step})(c.input)).status,'pass',`${form} ${c.input}`,
    );
    for(const base of new Set(step.providedAnswers)) {
      const input=base.slice(0,-1)+(cls==='godan'?'た':'った');
      const c=find(all.filter(c=>JSON.stringify(c.step)===JSON.stringify(step)),input);
      assert.ok(c,`${form} ${input} must actually be generated`);
      assert.deepEqual(c.expected.stage,{form:'past',label:`${label}的过去变化`,candidateKcIds:[`apply.${baseForm}.continuation`,cls==='godan'?'onbin.sokuon':'suffix.past']});
      assert.equal(c.expected.steps,2);
      assert.equal(c.expected.failed,null);
      assert.deepEqual(c.expected.confirmed,[]);
      const actual=createAnswerAnalyzer(item,form,{step})(input);
      assert.equal(evaluateGeneratedCase(c,actual).status,'pass',`${form} ${input}`);
      assert.deepEqual(actual.steps.map(s=>s.kind),['classification','conjugation']);
      const choice=actual.steps[0],past=actual.steps[1];
      assert.equal(choice.expectedClass,cls);
      assert.deepEqual(choice.kcIds,[]);
      assert.equal(past.providedClass,cls);
      const rerun=createAnswerAnalyzer(item,form,{step:past})(input);
      assert.equal(rerun.diagnosis?.kcId,cls==='godan'?'onbin.sokuon':'suffix.past');
      assert.deepEqual(rerun.diagnosis?.confirmedKcIds,[]);
      assert.deepEqual(rerun.steps,[],'provided class terminates the ambiguity rather than recursively asking it again');
    }
    const classification=all.filter(c=>c.pattern==='continuation-classification');
    assert.ok(classification.some(c=>c.input===cls&&c.expected.kind==='correct'));
    assert.ok(classification.some(c=>c.input!=='xyz§'&&c.input!==cls&&c.expected.kind==='incorrect'));
    assert.ok(all.some(c=>c.step?.providedClass===cls&&c.pattern==='common-multiple-guard'));
    for(const c of all.filter(c=>c.step?.form===form&&c.pattern==='common-multiple-guard')) {
      assert.equal(c.expected.stage,null,'a damaged root cannot establish the derived-class stage');
      assert.equal(c.expected.steps,0);
      const actual=createAnswerAnalyzer(item,form,{step:c.step})(c.input);
      assert.equal(evaluateGeneratedCase(c,actual).status,'pass');
    }
  }
  for(const item of [verb('食べる','たべる','ichidan'),verb('勉強する','べんきょうする','irregular')])for(const form of ['tagaruPast','teageruPast']) {
    const stages=generateErrorCases({item,form}).cases.filter(c=>c.expected.stage?.form==='past');
    assert.ok(stages.length,`${item.class} source still requires the derived output class`);
    for(const c of stages)assert.equal(evaluateGeneratedCase(c,createAnswerAnalyzer(item,form,{step:c.step})(c.input)).status,'pass');
  }
  for(const form of ['teikuPast','tekuruPast','youtosuruPast','teokuPast','temorauPast','teshimauPast']) {
    const item=verb('包む','つつむ'),cases=generateErrorCases({item,form}).cases;
    assert.ok(!cases.some(c=>c.expected.stage?.form==='past'),form);
    assert.ok(!cases.some(c=>c.pattern==='continuation-classification'),`${form} must not invent a class choice for non-ru/special outputs`);
    if(['temorauPast','teshimauPast'].includes(form)) {
      const step=unifiedDiagnosticSteps(item,form).at(-1),input=step.reading.slice(0,-1)+'た';
      const actual=createAnswerAnalyzer(item,form,{step})(input);
      assert.equal(actual.diagnosis?.stage??null,null);
      assertGenericOrTerminal(actual,step.kcIds);
    }
  }
  const reused=verb('買う','かう'),form='teoruPast',step=unifiedDiagnosticSteps(reused,form).at(-1);
  assert.ok(!step.kcIds.includes('onbin.sokuon'),'the original te base already evaluated this shared rule');
  const input=step.reading.slice(0,-1)+'た';
  const c=find(casesFor(reused,form,{step}),input);
  assert.deepEqual(c.expected.stage.candidateKcIds,['apply.teoru.continuation'],'the oracle cannot introduce an out-of-step candidate');
  const actual=createAnswerAnalyzer(reused,form,{step})(input);
  assert.deepEqual(actual.diagnosis.stage.candidateKcIds,['apply.teoru.continuation']);
  assert.equal(actual.steps[0].kind,'classification');
  assert.ok(actual.steps.every(probe=>!probe.kcIds.includes('onbin.sokuon')));
});

test('mixed past observations require independent review without scoring the original answer or revealing its ending',()=>{
  const item=verb('閉める','しめる','ichidan'),form='tagaruPast';
  const step=unifiedDiagnosticSteps(item,form).at(-1),cases=generateErrorCases({item,form}).cases;
  for(const [input,rootMismatch] of [
    ['しまたがだ',{expected:'しめ',actual:'しま',operation:'substitution'}],
    ['閉またがだ',{expected:'閉め',actual:'閉ま',operation:'substitution'}],
    ['したがだ',{expected:'しめ',actual:'し',operation:'deletion'}],
    ['ししめたがだ',{expected:'しめ',actual:'ししめ',operation:'insertion'}],
    ['めしたがだ',{expected:'しめ',actual:'めし',operation:'transposition'}],
    ['しめたがだ',null],['しめたがんだ',null],
  ]) {
    const c=find(cases.filter(c=>JSON.stringify(c.step)===JSON.stringify(step)),input,'common-mixed-past-review');
    assert.ok(c,`${input} is a generated contract, not a hand-entered test only`);
    assert.deepEqual(c.expected.review,{kind:'mixed-past',form:'past',label:'たがる的过去变化',rootMismatch});
    assert.equal(c.expected.stage,null);assert.equal(c.expected.failed,null);assert.deepEqual(c.expected.confirmed,[]);assert.equal(c.expected.steps,2);
    assert.equal(evaluateGeneratedCase(c,createAnswerAnalyzer(item,form,{step})(input)).status,'pass',input);
    const followup=find(cases.filter(c=>c.step?.providedClass==='godan'),input,'common-mixed-past-review');
    assert.ok(followup,`${input} also checks the class-given observation`);
    assert.equal(followup.expected.steps,0);
    assert.equal(evaluateGeneratedCase(followup,createAnswerAnalyzer(item,form,{step:followup.step})(input)).status,'pass');
  }
  for(const input of ['さまたがだ','しめだがだ','§しめたがだ','しめたが§だ']) {
    const actual=createAnswerAnalyzer(item,form,{step})(input);
    assert.equal(actual.diagnosis?.review??null,null,input);assert.equal(actual.diagnosis?.kcId??null,null);assertGenericOrTerminal(actual,step.kcIds);
  }
  const typo=createAnswerAnalyzer(item,form,{step})('しまたがった');
  assert.equal(typo.kind,'typo');assert.equal(typo.diagnosis?.review??null,null);
  const strict=createAnswerAnalyzer(item,form,{step})('しめたがた');
  assert.ok(strict.diagnosis?.stage);assert.equal(strict.diagnosis?.review??null,null);
  const explicit=createAnswerAnalyzer(item,form,{step})('しめたがっだ');
  assert.equal(explicit.diagnosis?.kcId,'suffix.past');assert.equal(explicit.diagnosis?.review??null,null);
  for(const other of ['temorauPast','teshimauPast','teikuPast','tagaruNegative','tagaruNegativePast']) {
    const context=unifiedDiagnosticSteps(item,other).at(-1),input=context.reading.slice(0,-1)+'だ';
    const actual=createAnswerAnalyzer(item,other,{step:context})(input);
    assert.equal(actual.diagnosis?.review??null,null,other);
  }
});

test('every applicable native target and standalone construction generates the common matrix in both writings',()=>{
  // This applicability table is intentionally outside the generator. A missing
  // target cannot pass merely because another target produced the same pattern.
  const verbForms=['negative','past','te','masu','nasai','potential','passive','causative','causativePassive','imperative','volitional','ba','prohibitive',
    'tai','nagara','tsutsu','sugiru','tagaru','teageru','temorau','tekureru','tekudasai','teiru','teru','tearu','teoru','tehoshii','temo','tewa','temoIi','temiru','teiku','teku','tekuru','teshimau','teoku',...extraTargets];
  const words=[verb('泳ぐ','およぐ'),verb('食べる','たべる','ichidan'),verb('勉強する','べんきょうする','irregular'),verb('来る','くる','irregular')];
  for(const item of words)for(const form of verbForms) {
    const cases=casesFor(item,form);
    for(const writing of ['surface','reading']) {
      const prefix=`${item.class}/${item.surface}/${form}/${writing}`;
      // Godan imperatives consist solely of the e-row stem: no suffix exists.
      const patterns=item.class==='godan'&&form==='imperative'?['common-stem-row']:['common-suffix-span','common-suffix-repeat'];
      const longSuffixes=['nasai','causativePassive','nagara','sugiru','tagaru','teageru','temorau','tekureru','tekudasai','tehoshii','temoIi','teshimau','nakutewaIkenai','nakerebaNaranai','naitoIkenai','youtosuru','masenka','masuPast','masuNegative','masuNegativePast'];
      if(longSuffixes.includes(form)||item.class==='ichidan'&&['passive','potential','causative'].includes(form))patterns.push('common-suffix-disjoint');
      for(const pattern of patterns)assert.ok(cases.some(c=>c.writing===writing&&c.pattern===pattern),`${prefix}: ${pattern}`);
      if(item.class==='godan'&&['past','te'].includes(form))assert.ok(cases.some(c=>c.writing===writing&&c.pattern==='common-onbin-choice'),prefix);
    }
  }
  const adjectives=[
    [adj('白い','しろい'),['adjectivePast','adjectiveBa','adjectiveNegative','adjectiveTe','adjectiveAdverb']],
    [adj('格好いい','かっこいい','i',true),['adjectivePast','adjectiveBa','adjectiveNegative','adjectiveTe','adjectiveAdverb']],
    [adj('静か','しずか','na'),['adjectiveAttributive','adjectivePredicative','adjectiveNaNegative','adjectiveNaPast','adjectiveNaTe','adjectiveBa','adjectiveAdverb']],
  ];
  for(const [item,forms] of adjectives)for(const form of forms)for(const writing of ['surface','reading']) {
    const cases=casesFor(item,form),patterns=item.class==='i'&&form==='adjectiveAdverb'?['common-stem-row']:['common-suffix-span','common-suffix-repeat'];
    if((item.class==='i'?['adjectivePast','adjectiveBa']:['adjectiveNaNegative','adjectiveNaPast']).includes(form))patterns.push('common-suffix-disjoint');
    for(const pattern of patterns)assert.ok(cases.some(c=>c.writing===writing&&c.pattern===pattern),`${item.surface}/${form}/${writing}/${pattern}`);
  }
});

test('the complete common matrix is deterministic and production satisfies representative whole and step contracts',()=>{
  const fixtures=[
    [adj('白い','しろい'),'adjectiveNegative'],[adj('白い','しろい'),'adjectivePast'],
    [adj('静か','しずか','na'),'adjectiveNaNegative'],[adj('いい','いい','i',true),'adjectivePast'],
    [verb('書く','かく'),'negative'],[verb('泳ぐ','およぐ'),'te'],[verb('する','する','irregular'),'masu'],
    [verb('食べる','たべる','ichidan'),'potential'],[verb('申し込む','もうしこむ'),'past'],
    [verb('書く','かく'),'taiPast'],[verb('書く','かく'),'teageruPast'],[verb('書く','かく'),'teikuPast'],
    ...extraTargets.map(form=>[verb('書く','かく'),form]),
  ];
  const patterns=new Set();
  for(const [item,form] of fixtures) {
    const old=generateErrorCases({item,form}).cases.filter(c=>!c.pattern.startsWith('common-'));
    const contexts=[null,...new Map(old.filter(c=>c.step).map(c=>[JSON.stringify(c.step),c.step])).values()];
    for(const step of contexts) {
      const options={step,existingCases:old};
      const generated=generateCommonErrorCases(item,form,options);
      assert.deepEqual(generateCommonErrorCases(item,form,options),generated);
      const analyze=createAnswerAnalyzer(item,form,{step});
      for(const c of generated.cases) {
        patterns.add(c.pattern);
        const actual=analyze(c.input);
        const result=evaluateGeneratedCase({...c,item,form,step,kcIds:step?.kcIds??deriveUnified(item,form).requiredKcIds},actual);
        assert.notEqual(result.status,'regression',`${form} ${step?.surface??'whole'} ${c.input}: ${JSON.stringify(result.problems)}`);
      }
    }
  }
  for(const p of COMMON_ERROR_PATTERNS)assert.ok(patterns.has(p.id),p.id);
});
