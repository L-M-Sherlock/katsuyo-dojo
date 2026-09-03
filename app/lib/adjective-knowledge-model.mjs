import {
  ADJECTIVE_FORM_LABELS,
  acceptedAdjectiveConjugations,
  adjectiveClassLabel,
  adjectiveDiagnosticCandidates,
  conjugateAdjective,
  explainAdjectiveClass,
  explainAdjectiveConjugation,
  isIiFamily,
} from "./adjective-conjugation.mjs";

function unique(values) {
  return [...new Set(values)];
}

function classificationKcIds(adjective) {
  if (adjective.class === "i") return ["adj.class.i"];
  const facet = adjective.surface.endsWith("い") ? "facet.adj.class.na.i-ending" : "facet.adj.class.na.regular";
  return ["adj.class.na", facet];
}

function formKcIds(adjective, form) {
  if (adjective.class === "i") {
    const ids = [];
    if (["adjectiveNegative", "adjectiveNegativePast", "adjectiveTe", "adjectiveAdverb"].includes(form)) ids.push("adj.stem.i-ku");
    const formId = {
      adjectiveNegative: "adj.suffix.i-negative",
      adjectivePast: "adj.suffix.i-past",
      adjectiveNegativePast: "adj.compound.i-negative-past",
      adjectiveTe: "adj.suffix.i-te",
      adjectiveBa: "adj.suffix.i-ba",
      adjectiveAdverb: "adj.suffix.i-adverb",
    }[form];
    if (form === "adjectiveNegativePast") ids.push("adj.suffix.i-negative");
    if (formId) ids.push(formId);
    if (isIiFamily(adjective)) ids.push("adj.exception.ii-yo");
    return ids;
  }

  const formId = {
    adjectiveAttributive: "adj.suffix.na-attributive",
    adjectivePredicative: "adj.suffix.na-predicative",
    adjectiveNaNegative: "adj.suffix.na-negative",
    adjectiveNaPast: "adj.suffix.na-past",
    adjectiveNaNegativePast: "adj.compound.na-negative-past",
    adjectiveNaTe: "adj.suffix.na-te",
    adjectiveBa: "adj.suffix.na-conditional",
    adjectiveAdverb: "adj.suffix.na-adverb",
  }[form];
  const ids = form === "adjectiveNaNegativePast" ? ["adj.suffix.na-negative"] : [];
  if (formId) ids.push(formId);
  return ids;
}

export function requiredAdjectiveKcIds(adjective, form) {
  return unique([...classificationKcIds(adjective), ...(form ? formKcIds(adjective, form) : [])]);
}

const METADATA = {
  "adj.class.i": ["い形容词", "classification"],
  "adj.class.na": ["な形容词", "classification"],
  "adj.stem.i-ku": ["い→く的词干变化", "stem"],
  "adj.suffix.i-negative": ["い形容词否定接续「くない」", "connection"],
  "adj.suffix.i-past": ["い形容词过去接续「かった」", "connection"],
  "adj.compound.i-negative-past": ["い形容词否定→否定过去", "compound"],
  "adj.suffix.i-te": ["い形容词て形接续「くて」", "connection"],
  "adj.suffix.i-ba": ["い形容词条件接续「ければ」", "connection"],
  "adj.suffix.i-adverb": ["い形容词副词接续「く」", "connection"],
  "adj.exception.ii-yo": ["「いい」一族的「よ」系变化", "exception"],
  "adj.suffix.na-attributive": ["な形容词连体接续「な」", "connection"],
  "adj.suffix.na-predicative": ["な形容词终止接续「だ」", "connection"],
  "adj.suffix.na-negative": ["な形容词否定接续「ではない」", "connection"],
  "adj.suffix.na-past": ["な形容词过去接续「だった」", "connection"],
  "adj.compound.na-negative-past": ["な形容词否定→否定过去", "compound"],
  "adj.suffix.na-te": ["な形容词连接形式「で」", "connection"],
  "adj.suffix.na-conditional": ["な形容词条件接续「なら」", "connection"],
  "adj.suffix.na-adverb": ["な形容词副词接续「に」", "connection"],
};

function metadataFor(id) {
  if (id === "facet.adj.class.na.regular") return { label: "普通な形容词题目覆盖", family: "classification", gating: false };
  if (id === "facet.adj.class.na.i-ending") return { label: "以い结尾的な形容词题目覆盖", family: "classification", gating: false };
  const metadata = METADATA[id];
  if (!metadata) throw new Error(`Unknown adjective KC: ${id}`);
  return { label: metadata[0], family: metadata[1], gating: true };
}

