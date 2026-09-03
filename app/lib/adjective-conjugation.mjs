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
  if (adjective.class === "na" && form === "adjectiveNaNegative") answers.push(`${adjective.surface}じゃない`);
  if (adjective.class === "na" && form === "adjectiveNaNegativePast") answers.push(`${adjective.surface}じゃなかった`);
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
    adjectiveNaNegative: "接「ではない」构成否定形；口语也可以说「じゃない」",
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

export function adjectiveDiagnosticCandidates(adjective, form) {
  const candidates = [];
  const analogous = ANALOGOUS_FORM[form];
  if (analogous) {
    try {
      const wrongAnswer = adjective.class === "i"
        ? conjugateNa(adjective.surface, analogous)
        : conjugateI(adjective.surface.endsWith("い") ? adjective.surface : `${adjective.surface}い`, analogous);
      if (wrongAnswer !== conjugateAdjective(adjective, form)) {
        candidates.push({ answer: wrongAnswer, kcId: `adj.class.${adjective.class}`, message: `目标形式已识别，但这里套用了${adjectiveClassLabel(adjective.class === "i" ? "na" : "i")}的变化；${adjective.surface}应按${adjectiveClassLabel(adjective.class)}处理。` });
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
  const matches = adjectiveDiagnosticCandidates(adjective, form).filter((candidate) => normalize(candidate.answer) === normalize(answer));
  const ids = [...new Set(matches.map((candidate) => candidate.kcId))];
  return ids.length === 1 ? matches[0] : null;
}
