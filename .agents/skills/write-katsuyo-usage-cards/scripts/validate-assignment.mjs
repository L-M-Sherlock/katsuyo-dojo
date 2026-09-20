#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {sha, validateAssignment} from './staged-quality.mjs';
try {
  const args = process.argv.slice(2), opts = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--project', '--assignment', '--output'].includes(args[i]) || !args[i + 1]) throw new Error('Use --project --assignment [--output], with absolute paths');
    opts[args[i].slice(2)] = args[i + 1];
  }
  for (const key of ['project', 'assignment']) if (!path.isAbsolute(opts[key] ?? '')) throw new Error('Use absolute --' + key);
  const project = await import(pathToFileURL(path.join(opts.project, 'app/lib/usage-cards.mjs')).href);
  const bytes = fs.readFileSync(opts.assignment), rows = validateAssignment(JSON.parse(bytes), project);
  const pending = rows.filter(row => row.status !== 'valid');
  const report = {assignment: opts.assignment, hash: sha(bytes), total: rows.length, valid: rows.length - pending.length, pending, rows};
  if (opts.output) {
    if (!path.isAbsolute(opts.output) || path.resolve(opts.output) === path.resolve(opts.assignment)) throw new Error('Output must be a separate absolute report path');
    fs.writeFileSync(opts.output, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify({total: report.total, valid: report.valid, pending, output: opts.output ?? null}, null, 2));
  if (pending.length) process.exitCode = 2;
} catch (error) { console.error(error.message); process.exitCode = 1; }
