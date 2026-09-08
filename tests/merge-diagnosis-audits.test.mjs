import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDiagnosisAudits, partitionDiagnosisForms, renderMergedDiagnosisReport } from '../scripts/lib/merge-diagnosis-audits.mjs';

function shard(form,{exploratory=false}={}) {
  const row=(id,total,explore=false)=>({id,label:id.toUpperCase(),level:explore?'explore':'contract',total,
    contractCases:explore?0:total,exploratoryCases:explore?total:0,pass:explore?0:total,
    regression:0,recognized:0,retry:0,deferred:0,gap:explore?total:0,
    examples:explore?[{id:`${form}-${id}`,status:'gap',surface:'書く',form,input:'x',actual:{failed:null,confirmed:[],steps:0}}]:[]});
  return {schemaVersion:2,scope:`forms:${form}`,replay:null,total:5,contractCases:exploratory?2:5,exploratoryCases:exploratory?3:0,
    uniqueInputs:4,forms:1,exercises:2,acceptedCollisionsExcluded:1,regressions:0,gaps:exploratory?3:0,deferred:0,coverageErrors:[],
    patterns:[row('a',2),row('b',3,exploratory)],
    knowledgeCoverage:[{id:'rule',label:'Rule',gating:true,exposure:5,expectedFailure:2,expectedConfirmation:1},
      {id:'facet',label:'Facet',gating:false,exposure:2,expectedFailure:0,expectedConfirmation:0}],
    dimensions:[{key:`verb/godan/${form}/whole`,total:5,regression:0,gap:exploratory?3:0,patterns:{a:2,b:3}}]};
}

test('form shards sum exact disjoint counts, pattern evidence and knowledge exposure',()=>{
  const first=shard('te'),second=shard('past',{exploratory:true});
  const before=structuredClone([first,second]);
  const merged=mergeDiagnosisAudits([first,second],{expectedForms:['past','te']});
  assert.deepEqual([first,second],before,'merge must not mutate worker reports');
  assert.equal(merged.scope,'all');
  assert.equal(merged.total,10);
  assert.equal(merged.uniqueInputs,8);
  assert.equal(merged.exercises,4);
  assert.equal(merged.forms,2);
  assert.equal(merged.contractCases,7);
  assert.equal(merged.exploratoryCases,3);
  assert.equal(merged.acceptedCollisionsExcluded,2);
  assert.equal(merged.gaps,3);
  assert.deepEqual(merged.coverageErrors,[]);
  assert.deepEqual(merged.dimensions,[...first.dimensions,...second.dimensions]);
  assert.equal(merged.patterns[1].level,'mixed');
  assert.equal(merged.patterns[1].total,6);
  assert.deepEqual(merged.knowledgeCoverage[0],{id:'rule',label:'Rule',gating:true,exposure:10,expectedFailure:4,expectedConfirmation:2});
});

test('overlap, wrong scopes, incomplete catalogs and inconsistent dimensions cannot fake full coverage',()=>{
  assert.throws(()=>mergeDiagnosisAudits([shard('te'),shard('te')],{expectedForms:['te']}),/Overlapping/);
  assert.throws(()=>mergeDiagnosisAudits([{...shard('te'),scope:'all'}],{expectedForms:['te']}),/form-shard/);
  assert.throws(()=>mergeDiagnosisAudits([{...shard('te'),scope:'forms:te;pattern:a'}],{expectedForms:['te']}),/form-shard/);
  assert.throws(()=>mergeDiagnosisAudits([shard('te')],{expectedForms:['past']}),/Unexpected form/);
  assert.throws(()=>mergeDiagnosisAudits([{...shard('te'),forms:2}],{expectedForms:['te']}),/form count/);
  const invalid=shard('past');invalid.knowledgeCoverage.pop();
  assert.throws(()=>mergeDiagnosisAudits([shard('te'),invalid],{expectedForms:['te','past']}),/Knowledge catalogs differ/);
  const foreign=shard('te');foreign.dimensions[0].key='verb/godan/past/whole';
  assert.throws(()=>mergeDiagnosisAudits([foreign],{expectedForms:['te']}),/outside shard scope/);
  const negative=shard('te');negative.uniqueInputs=-1;
  assert.throws(()=>mergeDiagnosisAudits([negative],{expectedForms:['te']}),/Invalid audit count/);
});

test('missing forms, globally ungenerated patterns and worker coverage failures remain blocking',()=>{
  const local=shard('te');
  local.coverageErrors=['local evidence failed'];
  local.patterns.push({...local.patterns[0],id:'empty',label:'EMPTY',total:0,contractCases:0,pass:0});
  const merged=mergeDiagnosisAudits([local],{expectedForms:['te','past']});
  assert.ok(merged.coverageErrors.some(error=>error.includes('local evidence failed')));
  assert.ok(merged.coverageErrors.includes('未分配形式 past'));
  assert.ok(merged.coverageErrors.includes('仅覆盖 1/2 种形式'));
  assert.ok(merged.coverageErrors.includes('未生成模式 empty'));
});

test('comparison is recomputed at full scope and distinguishes existing from new patterns',()=>{
  const reports=[shard('te'),shard('past',{exploratory:true})];
  const baseline=mergeDiagnosisAudits(reports,{expectedForms:['te','past']});
  baseline.total=6;baseline.gaps=1;baseline.patterns=baseline.patterns.slice(0,1);
  baseline.patterns[0]={...baseline.patterns[0],total:6};
  const merged=mergeDiagnosisAudits(reports,{expectedForms:['te','past'],baseline,baselinePath:'/tmp/before.json'});
  assert.deepEqual(merged.comparison.metrics.total,{before:6,after:10,delta:4});
  assert.deepEqual(merged.comparison.existingPatterns.total,{before:6,after:4});
  assert.equal(merged.comparison.patterns[0].comparable,true);
  assert.equal(merged.comparison.patterns[1].comparable,false);
  assert.equal(merged.comparison.patterns[1].total.before,0);
  assert.match(renderMergedDiagnosisReport(merged),/\/tmp\/before\.json/);
  assert.match(renderMergedDiagnosisReport(merged),/B（新增）/);
  assert.throws(()=>mergeDiagnosisAudits(reports,{expectedForms:['te','past'],baseline:{...baseline,scope:'forms:te'}}),/same pattern\/replay scope/);
});

test('deterministic form partitioning keeps repeated courses and domains in exactly one worker',()=>{
  const exercise=(form,surface,domain='verb')=>({form,item:{surface,domain}});
  const exercises=[exercise('te','書く'),exercise('te','書く'),exercise('past','書く'),
    exercise('adjectiveBa','白い','adjective'),exercise('adjectiveBa','静か','adjective'),
    exercise('negative','書く'),exercise('masu','書く'),exercise(null,'書く')];
  const groups=partitionDiagnosisForms(exercises,4);
  assert.equal(groups.length,4);
  assert.ok(groups.every(group=>group.length));
  assert.equal(groups.flat().length,5);
  assert.equal(new Set(groups.flat()).size,5);
  assert.deepEqual(partitionDiagnosisForms([...exercises].reverse(),4),groups);
  assert.equal(groups.filter(group=>group.includes('adjectiveBa')).length,1);
  assert.deepEqual(partitionDiagnosisForms([],4),[]);
  assert.throws(()=>partitionDiagnosisForms(exercises,0),/positive integer/);
});
