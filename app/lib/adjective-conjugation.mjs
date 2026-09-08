export const ADJECTIVE_FORM_LABELS = {
  adjectiveNegative: "否定形",
  adjectivePast: "过去形",
  adjectiveNegativePast: "否定过去形",
  adjectiveTe: "て形",
  adjectiveAttributive: "连体形（〜な）",
  adjectivePredicative: "终止形（〜だ）",
  adjectiveNaNegative: "否定形",
  adjectiveNaPast: "过去形",
  adjectiveNaNegativePast: "否定过去形",
  adjectiveNaTe: "て形（〜で）",
  adjectiveBa: "条件形",
  adjectiveAdverb: "副词形",
};

export function adjectiveClassLabel(adjectiveClass) {
  return adjectiveClass === "i" ? "い形容词" : "な形容词";
}

export function isIiFamily(adjective) {
  return adjective.class === "i" && adjective.iiFamily === true;
}

function iStem(word, iiFamily = false) {
  return iiFamily ? `${word.slice(0, -2)}よ` : word.slice(0, -1);
}

function conjugateI(word, form, iiFamily = false) {
  const stem = iStem(word, iiFamily);
  const suffix = {
    adjectiveNegative: "くない",
    adjectivePast: "かった",
    adjectiveNegativePast: "くなかった",
    adjectiveTe: "くて",
    adjectiveBa: "ければ",
    adjectiveAdverb: "く",
  }[form];
  if (!suffix) throw new Error(`Unsupported い-adjective form: ${form}`);
  return `${stem}${suffix}`;
}

function conjugateNa(word, form) {
  const suffix = {
    adjectiveAttributive: "な",
    adjectivePredicative: "だ",
    adjectiveNaNegative: "ではない",
    adjectiveNaPast: "だった",
    adjectiveNaNegativePast: "ではなかった",
    adjectiveNaTe: "で",
    adjectiveBa: "なら",
    adjectiveAdverb: "に",
  }[form];
  if (!suffix) throw new Error(`Unsupported な-adjective form: ${form}`);
  return `${word}${suffix}`;
}

export function conjugateAdjective(adjective, form) {
  return adjective.class === "i"
    ? conjugateI(adjective.surface, form, isIiFamily(adjective))
    : conjugateNa(adjective.surface, form);
}

export function acceptedAdjectiveConjugations(adjective, form) {
  const answers = [conjugateAdjective(adjective, form)];
  if (adjective.class === "na" && form === "adjectiveNaNegative") answers.push(`${adjective.surface}じゃない`, `${adjective.surface}でない`);
  if (adjective.class === "na" && form === "adjectiveNaNegativePast") answers.push(`${adjective.surface}じゃなかった`, `${adjective.surface}でなかった`);
  if (adjective.class === "na" && form === "adjectiveBa") answers.push(`${adjective.surface}ならば`, `${adjective.surface}であれば`);
  return [...new Set(answers)];
}

export function explainAdjectiveClass(adjective) {
  if (adjective.class === "i") {
    return isIiFamily(adjective)
      ? `${adjective.surface}属于い形容词，但活用时使用「よ」：例如「よくない」「よかった」。`
      : `${adjective.surface}以「い」结尾，并让这个词尾发生变化，因此属于い形容词。`;
  }
  return adjective.surface.endsWith("い")
    ? `${adjective.surface}虽然以「い」结尾，却不让这个「い」按い形容词变化，是常见的な形容词分类例外。`
    : `${adjective.surface}使用「な」修饰名词，并通过「だ／で／に」等形式接续，因此属于な形容词。`;
}

