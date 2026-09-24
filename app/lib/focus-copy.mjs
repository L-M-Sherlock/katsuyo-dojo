import { FORM_LABELS } from './form-labels.mjs';

// Completion copy is separate from the stable knowledge-point labels stored
// in learning history. A new focus needs a readable title and a concrete cue.
const EXACT = {
  'class.godan': ['分辨五段动词', '先认出五段动词，后面的词尾变化才有依据。'],
  'class.ichidan': ['分辨一段动词', '留意原形末尾的「る」，并与五段动词区分。'],
  'class.irregular': ['分辨不规则动词', '把「する」和「来る」的变化单独认出来。'],
  'heuristic.ru-ie': ['分辨「い／え音＋る」的动词', '例如「起きる」是一段，「帰る」是五段；不能只看「る」。'],
  'heuristic.ru-other': ['判断其他「る」结尾的动词', '看「る」前一个音，练习初步判断词类。'],
  'exception.ru-godan': ['记住「る」结尾的五段例外', '例如「帰る」虽然是え段＋る，仍按五段动词变化。'],
  'adj.class.i': ['分辨い形容词', '判断词条是否按い形容词改变末尾。'],
  'adj.class.na': ['分辨な形容词', '判断词条是否使用「な」「だ」等接法。'],
  'stem.ichidan.drop-ru': ['一段动词先去掉「る」', '例如「食べる」先取「食べ」，再接所需形式。'],
  'stem.irregular.connective': ['「する／来る」的词干变化', '例如「する→し」「来る→き」，再接后面的形式。'],
  'stem.godan.a': ['五段动词的「く→か」类变化', '写「書かない」时，先把「書く」的「く」换成「か」。'],
  'stem.godan.i': ['五段动词的「く→き」类变化', '写「書きます」时，先把「書く」的「く」换成「き」。'],
  'stem.godan.e': ['五段动词的「く→け」类变化', '写「書ける」时，把「書く」的「く」换成「け」。'],
  'stem.godan.o': ['五段动词意向形的词尾变化', '写「書こう」时，把「書く」的「く」换成「こ」，再加「う」。'],
  'stem.godan.u-wa': ['「う」结尾的否定形要变成「わ」', '例如「買う→買わない」，这里不用「買あない」。'],
  'stem.godan.shi-connective': ['「す」结尾变成「し」再接后缀', '例如「話す→話します／話して」。'],
  'onbin.sokuon': ['「う・つ・る」结尾的促音变化', '例如「買う→買った／買って」。'],
  'onbin.hatsuon': ['「ぬ・ぶ・む」结尾的拨音变化', '例如「読む→読んだ／読んで」。'],
  'onbin.i': ['「く・ぐ」结尾的い音变化', '例如「書く→書いた／書いて」。'],
  'onbin.voicing': ['音便后选「だ／で」', '例如「読む→読んだ／読んで」，留意浊音。'],
  'compound.negative-past': ['把否定形变成过去', '把「ない」变为「なかった」，如「書かない→書かなかった」。'],
  'compound.polite-past': ['把「ます」变成过去', '把末尾「ます」换成「ました」。'],
  'compound.polite-negative': ['把「ます」变成否定', '把末尾「ます」换成「ません」。'],
  'compound.polite-negative-past': ['把「ます」变成否定过去', '把末尾「ます」换成「ませんでした」。'],
  'compound.voice-stack': ['把态形式继续变化', '先写可能、受身或使役等形式，再改变整个表达。'],
  'compound.multi-step': ['把受身、愿望和否定过去连起来', '逐步改变整个表达，最后核对否定和时态。'],
  'contraction.causative-passive': ['使役受身的简短写法', '五段动词常见「せられる→される」的缩约。'],
  'exception.aru-negative': ['「ある」的否定用「ない」', '接好「てある」后，否定时留意这处例外。'],
  'adj.stem.i-ku': ['い形容词先把「い」变成「く」', '例如「高い→高く」，再接否定或其他形式。'],
  'adj.suffix.i-negative': ['组成い形容词的否定形', '例如「高い→高くない」。'],
  'adj.suffix.i-past': ['组成い形容词的过去形', '例如「高い→高かった」。'],
  'adj.compound.i-negative-past': ['把い形容词否定形变成过去', '例如「高くない→高くなかった」。'],
  'adj.exception.ii-yo': ['「いい」变化时用「よ」', '例如「いい→よくない／よかった」。'],
  'adj.suffix.na-attributive': ['用「な」修饰名词', '例如「静かな部屋」。'],
  'adj.suffix.na-predicative': ['用「だ」结束描述', '例如「この部屋は静かだ」。'],
  'adj.suffix.na-negative': ['组成な形容词的否定形', '例如「静かではない」。'],
  'adj.suffix.na-past': ['组成な形容词的过去形', '例如「静かだった」。'],
  'adj.compound.na-negative-past': ['把な形容词否定形变成过去', '例如「静かではない→静かではなかった」。'],
  'adj.suffix.na-te': ['用「で」连接な形容词', '例如「静かで、落ち着く」。'],
  'adj.suffix.i-adverb': ['把い形容词变成修饰动作的形式', '例如「早い→早く」。'],
  'adj.suffix.na-adverb': ['把な形容词变成修饰动作的形式', '例如「静か→静かに」。'],
  'adj.suffix.i-te': ['用「くて」连接い形容词', '例如「高い→高くて」。'],
  'adj.suffix.i-ba': ['用「ければ」表达条件', '例如「高い→高ければ」。'],
  'adj.suffix.na-conditional': ['用「なら」表达条件', '例如「静か→静かなら」。'],
  'suffix.negative': ['组成动词否定形', '接上「ない」，表示不做或未发生。'],
  'suffix.past': ['组成动词过去形', '接「た／だ」，留意前面的音便。'],
  'suffix.te': ['组成动词て形', '接「て／で」，留意前面的音便。'],
  'suffix.masu': ['组成礼貌体「ます」', '先取合适的词干，再接「ます」。'],
  'suffix.passive': ['组成受身形', '练习词干变化及「れる／られる」的接法。'],
  'suffix.potential': ['组成可能形', '把动词变成表示“能做”的形式。'],
  'suffix.imperative': ['组成命令形', '练习直接要求对方做某事的词形。'],
  'suffix.volitional': ['组成意向形', '练习表示“做吧／打算做”的词形。'],
  'suffix.ba': ['组成动词ば条件形', '把动词变成表示“如果做”的词形。'],
  'suffix.nasai': ['接上「なさい」', '先取连用词干，再组成「〜なさい」命令。'],
  'suffix.prohibitive': ['组成「〜な」禁止形', '在辞书形后接「な」，表示不要做。'],
  'suffix.causative': ['组成使役形', '练习表示让某人做某事的词形。'],
  'suffix.causativePassive': ['组成使役受身形', '练习表示被要求做某事的词形。'],
  'construction.youtosuru': ['接出「ようとする」', '先写意向形，再接「とする」，表示正要做。'],
};

