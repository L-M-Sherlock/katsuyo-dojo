import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { simulateLearning } from '../app/lib/perfect-simulation.mjs';
import { knowledgeModelForScope } from '../app/lib/curriculum.mjs';

const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
try {
  const { VERB_KNOWLEDGE, ADJECTIVE_KNOWLEDGE } = await server.ssrLoadModule('/app/page.tsx');
  for (const [route, model] of [['verbCore', knowledgeModelForScope(VERB_KNOWLEDGE, 'core')], ['verbFull', VERB_KNOWLEDGE], ['adjective', ADJECTIVE_KNOWLEDGE]]) {
    const attempts = new Map();
    const report = simulateLearning(model, { answerFor: ({ focus }) => {
      const count = attempts.get(focus.id) ?? 0;
      attempts.set(focus.id, count + 1);
      if (count === 0) return { correct: false };
      if (count === 1) return { correct: true, hintUsed: true };
      if (count === 2) return { correct: false, revealed: true };
      return { correct: true };
    } });
    assert.equal(report.completed, true, `${route}: ${report.reason}`);
    assert.equal(report.completedFacetCount, report.facetCount, `${route}: missing coverage`);
    console.log(JSON.stringify({ route, completed: report.completed, rounds: report.roundCount, questions: report.questionCount }));
  }
} finally { await server.close(); }