export function explainAdjectiveConjugation(adjective, form) {
  const answer = conjugateAdjective(adjective, form);
  if (adjective.class === "i") {
    const stem = iStem(adjective.surface, isIiFamily(adjective));
    const suffix = answer.slice(stem.length);
    const exception = isIiFamily(adjective) ? "这个词属于「いい」一族，先把「いい」变为「よ」，再" : "把词尾「い」去掉，再";
    if (form === "adjectiveNegativePast") {
      const negative = conjugateAdjective(adjective, "adjectiveNegative");
      return { answer, parts: [`${stem}く`, "なかった"], steps: [negative, answer], rule: `${exception}构成「くない」，然后让「ない」变为过去形「なかった」。` };
    }
    const action = {
      adjectiveNegative: "接「くない」构成否定形",
      adjectivePast: "接「かった」构成过去形",
      adjectiveTe: "接「くて」构成て形",
      adjectiveBa: "接「ければ」构成条件形",
      adjectiveAdverb: "接「く」构成副词形",
    }[form];
    return { answer, parts: [stem, suffix], rule: `${exception}${action}。` };
  }

  const suffix = answer.slice(adjective.surface.length);
  const action = {
    adjectiveAttributive: "接「な」修饰后面的名词",
    adjectivePredicative: "接「だ」构成普通体判断",
    adjectiveNaNegative: "接「ではない」构成否定形；也可以说「でない」，口语常用「じゃない」",
    adjectiveNaPast: "接「だった」构成过去形",
    adjectiveNaNegativePast: "先构成「ではない」，再把「ない」变为「なかった」",
    adjectiveNaTe: "接「で」连接后面的陈述",
    adjectiveBa: "接「なら」构成条件；也可以说「ならば／であれば」",
    adjectiveAdverb: "接「に」构成副词形",
  }[form];
  const detail = { answer, parts: [adjective.surface, suffix], rule: `な形容词词干保持不变，${action}。` };
  if (form === "adjectiveNaNegativePast") detail.steps = [`${adjective.surface}ではない`, answer];
  return detail;
}

const ANALOGOUS_FORM = {
  adjectiveNegative: "adjectiveNaNegative",
  adjectivePast: "adjectiveNaPast",
  adjectiveNegativePast: "adjectiveNaNegativePast",
  adjectiveTe: "adjectiveNaTe",
  adjectiveAttributive: null,
  adjectivePredicative: null,
  adjectiveNaNegative: "adjectiveNegative",
  adjectiveNaPast: "adjectivePast",
  adjectiveNaNegativePast: "adjectiveNegativePast",
  adjectiveNaTe: "adjectiveTe",
  adjectiveBa: "adjectiveBa",
  adjectiveAdverb: "adjectiveAdverb",
};

const I_SIMPLE_FORM_KCS = {
  adjectiveNegative: "adj.suffix.i-negative",
  adjectivePast: "adj.suffix.i-past",
  adjectiveTe: "adj.suffix.i-te",
  adjectiveBa: "adj.suffix.i-ba",
  adjectiveAdverb: "adj.suffix.i-adverb",
};

const NA_SIMPLE_FORM_KCS = {
  adjectiveAttributive: "adj.suffix.na-attributive",
  adjectivePredicative: "adj.suffix.na-predicative",
  adjectiveNaNegative: "adj.suffix.na-negative",
  adjectiveNaPast: "adj.suffix.na-past",
  adjectiveNaTe: "adj.suffix.na-te",
  adjectiveBa: "adj.suffix.na-conditional",
  adjectiveAdverb: "adj.suffix.na-adverb",
};

function diagnoseNaSuffixOmission(adjective, form, answer, normalize) {
  const kcId = adjective.class === "na" ? NA_SIMPLE_FORM_KCS[form] : null;
  if (!kcId) return null;
  const base = normalize(adjective.surface), actual = normalize(answer);
  if (!base || !actual.startsWith(base)) return null;
  const remaining = actual.slice(base.length);
  const suffixes = acceptedAdjectiveConjugations(adjective, form).map(target => normalize(target).slice(base.length));
  // Preserve the entire lexical base and remove one contiguous part of a
  // known suffix. Negative-past crosses several rules and is excluded above.
  for (const suffix of suffixes) {
    const chars = Array.from(suffix);
    for (let start = 0; start < chars.length; start++) {
      for (let end = start + 1; end <= chars.length; end++) {
        if (chars.slice(0, start).join("") + chars.slice(end).join("") === remaining) {
          return { kcId, confirmedKcIds: [], message: `词干已保留，但本题要求的${ADJECTIVE_FORM_LABELS[form]}接续不完整。应接「${suffixes.join("／")}」。` };
        }
      }
    }
  }
  return null;
}

const KANA_ALTERNATIONS = [
  "かが", "きぎ", "くぐ", "けげ", "こご", "さざ", "しじ", "すず", "せぜ", "そぞ",
  "ただ", "ちぢ", "つづ", "てで", "とど", "はばぱ", "ひびぴ", "ふぶぷ", "へべぺ", "ほぼぽ",
  "っつ", "ゃや", "ゅゆ", "ょよ", "ぁあ", "ぃい", "ぅう", "ぇえ", "ぉお",
];

