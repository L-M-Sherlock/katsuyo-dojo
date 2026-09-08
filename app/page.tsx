"use client";

import { FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ADJECTIVES } from "./lib/adjective-catalog.mjs";
import { ADJECTIVE_FORM_LABELS, adjectiveClassLabel, conjugateAdjective, explainAdjectiveConjugation } from "./lib/adjective-conjugation.mjs";
import { buildAdjectiveKnowledgeModel } from "./lib/adjective-knowledge-model.mjs";
import { acceptedVariantKcIds, acceptedVariantNote } from "./lib/answer-variants.mjs";
import { advanceIntroductions, balanceComponentsForCourse, componentConfidence, emptySkillStats, filterReadyExercises, isComponentMastered, selectFocus, updateKnowledgeStats } from "./lib/adaptive.mjs";
import { assignPracticeExercises, exerciseKey, recordRecentWord, wordKey } from "./lib/exercise-selection.mjs";
import { classLabel, conjugate, explainConjugation } from "./lib/conjugation.mjs";
import { COMPOUND_FORM_LABELS, COMPOUND_FORM_SPECS } from "./lib/compound-forms.mjs";
import { summarizeUnifiedCourse } from "./lib/unified-progress.mjs";
import { ADJECTIVE_COURSES as ADJECTIVE_CURRICULUM, CHINESE_YOKUBI_URL, COURSES as VERB_CURRICULUM } from "./lib/curriculum.mjs";
import { furiganaFor } from "./lib/furigana.mjs";
import { semanticsForForm } from "./lib/form-semantics.mjs";
import { buildKnowledgeModel, KC_FAMILY_LABELS } from "./lib/knowledge-model.mjs";
import { createAnswerAnalyzer } from "./lib/answer-analysis.mjs";
import { planDiagnosticTransition } from "./lib/diagnostic-session.mjs";
import { createProfileStore, readPreference, writePreference } from "./lib/profile-store.mjs";
import { canContinueRound, emptyHintState, planPractice, shouldReplan, toggleHint } from "./lib/practice-session.mjs";
import { createUnifiedExport as createProfileExport, parseUnifiedImport as parseProfileImport, UNIFIED_STORAGE_KEY, LEGACY_STORAGE_KEY } from "./lib/unified-profile.mjs";
import { COURSE_STAGES, CURRICULUM_VERSION, UNIFIED_COURSES, sourceForForm } from "./lib/unified-curriculum.mjs";
import { buildUnifiedKnowledge, deriveUnified } from "./lib/unified-knowledge.mjs";

type VerbClass = "godan" | "ichidan" | "irregular";
type AdjectiveClass = "i" | "na";
type PracticeClass = VerbClass | AdjectiveClass;
type PracticeDomain = "verb" | "adjective";
type CompoundBase = "teageru" | "temorau" | "tekureru" | "teiru" | "tearu" | "teoru" | "tai" | "tehoshii" | "youtosuru" | "temiru" | "teshimau" | "teoku" | "teiku" | "tekuru" | "sugiru" | "tagaru";
type CompoundEnding = "Past" | "Negative" | "NegativePast";
type CompoundForm = `${CompoundBase}${CompoundEnding}`;
type Form = "negative" | "past" | "te" | "masu" | "passive" | "potential" | "imperative" | "volitional" | "ba" | "nasai" | "prohibitive" | "causative" | "causativePassive" | "causativePassiveContracted" | "nakute" | "naide" | "zu" | "zuni" | "teshimau" | "chau" | "teoku" | "toku" | "negativePast" | "masuPast" | "masuNegative" | "masuNegativePast" | "passivePast" | "passiveNegative" | "passiveNegativePast" | "potentialPast" | "potentialNegative" | "potentialNegativePast" | "causativePast" | "causativeNegative" | "causativeNegativePast" | "causativePassivePast" | "causativePassiveNegative" | "causativePassiveNegativePast" | "passiveDesireNegativePast" | "teageru" | "temorau" | "tekureru" | "tekudasai" | "naideKudasai" | "teiru" | "teru" | "tearu" | "teoru" | "toru" | "tai" | "tehoshii" | "tara" | "temo" | "nagara" | "tsutsu" | "nakerebaNaranai" | "nakutewaIkenai" | "naitoIkenai" | "tari" | "tewa" | "temoIi" | "nakutemoIi" | "masenka" | "youtosuru" | "temiru" | "teiku" | "teku" | "tekuru" | "tatte" | "sugiru" | "tagaru" | CompoundForm | "adjectiveNegative" | "adjectivePast" | "adjectiveNegativePast" | "adjectiveTe" | "adjectiveAttributive" | "adjectivePredicative" | "adjectiveNaNegative" | "adjectiveNaPast" | "adjectiveNaNegativePast" | "adjectiveNaTe" | "adjectiveBa" | "adjectiveAdverb";
type ModeId = "classify" | "negative" | "past" | "te" | "giving" | "request" | "imperative" | "masu" | "aspect" | "passive" | "potential" | "volitional" | "desire" | "ba" | "tara" | "nasai" | "prohibitive" | "temo" | "concurrent" | "obligation" | "listing" | "permission" | "youtosuru" | "temiru" | "causative" | "causativePassive" | "nakuteNaide" | "zuZuni" | "teshimauChau" | "teokuToku" | "direction" | "tatte" | "sugiru" | "tagaru" | "multiStepCompound" | "basicCompound" | "voiceCompound" | "adjectiveClassify" | "adjectiveIBase" | "adjectiveITe" | "adjectiveNaBase" | "adjectiveConditional" | "adjectiveAdverb";
type PracticeMode = "adaptive" | ModeId;
type Result = "correct" | "incorrect" | "revealed" | null;
type Verb = { domain: "verb"; surface: string; reading: string; meaning: string; class: VerbClass; lexicalSurface?: string };
type Adjective = { domain: "adjective"; surface: string; reading: string; meaning: string; class: AdjectiveClass; iiFamily: boolean };
type PracticeItem = Verb | Adjective;
type Course = { id: ModeId; domain: PracticeDomain; title: string; lesson: string; url: string; forms: readonly Form[]; stage?: number; stageId?: string; stageLabel?: string; stageObjective?: string; review?: boolean; order?: number };
type KnowledgeComponent = { id: string; order: number; label: string; family: keyof typeof KC_FAMILY_LABELS; gating: boolean; firstCourseId: ModeId; firstCourseIndex: number; firstLesson: string; prerequisites: string[]; coverageKcIds: string[]; coverageOnly?: boolean; unlockByPrerequisites?: boolean; masteryPrerequisites?: KnowledgeComponent[] };
type Exercise = { id: string; courseId: ModeId; courseIndex: number; form: Form | null; item: PracticeItem; kcIds: string[]; sourceUrl?: string; prerequisites?: string[] };
type SkillStats = ReturnType<typeof emptySkillStats>;
type Profile = { version: 6; curriculumVersion: number; date: string; attempted: number; correct: number; streak: number; introducedKcIds: string[]; rotation: number; byKc: Record<string, SkillStats>; accessibleCourseIds: string[]; coursePractice: Record<string, string[]>; recentWordKeys: string[]; legacy: object | null; migration: { message?: string; preserved?: number; archived?: number } | null };
type VerbForm = Parameters<typeof conjugate>[2];
type AnswerVariant = { surface: string; reading: string; note: string };
type FormSemantics = { concise: string; coreMeaning: string; register?: string; usageNote?: string; contrast?: string };

function FuriganaText({ surface, reading }: { surface: string; reading: string }) {
  const furigana = furiganaFor(surface, reading);
  return furigana ? <ruby>{surface}<rt>{furigana}</rt></ruby> : <>{surface}</>;
}

type DiagnosticStep = { surface: string; reading: string; form: Form; answers: string[]; readings: string[]; kcIds: string[]; focusId: string | null; continuation: boolean; targetLabel?: string; note?: string; kind?: "stem" | "attachment" | "classification" | "conjugation" | "atomic"; nodeId?: string; diagnosticOnly?: boolean; expectedClass?: VerbClass; providedClass?: VerbClass; classChoices?: { value: VerbClass; label: string }[]; classificationExplanation?: string; analysisItem?: PracticeItem };
type DiagnosticStepResult = { correct: boolean; updatedKcIds: string[] };

