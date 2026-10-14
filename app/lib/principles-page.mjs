import { createElement as h, useState } from 'react';
import { adaptiveConstants, emptySkillStats, updateSkillStats } from './adaptive.mjs';
import { RECENT_WORD_LIMIT } from './exercise-selection.mjs';

export const PRINCIPLE_SECTION_IDS = [
  'scope', 'knowledge', 'courses', 'selection', 'mastery', 'diagnosis',
  'retest', 'challenge', 'examples', 'records', 'limits', 'sources',
];

const ZH = {
  titles: {
    scope: '这里练习什么', knowledge: '一道题与多个知识点', courses: '课程怎样解锁',
    selection: '下一题怎样选择', mastery: '掌握度怎样计算', diagnosis: '答错后怎样诊断',
    retest: '何时安排独立复测', challenge: '自由挑战有什么不同', examples: '例句与出题限制',
    records: '学习记录保存在哪里', limits: '这些结果有哪些限制', sources: '来源与实现',
  },
  toc: '本文目录', tocAria: '原理目录', mobileTocAria: '移动端原理目录', back: '返回当前练习',
  eyebrow: '方法、规则与限制', title: ['', '活用道場', '怎样安排练习？'],
  deck: '系统把活用拆成知识点，根据独立作答选择下一题。答错后，系统先诊断，再安排无提示复测。',
  meta: [['训练目标', '给定词的词形变化'], ['判断依据', '作答结果与先修关系'], ['阅读方式', '先看说明，计算细节可展开']],
  scope: {
    body: [
      '你根据题目指定的形式，改变一个动词或形容词。系统检查词形，并记录这次作答说明了哪些规则。',
      '独立作答指不看提示或答案，直接完成整题。已有待复测任务时，还需满足后文列出的复测条件。',
      '题目中的场景和例句帮助你理解表达用途。训练仍以词形为目标，不评估自由造句、听力或会话能力。',
    ],
    flowAria: '练习流程',
    flow: [['选择目标', '检查先修与当前进度'], ['独立作答', '尝试完成整个词形'], ['反馈与诊断', '确认写对或写错的规则'], ['调整练习', '更新重点或安排复测']],
  },
  knowledge: {
    intro: '知识点是系统单独记录的一条规则。词类判断、词干变化、音便和接续都可以是知识点。',
    sound: ['音便指接续时发生的读音变化。例如，', '变成', '时，词尾的', '变成', '。'],
    shared: '同一条规则可以出现在多门课程里。系统共用这条规则的记录，不要求每门课重新从零练起。',
    caption: ['三个词形，共用「', '」这一步'],
    example: '组合题还需要完成前面的变化。系统另记组合应用与指定形式的覆盖情况。',
    coverage: '覆盖表示你已在要求的形式上独立答对。例如，一项应用可能要求过去、否定和否定过去各答对至少一次。',
    independent: '无提示整题答对，可以同时更新题中多个构形知识点。词类判断由分类题确认，系统不凭正确词形推断你的分类过程。',
  },
  courses: {
    body: [
      '课程分组说明学什么。推荐顺序说明先学什么。解锁则检查知识点的先修条件。',
      '先修是学习某条规则前需要掌握的基础规则。',
      '排在前面的课程不一定都是后课的先修。同一课程中的新形式和后续变化，也可以在不同时间开放。',
    ],
    example: ['例如，系统要求先掌握', '，再引入缩约形式', '。如果你在组合题中已积累足够的', '成绩，进入这门课后可能直接练', '。'],
    end: [
      '当前规则不要求每种基本形式都完成固定数量的单独题。组合题中的正确表现也会计入共享规则。',
      '如果其他课程可练，结算页和练习区会提供“暂时跳过本课”入口。切换课程会保留已有进度。',
    ],
  },
  selection: {
    intro: '常规练习同时处理待复测任务和知识点学习。可以独立复测的题目会优先安排。复测条件尚未满足时，系统会安排间隔题或辅助巩固。',
    lead: '没有优先复测安排时，自适应训练按以下顺序确定重点：',
    order: [
      '先恢复曾经达标、后来退步且有可用题目的知识点。',
      '继续当前课程。当前课程不再适用时，选择推荐顺序中较早的可练课程。',
      '检查本课先修。先修未达标时，先练缺少的基础规则。',
      '在可练知识点中，优先选择未达标且掌握度较低的一项。',
    ],
    words: ['系统先补缺少的形式覆盖，再考虑换词。一般先选本轮未出现的词，再避开最近 ', ' 道原题中的词。题目不足时允许复用。'],
    cadenceTitle: '普通轮次的计划节奏', focus: '当前重点', balance: '穿插练习',
    cadence: '每四个题位通常有三个练当前重点，一个穿插其他知识点。复测、先修和可用题目可能改变实际顺序。',
    round: '常规轮次最多 12 题。当前可推进的不同题目用完后，轮次可以提前结束。重点达标后，系统会重新安排尚未显示的题目。',
  },
  mastery: {
    intro: '掌握度是系统根据作答计算的进度分数。它帮助系统比较知识点，并判断是否继续练习。',
    warning: '掌握度 80% 不表示下一题有 80% 的答对概率。',
    threshold: ['对普通知识点，从零开始连续独立答对 ', ' 次，可以达到基础分数门槛。有额外先修或覆盖要求时，还必须满足这些要求。'],
    separate: '知识点分数和整题结果分别记录。整题答错时，系统可能确认部分步骤正确，也可能无法确定哪个知识点出错。',
    labels: '“本轮重点掌握度”描述当前重点。“本课达标数量”统计本课已达标的知识点。“知识进度”统计全站不重复的知识点。',
    complete: '课程达标还要求清除常规练习中的待复测任务。标记为综合复习的课程，另有整题练习数量要求。',
  },
  demo: {
    initial: '请选择一次作答，观察掌握度的变化。', correct: '独立答对一次。演示已更新掌握度。',
    incorrect: '错误已定位到这个知识点。演示已更新掌握度。', assisted: '辅助答对一次。独立掌握度保持不变。', reset: '演示已重置。',
    title: '试一试：同一个知识点的作答记录', description: '演示从零开始，只计算一个普通知识点。此处不设额外的覆盖要求。',
    mastery: '演示掌握度', attempts: '独立作答', correctLabel: '独立答对', assistedLabel: '辅助答对', incorrectButton: '已定位的答错', resetButton: '重置演示',
    caption: '这是独立演示。操作不会写入你的学习记录。',
  },
  technical: {
    summary: '查看掌握度的计算方法',
    intro: '普通知识点使用近期加权正确率。独立答对记为 1，明确归因的答错记为 0。第一次记录直接采用本次结果。',
    weighted: '新的加权正确率 = {oldWeight} × 旧值 + {newWeight} × 本次结果',
    formula: '掌握度 = min(1, 加权正确率 ÷ {target} × min(独立作答次数 ÷ {attempts}, 1))',
    min: 'min 表示取较小值。掌握度达到 1 时，页面显示 100%。',
    coverage: '部分知识点还要求指定形式各答对至少一次。缺少覆盖时，掌握度最多显示 99%。仅检查覆盖的知识点另按覆盖与近期表现判断。',
    prerequisite: '有些组合知识点还要求先修达标。先修未达标时，组合知识点也不能显示达标。', source: '查看当前计算规则',
  },
  diagnosis: {
    intro: ['判题先检查答案是否匹配目标形式及支持的变体。汉字和全假名答案都可以接受。', '如果答案是同一个词的其他完整形式，系统会尝试说明你写了什么。存在多种可能原因时，系统保留未确认状态。'],
    rules: ['能明确定位错误时，只更新对应规则及明确写对的步骤。', '无法明确定位时，系统不把本题重点直接判错。支持拆步的题目会继续检查未确认的变化。', '符合笔误规则的输入可以修改后重交。此次重试不计为一次整题作答。'],
    end: ['拆步会提供中间形式、词类或局部目标。这些信息减少了作答难度，所以拆步结果只进入辅助练习记录。', '拆步全部答对，也不会把原题改成正确。原题仍保留待复测，直到后续独立整题确认。'],
  },
  retest: {
    intro: '答错、揭晓答案或使用提示后，系统会记录待复测。看过提示后再收起提示，仍然算使用过提示。', lead: '完成独立复测需要同时满足以下条件：',
    conditions: ['保持相同目标形式和相同变化步骤。', '通常换一个词。只有同一种变化步骤确实只有一个适用词时，才允许同词复测。', '从该目标最近一次作答或已记录的辅助练习之后，先完成至少两道其他目标的整题。', '不使用提示，独立答对完整词形。'],
    end: ['间隔按作答顺序计算，不要求等到第二天。过早重练只算辅助巩固，还会重新计算后续间隔。', '若出题限制使同一种变化步骤暂时没有可用题目，系统会暂挂任务。暂挂不等于通过。适用题目恢复后，任务可以继续。'],
  },
  challenge: ['自由挑战允许直接选择高阶课程，也允许多选课程轮换练习。挑战不受常规先修解锁限制。', '挑战没有 12 题的轮次上限。系统会持续出题，直到你结束挑战。小题池练完后可以再次出现相同题目。', '挑战中的独立作答仍会更新共享知识点。挑战新产生的待复测保留在挑战中，你可以主动将它加入常规练习。', '如果同一目标原本就在常规待复测中，进入挑战不会自动把它移走。两种模式都必须满足独立复测条件才能清除任务。'],
  examples: ['能够按规则构成词形，不代表这个词义适合练习该形式。系统按词义与目标形式筛选题目。', '用法卡匹配具体词义和目标形式。作答前显示短场景和挖空例句，答后显示完整句及译文。分类题不配用法卡。', '需要特殊角色、时间或语体才能成立的表达，例句应提供相应条件。暂缓出题表示当前配对不适合继续练习，不等于宣称这种语法形式不存在。', '出题筛选与词形识别分别处理。某个配对不再出题后，判题器仍可能识别你输入的完整词形。'],
  records: ['学习记录保存在当前浏览器。网站不提供账号同步。更换设备前，请从“知识进度”导出 JSON 备份，再在另一台设备导入。', '统计页展示作答、有效用时和掌握趋势。阅读原理页的时间不计入练习用时。统计图表不参与选题或解锁。', '作答日志保存原题、拆步和实际分数变化。日志有容量限制，早期记录可能已裁剪。旧备份也可能缺少可核验的逐题记录。', '因此，已有总分不一定能还原为完整的历史作答过程。系统会保留已有数据，并说明无法核验的部分。'],
  limits: ['达标只表示当前记录满足本站规则，不保证以后不会忘记。', '系统不使用遗忘曲线，也不根据距离上次练习的天数安排复习。', '答题速度不改变掌握度、选题或解锁。', '正确词形能提供构形证据，但不能证明学习者理解了全部句法与语用。', '组合题会同时影响多个知识点。这些分数不等于分别完成过同样多的单独题。', '诊断只覆盖已实现的规则。未定位的错误仍可能需要人工解释。', '模型参数是本站的计算设定。本页不把它们当作经过校准的能力测量。'],
  sources: {
    intro: '课程内容参考 Yokubi，自适应练习思路参考 kanabr。本站的计分、诊断和复测规则以当前实现为准。',
    yokubiUrl: 'https://l-m-sherlock.github.io/yokubi-zh-cn/', yokubi: 'Yokubi 中文版：课程内容', kanabr: 'kanabr：自适应练习参考',
    files: [['app/lib/unified-curriculum.mjs', '课程分组与推荐顺序'], ['app/lib/practice-session.mjs', '练习重点与轮次计划'], ['app/lib/adaptive.mjs', '掌握度与先修判断'], ['app/lib/learning-evidence.mjs', '独立作答与辅助练习的计分'], ['app/lib/learning-assessment.mjs', '独立复测的条件'], ['app/lib/form-eligibility.mjs', '词义与出题限制']],
  },
  footer: '带着当前进度，继续练习。',
};

