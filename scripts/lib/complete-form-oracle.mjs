import { TRANSITIVE_VERBS } from '../../app/lib/form-eligibility.mjs';
// Independent test policy: a complete other form is an alternative explanation
// for a whole-answer class/stem/sound error. Do not import the recognizer.
import { UNIFIED_COURSES } from '../../app/lib/unified-curriculum.mjs';
import { CHAIN_FORM_SPECS } from '../../app/lib/multi-step-forms.mjs';
import { correctSpellings, referenceStages } from './diagnostic-oracle.mjs';
const normalize=s=>s.normalize('NFKC').replace(/[ァ-ヶヽヾ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).replace(/[\s。．.！!？?]/g,'');
const cache=new Map();
export function hasCompleteAlternative(item,form,input) {
  const key=JSON.stringify(item);let record=cache.get(key);
  if(!record){
    const values=new Map();
    for(const f of new Set(UNIFIED_COURSES.filter(c=>c.domain===item.domain).flatMap(c=>c.forms))){
      if(item.domain==='adjective'&&!['adjectiveBa','adjectiveAdverb'].includes(f)){
        const na=/^adjectiveNa/.test(f)||['adjectiveAttributive','adjectivePredicative'].includes(f);
        if(na!==(item.class==='na'))continue;
      }
      if(/^tearu(?:Past|Negative|NegativePast)?$/.test(f)&&!TRANSITIVE_VERBS.has(item.lexicalSurface??item.surface))continue;
      if(f==='causativePassiveContracted'&&(item.class!=='godan'||item.surface.endsWith('す')))continue;
      if(CHAIN_FORM_SPECS[f]&&!CHAIN_FORM_SPECS[f].words.includes(item.lexicalSurface??item.surface))continue;
      for(const surface of new Set([item.surface,item.reading??item.surface]))for(const value of correctSpellings({...item,surface},f)){
        const text=normalize(value);if(!values.has(text))values.set(text,new Set());values.get(text).add(f);
      }
    }
    record={values,stops:new Map()};cache.set(key,record);if(cache.size>128)cache.delete(cache.keys().next().value);
  }
  const actual=normalize(input),matches=record.values.get(actual);
  if(!matches||matches.has(form))return false;
  if(!record.stops.has(form))record.stops.set(form,new Set([item.surface,item.reading,...[item.surface,item.reading??item.surface].flatMap(surface=>referenceStages({...item,surface},form).slice(0,-1).map(stage=>stage.after))].filter(Boolean).map(normalize)));
  return !record.stops.get(form).has(actual);
}
export function completeFormExpectation(item,form,input,expected,step=null){
  if(!step&&/^(class\.|heuristic\.|stem\.|onbin\.|exception\.)/.test(expected.failed??'')&&hasCompleteAlternative(item,form,input))return {kind:'incorrect',failed:null,confirmed:[],minSteps:1};
  return expected;
}
