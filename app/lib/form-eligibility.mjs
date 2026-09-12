import { COMPOUND_FORM_SPECS } from './compound-forms.mjs';
import { CHAIN_FORM_SPECS } from './multi-step-forms.mjs';
import { FORM_LABELS } from './form-labels.mjs';
import { LEXICAL_REVIEW_VERSION, reviewedLexicalSense } from './lexical-usage.mjs';
export const USAGE_REVIEW_VERSION = LEXICAL_REVIEW_VERSION;

const words = text => new Set(text.split(' ').filter(Boolean));
const verbForms = new Set(Object.keys(FORM_LABELS).filter(form => !form.startsWith('adjective')));
const iForms = words('adjectiveNegative adjectivePast adjectiveNegativePast adjectiveTe adjectiveBa adjectiveAdverb');
const naForms = words('adjectiveAttributive adjectivePredicative adjectiveNaNegative adjectiveNaPast adjectiveNaNegativePast adjectiveNaTe adjectiveBa adjectiveAdverb');
const basicForms = words('negative past te masu negativePast masuPast masuNegative masuNegativePast ba nakute zu zuni tara temo tari tewa tatte');
const aliasForms = { chau: 'teshimau', toku: 'teoku', teru: 'teiru', toru: 'teoru', teku: 'teiku', causativePassiveContracted: 'causativePassive' };
const actionFamilies = words('potential passive causative causativePassive volitional imperative nasai prohibitive tekudasai naideKudasai naide tai tagaru tehoshii temiru youtosuru teageru temorau tekureru teoku teiru teoru teshimau teiku tekuru sugiru nagara tsutsu masenka temoIi nakutemoIi nakerebaNaranai nakutewaIkenai naitoIkenai');
const descriptiveFamilies = words('teiru teoru teshimau teiku tekuru');
const directiveFamilies = words('volitional imperative nasai prohibitive tekudasai naideKudasai masenka temoIi nakutemoIi nakerebaNaranai nakutewaIkenai naitoIkenai naide');

