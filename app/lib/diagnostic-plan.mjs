import { CHAIN_FORM_SPECS, chainOutputClass } from './multi-step-forms.mjs';
import { acceptedConjugations } from './conjugation.mjs';
import { acceptedAdjectiveConjugations } from './adjective-conjugation.mjs';
import { COMPOUND_FORM_SPECS } from './compound-forms.mjs';

const unique = xs => [...new Set(xs)];
const rows = { a: {う:'わ',く:'か',ぐ:'が',す:'さ',つ:'た',ぬ:'な',ぶ:'ば',む:'ま',る:'ら'},
  i: {う:'い',く:'き',ぐ:'ぎ',す:'し',つ:'ち',ぬ:'に',ぶ:'び',む:'み',る:'り'},
  e: {う:'え',く:'け',ぐ:'げ',す:'せ',つ:'て',ぬ:'ね',ぶ:'べ',む:'め',る:'れ'},
  o: {う:'お',く:'こ',ぐ:'ご',す:'そ',つ:'と',ぬ:'の',ぶ:'ぼ',む:'も',る:'ろ'} };
const rowNames = {a:'ア段词干',i:'イ段词干',e:'エ段词干',o:'オ段词干'};
const primitives = ['negative','past','te','masu','nasai','passive','potential','imperative','volitional','ba','causative','causativePassive','prohibitive'];
const stemAppends = ['tai','nagara','tsutsu','sugiru','tagaru'];
const teAppends = ['teageru','temorau','tekureru','tekudasai','teiru','teru','tearu','teoru','tehoshii','temo','tewa','temoIi','temiru','teiku','teku','tekuru','teshimau','teoku'];
const contractions = {chau:'teshimau',toku:'teoku',toru:'teoru',causativePassiveContracted:'causativePassive'};
const appendBases = {naide:'negative',naideKudasai:'naide',tara:'past',tari:'past',tatte:'past',nakutemoIi:'nakute',youtosuru:'volitional',naitoIkenai:'negative'};
const adjectiveForms = ['adjectiveNegative','adjectivePast','adjectiveNegativePast','adjectiveTe','adjectiveAdverb','adjectiveBa','adjectiveAttributive','adjectivePredicative','adjectiveNaNegative','adjectiveNaPast','adjectiveNaNegativePast','adjectiveNaTe'];
const voiceForms = Object.fromEntries(['passive','potential','causative','causativePassive'].flatMap(form =>
  ['Past','Negative','NegativePast'].map(ending => [form+ending,{form,ending:ending[0].toLowerCase()+ending.slice(1),outputType:'verb',outputClass:'ichidan'}])));
export const DIAGNOSTIC_FORMS = unique([...primitives,...stemAppends,...teAppends,...Object.keys(contractions),...Object.keys(appendBases),...adjectiveForms,
  ...Object.keys(CHAIN_FORM_SPECS),...Object.keys(COMPOUND_FORM_SPECS),...Object.keys(voiceForms),'negativePast','masuPast','masuNegative','masuNegativePast','masenka','nakute','zu','zuni','nakerebaNaranai','nakutewaIkenai','passiveDesireNegativePast']);
const formSet = new Set(DIAGNOSTIC_FORMS);
export const diagnosticFamily = form => COMPOUND_FORM_SPECS[form] ?? voiceForms[form] ?? null;
const className = cls => ({godan:'五段动词',ichidan:'一段动词',irregular:'不规则动词',i:'い形容词',na:'な形容词'})[cls];
const constructionNames = {tai:'たい',tagaru:'たがる',sugiru:'すぎる',nagara:'ながら',tsutsu:'つつ',teageru:'てあげる',temorau:'てもらう',tekureru:'てくれる',tekudasai:'てください',teiru:'ている',teru:'てる',tearu:'てある',teoru:'ておる',tehoshii:'てほしい',temo:'ても',tewa:'ては',temoIi:'てもいい',temiru:'てみる',teiku:'ていく',teku:'てく',tekuru:'てくる',teshimau:'てしまう',teoku:'ておく',naide:'ないで',naideKudasai:'ないでください',tara:'たら',tari:'たり',tatte:'たって',nakutemoIi:'なくてもいい',youtosuru:'ようとする',naitoIkenai:'ないといけない'};
const endingName = form => ({negative:'否定形',past:'过去形',te:'て形',masu:'ます形',nasai:'なさい形',passive:'受身形',potential:'可能形',imperative:'命令形',volitional:'意向形',ba:'ば形',causative:'使役形',causativePassive:'使役受身形'})[form] ?? form;
const pair = item => ({surface:item.surface,reading:item.reading ?? item.surface});
const mapPair = (p, fn) => ({surface:fn(p.surface),reading:fn(p.reading)});

