import { completeFormExpectation } from './complete-form-oracle.mjs';
import { acceptedConjugations } from '../../app/lib/conjugation.mjs';
import { acceptedAdjectiveConjugations } from '../../app/lib/adjective-conjugation.mjs';
import { COMPOUND_FORM_SPECS } from '../../app/lib/compound-forms.mjs';

// An independent, bounded error grammar. Only correct conjugations are shared
// with the application: neither diagnosis functions nor their candidates enter
// this module. Rule ownership below is deliberately a separate test contract.
export const COMMON_ERROR_PATTERNS = [
  ['common-stem-row', '词干错行或未变化'],
  ['common-stem-retained', '未去原形词尾'],
  ['common-onbin-choice', '音便主体错类'],
  ['common-suffix-span', '接续内部连续片段遗漏'],
  ['common-suffix-disjoint', '同一接续内两处不连续的字符遗漏'],
  ['common-suffix-voicing', '接续内部清浊音替换'],
  ['common-suffix-kana-size', '接续大小假名混淆'],
  ['common-suffix-sokuon', '接续多写促音'],
  ['common-suffix-repeat', '接续任意连续片段重复'],
  ['common-suffix-order', '接续相邻字符颠倒'],
  ['common-lexical-insertion', '不变词根内部多字'],
  ['common-lexical-order', '不变词根相邻字颠倒'],
  ['common-compound-mixed', '复合末操作变异的归因边界'],
  ['common-multiple-guard', '词根和活用操作同时损坏'],
  ['common-mixed-past-review', '受限词汇笔误与过去尾混用的独立补查'],
  ['common-mixed-past-guard', '混合过去补查的多处损坏与范围保护'],
].map(([id,label]) => ({id,label,level:'contract'}));

