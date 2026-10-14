import { diagnosticComposite, diagnosticMessage, legacyDiagnosticMessage } from './i18n/diagnostics.mjs';

// Observations describe the submitted text. They never supply scoring evidence.
// Correct outputs remain hidden until the corresponding probe is answered.
export function diagnosticFeedback({item,answer,diagnosis,steps,plan,step,normalize=value=>value}) {
  const actual=normalize(answer),observations=[];
  if(diagnosis?.message) {
    const resolution=diagnosis.targetMismatch?'target-form':diagnosis.kcId?'rule':diagnosis.stage?'stage':diagnosis.review?'mixed':'partial';
    const descriptor=diagnosis.messageKey
      ? {message:diagnosis.message,messageKey:diagnosis.messageKey,params:diagnosis.params??{}}
      : legacyDiagnosticMessage(resolution==='target-form'?'targetForm':resolution,diagnosis.message);
    return {resolution,...descriptor,observations,terminal:steps.length===0};
  }
  const selection = steps[0]?.probeSelection;
  if (selection) {
    const descriptor=selection.messageKey
      ? {message:selection.message,messageKey:selection.messageKey,params:selection.params??{}}
      : legacyDiagnosticMessage('stagePriority',selection.message);
    return { resolution: 'stage-priority',...descriptor,
      observations: [{ kind: 'candidate-stage', text: selection.label }], terminal: false };
  }
  for(const n of plan?.nodes??[]) {
    if(n.operation!=='row')continue;
    const root=normalize(n.fixed.reading),expected=normalize(n.output.reading).slice(root.length);
    if(actual.startsWith(root)&&root.length&&actual.length>root.length) {
      const written=actual.slice(root.length,root.length+1);
      if(written!==expected&&/^[ぁ-ゖ]$/u.test(written)) {
        const descriptor=steps.some(step=>step.fallbackStage)
          ? diagnosticMessage('diagnostics.feedback.observation.stemFallback',{written})
          : diagnosticMessage('diagnostics.feedback.observation.stemRule',{written,ruleLabel:n.label});
        observations.push({kind:'stem',text:descriptor.message,messageKey:descriptor.messageKey,params:descriptor.params});
      }
    }
  }
  if((plan?.nodes??[]).some(n=>n.ruleKcIds.includes('adj.suffix.i-past'))&&actual.endsWith('ない')) {
    const descriptor=diagnosticMessage('diagnostics.feedback.observation.negativePastIncomplete');
    observations.push({kind:'ending',text:descriptor.message,messageKey:descriptor.messageKey,params:descriptor.params});
  }
  if(!observations.length) {
    const source=step?.surface??item.surface,reading=step?.reading??item.reading??source;
    const cut=item.domain==='adjective'&&item.class==='na'?0:item.class==='irregular'?2:1;
    const roots=[source,reading].map(word=>cut?word.slice(0,-cut):word).filter(Boolean);
    const intact=roots.some(root=>actual.startsWith(normalize(root)));
    const descriptor=diagnosticMessage(intact
      ? 'diagnostics.feedback.observation.ambiguousEnding'
      : 'diagnostics.feedback.observation.unresolved');
    observations.push({kind:intact?'ending':'unresolved',text:descriptor.message,messageKey:descriptor.messageKey,params:descriptor.params});
  }
  const tail=diagnosticMessage(steps.length
    ? 'diagnostics.feedback.tail.withSteps'
    : step ? 'diagnostics.feedback.tail.step'
      : 'diagnostics.feedback.tail.question');
  const summary=diagnosticComposite([...observations,tail]);
  return {resolution:observations.length>1?'mixed':'unresolved',observations,...summary,terminal:steps.length===0};
}
