import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {assessFormUsage, eligibleVerbForm, supportsVerbForm, USAGE_REVIEW_VERSION} from '../app/lib/form-eligibility.mjs';
import {conjugate} from '../app/lib/conjugation.mjs';
import {recognizeForms} from '../app/lib/form-recognition.mjs';
import {normalizeAnswer} from '../app/lib/answer-analysis.mjs';
import {assessmentTarget, emptyAssessment, reconcileAssessmentCatalog, recordIndependentAttempt, retestStatus} from '../app/lib/learning-assessment.mjs';
import {restoreLearningAssessment} from '../app/lib/assessment-transfer.mjs';
import {USAGE_CARDS, usageCardStageRequirements} from '../app/lib/usage-cards.mjs';
import {UNIFIED_COURSES} from '../app/lib/unified-curriculum.mjs';
import {reviewedLexicalSense} from '../app/lib/lexical-usage.mjs';
import integrationCards from '../app/lib/usage-cards/integration-generated.mjs';

const baseline=JSON.parse(readFileSync(new URL('./fixtures/intentions-usage-review-before.json',import.meta.url),'utf8'));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const expectedPairs=new Set([
  'verb:間に合う:まにあう/naideKudasai',
  'verb:間に合う:まにあう/prohibitive',
  'verb:間に合う:まにあう/temoIi',
  'verb:間に合う:まにあう/masenka',
  'verb:分かる:わかる/masenka',
]);
const actionReview=JSON.parse(readFileSync(new URL('../docs/usage-card-actions-review.json',import.meta.url),'utf8'));
const actionIds=new Set(actionReview.approvedIds);
const integrationIds=new Set(integrationCards.map(card=>card.id));
const actionContexts=new Map((actionReview.contextChanges??[]).map(row=>[row.pair,row]));
const server=await createServer({appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
let model;
try { model=(await server.ssrLoadModule('/app/page.tsx')).KNOWLEDGE; }
finally { await server.close(); }
const retired=baseline.retired.map(entry=>{
  const exercise=model.registryExercises.find(e=>e.id===entry.id);
  assert.ok(exercise,`${entry.id}: remains in the morphology registry`);
  return {...exercise,context:entry.context};
});
const actionRetired=[...(actionReview.deferred??[])].map(entry=>{
  const exercise=model.registryExercises.find(e=>`${reviewedLexicalSense(e.item)?.id}/${e.form}`===entry.pair);
  assert.ok(exercise,`${entry.pair}: remains in the morphology registry`);
  return {...exercise,context:entry.previousUsage.context};
});

test('approved intention and action-pair deferrals change only the documented exercise catalog entries',()=>{
  assert.equal(USAGE_REVIEW_VERSION,baseline.reviewVersion+4);
  assert.deepEqual(new Set(baseline.retired.map(e=>`${e.senseId}/${e.form}`)),expectedPairs);
  const currentIds=new Set(model.exercises.map(e=>e.id));
  for(const e of [...retired,...actionRetired])assert.ok(!currentIds.has(e.id),e.id);
  const reconstructed=[...model.exercises,...retired,...actionRetired];
  assert.equal(model.exercises.length,baseline.counts.exercises-5-actionRetired.length);
  assert.equal(hash(reconstructed.map(e=>e.id).sort()),baseline.eligibleExerciseIdsSha256,
    'no unrelated exercise may disappear or become eligible');
  // Preserve the frozen historical hash while accounting for the four
  // explicitly documented regional てある context changes.
  assert.deepEqual(new Set(actionContexts.keys()),new Set([
    'verb:持つ:もつ/tearu','verb:持つ:もつ/tearuPast',
    'verb:待つ:まつ/tearu','verb:待つ:まつ/tearuPast',
  ]));
  const matchedContextChanges=new Set();
  const priorContexts=reconstructed.map(e=>{
    const change=actionContexts.get(`${reviewedLexicalSense(e.item)?.id}/${e.form}`);
    if(!change)return e;
    matchedContextChanges.add(change.pair);
    const usage=assessFormUsage(e.item,e.form);
    assert.deepEqual({...usage,reviewVersion:change.currentUsage.reviewVersion,context:{...usage.context,id:usage.context.id.replace(/:v\d+$/,`:v${change.currentUsage.reviewVersion}`)}},change.currentUsage);
    assert.deepEqual({...e.context,id:e.context.id.replace(/:v\d+$/,`:v${change.currentUsage.reviewVersion}`)},change.currentUsage.context);
    return {...e,context:change.previousUsage.context};
  });
  assert.deepEqual(matchedContextChanges,new Set(actionContexts.keys()));
  const contexts=priorContexts.filter(e=>e.context).map(e=>({id:e.id,
    context:{...e.context,id:e.context.id.replace(/:v\d+$/,':vX')},
  })).sort((a,b)=>a.id.localeCompare(b.id,'en'));
  assert.equal(hash(contexts),baseline.contextsSha256,'unrelated applicability notes stay unchanged');
  const historical=USAGE_CARDS.filter(card=>!actionIds.has(card.id)&&!integrationIds.has(card.id));
  assert.equal(historical.length,baseline.counts.cards);
  assert.equal(hash(historical),baseline.cardsSha256,'no published example is edited or dropped');
});

test('deferred forms remain constructible and recognizable with their usage limitation',()=>{
  for(const exercise of retired){
    const {item,form}=exercise;
    assert.equal(supportsVerbForm(item,form),true,exercise.id);
    assert.equal(eligibleVerbForm(item,form),false,exercise.id);
    const usage=assessFormUsage(item,form);
    assert.equal(usage.status,'context-required');
    assert.equal(usage.context,undefined);
    const answer=conjugate(item.surface,item.class,form);
    const match=recognizeForms(item,answer,normalizeAnswer).find(x=>x.form===form);
    assert.ok(match,exercise.id);
    assert.equal(match.usage.status,'context-required');
  }
  const maniau=retired.find(e=>e.item.surface==='間に合う').item;
  const wakaru=retired.find(e=>e.item.surface==='分かる').item;
  for(const form of ['tekudasai','imperative','nasai','nakutemoIi','volitional','tai','past'])
    assert.equal(eligibleVerbForm(maniau,form),true,`間に合う/${form}`);
  for(const form of ['tekudasai','naideKudasai','imperative','nasai','prohibitive','temoIi','nakutemoIi'])
    assert.equal(eligibleVerbForm(wakaru,form),true,`分かる/${form}`);
});

test('all five existing retest obligations transfer to other words without changing prior evidence',()=>{
  for(const exercise of retired){
    const target=assessmentTarget(exercise);
    const alternatives=model.exercises.filter(e=>assessmentTarget(e).key===target.key);
    assert.ok(alternatives.length>1,exercise.id);
    const failed=recordIndependentAttempt(emptyAssessment(),{
      exercise,questionId:`intention-retired:${exercise.id}`,correct:false,at:'2026-09-18T00:00:00Z',
    });
    const snapshot=structuredClone(failed);
    const restored=reconcileAssessmentCatalog(failed,model.exercises,USAGE_REVIEW_VERSION);
    assert.deepEqual(failed,snapshot,'input history is immutable');
    assert.deepEqual(restored,snapshot,'this retirement neither scores nor clears a compatible obligation');
    const profile={byKc:{},assessment:failed};
    const transferred=restoreLearningAssessment(profile,{components:model.components,exercises:model.exercises});
    assert.deepEqual(transferred.assessment,failed,'profile restoration retains the failure');
    let spaced=restored;
    const fillers=model.exercises.filter(e=>e.form==null).slice(0,2);
    for(const [i,filler] of fillers.entries())spaced=recordIndependentAttempt(spaced,{
      exercise:filler,questionId:`intention-spacing:${exercise.id}:${i}`,correct:true,at:'2026-09-18T00:01:00Z',
    });
    assert.equal(retestStatus(spaced.pending[target.key],alternatives[0],{originalCount:spaced.originalCount}).eligible,true);
    const passed=recordIndependentAttempt(spaced,{
      exercise:alternatives[0],questionId:`intention-retest:${exercise.id}`,correct:true,at:'2026-09-18T00:02:00Z',
    });
    assert.equal(passed.pending[target.key],undefined);
    assert.equal(passed.byTarget[target.key].eligibleRetestCorrect,1);
  }
});

test('every eligible intention pair now has an approved example with all course forms still trainable',()=>{
  const pairs=new Set(USAGE_CARDS.map(c=>`${c.senseId}/${c.form}`));
  const requirements=usageCardStageRequirements('intentions');
  assert.equal(requirements.length,3681);
  assert.ok(requirements.every(pair=>pairs.has(pair)));
  assert.equal(model.components.filter(c=>c.gating).length,132);
  assert.equal(model.components.filter(c=>c.id.startsWith('facet.')).length,130);
  for(const course of UNIFIED_COURSES)for(const form of course.forms)
    assert.ok(model.exercises.some(e=>e.courseId===course.id&&e.form===form),`${course.id}/${form}`);
});
