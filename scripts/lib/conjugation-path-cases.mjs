// Independent test inputs: grammar witnesses are written here, not obtained
// from the production candidate generator or its diagnostic plan metadata.
import { referenceStages, correctSpellings } from './diagnostic-oracle.mjs';

function carry(value, stages) {
  for (const {before,after} of stages) {
    let fixed=0; while(before[fixed] && before[fixed]===after[fixed])fixed++;
    const from=before.slice(fixed),to=after.slice(fixed);
    if(!value.endsWith(from))return null;
    value=(from?value.slice(0,-from.length):value)+to;
  }
  return value;
}
export function generateConjugationPathCases(item, forms) {
  const result=[],seen=new Set();
  for(const form of forms) {
    const branches=[];
    for(const writing of ['surface','reading']) {
      const word={...item,surface:item[writing],reading:item[writing]};
      let stages;try{stages=referenceStages(word,form);}catch{continue;}
      for(let index=1;index<stages.length;index++) {
        const end=stages[index],first=stages[index-1];
        const native=end.ids.includes('suffix.past')?'past':end.ids.includes('suffix.te')?'te':null;
        if(!native||!first.before.endsWith('る')||!['ichidan','godan'].includes(first.class)
          ||!first.ids.some(id=>id==='stem.ichidan.drop-ru'||id==='onbin.sokuon'))continue;
        const stem=first.before.slice(0,-1),terminal=native==='past'?'だ':'で';
        const wrong=stem+(first.class==='ichidan'?'っ':'')+terminal;
        const input=carry(wrong,stages.slice(index+1));
        if(!input)continue;
        const key=JSON.stringify([form,input]);if(seen.has(key))continue;seen.add(key);
        branches.push({item,form,input,native,source:first.before,expectedClass:first.class});
      }
    }
    // Correct variants and other complete expressions must retain precedence.
    const legal=new Set(forms.flatMap(other=>['surface','reading'].flatMap(writing=>{
      try{return correctSpellings({...item,surface:item[writing],reading:item[writing]},other);}catch{return [];}
    })));
    result.push(...branches.filter(c=>!legal.has(c.input)));
  }
  return result;
}
