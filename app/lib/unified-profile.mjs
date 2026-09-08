import { parseProfileImport as parseLegacy } from './profile-transfer.mjs';
import { confidenceOf } from './adaptive.mjs';
import { normalizeRecentWordKeys } from './exercise-selection.mjs';
import { CURRICULUM_VERSION, SOURCE_COURSES, UNIFIED_COURSES } from './unified-curriculum.mjs';

export const UNIFIED_STORAGE_KEY = 'katsuyo-practice-profile-v6';
export const LEGACY_STORAGE_KEY = 'katsuyo-practice-profile-v5';
const FORMAT = 'katsuyo-dojo-profile';
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const strings = value => Array.isArray(value) ? value.filter(id => typeof id === 'string') : [];
const ambiguous = id => id.startsWith('composition.') || id === 'compound.voice-stack' || id === 'suffix.masu' || id.startsWith('facet.form.masu.');
export function createUnifiedExport(profile, exportedAt = new Date().toISOString()) {
  return { format: FORMAT, formatVersion: 3, exportedAt, profile };
}
export function parseUnifiedImport(value, { today, components, legacyComponents }) {
  const envelope = object(value);
  if (!envelope || ('format' in envelope && (envelope.format !== FORMAT || ![1, 2, 3].includes(envelope.formatVersion)))) throw new Error('这不是受支持的活用道場备份文件。');
  const source = object(envelope.profile) ?? envelope;
  if (![4, 5, 6].includes(source.version)) throw new Error('备份版本不受支持或数据不完整。');
  const current = source.version === 6;
  const definitions = current ? components : legacyComponents;
  const options = { today, kcIds: definitions.map(k => k.id), gatingKcIds: definitions.filter(k => k.gating).map(k => k.id), initialKcIds: [] };
  const parsed = parseLegacy(current ? { ...source, version: 5 } : source, options);
  const allowed = new Set(components.map(k => k.id));
  const byKc = Object.fromEntries(Object.entries(parsed.byKc).filter(([id]) => allowed.has(id) && (current || !ambiguous(id))).map(([id, stats]) => [id, { ...stats, confidence: confidenceOf(stats.filteredAccuracy, stats.attempts) }]));
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
  return { version: 6, curriculumVersion: CURRICULUM_VERSION, date: parsed.date, attempted: parsed.attempted, correct: parsed.correct, streak: parsed.streak, rotation: parsed.rotation,
    byKc, introducedKcIds: [...introduced].filter(id => byId.get(id)?.gating),
    accessibleCourseIds: [...new Set(legacyAccess)].filter(id => validCourses.has(id)),
    coursePractice: current ? Object.fromEntries(Object.entries(object(source.coursePractice) ?? {}).filter(([id, keys]) => validCourses.has(id) && Array.isArray(keys)).map(([id,keys])=>[id,[...new Set(strings(keys))].slice(-12)])) : {},
    recentWordKeys: current ? normalizeRecentWordKeys(source.recentWordKeys) : [],
    legacy: current ? object(source.legacy) : { version: source.version, profile: source },
    migration: current ? object(source.migration) : { from: source.version, preserved, archived: Object.keys(parsed.byKc).length-preserved, message: '原有等价规则记录已保留；复合统计保留为历史证据，新的共享规则与应用缺口将单独确认。' },
  };
}
