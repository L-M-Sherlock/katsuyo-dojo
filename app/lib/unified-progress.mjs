import { isComponentMastered, componentConfidence } from './adaptive.mjs';

export function summarizeUnifiedCourse(course, required, introducedIds, profile) {
  const introduced = new Set(introducedIds);
  const gating = required.filter(kc => kc.gating);
  const owned = gating.filter(kc => kc.firstCourseId === course.id);
  const preservedAccess = profile.accessibleCourseIds?.includes(course.id) ?? false;
  const opened = owned.some(kc => introduced.has(kc.id));
  const mastered = gating.filter(kc => isComponentMastered(kc, profile.byKc)).length;
  const reviewCount = (profile.coursePractice?.[course.id] ?? []).length;
  const review = course.review || owned.length === 0;
  const unlocked = preservedAccess || opened || (review && gating.length > 0 && mastered === gating.length);
  const pendingCount = Object.values(profile.assessment?.pending ?? {}).filter(pending => pending.courseId === course.id).length;
  const percent = gating.length ? Math.round(100 * mastered / gating.length) : 0;
  const complete = mastered === gating.length && (!review || reviewCount >= 12) && pendingCount === 0;
  const status = !unlocked ? '未解锁' : pendingCount ? `待复测 ${pendingCount} 项` : complete ? '已达标' : review ? `综合复习 ${reviewCount}/12` : `达标 ${mastered}/${gating.length}`;
  return { required: gating, owned, status, percent, unlocked, complete, mastered, pendingCount, total: gating.length,
    focusPercent: owned.length ? Math.round(Math.min(...owned.map(kc => componentConfidence(kc, profile.byKc))) * 100) : 0 };
}
