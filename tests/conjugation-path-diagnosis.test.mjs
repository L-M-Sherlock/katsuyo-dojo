import assert from 'node:assert/strict';
import test from 'node:test';
import {createAnswerAnalyzer,normalizeAnswer} from '../app/lib/answer-analysis.mjs';
import {deriveUnified,unifiedDiagnosticSteps} from '../app/lib/unified-knowledge.mjs';
import {DIAGNOSTIC_FORMS} from '../app/lib/diagnostic-plan.mjs';
import {generateConjugationPathCases} from '../scripts/lib/conjugation-path-cases.mjs';
import {planDiagnosticTransition} from '../app/lib/diagnostic-session.mjs';
import {emptyAssessment} from '../app/lib/learning-assessment.mjs';
import {applyLearningObservation,assessmentCatalog} from '../app/lib/learning-profile.mjs';

const iru={domain:'verb',class:'ichidan',surface:'いる',reading:'いる'};
const close={domain:'verb',class:'ichidan',surface:'閉める',reading:'しめる'};
const take={domain:'verb',class:'godan',surface:'取る',reading:'とる'};
const write={domain:'verb',class:'godan',surface:'書く',reading:'かく'};
const analyze=(item,form,input,step)=>createAnswerAnalyzer(item,form,step?{step}:{})(input);

function assertClassRoute(r,cls,form) {
  assert.equal(r.kind,'incorrect');assert.equal(r.diagnosis?.kcId??null,null);
  assert.deepEqual(r.diagnosis?.confirmedKcIds??[],[]);
  assert.equal(r.feedback.resolution,'stage-priority');
  assert.equal(r.steps.length,2);
  const [category,given]=r.steps;
  assert.equal(category.kind,'classification');assert.equal(category.diagnosticOnly,true);
  assert.equal(category.expectedClass,cls);assert.deepEqual(category.kcIds,[]);
  assert.equal(given.kind,'conjugation');assert.equal(given.providedClass,cls);assert.equal(given.form,form);
  assert.ok(given.kcIds.length);assert.ok(given.kcIds.every(id=>!/^(class|heuristic|facet|apply|composition)\./.test(id)));
}

test('the reported mixed past errors retain classification as a hypothesis across past appendages',()=>{
  for(const [form,input] of [['past','いっだ'],['tara','いっだら'],['tari','いっだり'],['tatte','いっだって']]) {
    const r=analyze(iru,form,input);assertClassRoute(r,'ichidan','past');
    assert.match(r.feedback.message,/いっだ/);assert.doesNotMatch(r.feedback.message,/一段|五段|いたら/);
    assert.equal(analyze(iru,'past','godan',r.steps[0]).kind,'incorrect');
    assert.equal(analyze(iru,'past','ichidan',r.steps[0]).kind,'correct');
    assert.equal(analyze(iru,'past','いた',r.steps[1]).kind,'correct');
    const again=analyze(iru,'past','いっだ',r.steps[1]);
    assert.ok(again.steps.length);assert.ok(again.steps.every(step=>step.kind==='atomic'));
    assert.ok(again.steps.every(step=>analyze(iru,step.form,'xyz',step).steps.length===0));
  }
  assertClassRoute(analyze(iru,'tara','いったら'),'ichidan','past');
  assert.equal(analyze(iru,'tara','いだら').diagnosis.kcId,'suffix.past');
});

test('finite class plus local-error witnesses cover other native conjugations',()=>{
  for(const [form,input] of [
    ['negative','しめらな'],['masu','しめりまず'],['te','しめっで'],
    ['volitional','しめろうう'],['causative','しめらせ'],['causativePassive','しめらせられ'],
    ['tai','しめりだい'],['nagara','しめりなから'],['tsutsu','しめりつづ'],
    ['sugiru','しめりすきる'],['tagaru','しめりたかる'],['zu','しめらす'],['zuni','しめらすに'],
  ]) assertClassRoute(analyze(close,form,input),'ichidan',form);
  assert.equal(analyze(close,'ba','しめれは').diagnosis.kcId,'suffix.ba','both classes have the same れば form; asking class would add no information');
  for(const [form,input] of [['past','とだ'],['te','とで'],['negative','とな'],['masu','とまず'],['tai','とだい'],['volitional','とようう']]) {
    assertClassRoute(analyze(take,form,input),'godan',form);
  }
});

test('an independent generator exercises native past and te errors throughout the course recipes',t=>{
  const forms=DIAGNOSTIC_FORMS.filter(form=>!form.startsWith('adjective'));
  const cases=[iru,close,take,write].flatMap(item=>generateConjugationPathCases(item,forms));
  assert.ok(cases.length>150);
  const covered=new Set();
  for(const c of cases) {
    const r=analyze(c.item,c.form,c.input);
    assertClassRoute(r,c.expectedClass,c.native);
    assert.ok(r.steps[0].surface===c.source||r.steps[0].reading===c.source,`${c.form}: ${c.input}`);
    for(const step of r.steps)assert.equal(analyze(c.item,step.form,step.readings[0],step).kind,'correct');
    covered.add(c.form);
  }
  for(const form of ['tara','tari','tatte','teageruPast','teiruPast','tearuPast','temiruPast','passiveProgressivePast'])assert.ok(covered.has(form),form);
  t.diagnostic(`${cases.length} independent wrong inputs across ${covered.size} forms; correct classification and supplied-conjugation controls passed.`);
});

