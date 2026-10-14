import { createElement as h, useState } from 'react';
import { adaptiveConstants, emptySkillStats, updateSkillStats } from './adaptive.mjs';
import { RECENT_WORD_LIMIT } from './exercise-selection.mjs';

export const PRINCIPLE_SECTIONS = [
  ['scope', '这里练习什么'],
  ['knowledge', '一道题与多个知识点'],
  ['courses', '课程怎样解锁'],
  ['selection', '下一题怎样选择'],
  ['mastery', '掌握度怎样计算'],
  ['diagnosis', '答错后怎样诊断'],
  ['retest', '何时安排独立复测'],
  ['challenge', '自由挑战有什么不同'],
  ['examples', '例句与出题限制'],
  ['records', '学习记录保存在哪里'],
  ['limits', '这些结果有哪些限制'],
  ['sources', '来源与实现'],
];

// Section links share the app's hash router. An ordinary #id would leave this view.
export function principlesSectionFromHash(hash) {
  if (hash !== '#/principles' && !hash.startsWith('#/principles/')) return null;
  const section = hash.slice('#/principles/'.length);
  return PRINCIPLE_SECTIONS.some(([id]) => id === section) ? section : '';
}

const jp = text => h('span', { lang: 'ja' }, text);
const p = (...children) => h('p', null, ...children);
const list = (tag, items) => h(tag, null, items.map((item, i) => h('li', { key: i }, item)));
const external = (url, label) => h('a', { href: url, target: '_blank', rel: 'noreferrer' }, label, ' ↗');
const source = (file, label) => external(`https://github.com/L-M-Sherlock/katsuyo-dojo/blob/main/${file}`, label);

function Section({ id, children }) {
  const title = PRINCIPLE_SECTIONS.find(([key]) => key === id)[1];
  return h('section', { 'aria-labelledby': `principles-${id}` },
    h('h2', { id: `principles-${id}`, tabIndex: -1 },
      h('a', { href: `#/principles/${id}`, 'aria-hidden': true, tabIndex: -1 }, '§'),
      title), children);
}

function Contents({ mobile = false, section }) {
  const links = h('nav', { 'aria-label': mobile ? '移动端原理目录' : '原理目录' },
    PRINCIPLE_SECTIONS.map(([id, title], i) => h('a', {
      href: `#/principles/${id}`, key: id, 'aria-current': section === id ? 'location' : undefined,
    }, h('span', { 'aria-hidden': true }, String(i + 1).padStart(2, '0')), title)));
  return mobile ? h('details', { className: 'principles-toc-mobile' }, h('summary', null, '本文目录'), links)
    : h('aside', { className: 'principles-toc' }, h('p', null, '本文目录'), links);
}

function MasteryDemo() {
  const [state, setState] = useState(() => ({ stats: emptySkillStats(), assisted: 0, message: '请选择一次作答，观察掌握度的变化。' }));
  const percent = Math.round(state.stats.confidence * 100);
  function answer(correct) {
    setState(previous => ({ ...previous, stats: updateSkillStats(previous.stats, { correct }),
      message: correct ? '独立答对一次。演示已更新掌握度。' : '错误已定位到这个知识点。演示已更新掌握度。' }));
  }
  return h('figure', { className: 'principles-demo', 'aria-labelledby': 'mastery-demo-title' },
    h('figcaption', { id: 'mastery-demo-title' }, '试一试：同一个知识点的作答记录'),
    p('演示从零开始，只计算一个普通知识点。此处不设额外的覆盖要求。'),
    h('div', { className: 'principles-demo-score' }, h('strong', null, `${percent}%`), h('span', null, '演示掌握度')),
    h('div', { className: 'principles-demo-track', role: 'progressbar', 'aria-label': '演示掌握度', 'aria-valuenow': percent, 'aria-valuemin': 0, 'aria-valuemax': 100 },
      h('span', { style: { width: `${percent}%` } })),
    h('dl', { className: 'principles-demo-counts' },
      h('div', null, h('dt', null, '独立作答'), h('dd', null, state.stats.attempts)),
      h('div', null, h('dt', null, '独立答对'), h('dd', null, state.stats.correct)),
      h('div', null, h('dt', null, '辅助答对'), h('dd', null, state.assisted))),
    h('div', { className: 'principles-demo-actions' },
      h('button', { type: 'button', onClick: () => answer(true) }, '独立答对'),
      h('button', { type: 'button', onClick: () => answer(false) }, '已定位的答错'),
      h('button', { type: 'button', onClick: () => setState(previous => ({ ...previous, assisted: previous.assisted + 1, message: '辅助答对一次。独立掌握度保持不变。' })) }, '辅助答对'),
      h('button', { type: 'button', onClick: () => setState({ stats: emptySkillStats(), assisted: 0, message: '演示已重置。' }) }, '重置演示')),
    h('p', { className: 'principles-demo-status', role: 'status' }, state.message),
    h('p', { className: 'principles-caption' }, '这是独立演示。操作不会写入你的学习记录。'));
}

