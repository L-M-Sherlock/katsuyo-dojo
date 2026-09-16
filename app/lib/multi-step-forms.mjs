// Curated whole expressions, not the Cartesian product of every auxiliary.
// Keep the original application IDs so historical independent evidence survives.
const voluntary = ['書く','読む','話す','聞く','見る','食べる','飲む','買う','売る','作る','使う','行く','来る','くる','帰る','入る','出る','待つ','休む','遊ぶ','泳ぐ','走る','歩く','歌う','働く','手伝う','教える','習う','する','借りる','貸す','開ける','閉める','選ぶ','運ぶ','送る','受ける'];
const trying = [...voluntary,'脱ぐ','稼ぐ','注ぐ','探す','直す','出す','押す'];
const passive = ['書く','読む','使う','作る','売る','買う','送る','運ぶ','開ける','閉める','教える','呼ぶ','選ぶ','直す','守る','調べる','洗う','払う','扱う','疑う','雇う'];
const preparation = ['書く','読む','聞く','見る','買う','作る','調べる','教える','覚える','決める','伝える','送る','選ぶ','借りる','集める','洗う','払う','直す','開ける','閉める','片付ける','届ける','置く','入る','出る'];
const help = ['書く','読む','話す','聞く','見る','教える','見せる','貸す','送る','運ぶ','持つ','買う','作る','直す','洗う','開ける','閉める','手伝う','調べる','伝える','迎える','届ける','助ける','待つ','選ぶ','片付ける'];
const excess = ['食べる','飲む','買う','使う','働く','話す','遊ぶ','走る','寝る','考える','待つ','読む','書く'];
const adverse = ['消す','捨てる','取る','読む','使う','売る','開ける','閉める','変える','落とす','呼ぶ','起こす','からかう'];

/** @typedef {"temiruDesire" | "temiruDesirePast" | "temiruDesireNegative" | "temiruDesireNegativePast" | "passiveProgressive" | "passiveProgressivePast" | "passiveProgressiveNegative" | "passiveProgressiveNegativePast" | "causativeReceive" | "causativeReceivePast" | "causativeReceiveDesire" | "causativeReceivePoliteRequest" | "temiruRequest" | "temiruTara" | "teokuRequest" | "teokuBa" | "teokuTara" | "causativeRequest" | "temorauDesire" | "temorauDesirePast" | "temorauDesireNegative" | "temorauDesireNegativePast" | "temorauPotential" | "temorauPotentialPast" | "temorauPotentialNegative" | "temorauPotentialNegativePast" | "temorauPoliteRequest" | "potentialPolite" | "potentialPolitePast" | "potentialPoliteNegative" | "potentialPoliteNegativePast" | "desireBa" | "sugiruNegativeRequest" | "passiveCompletion" | "passiveCompletionPast" | "causativeReceivePotential" | "causativeReceivePotentialPast" | "causativeReceivePotentialNegative" | "causativeReceivePotentialNegativePast" | "potentialBa" | "potentialTara"} ChainForm */
// `context` records internal applicability assumptions, not a displayed question scenario.
/** @typedef {{base:string, tail:string, outputClass:string, label:string, title:string, kcId:string, familyTitle:string, facetId:string, words:string[], rule:string, functionText:string, meaning:string, context?:string}} ChainSpec */
/** @type {Record<ChainForm, ChainSpec>} */
export const CHAIN_FORM_SPECS = {};
/** Variants have explicit Chinese meanings; changing a suffix must not merely
 * append a tense marker to an unrelated or misleading explanation. */
