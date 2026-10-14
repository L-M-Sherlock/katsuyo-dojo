import {createElement as h,useState} from 'react';
import {normalizeLocale} from './i18n/locales.mjs';

export const CHALLENGE_MESSAGES=Object.freeze({
  'zh-CN':Object.freeze({
    'challenge.eyebrow':'FREE CHALLENGE','challenge.title':'自由挑战','challenge.intro':'自由选择起点，把想练的课程放在一起。',
    'challenge.highest.title':'挑战最高难度','challenge.highest.description':'直接进入多种表达的组合活用',
    'challenge.picker.title':'自选课程','challenge.picker.description':'可多选，未解锁课程也能挑战。成绩共用；挑战错题不会自动加入常规练习。',
    'challenge.search.label':'搜索挑战课程','challenge.search.placeholder':'搜索课程','challenge.filters.label':'筛选挑战课程',
    'challenge.filters.all':'全部','challenge.filters.verb':'动词','challenge.filters.adjective':'形容词',
    'challenge.bulk.clearVisibleLabel':'取消选择当前结果','challenge.bulk.selectVisibleLabel':'选择全部当前结果',
    'challenge.bulk.clearVisible':'取消全选','challenge.bulk.selectVisible':'全选结果','challenge.bulk.clearSelectionLabel':'清空课程选择','challenge.bulk.clearSelection':'清空',
    'challenge.noResults':'没有找到匹配的课程。可以换个关键词，或切换筛选范围。',
    'challenge.selection.count':Object.freeze({other:'已选 {formattedCount} 门课程'}),
    'challenge.selection.description':'所选课程持续轮换，没有题数上限，可随时结束。','challenge.start':'开始挑战所选课程',
  }),
  en:Object.freeze({
    'challenge.eyebrow':'FREE CHALLENGE','challenge.title':'Free challenge','challenge.intro':'Choose a starting point. Combine the courses that you want to practice.',
    'challenge.highest.title':'Challenge the most advanced course','challenge.highest.description':'Start with combinations of multiple expressions.',
    'challenge.picker.title':'Choose courses','challenge.picker.description':'Select one or more courses, including locked courses. Results use the same learning profile. Incorrect challenge answers do not enter regular practice automatically.',
    'challenge.search.label':'Search challenge courses','challenge.search.placeholder':'Search courses','challenge.filters.label':'Filter challenge courses',
    'challenge.filters.all':'All','challenge.filters.verb':'Verbs','challenge.filters.adjective':'Adjectives',
    'challenge.bulk.clearVisibleLabel':'Clear the current results','challenge.bulk.selectVisibleLabel':'Select all current results',
    'challenge.bulk.clearVisible':'Clear results','challenge.bulk.selectVisible':'Select results','challenge.bulk.clearSelectionLabel':'Clear the course selection','challenge.bulk.clearSelection':'Clear',
    'challenge.noResults':'No courses match your search. Try another term or filter.',
    'challenge.selection.count':Object.freeze({one:'{formattedCount} course selected',other:'{formattedCount} courses selected'}),
    'challenge.selection.description':'The selected courses rotate without a question limit. You can end the challenge at any time.','challenge.start':'Start selected courses',
  }),
});

function interpolate(message,params={}) {
  return message.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g,(token,name)=>Object.hasOwn(params,name)?String(params[name]):token);
}

const HAN_TEXT=/\p{Script=Han}/u;

function localizedMessage(translator,locale,key,params={}) {
  const fullKey=`challenge.${key}`;
  const translated=typeof translator==='function'?translator(fullKey,params):null;
  if(typeof translated==='string'&&translated.trim()&&translated!==fullKey&&(locale!=='en'||!HAN_TEXT.test(translated)))return translated;
  let fallback=(CHALLENGE_MESSAGES[locale]??CHALLENGE_MESSAGES['zh-CN'])[fullKey]??CHALLENGE_MESSAGES['zh-CN'][fullKey]??fullKey;
  if(fallback&&typeof fallback==='object'){
    const category=new Intl.PluralRules(locale).select(Number(params.count));
    fallback=fallback[category]??fallback.other;
  }
  return interpolate(fallback,params);
}

