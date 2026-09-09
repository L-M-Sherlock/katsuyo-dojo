const counters=['contexts','classifications','plans','paths','nodes','atomicContexts','cases','flows','flowSteps','failures','savedFailures','structuralRepresentatives'];
// Required audit dimensions are deliberately checked outside the generator.
// Removing a family from every shard must not make it disappear from the gate.
const requiredFamilies=['accepted','invalid','unreadable','omit','repeat','transpose','voicing','size','row','other-form','stop','lexical','pair','lexical-pair','three-plus','fuzz'];
const sum=object=>Object.values(object).reduce((a,b)=>a+b,0);
export function mergeDiagnosticPaths(shards,expectedForms) {
  const result={schemaVersion:1,scope:'all',seed:shards[0]?.report.seed,forms:expectedForms.length,coverageErrors:[],shards:shards.length,
    ...Object.fromEntries(counters.map(k=>[k,0])),families:{},outcomes:{},failureCodes:{},dimensions:{},learningAudit:{version:1,cases:0,checks:0,flows:0,flowChecks:0}};
  const seen=new Set();
  for(const {forms,report} of shards) {
    if(report.seed!==result.seed||report.forms!==forms.length||report.scope!==`forms:${forms.join(',')}`)throw new Error('Inconsistent audit shard');
    for(const f of forms){if(seen.has(f)||!expectedForms.includes(f))throw new Error(`Duplicate/unknown shard form ${f}`);seen.add(f);}
    for(const key of counters){if(!Number.isSafeInteger(report[key])||report[key]<0)throw new Error(`Missing count ${key}`);result[key]+=report[key];}
    for(const key of ['families','outcomes','failureCodes','dimensions'])for(const [name,value] of Object.entries(report[key])) {
      if(!Number.isSafeInteger(value)||value<0)throw new Error(`Invalid ${key} count ${name}`);
      result[key][name]=(result[key][name]??0)+value;
    }
    if(sum(report.families)!==report.cases||sum(report.outcomes)!==report.cases||sum(report.dimensions)!==report.contexts)throw new Error('Inconsistent audit counts');
    const learning = report.learningAudit;
    if(learning?.version!==1 || learning.cases!==report.cases || learning.flows!==report.flows
      || !Number.isSafeInteger(learning.checks) || learning.checks<report.cases*7
      || !Number.isSafeInteger(learning.flowChecks) || learning.flowChecks<report.flowSteps*14+report.flows)
      throw new Error('Missing or incomplete learning-evidence audit in path shard.');
    for(const key of ['cases','checks','flows','flowChecks'])result.learningAudit[key]+=learning[key];
    result.coverageErrors.push(...report.coverageErrors);
  }
  if(seen.size!==expectedForms.length)throw new Error('Incomplete all-form path audit');
  if(!result.classifications)result.coverageErrors.push('缺少分类题检查');
  for(const family of requiredFamilies)if(!result.families[family])result.coverageErrors.push(`未生成 ${family}`);
  return result;
}
export function renderPathAudit(report) {
  return ['# 全量诊断路径与输入变异审计','',`固定种子：${report.seed}；互斥分片：${report.shards}；范围：全部 ${report.forms} 种活用形式。`,
    `词条／形式组合 ${report.contexts} 个，分类词条 ${report.classifications} 个，合法路径 ${report.paths} 条，操作节点 ${report.nodes} 个。`,
    `输入用例 ${report.cases} 条，基本拆步上下文 ${report.atomicContexts} 个，流程 ${report.flows} 轮（执行 ${report.flowSteps} 步）。`,
    `违规 ${report.failures} 项；覆盖违规 ${report.coverageErrors.length} 项。`,'',
    `学习证据审计 v${report.learningAudit.version}：输入计分／重放 ${report.learningAudit.checks} 次；连续流程计分／重放 ${report.learningAudit.flowChecks} 次。独立、拆步、提示、反馈、揭晓和过早同词练习均经过实际页面计分入口。`,'',
    '路径顺序、规则和给定类别由独立测试策略核对；正确完整词形采用既有活用器，每个基本操作另有语言规则校验。',
    '单处错误与接受变体覆盖全词库；跨节点两处错误、词汇与活用混合、三处以上错误及固定种子模糊输入覆盖全部结构代表。检查未知输入的补查路径、合法变体、答案泄露、重复扣分及流程终止。',
    '独立预期不会把所有未知输入都指定到一个知识点，也不会用“不扣分”替代完整反馈与可继续练习的合同。有限模式覆盖不能证明任意自然输入都能唯一归因。','',
    '| 输入族 | 用例 |','|---|---:|',...Object.entries(report.families).map(([k,v])=>`| ${k} | ${v} |`),'',
    `失败计数以 summary.json 为准；各分片最多保留 1,000 个有代表性的失败样本和 20 个最小化反例，合并已保存 ${report.savedFailures} 个失败。`,
    '回放：`npm run audit:paths -- --replay outputs/diagnostic-paths/minimal-counterexamples.jsonl --output outputs/diagnostic-replay`。',
    ...report.coverageErrors.map(e=>`覆盖违规：${e}`),''].join('\n');
}
