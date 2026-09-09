import { emptySkillStats, updateSkillStats } from './adaptive.mjs';
import { isIAdjectiveNaraAlternative } from './adjective-conjugation.mjs';
import { normalizeAnswer } from './answer-analysis.mjs';
import { appendPracticeEvent } from './practice-log.mjs';

const KC = 'adj.class.i';
const FIELDS = ['attempts','correct','filteredAccuracy','confidence','bestConfidence','cleanTimeTotal','cleanTimeCount'];
const copy = value => structuredClone(value);
const same = (a,b) => a == null || b == null ? a == null && b == null
  : FIELDS.every(key => a[key] === b[key] || typeof a[key] === 'number' && typeof b[key] === 'number' && Math.abs(a[key]-b[key]) < 1e-9);

export function isFalseNaraClassification(event) {
  const e = event.exercise;
  return event.outcome === 'incorrect' && event.diagnosis?.kcId === KC
    && e?.domain === 'adjective' && isIAdjectiveNaraAlternative({surface:e.surface,reading:e.reading,class:e.wordClass},e.form,event.answer,normalizeAnswer);
}

function replay(current, event, change) {
  const before = change.before ?? emptySkillStats(), after = change.after;
  if (!after || after.attempts !== before.attempts + 1 || ![0,1].includes(after.correct-before.correct)) return null;
  const count = after.cleanTimeCount-before.cleanTimeCount, time = after.cleanTimeTotal-before.cleanTimeTotal;
  if (![0,1].includes(count) || time < 0 || !count && time !== 0) return null;
  const positive = after.correct > before.correct;
  const next = updateSkillStats(current ?? undefined,{correct:positive,hintUsed:event.hintUsed});
  return {...next,cleanTimeCount:(current?.cleanTimeCount??0)+count,cleanTimeTotal:(current?.cleanTimeTotal??0)+time};
}

function ledgerOf(value) {
  if (value === undefined) return undefined;
  const ledger = value?.iNaraClassification;
  if (!value || typeof value !== 'object' || Array.isArray(value) || !ledger || ledger.version !== 1
    || !Number.isSafeInteger(ledger.throughSequence) || ledger.throughSequence < 0
    || !Array.isArray(ledger.suppressedEventIds) || ledger.suppressedEventIds.some(id=>typeof id!=='string')
    || new Set(ledger.suppressedEventIds).size!==ledger.suppressedEventIds.length
    || ![ledger.byKcAfter,ledger.independentAfter].every(s=>s===null || s && FIELDS.every(k=>k==='filteredAccuracy' && s[k]===null || typeof s[k]==='number' && Number.isFinite(s[k]) && s[k]>=0)
      && ['attempts','correct','cleanTimeCount'].every(k=>Number.isSafeInteger(s[k]))
      && s.correct<=s.attempts && s.cleanTimeCount<=s.correct && s.confidence<=1 && s.bestConfidence<=1 && s.bestConfidence>=s.confidence
      && (s.filteredAccuracy===null || s.filteredAccuracy<=1))) {
    throw new Error('归因校正记录不完整，未导入该备份。');
  }
  return ledger;
}

/** Reconcile only the known i-adjective + なら classification defect. Original
 * events are immutable. A verified migration baseline or a contiguous v7
 * score chain is required; unrelated scores and whole-question outcomes stay.
 */
