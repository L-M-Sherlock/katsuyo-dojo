#!/usr/bin/env node
/* Select three exact assignment rows for a method-validation pilot. */
import fs from 'node:fs';
import path from 'node:path';

const fail = message => { throw new Error(message); };
const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1] ?? fail(`Missing value for ${name}`); };
const taskRoot = path.resolve(value('--task-root') ?? fail('Use --task-root <absolute task directory>'));
const batch = value('--batch') ?? fail('Use --batch lane/NN');
if (!/^[A-Za-z0-9][A-Za-z0-9_-]*\/\d{2,}$/u.test(batch)) fail(`Unsafe batch: ${batch}`);
const output = path.resolve(value('--output') ?? path.join(taskRoot, `${batch}.pilot.assignment.json`));
const [lane] = batch.split('/');
const manifestPath = path.join(taskRoot, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : [];
const sources = [{batch, rows: JSON.parse(fs.readFileSync(path.join(taskRoot, `${batch}.assignment.json`), 'utf8'))}];
for (const row of manifest.filter(item => item.lane === lane)) {
  const sourceBatch = `${row.lane}/${String(row.batch).padStart(2, '0')}`;
  if (sourceBatch === batch) continue;
  const source = path.join(taskRoot, row.assignment);
  if (fs.existsSync(source)) sources.push({batch: sourceBatch, rows: JSON.parse(fs.readFileSync(source, 'utf8'))});
}
if (!sources[0].rows.length) fail(`Assignment needs at least one row: ${batch}`);
const selected = [];
const take = (predicate, category) => {
  for (const source of sources) {
    const row = source.rows.find(candidate => predicate(candidate) && !selected.some(item => item.senseId === candidate.senseId));
    if (row) { selected.push({...row, sourceBatch: source.batch, pilotCategory: category}); return; }
  }
  fail(`Pilot category unavailable in lane ${lane}: ${category}; choose another expression family or record the missing category explicitly.`);
};
take(row => row.class === 'godan' || row.class === 'ichidan', 'ordinary');
try { take(row => row.class === 'irregular', 'irregular'); }
catch {
  // Some expression families have no eligible irregular pairing. Preserve the
  // three-card pilot contract with the other verb class and label the fallback.
  take(row => row.class === 'ichidan' || row.class === 'godan', 'non-ordinary-fallback');
}
take(row => /Negative|Past|Tara|Ba/u.test(String(row.form)), 'negative-or-past');
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, JSON.stringify(selected, null, 2) + '\n');
console.log(JSON.stringify({batch, output, rows: selected.map(row => ({pilotCategory: row.pilotCategory, sourceBatch: row.sourceBatch, senseId: row.senseId, form: row.form, answer: row.answer}))}, null, 2));