function TechnicalDetails() {
  return h('details', { className: 'principles-technical' }, h('summary', null, '查看掌握度的计算方法'),
    p('普通知识点使用近期加权正确率。独立答对记为 1，明确归因的答错记为 0。第一次记录直接采用本次结果。'),
    h('code', null, `新的加权正确率 = ${1 - adaptiveConstants.emaAlpha} × 旧值 + ${adaptiveConstants.emaAlpha} × 本次结果`),
    h('code', null, `掌握度 = min(1, 加权正确率 ÷ ${adaptiveConstants.accuracyTarget} × min(独立作答次数 ÷ ${adaptiveConstants.minAttempts}, 1))`),
    p('min 表示取较小值。掌握度达到 1 时，页面显示 100%。'),
    p('部分知识点还要求指定形式各答对至少一次。缺少覆盖时，掌握度最多显示 99%。仅检查覆盖的知识点另按覆盖与近期表现判断。'),
    p('有些组合知识点还要求先修达标。先修未达标时，组合知识点也不能显示达标。'),
    source('app/lib/adaptive.mjs', '查看当前计算规则'));
}

export default function PrinciplesPage({ section = '', onBack, backLabel = '返回当前练习' }) {
  return h('div', { className: 'principles-page' },
    h('div', { className: 'principles-layout' },
      h(Contents, { section }),
      h('article', { className: 'principles-article' },
        h('header', { className: 'principles-hero' },
          h('div', { className: 'principles-heading-row' }, h('p', { className: 'eyebrow' }, '方法、规则与限制'),
            h('button', { className: 'principles-back', type: 'button', onClick: onBack }, backLabel, ' →')),
          h('h1', { id: 'principles-title', tabIndex: -1 }, '活用道場怎样安排练习？'),
          h('p', { className: 'principles-deck' }, '系统把活用拆成知识点，根据独立作答选择下一题。答错后，系统先诊断，再安排无提示复测。'),
          h('dl', { className: 'principles-meta' },
            h('div', null, h('dt', null, '训练目标'), h('dd', null, '给定词的词形变化')),
            h('div', null, h('dt', null, '判断依据'), h('dd', null, '作答结果与先修关系')),
            h('div', null, h('dt', null, '阅读方式'), h('dd', null, '先看说明，计算细节可展开')))),
        h(Contents, { mobile: true, section }),
        h(Section, { id: 'scope' },
          p('你根据题目指定的形式，改变一个动词或形容词。系统检查词形，并记录这次作答说明了哪些规则。'),
          p('独立作答指不看提示或答案，直接完成整题。已有待复测任务时，还需满足后文列出的复测条件。'),
          p('题目中的场景和例句帮助你理解表达用途。训练仍以词形为目标，不评估自由造句、听力或会话能力。'),
          h('ol', { className: 'principles-flow', 'aria-label': '练习流程' },
            ...[['选择目标', '检查先修与当前进度'], ['独立作答', '尝试完成整个词形'], ['反馈与诊断', '确认写对或写错的规则'], ['调整练习', '更新重点或安排复测']].map(([title, text], i) =>
              h('li', { key: title }, h('span', { 'aria-hidden': true }, `0${i + 1}`), h('strong', null, title), h('small', null, text))))),
        h(Section, { id: 'knowledge' },
          p('知识点是系统单独记录的一条规则。词类判断、词干变化、音便和接续都可以是知识点。'),
          p('音便指接续时发生的读音变化。例如，', jp('書く'), '变成', jp('書いて'), '时，词尾的', jp('く'), '变成', jp('い'), '。'),
          p('同一条规则可以出现在多门课程里。系统共用这条规则的记录，不要求每门课重新从零练起。'),
          h('figure', { className: 'principles-example' },
            h('figcaption', null, '三个词形，共用「', jp('い → かった'), '」这一步'),
            ...[['高い', '高かった'], ['読まない', '読まなかった'], ['読みたい', '読みたかった']].map(([from, to]) =>
              h('div', { key: from, className: 'principles-word-pair' }, jp(from), h('span', { 'aria-hidden': true }, '→'), jp(to))),
            p('组合题还需要完成前面的变化。系统另记组合应用与指定形式的覆盖情况。')),
          p('覆盖表示你已在要求的形式上独立答对。例如，一项应用可能要求过去、否定和否定过去各答对至少一次。'),
          p('无提示整题答对，可以同时更新题中多个构形知识点。词类判断由分类题确认，系统不凭正确词形推断你的分类过程。')),
        h(Section, { id: 'courses' },
          p('课程分组说明学什么。推荐顺序说明先学什么。解锁则检查知识点的先修条件。'),
          p('先修是学习某条规则前需要掌握的基础规则。'),
          p('排在前面的课程不一定都是后课的先修。同一课程中的新形式和后续变化，也可以在不同时间开放。'),
          p('例如，系统要求先掌握', jp('ている'), '，再引入缩约形式', jp('てる'), '。如果你在组合题中已积累足够的', jp('ている'), '成绩，进入这门课后可能直接练', jp('てる'), '。'),
          p('当前规则不要求每种基本形式都完成固定数量的单独题。组合题中的正确表现也会计入共享规则。'),
          p('如果其他课程可练，结算页和练习区会提供“暂时跳过本课”入口。切换课程会保留已有进度。')),
        h(Section, { id: 'selection' },
          p('常规练习同时处理待复测任务和知识点学习。可以独立复测的题目会优先安排。复测条件尚未满足时，系统会安排间隔题或辅助巩固。'),
          p('没有优先复测安排时，自适应训练按以下顺序确定重点：'),
          list('ol', [
            '先恢复曾经达标、后来退步且有可用题目的知识点。',
            '继续当前课程。当前课程不再适用时，选择推荐顺序中较早的可练课程。',
            '检查本课先修。先修未达标时，先练缺少的基础规则。',
            '在可练知识点中，优先选择未达标且掌握度较低的一项。',
          ]),
          p('系统先补缺少的形式覆盖，再考虑换词。一般先选本轮未出现的词，再避开最近 ', String(RECENT_WORD_LIMIT), ' 道原题中的词。题目不足时允许复用。'),
          h('figure', { className: 'principles-cadence' },
            h('figcaption', null, '普通轮次的计划节奏'),
            h('div', { className: 'principles-cadence-slots' }, ...['当前重点', '当前重点', '当前重点', '穿插练习'].map((label, i) => h('span', { key: i, className: i === 3 ? 'balance' : '' }, label))),
            p('每四个题位通常有三个练当前重点，一个穿插其他知识点。复测、先修和可用题目可能改变实际顺序。')),
          p('常规轮次最多 12 题。当前可推进的不同题目用完后，轮次可以提前结束。重点达标后，系统会重新安排尚未显示的题目。')),
        h(Section, { id: 'mastery' },
          p('掌握度是系统根据作答计算的进度分数。它帮助系统比较知识点，并判断是否继续练习。'),
          h('blockquote', null, '掌握度 80% 不表示下一题有 80% 的答对概率。'),
          p(`对普通知识点，从零开始连续独立答对 ${adaptiveConstants.minAttempts} 次，可以达到基础分数门槛。有额外先修或覆盖要求时，还必须满足这些要求。`),
          p('知识点分数和整题结果分别记录。整题答错时，系统可能确认部分步骤正确，也可能无法确定哪个知识点出错。'),
          h(MasteryDemo), h(TechnicalDetails),
          p('“本轮重点掌握度”描述当前重点。“本课达标数量”统计本课已达标的知识点。“知识进度”统计全站不重复的知识点。'),
          p('课程达标还要求清除常规练习中的待复测任务。标记为综合复习的课程，另有整题练习数量要求。')),
        h(Section, { id: 'diagnosis' },
          p('判题先检查答案是否匹配目标形式及支持的变体。汉字和全假名答案都可以接受。'),
          p('如果答案是同一个词的其他完整形式，系统会尝试说明你写了什么。存在多种可能原因时，系统保留未确认状态。'),
          list('ul', [
            '能明确定位错误时，只更新对应规则及明确写对的步骤。',
            '无法明确定位时，系统不把本题重点直接判错。支持拆步的题目会继续检查未确认的变化。',
            '符合笔误规则的输入可以修改后重交。此次重试不计为一次整题作答。',
          ]),
          p('拆步会提供中间形式、词类或局部目标。这些信息减少了作答难度，所以拆步结果只进入辅助练习记录。'),
          p('拆步全部答对，也不会把原题改成正确。原题仍保留待复测，直到后续独立整题确认。')),
        h(Section, { id: 'retest' },
          p('答错、揭晓答案或使用提示后，系统会记录待复测。看过提示后再收起提示，仍然算使用过提示。'),
          p('完成独立复测需要同时满足以下条件：'),
          list('ol', [
            '保持相同目标形式和相同变化步骤。',
            '通常换一个词。只有同一种变化步骤确实只有一个适用词时，才允许同词复测。',
            '从该目标最近一次作答或已记录的辅助练习之后，先完成至少两道其他目标的整题。',
            '不使用提示，独立答对完整词形。',
          ]),
          p('间隔按作答顺序计算，不要求等到第二天。过早重练只算辅助巩固，还会重新计算后续间隔。'),
          p('若出题限制使同一种变化步骤暂时没有可用题目，系统会暂挂任务。暂挂不等于通过。适用题目恢复后，任务可以继续。')),
        h(Section, { id: 'challenge' },
          p('自由挑战允许直接选择高阶课程，也允许多选课程轮换练习。挑战不受常规先修解锁限制。'),
          p('挑战没有 12 题的轮次上限。系统会持续出题，直到你结束挑战。小题池练完后可以再次出现相同题目。'),
          p('挑战中的独立作答仍会更新共享知识点。挑战新产生的待复测保留在挑战中，你可以主动将它加入常规练习。'),
          p('如果同一目标原本就在常规待复测中，进入挑战不会自动把它移走。两种模式都必须满足独立复测条件才能清除任务。')),
        h(Section, { id: 'examples' },
          p('能够按规则构成词形，不代表这个词义适合练习该形式。系统按词义与目标形式筛选题目。'),
          p('用法卡匹配具体词义和目标形式。作答前显示短场景和挖空例句，答后显示完整句及译文。分类题不配用法卡。'),
          p('需要特殊角色、时间或语体才能成立的表达，例句应提供相应条件。暂缓出题表示当前配对不适合继续练习，不等于宣称这种语法形式不存在。'),
          p('出题筛选与词形识别分别处理。某个配对不再出题后，判题器仍可能识别你输入的完整词形。')),
        h(Section, { id: 'records' },
          p('学习记录保存在当前浏览器。网站不提供账号同步。更换设备前，请从“知识进度”导出 JSON 备份，再在另一台设备导入。'),
          p('统计页展示作答、有效用时和掌握趋势。阅读原理页的时间不计入练习用时。统计图表不参与选题或解锁。'),
          p('作答日志保存原题、拆步和实际分数变化。日志有容量限制，早期记录可能已裁剪。旧备份也可能缺少可核验的逐题记录。'),
          p('因此，已有总分不一定能还原为完整的历史作答过程。系统会保留已有数据，并说明无法核验的部分。')),
        h(Section, { id: 'limits' },
          list('ul', [
            '达标只表示当前记录满足本站规则，不保证以后不会忘记。',
            '系统不使用遗忘曲线，也不根据距离上次练习的天数安排复习。',
            '答题速度不改变掌握度、选题或解锁。',
            '正确词形能提供构形证据，但不能证明学习者理解了全部句法与语用。',
            '组合题会同时影响多个知识点。这些分数不等于分别完成过同样多的单独题。',
            '诊断只覆盖已实现的规则。未定位的错误仍可能需要人工解释。',
            '模型参数是本站的计算设定。本页不把它们当作经过校准的能力测量。',
          ])),
        h(Section, { id: 'sources' },
          p('课程内容参考 Yokubi，自适应练习思路参考 kanabr。本站的计分、诊断和复测规则以当前实现为准。'),
          list('ul', [
            external('https://l-m-sherlock.github.io/yokubi-zh-cn/', 'Yokubi 中文版：课程内容'),
            external('https://l-m-sherlock.github.io/kanabr/', 'kanabr：自适应练习参考'),
            source('app/lib/unified-curriculum.mjs', '课程分组与推荐顺序'),
            source('app/lib/practice-session.mjs', '练习重点与轮次计划'),
            source('app/lib/adaptive.mjs', '掌握度与先修判断'),
            source('app/lib/learning-evidence.mjs', '独立作答与辅助练习的计分'),
            source('app/lib/learning-assessment.mjs', '独立复测的条件'),
            source('app/lib/form-eligibility.mjs', '词义与出题限制'),
          ])),
        h('footer', { className: 'principles-footer' }, p('带着当前进度，继续练习。'),
          h('button', { type: 'button', className: 'principles-back', onClick: onBack }, backLabel, ' →')))));
}
