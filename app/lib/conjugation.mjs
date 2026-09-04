const NEGATIVE_ENDINGS = {
  "う": "わ",
  "く": "か",
  "ぐ": "が",
  "す": "さ",
  "つ": "た",
  "ぬ": "な",
  "ぶ": "ば",
  "む": "ま",
  "る": "ら",
};

const PAST_ENDINGS = {
  "う": "った",
  "つ": "った",
  "る": "った",
  "む": "んだ",
  "ぶ": "んだ",
  "ぬ": "んだ",
  "く": "いた",
  "ぐ": "いだ",
  "す": "した",
};

const TE_ENDINGS = {
  "う": "って",
  "つ": "って",
  "る": "って",
  "む": "んで",
  "ぶ": "んで",
  "ぬ": "んで",
  "く": "いて",
  "ぐ": "いで",
  "す": "して",
};

const E_ENDINGS = {
  "う": "え",
  "く": "け",
  "ぐ": "げ",
  "す": "せ",
  "つ": "て",
  "ぬ": "ね",
  "ぶ": "べ",
  "む": "め",
  "る": "れ",
};

const I_ENDINGS = {
  "う": "い",
  "く": "き",
  "ぐ": "ぎ",
  "す": "し",
  "つ": "ち",
  "ぬ": "に",
  "ぶ": "び",
  "む": "み",
  "る": "り",
};

const O_ENDINGS = {
  "う": "お",
  "く": "こ",
  "ぐ": "ご",
  "す": "そ",
  "つ": "と",
  "ぬ": "の",
  "ぶ": "ぼ",
  "む": "も",
  "る": "ろ",
};

const NEGATIVE_CONNECTIVE_SUFFIXES = {
  nakute: "なくて",
  naide: "ないで",
  zu: "ず",
  zuni: "ずに",
};

const TE_AUXILIARY_FORMS = new Set(["teshimau", "chau", "teoku", "toku"]);

const TE_APPEND_SUFFIXES = {
  teageru: "あげる",
  temorau: "もらう",
  tekureru: "くれる",
  tekudasai: "ください",
  teiru: "いる",
  teru: "る",
  tearu: "ある",
  teoru: "おる",
  tehoshii: "ほしい",
  temo: "も",
  tewa: "は",
  temoIi: "もいい",
  temiru: "みる",
  teiku: "いく",
  teku: "く",
  tekuru: "くる",
};

const MASU_STEM_SUFFIXES = {
  tai: "たい",
  nagara: "ながら",
  tsutsu: "つつ",
  sugiru: "すぎる",
  tagaru: "たがる",
};

const BASIC_COMPOUND_FORMS = new Set(["negativePast", "masuPast", "masuNegative", "masuNegativePast"]);

const POLITE_COMPOUND_SUFFIXES = {
  masuPast: "ました",
  masuNegative: "ません",
  masuNegativePast: "ませんでした",
};

const VOICE_COMPOUND_FORMS = {
  passivePast: { voice: "passive", ending: "past", voiceLabel: "受身形", endingLabel: "过去形" },
  passiveNegative: { voice: "passive", ending: "negative", voiceLabel: "受身形", endingLabel: "否定形" },
  passiveNegativePast: { voice: "passive", ending: "negativePast", voiceLabel: "受身形", endingLabel: "否定过去形" },
  potentialPast: { voice: "potential", ending: "past", voiceLabel: "可能形", endingLabel: "过去形" },
  potentialNegative: { voice: "potential", ending: "negative", voiceLabel: "可能形", endingLabel: "否定形" },
  potentialNegativePast: { voice: "potential", ending: "negativePast", voiceLabel: "可能形", endingLabel: "否定过去形" },
  causativePast: { voice: "causative", ending: "past", voiceLabel: "使役形", endingLabel: "过去形" },
  causativeNegative: { voice: "causative", ending: "negative", voiceLabel: "使役形", endingLabel: "否定形" },
  causativeNegativePast: { voice: "causative", ending: "negativePast", voiceLabel: "使役形", endingLabel: "否定过去形" },
  causativePassivePast: { voice: "causativePassive", ending: "past", voiceLabel: "使役受身形", endingLabel: "过去形" },
  causativePassiveNegative: { voice: "causativePassive", ending: "negative", voiceLabel: "使役受身形", endingLabel: "否定形" },
  causativePassiveNegativePast: { voice: "causativePassive", ending: "negativePast", voiceLabel: "使役受身形", endingLabel: "否定过去形" },
};

