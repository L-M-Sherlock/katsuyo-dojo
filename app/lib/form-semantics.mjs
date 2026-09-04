import { COMPOUND_FORM_SPECS } from "./compound-forms.mjs";

function semantic(concise, coreMeaning, extras = {}) {
  const entry = { concise, coreMeaning, core: coreMeaning, ...extras };
  if (extras.usageNote) entry.usage = extras.usageNote;
  return Object.freeze(entry);
}

const BASIC_SEMANTICS = {
  negative: semantic("不做……", "表示动作或状态在现在或将来不成立。", {
    register: "普通体",
    contrast: "过去没有做要用否定过去形。",
  }),
  past: semantic("做了……／曾经……", "表示动作已经发生，或状态存在于过去。", {
    register: "普通体",
    contrast: "不一定强调完成；具体是过去经历还是完成，要看语境。",
  }),
  te: semantic("连接后续表达", "连接前后动作、状态或原因，也是许多补助表达的基础。", {
    usageNote: "て形本身通常不表示时态，完整含义由后续成分决定。",
  }),
  masu: semantic("礼貌地陈述……", "礼貌地表示现在、习惯或将来的动作。", {
    register: "礼貌体",
    contrast: "对应普通体的辞书形；过去要用「ました」。",
  }),
  negativePast: semantic("过去没有做……", "表示动作或状态在过去没有发生或不成立。", {
    register: "普通体",
  }),
  masuPast: semantic("礼貌地表示做了……", "礼貌地表示动作已经发生或状态存在于过去。", {
    register: "礼貌体",
  }),
  masuNegative: semantic("礼貌地表示不做……", "礼貌地表示动作或状态在现在或将来不成立。", {
    register: "礼貌体",
  }),
  masuNegativePast: semantic("礼貌地表示过去没做……", "礼貌地表示动作或状态在过去没有发生或不成立。", {
    register: "礼貌体",
  }),
  imperative: semantic("命令对方做……", "用强烈、直接的方式命令对方执行动作。", {
    register: "强硬表达",
    usageNote: "语气很强，日常使用需注意身份和场合。",
    contrast: "较缓和的指示可用「なさい」，礼貌请求可用「てください」。",
  }),
  passive: semantic("被……／受到……", "以承受动作的人或事物为主语，表示被动，也可表示受影响。", {
    contrast: "一段动词和「来る」的受身形与可能形外形相同，要结合助词和语境判断。",
  }),
  potential: semantic("能够……／可以……", "表示具有做某事的能力，或某动作在条件上可以实现。", {
    contrast: "一段动词和「来る」的可能形与受身形外形相同，要结合助词和语境判断。",
  }),
  volitional: semantic("打算……／一起……吧", "表示说话人的意志，或向对方提出一起行动的建议。", {
    register: "普通体",
    contrast: "礼貌说法通常用「〜ましょう」。",
  }),
  ba: semantic("如果……", "提出条件，表示在该条件成立时会出现后项结果。", {
    contrast: "可能形表示“能做”，ば形表示“如果做”；五段动词虽然都用 e 段，结尾不同。",
  }),
  causative: semantic("让／使某人做……", "表示使某人做某事，语境可以是强制，也可以是许可。", {
    usageNote: "究竟是“让”还是“使”，要由人物关系和语境判断。",
  }),
  causativePassive: semantic("被迫／被要求做……", "表示主语受到他人驱使而做某事，常带有不情愿或受影响的语感。", {
    contrast: "使役形从使令者角度说“让别人做”，使役受身形从执行者角度说“被迫做”。",
  }),
  causativePassiveContracted: semantic("被迫做……（缩约）", "与完整使役受身形含义相同，是部分五段动词的缩短形式。", {
    register: "常用缩约",
    usageNote: "例如「行かせられる」可缩为「行かされる」；す结尾五段动词不这样缩约。",
  }),
};

