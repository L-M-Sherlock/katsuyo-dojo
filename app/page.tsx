"use client";

import { FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { advanceIntroductions, balanceComponentsForCourse, componentConfidence, emptySkillStats, isComponentMastered, makeRoundPlan, makeUniqueAssignments, rankExercisesForFocus, selectFocus, updateKnowledgeStats } from "./lib/adaptive.mjs";
import { classLabel, conjugate, explainConjugation } from "./lib/conjugation.mjs";
import { buildKnowledgeModel, deriveExercise, diagnoseConjugation, KC_FAMILY_LABELS } from "./lib/knowledge-model.mjs";
import { createProfileExport, parseProfileImport } from "./lib/profile-transfer.mjs";

type VerbClass = "godan" | "ichidan" | "irregular";
type Form = "negative" | "past" | "te" | "masu" | "passive" | "potential" | "imperative" | "volitional" | "ba" | "nasai" | "prohibitive" | "causative" | "causativePassive" | "nakute" | "naide" | "zu" | "zuni" | "teshimau" | "chau" | "teoku" | "toku" | "negativePast" | "masuPast" | "masuNegative" | "masuNegativePast" | "passivePast" | "passiveNegative" | "passiveNegativePast" | "potentialPast" | "potentialNegative" | "potentialNegativePast" | "causativePast" | "causativeNegative" | "causativeNegativePast" | "causativePassivePast" | "causativePassiveNegative" | "causativePassiveNegativePast" | "passiveDesireNegativePast" | "teageru" | "temorau" | "tekureru" | "tekudasai" | "naideKudasai" | "teiru" | "teru" | "tearu" | "teoru" | "toru" | "tai" | "tehoshii" | "tara" | "temo" | "nagara" | "tsutsu" | "nakerebaNaranai" | "nakutewaIkenai" | "naitoIkenai" | "tari" | "tewa" | "temoIi" | "nakutemoIi" | "masenka" | "youtosuru" | "temiru" | "teiku" | "teku" | "tekuru" | "tatte" | "sugiru" | "tagaru";
type ModeId = "classify" | "negative" | "past" | "te" | "giving" | "request" | "imperative" | "masu" | "aspect" | "passive" | "potential" | "volitional" | "desire" | "ba" | "tara" | "nasai" | "prohibitive" | "temo" | "concurrent" | "obligation" | "listing" | "permission" | "youtosuru" | "temiru" | "causative" | "causativePassive" | "nakuteNaide" | "zuZuni" | "teshimauChau" | "teokuToku" | "direction" | "tatte" | "sugiru" | "tagaru" | "basicCompound" | "voiceCompound";
type PracticeMode = "adaptive" | ModeId;
type Result = "correct" | "incorrect" | "revealed" | null;
type Verb = { surface: string; reading: string; meaning: string; class: VerbClass };
type Course = { id: ModeId; title: string; lesson: string; url: string; forms: readonly Form[] };
type KnowledgeComponent = { id: string; order: number; label: string; family: keyof typeof KC_FAMILY_LABELS; gating: boolean; firstCourseId: ModeId; firstCourseIndex: number; firstLesson: string; prerequisites: string[]; coverageKcIds: string[] };
type Exercise = { id: string; courseId: ModeId; courseIndex: number; form: Form | null; verb: Verb; kcIds: string[] };
type SkillStats = ReturnType<typeof emptySkillStats>;
type Profile = { version: 5; date: string; attempted: number; correct: number; streak: number; introducedKcIds: string[]; rotation: number; byKc: Record<string, SkillStats> };

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
const CHINESE_YOKUBI_URL = "https://l-m-sherlock.github.io/yokubi-zh-cn";
const lessonUrl = (section: string, lesson: number) => `${CHINESE_YOKUBI_URL}/${section}/Lesson${lesson}.html`;
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
const SESSION_LENGTH = 12;
const STORAGE_KEY = "katsuyo-practice-profile-v5";
const LEGACY_PROFILE_KEY_V4 = "katsuyo-practice-profile-v4";
const LEGACY_PROFILE_KEY_V3 = "katsuyo-practice-profile-v3";
const LEGACY_PROFILE_KEY_V2 = "katsuyo-practice-profile-v2";
const TRANSITIVE_VERBS = new Set(["書く", "弾く", "話す", "待つ", "読む", "買う", "切る", "飲む", "聞く", "取る", "使う", "置く", "脱ぐ", "貸す", "消す", "持つ", "打つ", "選ぶ", "作る", "売る", "習う", "言う", "払う", "洗う", "手伝う", "拾う", "描く", "磨く", "焼く", "注ぐ", "防ぐ", "稼ぐ", "出す", "直す", "渡す", "返す", "押す", "探す", "落とす", "指す", "起こす", "運ぶ", "学ぶ", "頼む", "申し込む", "包む", "送る", "守る", "食べる", "見る", "教える", "開ける", "閉める", "借りる", "浴びる", "忘れる", "覚える", "着る", "信じる", "調べる", "始める", "続ける", "助ける", "考える", "決める", "止める", "見せる", "受ける", "付ける", "集める", "捨てる", "迎える", "伝える", "変える", "届ける", "片付ける", "する", "勉強する", "料理する", "運転する", "説明する", "予約する", "質問する", "掃除する", "洗濯する", "練習する", "心配する", "準備する", "連絡する", "確認する", "紹介する", "案内する", "利用する"]);

function clockNow() { return Date.now(); }
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function normalize(value: string) { return value.normalize("NFKC").replace(/[\s。．.！!？?]/g, ""); }

function eligibleFor(verb: Verb, form: Form | null) { return form !== "tearu" || TRANSITIVE_VERBS.has(verb.surface); }

const KNOWLEDGE = buildKnowledgeModel(COURSES, VERBS, { eligibleFor, formLabels: FORM_LABELS }) as {
  components: KnowledgeComponent[];
  exercises: Exercise[];
  courseKcIds: Record<ModeId, string[]>;
};
const ALL_KCS = KNOWLEDGE.components;
const GATING_KCS = ALL_KCS.filter((kc) => kc.gating);
const KC_BY_ID = new Map(ALL_KCS.map((kc) => [kc.id, kc]));
const INITIAL_KC_IDS = GATING_KCS.length ? [GATING_KCS[0].id] : [];
const importOptions = () => ({ today: todayKey(), kcIds: ALL_KCS.map((kc) => kc.id), gatingKcIds: GATING_KCS.map((kc) => kc.id), initialKcIds: INITIAL_KC_IDS });
const kcsOf = (courseId: ModeId) => (KNOWLEDGE.courseKcIds[courseId] ?? []).map((id) => KC_BY_ID.get(id)).filter(Boolean) as KnowledgeComponent[];
const exercisesFor = (kc: KnowledgeComponent, mode: PracticeMode, profile: Profile, adaptiveCourseIndex = kc.firstCourseIndex) => rankExercisesForFocus(
  KNOWLEDGE.exercises.filter((exercise) => exercise.kcIds.includes(kc.id) && (mode === "adaptive" ? exercise.courseIndex === adaptiveCourseIndex : exercise.courseId === mode)),
  kc.id,
  profile.byKc,
  kc.coverageKcIds,
) as Exercise[];
function emptyProfile(): Profile { return { version: 5, date: todayKey(), attempted: 0, correct: 0, streak: 0, introducedKcIds: [...INITIAL_KC_IDS], rotation: 0, byKc: {} }; }
function activateReadyKcs(profile: Profile) {
  const advanced = advanceIntroductions(ALL_KCS, profile.introducedKcIds, profile.byKc) as { introducedKcIds: string[] };
  return { ...profile, introducedKcIds: advanced.introducedKcIds };
}
function makePlan(mode: PracticeMode, profile: Profile) {
  const candidates = mode === "adaptive"
    ? profile.introducedKcIds.map((id) => KC_BY_ID.get(id)).filter(Boolean) as KnowledgeComponent[]
    : kcsOf(mode).filter((kc) => kc.gating);
  const focus = selectFocus(candidates, profile.byKc) as KnowledgeComponent | null;
  const balanced = mode === "adaptive" && focus
    ? balanceComponentsForCourse(focus, candidates, KNOWLEDGE.courseKcIds[focus.firstCourseId] ?? []) as KnowledgeComponent[]
    : candidates;
  return { focus, plan: makeRoundPlan(focus, balanced, SESSION_LENGTH, profile.rotation) as KnowledgeComponent[] };
}

function loadProfile(): Profile {
  const fresh = emptyProfile();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const profile = activateReadyKcs(parseProfileImport(JSON.parse(saved), importOptions()) as Profile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      return profile;
    }
    const legacyV4 = localStorage.getItem(LEGACY_PROFILE_KEY_V4);
    if (legacyV4) {
      const profile = activateReadyKcs(parseProfileImport(JSON.parse(legacyV4), importOptions()) as Profile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      return profile;
    }
    for (const key of [LEGACY_PROFILE_KEY_V3, LEGACY_PROFILE_KEY_V2, "katsuyo-practice-stats-v1"]) {
      const value = localStorage.getItem(key);
      if (!value) continue;
      const legacy = JSON.parse(value) as { date?: string; attempted?: number; correct?: number; streak?: number; rotation?: number };
      const sameDay = legacy.date === todayKey();
      const profile = { ...fresh, attempted: sameDay ? legacy.attempted ?? 0 : 0, correct: sameDay ? legacy.correct ?? 0 : 0, streak: sameDay ? legacy.streak ?? 0 : 0, rotation: legacy.rotation ?? 0 };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      return profile;
    }
  } catch { /* Invalid local data should not block practice. */ }
  return fresh;
}

function hintFor(verb: Verb, form: Form | null) {
  if (!form) return "初步判断：不以 る 结尾的规则动词是五段；以 る 结尾且前一个假名在 い段或え段的通常是一段。不过切る、走る、入る、帰る、喋る等是常见的五段例外。";
  if (verb.class === "irregular") return "这是不规则动词，回忆它的固定变化。";
  if (["past", "te"].includes(form)) return verb.class === "ichidan" ? "一段：去掉 る，再接目标词尾。" : "五段的过去形和て形使用同一组音便规律。";
  return explainConjugation(verb.surface, verb.class, form).rule;
}

export default function Home() {
  const [mode, setMode] = useState<PracticeMode>("adaptive");
  const [profile, setProfile] = useState<Profile>(() => emptyProfile());
  const [planningProfile, setPlanningProfile] = useState<Profile>(() => emptyProfile());
  const profileRef = useRef(profile);
  const firstPlan = makePlan("adaptive", profile);
  const [roundPlan, setRoundPlan] = useState<KnowledgeComponent[]>(firstPlan.plan);
  const [focusKc, setFocusKc] = useState<KnowledgeComponent | null>(firstPlan.focus);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [seed, setSeed] = useState(1);
  const [answer, setAnswer] = useState("");
  const [selectedClass, setSelectedClass] = useState<VerbClass | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [hintShown, setHintShown] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [finished, setFinished] = useState(false);
  const [unlocked, setUnlocked] = useState<string | null>(null);
  const [diagnosticMessage, setDiagnosticMessage] = useState<string | null>(null);
  const [diagnosticKcId, setDiagnosticKcId] = useState<string | null>(null);
  const [migrationNotice, setMigrationNotice] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressView, setProgressView] = useState<"course" | "atomic">("course");
  const [transferNotice, setTransferNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const progressTriggerRef = useRef<HTMLButtonElement>(null);
  const progressCloseRef = useRef<HTMLButtonElement>(null);
  const startedAt = useRef(0);
  const roundQuestions = useMemo(() => {
    const roundFocus = roundPlan[0] ?? focusKc;
    const available = mode === "adaptive"
      ? balanceComponentsForCourse(roundFocus, planningProfile.introducedKcIds.map((id) => KC_BY_ID.get(id)).filter(Boolean), roundFocus ? KNOWLEDGE.courseKcIds[roundFocus.firstCourseId] ?? [] : []) as KnowledgeComponent[]
      : kcsOf(mode).filter((kc) => kc.gating);
    return makeUniqueAssignments(roundPlan, {
      seed,
      alternativesFor: (preferred: KnowledgeComponent, index: number) => {
        const others = available.filter((item) => item.id !== preferred.id);
        return others.length ? [...others.slice(index % others.length), ...others.slice(0, index % others.length)] : [];
      },
      candidatesFor: (item: KnowledgeComponent) => exercisesFor(item, mode, planningProfile, roundFocus?.firstCourseIndex),
      keyOf: (_item: KnowledgeComponent, candidate: Exercise) => `${candidate.form ?? "classify"}:${candidate.verb.surface}`,
      orderedCandidates: (item: KnowledgeComponent) => item.coverageKcIds.length > 0 || item.id === "exception.ru-godan",
    }) as { item: KnowledgeComponent; candidate: Exercise }[];
  }, [focusKc, mode, planningProfile, roundPlan, seed]);
  const currentQuestion = roundQuestions[questionIndex];
  const targetKc = currentQuestion?.item ?? focusKc ?? GATING_KCS[0];
  const exercise = currentQuestion?.candidate ?? exercisesFor(targetKc, mode, profile)[0] ?? KNOWLEDGE.exercises[0];
  const course = COURSES[exercise.courseIndex];
  const verb = exercise.verb;
  const form = exercise.form;
  const derivation = deriveExercise(verb, form);
  const detail = derivation.detail;
  const detailSteps = detail && "steps" in detail && Array.isArray(detail.steps) ? detail.steps : null;
  const focusStats = focusKc ? profile.byKc[focusKc.id] ?? emptySkillStats() : emptySkillStats();

  useEffect(() => { const migrated = !localStorage.getItem(STORAGE_KEY) && Boolean(localStorage.getItem(LEGACY_PROFILE_KEY_V4)); const loaded = loadProfile(); profileRef.current = loaded; startedAt.current = clockNow(); const next = makePlan("adaptive", loaded); requestAnimationFrame(() => { setProfile(loaded); setPlanningProfile(loaded); setRoundPlan(next.plan); setFocusKc(next.focus); setMigrationNotice(migrated); }); }, []);
  useEffect(() => { if (!progressOpen) return; const oldOverflow = document.body.style.overflow; const progressTrigger = progressTriggerRef.current; document.body.style.overflow = "hidden"; progressCloseRef.current?.focus(); const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setProgressOpen(false); }; addEventListener("keydown", closeOnEscape); return () => { document.body.style.overflow = oldOverflow; removeEventListener("keydown", closeOnEscape); progressTrigger?.focus(); }; }, [progressOpen]);
  const save = useCallback((next: Profile) => { profileRef.current = next; setProfile(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }, []);
  const resetQuestion = useCallback(() => { setAnswer(""); setSelectedClass(null); setResult(null); setHintShown(false); setDiagnosticMessage(null); setDiagnosticKcId(null); startedAt.current = clockNow(); requestAnimationFrame(() => inputRef.current?.focus()); }, [setAnswer, setDiagnosticKcId, setDiagnosticMessage, setHintShown, setResult, setSelectedClass]);

  function grade(correct: boolean, revealed = false, failedKcId: string | null = null, message: string | null = null) {
    if (result) return;
    const old = profileRef.current.date === todayKey() ? profileRef.current : { ...profileRef.current, date: todayKey(), attempted: 0, correct: 0, streak: 0 };
    const byKc = updateKnowledgeStats(old.byKc, { kcIds: derivation.requiredKcIds, focusId: targetKc.id, failedKcId, correct, revealed, hintUsed: hintShown, responseMs: clockNow() - startedAt.current, answerLength: form ? conjugate(verb.reading, verb.class, form).length : verb.reading.length });
    save({ ...old, attempted: old.attempted + 1, correct: old.correct + (correct ? 1 : 0), streak: correct ? old.streak + 1 : 0, byKc });
    setDiagnosticMessage(message);
    setDiagnosticKcId(failedKcId);
    setResult(revealed ? "revealed" : correct ? "correct" : "incorrect");
    if (correct) setSessionCorrect((value) => value + 1);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim() || !form || result) return;
    const readingVerb = { ...verb, surface: verb.reading, lexicalSurface: verb.surface };
    const accepted = [...derivation.acceptedVariants, ...deriveExercise(readingVerb, form).acceptedVariants].map(normalize);
    const correct = accepted.includes(normalize(answer));
    if (correct) return grade(true);
    const diagnosed = diagnoseConjugation(verb, form, answer, normalize) ?? diagnoseConjugation(readingVerb, form, answer, normalize);
    grade(false, false, diagnosed?.kcId ?? null, diagnosed?.message?.replace(verb.reading, verb.surface) ?? null);
  }
  function chooseClass(choice: VerbClass) { if (!result) { setSelectedClass(choice); grade(choice === verb.class); } }

  const finishRound = useCallback(() => {
    if (mode === "adaptive") { const current = profileRef.current; const advanced = advanceIntroductions(ALL_KCS, current.introducedKcIds, current.byKc) as { introducedKcIds: string[]; added: KnowledgeComponent[] }; if (advanced.added.length) { save({ ...current, introducedKcIds: advanced.introducedKcIds }); const next = advanced.added.at(-1)!; setUnlocked(`Lesson ${next.firstLesson} · ${next.label}`); } }
    setFinished(true);
  }, [mode, save]);
  const nextQuestion = useCallback(() => { if (questionIndex === SESSION_LENGTH - 1) finishRound(); else { setQuestionIndex((value) => value + 1); resetQuestion(); } }, [finishRound, questionIndex, resetQuestion, setQuestionIndex]);
  useEffect(() => { if (progressOpen) return; const handler = (event: KeyboardEvent) => { if (event.isComposing || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return; const target = event.target as HTMLElement | null; if (target?.closest("input,textarea,select,[contenteditable='true']")) return; if (finished) { if (event.key !== "Enter" || target?.closest("a,button")) return; event.preventDefault(); document.querySelector<HTMLButtonElement>(".restart-button")?.click(); return; } if (!result && course.id === "classify" && ["1", "2", "3"].includes(event.key)) { event.preventDefault(); document.querySelector<HTMLButtonElement>(`[data-class-shortcut="${event.key}"]`)?.click(); return; } if (!result || event.key !== "Enter" || target?.closest("a,button")) return; event.preventDefault(); nextQuestion(); }; addEventListener("keydown", handler); return () => removeEventListener("keydown", handler); }, [course.id, finished, nextQuestion, progressOpen, result]);
  function start(nextMode: PracticeMode) { const current = { ...profileRef.current, rotation: profileRef.current.rotation + 1 }; save(current); const next = makePlan(nextMode, current); setPlanningProfile(current); setMode(nextMode); setRoundPlan(next.plan); setFocusKc(next.focus); setQuestionIndex(0); setSessionCorrect(0); setFinished(false); setUnlocked(null); setSeed((value) => value + 1); resetQuestion(); }
  function resetProgress() { if (!window.confirm("确定清除这台设备上的全部练习进度吗？")) return; localStorage.removeItem(LEGACY_PROFILE_KEY_V4); localStorage.removeItem(LEGACY_PROFILE_KEY_V3); localStorage.removeItem(LEGACY_PROFILE_KEY_V2); localStorage.removeItem("katsuyo-practice-stats-v1"); const fresh = emptyProfile(); save(fresh); const next = makePlan("adaptive", fresh); setPlanningProfile(fresh); setMode("adaptive"); setRoundPlan(next.plan); setFocusKc(next.focus); setQuestionIndex(0); setSessionCorrect(0); setFinished(false); setUnlocked(null); resetQuestion(); }
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
      const imported = activateReadyKcs(parseProfileImport(JSON.parse(await file.text()), importOptions()) as Profile);
      if (!window.confirm("导入会覆盖这台设备当前的练习进度。确定继续吗？")) return;
      save(imported);
      const next = makePlan("adaptive", imported);
      setPlanningProfile(imported); setMode("adaptive"); setRoundPlan(next.plan); setFocusKc(next.focus); setQuestionIndex(0); setSessionCorrect(0); setFinished(false); setUnlocked(null); setSeed((value) => value + 1); setAnswer(""); setSelectedClass(null); setResult(null); setHintShown(false); setDiagnosticMessage(null); setDiagnosticKcId(null); startedAt.current = clockNow();
      setTransferNotice({ kind: "success", text: "导入成功，练习进度已经恢复。" });
    } catch (error) {
      setTransferNotice({ kind: "error", text: error instanceof Error ? error.message : "无法读取这个备份文件。" });
    }
  }

  const focusPercent = Math.round((focusKc ? componentConfidence(focusKc, profile.byKc) : focusStats.confidence) * 100);
  const evidenceKcId = diagnosticKcId ?? targetKc.id;
  const evidenceKc = KC_BY_ID.get(evidenceKcId);
  const currentPercent = Math.round((evidenceKc ? componentConfidence(evidenceKc, profile.byKc) : profile.byKc[evidenceKcId]?.confidence ?? 0) * 100);
  const introducedSet = new Set(profile.introducedKcIds);
  const introducedKcs = profile.introducedKcIds.map((id) => KC_BY_ID.get(id)).filter(Boolean) as KnowledgeComponent[];
  const masteredKcCount = introducedKcs.filter((item) => isComponentMastered(item, profile.byKc)).length;
  const focusDisplayLabel = mode === "adaptive" && focusKc ? COURSES[focusKc.firstCourseIndex].title : course.title;
  const weakestKc = selectFocus(mode === "adaptive" ? introducedKcs : kcsOf(mode).filter((kc) => kc.gating), profile.byKc) as KnowledgeComponent | null;
  const weakestMissingCoverage = weakestKc?.coverageKcIds.filter((id) => (profile.byKc[id]?.correct ?? 0) < 1).map((id) => KC_BY_ID.get(id)?.label).filter(Boolean) ?? [];
  const feedbackTitle = result === "correct" ? "正解！" : result === "revealed" ? "记住这个变化" : "差一点";
  const kcStatus = (kc: KnowledgeComponent) => {
    const stats = profile.byKc[kc.id] ?? emptySkillStats();
    const nonGatingParent = kc.id.startsWith("facet.class.irregular.") ? "class.irregular" : kc.id.startsWith("facet.form.") ? `suffix.${kc.id.split(".")[2]}` : "exception.ru-godan";
    const active = kc.gating ? introducedSet.has(kc.id) : introducedSet.has(nonGatingParent) || stats.attempts > 0;
    if (kc.id.startsWith("facet.")) return !active ? "未引入" : (stats.correct ?? 0) >= 1 ? "已覆盖" : "待覆盖";
    if (focusKc?.id === kc.id && active) return "当前聚焦";
    if (!active && stats.attempts > 0) return "已预习";
    if (!active) return kc.gating ? "未引入" : "词汇记录";
    if (isComponentMastered(kc, profile.byKc)) return "已达标";
    if (kc.coverageKcIds.some((id) => (profile.byKc[id]?.correct ?? 0) < 1)) return "待覆盖";
    if (stats.bestConfidence >= 1) return "需加强";
    return stats.attempts === 0 ? "未练习" : "学习中";
  };
  const renderKcRow = (kc: KnowledgeComponent, reused = false) => {
    const stats = profile.byKc[kc.id] ?? emptySkillStats();
    const percent = Math.round(componentConfidence(kc, profile.byKc) * 100);
    const isFocus = focusKc?.id === kc.id;
    const isLexical = kc.id.startsWith("lexeme.") || kc.id.startsWith("facet.");
    const isFacet = kc.id.startsWith("facet.");
    const coverage = kc.coverageKcIds.length ? `${kc.coverageKcIds.filter((id) => (profile.byKc[id]?.correct ?? 0) >= 1).length}/${kc.coverageKcIds.length}` : null;
    const prerequisiteLabels = kc.prerequisites.map((id) => KC_BY_ID.get(id)?.label).filter(Boolean);
    return <div className={`skill-progress-row ${isFocus ? "focus" : ""} ${isLexical ? "lexical" : ""}`} key={kc.id}>
      <div className="skill-progress-copy"><span>{kc.label}</span><small>{kc.id.startsWith("lexeme.") ? "逐词例外 · " : kc.id.startsWith("facet.") ? "覆盖切面 · " : ""}{kcStatus(kc)} · {stats.attempts} 次作答{coverage ? ` · 覆盖 ${coverage}` : ""}{reused ? ` · 沿用 L${kc.firstLesson}` : ""}{prerequisiteLabels.length ? ` · 先修：${prerequisiteLabels.join("、")}` : ""}</small></div>
      <div className="skill-progress-value"><div><span style={{ width: `${isFacet ? stats.correct >= 1 ? 100 : 0 : percent}%` }} /></div><b>{isFacet ? stats.correct >= 1 ? "✓" : "—" : `${percent}%`}</b></div>
    </div>;
  };
  const courseSummary = (item: Course) => {
    const required = kcsOf(item.id).filter((kc) => kc.gating);
    const newKcs = required.filter((kc) => kc.firstCourseId === item.id);
    const courseIntroduced = item.id === "classify" || newKcs.some((kc) => introducedSet.has(kc.id));
    const introducedCount = required.filter((kc) => introducedSet.has(kc.id)).length;
    const practicedAhead = newKcs.some((kc) => (profile.byKc[kc.id]?.attempts ?? 0) > 0);
    const percent = required.length ? Math.round(Math.min(...required.map((kc) => introducedSet.has(kc.id) ? componentConfidence(kc, profile.byKc) : 0)) * 100) : 0;
    const needsRecovery = required.some((kc) => introducedSet.has(kc.id) && (profile.byKc[kc.id]?.bestConfidence ?? 0) >= 1 && (profile.byKc[kc.id]?.confidence ?? 0) < 1);
    const needsCoverage = required.some((kc) => introducedSet.has(kc.id) && kc.coverageKcIds.some((id) => (profile.byKc[id]?.correct ?? 0) < 1));
    const status = !courseIntroduced ? practicedAhead ? "已预习" : "未引入" : introducedCount < required.length ? `原子 ${introducedCount}/${required.length}` : percent >= 100 ? "已达标" : needsCoverage ? "待覆盖" : needsRecovery ? "需加强" : `${percent}%`;
    return { required, status, percent };
  };

  return <main className="site-shell">
    <header className="topbar"><button className="brand" type="button" onClick={() => start("adaptive")}><span className="brand-mark">活</span><span><strong>活用道場</strong><small>ATOMIC KATSUYŌ</small></span></button><div className="daily-summary"><div><span>今日</span><strong>{profile.correct} / {profile.attempted}</strong></div><div><span>连续答对</span><strong>{profile.streak}</strong></div></div></header>
    <section className="practice-layout"><aside className="lesson-rail"><p className="eyebrow">YOKUBI 活用路线</p><h1>拆成原子，<br />逐项练会。</h1><p className="intro">系统分别跟踪词类、词干、音便、接续与例外，再把薄弱原子组合进完整活用题。</p>
      <button type="button" className={`adaptive-entry ${mode === "adaptive" ? "active" : ""}`} onClick={() => start("adaptive")}><span className="adaptive-icon">自</span><span><strong>自适应训练</strong><small>{focusDisplayLabel}</small></span><b>{focusPercent}%</b></button>
      <button ref={progressTriggerRef} type="button" className="progress-trigger" onClick={() => setProgressOpen(true)} aria-haspopup="dialog"><span><b>知识进度</b><small>查看课程与原子规则</small></span><strong>{masteredKcCount}<i>/</i>{introducedKcs.length}</strong></button>
      <nav className="mode-list" aria-label="专项课程">{COURSES.map((item) => { const summary = courseSummary(item); return <button type="button" className={mode === item.id ? "active" : ""} onClick={() => start(item.id)} key={item.id}><span>L{item.lesson}</span><span className="course-name">{item.title}</span><i>{summary.status}</i></button>; })}</nav><button type="button" className="reset-progress" onClick={resetProgress}>清除本地进度</button>
    </aside><section className="exercise-stage">{migrationNotice && <div className="migration-notice" role="status"><p><strong>原子模型已经启用</strong><span>旧版组合置信度无法可靠拆分；今日答题总计已保留，原子规则将从基础重新评估。</span></p><button type="button" onClick={() => setMigrationNotice(false)} aria-label="关闭迁移说明">知道了</button></div>}{!finished ? <><div className="stage-meta"><span>第 {questionIndex + 1} 题 / {SESSION_LENGTH}</span><div className="progress-track"><span style={{ width: `${(questionIndex + 1) / SESSION_LENGTH * 100}%` }} /></div><button type="button" className="quiet-button" onClick={finishRound}>结束本轮</button></div>
      <div className="focus-panel"><div><span>{mode === "adaptive" ? "当前课程" : "专项课程"}</span><strong>{focusDisplayLabel}</strong></div><div className="confidence-meter"><span style={{ width: `${focusPercent}%` }} /></div><b>{focusPercent}%</b></div>
      <article className="exercise-card" key={`${exercise.id}-${questionIndex}-${seed}`}><div className="question-kicker"><span>Yokubi · L{course.lesson}</span><span>{form ? FORM_LABELS[form] : course.title}</span>{result && <span>{KC_FAMILY_LABELS[targetKc.family]} · {targetKc.label}</span>}</div><p className="instruction">{form ? <>请把下面的动词变为<strong>{FORM_LABELS[form]}</strong></> : "请选择这个动词所属的类别"}</p><div className="word-display"><ruby>{verb.surface}<rt>{verb.reading}</rt></ruby><span>{verb.meaning}</span></div>
      {course.id === "classify" ? <div className="class-options">{(["ichidan", "godan", "irregular"] as VerbClass[]).map((choice, index) => <button type="button" key={choice} disabled={Boolean(result)} data-class-shortcut={String(index + 1)} aria-keyshortcuts={String(index + 1)} className={`${selectedClass === choice ? "selected" : ""} ${result && choice === verb.class ? "choice-correct" : ""} ${selectedClass === choice && result === "incorrect" ? "choice-wrong" : ""}`} onClick={() => chooseClass(choice)}><small>{choice === "ichidan" ? "る脱落" : choice === "godan" ? "词尾移动" : "固定变化"}</small><strong>{classLabel(choice)}</strong><kbd aria-hidden="true">{index + 1}</kbd></button>)}</div> : <form onSubmit={submit}><label htmlFor="answer">你的答案</label><div className={`answer-row ${result ?? ""}`}><input ref={inputRef} id="answer" lang="ja" autoComplete="off" disabled={Boolean(result)} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="输入日语……" /><button type="submit" disabled={!answer.trim() || Boolean(result)}>检查答案</button></div><p className="answer-note">汉字或全假名答案均可</p></form>}
      {!result && <div className="assist-row"><button type="button" className="text-button" onClick={() => setHintShown((v) => !v)}>{hintShown ? "收起提示" : "看一条提示"}</button><button type="button" className="text-button" onClick={() => grade(false, true)}>不知道</button></div>}{hintShown && !result && <p className="hint-box">{hintFor(verb, form)}</p>}
      {result && <div className={`feedback ${result}`} role="status"><div className="feedback-copy"><strong>{feedbackTitle}</strong><p>{diagnosticMessage ?? detail.rule}</p></div><div className="knowledge-tags" aria-label="本题涉及的原子规则">{derivation.requiredKcIds.map((id: string) => KC_BY_ID.get(id)).filter((kc: KnowledgeComponent | undefined): kc is KnowledgeComponent => Boolean(kc)).map((kc: KnowledgeComponent) => <span className={kc.id === evidenceKcId ? "target" : ""} key={kc.id}>{KC_FAMILY_LABELS[kc.family]} · {kc.label}</span>)}</div><div className="rule-line"><span>{verb.surface}</span><b>→</b>{course.id === "classify" ? <span className="answer-emphasis">{classLabel(verb.class)}</span> : detailSteps ? detailSteps.map((step: string, i: number) => <Fragment key={`${step}-${i}`}><span className={i === detailSteps.length - 1 ? "answer-emphasis" : ""}>{step}</span>{i < detailSteps.length - 1 && <b>→</b>}</Fragment>) : detail.parts.map((part: string, i: number) => <span className={i === detail.parts.length - 1 ? "answer-emphasis" : ""} key={`${part}-${i}`}>{part}{i < detail.parts.length - 1 && <b className="joiner">＋</b>}</span>)}</div>{result === "incorrect" && course.id !== "classify" && <p className="your-answer">你的答案：{answer || "—"}</p>}<div className="feedback-meta"><span>本题原子 {currentPercent}%</span><a href={course.url} target="_blank" rel="noreferrer">查看 Yokubi 中文版{course.lesson === "复习" ? "相关课程" : `第 ${Number(course.lesson)} 课`} ↗</a></div><button type="button" className="next-button" onClick={nextQuestion}>{questionIndex === SESSION_LENGTH - 1 ? "查看本轮结果" : "下一题"}<span><kbd>Enter</kbd> →</span></button></div>}{!result && <p className="keyboard-hint">{course.id === "classify" ? <><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> 选择答案</> : <><kbd>Enter</kbd> 检查答案</>}</p>}</article></> :
      <article className="completion-card"><p className="completion-jp">おつかれさま</p><span className="completion-label">本轮完成</span><div className="score"><strong>{sessionCorrect}</strong><span>/ {Math.min(questionIndex + (result ? 1 : 0), SESSION_LENGTH)}</span></div><p>{unlocked ? `新原子已引入：${unlocked}` : "下一轮会继续聚焦当前置信度最低的原子规则。"}</p><div className="completion-focus"><span>当前最弱原子</span><strong>{weakestKc?.label ?? "全部已达标"}</strong>{weakestMissingCoverage.length > 0 && <small>待覆盖：{weakestMissingCoverage.join("、")}</small>}</div><button type="button" className="restart-button" onClick={() => start(mode)}>继续下一轮<span><kbd>Enter</kbd> →</span></button>{mode !== "adaptive" && <button type="button" className="back-adaptive" onClick={() => start("adaptive")}>返回自适应训练</button>}</article>}
      <footer className="source-note">课程编排参考 <a href={CHINESE_YOKUBI_URL} target="_blank" rel="noreferrer">Yokubi 中文版</a>，原子自适应思路参考 kanabr · 本地学习记录 · CC BY 4.0</footer></section></section>
    {progressOpen && <div className="progress-overlay"><button type="button" className="progress-backdrop" onClick={() => setProgressOpen(false)} aria-label="关闭知识进度" /><section className="progress-drawer" role="dialog" aria-modal="true" aria-labelledby="progress-title"><header><div><p>ATOMIC LEARNING PROFILE</p><h2 id="progress-title">知识进度</h2></div><button ref={progressCloseRef} type="button" onClick={() => setProgressOpen(false)} aria-label="关闭知识进度">关闭 <kbd>Esc</kbd></button></header><div className="progress-summary"><div><span>已达标原子</span><strong>{masteredKcCount}</strong></div><div><span>已引入原子</span><strong>{introducedKcs.length}</strong></div><p>一道完整活用题可以同时为词类、词干、音便和接续提供证据；置信度不随时间自动变化。</p></div><section className="profile-transfer" aria-labelledby="profile-transfer-title"><div><h3 id="profile-transfer-title">更换设备</h3><p>导出一个 JSON 备份，在其他浏览器中导入即可恢复原子进度。</p></div><div className="transfer-actions"><button type="button" onClick={exportProgress}>导出数据</button><button type="button" onClick={() => importInputRef.current?.click()}>导入数据</button><input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={importProgress} /></div>{transferNotice && <p className={`transfer-notice ${transferNotice.kind}`} role="status">{transferNotice.text}</p>}</section><div className="progress-view-tabs" role="tablist" aria-label="进度查看方式"><button type="button" role="tab" aria-selected={progressView === "course"} className={progressView === "course" ? "active" : ""} onClick={() => setProgressView("course")}>按课程</button><button type="button" role="tab" aria-selected={progressView === "atomic"} className={progressView === "atomic" ? "active" : ""} onClick={() => setProgressView("atomic")}>按原子规则</button></div>
      {progressView === "course" ? <div className="course-progress-list">{COURSES.map((item) => { const summary = courseSummary(item); const isFocusCourse = focusKc?.firstCourseId === item.id; return <details key={item.id} open={isFocusCourse}><summary><span><small>L{item.lesson}</small><b>{item.title}</b></span><span>{summary.status}<i aria-hidden="true">⌄</i></span></summary><div className="skill-progress-list">{summary.required.map((kc) => renderKcRow(kc, kc.firstCourseId !== item.id))}</div></details>; })}</div> : <div className="course-progress-list atomic-progress-list">{Object.entries(KC_FAMILY_LABELS).map(([family, label]) => { const components = ALL_KCS.filter((kc) => kc.family === family); if (!components.length) return null; return <details key={family} open={components.some((kc) => kc.id === focusKc?.id)}><summary><span><small>{components.filter((kc) => kc.gating && introducedSet.has(kc.id)).length}/{components.filter((kc) => kc.gating).length}</small><b>{label}</b></span><span>{components.length} 项<i aria-hidden="true">⌄</i></span></summary><div className="skill-progress-list">{components.map((kc) => renderKcRow(kc))}</div></details>; })}</div>}
      </section></div>}
  </main>;
}
