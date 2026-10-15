/** Inspect each delivered WOFF2 and shape its exact reviewed reading pairs. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {brotliDecompressSync} from 'node:zlib';
import * as hb from 'harfbuzzjs';
import {getFuriganaCorpus} from './furigana-corpus.mjs';
import {createFurifontRuntimeManifest} from './furifont-runtime-manifest.mjs';

export const hashFurifont = value => createHash('sha256').update(value).digest('hex');
const knownTags='cmap,head,hhea,hmtx,maxp,name,OS/2,post,cvt ,fpgm,glyf,loca,prep,CFF ,VORG,EBDT,EBLC,gasp,hdmx,kern,LTSH,PCLT,VDMX,vhea,vmtx,BASE,GDEF,GPOS,GSUB,EBSC,JSTF,MATH,CBDT,CBLC,COLR,CPAL,SVG ,sbix,acnt,avar,bdat,bloc,bsln,cvar,fdsc,feat,fmtx,fvar,gvar,hsty,just,lcar,mort,morx,opbd,prop,trak,Zapf,Silf,Glat,Gloc,Feat,Sill'.split(',');

/** Furifont emits null WOFF2 transforms; restore the exact served SFNT tables. */
export function decodeFurifontWoff2(bytes) {
  const input=Buffer.from(bytes);
  assert.equal(input.toString('ascii',0,4),'wOF2');
  let cursor=48;
  const base128=()=>{let value=0;for(let n=0;n<5;n++){const byte=input[cursor++];value=value*128+(byte&127);if(!(byte&128))return value;}throw new Error('Invalid WOFF2 base128');};
  const records=[];
  for(let n=0;n<input.readUInt16BE(12);n++) {
    const flags=input[cursor++],index=flags&63;
    const tag=index===63?input.toString('ascii',cursor,cursor+=4):knownTags[index];
    const length=base128(),transform=flags>>>6;
    assert.equal(transform,tag==='glyf'||tag==='loca'?3:0,`Unsupported WOFF2 transform: ${tag}`);
    records.push({tag,length});
  }
  const payload=brotliDecompressSync(input.subarray(cursor,cursor+input.readUInt32BE(20)));
  const sfnt=Buffer.alloc(input.readUInt32BE(16));
  input.copy(sfnt,0,4,8);sfnt.writeUInt16BE(records.length,4);
  const power=2**Math.floor(Math.log2(records.length));
  sfnt.writeUInt16BE(power*16,6);sfnt.writeUInt16BE(Math.log2(power),8);sfnt.writeUInt16BE(records.length*16-power*16,10);
  let source=0,offset=12+records.length*16;
  const tables=new Map();
  for(const [index,record]of records.entries()) {
    const data=payload.subarray(source,source+record.length),row=12+index*16;
    sfnt.write(record.tag,row,4,'ascii');sfnt.writeUInt32BE(offset,row+8);sfnt.writeUInt32BE(record.length,row+12);
    data.copy(sfnt,offset);tables.set(record.tag,data);source+=record.length;offset+=(record.length+3)&~3;
  }
  assert.equal(source,payload.length);
  return {sfnt,tables};
}

function composite(tables,gid) {
  const longLoca=tables.get('head').readInt16BE(50)!==0,loca=tables.get('loca');
  const at=longLoca?loca.readUInt32BE(gid*4):loca.readUInt16BE(gid*2)*2,glyf=tables.get('glyf');
  assert.equal(glyf.readInt16BE(at),-1,`Glyph ${gid} must be a composite`);
  const components=[];
  let cursor=at+10,flags;
  do {
    flags=glyf.readUInt16BE(cursor);const glyph=glyf.readUInt16BE(cursor+2);cursor+=4;
    assert.ok(flags&2,'Components must use XY offsets');
    const words=flags&1,x=words?glyf.readInt16BE(cursor):glyf.readInt8(cursor);cursor+=words?2:1;
    const y=words?glyf.readInt16BE(cursor):glyf.readInt8(cursor);cursor+=words?2:1;
    let sx=1,sy=1;
    if(flags&8){sx=sy=glyf.readInt16BE(cursor)/16384;cursor+=2;}
    else if(flags&64){sx=glyf.readInt16BE(cursor)/16384;sy=glyf.readInt16BE(cursor+2)/16384;cursor+=4;}
    else assert.ok(!(flags&128),'Unexpected two-by-two component');
    components.push({glyph,x,y,sx,sy});
  }while(flags&32);
  return components;
}

