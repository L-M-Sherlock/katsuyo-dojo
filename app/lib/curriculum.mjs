export const CHINESE_YOKUBI_URL = "https://l-m-sherlock.github.io/yokubi-zh-cn";

const lessonUrl = (section, lesson) => `${CHINESE_YOKUBI_URL}/${section}/Lesson${lesson}.html`;
const voiceForms = ["passivePast", "passiveNegative", "passiveNegativePast", "potentialPast", "potentialNegative", "potentialNegativePast", "causativePast", "causativeNegative", "causativeNegativePast", "causativePassivePast", "causativePassiveNegative", "causativePassiveNegativePast", "passiveDesireNegativePast"];

// Course order is also the adaptive unlock order. Keep the core conjugation
// route contiguous so it can be practised independently from later patterns.
export const COURSES = [
  { id: "classify", title: "动词分类", lesson: "04", url: lessonUrl("Section1/Part1", 4), forms: [] },
  { id: "negative", title: "否定形", lesson: "07", url: lessonUrl("Section1/Part1", 7), forms: ["negative"] },
  { id: "past", title: "过去形", lesson: "09", url: lessonUrl("Section1/Part1", 9), forms: ["past"] },
  { id: "te", title: "て形", lesson: "10", url: lessonUrl("Section1/Part1", 10), forms: ["te"] },
  { id: "masu", title: "ます形", lesson: "17", url: lessonUrl("Section1/Part1", 17), forms: ["masu"] },
  { id: "basicCompound", title: "基础复合活用", lesson: "复习", url: lessonUrl("Section1/Part1", 17), forms: ["negativePast", "masuPast", "masuNegative", "masuNegativePast"] },
  { id: "imperative", title: "命令形", lesson: "12", url: lessonUrl("Section1/Part1", 12), forms: ["imperative"] },
  { id: "passive", title: "受身形", lesson: "24", url: lessonUrl("Section1/Part2", 24), forms: ["passive"] },
  { id: "potential", title: "可能形", lesson: "25", url: lessonUrl("Section1/Part2", 25), forms: ["potential"] },
  { id: "volitional", title: "意向形", lesson: "26", url: lessonUrl("Section1/Part2", 26), forms: ["volitional"] },
  { id: "ba", title: "ば形", lesson: "27", url: lessonUrl("Section1/Part2", 27), forms: ["ba"] },
  { id: "causative", title: "使役形", lesson: "53", url: lessonUrl("Section2/Part4", 53), forms: ["causative"] },
  { id: "causativePassive", title: "使役受身形", lesson: "53", url: lessonUrl("Section2/Part4", 53), forms: ["causativePassive"] },
  { id: "voiceCompound", title: "态的复合活用", lesson: "复习", url: lessonUrl("Section2/Part4", 53), forms: voiceForms },

  // Derived forms remain available after the core boundary.
  { id: "tara", title: "たら形", lesson: "27", url: lessonUrl("Section1/Part2", 27), forms: ["tara"] },
  { id: "nasai", title: "なさい命令", lesson: "32", url: lessonUrl("Section2/Part3", 32), forms: ["nasai"] },
  { id: "prohibitive", title: "禁止形（〜な）", lesson: "32", url: lessonUrl("Section2/Part3", 32), forms: ["prohibitive"] },
  { id: "nakuteNaide", title: "なくて・ないで", lesson: "56", url: lessonUrl("Section2/Part4", 56), forms: ["nakute", "naide"] },
  { id: "zuZuni", title: "ず・ずに", lesson: "56", url: lessonUrl("Section2/Part4", 56), forms: ["zu", "zuni"] },

  // Yokubi constructions come last: useful Japanese, but not core conjugation.
  { id: "giving", title: "て形授受补助", lesson: "11", url: lessonUrl("Section1/Part1", 11), forms: ["teageru", "temorau", "tekureru"] },
  { id: "request", title: "てください・ないでください", lesson: "12", url: lessonUrl("Section1/Part1", 12), forms: ["tekudasai", "naideKudasai"] },
  { id: "aspect", title: "ている・てある", lesson: "22", url: lessonUrl("Section1/Part2", 22), forms: ["teiru", "teru", "tearu", "teoru", "toru"] },
  { id: "desire", title: "たい・てほしい", lesson: "26", url: lessonUrl("Section1/Part2", 26), forms: ["tai", "tehoshii"] },
  { id: "temo", title: "ても・でも", lesson: "37", url: lessonUrl("Section2/Part3", 37), forms: ["temo"] },
  { id: "concurrent", title: "ながら・つつ", lesson: "38", url: lessonUrl("Section2/Part3", 38), forms: ["nagara", "tsutsu"] },
  { id: "obligation", title: "必须表达", lesson: "44", url: lessonUrl("Section2/Part3", 44), forms: ["nakerebaNaranai", "nakutewaIkenai", "naitoIkenai"] },
  { id: "listing", title: "たり・ては", lesson: "45", url: lessonUrl("Section2/Part4", 45), forms: ["tari", "tewa"] },
  { id: "permission", title: "许可・ませんか", lesson: "48", url: lessonUrl("Section2/Part4", 48), forms: ["temoIi", "nakutemoIi", "masenka"] },
  { id: "youtosuru", title: "ようとする", lesson: "49", url: lessonUrl("Section2/Part4", 49), forms: ["youtosuru"] },
  { id: "temiru", title: "てみる", lesson: "50", url: lessonUrl("Section2/Part4", 50), forms: ["temiru"] },
  { id: "teshimauChau", title: "てしまう・ちゃう", lesson: "57", url: lessonUrl("Section2/Part4", 57), forms: ["teshimau", "chau"] },
  { id: "teokuToku", title: "ておく・とく", lesson: "57", url: lessonUrl("Section2/Part4", 57), forms: ["teoku", "toku"] },
  { id: "direction", title: "ていく・てくる", lesson: "58", url: lessonUrl("Section2/Part4", 58), forms: ["teiku", "teku", "tekuru"] },
  { id: "tatte", title: "たって", lesson: "59", url: lessonUrl("Section2/Part4", 59), forms: ["tatte"] },
  { id: "sugiru", title: "すぎる", lesson: "61", url: lessonUrl("Section2/Part4", 61), forms: ["sugiru"] },
  { id: "tagaru", title: "たがる", lesson: "63", url: lessonUrl("Section2/Part4", 63), forms: ["tagaru"] },
];