// This registry defines correct transformations, not wrong-answer templates.
// Each branch retains its actual intermediate class and accepted spelling.
function answers(item, form) {
  if (item.domain === 'adjective') return acceptedAdjectiveConjugations(item, form);
  if (item.tailClass) {
    const plain = {aru:'ある',iku:'いく',kuru:'くる',irregular:'する'}[item.tailClass];
    const text = item.surface;
    if (!plain || !text.endsWith(plain)) throw new Error(`Invalid supplied auxiliary: ${text}/${item.tailClass}`);
    const tail = {aru:{negative:'ない',past:'あった',negativePast:'なかった'},iku:{negative:'いかない',past:'いった',te:'いって',negativePast:'いかなかった'},kuru:{negative:'こない',past:'きた',te:'きて',negativePast:'こなかった'}}[item.tailClass]?.[form];
    if (tail) return [text.slice(0,-plain.length)+tail];
    const native = item.tailClass === 'irregular' ? 'する' : plain;
    return acceptedConjugations(native, item.class, form).map(value => text.slice(0,-plain.length)+value);
  }
  return acceptedConjugations(item.surface, item.class, form);
}
function answerPairs(item, form) {
  const surface = answers(item,form), reading = answers({...item,surface:item.reading ?? item.surface},form);
  return surface.map((value,i) => ({surface:value,reading:reading[i] ?? reading[0]}));
}
function node(item, input, output, rules, label, operation, extra={}) {
  if(operation==='irregular') {
    extra={...extra,fixed:Object.fromEntries(['surface','reading'].map(w=>{let i=0;while(input[w][i]&&input[w][i]===output[w][i])i++;return [w,input[w].slice(0,i)];}))};
  }
  return {input,output,item:{...item,...input},ruleKcIds:unique(rules),label,operation,...extra};
}
function lexicalPrefix(item) {
  const cut = item.domain === 'adjective' ? item.class === 'na' ? 0 : item.iiFamily ? 2 : 1
    : item.class === 'irregular' ? 2 : 1;
  return cut ? mapPair(pair(item),s => s.slice(0,-cut)) : pair(item);
}
function stem(item, row='i') {
  const input=pair(item);
  if(item.class==='ichidan')return node(item,input,mapPair(input,s=>s.slice(0,-1)),['stem.ichidan.drop-ru'],'去掉词尾る','drop',{fixed:mapPair(input,s=>s.slice(0,-1))});
  if(item.class==='godan') {
    const output=mapPair(input,s=>s.slice(0,-1)+rows[row][s.at(-1)]);
    const rules=[`stem.godan.${row}`];if(row==='a'&&item.reading?.endsWith('う'))rules.push('stem.godan.u-wa');
    return node(item,input,output,rules,rowNames[row],'row',{fixed:mapPair(input,s=>s.slice(0,-1)),row});
  }
  const output=mapPair(input,s=>acceptedConjugations(s,'irregular','masu')[0].slice(0,-2));
  return node(item,input,output,['stem.irregular.connective'],'连用词干','irregular',{fixed:lexicalPrefix(item)});
}
function terminal(item,input,output,ids,label,operation='append') {
  return node(item,input,output,ids,label,operation,{fixed:input});
}
function primitivePaths(item, form) {
  const input=pair(item), targets=answerPairs(item,form);
  if(form==='prohibitive')return targets.map(output=>({state:{...item,...output},nodes:[terminal(item,input,output,['suffix.prohibitive'],'禁止接续')]}));
  if(item.tailClass==='aru'&&form==='negative')return targets.map(output=>({state:{...item,...output},nodes:[node(item,input,output,['exception.aru-negative'],'ある的否定变化','replace',{fixed:mapPair(input,s=>s.slice(0,-2))})]}));
  if(item.class==='irregular'&&['masu','nasai'].includes(form)) {
    const first=stem(item);
    return targets.map(output=>({state:{...item,...output},nodes:[first,terminal(item,first.output,output,[`suffix.${form}`],endingName(form)+'接续')]}));
  }
  if(item.class==='irregular')return targets.map(output=>({state:{...item,...output},nodes:[node(item,input,output,[`suffix.${form}`],endingName(form),'irregular',{fixed:lexicalPrefix(item)})]}));
  if(item.class==='godan'&&['past','te'].includes(form)) {
    const ending=item.reading.at(-1), iku=item.tailClass==='iku'||['行く','いく'].includes(item.surface);
    const soundId=iku||'うつる'.includes(ending)?'onbin.sokuon':'むぶぬ'.includes(ending)?'onbin.hatsuon':'くぐ'.includes(ending)?'onbin.i':'stem.godan.shi-connective';
    return targets.map(output=>{
      const middle=mapPair(output,s=>s.slice(0,-1));
      const sound=node(item,input,middle,[soundId],soundId==='onbin.sokuon'?'促音便':soundId==='onbin.hatsuon'?'撥音便':soundId==='onbin.i'?'イ音便':'す→し','sound',{fixed:mapPair(input,s=>s.slice(0,-1))});
      const ids=[`suffix.${form}`,...('むぶぬぐ'.includes(ending)?['onbin.voicing']:[])];
      return {state:{...item,...output},nodes:[sound,terminal(item,middle,output,ids,endingName(form)+'接续','verb-terminal')]};
    });
  }
  const row=['negative','passive','causative','causativePassive'].includes(form)?'a':['potential','imperative','ba'].includes(form)?'e':form==='volitional'?'o':'i';
  const first=stem(item,row);
  return targets.map(output=>({state:{...item,...output},nodes:[first,...(output.surface===first.output.surface&&output.reading===first.output.reading?[]:[terminal(item,first.output,output,[`suffix.${form}`],endingName(form)+'接续')])]}));
}
function compose(paths, next) {return paths.flatMap(path=>next(path.state).map(tail=>({state:tail.state,nodes:[...path.nodes,...tail.nodes]})));}
function appendTo(item, baseForm, form, ids, label) {
  const outputs=answerPairs(item,form);
  return pathsFor(item,baseForm).flatMap(path=>outputs.map(output=>{
    const input=pair(path.state),plain=output.surface.startsWith(input.surface)&&output.reading.startsWith(input.reading);
    const next=plain?terminal(item,input,output,ids,label):node(item,input,output,ids,'接续的缩约形式','contract',{fixed:mapPair(input,s=>s.slice(0,-1))});
    return {state:{...item,...output},nodes:[...path.nodes,{...next,acceptedOutputs:outputs}]};
  }));
}
function adjectivePaths(item, form) {
  if(item.class==='i'&&item.iiFamily) {
    const output=mapPair(pair(item),s=>s.slice(0,-2)+'よい'),changed={...item,...output,iiFamily:false};
    const first=node(item,pair(item),output,['adj.exception.ii-yo'],'いいのよ系词干','replace',{fixed:mapPair(pair(item),s=>s.slice(0,-2))});
    return pathsFor(changed,form).map(path=>({...path,nodes:[first,...path.nodes]}));
  }
  if(['adjectiveNegativePast','adjectiveNaNegativePast'].includes(form)) {
    return compose(pathsFor(item,item.class==='i'?'adjectiveNegative':'adjectiveNaNegative'),state=>pathsFor({...state,domain:'adjective',class:'i',iiFamily:false},'adjectivePast'));
  }
  const input=pair(item),targets=answerPairs(item,form);
  if(item.class==='na') {
    const suffix={adjectiveAttributive:'na-attributive',adjectivePredicative:'na-predicative',adjectiveNaNegative:'na-negative',adjectiveNaPast:'na-past',adjectiveNaTe:'na-te',adjectiveBa:'na-conditional',adjectiveAdverb:'na-adverb'}[form];
    const label={adjectiveAttributive:'连体形',adjectivePredicative:'终止形',adjectiveNaNegative:'否定形',adjectiveNaPast:'过去形',adjectiveNaTe:'て形',adjectiveBa:'条件形',adjectiveAdverb:'副词形'}[form];
    return targets.map(output=>({state:{...item,...output},nodes:[terminal(item,input,output,[`adj.suffix.${suffix}`],`な形容词${label}`)]}));
  }
  if(['adjectiveNegative','adjectiveTe','adjectiveAdverb'].includes(form)) {
    const middle=mapPair(input,s=>s.slice(0,-1)+'く');
    const first=node(item,input,middle,['adj.stem.i-ku'],'く形词干','replace',{fixed:mapPair(input,s=>s.slice(0,-1))});
    return targets.map(output=>({state:{...item,...output},nodes:[first,...(form==='adjectiveAdverb'?[]:[terminal(item,middle,output,[`adj.suffix.${form==='adjectiveNegative'?'i-negative':'i-te'}`],form==='adjectiveNegative'?'否定接续':'て形接续')])]}));
  }
  const id=form==='adjectivePast'?'adj.suffix.i-past':'adj.suffix.i-ba';
  return targets.map(output=>({state:{...item,...output},nodes:[node(item,input,output,[id],form==='adjectivePast'?'过去变化':'条件变化','replace',{fixed:mapPair(input,s=>s.slice(0,-1))})]}));
}
function pathsFor(item, form) {
  if(!formSet.has(form))throw new Error(`Missing diagnostic recipe: ${form}`);
  if(item.domain==='adjective')return adjectivePaths(item,form);
  const family=diagnosticFamily(form);
  if(family) return compose(pathsFor(item,family.form),state=>{
    const cls=family.outputType==='iAdjective'?'i':family.form==='causative'&&state.surface.endsWith('す')?'godan':['aru','iku'].includes(family.outputClass)?'godan':['kuru','irregular'].includes(family.outputClass)?'irregular':family.outputClass;
    const provided={...state,domain:cls==='i'?'adjective':'verb',class:cls,iiFamily:false,tailClass:['aru','iku','kuru','irregular'].includes(family.outputClass)?family.outputClass:undefined};
    const target=cls==='i'?{past:'adjectivePast',negative:'adjectiveNegative',negativePast:'adjectiveNegativePast'}[family.ending]:family.ending;
    // Spoken てく does not retain the supplied いく tail. It remains an
    // accepted whole variant, but cannot be used as the canonical いく probe.
    if(provided.tailClass==='iku'&&!provided.surface.endsWith('いく'))return [];
    return pathsFor(provided,target);
  });
  if(form==='negativePast')return compose(pathsFor(item,'negative'),state=>pathsFor({...state,domain:'adjective',class:'i',iiFamily:false,tailClass:undefined},'adjectivePast'));
  const chain=CHAIN_FORM_SPECS[form];
  if(chain)return compose(pathsFor(item,chain.base),state=>pathsFor({...state,domain:'verb',class:chainOutputClass(chain,state.surface)},chain.tail));
  if(form==='passiveDesireNegativePast')return compose(pathsFor(item,'passive'),state=>pathsFor({...state,class:'ichidan'},'taiNegativePast'));
  if(primitives.includes(form))return primitivePaths(item,form);
  if(stemAppends.includes(form)) {
    const first=stem(item);
    return answerPairs(item,form).map(output=>({state:{...item,...output},nodes:[first,terminal(item,first.output,output,[`construction.${form}`],`${({tai:'たい',tagaru:'たがる',sugiru:'すぎる',nagara:'ながら',tsutsu:'つつ'})[form]}接续`)]}));
  }
  if(teAppends.includes(form))return appendTo(item,'te',form,[`construction.${form}`],`${constructionNames[form]}的接续`);
  if(appendBases[form])return appendTo(item,appendBases[form],form,[`construction.${form}`],`${constructionNames[form]}的接续`);
  if(contractions[form])return pathsFor(item,contractions[form]).filter(path=>path.state.surface===answerPairs(item,contractions[form])[0].surface).flatMap(path=>answerPairs(item,form).map(output=>{
    const input=pair(path.state),fixed=Object.fromEntries(['surface','reading'].map(w=>{let i=0;while(input[w][i]&&input[w][i]===output[w][i])i++;return [w,input[w].slice(0,i)];}));
    return {state:{...item,...output},nodes:[...path.nodes,node(item,input,output,[form==='causativePassiveContracted'?'contraction.causative-passive':`construction.${form}`],'缩约变化','contract',{fixed})]};
  }));
  if(/^masu(Past|Negative|NegativePast)$/.test(form)||form==='masenka')return pathsFor(item,'masu').flatMap(path=>answerPairs(item,form).map(output=>({state:{...item,...output},nodes:[...path.nodes,node(item,pair(path.state),output,[form==='masenka'?'construction.masenka':`compound.polite-${form==='masuPast'?'past':form==='masuNegative'?'negative':'negative-past'}`],form==='masenka'?'ませんか的接续':`礼貌表达的${{masuPast:'过去',masuNegative:'否定',masuNegativePast:'否定过去'}[form]}变化`,'replace',{fixed:mapPair(pair(path.state),s=>s.slice(0,-2))})]})));
  if(form==='nakute')return compose(pathsFor(item,'negative'),state=>pathsFor({...state,domain:'adjective',class:'i',iiFamily:false,tailClass:undefined},'adjectiveTe'));
  if(['nakerebaNaranai','nakutewaIkenai'].includes(form)) {
    const base=compose(pathsFor(item,'negative'),state=>pathsFor({...state,domain:'adjective',class:'i',iiFamily:false,tailClass:undefined},form==='nakerebaNaranai'?'adjectiveBa':'adjectiveTe'));
    return base.flatMap(path=>answerPairs(item,form).map(output=>({state:{...item,...output},nodes:[...path.nodes,terminal(item,pair(path.state),output,[`construction.${form}`],'必须表达接续')]})));
  }
  if(['zu','zuni'].includes(form)) {
    // する→せ is special to ず, not evidence about the ordinary しない rule.
    if(item.surface.endsWith('する'))return answerPairs(item,form).map(output=>({state:{...item,...output},nodes:[node(item,pair(item),output,[`construction.${form}`],'する的ず接续','irregular',{fixed:lexicalPrefix(item)})]}));
    const input=pair(item), middle=mapPair(input,s=>s.endsWith('する')?s.slice(0,-2)+'せ':answers({...item,surface:s},'negative')[0].slice(0,-2));
    const first=item.class==='irregular'?node(item,input,middle,['suffix.negative'],'ず的词干','irregular',{fixed:lexicalPrefix(item)}):stem(item,'a');
    return answerPairs(item,form).map(output=>({state:{...item,...output},nodes:[first,terminal(item,middle,output,[`construction.${form}`],'ず接续')]}));
  }
  throw new Error(`Unimplemented diagnostic recipe: ${form}`);
}