// Compatibility export: these are reviewed intentional completion/result uses,
// not a claim that every other verb is intransitive or can never take てある.
export const TRANSITIVE_VERBS = words('書く 弾く 話す 待つ 読む 買う 切る 飲む 聞く 取る 使う 置く 脱ぐ 貸す 消す 持つ 打つ 選ぶ 作る 売る 習う 言う 払う 洗う 手伝う 拾う 描く 磨く 焼く 注ぐ 防ぐ 稼ぐ 出す 直す 渡す 返す 押す 探す 落とす 指す 起こす 運ぶ 学ぶ 頼む 申し込む 包む 送る 守る 食べる 見る 教える 開ける 閉める 借りる 浴びる 覚える 着る 調べる 始める 続ける 助ける 考える 決める 止める 見せる 受ける 付ける 集める 捨てる 迎える 伝える 変える 届ける 片付ける する 呼ぶ');
const storedResultVerbs = words('書く 切る 置く 脱ぐ 消す 持つ 作る 払う 洗う 拾う 描く 磨く 焼く 注ぐ 出す 直す 渡す 返す 押す 落とす 運ぶ 包む 送る 開ける 閉める 着る 決める 止める 付ける 集める 捨てる 変える 届ける 片付ける');
const personallyDesiredExperiences = words('知る 分かる 忘れる 喜ぶ');
const experienceRequests = words('知る 分かる 忘れる 喜ぶ');
const indirectPassiveContexts = {
  降る: '谈论出行时的天气，以及雨天对出行者的影响。',
  泣く: '谈论孩子的哭声与照护者的处境。',
  死ぬ: '谈论亲人离世这件事与家属生活的关系。',
  騒ぐ: '谈论邻居的吵闹与在房间里休息的人的处境。',
  笑う: '谈论某人的笑声或嘲笑，以及旁人的感受。',
  来る: '谈论访客上门与住户的生活安排。',
  帰る: '谈论某人离开现场与留下的人的处境。',
  行く: '谈论同伴前往别处与留下的人的处境。',
  逃げる: '谈论被看管者逃跑与负责看管的人的处境。',
  座る: '谈论座位的使用与需要这个座位的人的处境。',
  立つ: '谈论有人站在观看者前方与观看者视线的关系。',
  休む: '谈论同事休息与其他人的工作安排。',
  住む: '谈论附近的居住情况与原住户的生活。',
  走る: '谈论路人的奔跑与同处道路的行人的处境。',
  泳ぐ: '谈论某人的游泳活动与同处水域的人的处境。',
  働く: '谈论共用空间的工作活动与其他使用者的处境。',
  遊ぶ: '谈论孩子的玩耍与旁边工作的人的处境。',
  飛ぶ: '谈论住宅附近的无人机飞行与居民生活的关系。',
  寝る: '谈论同伴睡觉与需要帮助的人的处境。',
  眠る: '谈论被照护者睡眠与陪同者的处境。',
  出る: '谈论同伴离开现场与留下的人的处境。',
  入る: '谈论别人进入共用房间与原使用者的处境。',
  並ぶ: '谈论排队位置的占用与其他排队者的处境。',
  いる: '谈论某人在共用场所停留与其他使用者的处境。',
};
const causedEventContexts = {
  咲く: '园艺师照料花木，描述这种照料与花朵开放的关系。',
  開く: '技术人员调整装置，描述装置的作用与门自动开启的关系。',
  動く: '技术人员操作控制器，描述控制器与机器运转的关系。',
  届く: '调整信号设备，描述调整与信号到达远处的关系。',
  落ちる: '测试装置对物体施加作用，描述物体掉落的变化。',
  壊れる: '测试人员对零件施加负荷，描述零件损坏的变化。',
  死ぬ: '救护人员处理动物的伤情，描述人的处置与动物生命的关系。',
  喜ぶ: '为家人安排惊喜，描述安排与家人心情的关系。',
  困る: '一个人的举动给周围的人带来麻烦。',
  疲れる: '活动安排影响参与者的体力，描述安排与疲劳的关系。',
  分かる: '教师换一种解释方式，描述解释与学生理解的关系。',
  知る: '工作人员提供信息，描述信息与听者了解事实的关系。',
  忘れる: '新的经历影响一个人的记忆，描述经历与忘记往事的关系。',
};
const prospectiveContexts = {
  咲く: '观察花苞的变化，描述花朵开放前的临界状态。',
  始まる: '观察活动现场的准备情况，描述开始前的临界状态。',
  壊れる: '观察磨损的零件，描述功能丧失前的临界状态。',
  生まれる: '观察小动物的发育，描述出生前的临界状态。',
  開く: '观察自动门的动作，描述打开前的临界状态。',
  落ちる: '观察边缘的物体，描述掉落前的临界状态。',
  降る: '观察天空和云层，描述雨雪出现前的临界状态。',
};
const eventHopeContexts = {
  降る: '农田需要水分，谈论人们对雨水的期待。',
  咲く: '种植者谈论自己对花朵开放的期待。',
  開く: '等候通行的人谈论对自动门状态的期待。',
  始まる: '等候活动的人谈论对活动进展的期待。',
  届く: '收件人谈论对包裹送达的期待。',
  増える: '经营者谈论对顾客数量变化的期待。',
  壊れる: '人们谈论对旧设备使用状态的期待。',
  落ちる: '园丁观察树上的成熟果实，谈论自己对于果实掉落的期待。',
  生まれる: '养育小动物的人谈论对新生命的期待。',
  足りる: '组织者核对活动物资，谈论对数量的期待。',
  似る: '家人谈论对孩子相貌的期待。',
  違う: '核对两个方案时，谈论对比较结果的期待。',
  役立つ: '提供建议的人谈论对建议效果的期待。',
  できる: '制作人员谈论对成品完成情况的期待。',
};
const benefactiveEventContexts = {
  降る: '谈论天气变化与需要水分的农田、种植者的关系。',
  咲く: '谈论花朵开放与花圃经营者吸引游客的需要。',
  届く: '谈论寄送物品的送达与收件人的需要。',
  開く: '谈论自动门的开启与双手拿着物品的通行者的关系。',
  生まれる: '谈论新生命的到来与家庭成员的感受。',
  分かる: '谈论听者的理解与向其说明困难的人的处境。',
  喜ぶ: '谈论收礼人的反应与准备礼物的人的感受。',
};
const simultaneousExperienceContexts = {
  困る: '某人一边为问题苦恼，一边继续处理工作。',
  喜ぶ: '某人一边感到高兴，一边向家人讲述消息。',
};
const supplementalWords = words('誘う 雇う 扱う 疑う 嫌う からかう 祝う 追う');
const passiveDesireWords = words('誘う 雇う 扱う 疑う 嫌う からかう 祝う 追う 笑う 思う 知る 読む 書く 話す 待つ 聞く 呼ぶ 使う 選ぶ 言う 手伝う 頼む 送る 守る 見る 教える 忘れる 信じる 助ける 見せる 捨てる 迎える 伝える 起こす 来る');
const transitivePassiveDesireContexts = {
  誘う: '当事人谈论聚餐邀请与自己的休息安排。',
  雇う: '求职者谈论某家公司的雇佣安排和劳动条件。',
  扱う: '当事人谈论周围人对待自己的方式，以及自己独立处理事情的能力。',
  疑う: '朋友之间核对一件事的说法，谈论彼此的信任。',
  嫌う: '当事人谈论表达自己的想法与朋友关系。',
  からかう: '当事人谈论同学拿自己的发型开玩笑这件事。',
  祝う: '当事人谈论家人安排的生日庆祝方式。',
  追う: '孩子们在玩追逐游戏，谈论追人的一方与逃跑的一方。',
  笑う: '当事人谈论自己发言出错时同学发笑的反应。',
  思う: '当事人谈论同事对自己的工作态度的评价。',
  知る: '当事人谈论同事获知自己私人信息这件事。',
  読む: '当事人谈论别人阅读自己的私人日记这件事。',
  書く: '当事人谈论别人记录自己的姓名或个人信息这件事。',
  話す: '当事人谈论别人向外讲述自己的私事这件事。',
  聞く: '当事人谈论别人询问自己的私人问题这件事。',
  言う: '当事人谈论别人对自己说的话。',
  送る: '当事人谈论别人安排自己前往某地这件事。',
  見せる: '当事人谈论别人向自己展示某种东西这件事。',
  伝える: '当事人谈论别人向外传达自己的私事这件事。',
};

