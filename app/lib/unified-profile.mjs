import { parseProfileImport as parseLegacy } from './profile-transfer.mjs';
import { confidenceOf } from './adaptive.mjs';
import { normalizeRecentWordKeys } from './exercise-selection.mjs';
import { emptyPracticeLog, parsePracticeLog, appendPracticeEvent } from './practice-log.mjs';
import { restoreLearningAssessment } from './assessment-transfer.mjs';
import { CURRICULUM_VERSION, SOURCE_COURSES, UNIFIED_COURSES } from './unified-curriculum.mjs';

export const UNIFIED_STORAGE_KEY = 'katsuyo-practice-profile-v7';
export const LEGACY_STORAGE_KEY = 'katsuyo-practice-profile-v6';
export const LEGACY_V5_STORAGE_KEY = 'katsuyo-practice-profile-v5';
const FORMAT = 'katsuyo-dojo-profile';
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const strings = value => Array.isArray(value) ? value.filter(id => typeof id === 'string') : [];
const ambiguous = id => id.startsWith('composition.') || id === 'compound.voice-stack' || id === 'suffix.masu' || id.startsWith('facet.form.masu.');
export function createUnifiedExport(profile, exportedAt = new Date().toISOString()) {
  return { format: FORMAT, formatVersion: 5, exportedAt, profile };
}
export function parseUnifiedImport(value, { today, components, legacyComponents, exercises = /** @type {any[] | undefined} */ (undefined), at = new Date().toISOString() }) {
  const envelope = object(value);
  if (!envelope || ('format' in envelope && (envelope.format !== FORMAT || ![1, 2, 3, 4, 5].includes(envelope.formatVersion)))) throw new Error('这不是受支持的活用道場备份文件。');
  const source = object(envelope.profile) ?? envelope;
  if (![4, 5, 6, 7].includes(source.version) || (source.version === 7 && !source.assessment)) throw new Error('备份版本不受支持或数据不完整。');
  const current = source.version >= 6;
  const definitions = current ? components : legacyComponents;
  const options = { today, kcIds: definitions.map(k => k.id), gatingKcIds: definitions.filter(k => k.gating).map(k => k.id), initialKcIds: [] };
  const parsed = parseLegacy(current ? { ...source, version: 5 } : source, options);
  const allowed = new Set(components.map(k => k.id));
  const rawByKc = Object.fromEntries(Object.entries(parsed.byKc).filter(([id]) => allowed.has(id) && (current || !ambiguous(id)))
    .map(([id, stats]) => [id, current ? stats : { ...stats, confidence: confidenceOf(stats.filteredAccuracy, stats.attempts) }]));
  // Versioned independent assessment is authoritative. Validate its original
  // statistics rather than silently clamping them through the legacy reader.
  const restored = restoreLearningAssessment({ ...source, byKc: source.assessment === undefined ? rawByKc : source.byKc }, { components, exercises, at });
  const byKc = restored.byKc;
  const validCourses = new Set(UNIFIED_COURSES.map(c => c.id));
  const legacyAccess = current ? strings(source.accessibleCourseIds) : SOURCE_COURSES.filter(course => legacyComponents.some(k => k.firstCourseId === course.id && (parsed.introducedKcIds.includes(k.id) || parsed.byKc[k.id]?.attempts > 0))).map(c => c.id);
  // Preserve access granted by the e-row stem's owner in the saved revision:
  // imperative in revision 1, ba in revision 2, potential in revision 3.
  // Importing revision 1 directly must not manufacture revision 2's ba access.
  if (current && parsed.introducedKcIds.includes('stem.godan.e')) {
    const previousCurriculum = source.curriculumVersion ?? 1;
    if (previousCurriculum < 2) legacyAccess.push('imperative');
    else if (previousCurriculum === 2) legacyAccess.push('ba');
  }
  const introduced = new Set(parsed.introducedKcIds.filter(id => allowed.has(id)));
  // Imported applications with missing prerequisites recommend the missing
  // primitives first; historical access never fabricates mastery.
  const byId = new Map(components.map(k => [k.id,k]));
  const visit = id => { const kc=byId.get(id); for(const dependency of kc?.prerequisites ?? []) if(!introduced.has(dependency)) { introduced.add(dependency); visit(dependency); } };
  for(const id of [...introduced]) visit(id);
  const preserved = Object.keys(byKc).length;
  let result = { version: 7, curriculumVersion: CURRICULUM_VERSION, date: parsed.date, attempted: parsed.attempted, correct: parsed.correct, streak: parsed.streak, rotation: parsed.rotation,
    byKc, introducedKcIds: [...introduced].filter(id => byId.get(id)?.gating),
    assessment: restored.assessment,
    accessibleCourseIds: [...new Set(legacyAccess)].filter(id => validCourses.has(id)),
    coursePractice: current ? Object.fromEntries(Object.entries(object(source.coursePractice) ?? {}).filter(([id, keys]) => validCourses.has(id) && Array.isArray(keys)).map(([id,keys])=>[id,[...new Set(strings(keys))].slice(-12)])) : {},
    recentWordKeys: current ? normalizeRecentWordKeys(source.recentWordKeys) : [],
    practiceLog: current ? parsePracticeLog(source.practiceLog) : emptyPracticeLog(),
    legacy: current ? object(source.legacy) : { version: source.version, profile: source },
    migration: current ? object(source.migration) : { from: source.version, preserved, archived: Object.keys(parsed.byKc).length-preserved, message: '原有等价规则记录已保留；复合统计保留为历史证据，新的共享规则与应用缺口将单独确认。' },
  };
  if (source.assessment === undefined) {
    const report = restored.assessment.migration;
    const before = { ...result, byKc: rawByKc, assessment: { ...restored.assessment, assistedByKc: {} } };
    result = appendPracticeEvent(before, result, {
      type: 'migration', outcome: 'migrated', questionId: 'assessment-migration', at: report.at,
      exercise: { id: 'assessment-migration', courseId: '', form: null, surface: '独立评估迁移', reading: '', wordClass: '', domain: 'system' },
      target: { surface: '', reading: '', form: null, label: '旧记录校正', kind: 'migration', kcIds: [], answers: [], readings: [], stepIndex: null, totalSteps: 0, nextTotalSteps: 0 },
      support: { independent: false, source: 'migration', provided: [] },
      diagnosis: { message: `已校正 ${report.changes.length} 个知识点的可核对统计，恢复 ${Object.keys(restored.assessment.pending).length} 项待复测；辅助结果另存。没有可靠日志的历史成绩保留为历史证据。` },
    }, id => byId.get(id)?.label ?? id);
  }
  return result;
}
