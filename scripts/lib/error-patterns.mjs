import { createHash } from 'node:crypto';
import { acceptedConjugations } from '../../app/lib/conjugation.mjs';
import { acceptedAdjectiveConjugations } from '../../app/lib/adjective-conjugation.mjs';
import { deriveUnified, unifiedDiagnosticSteps, unifiedStepDiagnosticSteps } from '../../app/lib/unified-knowledge.mjs';
import { COMPOUND_FORM_SPECS } from '../../app/lib/compound-forms.mjs';
import { atomicSteps, planForContext } from '../../app/lib/diagnostic-plan.mjs';
import { COMMON_ERROR_PATTERNS, commonLexicalExpectation, generateCommonErrorCases, suppliedNegativeIntermediateCases } from './common-error-patterns.mjs';
import { generateProbeRoutingCases } from './probe-routing-cases.mjs';

// Independent test policy. Never import the diagnoser or its candidate lists.
// Conjugators supply valid forms; explicit transformations supply wrong inputs.
export const PATTERNS = [
  ['valid', '正确答案与接受变体', 'contract'],
  ['normalized', '空白、标点与片假名归一化', 'contract'],
  ['lexical-substitution', '不变词汇部分的单字替换', 'contract'],
  ['noise', '无意义输入', 'contract'],
  ['multiple-errors', '词汇和词尾同时损坏', 'contract'],
  ['ku-omission', 'く形后漏接ない／て', 'contract'],
  ['adjective-form-switch', 'い形容词基础形式混淆', 'contract'],
  ['i-ending-retained', '保留原形い直接添加完整接续', 'contract'],
  ['i-bare-ending', 'い形容词直接添加简化词尾', 'contract'],
  ['i-affix-guard', '词根、例外与多阶段词尾混用保护', 'contract'],
  ['na-past-voicing', 'な形容词过去接续内部清浊音错误', 'contract'],
  ['na-past-voicing-guard', 'な形容词过去接续的词根与适用范围保护', 'contract'],
  ['na-suffix-span-omission', 'な形容词接续任意连续片段遗漏', 'mixed'],
  ['na-suffix-span-guard', 'な形容词接续遗漏的词根与多错保护', 'contract'],
  ['negative-intermediate', '否定过去停在正确否定形', 'contract'],
  ['ii-regularization', 'いい例外误套常规词干', 'contract'],
  ['sound-omission', '动词过去／て形漏音便', 'contract'],
  ['voicing-omission', '动词音便后漏浊化', 'contract'],
  ['compound-ending-switch', '复合表达末尾混淆：规则与应用待区分', 'contract'],
  ['blended-rules', '动词过去词干与たい过去词尾混用', 'contract'],
  ['passive-stage-mixed', '受身构造错行与一段接续混用后正确继续变化', 'contract'],
  ['passive-stage-guard', '受身阶段定位的词根与后续多错保护', 'contract'],
  ['passive-stage-probe', '已提供受身构造条件后的词干与接续单独判分', 'contract'],
  ['continuation-classification', '派生词类别的诊断性选择不计分', 'contract'],
  ['priority-stage', '原题精确匹配后直接检查派生词类与过去变化', 'contract'],
  ['priority-guard', '前部损坏或其他合法表达保留完整检查', 'contract'],
  ['priority-form-switch', '完整同表达后续形式混淆只检查尚未确认的尾部', 'contract'],
  ['priority-form-switch-guard', '不同表达或前部损坏不跳过表达构成', 'contract'],
  ['step-valid', '拆步正确答案与变体', 'contract'],
  ['step-noise', '拆步未知错误不扣分', 'contract'],
  ['step-negative-unchanged', '已提供否定形后仍漏过去', 'contract'],
  ['partial-step-valid', '已完成中间形式后的拆步正确答案', 'contract'],
  ['partial-step-noise', '已完成中间形式后的拆步未知错误', 'contract'],
  ['partial-step-unchanged', '已提供中间形式后仍停在原处', 'mixed'],
  ['operation-stop', '停在其他完整中间步骤', 'explore'],
  ['nested-operation-stop', '完成否定接续但漏最后的表达', 'contract'],
  ['lexical-deletion', '不变词汇部分漏字／漏长音', 'explore'],
  ['other-form-switch', '其他同词不同形式混淆', 'explore'],
  ['wrong-class', '套用其他词类活用', 'explore'],
  ['ending-deletion', '单独漏写词尾字符', 'explore'],
].map(([id, label, level]) => ({ id, label, level })).concat(COMMON_ERROR_PATTERNS);
const normalize = value => value.normalize('NFKC').replace(/[ァ-ヶヽヾ]/g,char=>String.fromCharCode(char.charCodeAt(0)-0x60)).replace(/[\s。．.！!？?]/g,'');
const katakana = value => value.replace(/[ぁ-ゖゝゞ]/g,char=>String.fromCharCode(char.charCodeAt(0)+0x60));
const iForms = { adjectiveNegative:'adj.suffix.i-negative', adjectivePast:'adj.suffix.i-past', adjectiveTe:'adj.suffix.i-te', adjectiveBa:'adj.suffix.i-ba', adjectiveAdverb:'adj.suffix.i-adverb' };
const negativeBases = { adjectiveNegativePast:'adjectiveNegative', adjectiveNaNegativePast:'adjectiveNaNegative' };
const verbSimple = ['negative','past','te','masu','potential','passive','volitional','ba','imperative'];
const naSimple = ['adjectiveAttributive','adjectivePredicative','adjectiveNaNegative','adjectiveNaPast','adjectiveNaTe','adjectiveBa','adjectiveAdverb'];
const naFormKcs = { adjectiveAttributive:'adj.suffix.na-attributive', adjectivePredicative:'adj.suffix.na-predicative', adjectiveNaNegative:'adj.suffix.na-negative', adjectiveNaPast:'adj.suffix.na-past', adjectiveNaTe:'adj.suffix.na-te', adjectiveBa:'adj.suffix.na-conditional', adjectiveAdverb:'adj.suffix.na-adverb' };
const readings = item => ({...item,surface:item.reading,...(item.domain==='verb'?{lexicalSurface:item.surface}:{})});
const answersFor = (item, form) => item.domain === 'verb' ? acceptedConjugations(item.surface,item.class,form) : acceptedAdjectiveConjugations(item,form);
const exact = (failed, confirmed = []) => ({ kind:'incorrect', failed, confirmed, steps:0 });
const unknown = { kind:'incorrect', failed:null, confirmed:[] };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,20);
const passiveStageRows={
  う:['わ','い','う','え','お'],く:['か','き','く','け','こ'],ぐ:['が','ぎ','ぐ','げ','ご'],
  す:['さ','し','す','せ','そ'],つ:['た','ち','つ','て','と'],ぬ:['な','に','ぬ','ね','の'],
  ぶ:['ば','び','ぶ','べ','ぼ'],む:['ま','み','む','め','も'],る:['ら','り','る','れ','ろ'],
};
const passiveStageTargets={passive:null,passivePast:'past',passiveNegative:'negative',passiveNegativePast:'negativePast',passiveDesireNegativePast:'taiNegativePast'};
const passiveStageContract={form:'passive',label:'受身形构造',candidateKcIds:['stem.godan.a','suffix.passive']};
function passiveStageCases(word,form) {
  if(word.domain!=='verb'||word.class!=='godan'||!(form in passiveStageTargets))return [];
  const rows=passiveStageRows[word.surface.at(-1)],root=word.surface.slice(0,-1),cases=[];
  for(const row of rows.slice(1)) {
    // Two errors belong to one construction stage: the original verb used the
    // wrong row AND an ichidan passive ending. Every following change is a
    // correct continuation of that malformed base, generated independently.
    const base=root+row+'られる';
    const input=form==='passive'?base:answersFor({domain:'verb',surface:base,reading:base,class:'ichidan'},passiveStageTargets[form])[0];
    const steps=form==='passive'?2:form==='passiveDesireNegativePast'?4:3;
    const probes=[{kind:'stem',form:'passive'},{kind:'attachment',form:'passive'}];
    if(form==='passiveDesireNegativePast')probes.push({form:'tai'},{form:'taiNegativePast'});
    cases.push({pattern:'passive-stage-mixed',input,expected:{...unknown,stage:passiveStageContract,steps,probes}});
    const wrongRoot=lexicalMutation(word,input);
    if(wrongRoot)cases.push({pattern:'passive-stage-guard',input:wrongRoot,expected:{...unknown,stage:null}});
    const wrongTail=input.slice(0,-1)+(input.endsWith('た')?'だ':input.endsWith('い')?'た':'ろ');
    cases.push({pattern:'passive-stage-guard',input:wrongTail,expected:{...unknown,stage:null}});
  }
  return cases;
}
// Semantic test policy, intentionally separate from deriveUnified.operations.
// Each row states the prerequisite expression and the still-missing rule(s).
const stopPolicies = {
  masu:['connective',['suffix.masu']], nasai:['connective',['suffix.nasai']],
  ...Object.fromEntries(['tai','nagara','tsutsu','sugiru','tagaru'].map(form=>[form,['connective',[`construction.${form}`]]])),
  ...Object.fromEntries(['teageru','temorau','tekureru','tekudasai','teiru','tearu','teoru','tehoshii','temo','tewa','temiru','teiku','tekuru','teshimau','teoku'].map(form=>[form,['te',[`construction.${form}`]]])),
  // These are individually taught expression rules in the current KC model;
  // toru/chau/toku additionally require their full-expression construction.
  teru:['te',['construction.teru']], toru:['te',['construction.teoru','construction.toru']],
  chau:['te',['construction.teshimau','construction.chau']], toku:['te',['construction.teoku','construction.toku']], teku:['te',['construction.teku']],
  temoIi:['te',['construction.temoIi']],
  naide:['negative',['construction.naide']], naideKudasai:['negative',['construction.naide','construction.naideKudasai']],
  nakute:['negative',['adj.stem.i-ku','adj.suffix.i-te','construction.nakute']],
  nakutemoIi:['negative',['adj.stem.i-ku','adj.suffix.i-te','construction.nakute','construction.nakutemoIi']],
  nakerebaNaranai:['negative',['adj.suffix.i-ba','construction.nakerebaNaranai']],
  nakutewaIkenai:['negative',['adj.stem.i-ku','adj.suffix.i-te','construction.nakutewaIkenai']],
  naitoIkenai:['negative',['construction.naitoIkenai']],
  tara:['past',['construction.tara']], tari:['past',['construction.tari']], tatte:['past',['construction.tatte']],
  masenka:['masu',['construction.masenka']], youtosuru:['volitional',['construction.youtosuru']],
};
function baseAnswers(item,form) {
  return form==='connective'?answersFor(item,'masu').map(answer=>answer.slice(0,-2)):answersFor(item,form);
}
function baseEvidence(item,form) {
  const policy=stopPolicies[form];
  if(policy)return [...new Set([...baseEvidence(item,policy[0]),...policy[1]])];
  if(form==='connective')return [item.class==='godan'?'stem.godan.i':item.class==='ichidan'?'stem.ichidan.drop-ru':'stem.irregular.connective'];
  if(!verbSimple.includes(form)&&!['causative','causativePassive'].includes(form))return null;
  if(item.class==='irregular')return [`suffix.${form}`];
  if(item.class==='ichidan')return ['stem.ichidan.drop-ru',`suffix.${form}`];
  const ending=item.surface.at(-1), rules=[];
  if(['negative','passive','causative','causativePassive'].includes(form))rules.push('stem.godan.a',...(ending==='う'?['stem.godan.u-wa']:[]));
  else if(form==='volitional')rules.push('stem.godan.o');
  else if(['potential','imperative','ba'].includes(form))rules.push('stem.godan.e');
  else if(['past','te'].includes(form)) {
    rules.push(item.reading==='いく'||item.surface==='行く'||['う','つ','る'].includes(ending)?'onbin.sokuon':['む','ぶ','ぬ'].includes(ending)?'onbin.hatsuon':['く','ぐ'].includes(ending)?'onbin.i':'stem.godan.shi-connective');
    if(['む','ぶ','ぬ','ぐ'].includes(ending))rules.push('onbin.voicing');
  }
  return [...rules,`suffix.${form}`];
}
function operationExpectation(item,form,input) {
  if(item.domain!=='verb')return null;
  if(form==='nakute'&&baseAnswers(item,'negative').some(answer=>normalize(answer.slice(0,-1)+'く')===normalize(input))) {
    return {...unknown,confirmed:[...baseEvidence(item,'negative'),'adj.stem.i-ku'],steps:1,continuation:true};
  }
  const policy=stopPolicies[form];
  if(policy&&baseAnswers(item,policy[0]).some(answer=>normalize(answer)===normalize(input))) {
    const confirmed=baseEvidence(item,policy[0]);
    return policy[1].length===1?exact(policy[1][0],confirmed):{...unknown,confirmed,steps:1,continuation:true};
  }
  if(form==='masenka'&&baseAnswers(item,'connective').includes(input))return {...unknown,confirmed:baseEvidence(item,'connective'),steps:2,continuation:true};
  const family=familyFor(form);
  if(family&&baseAnswers(item,family.base).some(answer=>normalize(answer)===normalize(input))) {
    const confirmed=baseEvidence(item,family.base);
    if(confirmed)return {...unknown,confirmed,steps:1,continuation:true};
  }
  return null;
}
function nestedExpectation(item,form) {
  if(item.domain!=='verb')return null;
  const base={naideKudasai:'naide',nakutemoIi:'nakute',nakutewaIkenai:'nakute',nakerebaNaranai:'negative'}[form];
  if(!base)return null;
  const intermediate=baseAnswers(item,base)[0];
  let confirmed=baseEvidence(item,base);
  if(form==='nakutewaIkenai')confirmed=confirmed.filter(id=>id!=='construction.nakute');
  if(form==='nakerebaNaranai')confirmed.push('adj.suffix.i-ba');
  return {input:form==='nakerebaNaranai'?intermediate.slice(0,-1)+'ければ':intermediate,expected:exact(`construction.${form}`,confirmed)};
}
function endingExpectation(item,form,canonical,input) {
  const exactStop=operationExpectation(item,form,input);if(exactStop)return exactStop;
  const nested=nestedExpectation(item,form);if(nested)return nested.expected;
  if(item.domain==='adjective') {
    if(item.class==='na'&&naFormKcs[form])return exact(naFormKcs[form]);
    if(item.class==='i'&&['adjectivePast','adjectiveBa'].includes(form))return exact(iForms[form],item.iiFamily?['adj.exception.ii-yo']:[]);
    if(item.class==='i'&&['adjectiveNegative','adjectiveTe'].includes(form))return exact(iForms[form],['adj.stem.i-ku',...(item.iiFamily?['adj.exception.ii-yo']:[])]);
  }
  if(item.domain==='verb') {
    if(form==='prohibitive')return exact('suffix.prohibitive');
    if(form==='masenka')return exact('construction.masenka',baseEvidence(item,'connective'));
    const primitives=['negative','past','te','potential','volitional','ba','passive','causative','causativePassive'];
    if(item.class==='ichidan')primitives.push('imperative');
    if(primitives.includes(form)) {
      // A surviving whole alternative form takes precedence over interpreting
      // its visible e-row as evidence for the requested potential/conditional.
      if(verbSimple.some(other=>other!==form&&answersFor(item,other).some(answer=>normalize(answer)===normalize(input))))return exact(`suffix.${form}`);
      const confirmed=baseEvidence(item,form).filter(id=>id.startsWith('stem.')||id.startsWith('onbin.')&&id!=='onbin.voicing');
      return exact(`suffix.${form}`,confirmed);
    }
    if(form==='zuni')return exact('construction.zuni',baseEvidence(item,'negative').filter(id=>id.startsWith('stem.')));
    const polite={masuPast:'past',masuNegative:'negative',masuNegativePast:'negative-past'}[form];
    if(polite)return exact(`compound.polite-${polite}`,baseEvidence(item,'connective'));
  }
  const policy=item.domain==='verb'?stopPolicies[form]:null;
  if(!policy||policy[1].length!==1)return null;
  const base=baseAnswers(item,policy[0])[0];
  // Only a missing final character in an appended suffix is attributable.
  // At least one suffix character and the entire base must remain visible.
  if(canonical.startsWith(base)&&input.startsWith(base)&&input.length>base.length)return exact(policy[1][0],baseEvidence(item,policy[0]));
  return null;
}

