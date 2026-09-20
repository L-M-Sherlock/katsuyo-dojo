import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { TEST_SUITES, suiteForTest, testFilesForSuite } from '../scripts/ci-tests.mjs';
const load=name=>yaml.load(readFileSync(`.github/workflows/${name}.yml`,'utf8'));

test('parallel suites run every npm-test file exactly once, including new unclassified tests',()=>{
  const files=readdirSync('tests').filter(file=>file.endsWith('.test.mjs'));
  const assigned=TEST_SUITES.flatMap(suite=>testFilesForSuite(files,suite));
  assert.deepEqual(assigned.sort(),files.sort());
  assert.equal(new Set(assigned).size,files.length);
  assert.equal(suiteForTest('new-regression.test.mjs'),'unit');
  assert.equal(suiteForTest('independent-retest-ui.test.mjs'),'ui');
  assert.equal(suiteForTest('probe-routing-contracts.test.mjs'),'paths');
  assert.equal(suiteForTest('independent-audit-contracts.test.mjs'),'diagnosis');
  assert.throws(()=>testFilesForSuite(files,'missing'));
  assert.notEqual(spawnSync(process.execPath,['scripts/ci-tests.mjs','missing'],{stdio:'ignore'}).status,0);
});
test('ordinary CI runs parallel regression suites and builds without large generation audits',()=>{
  const ci=load('ci');
  assert.deepEqual(ci.jobs.tests.strategy.matrix.suite,TEST_SUITES);
  assert.equal(ci.jobs.tests.needs,undefined);assert.equal(ci.jobs.build.needs,undefined);
  assert.equal(ci.jobs.catalog.needs,undefined);
  assert.ok(ci.jobs.catalog.steps.some(step=>step.run==='npm run audit:eligibility -- --output eligibility-audit.json'));
  const runs=Object.values(ci.jobs).flatMap(job=>(job.steps??[]).map(step=>step.run??'')).join('\n');
  assert.doesNotMatch(runs,/audit:diagnosis|audit:paths|audit-diagnosis\.mjs|audit-diagnostic-paths\.mjs|--representatives/);
  for(const command of ['audit','audit:usage','audit:integration','simulate:perfect','simulate:mixed','typecheck','lint','build'])assert.ok(ci.jobs.build.steps.some(step=>step.run===`npm run ${command}`));
});
test('deployment requires all tests and the same-run build, and rejects failed, cancelled or skipped jobs',()=>{
  const ci=load('ci'),pages=load('pages');
  assert.deepEqual(ci.jobs.verify.needs,['tests','build','catalog']);
  assert.equal(ci.jobs.verify.if,'always()');
  const gate=ci.jobs.verify.steps[0];
  let bash='bash';
  if(process.platform==='win32') {
    // The legacy WSL launcher named bash.exe does not preserve shell arguments.
    const git=spawnSync('git',['--exec-path'],{encoding:'utf8'});
    assert.ifError(git.error);
    assert.equal(git.status,0,git.stderr);
    bash=resolve(git.stdout.trim(),'../../../bin/bash.exe');
  }
  for(const tests of ['success','failure','cancelled','skipped'])for(const build of ['success','failure','cancelled','skipped'])for(const catalog of ['success','failure','cancelled','skipped']) {
    const expected=tests==='success'&&build==='success'&&catalog==='success';
    const result=spawnSync(bash,['-c','export TEST_RESULT="$1" BUILD_RESULT="$2" CATALOG_RESULT="$3"; '+gate.run,'--',tests,build,catalog],{encoding:'utf8'});
    assert.ifError(result.error);
    assert.equal(result.status,expected?0:1,`${tests}/${build}/${catalog}: ${result.stderr}`);
  }
  assert.equal(ci.jobs.deploy.needs,'verify');assert.match(ci.jobs.deploy.if,/push.*refs\/heads\/main/);
  assert.equal(ci.jobs.deploy.uses,'./.github/workflows/pages.yml');
  assert.ok(ci.jobs.build.steps.some(step=>step.uses==='actions/upload-pages-artifact@v3'));
  assert.deepEqual(Object.keys(pages.on),['workflow_call']);
  assert.deepEqual(pages.jobs.deploy.steps.map(step=>step.uses),['actions/deploy-pages@v4']);
});
test('both large audit levels remain manual and run diagnosis and paths on separate runners',()=>{
  for(const name of ['representative-audit','full-audit']) {
    const workflow=load(name);
    assert.deepEqual(Object.keys(workflow.on),['workflow_dispatch']);
    assert.deepEqual(workflow.jobs.audit.strategy.matrix.include.map(entry=>entry.kind),['diagnosis','paths']);
    assert.equal(workflow.jobs.audit.strategy['fail-fast'],false);
    assert.ok(workflow.jobs.audit.steps.some(step=>step.uses==='actions/upload-artifact@v4'&&step.if==='always()'));
    assert.equal(workflow.permissions.pages,undefined);
  }
});
