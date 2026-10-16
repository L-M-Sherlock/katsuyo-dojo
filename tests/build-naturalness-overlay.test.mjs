import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

for (const state of ['missing', 'stale']) {
  test(`overlay generation loads the new runtime when the previous generated file is ${state}`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'katsuyo-overlay-build-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const write = (file, value) => {
      const destination = path.join(root, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, value);
    };
    // An isolated one-card mechanical fixture exercises the real build script.
    // The verifier stub deliberately shares the runtime dependency that caused
    // the import-order failure; it performs no language approval.
    const original = { id: 'fixture:card', senseId: 'fixture:sense', form: 'fixtureForm', review: 'approved', translation: 'old fixture' };
    const draft = { ...original, review: 'draft', translation: 'new fixture' };
    const approved = { ...draft, review: 'approved' };
    const proof = { activeCount: 1, sourceCards: [original],
      statuses: [{ id: original.id, sourceHash: hash(original), status: 'approved', cardHash: hash(approved) }],
      repairs: [{ repairId: 'fixture-repair', draft: [draft], rows: [{ id: original.id, hash: hash(draft), status: 'approved' }] }], deferrals: [] };
    write('docs/usage-card-naturalness-full-progress.v1.json.gz', zlib.gzipSync(JSON.stringify(proof)));
    write('scripts/build-naturalness-overlay.mjs', fs.readFileSync(new URL('../scripts/build-naturalness-overlay.mjs', import.meta.url)));
    write('app/lib/usage-cards/user-directed-deferrals.mjs', 'export const USER_DIRECTED_USAGE_DEFERRALS = [];\n');
    write('app/lib/usage-cards/user-directed-corrections.mjs', 'export const USER_DIRECTED_USAGE_CORRECTIONS = [];\n');
    write('app/lib/compound-forms.mjs', 'export const RETIRED_TEORU_NEGATIVE_FORMS = new Set();\n');
    write('app/lib/usage-cards.mjs', "import {FULL_NATURALNESS_REPLACEMENTS} from './usage-cards/full-naturalness-overlay.mjs';\nexport const PRE_REVIEWED_USAGE_CARDS = FULL_NATURALNESS_REPLACEMENTS;\n");
    write('scripts/verify-reviewed-usage-revisions.mjs', "import {PRE_REVIEWED_USAGE_CARDS} from '../app/lib/usage-cards.mjs';\nexport function verifyCurrentReviewedUsageRevisions() {\n  if (PRE_REVIEWED_USAGE_CARDS[0]?.translation !== 'new fixture') throw Error('Verifier loaded a stale runtime');\n  return {cardCount: PRE_REVIEWED_USAGE_CARDS.length};\n}\n");
    if (state === 'stale') write('app/lib/usage-cards/full-naturalness-overlay.mjs', `export const FULL_NATURALNESS_REPLACEMENTS = ${JSON.stringify([original])};\nexport const FULL_NATURALNESS_DEFERRED_PAIRS = new Set();\n`);
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/build-naturalness-overlay.mjs')], {
      cwd: root, encoding: 'utf8', timeout: 10_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.active, 1);
    assert.equal(summary.replacements, 1);
    assert.equal(summary.subsequentReviews.cardCount, 1);
    assert.match(fs.readFileSync(path.join(root, 'app/lib/usage-cards/full-naturalness-overlay.mjs'), 'utf8'), /new fixture/);
  });
}
