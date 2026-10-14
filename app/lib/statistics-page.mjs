import { createElement as h, useMemo, useState } from 'react';
import { emptyCounters, statisticsSeries, statisticsSnapshot, localDay } from './statistics.mjs';
import { componentConfidence, isComponentMastered } from './adaptive.mjs';
import { normalizeLocale } from './i18n/locales.mjs';
import { summarizeUnifiedCourse } from './unified-progress.mjs';

export const STATISTICS_MESSAGES = Object.freeze({
  'zh-CN': Object.freeze({
    'statistics.eyebrow': 'LEARNING STATISTICS',
    'statistics.title': '学习统计',
    'statistics.intro': '看看练习如何积累成进步。',
    'statistics.back': '返回练习',
    'statistics.scope.aria': '统计范围',
    'statistics.scope.all': '全部',
    'statistics.scope.verb': '动词',
    'statistics.scope.adjective': '形容词',
    'statistics.empty.range': '当前范围暂无记录',
    'statistics.empty.table': '暂无记录',
    'statistics.single': '继续练习后会显示变化趋势',
    'statistics.chart.aria': '{title}，具体数值见下方趋势数据表',
    'statistics.chart.tooltip': '{label}：{value}',
    'statistics.table.aria': '数据表：{headers}',
    'statistics.cards.questions': '已记录原题',
    'statistics.cards.questionsEarly': '包含无法分配日期的早期累计',
    'statistics.cards.questionsDetail': '有效原题提交，拆步不增加题数',
    'statistics.cards.accuracy': '独立正确率',
    'statistics.cards.accuracyDetail': '{correct} / {total} 道无辅助整题',
    'statistics.cards.activeTime': '有效练习时间',
    'statistics.cards.activeTimeDetail': '仅新版计时，不含后台或长时间闲置',
    'statistics.cards.completedCourses': '已完成课程',
    'statistics.cards.current': '当前状态',
    'statistics.cards.mastered': '已掌握知识点',
    'statistics.cards.masteredDetail': '当前已解锁 {count} 项；共享规则不重复计数',
    'statistics.cards.pending': '待独立复测',
    'statistics.cards.pendingDetail.one': '当前状态；另有 {count} 项已暂停',
    'statistics.cards.pendingDetail.other': '当前状态；另有 {count} 项已暂停',
    'statistics.provenance.start': '用时和掌握趋势从 {date} 开始记录。',
    'statistics.provenance.partial.one': '早期历史不完整；趋势从可还原的 {from} 展示，{count} 道早期原题缺少日期分布。',
    'statistics.provenance.partial.other': '早期历史不完整；趋势从可还原的 {from} 展示，{count} 道早期原题缺少日期分布。',
    'statistics.provenance.partialNoCount': '早期历史不完整；趋势从可还原的 {from} 开始展示。',
    'statistics.provenance.newRecords': '新版记录',
    'statistics.provenance.complete': '尚未作答的日期不计算正确率。',
    'statistics.provenance.effect': '统计不影响评分、解锁或选题。',
    'statistics.trends.title': '练习趋势',
    'statistics.trends.axis': '横轴',
    'statistics.trends.axisDate': '日期',
    'statistics.trends.axisOrdinal': '作答顺序',
    'statistics.trends.range': '范围',
    'statistics.trends.days7': '近 7 天',
    'statistics.trends.days30': '近 30 天',
    'statistics.trends.days90': '近 90 天',
    'statistics.trends.questions100': '最近 100 题',
    'statistics.trends.questions500': '最近 500 题',
    'statistics.trends.all': '全部',
    'statistics.trends.dateNote': '保留近一年的日汇总，更早按月合并。缺失历史不补零；图表从可用样本开始。标有 * 的区间只有部分记录。',
    'statistics.trends.ordinalNote': '近期每 20 道原题汇总；完整历史按题号区间聚合。历史缺失不会补成零。',
    'statistics.trends.questions': '原题数量',
    'statistics.trends.accuracy': '独立正确率',
    'statistics.trends.mastered': '已掌握知识点',
    'statistics.trends.meanTime': '独立正确作答平均耗时',
    'statistics.trends.masteryBaseline': '这是当前基线；后续练习会形成掌握趋势',
    'statistics.trends.timeEmpty': '旧记录没有耗时；新版独立答对后开始展示',
    'statistics.trends.showData': '查看趋势数据',
    'statistics.trends.interval': '区间',
    'statistics.trends.activeTime': '有效用时',
    'statistics.trends.answerTime': '平均答题耗时',
    'statistics.trends.masteredShort': '已掌握',
    'statistics.units.questions.one': '{count} 题',
    'statistics.units.questions.other': '{count} 题',
    'statistics.units.items.one': '{count} 项',
    'statistics.units.items.other': '{count} 项',
    'statistics.courses.title': '课程概览',
    'statistics.courses.note': '课程状态为当前值；作答与正确率为累计值。耗时仅含新版记录的独立正确作答。',
    'statistics.courses.course': '课程',
    'statistics.courses.status': '当前状态',
    'statistics.courses.questions': '累计原题',
    'statistics.courses.meanTime': '平均耗时',
    'statistics.courseStatus.locked': '未解锁',
    'statistics.courseStatus.pending.one': '待复测 {count} 项',
    'statistics.courseStatus.pending.other': '待复测 {count} 项',
    'statistics.courseStatus.complete': '已达标',
    'statistics.courseStatus.review': '综合复习 {done}/{total}',
    'statistics.courseStatus.progress': '达标 {done}/{total}',
    'statistics.weak.title': '当前薄弱知识点',
    'statistics.weak.view': '查看知识进度',
    'statistics.weak.note': '只列出已练习且尚未达标的知识点；尚未作答的内容不判为薄弱项。',
    'statistics.weak.knowledge': '知识点',
    'statistics.weak.mastery': '当前掌握度',
    'statistics.weak.errors': '已记录归因错误',
    'statistics.weak.coverage': '缺失覆盖',
    'statistics.weak.empty': '已练习知识点暂无薄弱项',
    'statistics.errors.title': '错因分布',
    'statistics.errors.note': '仅统计可还原记录及新版明确诊断；一道错题不会计到全部关联知识点。',
    'statistics.errors.cause': '错因',
    'statistics.errors.count': '次数',
    'statistics.errors.targetForm': '答成其他完整形式',
    'statistics.errors.unattributed': '未能明确归因',
    'statistics.help.title': '帮助与独立复测',
    'statistics.help.note': '原题累计区分独立与辅助；提示、拆步和复测明细仅含可还原记录及新版统计。',
    'statistics.help.item': '项目',
    'statistics.help.result': '已记录结果',
    'statistics.help.correct': '原题答对',
    'statistics.help.assistedCorrect': '辅助原题答对',
    'statistics.help.hints': '查看提示',
    'statistics.help.revealed': '揭晓答案',
    'statistics.help.steps': '拆步答对',
    'statistics.help.retries': '输入重试',
    'statistics.help.retests': '合格独立复测',
    'statistics.help.retestCorrect': '复测答对并解除',
    'statistics.help.retestRate': '复测成功率',
    'statistics.help.assistedRetests': '复测中的辅助作答',
    'statistics.help.times.one': '{count} 次',
    'statistics.help.times.other': '{count} 次',
    'statistics.footer': '数据保存在当前浏览器，随学习进度备份一起导出。近期精简统计保留 1,000 道原题；原始作答日志保留最多 500 条。',
  }),
  en: Object.freeze({
    'statistics.eyebrow': 'LEARNING STATISTICS',
    'statistics.title': 'Learning statistics',
    'statistics.intro': 'See how your practice builds progress.',
    'statistics.back': 'Back to practice',
    'statistics.scope.aria': 'Statistics scope',
    'statistics.scope.all': 'All',
    'statistics.scope.verb': 'Verbs',
    'statistics.scope.adjective': 'Adjectives',
    'statistics.empty.range': 'No records in this range',
    'statistics.empty.table': 'No records',
    'statistics.single': 'Continue practicing to see a trend.',
    'statistics.chart.aria': '{title}. Exact values are in the trend data table below.',
    'statistics.chart.tooltip': '{label}: {value}',
    'statistics.table.aria': 'Data table: {headers}',
    'statistics.cards.questions': 'Questions recorded',
    'statistics.cards.questionsEarly': 'Includes earlier totals without dates',
    'statistics.cards.questionsDetail': 'Valid question submissions. Guided steps do not add questions.',
    'statistics.cards.accuracy': 'Independent accuracy',
    'statistics.cards.accuracyDetail': 'Correct without help: {correct} / {total}',
    'statistics.cards.activeTime': 'Active practice time',
    'statistics.cards.activeTimeDetail': 'New timing data only. Background and long idle periods are excluded.',
    'statistics.cards.completedCourses': 'Courses completed',
    'statistics.cards.current': 'Current status',
    'statistics.cards.mastered': 'Knowledge points mastered',
    'statistics.cards.masteredDetail': 'Currently unlocked: {count}. Shared rules are counted once.',
    'statistics.cards.pending': 'Independent retests due',
    'statistics.cards.pendingDetail.one': 'Current status. {count} more is suspended.',
    'statistics.cards.pendingDetail.other': 'Current status. {count} more are suspended.',
    'statistics.provenance.start': 'Time and mastery trends have been recorded since {date}.',
    'statistics.provenance.partial.one': 'Earlier history is incomplete. Trends start with recoverable records from {from}. {count} earlier question has no date distribution.',
    'statistics.provenance.partial.other': 'Earlier history is incomplete. Trends start with recoverable records from {from}. {count} earlier questions have no date distribution.',
    'statistics.provenance.partialNoCount': 'Earlier history is incomplete. Trends start with recoverable records from {from}.',
    'statistics.provenance.newRecords': 'the new records',
    'statistics.provenance.complete': 'Days without answers are excluded from accuracy.',
    'statistics.provenance.effect': 'Statistics do not affect scoring, unlocking, or question selection.',
    'statistics.trends.title': 'Practice trends',
    'statistics.trends.axis': 'Horizontal axis',
    'statistics.trends.axisDate': 'Date',
    'statistics.trends.axisOrdinal': 'Answer order',
    'statistics.trends.range': 'Range',
    'statistics.trends.days7': 'Last 7 days',
    'statistics.trends.days30': 'Last 30 days',
    'statistics.trends.days90': 'Last 90 days',
    'statistics.trends.questions100': 'Last 100 questions',
    'statistics.trends.questions500': 'Last 500 questions',
    'statistics.trends.all': 'All',
    'statistics.trends.dateNote': 'Daily summaries are kept for one year. Earlier records are grouped by month. Missing history is not counted as zero. Charts start with the first available sample. An asterisk marks a partial interval.',
    'statistics.trends.ordinalNote': 'Recent questions are grouped in sets of 20. Full history is grouped by question-number range. Missing history is not counted as zero.',
    'statistics.trends.questions': 'Questions',
    'statistics.trends.accuracy': 'Independent accuracy',
    'statistics.trends.mastered': 'Knowledge points mastered',
    'statistics.trends.meanTime': 'Mean time for correct independent answers',
    'statistics.trends.masteryBaseline': 'This is the current baseline. More practice will show a mastery trend.',
    'statistics.trends.timeEmpty': 'Older records have no timing data. Timing appears after a correct independent answer.',
    'statistics.trends.showData': 'Show trend data',
    'statistics.trends.interval': 'Interval',
    'statistics.trends.activeTime': 'Active time',
    'statistics.trends.answerTime': 'Mean answer time',
    'statistics.trends.masteredShort': 'Mastered',
    'statistics.units.questions.one': '{count} question',
    'statistics.units.questions.other': '{count} questions',
    'statistics.units.items.one': '{count} point',
    'statistics.units.items.other': '{count} points',
    'statistics.courses.title': 'Course overview',
    'statistics.courses.note': 'Course status shows the current state. Question and accuracy totals are cumulative. Time includes only correct independent answers from new records.',
    'statistics.courses.course': 'Course',
    'statistics.courses.status': 'Current status',
    'statistics.courses.questions': 'Questions',
    'statistics.courses.meanTime': 'Mean time',
    'statistics.courseStatus.locked': 'Locked',
    'statistics.courseStatus.pending.one': '{count} retest due',
    'statistics.courseStatus.pending.other': '{count} retests due',
    'statistics.courseStatus.complete': 'Mastered',
    'statistics.courseStatus.review': 'Mixed review {done}/{total}',
    'statistics.courseStatus.progress': 'Mastered {done}/{total}',
    'statistics.weak.title': 'Current weak points',
    'statistics.weak.view': 'View knowledge progress',
    'statistics.weak.note': 'This list includes practiced knowledge points that are not yet mastered. Unanswered material is not marked as weak.',
    'statistics.weak.knowledge': 'Knowledge point',
    'statistics.weak.mastery': 'Current mastery',
    'statistics.weak.errors': 'Attributed errors',
    'statistics.weak.coverage': 'Missing coverage',
    'statistics.weak.empty': 'No practiced knowledge points are currently weak.',
    'statistics.errors.title': 'Error causes',
    'statistics.errors.note': 'This table includes recoverable records and explicit diagnoses from new records. One incorrect answer is not assigned to every related knowledge point.',
    'statistics.errors.cause': 'Cause',
    'statistics.errors.count': 'Count',
    'statistics.errors.targetForm': 'Answered with a different complete form',
    'statistics.errors.unattributed': 'No specific cause identified',
    'statistics.help.title': 'Help and independent retests',
    'statistics.help.note': 'Question totals separate independent and assisted answers. Hint, guided-step, and retest details include only recoverable records and new statistics.',
    'statistics.help.item': 'Item',
    'statistics.help.result': 'Recorded result',
    'statistics.help.correct': 'Questions answered correctly',
    'statistics.help.assistedCorrect': 'Assisted questions answered correctly',
    'statistics.help.hints': 'Hints viewed',
    'statistics.help.revealed': 'Answers revealed',
    'statistics.help.steps': 'Guided steps answered correctly',
    'statistics.help.retries': 'Input retries',
    'statistics.help.retests': 'Eligible independent retests',
    'statistics.help.retestCorrect': 'Retests passed and cleared',
    'statistics.help.retestRate': 'Retest success rate',
    'statistics.help.assistedRetests': 'Assisted answers during retests',
    'statistics.help.times.one': '{count} time',
    'statistics.help.times.other': '{count} times',
    'statistics.footer': 'Data is stored in this browser and exported with the learning-progress backup. Compact recent statistics keep 1,000 questions. The raw answer log keeps up to 500 entries.',
  }),
});

