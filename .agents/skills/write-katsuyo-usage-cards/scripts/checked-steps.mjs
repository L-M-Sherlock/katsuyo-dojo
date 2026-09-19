import {spawn} from 'node:child_process';

/** Execute explicit argv sequentially, never a shell string. Failure prevents every later step. */
export async function runCheckedSteps(plan, {cwd}) {
  if (!Array.isArray(plan?.steps) || !plan.steps.length || plan.steps.length > 20) throw new Error('A nonempty steps plan is required');
  for (const step of plan.steps) {
    if (typeof step?.executable !== 'string' || !step.executable || !Array.isArray(step.args)
      || step.args.some(arg => typeof arg !== 'string')) throw new Error('Each step needs executable and string args');
  }
  const results = [];
  for (const step of plan.steps) {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(step.executable, step.args, {cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
      let stdout = '', stderr = '';
      child.stdout.on('data', data => { stdout = (stdout + data).slice(-16000); });
      child.stderr.on('data', data => { stderr = (stderr + data).slice(-16000); });
      child.on('error', reject);
      child.on('close', (code, signal) => resolve({executable: step.executable, args: step.args, code, signal, stdout, stderr}));
    });
    if (result.code !== 0 || result.signal) throw new Error(`Delivery step failed: ${step.executable} (exit=${result.code}, signal=${result.signal})\n${result.stderr || result.stdout}`);
    results.push(result);
  }
  return results;
}
