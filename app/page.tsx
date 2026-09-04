"use client";

import { FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ADJECTIVES } from "./lib/adjective-catalog.mjs";
import { ADJECTIVE_FORM_LABELS, adjectiveClassLabel, conjugateAdjective, diagnoseAdjective, explainAdjectiveConjugation } from "./lib/adjective-conjugation.mjs";
import { buildAdjectiveKnowledgeModel, deriveAdjectiveExercise } from "./lib/adjective-knowledge-model.mjs";
import { acceptedVariantKcIds, acceptedVariantNote, matchAcceptedAnswer } from "./lib/answer-variants.mjs";
import { advanceIntroductions, balanceComponentsForCourse, componentConfidence, correctAnswersNeeded, emptySkillStats, isComponentMastered, makeRoundPlan, makeUniqueAssignments, rankExercisesForFocus, selectFocus, updateKnowledgeStats } from "./lib/adaptive.mjs";
import { classLabel, conjugate, explainConjugation } from "./lib/conjugation.mjs";
import { ADJECTIVE_COURSES as ADJECTIVE_CURRICULUM, CHINESE_YOKUBI_URL, CORE_COURSE_COUNT, COURSES as VERB_CURRICULUM, componentsForScope, coursesForScope } from "./lib/curriculum.mjs";
import { furiganaFor } from "./lib/furigana.mjs";
import { buildKnowledgeModel, deriveExercise, diagnoseConjugation, KC_FAMILY_LABELS } from "./lib/knowledge-model.mjs";
import { createProfileExport, parseProfileImport } from "./lib/profile-transfer.mjs";

type VerbClass = "godan" | "ichidan" | "irregular";
type AdjectiveClass = "i" | "na";
type PracticeClass = VerbClass | AdjectiveClass;
type PracticeDomain = "verb" | "adjective";
type Form = "negative" | "past" | "te" | "masu" | "passive" | "potential" | "imperative" | "volitional" | "ba" | "nasai" | "prohibitive" | "causative" | "causativePassive" | "causativePassiveContracted" | "nakute" | "naide" | "zu" | "zuni" | "teshimau" | "chau" | "teoku" | "toku" | "negativePast" | "masuPast" | "masuNegative" | "masuNegativePast" | "passivePast" | "passiveNegative" | "passiveNegativePast" | "potentialPast" | "potentialNegative" | "potentialNegativePast" | "causativePast" | "causativeNegative" | "causativeNegativePast" | "causativePassivePast" | "causativePassiveNegative" | "causativePassiveNegativePast" | "passiveDesireNegativePast" | "teageru" | "temorau" | "tekureru" | "tekudasai" | "naideKudasai" | "teiru" | "teru" | "tearu" | "teoru" | "toru" | "tai" | "tehoshii" | "tara" | "temo" | "nagara" | "tsutsu" | "nakerebaNaranai" | "nakutewaIkenai" | "naitoIkenai" | "tari" | "tewa" | "temoIi" | "nakutemoIi" | "masenka" | "youtosuru" | "temiru" | "teiku" | "teku" | "tekuru" | "tatte" | "sugiru" | "tagaru" | "adjectiveNegative" | "adjectivePast" | "adjectiveNegativePast" | "adjectiveTe" | "adjectiveAttributive" | "adjectivePredicative" | "adjectiveNaNegative" | "adjectiveNaPast" | "adjectiveNaNegativePast" | "adjectiveNaTe" | "adjectiveBa" | "adjectiveAdverb";
type ModeId = "classify" | "negative" | "past" | "te" | "giving" | "request" | "imperative" | "masu" | "aspect" | "passive" | "potential" | "volitional" | "desire" | "ba" | "tara" | "nasai" | "prohibitive" | "temo" | "concurrent" | "obligation" | "listing" | "permission" | "youtosuru" | "temiru" | "causative" | "causativePassive" | "nakuteNaide" | "zuZuni" | "teshimauChau" | "teokuToku" | "direction" | "tatte" | "sugiru" | "tagaru" | "multiStepCompound" | "basicCompound" | "voiceCompound" | "adjectiveClassify" | "adjectiveIBase" | "adjectiveITe" | "adjectiveNaBase" | "adjectiveConditional" | "adjectiveAdverb";
type PracticeMode = "adaptive" | ModeId;
type CurriculumScope = "core" | "full";
type Result = "correct" | "incorrect" | "revealed" | null;
type Verb = { domain: "verb"; surface: string; reading: string; meaning: string; class: VerbClass; lexicalSurface?: string };
type Adjective = { domain: "adjective"; surface: string; reading: string; meaning: string; class: AdjectiveClass; iiFamily: boolean };
type PracticeItem = Verb | Adjective;
type Course = { id: ModeId; domain: PracticeDomain; title: string; lesson: string; url: string; forms: readonly Form[] };
type KnowledgeComponent = { id: string; order: number; label: string; family: keyof typeof KC_FAMILY_LABELS; gating: boolean; firstCourseId: ModeId; firstCourseIndex: number; firstLesson: string; prerequisites: string[]; coverageKcIds: string[]; coverageOnly?: boolean };
type Exercise = { id: string; courseId: ModeId; courseIndex: number; form: Form | null; item: PracticeItem; kcIds: string[] };
type SkillStats = ReturnType<typeof emptySkillStats>;
type Profile = { version: 5; date: string; attempted: number; correct: number; streak: number; introducedKcIds: string[]; rotation: number; byKc: Record<string, SkillStats> };
type VerbForm = Parameters<typeof conjugate>[2];
type AnswerVariant = { surface: string; reading: string; note: string };

function FuriganaText({ surface, reading }: { surface: string; reading: string }) {
  const furigana = furiganaFor(surface, reading);
  return furigana ? <ruby>{surface}<rt>{furigana}</rt></ruby> : <>{surface}</>;
}

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
  ["する", "する", "做", "irregular"], ["来る", "くる", "来", "irregular"],
].map(([surface, reading, meaning, verbClass]) => ({ domain: "verb" as const, surface, reading, meaning, class: verbClass as VerbClass }));

const VERB_COURSES = VERB_CURRICULUM as Course[];
const ADJECTIVE_COURSES = ADJECTIVE_CURRICULUM as Course[];
const COURSES = [...VERB_COURSES, ...ADJECTIVE_COURSES];

