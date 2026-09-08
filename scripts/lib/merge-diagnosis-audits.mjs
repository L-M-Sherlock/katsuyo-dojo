const TOP_COUNTS = ['total','contractCases','exploratoryCases','uniqueInputs','exercises','acceptedCollisionsExcluded','regressions','gaps','deferred'];
const PATTERN_COUNTS = ['total','contractCases','exploratoryCases','pass','regression','recognized','retry','deferred','gap'];
const KNOWLEDGE_COUNTS = ['exposure','expectedFailure','expectedConfirmation'];

function count(value,label) {
  if(!Number.isSafeInteger(value)||value<0)throw new Error(`Invalid audit count ${label}: ${value}`);
  return value;
}
function addCounts(target,source,keys,label) {
  for(const key of keys)target[key]=count((target[key]??0)+count(source[key],`${label}.${key}`),`${label}.${key} sum`);
}
function assignedForms(report) {
  if(report.schemaVersion!==2||report.replay!==null||!report.scope?.startsWith('forms:')||report.scope.includes(';')) {
    throw new Error('Only complete, unreplayed form-shard reports with schemaVersion 2 can be merged.');
  }
  const forms=report.scope.slice('forms:'.length).split(',').filter(Boolean);
  if(!forms.length||new Set(forms).size!==forms.length)throw new Error(`Invalid shard scope: ${report.scope}`);
  return forms;
}

export function compareDiagnosisAudits(report,baseline,baselinePath) {
  if(baseline.scope!==report.scope||baseline.replay!==report.replay)throw new Error('Comparison summaries must have the same pattern/replay scope.');
  const comparison={baseline:baselinePath,
    metrics:Object.fromEntries(['total','regressions','gaps','deferred'].map(key=>[key,{before:baseline[key],after:report[key],delta:report[key]-baseline[key]}])),
    patterns:report.patterns.map(row=>{
      const old=baseline.patterns.find(pattern=>pattern.id===row.id);
      return {id:row.id,label:row.label,comparable:Boolean(old),...Object.fromEntries(['total','regression','gap','deferred'].map(key=>[
        key,{before:old?.[key]??0,after:row[key],delta:row[key]-(old?.[key]??0)},
      ]))};
    }),
  };
  comparison.existingPatterns=Object.fromEntries(['total','regression','gap','deferred'].map(key=>{
    const existing=comparison.patterns.filter(row=>row.comparable);
    return [key,{before:existing.reduce((sum,row)=>sum+row[key].before,0),after:existing.reduce((sum,row)=>sum+row[key].after,0)}];
  }));
  return comparison;
}

/** Form identity is part of every exercise/input key in the serial runner.
 * Reject overlapping shards instead of guessing how many inputs to deduplicate.
 */