const VOICE_COMPOUND_SUFFIXES = {
  past: "た",
  negative: "ない",
  negativePast: "なかった",
};

const ICHIDAN_SUFFIXES = {
  negative: "ない",
  past: "た",
  te: "て",
  masu: "ます",
  nasai: "なさい",
  passive: "られる",
  potential: "られる",
  imperative: "ろ",
  volitional: "よう",
  ba: "れば",
  causative: "させる",
  causativePassive: "させられる",
};

function replaceEnding(word, replacement) {
  return `${word.slice(0, -1)}${replacement}`;
}

function conjugateIrregular(word, form) {
  if (word.endsWith("する")) {
    const base = word.slice(0, -2);
    const ending = {
      negative: "しない",
      past: "した",
      te: "して",
      masu: "します",
      nasai: "しなさい",
      passive: "される",
      potential: "できる",
      imperative: "しろ",
      volitional: "しよう",
      ba: "すれば",
      causative: "させる",
      causativePassive: "させられる",
    }[form];
    return `${base}${ending}`;
  }

  if (word === "来る" || word === "くる") {
    const kanjiForms = {
      negative: "来ない",
      past: "来た",
      te: "来て",
      masu: "来ます",
      nasai: "来なさい",
      passive: "来られる",
      potential: "来られる",
      imperative: "来い",
      volitional: "来よう",
      ba: "来れば",
      causative: "来させる",
      causativePassive: "来させられる",
    };
    const kanaForms = {
      negative: "こない",
      past: "きた",
      te: "きて",
      masu: "きます",
      nasai: "きなさい",
      passive: "こられる",
      potential: "こられる",
      imperative: "こい",
      volitional: "こよう",
      ba: "くれば",
      causative: "こさせる",
      causativePassive: "こさせられる",
    };
    return (word === "来る" ? kanjiForms : kanaForms)[form];
  }

  throw new Error(`Unsupported irregular verb: ${word}`);
}

/**
 * Conjugate a curated Japanese verb into one of the supported forms.
 * @param {string} word
 * @param {"godan" | "ichidan" | "irregular"} verbClass
 * @param {ConjugationForm} form
 */
