import { COMPOUND_FORM_LABELS } from "./compound-forms.mjs";
import { CHAIN_FORM_LABELS } from "./multi-step-forms.mjs";
import { ADJECTIVE_FORM_LABELS } from "./adjective-conjugation.mjs";

/** @type {Record<string,string>} */
export const FORM_LABELS = {
  negative: "普通体否定形", past: "普通体过去形", te: "て形", masu: "ます形", passive: "受身形", potential: "可能形", imperative: "命令形", volitional: "意向形", ba: "ば形", nasai: "なさい命令", prohibitive: "禁止形", causative: "使役形", causativePassive: "使役受身形", causativePassiveContracted: "使役受身缩约形", nakute: "なくて形", naide: "ないで形", zu: "ず形", zuni: "ずに形", teshimau: "てしまう", chau: "ちゃう・じゃう", teoku: "ておく", toku: "とく・どく", negativePast: "普通体否定过去形", masuPast: "礼貌过去形", masuNegative: "礼貌否定形", masuNegativePast: "礼貌否定过去形", passivePast: "受身・过去形", passiveNegative: "受身・否定形", passiveNegativePast: "受身・否定过去形", potentialPast: "可能・过去形", potentialNegative: "可能・否定形", potentialNegativePast: "可能・否定过去形", causativePast: "使役・过去形", causativeNegative: "使役・否定形", causativeNegativePast: "使役・否定过去形", causativePassivePast: "使役受身・过去形", causativePassiveNegative: "使役受身・否定形", causativePassiveNegativePast: "使役受身・否定过去形",
  passiveDesireNegativePast: "受身・愿望・否定过去", teageru: "てあげる", temorau: "てもらう", tekureru: "てくれる", tekudasai: "てください", naideKudasai: "ないでください", teiru: "ている", teru: "てる", tearu: "てある", teoru: "ておる", toru: "とる・どる", tai: "たい", tehoshii: "てほしい", tara: "たら形", temo: "ても・でも", nagara: "ながら", tsutsu: "つつ", nakerebaNaranai: "なければならない", nakutewaIkenai: "なくてはいけない", naitoIkenai: "ないといけない", tari: "たり形", tewa: "ては・では", temoIi: "てもいい", nakutemoIi: "なくてもいい", masenka: "ませんか", youtosuru: "ようとする", temiru: "てみる", teiku: "ていく", teku: "てく", tekuru: "てくる", tatte: "たって・だって", sugiru: "すぎる", tagaru: "たがる",
  ...COMPOUND_FORM_LABELS, ...CHAIN_FORM_LABELS,
  ...ADJECTIVE_FORM_LABELS,
};