const TE_BASES = new Set(['teageru','temorau','tekureru','tekudasai','teiru','teru','tearu','teoru',
  'tehoshii','temo','tewa','temoIi','temiru','teiku','teku','tekuru','teshimau','chau','teoku','toku']);
const MASU_BASES = new Set(['tai','tagaru','nagara','tsutsu','sugiru','masenka']);
const NEGATIVE_BASES = new Set(['nakute','naide','zu','zuni','naideKudasai','nakutemoIi','nakerebaNaranai','nakutewaIkenai','naitoIkenai']);
const PAST_BASES = new Set(['tara','tari','tatte']);
const SHORT_FORMS = new Set(['chau','toku','teru','toru','teku']);

/** A learner-facing explanation for any focus that can appear after a round.
 * @param {{id:string,label:string}} component
 * @returns {{title:string,detail:string}|null}
 */
export function focusCopy(component) {
  const exact = EXACT[component.id];
  if (exact) return {title:exact[0],detail:exact[1]};
  if (component.id.startsWith('construction.')) {
    const form=component.id.slice('construction.'.length), label=FORM_LABELS[form];
    if (!label) return null;
    const display=label.replace(/形$/u,'');
    const detail = SHORT_FORMS.has(form) ? '把已学表达缩短，注意缩约后的读音。'
      : TE_BASES.has(form) ? '先写出て／で形，再接这个表达。'
        : MASU_BASES.has(form) ? '先取动词的ます词干，再接这个表达。'
          : NEGATIVE_BASES.has(form) ? '先处理否定形，再接这个表达。'
            : PAST_BASES.has(form) ? '先写出过去形，再接这个表达。' : null;
    return detail ? {title:`练习「${display}」的接法`,detail} : null;
  }
  if (/^apply\.[^.]+\.continuation$/.test(component.id)) {
    const base=component.id.split('.')[1], label=FORM_LABELS[base];
    if (!label) return null;
    return base==='teoru'
      ? {title:'把「ておる」变成过去形',detail:'先接「ておる」，再把整个表达变成过去。'}
      : {title:`把「${label}」继续变成否定或过去`,detail:'先写出这个表达，再改变整个表达的末尾。'};
  }
  if (component.id.startsWith('composition.')) {
    const [,output,ending]=component.id.split('.');
    const kind=output==='i-adjective'?'い形容词型':'动词型';
    const result={past:'过去',negative:'否定',negativePast:'否定过去'}[ending];
    return result ? {title:`把接好的${kind}表达变成${result}`,detail:'先完成前一段变化，再改变整个表达的末尾。'} : null;
  }
  if (component.id.startsWith('compound.chain.')) {
    const combination=component.label.replace(/的组合应用$/u,'');
    return {title:`把${combination}连起来`,detail:'按顺序完成每一步，最后写出完整词形。'};
  }
  return null;
}
