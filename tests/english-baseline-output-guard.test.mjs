import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('both English generators protect the historical module before any write and allow temporary output', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'katsuyo-english-output-guard-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (relative, bytes) => {
    const destination = path.join(root, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes);
  };
  write('scripts/generate-english-usage-overlay.mjs', fs.readFileSync(new URL('../scripts/generate-english-usage-overlay.mjs', import.meta.url)));
  write('app/lib/usage-cards.mjs', 'export const USAGE_CARDS = [];\nexport const resolveUsageCard = () => null;\n');
  write('app/lib/usage-cards/reviewed-revisions.mjs', 'export const REVIEWED_USAGE_CARD_REVISIONS = [{id: "isolated-fixture"}];\nexport const REVIEWED_USAGE_CARD_DEFERRALS = [];\n');
  const baseline = 'app/lib/i18n/content/en/usage-cards.mjs';
  const anchor = '// immutable isolated English baseline\n';
  write(baseline, anchor);
  // Use the real generator functions in a separate module graph. No production
  // module, translation service, proof or work directory is touched.
  write('scripts/regression.mjs', `
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {generateEnglishUsageOverlay, mergeEnglishUsageAgentOutputs, freezeEnglishUsageAgentAssignments} from './generate-english-usage-overlay.mjs';
const root = process.cwd();
const baseline = path.join(root, ${JSON.stringify(baseline)});
let calls = 0;
const translator = {id: 'fixture', async translateCard() { calls += 1; throw Error('Unexpected translator call'); }};
for (const outputPath of [baseline, path.join(root, 'app/lib/i18n/content/en/../en/usage-cards.mjs')]) {
  const workDir = path.join(root, 'must-not-be-written');
  await assert.rejects(generateEnglishUsageOverlay({cards: [], translator, workDir, outputPath}), /Cannot overwrite the historical English baseline/);
  await assert.rejects(mergeEnglishUsageAgentOutputs({cards: [], workDir, outputPath}), /Cannot overwrite the historical English baseline/);
  await assert.rejects(fs.stat(workDir), {code: 'ENOENT'});
}
const alias = path.join(root, 'baseline-link.mjs');
await fs.symlink(baseline, alias);
await assert.rejects(generateEnglishUsageOverlay({cards: [], translator, workDir: path.join(root, 'alias-work'), outputPath: alias}), /Cannot overwrite the historical English baseline/);
await assert.rejects(fs.stat(path.join(root, 'alias-work')), {code: 'ENOENT'});
assert.equal(calls, 0);
assert.equal(await fs.readFile(baseline, 'utf8'), ${JSON.stringify(anchor)});
const temporary = path.join(root, 'temporary.mjs');
await generateEnglishUsageOverlay({cards: [], translator, workDir: path.join(root, 'temp-google-work'), outputPath: temporary});
assert.match(await fs.readFile(temporary, 'utf8'), /EN_USAGE_CARD_OVERLAYS/);
const agentWork = path.join(root, 'temp-agent-work');
await freezeEnglishUsageAgentAssignments({cards: [], workDir: agentWork, projectRoot: root});
const agentOutput = path.join(root, 'temporary-agent.mjs');
await mergeEnglishUsageAgentOutputs({cards: [], workDir: agentWork, outputPath: agentOutput});
assert.match(await fs.readFile(agentOutput, 'utf8'), /EN_USAGE_CARD_OVERLAYS/);
assert.equal(await fs.readFile(baseline, 'utf8'), ${JSON.stringify(anchor)});
`);
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/regression.mjs')], {
    cwd: root, encoding: 'utf8', timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.readFileSync(path.join(root, baseline), 'utf8'), anchor);
});
