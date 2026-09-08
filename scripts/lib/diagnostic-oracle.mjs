// Independent grammatical test policy. It does not import the diagnosis
// registry, its candidates, or its fallback builder. Correct whole spellings
// use the established conjugator; the decomposition and rule contracts here
// are a separate test oracle, so removing a production step fails the audit.
import { acceptedConjugations } from '../../app/lib/conjugation.mjs';
import { acceptedAdjectiveConjugations } from '../../app/lib/adjective-conjugation.mjs';

const uniq = xs => [...new Set(xs)];
export const TEST_ROWS = ['うわいうえお','くかきくけこ','ぐがぎぐげご','すさしすせそ','つたちつてと','ぬなにぬねの','ぶばびぶべぼ','むまみむめも','るらりるれろ'];
const rows = Object.fromEntries(TEST_ROWS.map(row => [row[0], {a:row[1],i:row[2],e:row[4],o:row[5]}]));
const stemSuffixes = {tai:'たい',tagaru:'たがる',sugiru:'すぎる',nagara:'ながら',tsutsu:'つつ'};
const teSuffixes = {teageru:'あげる',temorau:'もらう',tekureru:'くれる',tekudasai:'ください',teiru:'いる',teru:'る',tearu:'ある',teoru:'おる',tehoshii:'ほしい',temo:'も',tewa:'は',temoIi:'もいい',temiru:'みる',teiku:'いく',teku:'く',tekuru:'くる',teshimau:'しまう',teoku:'おく'};
const post = {naide:['negative','で'],naideKudasai:['naide','ください'],tara:['past','ら'],tari:['past','り'],tatte:['past','って'],nakutemoIi:['nakute','もいい'],youtosuru:['volitional','とする'],naitoIkenai:['negative','といけない']};
const short = {chau:['teshimau',/([てで])しまう$/,'$1ちゃう'],toku:['teoku',/([てで])おく$/,'$1とく'],toru:['teoru',/([てで])おる$/,'$1とる'],causativePassiveContracted:['causativePassive',/せられる$/,'される']};
const auxiliaryClasses = Object.fromEntries([
  ...['teageru','tekureru','teiru','temiru','sugiru','passive','potential','causative','causativePassive'].map(id=>[id,'ichidan']),
  ...['temorau','teoru','teshimau','teoku','tagaru'].map(id=>[id,'godan']),
  ['tearu','aru'],['teiku','iku'],['tekuru','kuru'],['youtosuru','suru'],['tai','i'],['tehoshii','i'],
]);
export function referenceFamily(form) {
  const match = form?.match(/^(.*?)(NegativePast|Negative|Past)$/);
  return match && auxiliaryClasses[match[1]] ? {base:match[1],class:auxiliaryClasses[match[1]],ending:{NegativePast:'negativePast',Negative:'negative',Past:'past'}[match[2]]} : null;
}
export function correctSpellings(word, form) {
  if(word.domain==='adjective')return acceptedAdjectiveConjugations(word,form);
  const aux = word.auxiliary ?? word.tailClass;
  if(aux && ['aru','iku','kuru','suru','irregular'].includes(aux)) {
    const text={aru:'ある',iku:'いく',kuru:'くる',suru:'する',irregular:'する'}[aux];
    const special={aru:{negative:'ない',negativePast:'なかった',past:'あった'},iku:{negative:'いかない',negativePast:'いかなかった',past:'いった',te:'いって'},kuru:{negative:'こない',negativePast:'こなかった',past:'きた',te:'きて'}}[aux]?.[form];
    return special ? [word.surface.slice(0,-text.length)+special] : acceptedConjugations(text,word.class,form).map(s=>word.surface.slice(0,-text.length)+s);
  }
  return acceptedConjugations(word.surface,word.class,form);
}
const changed = (word, surface, cls=word.class) => ({...word,surface,reading:surface,class:cls,iiFamily:false});
const cut = (value, ending) => value.slice(0,-ending.length);
const common = (a,b) => {let n=0;while(a[n]&&a[n]===b[n])n++;return a.slice(0,n);};
export function referenceStages(word, form) {
  const stages=[];
  const add=(input,output,rules,cls=word.class)=>stages.push({before:input,after:output,ids:rules,class:cls});
  const walk=(w,f)=>{
    const before=w.surface, final=correctSpellings(w,f)[0], cls=w.class, root=before.slice(0,-1);
    const unit=(ids)=>add(before,final,ids,cls);
    const join=(base,id)=>{walk(w,base);add(correctSpellings(w,base)[0],final,[id],cls);};
    const connective=(row='i')=>{
      const id=cls==='godan'?`stem.godan.${row}`:cls==='ichidan'?'stem.ichidan.drop-ru':'stem.irregular.connective';
      const value=cls==='godan'?root+rows[before.at(-1)][row]:cls==='ichidan'?root:correctSpellings(w,'masu')[0].slice(0,-2);
      add(before,value,[id,...(cls==='godan'&&row==='a'&&before.endsWith('う')?['stem.godan.u-wa']:[])],cls);return value;
    };
    if(w.domain==='adjective') {
      if(w.iiFamily) {const yo=before.slice(0,-2)+'よい';add(before,yo,['adj.exception.ii-yo'],'i');walk(changed(w,yo),f);return;}
      if(['adjectiveNegativePast','adjectiveNaNegativePast'].includes(f)) {const base=cls==='i'?'adjectiveNegative':'adjectiveNaNegative';walk(w,base);walk(changed(w,correctSpellings(w,base)[0],'i'),'adjectivePast');return;}
      if(cls==='na') {
        const rule={adjectiveAttributive:'na-attributive',adjectivePredicative:'na-predicative',adjectiveNaNegative:'na-negative',adjectiveNaPast:'na-past',adjectiveNaTe:'na-te',adjectiveAdverb:'na-adverb',adjectiveBa:'na-conditional'}[f];
        if(!rule)throw new Error(`Missing adjective policy ${f}`);unit([`adj.suffix.${rule}`]);return;
      }
      if(['adjectiveNegative','adjectiveTe','adjectiveAdverb'].includes(f)) {
        add(before,root+'く',['adj.stem.i-ku'],'i');
        if(f!=='adjectiveAdverb')add(root+'く',final,[`adj.suffix.${f==='adjectiveNegative'?'i-negative':'i-te'}`],'i');return;
      }
      if(!['adjectivePast','adjectiveBa'].includes(f))throw new Error(`Missing adjective policy ${f}`);
      unit([`adj.suffix.${f==='adjectivePast'?'i-past':'i-ba'}`]);return;
    }
    const family=referenceFamily(f);
    if(family) {
      walk(w,family.base);
      const base=correctSpellings(w,family.base)[0], type=family.class;
      const supplied=changed(w,base,['aru','iku'].includes(type)?'godan':['kuru','suru'].includes(type)?'irregular':type);
      supplied.auxiliary=['aru','iku','kuru','suru'].includes(type)?type:undefined;
      supplied.domain=type==='i'?'adjective':'verb';
      walk(supplied,type==='i'?{past:'adjectivePast',negative:'adjectiveNegative',negativePast:'adjectiveNegativePast'}[family.ending]:family.ending);return;
    }
    if(f==='passiveDesireNegativePast') {walk(w,'passive');walk(changed(w,correctSpellings(w,'passive')[0],'ichidan'),'taiNegativePast');return;}
    if(f==='negativePast') {walk(w,'negative');walk({...changed(w,correctSpellings(w,'negative')[0],'i'),domain:'adjective',auxiliary:undefined},'adjectivePast');return;}
    if(/^masu(Past|Negative|NegativePast)$/.test(f)) {join('masu',`compound.polite-${{masuPast:'past',masuNegative:'negative',masuNegativePast:'negative-past'}[f]}`);return;}
    if(f==='masenka') {join('masu','construction.masenka');return;}
    if(stemSuffixes[f]) {const middle=connective();add(middle,final,[`construction.${f}`],cls);return;}
    if(teSuffixes[f]) {join('te',`construction.${f}`);return;}
    if(post[f]) {join(post[f][0],`construction.${f}`);return;}
    if(short[f]) {join(short[f][0],f==='causativePassiveContracted'?'contraction.causative-passive':`construction.${f}`);return;}
    if(['nakute','nakerebaNaranai','nakutewaIkenai'].includes(f)) {
      walk(w,'negative');const negative=correctSpellings(w,'negative')[0];
      const next={...changed(w,negative,'i'),domain:'adjective',auxiliary:undefined};
      const af=f==='nakerebaNaranai'?'adjectiveBa':'adjectiveTe';walk(next,af);
      if(f!=='nakute')add(correctSpellings(next,af)[0],final,[`construction.${f}`],cls);return;
    }
    if(['zu','zuni'].includes(f)) {
      if(before.endsWith('する')) {unit([`construction.${f}`]);return;}
      const middle=correctSpellings(w,'negative')[0].slice(0,-2);
      if(cls==='irregular')add(before,middle,['suffix.negative'],cls);else connective('a');
      add(middle,final,[`construction.${f}`],cls);return;
    }
    if(f==='prohibitive'){unit(['suffix.prohibitive']);return;}
    if(w.auxiliary==='aru'&&f==='negative'){unit(['exception.aru-negative']);return;}
    if(cls==='irregular'&&!['masu','nasai'].includes(f)){unit([`suffix.${f}`]);return;}
    if(cls==='godan'&&['past','te'].includes(f)) {
      const end=before.at(-1), sound=w.auxiliary==='iku'||['行く','いく'].includes(before)||'うつる'.includes(end)?'onbin.sokuon':'むぶぬ'.includes(end)?'onbin.hatsuon':'くぐ'.includes(end)?'onbin.i':'stem.godan.shi-connective';
      add(before,final.slice(0,-1),[sound],cls);add(final.slice(0,-1),final,[`suffix.${f}`,...('むぶぬぐ'.includes(end)?['onbin.voicing']:[])],cls);return;
    }
    if(!['negative','past','te','masu','nasai','passive','potential','imperative','volitional','ba','causative','causativePassive'].includes(f))throw new Error(`Missing verb policy ${f}`);
    const row=['negative','passive','causative','causativePassive'].includes(f)?'a':['potential','imperative','ba'].includes(f)?'e':f==='volitional'?'o':'i';
    const middle=connective(row);if(middle!==final)add(middle,final,[`suffix.${f}`],cls);
  };
  walk(word,form);return stages;
}