export function conjugate(word, verbClass, form) {
  if (form === "causativePassiveContracted") {
    if (verbClass !== "godan" || word.at(-1) === "す") throw new Error(`Unsupported contracted causative-passive verb: ${word}`);
    const ending = word.at(-1);
    const moved = NEGATIVE_ENDINGS[ending];
    if (!moved) throw new Error(`Unsupported godan ending: ${ending}`);
    return replaceEnding(word, `${moved}される`);
  }
  if (form === "passiveDesireNegativePast") {
    const passive = conjugate(word, verbClass, "passive");
    const desire = conjugate(passive, "ichidan", "tai");
    return `${desire.slice(0, -1)}くなかった`;
  }
  const voiceCompound = VOICE_COMPOUND_FORMS[form];
  if (voiceCompound) {
    const voiceForm = conjugate(word, verbClass, voiceCompound.voice);
    return conjugate(voiceForm, "ichidan", voiceCompound.ending);
  }

  if (form === "negativePast") {
    const negativeForm = conjugate(word, verbClass, "negative");
    return `${negativeForm.slice(0, -1)}かった`;
  }

  const politeCompoundSuffix = POLITE_COMPOUND_SUFFIXES[form];
  if (politeCompoundSuffix) {
    const masuForm = conjugate(word, verbClass, "masu");
    return `${masuForm.slice(0, -2)}${politeCompoundSuffix}`;
  }

  if (TE_AUXILIARY_FORMS.has(form)) {
    const teForm = conjugate(word, verbClass, "te");
    if (form === "teshimau") return `${teForm}しまう`;
    if (form === "teoku") return `${teForm}おく`;

    const connective = teForm.at(-1);
    const base = teForm.slice(0, -1);
    if (form === "chau") return `${base}${connective === "で" ? "じゃう" : "ちゃう"}`;
    return `${base}${connective === "で" ? "どく" : "とく"}`;
  }

  const teAppendSuffix = TE_APPEND_SUFFIXES[form];
  if (teAppendSuffix) return `${conjugate(word, verbClass, "te")}${teAppendSuffix}`;

  const masuStemSuffix = MASU_STEM_SUFFIXES[form];
  if (masuStemSuffix) {
    const masuForm = conjugate(word, verbClass, "masu");
    return `${masuForm.slice(0, -2)}${masuStemSuffix}`;
  }

  if (form === "toru") {
    const teForm = conjugate(word, verbClass, "te");
    return `${teForm.slice(0, -1)}${teForm.endsWith("で") ? "どる" : "とる"}`;
  }
  if (form === "naideKudasai") return `${conjugate(word, verbClass, "naide")}ください`;
  if (form === "tara") return `${conjugate(word, verbClass, "past")}ら`;
  if (form === "tari") return `${conjugate(word, verbClass, "past")}り`;
  if (form === "tatte") return `${conjugate(word, verbClass, "past")}って`;
  if (form === "nakutemoIi") return `${conjugate(word, verbClass, "nakute")}もいい`;
  if (form === "masenka") {
    const masuForm = conjugate(word, verbClass, "masu");
    return `${masuForm.slice(0, -2)}ませんか`;
  }
  if (form === "youtosuru") return `${conjugate(word, verbClass, "volitional")}とする`;
  if (["nakerebaNaranai", "nakutewaIkenai", "naitoIkenai"].includes(form)) {
    const negative = conjugate(word, verbClass, "negative");
    const negativeStem = negative.slice(0, -2);
    if (form === "nakerebaNaranai") return `${negativeStem}なければならない`;
    if (form === "nakutewaIkenai") return `${negativeStem}なくてはいけない`;
    return `${negative}といけない`;
  }

  const negativeConnectiveSuffix = NEGATIVE_CONNECTIVE_SUFFIXES[form];
  if (negativeConnectiveSuffix) {
    const usesZuStem = form === "zu" || form === "zuni";
    const negativeStem = usesZuStem && word.endsWith("する")
      ? `${word.slice(0, -2)}せ`
      : conjugate(word, verbClass, "negative").slice(0, -2);
    return `${negativeStem}${negativeConnectiveSuffix}`;
  }

  if (form === "prohibitive") return `${word}な`;
  if (verbClass === "irregular") return conjugateIrregular(word, form);

  if (verbClass === "ichidan") {
    const stem = word.slice(0, -1);
    return `${stem}${ICHIDAN_SUFFIXES[form]}`;
  }

  if (word === "行く" || word === "いく") {
    if (form === "past") return replaceEnding(word, "った");
    if (form === "te") return replaceEnding(word, "って");
  }

  const ending = word.at(-1);
  if (form === "masu") {
    const moved = I_ENDINGS[ending];
    if (!moved) throw new Error(`Unsupported godan ending: ${ending}`);
    return replaceEnding(word, `${moved}ます`);
  }

  if (form === "nasai") {
    const moved = I_ENDINGS[ending];
    if (!moved) throw new Error(`Unsupported godan ending: ${ending}`);
    return replaceEnding(word, `${moved}なさい`);
  }

  if (form === "passive") {
    const moved = NEGATIVE_ENDINGS[ending];
    if (!moved) throw new Error(`Unsupported godan ending: ${ending}`);
    return replaceEnding(word, `${moved}れる`);
  }

  if (form === "causative" || form === "causativePassive") {
    const moved = NEGATIVE_ENDINGS[ending];
    if (!moved) throw new Error(`Unsupported godan ending: ${ending}`);
    const suffix = form === "causative" ? "せる" : "せられる";
    return replaceEnding(word, `${moved}${suffix}`);
  }

  if (form === "volitional") {
    const moved = O_ENDINGS[ending];
    if (!moved) throw new Error(`Unsupported godan ending: ${ending}`);
    return replaceEnding(word, `${moved}う`);
  }

  if (["potential", "imperative", "ba"].includes(form)) {
    const moved = E_ENDINGS[ending];
    if (!moved) throw new Error(`Unsupported godan ending: ${ending}`);
    const suffix = form === "potential" ? "る" : form === "ba" ? "ば" : "";
    return replaceEnding(word, `${moved}${suffix}`);
  }

  const table = form === "negative" ? NEGATIVE_ENDINGS : form === "past" ? PAST_ENDINGS : TE_ENDINGS;
  const replacement = table[ending];
  if (!replacement) throw new Error(`Unsupported godan ending: ${ending}`);
  return replaceEnding(word, form === "negative" ? `${replacement}ない` : replacement);
}