// Additions to small transfer pools are reviewed as whole expressions. They do
// not authorize the shared base's other chains or every auxiliary construction.
const supplementalChainContexts = {
  temiruDesirePast: {
    脱ぐ: '当事人比较外套穿着与脱下时的感受，谈论一次尝试。',
    稼ぐ: '学生谈论通过兼职用自己的劳动挣钱的尝试。',
    注ぐ: '学习使用茶壶的人谈论把茶倒进茶杯的尝试。',
    探す: '读者谈论在旧书店寻找感兴趣的书的尝试。',
    直す: '自行车使用者谈论自己动手修理的尝试。',
    出す: '参赛者谈论向比赛提交自己作品的尝试。',
    押す: '参观者体验一台由按钮控制的装置。',
  },
  passiveProgressivePast: {
    洗う: '谈论衣物与洗衣过程。',
    払う: '谈论员工报酬与公司的支付情况。',
    扱う: '谈论职场中同事对待当事人的方式。',
    疑う: '谈论某人是否与一件事有关，以及调查者对他的判断。',
    雇う: '谈论当事人与一家店铺的雇佣关系。',
  },
};

function outcome(status, category, reason, context) {
  return { status, category, reason, ...(context ? { context } : {}), reviewVersion: LEXICAL_REVIEW_VERSION };
}
const allowed = reason => outcome('allowed', 'semantic', reason);
const blocked = (category, reason, reasonCode) => ({ ...outcome('blocked', category, reason), ...(reasonCode ? { reasonCode } : {}) });
function contextual(sense, family, reason, text) {
  return outcome('context-required', 'context', reason, text ? { id: `${sense.id}:${family}:v${LEXICAL_REVIEW_VERSION}`, text } : undefined);
}

/** Productive shape support only; no teaching or lexical-naturalness whitelist. */
export function supportsVerbForm(verb, form) {
  if (!verb || !['godan', 'ichidan', 'irregular'].includes(verb.class) || typeof verb.surface !== 'string') return false;
  if (verb.class === 'godan' && !/[うくぐすつぬぶむる]$/.test(verb.surface)) return false;
  if (verb.class === 'ichidan' && !verb.surface.endsWith('る')) return false;
  if (verb.class === 'irregular' && !/(?:する|来る|くる)$/.test(verb.surface)) return false;
  if (form == null) return true;
  if (!verbForms.has(form)) return false;
  return form !== 'causativePassiveContracted' || (verb.class === 'godan' && !verb.surface.endsWith('す'));
}

