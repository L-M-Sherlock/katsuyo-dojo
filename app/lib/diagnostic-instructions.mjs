import { FORM_LABELS } from './form-labels.mjs';

const className = cls => ({godan:'五段动词',ichidan:'一段动词',irregular:'不规则动词',i:'い形容词',na:'な形容词'})[cls];
export const practiceStage = node => node.practiceStage ?? node.conjugationStage;

// The internal node label names a rule. The displayed instruction also names
// the full conjugation that this operation is helping the learner construct.
export function atomicInstruction(plan, index) {
  const node=plan.nodes[index];
  let stage;
  for(let start=0;start<=index;start++) {
    const candidate=practiceStage(plan.nodes[start]);
    if(candidate&&start+candidate.length>index)stage=candidate;
  }
  const goal=FORM_LABELS[stage?.form??plan.form]??stage?.label??node.label;
  const next=plan.nodes[index+1];
  const suffix=next&&['append','verb-terminal'].includes(next.operation)&&next.output.reading.startsWith(next.input.reading)
    ? next.output.reading.slice(next.input.reading.length) : '';
  const later=suffix ? `，暂时不要接「${suffix}」` : '';
  const action=node.operation==='row'?'只变化词尾'
    : node.operation==='drop'?'只去掉词尾る'
    : node.operation==='sound'?`先完成${node.label}`
    : ['append','verb-terminal'].includes(node.operation)?`在给定形式后完成${node.label}`
    : `完成${node.label}`;
  const rule=node.operation==='row'?`把词尾变到${node.label.replace('词干','')}。${node.ruleKcIds.includes('stem.godan.u-wa')?'「う」结尾在这里变为「わ」。':''}`:'';
  return {
    goalLabel:goal,
    targetLabel:`${goal} · ${node.label.replace('词干','词尾变化')}`,
    prompt:`${goal}：${action}${['row','drop','sound'].includes(node.operation)?later:''}。`,
    note:`已提供正确输入和词类（${className(node.item.class)}）。${rule}请填写变化后的整个形式。`,
  };
}