export function correctNaraClassification(profile, {at = new Date().toISOString(), ledger: rawLedger, labelFor = id=>id} = {}) {
  const prior = ledgerOf(rawLedger ?? profile.scoreCorrections);
  if (prior && prior.throughSequence > profile.practiceLog.totalEvents) throw new Error('归因校正记录的序号超出作答日志，未导入该备份。');
  const baseProfile = rawLedger === undefined ? profile : {...profile,scoreCorrections:copy(rawLedger)};
  const events = profile.practiceLog.events, byEvent = new Map(events.map(e=>[e.id,e]));
  const pendingBad = events.filter(e=>e.sequence>(prior?.throughSequence??0) && isFalseNaraClassification(e)
    && e.changes.some(c=>c.kcId===KC));
  if (!pendingBad.length) return baseProfile;
  const bad = new Set(pendingBad.map(e=>e.id)), suppressed = new Set(prior?.suppressedEventIds ?? []);
  const migration = profile.assessment.migration;
  let oldMain, nextMain, oldIndependent, nextIndependent, afterSequence = 0;
  const applied = [];
  const apply = (event, change, independent, checkBefore = true) => {
    if (checkBefore && !same(oldMain, change.before)) return false;
    const computed = replay(oldMain,event,change);
    if (!computed || checkBefore && !same(computed,change.after)) return false;
    oldMain = computed;
    if (independent) oldIndependent = replay(oldIndependent,event,change);
    if (bad.has(event.id)) { applied.push(event.id); suppressed.add(event.id); }
    else {
      nextMain = replay(nextMain,event,change);
      if (independent) nextIndependent = replay(nextIndependent,event,change);
    }
    return true;
  };
  if (prior) {
    afterSequence = prior.throughSequence;
    oldMain = copy(prior.byKcAfter); nextMain = copy(oldMain);
    oldIndependent = copy(prior.independentAfter); nextIndependent = copy(oldIndependent);
  } else if (migration?.verifiedKcIds.includes(KC) && Object.hasOwn(migration.baselineByKc,KC)) {
    oldMain = copy(migration.baselineByKc[KC]); nextMain = copy(oldMain);
    oldIndependent = null; nextIndependent = null;
    for (const record of migration.events) {
      if (!record.assessedKcIds.includes(KC)) continue;
      const event = byEvent.get(record.id), change = event?.changes.find(c=>c.kcId===KC);
      if (!event || !change || !apply(event,change,record.source==='independent',false)) return baseProfile;
    }
    const anchor = migration.changes.find(c=>c.kcId===KC)?.after;
    if (anchor !== undefined && !same(oldMain,anchor)) return baseProfile;
    afterSequence = migration.throughSequence;
  } else {
    const first = events.find(e=>e.changes.some(c=>c.kcId===KC));
    if (!first) return baseProfile;
    oldMain = copy(first.changes.find(c=>c.kcId===KC).before); nextMain = copy(oldMain);
    // Without independent before-snapshots, only a complete known channel can
    // be reconstructed. The final equality check protects older unseen data.
    oldIndependent = null; nextIndependent = null;
  }
  for (const event of events.filter(e=>e.sequence>afterSequence)) {
    const change = event.changes.find(c=>c.kcId===KC);
    if (!change) continue;
    // The old migration has already been replayed from its verified baseline.
    if (!prior && migration && event.type==='migration' && event.exercise.id==='assessment-migration') {
      if (!same(oldMain,change.after)) return baseProfile;
      continue;
    }
    // An older client may retain the correction event but drop the optional
    // ledger field. Verify and consume that event, rather than undoing twice.
    if (event.type==='migration' && event.exercise.id==='i-nara-classification-correction') {
      if (!same(oldMain,change.before) || !same(nextMain,change.after)) return baseProfile;
      oldMain = copy(nextMain); oldIndependent = copy(nextIndependent); applied.splice(0);
      continue;
    }
    if (event.type==='migration' || !apply(event,change,event.support?.independent===true)) return baseProfile;
  }
  if (!applied.length || !same(oldMain,profile.byKc[KC]) || !same(oldIndependent,profile.assessment.independentByKc[KC])) return baseProfile;
  const byKc = {...profile.byKc}, independentByKc = {...profile.assessment.independentByKc};
  if (nextMain) byKc[KC] = nextMain; else delete byKc[KC];
  if (nextIndependent) independentByKc[KC] = nextIndependent; else delete independentByKc[KC];
  const badQuestions = new Set(pendingBad.filter(e=>applied.includes(e.id)).map(e=>e.questionId));
  const pending = Object.fromEntries(Object.entries(profile.assessment.pending).map(([key,entry])=>[key,
    badQuestions.has(entry.lastQuestionId) ? {...entry,failedKcIds:entry.failedKcIds.filter(id=>id!==KC)} : entry]));
  const revised = {...baseProfile,byKc,assessment:{...profile.assessment,independentByKc,pending}};
  const logged = appendPracticeEvent(baseProfile,revised,{type:'migration',outcome:'migrated',questionId:'i-nara-classification-correction',at,
    exercise:{id:'i-nara-classification-correction',courseId:'adjectiveClassify',form:null,surface:'い形容词分类记录校正',reading:'',wordClass:'',domain:'system'},
    target:{surface:'',reading:'',form:null,label:'なら条件表达旧归因校正',kind:'migration',kcIds:[KC],answers:[],readings:[],stepIndex:null,totalSteps:0,nextTotalSteps:0},
    support:{independent:false,source:'migration',provided:[]},
    diagnosis:{resolution:'score-correction',message:`已撤销 ${applied.length} 次「い形容词＋なら」造成的分类误扣。这是另一种合法条件表达，不能证明词类判断错误。原始作答日志与整题结果保留，其余知识点不变。`},
  },labelFor);
  return {...logged,scoreCorrections:{iNaraClassification:{version:1,throughSequence:logged.practiceLog.totalEvents,
    suppressedEventIds:[...suppressed],byKcAfter:copy(byKc[KC]??null),independentAfter:copy(independentByKc[KC]??null)}}};
}
