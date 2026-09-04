import { componentConfidence } from "./adaptive.mjs";

export function summarizeCourseProgress(course, required, introducedKcIds, byKc) {
  const introduced = introducedKcIds instanceof Set ? introducedKcIds : new Set(introducedKcIds);
  const owned = required.filter((component) => component.firstCourseId === course.id);
  const courseIntroduced = course.forms.length === 0 || owned.some((component) => introduced.has(component.id));
  const introducedCount = owned.filter((component) => introduced.has(component.id)).length;
  const practicedAhead = owned.some((component) => (byKc[component.id]?.attempts ?? 0) > 0);
  const percent = owned.length
    ? Math.round(Math.min(...owned.map((component) => introduced.has(component.id) ? componentConfidence(component, byKc) : 0)) * 100)
    : 0;
  const needsRecovery = owned.some((component) => introduced.has(component.id) &&
    (byKc[component.id]?.bestConfidence ?? 0) >= 1 && componentConfidence(component, byKc) < 1);
  const needsCoverage = owned.some((component) => introduced.has(component.id) &&
    component.coverageKcIds.some((id) => (byKc[id]?.correct ?? 0) < 1));
  const status = !courseIntroduced
    ? practicedAhead ? "已预习" : "未解锁"
    : introducedCount < owned.length
      ? `知识点 ${introducedCount}/${owned.length}`
      : percent >= 100
        ? "已达标"
        : needsCoverage
          ? "待覆盖"
          : needsRecovery
            ? "需加强"
            : `${percent}%`;
  return { required, owned, status, percent };
}
