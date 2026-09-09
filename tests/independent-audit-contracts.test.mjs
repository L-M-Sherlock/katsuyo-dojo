import assert from 'node:assert/strict';
import test from 'node:test';
import { generateErrorCases } from '../scripts/lib/error-patterns.mjs';
import { generateCommonErrorCases } from '../scripts/lib/common-error-patterns.mjs';
import { evaluateGeneratedCase } from '../scripts/lib/diagnosis-audit.mjs';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { ADJECTIVES } from '../app/lib/adjective-catalog.mjs';
import { unifiedDiagnosticSteps } from '../app/lib/unified-knowledge.mjs';

const verb=(surface,reading,cls='godan')=>({domain:'verb',surface,reading,class:cls});
const checked=c=>createAnswerAnalyzer(c.item,c.form,{step:c.step})(c.input);
const assess=(c,actual)=>evaluateGeneratedCase(c,actual).status;
const find=(item,form,input,where=c=>!c.step)=>generateErrorCases({item,form}).cases.find(c=>c.input===input&&where(c));

test('classification/operator collisions have independent no-penalty contracts that cannot lose their probes',()=>{
  for(const [item,form,input,classId] of [
    [verb('書く','かく'),'te','書て','class.godan'],
    [verb('書く','かく'),'teiru','かてる','class.godan'],
    [verb('買う','かう'),'past','かた','class.godan'],
    [verb('起きる','おきる','ichidan'),'past','おきった','class.ichidan'],
    [verb('する','する','irregular'),'masu','すます','facet.class.irregular.suru'],
  ]) {
    const cases=generateErrorCases({item,form}).cases.filter(c=>!c.step&&c.input===input&&c.expected.kind!=='explore');
    assert.ok(cases.length,`${input}: the independent generator must emit a contract`);
    for(const c of cases) {
      assert.equal(c.expected.failed,null,input);assert.deepEqual(c.expected.confirmed,[],input);
      const actual=checked(c);assert.equal(assess(c,actual),'pass',input);
      assert.equal(assess(c,{...actual,diagnosis:{kcId:classId,confirmedKcIds:[]}}),'regression','inventing a classification penalty is rejected');
    }
    const strong=cases.find(c=>c.expected.minSteps);assert.ok(strong,input);
    const actual=checked(strong);
    assert.equal(assess(strong,{...actual,steps:[],planFallback:false,feedback:{...actual.feedback,terminal:true}}),'regression','withholding all followups is rejected');
  }
  // A restricted scoring scope does not make an ambiguous explanation unique.
  const item=verb('起きる','おきる','ichidan');
  const step={analysisItem:item,form:'past',surface:item.surface,reading:item.reading,answers:['起きた'],readings:['おきた'],kcIds:['suffix.past'],continuation:false};
  const collision=generateCommonErrorCases(item,'past',{step}).cases.find(c=>c.input==='おきった');
  assert.equal(collision.expected.failed,null);assert.deepEqual(collision.expected.confirmed,[]);
});

test('dictionary endings before the correct terminal are generated for every godan sound family',()=>{
  const words=[['買う','かう','onbin.sokuon','た','て'],['取る','とる','onbin.sokuon','た','て'],
    ['待つ','まつ','onbin.sokuon','た','て'],['書く','かく','onbin.i','た','て'],
    ['泳ぐ','およぐ','onbin.i','だ','で'],['読む','よむ','onbin.hatsuon','だ','で'],
    ['遊ぶ','あそぶ','onbin.hatsuon','だ','で'],['死ぬ','しぬ','onbin.hatsuon','だ','で'],
    ['話す','はなす','stem.godan.shi-connective','た','て']];
  for(const [surface,reading,id,past,te] of words)for(const [form,tail] of [['past',past],['te',te],['teiru',te+'いる'],['tara',past+'ら']]) {
    const item=verb(surface,reading);
    for(const base of [surface,reading]) {
      const c=find(item,form,base+tail,x=>!x.step&&x.pattern==='common-onbin-choice');
      assert.ok(c,`${surface}/${form}/${base+tail}`);assert.equal(c.expected.failed,id);
      assert.deepEqual(c.expected.confirmed,[]);
      const actual=checked(c);assert.equal(assess(c,actual),'pass',c.input);
      assert.equal(assess(c,{...actual,diagnosis:null}),'regression','deleting the local rule diagnosis must fail the audit');
    }
  }
  const item=verb('包む','つつむ'),form='tagaruPast';
  const c=find(item,form,'つつみたがるた',x=>x.step?.form===form&&!x.step.providedClass);
  assert.equal(c.expected.failed,'onbin.sokuon');assert.equal(c.expected.review,undefined);
  assert.equal(assess(c,checked(c)),'pass');
  const mixed=find(item,form,'つたみたがだ',x=>x.step?.form===form&&!x.step.providedClass);
  assert.ok(mixed.expected.review);assert.equal(mixed.expected.failed,null);
});

