import { UNIFIED_COURSES } from './unified-curriculum.mjs';
import { acceptedConjugations } from './conjugation.mjs';
import { acceptedAdjectiveConjugations, adjectiveTargetLabel } from './adjective-conjugation.mjs';
import { FORM_LABELS } from './form-labels.mjs';
import { supportsVerbForm, assessFormUsage } from './form-eligibility.mjs';

const byDomain = Object.fromEntries(['verb','adjective'].map(domain=>[domain,
  [...new Set(UNIFIED_COURSES.filter(course=>course.domain===domain).flatMap(course=>course.forms))]]));
const naForms = new Set(['adjectiveAttributive','adjectivePredicative','adjectiveNaNegative','adjectiveNaPast','adjectiveNaNegativePast','adjectiveNaTe']);
const bothAdjectives = new Set(['adjectiveAdverb','adjectiveBa']);
const indexes = new WeakMap();
export function recognizableForms(item) {
  return (byDomain[item.domain]??[]).filter(form => {
    if(item.domain==='adjective')return bothAdjectives.has(form)||(item.class==='na'?naForms.has(form):!naForms.has(form));
    return supportsVerbForm({...item,surface:item.lexicalSurface??item.surface},form);
  });
}
export function recognizedFormLabel(item, form) {
  return item.domain==='adjective' ? adjectiveTargetLabel(item,form) : FORM_LABELS[form];
}

// Recognition describes the submitted structure; it does not establish that
// the expression fits the lemma's reviewed sense or an unspecified situation.
// Share this copy with the page so the qualification survives guided practice.
export function recognizedFormsIdentification(item, matches, target) {
  if(!matches?.length)return '';
  const labels=[...new Set(matches.map(match=>match.label??recognizedFormLabel(item,match.form)))].join('／');
  const qualified=matches.some(match=>match.usage&&match.usage.status!=='allowed');
  const identification=qualified
    ? `从构形上看，你的答案对应${labels}，本题要求${target}。`
    : `你的答案与${labels}一致，本题要求${target}。`;
  const notes=[];
  for(const match of matches) {
    const usage=match.usage;
    if(!usage||usage.status==='allowed')continue;
    const reason=usage.reason?.replace(/[。；;]+$/u,'');
    const qualification=usage.reasonCode==='unreviewed-lexeme'?'实际用法尚未确认'
      :usage.status==='context-required'?'实际使用需要合适的语境':'不适合这里给定的词义';
    const note=`${match.label}${qualification}${reason?`：${reason}`:''}。`;
    if(!notes.includes(note))notes.push(note);
  }
  return identification+notes.join('');
}

function recognizedUsage(item, form) {
  const usage=assessFormUsage(item,form);
  if(usage.reasonCode!=='unreviewed-lexeme'||(!item.tailClass&&item.usageOrigin!=='derived'))return usage;
  return {
    status:'context-required',category:'context',reviewVersion:usage.reviewVersion,
    reasonCode:'derived-expression',
    reason:'这是给定中间形式的后续变化，实际用法需要结合整题语境判断。',
  };
}
function verbVariants(item, word, form) {
  const kind=item.tailClass;
  const endings={aru:['ある'],iku:['いく','行く'],kuru:['くる','来る'],irregular:['する']};
  const ending=endings[kind]?.find(ending=>word.endsWith(ending));
  if(ending){
    const prefix=word.slice(0,-ending.length);
    if(kind==='aru'&&['negative','negativePast'].includes(form))return [prefix+(form==='negative'?'ない':'なかった')];
    return acceptedConjugations(ending,item.class,form).map(value=>prefix+value);
  }
  return acceptedConjugations(word,item.class,form);
}
// Exact full-form matching only. No suffix heuristics or edit distance. All
// matching forms are retained because potential/passive and contractions can
// coincide. Limit retained word indexes during long practice sessions.
export function recognizeForms(item, answer, normalize) {
  let cache=indexes.get(normalize);
  if(!cache){cache=new Map();indexes.set(normalize,cache);}
  const key=JSON.stringify([item.domain,item.class,item.surface,item.reading,item.iiFamily,item.tailClass,item.lexicalSurface]);
  let index=cache.get(key);
  if(!index){
    index=new Map();
    for(const form of recognizableForms(item))for(const word of [...new Set([item.surface,item.reading??item.surface])]) {
      const variants=item.domain==='adjective'
        ? acceptedAdjectiveConjugations({...item,surface:word},form)
        : verbVariants(item,word,form);
      for(const variant of variants){
        const text=normalize(variant);
        if(!index.has(text))index.set(text,new Set());
        index.get(text).add(form);
      }
    }
    cache.set(key,index);
    if(cache.size>128)cache.delete(cache.keys().next().value);
  }
  return [...(index.get(normalize(answer))??[])].map(form=>({
    form,label:recognizedFormLabel(item,form),usage:recognizedUsage(item,form),
  }));
}
