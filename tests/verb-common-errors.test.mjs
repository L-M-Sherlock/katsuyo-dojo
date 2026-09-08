import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseCommonConjugationError, diagnoseConjugation } from '../app/lib/knowledge-model.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { createAnswerAnalyzer, normalizeAnswer } from '../app/lib/answer-analysis.mjs';
import { updateKnowledgeStats, emptySkillStats } from '../app/lib/adaptive.mjs';

const verb=(surface,reading,cls='godan')=>({domain:'verb',surface,reading,class:cls});
const diagnose=(item,form,input,scope=deriveUnified(item,form).requiredKcIds)=>
  diagnoseCommonConjugationError(item,form,input,normalizeAnswer,scope)
  ?? diagnoseCommonConjugationError({...item,surface:item.reading,lexicalSurface:item.surface},form,input,normalizeAnswer,scope);
const check=(item,form,input,kcId)=>{
  const result=diagnose(item,form,input);
  assert.equal(result?.kcId,kcId,`${item.surface} ${form}: ${input}`);
  assert.deepEqual(result.confirmedKcIds,[]);
  return result;
};

test('retained dictionary endings and wrong godan rows identify only the required stem',()=>{
  for(const [item,form,input,kc] of [
    [verb('書く','かく'),'masu','かくます','stem.godan.i'],
    [verb('書く','かく'),'masu','かかます','stem.godan.i'],
    [verb('書く','かく'),'masu','かけます','stem.godan.i'],
    [verb('書く','かく'),'passive','かきれる','stem.godan.a'],
    [verb('読む','よむ'),'tai','よむたい','stem.godan.i'],
    [verb('読む','よむ'),'volitional','よみう','stem.godan.o'],
    [verb('買う','かう'),'negative','かあない','stem.godan.u-wa'],
    [verb('買う','かう'),'negative','かいない','stem.godan.a'],
    [verb('食べる','たべる','ichidan'),'negative','たべるない','stem.ichidan.drop-ru'],
    [verb('食べる','たべる','ichidan'),'tai','たべるたい','stem.ichidan.drop-ru'],
  ])check(item,form,input,kc);
});

test('irregular kana stem confusions use the existing current-form rules',()=>{
  for(const [item,form,input,kc] of [
    [verb('する','する','irregular'),'negative','せない','suffix.negative'],
    [verb('する','する','irregular'),'masu','さます','stem.irregular.connective'],
    [verb('勉強する','べんきょうする','irregular'),'tai','べんきょうさたい','stem.irregular.connective'],
    [verb('来る','くる','irregular'),'negative','きない','suffix.negative'],
    [verb('来る','くる','irregular'),'masu','こます','stem.irregular.connective'],
    [verb('来る','くる','irregular'),'tai','こたい','stem.irregular.connective'],
  ])check(item,form,input,kc);
});

test('sound-change swaps retain both the lexical root and the correct terminal voicing',()=>{
  for(const [item,form,input,kc] of [
    [verb('書く','かく'),'te','かって','onbin.i'],
    [verb('泳ぐ','およぐ'),'past','およんだ','onbin.i'],
    [verb('読む','よむ'),'te','よいで','onbin.hatsuon'],
    [verb('待つ','まつ'),'past','まいた','onbin.sokuon'],
    [verb('話す','はなす'),'te','はなって','stem.godan.shi-connective'],
    [verb('行く','いく'),'past','いつた','facet.onbin.sokuon.iku'],
    [verb('書く','かく'),'teageru','かってあげる','onbin.i'],
  ])check(item,form,input,kc);
  for(const [item,form,input] of [
    [verb('読む','よむ'),'te','よいて'],
    [verb('書く','かく'),'past','かんだ'],
    [verb('泳ぐ','およぐ'),'past','およんた'],
    [verb('書く','かく'),'teageru','かってあげない'],
  ])assert.equal(diagnose(item,form,input),null,input);
});

test('suffix edits stay after a fully correct stem or te-form',()=>{
  for(const [item,form,input,kc] of [
    [verb('食べる','たべる','ichidan'),'passive','たべらる','suffix.passive'],
    [verb('書く','かく'),'tekudasai','かいてくさい','construction.tekudasai'],
    [verb('書く','かく'),'tekudasai','かいてくだざい','construction.tekudasai'],
    [verb('書く','かく'),'tekudasai','かいてくださださい','construction.tekudasai'],
    [verb('書く','かく'),'teageru','かいてあげあげる','construction.teageru'],
    [verb('書く','かく'),'masu','かきまず','suffix.masu'],
    [verb('書く','かく'),'masu','かきまっす','suffix.masu'],
    [verb('書く','かく'),'masu','かきまます','suffix.masu'],
    [verb('書く','かく'),'masu','かきますます','suffix.masu'],
    [verb('書く','かく'),'masu','かきすま','suffix.masu'],
    [verb('書く','かく'),'teiru','かいているる','construction.teiru'],
    [verb('書く','かく'),'teiru','かいているいる','construction.teiru'],
    [verb('読む','よむ'),'tai','よみだい','construction.tai'],
    [verb('読む','よむ'),'tsutsu','よみっつ','construction.tsutsu'],
  ])check(item,form,input,kc);
});

