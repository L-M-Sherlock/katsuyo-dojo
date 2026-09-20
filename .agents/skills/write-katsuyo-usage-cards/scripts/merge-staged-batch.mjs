#!/usr/bin/env node
// One merge gate: protocol 3 main-only merge of verified review snapshots.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const result = spawnSync(process.execPath, [fileURLToPath(new URL('./staged-workflow.mjs', import.meta.url)), 'merge', ...process.argv.slice(2)], {stdio: 'inherit', windowsHide: true});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
