import { acceptedConjugations, conjugate } from './conjugation.mjs';

const ROWS = {
  う:['わ','い','う','え','お'], く:['か','き','く','け','こ'], ぐ:['が','ぎ','ぐ','げ','ご'],
  す:['さ','し','す','せ','そ'], つ:['た','ち','つ','て','と'], ぬ:['な','に','ぬ','ね','の'],
  ぶ:['ば','び','ぶ','べ','ぼ'], む:['ま','み','む','め','も'], る:['ら','り','る','れ','ろ'],
};
const ROW_INDEX = { a:0, i:1, u:2, e:3, o:4 };
const ROW_FORMS = {
  negative:'a', passive:'a', causative:'a', causativePassive:'a',
  masu:'i', nasai:'i', potential:'e', imperative:'e', ba:'e', volitional:'o',
};
const PRIMITIVES = new Set([...Object.keys(ROW_FORMS),'past','te','prohibitive']);
const STEM_APPEND = new Set(['tai','nagara','tsutsu','sugiru','tagaru']);
const TE_APPEND = new Set([
  'teageru','temorau','tekureru','tekudasai','teiru','teru','tearu','teoru','tehoshii',
  'temo','tewa','temoIi','temiru','teiku','teku','tekuru','teshimau','teoku',
]);
const OTHER_APPEND_BASES = {
  naide:'negative', naideKudasai:'naide', nakutemoIi:'nakute', nakutewaIkenai:'nakute',
  nakerebaNaranai:'conditionalNegative', naitoIkenai:'negative',
  tara:'past', tari:'past', tatte:'past', youtosuru:'volitional',
  zuni:'zuStem', masenka:'masuStem', masuPast:'masuStem', masuNegative:'masuStem', masuNegativePast:'masuStem',
};
const POLITE_KCS = {masuPast:'compound.polite-past',masuNegative:'compound.polite-negative',masuNegativePast:'compound.polite-negative-past'};
const VOICING = new Map();
for(const group of ['かが','きぎ','くぐ','けげ','こご','さざ','しじ','すず','せぜ','そぞ',
  'ただ','ちぢ','つづ','てで','とど','はばぱ','ひびぴ','ふぶぷ','へべぺ','ほぼぽ']) {
  for(const character of group)VOICING.set(character,[...group].filter(other=>other!==character));
}
const CACHE = new Map();

function alteredSuffixes(suffix, { smallTsu = true } = {}) {
  if(!suffix)return new Set();
  const characters=Array.from(suffix), result=new Set();
  for(let start=0;start<characters.length;start++)for(let end=start+1;end<=characters.length;end++) {
    result.add(characters.slice(0,start).concat(characters.slice(end)).join(''));
    result.add(characters.slice(0,end).concat(characters.slice(start,end),characters.slice(end)).join(''));
  }
  // Two separate omissions can still affect just one grammatical suffix,
  // e.g. させられる → せれる. Never delete across the descriptor's stem boundary.
  for(let first=0;first<characters.length;first++)for(let second=first+2;second<characters.length;second++) {
    result.add(characters.filter((_,index)=>index!==first&&index!==second).join(''));
  }
  for(let index=0;index<characters.length;index++) {
    for(const replacement of VOICING.get(characters[index])??[]) {
      result.add(characters.map((character,i)=>i===index?replacement:character).join(''));
    }
    if(index+1<characters.length&&characters[index]!==characters[index+1]) {
      const swapped=[...characters];
      [swapped[index],swapped[index+1]]=[swapped[index+1],swapped[index]];
      result.add(swapped.join(''));
    }
    if(smallTsu&&['っ','つ'].includes(characters[index])) {
      result.add(characters.map((character,i)=>i===index?(character==='っ'?'つ':'っ'):character).join(''));
    }
  }
  if(smallTsu)for(let index=0;index<=characters.length;index++) {
    result.add(characters.slice(0,index).concat('っ',characters.slice(index)).join(''));
  }
  result.delete(suffix);
  return result;
}

