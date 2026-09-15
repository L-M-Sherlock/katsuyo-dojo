import { isComponentMastered } from './adaptive.mjs';
import { summarizeUnifiedCourse } from './unified-progress.mjs';

export const STATISTICS_VERSION = 1;
export const RECENT_STATISTICS_LIMIT = 1000;
export const ORDINAL_BUCKET_SIZE = 50;
export const ORDINAL_BUCKET_LIMIT = 1000;
export const DAILY_RETENTION = 365;
export const COUNTER_FIELDS = ['questions', 'correct', 'independent', 'independentCorrect', 'assisted', 'assistedCorrect', 'unknown', 'revealed', 'steps', 'stepCorrect', 'hints', 'typos', 'invalid', 'retests', 'retestCorrect', 'assistedRetests', 'answerMs', 'answerSamples', 'activeMs'];
/** @typedef {Record<string, number>} Counters */
/** @typedef {{mastered:number, unlocked:number, kcs:number, courses:number, courseTotal:number, pending:number, suspended:number}} Progress */
/** @typedef {Record<string, Progress>} Snapshot */
/** @typedef {{all:Counters, verb?:Counters, adjective?:Counters, unknown?:Counters, progress:Snapshot|null}} Period */
/** @typedef {{from:number, to:number, period:Period}} OrdinalBucket */
/** @typedef {{ordinal:number, questionId:string, day:string, domain:string, courseId:string, form:string|null, outcome:string, independent:boolean|null, answerMs:number|null, progress:Snapshot|null}} StatisticsRow */
/** @typedef {{version:1, since:string, throughSequence:number, ordinal:number, historyFrom:string|null, partialHistory:boolean, partialDays:string[], earlyQuestions:number, totals:Counters, domains:Record<string,Counters>, courses:Record<string,Counters>, errors:Record<string,number>, kcErrors:Record<string,number>, errorsByDomain:Record<string,Record<string,number>>, kcErrorsByDomain:Record<string,Record<string,number>>, days:Record<string,Period>, months:Record<string,Period>, ranges:OrdinalBucket[], recent:StatisticsRow[], progressStart:Snapshot|null}} Statistics */
const domains = ['all', 'verb', 'adjective', 'unknown'];
const questionOutcomes = new Set(['correct', 'incorrect', 'revealed']);
const clone = value => structuredClone(value);
export const emptyCounters = () => Object.fromEntries(COUNTER_FIELDS.map(key => [key, 0]));
const period = () => ({ all: emptyCounters(), progress: null });
const add = (target, delta) => { for (const field of COUNTER_FIELDS) target[field] = (target[field] ?? 0) + (delta[field] ?? 0); return target; };
const addPeriod = (target, value) => {
  for (const domain of domains) if (value[domain]) add(target[domain] ??= emptyCounters(), value[domain]);
  if (value.progress) target.progress = value.progress;
  return target;
};
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
/** @returns {Statistics} */
export function emptyStatistics(at = new Date().toISOString(), progress = null) {
  return { version: 1, since: at, throughSequence: 0, ordinal: 0, historyFrom: null, partialHistory: false, partialDays: [], earlyQuestions: 0,
    totals: emptyCounters(), domains: {}, courses: {}, errors: {}, kcErrors: {}, errorsByDomain: {}, kcErrorsByDomain: {}, days: {}, months: {}, ranges: [], recent: [], progressStart: progress };
}
export function statisticsSnapshot(profile, { components, courses, courseKcIds }) {
  const byId = new Map(components.map(kc => [kc.id, kc]));
  const introduced = new Set(profile.introducedKcIds);
  return Object.fromEntries(['all', 'verb', 'adjective'].map(domain => {
    const selected = courses.filter(course => domain === 'all' || course.domain === domain);
    const required = [...new Set(selected.flatMap(course => courseKcIds[course.id] ?? []))].map(id => byId.get(id)).filter(kc => kc?.gating);
    const selectedIds = new Set(selected.map(course => course.id));
    return [domain, { mastered: required.filter(kc => isComponentMastered(kc, profile.byKc)).length,
      unlocked: required.filter(kc => introduced.has(kc.id)).length, kcs: required.length,
      courses: selected.filter(course => summarizeUnifiedCourse(course, (courseKcIds[course.id] ?? []).map(id => byId.get(id)), profile.introducedKcIds, profile).complete).length,
      courseTotal: selected.length, pending: Object.values(profile.assessment?.pending ?? {}).filter(entry => selectedIds.has(entry.courseId)).length,
      suspended: Object.values(profile.assessment?.suspendedPending ?? {}).filter(entry => selectedIds.has(entry.courseId)).length }];
  }));
}
function accumulate(s, delta, domain, courseId, day, progress = null) {
  add(s.totals, delta);
  add(s.domains[domain] ??= emptyCounters(), delta);
  if (courseId) add(s.courses[courseId] ??= emptyCounters(), delta);
  const bucket = s.days[day] ??= period();
  add(bucket.all, delta); add(bucket[domain] ??= emptyCounters(), delta);
  if (progress) bucket.progress = progress;
  s.historyFrom = !s.historyFrom || day < s.historyFrom ? day : s.historyFrom;
}
function compact(s, today) {
  const cutoff = new Date(`${today}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - DAILY_RETENTION + 1);
  const boundary = cutoff.toISOString().slice(0, 10);
  for (const day of Object.keys(s.days).sort()) if (day < boundary) {
    addPeriod(s.months[day.slice(0, 7)] ??= period(), s.days[day]);
    delete s.days[day];
  }
  while (s.ranges.length > ORDINAL_BUCKET_LIMIT) {
    const merged = [];
    // Only merge the older half; preserve recent 50-question resolution.
    const end = Math.floor(s.ranges.length / 2);
    for (let index = 0; index < end; index += 2) {
      const a = s.ranges[index], b = s.ranges[index + 1];
      if (index + 1 < end) merged.push({ from: a.from, to: b.to, period: addPeriod(a.period, b.period) });
      else merged.push(a);
    }
    s.ranges = [...merged, ...s.ranges.slice(end)];
  }
  s.recent = s.recent.slice(-RECENT_STATISTICS_LIMIT);
}
/** Update a detached statistics snapshot in the same write as its practice event. */
export function recordStatisticsEvent(statistics, event, { ordinal = null, day = event.totals?.after?.date ?? event.at.slice(0, 10), answerMs = null, progress = null, retestAttempt = false } = {}) {
  if (event.sequence <= statistics.throughSequence) return statistics;
  const s = clone(statistics); s.throughSequence = event.sequence;
  const domain = ['verb', 'adjective'].includes(event.exercise.domain) ? event.exercise.domain : 'unknown';
  const delta = emptyCounters();
  const original = event.type === 'question' && questionOutcomes.has(event.outcome);
  if (original && (s.recent.some(row => row.questionId === event.questionId) || ordinal != null && ordinal <= s.ordinal)) return s;
  if (original) {
    delta.questions = 1; delta.correct = Number(event.outcome === 'correct'); delta.revealed = Number(event.outcome === 'revealed');
    const independent = event.support?.independent;
    delta.independent = Number(independent === true); delta.independentCorrect = Number(independent === true && delta.correct === 1);
    delta.assisted = Number(independent === false); delta.assistedCorrect = Number(independent === false && delta.correct === 1);
    delta.unknown = Number(independent == null);
    delta.retests = Number(independent === true && event.assessment?.eligibility?.eligible === true);
    delta.retestCorrect = Number(delta.retests === 1 && delta.correct === 1);
    delta.assistedRetests = Number(independent === false && (retestAttempt || event.support?.source === 'rehearsal'));
    if (Number.isFinite(answerMs) && answerMs >= 0 && independent === true && delta.correct) {
      delta.answerMs = Math.round(answerMs); delta.answerSamples = 1;
    }
    if (event.outcome === 'incorrect') {
      const key = event.diagnosis.kcId ? `kc:${event.diagnosis.kcId}` : event.diagnosis.resolution === 'target-form' ? 'target-form' : 'unattributed';
      s.errors[key] = (s.errors[key] ?? 0) + 1;
      const errors = s.errorsByDomain[domain] ??= {}; errors[key] = (errors[key] ?? 0) + 1;
      if (event.diagnosis.kcId) {
        s.kcErrors[event.diagnosis.kcId] = (s.kcErrors[event.diagnosis.kcId] ?? 0) + 1;
        const errors = s.kcErrorsByDomain[domain] ??= {}; errors[event.diagnosis.kcId] = (errors[event.diagnosis.kcId] ?? 0) + 1;
      }
    }
    s.ordinal = ordinal ?? s.ordinal + 1;
    s.recent.push({ ordinal: s.ordinal, questionId: event.questionId, day, domain, courseId: event.exercise.courseId,
      form: event.exercise.form, outcome: event.outcome, independent: independent ?? null,
      answerMs: delta.answerSamples ? delta.answerMs : null, progress });
    let range = s.ranges.at(-1);
    if (!range || Math.floor((range.from - 1) / ORDINAL_BUCKET_SIZE) !== Math.floor((s.ordinal - 1) / ORDINAL_BUCKET_SIZE)
      || range.to - range.from + 1 >= ORDINAL_BUCKET_SIZE) {
      range = { from: s.ordinal, to: s.ordinal, period: period() }; s.ranges.push(range);
    }
    range.to = s.ordinal; add(range.period.all, delta); add(range.period[domain] ??= emptyCounters(), delta);
    if (progress) range.period.progress = progress;
  } else if (event.type === 'step' && !['typo', 'invalid'].includes(event.outcome)) {
    delta.steps = 1; delta.stepCorrect = Number(event.outcome === 'correct');
  } else if (event.type === 'hint') delta.hints = 1;
  else if (event.outcome === 'typo') delta.typos = 1;
  else if (event.outcome === 'invalid') delta.invalid = 1;
  if (COUNTER_FIELDS.some(key => delta[key])) accumulate(s, delta, domain, event.exercise.courseId, day, progress);
  compact(s, day);
  return s;
}
/** Timing fragments are drained once by the UI clock; no grammar scores are touched. */
export function recordActiveTime(statistics, fragments) {
  if (!fragments.length) return statistics;
  const s = clone(statistics);
  for (const fragment of fragments) {
    const delta = emptyCounters(); delta.activeMs = Math.round(fragment.ms);
    if (delta.activeMs > 0) accumulate(s, delta, fragment.domain, fragment.courseId, fragment.day);
  }
  compact(s, fragments.at(-1).day);
  return s;
}

export function initializeStatistics(profile, at, progress = null) {
  let s = emptyStatistics(at, progress);
  const log = profile.practiceLog;
  const count = profile.assessment?.originalCount ?? 0;
  const seen = new Set();
  const valid = (log?.events ?? []).filter(event => {
    if (event.type !== 'question' || !questionOutcomes.has(event.outcome)) return true;
    if (seen.has(event.questionId)) return false;
    seen.add(event.questionId); return true;
  });
  const originals = valid.filter(e => e.type === 'question' && questionOutcomes.has(e.outcome));
  const keep = new Set(originals.slice(-count || originals.length).map(e => e.id));
  let ordinal = Math.max(0, count - Math.min(count, originals.length));
  for (const event of valid) {
    const isOriginal = event.type === 'question' && questionOutcomes.has(event.outcome);
    if (isOriginal && (!count || !keep.has(event.id))) continue;
    s = recordStatisticsEvent(s, event, { ordinal: isOriginal ? ++ordinal : null });
  }
  const covered = clone(s.totals);
  const cumulative = emptyCounters();
  const byDomain = {}, byCourse = {};
  for (const entry of Object.values(profile.assessment?.byTarget ?? {})) {
    const delta = emptyCounters();
    delta.independent = entry.independentAttempts; delta.independentCorrect = entry.independentCorrect;
    delta.assisted = entry.assistedOriginalAttempts; delta.assistedCorrect = entry.assistedOriginalCorrect;
    delta.questions = delta.independent + delta.assisted; delta.correct = delta.independentCorrect + delta.assistedCorrect;
    delta.steps = entry.assistedStepAttempts; delta.stepCorrect = entry.assistedStepCorrect;
    delta.retestCorrect = entry.eligibleRetestCorrect;
    add(cumulative, delta);
    add(byDomain[entry.target.domain] ??= emptyCounters(), delta);
    add(byCourse[entry.target.courseId] ??= emptyCounters(), delta);
  }
  cumulative.questions = count;
  cumulative.unknown = Math.max(0, count - cumulative.independent - cumulative.assisted);
  // Retest attempts/help/timing cannot be reconstructed from lifetime target
  // counts. Retain only observed samples; mark historical coverage explicitly.
  for (const key of ['questions', 'correct', 'independent', 'independentCorrect', 'assisted', 'assistedCorrect', 'steps', 'stepCorrect']) {
    s.totals[key] = Math.max(s.totals[key], cumulative[key]);
    for (const [domain, values] of Object.entries(byDomain)) {
      (s.domains[domain] ??= emptyCounters())[key] = Math.max(s.domains[domain][key], values[key]);
    }
    for (const [id, values] of Object.entries(byCourse)) {
      (s.courses[id] ??= emptyCounters())[key] = Math.max(s.courses[id][key], values[key]);
    }
  }
  s.totals.unknown = Math.max(0, s.totals.questions - s.totals.independent - s.totals.assisted);
  const unassigned = Math.max(0, s.totals.questions - Object.values(s.domains).reduce((sum, c) => sum + c.questions, 0));
  if (unassigned) (s.domains.unknown ??= emptyCounters()).questions += unassigned;
  s.earlyQuestions = Math.max(0, count - covered.questions);
  s.partialHistory = Boolean(log?.droppedEntries || s.earlyQuestions || covered.unknown || originals.length > count);
  s.partialDays = log?.droppedEntries && s.historyFrom ? [s.historyFrom] : [];
  s.throughSequence = log?.totalEvents ?? 0; s.ordinal = count;
  s.progressStart = progress;
  compact(s, localDay(new Date(at)));
  return s;
}

function invalid() { throw new Error('统计数据不完整或不受支持，未导入该备份。'); }
const object = value => { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(); return value; };
const integer = value => { if (!Number.isSafeInteger(value) || value < 0) invalid(); return value; };
const text = (value, max = 256) => { if (typeof value !== 'string' || value.length > max) invalid(); return value; };
function date(value, month = false) {
  text(value); const source = month ? `${value}-01` : value;
  const parsed = new Date(`${source}T00:00:00Z`);
  if (!(month ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/).test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== source) invalid();
  return value;
}
function counters(value) {
  const input = object(value), result = Object.fromEntries(COUNTER_FIELDS.map(key => [key, integer(input[key])]));
  if (result.correct > result.questions || result.independentCorrect > result.independent || result.assistedCorrect > result.assisted
    || result.independent > result.questions || result.assisted > result.questions || result.revealed > result.questions
    || result.stepCorrect > result.steps || result.retestCorrect > result.retests || result.answerSamples > result.independentCorrect) invalid();
  return result;
}
function snapshot(value) {
  if (value === null) return null;
  return Object.fromEntries(Object.entries(object(value)).map(([domain, p]) => {
    if (!['all', 'verb', 'adjective'].includes(domain)) invalid();
    const v = Object.fromEntries(['mastered', 'unlocked', 'kcs', 'courses', 'courseTotal', 'pending', 'suspended'].map(key => [key, integer(object(p)[key])]));
    if (v.mastered > v.kcs || v.unlocked > v.kcs || v.courses > v.courseTotal) invalid();
    return [domain, v];
  }));
}
function readPeriod(value) {
  const source = object(value), result = { all: counters(source.all), progress: snapshot(source.progress) };
  for (const domain of domains.slice(1)) if (source[domain]) result[domain] = counters(source[domain]);
  return result;
}
function map(value, read, max = 3000) {
  const entries = Object.entries(object(value)); if (entries.length > max) invalid();
  return Object.fromEntries(entries.map(([key, entry]) => { text(key); if (['__proto__', 'constructor', 'prototype'].includes(key)) invalid(); return [key, read(entry, key)]; }));
}
const domainMap = (value, read) => map(value, (entry, key) => {
  if (!domains.slice(1).includes(key)) invalid();
  return read(entry);
}, 3);
/** @returns {Statistics} */
export function parseStatistics(value, { sequence, ordinal } = {}) {
  const source = object(value);
  if (source.version !== 1 || typeof source.partialHistory !== 'boolean') invalid();
  text(source.since, 32); if (!Number.isFinite(Date.parse(source.since))) invalid();
  if (!Array.isArray(source.recent) || source.recent.length > RECENT_STATISTICS_LIMIT || !Array.isArray(source.ranges) || source.ranges.length > ORDINAL_BUCKET_LIMIT || !Array.isArray(source.partialDays)) invalid();
  const result = { version: 1, since: source.since, partialHistory: source.partialHistory, throughSequence: integer(source.throughSequence), ordinal: integer(source.ordinal), earlyQuestions: integer(source.earlyQuestions),
    historyFrom: source.historyFrom === null ? null : date(source.historyFrom), partialDays: source.partialDays.map(d => date(d)),
    totals: counters(source.totals), domains: domainMap(source.domains, counters), courses: map(source.courses, counters), errors: map(source.errors, integer), kcErrors: map(source.kcErrors, integer), errorsByDomain: domainMap(source.errorsByDomain, x => map(x, integer)), kcErrorsByDomain: domainMap(source.kcErrorsByDomain, x => map(x, integer)),
    days: map(source.days, (p, key) => { date(key); return readPeriod(p); }, DAILY_RETENTION + 1),
    months: map(source.months, (p, key) => { date(key, true); return readPeriod(p); }), progressStart: snapshot(source.progressStart),
    ranges: source.ranges.map(range => ({ from: integer(range.from), to: integer(range.to), period: readPeriod(range.period) })),
    recent: source.recent.map(row => ({ ordinal: integer(row.ordinal), questionId: text(row.questionId), day: date(row.day), domain: text(row.domain), courseId: text(row.courseId), form: row.form === null ? null : text(row.form),
      outcome: text(row.outcome), independent: row.independent === null ? null : typeof row.independent === 'boolean' ? row.independent : invalid(),
      answerMs: row.answerMs === null ? null : integer(row.answerMs), progress: snapshot(row.progress) })),
  };
  if (sequence !== undefined && result.throughSequence !== sequence || ordinal !== undefined && result.ordinal !== ordinal || result.earlyQuestions > result.totals.questions || result.totals.questions !== result.ordinal) invalid();
  let previous = 0;
  for (const range of result.ranges) { if (!range.from || range.from <= previous || range.to < range.from || range.to > result.ordinal) invalid(); previous = range.to; }
  previous = 0; const ids = new Set();
  for (const row of result.recent) {
    if (!row.ordinal || row.ordinal <= previous || row.ordinal > result.ordinal || !questionOutcomes.has(row.outcome) || !['verb', 'adjective', 'unknown'].includes(row.domain) || ids.has(row.questionId)) invalid();
    previous = row.ordinal; ids.add(row.questionId);
  }
  return clone(result);
}

export function statisticsSeries(s, axis, range, domain = 'all', today = localDay()) {
  let result;
  if (axis === 'date') {
    const end = new Date(`${today}T12:00:00Z`); end.setUTCDate(end.getUTCDate() - (Number(range) || 1) + 1);
    const first = end.toISOString().slice(0, 10);
    const entries = [...Object.entries(s.months), ...Object.entries(s.days)].sort(([a], [b]) => a.localeCompare(b));
    const nativeDay = localDay(new Date(s.since));
    let latest = null;
    const dated = new Map();
    for (const [key, value] of entries) {
      if (key >= nativeDay && !latest) latest = s.progressStart?.[domain] ?? null;
      if (value.progress) latest = value.progress[domain] ?? null;
      dated.set(key, { label: key, counts: value[domain] ?? emptyCounters(), progress: latest, partial: s.partialDays.some(day => day.startsWith(key)) });
    }
    if (range === 'all') {
      if (s.progressStart && !dated.has(nativeDay) && !s.months[nativeDay.slice(0, 7)]) {
        dated.set(nativeDay, { label: nativeDay, counts: emptyCounters(), progress: s.progressStart[domain] ?? null, partial: false });
      }
      result = [...dated.values()].sort((a, b) => a.label.localeCompare(b.label));
    }
    else {
      result = [];
      for (const [key, value] of dated) if (key < first && value.progress) latest = value.progress;
      // Do not project today's baseline backwards into unknown history.
      latest = [...dated.values()].filter(value => value.label < first && value.progress).at(-1)?.progress ?? null;
      for (let day = first; day <= today;) {
        if (day >= nativeDay && !latest) latest = s.progressStart?.[domain] ?? null;
        const entry = dated.get(day);
        if (entry?.progress) latest = entry.progress;
        result.push(entry ? { ...entry, progress: latest } : { label: day, counts: emptyCounters(), progress: latest, partial: day < (s.historyFrom ?? nativeDay), unknown: day < (s.historyFrom ?? nativeDay) });
        const next = new Date(`${day}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1); day = next.toISOString().slice(0, 10);
      }
    }
  } else if (range === 'all') {
    result = s.ranges.map(bucket => ({ label: `${bucket.from}–${bucket.to}`, counts: bucket.period[domain] ?? emptyCounters(), progress: bucket.period.progress?.[domain] ?? null, partial: false }));
  } else {
    const recent = s.recent.slice(-Number(range)), buckets = [];
    for (let index = 0; index < recent.length; index += 20) {
      const rows = recent.slice(index, index + 20), counts = emptyCounters();
      for (const row of rows) if (domain === 'all' || row.domain === domain) {
        counts.questions++; counts.correct += Number(row.outcome === 'correct'); counts.independent += Number(row.independent === true); counts.independentCorrect += Number(row.independent === true && row.outcome === 'correct');
        if (row.answerMs !== null) { counts.answerMs += row.answerMs; counts.answerSamples++; }
      }
      buckets.push({ label: `${rows[0].ordinal}–${rows.at(-1).ordinal}`, counts, progress: rows.at(-1).progress?.[domain] ?? null, partial: false });
    }
    result = buckets;
  }
  if (result.length <= 200) return result;
  const size = Math.ceil(result.length / 200), compacted = [];
  for (let index = 0; index < result.length; index += size) {
    const group = result.slice(index, index + size), counts = emptyCounters(); group.forEach(row => add(counts, row.counts));
    compacted.push({ label: `${group[0].label} … ${group.at(-1).label}`, counts, progress: group.at(-1).progress, partial: group.some(row => row.partial) });
  }
  return compacted;
}