/**
 * Include common variants that should be accepted even when they are not the displayed answer.
 * @param {string} word
 * @param {"godan" | "ichidan" | "irregular"} verbClass
 * @param {ConjugationForm} form
 */
export function acceptedConjugations(word, verbClass, form) {
  const answers = [conjugate(word, verbClass, form)];
  const voiceCompound = VOICE_COMPOUND_FORMS[form];

  if (voiceCompound) {
    const voiceVariants = acceptedConjugations(word, verbClass, voiceCompound.voice);
    for (const voiceVariant of voiceVariants) {
      const derivedClass = voiceCompound.voice === "causative" && voiceVariant.endsWith("す")
        ? "godan"
        : "ichidan";
      answers.push(conjugate(voiceVariant, derivedClass, voiceCompound.ending));
    }
  }

  if (form === "potential" && verbClass === "ichidan") {
    answers.push(`${word.slice(0, -1)}れる`);
  }
  if (form === "potential" && verbClass === "irregular" && (word === "来る" || word === "くる")) {
    answers.push(word === "来る" ? "来れる" : "これる");
  }
  if (form === "imperative" && verbClass === "irregular" && word.endsWith("する")) {
    answers.push(`${word.slice(0, -2)}せよ`);
  }
  if (form === "nasai") {
    const masuForm = conjugate(word, verbClass, "masu");
    answers.push(`${masuForm.slice(0, -2)}な`);
  }
  if (form === "causative") {
    answers.push(`${answers[0].slice(0, -2)}す`);
  }
  if (form === "causativePassive" && verbClass === "godan" && word.at(-1) !== "す") {
    const ending = word.at(-1);
    answers.push(replaceEnding(word, `${NEGATIVE_ENDINGS[ending]}される`));
  }
  if (form === "teshimau") answers.push(conjugate(word, verbClass, "chau"));
  if (form === "teoku") answers.push(conjugate(word, verbClass, "toku"));
  if (form === "teiru") answers.push(conjugate(word, verbClass, "teru"));
  if (form === "teoru") answers.push(conjugate(word, verbClass, "toru"));
  if (form === "teiku") answers.push(conjugate(word, verbClass, "teku"));

  return [...new Set(answers)];
}

/**
 * Return a short, learner-facing account of the sound change.
 * @param {string} word
 * @param {"godan" | "ichidan" | "irregular"} verbClass
 * @param {ConjugationForm} form
 */