export function supportsAdjectiveForm(item, form) {
  if (!item || !['i', 'na'].includes(item.class) || typeof item.surface !== 'string') return false;
  if (item.class === 'i' && !item.surface.endsWith('い')) return false;
  return form == null || (item.class === 'i' ? iForms : naForms).has(form);
}

export function verbUsageFamily(form) {
  if (form == null) return 'classification';
  if (CHAIN_FORM_SPECS[form] || form === 'passiveDesireNegativePast') return form;
  if (basicForms.has(form)) return 'basic';
  const base = COMPOUND_FORM_SPECS[form]?.form ?? form.replace(/^(potential|passive|causative|causativePassive)(?:NegativePast|Negative|Past)$/, '$1');
  return aliasForms[base] ?? base;
}

function assessChain(sense, form) {
  if (form === 'passiveDesireNegativePast') {
    if (!passiveDesireWords.has(sense.surface)) return contextual(sense, form, '这条组合需要能合理承受该动作的愿望主体，当前词义尚无已审核的日常语境。');
    const text = transitivePassiveDesireContexts[sense.surface] ?? indirectPassiveContexts[sense.surface];
    return text ? contextual(sense, form, '需要明确受影响者就是表达愿望的人。', text) : allowed('已审核：该动作可以自然地指向表达愿望的当事人。');
  }
  const spec = CHAIN_FORM_SPECS[form];
  if (!spec?.words.includes(sense.surface)) return contextual(sense, form, '整条组合尚未为这个词义审核合适的日常语境。');
  const text = supplementalChainContexts[form]?.[sense.surface];
  return text ? contextual(sense, form, '这条组合采用已审核的日常对象与参与者关系。', text) : allowed('已按整条组合的参与者关系和含义人工审核。');
}

function assessAdjective(sense, form) {
  if (form === 'adjectiveAttributive' && sense.surface === '普通') return blocked('semantic', '当前“普通”的常规名词修饰用法是「普通の」；本课只练な接续，不把有特定用法的「普通な」作为该词义的默认答案。', 'non-default-attributive');
  if (form === 'adjectiveAdverb') {
    if (['好き', '嫌い', '心配', '残念', '幸せ', '欲しい', '眠い', '痛い', '怖い', '可愛い', '有名', '必要', '可能', '不便', '無理', '暇', '健康', '新鮮'].includes(sense.surface)) {
      return contextual(sense, form, '这里的く／に形用来说明变化后的状态，不应机械理解为动作的方式。', `描述人或事物在某种影响下，向“${sense.meaning}”这一状态变化。`);
    }
    if (sense.surface === '普通') return contextual(sense, form, '此处限定为一般的做事方式，不表示名词修饰。', '描述一个人按通常的方式生活或做事。');
  }
  return allowed('当前词义已审核，可使用本课的形容词接续。');
}