function continuedSemantic(baseId, tense, concise, extras = {}) {
  const base = BASIC_SEMANTICS[baseId];
  const continuation = {
    past: "整体变为过去，表示这种动作或关系发生在过去。",
    negative: "整体变为否定，表示这种动作或关系不成立。",
    negativePast: "整体变为否定过去，表示这种动作或关系在过去不成立。",
  }[tense];
  return semantic(concise, `${base.coreMeaning.replace(/。$/, "")}；${continuation}`, {
    ...(base.register ? { register: base.register } : {}),
    ...(base.usageNote ? { usageNote: base.usageNote } : {}),
    ...(base.contrast ? { contrast: base.contrast } : {}),
    ...extras,
  });
}

const VOICE_COMPOUND_SEMANTICS = {
  passivePast: continuedSemantic("passive", "past", "过去被……"),
  passiveNegative: continuedSemantic("passive", "negative", "不被……"),
  passiveNegativePast: continuedSemantic("passive", "negativePast", "过去没有被……"),
  potentialPast: continuedSemantic("potential", "past", "过去能够……"),
  potentialNegative: continuedSemantic("potential", "negative", "不能……"),
  potentialNegativePast: continuedSemantic("potential", "negativePast", "过去不能……"),
  causativePast: continuedSemantic("causative", "past", "曾让／使某人做……"),
  causativeNegative: continuedSemantic("causative", "negative", "不让／不使某人做……"),
  causativeNegativePast: continuedSemantic("causative", "negativePast", "过去没让／没使某人做……"),
  causativePassivePast: continuedSemantic("causativePassive", "past", "过去被迫做……"),
  causativePassiveNegative: continuedSemantic("causativePassive", "negative", "不被迫做……"),
  causativePassiveNegativePast: continuedSemantic("causativePassive", "negativePast", "过去没有被迫做……"),
};