function irregularStem(verb,form,correct) {
  const word=verb.surface;
  if(word.endsWith('する')) {
    const prefix=word.slice(0,-2), tail=correct.slice(prefix.length);
    const stem=form==='potential'?'でき':tail[0];
    return {base:prefix+stem,prefix,stem,alternatives:['し','さ','せ','す','する','でき']};
  }
  if(word==='来る')return {base:'来',prefix:'',stem:'来',alternatives:['来る']};
  if(word==='くる')return {base:correct[0],prefix:'',stem:correct[0],alternatives:['き','こ','く','くる']};
  return null;
}

// A descriptor isolates one observable attachment boundary. It deliberately
// excludes whole continuations and contractions that need more than one rule.
function descriptors(verb,form) {
  if(!PRIMITIVES.has(form)&&!STEM_APPEND.has(form)&&!TE_APPEND.has(form)&&!OTHER_APPEND_BASES[form])return [];
  const correct=acceptedConjugations(verb.surface,verb.class,form);
  const kcId=STEM_APPEND.has(form)||TE_APPEND.has(form)?`construction.${form}`:`suffix.${form}`;
  if(OTHER_APPEND_BASES[form]) {
    const baseForm=OTHER_APPEND_BASES[form];
    const base=baseForm==='masuStem'?conjugate(verb.surface,verb.class,'masu').slice(0,-2)
      :baseForm==='conditionalNegative'?conjugate(verb.surface,verb.class,'negative').slice(0,-1)+'ければ'
      :baseForm==='zuStem'?verb.surface.endsWith('する')?verb.surface.slice(0,-2)+'せ':conjugate(verb.surface,verb.class,'negative').slice(0,-2)
      :conjugate(verb.surface,verb.class,baseForm);
    return correct.filter(answer=>answer.startsWith(base)).map(answer=>({base,suffix:answer.slice(base.length),kcId:POLITE_KCS[form]??`construction.${form}`}));
  }
  if(form==='prohibitive')return correct.map(answer=>({base:verb.surface,suffix:answer.slice(verb.surface.length),kcId}));
  if(TE_APPEND.has(form)) {
    const base=conjugate(verb.surface,verb.class,'te');
    return correct.filter(answer=>answer.startsWith(base)).map(answer=>({base,suffix:answer.slice(base.length),kcId}));
  }
  if(verb.class==='irregular')return correct.map(answer=>{
    const stemForm=STEM_APPEND.has(form)?'masu':form;
    const stem=irregularStem(verb,stemForm,answer);
    return stem&&answer.startsWith(stem.base)?{
      ...stem,suffix:answer.slice(stem.base.length),kcId,
      stemKcId:STEM_APPEND.has(form)||['masu','nasai'].includes(form)?'stem.irregular.connective':`suffix.${form}`,
    }:null;
  }).filter(Boolean);
  let base, row;
  if(verb.class==='ichidan')base=verb.surface.slice(0,-1);
  else if(STEM_APPEND.has(form)||ROW_FORMS[form]) {
    row=STEM_APPEND.has(form)?'i':ROW_FORMS[form];
    const kana=ROWS[verb.surface.at(-1)]?.[ROW_INDEX[row]];
    if(!kana)return [];
    base=verb.surface.slice(0,-1)+kana;
  } else base=conjugate(verb.surface,verb.class,form).slice(0,-1);
  return correct.filter(answer=>answer.startsWith(base)).map(answer=>({base,suffix:answer.slice(base.length),kcId,row,
    stemKcId:verb.class==='ichidan'?'stem.ichidan.drop-ru':row?`stem.godan.${row}`:null}));
}