/** Teaching suitability for the exact reviewed sense and expression family. */
export function assessFormUsage(item, form) {
  const adjective = item?.domain === 'adjective' || ['i', 'na'].includes(item?.class);
  if (!(adjective ? supportsAdjectiveForm(item, form) : supportsVerbForm(item, form))) return blocked('morphology', '这个词类不支持本题要求的构形规则。');
  const sense = reviewedLexicalSense(item);
  if (!sense) return blocked('semantic', '这个词条、读音或释义尚未完成适用性审核。', 'unreviewed-lexeme');
  if (adjective) return assessAdjective(sense, form);
  const family = verbUsageFamily(form), word = sense.surface;
  if (family === 'classification' || family === 'basic') return allowed('分类、基础活用和条件连接适用于当前词义。');
  if (family === 'passiveDesireNegativePast' || CHAIN_FORM_SPECS[family]) return assessChain(sense, family);
  if (supplementalWords.has(word)) {
    if (family === 'passive') return contextual(sense, family, '这里明确动作对象或受到影响的人。', transitivePassiveDesireContexts[word]);
    return contextual(sense, family, '本次新增词条先提供基础活用、受身及指定组合；其他表达尚无已审核的日常语境。');
  }
  if (family === 'tearu') {
    if (word === '開く') return blocked('semantic', '本词是读作あく的自动词，表示门等自行打开；人为保留打开状态的てある用法应使用他动词「開ける」。', 'tearu-intransitive-sense');
    if (!TRANSITIVE_VERBS.has(word)) return contextual(sense, family, '当前词义尚未审核可用于人为保留结果或事先完成的日常语境。');
    if (storedResultVerbs.has(word)) return allowed('可自然表达人为完成动作后保留的结果。');
    return contextual(sense, family, '此处采用为某个目的事先完成动作的用法。', `为接下来的安排做准备，描述“${sense.meaning}”这件事的完成情况。`);
  }
  if (!actionFamilies.has(family)) return blocked('semantic', '这类表达尚未完成教学适用性审核。');
  if (word === '降る' && ['tai', 'tagaru'].includes(family)) return blocked('semantic', '当前词义的主体是雨雪，自然现象不是表达自身愿望的人；拟人用法不作为日常词条练习。', 'weather-desire-subject');
  if (word === '要る' && family === 'tehoshii') return blocked('semantic', '当前“需要”义通常借助“希望有人需要某物”等完整结构表达愿望，不把「要ってほしい」作为孤立词条的常规答案。', 'need-event-hope');
  if (word === 'できる' && ['potential', 'passive', 'causative', 'causativePassive'].includes(family)) return blocked('semantic', '当前“能够／完成”义不作为重复可能化或套用这些态形式的常规练习。');
  if (word === 'いる' && ['teiru', 'teoru'].includes(family)) return blocked('semantic', '当前存在义通常直接使用「いる」，不把存在状态机械重复为ている。');
  if (word === '要る' && ['teiru', 'teoru'].includes(family)) return blocked('semantic', '当前“需要”义直接表示状态，不把它机械重复为ている。');
  if (family === 'passive') {
    if (sense.transitivity === 'transitive') return allowed('已审核为可表达动作对象受到影响的用法。');
    return contextual(sense, family, '自动词受身需要明确受到事件影响的另一人。', indirectPassiveContexts[word]);
  }
  if (family === 'causative' && causedEventContexts[word]) return contextual(sense, family, '需要区分人的意图与由其作用引发的事件或感受。', causedEventContexts[word]);
  if (family === 'tehoshii' && eventHopeContexts[word]) return contextual(sense, family, 'てほしい可以表达对情况出现的期待，主体不必是有意行动的人。', eventHopeContexts[word]);
  if (family === 'tekureru' && benefactiveEventContexts[word]) return contextual(sense, family, '明确这件事给哪一方带来好处。', benefactiveEventContexts[word]);
  if (family === 'youtosuru' && prospectiveContexts[word]) {
    if (['negative', 'negativePast'].includes(COMPOUND_FORM_SPECS[form]?.ending)) return contextual(sense, family, '事件“即将发生”的用法不能直接扩成“拒绝发生”；这两个否定形式暂缺合适的日常语境。');
    return contextual(sense, family, '这里采用事件即将发生的用法，不是自然现象主动尝试。', prospectiveContexts[word]);
  }
  if (sense.profile === 'existence') {
    const existenceContexts = {
      potential: '家人讨论一个人能否留在约定的地点。',
      causative: '谈论组织者对参加者停留场所的安排。',
      causativePassive: '谈论他人对当事人停留场所的安排。',
      tai: '当事人谈论自己对留在某个地方的意愿。',
      tagaru: '观察一个人对于留在某个地方的意愿。',
      tehoshii: '当事人谈论希望有人在身边陪伴这件事。',
      teageru: '谈论朋友之间留在身边陪伴的帮助。',
      temorau: '谈论需要陪伴的人与朋友之间的陪伴安排。',
      tekureru: '谈论朋友的陪伴与需要陪伴的人的处境。',
      teoku: '谈论为方便联系或接待来访者而安排的停留地点。',
      temiru: '为了体验一个场所的环境，安排在那里待一段时间。',
      youtosuru: '描述一个人试图留在现场的行动。',
      teshimau: '谈论一个人停留的场所与适当场所的关系。',
      sugiru: '比较一个人停留的时长与适当范围。',
      nagara: '描述同一人在家中停留并同时做另一件事。',
      tsutsu: '描述同一人在家中停留并同时做另一件事。',
    };
    const text = existenceContexts[family] ?? (directiveFamilies.has(family) ? '家人围绕在约定地点等候、停留或陪伴提出安排。' : undefined);
    return contextual(sense, family, '此处采用人主动留下、停留或陪伴的存在义场景。', text);
  }
  if (sense.profile === 'action') {
    if (word === '飛ぶ' && !descriptiveFamilies.has(family)) return contextual(sense, family, '明确“飞”的主体是参与飞行活动的人，不套用到无意志的物体移动。', '在飞行训练中，描述飞行员驾驶飞机进行航行的情况。');
    if (word === '間に合う' && ['potential', 'temiru', 'causative', 'causativePassive', 'teageru', 'temorau', 'tekureru', 'nagara', 'tsutsu', 'sugiru'].includes(family)) return contextual(sense, family, '“赶得上”描述实现的结果，不直接当作可任意控制、持续或重复的动作。');
    if (word === '思う' && ['temiru', 'causativePassive'].includes(family)) return contextual(sense, family, '当前“想／认为”义需要具体的思想内容和特殊语境，不能与表示主动思考的「考える」混同。');
    if (word === '過ぎる' && !descriptiveFamilies.has(family)) return contextual(sense, family, '当前词义也可描述时间流逝，需明确这里的主体和经过对象，尚未审核这类孤立词条搭配。');
    if (['終わる', '着く', '遅れる', '勝つ'].includes(word) && ['nagara', 'tsutsu'].includes(family)) return contextual(sense, family, '当前词义侧重结果或到达点，不能靠逆接含义代替本课要求的同时动作；暂不出这组题。');
    if (word === '終わる' && ['teageru', 'temorau', 'tekureru'].includes(family)) return contextual(sense, family, '明确活动由使用者自己结束，以及结束与他人需要的关系。', '谈论共用设备的使用安排，以及使用者结束自己的活动与等候者需要的关系。');
    if (['causative', 'causativePassive'].includes(family)) return allowed('已审核当前词义可由另一人安排、允许或要求当事人实施。');
    if (family === 'potential') return allowed('已审核当前词义可表达当事人实现该动作的能力或条件。');
    if (['tai', 'tagaru'].includes(family)) return allowed('已审核当前词义可自然表达动作当事人的愿望。');
    if (directiveFamilies.has(family)) return allowed('已审核当前词义可用作人际指令、邀请、许可或行动安排。');
    if (['teageru', 'temorau', 'tekureru'].includes(family)) return allowed('已审核当前词义可以与帮助者、受益者的行动关系搭配。');
    if (['temiru', 'youtosuru', 'teoku'].includes(family)) return allowed('已审核当前词义可用于尝试、行动准备或事先安排。');
    if (['nagara', 'tsutsu'].includes(family)) return allowed('已审核当前词义可与同一主体的另一动作同时进行。');
    return allowed('已审核当前词义可用于描述动作、状态、变化或程度。');
  }
  if (descriptiveFamilies.has(family)) return allowed('这类表达可描述非意志变化、结果状态及其发展，不要求主动控制。');
  if (family === 'tehoshii') return allowed('可表达对他人的动作或情况出现的期待。');
  if (sense.profile === 'experience') {
    if (['tai', 'tagaru'].includes(family) && personallyDesiredExperiences.has(word)) return allowed('可以希望自己经历这种认知或感受，不等于能直接控制它。');
    if (directiveFamilies.has(family) && experienceRequests.has(word)) return contextual(sense, family, '把该词用于人际沟通中的劝告、请求或努力目标。', `交流双方围绕“${sense.meaning}”提出请求、劝告或行动目标。`);
    if (['nagara', 'tsutsu'].includes(family)) return contextual(sense, family, '明确同一个人的感受与另一动作并存。', simultaneousExperienceContexts[word]);
    if (family === 'sugiru') return allowed('可描述认知、感受或记忆变化超过合适的程度。');
  }
  if (sense.profile === 'death' && ['tai', 'tagaru'].includes(family)) return allowed('该词可以构成人的愿望表达。');
  if (family === 'sugiru' && words('降る 増える 落ちる 咲く 死ぬ できる').has(word)) return contextual(sense, family, '明确数量、次数或程度的比较标准。', `在描述“${sense.meaning}”时，比较其数量、次数或程度与适当范围。`);
  return contextual(sense, family, '当前词义需要特殊的主体、语义解释或场景，尚无适合常规练习的已审核语境。');
}

export function eligibleVerbForm(verb, form) {
  const usage = assessFormUsage(verb, form);
  return usage.status === 'allowed' || (usage.status === 'context-required' && Boolean(usage.context));
}
