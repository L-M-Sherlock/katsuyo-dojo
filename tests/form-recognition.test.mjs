import test from 'node:test';
import assert from 'node:assert/strict';
import {UNIFIED_COURSES} from '../app/lib/unified-curriculum.mjs';
import {acceptedConjugations} from '../app/lib/conjugation.mjs';
import {acceptedAdjectiveConjugations} from '../app/lib/adjective-conjugation.mjs';
import {recognizeForms,recognizedFormsIdentification} from '../app/lib/form-recognition.mjs';
import {createAnswerAnalyzer,normalizeAnswer} from '../app/lib/answer-analysis.mjs';
const verb=(surface,reading,cls='godan')=>({domain:'verb',surface,reading,class:cls});
const suwaru=verb('座る','すわる');

test('complete polite negative-past is identified before fallback stem feedback, in both writings and half-width kana',()=>{
  const analyze=createAnswerAnalyzer(suwaru,'negativePast');
  for(const input of ['すわりませんでした','座りませんでした','ｽﾜﾘﾏｾﾝﾃﾞｼﾀ。']) {
    const r=analyze(input);
    assert.equal(r.kind,'incorrect');assert.equal(r.diagnosis?.kcId??null,null);
    assert.deepEqual(r.recognizedForms.map(match=>match.form),['masuNegativePast']);
    assert.equal(r.feedback.resolution,'target-form');
    assert.match(r.feedback.message,/礼貌否定过去形.*普通体否定过去形/);
    assert.doesNotMatch(r.feedback.message,/词干位置|ア段/);
  }
  assert.equal(analyze('すわらなかった').kind,'correct');
  for(const input of ['すわりませんでしだ','たべませんでした'])assert.deepEqual(recognizeForms(suwaru,input,normalizeAnswer),[]);
});
test('homographs retain all form identities while accepted target variants always win',()=>{
  const item=verb('食べる','たべる','ichidan');
  assert.deepEqual(new Set(recognizeForms(item,'たべられる',normalizeAnswer).map(x=>x.form)),new Set(['potential','passive']));
  for(const target of ['potential','passive'])assert.equal(createAnswerAnalyzer(item,target)('たべられる').kind,'correct');
  const r=createAnswerAnalyzer(verb('書く','かく'),'negative')('かけない');
  assert.equal(r.diagnosis?.kcId??null,null);assert.match(r.feedback.message,/可能.*否定/);
});
test('all curriculum forms and accepted variants are recognized, without choosing one identity for coincident outputs',()=>{
  const items=[verb('書く','かく'),verb('行く','いく'),verb('食べる','たべる','ichidan'),verb('する','する','irregular'),verb('来る','くる','irregular'),
    {domain:'adjective',class:'i',surface:'早い',reading:'はやい'},
    {domain:'adjective',class:'i',surface:'いい',reading:'いい',iiFamily:true},
    {domain:'adjective',class:'na',surface:'静か',reading:'しずか'}];
  const seen=new Set();let samples=0;
  for(const item of items){
    const expected=new Map();
    for(const form of new Set(UNIFIED_COURSES.filter(c=>c.domain===item.domain).flatMap(c=>c.forms))){
      if(item.domain==='adjective'&&!['adjectiveBa','adjectiveAdverb'].includes(form)){
        const na=form.startsWith('adjectiveNa')||['adjectiveAttributive','adjectivePredicative'].includes(form);
        if(na!==(item.class==='na'))continue;
      }
      if(form==='causativePassiveContracted'&&(item.class!=='godan'||item.surface.endsWith('す')))continue;
      seen.add(form);
      for(const surface of new Set([item.surface,item.reading]))for(const answer of item.domain==='verb'?acceptedConjugations(surface,item.class,form):acceptedAdjectiveConjugations({...item,surface},form)){
        const key=normalizeAnswer(answer);if(!expected.has(key))expected.set(key,new Set());expected.get(key).add(form);
      }
    }
    for(const [input,forms] of expected){
      const matches=recognizeForms(item,input,normalizeAnswer);
      assert.deepEqual(new Set(matches.map(x=>x.form)),forms,`${item.surface}: ${input}`);
      assert.ok(matches.every(x=>typeof x.label==='string'&&x.label.length));samples++;
    }
  }
  assert.deepEqual(seen,new Set(UNIFIED_COURSES.flatMap(c=>c.forms)));
  assert.ok(samples>700);
});

