import { createHash } from 'node:crypto';
import { localMutations } from './diagnostic-contracts.mjs';
import { referenceStages, referenceNodeOutputs, oracleFixedPrefix, TEST_ROWS, correctSpellings } from './diagnostic-oracle.mjs';

export const UNIVERSAL_FAMILIES=['accepted','invalid','unreadable','omit','repeat','transpose','voicing','size','row','other-form','stop','lexical','pair','lexical-pair','three-plus','fuzz'];
const norm=s=>s.normalize('NFKC').replace(/[\s。．.！!？?]/g,'');
const unique=values=>[...new Set(values)];
const common=(a,b)=>{let i=0;while(a[i]&&a[i]===b[i])i++;return a.slice(0,i);};
export function stableCaseId(c) {return createHash('sha256').update(JSON.stringify([c.item,c.form,c.step?.nodeId,c.step?.surface,c.family,c.input,c.expected])).digest('hex').slice(0,24);}
export function structuralKey(item,form) {
  return [form,item.domain,item.class,item.iiFamily?'ii':item.class==='godan'?['行く','いく'].includes(item.surface)?'iku':item.reading.at(-1):item.class==='irregular'?item.reading.endsWith('する')?'suru':'kuru':item.class==='na'&&item.reading.endsWith('い')?'na-i':'regular'].join('/');
}
function mutations(value) {
  const out=localMutations(value);
  for(let i=0;i<value.length;i++)for(const row of TEST_ROWS.filter(r=>r.includes(value[i])))for(const kana of unique([...row]))if(kana!==value[i])out.push({family:'row',input:value.slice(0,i)+kana+value.slice(i+1)});
  return [...new Map(out.map(v=>[[v.family,v.input].join('/'),v])).values()];
}
function damageRoot(text) {return text.length? (text[0]==='さ'?'な':'さ')+text.slice(1):text;}
function randomSource(seed) {let x=seed>>>0;return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x;};}

// Whole-answer mutations use independently specified grammatical stages.
// The part of an operation that survives later transformations is mutated;
// pairs combine two distinct surviving regions, never two names for one edit.
export function* wholeErrorCases(exercise,{representative=false,seed=20260908}={}) {
  const {item,form,kcIds}=exercise,base={item,form,kcIds};
  if(!form)return;
  const accepted=unique(['surface','reading'].flatMap(w=>correctSpellings({...item,surface:item[w]},form)));
  const acceptedSet=new Set(accepted.map(norm)),seen=new Set();
  function record(family,input,expected={mode:'guided'}) {
    const key=JSON.stringify([family,input]);if(seen.has(key)||expected.mode!=='correct'&&typeof input==='string'&&acceptedSet.has(norm(input)))return null;
    seen.add(key);const c={...base,family,input,expected};return {...c,id:stableCaseId(c)};
  }
  for(const value of accepted)for(const input of [value,` ${value}。 `,value.normalize('NFD')]){const c=record('accepted',input,{mode:'correct'});if(c)yield c;}
  for(const input of ['', ' 。 ', 'あ'.repeat(257)])yield record('invalid',input,{mode:'invalid'});
  for(const input of ['xyz§','😺','\ud800'])yield record('unreadable',input,{mode:'unreadable'});
  const pools=[];
  for(const writing of ['surface','reading']) {
    const word={...item,surface:item[writing]},stages=referenceStages(word,form),canonical=correctSpellings(word,form)[0];
    const trim=item.domain==='adjective'?(item.class==='na'?0:item.iiFamily?2:1):item.class==='irregular'?2:1;
    const fixed=trim?word.surface.slice(0,-trim):word.surface;
    for(const variant of correctSpellings(word,form))if(variant!==canonical&&variant.startsWith(fixed))for(const mutation of mutations(variant.slice(fixed.length))) {
      const c=record(mutation.family,fixed+mutation.input);if(c)yield c;
    }
    const regions=[];
    for(const stage of stages) {
      const start=common(stage.before,stage.after).length,end=common(stage.after,canonical).length;
      if(end<=start)continue;
      const region={start,end,choices:mutations(canonical.slice(start,end)),ids:stage.ids};
      regions.push(region);
      for(const mutation of region.choices) {const c=record(mutation.family,canonical.slice(0,start)+mutation.input+canonical.slice(end));if(c)yield c;}
    }
    for(const stage of stages.slice(0,-1)){const c=record('stop',stage.after);if(c)yield c;}
    const alternatives=item.domain==='verb'?['negative','past','te','masu','passive','potential','negativePast']:item.class==='na'?['adjectiveNaNegative','adjectiveNaPast','adjectiveNaNegativePast','adjectiveNaTe','adjectiveAdverb']:['adjectiveNegative','adjectivePast','adjectiveNegativePast','adjectiveTe','adjectiveAdverb'];
    for(const alternative of alternatives)if(alternative!==form)for(const input of correctSpellings(word,alternative)){const c=record('other-form',input);if(c)yield c;}
    if(common(word.surface,canonical).length>1) {const c=record('lexical',damageRoot(canonical),{mode:'lexical'});if(c)yield c;}
    pools.push({canonical,regions,lexicalPrefix:fixed});
  }
  if(!representative)return;
  for(const {canonical,regions,lexicalPrefix} of pools) {
    const firstByFamily=region=>[...new Map(region.choices.map(c=>[c.family,c])).values()];
    for(let i=0;i<regions.length;i++)for(let j=i+1;j<regions.length;j++) {
      const a=regions[i],b=regions[j];if(a.end>b.start)continue;
      for(const ma of firstByFamily(a))for(const mb of firstByFamily(b)) {
        const input=canonical.slice(0,a.start)+ma.input+canonical.slice(a.end,b.start)+mb.input+canonical.slice(b.end);
        const c=record('pair',input);if(c)yield {...c,mutations:[ma.family,mb.family]};
      }
    }
    for(const region of regions)for(const m of firstByFamily(region)) {
      if(region.start<2||!lexicalPrefix||!canonical.startsWith(lexicalPrefix))continue;
      const input=damageRoot(canonical.slice(0,region.start))+m.input+canonical.slice(region.end);
      const c=record('lexical-pair',input,{mode:'mixed'});if(c)yield c;
    }
    if(regions.length>=3) {
      let input=canonical;
      const nonoverlap=regions.filter((r,i)=>!i||r.start>=regions[i-1].end);
      for(const region of nonoverlap.slice(0,3).reverse())input=input.slice(0,region.start)+(region.choices.find(c=>c.family==='repeat')?.input??'ず')+input.slice(region.end);
      const c=record('three-plus',input);if(c)yield c;
    }
    const random=randomSource(seed+canonical.length),alphabet=[...'あいうえおたないらっん', '§','😺','\ud800','\u0301'];
    for(let i=0;i<24;i++) {
      let input=canonical;
      for(let k=0;k<3+random()%4;k++){const at=random()%(input.length+1);input=input.slice(0,at)+alphabet[random()%alphabet.length]+input.slice(at+Number(random()%2));}
      const c=record('fuzz',input);if(c)yield c;
    }
  }
}