const normalize = value => value.normalize('NFKC').replace(/[ァ-ヶヽヾ]/g,char=>String.fromCharCode(char.charCodeAt(0)-0x60)).replace(/[\s。．.！!？?]/g,'');
const exact = failed => ({kind:'incorrect',failed,confirmed:[],steps:0});
const unknown = {kind:'incorrect',failed:null,confirmed:[]};
// Independent semantic scope: these derived outputs are ordinary verbs. The
// ある uses the same godan past rule; いく／くる remain outside this contract.
const continuationPastClasses={
  tagaruPast:['tagaru','godan','たがる'],teoruPast:['teoru','godan','ておる'],tearuPast:['tearu','godan','てある'],
  teageruPast:['teageru','ichidan','てあげる'],tekureruPast:['tekureru','ichidan','てくれる'],
  teiruPast:['teiru','ichidan','ている'],temiruPast:['temiru','ichidan','てみる'],sugiruPast:['sugiru','ichidan','すぎる'],
  passivePast:['passive','ichidan','受身形'],potentialPast:['potential','ichidan','可能形'],
  causativePast:['causative','ichidan','使役形'],causativePassivePast:['causativePassive','ichidan','使役受身形'],
};
export function continuationClassStageExpectation(step,input) {
  const spec=continuationPastClasses[step?.form];
  if(!spec||!step.continuation||step.providedClass)return null;
  const [baseForm,cls,label]=spec,failed=cls==='godan'?'onbin.sokuon':'suffix.past';
  const candidateKcIds=[`apply.${baseForm}.continuation`,failed];
  if(!step.kcIds.includes(candidateKcIds[0])||!step.kcIds.some(id=>id===failed||id==='suffix.past'))return null;
  const matches=(step.providedAnswers??[step.surface,step.reading]).some(base=>
    base.endsWith('る')
    &&normalize(base.slice(0,-1)+(cls==='godan'?'た':'った'))===normalize(input));
  if(!matches)return null;
  return {...unknown,stage:{form:'past',label:`${label}的过去变化`,candidateKcIds:candidateKcIds.filter(id=>step.kcIds.includes(id))},steps:2,
    probes:[{kind:'classification',diagnosticOnly:true,expectedClass:cls},{kind:'conjugation',providedClass:cls,form:'past'}]};
}
function mixedPastContext(item,step) {
  if(!step||!step.continuation||step.kind&&!step.providedClass)return null;
  const form=step.providedClass?`${step.reviewContext?.family?.form}Past`:step.form;
  const spec=continuationPastClasses[form];if(!spec)return null;
  const [baseForm,cls,label]=spec,scope=step.providedClass?step.reviewContext?.kcIds:step.kcIds;
  if(!scope?.includes(`apply.${baseForm}.continuation`)||!scope.includes(cls==='godan'?'onbin.sokuon':'suffix.past'))return null;
  const source=step.providedClass?step.reviewContext?.sourceItem:(step.analysisItem??item);
  if(source?.domain!=='verb')return null;
  const bases=[...new Set(step.providedAnswers??[step.surface,step.reading])];
  if(!bases.length||bases.some(base=>!base.endsWith('る')))return null;
  return {source,cls,label,bases,tails:['','っ','つ','ん','い','し','り','る'].flatMap(body=>['た','だ'].map(end=>body+end)).filter(tail=>tail!==(cls==='godan'?'った':'た'))};
}
function prefixEdit(expected,actual) {
  const a=Array.from(expected),b=Array.from(actual),kanaChar=c=>/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(c??'');
  if(expected===actual)return null;
  if(a.length===b.length) {
    const changed=a.flatMap((c,i)=>c!==b[i]?[i]:[]);
    if(changed.length===1&&kanaChar(a[changed[0]])&&sameScript(a[changed[0]],b[changed[0]]))return 'substitution';
    if(changed.length===2) {
      const [i,j]=changed;
      if(j===i+1&&a[i]===b[j]&&a[j]===b[i]&&kanaChar(a[i])&&sameScript(a[i],a[j]))return 'transposition';
    }
  }
  if(a.length===b.length+1&&b.length)for(let i=0;i<a.length;i++)if(kanaChar(a[i])&&a.filter((_,j)=>i!==j).join('')===actual)return 'deletion';
  if(b.length===a.length+1&&a.length)for(let i=0;i<b.length;i++)if(kanaChar(b[i])&&(sameScript(b[i],a[i])||sameScript(b[i],a[i-1]))&&b.filter((_,j)=>i!==j).join('')===expected)return 'insertion';
  return undefined;
}
export function mixedPastReviewExpectation(item,step,input) {
  const context=mixedPastContext(item,step);if(!context)return null;
  const actual=normalize(input),matches=new Map();
  for(const word of [context.source,kana(context.source)]) {
    const expected=normalize(fixedPrefix(word));
    for(const base of context.bases) {
      const root=normalize(base.slice(0,-1));if(!root.startsWith(expected))continue;
      const bridge=root.slice(expected.length);
      for(const tail of context.tails) {
        const ending=bridge+tail;if(!actual.endsWith(ending))continue;
        const prefix=actual.slice(0,-ending.length),operation=prefixEdit(expected,prefix);
        if(operation===undefined)continue;
        const rootMismatch=operation===null?null:{expected,actual:prefix,operation};
        matches.set(JSON.stringify([root,prefix+bridge,rootMismatch]),rootMismatch);
      }
    }
  }
  if(matches.size!==1)return null;
  return {...unknown,stage:null,review:{kind:'mixed-past',form:'past',label:`${context.label}的过去变化`,rootMismatch:[...matches.values()][0]},steps:step.providedClass?0:2,
    ...(!step.providedClass?{probes:[{kind:'classification',diagnosticOnly:true,expectedClass:context.cls},{kind:'conjugation',providedClass:context.cls,form:'past'}]}:{})};
}
function mixedPastCases(item,step) {
  const context=mixedPastContext(item,step);if(!context)return [];
  const result=[];
  for(const [writing,word] of [['surface',context.source],['reading',kana(context.source)]]) {
    const prefix=fixedPrefix(word),chars=Array.from(prefix),mutations=[];
    const replacement=char=>{
      if(!/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(char))return null;
      const katakana=/\p{Script=Katakana}/u.test(char),hira=katakana?String.fromCharCode(char.charCodeAt(0)-0x60):char;
      const row=['あいうえお','かきくけこ','がぎぐげご','さしすせそ','ざじずぜぞ','たちつてと','なにぬねの','はひふへほ','ばびぶべぼ','ぱぴぷぺぽ','まみむめも','やゆよ','らりるれろ','わを'].find(row=>row.includes(hira));
      const next=row?(hira===row[0]?row[1]:row[0]):'あ';return katakana?String.fromCharCode(next.charCodeAt(0)+0x60):next;
    };
    for(let i=0;i<chars.length;i++) {
      const next=replacement(chars[i]);if(!next)continue;
      mutations.push(chars.map((char,j)=>i===j?next:char).join(''));
      if(chars.length>1)mutations.push(chars.filter((_,j)=>i!==j).join(''));
      mutations.push(chars.slice(0,i).concat(chars[i],chars.slice(i)).join(''));
      if(i+1<chars.length&&chars[i]!==chars[i+1]&&sameScript(chars[i],chars[i+1])) {
        const swapped=[...chars];[swapped[i],swapped[i+1]]=[swapped[i+1],swapped[i]];mutations.push(swapped.join(''));
      }
    }
    for(const base of context.bases) {
      const root=base.slice(0,-1);if(!root.startsWith(prefix))continue;
      const bridge=root.slice(prefix.length);
      // Visit every tail, but do not multiply all root edits by all tails.
      const inputs=context.tails.map(tail=>root+tail).concat(mutations.map(changed=>changed+bridge+'だ'));
      for(const input of inputs) {
        const expected=mixedPastReviewExpectation(item,step,input);
        if(expected)result.push({pattern:'common-mixed-past-review',operator:'mixed-past',input,writing,expected});
        else result.push({pattern:'common-mixed-past-guard',operator:'mixed-guard',input,writing,
          expected:{...lexicalExpectation(input,lexicalTargets(item,step.form,step)),stage:null,review:null,steps:0}});
      }
      const damaged=chars.map(char=>replacement(char)??char);
      if(chars.filter((char,i)=>char!==damaged[i]).length>=2)result.push({pattern:'common-mixed-past-guard',operator:'mixed-guard',input:damaged.join('')+bridge+'だ',writing,expected:{...unknown,stage:null,review:null,steps:0}});
      for(const input of ['§'+root+'だ',root+'§だ'])result.push({pattern:'common-mixed-past-guard',operator:'mixed-guard',input,writing,expected:{...unknown,stage:null,review:null,steps:0}});
    }
  }
  return result;
}
const kana = item => ({...item,surface:item.reading,...(item.domain==='verb'?{lexicalSurface:item.surface}:{})});
const answers = (item,form) => item.domain==='verb'
  ? acceptedConjugations(item.surface,item.class,form) : acceptedAdjectiveConjugations(item,form);
