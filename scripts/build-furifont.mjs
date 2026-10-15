/** Deterministic local Furifont subsets. No dictionary or automatic reading inference. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileFont,toWoff2} from '@furifont/compiler';
import {brotli,subsetWasm} from '@furifont/compiler/node';
import * as hb from 'harfbuzzjs';
import {getFuriganaCorpus} from './furigana-corpus.mjs';
import {writeFurifontRuntimeManifest} from './furifont-runtime-manifest.mjs';
import {auditFurifont,decodeFurifontWoff2,furifontAuditWeights,furifontInkOverhang,hashFurifont} from './audit-furifont.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const assetDir=join(root,'public/fonts/furifont');
const buildDate='2026-10-15T00:00:00.000Z';
const compiler={package:'@furifont/compiler',version:'0.1.2',commit:'e971bb5f0f371355ed3ea0dffcd5df6cf823c2af'};
export const furifontBases={
  sans:{family:'Source Han Sans JP VF',commit:'a4f7cf94edfb9d7ffbdfc4841de276358bd7e0f2',
    url:'https://raw.githubusercontent.com/adobe-fonts/source-han-sans/a4f7cf94edfb9d7ffbdfc4841de276358bd7e0f2/Variable/TTF/Subset/SourceHanSansJP-VF.ttf',
    sha256:'4acc34926098472741bbb7be5949b80afa7fc08f41ea3cd80dc34f12f7d55bbc',
    cache:'SourceHanSansJP-VF-a4f7cf94edfb9d7ffbdfc4841de276358bd7e0f2.ttf',license:'OFL-Sans.txt'},
  serif:{family:'Noto Serif JP VF',commit:'8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5',
    url:'https://raw.githubusercontent.com/google/fonts/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/notoserifjp/NotoSerifJP%5Bwght%5D.ttf',
    sha256:'2fd527ba12b6a44ec30d796d633360da0aeba6c5d4af1304ce12bb4dc15a7dfc',
    cache:'NotoSerifJP-VF-8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5.ttf',license:'OFL-Serif.txt'},
};
const families={
  sans:{family:'Katsuyo Furifont Sans',source:'sans',rubyScale:0.5},
  serif:{family:'Katsuyo Furifont Serif',source:'serif',rubyScale:0.4},
  display:{family:'Katsuyo Furifont Display',source:'serif',rubyScale:0.18},
};
const logical=cp=>cp>0xFFFF?`u${cp.toString(16).toUpperCase()}`:`uni${cp.toString(16).toUpperCase().padStart(4,'0')}`;
const cps=text=>[...text].map(char=>char.codePointAt(0));
const block=(kind,name,rows)=>`${kind} ${name}${kind==='lookup'?' useExtension':''} {\n${rows.map(row=>`  ${row}`).join('\n')}\n} ${name};\n`;
const pairKey=pair=>`${pair.text}\0${pair.reading}`;

async function baseFont(name) {
  const source=furifontBases[name],override=process.argv.find(arg=>arg.startsWith(`--base-${name}=`))?.split('=').slice(1).join('=');
  const cache=join(tmpdir(),'katsuyo-furifont-cache');await mkdir(cache,{recursive:true});
  const path=override??join(cache,source.cache);
  let bytes;
  try{bytes=await readFile(path);}catch(error) {
    if(override||error.code!=='ENOENT')throw error;
    console.log(`Downloading pinned ${source.family}…`);
    const response=await fetch(source.url,{signal:AbortSignal.timeout(600000)});
    if(!response.ok)throw new Error(`Base font download failed: ${response.status}`);
    bytes=Buffer.from(await response.arrayBuffer());
    if(hashFurifont(bytes)!==source.sha256)throw new Error(`Downloaded ${name} SHA-256 mismatch`);
    await writeFile(path,bytes);
  }
  if(hashFurifont(bytes)!==source.sha256)throw new Error(`Pinned ${name} base font SHA-256 mismatch`);
  return bytes;
}

/** An exact pair owns its own selector. salt positions have no arbitrary cap. */
export function createFurifontPlan(sourcePairs,{family,rubyScale}) {
  const pairs=sourcePairs.map(pair=>({...pair}));
  const glyphs=[],single=[],ligatures=[],alternates=[],revert=[],selectors=[];
  const firstGroups=Map.groupBy(pairs,pair=>[...pair.text][0]);
  for(const [first,group]of firstGroups) {
    const outputs=[];
    for(const pair of group) {
      pair.salt=outputs.length+1;pair.glyph=`katsuyo.ruby.${pairs.indexOf(pair).toString().padStart(5,'0')}`;
      const selector=`katsuyo.select.${first.codePointAt(0).toString(16)}.${pair.salt}`,bases=cps(pair.text);
      glyphs.push({name:pair.glyph,bases,ruby:[{start:0,end:bases.length,text:pair.reading}]});
      glyphs.push({name:selector,bases:[bases[0]],ruby:[]});outputs.push(selector);selectors.push(selector);
      revert.push(`sub ${selector} by ${logical(bases[0])};`);
      if(bases.length===1)single.push(`sub ${selector} by ${pair.glyph};`);
      else ligatures.push(`sub ${selector} ${bases.slice(1).map(logical).join(' ')} by ${pair.glyph};`);
    }
    alternates.push(`sub ${logical(first.codePointAt(0))} from [${outputs.join(' ')}];`);
  }
  const baseCodepoints=[...new Set(pairs.flatMap(pair=>cps(pair.text)))].sort((a,b)=>a-b);
  const allCodepoints=[...new Set(pairs.flatMap(pair=>cps(pair.text+pair.reading)))].sort((a,b)=>a-b);
  const fea=['languagesystem DFLT dflt;\n',`@han = [${[...baseCodepoints.map(logical),...selectors].join(' ')}];\n`,
    block('lookup','katsuyo_alternates',alternates),block('lookup','katsuyo_revert',revert),
    block('lookup','katsuyo_first',[`sub @han [${selectors.join(' ')}]' lookup katsuyo_revert;`]),
    block('lookup','katsuyo_single',single),block('lookup','katsuyo_group',ligatures),
    block('feature','salt',['lookup katsuyo_alternates;','lookup katsuyo_first;']),
    block('feature','rclt',['lookup katsuyo_single;','lookup katsuyo_group;'])].join('\n');
  const plan={version:1,names:{family,description:'Reviewed Japanese reading pairs for Katsuyo Dojo; compiled by Furifont 0.1.2.'},
    metrics:{rubyScale,rubyGap:0.05,compressionFloor:0.8,maxRubyWidth:Math.max(...pairs.map(pair=>[...pair.text].length*1.6))},
    codepoints:allCodepoints,variants:[],glyphs,fea,subset:allCodepoints,smoke:[]};
  return {plan,pairs};
}