const FORM_LABELS: Record<Form, string> = {
  negative: "否定形", past: "过去形", te: "て形", masu: "ます形", passive: "受身形", potential: "可能形", imperative: "命令形", volitional: "意向形", ba: "ば形", nasai: "なさい命令", prohibitive: "禁止形", causative: "使役形", causativePassive: "使役受身形", causativePassiveContracted: "使役受身缩约形", nakute: "なくて形", naide: "ないで形", zu: "ず形", zuni: "ずに形", teshimau: "てしまう", chau: "ちゃう・じゃう", teoku: "ておく", toku: "とく・どく", negativePast: "否定过去形", masuPast: "礼貌过去形", masuNegative: "礼貌否定形", masuNegativePast: "礼貌否定过去形", passivePast: "受身・过去形", passiveNegative: "受身・否定形", passiveNegativePast: "受身・否定过去形", potentialPast: "可能・过去形", potentialNegative: "可能・否定形", potentialNegativePast: "可能・否定过去形", causativePast: "使役・过去形", causativeNegative: "使役・否定形", causativeNegativePast: "使役・否定过去形", causativePassivePast: "使役受身・过去形", causativePassiveNegative: "使役受身・否定形", causativePassiveNegativePast: "使役受身・否定过去形",
  passiveDesireNegativePast: "受身・愿望・否定过去", teageru: "てあげる", temorau: "てもらう", tekureru: "てくれる", tekudasai: "てください", naideKudasai: "ないでください", teiru: "ている", teru: "てる", tearu: "てある", teoru: "ておる", toru: "とる・どる", tai: "たい", tehoshii: "てほしい", tara: "たら形", temo: "ても・でも", nagara: "ながら", tsutsu: "つつ", nakerebaNaranai: "なければならない", nakutewaIkenai: "なくてはいけない", naitoIkenai: "ないといけない", tari: "たり形", tewa: "ては・では", temoIi: "てもいい", nakutemoIi: "なくてもいい", masenka: "ませんか", youtosuru: "ようとする", temiru: "てみる", teiku: "ていく", teku: "てく", tekuru: "てくる", tatte: "たって・だって", sugiru: "すぎる", tagaru: "たがる",
  ...ADJECTIVE_FORM_LABELS,
};
const SESSION_LENGTH = 12;
const STORAGE_KEY = "katsuyo-practice-profile-v5";
const CURRICULUM_SCOPE_KEY = "katsuyo-practice-curriculum-scope-v1";
const PRACTICE_DOMAIN_KEY = "katsuyo-practice-domain-v1";
const LEGACY_PROFILE_KEY_V4 = "katsuyo-practice-profile-v4";
const LEGACY_PROFILE_KEY_V3 = "katsuyo-practice-profile-v3";
const LEGACY_PROFILE_KEY_V2 = "katsuyo-practice-profile-v2";
const TRANSITIVE_VERBS = new Set(["書く", "弾く", "話す", "待つ", "読む", "買う", "切る", "飲む", "聞く", "取る", "使う", "置く", "脱ぐ", "貸す", "消す", "持つ", "打つ", "選ぶ", "作る", "売る", "習う", "言う", "払う", "洗う", "手伝う", "拾う", "描く", "磨く", "焼く", "注ぐ", "防ぐ", "稼ぐ", "出す", "直す", "渡す", "返す", "押す", "探す", "落とす", "指す", "起こす", "運ぶ", "学ぶ", "頼む", "申し込む", "包む", "送る", "守る", "食べる", "見る", "教える", "開ける", "閉める", "借りる", "浴びる", "忘れる", "覚える", "着る", "信じる", "調べる", "始める", "続ける", "助ける", "考える", "決める", "止める", "見せる", "受ける", "付ける", "集める", "捨てる", "迎える", "伝える", "変える", "届ける", "片付ける", "する"]);

function clockNow() { return Date.now(); }
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function normalize(value: string) { return value.normalize("NFKC").replace(/[\s。．.！!？?]/g, ""); }

function eligibleFor(verb: Verb, form: Form | null) {
  if (form === "tearu") return TRANSITIVE_VERBS.has(verb.surface);
  if (form === "causativePassiveContracted") return verb.class === "godan" && !verb.surface.endsWith("す");
  return true;
}

export const VERB_KNOWLEDGE = buildKnowledgeModel(VERB_COURSES, VERBS, { eligibleFor, formLabels: FORM_LABELS }) as {
  components: KnowledgeComponent[];
  exercises: Exercise[];
  courseKcIds: Record<ModeId, string[]>;
};
export const ADJECTIVE_KNOWLEDGE = buildAdjectiveKnowledgeModel(ADJECTIVE_COURSES, ADJECTIVES, { courseIndexOffset: VERB_COURSES.length, componentOrderOffset: VERB_KNOWLEDGE.components.length }) as {
  components: KnowledgeComponent[];
  exercises: Exercise[];
  courseKcIds: Record<ModeId, string[]>;
};
export const KNOWLEDGE = {
  components: [...VERB_KNOWLEDGE.components, ...ADJECTIVE_KNOWLEDGE.components],
  exercises: [...VERB_KNOWLEDGE.exercises, ...ADJECTIVE_KNOWLEDGE.exercises],
  courseKcIds: { ...VERB_KNOWLEDGE.courseKcIds, ...ADJECTIVE_KNOWLEDGE.courseKcIds },
};
export const ALL_KCS = KNOWLEDGE.components;
const GATING_KCS = ALL_KCS.filter((kc) => kc.gating);
const VERB_KCS = VERB_KNOWLEDGE.components;
const ADJECTIVE_KCS = ADJECTIVE_KNOWLEDGE.components;
const CORE_KCS = componentsForScope(VERB_KCS, "core") as KnowledgeComponent[];
const CORE_GATING_KCS = CORE_KCS.filter((kc) => kc.gating);
const KC_BY_ID = new Map(ALL_KCS.map((kc) => [kc.id, kc]));
const INITIAL_KC_IDS = VERB_KCS.length ? [VERB_KCS.find((kc) => kc.gating)?.id].filter(Boolean) as string[] : [];
const importOptions = () => ({ today: todayKey(), kcIds: ALL_KCS.map((kc) => kc.id), gatingKcIds: GATING_KCS.map((kc) => kc.id), initialKcIds: INITIAL_KC_IDS });
const kcsOf = (courseId: ModeId) => (KNOWLEDGE.courseKcIds[courseId] ?? []).map((id) => KC_BY_ID.get(id)).filter(Boolean) as KnowledgeComponent[];
const exerciseKey = (exercise: Exercise) => `${exercise.item.domain}:${exercise.form ?? "classify"}:${exercise.item.surface}`;
const exercisesFor = (kc: KnowledgeComponent, mode: PracticeMode, profile: Profile, adaptiveCourseIndex = kc.firstCourseIndex) => rankExercisesForFocus(
  KNOWLEDGE.exercises.filter((exercise) => exercise.kcIds.includes(kc.id) && (mode === "adaptive" ? exercise.courseIndex === adaptiveCourseIndex : exercise.courseId === mode)),
  kc.id,
  profile.byKc,
  kc.coverageKcIds,
) as Exercise[];
function emptyProfile(): Profile { return { version: 5, date: todayKey(), attempted: 0, correct: 0, streak: 0, introducedKcIds: [...INITIAL_KC_IDS], rotation: 0, byKc: {} }; }
function kcsForRoute(domain: PracticeDomain, scope: CurriculumScope) { return domain === "adjective" ? ADJECTIVE_KCS : scope === "core" ? CORE_KCS : VERB_KCS; }
function coursesForRoute(domain: PracticeDomain, scope: CurriculumScope) { return domain === "adjective" ? ADJECTIVE_COURSES : coursesForScope(scope) as Course[]; }
function activateReadyKcs(profile: Profile, scope: CurriculumScope, domain: PracticeDomain) {
  const advanced = advanceIntroductions(kcsForRoute(domain, scope), profile.introducedKcIds, profile.byKc) as { introducedKcIds: string[] };
  return { ...profile, introducedKcIds: advanced.introducedKcIds };
}
function makePlan(mode: PracticeMode, profile: Profile, length = SESSION_LENGTH, scope: CurriculumScope = "core", domain: PracticeDomain = "verb") {
  const allowedIds = new Set(kcsForRoute(domain, scope).map((kc) => kc.id));
  const candidates = mode === "adaptive"
    ? profile.introducedKcIds.map((id) => KC_BY_ID.get(id)).filter((kc): kc is KnowledgeComponent => Boolean(kc && allowedIds.has(kc.id)))
    : kcsOf(mode).filter((kc) => kc.gating);
  const focus = selectFocus(candidates, profile.byKc) as KnowledgeComponent | null;
  const balanced = mode === "adaptive" && focus
    ? balanceComponentsForCourse(focus, candidates, KNOWLEDGE.courseKcIds[focus.firstCourseId] ?? []) as KnowledgeComponent[]
    : candidates;
  return { focus, plan: makeRoundPlan(focus, balanced, length, profile.rotation) as KnowledgeComponent[] };
}