test('known complete expressions, lexical damage and supplied classes preserve their guards',()=>{
  for(const [item,form,input] of [[close,'teiruPast','しめていった'],[close,'past','しめました'],[iru,'tara','いたら']]) {
    const r=analyze(item,form,input);assert.notEqual(r.steps[0]?.probeSelection?.strategy,'conjugation-path');
  }
  for(const input of ['あっだら','いっだ§ら','いっだららら','xyz']) {
    assert.notEqual(analyze(iru,'tara',input).steps[0]?.probeSelection?.strategy,'conjugation-path');
  }
  const supplied=unifiedDiagnosticSteps(close,'tagaruPast').at(-1);
  const r=analyze(close,'tagaruPast','しめたがたた',supplied);assertClassRoute(r,'godan','past');
  const provided=r.steps[1];
  assert.equal(analyze(close,'past','しめたがた',provided).diagnosis.kcId,'onbin.sokuon');
  for(const input of ['しめたがたた','しめたがだ','しめたがるた']) {
    assert.ok(analyze(close,'past',input,provided).steps.every(s=>s.kind!=='classification'));
  }
  // No convenient class hypothesis for non-る endings can override the older
  // competition guard that intentionally leaves these local causes undecided.
  const buy={domain:'verb',class:'godan',surface:'買う',reading:'かう'};
  assert.equal(analyze(buy,'past','かた').diagnosis?.kcId??null,null);
  assertClassRoute(analyze(iru,'tara',' ｲｯﾀﾞﾗ。'),'ichidan','past');
  assert.equal(analyze(iru,'tara','いっだら').feedback.message,analyze(iru,'tara',normalizeAnswer('ｲｯﾀﾞﾗ')).feedback.message);
});

test('classification and successful guided conjugation leave independent scores and pending retests unchanged',()=>{
  const exercise={id:'tara:いる',courseId:'tara',form:'tara',item:iru,kcIds:deriveUnified(iru,'tara').requiredKcIds};
  const catalog=assessmentCatalog([exercise]);
  let profile={byKc:{},assessment:emptyAssessment()};
  profile=applyLearningObservation(profile,exercise,{type:'question',outcome:'incorrect',questionId:'q',eventId:'q',at:'2026-01-01T00:00:00Z'},catalog).profile;
  const before=structuredClone(profile),original=analyze(iru,'tara','いっだら');
  let steps=original.steps,evaluated=[],examined=[];
  for(const [index,input] of ['godan','いた'].entries()) {
    const step=steps[index],r=analyze(iru,step.form,input,step);
    const transition=planDiagnosticTransition(steps,index,r,evaluated,examined);
    profile=applyLearningObservation(profile,exercise,{type:'step',outcome:r.kind,questionId:'q',eventId:`s-${index}`,at:'2026-01-01T00:00:00Z',step:transition.assessed,
      failedKcId:r.diagnosis?.kcId,confirmedKcIds:r.diagnosis?.confirmedKcIds??[]},catalog).profile;
    steps=transition.nextSteps;evaluated=transition.evaluated;examined=transition.examined;
  }
  assert.equal(steps.length,2);assert.equal(profile.assessment.originalCount,1);
  assert.deepEqual(profile.byKc,before.byKc);
  assert.deepEqual(Object.keys(profile.assessment.pending),Object.keys(before.assessment.pending));
  assert.deepEqual(Object.keys(profile.assessment.assistedByKc).sort(),['stem.ichidan.drop-ru','suffix.past']);
  assert.equal(profile.assessment.assistedByKc['construction.tara'],undefined);
});

test('the main error generator enforces the path route and rejects missing probes or invented penalties',async()=>{
  const {generateErrorCases}=await import('../scripts/lib/error-patterns.mjs');
  const {evaluateGeneratedCase}=await import('../scripts/lib/diagnosis-audit.mjs');
  const c=generateErrorCases({item:iru,form:'tara'}).cases.find(c=>c.pattern==='conjugation-path'&&c.input==='いっだら');
  assert.ok(c);
  const r=analyze(iru,'tara',c.input);
  assert.equal(evaluateGeneratedCase(c,r).status,'pass');
  assert.equal(evaluateGeneratedCase(c,{...r,steps:r.steps.slice(1)}).status,'regression');
  assert.equal(evaluateGeneratedCase(c,{...r,diagnosis:{kcId:'class.ichidan',confirmedKcIds:[]}}).status,'regression');
  assert.equal(evaluateGeneratedCase(c,{...r,steps:r.steps.map((s,i)=>i?{...s,kcIds:['construction.tara']}:s)}).status,'regression');
});

test('class and suffix errors also carry through negative, polite and volitional followups',()=>{
  for(const[form,input,native]of[
    ['negativePast','しめらななかった','negative'],['nakute','しめらななくて','negative'],
    ['naide','しめらなないで','negative'],['naideKudasai','しめらなないでください','negative'],
    ['nakutemoIi','しめらななくてもいい','negative'],['nakerebaNaranai','しめらななければならない','negative'],
    ['nakutewaIkenai','しめらななくてはいけない','negative'],['naitoIkenai','しめらなないといけない','negative'],
    ['masuPast','しめりまました','masu'],['masuNegativePast','しめりまませんでした','masu'],
    ['youtosuruNegativePast','しめろううとしなかった','volitional'],
  ])assertClassRoute(analyze(close,form,input),'ichidan',native);
});