export async function buildFurifont() {
  for(const [name,version]of [['@furifont/compiler','0.1.2'],['@furifont/core','0.1.2'],['harfbuzzjs','1.6.3']]) {
    const path=name==='harfbuzzjs'?new URL('../node_modules/harfbuzzjs/package.json',import.meta.url):new URL(import.meta.resolve(`${name}/package.json`));
    const actual=JSON.parse(await readFile(path)).version;if(actual!==version)throw new Error(`${name} must be pinned to ${version}; found ${actual}`);
  }
  const corpus=getFuriganaCorpus(),manifestFamilies={},entryMap=new Map(corpus.pairs.map(pair=>[pairKey(pair),{...pair,families:{}}]));
  const bases={};for(const source of Object.keys(furifontBases))bases[source]=await baseFont(source);
  await mkdir(assetDir,{recursive:true});
  for(const [name,definition]of Object.entries(families)) {
    const {plan,pairs}=createFurifontPlan(name==='display'?corpus.lexicalPairs:corpus.pairs,definition);
    let lastStep;
    const built=await compileFont({plan,base:bases[definition.source],version:'0.1.2',date:new Date(buildDate),subsetWasm,
      onProgress:({step})=>{if(step!==lastStep){console.log(`Furifont ${name}: ${step}`);lastStep=step;}}});
    if(!built.variable)throw new Error(`${name}: variable weights lost`);
    const woff2=await toWoff2(built.font,brotli),nameToId=new Map(built.glyphNames.map((value,index)=>[value,index]));
    const delivered=decodeFurifontWoff2(woff2),face=new hb.Face(new hb.Blob(delivered.sfnt)),font=new hb.Font(face);
    const axis=Object.values(face.getAxisInfos()).find(value=>value.tag==='wght'),inkAuditWeights=furifontAuditWeights(delivered.tables,font);
    for(const pair of pairs) {
      const row=entryMap.get(pairKey(pair)),data={salt:pair.salt,glyph:pair.glyph,glyphId:nameToId.get(pair.glyph)};
      data.inkOverhangEm=furifontInkOverhang(delivered.tables,font,data,inkAuditWeights);row.families[name]=data;
      if(name==='sans')Object.assign(row,data);
    }
    const fontUrl=`fonts/furifont/katsuyo-furifont-${name}.woff2`;
    manifestFamilies[name]={family:definition.family,fontUrl,sha256:hashFurifont(woff2),bytes:woff2.length,weights:[axis.min,axis.max],
      source:definition.source,pairs:pairs.length,glyphs:built.glyphNames.length,codepoints:plan.codepoints.length,metrics:plan.metrics,inkAuditWeights};
    await writeFile(join(root,'public',fontUrl),woff2);
  }
  const manifest={version:1,families:manifestFamilies,entries:[...entryMap.values()],metadata:{compiler,bases:furifontBases,
    source:{path:'scripts/furigana-corpus.mjs',sha256:hashFurifont(JSON.stringify(corpus.pairs)),lexicalSha256:hashFurifont(JSON.stringify(corpus.lexicalPairs)),pairs:corpus.pairs.length,lexicalPairs:corpus.lexicalPairs.length,coverage:corpus.coverage},
    buildDate,readingSource:'reviewed-local-pairs-only',dictionaryUsed:false,
    selector:'1-based family salt alternate on the first Han; one isolated shaping span per exact reviewed pair'}};
  await writeFile(join(root,'app/data/furifont-manifest.json'),`${JSON.stringify(manifest,null,2)}\n`);
  await writeFurifontRuntimeManifest({root});
  const report=await auditFurifont({root});await writeFile(join(assetDir,'audit.json'),`${JSON.stringify(report,null,2)}\n`);
  console.log(JSON.stringify(report,null,2));
}

if(process.argv[1]===fileURLToPath(import.meta.url))await buildFurifont();