// Mutations stay within one grammatical suffix, never a whole-word edit distance. Separate
// adjacent grammar operations (such as い→く and appending ない) are not
// merged into a larger suffix just to make a mixed error look attributable.
function suffixMutations(suffix) {
  const chars = Array.from(suffix), variants = new Set();
  for (let first = 0; first < chars.length; first++) for (let second = first + 2; second < chars.length; second++) {
    variants.add(chars.filter((_, index) => index !== first && index !== second).join(''));
  }
  for (let start = 0; start < chars.length; start++) {
    for (let end = start + 1; end <= chars.length; end++) {
      variants.add(chars.slice(0, start).join("") + chars.slice(end).join(""));
      const span = chars.slice(start, end).join("");
      variants.add(chars.slice(0, start).join("") + span + span + chars.slice(end).join(""));
    }
    for (const group of KANA_ALTERNATIONS.filter(group => group.includes(chars[start]))) {
      for (const replacement of group) {
        variants.add(chars.slice(0, start).join("") + replacement + chars.slice(start + 1).join(""));
      }
    }
    if (start + 1 < chars.length && chars[start] !== chars[start + 1]) {
      variants.add(chars.slice(0, start).join("") + chars[start + 1] + chars[start] + chars.slice(start + 2).join(""));
    }
  }
  variants.delete(suffix);
  return variants;
}

function commonAdjectiveCandidates(adjective, form) {
  const candidates = [];
  const add = (base, tail, kcId, message) => {
    if (base) candidates.push({ answer: base + tail, kcId, confirmedKcIds: [], message });
  };
  const naId = adjective.class === "na" ? NA_SIMPLE_FORM_KCS[form] : null;
  if (naId) {
    for (const target of acceptedAdjectiveConjugations(adjective, form)) {
      const suffix = target.slice(adjective.surface.length);
      for (const wrong of suffixMutations(suffix)) {
        add(adjective.surface, wrong, naId, `原词已保留；接续部分写成了「${wrong || "（空）"}」，本题的${ADJECTIVE_FORM_LABELS[form]}应使用完整的「${suffix}」接续。`);
      }
      for (const extra of ["な", "だ"]) {
        add(adjective.surface, extra + suffix, naId, `原词与本题的「${suffix}」接续之间多了「${extra}」。本题只需在原词后接上指定形式。`);
      }
    }
  }
  if (adjective.class === "i" && I_SIMPLE_FORM_KCS[form]) {
    const root = iStem(adjective.surface, isIiFamily(adjective));
    const suffix = { adjectivePast: "かった", adjectiveBa: "ければ", adjectiveNegative: "ない", adjectiveTe: "て" }[form];
    const needsKu = ["adjectiveNegative", "adjectiveTe", "adjectiveAdverb"].includes(form);
    if (suffix) {
      const base = root + (needsKu ? "く" : "");
      for (const wrong of suffixMutations(suffix)) {
        add(base, wrong, I_SIMPLE_FORM_KCS[form], `前面的形式已保留；接续部分写成了「${wrong || "（空）"}」，${ADJECTIVE_FORM_LABELS[form]}需要使用完整的「${suffix}」。`);
      }
    }
    if (needsKu) {
      const tail = form === "adjectiveNegative" ? "ない" : form === "adjectiveTe" ? "て" : "";
      for (const wrong of suffixMutations("く")) {
        add(root, wrong + tail, "adj.stem.i-ku", `原词的其余部分已保留，但「い→く」这一步没有得到正确的「く」形。${ADJECTIVE_FORM_LABELS[form]}需要先形成正确词干。`);
      }
    }
    if (["adjectivePast", "adjectiveBa"].includes(form)) {
      const tails = form === "adjectivePast" ? ["かった", "た"] : ["ければ", "ば"];
      for (const tail of tails) {
        add(root, "く" + tail, I_SIMPLE_FORM_KCS[form], `本题要求${ADJECTIVE_FORM_LABELS[form]}，应把原形末尾「い」替换为「${suffix}」，不能在「く」形后继续接「${tail}」。`);
      }
    }
  }
  return candidates;
}

const COMMON_ADJECTIVE_CACHE = new Map();
const COMMON_ADJECTIVE_CACHE_LIMIT = 256;