test('supplied negative intermediates generate one past-only contract and independently replay its leaf',()=>{
  const read=verb('読む','よむ'),write=verb('書く','かく'),eat=verb('食べる','たべる','ichidan');
  for(const [item,form,input,confirmed] of [
    [read,'tagaruNegativePast','よみたがらない',['stem.godan.a','suffix.negative']],
    [read,'teiruNegativePast','よんでない',['stem.ichidan.drop-ru','suffix.negative']],
    [eat,'teiruNegativePast','たべてない',['suffix.negative']],
    [write,'tearuNegativePast','かいてない',['exception.aru-negative']],
    [read,'teokuNegativePast','よんどかない',['stem.godan.a','suffix.negative']],
    [read,'tekuruNegativePast','よんでこない',['suffix.negative']],
    [read,'teshimauNegativePast','よんじゃわない',['stem.godan.a','stem.godan.u-wa','suffix.negative']],
    [read,'taiNegativePast','よみたくない',['adj.stem.i-ku','adj.suffix.i-negative']],
    [read,'potentialNegativePast','よめない',['stem.ichidan.drop-ru','suffix.negative']],
  ]) {
    const cases=generateErrorCases({item,form}).cases;
    const c=cases.find(c=>c.step&&!c.originalInput&&c.pattern==='negative-intermediate'&&c.input===input);
    assert.ok(c,`${form}/${input}`);assert.deepEqual(new Set(c.expected.confirmed),new Set(confirmed));
    assert.equal(c.expected.failed,null);assert.equal(c.expected.steps,1);
    assert.deepEqual(c.expected.probes,[{kind:'atomic',focusId:'adj.suffix.i-past'}]);
    const actual=checked(c);assert.equal(assess(c,actual),'pass',`${form}/${input}`);
    assert.equal(assess(c,{...actual,diagnosis:{...actual.diagnosis,kcId:'compound.negative-past'}}),'regression');
    assert.equal(assess(c,{...actual,diagnosis:{...actual.diagnosis,confirmedKcIds:[]}}),'regression');
    assert.equal(assess(c,{...actual,steps:[],planFallback:false,feedback:{...actual.feedback,terminal:true}}),'regression');
    // Surface/kana stops share one supplied leaf context; the generator dedups
    // that context rather than replaying the same rule for each spelling.
    const leaves=cases.filter(c=>c.step?.kind==='atomic'&&c.sourceKcIds&&c.step.focusId==='adj.suffix.i-past');assert.ok(leaves.length,input);
    for(const leaf of leaves) {
      assert.deepEqual(leaf.kcIds,['adj.suffix.i-past']);assert.equal(assess(leaf,checked(leaf)),'pass',leaf.input);
    }
  }
  assert.ok(!generateErrorCases({item:write,form:'causativeNegativePast'}).cases.some(c=>c.step&&c.pattern==='negative-intermediate'&&c.input==='かかさない'));
  const exception=find(write,'tearuNegative','かいてあらない',c=>c.step?.continuation);
  assert.equal(exception.expected.failed,'exception.aru-negative');assert.equal(assess(exception,checked(exception)),'pass');
});

test('five adjective analogies cover all compatible words and both writings without assigning stem credit',()=>{
  for(const item of ADJECTIVES) {
    const specs=item.class==='i'?[['adjectiveBa','くれば','adj.suffix.i-ba']]:[
      ['adjectiveNaNegative','だない','adj.suffix.na-negative'],['adjectiveNaTe','だて','adj.suffix.na-te'],
      ['adjectiveAttributive','の','adj.suffix.na-attributive'],['adjectiveBa','だば','adj.suffix.na-conditional']];
    for(const [form,tail,id] of specs) {
      const cases=generateCommonErrorCases(item,form).cases;
      for(const base of new Set([item.surface,item.reading])) {
        const root=item.class==='na'?base:item.iiFamily?base.slice(0,-2)+'よ':base.slice(0,-1);
        const c=cases.find(c=>c.input===root+tail);assert.ok(c,`${item.surface}/${form}/${root+tail}`);
        assert.equal(c.expected.failed,id);assert.deepEqual(c.expected.confirmed,[]);
      }
    }
  }
});

test('standard variants and katakana are positive generated controls rather than newly labeled errors',()=>{
  for(const [item,form,inputs] of [
    [verb('食べる','たべる','ichidan'),'imperative',['食べよ','タベヨ']],
    [verb('する','する','irregular'),'potential',['出来る','デキル']],
    [verb('勉強する','べんきょうする','irregular'),'potentialNegativePast',['勉強出来なかった','ベンキョウデキナカッタ']],
  ]) {
    const cases=generateErrorCases({item,form}).cases;
    for(const input of inputs) {
      const c=cases.find(c=>!c.step&&c.input===input);assert.ok(c,input);assert.equal(c.expected.kind,'correct');
      const actual=checked(c);assert.equal(assess(c,actual),'pass',input);
      assert.equal(assess(c,{...actual,kind:'incorrect'}),'regression');
    }
    const supplied=unifiedDiagnosticSteps(item,form);
    for(const c of cases.filter(c=>c.step&&c.expected.kind==='correct'&&/[ァ-ヶ]/.test(c.input)))assert.equal(assess(c,checked(c)),'pass');
    if(supplied.length)assert.ok(cases.some(c=>c.step&&c.expected.kind==='correct'&&/[ァ-ヶ]/.test(c.input)));
  }
});