export function buildDiagnosticPlan(item, form) {
  if(!form)return {form,paths:[],nodes:[],classification:true};
  const paths=pathsFor({...item,reading:item.reading??item.surface},form);
  if(!paths.length||paths.some(path=>!path.nodes.length))throw new Error(`Empty diagnostic plan: ${item.surface}/${form}`);
  const branches=paths.map((path,branch)=>({...path,nodes:path.nodes.map((n,index)=>({...n,id:`${form}:${item.class}:${item.surface}:${branch}:${index}`}))}));
  return {form,paths:branches,nodes:branches[0].nodes,acceptedVariants:answers(item,form),readingVariants:answers({...item,surface:item.reading??item.surface},form)};
}

// Adapt a supplied-base exercise to the very same native recipe used by whole
// questions. No list of Past-only forms controls whether a probe can exist.
export function planForContext(item, form, step) {
  if(!step)return buildDiagnosticPlan(item,form);
  if(step.kind==='atomic')return {form,paths:[],nodes:[],atomic:true};
  if(step.kind==='classification')return {form,paths:[],nodes:[],classification:true};
  const family=diagnosticFamily(step.form);
  let native=step.form,provided=step.analysisItem??item;
  if(step.continuation) {
    if(family) {
      const cls=family.outputType==='iAdjective'?'i':['aru','iku'].includes(family.outputClass)?'godan':['kuru','irregular'].includes(family.outputClass)?'irregular':family.outputClass;
      provided={...provided,...pair(step),domain:cls==='i'?'adjective':'verb',class:cls,iiFamily:false,tailClass:['aru','iku','kuru','irregular'].includes(family.outputClass)?family.outputClass:undefined};
      native=cls==='i'?{past:'adjectivePast',negative:'adjectiveNegative',negativePast:'adjectiveNegativePast'}[family.ending]:family.ending;
    }else if(['negativePast','adjectiveNegativePast','adjectiveNaNegativePast','taiNegativePast'].includes(step.form)&&step.reading.endsWith('ない')) {
      provided={...provided,...pair(step),domain:'adjective',class:'i',iiFamily:false};native='adjectivePast';
    }else if(step.providedClass)provided={...provided,...pair(step),class:step.providedClass};
  }
  return buildDiagnosticPlan(provided,native);
}

