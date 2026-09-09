import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnswerAnalyzer } from '../app/lib/answer-analysis.mjs';
import { atomicSteps, buildDiagnosticPlan } from '../app/lib/diagnostic-plan.mjs';
import { deriveUnified } from '../app/lib/unified-knowledge.mjs';
import { planDiagnosticTransition } from '../app/lib/diagnostic-session.mjs';

const item = {domain:'verb',class:'godan',surface:'渡る',reading:'わたる'};
test('渡る nakute checks complete negative and ending before primitive leaves', () => {
  const result = createAnswerAnalyzer(item,'nakute')('わたりなくて');
  assert.equal(result.diagnosis, null);
  assert.deepEqual(result.steps.map(s=>s.form), ['negative','adjectiveTe']);
  assert.doesNotMatch(result.feedback.message,/ア段|渡ら|わたら/);
  const first = createAnswerAnalyzer(item,'nakute',{step:result.steps[0]})('わたらない');
  assert.equal(first.kind,'correct');
  const transition = planDiagnosticTransition(result.steps,0,first);
  const next = transition.nextSteps[1];
  assert.equal(createAnswerAnalyzer(item,next.form,{step:next})('わたらなくて').kind,'correct');
  assert.ok(next.kcIds.every(id=>!id.startsWith('class.') && !id.startsWith('adj.class.')));
  const unknown = createAnswerAnalyzer(item,next.form,{step:next})('xyz');
  assert.deepEqual(unknown.steps.map(s=>s.kcIds),[['adj.stem.i-ku'],['adj.suffix.i-te']]);
});
test('exact later outputs request unscored retry instead of blaming the current rule', () => {
  const plan = buildDiagnosticPlan(item,'nakute');
  const steps = atomicSteps(plan,'nakute',deriveUnified(item,'nakute').requiredKcIds);
  const step = steps.find(s=>s.kcIds.includes('adj.stem.i-ku'));
  const analyze = createAnswerAnalyzer(item,'nakute',{step});
  for (const answer of ['わたらなくて','渡らなくて','ワタラナクテ']) {
    const result = analyze(answer);
    assert.equal(result.kind,'invalid');
    assert.equal(result.feedback.resolution,'step-ahead');
    assert.equal(result.diagnosis,null);
    assert.deepEqual(planDiagnosticTransition(steps,2,result).writes,[]);
  }
  assert.equal(analyze('わたらなく').kind,'correct');
  assert.equal(analyze('わたらなき').diagnosis.kcId,'adj.stem.i-ku');
  assert.notEqual(analyze('わたりなくて').feedback?.resolution,'step-ahead');
});

test('later-output retry generalizes across declared recipes without accepting arbitrary extra tails', async () => {
  const { DIAGNOSTIC_FORMS } = await import('../app/lib/diagnostic-plan.mjs');
  let checked = 0;
  for (const form of DIAGNOSTIC_FORMS.filter(form=>!form.startsWith('adjective'))) {
    let plan, scope;
    try { plan = buildDiagnosticPlan(item,form); scope = deriveUnified(item,form).requiredKcIds; } catch { continue; }
    const probes = atomicSteps(plan,form,scope);
    for (const path of plan.paths) for (const [index,node] of path.nodes.entries()) {
      const probe = probes.find(step=>step.nodeId===node.id && step.reading===node.input.reading);
      if (!probe) continue;
      for (const later of path.nodes.slice(index+1)) {
        const answer = later.output.reading;
        if (answer.length<=node.output.reading.length || !answer.startsWith(node.output.reading) || probe.readings.includes(answer)) continue;
        const result = createAnswerAnalyzer(item,form,{step:probe})(answer);
        assert.equal(result.feedback?.resolution,'step-ahead',`${form}: ${node.output.reading} -> ${answer}`);
        assert.equal(result.diagnosis,null);
        checked++;
      }
    }
  }
  assert.ok(checked>20);
});
