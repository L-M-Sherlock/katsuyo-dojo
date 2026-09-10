import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { createPracticePlanner } from '../app/lib/practice-planning.mjs';
import { componentConfidence, isComponentMastered, updateSkillStats } from '../app/lib/adaptive.mjs';
import { scoreLearningEvidence } from '../app/lib/learning-evidence.mjs';
import { simulateLearning } from '../app/lib/perfect-simulation.mjs';
import { summarizeUnifiedCourse } from '../app/lib/unified-progress.mjs';
import { UNIFIED_COURSES } from '../app/lib/unified-curriculum.mjs';
import { createUnifiedExport, parseUnifiedImport } from '../app/lib/unified-profile.mjs';

const server = await createServer({ appType:'custom', logLevel:'silent', server:{middlewareMode:true} });
let model;
try { model = (await server.ssrLoadModule('/app/page.tsx')).KNOWLEDGE; } finally { await server.close(); }
// Retention is explicit; an old snapshot without a current goal now follows course order.
const fixture = { ...JSON.parse(await readFile(new URL('./fixtures/giving-recovery-profile.json', import.meta.url),'utf8')).profile, practiceGoalCourseId: 'giving' };
const byId = new Map(model.components.map(kc => [kc.id,kc]));
const planner = createPracticePlanner(model);
const course = UNIFIED_COURSES.find(c => c.id === 'giving');
const required = model.courseKcIds.giving.map(id => byId.get(id));
const summary = p => summarizeUnifiedCourse(course,required,p.introducedKcIds,p);

test('the exported 18/25 giving state plans a scorable prerequisite instead of an empty continuation focus', () => {
  assert.equal(summary(fixture).mastered,18);
  assert.equal(Object.keys(fixture.assessment.pending).length,0);
  const blocked = byId.get('apply.tekureru.continuation');
  assert.equal(planner.candidatesFor(blocked,fixture,'giving').length,0);
  for (const mode of ['adaptive','giving']) {
    const planned = planner.plan(mode,fixture);
    assert.equal(planned.goalCourseId,'giving');
    assert.equal(planned.focus.id,mode === 'adaptive' ? 'adj.class.i' : 'onbin.voicing');
    assert.equal(planned.globalRecovery,mode === 'adaptive');
    const assigned = planner.assign(planned,fixture,{seed:1});
    assert.equal(assigned[0].item.id,planned.focus.id);
    assert.equal(assigned.filter(a=>a.item.id===planned.focus.id).length,9);
    for (const {item,candidate} of assigned) {
      const scored = scoreLearningEvidence({byKc:fixture.byKc},{kcIds:candidate.kcIds,form:candidate.form,focusId:item.id,correct:true,support:{independent:true,source:'independent'}});
      assert.ok(scored.assessedKcIds.includes(item.id),`${item.id}/${candidate.id}`);
    }
  }
});

test('classification recovery uses original classification questions even in an accessible specialty', () => {
  const kc=byId.get('class.ichidan');
  const pool=planner.candidatesFor(kc,fixture,'giving');
  assert.ok(pool.length>10);
  assert.ok(pool.every(e=>e.form===null && e.courseId==='classify'));
  const before=fixture.byKc[kc.id].confidence;
  const e=pool[0];
  const scored=scoreLearningEvidence({byKc:fixture.byKc},{kcIds:e.kcIds,form:e.form,focusId:kc.id,correct:true,support:{independent:true,source:'independent'}});
  assert.ok(scored.byKc[kc.id].confidence>before);
});

for (const mode of ['adaptive','giving']) test(`${mode}: the captured giving course completes within two clean rounds without leaving it unfinished`, () => {
  const seen=[];
  const report=simulateLearning(model,{initialProfile:fixture,mode,maxRounds:8,stopWhen:p=>summary(p).complete,
    answerFor:({focus,exercise})=>{seen.push({focus:focus.id,form:exercise.form,course:exercise.courseId});return {correct:true};}});
  assert.equal(report.completed,true,report.reason);
  assert.ok(report.questionCount<=24,`${report.questionCount} questions`);
  assert.ok(report.roundCount<=2);
  assert.deepEqual(Object.keys(report.courseRounds),['giving']);
  assert.equal(summary({...fixture,byKc:report.byKc,introducedKcIds:report.introducedKcIds}).mastered,25);
  assert.equal(seen.filter(e=>e.focus==='class.ichidan').length,2);
  assert.ok(seen.filter(e=>e.focus==='class.ichidan').every(e=>e.form===null));
  for (const f of ['temorauPast','temorauNegativePast','tekureruPast','tekureruNegative','tekureruNegativePast']) assert.ok(seen.some(e=>e.form===f),f);
  assert.equal(fixture.byKc['class.ichidan'].confidence,0.9411764705575587,'input snapshot was not mutated');
});

