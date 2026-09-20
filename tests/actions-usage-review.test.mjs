import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {reviewedLexicalSense} from '../app/lib/lexical-usage.mjs';
import {DEFERRED_ACTION_PAIRS,USAGE_REVIEW_VERSION} from '../app/lib/form-eligibility.mjs';
import {assessmentTarget,emptyAssessment,reconcileAssessmentCatalog,recordIndependentAttempt} from '../app/lib/learning-assessment.mjs';
import {restoreLearningAssessment} from '../app/lib/assessment-transfer.mjs';
import {UNIFIED_COURSES} from '../app/lib/unified-curriculum.mjs';

const review=JSON.parse(readFileSync(new URL('../docs/usage-card-actions-review.json',import.meta.url),'utf8'));
const pair=e=>`${reviewedLexicalSense(e.item)?.id}/${e.form}`;
const server=await createServer({appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
let model;
try {model=(await server.ssrLoadModule('/app/page.tsx')).KNOWLEDGE;}
finally {await server.close();}
const removed=review.deferred.map(row=>{
  const e=model.registryExercises.find(e=>pair(e)===row.pair);
  assert.ok(e,`Retain morphology: ${row.pair}`);
  return e;
});

test('the nine user-requested deferrals retain their unresolved evidence and prior permission',()=>{
  const expected=new Set([
    'verb:喜ぶ:よろこぶ/teikuNegative',
    'verb:間に合う:まにあう/teiku', 'verb:間に合う:まにあう/teku',
    'verb:間に合う:まにあう/teikuPast', 'verb:間に合う:まにあう/tekuruNegative',
    'verb:来る:くる/teiku', 'verb:来る:くる/teku',
    'verb:来る:くる/teikuNegative', 'verb:来る:くる/teikuNegativePast',
  ]);
  const requested=review.deferred.filter(r=>r.deferralBasis==='user-request');
  assert.deepEqual(new Set(requested.map(r=>r.pair)),expected);
  assert.equal(review.deferred.length-requested.length,22);
  assert.equal(review.reviewVersion,USAGE_REVIEW_VERSION);
  for(const row of requested){
    assert.equal(row.authorization,'9对开放未决也暂缓出题');
    assert.equal(row.previousUsage.reviewVersion,5);
    assert.ok(row.previousUsage.status==='allowed'||row.previousUsage.context);
    assert.equal(row.attempts[0].issue,row.priorReviewReason);
    assert.equal(row.attempts[0].sentence,row.sentence);
  }
});

test('action deferrals retain rejected drafts and affect only the documented sense/form pairs',()=>{
  assert.deepEqual(new Set(removed.map(pair)),DEFERRED_ACTION_PAIRS);
  assert.ok(removed.every(e=>!model.exercises.some(x=>x.id===e.id)));
  for(const row of review.deferred){
    assert.equal(row.sourceCard.review,'draft');
    assert.equal(`${row.sourceCard.senseId}/${row.sourceCard.form}`,row.pair);
    assert.equal(createHash('sha256').update(JSON.stringify(row.sourceCard)).digest('hex'),row.sourceHash);
    assert.ok(new Set(row.attempts.map(x=>x.sentence)).size>=(row.deferralBasis==='user-request'?1:2),row.pair);
    assert.ok(row.attempts.every(x=>x.issue&&x.source));
    assert.ok(row.restoreCondition&&row.reason);
  }
  for(const row of review.unresolved)assert.ok(model.exercises.some(e=>pair(e)===row.pair),row.pair);
  const allowed=['verb:来る:くる/teikuPast','verb:終わる:おわる/teokuNegativePast','verb:間に合う:まにあう/teokuNegative'];
  for(const p of allowed)assert.ok(model.exercises.some(e=>pair(e)===p),p);
  for(const course of UNIFIED_COURSES.filter(c=>c.stageId==='actions'))for(const form of course.forms)
    assert.ok(model.exercises.some(e=>e.courseId===course.id&&e.form===form),`${course.id}/${form}`);
});

test('action-pair retirement preserves failures and suspends only the eight unavailable kuru rule paths',()=>{
  const expectedSuspended=new Set(['teiku','teku','teikuNegative','teikuNegativePast','tekuru','tekuruPast','tekuruNegative','tekuruNegativePast'].map(f=>`verb:来る:くる/${f}`));
  const actualSuspended=new Set();
  for(const e of removed){
    const key=assessmentTarget(e).key;
    const failed=recordIndependentAttempt(emptyAssessment(),{exercise:e,questionId:`actions-deferred:${e.id}`,correct:false,at:'2026-09-20T00:00:00Z'});
    const original=structuredClone(failed);
    const reconciled=reconcileAssessmentCatalog(failed,model.exercises,USAGE_REVIEW_VERSION);
    assert.deepEqual(failed,original,'input is immutable');
    assert.deepEqual(reconciled.byTarget,failed.byTarget);
    assert.deepEqual(reconciled.independentByKc,failed.independentByKc);
    assert.deepEqual(reconciled.assistedByKc,failed.assistedByKc);
    assert.equal(reconciled.originalCount,failed.originalCount);
    const available=model.exercises.filter(x=>assessmentTarget(x).key===key);
    if(available.length){
      assert.deepEqual(reconciled.pending[key],failed.pending[key]);
      assert.equal(reconciled.suspendedPending[key],undefined);
    }else{
      actualSuspended.add(pair(e));
      assert.equal(reconciled.pending[key],undefined);
      assert.deepEqual(reconciled.suspendedPending[key],{...failed.pending[key],suspension:{reason:'no-eligible-exercise',catalogVersion:USAGE_REVIEW_VERSION}});
      const resumed=reconcileAssessmentCatalog(reconciled,[...model.exercises,e],USAGE_REVIEW_VERSION);
      assert.deepEqual(resumed.pending[key],failed.pending[key]);
      assert.deepEqual(resumed.byTarget,failed.byTarget);
    }
    const restored=restoreLearningAssessment({byKc:{},assessment:failed},{components:model.components,exercises:model.exercises});
    assert.deepEqual(restored.assessment.byTarget,failed.byTarget,'import cannot grant independent success');
    assert.deepEqual(restored.assessment.pending,reconciled.pending);
    assert.deepEqual(Object.keys(restored.assessment.suspendedPending),Object.keys(reconciled.suspendedPending));
  }
  assert.deepEqual(actualSuspended,expectedSuspended);
});