export function mergeDiagnosisAudits(reports,{expectedForms,baseline=null,baselinePath=null}={}) {
  if(!reports.length||!expectedForms?.length)throw new Error('Reports and the expected complete form inventory are required.');
  const expected=new Set(expectedForms);
  if(expected.size!==expectedForms.length)throw new Error('Expected forms must be unique.');
  const seenForms=new Set(),actualForms=new Set(),dimensions=[],dimensionKeys=new Set(),patterns=new Map(),knowledge=new Map(),coverageErrors=[];
  const merged={schemaVersion:2,scope:'all',replay:null,...Object.fromEntries(TOP_COUNTS.map(key=>[key,0]))};
  let patternIds,knowledgeIds;
  reports.forEach((report,index)=>{
    const assigned=assignedForms(report),scope=new Set(assigned);
    for(const form of assigned) {
      if(!expected.has(form))throw new Error(`Unexpected form in shard ${index+1}: ${form}`);
      if(seenForms.has(form))throw new Error(`Overlapping form shards: ${form}`);
      seenForms.add(form);
    }
    const localForms=new Set();
    for(const dimension of report.dimensions) {
      const form=dimension.key.split('/')[2];
      if(!scope.has(form))throw new Error(`Dimension outside shard scope: ${dimension.key}`);
      if(dimensionKeys.has(dimension.key))throw new Error(`Duplicate audit dimension: ${dimension.key}`);
      dimensionKeys.add(dimension.key);localForms.add(form);actualForms.add(form);dimensions.push(structuredClone(dimension));
    }
    if(localForms.size!==report.forms)throw new Error(`Shard ${index+1} form count disagrees with its dimensions.`);
    if(report.dimensions.reduce((sum,row)=>sum+count(row.total,`dimension ${row.key}`),0)!==report.total)throw new Error(`Shard ${index+1} dimension totals disagree.`);
    for(const form of assigned)if(!localForms.has(form))coverageErrors.push(`分片 ${index+1} 未生成形式 ${form}`);
    coverageErrors.push(...report.coverageErrors.map(error=>`分片 ${index+1}：${error}`));
    addCounts(merged,report,TOP_COUNTS,`shard ${index+1}`);
    const currentPatternIds=report.patterns.map(row=>row.id).sort().join('\0');
    const currentKnowledgeIds=report.knowledgeCoverage.map(row=>row.id).sort().join('\0');
    if(patternIds!==undefined&&patternIds!==currentPatternIds)throw new Error('Pattern catalogs differ between shards.');
    if(knowledgeIds!==undefined&&knowledgeIds!==currentKnowledgeIds)throw new Error('Knowledge catalogs differ between shards.');
    patternIds=currentPatternIds;knowledgeIds=currentKnowledgeIds;
    for(const row of report.patterns) {
      if(!patterns.has(row.id))patterns.set(row.id,{...row,...Object.fromEntries(PATTERN_COUNTS.map(key=>[key,0])),examples:[]});
      const target=patterns.get(row.id);
      if(target.label!==row.label)throw new Error(`Pattern metadata differs: ${row.id}`);
      addCounts(target,row,PATTERN_COUNTS,row.id);
      target.examples.push(...structuredClone(row.examples).slice(0,Math.max(0,3-target.examples.length)));
    }
    for(const row of report.knowledgeCoverage) {
      if(!knowledge.has(row.id))knowledge.set(row.id,{...row,...Object.fromEntries(KNOWLEDGE_COUNTS.map(key=>[key,0]))});
      const target=knowledge.get(row.id);
      if(target.label!==row.label||target.gating!==row.gating)throw new Error(`Knowledge metadata differs: ${row.id}`);
      addCounts(target,row,KNOWLEDGE_COUNTS,row.id);
    }
  });
  for(const form of expected)if(!seenForms.has(form))coverageErrors.push(`未分配形式 ${form}`);
  if(actualForms.size!==expected.size)coverageErrors.push(`仅覆盖 ${actualForms.size}/${expected.size} 种形式`);
  for(const row of patterns.values()) {
    row.level=row.contractCases&&row.exploratoryCases?'mixed':row.contractCases?'contract':'explore';
    if(!row.total)coverageErrors.push(`未生成模式 ${row.id}`);
    if(row.total!==row.contractCases+row.exploratoryCases)throw new Error(`Pattern case counts disagree: ${row.id}`);
    if(['pass','regression','recognized','retry','deferred','gap'].reduce((sum,key)=>sum+row[key],0)!==row.total)throw new Error(`Pattern outcomes disagree: ${row.id}`);
  }
  if([...patterns.values()].reduce((sum,row)=>sum+row.total,0)!==merged.total
    ||merged.contractCases+merged.exploratoryCases!==merged.total)throw new Error('Merged case counts disagree.');
  for(const [top,key] of [['regressions','regression'],['gaps','gap'],['deferred','deferred'],['contractCases','contractCases'],['exploratoryCases','exploratoryCases']]) {
    if([...patterns.values()].reduce((sum,row)=>sum+row[key],0)!==merged[top])throw new Error(`Merged ${top} counts disagree.`);
  }
  Object.assign(merged,{forms:actualForms.size,coverageErrors:[...new Set(coverageErrors)],knowledgeCoverage:[...knowledge.values()],patterns:[...patterns.values()],dimensions});
  if(baseline)merged.comparison=compareDiagnosisAudits(merged,baseline,baselinePath);
  return merged;
}