/** The avar knots cover every piecewise-linear weight interpolation boundary. */
export function furifontAuditWeights(tables,font) {
  const axes=Object.values(font.face.getAxisInfos()).sort((a,b)=>a.axisIndex-b.axisIndex);
  assert.equal(axes.length,1,'The pinned source must have one weight axis');
  const axis=axes[0];assert.equal(axis.tag,'wght');
  const values=new Set([axis.min,axis.default,axis.max,400,700]),avar=tables.get('avar');
  if(avar) {
    assert.equal(avar.readUInt16BE(6),1);
    for(let index=0;index<avar.readUInt16BE(8);index++) {
      const normalized=avar.readInt16BE(10+index*4)/16384;
      values.add(axis.default+normalized*(normalized<0?axis.default-axis.min:axis.max-axis.default));
    }
  }
  return [...values].filter(value=>value>=axis.min&&value<=axis.max).sort((a,b)=>a-b);
}

/** Measure real ink beyond the glyph advance, including variable components. */
export function furifontInkOverhang(tables,font,entry,weights) {
  const components=composite(tables,entry.glyphId);
  let left=0,right=0;
  for(const weight of weights) {
    font.setVariations([new hb.Variation('wght',weight)]);
    const advance=font.glyphHAdvance(entry.glyphId),full=font.glyphExtents(entry.glyphId);
    if(full){left=Math.max(left,-full.xBearing);right=Math.max(right,full.xBearing+full.width-advance);}
    for(const component of components) {
      const extent=font.glyphExtents(component.glyph);if(!extent)continue;
      left=Math.max(left,-(component.x+extent.xBearing*component.sx));
      right=Math.max(right,component.x+(extent.xBearing+extent.width)*component.sx-advance);
    }
  }
  const ceil=value=>Math.ceil(Math.max(0,value/font.face.upem)*1e6)/1e6;
  return {left:ceil(left),right:ceil(right)};
}

const pairKey=entry=>`${entry.text}\0${entry.reading}`;

/** A changed clause can reuse the same font pairs but need a new exact layout. */
export function auditFuriganaLayouts(artifact,corpus) {
  assert.equal(artifact.version,1);
  assert.equal(artifact.method,'unique-kana-anchor-alignment-constrained-by-existing-authored-Han-pairs');
  const sources=corpus.sources.map(({text,reading})=>({text,reading}));
  assert.equal(artifact.sourceHash,hashFurifont(JSON.stringify(sources)),'Authored text/readings changed; regenerate exact layouts');
  assert.deepEqual(artifact.coverage,corpus.coverage,'Exact layout coverage is stale');
  const compare=(a,b)=>a.text<b.text?-1:a.text>b.text?1:a.reading<b.reading?-1:a.reading>b.reading?1:0;
  const expected=[...corpus.constrained,...corpus.audited].map(({text,reading,parts})=>({text,reading,parts})).sort(compare);
  assert.deepEqual(artifact.layouts,expected,'Exact layouts must match the current authored alignment');
  assert.equal(corpus.coverage.fallbacks,0,'Unresolved current readings require an exact layout');
  assert.equal(corpus.coverage.extractionErrors,0,'Current furigana extraction must have no errors');
}

