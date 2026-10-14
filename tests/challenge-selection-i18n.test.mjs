import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

import ChallengeSelection, {CHALLENGE_MESSAGES} from '../app/lib/challenge-selection.mjs';
import {createI18n} from '../app/lib/i18n/core.mjs';

const stages=[{id:'basics',label:'基础变化'}];
const courses=[{id:'past',domain:'verb',title:'动词过去形',stageId:'basics',stageLabel:'基础变化',order:7}];
const handlers={onChange(){},onStart(){},onHighest(){},onBack(){}};

function render(props={}) {
  return renderToStaticMarkup(h(ChallengeSelection,{
    courses,stages,selected:[],backLabel:'返回当前练习',retests:null,...handlers,...props,
  }));
}

test('challenge selection keeps the Chinese interface as the default',()=>{
  const html=render();
  assert.match(html,/>自由挑战</);
  assert.match(html,/aria-label="筛选挑战课程"/);
  assert.match(html,/已选 0 门课程/);
  assert.match(html,/>08</);
});

test('challenge selection has complete English fallbacks and localized dynamic labels',()=>{
  const html=render({
    locale:'en',selected:['past'],backLabel:'Back to current practice',
    courseLabel:course=>course.id==='past'?'Past tense':course.title,
    stageLabel:stage=>stage.id==='basics'?'Basic changes':stage.label,
  });
  assert.match(html,/>Free challenge</);
  assert.match(html,/aria-label="Filter challenge courses"/);
  assert.match(html,/aria-label="Clear the current results"/);
  assert.match(html,/aria-label="Past tense"/);
  assert.match(html,/<legend>Basic changes<\/legend>/);
  assert.match(html,/1 course selected/);
  assert.match(html,/>08</);
  assert.doesNotMatch(html,/[\u3400-\u9fff]/);
});

test('challenge selection uses full challenge keys from a translator',()=>{
  const calls=[];
  const messages={
    'challenge.title':'Open challenge',
    'challenge.selection.count':'Selected: {formattedCount}',
  };
  const translator=(key,params={})=>{
    calls.push(key);
    return (messages[key]??key).replace(/\{(\w+)\}/g,(token,name)=>Object.hasOwn(params,name)?String(params[name]):token);
  };
  const html=render({locale:'en',t:translator});
  assert.match(html,/>Open challenge</);
  assert.match(html,/Selected: 0/);
  assert.ok(calls.includes('challenge.search.label'));
  assert.ok(calls.includes('challenge.bulk.selectVisibleLabel'));
});

test('exported challenge messages work as complete locale catalogs',()=>{
  const i18n=createI18n({locale:'en',catalogs:CHALLENGE_MESSAGES});
  const html=render({locale:i18n.locale,t:i18n.t,selected:['past'],backLabel:'Back'});
  assert.match(html,/1 course selected/);
  assert.match(html,/>Free challenge</);
});

test('English challenge copy rejects a Chinese catalog fallback',()=>{
  const html=render({locale:'en-US',t:()=> '缺少翻译',backLabel:'Back'});
  assert.match(html,/>Free challenge</);
  assert.match(html,/aria-label="Filter challenge courses"/);
  assert.doesNotMatch(html,/缺少翻译/);
});