function DiagnosticPractice({ item, steps, onEvidence, onDone }: {
  item: PracticeItem; steps: DiagnosticStep[];
  onEvidence: (step: DiagnosticStep, correct: boolean, failedKcId: string | null, confirmed: string[], totalChange: number) => Promise<boolean>;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [practiceSteps, setPracticeSteps] = useState(steps);
  const [answer, setAnswer] = useState("");
  const [hasFollowups, setHasFollowups] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const evaluated = useRef(new Set<string>());
  const examinedNodes = useRef(new Set<string>());
  const input = useRef<HTMLInputElement>(null);
  const firstChoice = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const step = practiceSteps[index];
  useEffect(() => { (firstChoice.current ?? input.current)?.focus(); }, []);
  useEffect(() => { if (feedback && !busy) nextButton.current?.focus(); }, [feedback, busy]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    return checkAnswer(answer);
  }
  async function checkAnswer(value: string) {
    if (!value.trim() || feedback || pending.current) return;
    const analysis = createAnswerAnalyzer(item, step.form, { step })(value);
    const correct = analysis.kind === "correct";
    const diagnosis = analysis.diagnosis;
    if (analysis.kind === "typo" || analysis.kind === "invalid") {
      setNotice(analysis.kind === "invalid" ? analysis.feedback?.message ?? "请检查输入。" : "原词可能有输入笔误，请对照原词修改后重交；本步尚未计分。");
      input.current?.focus();
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const transition = planDiagnosticTransition(practiceSteps, index, analysis, [...evaluated.current], [...examinedNodes.current]);
      const { assessed, writes, followups } = transition;
      if (!await onEvidence(assessed, correct, diagnosis?.kcId ?? null, diagnosis?.confirmedKcIds ?? [], transition.totalChange)) return;
      evaluated.current = new Set(transition.evaluated);
      examinedNodes.current = new Set(transition.examined);
      setAnswer(value);
      setHasFollowups(followups.length > 0);
      setPracticeSteps(transition.nextSteps);
      setNotice(null);
      setFeedback(step.kind === "classification"
        ? `${correct ? "词类判断正确。" : "词类判断有误。"}${step.classificationExplanation ?? ""}本步只确认词类，不更新知识点掌握度。`
        : correct ? (writes.length ? "本步正确，已更新本步知识点。" : "本步正确，已检查过的知识点不重复计分。") : `${analysis.feedback?.message ?? diagnosis?.message ?? "本步输入缺少足够的可辨认片段，请对照正确形式核对；本步不更新掌握度。"}${writes.length ? " 已更新能确认的本步知识点。" : ""}`);
    } finally { pending.current = false; setBusy(false); }
  }
  function next() {
    if (!feedback || pending.current) return;
    if (index === practiceSteps.length - 1) return onDone();
    setIndex(index + 1); setAnswer(""); setFeedback(null); setNotice(null); setHasFollowups(false);
    requestAnimationFrame(() => (firstChoice.current ?? input.current)?.focus());
  }
  return <section className="diagnostic-practice" aria-label="拆步练习">
    <h3>拆步练习 · 第 {index + 1} / {practiceSteps.length} 步</h3>
    <p>拆步作答只评估当前步骤，原题仍计为错误，不额外增加今日题数或连对。</p>
    <p>{step.kind === "classification" ? "请选择这个中间形式继续活用时所属的" : step.continuation ? "已提供正确的中间形式，请继续变为" : "请先变为"}<strong>{step.kind === "classification" ? "动词类别" : step.targetLabel ?? FORM_LABELS[step.form]}</strong></p>
    <p className="diagnostic-word"><FuriganaText surface={step.surface} reading={step.reading} /></p>
    {step.providedClass && <p>已提供词类：<strong>{classLabelFor(step.providedClass)}</strong>。</p>}
    {step.note && <p>{step.note}</p>}
    {step.kind === "classification" ? <div className="class-options two-options">{step.classChoices?.map((choice, choiceIndex) => <button ref={choiceIndex === 0 ? firstChoice : undefined} type="button" key={choice.value} disabled={Boolean(feedback) || busy} className={`${answer === choice.value ? "selected" : ""} ${feedback && choice.value === step.expectedClass ? "choice-correct" : ""} ${feedback && answer === choice.value && choice.value !== step.expectedClass ? "choice-wrong" : ""}`} onClick={() => checkAnswer(choice.value)}>{choice.label}</button>)}</div>
      : <form onSubmit={submit}><label htmlFor="diagnostic-answer">本步答案</label><div className="answer-row"><input ref={input} id="diagnostic-answer" lang="ja" autoComplete="off" value={answer} disabled={Boolean(feedback) || busy} onChange={(event) => { setAnswer(event.target.value); setNotice(null); }} onKeyDown={(event) => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault(); }} /><button type="submit" disabled={!answer.trim() || Boolean(feedback) || busy}>检查本步</button></div></form>}
    {notice && <p role="status">{notice}</p>}
    {feedback && <div role="status"><p>{feedback}</p>{!hasFollowups && step.kind !== "classification" && <p>本步正确形式：<FuriganaText surface={step.answers[0]} reading={step.readings[0]} /></p>}<button ref={nextButton} type="button" className="text-button" data-diagnostic-next aria-keyshortcuts="Enter" onClick={next}>{index === practiceSteps.length - 1 ? "完成拆步" : "练习下一步"} <kbd aria-hidden="true">Enter</kbd></button></div>}
    <button type="button" className="text-button" disabled={busy} onClick={onDone}>跳过剩余拆步，查看解析</button>
  </section>;
}

