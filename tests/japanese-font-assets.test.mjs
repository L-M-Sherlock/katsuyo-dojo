import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const html=readFileSync(path.join(root,'index.html'),'utf8');

test('every self-hosted Japanese font face points to a served WOFF2 file',()=>{
  for(const [family,cssFamily] of [
    ['noto-sans-jp','Noto Sans JP Variable'],
    ['noto-serif-jp','Noto Serif JP Variable'],
  ]){
    const href=`/fonts/${family}/wght.css`;
    assert.ok(html.includes(`href="${href}"`),`${family}: stylesheet is linked`);
    const directory=path.join(root,'public','fonts',family);
    const css=readFileSync(path.join(directory,'wght.css'),'utf8');
    const files=[...css.matchAll(/url\(\.\/files\/([^)]*\.woff2)\)/g)].map(match=>match[1]);
    assert.ok(files.length>0,`${family}: font faces are declared`);
    assert.equal(new Set(files).size,files.length,`${family}: each subset is unique`);
    assert.ok(css.includes(`font-family: '${cssFamily}'`));
    assert.ok(css.includes('unicode-range:')&&css.includes('font-display: swap'));
    for(const file of files) assert.ok(existsSync(path.join(directory,'files',file)),`${family}: missing ${file}`);
    assert.match(readFileSync(path.join(directory,'LICENSE'),'utf8'),/SIL Open Font License/);
  }
});
