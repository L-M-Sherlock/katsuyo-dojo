#!/usr/bin/env node
// Read the project's own catalog and validators; do not duplicate its grammar.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const help = `Usage:
  node card-workbench.mjs prepare --project DIR (--forms FORM,... | --group GROUP | --stage STAGE)
      [--candidate-limit N] [--missing-classes | --missing-pairs] [--output assignment.json]
  node card-workbench.mjs check --project DIR --input draft.mjs|draft.json
      [--forms FORM,...] [--assignment class-gaps.json] [--output review.md]

The project defaults to the current directory. No repository files are modified.
prepare includes all eligible candidates unless --candidate-limit is supplied.
check accepts drafts, prints resolved sentences, and checks only the assigned scope.
No command marks content approved or verifies Japanese naturalness automatically.`;

function options(argv) {
  const command = argv.shift();
  if (!command || command === '--help' || argv.includes('--help')) return {command:'help'};
  if (!['prepare', 'check'].includes(command)) throw new Error(`Unknown command: ${command}`);
  const allowed = new Set(command === 'prepare'
    ? ['project','forms','group','stage','candidate-limit','missing-classes','missing-pairs','output'] : ['project','forms','input','assignment','output']);
  const result = {command, project:process.cwd()};
  while (argv.length) {
    const arg = argv.shift();
    if (!arg.startsWith('--') || !allowed.has(arg.slice(2))) throw new Error(`Unknown option: ${arg}`);
    if (['--missing-classes','--missing-pairs'].includes(arg)) { result[arg.slice(2)] = true; continue; }
    const value = argv.shift();
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    result[arg.slice(2)] = value;
  }
  if (command === 'prepare' && [result.forms,result.group,result.stage].filter(Boolean).length !== 1) throw new Error('Choose exactly one of --forms, --group or --stage');
  if (result['missing-classes'] && result['missing-pairs']) throw new Error('Choose one coverage mode');
  if (result['missing-pairs'] && result['candidate-limit']) throw new Error('Do not truncate exact-pair assignments; split the resulting manifest instead');
  if (command === 'check' && !result.input) throw new Error('--input is required');
  if (result['candidate-limit'] !== undefined && (!/^\d+$/.test(result['candidate-limit']) || Number(result['candidate-limit']) < 1)) throw new Error('--candidate-limit must be a positive integer');
  return result;
}

async function projectModules(root) {
  const read = name => import(pathToFileURL(path.join(root,'app','lib',name)).href);
  const [cards,lexicon,curriculum,labels,semantics,eligibility,knowledge] = await Promise.all([
    read('usage-cards.mjs'),read('lexical-usage.mjs'),read('unified-curriculum.mjs'),
    read('form-labels.mjs'),read('form-semantics.mjs'),read('form-eligibility.mjs'),read('unified-knowledge.mjs'),
  ]);
  return {cards,lexicon,curriculum,labels,semantics,eligibility,knowledge};
}
function selectedForms(options, project) {
  const available = new Set(project.curriculum.UNIFIED_COURSES.flatMap(course=>course.forms));
  let forms;
  if (options.forms) forms = [...new Set(options.forms.split(',').map(s=>s.trim()).filter(Boolean))];
  else if (options.group) {
    const group = project.cards.USAGE_CARD_GROUPS.find(g=>g.id===options.group);
    if (!group) throw new Error(`Unknown group ${options.group}; available: ${project.cards.USAGE_CARD_GROUPS.map(g=>g.id).join(', ')}`);
    forms = [...new Set(project.curriculum.UNIFIED_COURSES.filter(c=>group.stages.includes(c.stageId)).flatMap(c=>c.forms))];
  } else if(options.stage) {
    forms=[...new Set(project.curriculum.UNIFIED_COURSES.filter(c=>c.stageId===options.stage).flatMap(c=>c.forms))];
  } else return null;
  if (!forms.length) throw new Error('The requested form list is empty');
  for (const form of forms) if (!available.has(form)) throw new Error(`Unknown curriculum form: ${form}`);
  return forms;
}
async function emit(text, output, summary) {
  if (output) {
    await fs.writeFile(path.resolve(output), text, {encoding:'utf8'});
    console.log(JSON.stringify({...summary, output:path.resolve(output)},null,2));
  } else console.log(text);
}
function prepare(options, project, forms) {
  const limit = options['candidate-limit'] === undefined ? Infinity : Number(options['candidate-limit']);
  return forms.flatMap(form=>{
    const eligible = project.lexicon.REVIEWED_LEXICAL_SENSES.map(s=>project.cards.usageCardItem(s.id)).filter(Boolean).filter(item=>{
      const usage=project.eligibility.assessFormUsage(item,form);
      return usage.status==='allowed' || (usage.status==='context-required' && Boolean(usage.context));
    });
    const existing=project.cards.USAGE_CARDS.filter(c=>c.form===form);
    const make = (pool, cls = null) => ({form,...(cls ? {class:cls} : {}),label:project.labels.FORM_LABELS[form],semantics:project.semantics.semanticsForForm(form),
      eligibleCandidates:pool.length,omittedCandidates:Math.max(0,pool.length-limit),
      existingCards:existing.map(c=>({id:c.id,senseId:c.senseId,review:c.review})),
      candidates:pool.slice(0,limit).map(item=>({senseId:item.id,surface:item.surface,reading:item.reading,
        meaning:item.meaning,class:item.class,transitivity:item.transitivity,usage:project.eligibility.assessFormUsage(item,form),
        answer:project.knowledge.deriveUnified(item,form).answer,
        answerReading:project.knowledge.deriveUnified({...item,surface:item.reading,lexicalSurface:item.surface},form).answer,
        existingIds:existing.filter(c=>c.senseId===item.id).map(c=>c.id),
      }))});
    if (options['missing-pairs']) {
      const covered = new Set(existing.filter(c=>c.review==='approved'&&!project.cards.usageCardIssues([c]).length).map(c=>c.senseId));
      return eligible.filter(item=>!covered.has(item.id)).map(item=>({form,label:project.labels.FORM_LABELS[form],
        semantics:project.semantics.semanticsForForm(form),senseId:item.id,surface:item.surface,reading:item.reading,meaning:item.meaning,class:item.class,
        transitivity:item.transitivity,usage:project.eligibility.assessFormUsage(item,form),
        answer:project.knowledge.deriveUnified(item,form).answer,
        answerReading:project.knowledge.deriveUnified({...item,surface:item.reading,lexicalSurface:item.surface},form).answer}));
    }
    if (!options['missing-classes']) return [make(eligible)];
    const covered = new Set(existing.filter(c=>c.review==='approved').map(c=>project.cards.usageCardItem(c.senseId)?.class));
    return [...new Set(eligible.map(item=>item.class))].filter(cls=>!covered.has(cls))
      .map(cls=>make(eligible.filter(item=>item.class===cls),cls));
  });
}
async function check(options, project, forms) {
  const input=path.resolve(options.input);
  const cards=input.endsWith('.json') ? JSON.parse(await fs.readFile(input,'utf8')) : (await import(pathToFileURL(input).href)).default;
  if (!Array.isArray(cards)) throw new Error('Input must be a JSON array or an ES module default-exporting an array');
  const issues=project.cards.usageCardIssues(cards);
  const validObjects=cards.filter(c=>c&&typeof c==='object'&&!Array.isArray(c));
  const actual=new Set(validObjects.map(c=>c.form));
  if (forms) {
    for(const form of forms) if(!actual.has(form)) issues.push(`Missing assigned form: ${form}`);
    for(const form of actual) if(!forms.includes(form)) issues.push(`Unassigned form: ${form}`);
  }
  if (options.assignment) {
    const assignment=JSON.parse(await fs.readFile(path.resolve(options.assignment),'utf8'));
    if (!Array.isArray(assignment) || assignment.some(a=>!a.form||!a.class)) throw new Error('Assignment must list form/class or exact sense/form requirements');
    const exact=assignment.length>0 && assignment.every(a=>a.senseId);
    if(!exact&&assignment.some(a=>a.senseId))throw new Error('Do not mix exact-pair and class assignments');
    const required=new Set(assignment.map(a=>exact?`${a.senseId}/${a.form}`:`${a.form}/${a.class}`)), counts=new Map();
    for(const card of validObjects){
      const cls=project.cards.usageCardItem(card.senseId)?.class;
      const pair=exact?`${card.senseId}/${card.form}`:`${card.form}/${cls}`;counts.set(pair,(counts.get(pair)??0)+1);
      if(!required.has(pair))issues.push(`${card.id}: unassigned ${exact?'sense/form':'form/class'} ${pair}`);
    }
    for(const pair of required)if(counts.get(pair)!==1)issues.push(`Expected one card for ${pair}, found ${counts.get(pair)??0}`);
  }
  const incomingIds=new Set(validObjects.map(c=>c.id));
  const unchanged=project.cards.USAGE_CARDS.filter(c=>!incomingIds.has(c.id));
  for(const card of validObjects){
    const duplicate=unchanged.find(c=>c.senseId===card.senseId&&c.form===card.form);
    if(duplicate) issues.push(`${card.id}: sense/form already exists as ${duplicate.id}; revise the assigned existing card or choose an uncovered pair`);
  }
  const replaced=validObjects.flatMap(c=>{
    const old=project.cards.USAGE_CARDS.find(old=>old.id===c.id);
    return old?[{id:c.id,previousPair:`${old.senseId}/${old.form}`,newPair:`${c.senseId}/${c.form}`}]:[];
  });
  const summary={cards:cards.length,forms:actual.size,pairs:new Set(validObjects.map(c=>`${c.senseId}/${c.form}`)).size,
    drafts:validObjects.filter(c=>c.review==='draft').length,approved:validObjects.filter(c=>c.review==='approved').length,
    writingReview:project.cards.usageCardWritingReview?.(validObjects)??[],issues,replaced};
  let report='# 用法卡批次校验\n\n结构校验不代表自然度审核；本工具不会批准稿件。writingReview 是正文书写的人工审核候选，不强制每句话使用汉字。\n\n```json\n'+JSON.stringify(summary,null,2)+'\n```\n';
  const bySense=new Map();
  for(const card of validObjects){
    if(!bySense.has(card.senseId))bySense.set(card.senseId,[]);
    bySense.get(card.senseId).push(card);
  }
  for(const [senseId,group] of bySense){
    report+=`\n# 词条 ${senseId}（${group.length} 张）\n\n连看全部形式：时间、肯否、后项与译文是否一致？\n`;
  for(const card of group){
    if(project.cards.usageCardIssues([card]).length)continue;
    const resolved=project.cards.resolveUsageCard(card);
    if(!resolved)continue;
    const join=parts=>parts.map(p=>p.text).join(''),kana=parts=>parts.map(p=>p.reading??p.text).join('');
    report+=`\n## ${card.id}\n\n- 目标：${project.labels.FORM_LABELS[card.form]} · ${card.senseId}\n- 目标含义：${project.semantics.semanticsForForm(card.form)?.coreMeaning ?? ''}\n- 状态：${card.review}\n- 场景：${card.scene}\n- 正面：${join(card.before)}＿＿＿＿${join(card.after)}\n- 完整句：${join(card.before)}【${resolved.target.text}】${join(card.after)}\n- 读音：${kana(card.before)}【${resolved.target.reading}】${kana(card.after)}\n- 译文：${card.translation}\n`;
    if(card.note)report+=`- 说明：${card.note}\n`;
  }
  }
  const {replaced: replacements, writingReview, ...counts} = summary;
  await emit(report,options.output,{...counts,writingReviewCandidates:writingReview.length,replacedCards:replacements.length});
  if(issues.length)process.exitCode=1;
}
try {
  const args=options(process.argv.slice(2));
  if(args.command==='help')console.log(help);
  else {
    const project=await projectModules(path.resolve(args.project));
    const forms=selectedForms(args,project);
    if(args.command==='prepare'){
      const manifest=prepare(args,project,forms);
      await emit(JSON.stringify(manifest,null,2)+'\n',args.output,{requirements:manifest.length,forms:new Set(manifest.map(row=>row.form)).size,candidates:manifest.reduce((n,f)=>n+(f.candidates?.length??(f.senseId?1:0)),0)});
    }else await check(args,project,forms);
  }
}catch(error){console.error(`card-workbench: ${error.message}`);process.exitCode=2;}