function SemanticDetails({ semantics }: { semantics: FormSemantics | null }) {
  if (!semantics) return null;
  return <dl className="semantic-details" aria-label="表达含义与使用说明">
    <div className="semantic-core"><dt>含义</dt><dd>{semantics.coreMeaning}</dd></div>
    {semantics.register && <div><dt>语体</dt><dd>{semantics.register}</dd></div>}
    {semantics.usageNote && <div><dt>注意</dt><dd>{semantics.usageNote}</dd></div>}
    {semantics.contrast && <div><dt>辨析</dt><dd>{semantics.contrast}</dd></div>}
  </dl>;
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
const COURSES = UNIFIED_COURSES as Course[];

const FORM_LABELS: Record<string, string> = {
  negative: "否定形", past: "过去形", te: "て形", masu: "ます形", passive: "受身形", potential: "可能形", imperative: "命令形", volitional: "意向形", ba: "ば形", nasai: "なさい命令", prohibitive: "禁止形", causative: "使役形", causativePassive: "使役受身形", causativePassiveContracted: "使役受身缩约形", nakute: "なくて形", naide: "ないで形", zu: "ず形", zuni: "ずに形", teshimau: "てしまう", chau: "ちゃう・じゃう", teoku: "ておく", toku: "とく・どく", negativePast: "否定过去形", masuPast: "礼貌过去形", masuNegative: "礼貌否定形", masuNegativePast: "礼貌否定过去形", passivePast: "受身・过去形", passiveNegative: "受身・否定形", passiveNegativePast: "受身・否定过去形", potentialPast: "可能・过去形", potentialNegative: "可能・否定形", potentialNegativePast: "可能・否定过去形", causativePast: "使役・过去形", causativeNegative: "使役・否定形", causativeNegativePast: "使役・否定过去形", causativePassivePast: "使役受身・过去形", causativePassiveNegative: "使役受身・否定形", causativePassiveNegativePast: "使役受身・否定过去形",
  passiveDesireNegativePast: "受身・愿望・否定过去", teageru: "てあげる", temorau: "てもらう", tekureru: "てくれる", tekudasai: "てください", naideKudasai: "ないでください", teiru: "ている", teru: "てる", tearu: "てある", teoru: "ておる", toru: "とる・どる", tai: "たい", tehoshii: "てほしい", tara: "たら形", temo: "ても・でも", nagara: "ながら", tsutsu: "つつ", nakerebaNaranai: "なければならない", nakutewaIkenai: "なくてはいけない", naitoIkenai: "ないといけない", tari: "たり形", tewa: "ては・では", temoIi: "てもいい", nakutemoIi: "なくてもいい", masenka: "ませんか", youtosuru: "ようとする", temiru: "てみる", teiku: "ていく", teku: "てく", tekuru: "てくる", tatte: "たって・だって", sugiru: "すぎる", tagaru: "たがる",
  ...COMPOUND_FORM_LABELS,
  ...ADJECTIVE_FORM_LABELS,
};
const SESSION_LENGTH = 12;
const STORAGE_KEY = UNIFIED_STORAGE_KEY;
const PRACTICE_DOMAIN_KEY = "katsuyo-practice-domain-v1";
const LEGACY_PROFILE_KEY_V4 = "katsuyo-practice-profile-v4";
const LEGACY_PROFILE_KEY_V3 = "katsuyo-practice-profile-v3";
const LEGACY_PROFILE_KEY_V2 = "katsuyo-practice-profile-v2";
const TRANSITIVE_VERBS = new Set(["書く", "弾く", "話す", "待つ", "読む", "買う", "切る", "飲む", "聞く", "取る", "使う", "置く", "脱ぐ", "貸す", "消す", "持つ", "打つ", "選ぶ", "作る", "売る", "習う", "言う", "払う", "洗う", "手伝う", "拾う", "描く", "磨く", "焼く", "注ぐ", "防ぐ", "稼ぐ", "出す", "直す", "渡す", "返す", "押す", "探す", "落とす", "指す", "起こす", "運ぶ", "学ぶ", "頼む", "申し込む", "包む", "送る", "守る", "食べる", "見る", "教える", "開ける", "閉める", "借りる", "浴びる", "忘れる", "覚える", "着る", "信じる", "調べる", "始める", "続ける", "助ける", "考える", "決める", "止める", "見せる", "受ける", "付ける", "集める", "捨てる", "迎える", "伝える", "変える", "届ける", "片付ける", "する"]);

function clockNow() { return Date.now(); }
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

function eligibleFor(verb: Verb, form: Form | null) {
  const baseForm = form ? COMPOUND_FORM_SPECS[form]?.form ?? form : form;
  if (baseForm === "tearu") return TRANSITIVE_VERBS.has(verb.surface);
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
export const KNOWLEDGE = buildUnifiedKnowledge(VERB_KNOWLEDGE, ADJECTIVE_KNOWLEDGE, VERBS, ADJECTIVES, eligibleFor) as {
  components: KnowledgeComponent[]; exercises: Exercise[]; courseKcIds: Record<ModeId, string[]>;
};
export const ALL_KCS = KNOWLEDGE.components;
const GATING_KCS = ALL_KCS.filter(kc => kc.gating);
const KC_BY_ID = new Map(ALL_KCS.map(kc => [kc.id, kc]));
const INITIAL_KC_IDS = [GATING_KCS[0].id];
const importOptions = () => ({ today: todayKey(), components: ALL_KCS, legacyComponents: [...VERB_KNOWLEDGE.components, ...ADJECTIVE_KNOWLEDGE.components] });
const kcsOf = (courseId: ModeId) => (KNOWLEDGE.courseKcIds[courseId] ?? []).map(id => KC_BY_ID.get(id)).filter((kc): kc is KnowledgeComponent => Boolean(kc));
const exercisesFor = (kc: KnowledgeComponent, mode: PracticeMode, profile: Profile, adaptiveCourseIndex = kc.firstCourseIndex) => {
  const candidates = KNOWLEDGE.exercises.filter(exercise => exercise.kcIds.includes(kc.id) && (mode === "adaptive" ? exercise.courseIndex === adaptiveCourseIndex : exercise.courseId === mode));
  const ready = mode !== "adaptive" && profile.accessibleCourseIds.includes(mode) ? candidates : filterReadyExercises(candidates, kc.id, KNOWLEDGE.components, profile.byKc);
  return ready as Exercise[];
};
function emptyProfile(): Profile { return { version: 6, curriculumVersion: CURRICULUM_VERSION, date: todayKey(), attempted: 0, correct: 0, streak: 0, introducedKcIds: [...INITIAL_KC_IDS], rotation: 0, byKc: {}, accessibleCourseIds: [], coursePractice: {}, recentWordKeys: [], legacy: null, migration: null }; }
function activateReadyKcs(profile: Profile) {
  const advanced = advanceIntroductions(ALL_KCS, profile.introducedKcIds, profile.byKc);
  return { ...profile, introducedKcIds: advanced.introducedKcIds };
}
function makePlan(mode: PracticeMode, profile: Profile, length = SESSION_LENGTH) {
  const candidates = mode === "adaptive" ? profile.introducedKcIds.map(id => KC_BY_ID.get(id)).filter((kc): kc is KnowledgeComponent => Boolean(kc)) : kcsOf(mode).filter(kc => kc.gating && exercisesFor(kc, mode, profile).length > 0);
  const planned = planPractice(candidates, profile.byKc, KNOWLEDGE.courseKcIds, { adaptive: mode === "adaptive", length, rotation: profile.rotation });
  if (mode === "adaptive" && planned.review) {
    const reviewCourses = COURSES.filter(course => {
      const summary = summarizeUnifiedCourse(course, kcsOf(course.id), profile.introducedKcIds, profile);
      return summary.unlocked && summary.mastered === summary.total;
    });
    const reviewCourse = reviewCourses[profile.rotation % reviewCourses.length];
    if (reviewCourse) {
      const reviewKcs = kcsOf(reviewCourse.id).filter(kc => kc.gating).map(kc => ({ ...kc, firstCourseId: reviewCourse.id, firstCourseIndex: COURSES.indexOf(reviewCourse) }));
      return planPractice(reviewKcs, profile.byKc, KNOWLEDGE.courseKcIds, { length, rotation: Math.floor(profile.rotation / reviewCourses.length) });
    }
  }
  return planned;
}

const browserStorage = () => window.localStorage;
function loadProfile(raw: string | null): { profile: Profile; migrated: boolean; invalid: boolean; original?: string | null } {
  const fresh = activateReadyKcs(emptyProfile());
  let original = raw;
  try {
    const legacyV4 = raw ? null : readPreference(browserStorage, LEGACY_STORAGE_KEY) ?? readPreference(browserStorage, LEGACY_PROFILE_KEY_V4);
    const saved = raw ?? legacyV4;
    original = saved;
    if (saved) return { profile: activateReadyKcs(parseProfileImport(JSON.parse(saved), importOptions()) as Profile), migrated: Boolean(legacyV4), invalid: false };
    for (const key of [LEGACY_PROFILE_KEY_V3, LEGACY_PROFILE_KEY_V2, "katsuyo-practice-stats-v1"]) {
      const value = readPreference(browserStorage, key);
      if (!value) continue;
      original = value;
      const legacy = JSON.parse(value);
      const migrated = parseProfileImport({ ...legacy, version: 4, bySkill: {} }, importOptions()) as Profile;
      return { profile: activateReadyKcs(migrated), migrated: true, invalid: false };
    }
  } catch { return { profile: fresh, migrated: false, invalid: true, original }; }
  return { profile: fresh, migrated: false, invalid: false };
}

function deriveFor(item: PracticeItem, form: Form | null) { return deriveUnified(item, form); }
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
  const [courseFilter, setCourseFilter] = useState<"all" | PracticeDomain>("all");
  const [profile, setProfile] = useState<Profile>(() => emptyProfile());
  const [planningProfile, setPlanningProfile] = useState<Profile>(() => emptyProfile());
  const profileRef = useRef(profile);
  const firstPlan = makePlan("adaptive", profile, SESSION_LENGTH);
  const [roundPlan, setRoundPlan] = useState<KnowledgeComponent[]>(firstPlan.plan);
  const [reviewRound, setReviewRound] = useState(firstPlan.review);
  const [focusKc, setFocusKc] = useState<KnowledgeComponent | null>(firstPlan.focus);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [roundOffset, setRoundOffset] = useState(0);
  const [usedQuestionKeys, setUsedQuestionKeys] = useState<string[]>([]);
  const [usedWordKeys, setUsedWordKeys] = useState<string[]>([]);
  const [seed, setSeed] = useState(1);
  const [answer, setAnswer] = useState("");
  const [selectedClass, setSelectedClass] = useState<PracticeClass | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [hint, setHint] = useState(emptyHintState);
  const hintShown = hint.shown;
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [finished, setFinished] = useState(false);
  const [unlocked, setUnlocked] = useState<string | null>(null);
  const [typoNotice, setTypoNotice] = useState(false);
  const [inputNotice, setInputNotice] = useState<string | null>(null);
  const [probesDone, setProbesDone] = useState(false);
  const [probeResults, setProbeResults] = useState<DiagnosticStepResult[]>([]);
  const [probeExtraCount, setProbeExtraCount] = useState(0);
  const [diagnosticMessage, setDiagnosticMessage] = useState<string | null>(null);
  const [confirmedKcIds, setConfirmedKcIds] = useState<string[]>([]);
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
  const [store] = useState(() => createProfileStore(browserStorage, STORAGE_KEY,
    typeof navigator !== "undefined" && navigator.locks
      ? async (callback) => await navigator.locks.request(STORAGE_KEY, callback)
      : null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [invalidRaw, setInvalidRaw] = useState<string | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const blockedRef = useRef(false);
  const savingRef = useRef(false);
  const gradedRef = useRef(false);
  const roundQuestions = useMemo(() => {
    const roundFocus = roundPlan[0] ?? focusKc;
    const allowedIds = new Set(ALL_KCS.map((kc) => kc.id));
    const available = mode === "adaptive"
      ? balanceComponentsForCourse(roundFocus, planningProfile.introducedKcIds.map((id) => KC_BY_ID.get(id)).filter((kc): kc is KnowledgeComponent => Boolean(kc && allowedIds.has(kc.id))), roundFocus ? KNOWLEDGE.courseKcIds[roundFocus.firstCourseId] ?? [] : []) as KnowledgeComponent[]
      : kcsOf(mode).filter((kc) => kc.gating);
    return assignPracticeExercises(roundPlan, {
      seed: seed + planningProfile.rotation,
      byKc: planningProfile.byKc,
      recentWordKeys: planningProfile.recentWordKeys,
      alternativesFor: (preferred: KnowledgeComponent, index: number) => {
        const others = available.filter((item) => item.id !== preferred.id);
        return others.length ? [...others.slice(index % others.length), ...others.slice(0, index % others.length)] : [];
      },
      candidatesFor: (item: KnowledgeComponent) => exercisesFor(item, mode, planningProfile, roundFocus?.firstCourseIndex),
      usedKeys: usedQuestionKeys,
      usedWordKeys,
    }) as { item: KnowledgeComponent; candidate: Exercise }[];
  }, [focusKc, mode, planningProfile, roundPlan, seed, usedQuestionKeys, usedWordKeys]);
  const currentQuestion = roundQuestions[questionIndex];
  const targetKc = currentQuestion?.item ?? focusKc ?? ALL_KCS.find((kc) => kc.gating) ?? GATING_KCS[0];
  const exercise = currentQuestion?.candidate ?? exercisesFor(targetKc, mode, profile)[0] ?? KNOWLEDGE.exercises[0];
  const course = COURSES[exercise.courseIndex];
  const item = exercise.item;
  const practiceDomain = item.domain;
  const form = exercise.form;
  const sourceCourse = sourceForForm(item.domain, form);
  const formSemantics = (form ? semanticsForForm(form) : null) as FormSemantics | null;
  const derivation = deriveFor(item, form);
  const unattributed = result === "incorrect" && diagnosticKcId === null && Boolean(form);
  const diagnosticSteps = useMemo(() => unattributed && form ? createAnswerAnalyzer(item, form)(answer).steps as DiagnosticStep[] : [], [unattributed, item, form, answer]);
  const probing = diagnosticSteps.length > 0 && !probesDone;
  const detail = derivation.detail;
  const detailSteps = form ? derivation.operations.map((step: { output: string }) => step.output) : null;
  const readingItem = { ...item, surface: item.reading, ...(item.domain === "verb" ? { lexicalSurface: item.surface } : {}) } as PracticeItem;
  const readingDetail = form ? explainFor(readingItem, form) : null;
  const readingSteps = form ? deriveFor(readingItem, form).operations.map((step: { output: string }) => step.output) : null;
  const readingParts = readingDetail?.parts ?? [];
  const focusStats = focusKc ? profile.byKc[focusKc.id] ?? emptySkillStats() : emptySkillStats();

  useEffect(() => {
    const snapshot = store.read();
    const loaded = loadProfile(snapshot.raw);
    profileRef.current = loaded.profile;
    startedAt.current = clockNow();
    const next = makePlan("adaptive", loaded.profile, SESSION_LENGTH);
    const frame = requestAnimationFrame(() => {
      setProfile(loaded.profile); setPlanningProfile(loaded.profile);
      setRoundPlan(next.plan); setFocusKc(next.focus); setReviewRound(next.review); setMigrationNotice(loaded.migrated); setLoading(false);
      if (snapshot.error) setStorageNotice("无法读取浏览器存储。练习记录将暂存在本页，请在关闭前导出备份。");
      if (loaded.invalid) {
        blockedRef.current = true; setBlocked(true); setInvalidRaw(loaded.original ?? null);
        setStorageNotice("本地进度无法解析，已暂停练习并保留原记录。可导出原始记录，或清除损坏记录重新开始。");
      }
    });
    const externalChange = (event: StorageEvent) => {
      if (event.key === LEGACY_STORAGE_KEY) { setStorageNotice("旧版标签页仍在更新旧进度。统一路线记录未被覆盖，请先在旧页面导出备份再关闭旧页面。"); }
      if ((event.key === STORAGE_KEY || event.key === null) && store.isExternalChange(event.key === null ? null : event.newValue)) {
        blockedRef.current = true; setBlocked(true); setProgressOpen(false);
        setStorageNotice("另一个标签页已更新学习进度，本页已暂停。可先导出本页记录，再重新加载最新进度。");
      }
    };
    addEventListener("storage", externalChange);
    return () => { cancelAnimationFrame(frame); removeEventListener("storage", externalChange); };
  }, [store]);
  useEffect(() => { if (!progressOpen) return; const oldOverflow = document.body.style.overflow; const progressTrigger = progressTriggerRef.current; document.body.style.overflow = "hidden"; progressCloseRef.current?.focus(); const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setProgressOpen(false); }; addEventListener("keydown", closeOnEscape); return () => { document.body.style.overflow = oldOverflow; removeEventListener("keydown", closeOnEscape); progressTrigger?.focus(); }; }, [progressOpen]);
  const save = useCallback(async (next: Profile) => {
    if (blockedRef.current || savingRef.current) return false;
    savingRef.current = true; setSaving(true);
    try {
      const status = await store.save(next);
      if (status === "conflict" || blockedRef.current) {
        blockedRef.current = true; setBlocked(true); setProgressOpen(false);
        setStorageNotice("另一个标签页已更新学习进度，本次操作未保存。可先导出本页记录，再重新加载最新进度。");
        return false;
      }
      profileRef.current = next; setProfile(next);
      setStorageNotice(status === "unsaved" ? "无法保存到浏览器，练习记录暂存在本页。请在关闭或重新加载前导出备份。" : null);
      return true;
    } finally { savingRef.current = false; setSaving(false); }
  }, [store]);
  const resetQuestion = useCallback(() => { gradedRef.current = false; setAnswer(""); setProbesDone(false); setProbeResults([]); setProbeExtraCount(0); setTypoNotice(false); setInputNotice(null); setSelectedClass(null); setResult(null); setHint(emptyHintState()); setDiagnosticMessage(null); setDiagnosticKcId(null); setConfirmedKcIds([]); setAcceptedVariant(null); startedAt.current = clockNow(); requestAnimationFrame(() => inputRef.current?.focus()); }, [setAnswer, setAcceptedVariant, setDiagnosticKcId, setDiagnosticMessage, setHint, setResult, setSelectedClass]);

  async function grade(correct: boolean, revealed = false, failedKcId: string | null = null, message: string | null = null, extraKcIds: string[] = [], confirmed: string[] = []) {
    if (result || gradedRef.current || blockedRef.current || savingRef.current) return;
    gradedRef.current = true;
    setTypoNotice(false);
    if (!correct && (revealed || !form)) failedKcId ??= targetKc.id;
    const old = profileRef.current.date === todayKey() ? profileRef.current : { ...profileRef.current, date: todayKey(), attempted: 0, correct: 0, streak: 0 };
    const byKc = updateKnowledgeStats(old.byKc, { kcIds: [...new Set([...derivation.requiredKcIds, ...extraKcIds])], focusId: targetKc.id, failedKcId, confirmedKcIds: confirmed, correct, revealed, hintUsed: hint.used, responseMs: clockNow() - startedAt.current, answerLength: form ? conjugateFor(readingItem, form).length : item.reading.length });
    if (!await save({ ...old, attempted: old.attempted + 1, correct: old.correct + (correct ? 1 : 0), streak: correct ? old.streak + 1 : 0, byKc, recentWordKeys: recordRecentWord(old.recentWordKeys, exercise), coursePractice: correct ? { ...old.coursePractice, [course.id]: [...new Set([...(old.coursePractice[course.id] ?? []), exerciseKey(exercise)])].slice(-12) } : old.coursePractice })) { gradedRef.current = false; return; }
    setDiagnosticMessage(message);
    setDiagnosticKcId(failedKcId);
    setConfirmedKcIds(confirmed);
    setResult(revealed ? "revealed" : correct ? "correct" : "incorrect");
    if (correct) setSessionCorrect((value) => value + 1);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim() || !form || result || gradedRef.current || blockedRef.current || savingRef.current) return;
    const analysis = createAnswerAnalyzer(item, form)(answer);
    if (analysis.kind === "invalid") { setInputNotice(analysis.feedback?.message ?? "请检查输入。"); inputRef.current?.focus(); return; }
    setInputNotice(null);
    const match = analysis.match as { correct: boolean; variant: { surface: string; reading: string } | null };
    if (match.correct) {
      if (match.variant) setAcceptedVariant({ ...match.variant, note: acceptedVariantNote(item, form, match.variant) });
      return grade(true, false, null, null, match.variant ? acceptedVariantKcIds(item, form, match.variant) : []);
    }
    const diagnosed = analysis.diagnosis;
    if (analysis.kind === "typo") {
      setTypoNotice(true);
      inputRef.current?.focus();
      return;
    }
    grade(false, false, diagnosed?.kcId ?? null, analysis.feedback?.message ?? diagnosed?.message?.replace(item.reading, item.surface) ?? null, [], diagnosed?.confirmedKcIds ?? []);
  }
  async function saveStepEvidence(step: DiagnosticStep, correct: boolean, failedKcId: string | null, confirmed: string[], totalChange: number) {
    const current = profileRef.current;
    const byKc = step.diagnosticOnly ? current.byKc : updateKnowledgeStats(current.byKc, { kcIds: step.kcIds, focusId: step.focusId ?? "", failedKcId, confirmedKcIds: confirmed, correct, hintUsed: hint.used });
    if (!await save({ ...current, byKc })) return false;
    // Summarize evidence actually accepted by the scorer and save operation.
    // These results belong to the probes, not the original answer's diagnosis.
    const updatedKcIds = Object.keys(byKc).filter((id) => byKc[id] !== current.byKc[id]);
    setProbeResults((previous) => [...previous, { correct, updatedKcIds }]);
    if (totalChange) setProbeExtraCount((previous) => previous + totalChange);
    return true;
  }
  function chooseClass(choice: PracticeClass) { if (!result) { setSelectedClass(choice); grade(choice === item.class); } }

  const finishRound = useCallback(async () => {
    if (blockedRef.current || savingRef.current) return;
    if (mode === "adaptive") { const current = profileRef.current; const advanced = advanceIntroductions(ALL_KCS, current.introducedKcIds, current.byKc) as { introducedKcIds: string[]; added: KnowledgeComponent[] }; if (advanced.added.length) { if (!await save({ ...current, introducedKcIds: advanced.introducedKcIds })) return; const next = advanced.added.at(-1)!; setUnlocked(`${COURSES[next.firstCourseIndex].title} · ${next.label}`); } }
    setFinished(true);
  }, [mode, save]);
  const nextQuestion = useCallback(async () => {
    if (!gradedRef.current || blockedRef.current || savingRef.current || probing) return;
    const answeredCount = roundOffset + questionIndex + 1;
    if (answeredCount >= SESSION_LENGTH) return finishRound();
    const current = profileRef.current;
    if (shouldReplan(focusKc, current.byKc, reviewRound)) {
      const advanced = mode === "adaptive"
        ? advanceIntroductions(ALL_KCS, current.introducedKcIds, current.byKc) as { introducedKcIds: string[]; added: KnowledgeComponent[] }
        : { introducedKcIds: current.introducedKcIds, added: [] as KnowledgeComponent[] };
      const nextProfile = advanced.added.length ? { ...current, introducedKcIds: advanced.introducedKcIds } : current;
      if (advanced.added.length) {
        if (!await save(nextProfile)) return;
        const introduced = advanced.added.at(-1)!;
        setUnlocked(`${COURSES[introduced.firstCourseIndex].title} · ${introduced.label}`);
      }
      const remaining = SESSION_LENGTH - answeredCount;
      const next = makePlan(mode, nextProfile, remaining);
      if (canContinueRound(focusKc, next, nextProfile.byKc, mode === "adaptive")) {
        const consumed = [...new Set([...usedQuestionKeys, ...roundQuestions.slice(0, questionIndex + 1).map(({ candidate }) => exerciseKey(candidate))])];
        setUsedWordKeys([...usedWordKeys, ...roundQuestions.slice(0, questionIndex + 1).map(({ candidate }) => wordKey(candidate))]);
        setPlanningProfile(nextProfile); setRoundPlan(next.plan); setFocusKc(next.focus); setReviewRound(next.review); setRoundOffset(answeredCount); setUsedQuestionKeys(consumed); setQuestionIndex(0); setSeed((value) => value + 1); resetQuestion();
        return;
      }
      finishRound();
      return;
    }
    setQuestionIndex((value) => value + 1);
    resetQuestion();
  }, [finishRound, focusKc, mode, probing, questionIndex, reviewRound, resetQuestion, roundOffset, roundQuestions, save, usedQuestionKeys, usedWordKeys]);
  const classChoices = useMemo(() => practiceDomain === "verb" ? ["ichidan", "godan", "irregular"] as PracticeClass[] : ["i", "na"] as PracticeClass[], [practiceDomain]);
  useEffect(() => {
    if (progressOpen || blocked || loading || saving) return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const advanceButton = target?.closest("[data-diagnostic-next],.next-button");
      if (event.isComposing || event.keyCode === 229 || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        if (advanceButton && event.key === "Enter") event.preventDefault();
        return;
      }
      if (event.defaultPrevented) return;
      // Disabled answer fields can retain focus after grading in some browsers.
      if (target?.closest("input:not(:disabled),textarea,select,[contenteditable='true']")) return;
      if (finished) {
        if (event.key !== "Enter" || target?.closest("a,button")) return;
        event.preventDefault(); document.querySelector<HTMLButtonElement>(".restart-button")?.click(); return;
      }
      if (!result && !form && classChoices.map((_, index) => String(index + 1)).includes(event.key)) {
        event.preventDefault(); document.querySelector<HTMLButtonElement>(`[data-class-shortcut="${event.key}"]`)?.click(); return;
      }
      if (!result || event.key !== "Enter" || (target?.closest("a,button") && !advanceButton)) return;
      event.preventDefault();
      if (probing) document.querySelector<HTMLButtonElement>("[data-diagnostic-next]")?.click();
      else nextQuestion();
    };
    addEventListener("keydown", handler);
    return () => removeEventListener("keydown", handler);
  }, [blocked, classChoices, finished, form, loading, nextQuestion, probing, progressOpen, result, saving]);
  function finishDiagnosticPractice() {
    setProbesDone(true);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".next-button")?.focus());
  }

  function applyRound(nextMode: PracticeMode, current: Profile) {
    const next = makePlan(nextMode, current, SESSION_LENGTH);
    setPlanningProfile(current); setMode(nextMode); setRoundPlan(next.plan); setFocusKc(next.focus); setReviewRound(next.review);
    setQuestionIndex(0); setRoundOffset(0); setUsedQuestionKeys([]); setUsedWordKeys([]); setSessionCorrect(0); setFinished(false); setUnlocked(null);
    setSeed((value) => value + 1); resetQuestion();
  }
  async function start(nextMode: PracticeMode) {
    if (nextMode !== "adaptive" && !summarizeUnifiedCourse(COURSES.find(c => c.id === nextMode)!, kcsOf(nextMode), profileRef.current.introducedKcIds, profileRef.current).unlocked) return;
    const current = activateReadyKcs({ ...profileRef.current, rotation: profileRef.current.rotation + 1 });
    if (await save(current)) applyRound(nextMode, current);
  }
  function changeCourseFilter(value: "all" | PracticeDomain) {
    setCourseFilter(value); writePreference(browserStorage, PRACTICE_DOMAIN_KEY, value);
  }
  async function resetProgress() {
    if (!window.confirm("确定清除这台设备上的全部练习进度吗？")) return;
    const fresh = activateReadyKcs(emptyProfile());
    if (!await save(fresh)) return;
    for (const key of [LEGACY_PROFILE_KEY_V4, LEGACY_PROFILE_KEY_V3, LEGACY_PROFILE_KEY_V2, "katsuyo-practice-stats-v1"]) writePreference(browserStorage, key, null);
    applyRound("adaptive", fresh);
  }
  async function resetInvalidProgress() {
    if (!window.confirm("确定清除无法解析的本地记录并重新开始吗？建议先导出原始记录。")) return;
    blockedRef.current = false;
    const fresh = activateReadyKcs(emptyProfile());
    if (!await save(fresh)) return;
    setBlocked(false); setInvalidRaw(null);
    applyRound("adaptive", fresh);
  }
  function downloadProgress(text: string, filename: string) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  function exportProgress() {
    downloadProgress(JSON.stringify(createProfileExport(profileRef.current), null, 2), `katsuyo-dojo-progress-${todayKey()}.json`);
    setTransferNotice({ kind: "success", text: "练习数据已导出，可以在另一台设备上导入。" });
  }
  async function importProgress(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = activateReadyKcs(parseProfileImport(JSON.parse(await file.text()), importOptions()) as Profile);
      if (!window.confirm("导入会覆盖这台设备当前的练习进度。确定继续吗？")) return;
      if (!await save(imported)) return;
      applyRound("adaptive", imported);
      setTransferNotice({ kind: "success", text: "导入成功，练习进度已经恢复。" });
    } catch (error) {
      setTransferNotice({ kind: "error", text: error instanceof Error ? error.message : "无法读取这个备份文件。" });
    }
  }

  const focusPercent = Math.round((focusKc ? componentConfidence(focusKc, profile.byKc) : focusStats.confidence) * 100);
  const evidenceKcId = unattributed ? "" : diagnosticKcId ?? targetKc.id;
  const evidenceKc = KC_BY_ID.get(evidenceKcId);
  const currentPercent = Math.round((evidenceKc ? componentConfidence(evidenceKc, profile.byKc) : profile.byKc[evidenceKcId]?.confidence ?? 0) * 100);
  const introducedSet = new Set(profile.introducedKcIds);
  const activeKcs = ALL_KCS;
  const activeKcIdSet = new Set(activeKcs.map((kc) => kc.id));
  const introducedKcs = profile.introducedKcIds.map((id) => KC_BY_ID.get(id)).filter((kc): kc is KnowledgeComponent => Boolean(kc && activeKcIdSet.has(kc.id)));
  const masteredKcCount = introducedKcs.filter((item) => isComponentMastered(item, profile.byKc)).length;
  const activeRouteComplete = activeKcs.filter((kc) => kc.gating).every((kc) => isComponentMastered(kc, profile.byKc));
  const visibleCourses = COURSES.filter(c => courseFilter === "all" || c.domain === courseFilter);
  const focusDisplayLabel = mode === "adaptive" && focusKc ? COURSES[focusKc.firstCourseIndex].title : course.title;
  const selectedWeakestKc = selectFocus(mode === "adaptive" ? introducedKcs : kcsOf(mode).filter((kc) => kc.gating), profile.byKc) as KnowledgeComponent | null;
  const weakestKc = mode === "adaptive" && activeRouteComplete ? null : selectedWeakestKc;
  const weakestMissingCoverage = weakestKc?.coverageKcIds.filter((id) => (profile.byKc[id]?.correct ?? 0) < 1).map((id) => KC_BY_ID.get(id)?.label).filter(Boolean) ?? [];
  const questionNumber = roundOffset + questionIndex + 1;
  const answeredInRound = Math.min(roundOffset + questionIndex + (result ? 1 : 0), SESSION_LENGTH);
  const focusComplete = Boolean(result && focusKc && isComponentMastered(focusKc, profile.byKc));
  const feedbackTitle = result === "correct" ? "正解！" : result === "revealed" ? "记住这个变化" : "差一点";
  const probeUpdatedCount = new Set(probeResults.flatMap((step) => step.updatedKcIds)).size;
  const probeCorrectCount = probeResults.filter((step) => step.correct).length;
  const probeTotalCount = diagnosticSteps.length + probeExtraCount;
  const probeStatus = !probesDone ? "拆步练习进行中" : probeResults.length === probeTotalCount ? "拆步练习已完成" : probeResults.length ? "已跳过剩余拆步" : "已跳过拆步练习";
  const probeSummary = diagnosticSteps.length > 0 && (probesDone || probeResults.length > 0)
    ? `${probeStatus}：已作答 ${probeResults.length} / ${probeTotalCount} 步，答对 ${probeCorrectCount} 步。${probeUpdatedCount ? "可确认的知识点掌握度已更新，未确认部分保持不变。" : confirmedKcIds.length ? "本次拆步掌握度未更新，原题已确认的记录保留。" : "本次拆步掌握度未更新。"}原题仍计为错误。`
    : null;
  const feedbackMessage = probeSummary ?? diagnosticMessage ?? (unattributed ? "本题已记错，但暂时无法确定出错步骤，知识点掌握度未更新。" : detail.rule);
  const feedbackMeta = probeSummary
    ? `${probeStatus} · ${probeUpdatedCount ? `已更新 ${probeUpdatedCount} 个知识点` : "本次拆步掌握度未更新"}`
    : unattributed ? (confirmedKcIds.length ? "已确认前置步骤 · 后续变化单独评估" : diagnosticSteps.length ? "知识点待确认 · 拆步作答单独评估" : "本题未归因，知识点掌握度未更新") : `本题重点 ${currentPercent}%`;
  const kcStatus = (kc: KnowledgeComponent) => {
    const stats = profile.byKc[kc.id] ?? emptySkillStats();
    const nonGatingParent = ALL_KCS.find(parent => parent.coverageKcIds.includes(kc.id))?.id ?? "exception.ru-godan";
    const active = kc.gating ? introducedSet.has(kc.id) : introducedSet.has(nonGatingParent) || stats.attempts > 0;
    if (kc.id.startsWith("facet.")) return !active ? "未解锁" : (stats.correct ?? 0) >= 1 ? "已覆盖" : "待覆盖";
    if (focusKc?.id === kc.id && active) return "当前聚焦";
    if (!active && stats.attempts > 0) return "已预习";
    if (!active) return kc.gating ? "未解锁" : "词汇记录";
    if (isComponentMastered(kc, profile.byKc)) return "已达标";
    if (kc.masteryPrerequisites?.some(prerequisite => !isComponentMastered(prerequisite, profile.byKc))) return "待先修达标";
    if (kc.coverageKcIds.some((id) => (profile.byKc[id]?.correct ?? 0) < 1)) return "待覆盖";
    if (stats.bestConfidence >= 1 || (kc.coverageOnly && kc.coverageKcIds.every((id) => (profile.byKc[id]?.correct ?? 0) > 0))) return "需加强";
    return stats.attempts === 0 ? profile.migration ? "待确认" : "未练习" : "学习中";
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
      <div className="skill-progress-copy"><span>{kc.label}</span><small>{kc.id.startsWith("lexeme.") ? "逐词例外 · " : kc.id.startsWith("facet.") ? "覆盖切面 · " : ""}{kcStatus(kc)} · {stats.attempts} 次作答{coverage ? ` · 覆盖 ${coverage}` : ""}{reused ? ` · 沿用${COURSES[kc.firstCourseIndex].title}` : ""}{prerequisiteLabels.length ? ` · 先修：${prerequisiteLabels.join("、")}` : ""}</small></div>
      <div className="skill-progress-value"><div><span style={{ width: `${isFacet ? stats.correct >= 1 ? 100 : 0 : percent}%` }} /></div><b>{isFacet ? stats.correct >= 1 ? "✓" : "—" : `${percent}%`}</b></div>
    </div>;
  };
  const courseSummary = (item: Course) => {
    const required = kcsOf(item.id).filter((kc) => kc.gating);
    return summarizeUnifiedCourse(item, required, introducedSet, profile);
  };

  return <main className="site-shell">
    {storageNotice && <div className="storage-notice" role="alert"><p>{storageNotice}</p><button type="button" onClick={exportProgress}>导出本页记录</button>{invalidRaw !== null && <><button type="button" onClick={() => downloadProgress(invalidRaw, `katsuyo-dojo-original-${todayKey()}.json`)}>导出原始记录</button><button type="button" disabled={saving} onClick={resetInvalidProgress}>清除损坏记录并重新开始</button></>}{blocked && <button type="button" onClick={() => window.location.reload()}>重新加载最新进度</button>}</div>}
    {loading && <p role="status">正在加载学习进度……</p>}
    <fieldset className="practice-controls" disabled={loading || saving || blocked} aria-busy={loading || saving}>
    <header className="topbar"><button className="brand" type="button" onClick={() => start("adaptive")}><span className="brand-mark">活</span><span><strong>活用道場</strong><small>KATSUYŌ PRACTICE</small></span></button><div className="topbar-actions"><div className="daily-summary"><div><span>今日</span><strong>{profile.correct} / {profile.attempted}</strong></div><div><span>连续答对</span><strong>{profile.streak}</strong></div></div><a className="github-link" href="https://github.com/L-M-Sherlock/katsuyo-dojo" target="_blank" rel="noopener noreferrer" aria-label="GitHub 源代码（新标签页打开）">GitHub <span aria-hidden="true">↗</span></a></div></header>
    <section className="practice-layout"><aside className="lesson-rail"><p className="eyebrow">YOKUBI 活用路线</p><h1>拆开规律，<br />逐项练会。</h1><p className="intro">先掌握动词与形容词的基本词形，再按表达目标学习，最后综合运用。</p>
      <div className="domain-switch" role="tablist" aria-label="专项课程筛选">{(["all", "verb", "adjective"] as const).map(value => <button type="button" role="tab" key={value} aria-selected={courseFilter === value} className={courseFilter === value ? "active" : ""} onClick={() => changeCourseFilter(value)}>{value === "all" ? "全部课程" : value === "verb" ? "动词专项" : "形容词专项"}</button>)}</div>
      <p className="answer-note">筛选专项课程，共用同一份学习进度。</p>
      <button type="button" className={`adaptive-entry ${mode === "adaptive" ? "active" : ""}`} onClick={() => start("adaptive")}><span className="adaptive-icon">自</span><span><strong>自适应训练</strong><small>统一路线 · {focusDisplayLabel}</small><small>本轮重点掌握度</small></span><b>{focusPercent}%</b></button>
      <button ref={progressTriggerRef} type="button" className="progress-trigger" onClick={() => setProgressOpen(true)} aria-haspopup="dialog"><span><b>知识进度</b><small>{"全部课程与共享知识点"}</small></span><strong>{masteredKcCount}<i>/</i>{GATING_KCS.length}</strong></button>
      <nav className="mode-list" aria-label="专项课程">{visibleCourses.map((item) => { const summary = courseSummary(item); return <button type="button" className={mode === item.id ? "active" : ""} disabled={!summary.unlocked} onClick={() => start(item.id)} key={item.id}><span>{item.order !== undefined ? item.order + 1 : item.lesson}</span><span className="course-name"><small>{item.stageLabel}</small>{item.title}</span><i>{summary.status}</i></button>; })}</nav>

      <button type="button" className="reset-progress" onClick={resetProgress}>清除本地进度</button>
    </aside><section className="exercise-stage">{migrationNotice && <div className="migration-notice" role="status"><p><strong>统一学习路线已启用</strong><span>动词与形容词已合并：等价规则记录保留，复合历史已归档；尚不能确认的共享规则会安排补测。{profile.migration && ` 已保留 ${profile.migration.preserved ?? 0} 项统计，归档 ${profile.migration.archived ?? 0} 项待确认统计。`}</span></p><button type="button" onClick={() => setMigrationNotice(false)} aria-label="关闭迁移说明">知道了</button></div>}{!finished ? <><div className="stage-meta"><span>第 {questionNumber} 题 / {SESSION_LENGTH}</span><div className="progress-track"><span style={{ width: `${questionNumber / SESSION_LENGTH * 100}%` }} /></div><button type="button" className="quiet-button" onClick={finishRound}>结束本轮</button></div>
      <div className="focus-panel"><div><span>{reviewRound ? "巩固训练" : mode === "adaptive" ? "本轮重点" : "专项课程"}</span><strong>{focusDisplayLabel}</strong><small>本课达标 {courseSummary(course).mastered} / {courseSummary(course).total}</small></div><div className="confidence-meter"><span style={{ width: `${focusPercent}%` }} /></div><b>{focusPercent}%</b></div>
      <article className="exercise-card" key={`${exercise.id}-${questionIndex}-${seed}`}><div className="question-kicker"><span>Yokubi · L{sourceCourse?.lesson ?? course.lesson}</span><span>{form ? FORM_LABELS[form] : course.title}</span>{result && <span>{KC_FAMILY_LABELS[targetKc.family]} · {targetKc.label}</span>}</div><p className="instruction">{form ? <>请把下面的{practiceDomain === "verb" ? "动词" : "形容词"}变为<strong>{FORM_LABELS[form]}</strong></> : `请选择这个${practiceDomain === "verb" ? "动词" : "形容词"}所属的类别`}</p>{formSemantics && <p className="semantic-brief"><span>表达作用</span><span>{formSemantics.concise}</span></p>}<div className="word-display"><ruby>{item.surface}<rt>{item.reading}</rt></ruby><span>{item.meaning}</span></div>
      {!form ? <div className={`class-options ${classChoices.length === 2 ? "two-options" : ""}`}>{classChoices.map((choice, index) => <button type="button" key={choice} disabled={Boolean(result)} data-class-shortcut={String(index + 1)} aria-keyshortcuts={String(index + 1)} className={`${selectedClass === choice ? "selected" : ""} ${result && choice === item.class ? "choice-correct" : ""} ${selectedClass === choice && result === "incorrect" ? "choice-wrong" : ""}`} onClick={() => chooseClass(choice)}><small>{choice === "ichidan" ? "る脱落" : choice === "godan" ? "词尾移动" : choice === "irregular" ? "固定变化" : choice === "i" ? "词尾い变化" : "な／だ接续"}</small><strong>{classLabelFor(choice)}</strong><kbd aria-hidden="true">{index + 1}</kbd></button>)}</div> : <form onSubmit={submit}><label htmlFor="answer">你的答案</label><div className={`answer-row ${result ?? ""}`}><input ref={inputRef} id="answer" lang="ja" onKeyDown={(event) => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault(); }} autoComplete="off" disabled={Boolean(result)} value={answer} aria-describedby={typoNotice ? "typo-notice" : undefined} onChange={(e) => { setAnswer(e.target.value); setTypoNotice(false); setInputNotice(null); }} placeholder="输入日语……" /><button type="submit" disabled={!answer.trim() || Boolean(result)}>检查答案</button></div><p className="answer-note">汉字或全假名答案均可</p>{inputNotice && <p className="hint-box" role="status">{inputNotice}</p>}{typoNotice && <p id="typo-notice" className="hint-box" role="status">不需要变化的部分与原词不一致，可能是输入笔误。请对照原词修改后重新提交；本次未计入作答或知识点统计。</p>}</form>}
      {!result && <div className="assist-row"><button type="button" className="text-button" onClick={() => setHint(toggleHint)}>{hintShown ? "收起提示" : "看一条提示"}</button><button type="button" className="text-button" onClick={() => grade(false, true)}>不知道</button></div>}{hintShown && !result && <p className="hint-box">{hintFor(item, form)}</p>}
      {result && <div className={`feedback ${result}`} role="status"><div className="feedback-copy"><strong>{feedbackTitle}</strong><p>{feedbackMessage}</p></div><div className="knowledge-tags" aria-label="本题涉及的知识点">{derivation.requiredKcIds.map((id: string) => KC_BY_ID.get(id)).filter((kc: KnowledgeComponent | undefined): kc is KnowledgeComponent => Boolean(kc)).map((kc: KnowledgeComponent) => <span className={kc.id === evidenceKcId ? "target" : confirmedKcIds.includes(kc.id) ? "confirmed" : ""} key={kc.id}>{confirmedKcIds.includes(kc.id) && "✓ 已确认 · "}{KC_FAMILY_LABELS[kc.family]} · {kc.label}</span>)}</div>{confirmedKcIds.length > 0 && <p className="partial-evidence-note">{unattributed ? (probesDone ? "原题中已确认的步骤已计入正确记录；拆步结果单独记录。整题仍计为错误。" : "已确认的步骤计入正确记录；剩余错误知识点暂不扣分，继续单独检查。整题仍计为错误。") : "已确认的步骤计入正确记录；红色知识点记错，其余不更新。整题仍计为错误。"}</p>}{probing && <DiagnosticPractice key={`${exercise.id}-${questionIndex}-${seed}`} item={item} steps={diagnosticSteps} onEvidence={saveStepEvidence} onDone={finishDiagnosticPractice} />}<div hidden={probing}><div className="rule-line"><span><FuriganaText surface={item.surface} reading={item.reading} /></span><b>→</b>{!form ? <span className="answer-emphasis">{classLabelFor(item.class)}</span> : acceptedVariant ? <span className="answer-emphasis"><FuriganaText surface={acceptedVariant.surface} reading={acceptedVariant.reading} /></span> : detailSteps ? detailSteps.map((step: string, i: number) => <Fragment key={`${step}-${i}`}><span className={i === detailSteps.length - 1 ? "answer-emphasis" : ""}><FuriganaText surface={step} reading={readingSteps?.[i] ?? step} /></span>{i < detailSteps.length - 1 && <b>→</b>}</Fragment>) : detail.parts.map((part: string, i: number) => <span className={i === detail.parts.length - 1 ? "answer-emphasis" : ""} key={`${part}-${i}`}><FuriganaText surface={part} reading={readingParts[i] ?? part} />{i < detail.parts.length - 1 && <b className="joiner">＋</b>}</span>)}</div>{acceptedVariant && form && <p className="accepted-variant-note">{acceptedVariant.note && <span>{acceptedVariant.note}</span>}<span>{form === "causativePassive" || form.startsWith("causativePassive") ? "完整形式：" : "本站默认展示："}<FuriganaText surface={detail.answer} reading={readingDetail?.answer ?? detail.answer} /></span></p>}{result === "incorrect" && form && <p className="your-answer">你的答案：{answer || "—"}</p>}<SemanticDetails semantics={formSemantics} /></div><div className="feedback-meta"><span>{feedbackMeta}</span><a href={exercise.sourceUrl ?? course.url} target="_blank" rel="noreferrer">查看本题参考课程 ↗</a></div><button type="button" className="next-button" disabled={probing} onClick={nextQuestion}>{probing ? "请完成或跳过拆步" : questionNumber === SESSION_LENGTH ? "查看本轮结果" : focusComplete ? "继续" : "下一题"}{!probing && <span><kbd>Enter</kbd> →</span>}</button></div>}{!result && <p className="keyboard-hint">{!form ? <>{classChoices.map((_, index) => <Fragment key={index}><kbd>{index + 1}</kbd>{" "}</Fragment>)}选择答案</> : <><kbd>Enter</kbd> 检查答案</>}</p>}</article></> :
      <article className="completion-card"><p className="completion-jp">おつかれさま</p><span className="completion-label">本轮完成</span><div className="score"><strong>{sessionCorrect}</strong><span>/ {answeredInRound}</span></div><p>{unlocked ? `新知识点已解锁：${unlocked}` : mode === "adaptive" && activeRouteComplete ? "全部知识点已达标，接下来按课程轮换巩固并完成综合复习。" : mode === "adaptive" ? "下一轮会继续聚焦当前置信度最低的知识点。" : "专项模式只练当前课程，不会推进自适应路线的解锁。"}</p><div className="completion-focus"><span>{mode === "adaptive" ? "当前薄弱点" : "本专项薄弱点"}</span><strong>{weakestKc?.label ?? "全部已达标"}</strong>{weakestMissingCoverage.length > 0 && <small>待覆盖：{weakestMissingCoverage.join("、")}</small>}</div><button type="button" className="restart-button" onClick={() => start(mode)}>{mode === "adaptive" ? "继续下一轮" : "继续本专项"}<span><kbd>Enter</kbd> →</span></button>{mode !== "adaptive" && <button type="button" className="back-adaptive" onClick={() => start("adaptive")}>返回自适应训练</button>}</article>}
      <footer className="source-note">课程编排参考 <a href={CHINESE_YOKUBI_URL} target="_blank" rel="noreferrer">Yokubi 中文版</a>，自适应学习思路参考 kanabr · 本地学习记录 · CC BY 4.0</footer></section></section>
    {progressOpen && <div className="progress-overlay"><button type="button" className="progress-backdrop" onClick={() => setProgressOpen(false)} aria-label="关闭知识进度" /><section className="progress-drawer" role="dialog" aria-modal="true" aria-labelledby="progress-title"><header><div><p>LEARNING PROFILE · {"UNIFIED"}</p><h2 id="progress-title">知识进度</h2></div><button ref={progressCloseRef} type="button" onClick={() => setProgressOpen(false)} aria-label="关闭知识进度">关闭 <kbd>Esc</kbd></button></header><div className="progress-summary"><div><span>已掌握知识点</span><strong>{masteredKcCount}</strong></div><div><span>已解锁知识点</span><strong>{introducedKcs.length}</strong></div><p>当前统计只包含{"统一路线"}，动词与形容词共用基础规则记录。置信度不随时间自动变化。</p></div><section className="profile-transfer" aria-labelledby="profile-transfer-title"><div><h3 id="profile-transfer-title">更换设备</h3><p>导出一个 JSON 备份，在其他浏览器中导入即可恢复全部知识点进度。</p></div><div className="transfer-actions"><button type="button" onClick={exportProgress}>导出数据</button><button type="button" onClick={() => importInputRef.current?.click()}>导入数据</button><input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={importProgress} /></div>{transferNotice && <p className={`transfer-notice ${transferNotice.kind}`} role="status">{transferNotice.text}</p>}</section><details className="curriculum-guide"><summary>课程如何安排</summary><p><strong>分组：</strong>按主要学习目标说明每门课学什么。</p><p><strong>排序：</strong>先学所需规则，再练它们的应用；条件相同时，优先复用和对照已学词形，主题相邻作为补充。可能与态接在基础变化之后，复用词干变化和基本时态。</p><p><strong>解锁：</strong>按知识点的先修条件开放。排在前面的课程并不都是后课的先修，同一主题也不必连续学习。</p><ol>{COURSE_STAGES.map((stage) => <li key={stage.id}><strong>{stage.label}</strong><span>{stage.objective}</span></li>)}</ol><p>同一课程先练新形式，再练它的后续变化。课程列表使用本站学习序号，题目上的 Yokubi 课号标明内容来源。</p></details><div className="progress-view-tabs" role="tablist" aria-label="进度查看方式"><button type="button" role="tab" aria-selected={progressView === "course"} className={progressView === "course" ? "active" : ""} onClick={() => setProgressView("course")}>按课程</button><button type="button" role="tab" aria-selected={progressView === "atomic"} className={progressView === "atomic" ? "active" : ""} onClick={() => setProgressView("atomic")}>按知识点</button></div>
      {progressView === "course" ? <div className="course-progress-list">{visibleCourses.map((item) => { const summary = courseSummary(item); const isFocusCourse = focusKc?.firstCourseId === item.id; return <details key={item.id} open={isFocusCourse}><summary><span><small>{item.order !== undefined ? item.order + 1 : item.lesson}</small><b>{item.title}</b></span><span>{summary.status}<i aria-hidden="true">⌄</i></span></summary><p className="course-objective"><strong>{item.stageLabel}</strong> · {item.stageObjective}</p><div className="skill-progress-list">{summary.required.map((kc: KnowledgeComponent) => renderKcRow(kc, kc.firstCourseId !== item.id))}</div></details>; })}</div> : <div className="course-progress-list atomic-progress-list">{Object.entries(KC_FAMILY_LABELS).map(([family, label]) => { const components = activeKcs.filter((kc) => kc.family === family); if (!components.length) return null; return <details key={family} open={components.some((kc) => kc.id === focusKc?.id)}><summary><span><small>{components.filter((kc) => kc.gating && introducedSet.has(kc.id)).length}/{components.filter((kc) => kc.gating).length}</small><b>{label}</b></span><span>{components.length} 项<i aria-hidden="true">⌄</i></span></summary><div className="skill-progress-list">{components.map((kc) => renderKcRow(kc))}</div></details>; })}</div>}
      </section></div>}
  </fieldset></main>;
}