// A second check for every accepted branch, including branches that differ
// from the canonical reference path. Each KC denotes a concrete operation.
export function referenceNodeOutputs(n, writing='reading') {
  const input=n.input[writing],cls=n.item.class,rule=n.ruleKcIds[0],root=input.slice(0,-1);
  if(rule==='stem.ichidan.drop-ru')return cls==='ichidan'&&input.endsWith('る')?[root]:[];
  if(/^stem.godan.[aieo]$/.test(rule))return cls==='godan'&&rows[input.at(-1)]?[root+rows[input.at(-1)][rule.at(-1)]]:[];
  if(rule==='stem.godan.shi-connective')return cls==='godan'&&input.endsWith('す')?[root+'し']:[];
  if(['onbin.sokuon','onbin.hatsuon','onbin.i'].includes(rule)) {
    const last=n.input.reading.at(-1),iku=n.item.tailClass==='iku'||['行く','いく'].includes(n.input.surface);
    const expect=iku||'うつる'.includes(last)?'onbin.sokuon':'むぶぬ'.includes(last)?'onbin.hatsuon':'くぐ'.includes(last)?'onbin.i':null;
    return cls==='godan'&&rule===expect?[root+{ 'onbin.sokuon':'っ','onbin.hatsuon':'ん','onbin.i':'い'}[rule]]:[];
  }
  if(rule==='stem.irregular.connective')return cls==='irregular'?correctSpellings({...n.item,surface:input},'masu').map(s=>s.slice(0,-2)):[];
  if(rule==='adj.exception.ii-yo')return input.endsWith('いい')?[input.slice(0,-2)+'よい']:[];
  if(rule==='exception.aru-negative')return input.endsWith('ある')?[input.slice(0,-2)+'ない']:[];
  if(rule==='adj.stem.i-ku')return cls==='i'&&input.endsWith('い')?[root+'く']:[];
  if(rule.startsWith('adj.suffix.')) {
    const suffix=rule.slice(11);
    if(suffix==='i-past')return cls==='i'&&input.endsWith('い')?[root+'かった']:[];
    if(suffix==='i-ba')return cls==='i'&&input.endsWith('い')?[root+'ければ']:[];
    if(suffix==='i-negative')return cls==='i'&&input.endsWith('く')?[input+'ない']:[];
    if(suffix==='i-te')return cls==='i'&&input.endsWith('く')?[input+'て']:[];
    const na={'na-attributive':['な'],'na-predicative':['だ'],'na-negative':['ではない','じゃない','でない'],'na-past':['だった'],'na-te':['で'],'na-adverb':['に'],'na-conditional':['なら','ならば','であれば']};
    return cls==='na'&&na[suffix]?na[suffix].map(s=>input+s):[];
  }
  if(rule.startsWith('suffix.')) {
    const form=rule.slice(7);
    if(n.operation==='irregular') {
      if(n.label==='ず的词干')return correctSpellings({...n.item,surface:input},'negative').map(s=>s.slice(0,-2));
      return correctSpellings({...n.item,surface:input},form);
    }
    if(['past','te'].includes(form)&&n.operation==='verb-terminal')return [input+(form==='past'?(n.ruleKcIds.includes('onbin.voicing')?'だ':'た'):(n.ruleKcIds.includes('onbin.voicing')?'で':'て'))];
    const suffixes={negative:['ない'],past:['た'],te:['て'],masu:['ます'],nasai:['なさい','な'],potential:cls==='ichidan'?['られる','れる']:['る'],passive:[cls==='ichidan'?'られる':'れる'],causative:cls==='ichidan'?['させる','さす']:['せる','す'],causativePassive:cls==='ichidan'?['させられる']:['せられる',...(!input.endsWith('さ')?['される']:[])],imperative:cls==='ichidan'?['ろ','よ']:[],volitional:[cls==='ichidan'?'よう':'う'],ba:[cls==='ichidan'?'れば':'ば'],prohibitive:['な']};
    return (suffixes[form]??[]).map(s=>input+s);
  }
  if(rule.startsWith('compound.polite-'))return input.endsWith('ます')?[input.slice(0,-2)+{'compound.polite-past':'ました','compound.polite-negative':'ません','compound.polite-negative-past':'ませんでした'}[rule]]:[];
  if(rule==='contraction.causative-passive')return [input.replace(/せられる$/,'される')];
  if(rule.startsWith('construction.')) {
    const form=rule.slice(13);
    if(stemSuffixes[form])return [input+stemSuffixes[form]];
    if(teSuffixes[form]) {
      const base=input+teSuffixes[form];
      const extras={teiru:[input+'る'],teiku:[input+'く'],teshimau:[input.slice(0,-1)+(input.endsWith('で')?'じゃう':'ちゃう')],teoku:[input.slice(0,-1)+(input.endsWith('で')?'どく':'とく')],teoru:[input.slice(0,-1)+(input.endsWith('で')?'どる':'とる')]};
      return [base,...(extras[form]??[])];
    }
    if(post[form])return [input+post[form][1]];
    if(short[form]) {
      const suffix={chau:'しまう',toku:'おく',toru:'おる'}[form],base=cut(input,suffix),voiced=base.endsWith('で');
      return [base.slice(0,-1)+{chau:voiced?'じゃう':'ちゃう',toku:voiced?'どく':'とく',toru:voiced?'どる':'とる'}[form]];
    }
    if(form==='masenka')return input.endsWith('ます')?[input.slice(0,-2)+'ませんか']:[];
    if(form==='nakerebaNaranai')return [input+'ならない'];
    if(form==='nakutewaIkenai')return [input+'はいけない'];
    if(['zu','zuni'].includes(form))return [input.endsWith('する')?input.slice(0,-2)+(form==='zu'?'せず':'せずに'):input+(form==='zu'?'ず':'ずに')];
  }
  throw new Error(`Missing node policy ${rule}`);
}

