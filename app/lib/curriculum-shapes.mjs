// Fixed curriculum recipe scope before usage review. These declarations keep
// knowledge requirements and historical score IDs stable when teaching policy
// filters unsuitable word/form pairs. They are not claims about natural usage;
// form-eligibility.mjs is the only authority for new exercise suitability.
import { COMPOUND_FORM_SPECS } from "./compound-forms.mjs";
import { CHAIN_FORM_SPECS } from "./multi-step-forms.mjs";

export const DECLARED_TEARU_WORDS = new Set(["書く", "弾く", "話す", "待つ", "読む", "買う", "切る", "飲む", "聞く", "取る", "使う", "置く", "脱ぐ", "貸す", "消す", "持つ", "打つ", "選ぶ", "作る", "売る", "習う", "言う", "払う", "洗う", "手伝う", "拾う", "描く", "磨く", "焼く", "注ぐ", "防ぐ", "稼ぐ", "出す", "直す", "渡す", "返す", "押す", "探す", "落とす", "指す", "起こす", "運ぶ", "学ぶ", "頼む", "申し込む", "包む", "送る", "守る", "食べる", "見る", "教える", "開ける", "閉める", "借りる", "浴びる", "忘れる", "覚える", "着る", "信じる", "調べる", "始める", "続ける", "助ける", "考える", "決める", "止める", "見せる", "受ける", "付ける", "集める", "捨てる", "迎える", "伝える", "変える", "届ける", "片付ける", "する"]);

export function curriculumSupportsVerbForm(verb, form) {
  if (form && CHAIN_FORM_SPECS[form]) return CHAIN_FORM_SPECS[form].words.includes(verb.surface);
  const baseForm = form ? COMPOUND_FORM_SPECS[form]?.form ?? form : form;
  if (baseForm === "tearu") return DECLARED_TEARU_WORDS.has(verb.surface);
  if (form === "causativePassiveContracted") return verb.class === "godan" && !verb.surface.endsWith("す");
  return true;
}
