import { CHAIN_FORM_SPECS } from './multi-step-forms.mjs';
import { COURSES as VERB_COURSES, ADJECTIVE_COURSES } from './curriculum.mjs';
import { COMPOUND_FORM_SPECS } from './compound-forms.mjs';

export const CURRICULUM_VERSION = 5;

// Group by the course's primary learning objective, including courses whose
// later exercises apply past/negative endings to the newly introduced form.
// These are teaching stages, not difficulty levels or additional unlock gates.
export const COURSE_STAGES = [
  {
    id: 'basics', label: '基础变化',
    objective: '识别词类，掌握肯否、时态、礼貌、修饰和连接所需的基本词形。',
    courseIds: ['classify', 'adjectiveClassify', 'masu', 'adjectiveIBase', 'adjectiveNaBase', 'adjectiveAdverb', 'negative', 'past', 'basicCompound', 'te', 'adjectiveITe'],
  },
  {
    id: 'voice', label: '可能与态',
    objective: '掌握可能、受身、使役和使役受身的构形，再练习这些形式的否定、过去和否定过去。',
    courseIds: ['potential', 'passive', 'causative', 'causativePassive', 'voiceCompound'],
  },
  {
    id: 'linking', label: '连接与条件',
    objective: '用已学词形连接动作和描述，表达条件、让步、并行与列举。',
    courseIds: ['nakuteNaide', 'zuZuni', 'ba', 'adjectiveConditional', 'tara', 'temo', 'tatte', 'concurrent', 'listing'],
  },
  {
    id: 'intentions', label: '意愿与要求',
    objective: '表达愿望、意向、请求、命令、禁止、许可、邀请与义务。',
    courseIds: ['desire', 'tagaru', 'volitional', 'youtosuru', 'request', 'imperative', 'nasai', 'prohibitive', 'permission', 'obligation'],
  },
  {
    id: 'actions', label: '动作与状态',
    objective: '描述动作的进行、结果、尝试、准备、方向、程度及授受关系。',
    courseIds: ['aspect', 'giving', 'temiru', 'teshimauChau', 'teokuToku', 'direction', 'sugiru'],
  },
  {
    id: 'integration', label: '综合运用',
    objective: '综合组合已学的态、愿望、尝试、状态和授受表达。',
    courseIds: ['multiStepCompound'],
  },
];
export const STAGES = COURSE_STAGES.map(stage => stage.label);
// Recommended order is independent of group membership. Introduce reusable
// rules before their applications; use thematic proximity only to break ties.
// Keeping a theme contiguous here does not make it a prerequisite for others.
export const COURSE_ORDER = [
  'classify', 'adjectiveClassify', 'masu', 'adjectiveIBase', 'adjectiveNaBase', 'adjectiveAdverb', 'negative', 'past', 'basicCompound', 'te', 'adjectiveITe',
  'potential', 'passive', 'causative', 'causativePassive', 'voiceCompound',
  'nakuteNaide', 'zuZuni', 'ba', 'adjectiveConditional', 'tara', 'temo', 'tatte', 'concurrent', 'listing',
  'desire', 'tagaru', 'volitional', 'youtosuru', 'request', 'imperative', 'nasai', 'prohibitive', 'permission', 'obligation',
  'aspect', 'giving', 'temiru', 'teshimauChau', 'teokuToku', 'direction', 'sugiru',
  'multiStepCompound',
];
export const VOICE_BASE_FORMS = ['potential', 'passive', 'causative', 'causativePassive'];
export const VOICE_CONTINUATION_FORMS = [...VERB_COURSES.find(course => course.id === 'voiceCompound').forms];
const originals = [...VERB_COURSES, ...ADJECTIVE_COURSES];
export const SOURCE_COURSES = originals;
const stageByCourse = new Map(COURSE_STAGES.flatMap((definition, stage) =>
  definition.courseIds.map(id => [id, { ...definition, stage }])));
