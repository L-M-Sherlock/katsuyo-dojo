// Observations describe the submitted text. They never supply scoring evidence.
// Correct outputs remain hidden until the corresponding probe is answered.
export function diagnosticFeedback({item,answer,diagnosis,steps,plan,step,normalize=value=>value}) {
  const actual=normalize(answer),observations=[];
  if(diagnosis?.message)return {resolution:diagnosis.targetMismatch?'target-form':diagnosis.kcId?'rule':diagnosis.stage?'stage':diagnosis.review?'mixed':'partial',
    message:diagnosis.message,observations,terminal:steps.length===0};
  const selection = steps[0]?.probeSelection;
  if (selection) return { resolution: 'stage-priority', message: selection.message,
    observations: [{ kind: 'candidate-stage', text: selection.label }], terminal: false };
  for(const n of plan?.nodes??[]) {
    if(n.operation!=='row')continue;
    const root=normalize(n.fixed.reading),expected=normalize(n.output.reading).slice(root.length);
    if(actual.startsWith(root)&&root.length&&actual.length>root.length) {
      const written=actual.slice(root.length,root.length+1);
      if(written!==expected&&/^[ぁ-ゖ]$/u.test(written))observations.push({kind:'stem',text:`词干位置写成了「${written}」，这里需要${n.label}。`});
    }
  }
  if((plan?.nodes??[]).some(n=>n.ruleKcIds.includes('adj.suffix.i-past'))&&actual.endsWith('ない')) {
    observations.push({kind:'ending',text:'末尾仍是「ない」，尚未完成过去变化。'});
  }
  if(!observations.length) {
    const source=step?.surface??item.surface,reading=step?.reading??item.reading??source;
    const cut=item.domain==='adjective'&&item.class==='na'?0:item.class==='irregular'?2:1;
    const roots=[source,reading].map(word=>cut?word.slice(0,-cut):word).filter(Boolean);
    const intact=roots.some(root=>actual.startsWith(normalize(root)));
    observations.push(intact
      ? {kind:'ending',text:'给定的前部仍可辨认，但后面的变化不能唯一对应某条规则。'}
      : {kind:'unresolved',text:'输入与给定形式的前部或接续有差异，缺少足够完整的片段来判断具体错因。'});
  }
  const message=observations.map(o=>o.text).join('')+(steps.length
    ? '本次不更新未确认的知识点；下面只检查尚未确认的变化。'
    : step ? '本步不更新掌握度，可对照本步正确形式查看差异，然后继续。'
      : '本题已记错，知识点不扣分；请对照变化解析核对输入。');
  return {resolution:observations.length>1?'mixed':'unresolved',observations,message,terminal:steps.length===0};
}