const EN = {
  titles: {
    scope: 'What you practice here', knowledge: 'One question can test many skills', courses: 'How courses unlock',
    selection: 'How the system selects the next question', mastery: 'How the system calculates mastery', diagnosis: 'How the system diagnoses an incorrect answer',
    retest: 'When the system schedules an independent retest', challenge: 'How Free Challenge differs', examples: 'Example sentences and question limits',
    records: 'Where the site stores your learning record', limits: 'Limits of these results', sources: 'Sources and implementation',
  },
  toc: 'Contents', tocAria: 'Principles contents', mobileTocAria: 'Mobile principles contents', back: 'Return to current practice',
  eyebrow: 'Method, rules, and limits', title: ['How does ', '活用道場', ' plan your practice?'],
  deck: 'The system divides conjugation into skills. It selects each question from your independent answers. After an error, it diagnoses and schedules a retest.',
  meta: [['Training goal', 'Change a given word into a target form'], ['Evidence', 'Your answers and prerequisite links'], ['How to read', 'Read the overview first. Open the calculation details when needed.']],
  scope: {
    body: [
      'You change a verb or adjective into the requested form. The system checks the form and records evidence for each applicable rule.',
      'An independent answer completes the full question without a hint or answer. A pending retest also has the conditions listed below.',
      'A scenario and an example sentence explain the use. The exercise tests forms. It does not test free writing, listening, or conversation.',
    ],
    flowAria: 'Practice flow',
    flow: [['Select a target', 'Check prerequisites and current progress'], ['Answer independently', 'Complete the full form'], ['Review the diagnosis', 'Identify correct and incorrect rules'], ['Adjust practice', 'Update the focus or schedule a retest']],
  },
  knowledge: {
    intro: 'A skill is one rule that the system tracks separately. Word class, stem changes, sound changes, and suffix rules can each be skills.',
    sound: ['A sound change occurs when a suffix joins a word. For example, ', ' becomes ', '. The ending ', ' changes to ', '.'],
    shared: 'The same rule can occur in several courses. The courses share one record for that rule. You do not restart it in each course.',
    caption: ['Three forms share the step “', '”'],
    example: 'A combined question also requires the earlier changes. The system separately records combined use and required-form coverage.',
    coverage: 'Coverage means that you answered the required forms independently. An application can require one correct past, negative, and negative-past answer.',
    independent: 'One independent full answer can update several form skills. Classification questions check word class. A correct form does not prove your classification process.',
  },
  courses: {
    body: [
      'Course groups show what you learn. The recommended order shows what to learn first. Unlocking checks each skill prerequisite.',
      'A prerequisite is a basic rule that you must master before you learn another rule.',
      'An earlier course is not always a prerequisite. New forms and later changes in one course can unlock at different times.',
    ],
    example: ['For example, the system requires mastery of ', ' before it introduces the contracted form ', '. You can gain enough evidence for ', ' in combined questions. The course can then start with ', '.'],
    end: ['The current rules do not require a set number of separate questions for each basic form. Combined questions also update shared rules.', 'When another course is available, you can temporarily skip the current course. The course change keeps your existing progress.'],
  },
  selection: {
    intro: 'Regular practice handles pending retests and skill learning. An available independent retest has priority. Otherwise, the system inserts spacing questions or assisted practice.',
    lead: 'When no retest has priority, adaptive practice selects the focus in this order:',
    order: ['Restore a previously mastered skill that declined and has an available question.', 'Continue the current course. If it is no longer applicable, select the earliest available recommended course.', 'Check course prerequisites. Practice a missing basic rule before the course rule.', 'Select an unmastered available skill with the lowest mastery.'],
    words: ['The system first fills missing form coverage. It then considers a new word. It avoids words from the latest ', ' questions when possible. A small question set can reuse a word.'],
    cadenceTitle: 'Plan for a regular round', focus: 'Current focus', balance: 'Mixed practice',
    cadence: 'A group of four positions usually contains three focus questions and one mixed question. Retests, prerequisites, and available questions can change this order.',
    round: 'A regular round has at most 12 questions. It can end early when no different question can advance progress. A mastered focus triggers a new plan.',
  },
  mastery: {
    intro: 'Mastery is a progress score that the system calculates from your answers. It helps the system compare skills and decide what to practice.',
    warning: 'A mastery score of 80% does not mean an 80% chance of a correct next answer.',
    threshold: ['For a regular skill, ', ' consecutive independent correct answers can reach the basic score threshold. Extra prerequisites or coverage requirements must also pass.'],
    separate: 'The system records the skill score and full-question result separately. After an error, it can record some correct steps or leave the cause unknown.',
    labels: '“Focus mastery” describes the current focus. “Course skills mastered” counts mastered course skills. “Knowledge progress” counts unique skills across the site.',
    complete: 'Course completion also requires no pending retest from regular practice. A review course can require additional full-question answers.',
  },
  demo: {
    initial: 'Select an answer to see how mastery changes.', correct: 'One independent correct answer. The demo updated mastery.',
    incorrect: 'The system assigned one error to this skill. The demo updated mastery.', assisted: 'One assisted correct answer. Independent mastery did not change.', reset: 'The demo reset.',
    title: 'Try it: answers for one skill', description: 'The demo starts at zero and calculates one regular skill. This example has no extra coverage requirement.',
    mastery: 'Demo mastery', attempts: 'Independent answers', correctLabel: 'Independent correct', assistedLabel: 'Assisted correct', incorrectButton: 'Assigned error', resetButton: 'Reset demo',
    caption: 'This demo is separate from practice. Its controls do not change your learning record.',
  },
  technical: {
    summary: 'Show the mastery calculation',
    intro: 'A regular skill uses a weighted recent accuracy. An independent correct answer is 1. An assigned error is 0. The first record uses its result.',
    weighted: 'new weighted accuracy = {oldWeight} × old value + {newWeight} × current result',
    formula: 'mastery = min(1, weighted accuracy ÷ {target} × min(independent answers ÷ {attempts}, 1))',
    min: 'The min function selects the smaller value. The page shows 100% when mastery is 1.',
    coverage: 'Some skills require one correct answer for each specified form. Missing coverage limits mastery to 99%. Coverage-only skills use coverage and recent results.',
    prerequisite: 'Some combined skills also require mastered prerequisites. A combined skill cannot show mastery until its prerequisites pass.', source: 'View the current calculation rules',
  },
  diagnosis: {
    intro: ['The answer check first compares your answer with the target form and supported variants. It accepts kanji and all-kana answers.', 'Your answer can be another complete form of the same word. The system then tries to identify that form. Multiple possible causes stay unconfirmed.'],
    rules: ['When the system identifies an error, it updates only that rule and the steps that the answer completed correctly.', 'When the cause is unclear, the system does not mark the focus skill as incorrect. A step exercise checks the remaining changes.', 'You can correct an input that matches the typo rules. The new submission does not count as another full-question answer.'],
    end: ['A step exercise supplies an intermediate form, word class, or local target. This information reduces difficulty, so the result counts as assisted practice.', 'Correct step answers do not change the original result. The original question keeps its pending retest until a later independent full answer passes.'],
  },
  retest: {
    intro: 'An incorrect answer, revealed answer, or hint creates a pending retest. Closing a viewed hint does not remove its use.', lead: 'An independent retest must meet all these conditions:',
    conditions: ['Use the same target form and the same change steps.', 'Usually use a different word. The system allows the same word when only one word supports those steps.', 'After the latest answer or assisted practice for that target, complete two full questions for other targets.', 'Give the complete form independently without a hint.'],
    end: ['Spacing uses answer order. It does not require a new day. An early repeat counts as assisted practice and restarts the spacing count.', 'A form restriction can leave no available question for the same steps. The system then suspends the task. Suspension does not mean success.'],
  },
  challenge: ['Free Challenge lets you select an advanced course directly. You can also select several courses for rotating practice. Prerequisites do not lock this mode.', 'Free Challenge has no 12-question round limit. It continues until you end it. A small question set can repeat after you use each question.', 'Independent challenge answers still update shared skills. A new challenge retest stays in challenge until you add it to regular practice.', 'A regular pending retest stays there when you enter challenge. Each mode clears its task only after an independent retest meets the conditions.'],
  examples: ['A word can support a form rule but still have an unsuitable meaning for that form. The system filters each word sense and target form.', 'A usage card matches one word sense and target form. It shows a short scenario and gap sentence before the answer. It then shows the translation.', 'Some expressions need a specific role, time, or register. Their example must supply that condition. A suspended pair is unsuitable for current practice.', 'Question filtering and form recognition are separate. After a pair leaves the question set, the checker can still recognize its complete form.'],
  records: ['The current browser stores your learning record. The site has no account sync. Export a JSON backup before you move to another device.', 'The statistics page shows answers, active time, and mastery trends. Time on this page does not count. Statistics do not affect selection or unlocking.', 'The answer log stores questions, steps, and score changes. The log keeps a limited number of entries. Old backups can also lack question records.', 'Therefore, a total score cannot always reproduce the full answer history. The system keeps available data and identifies evidence that it cannot check.'],
  limits: ['Mastery means that the current record meets the site rules. It does not guarantee that you will remember the skill later.', 'The system does not use a forgetting curve. It does not schedule reviews from the number of days since practice.', 'Answer speed does not change mastery, question selection, or unlocking.', 'A correct form gives evidence for form construction. It does not prove full knowledge of syntax and usage.', 'A combined question can update several skills. These scores do not equal the same number of separate questions for each skill.', 'Diagnosis covers only implemented rules. An unidentified error can still need a human explanation.', 'The model parameters are site settings. This page does not present them as calibrated ability measurements.'],
  sources: {
    intro: 'Course content refers to Yokubi. The adaptive practice design refers to kanabr. The current implementation defines scoring, diagnosis, and retest rules.',
    yokubiUrl: 'https://yoku.bi/', yokubi: 'Yokubi: course content', kanabr: 'kanabr: adaptive practice reference',
    files: [['app/lib/unified-curriculum.mjs', 'Course groups and recommended order'], ['app/lib/practice-session.mjs', 'Practice focus and round plans'], ['app/lib/adaptive.mjs', 'Mastery and prerequisite checks'], ['app/lib/learning-evidence.mjs', 'Scores for independent and assisted practice'], ['app/lib/learning-assessment.mjs', 'Independent retest conditions'], ['app/lib/form-eligibility.mjs', 'Word-sense and question restrictions']],
  },
  footer: 'Continue practice with your current progress.',
};