function family(kcId, familyTitle, base, outputClass, words, context, variants) {
  for (const [id, tail, title, functionText, meaning] of variants) {
    CHAIN_FORM_SPECS[id] = {base,tail,outputClass,kcId,familyTitle,words,context,
      facetId:`facet.chain.${id}`,label:title,title,functionText,meaning,
      rule:`${familyTitle}：${meaning}`};
  }
}
family('compound.chain.temiru-desire-past','尝试与愿望','temiru','ichidan',trying,undefined,[
  ['temiruDesire','tai','尝试・愿望','想试着……','表示想尝试做某事，并不表示已经做过。'],
  ['temiruDesirePast','taiPast','尝试・愿望・过去','曾想试着……','表示过去想尝试做某事，并不表示已经做过。'],
  ['temiruDesireNegative','taiNegative','尝试・愿望・否定','不想尝试……','表示没有尝试做某事的意愿。'],
  ['temiruDesireNegativePast','taiNegativePast','尝试・愿望・否定过去','当时不想尝试……','表示过去没有尝试做某事的意愿。'],
]);
family('compound.chain.passive-progressive-past','受身与进行或状态','passive','ichidan',passive,undefined,[
  ['passiveProgressive','teiru','受身・进行／状态','正被……／处于被……的状态','表示动作正在作用于对象，或对象处于该动作造成的状态。'],
  ['passiveProgressivePast','teiruPast','受身・进行／状态・过去','当时正被……／当时处于被……的状态','表示过去动作正在作用于对象，或对象处于该动作造成的状态。'],
  ['passiveProgressiveNegative','teiruNegative','受身・进行／状态・否定','没有在被……／并未处于被……的状态','否定动作正在作用于对象，或否定该动作造成的结果状态。'],
  ['passiveProgressiveNegativePast','teiruNegativePast','受身・进行／状态・否定过去','当时没有在被……／当时并未处于被……的状态','表示过去没有相应的受身进行情况或结果状态。'],
]);
family('compound.chain.causative-receive-past','使役与接受允许','causative','ichidan',voluntary,'说话人谈论自己得到对方允许或安排后做某事的情况。',[
  ['causativeReceive','temorau','使役・接受允许','获准……／得到做……的机会','从获益者角度，表达得到对方允许或安排后做某事。'],
  ['causativeReceivePast','temorauPast','使役・接受允许・过去','获准做了……／得到了做……的机会','表示过去得到对方的允许或安排，因而做了某事。'],
]);
family('compound.chain.try-request','尝试与请求','temiru','ichidan',trying,undefined,[
  ['temiruRequest','tekudasai','尝试・请求','请试着……','请求对方尝试做某事。'],
]);
family('compound.chain.try-condition','尝试与条件','temiru','ichidan',trying,undefined,[
  ['temiruTara','tara','尝试・たら条件','如果试着……／试过之后……','用尝试某事作为条件，或引出尝试之后的发现。'],
]);
family('compound.chain.prepare-request','事先准备与请求','teoku','godan',preparation,'为接下来的事情做准备，请对方事先完成这项安排。',[
  ['teokuRequest','tekudasai','事先准备・请求','请事先……','请求对方为之后的事情预先完成某项准备。'],
]);
family('compound.chain.prepare-condition','事先准备与条件','teoku','godan',preparation,'谈论某项事先准备与之后结果之间的条件关系。',[
  ['teokuBa','ba','事先准备・ば条件','如果事先……','把事先完成某项准备作为条件。'],
  ['teokuTara','tara','事先准备・たら条件','如果事先……／事先做好之后……','用预先做好某事作为条件，或引出准备完成后的事情。'],
]);
family('compound.chain.causative-request','使役与许可请求','causative','ichidan',voluntary,'说话人向有权作出安排的人请求允许自己做这件事。',[
  ['causativeRequest','tekudasai','使役・许可请求','请让我……','请求对方允许自己做某事。'],
]);
family('compound.chain.receive-desire','接受帮助与愿望','temorau','godan',help,'说话人希望由对方完成该动作，自己是接受帮助的一方。',[
  ['temorauDesire','tai','接受帮助・愿望','想请别人……','表示希望接受别人做某事带来的帮助。'],
  ['temorauDesirePast','taiPast','接受帮助・愿望・过去','当时想请别人……','表示过去希望接受别人做某事带来的帮助。'],
  ['temorauDesireNegative','taiNegative','接受帮助・愿望・否定','不想请别人……','表示不希望接受别人做某事带来的帮助。'],
  ['temorauDesireNegativePast','taiNegativePast','接受帮助・愿望・否定过去','当时不想请别人……','表示过去不希望接受别人做某事带来的帮助。'],
]);
family('compound.chain.receive-potential','接受帮助的可能与请求','temorau','godan',help,'说话人是接受帮助的一方，对方负责完成这个动作。',[
  ['temorauPotential','potential','接受帮助・可能','能请别人……','表示能够得到别人做某事的帮助。'],
  ['temorauPotentialPast','potentialPast','接受帮助・可能・过去','得以请别人……','表示过去得以获得别人做某事的帮助。'],
  ['temorauPotentialNegative','potentialNegative','接受帮助・可能・否定','无法请别人……','表示无法获得别人做某事的帮助。'],
  ['temorauPotentialNegativePast','potentialNegativePast','接受帮助・可能・否定过去','当时没能请别人……','表示过去未能获得别人做某事的帮助。'],
  ['temorauPoliteRequest','masenka','接受帮助・礼貌请求','能请您……吗','以询问能否获得帮助的方式，礼貌地请求对方做某事。'],
]);
Object.assign(CHAIN_FORM_SPECS.temorauPoliteRequest, {base:'temorauPotential',outputClass:'ichidan'});
family('compound.chain.potential-polite','可能与礼貌表达','potential','ichidan',voluntary,undefined,[
  ['potentialPolite','masu','可能・礼貌形','能……','用礼貌语体表示能够做某事。'],
  ['potentialPolitePast','masuPast','可能・礼貌过去','当时得以……','用礼貌语体表示过去得以做某事。'],
  ['potentialPoliteNegative','masuNegative','可能・礼貌否定','不能……','用礼貌语体表示无法做某事。'],
  ['potentialPoliteNegativePast','masuNegativePast','可能・礼貌否定过去','当时没能……','用礼貌语体表示过去未能做某事。'],
]);
family('compound.chain.desire-condition','愿望与条件','tai','i',voluntary,undefined,[
  ['desireBa','adjectiveBa','愿望・ば条件','如果想……','以某人的愿望作为条件，后面可以接建议或相应的安排。'],
]);
family('compound.chain.excess-request','过度与否定请求','sugiru','ichidan',excess,undefined,[
  ['sugiruNegativeRequest','naideKudasai','过度・否定请求','请不要过度……','提醒或请求对方控制做某事的程度。'],
]);
family('compound.chain.passive-completion','受身与遗憾','passive','ichidan',adverse,'当事人谈论别人对自己或自己的物品做了不希望发生的事。',[
  ['passiveCompletion','teshimau','受身・遗憾','会被……，令人遗憾','表示自己或自己的物品遭遇不希望发生的事情，并带有遗憾等情绪。'],
  ['passiveCompletionPast','teshimauPast','受身・遗憾・过去','被……了，令人遗憾','表示自己或自己的物品已经遭遇不希望发生的事情，并带有遗憾等情绪。'],
]);
family('compound.chain.permission-potential','接受允许的愿望与可能','causative','ichidan',voluntary,'说话人谈论能否得到对方的允许或安排，由自己完成该动作。',[
  ['causativeReceiveDesire','temorauDesire','使役・接受允许・愿望','希望获准……','表示希望得到对方的允许或安排，由自己做某事。'],
  ['causativeReceivePoliteRequest','temorauPoliteRequest','使役・许可・礼貌请求','能允许我……吗','礼貌地请求对方允许或安排自己做某事。'],
  ['causativeReceivePotential','temorauPotential','使役・接受允许・可能','能获准……','表示能够得到对方的允许或安排来做某事。'],
  ['causativeReceivePotentialPast','temorauPotentialPast','使役・接受允许・可能・过去','当时得以获准……','表示过去得以得到对方的允许或安排来做某事。'],
  ['causativeReceivePotentialNegative','temorauPotentialNegative','使役・接受允许・可能・否定','无法获准……','表示无法得到对方的允许或安排来做某事。'],
  ['causativeReceivePotentialNegativePast','temorauPotentialNegativePast','使役・接受允许・可能・否定过去','当时没能获准……','表示过去未能得到对方的允许或安排来做某事。'],
]);
family('compound.chain.potential-condition','可能与条件','potential','ichidan',voluntary,undefined,[
  ['potentialBa','ba','可能・ば条件','如果能……','以能够做某事作为条件。'],
  ['potentialTara','tara','可能・たら条件','如果能……／得以……之后','以能够做某事作为条件，或引出得以完成之后的事情。'],
]);

