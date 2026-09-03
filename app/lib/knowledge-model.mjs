import {
  acceptedConjugations,
  classLabel,
  conjugate,
  explainClass,
  explainConjugation,
} from "./conjugation.mjs";

export const KC_FAMILY_LABELS = {
  classification: "词类判断",
  stem: "词干变化",
  onbin: "音便",
  connection: "接续形式",
  compound: "复合变化",
  exception: "例外",
};

const I_ROW_KANA = new Set([..."いきぎしじちぢにひびぴみり"]);
const E_ROW_KANA = new Set([..."えけげせぜてでねへべぺめれ"]);
const I_ENDINGS = { う: "い", く: "き", ぐ: "ぎ", す: "し", つ: "ち", ぬ: "に", ぶ: "び", む: "み", る: "り" };

const TE_APPEND_FORMS = new Set([
  "teageru", "temorau", "tekureru", "tekudasai", "teiru", "teru",
  "tearu", "teoru", "tehoshii", "temo", "tewa", "temoIi", "temiru",
  "teiku", "teku", "tekuru",
]);
const MASU_APPEND_FORMS = new Set(["tai", "nagara", "tsutsu", "sugiru", "tagaru"]);
const NEGATIVE_CONNECTIVE_FORMS = new Set(["nakute", "naide", "zu", "zuni"]);
const POLITE_COMPOUNDS = new Set(["masuPast", "masuNegative", "masuNegativePast"]);
const VOICE_COMPOUNDS = {
  passivePast: ["passive", "past"],
  passiveNegative: ["passive", "negative"],
  passiveNegativePast: ["passive", "negativePast"],
  potentialPast: ["potential", "past"],
  potentialNegative: ["potential", "negative"],
  potentialNegativePast: ["potential", "negativePast"],
  causativePast: ["causative", "past"],
  causativeNegative: ["causative", "negative"],
  causativeNegativePast: ["causative", "negativePast"],
  causativePassivePast: ["causativePassive", "past"],
  causativePassiveNegative: ["causativePassive", "negative"],
  causativePassiveNegativePast: ["causativePassive", "negativePast"],
};
const BASE_FORM_FOR = {
  toru: "teoru",
  naideKudasai: "naide",
  tara: "past",
  tari: "past",
  tatte: "past",
  nakutemoIi: "nakute",
  masenka: "masu",
  youtosuru: "volitional",
  nakerebaNaranai: "negative",
  nakutewaIkenai: "negative",
  naitoIkenai: "negative",
};

const STATIC_METADATA = {
  "class.godan": ["五段动词", "classification"],
  "class.ichidan": ["一段动词", "classification"],
  "class.irregular": ["不规则动词", "classification"],
  "heuristic.ru-ie": ["い／え段＋る的初步判断", "classification"],
  "heuristic.ru-other": ["非い／え段＋る的初步判断", "classification"],
  "exception.ru-godan": ["い／え段＋る的五段例外", "exception"],
  "stem.ichidan.drop-ru": ["一段动词去掉る", "stem"],
  "stem.godan.a": ["五段词尾移到a段", "stem"],
  "stem.godan.i": ["五段词尾移到i段", "stem"],
  "stem.godan.e": ["五段词尾移到e段", "stem"],
  "stem.godan.o": ["五段词尾移到o段", "stem"],
  "stem.godan.u-wa": ["词尾う在a段变为わ", "exception"],
  "stem.godan.shi-connective": ["词尾す变为し", "stem"],
  "onbin.sokuon": ["促音便（う・つ・る）", "onbin"],
  "onbin.hatsuon": ["撥音便（ぬ・ぶ・む）", "onbin"],
  "onbin.i": ["イ音便（く・ぐ）", "onbin"],
  "onbin.voicing": ["音便后的浊化（だ／で）", "onbin"],
  "exception.iku-onbin": ["行く的促音便例外", "exception"],
  "compound.negative-past": ["否定形→否定过去", "compound"],
  "compound.polite-past": ["ます→ました", "compound"],
  "compound.polite-negative": ["ます→ません", "compound"],
  "compound.polite-negative-past": ["ます→ませんでした", "compound"],
  "compound.voice-stack": ["态后继续叠加活用", "compound"],
  "compound.multi-step": ["多步活用组合", "compound"],
};

const SUFFIX_LABELS = {
  negative: "否定接续「ない」", past: "过去接续「た／だ」", te: "て形接续「て／で」",
  masu: "礼貌接续「ます」", passive: "受身形接续", potential: "可能形接续",
  imperative: "命令形接续", volitional: "意向形接续", ba: "ば形接续",
  nasai: "なさい命令接续", prohibitive: "禁止形「辞书形＋な」",
  causative: "使役形接续", causativePassive: "使役受身形接续",
};

function unique(values) {
  return [...new Set(values)];
}

