// Pure queue transition shared by the page and the generated flow audit.
// Callers commit this transition only after progress has been saved.
export function planDiagnosticTransition(steps, index, analysis, evaluated = [], examined = []) {
  const known = new Set(evaluated), visited = new Set(examined), current = steps[index];
  const scope = current.kcIds.filter(id => !known.has(id));
  const assessed = {...current, kcIds: scope, focusId: scope.includes(current.focusId) ? current.focusId : scope[0] ?? null};
  const writes = current.diagnosticOnly ? [] : analysis.kind === 'correct' ? scope
    : [...new Set([analysis.diagnosis?.kcId, ...(analysis.diagnosis?.confirmedKcIds ?? [])])].filter(id => scope.includes(id));
  writes.forEach(id => known.add(id));
  if(current.nodeId)visited.add(current.nodeId);
  const scheduled = new Set(visited);
  function remaining(probes) {
    return probes.flatMap(probe => {
      if(probe.nodeId && scheduled.has(probe.nodeId))return [];
      const kcIds = probe.kcIds.filter(id => !known.has(id));
      if(!probe.diagnosticOnly && !kcIds.length)return [];
      if(probe.nodeId)scheduled.add(probe.nodeId);
      return [{...probe, kcIds, focusId: kcIds.includes(probe.focusId) ? probe.focusId : kcIds[0] ?? null}];
    });
  }
  const followups = remaining(analysis.steps), pending = remaining(steps.slice(index + 1));
  const nextSteps = [...steps.slice(0,index + 1), ...followups, ...pending];
  return {assessed, writes, followups, nextSteps, totalChange: nextSteps.length - steps.length,
    evaluated: [...known], examined: [...visited]};
}
