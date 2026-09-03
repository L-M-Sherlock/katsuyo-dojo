import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

try {
  const [{ KNOWLEDGE }, { auditKnowledgeModel }, adaptive] = await Promise.all([
    server.ssrLoadModule("/app/page.tsx"),
    server.ssrLoadModule("/app/lib/knowledge-model.mjs"),
    server.ssrLoadModule("/app/lib/adaptive.mjs"),
  ]);
  const issues = auditKnowledgeModel(KNOWLEDGE);
  const gating = KNOWLEDGE.components.filter((component) => component.gating);
  for (const focus of gating) {
    const balanced = adaptive.balanceComponentsForCourse(focus, gating, KNOWLEDGE.courseKcIds[focus.firstCourseId] ?? []);
    const plan = adaptive.makeRoundPlan(focus, balanced, 12, 0);
    const assignments = adaptive.makeUniqueAssignments(plan, {
      alternativesFor: (preferred, index) => {
        const others = balanced.filter((component) => component.id !== preferred.id);
        return others.length ? [...others.slice(index % others.length), ...others.slice(0, index % others.length)] : [];
      },
      candidatesFor: (component) => adaptive.rankExercisesForFocus(
        KNOWLEDGE.exercises.filter((exercise) => exercise.courseIndex === focus.firstCourseIndex && exercise.kcIds.includes(component.id)),
        component.id,
        {},
        component.coverageKcIds,
      ),
      keyOf: (_component, exercise) => `${exercise.form ?? "classify"}:${exercise.verb.surface}`,
      orderedCandidates: (component) => component.coverageKcIds.length > 0 || component.id === "exception.ru-godan",
      seed: 17,
    });
    const assigned = assignments.map(({ candidate }) => candidate).filter(Boolean);
    if (assigned.length !== 12) issues.push({ code: "incomplete-round", id: focus.id, assigned: assigned.length });
    if (assigned.some((exercise) => exercise.courseIndex !== focus.firstCourseIndex)) issues.push({ code: "cross-course-round", id: focus.id });
    if (new Set(assigned.map((exercise) => `${exercise.form ?? "classify"}:${exercise.verb.surface}`)).size !== assigned.length) issues.push({ code: "duplicate-round-exercise", id: focus.id });
    for (const facetId of focus.coverageKcIds) {
      if (!assigned.some((exercise) => exercise.kcIds.includes(facetId))) issues.push({ code: "missing-round-coverage", id: focus.id, facetId });
    }
  }
  if (issues.length) {
    process.stderr.write(`${JSON.stringify(issues, null, 2)}\n`);
    process.exitCode = 1;
  } else {
    const gatingCount = gating.length;
    const facetCount = KNOWLEDGE.components.filter((component) => component.id.startsWith("facet.")).length;
    process.stdout.write(`Knowledge model OK: ${gatingCount} gating KCs, ${facetCount} coverage facets, ${KNOWLEDGE.exercises.length} exercises.\n`);
  }
} finally {
  await server.close();
}