export function atomicSteps(plan, form, scope, confirmed=[], inputAnswer='', normalize=value=>value) {
  const used=new Set(confirmed),allowed=new Set(scope);
  const actual=normalize(inputAnswer);
  // A uniquely completed intermediate determines the earliest remaining node.
  const stops=plan.nodes.flatMap((n,i)=>[n.output.surface,n.output.reading].some(value=>normalize(value)===actual)?[i]:[]);
  const start=stops.length===1?stops[0]+1:0;
  const result=[];
  for(const n of plan.nodes.slice(start)) {
    const kcIds=n.ruleKcIds.filter(id=>allowed.has(id)&&!used.has(id));
    if(!kcIds.length)continue;
    kcIds.forEach(id=>used.add(id));
    const variants=plan.paths.flatMap(p=>p.nodes).filter(other=>JSON.stringify(other.ruleKcIds)===JSON.stringify(n.ruleKcIds)&&other.input.surface===n.input.surface&&other.input.reading===n.input.reading);
    const outputs=variants.flatMap(v=>v.acceptedOutputs??[v.output]);
    const fixed=Object.fromEntries(['surface','reading'].map(w=>[w,outputs.reduce((prefix,v)=>{let i=0;while(prefix[i]&&prefix[i]===v[w][i])i++;return prefix.slice(0,i);},n.input[w])]));
    result.push({kind:'atomic',nodeId:n.id,atomic:{...n,fixed},form,surface:n.input.surface,reading:n.input.reading,
      answers:unique(outputs.map(v=>v.surface)),readings:unique(outputs.map(v=>v.reading)),kcIds,focusId:kcIds[0],continuation:true,analysisItem:n.item,
      laterOutputs: unique(plan.paths.flatMap(path => {
        const at = path.nodes.findIndex(other => other.id === n.id && other.input.reading === n.input.reading);
        return at < 0 ? [] : path.nodes.slice(at + 1).flatMap(other => (other.acceptedOutputs ?? [other.output]).flatMap(output => [output.surface, output.reading])).filter(value => [n.output.surface, n.output.reading].some(current => value.length > current.length && value.startsWith(current)));
      })),
      targetLabel:n.label,note:`已提供正确输入和词类（${className(n.item.class)}），本步只检查${n.label}。`});
  }
  return result;
}