const CONSTRUCTION_SEMANTICS = {
  tara: semantic("如果……／……之后", "表示某动作完成后成立的条件，也可表示事情发生之后。", {
    contrast: "ば侧重条件关系；たら还常表示动作完成后的时间顺序。",
  }),
  nasai: semantic("请做……／要做……", "用于上级对下级的指示或规劝，命令感比命令形缓和。", {
    register: "直接指示",
    usageNote: "不适合对上级使用。",
  }),
  prohibitive: semantic("不许做……", "用辞书形加「な」强烈禁止某个动作。", {
    register: "强硬表达",
    contrast: "礼貌地请对方不要做时用「ないでください」。",
  }),
  nakute: semantic("不……而／因为不……", "连接否定的状态或原因，常表示“不……而且……”或“因为不……”。", {
    contrast: "「ないで」更常表示“不做前项而做后项”；「なくて」更常连接状态或原因。",
  }),
  naide: semantic("不做……而……", "表示在不进行前项动作的情况下进行后项，也可接请求等表达。", {
    contrast: "「なくて」更常连接否定状态或原因；「ないで」更突出没有做某个动作。",
  }),
  zu: semantic("不……（书面）", "以较书面或固定的方式表示否定，相当于「ない」。", {
    register: "书面／较正式",
    usageNote: "「する」变为「せず」。",
  }),
  zuni: semantic("不做……而……（书面）", "表示没有进行前项动作便进行后项，相当于较书面的「ないで」。", {
    register: "书面／较正式",
    usageNote: "「する」变为「せずに」。",
  }),
  teageru: semantic("为别人做……", "表示主语为别人做某事，把帮助或恩惠给予对方。", {
    usageNote: "对上级直接使用有时会显得强调自己的施惠。",
    contrast: "「てもらう」从接受帮助的一方叙述；「てくれる」强调别人为我方做。",
  }),
  temorau: semantic("请／得到别人为自己做……", "表示主语接受别人做某事所带来的帮助或恩惠。", {
    contrast: "「てあげる」从给予帮助的一方叙述；「てもらう」从接受帮助的一方叙述。",
  }),
  tekureru: semantic("别人为我方做……", "表示别人主动为说话人或说话人一方做某事。", {
    contrast: "「てもらう」着重我方得到帮助；「てくれる」着重对方为我方做。",
  }),
  tekudasai: semantic("请做……", "礼貌地请求对方进行某个动作。", {
    register: "礼貌请求",
    usageNote: "虽是礼貌形式，对关系较远或地位较高的人仍可能显得直接。",
  }),
  naideKudasai: semantic("请不要做……", "礼貌地请求对方不要进行某个动作。", {
    register: "礼貌请求",
    contrast: "强烈禁止用辞书形加「な」；「ないでください」更礼貌。",
  }),
  teiru: semantic("正在……／一直……／处于……状态", "根据动词性质表示动作正在进行、反复习惯，或变化后的结果状态。", {
    contrast: "「てある」强调有人有意做过某事后留下的状态。",
  }),
  teru: semantic("正在……／处于……状态（缩约）", "是「ている／でいる」的口语缩约，核心含义与「ている」相同。", {
    register: "口语缩约",
  }),
  tearu: semantic("有意做完后保持着……", "表示某人有意完成了动作，其结果状态目前仍然存在。", {
    usageNote: "通常接他动词，并把处于结果状态的对象作为话题或用「が」标记。",
    contrast: "「ている」可单纯描述进行或结果；「てある」突出人为准备及留下的状态。",
  }),
  teoru: semantic("正在……／处于……状态（おる）", "基本相当于「ている」，表示进行、习惯或结果状态。", {
    register: "自谦／郑重／方言或角色语感",
    usageNote: "作为自谦语时用于说话人一方；其他语境也可能是方言或较古风的说法。",
    contrast: "中性的日常形式是「ている」。",
  }),
  toru: semantic("正在……／处于……状态（缩约）", "是「ておる／でおる」缩成的「とる／どる」，含义仍与相应的「ておる」相同。", {
    register: "方言／带角色语感的口语缩约",
    contrast: "中性的标准日语通常用「ている」；「とる／どる」的语感受地区和人物设定影响。",
  }),
  tai: semantic("想做……", "表示说话人希望自己进行某个动作，并像い形容词一样继续活用。", {
    usageNote: "直接陈述第三人的愿望时，常改用「たがる」或加传闻、推测表达。",
    contrast: "「てほしい」表示希望别人做；「たい」表示自己想做。",
  }),
  tehoshii: semantic("希望别人做……", "表示希望某人进行某动作，或希望某种情况出现。", {
    usageNote: "动作执行者常用「に」标记；整体按い形容词方式继续活用。",
    contrast: "「たい」表示自己想做；「てほしい」表示希望别人做。",
  }),
  temo: semantic("即使……也……", "提出让步条件，表示即使前项成立，后项仍然成立。", {
    contrast: "「たら」提出一般条件；「ても」强调结果不受该条件影响。",
  }),
  nagara: semantic("一边……一边……", "表示同一主体同时进行两个动作，通常以后项为主要动作。", {
    usageNote: "前后动作的主体原则上相同。",
    contrast: "「つつ」意思相近，但更书面、正式。",
  }),
  tsutsu: semantic("一边……一边……（书面）", "表示同一主体同时进行两个动作，含义接近「ながら」。", {
    register: "书面／较正式",
    usageNote: "「つつも」还可表示“虽然……却……”。",
  }),
  nakerebaNaranai: semantic("必须做……", "表示不做某事就不行，即有义务或必要做某事。", {
    register: "中性／较正式",
  }),
  nakutewaIkenai: semantic("必须做……", "表示不做某事会不妥，因此必须做。", {
    register: "中性",
  }),
  naitoIkenai: semantic("得做……／必须做……", "用“不做就不行”的结构表示义务或必要。", {
    register: "会话常用",
  }),
  tari: semantic("做……之类", "列举有代表性的动作或状态，暗示还有其他同类情况。", {
    usageNote: "常以「〜たり、〜たりする」的形式列举多项。",
  }),
  tewa: semantic("如果……就……", "把前项作为条件或反复发生的动作，常接不理想的评价或结果。", {
    usageNote: "在口语中常缩为「ちゃ／じゃ」。",
  }),
  temoIi: semantic("可以做……", "表示允许进行某个动作，也可用于询问许可。", {
    contrast: "「なくてもいい」表示“不做也可以”，即没有做的必要。",
  }),
  nakutemoIi: semantic("不做也可以", "表示不进行某个动作也没有问题，即不必做。", {
    contrast: "不是“不能做”；它表达的是没有义务或必要。",
  }),
  masenka: semantic("要不要……？", "用礼貌的否定疑问邀请对方一起行动，或委婉请求对方行动。", {
    register: "礼貌邀请／请求",
    contrast: "字面是否定疑问，但在邀请语境中并不表示单纯的“不做吗”。",
  }),
  youtosuru: semantic("正要……／试图……", "表示某动作即将发生，或主体尝试、打算实施该动作。", {
    usageNote: "具体是“正要”还是“试图”，由时态和语境判断。",
  }),
  temiru: semantic("试着做……", "表示实际尝试某个动作，以观察结果或获得体验。", {
    contrast: "不同于表示视觉的「見る」；作为补助表达时通常写作假名「みる」。",
  }),
  teshimau: semantic("做完……／不小心……", "表示动作彻底完成，也可表达遗憾、意外或不由自主的语感。", {
    usageNote: "语境决定它只是强调完成，还是带有遗憾。",
    contrast: "口语常缩为「ちゃう／じゃう」。",
  }),
  chau: semantic("做完……／不小心……（缩约）", "是「てしまう／でしまう」的口语缩约，含义仍是彻底完成或带遗憾、意外。", {
    register: "口语缩约",
    usageNote: "て接「ちゃう」，で接「じゃう」。",
  }),
  teoku: semantic("预先做……／保持……", "表示为将来预先完成动作，或做完后让结果状态保持不变。", {
    contrast: "口语常缩为「とく／どく」。",
  }),
  toku: semantic("预先做……／保持……（缩约）", "是「ておく／でおく」的口语缩约，表示预先准备或保持结果。", {
    register: "口语缩约",
    usageNote: "て接「とく」，で接「どく」。",
  }),
  teiku: semantic("继续下去／向远处而去", "表示动作或变化从现在向未来发展，或动作在空间上远离说话人。", {
    contrast: "「てくる」常表示变化发展到现在，或动作朝说话人而来。",
  }),
  teku: semantic("继续下去／离去（缩约）", "是「ていく／でいく」的口语缩约，核心含义与「ていく」相同。", {
    register: "口语缩约",
  }),
  tekuru: semantic("逐渐……起来／……而来", "表示动作或变化发展到现在，朝说话人方向而来，或做完某事再回来。", {
    contrast: "「ていく」通常从现在向未来延伸，或在空间上远离说话人。",
  }),
  tatte: semantic("即使……也……", "用较口语的形式提出让步条件，表示即使前项成立，后项也不改变。", {
    register: "口语",
    contrast: "含义接近「ても／でも」，但「たって／だって」更偏口语。",
  }),
  sugiru: semantic("过于……", "表示动作或性质超过合适、正常的程度。", {
    usageNote: "接动词时使用ます词干；接形容词时也可表示程度过头。",
  }),
  tagaru: semantic("显得想做……", "根据可观察到的表现描述第三人想做某事，并按五段动词继续活用。", {
    contrast: "说话人直接表达自己的愿望通常用「たい」。",
  }),
};