function ruRow(reading) {
  if (!reading.endsWith("る")) return null;
  const kana = [...reading].at(-2);
  if (I_ROW_KANA.has(kana)) return "ie";
  if (E_ROW_KANA.has(kana)) return "ie";
  return "other";
}

export function isRuGodanException(verb) {
  return verb.class === "godan" && verb.surface.endsWith("る") && ruRow(verb.reading) === "ie";
}

function lexicalSurface(verb) {
  return verb.lexicalSurface ?? verb.surface;
}

function irregularKind(verb) {
  return verb.surface.endsWith("する") ? "suru" : "kuru";
}

export function classificationKcIds(verb) {
  if (verb.class === "irregular") {
    const kind = irregularKind(verb);
    return ["class.irregular", `facet.class.irregular.${kind}`];
  }
  if (verb.class === "ichidan") return ["class.ichidan", "heuristic.ru-ie"];
  const result = ["class.godan"];
  if (!verb.surface.endsWith("る")) return result;
  if (isRuGodanException(verb)) {
    result.push("heuristic.ru-ie", "exception.ru-godan", `lexeme.ru-godan.${lexicalSurface(verb)}`);
  } else {
    result.push("heuristic.ru-other");
  }
  return result;
}

function primitiveKcIds(verb, form) {
  const result = [`suffix.${form}`];
  if (verb.class === "irregular") return [...result, `exception.${irregularKind(verb)}.${form}`];
  if (verb.class === "ichidan") return ["stem.ichidan.drop-ru", ...result];

  const ending = verb.surface.at(-1);
  if (["negative", "passive", "causative", "causativePassive"].includes(form)) {
    result.unshift("stem.godan.a");
    if (ending === "う") result.push("stem.godan.u-wa");
  } else if (["masu", "nasai"].includes(form)) result.unshift("stem.godan.i");
  else if (form === "volitional") result.unshift("stem.godan.o");
  else if (["potential", "imperative", "ba"].includes(form)) result.unshift("stem.godan.e");
  else if (["past", "te"].includes(form)) {
    if (verb.surface === "行く" || verb.reading === "いく") result.unshift("exception.iku-onbin");
    else if (["う", "つ", "る"].includes(ending)) result.unshift("onbin.sokuon");
    else if (["む", "ぶ", "ぬ"].includes(ending)) result.unshift("onbin.hatsuon", "onbin.voicing");
    else if (["く", "ぐ"].includes(ending)) {
      result.unshift("onbin.i");
      if (ending === "ぐ") result.push("onbin.voicing");
    } else result.unshift("stem.godan.shi-connective");
  }
  return result;
}

function formKcIds(verb, form) {
  if (form === "passiveDesireNegativePast") {
    return [...formKcIds(verb, "passive"), "stem.ichidan.drop-ru", "construction.tai", "compound.negative-past", "compound.multi-step"];
  }
  if (VOICE_COMPOUNDS[form]) {
    const [voice, ending] = VOICE_COMPOUNDS[form];
    const endingIds = ending === "past"
      ? ["stem.ichidan.drop-ru", "suffix.past"]
      : ending === "negative"
        ? ["stem.ichidan.drop-ru", "suffix.negative"]
        : ["stem.ichidan.drop-ru", "suffix.negative", "compound.negative-past"];
    return [...formKcIds(verb, voice), ...endingIds, "compound.voice-stack"];
  }
  if (form === "negativePast") return [...formKcIds(verb, "negative"), "compound.negative-past"];
  if (POLITE_COMPOUNDS.has(form)) return [...formKcIds(verb, "masu"), `compound.polite-${form === "masuPast" ? "past" : form === "masuNegative" ? "negative" : "negative-past"}`];
  if (["teshimau", "chau", "teoku", "toku"].includes(form)) {
    const full = form === "chau" ? "teshimau" : form === "toku" ? "teoku" : null;
    return [...formKcIds(verb, "te"), ...(full ? [`construction.${full}`] : []), `construction.${form}`];
  }
  if (TE_APPEND_FORMS.has(form)) return [...formKcIds(verb, "te"), `construction.${form}`];
  if (MASU_APPEND_FORMS.has(form)) return [...formKcIds(verb, "masu"), `construction.${form}`];
  if (NEGATIVE_CONNECTIVE_FORMS.has(form)) return [...formKcIds(verb, "negative"), `construction.${form}`];
  if (BASE_FORM_FOR[form]) return [...formKcIds(verb, BASE_FORM_FOR[form]), `construction.${form}`];
  if (form === "prohibitive") return ["suffix.prohibitive"];
  return primitiveKcIds(verb, form);
}

export function requiredKcIds(verb, form) {
  return unique([...classificationKcIds(verb), ...(form ? formKcIds(verb, form) : [])]);
}