export function diagnoseAtomicStep(step, answer, normalize=value=>value) {
  const n=step.atomic,actual=normalize(answer),candidates=[];
  const add=id=>{if(id&&step.kcIds.includes(id))candidates.push(id);};
  for(const writing of ['surface','reading']) {
    const fixed=normalize(n.fixed?.[writing]??n.input[writing]);
    if(!fixed||!actual.startsWith(fixed))continue;
    const tail=actual.slice(fixed.length);
    if(tail.length>16||!/^[\p{Script=Hiragana}\p{Script=Katakana}ー]*$/u.test(tail))continue;
    const expected=normalize(n.output[writing]).slice(fixed.length);
    if(tail===expected)continue;
    if(n.operation==='row'&&n.row==='a'&&tail==='あ'&&step.kcIds.includes('stem.godan.u-wa'))add('stem.godan.u-wa');
    else if(n.operation==='verb-terminal'&&step.kcIds.includes('onbin.voicing')&&tail===({'だ':'た','で':'て'})[expected])add('onbin.voicing');
    else add(step.kcIds.find(id=>id!=='onbin.voicing'&&id!=='stem.godan.u-wa'));
  }
  return unique(candidates).length===1?{kcId:candidates[0],confirmedKcIds:[],message:`给定的前部已保留，本步的${n.label}有误。`}:null;
}
