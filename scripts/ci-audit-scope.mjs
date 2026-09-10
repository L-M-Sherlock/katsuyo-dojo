import { readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const planningOnly = new Set(['practice-session.mjs','practice-planning.mjs','exercise-selection.mjs','retest-planning.mjs','unified-progress.mjs','course-progress.mjs','form-semantics.mjs','furigana.mjs']);
export function needsDiagnosisAudit(files) {
  return files.some(file => file === 'app/page.tsx' || file === 'package.json' || file === 'package-lock.json'
    || (file.startsWith('app/lib/') && !planningOnly.has(file.slice('app/lib/'.length)))
    || /^scripts\/(lib\/|audit-diagnosis|audit-diagnostic-paths)/.test(file)
    || /^tests\/.*(diagnos|error|probe|conjugation|evidence|assessment)/.test(file));
}
export function changedFiles(event, run = execFileSync) {
  const base = event.pull_request?.base.sha ?? event.before;
  const head = event.pull_request?.head.sha ?? event.after;
  if (!base || /^0+$/.test(base) || !head) return null;
  if (![base, head].every(sha => /^[a-f0-9]{40}$/i.test(sha))) throw new Error('Invalid diff commit');
  // Includes removed paths: deleting a rule must not accidentally skip auditing.
  return run('git', ['diff','--name-only','-z',base,head], {encoding:'utf8'}).split('\0').filter(Boolean);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  let files;
  try { files = changedFiles(event); } catch { files = null; }
  const diagnosis = files === null || needsDiagnosisAudit(files);
  appendFileSync(process.env.GITHUB_OUTPUT,`diagnosis=${diagnosis}\n`);
  console.log(diagnosis ? 'Run representative diagnosis/path audits (full audit remains manual).' : 'Planning/UI copy/docs change: standard verification only.');
}