export const PRINCIPLES_COPY = { 'zh-CN': ZH, en: EN };

// Keep the original export for callers that expect Chinese section titles.
export const PRINCIPLE_SECTIONS = PRINCIPLE_SECTION_IDS.map(id => [id, ZH.titles[id]]);

export function getPrincipleSections(locale = 'zh-CN') {
  const copy = PRINCIPLES_COPY[locale] ?? ZH;
  return PRINCIPLE_SECTION_IDS.map(id => [id, copy.titles[id]]);
}

export function principlesSectionFromHash(hash) {
  if (hash !== '#/principles' && !hash.startsWith('#/principles/')) return null;
  const section = hash.slice('#/principles/'.length);
  return PRINCIPLE_SECTION_IDS.includes(section) ? section : '';
}

const jp = text => h('span', { lang: 'ja' }, text);
const p = (...children) => h('p', null, ...children);
const list = (tag, items) => h(tag, null, items.map((item, i) => h('li', { key: i }, item)));
const external = (url, label) => h('a', { href: url, target: '_blank', rel: 'noreferrer' }, label, ' ↗');
const source = (file, label) => external(`https://github.com/L-M-Sherlock/katsuyo-dojo/blob/main/${file}`, label);

function format(template, values) {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template);
}

function Section({ id, copy, children }) {
  return h('section', { 'aria-labelledby': `principles-${id}` },
    h('h2', { id: `principles-${id}`, tabIndex: -1 },
      h('a', { href: `#/principles/${id}`, 'aria-hidden': true, tabIndex: -1 }, '§'),
      copy.titles[id]), children);
}