function candidatesFor(verb,form) {
  const key=JSON.stringify([verb.surface,verb.reading,verb.class,form]);
  if(CACHE.has(key))return CACHE.get(key);
  const candidates=[], seen=new Set();
  const add=(answer,kcId,message)=>{
    const key=JSON.stringify([answer,kcId]);
    if(!seen.has(key)){seen.add(key);candidates.push({answer,kcId,confirmedKcIds:[],message});}
  };
  for(const descriptor of descriptors(verb,form)) {
    const {base,suffix,kcId,stemKcId}=descriptor;
    for(const changed of alteredSuffixes(suffix,{smallTsu:!(verb.class==='godan'&&['past','te'].includes(form))})) {
      add(base+changed,kcId,`前面的词干或接续形式已保留，但后面的接续写成了「${changed || '（空）'}」，写法不完整或有误。本题这里应接「${suffix}」。`);
    }
    if(verb.class==='ichidan'&&stemKcId&&form!=='prohibitive') {
      add(verb.surface+suffix,stemKcId,'接续前仍保留了原形末尾的「る」。一段动词在这里需要先去掉「る」。');
    }
    if(verb.class==='godan'&&descriptor.row) {
      const ending=verb.surface.at(-1), options=[...(ROWS[ending]??[])];
      if(ending==='う'&&descriptor.row==='a')options.push('あ');
      for(const kana of options) {
        const changed=verb.surface.slice(0,-1)+kana;
        if(changed===base)continue;
        const failure=ending==='う'&&descriptor.row==='a'&&kana==='あ'?'stem.godan.u-wa':stemKcId;
        add(changed+suffix,failure,`词干最后的假名没有变为本题需要的${descriptor.row}段。这里应先变为「${base}」，再接后续形式。`);
      }
    }
    if(verb.class==='irregular'&&descriptor.alternatives) {
      for(const alternative of descriptor.alternatives) {
        if(alternative===descriptor.stem)continue;
        add(descriptor.prefix+alternative+suffix,stemKcId,`する／来る在这里使用的形式有误。正确的前部应为「${base}」，再接「${suffix}」。`);
      }
    }
  }
  // Swapping the sound change preserves the fixed lexical root, correct
  // terminal た/て/だ/で and any complete appended expression. A simultaneous
  // voicing mistake is therefore not silently reduced to one onbin error.
  if(verb.class==='godan'&&(['past','te'].includes(form)||TE_APPEND.has(form))) {
    const baseForm=form==='past'?'past':'te', target=conjugate(verb.surface,verb.class,baseForm);
    const root=verb.surface.slice(0,-1), sound=target.slice(root.length,-1), terminal=target.at(-1);
    const ending=verb.surface.at(-1), iku=verb.surface==='行く'||verb.reading==='いく';
    const kcId=iku?'facet.onbin.sokuon.iku':['う','つ','る'].includes(ending)?'onbin.sokuon'
      :['む','ぶ','ぬ'].includes(ending)?'onbin.hatsuon':['く','ぐ'].includes(ending)?'onbin.i':'stem.godan.shi-connective';
    for(const correct of acceptedConjugations(verb.surface,verb.class,form)) {
      if(!correct.startsWith(target))continue;
      const tail=correct.slice(target.length);
      for(const replacement of ['','っ','ん','い','し','つ'])if(replacement!==sound) {
        add(root+replacement+terminal+tail,kcId,'词根和后面的接续已保留，但中间的音便形式用错了。请按这个动词的词尾选择音便。');
      }
    }
  }
  if(CACHE.size>=256)CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key,candidates);
  return candidates;
}

export function diagnoseCommonVerbError(verb,form,answer,normalize=value=>value,allowedKcIds=[]) {
  if(!form||verb.domain&&verb.domain!=='verb'||typeof answer!=='string')return null;
  if(!PRIMITIVES.has(form)&&!STEM_APPEND.has(form)&&!TE_APPEND.has(form)&&!OTHER_APPEND_BASES[form])return null;
  const actual=normalize(answer);
  if(acceptedConjugations(verb.surface,verb.class,form).some(correct=>normalize(correct)===actual))return null;
  const matches=candidatesFor(verb,form).filter(candidate=>normalize(candidate.answer)===actual);
  // Check competing causes before filtering by the caller's step scope: a
  // narrower scope cannot make ambiguous evidence unambiguous.
  const ids=new Set(matches.map(candidate=>candidate.kcId));
  if(ids.size!==1||!allowedKcIds.includes(matches[0]?.kcId))return null;
  return matches[0];
}