const naKcs = {
  adjectiveAttributive:'adj.suffix.na-attributive',adjectivePredicative:'adj.suffix.na-predicative',
  adjectiveNaNegative:'adj.suffix.na-negative',adjectiveNaPast:'adj.suffix.na-past',
  adjectiveNaTe:'adj.suffix.na-te',adjectiveBa:'adj.suffix.na-conditional',adjectiveAdverb:'adj.suffix.na-adverb',
};
const rowLetters = {
  う:['わ','い','う','え','お'],く:['か','き','く','け','こ'],ぐ:['が','ぎ','ぐ','げ','ご'],
  す:['さ','し','す','せ','そ'],つ:['た','ち','つ','て','と'],ぬ:['な','に','ぬ','ね','の'],
  ぶ:['ば','び','ぶ','べ','ぼ'],む:['ま','み','む','め','も'],る:['ら','り','る','れ','ろ'],
};
const rowForms = {
  negative:'a',passive:'a',causative:'a',causativePassive:'a',masu:'i',nasai:'i',
  potential:'e',imperative:'e',ba:'e',volitional:'o',tai:'i',nagara:'i',tsutsu:'i',sugiru:'i',tagaru:'i',
};
const iAppend = new Set(['tai','nagara','tsutsu','sugiru','tagaru']);
const teAppend = new Set(['teageru','temorau','tekureru','tekudasai','teiru','teru','tearu','teoru','tehoshii','temo','tewa','temoIi','temiru','teiku','teku','tekuru','teshimau','teoku']);
const basicVerb = new Set(['negative','past','te','masu','nasai','potential','passive','causative','causativePassive','imperative','volitional','ba','prohibitive']);
// A completed prerequisite followed by one separately taught attachment. This
// table deliberately does not include multi-rule contractions (chau/toku/toru).
const extraAppend = {
  naide:['negative','で'],naideKudasai:['naide','ください'],
  nakutemoIi:['nakute','もいい'],nakutewaIkenai:['nakute','はいけない'],
  nakerebaNaranai:['negativeBa','ならない'],naitoIkenai:['negative','といけない'],
  tara:['past','ら'],tari:['past','り'],tatte:['past','って'],
  youtosuru:['volitional','とする'],zuni:['zuStem','ずに'],masenka:['masuStem','ませんか'],
  masuPast:['masuStem','ました','compound.polite-past'],
  masuNegative:['masuStem','ません','compound.polite-negative'],
  masuNegativePast:['masuStem','ませんでした','compound.polite-negative-past'],
};
const iTargets = {past:'adjectivePast',negative:'adjectiveNegative',negativePast:'adjectiveNegativePast'};
const paired = pairs => Object.fromEntries(pairs.flatMap(([a,b]) => [[a,b],[b,a]]));
const voiced = Object.fromEntries(['かが','きぎ','くぐ','けげ','こご','さざ','しじ','すず','せぜ','そぞ','ただ','ちぢ','つづ','てで','とど','はばぱ','ひびぴ','ふぶぷ','へべぺ','ほぼぽ'].flatMap(group=>Array.from(group).map(char=>[char,Array.from(group).filter(c=>c!==char)])));
const sized = paired(Array.from('ぁぃぅぇぉっゃゅょゎ').map((c,i)=>[c,Array.from('あいうえおつやゆよわ')[i]]));

// Every applicable position is visited. Two separated deletions are one
// bounded omission family inside one suffix, never across grammatical steps.
// Long expressions use bounded representatives at the caller, not random edits.
export function commonSuffixMutations(suffix,{sokuon=true,smallKana=true}={}) {
  if(!suffix)return [];
  const chars=Array.from(suffix),out=[],seen=new Set();
  function add(operator,value) {
    if(value===suffix)return;
    const key=operator+'\0'+value;if(seen.has(key))return;seen.add(key);
    out.push({operator,suffix:value,pattern:`common-suffix-${operator}`});
  }
  for(let start=0;start<chars.length;start++) {
    for(let gap=start+2;gap<chars.length;gap++) {
      add('disjoint',chars.slice(0,start).concat(chars.slice(start+1,gap),chars.slice(gap+1)).join(''));
    }
    for(let end=start+1;end<=chars.length;end++) {
      add('span',chars.slice(0,start).concat(chars.slice(end)).join(''));
      add('repeat',chars.slice(0,end).concat(chars.slice(start,end),chars.slice(end)).join(''));
    }
    for(const replacement of voiced[chars[start]]??[])add('voicing',chars.map((char,i)=>i===start?replacement:char).join(''));
    if(sized[chars[start]]&&(smallKana||['っ','つ'].includes(chars[start])))add('kana-size',chars.map((char,i)=>i===start?sized[char]:char).join(''));
    if(start+1<chars.length&&chars[start]!==chars[start+1]) {
      const swapped=[...chars];[swapped[start],swapped[start+1]]=[swapped[start+1],swapped[start]];add('order',swapped.join(''));
    }
  }
  add('repeat',suffix+suffix);
  if(sokuon)for(let i=0;i<=chars.length;i++)add('sokuon',chars.slice(0,i).concat('っ',chars.slice(i)).join(''));
  return out;
}

function adjectiveSpecs(word,form) {
  if(word.class==='na')return naKcs[form]?answers(word,form).map(answer=>({base:word.surface,suffix:answer.slice(word.surface.length),failed:naKcs[form],retained:['な','だ']})):[];
  const root=word.iiFamily?word.surface.slice(0,-2)+'よ':word.surface.slice(0,-1);
  const spec={adjectivePast:['かった','adj.suffix.i-past'],adjectiveBa:['ければ','adj.suffix.i-ba'],adjectiveNegative:['ない','adj.suffix.i-negative'],adjectiveTe:['て','adj.suffix.i-te']}[form];
  if(!spec)return [];
  return [{base:root+(['adjectiveNegative','adjectiveTe'].includes(form)?'く':''),suffix:spec[0],failed:spec[1]}];
}

