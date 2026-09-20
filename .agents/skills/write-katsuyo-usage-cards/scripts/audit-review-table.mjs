#!/usr/bin/env node
// Prepare a review table; never manufacture approval or infer roles from a regex.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeReviewTable} from './staged-quality.mjs';
try {
  const args = process.argv.slice(2), opts = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--project', '--cards', '--notes', '--readings', '--output'].includes(args[i]) || !args[i + 1]) throw new Error('Use --project --cards --notes --readings --output');
    opts[args[i].slice(2)] = args[i + 1];
  }
  for (const key of ['project', 'cards', 'output']) if (!path.isAbsolute(opts[key] ?? '')) throw new Error('Use absolute --' + key);
  if (['cards', 'notes', 'readings'].some(key => opts[key] && path.resolve(opts[key]) === path.resolve(opts.output))) throw new Error('Table cannot overwrite an input');
  const project = await import(pathToFileURL(path.join(opts.project, 'app/lib/usage-cards.mjs')).href);
  const cards = JSON.parse(fs.readFileSync(opts.cards));
  const notes = opts.notes ? JSON.parse(fs.readFileSync(opts.notes)) : [];
  const readings = opts.readings ? JSON.parse(fs.readFileSync(opts.readings)) : {candidates: []};
  fs.writeFileSync(opts.output, makeReviewTable(cards, notes, project, readings));
  console.log(JSON.stringify({cards: cards.length, output: opts.output}));
} catch (error) { console.error(error.message); process.exitCode = 1; }
