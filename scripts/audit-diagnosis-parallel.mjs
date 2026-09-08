import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, openSync, closeSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import { mergeDiagnosisAudits, partitionDiagnosisForms, renderMergedDiagnosisReport } from './lib/merge-diagnosis-audits.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const args=process.argv.slice(2);let baselinePath=null;
for(let index=0;index<args.length;index++) {
  if(args[index]==='--compare'&&args[index+1]&&!baselinePath)baselinePath=args[++index];
  else throw new Error(`Unknown/missing option: ${args[index]}`);
}
const active=new Set();let interrupted=null;
const stop=signal=>{
  interrupted=signal;
  for(const child of active) {
    child.kill(signal);
    const deadline=setTimeout(()=>child.kill('SIGKILL'),1500).unref();
    child.once('close',()=>clearTimeout(deadline));
  }
};
const stopInterrupt=()=>stop('SIGINT'),stopTerminate=()=>stop('SIGTERM');
process.on('SIGINT',stopInterrupt);process.on('SIGTERM',stopTerminate);
const baseline=baselinePath?JSON.parse(await readFile(path.resolve(baselinePath),'utf8')):null;
if(baseline&&(baseline.scope!=='all'||baseline.replay!==null))throw new Error('The comparison baseline must be a complete, unreplayed all-form report.');
const server=await createServer({root,appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
let model;
try {model=(await server.ssrLoadModule('/app/page.tsx')).KNOWLEDGE;}finally{await server.close();}
const expectedForms=[...new Set(model.exercises.map(exercise=>exercise.form).filter(Boolean))];
const groups=partitionDiagnosisForms(model.exercises,4,baseline);
if(!groups.length)throw new Error('No conjugation forms to audit.');
const shardRoot=path.join(root,'outputs/diagnosis-shards'),output=path.join(root,'outputs/diagnosis-audit');
let shards;
try {
  const results=await Promise.allSettled(groups.map(async(forms,index)=>{
    const directory=path.join(shardRoot,String(index+1));
    await mkdir(directory,{recursive:true});
    // Prevent a crashed worker from being mistaken for a stale successful run.
    await Promise.all(['summary.json','findings.jsonl','report.md'].map(name=>rm(path.join(directory,name),{force:true})));
    if(interrupted)throw new Error(`Audit interrupted by ${interrupted}`);
    const out=openSync(path.join(directory,'stdout.log'),'w'),err=openSync(path.join(directory,'stderr.log'),'w');
    let child;
    try {child=spawn(process.execPath,[path.join(root,'scripts/audit-diagnosis.mjs'),'--forms',forms.join(','),'--output',directory],{cwd:root,stdio:['ignore',out,err]});}
    finally {closeSync(out);closeSync(err);}
    active.add(child);
    const status=await new Promise(resolve=>{
      child.once('error',error=>resolve({code:null,error:error.message}));
      child.once('close',(code,signal)=>resolve({code,signal}));
    });
    active.delete(child);
    let report,error;
    try {report=JSON.parse(await readFile(path.join(directory,'summary.json'),'utf8'));}
    catch(cause){error=cause.message;}
    process.stdout.write(`分片 ${index+1}/${groups.length} 完成：${forms.length} 种形式；${report?`${report.total} 条用例，${report.regressions} 项回归`:`失败（${status.error??error??status.signal??status.code}）`}。\n`);
    return {directory,forms,status,report,error};
  }));
  shards=results.map((result,index)=>{
    if(result.status==='fulfilled')return result.value;
    process.stdout.write(`分片 ${index+1}/${groups.length} 失败：${result.reason?.message??result.reason}。\n`);
    return {directory:path.join(shardRoot,String(index+1)),forms:groups[index],status:{code:null,error:String(result.reason)},report:null};
  });
}finally {
  process.removeListener('SIGINT',stopInterrupt);process.removeListener('SIGTERM',stopTerminate);
}
if(interrupted)throw new Error(`Audit interrupted by ${interrupted}; the previous merged report was left intact.`);
const failed=shards.filter(shard=>!shard.report||shard.status.error||![0,1].includes(shard.status.code));
if(failed.length)throw new Error(`Incomplete audit workers; previous merged report left intact. Inspect ${failed.map(shard=>path.relative(root,shard.directory)).join(', ')}.`);
const report=mergeDiagnosisAudits(shards.map(shard=>shard.report),{expectedForms,baseline,baselinePath});
await mkdir(output,{recursive:true});
const temporary=name=>path.join(output,`${name}.tmp-${process.pid}`);
try {
  await pipeline((async function*(){for(const shard of shards)yield* createReadStream(path.join(shard.directory,'findings.jsonl'));})(),createWriteStream(temporary('findings.jsonl')));
  await writeFile(temporary('summary.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(temporary('report.md'),renderMergedDiagnosisReport(report));
  for(const name of ['findings.jsonl','summary.json','report.md'])await rename(temporary(name),path.join(output,name));
}finally {
  await Promise.all(['findings.jsonl','summary.json','report.md'].map(name=>rm(temporary(name),{force:true})));
}
process.stdout.write(JSON.stringify({total:report.total,uniqueInputs:report.uniqueInputs,forms:report.forms,regressions:report.regressions,gaps:report.gaps,deferred:report.deferred,report:path.relative(root,path.join(output,'report.md'))})+'\n');
if(report.coverageErrors.length||report.regressions||shards.some(shard=>shard.status.code!==0))process.exitCode=1;