function interpolate(message, params = {}) {
  return message.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (token, name) => (
    Object.hasOwn(params, name) ? String(params[name]) : token
  ));
}

const HAN_TEXT = /\p{Script=Han}/u;

function createTranslator(locale, external) {
  const language = locale === 'en' ? 'en' : 'zh-CN';
  return (key, params = {}) => {
    const translated = external?.(key, params);
    if (typeof translated === 'string' && translated.trim() && translated !== key && (language !== 'en' || !HAN_TEXT.test(translated))) return translated;
    return interpolate(STATISTICS_MESSAGES[language][key] ?? STATISTICS_MESSAGES['zh-CN'][key] ?? key, params);
  };
}

function createFormatters(locale) {
  const language = locale === 'en' ? 'en' : 'zh-CN';
  const numberFormat = new Intl.NumberFormat(language);
  const percentFormat = new Intl.NumberFormat(language, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const unit = (value, name, digits = 0) => new Intl.NumberFormat(language, { style: 'unit', unit: name, unitDisplay: 'long', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  return {
    number: value => numberFormat.format(value),
    percentage: (part, total) => total ? percentFormat.format(part / total) : '—',
    duration: ms => ms >= 3_600_000 ? unit(ms / 3_600_000, 'hour', 1) : ms >= 60_000 ? unit(Math.floor(ms / 60_000), 'minute') : unit(Math.floor(ms / 1000), 'second'),
    meanTime: counts => counts.answerSamples ? unit(counts.answerMs / counts.answerSamples / 1000, 'second', 1) : '—',
    seconds: value => unit(value, 'second', 1),
    date: value => new Intl.DateTimeFormat(language, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(value),
    month: value => new Intl.DateTimeFormat(language, { year: 'numeric', month: 'short', timeZone: 'UTC' }).format(value),
  };
}

function dateFromKey(key) { return new Date(`${key}T12:00:00Z`); }

function formatPointLabel(label, axis, formats) {
  if (axis !== 'date') return label.replace(/\d+/g, value => formats.number(Number(value)));
  return label.split(' … ').map(value => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formats.date(dateFromKey(value));
    if (/^\d{4}-\d{2}$/.test(value)) return formats.month(dateFromKey(`${value}-01`));
    return value;
  }).join(' … ');
}

function LineChart({ title, points, value, format, formatLabel, formatNumber, color, ariaLabel, tooltip, max = null, emptyMessage, singleMessage }) {
  const first = points.findIndex(point => value(point) !== null);
  const last = points.findLastIndex(point => value(point) !== null);
  const visible = first < 0 ? [] : points.slice(first, last + 1);
  const values = visible.map(value), numbers = values.filter(value => value !== null);
  const width = 600, height = 180, left = 56, right = 16, top = 18, bottom = 20;
  const peak = Math.max(1, ...numbers), magnitude = 10 ** Math.floor(Math.log10(peak));
  const ceiling = max ?? Math.ceil(peak / magnitude) * magnitude;
  const x = index => left + index * (width - left - right) / Math.max(1, visible.length - 1);
  const y = value => height - bottom - value / ceiling * (height - top - bottom);
  let connected = false;
  const path = values.map((value, index) => { if (value === null) { connected = false; return ''; } const segment = `${connected ? 'L' : 'M'}${x(index)},${y(value)}`; connected = true; return segment; }).join(' ');
  return h('figure', { className: 'statistics-chart' }, h('figcaption', null, title),
    !numbers.length ? h('div', { className: 'statistics-empty' }, h('span', null, emptyMessage))
      : numbers.length === 1 ? h('div', { className: 'statistics-single' }, h('strong', { style: { color } }, format(numbers[0])), h('span', null, formatLabel(visible[0].label)), h('small', null, singleMessage))
        : h('div', null, h('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': ariaLabel },
          [0, ceiling / 2, ceiling].map(tick => h('g', { key: tick },
            h('line', { x1: left, y1: y(tick), x2: width - right, y2: y(tick), stroke: '#d9d5ca', strokeDasharray: tick ? '4 4' : undefined }),
            h('text', { x: left - 10, y: y(tick), dy: '.35em', textAnchor: 'end', fontSize: 13, fill: '#717971' }, formatNumber(Number(tick.toFixed(1)))))),
          h('path', { d: path, stroke: color, fill: 'none', strokeWidth: 2.5 }),
          values.map((v, i) => v === null ? null : h('circle', { key: i, cx: x(i), cy: y(v), r: 3.5, fill: color }, h('title', null, tooltip(formatLabel(visible[i].label), format(v)))))),
          h('div', { className: 'statistics-chart-axis' }, h('span', null, formatLabel(visible[0].label)), h('span', null, formatLabel(visible.at(-1).label)))));
}

function Table({ headers, rows, ariaLabel, empty }) {
  return h('div', { className: 'statistics-table-scroll', tabIndex: 0, role: 'region', 'aria-label': ariaLabel },
    h('table', { className: 'statistics-table' }, h('thead', null, h('tr', null, headers.map(label => h('th', { key: label, scope: 'col' }, label)))),
      h('tbody', null, rows.length ? rows.map((row, index) => h('tr', { key: index }, row.map((cell, column) => h(column ? 'td' : 'th', { key: column, ...(column ? {} : { scope: 'row' }) }, cell)))) : h('tr', null, h('td', { colSpan: headers.length }, empty)))));
}

/**
 * @param {{profile:any, model:any, courses:any[], onBack:()=>void, onKnowledge:()=>void,
 * backLabel?:string, locale?:string, t?:(key:string, params?:Record<string,unknown>)=>string,
 * courseLabel?:(course:any, locale:string)=>string, knowledgeLabel?:(knowledge:any, locale:string)=>string,
 * courseStatusLabel?:(status:string, summary:any, course:any, locale:string)=>string}} props
 */
export default function StatisticsPage({ profile, model, courses, onBack, onKnowledge, backLabel, locale = 'zh-CN', t: externalT, courseLabel, knowledgeLabel, courseStatusLabel }) {
  const language = normalizeLocale(locale) ?? 'zh-CN';
  const t = useMemo(() => createTranslator(language, externalT), [language, externalT]);
  const formats = useMemo(() => createFormatters(language), [language]);
  const pluralRules = useMemo(() => new Intl.PluralRules(language), [language]);
  const plural = (key, count, params = {}) => t(`${key}.${pluralRules.select(count)}`, { ...params, count: formats.number(count) });
  const [domain, setDomain] = useState('all'), [axis, setAxis] = useState('date'), [range, setRange] = useState('30');
  const s = profile.statistics;
  const points = useMemo(() => statisticsSeries(s, axis, range, domain), [s, axis, range, domain]);
  const counts = domain === 'all' ? s.totals : s.domains[domain] ?? emptyCounters();
  const current = statisticsSnapshot(profile, { ...model, courses })[domain];
  const byId = new Map(model.components.map(kc => [kc.id, kc]));
  const selectedCourses = courses.filter(course => domain === 'all' || course.domain === domain);
  const selectedIds = new Set(selectedCourses.flatMap(course => model.courseKcIds[course.id] ?? []));
  const errors = domain === 'all' ? s.errors : s.errorsByDomain[domain] ?? {};
  const kcErrors = domain === 'all' ? s.kcErrors : s.kcErrorsByDomain[domain] ?? {};
  const introduced = new Set(profile.introducedKcIds);
  const weak = model.components.filter(kc => selectedIds.has(kc.id) && kc.gating && introduced.has(kc.id) && (profile.byKc[kc.id]?.attempts ?? 0) > 0 && !isComponentMastered(kc, profile.byKc))
    .sort((a, b) => componentConfidence(a, profile.byKc) - componentConfidence(b, profile.byKc) || (kcErrors[b.id] ?? 0) - (kcErrors[a.id] ?? 0) || a.order - b.order);
  const translatedEntity = (key, fallback) => { const translated = externalT?.(key); return typeof translated === 'string' && translated.trim() && translated !== key && (language !== 'en' || !HAN_TEXT.test(translated)) ? translated : language === 'zh-CN' ? fallback : key.split('.').slice(1, -1).join('.'); };
  const localCourseLabel = course => courseLabel?.(course, language) ?? translatedEntity(`courses.${course.id}.title`, course.title);
  const localKnowledgeLabel = kc => knowledgeLabel?.(kc, language) ?? translatedEntity(`knowledge.${kc.id}.label`, kc.label);
  const joinLabels = labels => labels.join(language === 'en' ? ', ' : '、');
  const labelPoint = label => formatPointLabel(label, axis, formats);
  const tableProps = headers => ({ headers, ariaLabel: t('statistics.table.aria', { headers: joinLabels(headers) }), empty: t('statistics.empty.table') });
  const statusLabel = (course, summary) => courseStatusLabel?.(summary.status, summary, course, language) ?? (
    !summary.unlocked ? t('statistics.courseStatus.locked')
      : summary.pendingCount ? plural('statistics.courseStatus.pending', summary.pendingCount)
        : summary.complete ? t('statistics.courseStatus.complete')
          : course.review || summary.owned.length === 0 ? t('statistics.courseStatus.review', { done: formats.number((profile.coursePractice?.[course.id] ?? []).length), total: formats.number(12) })
            : t('statistics.courseStatus.progress', { done: formats.number(summary.mastered), total: formats.number(summary.total) })
  );
  const errorRows = Object.entries(errors).sort(([, a], [, b]) => b - a).map(([id, count]) => [id.startsWith('kc:') ? localKnowledgeLabel(byId.get(id.slice(3)) ?? { id: id.slice(3), label: id.slice(3) }) : id === 'target-form' ? t('statistics.errors.targetForm') : t('statistics.errors.unattributed'), formats.number(count)]);
  const cards = [
    [t('statistics.cards.questions'), formats.number(counts.questions), s.earlyQuestions ? t('statistics.cards.questionsEarly') : t('statistics.cards.questionsDetail')],
    [t('statistics.cards.accuracy'), formats.percentage(counts.independentCorrect, counts.independent), t('statistics.cards.accuracyDetail', { correct: formats.number(counts.independentCorrect), total: formats.number(counts.independent) })],
    [t('statistics.cards.activeTime'), formats.duration(counts.activeMs), t('statistics.cards.activeTimeDetail')],
    [t('statistics.cards.completedCourses'), `${formats.number(current.courses)} / ${formats.number(current.courseTotal)}`, t('statistics.cards.current')],
    [t('statistics.cards.mastered'), `${formats.number(current.mastered)} / ${formats.number(current.kcs)}`, t('statistics.cards.masteredDetail', { count: formats.number(current.unlocked) })],
    [t('statistics.cards.pending'), formats.number(current.pending), plural('statistics.cards.pendingDetail', current.suspended)],
  ];
  const startKey = localDay(new Date(s.since));
  const provenance = [
    t('statistics.provenance.start', { date: formats.date(dateFromKey(startKey)) }),
    s.partialHistory ? s.earlyQuestions ? plural('statistics.provenance.partial', s.earlyQuestions, { from: s.historyFrom ? formatPointLabel(s.historyFrom, 'date', formats) : t('statistics.provenance.newRecords') })
      : t('statistics.provenance.partialNoCount', { from: s.historyFrom ? formatPointLabel(s.historyFrom, 'date', formats) : t('statistics.provenance.newRecords') }) : t('statistics.provenance.complete'),
    t('statistics.provenance.effect'),
  ].join(' ');
  const chart = (titleKey, options) => {
    const title = t(titleKey);
    return h(LineChart, { title, points, formatLabel: labelPoint, formatNumber: formats.number, ariaLabel: t('statistics.chart.aria', { title }), tooltip: (label, value) => t('statistics.chart.tooltip', { label, value }), emptyMessage: t('statistics.empty.range'), singleMessage: t('statistics.single'), ...options });
  };
  const dateRanges = [['7', t('statistics.trends.days7')], ['30', t('statistics.trends.days30')], ['90', t('statistics.trends.days90')], ['all', t('statistics.trends.all')]];
  const ordinalRanges = [['100', t('statistics.trends.questions100')], ['500', t('statistics.trends.questions500')], ['all', t('statistics.trends.all')]];
  return h('section', { className: 'statistics-page', 'aria-labelledby': 'statistics-title' },
    h('header', { className: 'statistics-heading' }, h('div', null, h('p', { className: 'eyebrow' }, t('statistics.eyebrow')), h('h1', { id: 'statistics-title', tabIndex: -1 }, t('statistics.title')), h('p', null, t('statistics.intro'))),
      h('button', { type: 'button', className: 'statistics-back', onClick: onBack }, backLabel ?? t('statistics.back'))),
    h('div', { className: 'statistics-filter', role: 'group', 'aria-label': t('statistics.scope.aria') }, ['all', 'verb', 'adjective'].map(value => h('button', { type: 'button', key: value, 'aria-pressed': domain === value, onClick: () => setDomain(value) }, t(`statistics.scope.${value}`)))),
    h('div', { className: 'statistics-cards' }, cards.map(([label, value, detail]) => h('article', { key: label }, h('span', null, label), h('strong', null, value), h('small', null, detail)))),
    h('p', { className: 'statistics-provenance' }, provenance),
    h('section', { className: 'statistics-panel', 'aria-labelledby': 'statistics-trends' }, h('div', { className: 'statistics-panel-heading' }, h('h2', { id: 'statistics-trends' }, t('statistics.trends.title')),
      h('div', { className: 'statistics-trend-controls' }, h('label', null, `${t('statistics.trends.axis')} `, h('select', { value: axis, onChange: event => { setAxis(event.target.value); setRange(event.target.value === 'date' ? '30' : '100'); } }, h('option', { value: 'date' }, t('statistics.trends.axisDate')), h('option', { value: 'ordinal' }, t('statistics.trends.axisOrdinal')))),
        h('label', null, `${t('statistics.trends.range')} `, h('select', { value: range, onChange: event => setRange(event.target.value) }, (axis === 'date' ? dateRanges : ordinalRanges).map(([value, label]) => h('option', { key: value, value }, label)))))),
      h('p', { className: 'statistics-note' }, t(axis === 'date' ? 'statistics.trends.dateNote' : 'statistics.trends.ordinalNote')),
      h('div', { className: 'statistics-chart-grid' },
        chart('statistics.trends.questions', { value: point => point.unknown ? null : point.counts.questions, format: v => plural('statistics.units.questions', v), color: '#c94b3d' }),
        chart('statistics.trends.accuracy', { value: point => point.counts.independent ? point.counts.independentCorrect / point.counts.independent * 100 : null, format: v => formats.percentage(v, 100), color: '#2d6a51', max: 100 }),
        chart('statistics.trends.mastered', { value: point => point.progress?.mastered ?? null, format: v => plural('statistics.units.items', v), color: '#2d6a51', max: current.kcs || 1, singleMessage: t('statistics.trends.masteryBaseline') }),
        chart('statistics.trends.meanTime', { value: point => point.counts.answerSamples ? point.counts.answerMs / point.counts.answerSamples / 1000 : null, format: formats.seconds, color: '#977347', emptyMessage: t('statistics.trends.timeEmpty') })),
      h('details', null, h('summary', null, t('statistics.trends.showData')), (() => { const headers = [t('statistics.trends.interval'), t('statistics.trends.questions'), t('statistics.trends.accuracy'), t('statistics.trends.activeTime'), t('statistics.trends.answerTime'), t('statistics.trends.masteredShort')]; return h(Table, { ...tableProps(headers), rows: points.map(point => [labelPoint(point.label) + (point.partial ? ' *' : ''), point.unknown ? '—' : formats.number(point.counts.questions), formats.percentage(point.counts.independentCorrect, point.counts.independent), axis === 'date' && !point.unknown && (point.counts.activeMs > 0 || point.label >= startKey) ? formats.duration(point.counts.activeMs) : '—', formats.meanTime(point.counts), point.progress?.mastered == null ? '—' : formats.number(point.progress.mastered)]) }); })())),
    h('section', { className: 'statistics-panel' }, h('h2', null, t('statistics.courses.title')), h('p', { className: 'statistics-note' }, t('statistics.courses.note')),
      (() => { const headers = [t('statistics.courses.course'), t('statistics.courses.status'), t('statistics.courses.questions'), t('statistics.trends.accuracy'), t('statistics.courses.meanTime')]; return h(Table, { ...tableProps(headers), rows: selectedCourses.map(course => { const c = s.courses[course.id] ?? emptyCounters(); const status = summarizeUnifiedCourse(course, (model.courseKcIds[course.id] ?? []).map(id => byId.get(id)), profile.introducedKcIds, profile); return [localCourseLabel(course), statusLabel(course, status), formats.number(c.questions), formats.percentage(c.independentCorrect, c.independent), formats.meanTime(c)]; }) }); })()),
    h('section', { className: 'statistics-panel' }, h('div', { className: 'statistics-panel-heading' }, h('h2', null, t('statistics.weak.title')), h('button', { type: 'button', className: 'text-button', onClick: onKnowledge }, t('statistics.weak.view'))),
      h('p', { className: 'statistics-note' }, t('statistics.weak.note')),
      (() => { const headers = [t('statistics.weak.knowledge'), t('statistics.weak.mastery'), t('statistics.weak.errors'), t('statistics.weak.coverage')]; return h(Table, { ...tableProps(headers), rows: weak.slice(0, 12).map(kc => [localKnowledgeLabel(kc), formats.percentage(componentConfidence(kc, profile.byKc), 1), formats.number(kcErrors[kc.id] ?? 0), joinLabels(kc.coverageKcIds.filter(id => !(profile.byKc[id]?.correct >= 1)).map(id => localKnowledgeLabel(byId.get(id) ?? { id, label: id }))) || '—']), empty: t('statistics.weak.empty') }); })()),
    h('div', { className: 'statistics-analysis-grid' },
      h('section', { className: 'statistics-panel' }, h('h2', null, t('statistics.errors.title')), h('p', { className: 'statistics-note' }, t('statistics.errors.note')), (() => { const headers = [t('statistics.errors.cause'), t('statistics.errors.count')]; return h(Table, { ...tableProps(headers), rows: errorRows.slice(0, 15) }); })()),
      h('section', { className: 'statistics-panel' }, h('h2', null, t('statistics.help.title')), h('p', { className: 'statistics-note' }, t('statistics.help.note')),
        (() => { const headers = [t('statistics.help.item'), t('statistics.help.result')]; return h(Table, { ...tableProps(headers), rows: [
          [t('statistics.help.correct'), `${formats.number(counts.correct)} / ${formats.number(counts.questions)}`], [t('statistics.help.assistedCorrect'), `${formats.number(counts.assistedCorrect)} / ${formats.number(counts.assisted)}`],
          [t('statistics.help.hints'), plural('statistics.help.times', counts.hints)], [t('statistics.help.revealed'), plural('statistics.help.times', counts.revealed)], [t('statistics.help.steps'), `${formats.number(counts.stepCorrect)} / ${formats.number(counts.steps)}`],
          [t('statistics.help.retries'), plural('statistics.help.times', counts.typos + counts.invalid)], [t('statistics.help.retests'), plural('statistics.help.times', counts.retests)], [t('statistics.help.retestCorrect'), plural('statistics.help.times', counts.retestCorrect)],
          [t('statistics.help.retestRate'), formats.percentage(counts.retestCorrect, counts.retests)], [t('statistics.help.assistedRetests'), plural('statistics.help.times', counts.assistedRetests ?? 0)],
        ] }); })())),
    h('p', { className: 'statistics-note' }, t('statistics.footer')));
}