function prerequisitesFor(id) {
  if (id === "adj.class.na") return ["adj.class.i"];
  if (id.startsWith("facet.adj.class.na.")) return ["adj.class.na"];
  if (id === "adj.exception.ii-yo") return ["adj.class.i"];
  if (id.startsWith("adj.stem.i-") || id.startsWith("adj.suffix.i-") || id === "adj.compound.i-negative-past") return ["adj.class.i"];
  if (id.startsWith("adj.suffix.na-") || id === "adj.compound.na-negative-past") return ["adj.class.na"];
  return [];
}

function eligibleFor(adjective, form) {
  if (!form) return true;
  if (["adjectiveNegative", "adjectivePast", "adjectiveNegativePast", "adjectiveTe"].includes(form)) return adjective.class === "i";
  if (["adjectiveAttributive", "adjectivePredicative", "adjectiveNaNegative", "adjectiveNaPast", "adjectiveNaNegativePast", "adjectiveNaTe"].includes(form)) return adjective.class === "na";
  return true;
}

export function buildAdjectiveKnowledgeModel(courses, adjectives, { courseIndexOffset = 0, componentOrderOffset = 0 } = {}) {
  const componentMap = new Map();
  const exercises = [];
  const courseKcMap = new Map(courses.map((course) => [course.id, new Set()]));

  courses.forEach((course, localCourseIndex) => {
    const courseIndex = localCourseIndex + courseIndexOffset;
    const forms = course.forms.length ? course.forms : [null];
    for (const form of forms) {
      for (const adjective of adjectives) {
        if (!eligibleFor(adjective, form)) continue;
        const kcIds = requiredAdjectiveKcIds(adjective, form);
        exercises.push({ id: `${course.id}:${form ?? "classify"}:${adjective.surface}`, courseId: course.id, courseIndex, form, item: adjective, kcIds });
        for (const kcId of kcIds) {
          courseKcMap.get(course.id).add(kcId);
          if (!componentMap.has(kcId)) componentMap.set(kcId, {
            id: kcId,
            order: componentOrderOffset + componentMap.size,
            firstCourseId: course.id,
            firstCourseIndex: courseIndex,
            firstLesson: course.lesson,
            prerequisites: prerequisitesFor(kcId),
            coverageKcIds: [],
            ...metadataFor(kcId),
          });
        }
      }
    }
  });

  const components = [...componentMap.values()];
  const naClass = componentMap.get("adj.class.na");
  if (naClass) naClass.coverageKcIds.push("facet.adj.class.na.regular", "facet.adj.class.na.i-ending");
  for (const component of components) {
    for (const prerequisite of component.prerequisites) {
      if (!componentMap.has(prerequisite)) throw new Error(`Unknown prerequisite ${prerequisite} for ${component.id}`);
    }
  }
  return {
    components,
    exercises,
    courseKcIds: Object.fromEntries([...courseKcMap].map(([id, values]) => [id, [...values]])),
  };
}

export function deriveAdjectiveExercise(adjective, form) {
  if (!form) {
    const answer = adjectiveClassLabel(adjective.class);
    const kcIds = requiredAdjectiveKcIds(adjective, null);
    return {
      answer,
      acceptedVariants: [answer],
      requiredKcIds: kcIds,
      operations: kcIds.map((kcId) => ({ kcIds: [kcId], input: adjective.surface, output: answer, explanation: explainAdjectiveClass(adjective), diagnosticAlternatives: [] })),
      detail: { answer, parts: [answer], rule: explainAdjectiveClass(adjective) },
    };
  }
  const detail = explainAdjectiveConjugation(adjective, form);
  const kcIds = requiredAdjectiveKcIds(adjective, form);
  const diagnostics = adjectiveDiagnosticCandidates(adjective, form);
  return {
    answer: conjugateAdjective(adjective, form),
    acceptedVariants: acceptedAdjectiveConjugations(adjective, form),
    requiredKcIds: kcIds,
    operations: kcIds.map((kcId) => ({ kcIds: [kcId], input: adjective.surface, output: detail.answer, explanation: metadataFor(kcId).label, diagnosticAlternatives: diagnostics.filter((candidate) => candidate.kcId === kcId) })),
    detail,
  };
}

export { ADJECTIVE_FORM_LABELS };