function verbSpecs(word,form) {
  if(extraAppend[form]) {
    const [baseForm,suffix,failed=`construction.${form}`]=extraAppend[form];
    return [{base:extraBase(word,baseForm),suffix,failed,sokuon:true}];
  }
  if(!basicVerb.has(form)&&!iAppend.has(form)&&!teAppend.has(form))return [];
  const valid=answers(word,form),failed=(basicVerb.has(form)?'suffix.':'construction.')+form;
  let bases=[];
  if(form==='prohibitive')bases=[word.surface];
  else if(teAppend.has(form))bases=answers(word,'te');
  else if(iAppend.has(form)||['masu','nasai'].includes(form))bases=answers(word,'masu').map(v=>v.slice(0,-2));
  else if(word.class==='ichidan')bases=[word.surface.slice(0,-1)];
  else if(word.class==='godan') {
    if(['past','te'].includes(form))bases=valid.map(v=>v.slice(0,-1));
    else if(rowForms[form])bases=[word.surface.slice(0,-1)+rowLetters[word.surface.at(-1)][['a','i','u','e','o'].indexOf(rowForms[form])]];
  } else if(word.surface.endsWith('する')) {
    const root=word.surface.slice(0,-2);
    const stems=form==='potential'?['でき']:['passive','causative','causativePassive'].includes(form)?['さ']:form==='ba'?['す']:form==='imperative'?['し','せ']:['し'];
    bases=stems.map(stem=>root+stem);
  } else if(word.surface==='来る')bases=['来'];
  else if(word.surface==='くる')bases=[['negative','passive','potential','causative','causativePassive','imperative','volitional'].includes(form)?'こ':form==='ba'?'く':'き'];
  return bases.flatMap(base=>valid.filter(answer=>answer.startsWith(base)).map(answer=>({base,suffix:answer.slice(base.length),failed,sokuon:!(word.class==='godan'&&['past','te'].includes(form))})));
}
function extraBase(word,form) {
  if(form==='masuStem')return answers(word,'masu')[0].slice(0,-2);
  if(form==='negativeBa')return answers(word,'negative')[0].slice(0,-1)+'ければ';
  if(form==='zuStem')return word.surface.endsWith('する')?word.surface.slice(0,-2)+'せ':answers(word,'negative')[0].slice(0,-2);
  return answers(word,form)[0];
}

function stemCases(word,form,specs) {
  const out=[],add=(pattern,input,failed)=>out.push({pattern,input,expected:exact(failed),operator:pattern.replace('common-','')});
  if(word.domain==='adjective') {
    if(word.class==='na')for(const spec of specs)for(const extra of spec.retained??[])add('common-stem-retained',spec.base+extra+spec.suffix,spec.failed);
    const naAnalogy={adjectiveNaNegative:'だない',adjectiveNaTe:'だて',adjectiveAttributive:'の',adjectiveBa:'だば'}[form];
    if(word.class==='na'&&naAnalogy)add('common-stem-retained',word.surface+naAnalogy,naKcs[form]);
    if(word.class==='i') {
      const root=word.iiFamily?word.surface.slice(0,-2)+'よ':word.surface.slice(0,-1);
      const tail={adjectiveNegative:'ない',adjectiveTe:'て',adjectiveAdverb:''}[form];
      if(tail!==undefined)for(const wrong of ['','ぐ','くく'])add('common-stem-row',root+wrong+tail,'adj.stem.i-ku');
      if(['adjectivePast','adjectiveBa'].includes(form))for(const ending of form==='adjectivePast'?['かった']:['ければ','ば','れば'])add('common-stem-row',root+'く'+ending,form==='adjectivePast'?'adj.suffix.i-past':'adj.suffix.i-ba');
    }
    return out;
  }
  if(extraAppend[form]&&(!['tara','tari','tatte'].includes(form)||word.class!=='godan'))return out;
  const row=rowForms[form];
  if(row&&word.class==='godan')for(const spec of specs) {
    const ending=word.surface.at(-1),root=word.surface.slice(0,-1),letters=rowLetters[ending];
    for(const alternative of [...letters,...(ending==='う'&&row==='a'?['あ']:[])]) {
      if(root+alternative===spec.base)continue;
      add('common-stem-row',root+alternative+spec.suffix,ending==='う'&&row==='a'&&alternative==='あ'?'stem.godan.u-wa':`stem.godan.${row}`);
    }
    if(form==='passive'&&spec.suffix==='れる')add('common-stem-retained',spec.base+'られる','suffix.passive');
    if(form==='causative'&&['せる','す'].includes(spec.suffix))add('common-stem-retained',spec.base+'さ'+spec.suffix,'suffix.causative');
  }
  if(word.class==='ichidan'&&form==='volitional')add('common-suffix-kana-size',word.surface.slice(0,-1)+'よお','suffix.volitional');
  if(word.class==='ichidan'&&form==='imperative')add('common-suffix-repeat',word.surface.slice(0,-1)+'ろう','suffix.imperative');
  if(word.class==='ichidan'&&form!=='prohibitive'&&!teAppend.has(form))for(const spec of specs)add('common-stem-retained',word.surface+spec.suffix,'stem.ichidan.drop-ru');
  if(word.class==='irregular'&&form!=='prohibitive'&&!teAppend.has(form))for(const spec of specs) {
    const connective=iAppend.has(form)||['masu','nasai'].includes(form),failed=connective?'stem.irregular.connective':`suffix.${form}`;
    const root=word.surface.endsWith('する')?word.surface.slice(0,-2):'';
    const candidates=word.surface.endsWith('する')?['し','さ','せ','す','する','でき']:word.surface==='くる'?['き','こ','く','くる']:word.surface==='来る'?['来る']:[];
    for(const stem of candidates)if(root+stem!==spec.base)add('common-stem-row',root+stem+spec.suffix,failed);
  }
  if(word.class==='godan'&&(['past','te','tara','tari','tatte'].includes(form)||teAppend.has(form))) {
    const root=word.surface.slice(0,-1),ending=word.surface.at(-1);
    const iku=word.surface==='行く'||word.reading==='いく';
    const failed=iku?'facet.onbin.sokuon.iku':ending==='す'?'stem.godan.shi-connective':['む','ぶ','ぬ'].includes(ending)?'onbin.hatsuon':['く','ぐ'].includes(ending)?'onbin.i':'onbin.sokuon';
    for(const target of answers(word,form)) {
      // Only the complete, correctly connected target is eligible; contractions
      // replace a boundary and do not provide an unambiguous onbin operation.
      const baseForm=teAppend.has(form)?'te':['tara','tari','tatte'].includes(form)?'past':form;
      const core=answers(word,baseForm)[0];if(!target.startsWith(core))continue;
      const body=core.slice(root.length,-1),tail=target.slice(root.length+body.length);
      for(const wrong of new Set(['','っ','ん','い','し','つ',ending]))if(wrong!==body)add('common-onbin-choice',root+wrong+tail,failed);
      if(teAppend.has(form))add('common-suffix-voicing',root+body+(tail[0]==='で'?'だ':'た')+tail.slice(1),'suffix.te');
    }
  }
  return out;
}