test('accepted variants and old competing diagnoses are never overridden',()=>{
  for(const [item,form,input] of [
    [verb('食べる','たべる','ichidan'),'potential','たべれる'],
    [verb('書く','かく'),'teiru','かいてる'],
    [verb('する','する','irregular'),'imperative','せよ'],
    [verb('待つ','まつ'),'te','まて'],
    [verb('取る','とる'),'potential','とられる'],
    [verb('食べる','たべる','ichidan'),'past','たべった'],
    [verb('勉強する','べんきょうする','irregular'),'tai','べんきょうすたい'],
  ])assert.equal(diagnose(item,form,input),null,input);
  assert.equal(diagnoseConjugation(verb('読む','よむ'),'te','読んて')?.kcId,'onbin.voicing');
  assert.equal(diagnoseConjugation(verb('書く','かく'),'past','書きた')?.kcId,'onbin.i');
});

test('damaged roots, mixed steps and out-of-scope knowledge retain conservative handling',()=>{
  for(const [item,form,input] of [
    [verb('書く','かく'),'masu','さくます'],
    [verb('食べる','たべる','ichidan'),'negative','なべるない'],
    [verb('書く','かく'),'tekudasai','さいてくさい'],
    [verb('書く','かく'),'teageruPast','かいてあげるた'],
    [verb('読む','よむ'),'taiPast','よみたった'],
  ])assert.equal(diagnose(item,form,input),null,input);
  assert.equal(diagnose(verb('書く','かく'),'masu','かくます',['suffix.masu']),null);
  const item=verb('書く','かく'),form='masu';
  const diagnosis=check(item,form,'かくます','stem.godan.i');
  const ids=deriveUnified(item,form).requiredKcIds;
  const before=Object.fromEntries([...ids,'test.unrelated'].map(id=>[id,{...emptySkillStats(),attempts:4,correct:4}]));
  const after=updateKnowledgeStats(before,{kcIds:ids,focusId:'suffix.masu',correct:false,failedKcId:diagnosis.kcId,confirmedKcIds:diagnosis.confirmedKcIds});
  assert.equal(after['stem.godan.i'].attempts,5);
  for(const id of [...ids,'test.unrelated'].filter(id=>id!=='stem.godan.i'))assert.deepEqual(after[id],before[id]);
});

test('provided auxiliary bases preserve compound prefixes and use the real tail class',()=>{
  const run=(surface,form,input,outputClass,kcIds)=>diagnoseCommonConjugationError(
    verb(surface,surface,['kuru','irregular'].includes(outputClass)?'irregular':'godan'),form,input,normalizeAnswer,kcIds,
    {providedBase:true,outputClass},
  );
  for(const [surface,form,input,outputClass,kcIds,failed] of [
    ['かいてくる','negative','かいてきない','kuru',['suffix.negative'],'suffix.negative'],
    ['書いて来る','past','書いて来たた','kuru',['suffix.past'],'suffix.past'],
    ['書いて行く','past','書いて行つた','iku',['onbin.sokuon','facet.onbin.sokuon.iku','suffix.past'],'facet.onbin.sokuon.iku'],
    ['かこうとする','negative','かこうとせない','irregular',['suffix.negative'],'suffix.negative'],
    ['かいてある','past','かいてあいた','aru',['onbin.sokuon','suffix.past'],'onbin.sokuon'],
  ]) {
    const diagnosis=run(surface,form,input,outputClass,kcIds);
    assert.equal(diagnosis?.kcId,failed,input);
    assert.equal(diagnosis.answer,input);
    assert.deepEqual(diagnosis.confirmedKcIds,[]);
  }
  for(const [surface,form,input,outputClass,kcIds] of [
    ['かいてくる','negative','かいてこない','kuru',['suffix.negative']],
    ['かいていく','past','かいていった','iku',['onbin.sokuon','facet.onbin.sokuon.iku','suffix.past']],
    ['かいていく','past','かいていた','iku',['onbin.sokuon','facet.onbin.sokuon.iku','suffix.past']],
    ['かいてくる','negative','さいてきない','kuru',['suffix.negative']],
    ['かいていく','past','さいていた','iku',['onbin.sokuon','facet.onbin.sokuon.iku','suffix.past']],
    ['かいてある','negative','かいてあらない','aru',['exception.aru-negative']],
    ['かいてくる','negative','かいてきない','kuru',['suffix.past']],
  ])assert.equal(run(surface,form,input,outputClass,kcIds),null,input);
  for(const [surface,input] of [['かいてあげる','かいてあげった'],['かいている','かいていった']]) {
    assert.equal(diagnoseCommonConjugationError(verb(surface,surface,'ichidan'),'past',input,normalizeAnswer,
      ['stem.ichidan.drop-ru','suffix.past'],{providedBase:true,outputClass:'ichidan'}),null,input);
  }
});

