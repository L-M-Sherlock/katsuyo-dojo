import { FORM_LABELS } from './form-labels.mjs';
import { diagnosticMessage, diagnosticText } from './i18n/diagnostics.mjs';

const className = cls => ({godan:'五段动词',ichidan:'一段动词',irregular:'不规则动词',i:'い形容词',na:'な形容词'})[cls];
const connectiveForms=new Set(['masu','nasai','tai','nagara','tsutsu','sugiru','tagaru']);
export const practiceStage = node => node.practiceStage ?? node.conjugationStage;

// Keep the construction goal as metadata. Each displayed instruction requests
// only the output accepted by this node, including any unchanged word prefix.
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
  const attachmentSuffix=attachment&&node.output.reading.startsWith(node.input.reading)
    ? node.output.reading.slice(node.input.reading.length) : '';
  const masuStem=connectiveForms.has(stage?.form??plan.form)
    && ['stem.godan.i','stem.ichidan.drop-ru','stem.irregular.connective'].includes(node.ruleKcIds[0]);
  const completesStage=stage?.output?.surface===node.output.surface&&stage?.output?.reading===node.output.reading;
  const stemOnly=!masuStem&&!completesStage&&Boolean(suffix)&&(['row','drop'].includes(node.operation)
    ||node.operation==='irregular');
  const later=suffix ? `，暂时不要接「${suffix}」` : '';
  const action=masuStem?'只写ます词干'
    : node.operation==='row'?'只变化词尾'
    : node.operation==='drop'?'只去掉词尾る'
    : node.operation==='sound'?`完成${node.label}`
    : node.operation==='contract'?'写出缩约形式'
    : `完成${node.label}`;
  const rule=node.operation==='row'?`把词尾变到${node.label.replace('词干','')}。${node.ruleKcIds.includes('stem.godan.u-wa')?'「う」结尾在这里变为「わ」。':''}`:'';
  const localParams={operation:node.operation,ruleId:node.ruleKcIds[0],localInstruction:true};
  const stepTitleMessage=masuStem
    ? diagnosticMessage('diagnostics.instruction.local.masuStem')
    : node.ruleKcIds[0]==='suffix.masu'
      ? diagnosticMessage('diagnostics.instruction.local.masuForm')
      : stemOnly
        ? diagnosticMessage('diagnostics.instruction.local.stem',{ending:suffix})
        : attachment&&endingLabel
          ? diagnosticMessage('diagnostics.instruction.step.addEnding',{endingLabel,endingRule:node.ruleKcIds[0]})
          : attachment&&attachmentSuffix
            ? diagnosticMessage('diagnostics.instruction.local.add',{ending:attachmentSuffix})
            : node.operation==='irregular'
              ? diagnosticMessage('diagnostics.instruction.local.form',{goalLabel:goal,goalForm:stage?.form??plan.form})
              : node.operation==='contract'
                ? diagnosticMessage('diagnostics.instruction.step.contract')
                : diagnosticMessage('diagnostics.instruction.step.complete',{operationLabel:node.label,...localParams});
  const promptMessage=node.ruleKcIds[0]==='suffix.masu'
    ? diagnosticMessage('diagnostics.instruction.local.masuFormPrompt')
    : attachment&&endingLabel
      ? diagnosticMessage('diagnostics.instruction.local.attachPrompt',{
        preparation,endingLabel,endingRule:node.ruleKcIds[0],preparationKind,
      })
      : attachment&&attachmentSuffix
        ? diagnosticMessage('diagnostics.instruction.local.addPrompt',{ending:attachmentSuffix})
        : node.operation==='irregular'&&!masuStem&&!stemOnly
          ? diagnosticMessage('diagnostics.instruction.local.formPrompt',{
            goalLabel:goal,goalForm:stage?.form??plan.form,later,laterSuffix:suffix,
          })
          : diagnosticMessage(masuStem||stemOnly?'diagnostics.instruction.local.stemPrompt':'diagnostics.instruction.local.actionPrompt',{
            action,later,laterSuffix:suffix,masuStem,...localParams,
          });
  const noteMessage=diagnosticMessage('diagnostics.instruction.note',{
    source:source.surface,classLabel:className(source.class),classId:source.class,rule,
    completion:'',needsCompletion:false,
    operation:node.operation,ruleId:node.ruleKcIds[0],uWa:node.ruleKcIds.includes('stem.godan.u-wa'),
  });
  return {
    goalLabel:goal,
    goalForm:stage?.form??plan.form,
    stepTitle:stepTitleMessage.message,
    targetLabel:stepTitleMessage.message,
    prompt:promptMessage.message,
    note:noteMessage.message,
    i18n: {
      goalLabel: diagnosticText('diagnostics.instruction.goal',{goalLabel:goal,goalForm:stage?.form??plan.form}),
      stepTitle: diagnosticText(stepTitleMessage.messageKey,stepTitleMessage.params),
      targetLabel: diagnosticText(stepTitleMessage.messageKey,stepTitleMessage.params),
      prompt: diagnosticText(promptMessage.messageKey,promptMessage.params),
      note: diagnosticText(noteMessage.messageKey,noteMessage.params),
    },
  };
}