function fixedPrefix(word) {
  const remove=word.domain==='adjective'?(word.class==='na'?0:word.iiFamily?2:1):word.class==='irregular'?2:1;
  return word.surface.slice(0,Math.max(0,word.surface.length-remove));
}
function script(char) {return ['Hiragana','Katakana','Han'].find(name=>new RegExp(`\\p{Script=${name}}`,'u').test(char??''));}
function sameScript(a,b) {const s=script(a);return Boolean(s&&s===script(b));}

// The test oracle considers ALL accepted corrections together. Insertion and
// transposition never become a retry merely because their generating target was
// unique inside one writing or one colloquial variant.
function lexicalExpectation(input,targets) {
  const actual=Array.from(normalize(input)),corrections=new Set();let unsafe=false;
  for(const {correct,prefix} of targets) {
    const target=Array.from(normalize(correct)),fixed=Array.from(normalize(prefix));
    if(!fixed.length||!normalize(correct).startsWith(fixed.join('')))continue;
    if(actual.length===target.length) {
      const mismatches=target.flatMap((c,i)=>c===actual[i]?[]:[i]);
      if(mismatches.length===1&&mismatches[0]<fixed.length&&sameScript(target[mismatches[0]],actual[mismatches[0]]))corrections.add(normalize(correct));
      if(mismatches.length===2) {
        const [a,b]=mismatches;
        if(b===a+1&&actual[a]===target[b]&&actual[b]===target[a]&&sameScript(target[a],target[b])) {
          if(b>=fixed.length)unsafe=true;
          else if(fixed.length>=2)corrections.add(normalize(correct));
        }
      }
    }
    if(target.length===actual.length+1) {
      const positions=target.flatMap((c,i)=>target.filter((_,j)=>j!==i).join('')===actual.join('')?[i]:[]);
      if(positions.some(i=>i>=fixed.length))unsafe=true;
      if(fixed.length>=3&&positions.length&&positions.every(i=>i<fixed.length&&/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]/u.test(target[i])))corrections.add(normalize(correct));
    }
    if(actual.length===target.length+1) {
      const positions=actual.flatMap((c,i)=>actual.filter((_,j)=>j!==i).join('')===target.join('')?[i]:[]);
      if(positions.some(i=>i>=fixed.length))unsafe=true;
      if(fixed.length>=2&&positions.length&&positions.every(i=>i<fixed.length&&(sameScript(actual[i],target[Math.min(i,fixed.length-1)])||sameScript(actual[i],target[i-1])||actual[i]==='ー'&&['Hiragana','Katakana'].includes(script(target[Math.min(i,fixed.length-1)]))))) {
        corrections.add(normalize(correct));
      }
    }
  }
  return !unsafe&&corrections.size===1?{kind:'typo'}:unknown;
}
function lexicalTargets(item,form,step) {
  const targets=[],lexicalItem=step?.analysisItem??item;
  for(const [writing,word] of [['surface',lexicalItem],['reading',kana(lexicalItem)]]) {
    const correctForms=step?(writing==='surface'?step.answers:step.readings):answers(word,form);
    for(const correct of correctForms)targets.push({correct,prefix:fixedPrefix(word),writing});
  }
  return targets;
}
// Reused by the older deletion family so all four operators share the same
// independently computed correction set across spellings and accepted variants.
export function commonLexicalExpectation(item,form,input,{step=null}={}) {
  return lexicalExpectation(input,lexicalTargets(item,form,step));
}