const familyRules = {
  '尝试与愿望':'先接「てみる」，再接「たい」；肯否与时态由最后的「たい」变化。',
  '受身与进行或状态':'先构成受身形，再接「ている」；肯否与时态由最后的「いる」变化。',
  '使役与接受允许':'先构成使役形，再接「てもらう」；过去形由最后的「もらう」变化。',
  '尝试与请求':'先构成「てみる」，再把末尾的「みる」接成「みてください」。',
  '尝试与条件':'先构成「てみる」，再把末尾的「みる」变为「みたら」。',
  '事先准备与请求':'先构成「ておく」，再把末尾的「おく」接成「おいてください」。',
  '事先准备与条件':'先构成「ておく」，再把末尾的「おく」变为题目要求的条件形。',
  '使役与许可请求':'先构成使役形，再把它变为て形并接「ください」。',
  '接受帮助与愿望':'先构成「てもらう」，再接「たい」；肯否与时态由「たい」变化。',
  '接受帮助的可能与请求':'先构成「てもらう」，再把「もらう」变为可能形；后续肯否、时态或礼貌请求接在「もらえる」之后。',
  '可能与礼貌表达':'先构成可能形，再按一段动词接「ます」及其肯否、时态变化。',
  '愿望与条件':'先接「たい」，再按い形容词的条件接续变为「たければ」。',
  '过度与否定请求':'先接「すぎる」，再把末尾按一段动词变为「すぎないでください」。',
  '受身与遗憾':'先构成受身形，再接「てしまう」；过去形由末尾的「しまう」变化。',
  '接受允许的愿望与可能':'先构成使役形并接「てもらう」，再接愿望或可能表达，最后完成题目要求的变化。',
  '可能与条件':'先构成可能形，再按一段动词变为题目要求的条件形。',
};
for (const spec of Object.values(CHAIN_FORM_SPECS)) spec.rule = familyRules[spec.familyTitle];
export const CHAIN_FORM_LABELS = Object.fromEntries(Object.entries(CHAIN_FORM_SPECS).map(([id,spec])=>[id,spec.title]));
export function chainOutputClass(spec, surface) {
  return spec.base === 'causative' && surface.endsWith('す') ? 'godan' : spec.outputClass;
}
export function chainIntermediate(spec, surface, reading = surface) {
  const cls = chainOutputClass(spec,surface);
  return {domain:cls === 'i' ? 'adjective' : 'verb',class:cls,surface,reading,iiFamily:false};
}