export function explainConjugation(word, verbClass, form) {
  const answer = conjugate(word, verbClass, form);

  if (form === "causativePassiveContracted") {
    const fullForm = conjugate(word, verbClass, "causativePassive");
    return {
      answer,
      parts: [answer],
      steps: [fullForm, answer],
      rule: "「せられる」缩约为「される」。",
    };
  }

  if (form === "passiveDesireNegativePast") {
    const passive = conjugate(word, verbClass, "passive");
    const desire = conjugate(passive, "ichidan", "tai");
    return {
      answer,
      parts: [desire.slice(0, -1), "くなかった"],
      steps: [passive, desire, answer],
      rule: "先构成受身形，再接 たい；たい 按い形容词方式变为否定过去，正是 Yokubi Lesson 4 展示的层叠活用。",
    };
  }

  const voiceCompound = VOICE_COMPOUND_FORMS[form];
  if (voiceCompound) {
    const voiceForm = conjugate(word, verbClass, voiceCompound.voice);
    const negativeVoiceForm = voiceCompound.ending === "negativePast"
      ? conjugate(voiceForm, "ichidan", "negative")
      : null;
    return {
      answer,
      parts: [voiceForm.slice(0, -1), VOICE_COMPOUND_SUFFIXES[voiceCompound.ending]],
      steps: negativeVoiceForm ? [voiceForm, negativeVoiceForm, answer] : [voiceForm, answer],
      rule: `先构成${voiceCompound.voiceLabel} ${voiceForm}；它以 る 结尾，后续按一段动词变为${voiceCompound.endingLabel}。`,
    };
  }

  if (BASIC_COMPOUND_FORMS.has(form)) {
    if (form === "negativePast") {
      const negativeForm = conjugate(word, verbClass, "negative");
      return {
        answer,
        parts: [negativeForm.slice(0, -1), "かった"],
        steps: [negativeForm, answer],
        rule: "先构成否定形，再把末尾的 い 换成 かった，得到否定过去形。",
      };
    }

    const masuForm = conjugate(word, verbClass, "masu");
    const masuStem = masuForm.slice(0, -2);
    const suffix = POLITE_COMPOUND_SUFFIXES[form];
    const steps = form === "masuNegativePast"
      ? [masuForm, `${masuStem}ません`, answer]
      : [masuForm, answer];
    const label = form === "masuPast"
      ? "礼貌过去形"
      : form === "masuNegative"
        ? "礼貌否定形"
        : "礼貌否定过去形";
    return {
      answer,
      parts: [masuStem, suffix],
      steps,
      rule: `先找出 ます 前面的词干，再把 ます 换成 ${suffix}，得到${label}。`,
    };
  }

  if (TE_AUXILIARY_FORMS.has(form)) {
    const teForm = conjugate(word, verbClass, "te");
    if (form === "teshimau") {
      return {
        answer,
        parts: [teForm, "しまう"],
        rule: `先构成て形，再接 しまう，表示动作完成或“结果竟然如此”的语感；口语常缩为 ${conjugate(word, verbClass, "chau")}。`,
      };
    }
    if (form === "teoku") {
      return {
        answer,
        parts: [teForm, "おく"],
        rule: `先构成て形，再接 おく，表示预先做或做完后保持原状；口语常缩为 ${conjugate(word, verbClass, "toku")}。`,
      };
    }

    const connective = teForm.at(-1);
    const contractedSuffix = form === "chau"
      ? connective === "で" ? "じゃう" : "ちゃう"
      : connective === "で" ? "どく" : "とく";
    return {
      answer,
      parts: [teForm.slice(0, -1), contractedSuffix],
      rule: form === "chau"
        ? `${connective}しまう 在口语中缩成 ${contractedSuffix}，语义与完整形式相同。`
        : `${connective}おく 在口语中缩成 ${contractedSuffix}，语义与完整形式相同。`,
    };
  }

  const teAppendSuffix = TE_APPEND_SUFFIXES[form];
  if (teAppendSuffix) {
    const teForm = conjugate(word, verbClass, "te");
    return {
      answer,
      parts: [teForm, teAppendSuffix],
      rule: `先构成て形 ${teForm}，再接 ${teAppendSuffix}。`,
    };
  }

  const masuStemSuffix = MASU_STEM_SUFFIXES[form];
  if (masuStemSuffix) {
    const masuForm = conjugate(word, verbClass, "masu");
    const stem = masuForm.slice(0, -2);
    return {
      answer,
      parts: [stem, masuStemSuffix],
      rule: `先取ます词干 ${stem}，再接 ${masuStemSuffix}。`,
    };
  }

  if (["toru", "naideKudasai", "tara", "tari", "tatte", "nakutemoIi", "masenka", "youtosuru", "nakerebaNaranai", "nakutewaIkenai", "naitoIkenai"].includes(form)) {
    const baseForm = form === "toru" ? "teoru"
      : form === "naideKudasai" ? "naide"
        : ["tara", "tari", "tatte"].includes(form) ? "past"
          : form === "nakutemoIi" ? "nakute"
            : form === "masenka" ? "masu"
              : form === "youtosuru" ? "volitional"
                : "negative";
    const base = conjugate(word, verbClass, baseForm);
    return {
      answer,
      parts: [base, answer.slice(base.length)],
      steps: [base, answer],
      rule: `先构成${baseForm === "past" ? "过去形" : baseForm === "negative" ? "否定形" : baseForm === "masu" ? "ます形" : baseForm === "volitional" ? "意向形" : `${baseForm}形式`}，再完成题目指定的接续。`,
    };
  }

  const negativeConnectiveSuffix = NEGATIVE_CONNECTIVE_SUFFIXES[form];
  if (negativeConnectiveSuffix) {
    const base = answer.slice(0, -negativeConnectiveSuffix.length);
    const formation = form === "nakute"
      ? "把否定形末尾的 ない 换成 なくて"
      : form === "naide"
        ? "在否定形后接 で，构成 ないで"
        : word.endsWith("する")
          ? `する 的 ず 系列使用特殊词干 せ，再接 ${negativeConnectiveSuffix}`
          : `使用否定词干，去掉 ない 后接 ${negativeConnectiveSuffix}`;
    const nuance = form === "nakute"
      ? "，常用于连接前因与后果"
      : form === "naide"
        ? "，常表示在不做前项的状态下进行后项"
        : form === "zu"
          ? "，是 なくて 的较正式表达"
          : "，是 ないで 的较正式表达";
    return {
      answer,
      parts: [base, negativeConnectiveSuffix],
      rule: `${formation}${nuance}。`,
    };
  }

  if (form === "prohibitive") {
    return {
      answer,
      parts: [word, "な"],
      rule: "保持非过去的辞书形不变，在句末接 な 表示强烈禁止。",
    };
  }

  if (verbClass === "irregular") {
    return {
      answer,
      parts: [answer],
      rule: form === "causative"
        ? `${word} 的使役形是不规则变化；标准形为 ${answer}，口语中也可能缩短为 ${answer.slice(0, -2)}す。`
        : `${word} 是不规则动词，这个形式需要作为固定变化认识。`,
    };
  }

  const stem = word.slice(0, -1);
  if (verbClass === "ichidan") {
    const suffix = ICHIDAN_SUFFIXES[form];
    return {
      answer,
      parts: [stem, suffix],
      rule: form === "causative"
        ? `一段动词去掉 る，直接接 ${suffix}；口语中也可能缩短为 ${suffix.slice(0, -2)}す。`
        : `一段动词去掉 る，直接接 ${suffix}。`,
    };
  }

  const ending = word.at(-1);
  const changed = answer.slice(stem.length);
  if ((word === "行く" || word === "いく") && (form === "past" || form === "te")) {
    return {
      answer,
      parts: [stem, changed],
      rule: `行く 是这里的重要例外：${form === "past" ? "过去形用 った" : "て形用 って"}。`,
    };
  }

  if (form === "negative") {
    const moved = NEGATIVE_ENDINGS[ending];
    return {
      answer,
      parts: [`${stem}${moved}`, "ない"],
      rule: ending === "う"
        ? "词尾 う 移到 a 段时变成 わ，再接 ない。"
        : `词尾 ${ending} 从 u 段移到 a 段的 ${moved}，再接 ない。`,
    };
  }

  if (form === "masu") {
    const moved = I_ENDINGS[ending];
    return {
      answer,
      parts: [`${stem}${moved}`, "ます"],
      rule: `词尾 ${ending} 从 u 段移到 i 段的 ${moved}，再接 ます。`,
    };
  }

  if (form === "nasai") {
    const moved = I_ENDINGS[ending];
    return {
      answer,
      parts: [`${stem}${moved}`, "なさい"],
      rule: `词尾 ${ending} 从 u 段移到 i 段的 ${moved}，再接 なさい；口语中 さい 常可省略。`,
    };
  }

  if (form === "passive") {
    const moved = NEGATIVE_ENDINGS[ending];
    return {
      answer,
      parts: [`${stem}${moved}`, "れる"],
      rule: ending === "う"
        ? "词尾 う 移到 a 段时变成 わ，再接 れる构成受身形。"
        : `词尾 ${ending} 从 u 段移到 a 段的 ${moved}，再接 れる构成受身形。`,
    };
  }

  if (form === "causative" || form === "causativePassive") {
    const moved = NEGATIVE_ENDINGS[ending];
    const suffix = form === "causative" ? "せる" : "せられる";
    const label = form === "causative" ? "使役形" : "使役受身形";
    const shortNote = form === "causative"
      ? `；口语中也可能缩短为 ${stem}${moved}す`
      : ending === "す"
        ? "；す 结尾通常不使用缩约形"
        : `；口语中常缩短为 ${stem}${moved}される`;
    return {
      answer,
      parts: [`${stem}${moved}`, suffix],
      rule: ending === "う"
        ? `词尾 う 移到 a 段时变成 わ，再接 ${suffix} 构成${label}${shortNote}。`
        : `词尾 ${ending} 从 u 段移到 a 段的 ${moved}，再接 ${suffix} 构成${label}${shortNote}。`,
    };
  }

  if (form === "volitional") {
    const moved = O_ENDINGS[ending];
    return {
      answer,
      parts: [`${stem}${moved}`, "う"],
      rule: `词尾 ${ending} 从 u 段移到 o 段的 ${moved}，再接 う；整体读作长音。`,
    };
  }

  if (["potential", "imperative", "ba"].includes(form)) {
    const moved = E_ENDINGS[ending];
    const suffix = form === "potential" ? "る" : form === "ba" ? "ば" : "";
    const label = form === "potential" ? "可能形" : form === "imperative" ? "命令形" : "ば形";
    return {
      answer,
      parts: suffix ? [`${stem}${moved}`, suffix] : [`${stem}${moved}`],
      rule: form === "imperative"
        ? `词尾 ${ending} 移到 e 段的 ${moved}，直接构成${label}。`
        : `词尾 ${ending} 移到 e 段的 ${moved}，再接 ${suffix} 构成${label}。`,
    };
  }

  const label = form === "past" ? "过去形" : "て形";
  let rule;
  if (["う", "つ", "る"].includes(ending)) rule = `${ending} 发生促音便，${label}变为 ${changed}。`;
  else if (["む", "ぶ", "ぬ"].includes(ending)) rule = `${ending} 发生拨音便，${label}变为 ${changed}。`;
  else if (["く", "ぐ"].includes(ending)) rule = `${ending} 发生い音便，${label}变为 ${changed}。`;
  else rule = `词尾 す 在${label}中变为 ${changed}。`;

  return { answer, parts: [stem, changed], rule };
}