test('complete forms excluded from teaching retain their structural identity and usage qualification',()=>{
  const aku={...verb('開く','あく'),meaning:'打开；开放'};
  const matches=recognizeForms(aku,'あいてある',normalizeAnswer);
  const match=matches.find(match=>match.form==='tearu');
  assert.ok(match);
  assert.equal(match.usage.status,'blocked');
  assert.equal(match.usage.category,'semantic');
  const analysis=createAnswerAnalyzer(aku,'past')('あいてある');
  assert.equal(analysis.kind,'incorrect');
  assert.doesNotMatch(analysis.diagnosis?.kcId??'',/^(class|heuristic|stem|onbin|exception)\./);
  assert.match(analysis.feedback.message,/从构形上看/);
  assert.match(analysis.feedback.message,/词义/);
  assert.doesNotMatch(analysis.feedback.message,/词干位置|イ音便.*错误|合法/);

  const furu={...verb('降る','ふる'),meaning:'下（雨雪）'};
  const wish=recognizeForms(furu,'ふりたい',normalizeAnswer).find(match=>match.form==='tai');
  assert.equal(wish.usage.status,'blocked');
  const passive=recognizeForms(furu,'ふられる',normalizeAnswer).find(match=>match.form==='passive');
  assert.equal(passive.usage.status,'context-required');
  const identification=recognizedFormsIdentification(furu,[passive],'普通体否定形');
  assert.match(identification,/从构形上看.*受身形/);
  assert.match(identification,/需要合适的语境/);
  assert.doesNotMatch(identification,/合法/);

  const chain=recognizeForms(furu,'ふってみたかった',normalizeAnswer).find(match=>match.form==='temiruDesirePast');
  assert.ok(chain,'unreviewed multi-step teaching combinations must still be structurally recognized');
  assert.notEqual(chain.usage.status,'allowed');
  assert.equal(chain.usage.context,undefined);
});

test('teaching exclusions do not expand structurally unsupported contractions',()=>{
  for(const [item,input] of [[verb('食べる','たべる','ichidan'),'たべさされる'],[verb('話す','はなす'),'はなさされる']]) {
    assert.ok(!recognizeForms(item,input,normalizeAnswer).some(match=>match.form==='causativePassiveContracted'));
  }
});
test('recognized intermediate keeps scoped follow-ups and fixed atomic steps do not accept another whole expression',()=>{
  const r=createAnswerAnalyzer(suwaru,'negativePast')('すわらない');
  assert.equal(r.steps.length,1);assert.equal(r.steps[0].form,'negativePast');
  assert.ok(r.recognizedForms.some(x=>x.form==='negative'));
  const step={kind:'conjugation',form:'negativePast',surface:'座る',reading:'すわる',answers:['座らなかった'],readings:['すわらなかった'],kcIds:['compound.negative-past']};
  const guided=createAnswerAnalyzer(suwaru,'negativePast',{step})('すわりませんでした');
  assert.equal(guided.feedback.resolution,'target-form');assert.equal(guided.diagnosis?.kcId??null,null);
});

test('provided special auxiliaries retain their own negative and sound-change exceptions',()=>{
  const aru={domain:'verb',surface:'借りてある',reading:'かりてある',class:'godan',tailClass:'aru'};
  const aruNegative=recognizeForms(aru,'かりてない',normalizeAnswer).find(x=>x.form==='negative');
  assert.ok(aruNegative);
  assert.equal(aruNegative.usage.status,'context-required');
  assert.equal(aruNegative.usage.reasonCode,'derived-expression');
  assert.deepEqual(recognizeForms(aru,'かりてあらない',normalizeAnswer),[]);
  const iku={domain:'verb',surface:'歩いていく',reading:'あるいていく',class:'godan',tailClass:'iku'};
  assert.ok(recognizeForms(iku,'あるいていった',normalizeAnswer).some(x=>x.form==='past'));
  assert.deepEqual(recognizeForms(iku,'あるいていいた',normalizeAnswer),[]);
});

test('supplied derived words are qualified by the whole situation rather than treated as invalid lexical senses',()=>{
  const item=verb('借りる','かりる','ichidan');
  const provided=verb('借りられる','かりられる','ichidan');
  const step={kind:'conjugation',form:'past',surface:provided.surface,reading:provided.reading,analysisItem:provided,
    answers:['借りられた'],readings:['かりられた'],kcIds:['stem.drop-ru','suffix.past']};
  const analysis=createAnswerAnalyzer(item,'past',{step})('かりられませんでした');
  assert.deepEqual(analysis.recognizedForms.map(match=>match.form),['masuNegativePast']);
  assert.equal(analysis.recognizedForms[0].usage.reasonCode,'derived-expression');
  assert.match(analysis.feedback.message,/给定中间形式/);
  assert.doesNotMatch(analysis.feedback.message,/词义.*不适合|不适合.*词义|词干位置/);
  assert.equal(analysis.diagnosis?.kcId??null,null);
});
