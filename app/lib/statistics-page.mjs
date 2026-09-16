import { createElement as h, useMemo, useState } from 'react';
import { emptyCounters, statisticsSeries, statisticsSnapshot, localDay } from './statistics.mjs';
import { componentConfidence, isComponentMastered } from './adaptive.mjs';
import { summarizeUnifiedCourse } from './unified-progress.mjs';

const percentage = (part, total) => total ? `${(100 * part / total).toFixed(1)}%` : '—';
const duration = ms => ms >= 3_600_000 ? `${(ms / 3_600_000).toFixed(1)} 小时` : ms >= 60_000 ? `${Math.floor(ms / 60_000)} 分钟` : `${Math.floor(ms / 1000)} 秒`;
const meanTime = counts => counts.answerSamples ? `${(counts.answerMs / counts.answerSamples / 1000).toFixed(1)} 秒` : '—';
function LineChart({ title, points, value, format, color, max = null, emptyMessage = '当前范围暂无记录', singleMessage = '继续练习后会显示变化趋势' }) {
  // Keep gaps inside known history, but do not squeeze valid samples behind
  // weeks of unavailable legacy data. Each chart labels its actual date span.
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
      : numbers.length === 1 ? h('div', { className: 'statistics-single' }, h('strong', { style: { color } }, format(numbers[0])), h('span', null, visible[0].label), h('small', null, singleMessage))
        : h('div', null, h('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `${title}，具体数值见下方趋势数据表` },
          [0, ceiling / 2, ceiling].map(tick => h('g', { key: tick },
            h('line', { x1: left, y1: y(tick), x2: width - right, y2: y(tick), stroke: '#d9d5ca', strokeDasharray: tick ? '4 4' : undefined }),
            h('text', { x: left - 10, y: y(tick), dy: '.35em', textAnchor: 'end', fontSize: 13, fill: '#717971' }, Number(tick.toFixed(1))))),
          h('path', { d: path, stroke: color, fill: 'none', strokeWidth: 2.5 }),
          values.map((v, i) => v === null ? null : h('circle', { key: i, cx: x(i), cy: y(v), r: 3.5, fill: color }, h('title', null, `${visible[i].label}：${format(v)}`)))),
          h('div', { className: 'statistics-chart-axis' }, h('span', null, visible[0].label), h('span', null, visible.at(-1).label))));
}
function Table({ headers, rows, empty = '暂无记录' }) {
  return h('div', { className: 'statistics-table-scroll', tabIndex: 0, role: 'region', 'aria-label': headers.join('、') },
    h('table', { className: 'statistics-table' }, h('thead', null, h('tr', null, headers.map(label => h('th', { key: label, scope: 'col' }, label)))),
      h('tbody', null, rows.length ? rows.map((row, index) => h('tr', { key: index }, row.map((cell, column) => h(column ? 'td' : 'th', { key: column, ...(column ? {} : { scope: 'row' }) }, cell)))) : h('tr', null, h('td', { colSpan: headers.length }, empty)))));
}
/** @param {{profile:any, model:any, courses:any[], onBack:()=>void, onKnowledge:()=>void, backLabel?:string}} props */
export default function StatisticsPage({ profile, model, courses, onBack, onKnowledge, backLabel = '返回练习' }) {
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
  const errorRows = Object.entries(errors).sort(([, a], [, b]) => b - a).map(([id, count]) => [id.startsWith('kc:') ? byId.get(id.slice(3))?.label ?? id.slice(3) : id === 'target-form' ? '答成其他完整形式' : '未能明确归因', count]);
  const cards = [
    ['已记录原题', counts.questions.toLocaleString(), s.earlyQuestions ? '包含无法分配日期的早期累计' : '有效原题提交，拆步不增加题数'],
    ['独立正确率', percentage(counts.independentCorrect, counts.independent), `${counts.independentCorrect} / ${counts.independent} 道无辅助整题`],
    ['有效练习时间', duration(counts.activeMs), '仅新版计时，不含后台或长时间闲置'],
    ['已完成课程', `${current.courses} / ${current.courseTotal}`, '当前状态'],
    ['已掌握知识点', `${current.mastered} / ${current.kcs}`, `当前已解锁 ${current.unlocked} 项；共享规则不重复计数`],
    ['待独立复测', current.pending, `当前状态；另有 ${current.suspended} 项已暂停`],
  ];
  return h('section', { className: 'statistics-page', 'aria-labelledby': 'statistics-title' },
    h('header', { className: 'statistics-heading' }, h('div', null, h('p', { className: 'eyebrow' }, 'LEARNING STATISTICS'), h('h1', { id: 'statistics-title', tabIndex: -1 }, '学习统计'), h('p', null, '看看练习如何积累成进步。')),
      h('button', { type: 'button', className: 'statistics-back', onClick: onBack }, backLabel)),
    h('div', { className: 'statistics-filter', role: 'group', 'aria-label': '统计范围' }, [['all', '全部'], ['verb', '动词'], ['adjective', '形容词']].map(([value, label]) => h('button', { type: 'button', key: value, 'aria-pressed': domain === value, onClick: () => setDomain(value) }, label))),
    h('div', { className: 'statistics-cards' }, cards.map(([label, value, detail]) => h('article', { key: label }, h('span', null, label), h('strong', null, value), h('small', null, detail)))),
    h('p', { className: 'statistics-provenance' }, `用时和掌握趋势从 ${localDay(new Date(s.since))} 开始记录。`, s.partialHistory ? ` 早期历史不完整；趋势从可还原的 ${s.historyFrom ?? '新版记录'} 展示，${s.earlyQuestions} 道早期原题缺少日期分布。` : ' 尚未作答的日期不计算正确率。', ' 统计不影响评分、解锁或选题。'),
    h('section', { className: 'statistics-panel', 'aria-labelledby': 'statistics-trends' }, h('div', { className: 'statistics-panel-heading' }, h('h2', { id: 'statistics-trends' }, '练习趋势'),
      h('div', { className: 'statistics-trend-controls' }, h('label', null, '横轴 ', h('select', { value: axis, onChange: event => { setAxis(event.target.value); setRange(event.target.value === 'date' ? '30' : '100'); } }, h('option', { value: 'date' }, '日期'), h('option', { value: 'ordinal' }, '作答顺序'))),
        h('label', null, '范围 ', h('select', { value: range, onChange: event => setRange(event.target.value) }, (axis === 'date' ? [['7', '近 7 天'], ['30', '近 30 天'], ['90', '近 90 天'], ['all', '全部']] : [['100', '最近 100 题'], ['500', '最近 500 题'], ['all', '全部']]).map(([value, label]) => h('option', { key: value, value }, label)))))),
      h('p', { className: 'statistics-note' }, axis === 'date' ? '保留近一年的日汇总，更早按月合并。缺失历史不补零；图表从可用样本开始。标有 * 的区间只有部分记录。' : '近期每 20 道原题汇总；完整历史按题号区间聚合。历史缺失不会补成零。'),
      h('div', { className: 'statistics-chart-grid' },
        h(LineChart, { title: '原题数量', points, value: point => point.unknown ? null : point.counts.questions, format: v => `${v} 题`, color: '#c94b3d' }),
        h(LineChart, { title: '独立正确率', points, value: point => point.counts.independent ? point.counts.independentCorrect / point.counts.independent * 100 : null, format: v => `${v.toFixed(1)}%`, color: '#2d6a51', max: 100 }),
        h(LineChart, { title: '已掌握知识点', points, value: point => point.progress?.mastered ?? null, format: v => `${v} 项`, color: '#2d6a51', max: current.kcs || 1, singleMessage: '这是当前基线；后续练习会形成掌握趋势' }),
        h(LineChart, { title: '独立正确作答平均耗时', points, value: point => point.counts.answerSamples ? point.counts.answerMs / point.counts.answerSamples / 1000 : null, format: v => `${v.toFixed(1)} 秒`, color: '#977347', emptyMessage: '旧记录没有耗时；新版独立答对后开始展示' })),
      h('details', null, h('summary', null, '查看趋势数据'), h(Table, { headers: ['区间', '原题', '独立正确率', '有效用时', '平均答题耗时', '已掌握'], rows: points.map(point => [point.label + (point.partial ? ' *' : ''), point.unknown ? '—' : point.counts.questions, percentage(point.counts.independentCorrect, point.counts.independent), axis === 'date' && !point.unknown && (point.counts.activeMs > 0 || point.label >= localDay(new Date(s.since))) ? duration(point.counts.activeMs) : '—', meanTime(point.counts), point.progress?.mastered ?? '—']) }))),
    h('section', { className: 'statistics-panel' }, h('h2', null, '课程概览'), h('p', { className: 'statistics-note' }, '课程状态为当前值；作答与正确率为累计值。耗时仅含新版记录的独立正确作答。'),
      h(Table, { headers: ['课程', '当前状态', '累计原题', '独立正确率', '平均耗时'], rows: selectedCourses.map(course => { const c = s.courses[course.id] ?? emptyCounters(); const status = summarizeUnifiedCourse(course, (model.courseKcIds[course.id] ?? []).map(id => byId.get(id)), profile.introducedKcIds, profile); return [course.title, status.status, c.questions, percentage(c.independentCorrect, c.independent), meanTime(c)]; }) })),
    h('section', { className: 'statistics-panel' }, h('div', { className: 'statistics-panel-heading' }, h('h2', null, '当前薄弱知识点'), h('button', { type: 'button', className: 'text-button', onClick: onKnowledge }, '查看知识进度')),
      h('p', { className: 'statistics-note' }, '只列出已练习且尚未达标的知识点；尚未作答的内容不判为薄弱项。'),
      h(Table, { headers: ['知识点', '当前掌握度', '已记录归因错误', '缺失覆盖'], rows: weak.slice(0, 12).map(kc => [kc.label, `${Math.round(componentConfidence(kc, profile.byKc) * 100)}%`, kcErrors[kc.id] ?? 0, kc.coverageKcIds.filter(id => !(profile.byKc[id]?.correct >= 1)).map(id => byId.get(id)?.label ?? id).join('、') || '—']), empty: '已练习知识点暂无薄弱项' })),
    h('div', { className: 'statistics-analysis-grid' },
      h('section', { className: 'statistics-panel' }, h('h2', null, '错因分布'), h('p', { className: 'statistics-note' }, '仅统计可还原记录及新版明确诊断；一道错题不会计到全部关联知识点。'), h(Table, { headers: ['错因', '次数'], rows: errorRows.slice(0, 15) })),
      h('section', { className: 'statistics-panel' }, h('h2', null, '帮助与独立复测'), h('p', { className: 'statistics-note' }, '原题累计区分独立与辅助；提示、拆步和复测明细仅含可还原记录及新版统计。'),
        h(Table, { headers: ['项目', '已记录结果'], rows: [
          ['原题答对', `${counts.correct} / ${counts.questions}`], ['辅助原题答对', `${counts.assistedCorrect} / ${counts.assisted}`],
          ['查看提示', `${counts.hints} 次`], ['揭晓答案', `${counts.revealed} 次`], ['拆步答对', `${counts.stepCorrect} / ${counts.steps}`],
          ['输入重试', `${counts.typos + counts.invalid} 次`], ['合格独立复测', `${counts.retests} 次`], ['复测答对并解除', `${counts.retestCorrect} 次`],
          ['复测成功率', percentage(counts.retestCorrect, counts.retests)], ['复测中的辅助作答', `${counts.assistedRetests ?? 0} 次`],
        ] }))),
    h('p', { className: 'statistics-note' }, '数据保存在当前浏览器，随学习进度备份一起导出。近期精简统计保留 1,000 道原题；原始作答日志保留最多 500 条。'));
}