export async function auditFurifont({root=fileURLToPath(new URL('../',import.meta.url))}={}) {
  const corpus=getFuriganaCorpus(),pairs=corpus.pairs,lexicalPairs=corpus.lexicalPairs;
  const layouts=JSON.parse(await readFile(join(root,'app/data/furigana-layouts.json')));
  auditFuriganaLayouts(layouts,corpus);
  const manifest=JSON.parse(await readFile(join(root,'app/data/furifont-manifest.json')));
  const runtime=JSON.parse(await readFile(join(root,'app/data/furifont-runtime.json')));
  assert.deepEqual(runtime,createFurifontRuntimeManifest(manifest),'Browser manifest must match the full font-build manifest');
  assert.equal(manifest.version,1);assert.equal(manifest.metadata.compiler.version,'0.1.2');
  assert.equal(manifest.metadata.source.sha256,hashFurifont(JSON.stringify(pairs)),'Reviewed corpus changed; rebuild the font');
  assert.equal(manifest.metadata.source.lexicalSha256,hashFurifont(JSON.stringify(lexicalPairs)));
  const supplied=new Set(manifest.entries.map(pairKey));
  assert.equal(supplied.size,manifest.entries.length,'Duplicate manifest pair');
  assert.deepEqual([...supplied].sort(),pairs.map(pairKey).sort(),'Manifest must cover exactly the reviewed Han pairs');
  const reports={};
  for(const [name,family]of Object.entries(manifest.families)) {
    const fontBytes=await readFile(join(root,'public',family.fontUrl));
    assert.equal(family.sha256,hashFurifont(fontBytes));assert.equal(family.bytes,fontBytes.length);
    const {sfnt,tables}=decodeFurifontWoff2(fontBytes),face=new hb.Face(new hb.Blob(sfnt)),font=new hb.Font(face);
    const weight=Object.values(face.getAxisInfos()).find(axis=>axis.tag==='wght');
    assert.ok(weight);assert.deepEqual([weight.min,weight.max],family.weights);
    assert.ok(tables.has('gvar'),'Variable outlines must be retained');
    const inkWeights=furifontAuditWeights(tables,font);assert.deepEqual(family.inkAuditWeights,inkWeights);
    const required=name==='display'?lexicalPairs:pairs;
    const entries=manifest.entries.filter(entry=>entry.families[name]);
    assert.deepEqual(entries.map(pairKey).sort(),required.map(pairKey).sort(),`${name}: exact family subset`);
    const shapesAt=[weight.min,400,700,weight.max],buffer=new hb.Buffer(),baseGlyphs=new Set();
    let shapes=0,componentsChecked=0;
    for(const row of entries) {
      const entry={...row,...row.families[name]},label=`${name} ${entry.text}/${entry.reading}`;
      assert.ok(Number.isInteger(entry.salt)&&entry.salt>0);
      assert.deepEqual(entry.inkOverhangEm,furifontInkOverhang(tables,font,entry,inkWeights),`${label}: stale ink reservation`);
      font.setVariations([new hb.Variation('wght',weight.min)]);
      const components=composite(tables,entry.glyphId),base=[...entry.text],reading=[...entry.reading];
      const advance=chars=>chars.reduce((total,char)=>total+font.glyphHAdvance(font.nominalGlyph(char.codePointAt(0))),0);
      const span=advance(base),natural=advance(reading)*family.metrics.rubyScale;
      const squeeze=Math.min(natural<=span?1:Math.max(span/natural,family.metrics.compressionFloor),family.metrics.maxRubyWidth*face.upem/natural);
      assert.ok(natural*squeeze+0.01>=Math.min(natural,span),`${label}: group ruby compressed below its available base span`);
      assert.equal(components.length,base.length+reading.length,`${label}: component count`);
      for(const [index,char]of [...base,...reading].entries()) {
        const expected=font.nominalGlyph(char.codePointAt(0));assert.ok(expected,`Missing source glyph ${char}`);baseGlyphs.add(expected);
        assert.equal(components[index].glyph,expected,`${label}: drawn component ${index}`);
        if(index<base.length){assert.equal(components[index].sx,1);assert.equal(components[index].sy,1);assert.equal(components[index].y,0);}
        else {assert.ok(components[index].y>0);assert.ok(Math.abs(components[index].sx-family.metrics.rubyScale*squeeze)<=1/16384);assert.ok(Math.abs(components[index].sy-family.metrics.rubyScale)<=1/16384);}
        componentsChecked++;
      }
      for(const value of shapesAt) {
        font.setVariations([new hb.Variation('wght',value)]);buffer.reset();buffer.addText(entry.text);buffer.guessSegmentProperties();
        hb.shape(font,buffer,[new hb.Feature('salt',entry.salt)]);
        assert.deepEqual(buffer.getGlyphInfos().map(glyph=>glyph.codepoint),[entry.glyphId],`${label}: salt ${entry.salt}, weight ${value}`);
        assert.ok(font.glyphToJson(entry.glyphId).length>0,`Empty shaped glyph ${entry.glyph}`);shapes++;
      }
    }
    reports[name]={sha256:hashFurifont(fontBytes),bytes:fontBytes.length,pairs:entries.length,shapes,weights:shapesAt,inkAuditWeights:inkWeights,componentsChecked,sourceGlyphsVerified:baseGlyphs.size};
  }
  return {version:1,ok:true,sourceSha256:manifest.metadata.source.sha256,pairs:pairs.length,families:reports,harfbuzz:hb.versionString(),readingSource:'reviewed-local-pairs-only',dictionaryUsed:false,failures:0};
}

if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await auditFurifont(),null,2));
