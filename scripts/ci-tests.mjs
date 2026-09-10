import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const TEST_SUITES = ['unit', 'ui', 'diagnosis', 'paths'];
export function suiteForTest(file) {
  if (/(?:page-interactions|independent-retest-ui)\.test\.mjs$/.test(file)) return 'ui';
  if (/(?:diagnostic-(?:plan|steps)|probe|universal-diagnosis|operation-coverage|nakute-guidance)/.test(file)) return 'paths';
  if (/(?:error|diagnosis|corpus|accepted-input|class-collision|learning-evidence|audit-contract)/.test(file)) return 'diagnosis';
  return 'unit';
}
export function testFilesForSuite(files, suite) {
  if (!TEST_SUITES.includes(suite)) throw new Error(`Unknown suite: ${suite}`);
  return files.filter(file => file.endsWith('.test.mjs') && suiteForTest(file) === suite).sort();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/ci-tests.mjs <suite>');
  const files = testFilesForSuite(readdirSync('tests'), process.argv[2]);
  if (!files.length) throw new Error('Empty test suite');
  console.log(`Running ${process.argv[2]}: ${files.length} test files`);
  const result = spawnSync(process.execPath, ['--test', ...files.map(file => `tests/${file}`)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