export function diagnoseCommonAdjectiveError(adjective, form, answer, normalize = value => value, allowedKcIds) {
  if (!form || typeof answer !== "string") return null;
  const simpleKcId = adjective.class === "i" ? I_SIMPLE_FORM_KCS[form]
    : adjective.class === "na" ? NA_SIMPLE_FORM_KCS[form] : null;
  if (!simpleKcId) return null;
  const key = JSON.stringify([adjective.domain, adjective.class, adjective.surface, isIiFamily(adjective), form]);
  let context = COMMON_ADJECTIVE_CACHE.get(key);
  if (!context) {
    context = {
      accepted: acceptedAdjectiveConjugations(adjective, form),
      legacy: adjectiveDiagnosticCandidates(adjective, form),
      candidates: commonAdjectiveCandidates(adjective, form),
    };
    COMMON_ADJECTIVE_CACHE.set(key, context);
    if (COMMON_ADJECTIVE_CACHE.size > COMMON_ADJECTIVE_CACHE_LIMIT) {
      COMMON_ADJECTIVE_CACHE.delete(COMMON_ADJECTIVE_CACHE.keys().next().value);
    }
  }
  const actual = normalize(answer);
  if (context.accepted.some(accepted => normalize(accepted) === actual)) return null;
  // A legacy match has priority even if its competing KC interpretations
  // deliberately produced no diagnosis. A generic mutation must not turn
  // that ambiguity into a single failed rule.
  if (context.legacy.some(candidate => normalize(candidate.answer) === actual)) return null;
  const matches = context.candidates.filter(candidate => normalize(candidate.answer) === actual);
  const ids = new Set(matches.map(candidate => candidate.kcId));
  if (ids.size !== 1 || (allowedKcIds && !allowedKcIds.includes(matches[0].kcId))) return null;
  const { kcId, message } = matches[0];
  return { kcId, message, confirmedKcIds: [] };
}

// Literal additions to an unchanged dictionary form. Keep this separate from
// class confusion (e.g. 白いだった) and from malformed or misspelled roots.
// For く-based forms the complete tail is present; replacing い is the missing
// operation, so the already written ない/て must not be the failed component.
const I_UNREPLACED_ENDINGS = {
  adjectivePast: { tails:["た", "かった"], kcId:"adj.suffix.i-past", rule:"过去形需要把词尾「い」替换为「かった」" },
  adjectiveBa: { tails:["ば", "ければ"], kcId:"adj.suffix.i-ba", rule:"条件形需要把词尾「い」替换为「ければ」" },
  adjectiveNegative: { tails:["ない", "くない"], kcId:"adj.stem.i-ku", rule:"否定形需要先把词尾「い」变为「く」，再接「ない」" },
  adjectiveTe: { tails:["て", "くて"], kcId:"adj.stem.i-ku", rule:"て形需要先把词尾「い」变为「く」，再接「て」" },
  adjectiveAdverb: { tails:["く"], kcId:"adj.stem.i-ku", rule:"副词形需要把词尾「い」替换为「く」" },
  adjectiveNegativePast: { tails:["なかった", "くなかった"], kcId:"adj.stem.i-ku", rule:"否定过去形需要先把词尾「い」变为「く」，再接「なかった」" },
};

