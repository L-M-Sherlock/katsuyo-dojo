import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { buildEligibilityReport } from './lib/eligibility-audit.mjs';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--output')) throw new Error('Usage: npm run audit:eligibility -- [--output path.json]');
const baseline = JSON.parse(readFileSync(new URL('../tests/fixtures/eligibility-baseline.json', import.meta.url), 'utf8'));
const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
try {
  const [{ KNOWLEDGE }, { UNIFIED_COURSES }, { assessFormUsage, USAGE_REVIEW_VERSION }, { reviewedLexicalSense }] = await Promise.all([
    server.ssrLoadModule('/app/page.tsx'), server.ssrLoadModule('/app/lib/unified-curriculum.mjs'),
    server.ssrLoadModule('/app/lib/form-eligibility.mjs'),
    server.ssrLoadModule('/app/lib/lexical-usage.mjs'),
  ]);
  const report = buildEligibilityReport(KNOWLEDGE, { courses: UNIFIED_COURSES, assessFormUsage, reviewedLexicalSense, reviewVersion: USAGE_REVIEW_VERSION, baseline });
  if (args.length) writeFileSync(resolve(args[1]), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${report.issues.length ? 'Eligibility catalog FAILED' : 'Eligibility catalog OK'}: ${JSON.stringify(report.summary)}\n`);
  if (report.issues.length) {
    process.stderr.write(`${JSON.stringify(report.issues, null, 2)}\n`);
    process.exitCode = 1;
  }
} finally { await server.close(); }
