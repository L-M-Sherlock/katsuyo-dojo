#!/usr/bin/env node

// Create a new immutable integration requirement snapshot.  Existing output
// is never overwritten: a changed curriculum must be frozen to a new path so
// old manifests remain auditable evidence.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const fail = message => { throw new Error(message); };
const root = path.resolve(process.cwd());
const outputIndex = process.argv.indexOf('--output');
const output = path.resolve(root, outputIndex >= 0 ? process.argv[outputIndex + 1] : 'docs/integration-stage-requirements.v1.json');
if (fs.existsSync(output)) fail(`Refusing to overwrite frozen snapshot: ${output}`);
const runtime = await import(pathToFileURL(path.join(root, 'app/lib/usage-cards.mjs')).href);
const required = [...runtime.usageCardStageRequirements('integration')];
const key = value => typeof value === 'string' ? value : `${value.senseId}/${value.form}`;
const requiredSet = new Set(required);
const approved = [...new Set(runtime.USAGE_CARDS.filter(card => card?.review === 'approved').map(key)
  .filter(pair => requiredSet.has(pair)))].sort((a, b) => a.localeCompare(b));
const deferred = [];
const deferredSet = new Set(deferred);
const open = required.filter(pair => !approved.includes(pair) && !deferredSet.has(pair));
const snapshot = {
  schemaVersion: 1,
  stage: 'integration',
  generatedFrom: 'app/lib/usage-cards.mjs:usageCardStageRequirements',
  required,
  approved,
  deferred,
  open,
  counts: {required: required.length, approved: approved.length, deferred: deferred.length, open: open.length},
};
if (new Set(required).size !== required.length) fail('Current requirements contain duplicate pairs');
if (approved.length + deferred.length + open.length !== required.length) fail('Requirement partition is incomplete');
const bytes = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`);
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, bytes, {flag: 'wx'});
const hash = crypto.createHash('sha256').update(bytes).digest('hex');
process.stdout.write(`${JSON.stringify({output, hash, ...snapshot.counts})}\n`);
