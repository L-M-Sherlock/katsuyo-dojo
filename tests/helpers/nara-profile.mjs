import { emptySkillStats, updateSkillStats } from '../../app/lib/adaptive.mjs';
import { emptyPracticeLog, appendPracticeEvent } from '../../app/lib/practice-log.mjs';
import { parseUnifiedImport } from '../../app/lib/unified-profile.mjs';

// Frozen numeric baseline from the reported 冷たい event, with a minimal,
// deterministic history instead of a dependency on the user's download file.
export const naraBaseline = { attempts:42,correct:40,filteredAccuracy:0.9474900703615854,confidence:1,bestConfidence:1,
  cleanTimeTotal:6210.883333333333,cleanTimeCount:11 };
export function legacyNaraProfile(model) {
  let p={version:6,curriculumVersion:3,date:'2026-09-09',attempted:0,correct:0,streak:0,rotation:0,
    byKc:{'adj.class.i':{...naraBaseline}},introducedKcIds:['adj.class.i'],accessibleCourseIds:['adjectiveClassify','adjectiveIBase'],
    coursePractice:{},recentWordKeys:[],practiceLog:emptyPracticeLog(),legacy:null,migration:null};
  for (const [index,surface] of ['冷たい','黒い','甘い'].entries()) {
    const e=model.exercises.find(e=>e.form==='adjectiveBa'&&e.item.surface===surface);
    const right=index!==0, before=p;
    p={...p,attempted:p.attempted+1,correct:p.correct+Number(right),streak:right?p.streak+1:0,
      byKc:{...p.byKc,'adj.class.i':updateSkillStats(p.byKc['adj.class.i'],{correct:right})}};
    p=appendPracticeEvent(before,p,{id:`legacy-nara-${index}`,questionId:`legacy-nara-q-${index}`,at:`2026-09-09T02:57:${50+index}.000Z`,
      type:'question',outcome:right?'correct':'incorrect',answer:right?`${e.item.reading.slice(0,-1)}ければ`:'つめたいなら',
      exercise:{id:e.id,courseId:e.courseId,form:e.form,surface:e.item.surface,reading:e.item.reading,wordClass:e.item.class,domain:e.item.domain},
      target:{surface:e.item.surface,reading:e.item.reading,form:e.form,label:'条件形',kind:'question',kcIds:['adj.class.i'],answers:['つめたければ'],readings:['つめたければ'],stepIndex:null,totalSteps:0,nextTotalSteps:0},
      diagnosis:{kcId:right?null:'adj.class.i',confirmedKcIds:[],resolution:'rule',message:'旧版分类归因'},hintUsed:false});
  }
  return p;
}
export function oldVersionedNaraProfile(model) {
  const old=legacyNaraProfile(model);
  const p=parseUnifiedImport(old,{today:old.date,components:model.components,legacyComponents:model.components,exercises:model.exercises,at:'2026-09-09T06:00:00.000Z'});
  // Reproduce the v7 bug explicitly: retain the old negative classification
  // evidence although incidental classification positives were removed.
  const bad=updateSkillStats(naraBaseline,{correct:false});
  p.byKc['adj.class.i']=bad;
  p.assessment.independentByKc['adj.class.i']=updateSkillStats(emptySkillStats(),{correct:false});
  p.assessment.migration.events.find(e=>e.id==='legacy-nara-0').assessedKcIds=['adj.class.i'];
  p.assessment.migration.changes.find(c=>c.kcId==='adj.class.i').after=structuredClone(bad);
  p.practiceLog.events.at(-1).changes.find(c=>c.kcId==='adj.class.i').after=structuredClone(bad);
  for(const entry of Object.values(p.assessment.pending))entry.failedKcIds=['adj.class.i'];
  return p;
}