test('complete negative, past, volitional and polite bases isolate remaining construction edits',()=>{
  const item=verb('書く','かく');
  for(const [form,input,kc] of [
    ['naide','かかないて','construction.naide'],
    ['naideKudasai','かかないでくさい','construction.naideKudasai'],
    ['nakutemoIi','かかなくてもい','construction.nakutemoIi'],
    ['nakutewaIkenai','かかなくてはいない','construction.nakutewaIkenai'],
    ['nakerebaNaranai','かかなければならい','construction.nakerebaNaranai'],
    ['naitoIkenai','かかないといない','construction.naitoIkenai'],
    ['tara','かいたらら','construction.tara'],
    ['tari','かいたりり','construction.tari'],
    ['tatte','かいたつて','construction.tatte'],
    ['youtosuru','かこうとる','construction.youtosuru'],
    ['zuni','かかすに','construction.zuni'],
    ['masenka','かきませんんか','construction.masenka'],
    ['masuPast','かきましった','compound.polite-past'],
    ['masuNegative','かきまん','compound.polite-negative'],
    ['masuNegativePast','かきませんでた','compound.polite-negative-past'],
  ])check(item,form,input,kc);
  check(verb('勉強する','べんきょうする','irregular'),'zuni','べんきょうせすに','construction.zuni');
  for(const [form,input] of [
    ['naideKudasai','かきないでくさい'],
    ['nakutemoIi','かかないてもい'],
    ['nakerebaNaranai','かかないければならい'],
    ['masuNegativePast','かかませんでた'],
  ])assert.equal(diagnose(item,form,input),null,input);
  for(const [form,input] of [['chau','かいちゃちゃう'],['toku','かいととく'],['toru','かいととる']]) {
    assert.equal(diagnose(item,form,input),null,input);
  }
});

test('complete polite alternatives confirm observed stem and masu rules without classification evidence',()=>{
  for(const [item,inputs,confirmed] of [
    [verb('書く','かく'),['書きました','かきません'],['stem.godan.i','suffix.masu']],
    [verb('食べる','たべる','ichidan'),['食べました','たべません'],['stem.ichidan.drop-ru','suffix.masu']],
    [verb('する','する','irregular'),['しました','しません'],['suffix.masu']],
    [verb('来る','くる','irregular'),['来ました','きません'],['suffix.masu']],
  ])for(const input of inputs) {
    const form='masuNegativePast',analysis=createAnswerAnalyzer(item,form)(input);
    assert.equal(analysis.diagnosis?.kcId,'compound.polite-negative-past',input);
    assert.deepEqual(analysis.diagnosis.confirmedKcIds,confirmed,input);
    const ids=deriveUnified(item,form).requiredKcIds;
    const before=Object.fromEntries(ids.map(id=>[id,{...emptySkillStats(),attempts:3,correct:3}]));
    const after=updateKnowledgeStats(before,{kcIds:ids,focusId:analysis.diagnosis.kcId,correct:false,
      failedKcId:analysis.diagnosis.kcId,confirmedKcIds:analysis.diagnosis.confirmedKcIds});
    for(const id of ids.filter(id=>/^(class\.|heuristic\.|facet\.)/.test(id)))assert.deepEqual(after[id],before[id],`${input}: ${id}`);
  }
  for(const [form,input,failed] of [
    ['masuPast','書きません','compound.polite-past'],
    ['masuNegative','書きました','compound.polite-negative'],
  ]) {
    const result=createAnswerAnalyzer(verb('書く','かく'),form)(input);
    assert.equal(result.diagnosis?.kcId,failed);
    assert.deepEqual(result.diagnosis.confirmedKcIds,['stem.godan.i','suffix.masu']);
  }
});