test('every previously mastered gating atom has a trainable recovery focus after regression', () => {
  const full={attempts:5,correct:5,filteredAccuracy:1,confidence:1,bestConfidence:1,cleanTimeCount:0,cleanTimeTotal:0};
  const p={...fixture,byKc:Object.fromEntries(model.components.map(kc=>[kc.id,{...full}])),introducedKcIds:model.components.filter(k=>k.gating).map(k=>k.id)};
  for (const kc of model.components.filter(k=>k.gating)) {
    const damaged={...p,byKc:{...p.byKc,[kc.id]:updateSkillStats(full,{correct:false})}};
    assert.ok(componentConfidence(kc,damaged.byKc)<1,kc.id);
    const planned=planner.plan('adaptive',damaged,1);
    assert.ok(planned.focus,kc.id);
    assert.equal(isComponentMastered(planned.focus,damaged.byKc),false,kc.id);
    const {item,candidate}=planner.assign(planned,damaged,{seed:7})[0];
    assert.equal(item.id,planned.focus.id,kc.id);
    const scored=scoreLearningEvidence({byKc:damaged.byKc},{kcIds:candidate.kcIds,form:candidate.form,focusId:item.id,correct:true,support:{independent:true,source:'independent'}});
    assert.ok(scored.assessedKcIds.includes(item.id),`${kc.id}/${candidate.id}`);
  }
});

test('completed specialty review stays in the selected course', () => {
  const full={attempts:5,correct:5,filteredAccuracy:1,confidence:1,bestConfidence:1,cleanTimeCount:0,cleanTimeTotal:0};
  const p={...fixture,byKc:Object.fromEntries(model.components.map(kc=>[kc.id,full]))};
  for (let rotation=0;rotation<12;rotation++) {
    const current={...p,rotation};const plan=planner.plan('giving',current);
    assert.equal(plan.review,true);assert.equal(plan.goalCourseId,'giving');
    assert.ok(planner.assign(plan,current).every(a=>a.candidate.courseId==='giving'));
  }
});

test('the current learning course survives export/import without changing mastery or forcing a completed course', () => {
  const p = { ...fixture, practiceGoalCourseId: 'giving' };
  const restored = parseUnifiedImport(createUnifiedExport(p), { today: p.date, components:model.components, exercises:model.exercises, legacyComponents:model.components });
  assert.equal(restored.practiceGoalCourseId, 'giving');
  assert.deepEqual(restored.byKc, p.byKc);
  const full={attempts:5,correct:5,filteredAccuracy:1,confidence:1,bestConfidence:1,cleanTimeCount:0,cleanTimeTotal:0};
  const partlyRecovered={...restored,byKc:{...restored.byKc,...Object.fromEntries(['class.ichidan','onbin.hatsuon','onbin.voicing','construction.tekureru','apply.tekureru.continuation',...byId.get('apply.tekureru.continuation').coverageKcIds].map(id=>[id,full]))}};
  assert.equal(planner.plan('adaptive',partlyRecovered).goalCourseId,'giving');
  assert.equal(planner.plan('adaptive',partlyRecovered).focus.id,'adj.class.i');
  assert.equal(planner.plan('adaptive',partlyRecovered).globalRecovery,true);
  assert.equal(planner.plan('adaptive',{...partlyRecovered,byKc:{...partlyRecovered.byKc,'adj.class.i':full}}).focus.id,'apply.temorau.continuation');
  const complete={...restored,byKc:{...restored.byKc,...Object.fromEntries(model.courseKcIds.giving.map(id=>[id,full]))}};
  assert.notEqual(planner.plan('adaptive',complete,12,complete.practiceGoalCourseId).goalCourseId,'giving');
  assert.throws(() => parseUnifiedImport({...p,practiceGoalCourseId:'missing-course'}, {today:p.date,components:model.components,exercises:model.exercises,legacyComponents:model.components}), /练习课程无效/);
});
