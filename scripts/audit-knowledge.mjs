import { createServer } from "vite";
import { createPracticePlanner } from '../app/lib/practice-planning.mjs';
import { assignPracticeExercises, exerciseKey } from "../app/lib/exercise-selection.mjs";

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

try {
  const [{ VERB_KNOWLEDGE, ADJECTIVE_KNOWLEDGE, KNOWLEDGE }, { auditKnowledgeModel, deriveExercise }, adaptive, { knowledgeModelForScope }, { MULTI_STEP_FORMS }] = await Promise.all([
    server.ssrLoadModule("/app/page.tsx"),
    server.ssrLoadModule("/app/lib/knowledge-model.mjs"),
    server.ssrLoadModule("/app/lib/adaptive.mjs"),
    server.ssrLoadModule("/app/lib/curriculum.mjs"),
    server.ssrLoadModule("/app/lib/compound-forms.mjs"),
  ]);
  const issues = [];
  const models = [["verb", VERB_KNOWLEDGE], ["adjective", ADJECTIVE_KNOWLEDGE], ["unified", KNOWLEDGE]];
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
      const multiStep = model.components.find((component) => component.id === "compound.multi-step");
      const expectedMultiStepForms = new Set(MULTI_STEP_FORMS);
      const multiStepExercises = model.exercises.filter((exercise) => expectedMultiStepForms.has(exercise.form));
      const actualMultiStepForms = new Set(multiStepExercises.map((exercise) => exercise.form));
      if (multiStep?.firstCourseId !== "multiStepCompound" || multiStepExercises.some((exercise) => exercise.courseId !== "multiStepCompound") || [...expectedMultiStepForms].some((form) => !actualMultiStepForms.has(form))) {
        issues.push({ domain, code: "multi-step-not-isolated" });
      }
      for (const exercise of multiStepExercises) {
        try { deriveExercise(exercise.item, exercise.form); }
        catch (error) { issues.push({ domain, code: "invalid-multi-step-exercise", exerciseId: exercise.id, message: error.message }); }
      }
    }
    const gating = model.components.filter((component) => component.gating);
    const practicePlanner = domain === "unified" ? createPracticePlanner(model) : null;
    for (const focus of gating) {
      const prior = domain === "unified" ? Object.fromEntries(model.components.map(k => [k.id, { attempts: 5, correct: 5, filteredAccuracy: 1, confidence: 1 }])) : {};
      if (domain === "unified") for (const id of [focus.id, ...focus.coverageKcIds]) prior[id] = { attempts: 0, correct: 0, filteredAccuracy: null, confidence: 0 };
      const balanced = adaptive.balanceComponentsForCourse(focus, gating, model.courseKcIds[focus.firstCourseId] ?? []);
      const plan = adaptive.makeRoundPlan(focus, balanced, 12, 0);
      let assignments = assignPracticeExercises(plan, {
        byKc: prior,
        alternativesFor: (preferred, index) => {
          const others = balanced.filter((component) => component.id !== preferred.id);
          return others.length ? [...others.slice(index % others.length), ...others.slice(0, index % others.length)] : [];
        },
        candidatesFor: (component) => {
          const candidates = model.exercises.filter((exercise) => exercise.courseIndex === focus.firstCourseIndex && exercise.kcIds.includes(component.id));
          return adaptive.filterReadyExercises(candidates, component.id, model.components, prior);
        },
        seed: 17,
      });
      if (domain === "unified") {
        const planner = practicePlanner;
        const profile = { byKc: prior, introducedKcIds: gating.map(k => k.id), rotation: 0 };
        const planned = planner.plan(focus.firstCourseId, profile, 12);
        assignments = planner.assign(planned, profile, { seed: 17 });
        const used = new Set(assignments.map(({ candidate }) => exerciseKey(candidate)));
        if (assignments.length < 12 && planned.available.some(kc => planner.candidatesFor(kc, profile, focus.firstCourseId)
          .some(e => !used.has(exerciseKey(e)) && planner.hasLearningOpportunity(e, profile)))) {
          issues.push({ domain, code: "premature-short-round", id: focus.id });
        }
      }
      const assigned = assignments.map(({ candidate }) => candidate).filter(Boolean);
      if (!assigned.length || (domain !== "unified" && assigned.length !== 12)) issues.push({ domain, code: "incomplete-round", id: focus.id, assigned: assigned.length });
      if (assigned.some((exercise) => exercise.courseIndex !== focus.firstCourseIndex)) issues.push({ domain, code: "cross-course-round", id: focus.id });
      if (new Set(assigned.map(exerciseKey)).size !== assigned.length) issues.push({ domain, code: "duplicate-round-exercise", id: focus.id });
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