function Contents({ copy, mobile = false, section }) {
  const links = h('nav', { 'aria-label': mobile ? copy.mobileTocAria : copy.tocAria },
    PRINCIPLE_SECTION_IDS.map((id, i) => h('a', {
      href: `#/principles/${id}`, key: id, 'aria-current': section === id ? 'location' : undefined,
    }, h('span', { 'aria-hidden': true }, String(i + 1).padStart(2, '0')), copy.titles[id])));
  return mobile ? h('details', { className: 'principles-toc-mobile' }, h('summary', null, copy.toc), links)
    : h('aside', { className: 'principles-toc' }, h('p', null, copy.toc), links);
}

function MasteryDemo({ copy }) {
  const [state, setState] = useState(() => ({ stats: emptySkillStats(), assisted: 0, status: 'initial' }));
  const percent = Math.round(state.stats.confidence * 100);
  function answer(correct) {
    setState(previous => ({
      ...previous,
      stats: updateSkillStats(previous.stats, { correct }),
      status: correct ? 'correct' : 'incorrect',
    }));
  }
  return h('figure', { className: 'principles-demo', 'aria-labelledby': 'mastery-demo-title' },
    h('figcaption', { id: 'mastery-demo-title' }, copy.title),
    p(copy.description),
    h('div', { className: 'principles-demo-score' }, h('strong', null, `${percent}%`), h('span', null, copy.mastery)),
    h('div', {
      className: 'principles-demo-track', role: 'progressbar', 'aria-label': copy.mastery,
      'aria-valuenow': percent, 'aria-valuemin': 0, 'aria-valuemax': 100,
    }, h('span', { style: { width: `${percent}%` } })),
    h('dl', { className: 'principles-demo-counts' },
      h('div', null, h('dt', null, copy.attempts), h('dd', null, state.stats.attempts)),
      h('div', null, h('dt', null, copy.correctLabel), h('dd', null, state.stats.correct)),
      h('div', null, h('dt', null, copy.assistedLabel), h('dd', null, state.assisted))),
    h('div', { className: 'principles-demo-actions' },
      h('button', { type: 'button', onClick: () => answer(true) }, copy.correctLabel),
      h('button', { type: 'button', onClick: () => answer(false) }, copy.incorrectButton),
      h('button', {
        type: 'button',
        onClick: () => setState(previous => ({ ...previous, assisted: previous.assisted + 1, status: 'assisted' })),
      }, copy.assistedLabel),
      h('button', {
        type: 'button',
        onClick: () => setState({ stats: emptySkillStats(), assisted: 0, status: 'reset' }),
      }, copy.resetButton)),
    h('p', { className: 'principles-demo-status', role: 'status' }, copy[state.status]),
    h('p', { className: 'principles-caption' }, copy.caption));
}

