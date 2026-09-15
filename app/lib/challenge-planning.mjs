import { assignPracticeExercises } from './exercise-selection.mjs';
import { isSourceClassification } from './learning-evidence.mjs';

export const CHALLENGE_PREFERENCE_KEY = 'katsuyo-practice-challenge-v1';
export const HIGHEST_CHALLENGE_COURSE = 'multiStepCompound';

/** Free access changes selection only. The input catalog has already applied
 * lexical/usage restrictions; no prerequisite or mastery records are forged.
 */
export function createChallengePlanner(model) {
  const byId=new Map(model.components.map(kc=>[kc.id,kc])),pools=new Map();
  for(const exercise of model.exercises) {
    if(!pools.has(exercise.courseId))pools.set(exercise.courseId,[]);
    pools.get(exercise.courseId).push(exercise);
  }
  function questions(courseId,profile,{length=12,seed=0}={}) {
    const pool=pools.get(courseId)??[];
    const groups=new Map(),forms=new Map();
    for(const e of pool) {
      const form=e.form??'classification',key=JSON.stringify([form,e.item.class]);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(e);
      if(!forms.has(form))forms.set(form,new Map());
      forms.get(form).set(e.item.class,{id:key,form});
    }
    const formGroups=[...forms.values()].map(classes=>[...classes].sort(([a],[b])=>a.localeCompare(b)).map(([,target])=>target));
    const targets=formGroups.flat();
    if(!targets.length)return [];
    const rotation=profile.rotation??0;
    const slots=Array.from({length},(_,i)=>{
      const classes=formGroups[(rotation+i)%formGroups.length];
      return classes[Math.floor((rotation+i)/formGroups.length)%classes.length];
    });
    const assigned=assignPracticeExercises(slots,{
      alternativesFor:target=>[...targets.filter(other=>other.form===target.form),...targets.filter(other=>other.form!==target.form)],candidatesFor:target=>groups.get(target.id),
      byKc:profile.byKc,seed:seed+rotation,recentWordKeys:profile.recentWordKeys,
      // Do not repeat an exact question to fill an exhausted small pool, and
      // do not stop just because this learner has mastered the chosen course.
      isUseful:()=>true,
    });
    return assigned.map(({candidate})=>({candidate,item:[...candidate.kcIds].reverse()
      .map(id=>byId.get(id)).find(kc=>kc?.gating&&(candidate.form==null||!isSourceClassification(kc.id)))
      ??byId.get(candidate.kcIds[0])}));
  }
  const hasCourse=id=>(pools.get(id)?.length??0)>0;
  return {questions,hasCourse};
}