export function leafExpectation(step,input) {
  if(!norm(input)||Array.from(input).length>256)return {mode:'invalid'};
  if([...step.answers,...step.readings].some(a=>norm(a)===norm(input)))return {mode:'correct'};
  // Test contract: a single isolated operation is wrong only when all its
  // invariant material survives. Empty/changed roots do not justify a KC.
  const possible=[];
  for(const w of ['surface','reading']) {
    const fixed=norm(oracleFixedPrefix(step.atomic,w)),actual=norm(input);
    if(!fixed||!actual.startsWith(fixed)||!/^[\p{Script=Hiragana}\p{Script=Katakana}ー]{0,16}$/u.test(actual.slice(fixed.length)))continue;
    if(referenceNodeOutputs(step.atomic,w).some(a=>norm(a)===actual))continue;
    const id=step.atomic.ruleKcIds[0],tail=actual.slice(fixed.length);
    if(step.kcIds.includes('stem.godan.u-wa')&&tail==='あ')possible.push('stem.godan.u-wa');
    else if(step.kcIds.includes('onbin.voicing')&&['た','て'].includes(tail))possible.push('onbin.voicing');
    else if(step.kcIds.includes(id))possible.push(id);
  }
  return unique(possible).length===1?{mode:'leaf',failed:possible[0]}:{mode:'no-evidence'};
}
export function* atomicErrorCases(exercise,step) {
  const seen=new Set(),base={item:exercise.item,form:exercise.form,kcIds:step.kcIds,step};
  const emit=function*(family,input) {
    if(seen.has(input))return;seen.add(input);
    const c={...base,family,input,expected:leafExpectation(step,input)};yield {...c,id:stableCaseId(c)};
  };
  for(const w of ['surface','reading']) {
    const fixed=oracleFixedPrefix(step.atomic,w);
    for(const value of referenceNodeOutputs(step.atomic,w).filter(a=>step[w==='surface'?'answers':'readings'].includes(a))) {
      yield* emit('accepted',value);
      for(const mutation of mutations(value.slice(fixed.length)))yield* emit(mutation.family,fixed+mutation.input);
      yield* emit('lexical',damageRoot(value));
    }
    yield* emit('stop',step[w]);
  }
  for(const input of ['',' 。 ','あ'.repeat(257)])yield* emit('invalid',input);
  for(const input of ['xyz§','😺','\ud800'])yield* emit('unreadable',input);
}

// Shrinking retains the independent contract's precondition and the same
// failure code. A smaller accepted answer cannot become an alleged failure.
export function shrinkCounterexample(testCase,fails,maxChecks=80) {
  if(typeof testCase.input!=='string'||['correct','invalid'].includes(testCase.expected.mode))return testCase;
  const accepted=new Set((testCase.step?[...testCase.step.answers,...testCase.step.readings]
    :['surface','reading'].flatMap(w=>correctSpellings({...testCase.item,surface:testCase.item[w]},testCase.form))).map(norm));
  let best=testCase,checks=0;
  for(let size=Math.floor(best.input.length/2);size>0;size=Math.floor(size/2)) {
    for(let at=0;at+size<=best.input.length&&checks<maxChecks;at++) {
      const input=best.input.slice(0,at)+best.input.slice(at+size);if(!norm(input)||accepted.has(norm(input)))continue;
      const expected=testCase.step?.kind==='atomic'?leafExpectation(testCase.step,input):{mode:'guided'};
      if(expected.mode==='correct'||expected.mode==='invalid')continue;
      const candidate={...testCase,input,expected};checks++;
      if(fails(candidate)) {best=candidate;at=-1;}
    }
  }
  return {...best,id:stableCaseId(best),originalId:testCase.id,shrinkChecks:checks};
}
