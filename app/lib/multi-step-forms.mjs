// Each entry composes two existing forms. The continuation can itself have
// multiple steps; all consumers reuse that existing recipe instead of copying it.
const voluntary = ['書く','読む','話す','聞く','見る','食べる','飲む','買う','売る','作る','使う','行く','来る','くる','帰る','入る','出る','待つ','休む','遊ぶ','泳ぐ','走る','歩く','歌う','踊る','働く','手伝う','教える','習う','勉強する','する','借りる','貸す','開ける','閉める','選ぶ','運ぶ','送る','受ける'];
/** @type {Record<string, {base:string, tail:string, label:string, title:string, kcId:string, words:string[], rule:string, functionText:string, meaning:string}>} */
export const CHAIN_FORM_SPECS = {
  temiruDesirePast: { base:'temiru', tail:'taiPast', label:'試す・願望・過去', title:'尝试・愿望・过去',
    kcId:'compound.chain.temiru-desire-past', words:voluntary,
    rule:'先用「てみる」表示尝试，再接「たい」表达愿望，最后把「たい」变为过去形。',
    functionText:'曾想试着……', meaning:'表示过去想尝试做某事，不表示已经实际做过。' },
  passiveProgressivePast: { base:'passive', tail:'teiruPast', label:'受身・状態・過去', title:'受身・进行／状态・过去',
    kcId:'compound.chain.passive-progressive-past', words:['書く','読む','使う','作る','売る','買う','送る','運ぶ','開ける','閉める','教える','呼ぶ','選ぶ','直す','建てる','守る','調べる','愛する'],
    rule:'先构成受身形，再接「ている」表示进行或结果状态，最后变为过去形。',
    functionText:'当时正被……／当时处于被……的状态', meaning:'表示过去某个动作正在作用于对象，或对象处于该动作造成的状态。' },
  causativeReceivePast: { base:'causative', tail:'temorauPast', label:'使役・授受・過去', title:'使役・接受允许・过去',
    kcId:'compound.chain.causative-receive-past', words:voluntary,
    rule:'先构成使役形，再接「てもらう」表示接受对方的允许或安排，最后变为过去形。',
    functionText:'获准……／得到了做……的机会', meaning:'表示过去得到对方的允许或安排，因而能够做某事。' },
};
export const CHAIN_FORM_LABELS = Object.fromEntries(Object.entries(CHAIN_FORM_SPECS).map(([id,spec])=>[id,spec.title]));
export function chainOutputClass(spec, surface) {
  return spec.base === 'causative' && surface.endsWith('す') ? 'godan' : 'ichidan';
}