function familyFor(form) {
  const spec=COMPOUND_FORM_SPECS[form];
  if(spec) return {base:spec.form, alternatives:Object.entries(COMPOUND_FORM_SPECS).filter(([id,s])=>id!==form&&s.form===spec.form).map(([id])=>id)};
  const voice=form.match(/^(passive|potential|causative|causativePassive)(Past|Negative|NegativePast)$/);
  return voice?{base:voice[1],alternatives:['Past','Negative','NegativePast'].map(e=>voice[1]+e).filter(f=>f!==form)}:null;
}
function unchangedPrefix(item) {
  const stemLength = item.domain==='adjective' ? item.class==='na'?item.surface.length:item.surface.length-(item.iiFamily?2:1)
    : item.class==='irregular'?item.surface.length-2:item.surface.length-1;
  return item.surface.slice(0,Math.max(0,stemLength));
}
function lexicalMutation(item, canonical) {
  const fixed=unchangedPrefix(item);
  if(!fixed || !canonical.startsWith(fixed)) return null;
  const chars=Array.from(canonical), first=chars[0];
  const replacement=/\p{Script=Hiragana}/u.test(first)?first==='た'?'な':first==='あ'?'か':'あ':/\p{Script=Katakana}/u.test(first)?first==='ア'?'カ':'ア':/\p{Script=Han}/u.test(first)?first==='字'?'文':'字':null;
  if(!replacement)return null;
  chars[0]=replacement;return chars.join('');
}
function lexicalDeletionExpectation(item,form,input) {
  const corrections=new Set();let ambiguousBoundary=false,hasSafeDeletion=false;
  const actual=Array.from(normalize(input));
  for(const word of [item,readings(item)]) {
    const prefix=normalize(unchangedPrefix(word));
    const prefixLength=Array.from(prefix).length;
    for(const candidate of answersFor(word,form)) {
      const correct=normalize(candidate),chars=Array.from(correct);
      if(!prefixLength||!correct.startsWith(prefix))continue;
      if(chars.length===actual.length) {
        const changed=chars.flatMap((char,index)=>char!==actual[index]?[index]:[]);
        if(changed.length===1&&changed[0]<prefixLength&&['Hiragana','Katakana','Han'].some(script=>{
          const sameScript=new RegExp(`\\p{Script=${script}}`,'u');return sameScript.test(chars[changed[0]])&&sameScript.test(actual[changed[0]]);
        }))corrections.add(correct);
      }
      if(chars.length!==actual.length+1)continue;
      const positions=chars.flatMap((char,index)=>chars.filter((_,i)=>i!==index).join('')===normalize(input)?[{char,index}]:[]);
      if(positions.some(({index})=>index>=prefixLength))ambiguousBoundary=true;
      if(prefixLength>=3&&positions.length&&positions.every(({char,index})=>index<prefixLength&&/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]/u.test(char))) {
        corrections.add(correct);hasSafeDeletion=true;
      }
    }
  }
  return hasSafeDeletion&&!ambiguousBoundary&&corrections.size===1?commonLexicalExpectation(item,form,input):null;
}

