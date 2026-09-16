import {createElement as h,useMemo,useState} from 'react';

export default function ChallengeSelection({courses,stages,selected,onChange,onStart,onHighest,onBack,backLabel,retests}) {
  const [filter,setFilter]=useState('all'),[search,setSearch]=useState('');
  const visible=useMemo(()=>courses.filter(c=>(filter==='all'||c.domain===filter)
    &&`${c.title} ${c.stageLabel} ${(c.order??0)+1}`.toLowerCase().includes(search.trim().toLowerCase())),[courses,filter,search]);
  const selectedSet=new Set(selected);
  const allVisible=visible.length>0&&visible.every(c=>selectedSet.has(c.id));
  const choose=(ids,checked)=>onChange(checked?[...new Set([...selected,...ids])]:selected.filter(id=>!ids.includes(id)));
  return h('section',{className:'challenge-page','aria-labelledby':'challenge-title'},
    h('header',{className:'challenge-heading'},h('div',null,h('p',{className:'eyebrow'},'FREE CHALLENGE'),
      h('h1',{id:'challenge-title',tabIndex:-1},'自由挑战'),h('p',null,'自由选择起点，把想练的课程放在一起。')),
      h('button',{type:'button',className:'statistics-back',onClick:onBack},backLabel)),
    h('button',{type:'button',className:'challenge-highest',onClick:onHighest},
      h('span',null,h('strong',null,'挑战最高难度'),h('small',null,'直接进入多种表达的组合活用')),
      h('span',{'aria-hidden':true},'→')),
    retests,
    h('form',{className:'challenge-picker',onSubmit:event=>{event.preventDefault();if(selected.length)onStart();}},
      h('div',{className:'challenge-picker-heading'},h('div',null,h('h2',null,'自选课程'),h('p',null,'可多选，未解锁课程也能挑战。成绩共用；挑战错题不会自动加入常规练习。')),
        h('label',{className:'challenge-search'},h('span',{className:'sr-only'},'搜索挑战课程'),
          h('input',{type:'search',placeholder:'搜索课程',value:search,onChange:event=>setSearch(event.target.value),onKeyDown:event=>{if(event.key==='Enter')event.preventDefault();}}))),
      h('div',{className:'challenge-tools'},
        h('div',{className:'challenge-filters',role:'group','aria-label':'筛选挑战课程'},[['all','全部'],['verb','动词'],['adjective','形容词']].map(([id,label])=>h('button',{key:id,type:'button','aria-pressed':filter===id,onClick:()=>setFilter(id)},label))),
        h('div',{className:'challenge-bulk'},h('button',{type:'button',disabled:!visible.length,'aria-label':allVisible?'取消当前结果':'全选当前结果',onClick:()=>choose(visible.map(c=>c.id),!allVisible)},allVisible?'取消全选':'全选结果'),
          h('button',{type:'button',disabled:!selected.length,'aria-label':'清空选择',onClick:()=>onChange([])},'清空'))),
      h('div',{className:'challenge-course-list'},visible.length?stages.map(stage=>{
        const group=visible.filter(c=>c.stageId===stage.id);if(!group.length)return null;
        return h('fieldset',{key:stage.id,className:'challenge-course-group'},h('legend',null,stage.label),
          h('div',{className:'challenge-course-grid'},group.map(c=>h('label',{key:c.id,className:`challenge-course-option ${selectedSet.has(c.id)?'selected':''}`},
            h('input',{type:'checkbox','aria-label':c.title,checked:selectedSet.has(c.id),onChange:event=>choose([c.id],event.target.checked)}),
            h('span',{className:'challenge-course-number','aria-hidden':true},String((c.order??0)+1).padStart(2,'0')),
            h('span',null,c.title)))));
      }):h('p',{className:'challenge-no-results'},'没有找到匹配的课程。可以换个关键词，或切换筛选范围。')),
      h('footer',{className:'challenge-selection-footer'},h('div',null,
        h('strong',{'aria-live':'polite'},`已选 ${selected.length} 门课程`),
        h('p',null,'所选课程持续轮换，没有题数上限，可随时结束。')),
        h('button',{type:'submit',className:'challenge-start',disabled:!selected.length},'开始挑战所选课程'))));
}