function family(form) {
  if(COMPOUND_FORM_SPECS[form])return COMPOUND_FORM_SPECS[form];
  const voice=form.match(/^(passive|potential|causative|causativePassive)(Past|Negative|NegativePast)$/);
  return voice?{form:voice[1],outputType:'verb',outputClass:'ichidan',ending:{Past:'past',Negative:'negative',NegativePast:'negativePast'}[voice[2]]}:null;
}
// A supplied complete negative demonstrates native operations only. Keep the
// expected rule list separate from the production knowledge graph and intersect
// it with the caller's scope only after all accepted base variants are checked.
export function suppliedNegativeIntermediateCases(item,step) {
  const f=step?.continuation&&item.domain==='verb'?family(step.form):null;
  if(f?.ending!=='negativePast'||step.kind)return [];
  const matches=new Map();
  for(const base of new Set(step.providedAnswers??[step.surface,step.reading])) {
    let word=base,prefix='',cls=f.outputClass;
    const tails={aru:['ある'],iku:['行く','いく'],kuru:['来る','くる'],irregular:['する']}[cls];
    if(tails) {
      const tail=tails.find(tail=>base.endsWith(tail));if(!tail)continue;
      prefix=base.slice(0,-tail.length);word=tail;
    }
    const adjective=f.outputType==='iAdjective';
    const proxy={domain:adjective?'adjective':'verb',surface:word,reading:word,class:adjective?'i':['aru','iku'].includes(cls)?'godan':['kuru','irregular'].includes(cls)?'irregular':cls,iiFamily:false};
    const negatives=cls==='aru'?['ない']:answers(proxy,adjective?'adjectiveNegative':'negative');
    const evidence=cls==='aru'?['exception.aru-negative']:adjective?['adj.stem.i-ku','adj.suffix.i-negative']:[...stemEvidence(proxy,'negative'),'suffix.negative'];
    for(const negative of negatives) {
      const input=prefix+negative,key=normalize(input),confirmed=evidence.filter(id=>step.kcIds.includes(id));
      const prior=matches.get(key);
      matches.set(key,{input,confirmed:prior?prior.confirmed.filter(id=>confirmed.includes(id)):confirmed});
    }
  }
  return [...matches.values()].map(({input,confirmed})=>({pattern:'negative-intermediate',input,writing:'mixed',
    expected:{...unknown,confirmed,steps:1,continuation:true,probes:[{kind:'atomic',focusId:'adj.suffix.i-past'}]}}));
}
function classFailure(word) {
  if(word.class==='irregular')return `facet.class.irregular.${word.surface.endsWith('する')?'suru':'kuru'}`;
  if(word.class==='godan'&&word.surface.endsWith('る')&&/[いきぎしじちぢにひびぴみりえけげせぜてでねへべぺめれ]る$/.test(word.reading))return `lexeme.ru-godan.${word.lexicalSurface??word.surface}`;
  return `class.${word.class}`;
}
const counterclassCache=new Map();
function counterclassMatches(word,form,input) {
  if(word.domain!=='verb')return false;
  const key=JSON.stringify([word.surface,word.class,form]);
  if(!counterclassCache.has(key)) {
    const forms=new Set();
    for(const cls of ['godan','ichidan','irregular'].filter(cls=>cls!==word.class)) {
      try{for(const value of answers({...word,class:cls},form))forms.add(normalize(value));}catch{ /* Unsupported counterclass. */ }
    }
    if(counterclassCache.size>=256)counterclassCache.delete(counterclassCache.keys().next().value);
    counterclassCache.set(key,forms);
  }
  return counterclassCache.get(key).has(normalize(input));
}
function stemEvidence(word,form) {
  if(word.class==='irregular')return ['masu','nasai',...iAppend].includes(form)?['stem.irregular.connective']:[];
  if(word.class==='ichidan')return ['stem.ichidan.drop-ru'];
  if(['past','te'].includes(form)) {
    const ending=word.surface.at(-1),iku=['行く','いく'].includes(word.surface)||word.reading==='いく';
    return [iku||['う','つ','る'].includes(ending)?'onbin.sokuon':['む','ぶ','ぬ'].includes(ending)?'onbin.hatsuon':['く','ぐ'].includes(ending)?'onbin.i':'stem.godan.shi-connective'];
  }
  const row=rowForms[form];return row?[`stem.godan.${row}`,...(row==='a'&&word.surface.endsWith('う')?['stem.godan.u-wa']:[])]:[];
}
function oldBoundaryExpected(word,form,input,scope,{providedPrimitive=false,providedClass=false}={}) {
  const filter=ids=>scope?ids.filter(id=>scope.includes(id)):ids;
  const result=(failed,confirmed=[])=>!scope||scope.includes(failed)?{...exact(failed),confirmed:filter(confirmed)}:null;
  const normalized=normalize(input),valid=answers(word,form),shortened=!providedPrimitive&&valid.some(answer=>normalize(answer.slice(0,-1))===normalized);
  if(providedClass&&word.domain==='verb'&&form==='past') {
    const eligible=['godan','ichidan'].includes(word.class)&&word.surface.endsWith('る');
    const opposite=word.surface.slice(0,-1)+(word.class==='godan'?'た':'った');
    if(eligible&&normalize(opposite)===normalized)return result(word.class==='godan'?'onbin.sokuon':'suffix.past');
  }
  if(word.domain==='adjective') {
    if(word.class==='i'&&['adjectiveNegative','adjectiveTe'].includes(form)) {
      const base=(word.iiFamily?word.surface.slice(0,-2)+'よ':word.surface.slice(0,-1))+'く';
      if(normalize(base)===normalized||shortened)return result(form==='adjectiveNegative'?'adj.suffix.i-negative':'adj.suffix.i-te',['adj.stem.i-ku',...(word.iiFamily?['adj.exception.ii-yo']:[])]);
    }
    if(word.class==='i'&&shortened&&['adjectivePast','adjectiveBa'].includes(form))return result(form==='adjectivePast'?'adj.suffix.i-past':'adj.suffix.i-ba',word.iiFamily?['adj.exception.ii-yo']:[]);
    return null;
  }
  const simple=['negative','past','te','masu','potential','passive','volitional','ba','imperative'];
  const alternative=simple.includes(form)&&simple.some(other=>other!==form&&answers(word,other).some(answer=>normalize(answer)===normalized));
  const counterfactual=counterclassMatches(word,form,input);
  if(counterfactual)return alternative||scope&&!scope.includes(classFailure(word))?unknown:result(classFailure(word));
  if(alternative)return result(`suffix.${form}`);
  if(!providedClass&&word.class==='godan'&&form==='past'&&normalize(answers(word,'masu')[0].slice(0,-2)+'た')===normalized)return result(stemEvidence(word,'past')[0]);
  if(['masuPast','masuNegative','masuNegativePast'].includes(form)&&['masu','masuPast','masuNegative','masuNegativePast'].some(other=>other!==form&&answers(word,other).some(answer=>normalize(answer)===normalized))) {
    // A complete other polite form demonstrates the connective and masu, not
    // the source class, the ru heuristic, or unrelated per-word facets.
    return result(extraAppend[form][2],[...(word.class==='irregular'?[]:stemEvidence(word,'masu')),'suffix.masu']);
  }
  if(extraAppend[form]) {
    const [baseForm,,failed=`construction.${form}`]=extraAppend[form],base=extraBase(word,baseForm);
    const atBase=normalize(base)===normalized;
    if(baseForm==='masuStem'&&atBase)return {...unknown,confirmed:filter(stemEvidence(word,'masu')),...(scope?{steps:0}:{steps:2,continuation:true})};
    if(baseForm==='masuStem'&&shortened)return result(failed,stemEvidence(word,'masu'));
    if(baseForm==='zuStem')return shortened?result(failed,stemEvidence(word,'negative')):null;
    if(atBase||shortened)return result(failed,extraBaseEvidence(word,baseForm).filter(id=>form!=='nakutewaIkenai'||id!=='construction.nakute'));
  }
  if(teAppend.has(form)||iAppend.has(form)||['masu','nasai'].includes(form)) {
    const te=teAppend.has(form),base=te?answers(word,'te')[0]:answers(word,'masu')[0].slice(0,-2);
    const atBase=normalize(base)===normalized;
    if(atBase||shortened&&input.startsWith(base)&&input.length>base.length) {
      const confirmed=te?[...stemEvidence(word,'te'),...(['む','ぶ','ぬ','ぐ'].includes(word.surface.at(-1))&&word.class==='godan'?['onbin.voicing']:[]),'suffix.te']:stemEvidence(word,'masu');
      return result((['masu','nasai'].includes(form)?'suffix.':'construction.')+form,confirmed);
    }
  }
  if(shortened&&basicVerb.has(form)&&form!=='prohibitive'&&!(word.class==='godan'&&form==='imperative'))return result(`suffix.${form}`,stemEvidence(word,form));
  return null;
}
function extraBaseEvidence(word,form) {
  if(form==='naide')return [...extraBaseEvidence(word,'negative'),'construction.naide'];
  if(form==='nakute')return [...extraBaseEvidence(word,'negative'),'adj.stem.i-ku','adj.suffix.i-te','construction.nakute'];
  if(form==='negativeBa')return [...extraBaseEvidence(word,'negative'),'adj.suffix.i-ba'];
  const voice=word.class==='godan'&&['past','te'].includes(form)&&['む','ぶ','ぬ','ぐ'].includes(word.surface.at(-1))?['onbin.voicing']:[];
  return [...stemEvidence(word,form),...voice,`suffix.${form}`];
}
function providedContexts(item,form,step) {
  const baseItem=step.analysisItem??item;
  if(step.providedClass)return [...new Set(step.providedAnswers??[step.surface,step.reading])].map(base=>({
    item:{...baseItem,surface:base,reading:base,class:step.providedClass},form:step.form,prefix:'',providedPrimitive:true,providedClass:true,
  }));
  if(!step.continuation)return [{item:baseItem,form:step.form,prefix:''}];
  const f=family(step.form),negative=['negativePast','adjectiveNegativePast','adjectiveNaNegativePast'].includes(step.form);
  if(f||negative)return [...new Set(step.providedAnswers??[step.surface,step.reading])].flatMap(base=>{
    const ending=negative?'past':f.ending;
    if(negative||f.outputType==='iAdjective')return base.endsWith('い')?[{item:{domain:'adjective',surface:base,reading:base,class:'i',iiFamily:false},form:iTargets[ending],prefix:''}]:[];
    let cls=f.outputClass;
    if(cls==='aru')return ending==='past'?[{item:{domain:'verb',surface:'ある',reading:'ある',class:'godan'},form:ending,prefix:base.slice(0,-2)}]:[];
    if(f.form==='causative'&&base.endsWith('す'))cls='godan';
    if(cls==='kuru')return [{item:{domain:'verb',surface:'くる',reading:'くる',class:'irregular'},form:ending,prefix:base.slice(0,-2)}];
    if(cls==='iku')return base.endsWith('いく')?[{item:{domain:'verb',surface:'いく',reading:'いく',class:'godan'},form:ending,prefix:base.slice(0,-2)}]:[];
    return [{item:{domain:'verb',surface:base,reading:base,class:cls==='iku'?'godan':cls},form:ending,prefix:''}];
  }).map(context=>({...context,providedPrimitive:true}));
  // A dynamic step may already supply the ku stem: only its remaining suffix
  // belongs to this step. Do not regenerate an earlier ku operation.
  if(baseItem.domain==='adjective'&&baseItem.class==='i'&&step.surface.endsWith('く')&&['adjectiveNegative','adjectiveTe'].includes(step.form))return [{item:baseItem,form:step.form,prefix:'',providedKu:step}];
  return [{item:baseItem,form:step.form,prefix:''}];
}