function metadataFor(id, formLabels) {
  const fixed = STATIC_METADATA[id];
  if (fixed) return { label: fixed[0], family: fixed[1], gating: true };
  if (id.startsWith("lexeme.ru-godan.")) return { label: `${id.slice("lexeme.ru-godan.".length)}是五段动词`, family: "exception", gating: false };
  if (id === "facet.class.irregular.suru") return { label: "する类题目覆盖", family: "classification", gating: false };
  if (id === "facet.class.irregular.kuru") return { label: "来る题目覆盖", family: "classification", gating: false };
  if (id.startsWith("suffix.")) {
    const form = id.slice("suffix.".length);
    return { label: SUFFIX_LABELS[form] ?? `${formLabels[form] ?? form}的基本接续`, family: "connection", gating: true };
  }
  if (id.startsWith("construction.")) {
    const form = id.slice("construction.".length);
    return { label: `${formLabels[form] ?? form}的接续`, family: form === "chau" || form === "toku" || form === "teru" || form === "toru" || form === "teku" ? "compound" : "connection", gating: true };
  }
  if (id.startsWith("exception.suru.")) return { label: `する的${formLabels[id.slice(15)] ?? id.slice(15)}变化`, family: "exception", gating: true };
  if (id.startsWith("exception.kuru.")) return { label: `来る的${formLabels[id.slice(15)] ?? id.slice(15)}变化`, family: "exception", gating: true };
  return { label: id, family: "connection", gating: true };
}

function prerequisitesFor(id) {
  if (id === "heuristic.ru-ie") return ["class.godan", "class.ichidan"];
  if (id === "heuristic.ru-other") return ["class.godan"];
  if (id === "exception.ru-godan") return ["heuristic.ru-ie"];
  if (id.startsWith("lexeme.ru-godan.")) return ["exception.ru-godan"];
  if (id.startsWith("facet.class.irregular.")) return ["class.irregular"];
  if (id.startsWith("exception.suru.") || id.startsWith("exception.kuru.")) return ["class.irregular"];
  if (id === "stem.ichidan.drop-ru") return ["class.ichidan"];
  if (id.startsWith("stem.godan.") || id.startsWith("onbin.") || id === "exception.iku-onbin") return ["class.godan"];
  if (["construction.chau", "construction.toku", "construction.teru", "construction.toru", "construction.teku"].includes(id)) {
    const base = { "construction.chau": "construction.teshimau", "construction.toku": "construction.teoku", "construction.teru": "construction.teiru", "construction.toru": "construction.teoru", "construction.teku": "construction.teiku" }[id];
    return [base];
  }
  if (id.startsWith("compound.polite-")) return ["suffix.masu"];
  if (id === "compound.negative-past") return ["suffix.negative"];
  return [];
}

export function buildKnowledgeModel(courses, verbs, { eligibleFor = (...args) => args.length >= 0, formLabels = {} } = {}) {
  const componentMap = new Map();
  const exercises = [];
  const courseKcMap = new Map(courses.map((course) => [course.id, new Set()]));

  courses.forEach((course, courseIndex) => {
    const forms = course.id === "classify" ? [null] : course.forms;
    for (const form of forms) {
      for (const verb of verbs) {
        if (!eligibleFor(verb, form)) continue;
        const kcIds = requiredKcIds(verb, form);
        const id = `${course.id}:${form ?? "classify"}:${verb.surface}`;
        exercises.push({ id, courseId: course.id, courseIndex, form, verb, kcIds });
        for (const kcId of kcIds) {
          courseKcMap.get(course.id).add(kcId);
          if (!componentMap.has(kcId)) {
            const metadata = metadataFor(kcId, formLabels);
            componentMap.set(kcId, {
              id: kcId,
              order: componentMap.size,
              firstCourseId: course.id,
              firstCourseIndex: courseIndex,
              firstLesson: course.lesson,
              prerequisites: prerequisitesFor(kcId),
              coverageKcIds: kcId === "class.irregular" ? ["facet.class.irregular.suru", "facet.class.irregular.kuru"] : [],
              ...metadata,
            });
          }
        }
      }
    }
  });

  const components = [...componentMap.values()];
  for (const component of components) {
    for (const prerequisite of component.prerequisites) {
      if (!componentMap.has(prerequisite)) throw new Error(`Unknown prerequisite ${prerequisite} for ${component.id}`);
    }
    for (const facet of component.coverageKcIds) {
      if (!componentMap.has(facet)) throw new Error(`Unknown coverage facet ${facet} for ${component.id}`);
    }
    if (component.gating && !exercises.some((exercise) => exercise.courseIndex === component.firstCourseIndex && exercise.kcIds.includes(component.id))) {
      throw new Error(`No introductory exercise for ${component.id}`);
    }
  }

  return {
    components,
    exercises,
    courseKcIds: Object.fromEntries([...courseKcMap].map(([id, values]) => [id, [...values]])),
  };
}

