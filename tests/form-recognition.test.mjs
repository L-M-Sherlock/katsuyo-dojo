import { TRANSITIVE_VERBS } from '../app/lib/form-eligibility.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {UNIFIED_COURSES} from '../app/lib/unified-curriculum.mjs';
import {CHAIN_FORM_SPECS} from '../app/lib/multi-step-forms.mjs';
import {acceptedConjugations} from '../app/lib/conjugation.mjs';
import {acceptedAdjectiveConjugations} from '../app/lib/adjective-conjugation.mjs';
import {recognizeForms} from '../app/lib/form-recognition.mjs';
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
  for(const input of ['すわりませんでしだ','たべませんでした','すわってある'])assert.deepEqual(recognizeForms(suwaru,input,normalizeAnswer),[]);
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
      if(/^tearu(?:Past|Negative|NegativePast)?$/.test(form)&&!TRANSITIVE_VERBS.has(item.surface))continue;
      if(form==='causativePassiveContracted'&&(item.class!=='godan'||item.surface.endsWith('す')))continue;
      if(CHAIN_FORM_SPECS[form]&&!CHAIN_FORM_SPECS[form].words.includes(item.surface))continue;
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
  assert.ok(recognizeForms(aru,'かりてない',normalizeAnswer).some(x=>x.form==='negative'));
  assert.deepEqual(recognizeForms(aru,'かりてあらない',normalizeAnswer),[]);
  const iku={domain:'verb',surface:'歩いていく',reading:'あるいていく',class:'godan',tailClass:'iku'};
  assert.ok(recognizeForms(iku,'あるいていった',normalizeAnswer).some(x=>x.form==='past'));
  assert.deepEqual(recognizeForms(iku,'あるいていいた',normalizeAnswer),[]);
});