// Independent error grammar: these are deliberately malformed operations,
// not other valid adjective forms and not deletions from a correct answer.
const iAffixes = {
  adjectivePast:{retained:'かった',bare:'た',failed:'adj.suffix.i-past'},
  adjectiveBa:{retained:'ければ',bare:'ば',failed:'adj.suffix.i-ba'},
  adjectiveNegative:{retained:'くない',bare:'ない',failed:'adj.stem.i-ku'},
  adjectiveTe:{retained:'くて',bare:'て',failed:'adj.stem.i-ku'},
  adjectiveAdverb:{retained:'く',failed:'adj.stem.i-ku'},
  adjectiveNegativePast:{retained:'くなかった',bare:'なかった',failed:'adj.stem.i-ku'},
};
const iContinuationForms={past:'adjectivePast',negative:'adjectiveNegative',negativePast:'adjectiveNegativePast'};
function generatedIAffixErrors(base, target, {iiFamily=false,wholeCompound=false,inStep=false}={}) {
  const spec=iAffixes[target];
  if(!spec||!base.endsWith('い'))return [];
  const conservative={...unknown,...(!inStep&&(wholeCompound||target==='adjectiveNegativePast')?{minSteps:1}:{steps:0})};
  const expected=iiFamily||wholeCompound?conservative:exact(spec.failed);
  const word={domain:'adjective',class:'i',surface:base,reading:base,iiFamily};
  const cases=[];
  for(const [pattern,suffix] of [['i-ending-retained',spec.retained],['i-bare-ending',spec.bare]]) {
    if(!suffix)continue;
    const input=base+suffix;
    cases.push({pattern,input,expected});
    const mixed=lexicalMutation(word,input);
    if(mixed)cases.push({pattern:'i-affix-guard',input:mixed,expected:conservative});
    cases.push({pattern:'i-affix-guard',input:input+'た',expected:conservative});
  }
  if(target==='adjectiveNegativePast')for(const input of [
    answersFor(word,'adjectiveNegative')[0]+'た',base+'かった',base+'くない',
  ])cases.push({pattern:'i-affix-guard',input,expected:conservative});
  return cases;
}
function stepIAffixTarget(item,step) {
  if(['stem','attachment','classification'].includes(step.kind))return null;
  if(step.continuation&&['negativePast','adjectiveNegativePast','adjectiveNaNegativePast'].includes(step.form)) {
    return {target:'adjectivePast',bases:(step.providedAnswers??[step.surface,step.reading]).filter(base=>base.endsWith('ない')),iiFamily:false};
  }
  const family=COMPOUND_FORM_SPECS[step.form];
  if(step.continuation&&family?.outputType==='iAdjective')return {
    target:iContinuationForms[family.ending],bases:step.providedAnswers??[step.surface,step.reading],iiFamily:false,
  };
  if(step.continuation&&step.form==='passiveDesireNegativePast')return {
    target:'adjectiveNegativePast',wholeCompound:true,iiFamily:false,
    bases:(step.providedAnswers??[step.surface,step.reading]).map(base=>answersFor({domain:'verb',class:'ichidan',surface:base,reading:base},'tai')[0]),
  };
  const analysisItem=step.analysisItem??item;
  if(analysisItem.domain==='adjective'&&analysisItem.class==='i'&&iAffixes[step.form]&&step.surface.endsWith('い')) {
    return {target:step.form,bases:[step.surface,step.reading],iiFamily:analysisItem.iiFamily};
  }
  return null;
}

