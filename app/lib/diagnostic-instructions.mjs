import { FORM_LABELS } from './form-labels.mjs';
import { diagnosticMessage, diagnosticText } from './i18n/diagnostics.mjs';

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
  const source=stage?.source??plan.nodes[0]?.item;
  const previous=plan.nodes[index-1], next=plan.nodes[index+1];
  const attachment=['append','verb-terminal'].includes(node.operation);
  const endingLabel={
    'suffix.passive':'受身词尾','suffix.causative':'使役词尾','suffix.causativePassive':'使役受身词尾',
    'suffix.negative':'否定词尾','adj.suffix.i-negative':'否定词尾','suffix.past':'过去词尾','suffix.te':'て形词尾',
    'suffix.potential':'可能词尾','suffix.volitional':'意向词尾',
  }[node.ruleKcIds[0]];
  const stemReady=previous&&(['row','drop','sound'].includes(previous.operation)||previous.ruleKcIds.includes('adj.stem.i-ku'));
  const preparation=stemReady?(previous.operation==='sound'?'音便已完成':'词尾变化已完成'):'已给出本步需要的形式';
  const preparationKind=stemReady?(previous.operation==='sound'?'sound':'ending'):'given';
  const suffix=next&&['append','verb-terminal'].includes(next.operation)&&next.output.reading.startsWith(next.input.reading)
    ? next.output.reading.slice(next.input.reading.length) : '';
  const later=suffix ? `，暂时不要接「${suffix}」` : '';
  const action=node.operation==='row'?'只变化词尾'
    : node.operation==='drop'?'只去掉词尾る'
    : node.operation==='sound'?`先完成${node.label}`
    : ['append','verb-terminal'].includes(node.operation)?`在给定形式后完成${node.label}`
    : `完成${node.label}`;
  const rule=node.operation==='row'?`把词尾变到${node.label.replace('词干','')}。${node.ruleKcIds.includes('stem.godan.u-wa')?'「う」结尾在这里变为「わ」。':''}`:'';
  const operationLabel=node.label.replace('词干','词尾变化');
  const stepTitleMessage=attachment
    ? endingLabel
      ? diagnosticMessage('diagnostics.instruction.step.addEnding',{endingLabel,endingRule:node.ruleKcIds[0]})
      : diagnosticMessage('diagnostics.instruction.step.complete',{operationLabel:node.label,ruleId:node.ruleKcIds[0]})
    : node.operation==='row'
      ? diagnosticMessage('diagnostics.instruction.step.row',{goalLabel:goal,goalForm:stage?.form??plan.form})
      : node.operation==='drop'
        ? diagnosticMessage('diagnostics.instruction.step.dropRu')
        : node.operation==='contract'
          ? diagnosticMessage('diagnostics.instruction.step.contract')
          : diagnosticMessage('diagnostics.instruction.step.complete',{operationLabel:node.label,ruleId:node.ruleKcIds[0]});
  const targetMessage=diagnosticMessage('diagnostics.instruction.target',{
    goalLabel:goal,goalForm:stage?.form??plan.form,operationLabel,ruleId:node.ruleKcIds[0],
  });
  const promptMessage=attachment&&endingLabel
    ? diagnosticMessage('diagnostics.instruction.prompt.attach',{
      preparation,endingLabel,endingRule:node.ruleKcIds[0],goalLabel:goal,goalForm:stage?.form??plan.form,
      preparationKind,
    })
    : diagnosticMessage('diagnostics.instruction.prompt.action',{
      goalLabel:goal,goalForm:stage?.form??plan.form,action,
      later:['row','drop','sound'].includes(node.operation)?later:'',laterSuffix:['row','drop','sound'].includes(node.operation)?suffix:'',
      operation:node.operation,ruleId:node.ruleKcIds[0],
    });
  const noteMessage=diagnosticMessage('diagnostics.instruction.note',{
    source:source.surface,classLabel:className(source.class),classId:source.class,rule,
    completion:attachment&&endingLabel?'':'请填写变化后的整个形式。',needsCompletion:!(attachment&&endingLabel),
    operation:node.operation,ruleId:node.ruleKcIds[0],uWa:node.ruleKcIds.includes('stem.godan.u-wa'),
  });
  return {
    goalLabel:goal,
    goalForm:stage?.form??plan.form,
    stepTitle:stepTitleMessage.message,
    targetLabel:targetMessage.message,
    prompt:promptMessage.message,
    note:noteMessage.message,
    i18n: {
      goalLabel: diagnosticText('diagnostics.instruction.goal',{goalLabel:goal,goalForm:stage?.form??plan.form}),
      stepTitle: diagnosticText(stepTitleMessage.messageKey,stepTitleMessage.params),
      targetLabel: diagnosticText(targetMessage.messageKey,targetMessage.params),
      prompt: diagnosticText(promptMessage.messageKey,promptMessage.params),
      note: diagnosticText(noteMessage.messageKey,noteMessage.params),
    },
  };
}
