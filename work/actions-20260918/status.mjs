import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readDelivery} from '../../.agents/skills/write-katsuyo-usage-cards/scripts/delivery-store.mjs';
import { resolveUsageCard, usageCardIssues, USAGE_CARDS } from '../../app/lib/usage-cards.mjs';
import {createPipeline} from './pipeline.mjs';
const dir=new URL('./',import.meta.url);
const read=p=>JSON.parse(fs.readFileSync(new URL(p,dir),'utf8'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const exists=p=>fs.existsSync(new URL(p,dir));
const manifest=read('manifest.json');
const pipeline=createPipeline();
const workflow=new Map((await pipeline.run('list')).batches.map(b=>[b.batch,b]));
const base=read('baseline.json');
if(hash(fs.readFileSync(new URL('requirements.json',dir)))!==base.requirementHash)throw Error('Requirements mutated');
const old=read('baseline-cards.json');
if(hash(JSON.stringify(old))!==base.oldCardHash)throw Error('Baseline mutated');
const issues=[];
for(const c of old){const now=USAGE_CARDS.find(n=>n.id===c.id);if(!now||JSON.stringify(now)!==JSON.stringify(c))issues.push('Old card changed '+c.id);}
let drafted=0,reviewed=0,approved=0,unresolved=0,pendingReReview=0,legacyLedgerCards=0;
const counts=[];
for(const m of manifest){
  if(hash(fs.readFileSync(new URL(m.assignment,dir)))!==m.hash)issues.push(`Assignment changed: ${m.assignment}`);
  if(!exists(m.cards))continue;
  const cards=read(m.cards), assignment=read(m.assignment);
  drafted+=cards.length;
  const pair=c=>`${c.senseId}/${c.form}`;
  const expected=new Set(assignment.map(pair));
  const actual=new Set(cards.map(pair));
  const structural=usageCardIssues(cards);
  if(cards.length!==m.count||actual.size!==m.count||cards.some(c=>!expected.has(pair(c))))issues.push(`Card scope mismatch: ${m.cards}`);
  if(structural.length)issues.push(...structural.map(x=>`${m.cards}: ${x}`));
  let ok=0,un=0;
  const reviewFile=m.cards.replace('.cards.json','.review.json');
  const batchId=`${m.lane}/${String(m.batch).padStart(2,'0')}`;
  const flow=workflow.get(batchId);
  const reportFrozen=flow?.status==='reviewed';
  if(exists(reviewFile)&&flow?.status==='unassigned')legacyLedgerCards+=cards.length;
  // A reopened ledger is withdrawn, even if its old object hashes still match.
  if(exists(reviewFile)&&!reportFrozen)pendingReReview+=cards.length;
  if(flow?.status==='reviewed'){
    const state=await pipeline.run('describe',{batch:batchId});
    if(state.reviewFreeze.delivery){
      try {
        const delivered=readDelivery(fileURLToPath(dir),state.reviewFreeze.delivery);
        for(const [file,expectedHash] of Object.entries(state.reviewFreeze.files)){
          if(!delivered.has(file)||hash(delivered.get(file))!==expectedHash)issues.push(`Delivery differs from accepted freeze: ${file}`);
        }
      } catch(error){issues.push(`Invalid delivery snapshot ${batchId}: ${error.message}`);}
    }
    for(const [file,expectedHash] of Object.entries(state.reviewFreeze.files)){
      if(!exists(file)||hash(fs.readFileSync(new URL(file,dir)))!==expectedHash)issues.push(`Frozen review artifact drift: ${file}`);
    }
  }
  if(exists(reviewFile)&&reportFrozen){
    const ledger=read(reviewFile);
    if(!Array.isArray(ledger)){issues.push(`Ledger is not array: ${reviewFile}`);continue;}
    const ids=new Set(ledger.map(r=>r.id));
    if(ledger.length!==cards.length||ids.size!==cards.length)issues.push(`Ledger scope mismatch: ${reviewFile}`);
    for(const c of cards){
      const record=ledger.find(r=>r.id===c.id),r=resolveUsageCard(c);
      const sentence=r ? c.before.map(p=>p.text).join('')+r.target.text+c.after.map(p=>p.text).join('') : null;
      if(!record||record.hash!==hash(JSON.stringify(c))||record.sentence!==sentence||!record.reason?.trim()||!['approved','unresolved'].includes(record.status)){issues.push(`Invalid/current review missing: ${c.id}`);continue;}
      reviewed++;if(record.status==='approved'){ok++;approved++;}else {un++;unresolved++;}
    }
  }
  counts.push({lane:m.lane,batch:m.batch,state:flow?.status??'legacy',cards:cards.length,reviewed:ok+un,approved:ok,unresolved:un});
}
console.log(JSON.stringify({required:manifest.reduce((s,m)=>s+m.count,0),drafted,reviewed,approved,unresolved,pendingReReview,legacyLedgerCards,issues,batches:counts},null,2));
if(issues.length)process.exitCode=1;
