"use client";

import { FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { allConfident, courseCountToSkillCount, emptySkillStats, makeRoundPlan, makeUniqueAssignments, migrateSplitCourseProgress, selectFocus, updateSkillStats } from "./lib/adaptive.mjs";
import { acceptedConjugations, classLabel, conjugate, explainClass, explainConjugation } from "./lib/conjugation.mjs";
import { createProfileExport, parseProfileImport } from "./lib/profile-transfer.mjs";

type VerbClass = "godan" | "ichidan" | "irregular";
type Form = "negative" | "past" | "te" | "masu" | "passive" | "potential" | "imperative" | "volitional" | "ba" | "nasai" | "prohibitive" | "causative" | "causativePassive" | "nakute" | "naide" | "zu" | "zuni" | "teshimau" | "chau" | "teoku" | "toku" | "negativePast" | "masuPast" | "masuNegative" | "masuNegativePast" | "passivePast" | "passiveNegative" | "passiveNegativePast" | "potentialPast" | "potentialNegative" | "potentialNegativePast" | "causativePast" | "causativeNegative" | "causativeNegativePast" | "causativePassivePast" | "causativePassiveNegative" | "causativePassiveNegativePast" | "passiveDesireNegativePast" | "teageru" | "temorau" | "tekureru" | "tekudasai" | "naideKudasai" | "teiru" | "teru" | "tearu" | "teoru" | "toru" | "tai" | "tehoshii" | "tara" | "temo" | "nagara" | "tsutsu" | "nakerebaNaranai" | "nakutewaIkenai" | "naitoIkenai" | "tari" | "tewa" | "temoIi" | "nakutemoIi" | "masenka" | "youtosuru" | "temiru" | "teiku" | "teku" | "tekuru" | "tatte" | "sugiru" | "tagaru";
type ModeId = "classify" | "negative" | "past" | "te" | "giving" | "request" | "imperative" | "masu" | "aspect" | "passive" | "potential" | "volitional" | "desire" | "ba" | "tara" | "nasai" | "prohibitive" | "temo" | "concurrent" | "obligation" | "listing" | "permission" | "youtosuru" | "temiru" | "causative" | "causativePassive" | "nakuteNaide" | "zuZuni" | "teshimauChau" | "teokuToku" | "direction" | "tatte" | "sugiru" | "tagaru" | "basicCompound" | "voiceCompound";
type PracticeMode = "adaptive" | ModeId;
type Result = "correct" | "incorrect" | "revealed" | null;
type Verb = { surface: string; reading: string; meaning: string; class: VerbClass };
type Course = { id: ModeId; title: string; lesson: string; url: string; forms: readonly Form[] };
type Skill = { id: string; order: number; courseIndex: number; courseId: ModeId; form: Form | null; bucket: string; label: string };
type SkillStats = ReturnType<typeof emptySkillStats>;
type Profile = { version: 4; date: string; attempted: number; correct: number; streak: number; introducedSkillCount: number; rotation: number; bySkill: Record<string, SkillStats> };

const VERBS: Verb[] = [
  ["書く", "かく", "写；书写", "godan"], ["弾く", "ひく", "弹奏", "godan"], ["話す", "はなす", "说；交谈", "godan"], ["待つ", "まつ", "等待", "godan"], ["死ぬ", "しぬ", "死亡", "godan"], ["遊ぶ", "あそぶ", "玩耍", "godan"], ["読む", "よむ", "阅读", "godan"], ["買う", "かう", "购买", "godan"], ["切る", "きる", "切；剪", "godan"], ["泳ぐ", "およぐ", "游泳", "godan"], ["行く", "いく", "去；前往", "godan"], ["飲む", "のむ", "喝", "godan"], ["聞く", "きく", "听；询问", "godan"], ["帰る", "かえる", "回去", "godan"], ["立つ", "たつ", "站立", "godan"], ["呼ぶ", "よぶ", "呼叫", "godan"], ["急ぐ", "いそぐ", "赶快", "godan"], ["取る", "とる", "拿取", "godan"], ["会う", "あう", "见面", "godan"],
  ["歌う", "うたう", "唱歌", "godan"], ["使う", "つかう", "使用", "godan"], ["笑う", "わらう", "笑", "godan"], ["働く", "はたらく", "工作", "godan"], ["歩く", "あるく", "走路", "godan"], ["置く", "おく", "放置", "godan"], ["脱ぐ", "ぬぐ", "脱下", "godan"], ["騒ぐ", "さわぐ", "吵闹", "godan"], ["貸す", "かす", "借出", "godan"], ["消す", "けす", "关闭；消除", "godan"], ["持つ", "もつ", "持有", "godan"], ["打つ", "うつ", "敲打", "godan"], ["選ぶ", "えらぶ", "选择", "godan"], ["飛ぶ", "とぶ", "飞", "godan"], ["住む", "すむ", "居住", "godan"], ["休む", "やすむ", "休息", "godan"], ["走る", "はしる", "奔跑", "godan"], ["知る", "しる", "知道", "godan"], ["入る", "はいる", "进入", "godan"], ["作る", "つくる", "制作", "godan"], ["売る", "うる", "售卖", "godan"], ["習う", "ならう", "学习；练习", "godan"],
  ["言う", "いう", "说", "godan"], ["思う", "おもう", "想；认为", "godan"], ["払う", "はらう", "支付", "godan"], ["洗う", "あらう", "清洗", "godan"], ["手伝う", "てつだう", "帮忙", "godan"], ["もらう", "もらう", "得到", "godan"], ["拾う", "ひろう", "捡；拾", "godan"], ["向かう", "むかう", "前往；面向", "godan"], ["違う", "ちがう", "不同；不对", "godan"], ["間に合う", "まにあう", "赶得上", "godan"],
  ["描く", "えがく", "描绘", "godan"], ["咲く", "さく", "开花", "godan"], ["着く", "つく", "到达", "godan"], ["届く", "とどく", "送达；够得着", "godan"], ["泣く", "なく", "哭", "godan"], ["動く", "うごく", "移动；运转", "godan"], ["磨く", "みがく", "刷；磨", "godan"], ["焼く", "やく", "烤；烧", "godan"], ["開く", "あく", "打开；开放", "godan"],
  ["注ぐ", "そそぐ", "倒入；注入", "godan"], ["防ぐ", "ふせぐ", "防止", "godan"], ["稼ぐ", "かせぐ", "挣钱", "godan"],
  ["出す", "だす", "拿出；提交", "godan"], ["直す", "なおす", "修理；改正", "godan"], ["渡す", "わたす", "交给", "godan"], ["返す", "かえす", "归还", "godan"], ["押す", "おす", "按；推", "godan"], ["探す", "さがす", "寻找", "godan"], ["落とす", "おとす", "弄掉；丢失", "godan"], ["指す", "さす", "指；指向", "godan"], ["起こす", "おこす", "叫醒；引起", "godan"],
  ["勝つ", "かつ", "获胜", "godan"], ["役立つ", "やくだつ", "有用；起作用", "godan"],
  ["運ぶ", "はこぶ", "搬运", "godan"], ["並ぶ", "ならぶ", "排队；排列", "godan"], ["学ぶ", "まなぶ", "学习", "godan"], ["喜ぶ", "よろこぶ", "高兴", "godan"],
  ["頼む", "たのむ", "拜托；点单", "godan"], ["楽しむ", "たのしむ", "享受；期待", "godan"], ["進む", "すすむ", "前进；进展", "godan"], ["申し込む", "もうしこむ", "申请；报名", "godan"], ["包む", "つつむ", "包裹", "godan"],
  ["分かる", "わかる", "明白", "godan"], ["終わる", "おわる", "结束", "godan"], ["始まる", "はじまる", "开始", "godan"], ["変わる", "かわる", "改变", "godan"], ["戻る", "もどる", "返回", "godan"], ["座る", "すわる", "坐", "godan"], ["困る", "こまる", "为难；困扰", "godan"], ["送る", "おくる", "发送；送行", "godan"], ["渡る", "わたる", "渡过", "godan"], ["乗る", "のる", "乘坐", "godan"], ["降る", "ふる", "下（雨雪）", "godan"], ["守る", "まもる", "遵守；保护", "godan"], ["眠る", "ねむる", "睡眠", "godan"], ["喋る", "しゃべる", "说话；聊天", "godan"], ["要る", "いる", "需要", "godan"], ["残る", "のこる", "留下；剩余", "godan"], ["曲がる", "まがる", "转弯；弯曲", "godan"],
  ["食べる", "たべる", "吃", "ichidan"], ["見る", "みる", "看", "ichidan"], ["起きる", "おきる", "起床", "ichidan"], ["寝る", "ねる", "睡觉", "ichidan"], ["教える", "おしえる", "教；告诉", "ichidan"], ["開ける", "あける", "打开", "ichidan"], ["閉める", "しめる", "关闭", "ichidan"], ["借りる", "かりる", "借入", "ichidan"], ["浴びる", "あびる", "淋；沐浴", "ichidan"],
  ["忘れる", "わすれる", "忘记", "ichidan"], ["覚える", "おぼえる", "记住", "ichidan"], ["出る", "でる", "出去", "ichidan"], ["着る", "きる", "穿", "ichidan"], ["信じる", "しんじる", "相信", "ichidan"], ["調べる", "しらべる", "调查", "ichidan"], ["始める", "はじめる", "开始", "ichidan"], ["続ける", "つづける", "继续", "ichidan"], ["逃げる", "にげる", "逃跑", "ichidan"], ["助ける", "たすける", "帮助", "ichidan"],
  ["いる", "いる", "在；有（生物）", "ichidan"], ["できる", "できる", "能够；完成", "ichidan"], ["考える", "かんがえる", "思考；考虑", "ichidan"], ["答える", "こたえる", "回答", "ichidan"], ["決める", "きめる", "决定", "ichidan"], ["止める", "とめる", "停止；阻止", "ichidan"], ["見せる", "みせる", "给……看", "ichidan"], ["受ける", "うける", "接受；参加", "ichidan"], ["付ける", "つける", "附上；打开", "ichidan"], ["集める", "あつめる", "收集", "ichidan"], ["捨てる", "すてる", "丢弃", "ichidan"], ["疲れる", "つかれる", "疲劳", "ichidan"], ["遅れる", "おくれる", "迟到；延误", "ichidan"], ["降りる", "おりる", "下车；下来", "ichidan"], ["迎える", "むかえる", "迎接", "ichidan"], ["伝える", "つたえる", "传达", "ichidan"], ["生まれる", "うまれる", "出生", "ichidan"], ["壊れる", "こわれる", "坏；损坏", "ichidan"], ["足りる", "たりる", "足够", "ichidan"], ["似る", "にる", "相似", "ichidan"], ["過ぎる", "すぎる", "经过；超过", "ichidan"], ["落ちる", "おちる", "掉落", "ichidan"], ["増える", "ふえる", "增加", "ichidan"], ["変える", "かえる", "改变", "ichidan"], ["届ける", "とどける", "送到；申报", "ichidan"], ["片付ける", "かたづける", "收拾；整理", "ichidan"], ["出かける", "でかける", "出门", "ichidan"],
  ["する", "する", "做", "irregular"], ["来る", "くる", "来", "irregular"], ["勉強する", "べんきょうする", "学习", "irregular"], ["料理する", "りょうりする", "做饭", "irregular"], ["運転する", "うんてんする", "驾驶", "irregular"], ["散歩する", "さんぽする", "散步", "irregular"], ["説明する", "せつめいする", "说明", "irregular"], ["予約する", "よやくする", "预约", "irregular"],
  ["質問する", "しつもんする", "提问", "irregular"], ["電話する", "でんわする", "打电话", "irregular"], ["結婚する", "けっこんする", "结婚", "irregular"], ["旅行する", "りょこうする", "旅行", "irregular"], ["買い物する", "かいものする", "购物", "irregular"], ["掃除する", "そうじする", "打扫", "irregular"], ["洗濯する", "せんたくする", "洗衣服", "irregular"], ["練習する", "れんしゅうする", "练习", "irregular"], ["心配する", "しんぱいする", "担心", "irregular"], ["準備する", "じゅんびする", "准备", "irregular"], ["連絡する", "れんらくする", "联系", "irregular"], ["確認する", "かくにんする", "确认", "irregular"], ["紹介する", "しょうかいする", "介绍", "irregular"], ["案内する", "あんないする", "带路；引导", "irregular"], ["到着する", "とうちゃくする", "到达", "irregular"], ["出発する", "しゅっぱつする", "出发", "irregular"], ["参加する", "さんかする", "参加", "irregular"], ["利用する", "りようする", "利用；使用", "irregular"],
].map(([surface, reading, meaning, verbClass]) => ({ surface, reading, meaning, class: verbClass as VerbClass }));

const voiceForms = ["passivePast", "passiveNegative", "passiveNegativePast", "potentialPast", "potentialNegative", "potentialNegativePast", "causativePast", "causativeNegative", "causativeNegativePast", "causativePassivePast", "causativePassiveNegative", "causativePassiveNegativePast", "passiveDesireNegativePast"] as const;
const lessonUrl = (section: string, lesson: number) => `https://yoku.bi/${section}/Lesson${lesson}.html`;
const COURSES: Course[] = [
  { id: "classify", title: "动词分类", lesson: "04", url: lessonUrl("Section1/Part1", 4), forms: [] },
  { id: "negative", title: "否定形", lesson: "07", url: lessonUrl("Section1/Part1", 7), forms: ["negative"] },
  { id: "past", title: "过去形", lesson: "09", url: lessonUrl("Section1/Part1", 9), forms: ["past"] },
  { id: "te", title: "て形", lesson: "10", url: lessonUrl("Section1/Part1", 10), forms: ["te"] },
  { id: "giving", title: "て形授受补助", lesson: "11", url: lessonUrl("Section1/Part1", 11), forms: ["teageru", "temorau", "tekureru"] },
  { id: "request", title: "てください・ないでください", lesson: "12", url: lessonUrl("Section1/Part1", 12), forms: ["tekudasai", "naideKudasai"] },
  { id: "imperative", title: "命令形", lesson: "12", url: lessonUrl("Section1/Part1", 12), forms: ["imperative"] },
  { id: "masu", title: "ます形", lesson: "17", url: lessonUrl("Section1/Part1", 17), forms: ["masu"] },
  { id: "aspect", title: "ている・てある", lesson: "22", url: lessonUrl("Section1/Part2", 22), forms: ["teiru", "teru", "tearu", "teoru", "toru"] },
  { id: "passive", title: "受身形", lesson: "24", url: lessonUrl("Section1/Part2", 24), forms: ["passive"] },
  { id: "potential", title: "可能形", lesson: "25", url: lessonUrl("Section1/Part2", 25), forms: ["potential"] },
  { id: "volitional", title: "意向形", lesson: "26", url: lessonUrl("Section1/Part2", 26), forms: ["volitional"] },
  { id: "desire", title: "たい・てほしい", lesson: "26", url: lessonUrl("Section1/Part2", 26), forms: ["tai", "tehoshii"] },
  { id: "ba", title: "ば形", lesson: "27", url: lessonUrl("Section1/Part2", 27), forms: ["ba"] },
  { id: "tara", title: "たら形", lesson: "27", url: lessonUrl("Section1/Part2", 27), forms: ["tara"] },
  { id: "nasai", title: "なさい命令", lesson: "32", url: lessonUrl("Section2/Part3", 32), forms: ["nasai"] },
  { id: "prohibitive", title: "禁止形（〜な）", lesson: "32", url: lessonUrl("Section2/Part3", 32), forms: ["prohibitive"] },
  { id: "temo", title: "ても・でも", lesson: "37", url: lessonUrl("Section2/Part3", 37), forms: ["temo"] },
  { id: "concurrent", title: "ながら・つつ", lesson: "38", url: lessonUrl("Section2/Part3", 38), forms: ["nagara", "tsutsu"] },
  { id: "obligation", title: "必须表达", lesson: "44", url: lessonUrl("Section2/Part3", 44), forms: ["nakerebaNaranai", "nakutewaIkenai", "naitoIkenai"] },
  { id: "listing", title: "たり・ては", lesson: "45", url: lessonUrl("Section2/Part4", 45), forms: ["tari", "tewa"] },
  { id: "permission", title: "许可・ませんか", lesson: "48", url: lessonUrl("Section2/Part4", 48), forms: ["temoIi", "nakutemoIi", "masenka"] },
  { id: "youtosuru", title: "ようとする", lesson: "49", url: lessonUrl("Section2/Part4", 49), forms: ["youtosuru"] },
  { id: "temiru", title: "てみる", lesson: "50", url: lessonUrl("Section2/Part4", 50), forms: ["temiru"] },
  { id: "causative", title: "使役形", lesson: "53", url: lessonUrl("Section2/Part4", 53), forms: ["causative"] },
  { id: "causativePassive", title: "使役受身形", lesson: "53", url: lessonUrl("Section2/Part4", 53), forms: ["causativePassive"] },
  { id: "nakuteNaide", title: "なくて・ないで", lesson: "56", url: lessonUrl("Section2/Part4", 56), forms: ["nakute", "naide"] },
  { id: "zuZuni", title: "ず・ずに", lesson: "56", url: lessonUrl("Section2/Part4", 56), forms: ["zu", "zuni"] },
  { id: "teshimauChau", title: "てしまう・ちゃう", lesson: "57", url: lessonUrl("Section2/Part4", 57), forms: ["teshimau", "chau"] },
  { id: "teokuToku", title: "ておく・とく", lesson: "57", url: lessonUrl("Section2/Part4", 57), forms: ["teoku", "toku"] },
  { id: "direction", title: "ていく・てくる", lesson: "58", url: lessonUrl("Section2/Part4", 58), forms: ["teiku", "teku", "tekuru"] },
  { id: "tatte", title: "たって", lesson: "59", url: lessonUrl("Section2/Part4", 59), forms: ["tatte"] },
  { id: "sugiru", title: "すぎる", lesson: "61", url: lessonUrl("Section2/Part4", 61), forms: ["sugiru"] },
  { id: "tagaru", title: "たがる", lesson: "63", url: lessonUrl("Section2/Part4", 63), forms: ["tagaru"] },
  { id: "basicCompound", title: "基础复合活用", lesson: "复习", url: lessonUrl("Section1/Part1", 17), forms: ["negativePast", "masuPast", "masuNegative", "masuNegativePast"] },
  { id: "voiceCompound", title: "态的复合活用", lesson: "复习", url: lessonUrl("Section2/Part4", 53), forms: voiceForms },
];

const FORM_LABELS: Record<Form, string> = {
  negative: "否定形", past: "过去形", te: "て形", masu: "ます形", passive: "受身形", potential: "可能形", imperative: "命令形", volitional: "意向形", ba: "ば形", nasai: "なさい命令", prohibitive: "禁止形", causative: "使役形", causativePassive: "使役受身形", nakute: "なくて形", naide: "ないで形", zu: "ず形", zuni: "ずに形", teshimau: "てしまう", chau: "ちゃう・じゃう", teoku: "ておく", toku: "とく・どく", negativePast: "否定过去形", masuPast: "礼貌过去形", masuNegative: "礼貌否定形", masuNegativePast: "礼貌否定过去形", passivePast: "受身・过去形", passiveNegative: "受身・否定形", passiveNegativePast: "受身・否定过去形", potentialPast: "可能・过去形", potentialNegative: "可能・否定形", potentialNegativePast: "可能・否定过去形", causativePast: "使役・过去形", causativeNegative: "使役・否定形", causativeNegativePast: "使役・否定过去形", causativePassivePast: "使役受身・过去形", causativePassiveNegative: "使役受身・否定形", causativePassiveNegativePast: "使役受身・否定过去形",
  passiveDesireNegativePast: "受身・愿望・否定过去", teageru: "てあげる", temorau: "てもらう", tekureru: "てくれる", tekudasai: "てください", naideKudasai: "ないでください", teiru: "ている", teru: "てる", tearu: "てある", teoru: "ておる", toru: "とる・どる", tai: "たい", tehoshii: "てほしい", tara: "たら形", temo: "ても・でも", nagara: "ながら", tsutsu: "つつ", nakerebaNaranai: "なければならない", nakutewaIkenai: "なくてはいけない", naitoIkenai: "ないといけない", tari: "たり形", tewa: "ては・では", temoIi: "てもいい", nakutemoIi: "なくてもいい", masenka: "ませんか", youtosuru: "ようとする", temiru: "てみる", teiku: "ていく", teku: "てく", tekuru: "てくる", tatte: "たって・だって", sugiru: "すぎる", tagaru: "たがる",
};
const BUCKET_LABELS: Record<string, string> = { ichidan: "一段动词", irregular: "不规则动词", "godan-ru": "る结尾五段", "godan-other": "其他五段", "godan-u": "う结尾五段", godan: "五段动词", "godan-utturu": "う・つ・る音便", "godan-bumnu": "ぶ・む・ぬ音便", "godan-く": "く音便", "godan-ぐ": "ぐ音便", "godan-す": "す音便", iku: "行く例外" };
const SESSION_LENGTH = 12;
const STORAGE_KEY = "katsuyo-practice-profile-v4";
const LEGACY_PROFILE_KEY_V3 = "katsuyo-practice-profile-v3";
const LEGACY_PROFILE_KEY_V2 = "katsuyo-practice-profile-v2";
const TRANSITIVE_VERBS = new Set(["書く", "弾く", "話す", "待つ", "読む", "買う", "切る", "飲む", "聞く", "取る", "使う", "置く", "脱ぐ", "貸す", "消す", "持つ", "打つ", "選ぶ", "作る", "売る", "習う", "言う", "払う", "洗う", "手伝う", "拾う", "描く", "磨く", "焼く", "注ぐ", "防ぐ", "稼ぐ", "出す", "直す", "渡す", "返す", "押す", "探す", "落とす", "指す", "起こす", "運ぶ", "学ぶ", "頼む", "申し込む", "包む", "送る", "守る", "食べる", "見る", "教える", "開ける", "閉める", "借りる", "浴びる", "忘れる", "覚える", "着る", "信じる", "調べる", "始める", "続ける", "助ける", "考える", "決める", "止める", "見せる", "受ける", "付ける", "集める", "捨てる", "迎える", "伝える", "変える", "届ける", "片付ける", "する", "勉強する", "料理する", "運転する", "説明する", "予約する", "質問する", "掃除する", "洗濯する", "練習する", "心配する", "準備する", "連絡する", "確認する", "紹介する", "案内する", "利用する"]);

function clockNow() { return Date.now(); }
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function emptyProfile(): Profile { return { version: 4, date: todayKey(), attempted: 0, correct: 0, streak: 0, introducedSkillCount: 1, rotation: 0, bySkill: {} }; }
function normalize(value: string) { return value.normalize("NFKC").replace(/[\s。．.！!？?]/g, ""); }

function ruleBucket(verb: Verb, form: Form | null, classify = false) {
  if (classify) return verb.class === "irregular" ? "irregular" : verb.class === "ichidan" ? "ichidan" : verb.surface.endsWith("る") ? "godan-ru" : "godan-other";
  if (verb.class !== "godan") return verb.class;
  if ((form === "past" || form === "te") && verb.surface === "行く") return "iku";
  if (["past", "te", "teshimau", "chau", "teoku", "toku", "teageru", "temorau", "tekureru", "tekudasai", "teiru", "teru", "tearu", "teoru", "toru", "tehoshii", "temo", "tewa", "temoIi", "temiru", "teiku", "teku", "tekuru", "tara", "tari", "tatte"].includes(form ?? "")) {
    const ending = verb.surface.at(-1) ?? "";
    return ["う", "つ", "る"].includes(ending) ? "godan-utturu" : ["ぶ", "む", "ぬ"].includes(ending) ? "godan-bumnu" : `godan-${ending}`;
  }
  if (["negative", "passive", "causative", "causativePassive", "nakute", "naide", "zu", "zuni", "naideKudasai", "nakutemoIi", "nakerebaNaranai", "nakutewaIkenai", "naitoIkenai"].includes(form ?? "")) return verb.surface.endsWith("う") ? "godan-u" : "godan-other";
  return "godan";
}
function eligibleFor(verb: Verb, form: Form | null) { return form !== "tearu" || TRANSITIVE_VERBS.has(verb.surface); }

const ALL_SKILLS: Skill[] = (() => {
  const result: Skill[] = []; let order = 0;
  COURSES.forEach((course, courseIndex) => {
    const forms: (Form | null)[] = course.id === "classify" ? [null] : [...course.forms];
    forms.forEach((form) => [...new Set(VERBS.filter((verb) => eligibleFor(verb, form)).map((verb) => ruleBucket(verb, form, course.id === "classify")))].forEach((bucket) => {
      const label = `${form ? FORM_LABELS[form] : "动词分类"} · ${BUCKET_LABELS[bucket] ?? bucket}`;
      result.push({ id: `${course.id}:${form ?? "classify"}:${bucket}`, order: order++, courseIndex, courseId: course.id, form, bucket, label });
    }));
  });
  return result;
})();
const skillsOf = (courseId: ModeId) => ALL_SKILLS.filter((skill) => skill.courseId === courseId);
const progressOf = (courseId: ModeId, profile: Profile) => { const skills = skillsOf(courseId).filter((skill) => skill.order < profile.introducedSkillCount); return skills.length ? skills.reduce((sum, skill) => sum + (profile.bySkill[skill.id]?.confidence ?? 0), 0) / skills.length : 0; };
const matches = (verb: Verb, skill: Skill) => eligibleFor(verb, skill.form) && ruleBucket(verb, skill.form, skill.courseId === "classify") === skill.bucket;
function getVerb(skill: Skill, index: number, seed: number) { const pool = VERBS.filter((verb) => matches(verb, skill)); return pool[(index * 5 + seed * 7 + skill.order * 3) % pool.length] ?? VERBS[0]; }
function makePlan(mode: PracticeMode, profile: Profile) { const skills = mode === "adaptive" ? ALL_SKILLS.slice(0, profile.introducedSkillCount) : skillsOf(mode); const focus = selectFocus(skills, profile.bySkill) as Skill | null; return { focus, plan: makeRoundPlan(focus, skills, SESSION_LENGTH, profile.rotation) as Skill[] }; }

function loadProfile(): Profile {
  const fresh = emptyProfile();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<Profile>;
      if (parsed.version === 4) return { ...fresh, ...parsed, date: todayKey(), attempted: parsed.date === todayKey() ? parsed.attempted ?? 0 : 0, correct: parsed.date === todayKey() ? parsed.correct ?? 0 : 0, streak: parsed.date === todayKey() ? parsed.streak ?? 0 : 0, introducedSkillCount: Math.min(Math.max(parsed.introducedSkillCount ?? 1, 1), ALL_SKILLS.length), bySkill: parsed.bySkill ?? {} };
    }
    const legacyV3 = localStorage.getItem(LEGACY_PROFILE_KEY_V3);
    if (legacyV3) {
      const parsed = JSON.parse(legacyV3) as { version?: number; date?: string; attempted?: number; correct?: number; streak?: number; introducedCount?: number; rotation?: number; bySkill?: Record<string, SkillStats> };
      if (parsed.version === 3) {
        const profile: Profile = { ...fresh, date: todayKey(), attempted: parsed.date === todayKey() ? parsed.attempted ?? 0 : 0, correct: parsed.date === todayKey() ? parsed.correct ?? 0 : 0, streak: parsed.date === todayKey() ? parsed.streak ?? 0 : 0, introducedSkillCount: Math.min(courseCountToSkillCount(parsed.introducedCount, ALL_SKILLS), ALL_SKILLS.length), rotation: parsed.rotation ?? 0, bySkill: parsed.bySkill ?? {} };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
        return profile;
      }
    }
    const legacyV2 = localStorage.getItem(LEGACY_PROFILE_KEY_V2);
    if (legacyV2) {
      const parsed = JSON.parse(legacyV2) as { version?: number; date?: string; attempted?: number; correct?: number; streak?: number; introducedCount?: number; rotation?: number; bySkill?: Record<string, SkillStats> };
      if (parsed.version === 2) {
        const migrated = migrateSplitCourseProgress(parsed.introducedCount, parsed.bySkill);
        const profile: Profile = { ...fresh, date: todayKey(), attempted: parsed.date === todayKey() ? parsed.attempted ?? 0 : 0, correct: parsed.date === todayKey() ? parsed.correct ?? 0 : 0, streak: parsed.date === todayKey() ? parsed.streak ?? 0 : 0, introducedSkillCount: Math.min(courseCountToSkillCount(migrated.introducedCount, ALL_SKILLS), ALL_SKILLS.length), rotation: parsed.rotation ?? 0, bySkill: migrated.bySkill };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
        return profile;
      }
    }
    const legacy = localStorage.getItem("katsuyo-practice-stats-v1");
    if (legacy) { const old = JSON.parse(legacy); if (old.date === todayKey()) return { ...fresh, attempted: old.attempted ?? 0, correct: old.correct ?? 0, streak: old.streak ?? 0 }; }
  } catch { /* Invalid local data should not block practice. */ }
  return fresh;
}