export const CORE_END_COURSE_ID = "voiceCompound";
export const CORE_COURSE_COUNT = COURSES.findIndex((course) => course.id === CORE_END_COURSE_ID) + 1;
export const CORE_COURSE_IDS = COURSES.slice(0, CORE_COURSE_COUNT).map((course) => course.id);

export function coursesForScope(scope) {
  if (scope === "full") return COURSES;
  if (scope === "core") return COURSES.slice(0, CORE_COURSE_COUNT);
  throw new Error(`Unknown curriculum scope: ${scope}`);
}

export function componentsForScope(components, scope) {
  if (scope === "full") return components;
  const coreIds = new Set(CORE_COURSE_IDS);
  return components.filter((component) => coreIds.has(component.firstCourseId));
}

export function knowledgeModelForScope(model, scope) {
  if (scope === "full") return model;
  const courses = coursesForScope(scope);
  const courseIds = new Set(courses.map((course) => course.id));
  const components = componentsForScope(model.components, scope);
  const componentIds = new Set(components.map((component) => component.id));
  return {
    components,
    exercises: model.exercises.filter((exercise) => courseIds.has(exercise.courseId) && exercise.kcIds.every((id) => componentIds.has(id))),
    courseKcIds: Object.fromEntries(courses.map((course) => [course.id, (model.courseKcIds[course.id] ?? []).filter((id) => componentIds.has(id))])),
  };
}
