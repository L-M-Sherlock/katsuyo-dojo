#!/usr/bin/env node
// Validate a scope selected before authoring against the immutable original assignment.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {pair, validateAssignment, screenCards} from './staged-quality.mjs';
try {
  const opts = {}, args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    if (!['--project', '--assignment', '--scope', '--input', '--output'].includes(args[i]) || !args[i + 1]) throw new Error('Use --project --assignment --scope --input --output');
    opts[args[i].slice(2)] = args[i + 1];
  }
  for (const key of ['project', 'assignment', 'scope', 'input', 'output']) if (!path.isAbsolute(opts[key] ?? '')) throw new Error('Use absolute --' + key);
  if (['assignment', 'scope', 'input'].some(key => path.resolve(opts[key]) === path.resolve(opts.output))) throw new Error('Output must not overwrite an input');
  const read = file => JSON.parse(fs.readFileSync(file));
  const project = await import(pathToFileURL(path.join(opts.project, 'app/lib/usage-cards.mjs')).href);
  const assignment = read(opts.assignment), scope = read(opts.scope), cards = read(opts.input);
  const pending = validateAssignment(assignment, project).filter(r => r.status !== 'valid');
  const expected = new Map(assignment.map(row => [pair(row), row]));
  if (!Array.isArray(scope) || !scope.length || new Set(scope.map(pair)).size !== scope.length) throw new Error('Scope must be a unique pair list chosen before authoring');
  for (const row of scope) {
    const original = expected.get(pair(row));
    if (!original || ['meaning', 'class', 'answer', 'answerReading'].some(key => original[key] !== row[key])) throw new Error('Scope does not match original assignment: ' + pair(row));
  }
  const result = screenCards(cards, scope, project);
  const report = {totalPairs: assignment.length, scopePairs: scope.length, cards: cards.length, pending, ...result};
  fs.writeFileSync(opts.output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({cards: cards.length, scopePairs: scope.length, issues: result.issues, pending, output: opts.output}, null, 2));
  if (pending.length || result.issues.length) process.exitCode = 2;
} catch (error) { console.error(error.message); process.exitCode = 1; }