const ADJECTIVE_SEMANTICS = {
  adjectiveNegative: semantic("不……", "表示い形容词所描述的性质或状态不成立。", {
    register: "普通体",
  }),
  adjectivePast: semantic("过去很……／曾经……", "表示い形容词所描述的性质或状态存在于过去。", {
    register: "普通体",
  }),
  adjectiveNegativePast: semantic("过去不……", "表示い形容词所描述的性质或状态在过去不成立。", {
    register: "普通体",
  }),
  adjectiveTe: semantic("既……又……／因为……", "连接い形容词与后续描述，可列举性质，也可表达原因。"),
  adjectiveAttributive: semantic("……的（修饰名词）", "让な形容词直接修饰后面的名词。", {
    contrast: "句末作谓语时不用「な」，普通体通常接「だ」。",
  }),
  adjectivePredicative: semantic("是……的／很……", "让な形容词在句末作普通体谓语，对性质或状态作判断。", {
    register: "普通体",
    contrast: "修饰名词时接「な」，句末判断时接「だ」。",
  }),
  adjectiveNaNegative: semantic("不……", "表示な形容词所描述的性质或状态不成立。", {
    register: "普通体",
    usageNote: "会话中「ではない」常说成「じゃない」。",
  }),
  adjectiveNaPast: semantic("过去很……／曾经……", "表示な形容词所描述的性质或状态存在于过去。", {
    register: "普通体",
  }),
  adjectiveNaNegativePast: semantic("过去不……", "表示な形容词所描述的性质或状态在过去不成立。", {
    register: "普通体",
    usageNote: "会话中「ではなかった」常说成「じゃなかった」。",
  }),
  adjectiveNaTe: semantic("既……又……／因为……", "用「で」连接な形容词与后续描述，可列举性质，也可表达原因。"),
  adjectiveBa: semantic("如果……", "提出以某种性质或状态成立为前提的条件。", {
    usageNote: "い形容词通常用「ければ」，な形容词通常用「なら」。",
  }),
  adjectiveAdverb: semantic("……地", "把形容词变为副词，用来修饰动作、变化或另一种状态。", {
    usageNote: "い形容词通常变为「く」，な形容词通常接「に」。",
  }),
};