export function oracleFixedPrefix(n, writing='reading') {
  const outputs=referenceNodeOutputs(n,writing),input=n.input[writing];
  // Unchanged lexical material must survive independently of the rule tested.
  return outputs.reduce((fixed,output)=>common(fixed,output),input);
}
export function referenceLabelMatches(n,label) {
  if(typeof label!=='string'||!label.length)return false;
  const id=n.ruleKcIds[0];
  if(n.operation==='contract')return /缩约/.test(label);
  const required={
    'stem.godan.a':/ア段/,'stem.godan.i':/イ段/,'stem.godan.e':/エ段/,'stem.godan.o':/オ段/,
    'stem.ichidan.drop-ru':/る/,'stem.irregular.connective':/连用/,'stem.godan.shi-connective':/し/,
    'onbin.sokuon':/促音/,'onbin.hatsuon':/撥音/,'onbin.i':/イ音便/,
    'adj.stem.i-ku':/く/,'adj.exception.ii-yo':/よ/,'exception.aru-negative':/否定/,
    'adj.suffix.i-past':/过去/,'adj.suffix.i-negative':/否定/,'adj.suffix.i-te':/て形/,'adj.suffix.i-ba':/条件/,
    'adj.suffix.na-attributive':/连体/,'adj.suffix.na-predicative':/终止/,'adj.suffix.na-negative':/否定/,'adj.suffix.na-past':/过去/,'adj.suffix.na-te':/て形/,'adj.suffix.na-adverb':/副词/,'adj.suffix.na-conditional':/条件/,
    'suffix.negative':/否定|ず/,'suffix.past':/过去/,'suffix.te':/て形/,'suffix.masu':/ます/,'suffix.nasai':/なさい/,'suffix.potential':/可能/,'suffix.passive':/受身/,'suffix.causative':/使役/,'suffix.causativePassive':/使役受身/,'suffix.imperative':/命令/,'suffix.volitional':/意向/,'suffix.ba':/ば/,'suffix.prohibitive':/禁止/,
    'compound.polite-past':/过去/,'compound.polite-negative':/否定/,'compound.polite-negative-past':/否定过去/,
  }[id];
  return required?required.test(label):/接续|变化/.test(label);
}
export function auditPlan(item,form,plan) {
  const problems=[],report=(code,detail)=>problems.push({code,detail});
  const reference=referenceStages(item,form);
  const canonical=plan.nodes.map(n=>({before:n.input.surface,after:n.output.surface,ids:n.ruleKcIds,class:n.item.class}));
  if(JSON.stringify(reference)!==JSON.stringify(canonical))report('wrong-plan-operations','基本操作的顺序、目标、类别或知识点与独立课程约定不同');
  for(const writing of ['surface','reading']) {
    const expected=correctSpellings({...item,surface:item[writing]},form),actual=uniq(plan.paths.map(p=>p.nodes.at(-1).output[writing]));
    if(JSON.stringify([...expected].sort())!==JSON.stringify(actual.sort()))report('wrong-plan-variants',`${writing} 缺少或添加了完整合法形式`);
    for(const path of plan.paths)for(const [i,n] of path.nodes.entries()) {
      if(!referenceLabelMatches(n,n.label))report('wrong-node-label','显示目标与所测规则不一致');
      if(n.input[writing] !== (i?path.nodes[i-1].output[writing]:item[writing]))report('broken-plan-chain','相邻操作的输入、输出不连续');
      if(!referenceNodeOutputs(n,writing).includes(n.output[writing]))report('wrong-node-operation',`${n.ruleKcIds.join(',')} 无法产生该词形`);
    }
  }
  return problems;
}