function primaryClassKc(verb) {
  if (isRuGodanException(verb)) return `lexeme.ru-godan.${lexicalSurface(verb)}`;
  if (verb.class === "irregular") return `facet.class.irregular.${irregularKind(verb)}`;
  return `class.${verb.class}`;
}

function soundBaseForm(form) {
  if (form === "past" || form === "te") return form;
  if (["teshimau", "chau", "teoku", "toku"].includes(form) || TE_APPEND_FORMS.has(form) || form === "toru") return "te";
  const base = BASE_FORM_FOR[form];
  return base ? soundBaseForm(base) : null;
}

function diagnosticCandidates(verb, form) {
  if (!form) return [];
  const canonical = conjugate(verb.surface, verb.class, form);
  const result = [];
  for (const alternativeClass of ["godan", "ichidan", "irregular"]) {
    if (alternativeClass === verb.class) continue;
    try {
      const alternative = conjugate(verb.surface, alternativeClass, form);
      if (alternative !== canonical) result.push({ answer: alternative, kcId: primaryClassKc(verb), message: `目标形式已识别，但这里套用了${classLabel(alternativeClass)}的变化；${lexicalSurface(verb)}应按${classLabel(verb.class)}处理。` });
    } catch { /* Not every word can be conjugated under every class. */ }
  }

  const ids = requiredKcIds(verb, form);
  const onbinId = ids.find((id) => id.startsWith("onbin.") && id !== "onbin.voicing") ?? (ids.includes("exception.iku-onbin") ? "exception.iku-onbin" : null);
  const baseForm = soundBaseForm(form);
  if (verb.class === "godan" && baseForm && onbinId) {
    const ending = verb.surface.at(-1);
    const canonicalBase = conjugate(verb.surface, verb.class, baseForm);
    const rawBase = `${verb.surface.slice(0, -1)}${I_ENDINGS[ending] ?? ending}${baseForm === "past" ? "た" : "て"}`;
    const raw = canonical.includes(canonicalBase) ? canonical.replace(canonicalBase, rawBase) : null;
    if (raw) result.push({ answer: raw, kcId: onbinId, message: `你保留了${baseForm === "past" ? "过去" : "て形"}接续，但没有应用${metadataFor(onbinId, {}).label}。` });
  }
  if (ids.includes("onbin.voicing")) {
    const unvoiced = canonical.replace("んだ", "んた").replace("んで", "んて").replace("いだ", "いた").replace("いで", "いて");
    if (unvoiced !== canonical) result.push({ answer: unvoiced, kcId: "onbin.voicing", message: "音便主体已经正确，但后面的「た／て」还需要浊化为「だ／で」。" });
  }

  const detail = explainConjugation(verb.surface, verb.class, form);
  const lastConstruction = [...ids].reverse().find((id) => id.startsWith("construction.") || id.startsWith("compound."));
  if (lastConstruction) {
    const intermediate = detail.steps?.at(-2) ?? (detail.parts?.length > 1 ? detail.parts[0] : null);
    if (intermediate && intermediate !== canonical) result.push({ answer: intermediate, kcId: lastConstruction, message: `前面的变化已经形成，但还没有完成${metadataFor(lastConstruction, {}).label}。` });
  }
  return result;
}

export function deriveExercise(verb, form) {
  if (!form) {
    return {
      answer: classLabel(verb.class),
      acceptedVariants: [classLabel(verb.class)],
      requiredKcIds: requiredKcIds(verb, null),
      operations: classificationKcIds(verb).map((kcId) => ({ kcIds: [kcId], input: verb.surface, output: classLabel(verb.class), explanation: explainClass(verb), diagnosticAlternatives: [] })),
      detail: { answer: classLabel(verb.class), parts: [classLabel(verb.class)], rule: explainClass(verb) },
    };
  }
  const detail = explainConjugation(verb.surface, verb.class, form);
  const required = requiredKcIds(verb, form);
  const diagnostics = diagnosticCandidates(verb, form);
  return {
    answer: detail.answer,
    acceptedVariants: acceptedConjugations(verb.surface, verb.class, form),
    requiredKcIds: required,
    operations: required.map((kcId) => ({ kcIds: [kcId], input: verb.surface, output: detail.answer, explanation: metadataFor(kcId, {}).label, diagnosticAlternatives: diagnostics.filter((candidate) => candidate.kcId === kcId) })),
    detail,
  };
}

export function diagnoseConjugation(verb, form, answer, normalize = (value) => value) {
  if (!form) return null;
  const matches = diagnosticCandidates(verb, form).filter((candidate) => normalize(candidate.answer) === normalize(answer));
  const uniqueKcs = unique(matches.map((match) => match.kcId));
  return uniqueKcs.length === 1 ? matches[0] : null;
}
