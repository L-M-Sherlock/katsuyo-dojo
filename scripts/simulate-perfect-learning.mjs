import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

try {
  const [{ VERB_KNOWLEDGE, ADJECTIVE_KNOWLEDGE }, { simulatePerfectLearning }, { knowledgeModelForScope }] = await Promise.all([
    server.ssrLoadModule("/app/page.tsx"),
    server.ssrLoadModule("/app/lib/perfect-simulation.mjs"),
    server.ssrLoadModule("/app/lib/curriculum.mjs"),
  ]);
  const summarize = (model, report) => {
    const labels = new Map(model.components.map((component) => [component.id, component.label]));
    const topRedundantFocus = Object.entries(report.redundantByFocus)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([id, questions]) => ({ id, label: labels.get(id), questions }));
    return {
      completed: report.completed,
      reason: report.reason,
      rounds: report.roundCount,
      questions: report.questionCount,
      gatingKcs: `${report.masteredCount}/${report.gatingCount}`,
      coverageFacets: report.facetCount,
      completedCoverageFacets: report.completedFacetCount,
      preMasteredIntroductions: report.preMasteredIntroductions,
      redundantFocusQuestions: report.redundantFocusQuestions,
      redundantFocusRatio: Number((report.redundantFocusQuestions / report.questionCount).toFixed(3)),
      topRedundantFocus,
      longestFocusRun: report.longestFocusRun,
      repeatedFocusKcs: report.repeatedFocusKcs,
      gatingAttempts: { min: report.minGatingAttempts, max: report.maxGatingAttempts },
      courseRounds: report.courseRounds,
    };
  };
  const coreModel = knowledgeModelForScope(VERB_KNOWLEDGE, "core");
  const coreReport = simulatePerfectLearning(coreModel);
  const fullReport = simulatePerfectLearning(VERB_KNOWLEDGE);
  const adjectiveReport = simulatePerfectLearning(ADJECTIVE_KNOWLEDGE);
  const summary = {
    verbCore: summarize(coreModel, coreReport),
    verbFull: summarize(VERB_KNOWLEDGE, fullReport),
    adjectiveCore: summarize(ADJECTIVE_KNOWLEDGE, adjectiveReport),
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if ([coreReport, fullReport, adjectiveReport].some((report) => !report.completed || report.completedFacetCount !== report.facetCount || report.repeatedFocusKcs.length > 0)) process.exitCode = 1;
} finally {
  await server.close();
}
