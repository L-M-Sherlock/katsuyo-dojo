const ENDINGS = [
  { id: "Past", form: "past", label: "过去形" },
  { id: "Negative", form: "negative", label: "否定形" },
  { id: "NegativePast", form: "negativePast", label: "否定过去形" },
];

const BASES = [
  { id: "teageru", form: "teageru", label: "てあげる", outputType: "verb", outputClass: "ichidan" },
  { id: "temorau", form: "temorau", label: "てもらう", outputType: "verb", outputClass: "godan" },
  { id: "tekureru", form: "tekureru", label: "てくれる", outputType: "verb", outputClass: "ichidan" },
  { id: "teiru", form: "teiru", label: "ている", outputType: "verb", outputClass: "ichidan" },
  { id: "tearu", form: "tearu", label: "てある", outputType: "verb", outputClass: "aru" },
  { id: "teoru", form: "teoru", label: "ておる", outputType: "verb", outputClass: "godan" },
  { id: "tai", form: "tai", label: "たい", outputType: "iAdjective" },
  { id: "tehoshii", form: "tehoshii", label: "てほしい", outputType: "iAdjective" },
  { id: "youtosuru", form: "youtosuru", label: "ようとする", outputType: "verb", outputClass: "irregular" },
  { id: "temiru", form: "temiru", label: "てみる", outputType: "verb", outputClass: "ichidan" },
  { id: "teshimau", form: "teshimau", label: "てしまう", outputType: "verb", outputClass: "godan" },
  { id: "teoku", form: "teoku", label: "ておく", outputType: "verb", outputClass: "godan" },
  { id: "teiku", form: "teiku", label: "ていく", outputType: "verb", outputClass: "iku" },
  { id: "tekuru", form: "tekuru", label: "てくる", outputType: "verb", outputClass: "kuru" },
  { id: "sugiru", form: "sugiru", label: "すぎる", outputType: "verb", outputClass: "ichidan" },
  { id: "tagaru", form: "tagaru", label: "たがる", outputType: "verb", outputClass: "godan" },
];

export const COMPOUND_FORM_SPECS = Object.fromEntries(BASES.flatMap((base) => ENDINGS.map((ending) => [
  `${base.id}${ending.id}`,
  { ...base, ending: ending.form, endingLabel: ending.label },
])));

export const COMPOUND_FORM_LABELS = Object.fromEntries(Object.entries(COMPOUND_FORM_SPECS).map(([id, spec]) => [
  id,
  `${spec.label}・${spec.endingLabel}`,
]));

export const MULTI_STEP_FORMS = [...Object.keys(COMPOUND_FORM_SPECS), "passiveDesireNegativePast"];