// Course-specific scope; stage objectives describe the broader teaching phase.
const COURSE_DESCRIPTIONS = {
  classify: '识别五段、一段和不规则动词，练习词尾判断及常见例外。',
  adjectiveClassify: '区分い形容词和な形容词，识别以い结尾的な形容词。',
  masu: '练习动词连用词干和ます形，包括する、来る的不规则变化。',
  adjectiveIBase: '练习い形容词的否定、过去和否定过去，包括いい的よ系变化。',
  adjectiveNaBase: '练习な形容词的连体、终止、否定、过去、否定过去和で连接形式。',
  adjectiveAdverb: '练习い形容词的く形和な形容词的に形，用来修饰动作。',
  negative: '练习动词的ない形，包括词干变化和不规则接续。',
  past: '练习动词的た／だ过去形，包括音便及行く的例外。',
  basicCompound: '组合动词否定与过去，以及ます形的过去、否定和否定过去。',
  te: '练习动词的て／で连接形式及对应音便。',
  adjectiveITe: '练习い形容词的くて连接形式，包括いい的よ系变化。',
  potential: '练习动词可能形的基本构形，后续否定与过去在「可能与态的后续活用」中学习。',
  passive: '练习动词受身形的基本构形，后续否定与过去在「可能与态的后续活用」中学习。',
  causative: '练习动词使役形的基本构形，后续否定与过去在「可能与态的后续活用」中学习。',
  causativePassive: '练习使役受身形及其缩约形式，后续否定与过去另课学习。',
  voiceCompound: '把可能、受身、使役和使役受身形式继续变为否定、过去或否定过去。',
  nakuteNaide: '练习动词否定形后接なくて或ないで的连接形式。',
  zuZuni: '练习动词的ず和ずに形式，包括する变为せず的例外。',
  ba: '练习动词ば条件形；形容词条件形在对应形容词课程中学习。',
  adjectiveConditional: '练习い形容词的ければ形式和な形容词的なら形式。',
  tara: '练习动词过去形后接ら，表达条件或动作完成后的情况。',
  temo: '练习动词的ても／でも形式，表达让步条件。',
  tatte: '练习动词的たって／だって形式，表达口语中的让步条件。',
  concurrent: '练习动词连用词干后接ながら和つつ，表达同时进行的动作。',
  listing: '练习动词的たり和ては形式，用于列举或描述反复出现的情况。',
  desire: '先练习たい和てほしい的接续，再练习它们的否定、过去和否定过去。',
  tagaru: '先练习たがる的接续，再把结果按五段动词变为否定、过去和否定过去。',
  volitional: '练习动词意向形，表达自己的意愿或一起行动的建议。',
  youtosuru: '练习意向形接ようとする，以及整个表达的否定、过去和否定过去。',
  request: '练习てください和ないでください，表达肯定与否定请求。',
  imperative: '练习动词命令形，包括不规则变化。',
  nasai: '练习动词连用词干后接なさい的命令表达。',
  prohibitive: '练习动词辞书形后接な的禁止表达。',
  permission: '练习てもいい表达许可、なくてもいい表达无需，以及ませんか表达邀请。',
  obligation: '练习なければならない、なくてはいけない和ないといけない三种必须表达。',
  aspect: '练习ている、てある、ておる及缩约，并学习它们的否定、过去和否定过去。',
  giving: '练习てあげる、てもらう、てくれる的接续及其否定、过去和否定过去。',
  temiru: '先练习てみる表示尝试，再练习整个表达的否定、过去和否定过去。',
  teshimauChau: '练习てしまう及ちゃう／じゃう缩约，并学习てしまう的否定、过去和否定过去。',
  teokuToku: '练习ておく及とく／どく缩约，并学习ておく的否定、过去和否定过去。',
  direction: '练习ていく、てくる及てく缩约，并学习ていく和てくる的否定、过去和否定过去。',
  sugiru: '练习动词接すぎる表示过度，以及整个表达的否定、过去和否定过去。',
  multiStepCompound: '组合受身与愿望、尝试与愿望、受身与状态、使役与接受允许，并继续完成过去等变化。',
};
export const UNIFIED_COURSES = COURSE_ORDER.map((id, index) => {
  const original = originals.find((course) => course.id === id);
  const { stage, id: stageId, label: stageLabel, objective: stageObjective } = stageByCourse.get(id);
  const forms = id === 'multiStepCompound' ? ['passiveDesireNegativePast', ...Object.keys(CHAIN_FORM_SPECS)] : [...original.forms];
  for (const [form, spec] of Object.entries(COMPOUND_FORM_SPECS)) {
    if (original.forms.includes(spec.form) && id !== 'multiStepCompound') forms.push(form);
  }
  return { ...original, description: COURSE_DESCRIPTIONS[id],
    forms: [...new Set(forms)], stage, stageId, stageLabel, stageObjective,
    review: false, order: index };
});
export const COURSE_BY_ID = new Map(UNIFIED_COURSES.map((course) => [course.id, course]));
export function sourceForForm(domain, form) {
  return originals.find((course) => course.domain === domain && (form ? course.forms.includes(form) : course.forms.length === 0));
}
