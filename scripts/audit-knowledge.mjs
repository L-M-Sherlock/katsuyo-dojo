import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

try {
  const [{ VERB_KNOWLEDGE, ADJECTIVE_KNOWLEDGE }, { auditKnowledgeModel }, adaptive, { knowledgeModelForScope }] = await Promise.all([
    server.ssrLoadModule("/app/page.tsx"),
    server.ssrLoadModule("/app/lib/knowledge-model.mjs"),
    server.ssrLoadModule("/app/lib/adaptive.mjs"),
    server.ssrLoadModule("/app/lib/curriculum.mjs"),
  ]);
  const issues = [];
  const models = [["verb", VERB_KNOWLEDGE], ["adjective", ADJECTIVE_KNOWLEDGE]];
  for (const [domain, model] of models) {
    issues.push(...auditKnowledgeModel(model).map((issue) => ({ domain, ...issue })));
    if (domain === "verb") {
      const sampledIrregulars = [...new Set(model.exercises
        .filter((exercise) => exercise.item.class === "irregular")
        .map((exercise) => exercise.item.surface))];
      const redundantSuruCompounds = sampledIrregulars.filter((surface) => surface !== "する" && surface !== "来る");
      if (redundantSuruCompounds.length) issues.push({ domain, code: "redundant-suru-compounds", surfaces: redundantSuruCompounds });
      const coreModel = knowledgeModelForScope(model, "core");
      if (coreModel.components.some((component) => component.id === "construction.tai") || coreModel.exercises.some((exercise) => exercise.form === "passiveDesireNegativePast")) {
        issues.push({ domain, code: "desire-leaked-into-core" });
      }
    }
    const gating = model.components.filter((component) => component.gating);
    for (const focus of gating) {
      const balanced = adaptive.balanceComponentsForCourse(focus, gating, model.courseKcIds[focus.firstCourseId] ?? []);
      const plan = adaptive.makeRoundPlan(focus, balanced, 12, 0);
      const assignments = adaptive.makeUniqueAssignments(plan, {
        alternativesFor: (preferred, index) => {
          const others = balanced.filter((component) => component.id !== preferred.id);
          return others.length ? [...others.slice(index % others.length), ...others.slice(0, index % others.length)] : [];
        },
        candidatesFor: (component) => adaptive.rankExercisesForFocus(
          model.exercises.filter((exercise) => exercise.courseIndex === focus.firstCourseIndex && exercise.kcIds.includes(component.id)),
          component.id,
          {},
          component.coverageKcIds,
        ),
        keyOf: (_component, exercise) => `${exercise.form ?? "classify"}:${exercise.item.surface}`,
        orderedCandidates: (component) => component.coverageKcIds.length > 0 || component.id === "exception.ru-godan",
        seed: 17,
      });
      const assigned = assignments.map(({ candidate }) => candidate).filter(Boolean);
      if (assigned.length !== 12) issues.push({ domain, code: "incomplete-round", id: focus.id, assigned: assigned.length });
      if (assigned.some((exercise) => exercise.courseIndex !== focus.firstCourseIndex)) issues.push({ domain, code: "cross-course-round", id: focus.id });
      if (new Set(assigned.map((exercise) => `${exercise.form ?? "classify"}:${exercise.item.surface}`)).size !== assigned.length) issues.push({ domain, code: "duplicate-round-exercise", id: focus.id });
      for (const facetId of focus.coverageKcIds) {
        if (!assigned.some((exercise) => exercise.kcIds.includes(facetId))) issues.push({ domain, code: "missing-round-coverage", id: focus.id, facetId });
      }
    }
  }
  if (issues.length) {
    process.stderr.write(`${JSON.stringify(issues, null, 2)}\n`);
    process.exitCode = 1;
  } else {
    const summary = Object.fromEntries(models.map(([domain, model]) => [domain, { gatingKcs: model.components.filter((component) => component.gating).length, coverageFacets: model.components.filter((component) => component.id.startsWith("facet.")).length, exercises: model.exercises.length }]));
    process.stdout.write(`Knowledge models OK: ${JSON.stringify(summary)}\n`);
  }
} finally {
  await server.close();
}