function semanticTargetsForStep(item,step) {
  const analysisItem=step.analysisItem??item;
  if(step.kind==='atomic'&&step.kcIds.length===1&&step.kcIds[0]==='adj.suffix.i-past')return [analysisItem,readings(analysisItem)].flatMap(word=>answersFor(word,'adjectivePast')).map(normalize);
  if(step.providedClass)return [...new Set(step.providedAnswers??[step.surface,step.reading])]
    .flatMap(base=>answersFor({domain:'verb',surface:base,reading:base,class:step.providedClass},step.form)).map(normalize);
  if(step.kind==='stem') {
    return [analysisItem,readings(analysisItem)].map(word=>normalize(word.surface.slice(0,-1)+passiveStageRows[word.surface.at(-1)][0]));
  }
  if(step.kind==='attachment') {
    return [...new Set(step.providedAnswers??[step.surface,step.reading])].map(base=>normalize(base+'れる'));
  }
  return [...answersFor(analysisItem,step.form),...answersFor(readings(analysisItem),step.form)].map(normalize);
}

export function generateErrorCases(exercise) {
  const {item,form}=exercise;
  if(!form)return {cases:[],collisions:0};
  const derived=deriveUnified(item,form), kana=deriveUnified(readings(item),form);
  const accepted=new Set([...derived.acceptedVariants,...kana.acceptedVariants].map(normalize));
  const steps=unifiedDiagnosticSteps(item,form);
  const result=[],seen=new Set();let collisions=0;
  function emit(pattern,input,expected,writing,stepIndex=null,context=null) {
    const step=context?.step??(stepIndex===null?null:steps[stepIndex]);
    const valid=step?new Set([...step.answers,...step.readings].map(normalize)):accepted;
    // Different grammatical forms can have identical surfaces. Such a surface
    // is a valid answer to this question and cannot be used as a negative test.
    if(expected.kind!=='correct' && valid.has(normalize(input))) {collisions++;return;}
    const key=[item.domain,item.surface,form,pattern,input,stepIndex];
    if(context)key.push(context.originalInput);
    const id=digest(key);if(seen.has(id))return;seen.add(id);
    result.push({id,pattern,level:expected.kind==='explore'?'explore':'contract',item,form,input,writing,stepIndex,step,
      ...(context?{originalInput:context.originalInput,completedKcIds:context.confirmed,semanticTargets:context.semanticTargets,
        ...(context.sourceKcIds?{sourceKcIds:context.sourceKcIds}:{})}:{}),
      kcIds:step?step.kcIds:derived.requiredKcIds, expected});
  }
  function emitStepIAffixes(step,index,context=null) {
    const target=stepIAffixTarget(item,step);
    if(!target)return;
    for(const base of new Set(target.bases))for(const c of generatedIAffixErrors(base,target.target,{iiFamily:target.iiFamily,wholeCompound:target.wholeCompound,inStep:true})) {
      emit(c.pattern,c.input,c.expected,'mixed',index,context);
    }
  }
  function emitCommon(step=null,index=null,context=null) {
    // These probes ask for a stem or a suffix attachment, not a full native
    // conjugation. Their dedicated cases below preserve that narrower target.
    if(step&&['stem','attachment','classification','atomic'].includes(step.kind))return;
    const existingCases=result.filter(c=>JSON.stringify(c.step??null)===JSON.stringify(step)
      &&(c.originalInput??null)===(context?.originalInput??null));
    const generated=generateCommonErrorCases(item,form,{step,existingCases});
    // Reconcile only previously asserted classification penalties. The common
    // grammar proves these exact inputs also arise from a supported local
    // operation; unrelated old contracts retain their stronger assertions.
    const conflicts=new Set(generated.classificationConflicts);
    for(const c of existingCases)if(conflicts.has(normalize(c.input))&&/^(class\.|facet\.class\.|lexeme\.)/.test(c.expected.failed??'')) {
      c.expected={...unknown,...(!step?{minSteps:1}:{})};
    }
    collisions+=generated.collisions;
    for(const c of generated.cases)emit(c.pattern,c.input,c.expected,c.writing,index,context);
  }
  function emitPassiveMicroProbe(step,index,context) {
    if(step.kind==='stem') {
      const analysisItem=step.analysisItem??item;
      for(const [writing,word] of [['surface',analysisItem],['reading',readings(analysisItem)]]) {
        const rows=passiveStageRows[word.surface.at(-1)],root=word.surface.slice(0,-1);
        for(const row of rows.slice(1))emit('passive-stage-probe',root+row,exact('stem.godan.a'),writing,index,context);
        if(word.surface.endsWith('う'))emit('passive-stage-probe',root+'あ',exact('stem.godan.u-wa'),writing,index,context);
      }
    } else if(step.kind==='attachment') {
      for(const base of new Set(step.providedAnswers??[step.surface,step.reading]))for(const ending of ['','られる','られ','る','れ','れるる']) {
        emit('passive-stage-probe',base+ending,exact('suffix.passive'),'mixed',index,context);
      }
    }
  }
  for(const [writing,word] of [['surface',item],['reading',readings(item)]]) {
    const valid=answersFor(word,form);
    for(const input of valid) {
      emit('valid',input,{kind:'correct'},writing);
      for(const variant of [` ${input}。 `,katakana(input)])emit('normalized',variant,{kind:'correct'},writing);
    }
    const canonical=valid[0];
    const fixed=unchangedPrefix(word);
    if(fixed&&canonical.startsWith(fixed))for(let index=0;index<fixed.length;index++) {
      const input=canonical.slice(0,index)+canonical.slice(index+1);
      emit('lexical-deletion',input,lexicalDeletionExpectation(item,form,input)??{kind:'explore'},writing);
    }
    const typo=lexicalMutation(word,canonical);
    if(typo) {
      emit('lexical-substitution',typo,{kind:'typo'},writing);
      const tail=canonical.at(-1);
      const wrongTail=tail==='た'?'だ':tail==='て'?'で':tail==='い'?'た':tail==='な'?'に':'な';
      emit('multiple-errors',typo.slice(0,-1)+wrongTail,unknown,writing);
    }
    emit('noise','xyz§'+canonical,unknown,writing);
    for(const target of valid)emit('ending-deletion',target.slice(0,-1),endingExpectation(word,form,target,target.slice(0,-1))??{kind:'explore'},writing);
    for(const c of passiveStageCases(word,form))emit(c.pattern,c.input,c.expected,writing);
    if(item.domain==='adjective'&&item.class==='na') {
      // Enumerate an independent edit operation over every accepted suffix,
      // including its head, interior, tail and entirety. The simple-form KC
      // policy above is independent of production diagnosis and operations.
      // Negative-past spans can cross multiple rules and remain exploratory.
      const repeatedSuffixInputs=new Set();
      for(const correct of valid) {
        const tail=Array.from(correct.slice(word.surface.length));
        for(let start=0;start<tail.length;start++)for(let end=start+1;end<=tail.length;end++) {
          repeatedSuffixInputs.add(word.surface+tail.slice(0,end).concat(tail.slice(start,end),tail.slice(end)).join(''));
        }
      }
      for(const correct of valid) {
        if(!correct.startsWith(word.surface))continue;
        const suffix=Array.from(correct.slice(word.surface.length));
        for(let start=0;start<suffix.length;start++)for(let end=start+1;end<=suffix.length;end++) {
          const input=word.surface+suffix.slice(0,start).concat(suffix.slice(end)).join('');
          emit('na-suffix-span-omission',input,naFormKcs[form]?exact(naFormKcs[form]):{kind:'explore'},writing);
          // A deletion can produce another accepted variant (ではない →
          // でない, ならば → なら). It is not an error to compound in a guard.
          if(accepted.has(normalize(input)))continue;
          const damagedRoot=lexicalMutation(word,input);
          if(damagedRoot)emit('na-suffix-span-guard',damagedRoot,unknown,writing);
          // Some deletion+append paths coincide with one suffix repetition:
          // でないない is a repeated ない in the accepted でない variant.
          const repeated=input+'ないない';
          emit('na-suffix-span-guard',repeated,naFormKcs[form]&&repeatedSuffixInputs.has(repeated)?exact(naFormKcs[form]):unknown,writing);
        }
      }
    }
    // Independent error operation: alter only the fixed だった suffix while
    // retaining the whole lexical base. Do not derive this table from the
    // analyzer, infer a learner's motive, or award classification evidence.
    if(item.domain==='adjective'&&(item.class==='na'||form==='adjectivePast')) {
      for(const tail of ['たっだ','たった','だっだ']) {
        const input=word.surface+tail;
        if(item.class==='na'&&form==='adjectiveNaPast') {
          emit('na-past-voicing',input,exact('adj.suffix.na-past'),writing);
          const damagedRoot=lexicalMutation(word,input);
          if(damagedRoot)emit('na-past-voicing-guard',damagedRoot,unknown,writing);
          for(const extra of ['た',tail])emit('na-past-voicing-guard',input+extra,unknown,writing);
        } else {
          // A matching ending shape cannot establish a na-past error in a
          // different target or word class; existing compound probes may run.
          emit('na-past-voicing-guard',input,unknown,writing);
        }
      }
    }
    if(item.domain==='adjective'&&item.class==='i') {
      for(const c of generatedIAffixErrors(word.surface,form,{iiFamily:item.iiFamily}))emit(c.pattern,c.input,c.expected,writing);
      if(['adjectiveNegative','adjectiveTe'].includes(form)) {
        const stem=answersFor(word,'adjectiveAdverb')[0];
        emit('ku-omission',stem,exact(iForms[form],['adj.stem.i-ku',...(item.iiFamily?['adj.exception.ii-yo']:[])]),writing);
      }
      if(iForms[form]) for(const other of [...Object.keys(iForms),'adjectiveNegativePast']) {
        if(other===form || (other==='adjectiveAdverb'&&['adjectiveNegative','adjectiveTe'].includes(form)))continue;
        emit('adjective-form-switch',answersFor(word,other)[0],exact(iForms[form]),writing);
      }
      if(item.iiFamily) emit('ii-regularization',answersFor({...word,iiFamily:false},form)[0],exact('adj.exception.ii-yo'),writing);
    }
    if(item.domain==='adjective'&&negativeBases[form]) {
      const confirmed=item.class==='na'?['adj.suffix.na-negative']:['adj.stem.i-ku','adj.suffix.i-negative',...(item.iiFamily?['adj.exception.ii-yo']:[])];
      for(const input of answersFor(word,negativeBases[form]))emit('negative-intermediate',input,{kind:'incorrect',failed:null,confirmed,steps:1,continuation:true},writing);
    }
    if(item.domain==='verb'&&item.class==='godan'&&['te','past'].includes(form)) {
      const ending=word.surface.at(-1);
      const sound=['む','ぶ','ぬ'].includes(ending)?'onbin.hatsuon':['く','ぐ'].includes(ending)?'onbin.i':['う','つ','る'].includes(ending)?'onbin.sokuon':null;
      if(sound) {
        const regularStem=answersFor(word,'masu')[0].slice(0,-2);
        const id=item.surface==='行く'||item.reading==='いく'?'facet.onbin.sokuon.iku':sound;
        emit('sound-omission',regularStem+(form==='past'?'た':'て'),exact(id),writing);
      }
      if(['む','ぶ','ぬ','ぐ'].includes(ending))emit('voicing-omission',canonical.slice(0,-1)+(form==='past'?'た':'て'),exact('onbin.voicing'),writing);
    }
    if(item.domain==='verb') {
      const iFamily=COMPOUND_FORM_SPECS[form];
      if(iFamily?.outputType==='iAdjective')for(const c of generatedIAffixErrors(answersFor(word,iFamily.form)[0],iContinuationForms[iFamily.ending],{wholeCompound:true})) {
        emit(c.pattern,c.input,c.expected,writing);
      }
      if(form==='passiveDesireNegativePast') {
        const passive=answersFor(word,'passive')[0];
        const iBase=answersFor({domain:'verb',class:'ichidan',surface:passive,reading:passive},'tai')[0];
        for(const c of generatedIAffixErrors(iBase,'adjectiveNegativePast',{wholeCompound:true}))emit(c.pattern,c.input,c.expected,writing);
      }
      const family=familyFor(form);
      if(family)for(const alternative of [family.base,...family.alternatives])for(const input of answersFor(word,alternative)) {
        emit('compound-ending-switch',input,operationExpectation(word,form,input)??{kind:'incorrect',failed:null,minSteps:1},writing);
      }
      if(form==='taiPast'&&item.class==='godan')emit('blended-rules',answersFor(word,'past')[0]+'いた',{...unknown,minSteps:1},writing);
    }
    const forms=item.domain==='verb'?verbSimple:item.class==='na'?naSimple:[];
    if(forms.includes(form))for(const alternative of forms.filter(f=>f!==form))for(const input of answersFor(word,alternative)) {
      // A complete alternative form identifies a target-form confusion, except
      // when the same surface also follows the target rule for another class.
      // E.g. 待て can be imperative or mistaken ichidan て; 取られる can be
      // passive or mistaken ichidan potential. Neither cause is unique.
      const classCollision=item.domain==='verb'&&['godan','ichidan','irregular'].some(cls=>{
        if(cls===item.class)return false;
        try{return answersFor({...word,class:cls},form).some(answer=>normalize(answer)===normalize(input));}catch{return false;}
      });
      emit('other-form-switch',input,classCollision?{...unknown,steps:0}:exact(item.domain==='verb'?`suffix.${form}`:naFormKcs[form]),writing);
    }
    if(item.domain==='verb')for(const cls of ['godan','ichidan','irregular'].filter(c=>c!==item.class)) {
      try {for(const [index,input] of answersFor({...word,class:cls},form).entries()) {
        // A contracted ending is still grammatical evidence for the wrong
        // class. Pin down this previously missing subset independently, while
        // leaving exceptional roots and homographs to exploratory review.
        const variantBase=familyFor(form)?.base??form;
        const unambiguousContractedClass=index>0&&item.class==='godan'&&!item.surface.endsWith('る')&&cls==='ichidan'
          &&['teiru','teoru','teshimau','teoku','teiku','nasai','causative'].includes(variantBase)
          &&!verbSimple.some(other=>answersFor(word,other).some(answer=>normalize(answer)===normalize(input)));
        emit('wrong-class',input,unambiguousContractedClass?exact('class.godan'):{kind:'explore'},writing);
      }} catch { /* No conjugation for this counterfactual class. */ }
    }
    const d=writing==='surface'?derived:kana;
    for(const op of d.operations.slice(0,-1))emit('operation-stop',op.output,operationExpectation(word,form,op.output)??{kind:'explore'},writing);
    const nested=nestedExpectation(word,form);
    if(nested)emit('nested-operation-stop',nested.input,nested.expected,writing);
  }
  steps.forEach((step,index)=>{
    emitPassiveMicroProbe(step,index);
    emitStepIAffixes(step,index);
    for(const input of [...step.answers,...step.readings])emit('step-valid',input,{kind:'correct'},'mixed',index);
    for(const input of [...step.answers,...step.readings])emit('step-valid',katakana(input),{kind:'correct'},'mixed',index);
    emit('step-noise','xyz§'+step.surface,unknown,'mixed',index);
    if(step.continuation&&item.domain==='adjective'&&negativeBases[form]) {
      for(const input of answersFor(item,negativeBases[form]).concat(answersFor(readings(item),negativeBases[form])))emit('step-negative-unchanged',input,exact('adj.suffix.i-past'),'mixed',index);
    }
    for(const c of suppliedNegativeIntermediateCases(item,step))emit(c.pattern,c.input,c.expected,c.writing,index);
    if(step.form==='tearuNegative'&&step.continuation&&step.kcIds.includes('exception.aru-negative'))for(const base of new Set(step.providedAnswers??[step.surface,step.reading])) {
      if(base.endsWith('ある'))emit('common-stem-row',base.slice(0,-2)+'あらない',exact('exception.aru-negative'),'mixed',index);
    }
    emitCommon(step,index);
  });
  // Exercise the actual contexts created by a partial whole-answer. The
  // operation list supplies candidate intermediate surfaces, but step labels
  // must independently agree with the conjugator for their analysis item.
  const partialInputs=new Map(result.filter(c=>!c.step&&(c.pattern==='operation-stop'||c.pattern==='negative-intermediate'||c.pattern==='passive-stage-mixed')).map(c=>[normalize(c.input),c]));
  const seenPartialContexts=new Set();
  for(const original of partialInputs.values()) {
    const remaining=unifiedDiagnosticSteps(item,form,{answer:original.input,normalize});
    remaining.forEach((step,index)=>{
      const contextKey=JSON.stringify([step,[...(original.expected.confirmed??[])].sort()]);
      if(seenPartialContexts.has(contextKey))return;seenPartialContexts.add(contextKey);
      const semanticTargets=semanticTargetsForStep(item,step);
      const context={step,originalInput:original.input,confirmed:original.expected.confirmed??[],semanticTargets};
      emitPassiveMicroProbe(step,index,context);
      emitStepIAffixes(step,index,context);
      for(const input of [...step.answers,...step.readings])emit('partial-step-valid',input,{kind:'correct'},'mixed',index,context);
      emit('partial-step-noise','xyz§'+step.surface,unknown,'mixed',index,context);
      for(const input of step.providedAnswers??[step.surface,step.reading]) {
        const explicit=step.continuation&&step.form==='nakute'&&input.endsWith('く')?exact('adj.suffix.i-te')
          :step.continuation&&step.form==='tearuNegative'?exact('exception.aru-negative')
          :step.continuation&&['negativePast','adjectiveNegativePast','adjectiveNaNegativePast'].includes(step.form)
            &&input.endsWith('ない')?exact('adj.suffix.i-past'):null;
        emit('partial-step-unchanged',input,explicit??{kind:'explore'},'mixed',index,context);
      }
      emitCommon(step,index,context);
      for(const c of suppliedNegativeIntermediateCases(item,step))emit(c.pattern,c.input,c.expected,c.writing,index,context);
    });
  }
  emitCommon();
  // Freeze the routing expectation independently, then test both the root
  // decision and the real supplied contexts it creates before any base score.
  const seenPriorityContexts = new Set();
  for (const c of generateProbeRoutingCases(item, form)) {
    emit(c.pattern, c.input, c.expected, c.writing);
    if (!c.expected.priority) continue;
    const expectedClass = c.expected.probes[0].expectedClass;
    const routed = unifiedDiagnosticSteps(item, form, { answer: c.input, normalize });
    for (const [index, step] of routed.entries()) {
      // Every original input retains its own routing assertion. Equivalent
      // resulting probes need one replay per actual supplied context, not
      // duplicated replays for each spelling of the same original switch.
      const probeKey = JSON.stringify(step);
      if (seenPriorityContexts.has(probeKey)) continue;
      seenPriorityContexts.add(probeKey);
      const context = { step, originalInput: c.input, confirmed: [], sourceKcIds: derived.requiredKcIds,
        semanticTargets: step.kind === 'classification' ? [expectedClass] : semanticTargetsForStep(item, step) };
      if (step.kind === 'classification') {
        const classification = { expectedClass, choices: ['godan', 'ichidan'] };
        for (const choice of classification.choices) emit('continuation-classification', choice,
          choice === expectedClass ? { kind: 'correct', classification } : { ...unknown, stage: null, steps: 0, classification }, 'choice', index, context);
      } else {
        for (const input of [...step.answers, ...step.readings]) emit('partial-step-valid', input, { kind: 'correct' }, 'mixed', index, context);
        emit('partial-step-noise', 'xyz§' + step.surface, { ...unknown, stage: null }, 'mixed', index, context);
        if (step.kind === 'atomic' && step.kcIds.length === 1 && step.kcIds[0] === 'adj.suffix.i-past'
          && step.surface.endsWith('ない')) {
          for (const input of [step.surface, step.reading]) emit('step-negative-unchanged', input, exact('adj.suffix.i-past'), 'mixed', index, context);
        }
        emitCommon(step, index, context);
      }
    }
  }
  // Metadata comes from the real supplied context; expected completed rules,
  // the single past target and its unchanged-input failure are independent.
  const seenNegatives=new Set();
  for(const original of [...result].filter(c=>c.step&&c.pattern==='negative-intermediate')) {
    const plan=planForContext(original.step.analysisItem??item,form,original.step);
    const remaining=atomicSteps(plan,form,original.kcIds,original.expected.confirmed,original.input,normalize);
    remaining.forEach((step,index)=>{
      const key=JSON.stringify([step,original.expected.confirmed]);if(seenNegatives.has(key))return;seenNegatives.add(key);
      const context={step,originalInput:original.input,confirmed:original.expected.confirmed,sourceKcIds:original.kcIds,semanticTargets:semanticTargetsForStep(item,step)};
      for(const input of [...step.answers,...step.readings])emit('partial-step-valid',input,{kind:'correct'},'mixed',index,context);
      for(const input of [step.surface,step.reading])emit('step-negative-unchanged',input,exact('adj.suffix.i-past'),'mixed',index,context);
      emit('partial-step-noise','xyz§'+step.surface,{...unknown,steps:0},'mixed',index,context);
    });
  }
  // A bounded second diagnostic level is permitted only for the independently
  // specified derived-class/past conflict. Reuse actual supplied contexts, but
  // choose the expected class from the separate semantic contract above.
  const seenFollowups=new Set();
  for(const original of [...result].filter(c=>c.step&&(c.expected.stage||c.expected.review)&&c.expected.probes?.[0]?.kind==='classification')) {
    const followups=unifiedStepDiagnosticSteps(item,original.step,{answer:original.input,normalize});
    for(const [index,step] of followups.entries()) {
      const key=JSON.stringify(step);if(seenFollowups.has(key))continue;seenFollowups.add(key);
      const expectedClass=original.expected.probes[0].expectedClass;
      const context={step,originalInput:original.input,confirmed:[],sourceKcIds:original.kcIds,
        semanticTargets:step.kind==='classification'?[expectedClass]:semanticTargetsForStep(item,step)};
      if(step.kind==='classification') {
        const classification={expectedClass,choices:['godan','ichidan']};
        for(const choice of classification.choices)emit('continuation-classification',choice,
          choice===expectedClass?{kind:'correct',classification}:{...unknown,stage:null,steps:0,classification},'choice',index,context);
        emit('continuation-classification','xyz§',{...unknown,stage:null,steps:0,classification},'choice',index,context);
      } else {
        for(const input of [...step.answers,...step.readings])emit('partial-step-valid',input,{kind:'correct'},'mixed',index,context);
        emit('partial-step-noise','xyz§'+step.surface,{...unknown,stage:null,steps:0},'mixed',index,context);
        emitCommon(step,index,context);
      }
    }
  }
  return {cases:result,collisions};
}