export default function ChallengeSelection({courses,stages,selected,onChange,onStart,onHighest,onBack,backLabel,retests,locale='zh-CN',t=null,courseLabel=null,stageLabel=null}) {
  const [filter,setFilter]=useState('all'),[search,setSearch]=useState('');
  const language=normalizeLocale(locale)??'zh-CN';
  const msg=(key,params)=>localizedMessage(t,language,key,params);
  const numberFormatter=new Intl.NumberFormat(language,{useGrouping:false});
  const courseNumberFormatter=new Intl.NumberFormat(language,{minimumIntegerDigits:2,useGrouping:false});
  const stageNameById=new Map(stages.map(stage=>[stage.id,stageLabel?.(stage)??stage.label]));
  const visible=courses.filter(c=>(filter==='all'||c.domain===filter)
    &&`${courseLabel?.(c)??c.title} ${stageNameById.get(c.stageId)??c.stageLabel} ${(c.order??0)+1}`.toLocaleLowerCase(language).includes(search.trim().toLocaleLowerCase(language)));
  const selectedSet=new Set(selected);
  const allVisible=visible.length>0&&visible.every(c=>selectedSet.has(c.id));
  const choose=(ids,checked)=>onChange(checked?[...new Set([...selected,...ids])]:selected.filter(id=>!ids.includes(id)));
  return h('section',{className:'challenge-page','aria-labelledby':'challenge-title'},
    h('header',{className:'challenge-heading'},h('div',null,h('p',{className:'eyebrow'},msg('eyebrow')),
      h('h1',{id:'challenge-title',tabIndex:-1},msg('title')),h('p',null,msg('intro'))),
      h('button',{type:'button',className:'statistics-back',onClick:onBack},backLabel)),
    h('button',{type:'button',className:'challenge-highest',onClick:onHighest},
      h('span',null,h('strong',null,msg('highest.title')),h('small',null,msg('highest.description'))),
      h('span',{'aria-hidden':true},'→')),
    retests,
    h('form',{className:'challenge-picker',onSubmit:event=>{event.preventDefault();if(selected.length)onStart();}},
      h('div',{className:'challenge-picker-heading'},h('div',null,h('h2',null,msg('picker.title')),h('p',null,msg('picker.description'))),
        h('label',{className:'challenge-search'},h('span',{className:'sr-only'},msg('search.label')),
          h('input',{type:'search',placeholder:msg('search.placeholder'),value:search,onChange:event=>setSearch(event.target.value),onKeyDown:event=>{if(event.key==='Enter')event.preventDefault();}}))),
      h('div',{className:'challenge-tools'},
        h('div',{className:'challenge-filters',role:'group','aria-label':msg('filters.label')},[
          ['all',msg('filters.all')],['verb',msg('filters.verb')],['adjective',msg('filters.adjective')],
        ].map(([id,label])=>h('button',{key:id,type:'button','aria-pressed':filter===id,onClick:()=>setFilter(id)},label))),
        h('div',{className:'challenge-bulk'},h('button',{type:'button',disabled:!visible.length,'aria-label':allVisible?msg('bulk.clearVisibleLabel'):msg('bulk.selectVisibleLabel'),onClick:()=>choose(visible.map(c=>c.id),!allVisible)},allVisible?msg('bulk.clearVisible'):msg('bulk.selectVisible')),
          h('button',{type:'button',disabled:!selected.length,'aria-label':msg('bulk.clearSelectionLabel'),onClick:()=>onChange([])},msg('bulk.clearSelection')))),
      h('div',{className:'challenge-course-list'},visible.length?stages.map(stage=>{
        const group=visible.filter(c=>c.stageId===stage.id);if(!group.length)return null;
        return h('fieldset',{key:stage.id,className:'challenge-course-group'},h('legend',null,stageLabel?.(stage)??stage.label),
          h('div',{className:'challenge-course-grid'},group.map(c=>h('label',{key:c.id,className:`challenge-course-option ${selectedSet.has(c.id)?'selected':''}`},
            h('input',{type:'checkbox','aria-label':courseLabel?.(c)??c.title,checked:selectedSet.has(c.id),onChange:event=>choose([c.id],event.target.checked)}),
            h('span',{className:'challenge-course-number','aria-hidden':true},courseNumberFormatter.format((c.order??0)+1)),
            h('span',null,courseLabel?.(c)??c.title)))));
      }):h('p',{className:'challenge-no-results'},msg('noResults'))),
      h('footer',{className:'challenge-selection-footer'},h('div',null,
        h('strong',{'aria-live':'polite'},msg('selection.count',{count:selected.length,formattedCount:numberFormatter.format(selected.length)})),
        h('p',null,msg('selection.description'))),
        h('button',{type:'submit',className:'challenge-start',disabled:!selected.length},msg('start')))));
}
