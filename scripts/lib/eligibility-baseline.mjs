import { readFileSync } from 'node:fs';

// Keep the pre-eligibility snapshot immutable. Deliberate curriculum additions
// have a separate, reviewable fixture; every old form and rule path stays checked.
export function currentEligibilityBaseline() {
  const baseline=JSON.parse(readFileSync(new URL('../../tests/fixtures/eligibility-baseline.json',import.meta.url),'utf8'));
  const expansion=JSON.parse(readFileSync(new URL('../../tests/fixtures/chain-expansion-requirements.json',import.meta.url),'utf8'));
  const originals=new Map(baseline.components.map(k=>[k.id,k]));
  const allowedExtensions=new Set(['compound.chain.temiru-desire-past','compound.chain.passive-progressive-past','compound.chain.causative-receive-past']);
  const overrides=new Map();
  for(const component of expansion.components){
    if(overrides.has(component.id))throw new Error(`Duplicate curriculum extension: ${component.id}`);
    const original=originals.get(component.id);
    if(original&&(!allowedExtensions.has(component.id)||original.gating!==component.gating||original.firstCourseId!==component.firstCourseId
      ||original.prerequisites.some(id=>!component.prerequisites.includes(id))||original.coverageKcIds.some(id=>!component.coverageKcIds.includes(id)))){
      throw new Error(`Curriculum extension weakens an existing requirement: ${component.id}`);
    }
    overrides.set(component.id,component);
  }
  return {...baseline,summary:{...baseline.summary,...expansion.summary},components:[
    ...baseline.components.map(k=>overrides.get(k.id)??k),...expansion.components.filter(k=>!originals.has(k.id)),
  ]};
}