/** @param {"godan" | "ichidan" | "irregular"} verbClass */
export function classLabel(verbClass) {
  return verbClass === "godan" ? "五段动词" : verbClass === "ichidan" ? "一段动词" : "不规则动词";
}

const I_ROW_KANA = new Set([..."いきぎしじちぢにひびぴみり"]);
const E_ROW_KANA = new Set([..."えけげせぜてでねへべぺめれ"]);

function rowBeforeRu(verb) {
  const reading = verb.reading ?? verb.surface;
  if (!reading.endsWith("る")) return null;
  const kana = [...reading].at(-2);
  if (I_ROW_KANA.has(kana)) return { kana, row: "い" };
  if (E_ROW_KANA.has(kana)) return { kana, row: "え" };
  return kana ? { kana, row: null } : null;
}

/**
 * @param {{ surface: string, reading?: string, class: "godan" | "ichidan" | "irregular" }} verb
 */
export function explainClass(verb) {
  if (verb.class === "irregular") return `${verb.surface} 属于两类主要不规则动词之一，需要单独认识。`;
  const beforeRu = rowBeforeRu(verb);
  if (verb.class === "ichidan") return beforeRu?.row
    ? `${verb.surface} 以 る 结尾，る 前的「${beforeRu.kana}」在${beforeRu.row}段，按常用初判通常是一段动词；活用时去掉 る，前面的词干保持不变。`
    : `${verb.surface} 是一段动词；活用时去掉 る，前面的词干保持不变。`;
  if (verb.surface.endsWith("る") && beforeRu?.row) return `${verb.surface} 以 る 结尾，る 前的「${beforeRu.kana}」在${beforeRu.row}段，表面上符合一段动词的常用初判；但它是常见的五段例外，词尾仍会在不同元音段之间移动。`;
  if (verb.surface.endsWith("る")) return `${verb.surface} 以 る 结尾，但 る 前的「${beforeRu?.kana ?? "前一音"}」不在い段或え段，按常用初判应归为五段；活用时词尾会在不同元音段之间移动。`;
  return `${verb.surface} 是五段动词；最后一个假名会随活用在不同元音段之间移动。`;
}
/** @typedef {"negative" | "past" | "te" | "masu" | "passive" | "potential" | "imperative" | "volitional" | "ba" | "nasai" | "prohibitive" | "causative" | "causativePassive" | "causativePassiveContracted" | "nakute" | "naide" | "zu" | "zuni" | "teshimau" | "chau" | "teoku" | "toku" | "negativePast" | "masuPast" | "masuNegative" | "masuNegativePast" | "passivePast" | "passiveNegative" | "passiveNegativePast" | "potentialPast" | "potentialNegative" | "potentialNegativePast" | "causativePast" | "causativeNegative" | "causativeNegativePast" | "causativePassivePast" | "causativePassiveNegative" | "causativePassiveNegativePast" | "passiveDesireNegativePast" | "teageru" | "temorau" | "tekureru" | "tekudasai" | "naideKudasai" | "teiru" | "teru" | "tearu" | "teoru" | "toru" | "tai" | "tehoshii" | "tara" | "temo" | "nagara" | "tsutsu" | "nakerebaNaranai" | "nakutewaIkenai" | "naitoIkenai" | "tari" | "tewa" | "temoIi" | "nakutemoIi" | "masenka" | "youtosuru" | "temiru" | "teiku" | "teku" | "tekuru" | "tatte" | "sugiru" | "tagaru"} ConjugationForm */
