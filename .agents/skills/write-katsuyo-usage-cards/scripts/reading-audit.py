#!/usr/bin/env python3
"""Read-only dictionary comparison. Differences require contextual review."""
import argparse
import difflib
import importlib.metadata
import json
from pathlib import Path
import re
import subprocess
import sys
import unicodedata

NODE_EXPORT = r"""
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[1]);
const lib=await import(pathToFileURL(path.join(root,'app/lib/usage-cards.mjs')));
const file=process.argv[2];
const cards=!file ? lib.USAGE_CARDS : file.endsWith('.json')
  ? JSON.parse(fs.readFileSync(path.resolve(file),'utf8'))
  : (await import(pathToFileURL(path.resolve(file)))).default;
if(!Array.isArray(cards))throw new Error('Input must be a card array');
const rows=cards.map(card=>{
  const resolved=lib.resolveUsageCard(card);
  if(!resolved)throw new Error(`Cannot resolve ${card.id}`);
  const parts=[...card.before.map(p=>({...p,role:'before'})),
    {...resolved.target,role:'target'},...card.after.map(p=>({...p,role:'after'}))];
  return {id:card.id,senseId:card.senseId,form:card.form,scene:card.scene,translation:card.translation,
    sentence:parts.map(p=>p.text).join(''),reading:parts.map(p=>p.reading??p.text).join(''),parts};
});
console.log(JSON.stringify({rows,structuralIssues:lib.usageCardIssues(cards)}));
"""


def normalize(text):
    text = unicodedata.normalize('NFKC', text)
    text = ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in text)
    return re.sub(r'[\s、。，,.!?「」『』():；;]', '', text)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, default=Path.cwd())
    parser.add_argument('--input', type=Path, help='Optional .mjs default export or JSON card array; defaults to the full catalog')
    parser.add_argument('--output', type=Path, help='Write a JSON review report; never edits cards')
    args = parser.parse_args()
    try:
        import fugashi
    except ImportError:
        parser.error("Use uv run --no-project --with 'fugashi[unidic-lite]' python reading-audit.py ...")

    command = ['node', '--input-type=module', '-e', NODE_EXPORT, str(args.project.resolve())]
    if args.input:
        command.append(str(args.input.resolve()))
    exported = subprocess.run(command, check=True, capture_output=True, text=True)
    payload = json.loads(exported.stdout)
    tagger = fugashi.Tagger()
    candidates = []
    for row in payload['rows']:
        tokens = []
        for word in tagger(row['sentence']):
            contains_kanji = bool(re.search(r'[\u3400-\u9fff々〇]', word.surface))
            kana = word.feature.kana if contains_kanji else word.surface
            tokens.append({'text': word.surface, 'reading': kana or word.surface,
                           'unknown': contains_kanji and (not kana or kana == '*')})
        expected = ''.join(t['reading'] for t in tokens)
        authored, dictionary = normalize(row['reading']), normalize(expected)
        unknown = any(t['unknown'] for t in tokens)
        if authored == dictionary and not unknown:
            continue
        differences = []
        for operation, a, b, c, d in difflib.SequenceMatcher(None, authored, dictionary, autojunk=False).get_opcodes():
            if operation != 'equal':
                differences.append({'authored': authored[max(0, a - 4):b + 4],
                                    'dictionary': dictionary[max(0, c - 4):d + 4]})
        candidates.append({**row, 'dictionaryReading': expected, 'tokens': tokens,
                           'unknownTokens': unknown, 'differences': differences})

    report = {'cardsChecked': len(payload['rows']), 'dictionary': 'unidic-lite',
              'dictionaryVersion': importlib.metadata.version('unidic-lite'),
              'fugashiVersion': importlib.metadata.version('fugashi'),
              'reviewCandidateCount': len(candidates),
              'policy': 'Candidates are not errors. Check sense, accepted readings, counters and the given target. Never auto-replace from this report.',
              'structuralIssues': payload['structuralIssues'], 'candidates': candidates}
    serialized = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.write_text(serialized, encoding='utf-8')
        print(json.dumps({key: value for key, value in report.items() if key != 'candidates'}, ensure_ascii=False))
    else:
        print(serialized, end='')
    return 1 if payload['structuralIssues'] else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f'reading-audit: {error}', file=sys.stderr)
        sys.exit(2)