function TechnicalDetails({ copy }) {
  return h('details', { className: 'principles-technical' }, h('summary', null, copy.summary),
    p(copy.intro),
    h('code', null, format(copy.weighted, {
      oldWeight: 1 - adaptiveConstants.emaAlpha,
      newWeight: adaptiveConstants.emaAlpha,
    })),
    h('code', null, format(copy.formula, {
      target: adaptiveConstants.accuracyTarget,
      attempts: adaptiveConstants.minAttempts,
    })),
    p(copy.min), p(copy.coverage), p(copy.prerequisite),
    source('app/lib/adaptive.mjs', copy.source));
}

export default function PrinciplesPage({ locale = 'zh-CN', section = '', onBack, backLabel }) {
  const resolvedLocale = locale === 'en' ? 'en' : 'zh-CN';
  const copy = PRINCIPLES_COPY[resolvedLocale];
  const resolvedBackLabel = backLabel ?? copy.back;
  return h('div', { className: 'principles-page', lang: resolvedLocale },
    h('div', { className: 'principles-layout' },
      h(Contents, { copy, section }),
      h('article', { className: 'principles-article' },
        h('header', { className: 'principles-hero' },
          h('div', { className: 'principles-heading-row' },
            h('p', { className: 'eyebrow' }, copy.eyebrow),
            h('button', { className: 'principles-back', type: 'button', onClick: onBack }, resolvedBackLabel, ' →')),
          h('h1', { id: 'principles-title', tabIndex: -1 }, copy.title[0], jp(copy.title[1]), copy.title[2]),
          h('p', { className: 'principles-deck' }, copy.deck),
          h('dl', { className: 'principles-meta' },
            ...copy.meta.map(([term, description]) => h('div', { key: term }, h('dt', null, term), h('dd', null, description))))),
        h(Contents, { copy, mobile: true, section }),
        h(Section, { id: 'scope', copy },
          ...copy.scope.body.map(text => p(text)),
          h('ol', { className: 'principles-flow', 'aria-label': copy.scope.flowAria },
            ...copy.scope.flow.map(([title, text], i) => h('li', { key: title },
              h('span', { 'aria-hidden': true }, `0${i + 1}`), h('strong', null, title), h('small', null, text))))),
        h(Section, { id: 'knowledge', copy },
          p(copy.knowledge.intro),
          p(copy.knowledge.sound[0], jp('書く'), copy.knowledge.sound[1], jp('書いて'), copy.knowledge.sound[2], jp('く'), copy.knowledge.sound[3], jp('い'), copy.knowledge.sound[4]),
          p(copy.knowledge.shared),
          h('figure', { className: 'principles-example' },
            h('figcaption', null, copy.knowledge.caption[0], jp('い → かった'), copy.knowledge.caption[1]),
            ...[['高い', '高かった'], ['読まない', '読まなかった'], ['読みたい', '読みたかった']].map(([from, to]) =>
              h('div', { key: from, className: 'principles-word-pair' }, jp(from), h('span', { 'aria-hidden': true }, '→'), jp(to))),
            p(copy.knowledge.example)),
          p(copy.knowledge.coverage), p(copy.knowledge.independent)),
        h(Section, { id: 'courses', copy },
          ...copy.courses.body.map(text => p(text)),
          p(copy.courses.example[0], jp('ている'), copy.courses.example[1], jp('てる'), copy.courses.example[2],
            jp('ている'), copy.courses.example[3], jp('てる'), copy.courses.example[4]),
          ...copy.courses.end.map(text => p(text))),
        h(Section, { id: 'selection', copy },
          p(copy.selection.intro), p(copy.selection.lead), list('ol', copy.selection.order),
          p(copy.selection.words[0], String(RECENT_WORD_LIMIT), copy.selection.words[1]),
          h('figure', { className: 'principles-cadence' },
            h('figcaption', null, copy.selection.cadenceTitle),
            h('div', { className: 'principles-cadence-slots' },
              ...[copy.selection.focus, copy.selection.focus, copy.selection.focus, copy.selection.balance].map((label, i) =>
                h('span', { key: i, className: i === 3 ? 'balance' : '' }, label))),
            p(copy.selection.cadence)),
          p(copy.selection.round)),
        h(Section, { id: 'mastery', copy },
          p(copy.mastery.intro), h('blockquote', null, copy.mastery.warning),
          p(copy.mastery.threshold[0], String(adaptiveConstants.minAttempts), copy.mastery.threshold[1]),
          p(copy.mastery.separate), h(MasteryDemo, { copy: copy.demo }), h(TechnicalDetails, { copy: copy.technical }),
          p(copy.mastery.labels), p(copy.mastery.complete)),
        h(Section, { id: 'diagnosis', copy },
          ...copy.diagnosis.intro.map(text => p(text)), list('ul', copy.diagnosis.rules), ...copy.diagnosis.end.map(text => p(text))),
        h(Section, { id: 'retest', copy },
          p(copy.retest.intro), p(copy.retest.lead), list('ol', copy.retest.conditions), ...copy.retest.end.map(text => p(text))),
        h(Section, { id: 'challenge', copy }, ...copy.challenge.map(text => p(text))),
        h(Section, { id: 'examples', copy }, ...copy.examples.map(text => p(text))),
        h(Section, { id: 'records', copy }, ...copy.records.map(text => p(text))),
        h(Section, { id: 'limits', copy }, list('ul', copy.limits)),
        h(Section, { id: 'sources', copy }, p(copy.sources.intro),
          list('ul', [
            external(copy.sources.yokubiUrl, copy.sources.yokubi),
            external('https://l-m-sherlock.github.io/kanabr/', copy.sources.kanabr),
            ...copy.sources.files.map(([file, label]) => source(file, label)),
          ])),
        h('footer', { className: 'principles-footer' }, p(copy.footer),
          h('button', { type: 'button', className: 'principles-back', onClick: onBack }, resolvedBackLabel, ' →')))));
}