/** Independent cases for one whole-question or supplied-step context.
 * Existing contracts are test-policy precedence, never analyzer output.
 * The caller assigns stable IDs and exercise/step metadata using its usual emit.
 */
export function generateCommonErrorCases(item,form,{step=null,existingCases=[]}={}) {
  const contexts=step?providedContexts(item,form,step):[{item,form,prefix:''}];
  const accepted=new Set((step?[...step.answers,...step.readings]:[...answers(item,form),...answers(kana(item),form)]).map(normalize));
  const existing=new Map(),wrongClasses=new Set();
  for(const c of existingCases) {
    if(JSON.stringify(c.step??null)!==JSON.stringify(step))continue;
    if(c.pattern==='wrong-class')wrongClasses.add(normalize(c.input));
    if(c.expected?.kind==='explore'||c.expected?.kind==='correct')continue;
    if(!existing.has(normalize(c.input)))existing.set(normalize(c.input),c.expected);
  }
  // A complete counterclass form is only a candidate explanation. Resolve it
  // against independently generated operation candidates before assigning a KC.
  if(!step&&item.domain==='verb')for(const input of wrongClasses)if(!existing.has(input))existing.set(input,exact(classFailure(item)));
  const candidates=[],targets=lexicalTargets(item,form,step),boundaries=new Map(),classCandidates=new Map();let collisions=0;
  function add(c) {if(accepted.has(normalize(c.input))){collisions++;return;}candidates.push(c);}
  for(const c of mixedPastCases(item,step))add(c);
  for(const context of contexts)for(const [writing,word] of [['surface',context.item],['reading',kana(context.item)]]) {
    const prefix=context.prefix;
    let specs=context.providedKu?[{base:context.providedKu[writing==='surface'?'surface':'reading'],suffix:context.form==='adjectiveNegative'?'ない':'て',failed:context.form==='adjectiveNegative'?'adj.suffix.i-negative':'adj.suffix.i-te'}]
      :word.domain==='adjective'?adjectiveSpecs(word,context.form):verbSpecs(word,context.form);
    for(const spec of specs)for(const c of commonSuffixMutations(spec.suffix,{sokuon:spec.sokuon??false,smallKana:word.domain==='adjective'}))add({...c,input:prefix+spec.base+c.suffix,expected:exact(spec.failed),writing});
    if(!context.providedKu)for(const c of stemCases(word,context.form,specs))add({...c,input:prefix+c.input,writing});
    for(const c of candidates)if(c.writing===writing&&c.input.startsWith(prefix)) {
      if(!context.providedClass&&counterclassMatches(word,context.form,c.input.slice(prefix.length))) {
        const key=normalize(c.input);if(!classCandidates.has(key))classCandidates.set(key,new Set());
        classCandidates.get(key).add(classFailure(word));
      }
      const expected=oldBoundaryExpected(word,context.form,c.input.slice(prefix.length),step?.kcIds,context);
      if(expected)boundaries.set(normalize(c.input),expected);
    }
    if(step)for(const correct of answers(word,context.form))if(!accepted.has(normalize(prefix+correct)))boundaries.set(normalize(prefix+correct),{...unknown,steps:0});
  }
  for(const target of targets) {
    if(!target.correct.startsWith(target.prefix))continue;
    const fixed=Array.from(target.prefix),correct=Array.from(target.correct);
    if(fixed.length>=2&&script(fixed[0])) {
      const input=fixed[0]+target.correct;
      add({pattern:'common-lexical-insertion',operator:'root-insertion',input,writing:target.writing,expected:lexicalExpectation(input,targets)});
    }
    for(let i=0;i+1<fixed.length;i++)if(fixed[i]!==fixed[i+1]&&sameScript(fixed[i],fixed[i+1])) {
      const swapped=[...correct];[swapped[i],swapped[i+1]]=[swapped[i+1],swapped[i]];const input=swapped.join('');
      add({pattern:'common-lexical-order',operator:'root-order',input,writing:target.writing,expected:lexicalExpectation(input,targets)});
    }
  }
  // Compound errors preserve a complete first operation, but an incorrect final
  // form alone cannot distinguish the shared rule from applying it in context.
  const f=!step&&family(form);
  if(f)for(const [writing,word] of [['surface',item],['reading',kana(item)]]) {
    const base=answers(word,f.form)[0];
    const fake={surface:base,reading:base,providedAnswers:[base],continuation:true,form,kcIds:[]};
    const proxy=providedContexts(word,form,fake)[0];
    if(!proxy)continue;
    const specs=proxy.item.domain==='adjective'?adjectiveSpecs(proxy.item,proxy.form):verbSpecs(proxy.item,proxy.form);
    const seen=new Set();
    for(const spec of specs)for(const c of commonSuffixMutations(spec.suffix,{sokuon:spec.sokuon??false,smallKana:proxy.item.domain==='adjective'})) {
      if(seen.has(c.operator))continue;seen.add(c.operator);
      add({pattern:'common-compound-mixed',operator:c.operator,input:proxy.prefix+spec.base+c.suffix,writing,expected:{...unknown,minSteps:1}});
    }
  }
  // One explicit two-error guard per grammatical operator/context. A marker in
  // the unchanged root cannot accidentally be a valid Japanese lexical typo.
  const guards=new Set();
  for(const c of [...candidates])if(c.expected.kind==='incorrect'&&c.expected.failed&&!guards.has(c.operator)) {
    const expected=step&&continuationPastClasses[step.form]?{...unknown,stage:null,steps:0}:unknown;
    guards.add(c.operator);add({pattern:'common-multiple-guard',operator:c.operator,input:'§'+c.input,writing:c.writing,expected});
  }
  const byInput=new Map();
  for(const c of candidates) {
    const key=normalize(c.input);if(!byInput.has(key))byInput.set(key,[]);byInput.get(key).push(c);
  }
  const cases=[],seen=new Set(),classificationConflicts=[];
  for(const c of candidates) {
    const key=c.pattern+'\0'+normalize(c.input);if(seen.has(key))continue;seen.add(key);
    const same=byInput.get(normalize(c.input));
    const failed=new Set(same.filter(v=>v.expected.failed).map(v=>v.expected.failed));
    const resolved=failed.size>1?unknown:failed.size===1?same.find(v=>v.expected.failed).expected:c.expected;
    const inherited=existing.get(normalize(c.input));
    const obsoleteTypo=inherited?.kind==='typo'&&c.pattern.startsWith('common-lexical-')&&c.expected.kind==='incorrect';
    const stage=continuationClassStageExpectation(step,c.input);
    // Scope cannot eliminate a competing explanation. The raw operator set is
    // collected before scope filtering, independently of production candidates.
    const classConflict=[...(classCandidates.get(normalize(c.input))??[])].some(id=>[...failed].some(operation=>operation!==id));
    if(classConflict)classificationConflicts.push(normalize(c.input));
    const conservative=classConflict?{...unknown,...(!step?{minSteps:1}:{})}:null;
    let expected=stage??conservative??(obsoleteTypo?c.expected:inherited)??boundaries.get(normalize(c.input))??(step&&resolved.failed&&!step.kcIds.includes(resolved.failed)?unknown:resolved);
    const protectedRetainedRu=step?.providedClass==='ichidan'&&!step.kcIds.includes('stem.ichidan.drop-ru')
      &&(step.providedAnswers??[]).some(base=>normalize(base+'た')===normalize(c.input));
    if(!expected.failed&&!expected.confirmed?.length&&!expected.stage&&expected.kind!=='typo'&&!protectedRetainedRu&&!c.pattern.endsWith('guard')) {
      const review=mixedPastReviewExpectation(item,step,c.input);
      if(review)expected=lexicalExpectation(c.input,targets).kind==='typo'?{kind:'typo'}:review;
    }
    cases.push({...c,expected:completeFormExpectation(item,form,c.input,expected,step)});
  }
  return {cases,collisions,classificationConflicts:[...new Set(classificationConflicts)]};
}
