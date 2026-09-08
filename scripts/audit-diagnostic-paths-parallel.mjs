import {spawn} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {partitionDiagnosisForms} from './lib/merge-diagnosis-audits.mjs';
import {mergeDiagnosticPaths,renderPathAudit} from './lib/merge-diagnostic-paths.mjs';

let output='outputs/diagnostic-paths';
const args=process.argv.slice(2);
if(args.length){if(args.length!==2||args[0]!=='--output')throw new Error('Use --output <directory>');output=args[1];}
const active=new Set();let interrupted=false;
const stop=()=>{
  interrupted=true;
  for(const child of active) {
    child.kill('SIGTERM');
    // A worker can be inside a long synchronous generation loop. Bound its
    // shutdown even when a library installed a deferred signal listener.
    const deadline=setTimeout(()=>child.kill('SIGKILL'),1500).unref();
    child.once('close',()=>clearTimeout(deadline));
  }
};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
const server=await createServer({appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
let model;try{model=(await server.ssrLoadModule('/app/page.tsx')).KNOWLEDGE;}finally{await server.close();}
const expected=[...new Set(model.exercises.map(e=>e.form).filter(Boolean))],groups=partitionDiagnosisForms(model.exercises,4);
let results;
try {
  results=await Promise.allSettled(groups.map(async(forms,i)=>{
    const directory=path.join(output,'shards',String(i+1));await mkdir(directory,{recursive:true});
    for(const file of ['summary.json','failures.jsonl','minimal-counterexamples.jsonl'])await rm(path.join(directory,file),{force:true});
    if(interrupted)throw new Error('Audit interrupted before worker startup');
    const out=openSync(path.join(directory,'stdout.log'),'w'),err=openSync(path.join(directory,'stderr.log'),'w');
    let child;try{child=spawn(process.execPath,['scripts/audit-diagnostic-paths.mjs','--forms',forms.join(','),'--output',directory,...(i?[]:['--classifications'])],{stdio:['ignore',out,err]});}finally{closeSync(out);closeSync(err);}
    active.add(child);
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});active.delete(child);
    if(![0,1].includes(code))throw new Error(`Worker ${i+1} did not finish (${code})`);
    const report=JSON.parse(await readFile(path.join(directory,'summary.json'),'utf8'));
    process.stdout.write(`路径分片 ${i+1}/${groups.length}：${report.cases} 条用例，${report.failures} 项违规。\n`);
    return {forms,report,directory};
  }));
}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
if(interrupted||results.some(r=>r.status==='rejected'))throw new Error(`Incomplete path audit; prior merged report retained. ${results.filter(r=>r.status==='rejected').map(r=>r.reason.message).join('; ')}`);
const shards=results.map(r=>r.value),report=mergeDiagnosticPaths(shards,expected);
await mkdir(output,{recursive:true});
for(const file of ['failures.jsonl','minimal-counterexamples.jsonl','summary.json','report.md']) {
  const content=file==='summary.json'?JSON.stringify(report,null,2)+'\n':file==='report.md'?renderPathAudit(report):(await Promise.all(shards.map(s=>readFile(path.join(s.directory,file),'utf8')))).join('');
  const tmp=path.join(output,`${file}.tmp-${process.pid}`);await writeFile(tmp,content);await rename(tmp,path.join(output,file));
}
process.stdout.write(JSON.stringify({contexts:report.contexts,forms:report.forms,cases:report.cases,flows:report.flows,failures:report.failures,coverageErrors:report.coverageErrors,report:path.join(output,'report.md')})+'\n');
if(report.failures||report.coverageErrors.length)process.exitCode=1;
