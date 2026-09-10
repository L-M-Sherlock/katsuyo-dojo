import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { needsDiagnosisAudit, changedFiles } from '../scripts/ci-audit-scope.mjs';

test('planning-only changes skip expensive audits; engine, scoring and unknown rules trigger representative checks',()=>{
  assert.equal(needsDiagnosisAudit(['app/lib/practice-session.mjs','docs/probe-routing.md','tests/practice-session.test.mjs']),false);
  for(const path of ['app/lib/answer-analysis.mjs','app/lib/new-rule.mjs','app/lib/learning-assessment.mjs','scripts/lib/error-patterns.mjs','scripts/audit-diagnosis.mjs','app/page.tsx','package-lock.json'])assert.equal(needsDiagnosisAudit([path]),true,path);
});
test('diff selection includes both PR and push bases and fails conservatively on unavailable history',()=>{
  const base='a'.repeat(40),head='b'.repeat(40);
  const run=(cmd,args)=>{assert.equal(cmd,'git');assert.deepEqual(args,['diff','--name-only','-z',base,head]);return 'app/lib/answer-analysis.mjs\0';};
  assert.deepEqual(changedFiles({before:base,after:head},run),['app/lib/answer-analysis.mjs']);
  assert.deepEqual(changedFiles({pull_request:{base:{sha:base},head:{sha:head}}},run),['app/lib/answer-analysis.mjs']);
  assert.equal(changedFiles({before:'0'.repeat(40),after:head}),null);
  assert.throws(()=>changedFiles({before:'--all',after:head}));
});
test('deployment uses only the successful same-run CI artifact and full audits are manual',()=>{
  const load=name=>yaml.load(readFileSync(`.github/workflows/${name}.yml`,'utf8'));
  const ci=load('ci'),pages=load('pages'),full=load('full-audit');
  assert.equal(ci.jobs.deploy.needs,'verify');
  assert.match(ci.jobs.deploy.if,/push.*refs\/heads\/main/);
  assert.equal(ci.jobs.deploy.uses,'./.github/workflows/pages.yml');
  assert.ok(ci.jobs.verify.steps.some(step=>step.uses==='actions/upload-pages-artifact@v3'));
  assert.deepEqual(Object.keys(pages.on),['workflow_call']);
  assert.deepEqual(pages.jobs.deploy.steps.map(step=>step.uses),['actions/deploy-pages@v4']);
  assert.deepEqual(Object.keys(full.on),['workflow_dispatch']);
  assert.ok(!ci.jobs.verify.steps.some(step=>/audit:.*parallel/.test(step.run??'')));
});