function hintFor(verb: Verb, form: Form | null) {
  if (!form) return "一段动词一定以 る 结尾，但以 る 结尾的不一定是一段动词。";
  if (verb.class === "irregular") return "这是不规则动词，回忆它的固定变化。";
  if (["past", "te"].includes(form)) return verb.class === "ichidan" ? "一段：去掉 る，再接目标词尾。" : "五段的过去形和て形使用同一组音便规律。";
  return explainConjugation(verb.surface, verb.class, form).rule;
}

export default function Home() {
  const [mode, setMode] = useState<PracticeMode>("adaptive");
  const [profile, setProfile] = useState<Profile>(() => emptyProfile());
  const profileRef = useRef(profile);
  const firstPlan = makePlan("adaptive", profile);
  const [roundPlan, setRoundPlan] = useState<Skill[]>(firstPlan.plan);
  const [focusSkill, setFocusSkill] = useState<Skill | null>(firstPlan.focus);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [seed, setSeed] = useState(1);
  const [answer, setAnswer] = useState("");
  const [selectedClass, setSelectedClass] = useState<VerbClass | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [hintShown, setHintShown] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [finished, setFinished] = useState(false);
  const [unlocked, setUnlocked] = useState<string | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [transferNotice, setTransferNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const progressTriggerRef = useRef<HTMLButtonElement>(null);
  const progressCloseRef = useRef<HTMLButtonElement>(null);
  const startedAt = useRef(0);
  const roundQuestions = useMemo(() => {
    const available = mode === "adaptive" ? ALL_SKILLS.slice(0, profile.introducedSkillCount) : skillsOf(mode);
    return makeUniqueAssignments(roundPlan, {
      seed,
      alternativesFor: (preferred: Skill, index: number) => {
        const rotate = (items: Skill[]) => items.length ? [...items.slice(index % items.length), ...items.slice(0, index % items.length)] : [];
        return [...rotate(available.filter((item) => item.courseId === preferred.courseId)), ...rotate(available.filter((item) => item.courseId !== preferred.courseId))];
      },
      candidatesFor: (item: Skill) => VERBS.filter((candidate) => matches(candidate, item)),
      keyOf: (item: Skill, candidate: Verb) => `${item.form ?? "classify"}:${candidate.surface}`,
    }) as { item: Skill; candidate: Verb }[];
  }, [mode, profile.introducedSkillCount, roundPlan, seed]);
  const currentQuestion = roundQuestions[questionIndex];
  const skill = currentQuestion?.item ?? focusSkill ?? ALL_SKILLS[0];
  const course = COURSES[skill.courseIndex];
  const verb = currentQuestion?.candidate ?? getVerb(skill, questionIndex, seed);
  const form = skill.form;
  const detail = form ? explainConjugation(verb.surface, verb.class, form) : null;
  const detailSteps = detail && "steps" in detail && Array.isArray(detail.steps) ? detail.steps : null;
  const focusStats = focusSkill ? profile.bySkill[focusSkill.id] ?? emptySkillStats() : emptySkillStats();

  useEffect(() => { const loaded = loadProfile(); profileRef.current = loaded; startedAt.current = clockNow(); const next = makePlan("adaptive", loaded); requestAnimationFrame(() => { setProfile(loaded); setRoundPlan(next.plan); setFocusSkill(next.focus); }); }, []);
  useEffect(() => { if (!progressOpen) return; const oldOverflow = document.body.style.overflow; const progressTrigger = progressTriggerRef.current; document.body.style.overflow = "hidden"; progressCloseRef.current?.focus(); const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setProgressOpen(false); }; addEventListener("keydown", closeOnEscape); return () => { document.body.style.overflow = oldOverflow; removeEventListener("keydown", closeOnEscape); progressTrigger?.focus(); }; }, [progressOpen]);
  const save = useCallback((next: Profile) => { profileRef.current = next; setProfile(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }, []);
  const resetQuestion = useCallback(() => { setAnswer(""); setSelectedClass(null); setResult(null); setHintShown(false); startedAt.current = clockNow(); requestAnimationFrame(() => inputRef.current?.focus()); }, []);

  function grade(correct: boolean, revealed = false) {
    if (result) return;
    const old = profileRef.current.date === todayKey() ? profileRef.current : { ...profileRef.current, date: todayKey(), attempted: 0, correct: 0, streak: 0 };
    const stats = updateSkillStats(old.bySkill[skill.id], { correct, revealed, hintUsed: hintShown, responseMs: clockNow() - startedAt.current, answerLength: form ? conjugate(verb.reading, verb.class, form).length : verb.reading.length });
    save({ ...old, attempted: old.attempted + 1, correct: old.correct + (correct ? 1 : 0), streak: correct ? old.streak + 1 : 0, bySkill: { ...old.bySkill, [skill.id]: stats } });
    setResult(revealed ? "revealed" : correct ? "correct" : "incorrect");
    if (correct) setSessionCorrect((value) => value + 1);
  }
  function submit(event: FormEvent) { event.preventDefault(); if (!answer.trim() || !form || result) return; const accepted = [...acceptedConjugations(verb.surface, verb.class, form), ...acceptedConjugations(verb.reading, verb.class, form)].map(normalize); grade(accepted.includes(normalize(answer))); }
  function chooseClass(choice: VerbClass) { if (!result) { setSelectedClass(choice); grade(choice === verb.class); } }

  const finishRound = useCallback(() => {
    if (mode === "adaptive") { const current = profileRef.current; const included = ALL_SKILLS.slice(0, current.introducedSkillCount); if (current.introducedSkillCount < ALL_SKILLS.length && allConfident(included, current.bySkill)) { const next = ALL_SKILLS[current.introducedSkillCount]; const nextCourse = COURSES[next.courseIndex]; save({ ...current, introducedSkillCount: current.introducedSkillCount + 1 }); setUnlocked(`Lesson ${nextCourse.lesson} · ${next.label}`); } }
    setFinished(true);
  }, [mode, save]);
  const nextQuestion = useCallback(() => { if (questionIndex === SESSION_LENGTH - 1) finishRound(); else { setQuestionIndex((value) => value + 1); resetQuestion(); } }, [finishRound, questionIndex, resetQuestion]);
  useEffect(() => { if (progressOpen) return; const handler = (event: KeyboardEvent) => { if (event.isComposing || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return; const target = event.target as HTMLElement | null; if (target?.closest("input,textarea,select,[contenteditable='true']")) return; if (finished) { if (event.key !== "Enter" || target?.closest("a,button")) return; event.preventDefault(); document.querySelector<HTMLButtonElement>(".restart-button")?.click(); return; } if (!result && course.id === "classify" && ["1", "2", "3"].includes(event.key)) { event.preventDefault(); document.querySelector<HTMLButtonElement>(`[data-class-shortcut="${event.key}"]`)?.click(); return; } if (!result || event.key !== "Enter" || target?.closest("a,button")) return; event.preventDefault(); nextQuestion(); }; addEventListener("keydown", handler); return () => removeEventListener("keydown", handler); }, [course.id, finished, nextQuestion, progressOpen, result]);
  function start(nextMode: PracticeMode) { const current = { ...profileRef.current, rotation: profileRef.current.rotation + 1 }; save(current); const next = makePlan(nextMode, current); setMode(nextMode); setRoundPlan(next.plan); setFocusSkill(next.focus); setQuestionIndex(0); setSessionCorrect(0); setFinished(false); setUnlocked(null); setSeed((value) => value + 1); resetQuestion(); }
  function resetProgress() { if (!window.confirm("确定清除这台设备上的全部练习进度吗？")) return; localStorage.removeItem(LEGACY_PROFILE_KEY_V3); localStorage.removeItem(LEGACY_PROFILE_KEY_V2); localStorage.removeItem("katsuyo-practice-stats-v1"); const fresh = emptyProfile(); save(fresh); const next = makePlan("adaptive", fresh); setMode("adaptive"); setRoundPlan(next.plan); setFocusSkill(next.focus); setQuestionIndex(0); setSessionCorrect(0); setFinished(false); setUnlocked(null); resetQuestion(); }
  function exportProgress() {
    const blob = new Blob([JSON.stringify(createProfileExport(profileRef.current), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `katsuyo-dojo-progress-${todayKey()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setTransferNotice({ kind: "success", text: "练习数据已导出，可以在另一台设备上导入。" });
  }
  async function importProgress(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = parseProfileImport(JSON.parse(await file.text()), { today: todayKey(), skillIds: ALL_SKILLS.map((item) => item.id), maxSkills: ALL_SKILLS.length }) as Profile;
      if (!window.confirm("导入会覆盖这台设备当前的练习进度。确定继续吗？")) return;
      save(imported);
      const next = makePlan("adaptive", imported);
      setMode("adaptive"); setRoundPlan(next.plan); setFocusSkill(next.focus); setQuestionIndex(0); setSessionCorrect(0); setFinished(false); setUnlocked(null); setSeed((value) => value + 1); setAnswer(""); setSelectedClass(null); setResult(null); setHintShown(false); startedAt.current = clockNow();
      setTransferNotice({ kind: "success", text: "导入成功，练习进度已经恢复。" });
    } catch (error) {
      setTransferNotice({ kind: "error", text: error instanceof Error ? error.message : "无法读取这个备份文件。" });
    }
  }

  const focusPercent = Math.round(focusStats.confidence * 100);
  const currentPercent = Math.round((profile.bySkill[skill.id]?.confidence ?? 0) * 100);
  const introducedSkills = ALL_SKILLS.slice(0, profile.introducedSkillCount);
  const masteredSkillCount = introducedSkills.filter((item) => (profile.bySkill[item.id]?.confidence ?? 0) >= 1).length;
  const focusDisplayLabel = focusSkill
    ? focusSkill.form
      ? FORM_LABELS[focusSkill.form]
      : COURSES[focusSkill.courseIndex].title
    : course.title;
  const feedbackTitle = result === "correct" ? "正解！" : result === "revealed" ? "记住这个变化" : "差一点";
  return <main className="site-shell">
    <header className="topbar"><button className="brand" type="button" onClick={() => start("adaptive")}><span className="brand-mark">活</span><span><strong>活用道場</strong><small>ADAPTIVE KATSUYŌ</small></span></button><div className="daily-summary"><div><span>今日</span><strong>{profile.correct} / {profile.attempted}</strong></div><div><span>连续答对</span><strong>{profile.streak}</strong></div></div></header>
    <section className="practice-layout"><aside className="lesson-rail"><p className="eyebrow">YOKUBI 活用路线</p><h1>盯住最弱处，<br />练到会为止。</h1><p className="intro">系统根据当前表现聚焦一项规则。没有复习日程，也不会因为时间流逝改变进度。</p>
      <button type="button" className={`adaptive-entry ${mode === "adaptive" ? "active" : ""}`} onClick={() => start("adaptive")}><span className="adaptive-icon">自</span><span><strong>自适应训练</strong><small>{focusDisplayLabel}</small></span><b>{focusPercent}%</b></button>
      <button ref={progressTriggerRef} type="button" className="progress-trigger" onClick={() => setProgressOpen(true)} aria-haspopup="dialog"><span><b>规则进度</b><small>查看每条细分规则</small></span><strong>{masteredSkillCount}<i>/</i>{introducedSkills.length}</strong></button>
      <nav className="mode-list" aria-label="专项课程">{COURSES.map((item) => { const courseSkills = skillsOf(item.id); const introducedCourseSkills = courseSkills.filter((itemSkill) => itemSkill.order < profile.introducedSkillCount); const progress = progressOf(item.id, profile); const introduced = introducedCourseSkills.length > 0; const fullyIntroduced = introducedCourseSkills.length === courseSkills.length; const needsRecovery = introducedCourseSkills.some((s) => (profile.bySkill[s.id]?.bestConfidence ?? 0) >= 1 && (profile.bySkill[s.id]?.confidence ?? 0) < 1); const status = !introduced ? "未引入" : !fullyIntroduced ? `规则 ${introducedCourseSkills.length}/${courseSkills.length}` : progress >= 1 ? "已达标" : needsRecovery ? "需加强" : `${Math.round(progress * 100)}%`; return <button type="button" className={mode === item.id ? "active" : ""} onClick={() => start(item.id)} key={item.id}><span>L{item.lesson}</span><span className="course-name">{item.title}</span><i>{status}</i></button>; })}</nav><button type="button" className="reset-progress" onClick={resetProgress}>清除本地进度</button>
    </aside><section className="exercise-stage">{!finished ? <><div className="stage-meta"><span>第 {questionIndex + 1} 题 / {SESSION_LENGTH}</span><div className="progress-track"><span style={{ width: `${(questionIndex + 1) / SESSION_LENGTH * 100}%` }} /></div><button type="button" className="quiet-button" onClick={finishRound}>结束本轮</button></div>
      <div className="focus-panel"><div><span>{mode === "adaptive" ? "当前聚焦" : "专项弱点"}</span><strong>{focusDisplayLabel}</strong></div><div className="confidence-meter"><span style={{ width: `${focusPercent}%` }} /></div><b>{focusPercent}%</b></div>
      <article className="exercise-card" key={`${skill.id}-${questionIndex}-${seed}`}><div className="question-kicker"><span>Yokubi · L{course.lesson}</span><span>{form ? FORM_LABELS[form] : course.title}</span>{result && course.id !== "classify" && <span>{BUCKET_LABELS[skill.bucket]}</span>}</div><p className="instruction">{form ? <>请把下面的动词变为<strong>{FORM_LABELS[form]}</strong></> : "请选择这个动词所属的类别"}</p><div className="word-display"><ruby>{verb.surface}<rt>{verb.reading}</rt></ruby><span>{verb.meaning}</span></div>
      {course.id === "classify" ? <div className="class-options">{(["ichidan", "godan", "irregular"] as VerbClass[]).map((choice, index) => <button type="button" key={choice} disabled={Boolean(result)} data-class-shortcut={String(index + 1)} aria-keyshortcuts={String(index + 1)} className={`${selectedClass === choice ? "selected" : ""} ${result && choice === verb.class ? "choice-correct" : ""} ${selectedClass === choice && result === "incorrect" ? "choice-wrong" : ""}`} onClick={() => chooseClass(choice)}><small>{choice === "ichidan" ? "る脱落" : choice === "godan" ? "词尾移动" : "固定变化"}</small><strong>{classLabel(choice)}</strong><kbd aria-hidden="true">{index + 1}</kbd></button>)}</div> : <form onSubmit={submit}><label htmlFor="answer">你的答案</label><div className={`answer-row ${result ?? ""}`}><input ref={inputRef} id="answer" lang="ja" autoComplete="off" disabled={Boolean(result)} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="输入日语……" /><button type="submit" disabled={!answer.trim() || Boolean(result)}>检查答案</button></div><p className="answer-note">汉字或全假名答案均可</p></form>}
      {!result && <div className="assist-row"><button type="button" className="text-button" onClick={() => setHintShown((v) => !v)}>{hintShown ? "收起提示" : "看一条提示"}</button><button type="button" className="text-button" onClick={() => grade(false, true)}>不知道</button></div>}{hintShown && !result && <p className="hint-box">{hintFor(verb, form)}</p>}
      {result && <div className={`feedback ${result}`} role="status"><div className="feedback-copy"><strong>{feedbackTitle}</strong><p>{course.id === "classify" ? explainClass(verb) : detail?.rule}</p></div><div className="rule-line"><span>{verb.surface}</span><b>→</b>{course.id === "classify" ? <span className="answer-emphasis">{classLabel(verb.class)}</span> : detailSteps ? detailSteps.map((step: string, i: number) => <Fragment key={`${step}-${i}`}><span className={i === detailSteps.length - 1 ? "answer-emphasis" : ""}>{step}</span>{i < detailSteps.length - 1 && <b>→</b>}</Fragment>) : detail?.parts.map((part: string, i: number) => <span className={i === detail.parts.length - 1 ? "answer-emphasis" : ""} key={`${part}-${i}`}>{part}{i < detail.parts.length - 1 && <b className="joiner">＋</b>}</span>)}</div>{result === "incorrect" && course.id !== "classify" && <p className="your-answer">你的答案：{answer || "—"}</p>}<div className="feedback-meta"><span>本技能 {currentPercent}%</span><a href={course.url} target="_blank" rel="noreferrer">查看 Yokubi Lesson {course.lesson} ↗</a></div><button type="button" className="next-button" onClick={nextQuestion}>{questionIndex === SESSION_LENGTH - 1 ? "查看本轮结果" : "下一题"}<span><kbd>Enter</kbd> →</span></button></div>}{!result && <p className="keyboard-hint">{course.id === "classify" ? <><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> 选择答案</> : <><kbd>Enter</kbd> 检查答案</>}</p>}</article></> :
      <article className="completion-card"><p className="completion-jp">おつかれさま</p><span className="completion-label">本轮完成</span><div className="score"><strong>{sessionCorrect}</strong><span>/ {Math.min(questionIndex + (result ? 1 : 0), SESSION_LENGTH)}</span></div><p>{unlocked ? `新规则已引入：${unlocked}` : "下一轮会继续聚焦当前置信度最低的规则。"}</p><div className="completion-focus"><span>当前最弱项</span><strong>{selectFocus(mode === "adaptive" ? ALL_SKILLS.slice(0, profile.introducedSkillCount) : skillsOf(mode), profile.bySkill)?.label}</strong></div><button type="button" className="restart-button" onClick={() => start(mode)}>继续下一轮<span><kbd>Enter</kbd> →</span></button>{mode !== "adaptive" && <button type="button" className="back-adaptive" onClick={() => start("adaptive")}>返回自适应训练</button>}</article>}
      <footer className="source-note">课程编排参考 <a href="https://yoku.bi" target="_blank" rel="noreferrer">Yokubi</a>，自适应逻辑参考 kanabr · 本地学习记录 · CC BY 4.0</footer></section></section>
    {progressOpen && <div className="progress-overlay"><button type="button" className="progress-backdrop" onClick={() => setProgressOpen(false)} aria-label="关闭规则进度" /><section className="progress-drawer" role="dialog" aria-modal="true" aria-labelledby="progress-title"><header><div><p>LOCAL LEARNING PROFILE</p><h2 id="progress-title">规则进度</h2></div><button ref={progressCloseRef} type="button" onClick={() => setProgressOpen(false)} aria-label="关闭规则进度">关闭 <kbd>Esc</kbd></button></header><div className="progress-summary"><div><span>已达标</span><strong>{masteredSkillCount}</strong></div><div><span>已引入规则</span><strong>{introducedSkills.length}</strong></div><p>置信度由当前答题表现计算，不随时间自动变化。</p></div><section className="profile-transfer" aria-labelledby="profile-transfer-title"><div><h3 id="profile-transfer-title">更换设备</h3><p>导出一个 JSON 备份，在其他浏览器中导入即可恢复规则进度。</p></div><div className="transfer-actions"><button type="button" onClick={exportProgress}>导出数据</button><button type="button" onClick={() => importInputRef.current?.click()}>导入数据</button><input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={importProgress} /></div>{transferNotice && <p className={`transfer-notice ${transferNotice.kind}`} role="status">{transferNotice.text}</p>}</section><div className="course-progress-list">{COURSES.map((item) => { const courseSkills = skillsOf(item.id); const introducedCourseSkills = courseSkills.filter((itemSkill) => itemSkill.order < profile.introducedSkillCount); const introduced = introducedCourseSkills.length > 0; const fullyIntroduced = introducedCourseSkills.length === courseSkills.length; const coursePercent = Math.round(progressOf(item.id, profile) * 100); const isFocusCourse = focusSkill?.courseId === item.id; const courseStatus = !introduced ? "未引入" : fullyIntroduced ? `${coursePercent}%` : `${coursePercent}% · ${introducedCourseSkills.length}/${courseSkills.length}`; return <details key={item.id} open={isFocusCourse}><summary><span><small>L{item.lesson}</small><b>{item.title}</b></span><span>{courseStatus}<i aria-hidden="true">⌄</i></span></summary><div className="skill-progress-list">{courseSkills.map((itemSkill) => { const stats = profile.bySkill[itemSkill.id] ?? emptySkillStats(); const percent = Math.round(stats.confidence * 100); const isIntroduced = itemSkill.order < profile.introducedSkillCount; const isFocus = focusSkill?.id === itemSkill.id; const status = !isIntroduced ? "未引入" : isFocus ? "当前聚焦" : stats.confidence >= 1 ? "已达标" : stats.bestConfidence >= 1 ? "需加强" : stats.attempts === 0 ? "未练习" : "学习中"; return <div className={`skill-progress-row ${isFocus ? "focus" : ""}`} key={itemSkill.id}><div className="skill-progress-copy"><span>{itemSkill.label}</span><small>{status}{isIntroduced ? ` · ${stats.attempts} 次作答` : ""}</small></div><div className="skill-progress-value"><div><span style={{ width: `${isIntroduced ? percent : 0}%` }} /></div><b>{isIntroduced ? `${percent}%` : "—"}</b></div></div>; })}</div></details>; })}</div></section></div>}
  </main>;
}
