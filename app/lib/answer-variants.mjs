export function matchAcceptedAnswer(answer, surfaceAnswers, readingAnswers, normalize = (value) => value) {
  const normalized = normalize(answer);
  const surfaceIndex = surfaceAnswers.findIndex((candidate) => normalize(candidate) === normalized);
  const readingIndex = readingAnswers.findIndex((candidate) => normalize(candidate) === normalized);
  const index = surfaceIndex >= 0 ? surfaceIndex : readingIndex;
  if (index < 0) return { correct: false, variant: null };
  if (index === 0) return { correct: true, variant: null };
  return {
    correct: true,
    variant: {
      surface: surfaceAnswers[index] ?? answer,
      reading: readingAnswers[index] ?? answer,
    },
  };
}

export function acceptedVariantNote(item, form, variant) {
  if (item.domain === "verb" && (form === "potential" || form.startsWith("potential")) && !variant.surface.includes("ら")) {
    return "你使用了省略「ら」的常见口语可能形。";
  }
  if (item.domain === "verb" && (form === "causativePassive" || form.startsWith("causativePassive")) && variant.surface.includes("され")) {
    return "使役受身缩约：「せられる」→「される」。";
  }
  if (item.domain === "adjective" && variant.surface.includes("じゃ")) {
    return "你使用了较口语的「じゃ」形式。";
  }
  return "你使用了本站接受的答案变体。";
}

export function acceptedVariantKcIds(item, form, variant) {
  if (item.domain === "verb" && (form === "causativePassive" || form.startsWith("causativePassive")) && variant.surface.includes("され")) {
    return ["contraction.causative-passive"];
  }
  return [];
}
