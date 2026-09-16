import { assessmentTarget, selectRetest } from './learning-assessment.mjs';
import { isChallengeRetest } from './retest-queue.mjs';
import { CHAIN_FORM_SPECS } from './multi-step-forms.mjs';
import { assignPracticeExercises, exerciseKey, wordKey } from './exercise-selection.mjs';
import { isSourceClassification } from './learning-evidence.mjs';

export const CHALLENGE_PREFERENCE_KEY = 'katsuyo-practice-challenge-v2';
export const LEGACY_CHALLENGE_PREFERENCE_KEY = 'katsuyo-practice-challenge-v1';
export const HIGHEST_CHALLENGE_COURSE = 'multiStepCompound';

// Accept the previous single-course preference as well as a JSON selection.
// Canonical curriculum order keeps selection order from affecting scheduling.
export function normalizeChallengeCourses(value, allowedIds) {
  if(typeof value==='string') {
    if(value.length>8192)return [];
    if(value.startsWith('[')) {try{value=JSON.parse(value);}catch{return [];}}
    else value=[value];
  }
  if(!Array.isArray(value))return [];
  const selected=new Set(value.filter(id=>typeof id==='string'));
  return allowedIds.filter(id=>selected.has(id));
}

/** Free access changes selection only; the catalog retains usage restrictions. */
export function createChallengePlanner(model) {
  const byId=new Map(model.components.map(kc=>[kc.id,kc])),pools=new Map();
  for(const exercise of model.exercises) {
    if(!pools.has(exercise.courseId))pools.set(exercise.courseId,[]);
    pools.get(exercise.courseId).push(exercise);
  }
  const courseIds=[...pools.keys()];
  function questions(selection,profile,{length=12,seed=0}={}) {
    const selected=normalizeChallengeCourses(selection,courseIds);
    const groups=new Map(),courses=selected.map(courseId=>{
      const forms=new Map();
      for(const e of pools.get(courseId)) {
        const form=e.form??'classification',key=JSON.stringify([courseId,form,e.item.class]);
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(e);
        if(!forms.has(form))forms.set(form,new Map());
        forms.get(form).set(e.item.class,{id:key,form,courseId});
      }
      // Interleave application families before their tense/polarity variants,
      // so a large final course does not spend its first round on three families.
      const families=new Map();
      for(const [form,classes] of forms){
        const family=CHAIN_FORM_SPECS[form]?.kcId??form;
        if(!families.has(family))families.set(family,[]);
        families.get(family).push([...classes].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,target])=>target));
      }
      const orderedForms=[];
      for(let variant=0;orderedForms.length<forms.size;variant++){
        for(const family of families.values())if(family[variant])orderedForms.push(family[variant]);
      }
      return {id:courseId,forms:orderedForms};
    });
    if(!courses.length)return [];
    const rotation=profile.rotation??0,offset=(rotation*length)%courses.length;
    const ordered=[...courses.slice(offset),...courses.slice(0,offset)];
    const counts=new Map(),usedKeys=[],usedWords=[],used=new Set(),assigned=[],usedRetestKeys=[];
    const challengeEntries=Object.entries(profile.assessment?.pending??{}).filter(([,entry])=>isChallengeRetest(entry)&&selected.includes(entry.courseId));
    const challengeAssessment=challengeEntries.length ? {...profile.assessment,pending:Object.fromEntries(challengeEntries)} : null;
    for(let index=0;index<length;index++) {
      // Equal course opportunities first, then forms and word classes. Tiny
      // exhausted pools yield their slots to the remaining selected courses.
      const available=ordered.filter(c=>pools.get(c.id).some(e=>!used.has(exerciseKey(e))))
        .sort((a,b)=>(counts.get(a.id)??0)-(counts.get(b.id)??0));
      const course=available[0];if(!course)break;
      const previous=courses.length===1?rotation*length:Math.floor((rotation*length+ordered.indexOf(course))/courses.length);
      const turn=previous+(counts.get(course.id)??0),form=course.forms[turn%course.forms.length];
      const target=form[Math.floor(turn/course.forms.length)%form.length];
      const alternatives=[...form,...course.forms.flat()].filter(other=>other.id!==target.id);
      const retest=challengeAssessment && challengeEntries.some(([key,entry])=>entry.courseId===course.id&&!usedRetestKeys.includes(key)) ? selectRetest(challengeAssessment,pools.get(course.id).filter(e=>!used.has(exerciseKey(e))),{
        catalogExercises:model.exercises,excludeTargetKeys:usedRetestKeys,
        excludeWordKeys:assigned.map(({candidate})=>assessmentTarget(candidate).wordKey),
      }) : null;
      const [result]=retest ? [{candidate:retest.exercise}] : assignPracticeExercises([target],{
        alternativesFor:()=>alternatives,candidatesFor:t=>groups.get(t.id),byKc:profile.byKc,
        seed:seed+rotation+index,recentWordKeys:profile.recentWordKeys,usedKeys,usedWordKeys:usedWords,
        isUseful:()=>true,
      });
      if(!result?.candidate)break;
      const candidate=result.candidate,key=exerciseKey(candidate);
      used.add(key);usedKeys.push(key);usedWords.push(wordKey(candidate));
      counts.set(course.id,(counts.get(course.id)??0)+1);
      if(retest)usedRetestKeys.push(retest.pending.key);
      assigned.push({candidate,...(retest?{challengeRetest:true}:{}),item:[...candidate.kcIds].reverse().map(id=>byId.get(id))
        .find(kc=>kc?.gating&&(candidate.form==null||!isSourceClassification(kc.id)))??byId.get(candidate.kcIds[0])});
    }
    return assigned;
  }
  const hasCourse=id=>(pools.get(id)?.length??0)>0;
  return {questions,hasCourse};
}