function loadCurriculumScope(): CurriculumScope {
  try { return localStorage.getItem(CURRICULUM_SCOPE_KEY) === "full" ? "full" : "core"; }
  catch { return "core"; }
}

function loadPracticeDomain(): PracticeDomain {
  try { return localStorage.getItem(PRACTICE_DOMAIN_KEY) === "adjective" ? "adjective" : "verb"; }
  catch { return "verb"; }
}

function loadProfile(scope: CurriculumScope, domain: PracticeDomain): Profile {
  const fresh = emptyProfile();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const profile = activateReadyKcs(parseProfileImport(JSON.parse(saved), importOptions()) as Profile, scope, domain);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      return profile;
    }
    const legacyV4 = localStorage.getItem(LEGACY_PROFILE_KEY_V4);
    if (legacyV4) {
      const profile = activateReadyKcs(parseProfileImport(JSON.parse(legacyV4), importOptions()) as Profile, scope, domain);
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

function deriveFor(item: PracticeItem, form: Form | null) { return item.domain === "adjective" ? deriveAdjectiveExercise(item, form) : deriveExercise(item, form); }
function explainFor(item: PracticeItem, form: Form) { return item.domain === "adjective" ? explainAdjectiveConjugation(item, form) : explainConjugation(item.surface, item.class, form as VerbForm); }
function conjugateFor(item: PracticeItem, form: Form) { return item.domain === "adjective" ? conjugateAdjective(item, form) : conjugate(item.surface, item.class, form as VerbForm); }
function classLabelFor(itemClass: PracticeClass) { return itemClass === "i" || itemClass === "na" ? adjectiveClassLabel(itemClass) : classLabel(itemClass); }
function hintFor(item: PracticeItem, form: Form | null) {
  if (item.domain === "adjective") {
    if (!form) return "通常，以「い」结尾并让这个词尾变化的是い形容词；な形容词使用「な／だ／で／に」。注意「きれい」「嫌い」虽然以い结尾，却是な形容词。";
    return explainAdjectiveConjugation(item, form).rule;
  }
  if (!form) return "初步判断：不以 る 结尾的规则动词是五段；以 る 结尾且前一个假名在 い段或え段的通常是一段。不过切る、走る、入る、帰る、喋る等是常见的五段例外。";
  if (item.class === "irregular") return "这是不规则动词，回忆它的固定变化。";
  if (["past", "te"].includes(form)) return item.class === "ichidan" ? "一段：去掉 る，再接目标词尾。" : "五段的过去形和て形使用同一组音便规律。";
  return explainConjugation(item.surface, item.class, form as VerbForm).rule;
}

export default function Home() {
  const [mode, setMode] = useState<PracticeMode>("adaptive");
  const [practiceDomain, setPracticeDomain] = useState<PracticeDomain>("verb");
  const [curriculumScope, setCurriculumScope] = useState<CurriculumScope>("core");
  const [profile, setProfile] = useState<Profile>(() => emptyProfile());
  const [planningProfile, setPlanningProfile] = useState<Profile>(() => emptyProfile());
  const profileRef = useRef(profile);
  const firstPlan = makePlan("adaptive", profile, SESSION_LENGTH, curriculumScope, practiceDomain);
  const [roundPlan, setRoundPlan] = useState<KnowledgeComponent[]>(firstPlan.plan);
  const [focusKc, setFocusKc] = useState<KnowledgeComponent | null>(firstPlan.focus);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [roundOffset, setRoundOffset] = useState(0);
  const [usedQuestionKeys, setUsedQuestionKeys] = useState<string[]>([]);
  const [seed, setSeed] = useState(1);
  const [answer, setAnswer] = useState("");
  const [selectedClass, setSelectedClass] = useState<PracticeClass | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [hintShown, setHintShown] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [finished, setFinished] = useState(false);
  const [unlocked, setUnlocked] = useState<string | null>(null);
  const [diagnosticMessage, setDiagnosticMessage] = useState<string | null>(null);
  const [diagnosticKcId, setDiagnosticKcId] = useState<string | null>(null);
  const [acceptedVariant, setAcceptedVariant] = useState<AnswerVariant | null>(null);
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
    const allowedIds = new Set(kcsForRoute(practiceDomain, curriculumScope).map((kc) => kc.id));
    const available = mode === "adaptive"
      ? balanceComponentsForCourse(roundFocus, planningProfile.introducedKcIds.map((id) => KC_BY_ID.get(id)).filter((kc): kc is KnowledgeComponent => Boolean(kc && allowedIds.has(kc.id))), roundFocus ? KNOWLEDGE.courseKcIds[roundFocus.firstCourseId] ?? [] : []) as KnowledgeComponent[]
      : kcsOf(mode).filter((kc) => kc.gating);
    return makeUniqueAssignments(roundPlan, {
      seed,
      alternativesFor: (preferred: KnowledgeComponent, index: number) => {
        const others = available.filter((item) => item.id !== preferred.id);
        return others.length ? [...others.slice(index % others.length), ...others.slice(0, index % others.length)] : [];
      },
      candidatesFor: (item: KnowledgeComponent) => exercisesFor(item, mode, planningProfile, roundFocus?.firstCourseIndex),
      keyOf: (_item: KnowledgeComponent, candidate: Exercise) => exerciseKey(candidate),
      orderedCandidates: (item: KnowledgeComponent) => item.coverageKcIds.length > 0 || item.id === "exception.ru-godan",
      usedKeys: usedQuestionKeys,
    }) as { item: KnowledgeComponent; candidate: Exercise }[];
  }, [curriculumScope, focusKc, mode, planningProfile, practiceDomain, roundPlan, seed, usedQuestionKeys]);
  const currentQuestion = roundQuestions[questionIndex];
  const targetKc = currentQuestion?.item ?? focusKc ?? kcsForRoute(practiceDomain, curriculumScope).find((kc) => kc.gating) ?? GATING_KCS[0];
  const exercise = currentQuestion?.candidate ?? exercisesFor(targetKc, mode, profile)[0] ?? KNOWLEDGE.exercises[0];
  const course = COURSES[exercise.courseIndex];
  const item = exercise.item;
  const form = exercise.form;
  const derivation = deriveFor(item, form);
  const detail = derivation.detail;
  const detailSteps = detail && "steps" in detail && Array.isArray(detail.steps) ? detail.steps : null;
  const readingItem = { ...item, surface: item.reading, ...(item.domain === "verb" ? { lexicalSurface: item.surface } : {}) } as PracticeItem;
  const readingDetail = form ? explainFor(readingItem, form) : null;
  const readingSteps = readingDetail && "steps" in readingDetail && Array.isArray(readingDetail.steps) ? readingDetail.steps : null;
  const readingParts = readingDetail?.parts ?? [];
  const focusStats = focusKc ? profile.byKc[focusKc.id] ?? emptySkillStats() : emptySkillStats();

  useEffect(() => { const migrated = !localStorage.getItem(STORAGE_KEY) && Boolean(localStorage.getItem(LEGACY_PROFILE_KEY_V4)); const scope = loadCurriculumScope(); const domain = loadPracticeDomain(); const loaded = loadProfile(scope, domain); profileRef.current = loaded; startedAt.current = clockNow(); const next = makePlan("adaptive", loaded, SESSION_LENGTH, scope, domain); requestAnimationFrame(() => { setPracticeDomain(domain); setCurriculumScope(scope); setProfile(loaded); setPlanningProfile(loaded); setRoundPlan(next.plan); setFocusKc(next.focus); setMigrationNotice(migrated); }); }, []);
  useEffect(() => { if (!progressOpen) return; const oldOverflow = document.body.style.overflow; const progressTrigger = progressTriggerRef.current; document.body.style.overflow = "hidden"; progressCloseRef.current?.focus(); const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setProgressOpen(false); }; addEventListener("keydown", closeOnEscape); return () => { document.body.style.overflow = oldOverflow; removeEventListener("keydown", closeOnEscape); progressTrigger?.focus(); }; }, [progressOpen]);
  const save = useCallback((next: Profile) => { profileRef.current = next; setProfile(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }, []);
  const resetQuestion = useCallback(() => { setAnswer(""); setSelectedClass(null); setResult(null); setHintShown(false); setDiagnosticMessage(null); setDiagnosticKcId(null); setAcceptedVariant(null); startedAt.current = clockNow(); requestAnimationFrame(() => inputRef.current?.focus()); }, [setAnswer, setAcceptedVariant, setDiagnosticKcId, setDiagnosticMessage, setHintShown, setResult, setSelectedClass]);

  function grade(correct: boolean, revealed = false, failedKcId: string | null = null, message: string | null = null, extraKcIds: string[] = []) {
    if (result) return;
    const old = profileRef.current.date === todayKey() ? profileRef.current : { ...profileRef.current, date: todayKey(), attempted: 0, correct: 0, streak: 0 };
    const byKc = updateKnowledgeStats(old.byKc, { kcIds: [...new Set([...derivation.requiredKcIds, ...extraKcIds])], focusId: targetKc.id, failedKcId, correct, revealed, hintUsed: hintShown, responseMs: clockNow() - startedAt.current, answerLength: form ? conjugateFor(readingItem, form).length : item.reading.length });
    save({ ...old, attempted: old.attempted + 1, correct: old.correct + (correct ? 1 : 0), streak: correct ? old.streak + 1 : 0, byKc });
    setDiagnosticMessage(message);
    setDiagnosticKcId(failedKcId);
    setResult(revealed ? "revealed" : correct ? "correct" : "incorrect");
    if (correct) setSessionCorrect((value) => value + 1);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim() || !form || result) return;
    const readingDerivation = deriveFor(readingItem, form);
    const match = matchAcceptedAnswer(answer, derivation.acceptedVariants, readingDerivation.acceptedVariants, normalize) as { correct: boolean; variant: { surface: string; reading: string } | null };
    if (match.correct) {
      if (match.variant) setAcceptedVariant({ ...match.variant, note: acceptedVariantNote(item, form, match.variant) });
      return grade(true, false, null, null, match.variant ? acceptedVariantKcIds(item, form, match.variant) : []);
    }
    const diagnosed = item.domain === "adjective"
      ? diagnoseAdjective(item, form, answer, normalize) ?? diagnoseAdjective(readingItem, form, answer, normalize)
      : diagnoseConjugation(item, form, answer, normalize) ?? diagnoseConjugation(readingItem, form, answer, normalize);
    grade(false, false, diagnosed?.kcId ?? null, diagnosed?.message?.replace(item.reading, item.surface) ?? null);
  }
  function chooseClass(choice: PracticeClass) { if (!result) { setSelectedClass(choice); grade(choice === item.class); } }

  const finishRound = useCallback(() => {
    if (mode === "adaptive") { const current = profileRef.current; const advanced = advanceIntroductions(kcsForRoute(practiceDomain, curriculumScope), current.introducedKcIds, current.byKc) as { introducedKcIds: string[]; added: KnowledgeComponent[] }; if (advanced.added.length) { save({ ...current, introducedKcIds: advanced.introducedKcIds }); const next = advanced.added.at(-1)!; setUnlocked(`Lesson ${next.firstLesson} · ${next.label}`); } }
    setFinished(true);
  }, [curriculumScope, mode, practiceDomain, save]);
  const nextQuestion = useCallback(() => {
    const answeredCount = roundOffset + questionIndex + 1;
    if (answeredCount >= SESSION_LENGTH) return finishRound();
    const current = profileRef.current;
    if (focusKc && isComponentMastered(focusKc, current.byKc)) {
      const advanced = mode === "adaptive"
        ? advanceIntroductions(kcsForRoute(practiceDomain, curriculumScope), current.introducedKcIds, current.byKc) as { introducedKcIds: string[]; added: KnowledgeComponent[] }
        : { introducedKcIds: current.introducedKcIds, added: [] as KnowledgeComponent[] };
      const nextProfile = advanced.added.length ? { ...current, introducedKcIds: advanced.introducedKcIds } : current;
      if (advanced.added.length) {
        save(nextProfile);
        const introduced = advanced.added.at(-1)!;
        setUnlocked(`Lesson ${introduced.firstLesson} · ${introduced.label}`);
      }
      const remaining = SESSION_LENGTH - answeredCount;
      const next = makePlan(mode, nextProfile, remaining, curriculumScope, practiceDomain);
      const staysInCourse = mode !== "adaptive" || next.focus?.firstCourseId === focusKc.firstCourseId;
      const focusOpportunities = next.focus ? next.plan.filter((component) => component.id === next.focus?.id).length : 0;
      const canMasterInRemaining = next.focus ? correctAnswersNeeded(next.focus, nextProfile.byKc) <= focusOpportunities : false;
      if (next.focus && next.focus.id !== focusKc.id && !isComponentMastered(next.focus, nextProfile.byKc) && staysInCourse && canMasterInRemaining) {
        const consumed = [...new Set([...usedQuestionKeys, ...roundQuestions.slice(0, questionIndex + 1).map(({ candidate }) => exerciseKey(candidate))])];
        setPlanningProfile(nextProfile); setRoundPlan(next.plan); setFocusKc(next.focus); setRoundOffset(answeredCount); setUsedQuestionKeys(consumed); setQuestionIndex(0); setSeed((value) => value + 1); resetQuestion();
        return;
      }
      finishRound();
      return;
    }
    setQuestionIndex((value) => value + 1);
    resetQuestion();
  }, [curriculumScope, finishRound, focusKc, mode, practiceDomain, questionIndex, resetQuestion, roundOffset, roundQuestions, save, usedQuestionKeys]);
  const classChoices = useMemo(() => practiceDomain === "verb" ? ["ichidan", "godan", "irregular"] as PracticeClass[] : ["i", "na"] as PracticeClass[], [practiceDomain]);
  useEffect(() => { if (progressOpen) return; const handler = (event: KeyboardEvent) => { if (event.isComposing || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return; const target = event.target as HTMLElement | null; if (target?.closest("input,textarea,select,[contenteditable='true']")) return; if (finished) { if (event.key !== "Enter" || target?.closest("a,button")) return; event.preventDefault(); document.querySelector<HTMLButtonElement>(".restart-button")?.click(); return; } if (!result && !form && classChoices.map((_, index) => String(index + 1)).includes(event.key)) { event.preventDefault(); document.querySelector<HTMLButtonElement>(`[data-class-shortcut="${event.key}"]`)?.click(); return; } if (!result || event.key !== "Enter" || target?.closest("a,button")) return; event.preventDefault(); nextQuestion(); }; addEventListener("keydown", handler); return () => removeEventListener("keydown", handler); }, [classChoices, finished, form, nextQuestion, progressOpen, result]);
  function start(nextMode: PracticeMode, scope: CurriculumScope = curriculumScope, domain: PracticeDomain = practiceDomain) { const current = { ...profileRef.current, rotation: profileRef.current.rotation + 1 }; save(current); const next = makePlan(nextMode, current, SESSION_LENGTH, scope, domain); setPlanningProfile(current); setMode(nextMode); setRoundPlan(next.plan); setFocusKc(next.focus); setQuestionIndex(0); setRoundOffset(0); setUsedQuestionKeys([]); setSessionCorrect(0); setFinished(false); setUnlocked(null); setSeed((value) => value + 1); resetQuestion(); }
  function changePracticeDomain(nextDomain: PracticeDomain) { if (nextDomain === practiceDomain) return; localStorage.setItem(PRACTICE_DOMAIN_KEY, nextDomain); setPracticeDomain(nextDomain); const activated = activateReadyKcs(profileRef.current, curriculumScope, nextDomain); save(activated); start("adaptive", curriculumScope, nextDomain); }
  function changeCurriculumScope(nextScope: CurriculumScope) { if (nextScope === "full" && !CORE_GATING_KCS.every((kc) => isComponentMastered(kc, profileRef.current.byKc))) return; localStorage.setItem(CURRICULUM_SCOPE_KEY, nextScope); setCurriculumScope(nextScope); save(activateReadyKcs(profileRef.current, nextScope, "verb")); start("adaptive", nextScope, "verb"); }
  function resetProgress() { if (!window.confirm("确定清除这台设备上的全部练习进度吗？")) return; localStorage.removeItem(LEGACY_PROFILE_KEY_V4); localStorage.removeItem(LEGACY_PROFILE_KEY_V3); localStorage.removeItem(LEGACY_PROFILE_KEY_V2); localStorage.removeItem("katsuyo-practice-stats-v1"); const fresh = activateReadyKcs(emptyProfile(), curriculumScope, practiceDomain); save(fresh); const next = makePlan("adaptive", fresh, SESSION_LENGTH, curriculumScope, practiceDomain); setPlanningProfile(fresh); setMode("adaptive"); setRoundPlan(next.plan); setFocusKc(next.focus); setQuestionIndex(0); setRoundOffset(0); setUsedQuestionKeys([]); setSessionCorrect(0); setFinished(false); setUnlocked(null); resetQuestion(); }
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
      const imported = activateReadyKcs(parseProfileImport(JSON.parse(await file.text()), importOptions()) as Profile, curriculumScope, practiceDomain);
      if (!window.confirm("导入会覆盖这台设备当前的练习进度。确定继续吗？")) return;
      save(imported);
      const next = makePlan("adaptive", imported, SESSION_LENGTH, curriculumScope, practiceDomain);
      setPlanningProfile(imported); setMode("adaptive"); setRoundPlan(next.plan); setFocusKc(next.focus); setQuestionIndex(0); setRoundOffset(0); setUsedQuestionKeys([]); setSessionCorrect(0); setFinished(false); setUnlocked(null); setSeed((value) => value + 1); setAnswer(""); setSelectedClass(null); setResult(null); setHintShown(false); setDiagnosticMessage(null); setDiagnosticKcId(null); setAcceptedVariant(null); startedAt.current = clockNow();
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
  const activeKcs = kcsForRoute(practiceDomain, curriculumScope);
  const activeKcIdSet = new Set(activeKcs.map((kc) => kc.id));
  const introducedKcs = profile.introducedKcIds.map((id) => KC_BY_ID.get(id)).filter((kc): kc is KnowledgeComponent => Boolean(kc && activeKcIdSet.has(kc.id)));
  const masteredKcCount = introducedKcs.filter((item) => isComponentMastered(item, profile.byKc)).length;
  const coreComplete = CORE_GATING_KCS.every((kc) => isComponentMastered(kc, profile.byKc));
  const activeRouteComplete = activeKcs.filter((kc) => kc.gating).every((kc) => isComponentMastered(kc, profile.byKc));
  const visibleCourses = coursesForRoute(practiceDomain, curriculumScope);
  const focusDisplayLabel = mode === "adaptive" && focusKc ? COURSES[focusKc.firstCourseIndex].title : course.title;
  const selectedWeakestKc = selectFocus(mode === "adaptive" ? introducedKcs : kcsOf(mode).filter((kc) => kc.gating), profile.byKc) as KnowledgeComponent | null;
  const weakestKc = mode === "adaptive" && activeRouteComplete ? null : selectedWeakestKc;
  const weakestMissingCoverage = weakestKc?.coverageKcIds.filter((id) => (profile.byKc[id]?.correct ?? 0) < 1).map((id) => KC_BY_ID.get(id)?.label).filter(Boolean) ?? [];
  const questionNumber = roundOffset + questionIndex + 1;
  const answeredInRound = Math.min(roundOffset + questionIndex + (result ? 1 : 0), SESSION_LENGTH);
  const focusComplete = Boolean(result && focusKc && isComponentMastered(focusKc, profile.byKc));
  const feedbackTitle = result === "correct" ? "正解！" : result === "revealed" ? "记住这个变化" : "差一点";
  const kcStatus = (kc: KnowledgeComponent) => {
    const stats = profile.byKc[kc.id] ?? emptySkillStats();
    const nonGatingParent = kc.id.startsWith("facet.class.irregular.") ? "class.irregular" : kc.id.startsWith("facet.form.") ? `suffix.${kc.id.split(".")[2]}` : kc.id.startsWith("facet.adj.class.na.") ? "adj.class.na" : kc.id === "facet.onbin.sokuon.iku" ? "onbin.sokuon" : "exception.ru-godan";
    const active = kc.gating ? introducedSet.has(kc.id) : introducedSet.has(nonGatingParent) || stats.attempts > 0;
    if (kc.id.startsWith("facet.")) return !active ? "未解锁" : (stats.correct ?? 0) >= 1 ? "已覆盖" : "待覆盖";
    if (focusKc?.id === kc.id && active) return "当前聚焦";
    if (!active && stats.attempts > 0) return "已预习";
    if (!active) return kc.gating ? "未解锁" : "词汇记录";
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
    const courseIntroduced = item.forms.length === 0 || newKcs.some((kc) => introducedSet.has(kc.id));
    const introducedCount = required.filter((kc) => introducedSet.has(kc.id)).length;
    const practicedAhead = newKcs.some((kc) => (profile.byKc[kc.id]?.attempts ?? 0) > 0);
    const percent = required.length ? Math.round(Math.min(...required.map((kc) => introducedSet.has(kc.id) ? componentConfidence(kc, profile.byKc) : 0)) * 100) : 0;
    const needsRecovery = required.some((kc) => introducedSet.has(kc.id) && (profile.byKc[kc.id]?.bestConfidence ?? 0) >= 1 && (profile.byKc[kc.id]?.confidence ?? 0) < 1);
    const needsCoverage = required.some((kc) => introducedSet.has(kc.id) && kc.coverageKcIds.some((id) => (profile.byKc[id]?.correct ?? 0) < 1));
    const status = !courseIntroduced ? practicedAhead ? "已预习" : "未解锁" : introducedCount < required.length ? `知识点 ${introducedCount}/${required.length}` : percent >= 100 ? "已达标" : needsCoverage ? "待覆盖" : needsRecovery ? "需加强" : `${percent}%`;
    return { required, status, percent };
  };

  return <main className="site-shell">
    <header className="topbar"><button className="brand" type="button" onClick={() => start("adaptive")}><span className="brand-mark">活</span><span><strong>活用道場</strong><small>KATSUYŌ PRACTICE</small></span></button><div className="daily-summary"><div><span>今日</span><strong>{profile.correct} / {profile.attempted}</strong></div><div><span>连续答对</span><strong>{profile.streak}</strong></div></div></header>
    <section className="practice-layout"><aside className="lesson-rail"><p className="eyebrow">YOKUBI 活用路线</p><h1>拆开规律，<br />逐项练会。</h1><p className="intro">{practiceDomain === "verb" ? "系统分别跟踪词类、词干、音便、接续与例外，再把薄弱知识点组合进完整活用题。" : "系统分别跟踪形容词分类、词尾、接续、复合与例外，再把薄弱知识点组合进完整活用题。"}</p>
      <div className="domain-switch" role="tablist" aria-label="活用类型"><button type="button" role="tab" aria-selected={practiceDomain === "verb"} className={practiceDomain === "verb" ? "active" : ""} onClick={() => changePracticeDomain("verb")}>动词活用</button><button type="button" role="tab" aria-selected={practiceDomain === "adjective"} className={practiceDomain === "adjective" ? "active" : ""} onClick={() => changePracticeDomain("adjective")}>形容词活用</button></div>
      <button type="button" className={`adaptive-entry ${mode === "adaptive" ? "active" : ""}`} onClick={() => start("adaptive")}><span className="adaptive-icon">自</span><span><strong>自适应训练</strong><small>{practiceDomain === "adjective" ? "形容词活用" : curriculumScope === "core" ? "核心活用" : "完整路线"} · {focusDisplayLabel}</small></span><b>{focusPercent}%</b></button>
      <button ref={progressTriggerRef} type="button" className="progress-trigger" onClick={() => setProgressOpen(true)} aria-haspopup="dialog"><span><b>知识进度</b><small>{practiceDomain === "adjective" ? "形容词课程与知识点" : curriculumScope === "core" ? "核心活用课程与知识点" : "完整课程与知识点"}</small></span><strong>{masteredKcCount}<i>/</i>{introducedKcs.length}</strong></button>
      <nav className="mode-list" aria-label="专项课程">{visibleCourses.map((item) => { const summary = courseSummary(item); return <button type="button" className={mode === item.id ? "active" : ""} onClick={() => start(item.id)} key={item.id}><span>L{item.lesson}</span><span className="course-name">{item.title}</span><i>{summary.status}</i></button>; })}</nav>
      {practiceDomain === "verb" && (curriculumScope === "core" ? <button type="button" className="curriculum-boundary" disabled={!coreComplete} onClick={() => changeCurriculumScope("full")}><span>{coreComplete ? "核心活用已达标" : "完成核心活用后开放"}</span><strong>继续学习接续表达</strong><small>解锁后续 {VERB_COURSES.length - CORE_COURSE_COUNT} 门课程 →</small></button> : <button type="button" className="curriculum-boundary compact" onClick={() => changeCurriculumScope("core")}><span>当前为完整路线</span><strong>只练核心活用</strong><small>后续成绩会保留</small></button>)}
      <button type="button" className="reset-progress" onClick={resetProgress}>清除本地进度</button>
    </aside><section className="exercise-stage">{migrationNotice && <div className="migration-notice" role="status"><p><strong>知识点模型已经启用</strong><span>旧版组合置信度无法可靠拆分；今日答题总计已保留，各项规则将从基础重新评估。</span></p><button type="button" onClick={() => setMigrationNotice(false)} aria-label="关闭迁移说明">知道了</button></div>}{!finished ? <><div className="stage-meta"><span>第 {questionNumber} 题 / {SESSION_LENGTH}</span><div className="progress-track"><span style={{ width: `${questionNumber / SESSION_LENGTH * 100}%` }} /></div><button type="button" className="quiet-button" onClick={finishRound}>结束本轮</button></div>
      <div className="focus-panel"><div><span>{mode === "adaptive" ? "当前课程" : "专项课程"}</span><strong>{focusDisplayLabel}</strong></div><div className="confidence-meter"><span style={{ width: `${focusPercent}%` }} /></div><b>{focusPercent}%</b></div>
      <article className="exercise-card" key={`${exercise.id}-${questionIndex}-${seed}`}><div className="question-kicker"><span>Yokubi · L{course.lesson}</span><span>{form ? FORM_LABELS[form] : course.title}</span>{result && <span>{KC_FAMILY_LABELS[targetKc.family]} · {targetKc.label}</span>}</div><p className="instruction">{form ? <>请把下面的{practiceDomain === "verb" ? "动词" : "形容词"}变为<strong>{FORM_LABELS[form]}</strong></> : `请选择这个${practiceDomain === "verb" ? "动词" : "形容词"}所属的类别`}</p><div className="word-display"><ruby>{item.surface}<rt>{item.reading}</rt></ruby><span>{item.meaning}</span></div>
      {!form ? <div className={`class-options ${classChoices.length === 2 ? "two-options" : ""}`}>{classChoices.map((choice, index) => <button type="button" key={choice} disabled={Boolean(result)} data-class-shortcut={String(index + 1)} aria-keyshortcuts={String(index + 1)} className={`${selectedClass === choice ? "selected" : ""} ${result && choice === item.class ? "choice-correct" : ""} ${selectedClass === choice && result === "incorrect" ? "choice-wrong" : ""}`} onClick={() => chooseClass(choice)}><small>{choice === "ichidan" ? "る脱落" : choice === "godan" ? "词尾移动" : choice === "irregular" ? "固定变化" : choice === "i" ? "词尾い变化" : "な／だ接续"}</small><strong>{classLabelFor(choice)}</strong><kbd aria-hidden="true">{index + 1}</kbd></button>)}</div> : <form onSubmit={submit}><label htmlFor="answer">你的答案</label><div className={`answer-row ${result ?? ""}`}><input ref={inputRef} id="answer" lang="ja" autoComplete="off" disabled={Boolean(result)} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="输入日语……" /><button type="submit" disabled={!answer.trim() || Boolean(result)}>检查答案</button></div><p className="answer-note">汉字或全假名答案均可</p></form>}
      {!result && <div className="assist-row"><button type="button" className="text-button" onClick={() => setHintShown((v) => !v)}>{hintShown ? "收起提示" : "看一条提示"}</button><button type="button" className="text-button" onClick={() => grade(false, true)}>不知道</button></div>}{hintShown && !result && <p className="hint-box">{hintFor(item, form)}</p>}
      {result && <div className={`feedback ${result}`} role="status"><div className="feedback-copy"><strong>{feedbackTitle}</strong><p>{diagnosticMessage ?? detail.rule}</p></div><div className="knowledge-tags" aria-label="本题涉及的知识点">{derivation.requiredKcIds.map((id: string) => KC_BY_ID.get(id)).filter((kc: KnowledgeComponent | undefined): kc is KnowledgeComponent => Boolean(kc)).map((kc: KnowledgeComponent) => <span className={kc.id === evidenceKcId ? "target" : ""} key={kc.id}>{KC_FAMILY_LABELS[kc.family]} · {kc.label}</span>)}</div><div className="rule-line"><span><FuriganaText surface={item.surface} reading={item.reading} /></span><b>→</b>{!form ? <span className="answer-emphasis">{classLabelFor(item.class)}</span> : acceptedVariant ? <span className="answer-emphasis"><FuriganaText surface={acceptedVariant.surface} reading={acceptedVariant.reading} /></span> : detailSteps ? detailSteps.map((step: string, i: number) => <Fragment key={`${step}-${i}`}><span className={i === detailSteps.length - 1 ? "answer-emphasis" : ""}><FuriganaText surface={step} reading={readingSteps?.[i] ?? step} /></span>{i < detailSteps.length - 1 && <b>→</b>}</Fragment>) : detail.parts.map((part: string, i: number) => <span className={i === detail.parts.length - 1 ? "answer-emphasis" : ""} key={`${part}-${i}`}><FuriganaText surface={part} reading={readingParts[i] ?? part} />{i < detail.parts.length - 1 && <b className="joiner">＋</b>}</span>)}</div>{acceptedVariant && form && <p className="accepted-variant-note">{acceptedVariant.note && <span>{acceptedVariant.note}</span>}<span>{form === "causativePassive" || form.startsWith("causativePassive") ? "完整形式：" : "本站默认展示："}<FuriganaText surface={detail.answer} reading={readingDetail?.answer ?? detail.answer} /></span></p>}{result === "incorrect" && form && <p className="your-answer">你的答案：{answer || "—"}</p>}<div className="feedback-meta"><span>本题重点 {currentPercent}%</span><a href={course.url} target="_blank" rel="noreferrer">查看 Yokubi 中文版{course.lesson === "复习" ? "相关课程" : `第 ${Number(course.lesson)} 课`} ↗</a></div><button type="button" className="next-button" onClick={nextQuestion}>{questionNumber === SESSION_LENGTH ? "查看本轮结果" : focusComplete ? "继续" : "下一题"}<span><kbd>Enter</kbd> →</span></button></div>}{!result && <p className="keyboard-hint">{!form ? <>{classChoices.map((_, index) => <Fragment key={index}><kbd>{index + 1}</kbd>{" "}</Fragment>)}选择答案</> : <><kbd>Enter</kbd> 检查答案</>}</p>}</article></> :
      <article className="completion-card"><p className="completion-jp">おつかれさま</p><span className="completion-label">本轮完成</span><div className="score"><strong>{sessionCorrect}</strong><span>/ {answeredInRound}</span></div><p>{unlocked ? `新知识点已解锁：${unlocked}` : mode === "adaptive" && activeRouteComplete ? practiceDomain === "adjective" ? "形容词核心活用已经全部达标，可以继续巩固。" : curriculumScope === "core" ? "核心活用已经全部达标，可以继续巩固或解锁接续表达。" : "完整路线已经全部达标，可以继续巩固。" : mode === "adaptive" ? "下一轮会继续聚焦当前置信度最低的知识点。" : "专项模式只练当前课程，不会推进自适应路线的解锁。"}</p><div className="completion-focus"><span>{mode === "adaptive" ? "当前薄弱点" : "本专项薄弱点"}</span><strong>{weakestKc?.label ?? "全部已达标"}</strong>{weakestMissingCoverage.length > 0 && <small>待覆盖：{weakestMissingCoverage.join("、")}</small>}</div><button type="button" className="restart-button" onClick={() => start(mode)}>{mode === "adaptive" ? "继续下一轮" : "继续本专项"}<span><kbd>Enter</kbd> →</span></button>{mode === "adaptive" && practiceDomain === "verb" && curriculumScope === "core" && coreComplete && <button type="button" className="unlock-curriculum" onClick={() => changeCurriculumScope("full")}>继续学习接续表达 <span>解锁 {VERB_COURSES.length - CORE_COURSE_COUNT} 门课程 →</span></button>}{mode !== "adaptive" && <button type="button" className="back-adaptive" onClick={() => start("adaptive")}>返回自适应训练</button>}</article>}
      <footer className="source-note">课程编排参考 <a href={CHINESE_YOKUBI_URL} target="_blank" rel="noreferrer">Yokubi 中文版</a>，自适应学习思路参考 kanabr · 本地学习记录 · CC BY 4.0</footer></section></section>
    {progressOpen && <div className="progress-overlay"><button type="button" className="progress-backdrop" onClick={() => setProgressOpen(false)} aria-label="关闭知识进度" /><section className="progress-drawer" role="dialog" aria-modal="true" aria-labelledby="progress-title"><header><div><p>LEARNING PROFILE · {practiceDomain === "adjective" ? "ADJECTIVE" : curriculumScope === "core" ? "VERB CORE" : "VERB FULL"}</p><h2 id="progress-title">知识进度</h2></div><button ref={progressCloseRef} type="button" onClick={() => setProgressOpen(false)} aria-label="关闭知识进度">关闭 <kbd>Esc</kbd></button></header><div className="progress-summary"><div><span>已掌握知识点</span><strong>{masteredKcCount}</strong></div><div><span>已解锁知识点</span><strong>{introducedKcs.length}</strong></div><p>当前统计只包含{practiceDomain === "adjective" ? "形容词活用" : curriculumScope === "core" ? "动词核心活用" : "动词完整路线"}；另一条路线的成绩仍保留。置信度不随时间自动变化。</p></div><section className="profile-transfer" aria-labelledby="profile-transfer-title"><div><h3 id="profile-transfer-title">更换设备</h3><p>导出一个 JSON 备份，在其他浏览器中导入即可恢复全部知识点进度。</p></div><div className="transfer-actions"><button type="button" onClick={exportProgress}>导出数据</button><button type="button" onClick={() => importInputRef.current?.click()}>导入数据</button><input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={importProgress} /></div>{transferNotice && <p className={`transfer-notice ${transferNotice.kind}`} role="status">{transferNotice.text}</p>}</section><div className="progress-view-tabs" role="tablist" aria-label="进度查看方式"><button type="button" role="tab" aria-selected={progressView === "course"} className={progressView === "course" ? "active" : ""} onClick={() => setProgressView("course")}>按课程</button><button type="button" role="tab" aria-selected={progressView === "atomic"} className={progressView === "atomic" ? "active" : ""} onClick={() => setProgressView("atomic")}>按知识点</button></div>
      {progressView === "course" ? <div className="course-progress-list">{visibleCourses.map((item) => { const summary = courseSummary(item); const isFocusCourse = focusKc?.firstCourseId === item.id; return <details key={item.id} open={isFocusCourse}><summary><span><small>L{item.lesson}</small><b>{item.title}</b></span><span>{summary.status}<i aria-hidden="true">⌄</i></span></summary><div className="skill-progress-list">{summary.required.map((kc) => renderKcRow(kc, kc.firstCourseId !== item.id))}</div></details>; })}</div> : <div className="course-progress-list atomic-progress-list">{Object.entries(KC_FAMILY_LABELS).map(([family, label]) => { const components = activeKcs.filter((kc) => kc.family === family); if (!components.length) return null; return <details key={family} open={components.some((kc) => kc.id === focusKc?.id)}><summary><span><small>{components.filter((kc) => kc.gating && introducedSet.has(kc.id)).length}/{components.filter((kc) => kc.gating).length}</small><b>{label}</b></span><span>{components.length} 项<i aria-hidden="true">⌄</i></span></summary><div className="skill-progress-list">{components.map((kc) => renderKcRow(kc))}</div></details>; })}</div>}
      </section></div>}
  </main>;
}
