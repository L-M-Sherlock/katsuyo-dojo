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
export const UNIFIED_COURSES = COURSE_ORDER.map((id, index) => {
  const original = originals.find((course) => course.id === id);
  const { stage, id: stageId, label: stageLabel, objective: stageObjective } = stageByCourse.get(id);
  const forms = id === 'multiStepCompound' ? ['passiveDesireNegativePast', ...Object.keys(CHAIN_FORM_SPECS)] : [...original.forms];
  for (const [form, spec] of Object.entries(COMPOUND_FORM_SPECS)) {
    if (original.forms.includes(spec.form) && id !== 'multiStepCompound') forms.push(form);
  }
  return { ...original, title: id === 'masu' ? '连用词干与ます形' : original.title,
    forms: [...new Set(forms)], stage, stageId, stageLabel, stageObjective,
    review: false, order: index };
});
export const COURSE_BY_ID = new Map(UNIFIED_COURSES.map((course) => [course.id, course]));
export function sourceForForm(domain, form) {
  return originals.find((course) => course.domain === domain && (form ? course.forms.includes(form) : course.forms.length === 0));
}