const STATIC_FORM_SEMANTICS = Object.freeze({
  ...BASIC_SEMANTICS,
  ...VOICE_COMPOUND_SEMANTICS,
  ...CONSTRUCTION_SEMANTICS,
  passiveDesireNegativePast: semantic("过去不想被……", "表示过去不希望自己受到某个动作。", {
    usageNote: "依次组合受身形、「たい」和否定过去。",
  }),
  ...ADJECTIVE_SEMANTICS,
});

const ENDING_SEMANTICS = {
  past: {
    conciseSuffix: "（过去）",
    core: "整体再变为过去，表示这种动作、状态或关系发生在过去。",
  },
  negative: {
    conciseSuffix: "（否定）",
    core: "整体再变为否定，表示这种动作、状态或关系不成立。",
  },
  negativePast: {
    conciseSuffix: "（否定过去）",
    core: "整体再变为否定过去，表示这种动作、状态或关系在过去不成立。",
  },
};

function compoundSemantic(form, spec) {
  const base = STATIC_FORM_SEMANTICS[spec.form];
  const ending = ENDING_SEMANTICS[spec.ending];
  if (!base || !ending) return null;
  return semantic(`${base.concise}${ending.conciseSuffix}`, `${base.coreMeaning.replace(/。$/, "")}；${ending.core}`, {
    ...(base.register ? { register: base.register } : {}),
    ...(base.usageNote ? { usageNote: base.usageNote } : {}),
    ...(base.contrast ? { contrast: base.contrast } : {}),
    baseForm: spec.form,
    continuation: spec.ending,
    form,
  });
}

const DYNAMIC_FORM_SEMANTICS = Object.freeze(Object.fromEntries(
  Object.entries(COMPOUND_FORM_SPECS).map(([form, spec]) => [form, compoundSemantic(form, spec)]),
));

/**
 * Semantic help for every practice form. Classification exercises have no form
 * id and are intentionally not part of this catalog.
 */
export const FORM_SEMANTICS = Object.freeze({
  ...STATIC_FORM_SEMANTICS,
  ...DYNAMIC_FORM_SEMANTICS,
});

export function semanticsForForm(form) {
  return FORM_SEMANTICS[form] ?? null;
}