export function adjectiveDiagnosticCandidates(adjective, form) {
  const candidates = [];
  // These exact voicing changes stay inside one な-adjective past suffix.
  // The full word must remain intact; this is not the verb onbin rule and
  // provides no independent evidence about word classification.
  if (adjective.class === "na" && form === "adjectiveNaPast") {
    for (const ending of ["たっだ", "たった", "だっだ"]) candidates.push({
      answer: `${adjective.surface}${ending}`, kcId: "adj.suffix.na-past", confirmedKcIds: [],
      message: `接续部分写成了「${ending}」，な形容词过去形应接「だった」：前面是「だ」，末尾是「た」。`,
    });
  }
  const unreplaced = I_UNREPLACED_ENDINGS[form];
  // Keeping いい also fails to establish the separate よ exception. Do not
  // choose one failure from that multi-error case; retain the existing exact
  // regularization diagnosis (いかった, etc.) independently.
  if (adjective.class === "i" && !isIiFamily(adjective) && unreplaced) {
    for (const tail of unreplaced.tails) candidates.push({
      answer:`${adjective.surface}${tail}`, kcId:unreplaced.kcId, confirmedKcIds:[],
      message:`你保留了原形末尾的「い」，直接接了「${tail}」。${unreplaced.rule}。`,
    });
  }
  // Match the complete, correctly inflected intermediate form, never an
  // arbitrary answer prefix. A bare く form does not establish classification
  // or the separate adverb application, only the stem actually written.
  if (adjective.class === "i" && ["adjectiveNegative", "adjectiveTe"].includes(form)) {
    const suffix = form === "adjectiveNegative" ? "ない" : "て";
    candidates.push({
      answer: `${iStem(adjective.surface, isIiFamily(adjective))}く`,
      kcId: form === "adjectiveNegative" ? "adj.suffix.i-negative" : "adj.suffix.i-te",
      message: `已写对「く」形词干，但缺少后续的「${suffix}」。`,
      confirmedKcIds: ["adj.stem.i-ku", ...(isIiFamily(adjective) ? ["adj.exception.ii-yo"] : [])],
    });
  }
  if (adjective.class === "i" && I_SIMPLE_FORM_KCS[form]) {
    for (const otherForm of [...Object.keys(I_SIMPLE_FORM_KCS), "adjectiveNegativePast"]) {
      if (otherForm === form) continue;
      // The く form above establishes a performed stem operation for these
      // two targets; do not replace that evidence with an adverb diagnosis.
      if (otherForm === "adjectiveAdverb" && ["adjectiveNegative", "adjectiveTe"].includes(form)) continue;
      candidates.push({
        answer: conjugateAdjective(adjective, otherForm),
        kcId: I_SIMPLE_FORM_KCS[form],
        message: `你写成了${ADJECTIVE_FORM_LABELS[otherForm]}，本题要求${ADJECTIVE_FORM_LABELS[form]}。`,
        confirmedKcIds: [],
      });
    }
  }
  if (adjective.class === "na" && NA_SIMPLE_FORM_KCS[form]) {
    for (const otherForm of [...Object.keys(NA_SIMPLE_FORM_KCS), "adjectiveNaNegativePast"]) {
      if (otherForm === form) continue;
      for (const answer of acceptedAdjectiveConjugations(adjective, otherForm)) {
        candidates.push({
          answer, kcId: NA_SIMPLE_FORM_KCS[form], confirmedKcIds: [],
          message: `你写成了${ADJECTIVE_FORM_LABELS[otherForm]}，本题要求${ADJECTIVE_FORM_LABELS[form]}。`,
        });
      }
    }
  }
  const analogous = ANALOGOUS_FORM[form];
  if (analogous) {
    try {
      const wrongClass = adjective.class === "i" ? "na" : "i";
      const wrongItem = { ...adjective, class: wrongClass, iiFamily: false,
        surface: adjective.class === "na" && !adjective.surface.endsWith("い") ? `${adjective.surface}い` : adjective.surface };
      const accepted = new Set(acceptedAdjectiveConjugations(adjective, form));
      for (const wrongAnswer of acceptedAdjectiveConjugations(wrongItem, analogous)) {
        if (!accepted.has(wrongAnswer)) candidates.push({ answer: wrongAnswer, kcId: `adj.class.${adjective.class}`, confirmedKcIds: [], message: `目标形式已识别，但这里套用了${adjectiveClassLabel(wrongClass)}的变化；${adjective.surface}应按${adjectiveClassLabel(adjective.class)}处理。` });
      }
    } catch { /* Some forms exist only for one adjective class. */ }
  }
  if (isIiFamily(adjective)) {
    const regularAnswer = conjugateI(adjective.surface, form, false);
    if (regularAnswer !== conjugateAdjective(adjective, form)) candidates.push({ answer: regularAnswer, kcId: "adj.exception.ii-yo", message: `${adjective.surface}不能直接去掉最后的「い」；活用时要使用「よ」系变化。` });
  }
  return candidates;
}

export function diagnoseAdjective(adjective, form, answer, normalize = (value) => value) {
  if (acceptedAdjectiveConjugations(adjective, form).some((accepted) => normalize(accepted) === normalize(answer))) return null;
  const matches = adjectiveDiagnosticCandidates(adjective, form).filter((candidate) => normalize(candidate.answer) === normalize(answer));
  if (!matches.length) return diagnoseNaSuffixOmission(adjective, form, answer, normalize);
  const ids = [...new Set(matches.map((candidate) => candidate.kcId))];
  if (ids.length !== 1) return null;
  const confirmedKcIds = (matches[0].confirmedKcIds ?? []).filter((id) =>
    id !== ids[0] && matches.every((match) => (match.confirmedKcIds ?? []).includes(id)));
  return { ...matches[0], confirmedKcIds };
}
