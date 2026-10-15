/** Keep the browser lookup separate from complete font-build provenance. */
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

export function createFurifontRuntimeManifest(manifest) {
  return {
    version:manifest.version,
    families:Object.fromEntries(Object.entries(manifest.families).map(([name,font])=>[name,{
      family:font.family,fontUrl:font.fontUrl,sha256:font.sha256,weights:font.weights,
    }])),
    entries:manifest.entries.map(({text,reading,families})=>({
      text,reading,
      families:Object.fromEntries(Object.entries(families).map(([name,entry])=>{
        const inkOverhangEm=Object.fromEntries(Object.entries(entry.inkOverhangEm??{}).filter(([,value])=>value>0));
        return [name,{salt:entry.salt,...(Object.keys(inkOverhangEm).length?{inkOverhangEm}:{})}];
      })),
    })),
  };
}

export async function writeFurifontRuntimeManifest({root=fileURLToPath(new URL('../',import.meta.url))}={}) {
  const manifest=JSON.parse(await readFile(join(root,'app/data/furifont-manifest.json')));
  const runtime=createFurifontRuntimeManifest(manifest);
  await writeFile(join(root,'app/data/furifont-runtime.json'),`${JSON.stringify(runtime,null,2)}\n`);
  return runtime;
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const runtime=await writeFurifontRuntimeManifest();
  console.log(`Wrote compact Furifont runtime manifest: ${runtime.entries.length} pairs.`);
}