export function partitionDiagnosisForms(exercises,workers=4,baseline=null) {
  if(!Number.isInteger(workers)||workers<1)throw new Error('Worker count must be a positive integer.');
  const seen=new Set(),weights=new Map(),previous=new Map();
  for(const dimension of baseline?.dimensions??[]) {
    const form=dimension.key.split('/')[2];previous.set(form,(previous.get(form)??0)+dimension.total);
  }
  for(const exercise of exercises) {
    if(!exercise.form)continue;
    const key=JSON.stringify([exercise.item.domain,exercise.item.surface,exercise.form]);
    if(seen.has(key))continue;seen.add(key);weights.set(exercise.form,(weights.get(exercise.form)??0)+1);
  }
  const groups=Array.from({length:Math.min(workers,weights.size)},()=>({forms:[],weight:0}));
  for(const [form,count] of [...weights].sort((a,b)=>(previous.get(b[0])??b[1])-(previous.get(a[0])??a[1])||a[0].localeCompare(b[0]))) {
    const group=groups.reduce((best,next)=>next.weight<best.weight?next:best);
    group.forms.push(form);group.weight+=previous.get(form)??count;
  }
  return groups.map(group=>group.forms.sort());
}

export function renderMergedDiagnosisReport(report) {
  const gating=report.knowledgeCoverage.filter(row=>row.gating);
  const lines=['# 归因生成审计报告','',
    `生成用例：${report.total}；不同输入上下文：${report.uniqueInputs}；覆盖形式：${report.forms}。`,
    `约定回归或安全违规：${report.regressions}；探索模式未识别：${report.gaps}；仅有拆步回退：${report.deferred}。`,'',
    '按目标形式划分的独立分片已合并；形式互不重叠，因此用例、不同输入上下文和练习数可以精确相加。',
    '探索未识别不表示可以直接推断某个知识点错误；此报告不能证明覆盖所有自然错误。','',
    '| 模式 | 级别 | 用例 | 约定通过 | 已识别（待语义评审） | 提示重试 | 仅拆步回退 | 探索未识别 | 回归／违规 |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|',
    ...report.patterns.map(row=>`| ${row.label} | ${row.level} | ${row.total} | ${row.pass} | ${row.recognized} | ${row.retry} | ${row.deferred} | ${row.gap} | ${row.regression} |`),'',
    '完整失败及缺口：`findings.jsonl`。可按 `id` 使用 `npm run audit:diagnosis -- --replay <id> --output outputs/diagnosis-replay` 重现。','',
    '## 知识点约定覆盖','',`有直接扣分预期的达标知识点：${gating.filter(row=>row.expectedFailure>0).length}/${gating.length}；有明确部分正确预期：${gating.filter(row=>row.expectedConfirmation>0).length}/${gating.length}。`,
    '这些指标表示已有独立测试约定，不是知识点正确率。逐原子明细见 summary.json。','',
    ...report.coverageErrors.map(error=>`覆盖检查失败：${error}`),'','## 示例','',
  ];
  for(const row of report.patterns)for(const example of row.examples)lines.push(`- **${row.label} / ${example.status}**：${example.surface} → ${example.form}；输入「${example.input}」。实际扣分：${example.actual.failed??'无'}；已确认：${example.actual.confirmed.join('、')||'无'}；剩余步骤：${example.actual.steps}。ID：\`${example.id}\`。`);
  if(report.comparison) {
    const comparison=report.comparison;
    lines.push('','## 与基线比较','',`基线：\`${comparison.baseline}\`。用例生成范围可能扩大；数量变化与诊断改善应分别解读。`,
      `既有模式的未识别：${comparison.existingPatterns.gap.before} → ${comparison.existingPatterns.gap.after}；仅拆步回退：${comparison.existingPatterns.deferred.before} → ${comparison.existingPatterns.deferred.after}。`,'',
      '| 模式 | 用例数（前 → 后） | 未识别（前 → 后） | 拆步回退（前 → 后） | 回归（前 → 后） |','|---|---:|---:|---:|---:|',
      ...comparison.patterns.map(row=>`| ${row.label}${row.comparable?'':'（新增）'} | ${row.total.before} → ${row.total.after} | ${row.gap.before} → ${row.gap.after} | ${row.deferred.before} → ${row.deferred.after} | ${row.regression.before} → ${row.regression.after} |`));
  }
  return lines.join('\n')+'\n';
}
