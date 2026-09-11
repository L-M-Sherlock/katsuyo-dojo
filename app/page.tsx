"use client";

import { FORM_LABELS } from "./lib/form-labels.mjs";

import { groupKnowledgeCoverage } from "./lib/knowledge-display.mjs";
import { eligibleVerbForm as eligibleFor } from "./lib/form-eligibility.mjs";

import { FormEvent, Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ADJECTIVES } from "./lib/adjective-catalog.mjs";
import { adjectiveTargetLabel, adjectiveClassLabel, conjugateAdjective, explainAdjectiveConjugation } from "./lib/adjective-conjugation.mjs";
import { buildAdjectiveKnowledgeModel } from "./lib/adjective-knowledge-model.mjs";
import { acceptedVariantKcIds, acceptedVariantNote } from "./lib/answer-variants.mjs";
import { advanceIntroductions, componentConfidence, emptySkillStats, isComponentMastered, selectFocus } from "./lib/adaptive.mjs";
import { exerciseKey, recordRecentWord, wordKey } from "./lib/exercise-selection.mjs";
import { classLabel, conjugate, explainConjugation } from "./lib/conjugation.mjs";
import { summarizeUnifiedCourse } from "./lib/unified-progress.mjs";
import { ADJECTIVE_COURSES as ADJECTIVE_CURRICULUM, CHINESE_YOKUBI_URL, COURSES as VERB_CURRICULUM } from "./lib/curriculum.mjs";
import { furiganaFor } from "./lib/furigana.mjs";
import { semanticsForForm } from "./lib/form-semantics.mjs";
import { buildKnowledgeModel, KC_FAMILY_LABELS } from "./lib/knowledge-model.mjs";
import { createAnswerAnalyzer } from "./lib/answer-analysis.mjs";
import { planDiagnosticTransition } from "./lib/diagnostic-session.mjs";
import { appendPracticeEvent, emptyPracticeLog, practiceEventId, PRACTICE_LOG_LIMIT } from "./lib/practice-log.mjs";
import type { PracticeLog, LogTarget } from "./lib/practice-log.mjs";
import { emptyAssessment, assessmentTarget, retestStatus } from "./lib/learning-assessment.mjs";
import type { LearningAssessment } from "./lib/learning-assessment.mjs";
import { assessmentCatalog, applyLearningObservation } from "./lib/learning-profile.mjs";
import { planRetestQuestion } from "./lib/retest-planning.mjs";
import { createPracticePlanner } from "./lib/practice-planning.mjs";
import { createProfileStore, readPreference, writePreference } from "./lib/profile-store.mjs";
import { canContinueRound, emptyHintState, planPractice, shouldReplan, toggleHint } from "./lib/practice-session.mjs";
import { createUnifiedExport as createProfileExport, parseUnifiedImport as parseProfileImport, UNIFIED_STORAGE_KEY, LEGACY_STORAGE_KEY, LEGACY_V5_STORAGE_KEY } from "./lib/unified-profile.mjs";
import { COURSE_STAGES, CURRICULUM_VERSION, UNIFIED_COURSES, sourceForForm } from "./lib/unified-curriculum.mjs";
import { buildUnifiedKnowledge, deriveUnified } from "./lib/unified-knowledge.mjs";

type VerbClass = "godan" | "ichidan" | "irregular";
type AdjectiveClass = "i" | "na";
type PracticeClass = VerbClass | AdjectiveClass;
type PracticeDomain = "verb" | "adjective";
type CompoundBase = "teageru" | "temorau" | "tekureru" | "teiru" | "tearu" | "teoru" | "tai" | "tehoshii" | "youtosuru" | "temiru" | "teshimau" | "teoku" | "teiku" | "tekuru" | "sugiru" | "tagaru";
type CompoundEnding = "Past" | "Negative" | "NegativePast";
type CompoundForm = `${CompoundBase}${CompoundEnding}`;
type Form = "negative" | "past" | "te" | "masu" | "passive" | "potential" | "imperative" | "volitional" | "ba" | "nasai" | "prohibitive" | "causative" | "causativePassive" | "causativePassiveContracted" | "nakute" | "naide" | "zu" | "zuni" | "teshimau" | "chau" | "teoku" | "toku" | "negativePast" | "masuPast" | "masuNegative" | "masuNegativePast" | "passivePast" | "passiveNegative" | "passiveNegativePast" | "potentialPast" | "potentialNegative" | "potentialNegativePast" | "causativePast" | "causativeNegative" | "causativeNegativePast" | "causativePassivePast" | "causativePassiveNegative" | "causativePassiveNegativePast" | "passiveDesireNegativePast" | "teageru" | "temorau" | "tekureru" | "tekudasai" | "naideKudasai" | "teiru" | "teru" | "tearu" | "teoru" | "toru" | "tai" | "tehoshii" | "tara" | "temo" | "nagara" | "tsutsu" | "nakerebaNaranai" | "nakutewaIkenai" | "naitoIkenai" | "tari" | "tewa" | "temoIi" | "nakutemoIi" | "masenka" | "youtosuru" | "temiru" | "teiku" | "teku" | "tekuru" | "tatte" | "sugiru" | "tagaru" | "temiruDesirePast" | "passiveProgressivePast" | "causativeReceivePast" | CompoundForm | "adjectiveNegative" | "adjectivePast" | "adjectiveNegativePast" | "adjectiveTe" | "adjectiveAttributive" | "adjectivePredicative" | "adjectiveNaNegative" | "adjectiveNaPast" | "adjectiveNaNegativePast" | "adjectiveNaTe" | "adjectiveBa" | "adjectiveAdverb";
type ModeId = "classify" | "negative" | "past" | "te" | "giving" | "request" | "imperative" | "masu" | "aspect" | "passive" | "potential" | "volitional" | "desire" | "ba" | "tara" | "nasai" | "prohibitive" | "temo" | "concurrent" | "obligation" | "listing" | "permission" | "youtosuru" | "temiru" | "causative" | "causativePassive" | "nakuteNaide" | "zuZuni" | "teshimauChau" | "teokuToku" | "direction" | "tatte" | "sugiru" | "tagaru" | "multiStepCompound" | "basicCompound" | "voiceCompound" | "adjectiveClassify" | "adjectiveIBase" | "adjectiveITe" | "adjectiveNaBase" | "adjectiveConditional" | "adjectiveAdverb";
type PracticeMode = "adaptive" | ModeId;
type Result = "correct" | "incorrect" | "revealed" | null;
type Verb = { domain: "verb"; surface: string; reading: string; meaning: string; class: VerbClass; lexicalSurface?: string };
type Adjective = { domain: "adjective"; surface: string; reading: string; meaning: string; class: AdjectiveClass; iiFamily: boolean };
type PracticeItem = Verb | Adjective;
type Course = { id: ModeId; domain: PracticeDomain; title: string; description?: string; lesson: string; url: string; forms: readonly Form[]; stage?: number; stageId?: string; stageLabel?: string; stageObjective?: string; review?: boolean; order?: number };
type KnowledgeComponent = { id: string; order: number; label: string; family: keyof typeof KC_FAMILY_LABELS; gating: boolean; firstCourseId: ModeId; firstCourseIndex: number; firstLesson: string; prerequisites: string[]; coverageKcIds: string[]; coverageOnly?: boolean; unlockByPrerequisites?: boolean; masteryPrerequisites?: KnowledgeComponent[] };
type Exercise = { id: string; courseId: ModeId; courseIndex: number; form: Form | null; item: PracticeItem; kcIds: string[]; sourceUrl?: string; prerequisites?: string[] };
type SkillStats = ReturnType<typeof emptySkillStats>;
type AssessmentState = LearningAssessment & { migration?: { at: string; changes: { kcId: string; before: SkillStats | null; after: SkillStats | null }[]; unverifiedKcIds: string[]; baselineByKc: Record<string, SkillStats> } };
type Profile = { practiceGoalCourseId?: ModeId; version: 7; curriculumVersion: number; date: string; attempted: number; correct: number; streak: number; introducedKcIds: string[]; rotation: number; byKc: Record<string, SkillStats>; assessment: AssessmentState; accessibleCourseIds: string[]; coursePractice: Record<string, string[]>; recentWordKeys: string[]; practiceLog: PracticeLog; legacy: object | null; migration: { message?: string; preserved?: number; archived?: number } | null };
type VerbForm = Parameters<typeof conjugate>[2];
type AnswerVariant = { surface: string; reading: string; note: string };
type FormSemantics = { concise: string; coreMeaning: string; register?: string; usageNote?: string; contrast?: string };

function FuriganaText({ surface, reading }: { surface: string; reading: string }) {
  const furigana = furiganaFor(surface, reading);
  return furigana ? <ruby>{surface}<rt>{furigana}</rt></ruby> : <>{surface}</>;
}

type DiagnosticStep = { surface: string; reading: string; form: Form; answers: string[]; readings: string[]; kcIds: string[]; focusId: string | null; continuation: boolean; targetLabel?: string; note?: string; kind?: "stem" | "attachment" | "classification" | "conjugation" | "atomic"; nodeId?: string; diagnosticOnly?: boolean; expectedClass?: VerbClass; providedClass?: VerbClass; classChoices?: { value: VerbClass; label: string }[]; classificationExplanation?: string; analysisItem?: PracticeItem };
type DiagnosticStepResult = { correct: boolean; updatedKcIds: string[]; practicedKcIds: string[] };
type DiagnosticAttempt = { answer: string; outcome: string; message: string; resolution: string; index: number; total: number; nextTotal: number };

function DiagnosticPractice({ item, steps, onEvidence, onDone }: {
  item: PracticeItem; steps: DiagnosticStep[];
  onEvidence: (step: DiagnosticStep, correct: boolean, failedKcId: string | null, confirmed: string[], totalChange: number, attempt: DiagnosticAttempt) => Promise<boolean>;
  onDone: (outcome: "completed" | "skipped", answered: number, total: number) => Promise<boolean>;
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
    pending.current = true;
    setBusy(true);
    try {
      const attempt = { answer: value, outcome: analysis.kind, message: analysis.feedback?.message ?? diagnosis?.message ?? "", resolution: analysis.feedback?.resolution ?? analysis.kind, index: index + 1, total: practiceSteps.length, nextTotal: practiceSteps.length };
      if (analysis.kind === "typo" || analysis.kind === "invalid") {
        attempt.message = analysis.kind === "invalid" ? analysis.feedback?.message ?? "请检查输入。" : "原词可能有输入笔误，请对照原词修改后重交；本步尚未计分。";
        if (!await onEvidence(step, false, null, [], 0, attempt)) return;
        setNotice(attempt.message);
        requestAnimationFrame(() => input.current?.focus());
        return;
      }
      const transition = planDiagnosticTransition(practiceSteps, index, analysis, [...evaluated.current], [...examinedNodes.current]);
      const { assessed, followups } = transition;
      if (!await onEvidence(assessed, correct, diagnosis?.kcId ?? null, diagnosis?.confirmedKcIds ?? [], transition.totalChange, { ...attempt, nextTotal: transition.nextSteps.length })) return;
      evaluated.current = new Set(transition.evaluated);
      examinedNodes.current = new Set(transition.examined);
      setAnswer(value);
      setHasFollowups(followups.length > 0);
      setPracticeSteps(transition.nextSteps);
      setNotice(null);
      setFeedback(step.kind === "classification"
        ? `${correct ? "词类判断正确。" : "词类判断有误。"}${step.classificationExplanation ?? ""}本步只确认词类，不更新知识点掌握度。`
        : correct ? "本步正确，已记录辅助练习。独立掌握度与待复测状态保持不变。" : `${analysis.feedback?.message ?? diagnosis?.message ?? "本步输入缺少足够的可辨认片段，请对照正确形式核对。"} 本步作为辅助练习记录，不改变独立掌握度。`);
    } finally { pending.current = false; setBusy(false); }
  }
  function next() {
    if (!feedback || pending.current) return;
    if (index === practiceSteps.length - 1) return finish("completed");
    setIndex(index + 1); setAnswer(""); setFeedback(null); setNotice(null); setHasFollowups(false);
    requestAnimationFrame(() => (firstChoice.current ?? input.current)?.focus());
  }
  async function finish(outcome: "completed" | "skipped") {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try { await onDone(outcome, index + (feedback ? 1 : 0), practiceSteps.length); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="diagnostic-practice" aria-label="拆步练习">
    <h3>拆步练习 · 第 {index + 1} / {practiceSteps.length} 步</h3>
    <p>拆步用于诊断和练习，结果单独记录。原题仍计为错误；独立掌握度和复测资格由后续无提示整题确认。</p>
    <p>{step.kind === "classification" ? "请选择这个中间形式继续活用时所属的" : step.continuation ? "已提供正确的中间形式，请继续变为" : "请先变为"}<strong>{step.kind === "classification" ? "动词类别" : step.targetLabel ?? FORM_LABELS[step.form]}</strong></p>
    <p className="diagnostic-word"><FuriganaText surface={step.surface} reading={step.reading} /></p>
    {step.providedClass && <p>已提供词类：<strong>{classLabelFor(step.providedClass)}</strong>。</p>}
    {step.note && <p>{step.note}</p>}
    {step.kind === "classification" ? <div className="class-options two-options">{step.classChoices?.map((choice, choiceIndex) => <button ref={choiceIndex === 0 ? firstChoice : undefined} type="button" key={choice.value} disabled={Boolean(feedback) || busy} className={`${answer === choice.value ? "selected" : ""} ${feedback && choice.value === step.expectedClass ? "choice-correct" : ""} ${feedback && answer === choice.value && choice.value !== step.expectedClass ? "choice-wrong" : ""}`} onClick={() => checkAnswer(choice.value)}>{choice.label}</button>)}</div>
      : <form onSubmit={submit}><label htmlFor="diagnostic-answer">本步答案</label><div className="answer-row"><input ref={input} id="diagnostic-answer" lang="ja" autoComplete="off" value={answer} disabled={Boolean(feedback) || busy} onChange={(event) => { setAnswer(event.target.value); setNotice(null); }} onKeyDown={(event) => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault(); }} /><button type="submit" disabled={!answer.trim() || Boolean(feedback) || busy}>检查本步</button></div></form>}
    {notice && <p role="status">{notice}</p>}
    {feedback && <div role="status"><p>{feedback}</p>{!hasFollowups && step.kind !== "classification" && <p>本步正确形式：<FuriganaText surface={step.answers[0]} reading={step.readings[0]} /></p>}<button ref={nextButton} type="button" className="text-button" data-diagnostic-next aria-keyshortcuts="Enter" onClick={next}>{index === practiceSteps.length - 1 ? "完成拆步" : "练习下一步"} <kbd aria-hidden="true">Enter</kbd></button></div>}
    <button type="button" className="text-button" disabled={busy} onClick={() => finish("skipped")}>跳过剩余拆步，查看解析</button>
  </section>;
}

function PracticeLogView({ log }: { log: PracticeLog }) {
  const [visible, setVisible] = useState(30);
  const outcomes: Record<string, string> = { correct: "答对", incorrect: "答错", revealed: "查看答案", typo: "笔误重试", invalid: "输入无效", completed: "已完成拆步", skipped: "已跳过剩余拆步", migrated: "已迁移评估记录", shown: "已查看提示" };
  const sources: Record<string, string> = { independent: "独立作答", guided: "辅助作答", diagnostic: "诊断检查", hinted: "使用提示", "feedback-retry": "反馈后重试", rehearsal: "未满足复测条件的练习", revealed: "已查看答案", migration: "历史记录迁移" };
  const provided: Record<string, string> = { subgoal: "已给出子目标", intermediate: "已给出中间形式", "word-class": "已给出词类", "target-rule": "已给出变化规则", hint: "已查看提示", answer: "已查看答案", "lexical-retry": "仅提示核对原词笔误" };
  const percent = (stats: SkillStats | null) => `${Math.round((stats?.confidence ?? 0) * 100)}%`;
  return <section className="practice-log" aria-label="作答日志">
    <p className="practice-log-note">当前保留 {log.events.length} 条记录，最多 {PRACTICE_LOG_LIMIT} 条，并按容量裁剪较早记录。日志随练习数据一起导出。{log.droppedEntries > 0 && ` 已裁剪 ${log.droppedEntries} 条较早记录。`}</p>
    {!log.events.length && <p>暂无作答日志。从下一次作答开始记录，旧的作答过程无法还原。</p>}
    {[...log.events].reverse().slice(0, visible).map(event => <details key={event.id}>
      <summary><span><strong>{event.exercise.surface}{event.type !== "migration" && ` · ${event.exercise.form ? FORM_LABELS[event.exercise.form as Form] ?? event.exercise.form : "词类判断"}`}</strong><small>#{event.sequence} · {event.type === "question" ? "原题" : event.type === "step" ? `拆步 ${event.target.stepIndex} / ${event.target.totalSteps}` : event.type === "migration" ? "记录迁移" : event.type === "hint" ? "提示" : "拆步结束"} · {outcomes[event.outcome]}</small></span><time dateTime={event.at}>{new Date(event.at).toLocaleString("zh-CN", { hour12: false })}</time></summary>
      <div className="practice-log-detail">
        {!["diagnostic-end", "migration", "hint"].includes(event.type) && <><p>给定形式：<FuriganaText surface={event.target.surface} reading={event.target.reading} /> · 目标：{event.target.label}</p><p>提交答案：<span lang="ja">{(event.target.kind === "classification" || event.target.form === null) && ["godan", "ichidan", "irregular", "i", "na"].includes(event.answer) ? classLabelFor(event.answer as PracticeClass) : event.answer || "（未填写）"}</span>{event.answerTruncated && `（原输入 ${event.answerLength} 字符，日志仅保留前 256 字符）`}</p></>}
        {event.diagnosis.message && <p>{event.diagnosis.message}</p>}
        {event.hintUsed && <p>本题使用过提示。</p>}
        {event.support ? <p>评估条件：{sources[event.support.source] ?? (event.support.independent ? "独立作答" : "辅助作答")}{event.support.provided.length > 0 && `；${event.support.provided.map(value => provided[value] ?? value).join("，")}`}。</p> : <p>这是旧版日志，以下保留当时的统计变化；可核验的修正另记在迁移记录中。</p>}
        {event.changes.length ? <><strong>{event.type === "migration" ? "历史掌握记录修正" : event.support ? "独立掌握记录" : "旧版掌握记录"} · {event.changes.length} 个知识点</strong><dl>{event.changes.map(change => <div key={change.kcId}><dt>{change.label}</dt><dd>作答 {change.before?.attempts ?? 0} → {change.after?.attempts ?? 0} 次；答对 {change.before?.correct ?? 0} → {change.after?.correct ?? 0} 次；置信度 {percent(change.before)} → {percent(change.after)}</dd></div>)}</dl></> : <p>本次未更新独立掌握度。</p>}
        {Boolean(event.assistedChanges?.length) && <><strong>辅助练习 · 不改变独立掌握度</strong><dl>{event.assistedChanges?.map(change => <div key={change.kcId}><dt>{change.label}</dt><dd>练习 {change.before?.attempts ?? 0} → {change.after?.attempts ?? 0} 次；答对 {change.before?.correct ?? 0} → {change.after?.correct ?? 0} 次</dd></div>)}</dl></>}
        {event.assessment && <div className="assessment-log"><p>待复测：{event.assessment.before.pending ? "是" : "否"} → {event.assessment.after.pending ? "是" : "否"}；独立整题答对：{event.assessment.before.independentCorrect} → {event.assessment.after.independentCorrect} 次。</p>{event.assessment.eligibility && <p>{event.assessment.eligibility.eligible ? "本题满足独立复测条件。" : "本题尚未满足独立复测条件。"}{event.assessment.eligibility.remainingQuestions > 0 && ` 还需间隔 ${event.assessment.eligibility.remainingQuestions} 道其他整题。`}{event.assessment.eligibility.policy === "single-word-delayed" && " 历史记录采用同词延时政策；当前已取消时间限制。"}</p>}</div>}
      </div>
    </details>)}
    {visible < log.events.length && <button type="button" className="text-button" onClick={() => setVisible(value => value + 30)}>显示更早记录</button>}
  </section>;
}

function PendingRetests({ assessment }: { assessment: AssessmentState }) {
  const pending = Object.values(assessment.pending).sort((a, b) => a.createdOrdinal - b.createdOrdinal);
  return <section className="pending-retests" aria-label="待独立复测">
    <p>拆步、提示和答案讲解单独记录为辅助练习。需要换一个词，完成相同目标和变化规则的无提示整题，才能解除待复测；中间至少间隔两道其他整题。</p>
    {!pending.length && <p>当前没有待复测任务。</p>}
    {pending.map(entry => {
      const group = ASSESSMENT_CATALOG.get(entry.key);
      const candidate = group?.exercises.find((value: Exercise) => ![entry.lastWordKey, entry.lastPresentedWordKey].includes(assessmentTarget(value).wordKey)) ?? group?.exercises[0];
      const singleWord = group?.words.size === 1;
      const status = candidate ? retestStatus(entry, candidate, { originalCount: assessment.originalCount, singleWord }) : null;
      return <article key={entry.key}><h3>{entry.target.form ? FORM_LABELS[entry.target.form as Form] : `${classLabelFor(candidate?.item.class as PracticeClass)}分类`} · {COURSES.find(value => value.id === entry.courseId)?.title}</h3><p>待复测来源：<FuriganaText surface={entry.target.surface} reading={entry.target.reading} /></p><p>{status?.eligible ? "已满足间隔条件，可安排独立复测。" : status?.remainingQuestions ? `先完成 ${status.remainingQuestions} 道其他整题，再安排复测。` : "复测等待中，可继续学习其他内容。"}</p>{singleWord && <p>当前词库只有一个同规则词：完成两道其他整题后即可使用同词复测，无需等待。</p>}</article>;
    })}
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


const SESSION_LENGTH = 12;
const STORAGE_KEY = UNIFIED_STORAGE_KEY;
const PRACTICE_DOMAIN_KEY = "katsuyo-practice-domain-v1";
const LEGACY_PROFILE_KEY_V4 = "katsuyo-practice-profile-v4";
const LEGACY_PROFILE_KEY_V3 = "katsuyo-practice-profile-v3";
const LEGACY_PROFILE_KEY_V2 = "katsuyo-practice-profile-v2";


function clockNow() { return Date.now(); }
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }



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
const ASSESSMENT_CATALOG = assessmentCatalog(KNOWLEDGE.exercises);
const importOptions = () => ({ today: todayKey(), components: ALL_KCS, legacyComponents: [...VERB_KNOWLEDGE.components, ...ADJECTIVE_KNOWLEDGE.components], exercises: KNOWLEDGE.exercises });
const kcsOf = (courseId: ModeId) => (KNOWLEDGE.courseKcIds[courseId] ?? []).map(id => KC_BY_ID.get(id)).filter((kc): kc is KnowledgeComponent => Boolean(kc));
const PRACTICE_PLANNER = createPracticePlanner(KNOWLEDGE);
function emptyProfile(): Profile { return { version: 7, curriculumVersion: CURRICULUM_VERSION, date: todayKey(), attempted: 0, correct: 0, streak: 0, introducedKcIds: [...INITIAL_KC_IDS], rotation: 0, byKc: {}, assessment: emptyAssessment(), accessibleCourseIds: [], coursePractice: {}, recentWordKeys: [], practiceLog: emptyPracticeLog(), legacy: null, migration: null }; }
function activateReadyKcs(profile: Profile) {
  const advanced = advanceIntroductions(ALL_KCS, profile.introducedKcIds, profile.byKc);
  return { ...profile, introducedKcIds: advanced.introducedKcIds };
}
function makePlan(mode: PracticeMode, profile: Profile, length = SESSION_LENGTH, goalCourseId: string | null = null) {
  const planned = PRACTICE_PLANNER.plan(mode, profile, length, goalCourseId);
  if (mode === "adaptive" && planned.review) {
    const reviewCourses = COURSES.map(course => ({ course,
      summary: summarizeUnifiedCourse(course, kcsOf(course.id), profile.introducedKcIds, profile),
      kcs: kcsOf(course.id).filter(kc => kc.gating && PRACTICE_PLANNER.candidatesFor(kc, profile, course.id).length),
    })).filter(entry => entry.summary.unlocked && entry.summary.mastered === entry.summary.total && entry.kcs.length > 0);
    const unfinished = reviewCourses.filter(entry => !entry.summary.complete);
    const selected = unfinished[0] ?? reviewCourses[profile.rotation % reviewCourses.length];
    if (selected) {
      const reviewKcs = selected.kcs.map(kc => ({ ...kc, firstCourseId: selected.course.id, firstCourseIndex: COURSES.indexOf(selected.course) }));
      return planPractice(reviewKcs, profile.byKc, KNOWLEDGE.courseKcIds, { adaptive: false, goalCourseId: selected.course.id,
        length, rotation: Math.floor(profile.rotation / Math.max(reviewCourses.length, 1)), components: ALL_KCS,
        candidatesFor: (kc, courseId) => PRACTICE_PLANNER.candidatesFor(kc, profile, courseId) });
    }
  }
  return planned;
}
function verificationFor(mode: PracticeMode, profile: Profile, seed = 0) {
  return planRetestQuestion(profile, mode, { exercises: KNOWLEDGE.exercises, components: ALL_KCS, courses: COURSES, courseKcIds: KNOWLEDGE.courseKcIds, seed });
}

const browserStorage = () => window.localStorage;
function loadProfile(raw: string | null): { profile: Profile; migrated: boolean; invalid: boolean; original?: string | null; correctionNotice?: string } {
  const fresh = activateReadyKcs(emptyProfile());
  let original = raw;
  try {
    const legacyV4 = raw ? null : readPreference(browserStorage, LEGACY_STORAGE_KEY) ?? readPreference(browserStorage, LEGACY_V5_STORAGE_KEY) ?? readPreference(browserStorage, LEGACY_PROFILE_KEY_V4);
    const saved = raw ?? legacyV4;
    original = saved;
    if (saved) {
      const originalValue = JSON.parse(saved);
      const restored = activateReadyKcs(parseProfileImport(originalValue, importOptions()) as Profile);
      const correction = restored.practiceLog.events.at(-1);
      const newCorrection = correction?.diagnosis.resolution === "score-correction" && restored.practiceLog.totalEvents > ((originalValue.profile ?? originalValue).practiceLog?.totalEvents ?? 0);
      return { profile: restored, migrated: Boolean(legacyV4), invalid: false, correctionNotice: newCorrection ? correction.diagnosis.message : undefined };
    }
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
  const [verification, setVerification] = useState<ReturnType<typeof verificationFor>>(null);
  const profileRef = useRef(profile);
  const [roundState, setRoundState] = useState(() => makePlan("adaptive", profile, SESSION_LENGTH));
  const { focus: focusKc, review: reviewRound, goalCourseId } = roundState;
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
  const [independentResult, setIndependentResult] = useState(true);
  const [migrationNotice, setMigrationNotice] = useState(false);
  const [correctionNotice, setCorrectionNotice] = useState<string | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressView, setProgressView] = useState<"course" | "atomic" | "pending" | "log">("course");
  const [transferNotice, setTransferNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const questionCardRef = useRef<HTMLElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const progressTriggerRef = useRef<HTMLButtonElement>(null);
  const progressCloseRef = useRef<HTMLButtonElement>(null);
  const startedAt = useRef(0);
  const loggedQuestionId = useRef<string | null>(null);
  const lexicalRetry = useRef(false);
  const keyboardHandler = useRef<((event: KeyboardEvent) => void) | null>(null);
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
    const assigned = PRACTICE_PLANNER.assign(roundState, planningProfile, { seed, usedKeys: usedQuestionKeys, usedWordKeys }) as { item: KnowledgeComponent; candidate: Exercise }[];
    if (verification?.exercise && assigned.length) {
      const candidate = verification.exercise as Exercise;
      const focusId = [...candidate.kcIds].reverse().find(id => KC_BY_ID.get(id)?.gating) ?? candidate.kcIds[0];
      assigned[0] = { item: KC_BY_ID.get(focusId) ?? assigned[0].item, candidate };
    }
    return assigned;
  }, [planningProfile, roundState, seed, usedQuestionKeys, usedWordKeys, verification]);
  const currentQuestion = roundQuestions[questionIndex];
  const targetKc = currentQuestion?.item ?? focusKc ?? ALL_KCS.find((kc) => kc.gating) ?? GATING_KCS[0];
  const exercise = currentQuestion?.candidate ?? PRACTICE_PLANNER.candidatesFor(targetKc, planningProfile, goalCourseId ?? targetKc.firstCourseId)[0] ?? KNOWLEDGE.exercises[0];
  const course = COURSES[exercise.courseIndex];
  const item = exercise.item;
  const activeVerification = verification?.exercise?.id === exercise.id ? verification : null;
  const practiceDomain = item.domain;
  const form = exercise.form;
  const targetLabel = form && item.domain === "adjective" ? adjectiveTargetLabel(item, form) : form ? FORM_LABELS[form] : course.title;
  const sourceCourse = sourceForForm(item.domain, form);
  const formSemantics = (form ? semanticsForForm(form) : null) as FormSemantics | null;
  const derivation = deriveFor(item, form);
  const unattributed = result === "incorrect" && diagnosticKcId === null && Boolean(form);
  const diagnosticAnalysis = useMemo(() => unattributed && form ? createAnswerAnalyzer(item, form)(answer) : null, [unattributed, item, form, answer]);
  const diagnosticSteps = (diagnosticAnalysis?.steps ?? []) as DiagnosticStep[];
  const recognizedFormLabels = diagnosticAnalysis && 'recognizedForms' in diagnosticAnalysis
    ? [...new Set((diagnosticAnalysis.recognizedForms ?? []).map((match: {label: string}) => match.label))] : [];
  const originalFormIdentification = recognizedFormLabels.length
    ? `你的答案与${recognizedFormLabels.join('／')}一致，本题要求${targetLabel}。` : null;
  const probing = diagnosticSteps.length > 0 && !probesDone;
  useEffect(() => {
    if (!result || finished || progressOpen) return;
    const frame = requestAnimationFrame(() => {
      const target = probing ? feedbackRef.current?.querySelector<HTMLElement>('.diagnostic-practice') : feedbackRef.current;
      if (!target) return;
      const bounds = target.getBoundingClientRect();
      const height = window.visualViewport?.height ?? window.innerHeight;
      if (bounds.top < 12 || bounds.bottom > height - 16) {
        target.scrollIntoView?.({ block: bounds.height > height - 32 ? 'start' : 'nearest', behavior: 'auto' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [result, probing, finished, progressOpen]);

  useEffect(() => {
    if (loading) return;
    const frame = requestAnimationFrame(() => {
      const card = questionCardRef.current;
      if (card && card.getBoundingClientRect().top < 12) card.scrollIntoView?.({block:'start',behavior:'auto'});
      inputRef.current?.focus({preventScroll:true});
    });
    return () => cancelAnimationFrame(frame);
  }, [exercise.id, questionIndex, seed, loading]);

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
      setProfile(loaded.profile); setPlanningProfile(loaded.profile); setVerification(verificationFor("adaptive", loaded.profile));
      setRoundState(next); setMigrationNotice(loaded.migrated); setCorrectionNotice(loaded.correctionNotice ?? null); setLoading(false);
      if (snapshot.error) setStorageNotice("无法读取浏览器存储。练习记录将暂存在本页，请在关闭前导出备份。");
      if (loaded.invalid) {
        blockedRef.current = true; setBlocked(true); setInvalidRaw(loaded.original ?? null);
        setStorageNotice("本地进度无法解析，已暂停练习并保留原记录。可导出原始记录，或清除损坏记录重新开始。");
      }
    });
    const externalChange = (event: StorageEvent) => {
      if (event.key === LEGACY_STORAGE_KEY || event.key === LEGACY_V5_STORAGE_KEY) { setStorageNotice("旧版标签页仍在更新旧进度。新版独立评估记录未被覆盖，请先在旧页面导出备份再关闭旧页面。"); }
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
  const resetQuestion = useCallback(() => { gradedRef.current = false; loggedQuestionId.current = null; lexicalRetry.current = false; setIndependentResult(true); setAnswer(""); setProbesDone(false); setProbeResults([]); setProbeExtraCount(0); setTypoNotice(false); setInputNotice(null); setSelectedClass(null); setResult(null); setHint(emptyHintState()); setDiagnosticMessage(null); setDiagnosticKcId(null); setConfirmedKcIds([]); setAcceptedVariant(null); startedAt.current = clockNow(); }, [setAnswer, setAcceptedVariant, setDiagnosticKcId, setDiagnosticMessage, setHint, setResult, setSelectedClass]);

  function logTarget(step?: DiagnosticStep, attempt?: DiagnosticAttempt): LogTarget {
    return { surface: step?.surface ?? item.surface, reading: step?.reading ?? item.reading, form: step?.form ?? form,
      label: step?.kind === "classification" ? "动词类别" : step?.targetLabel ?? (step ? FORM_LABELS[step.form] : form ? targetLabel : "词类判断"),
      kind: step?.kind ?? (step ? "conjugation" : "question"), kcIds: step?.kcIds ?? derivation.requiredKcIds,
      answers: step?.answers ?? derivation.acceptedVariants, readings: step?.readings ?? deriveFor(readingItem, form).acceptedVariants,
      stepIndex: attempt?.index ?? null, totalSteps: attempt?.total ?? 0, nextTotalSteps: attempt?.nextTotal ?? 0 };
  }
  function withPracticeEvent(before: Profile, after: Profile, event: Omit<Parameters<typeof appendPracticeEvent>[2], "questionId" | "exercise" | "hintUsed">): Profile {
    loggedQuestionId.current ??= practiceEventId();
    const progress = ["typo", "invalid"].includes(event.outcome) ? after : { ...after, practiceGoalCourseId: goalCourseId ?? course.id };
    return appendPracticeEvent(before, progress, { ...event, questionId: loggedQuestionId.current, hintUsed: event.type === "hint" || hint.used,
      exercise: { id: exercise.id, courseId: course.id, form, surface: item.surface, reading: item.reading, wordClass: item.class, domain: item.domain } },
    id => KC_BY_ID.get(id)?.label ?? id) as Profile;
  }
  async function recordQuestionRetry(outcome: string, message: string) {
    const current = profileRef.current;
    if (outcome === "typo") lexicalRetry.current = true;
    return save(withPracticeEvent(current, current, { type: "question", outcome, answer, target: logTarget(),
      support: { independent: false, source: outcome, provided: outcome === "typo" ? ["lexical-retry"] : [] }, diagnosis: { resolution: outcome, message } }));
  }

  async function showHint() {
    if (hint.shown) { setHint(toggleHint); return; }
    if (result || gradedRef.current || blockedRef.current || savingRef.current) return;
    const current = profileRef.current, id = practiceEventId(), at = new Date().toISOString();
    loggedQuestionId.current ??= practiceEventId();
    const observation = applyLearningObservation(current, exercise, { type: "hint", outcome: "shown", questionId: loggedQuestionId.current, eventId: id, at }, ASSESSMENT_CATALOG);
    if (observation.duplicate) return;
    const logged = withPracticeEvent(current, observation.profile as Profile, { id, at, type: "hint", outcome: "shown", answer: "", target: logTarget(),
      support: observation.support, assessmentKey: assessmentTarget(exercise).key, eligibility: observation.retest,
      diagnosis: { resolution: "hinted", message: "已查看提示，后续作答作为辅助练习；保留待独立复测，不增加题数或知识点成绩。" } });
    if (await save(logged)) setHint({ shown: true, used: true });
  }

  async function grade(correct: boolean, revealed = false, failedKcId: string | null = null, message: string | null = null, extraKcIds: string[] = [], confirmed: string[] = [], attempt: { answer?: string; resolution?: string; nextTotal?: number } = {}) {
    if (result || gradedRef.current || blockedRef.current || savingRef.current) return;
    gradedRef.current = true;
    setTypoNotice(false);
    if (!correct && !revealed && !form) failedKcId ??= targetKc.id;
    if (revealed) { failedKcId = null; confirmed = []; }
    const old = profileRef.current.date === todayKey() ? profileRef.current : { ...profileRef.current, date: todayKey(), attempted: 0, correct: 0, streak: 0 };
    const outcome = revealed ? "revealed" : correct ? "correct" : "incorrect";
    const id = practiceEventId(), at = new Date().toISOString();
    loggedQuestionId.current ??= practiceEventId();
    const observation = applyLearningObservation(old, exercise, { type: "question", outcome, questionId: loggedQuestionId.current, eventId: id, at,
      kcIds: [...new Set([...derivation.requiredKcIds, ...extraKcIds])], focusId: targetKc.id, failedKcId, confirmedKcIds: confirmed, hintUsed: hint.used,
      lexicalRetry: lexicalRetry.current, responseMs: clockNow() - startedAt.current, answerLength: form ? conjugateFor(readingItem, form).length : item.reading.length }, ASSESSMENT_CATALOG);
    if (observation.duplicate) return;
    const nextProfile = { ...observation.profile, attempted: old.attempted + 1, correct: old.correct + (correct ? 1 : 0), streak: correct ? old.streak + 1 : 0,
      recentWordKeys: recordRecentWord(old.recentWordKeys, exercise), coursePractice: correct && observation.support.independent
        ? { ...old.coursePractice, [course.id]: [...new Set([...(old.coursePractice[course.id] ?? []), exerciseKey(exercise)])].slice(-12) } : old.coursePractice } as Profile;
    const logged = withPracticeEvent(profileRef.current, nextProfile, { id, at, type: "question", outcome, answer: attempt.answer ?? answer,
      support: observation.support, assessmentKey: assessmentTarget(exercise).key, eligibility: observation.retest,
      target: { ...logTarget(), kcIds: [...new Set([...derivation.requiredKcIds, ...extraKcIds])], nextTotalSteps: attempt.nextTotal ?? 0 },
      diagnosis: { kcId: failedKcId, confirmedKcIds: confirmed, resolution: attempt.resolution ?? (failedKcId ? "rule" : outcome),
        message: message ?? (revealed ? "查看答案，本题按未答对记录。" : correct ? "答案正确。" : failedKcId ? "已记录能确定的知识点错误。" : "本题记错，尚未确定具体知识点。") } });
    if (!await save(logged)) { gradedRef.current = false; return; }
    setIndependentResult(observation.support.independent);
    setDiagnosticMessage(message);
    setDiagnosticKcId(failedKcId);
    setConfirmedKcIds(confirmed);
    setResult(revealed ? "revealed" : correct ? "correct" : "incorrect");
    if (correct) setSessionCorrect((value) => value + 1);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim() || !form || result || gradedRef.current || blockedRef.current || savingRef.current) return;
    const analysis = createAnswerAnalyzer(item, form)(answer);
    if (analysis.kind === "invalid") {
      const message = analysis.feedback?.message ?? "请检查输入。";
      if (await recordQuestionRetry("invalid", message)) { setInputNotice(message); requestAnimationFrame(() => inputRef.current?.focus()); }
      return;
    }
    setInputNotice(null);
    const match = analysis.match as { correct: boolean; variant: { surface: string; reading: string } | null };
    if (match.correct) {
      if (match.variant) setAcceptedVariant({ ...match.variant, note: acceptedVariantNote(item, form, match.variant) });
      return grade(true, false, null, null, match.variant ? acceptedVariantKcIds(item, form, match.variant) : []);
    }
    const diagnosed = analysis.diagnosis;
    if (analysis.kind === "typo") {
      if (!await recordQuestionRetry("typo", "原词可能有输入笔误，请修改后重交；本题尚未计分。")) return;
      setTypoNotice(true);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    return grade(false, false, diagnosed?.kcId ?? null, analysis.feedback?.message ?? diagnosed?.message?.replace(item.reading, item.surface) ?? null, [], diagnosed?.confirmedKcIds ?? [], { resolution: analysis.feedback?.resolution, nextTotal: analysis.steps.length });
  }
  async function saveStepEvidence(step: DiagnosticStep, correct: boolean, failedKcId: string | null, confirmed: string[], totalChange: number, attempt: DiagnosticAttempt) {
    const current = profileRef.current;
    const retry = attempt.outcome === "typo" || attempt.outcome === "invalid";
    const id = practiceEventId(), at = new Date().toISOString();
    loggedQuestionId.current ??= practiceEventId();
    const observation = applyLearningObservation(current, exercise, { type: "step", outcome: attempt.outcome, questionId: loggedQuestionId.current, eventId: id, at,
      step, failedKcId, confirmedKcIds: confirmed, hintUsed: hint.used }, ASSESSMENT_CATALOG);
    if (observation.duplicate) return false;
    const nextProfile = observation.profile as Profile;
    const logged = withPracticeEvent(current, nextProfile, { id, at, type: "step", outcome: attempt.outcome, answer: attempt.answer, target: logTarget(step, attempt),
      support: observation.support, assessmentKey: assessmentTarget(exercise).key, eligibility: observation.retest,
      diagnosis: { kcId: failedKcId, confirmedKcIds: confirmed, resolution: attempt.resolution,
        message: step.diagnosticOnly ? "本步只确认词类，不更新知识点掌握度。" : attempt.message || (correct ? "本步正确。" : "本步未确定具体错因。") } });
    if (!await save(logged)) return false;
    if (retry) return true;
    // Summarize evidence actually accepted by the scorer and save operation.
    // These results belong to the probes, not the original answer's diagnosis.
    const updatedKcIds = Object.keys(nextProfile.byKc).filter((id) => nextProfile.byKc[id] !== current.byKc[id]);
    const practicedKcIds = Object.keys(nextProfile.assessment.assistedByKc).filter(id => nextProfile.assessment.assistedByKc[id] !== current.assessment.assistedByKc[id]);
    setProbeResults((previous) => [...previous, { correct, updatedKcIds, practicedKcIds }]);
    if (totalChange) setProbeExtraCount((previous) => previous + totalChange);
    return true;
  }
  function chooseClass(choice: PracticeClass) { if (!result) { setSelectedClass(choice); grade(choice === item.class, false, null, null, [], [], { answer: choice }); } }

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
    const pendingHere = Object.values(current.assessment.pending).some(pending => mode === "adaptive" || pending.courseId === mode);
    if (pendingHere || verification?.exercise) {
      const next = makePlan(mode, current, SESSION_LENGTH - answeredCount, goalCourseId);
      const consumed = [...new Set([...usedQuestionKeys, ...roundQuestions.slice(0, questionIndex + 1).map(({ candidate }) => exerciseKey(candidate))])];
      setUsedWordKeys([...usedWordKeys, ...roundQuestions.slice(0, questionIndex + 1).map(({ candidate }) => wordKey(candidate))]);
      setPlanningProfile(current); setRoundState(next);
      setRoundOffset(answeredCount); setUsedQuestionKeys(consumed); setQuestionIndex(0);
      setVerification(verificationFor(mode, current, seed + 1)); setSeed(value => value + 1); resetQuestion();
      return;
    }
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
      const next = makePlan(mode, nextProfile, remaining, goalCourseId);
      if ((mode !== "adaptive" || next.goalCourseId === goalCourseId) && canContinueRound(focusKc, next, nextProfile.byKc, false)) {
        const consumed = [...new Set([...usedQuestionKeys, ...roundQuestions.slice(0, questionIndex + 1).map(({ candidate }) => exerciseKey(candidate))])];
        setUsedWordKeys([...usedWordKeys, ...roundQuestions.slice(0, questionIndex + 1).map(({ candidate }) => wordKey(candidate))]);
        setPlanningProfile(nextProfile); setRoundState(next); setRoundOffset(answeredCount); setUsedQuestionKeys(consumed); setQuestionIndex(0); setVerification(verificationFor(mode, nextProfile, seed + 1)); setSeed((value) => value + 1); resetQuestion();
        return;
      }
      finishRound();
      return;
    }
    setQuestionIndex((value) => value + 1);
    setVerification(null);
    resetQuestion();
  }, [finishRound, focusKc, goalCourseId, mode, probing, questionIndex, reviewRound, resetQuestion, roundOffset, roundQuestions, save, usedQuestionKeys, usedWordKeys, verification, seed]);
  const classChoices = useMemo(() => practiceDomain === "verb" ? ["ichidan", "godan", "irregular"] as PracticeClass[] : ["i", "na"] as PracticeClass[], [practiceDomain]);
  useLayoutEffect(() => {
    // Commit the new question/feedback state before it can receive input. The
    // native listener stays mounted instead of briefly retaining an old result
    // while passive effects catch up with a freshly rendered next button.
    keyboardHandler.current = (event: KeyboardEvent) => {
      if (progressOpen || blocked || loading) return;
      const target = event.target as HTMLElement | null;
      const advanceButton = target?.closest("[data-diagnostic-next],.next-button");
      // Keep the listener installed across async saves. Reinstalling it after
      // feedback renders can otherwise lose the first Enter on the next button.
      if (savingRef.current) {
        if (advanceButton && event.key === "Enter") event.preventDefault();
        return;
      }
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
  }, [blocked, classChoices, finished, form, loading, nextQuestion, probing, progressOpen, result]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => keyboardHandler.current?.(event);
    addEventListener("keydown", handler);
    return () => removeEventListener("keydown", handler);
  }, []);
  async function finishDiagnosticPractice(outcome: "completed" | "skipped", answered: number, total: number) {
    const current = profileRef.current;
    const id = practiceEventId(), at = new Date().toISOString();
    loggedQuestionId.current ??= practiceEventId();
    const observation = applyLearningObservation(current, exercise, { type: "diagnostic-end", outcome, questionId: loggedQuestionId.current, eventId: id, at }, ASSESSMENT_CATALOG);
    if (observation.duplicate) return false;
    if (!await save(withPracticeEvent(current, observation.profile as Profile, { id, at, type: "diagnostic-end", outcome,
      support: observation.support, assessmentKey: assessmentTarget(exercise).key, eligibility: observation.retest,
      target: { ...logTarget(), kind: "summary", label: "拆步练习", totalSteps: total, nextTotalSteps: total },
      diagnosis: { message: `${outcome === "completed" ? "完成拆步" : "跳过剩余拆步"}，已作答 ${answered} / ${total} 步；原题结果保持不变。` } }))) return false;
    setProbesDone(true);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".next-button")?.focus());
    return true;
  }

  function applyRound(nextMode: PracticeMode, current: Profile, preferredCourseId: string | null = null) {
    const next = makePlan(nextMode, current, SESSION_LENGTH, preferredCourseId);
    setPlanningProfile(current); setMode(nextMode); setRoundState(next);
    setVerification(verificationFor(nextMode, current, seed + 1));
    setQuestionIndex(0); setRoundOffset(0); setUsedQuestionKeys([]); setUsedWordKeys([]); setSessionCorrect(0); setFinished(false); setUnlocked(null);
    setSeed((value) => value + 1); resetQuestion();
  }
  async function start(nextMode: PracticeMode) {
    if (nextMode !== "adaptive" && !summarizeUnifiedCourse(COURSES.find(c => c.id === nextMode)!, kcsOf(nextMode), profileRef.current.introducedKcIds, profileRef.current).unlocked) return;
    const current = activateReadyKcs({ ...profileRef.current, rotation: profileRef.current.rotation + 1 });
    if (await save(current)) applyRound(nextMode, current, nextMode === mode ? goalCourseId : null);
  }
  function changeCourseFilter(value: "all" | PracticeDomain) {
    setCourseFilter(value); writePreference(browserStorage, PRACTICE_DOMAIN_KEY, value);
  }
  async function resetProgress() {
    if (!window.confirm("确定清除这台设备上的全部练习进度和作答日志吗？")) return;
    const fresh = activateReadyKcs(emptyProfile());
    if (!await save(fresh)) return;
    for (const key of [LEGACY_STORAGE_KEY, LEGACY_V5_STORAGE_KEY, LEGACY_PROFILE_KEY_V4, LEGACY_PROFILE_KEY_V3, LEGACY_PROFILE_KEY_V2, "katsuyo-practice-stats-v1"]) writePreference(browserStorage, key, null);
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
    setTransferNotice({ kind: "success", text: "练习进度和作答日志已导出，可以在另一台设备上导入。" });
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

  const pendingRetests = Object.values(profile.assessment.pending);
  const pendingInMode = pendingRetests.filter(entry => mode === "adaptive" || entry.courseId === mode);
  const currentPending = profile.assessment.pending[assessmentTarget(exercise).key];
  const shownFocusKc = activeVerification ? targetKc : focusKc;
  const focusPercent = Math.round((shownFocusKc ? componentConfidence(shownFocusKc, profile.byKc) : focusStats.confidence) * 100);
  const evidenceKcId = unattributed ? "" : diagnosticKcId ?? targetKc.id;
  const evidenceKc = KC_BY_ID.get(evidenceKcId);
  const currentPercent = Math.round((evidenceKc ? componentConfidence(evidenceKc, profile.byKc) : profile.byKc[evidenceKcId]?.confidence ?? 0) * 100);
  const introducedSet = new Set(profile.introducedKcIds);
  const activeKcs = ALL_KCS;
  const activeKcIdSet = new Set(activeKcs.map((kc) => kc.id));
  const introducedKcs = profile.introducedKcIds.map((id) => KC_BY_ID.get(id)).filter((kc): kc is KnowledgeComponent => Boolean(kc && activeKcIdSet.has(kc.id)));
  const masteredKcCount = introducedKcs.filter((item) => isComponentMastered(item, profile.byKc)).length;
  const activeRouteComplete = pendingRetests.length === 0 && activeKcs.filter((kc) => kc.gating).every((kc) => isComponentMastered(kc, profile.byKc));
  const unfinishedReview = COURSES.find(value => {
    const summary = summarizeUnifiedCourse(value, kcsOf(value.id), profile.introducedKcIds, profile);
    return summary.unlocked && summary.mastered === summary.total && !summary.complete && summary.pendingCount === 0;
  });
  const visibleCourses = COURSES.filter(c => courseFilter === "all" || c.domain === courseFilter);
  const goalCourse = COURSES.find(value => value.id === goalCourseId) ?? course;
  const recovery = !activeVerification && !reviewRound && focusKc && focusKc.firstCourseId !== goalCourse.id;
  const displayedCourse = activeVerification ? course : goalCourse;
  const focusDisplayLabel = displayedCourse.title;
  const selectedWeakestKc = selectFocus(mode === "adaptive" ? introducedKcs : kcsOf(mode).filter((kc) => kc.gating), profile.byKc) as KnowledgeComponent | null;
  const weakestKc = (mode === "adaptive" && activeRouteComplete) || (selectedWeakestKc && isComponentMastered(selectedWeakestKc, profile.byKc)) ? null : selectedWeakestKc;
  const weakestMissingCoverage = weakestKc?.coverageKcIds.filter((id) => (profile.byKc[id]?.correct ?? 0) < 1).map((id) => KC_BY_ID.get(id)?.label).filter(Boolean) ?? [];
  const questionNumber = roundOffset + questionIndex + 1;
  const answeredInRound = Math.min(roundOffset + questionIndex + (result ? 1 : 0), SESSION_LENGTH);
  const focusComplete = Boolean(result && !currentPending && focusKc && isComponentMastered(focusKc, profile.byKc));
  const feedbackTitle = result === "correct" ? "正解！" : result === "revealed" ? "记住这个变化" : "差一点";
  const probePracticedCount = new Set(probeResults.flatMap((step) => step.practicedKcIds)).size;
  const probeCorrectCount = probeResults.filter((step) => step.correct).length;
  const probeTotalCount = diagnosticSteps.length + probeExtraCount;
  const probeStatus = !probesDone ? "拆步练习进行中" : probeResults.length === probeTotalCount ? "拆步练习已完成" : probeResults.length ? "已跳过剩余拆步" : "已跳过拆步练习";
  const probeSummary = diagnosticSteps.length > 0 && (probesDone || probeResults.length > 0)
    ? `${probeStatus}：已作答 ${probeResults.length} / ${probeTotalCount} 步，答对 ${probeCorrectCount} 步。${probePracticedCount ? `已记录 ${probePracticedCount} 个局部知识点的辅助练习。` : "已记录本次诊断过程。"}拆步不改变独立掌握度；原题仍计为错误，并保留待复测。`
    : null;
  const feedbackMessage = probeSummary ?? (result === "revealed" ? "已查看答案，本题计为未答对，独立掌握度保持不变。已安排后续独立复测。" : result === "correct" && !independentResult ? "本题答对，已记录辅助练习，独立掌握度保持不变。换词并满足间隔后的无提示整题才能解除待复测。" : diagnosticMessage ?? (unattributed ? "本题已记错，暂时无法唯一确定错因，未确认的知识点不扣分。已安排独立复测。" : detail.rule));
  const feedbackMeta = probeSummary
    ? `${probeStatus} · 辅助练习单独记录 · 待独立复测`
    : !independentResult ? "辅助作答 · 独立掌握度未更新 · 待复测" : currentPending ? "原题已记录 · 待独立复测" : `独立作答 · 本题重点 ${currentPercent}%`;
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
    return <div className={`skill-progress-row ${isFocus ? "focus" : ""} ${isLexical ? "lexical" : ""}`} key={kc.id} data-kc-id={kc.id}>
      <div className="skill-progress-copy"><span>{kc.label}</span><small>{kc.id.startsWith("lexeme.") ? "逐词例外 · " : kc.id.startsWith("facet.") ? "覆盖切面 · " : ""}{kcStatus(kc)} · {stats.attempts} 次作答{coverage ? ` · 覆盖 ${coverage}` : ""}{reused ? ` · 沿用${COURSES[kc.firstCourseIndex].title}` : ""}{prerequisiteLabels.length ? ` · 先修：${prerequisiteLabels.join("、")}` : ""}</small>{profile.assessment.assistedByKc[kc.id] && <small>辅助练习 {profile.assessment.assistedByKc[kc.id].attempts} 次，答对 {profile.assessment.assistedByKc[kc.id].correct} 次 · 不计入掌握度</small>}{profile.assessment.migration?.baselineByKc?.[kc.id] && <small>包含无法完整核验来源的历史记录</small>}</div>
      <div className="skill-progress-value"><div><span style={{ width: `${isFacet ? stats.correct >= 1 ? 100 : 0 : percent}%` }} /></div><b>{isFacet ? stats.correct >= 1 ? "✓" : "—" : `${percent}%`}</b></div>
    </div>;
  };
  const renderCoverageGroup = (group: { component: KnowledgeComponent; coverage: KnowledgeComponent[] }, courseId?: ModeId) => (
    <div className="knowledge-coverage-group" key={group.component.id} data-coverage-parent={group.component.id}>
      {renderKcRow(group.component, Boolean(courseId && group.component.firstCourseId !== courseId))}
      {group.coverage.length > 0 && <div className="knowledge-coverage-children" role="group" aria-label={`${group.component.label}的覆盖项`}>
        {group.coverage.map(kc => renderKcRow(kc, Boolean(courseId && kc.firstCourseId !== courseId)))}
      </div>}
    </div>
  );
  const knowledgeGroups = groupKnowledgeCoverage(activeKcs);
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
      <button type="button" className={`adaptive-entry ${mode === "adaptive" ? "active" : ""}`} onClick={() => start("adaptive")}><span className="adaptive-icon">自</span><span><strong>自适应训练</strong><small>{mode === "adaptive" ? "当前课程" : "当前专项"} · <span className="current-course-name">{focusDisplayLabel}</span></small><small>{pendingInMode.length ? `待独立复测 ${pendingInMode.length} 项` : "本轮重点掌握度"}</small></span><b>{focusPercent}%</b></button>
      <button ref={progressTriggerRef} type="button" className="progress-trigger" onClick={() => setProgressOpen(true)} aria-haspopup="dialog"><span><b>知识进度</b><small>{"全部课程与共享知识点"}</small></span><strong>{masteredKcCount}<i>/</i>{GATING_KCS.length}</strong></button>
      <nav className="mode-list" aria-label="专项课程">{visibleCourses.map((item) => { const summary = courseSummary(item); return <button type="button" className={mode === item.id ? "active" : ""} disabled={!summary.unlocked} onClick={() => start(item.id)} key={item.id} title={item.description}><span>{item.order !== undefined ? item.order + 1 : item.lesson}</span><span className="course-name"><small>{item.stageLabel}</small>{item.title}</span><i>{summary.status}</i></button>; })}</nav>

      <button type="button" className="reset-progress" onClick={resetProgress}>清除本地进度</button>
    </aside><section className="exercise-stage">{correctionNotice && <div className="migration-notice" role="status"><p><strong>旧归因记录已校正</strong><span>{correctionNotice}</span></p><button type="button" onClick={() => setCorrectionNotice(null)} aria-label="关闭校正说明">知道了</button></div>}{migrationNotice && <div className="migration-notice" role="status"><p><strong>独立评估已启用</strong><span>辅助练习与独立掌握分开记录。{profile.assessment.migration ? ` 已依据可核验日志修正 ${profile.assessment.migration.changes.length} 个知识点，并恢复 ${pendingRetests.length} 项待复测。无法核验来源的历史记录保留，不当作新增独立成绩。` : "学习进度已保留，未确认的整题表现将安排独立复测。"}</span></p><button type="button" onClick={() => setMigrationNotice(false)} aria-label="关闭迁移说明">知道了</button></div>}{!finished ? <><div className="stage-meta"><span>第 {questionNumber} 题 / {SESSION_LENGTH}</span><div className="progress-track"><span style={{ width: `${questionNumber / SESSION_LENGTH * 100}%` }} /></div><button type="button" className="quiet-button" onClick={finishRound}>结束本轮</button></div>
      {(activeVerification || recovery || reviewRound) && <p className="practice-notice">
        <strong>{activeVerification?.kind === 'retest' ? '独立复测' : activeVerification?.kind === 'rehearsal' ? '巩固练习' : activeVerification?.kind === 'spacing' ? '间隔练习' : recovery ? '补基础' : '巩固训练'}</strong>
        {activeVerification?.kind === 'retest' ? '请独立完成整题；使用提示会继续保留待复测。' : activeVerification?.kind === 'rehearsal' ? '先巩固，再换词复测；本题不计独立掌握。' : activeVerification?.kind === 'spacing' ? '先练其他目标，再检查此前未独立完成的变化。' : recovery ? `${roundState.globalRecovery ? '先恢复之前退步的知识点，再继续本课。' : '先复习本课需要的基础规则，再继续后续变化。'}${course.id !== goalCourse.id ? ` 本题来自${course.title}。` : ''}` : '已达标内容的巩固练习。'}
      </p>}
      <article ref={questionCardRef} className={`exercise-card${result ? " has-result" : ""}`} data-form={form ?? ""} key={`${exercise.id}-${questionIndex}-${seed}`}><div className="question-kicker"><span>Yokubi · L{sourceCourse?.lesson ?? course.lesson}</span><span>{targetLabel}</span>{result && <span>{KC_FAMILY_LABELS[targetKc.family]} · {targetKc.label}</span>}</div><p className="instruction">{form ? <>请把下面的{practiceDomain === "verb" ? "动词" : "形容词"}变为<strong>{targetLabel}</strong></> : `请选择这个${practiceDomain === "verb" ? "动词" : "形容词"}所属的类别`}</p>{formSemantics && <p className="semantic-brief"><span>表达作用</span><span>{formSemantics.concise}</span></p>}<div className="word-display"><ruby>{item.surface}<rt>{item.reading}</rt></ruby><span>{item.meaning}</span></div>
      {!form ? <div className={`class-options ${classChoices.length === 2 ? "two-options" : ""}`}>{classChoices.map((choice, index) => <button type="button" key={choice} disabled={Boolean(result)} data-class-shortcut={String(index + 1)} aria-keyshortcuts={String(index + 1)} className={`${selectedClass === choice ? "selected" : ""} ${result && choice === item.class ? "choice-correct" : ""} ${selectedClass === choice && result === "incorrect" ? "choice-wrong" : ""}`} onClick={() => chooseClass(choice)}><small>{choice === "ichidan" ? "る脱落" : choice === "godan" ? "词尾移动" : choice === "irregular" ? "固定变化" : choice === "i" ? "词尾い变化" : "な／だ接续"}</small><strong>{classLabelFor(choice)}</strong><kbd aria-hidden="true">{index + 1}</kbd></button>)}</div> : <form onSubmit={submit}><label htmlFor="answer">你的答案</label><div className={`answer-row ${result ?? ""}`}><input ref={inputRef} id="answer" lang="ja" onKeyDown={(event) => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault(); }} autoComplete="off" disabled={Boolean(result)} value={answer} aria-describedby={typoNotice ? "typo-notice" : undefined} onChange={(e) => { setAnswer(e.target.value); setTypoNotice(false); setInputNotice(null); }} placeholder="输入日语……" /><button type="submit" disabled={!answer.trim() || Boolean(result)}>检查答案</button></div><p className="answer-note">汉字或全假名答案均可</p>{inputNotice && <p className="hint-box" role="status">{inputNotice}</p>}{typoNotice && <p id="typo-notice" className="hint-box" role="status">不需要变化的部分与原词不一致，可能是输入笔误。请对照原词修改后重新提交；本次未计入作答或知识点统计。</p>}</form>}
      {!result && <div className="assist-row"><button type="button" className="text-button" onClick={showHint}>{hintShown ? "收起提示" : "看一条提示"}</button><button type="button" className="text-button" onClick={() => grade(false, true)}>不知道</button></div>}{hintShown && !result && <p className="hint-box">{hintFor(item, form)}</p>}
      {result && <div ref={feedbackRef} className={`feedback ${result}`} role="status"><div className="feedback-copy"><strong>{feedbackTitle}</strong>{probeSummary && originalFormIdentification && <p className="original-form-identification">{originalFormIdentification}</p>}<p className="feedback-summary">{feedbackMessage}</p></div><div className="knowledge-tags" aria-label="本题涉及的知识点">{derivation.requiredKcIds.map((id: string) => KC_BY_ID.get(id)).filter((kc: KnowledgeComponent | undefined): kc is KnowledgeComponent => Boolean(kc)).map((kc: KnowledgeComponent) => <span className={kc.id === evidenceKcId ? "target" : confirmedKcIds.includes(kc.id) ? "confirmed" : ""} key={kc.id}>{confirmedKcIds.includes(kc.id) && "✓ 已确认 · "}{KC_FAMILY_LABELS[kc.family]} · {kc.label}</span>)}</div>{confirmedKcIds.length > 0 && <p className="partial-evidence-note">{independentResult ? "原题中可确认的局部规则单独记录；未确认的知识点不扣分。整题仍计为错误，保留待复测。" : "本次有帮助或未满足复测条件，可确认的局部规则只记录为辅助练习。独立掌握度保持不变。"}</p>}{probing && <DiagnosticPractice key={`${exercise.id}-${questionIndex}-${seed}`} item={item} steps={diagnosticSteps} onEvidence={saveStepEvidence} onDone={finishDiagnosticPractice} />}<div hidden={probing}><div className="rule-line"><span><FuriganaText surface={item.surface} reading={item.reading} /></span><b>→</b>{!form ? <span className="answer-emphasis">{classLabelFor(item.class)}</span> : acceptedVariant ? <span className="answer-emphasis"><FuriganaText surface={acceptedVariant.surface} reading={acceptedVariant.reading} /></span> : detailSteps ? detailSteps.map((step: string, i: number) => <Fragment key={`${step}-${i}`}><span className={i === detailSteps.length - 1 ? "answer-emphasis" : ""}><FuriganaText surface={step} reading={readingSteps?.[i] ?? step} /></span>{i < detailSteps.length - 1 && <b>→</b>}</Fragment>) : detail.parts.map((part: string, i: number) => <span className={i === detail.parts.length - 1 ? "answer-emphasis" : ""} key={`${part}-${i}`}><FuriganaText surface={part} reading={readingParts[i] ?? part} />{i < detail.parts.length - 1 && <b className="joiner">＋</b>}</span>)}</div>{acceptedVariant && form && <p className="accepted-variant-note">{acceptedVariant.note && <span>{acceptedVariant.note}</span>}<span>{form === "causativePassive" || form.startsWith("causativePassive") ? "完整形式：" : "本站默认展示："}<FuriganaText surface={detail.answer} reading={readingDetail?.answer ?? detail.answer} /></span></p>}{result === "incorrect" && form && <p className="your-answer">你的答案：{answer || "—"}</p>}<SemanticDetails semantics={formSemantics} /></div><div className="feedback-meta"><span>{feedbackMeta}</span><a href={exercise.sourceUrl ?? course.url} target="_blank" rel="noreferrer">查看本题参考课程 ↗</a></div><button type="button" className="next-button" disabled={probing} onClick={nextQuestion}>{probing ? "请完成或跳过拆步" : questionNumber === SESSION_LENGTH ? "查看本轮结果" : focusComplete ? "继续" : "下一题"}{!probing && <span><kbd>Enter</kbd> →</span>}</button></div>}{!result && <p className="keyboard-hint">{!form ? <>{classChoices.map((_, index) => <Fragment key={index}><kbd>{index + 1}</kbd>{" "}</Fragment>)}选择答案</> : <><kbd>Enter</kbd> 检查答案</>}</p>}</article></> :
      <article className="completion-card"><p className="completion-jp">おつかれさま</p><span className="completion-label">本轮完成</span>{answeredInRound > 0 && <div className="score"><strong>{sessionCorrect}</strong><span>/ {answeredInRound}</span></div>}<p>{pendingInMode.length ? `还有 ${pendingInMode.length} 项待独立复测。下一轮先安排符合条件的复测，间隔不足时穿插其他目标。` : unlocked ? `新知识点已解锁：${unlocked}` : mode === "adaptive" && activeRouteComplete ? unfinishedReview ? `全部知识点已达标，下一轮优先完成「${unfinishedReview.title}」的综合复习。` : "全部课程已完成，接下来按课程轮换巩固。" : mode === "adaptive" ? "下一轮会继续聚焦当前置信度最低的知识点。" : "专项模式只练当前课程，不会推进自适应路线的解锁。"}</p><div className="completion-focus"><span>{pendingInMode.length ? "待独立复测" : mode === "adaptive" ? "当前薄弱点" : "本专项薄弱点"}</span><strong>{pendingInMode.length ? pendingInMode[0].target.form ? FORM_LABELS[pendingInMode[0].target.form as Form] : "词类判断" : weakestKc?.label ?? unfinishedReview?.title ?? "全部已达标"}</strong>{weakestMissingCoverage.length > 0 && <small>待覆盖：{weakestMissingCoverage.join("、")}</small>}</div><button type="button" className="restart-button" onClick={() => start(mode)}>{mode === "adaptive" ? "继续下一轮" : "继续本专项"}<span><kbd>Enter</kbd> →</span></button>{mode !== "adaptive" && <button type="button" className="back-adaptive" onClick={() => start("adaptive")}>返回自适应训练</button>}</article>}
      <footer className="source-note">课程编排参考 <a href={CHINESE_YOKUBI_URL} target="_blank" rel="noreferrer">Yokubi 中文版</a>，自适应学习思路参考 <a href="https://kanabr.vercel.app/" target="_blank" rel="noopener noreferrer">kanabr</a> · 本地学习记录 · CC BY 4.0</footer></section></section>
    {progressOpen && <div className="progress-overlay"><button type="button" className="progress-backdrop" onClick={() => setProgressOpen(false)} aria-label="关闭知识进度" /><section className="progress-drawer" role="dialog" aria-modal="true" aria-labelledby="progress-title"><header><div><p>LEARNING PROFILE · {"UNIFIED"}</p><h2 id="progress-title">知识进度</h2></div><button ref={progressCloseRef} type="button" onClick={() => setProgressOpen(false)} aria-label="关闭知识进度">关闭 <kbd>Esc</kbd></button></header><div className="progress-summary"><div><span>已掌握知识点</span><strong>{masteredKcCount}</strong></div><div><span>已解锁知识点</span><strong>{introducedKcs.length}</strong></div><p>动词与形容词共用基础规则记录。辅助练习不改变独立掌握度，待复测不会因拆步答对而解除。当前待独立复测 {pendingRetests.length} 项。</p>{profile.assessment.migration && <p>旧版记录已按可核验日志修正 {profile.assessment.migration.changes.length} 个知识点；更早或无法核验来源的统计保留，不能据此还原历史独立作答。</p>}</div><section className="profile-transfer" aria-labelledby="profile-transfer-title"><div><h3 id="profile-transfer-title">更换设备</h3><p>导出一个 JSON 备份，保存知识点进度、辅助练习、待复测任务和作答日志，也可以在其他浏览器中恢复。</p></div><div className="transfer-actions"><button type="button" onClick={exportProgress}>导出数据</button><button type="button" onClick={() => importInputRef.current?.click()}>导入数据</button><input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={importProgress} /></div>{transferNotice && <p className={`transfer-notice ${transferNotice.kind}`} role="status">{transferNotice.text}</p>}</section><details className="curriculum-guide"><summary>课程如何安排</summary><p><strong>分组：</strong>按主要学习目标说明每门课学什么。</p><p><strong>排序：</strong>先学所需规则，再练它们的应用；条件相同时，优先复用和对照已学词形，主题相邻作为补充。可能与态接在基础变化之后，复用词干变化和基本时态。</p><p><strong>解锁：</strong>按知识点的先修条件开放。排在前面的课程并不都是后课的先修，同一主题也不必连续学习。</p><ol>{COURSE_STAGES.map((stage) => <li key={stage.id}><strong>{stage.label}</strong><span>{stage.objective}</span></li>)}</ol><p>同一课程先练新形式，再练它的后续变化。课程列表使用本站学习序号，题目上的 Yokubi 课号标明内容来源。</p></details><div className="progress-view-tabs" role="tablist" aria-label="进度查看方式"><button type="button" role="tab" aria-selected={progressView === "course"} className={progressView === "course" ? "active" : ""} onClick={() => setProgressView("course")}>按课程</button><button type="button" role="tab" aria-selected={progressView === "atomic"} className={progressView === "atomic" ? "active" : ""} onClick={() => setProgressView("atomic")}>按知识点</button><button type="button" role="tab" aria-selected={progressView === "pending"} className={progressView === "pending" ? "active" : ""} onClick={() => setProgressView("pending")}>待复测 {pendingRetests.length}</button><button type="button" role="tab" aria-selected={progressView === "log"} className={progressView === "log" ? "active" : ""} onClick={() => setProgressView("log")}>作答日志</button></div>
      {progressView === "pending" ? <PendingRetests assessment={profile.assessment} /> : progressView === "log" ? <PracticeLogView log={profile.practiceLog} /> : progressView === "course" ? <div className="course-progress-list">{visibleCourses.map((item) => { const summary = courseSummary(item); const isFocusCourse = focusKc?.firstCourseId === item.id; return <details key={item.id} open={isFocusCourse}><summary><span><small>{item.order !== undefined ? item.order + 1 : item.lesson}</small><b>{item.title}</b></span><span>{summary.status}<i aria-hidden="true">⌄</i></span></summary><p className="course-objective"><strong>{item.stageLabel}</strong> · {item.description ?? item.stageObjective}</p><div className="skill-progress-list">{groupKnowledgeCoverage(summary.required, ALL_KCS).map(group => renderCoverageGroup(group, item.id))}</div></details>; })}</div> : <div className="course-progress-list atomic-progress-list">{Object.entries(KC_FAMILY_LABELS).map(([family, label]) => { const groups = knowledgeGroups.filter(group => group.component.family === family); const components = groups.flatMap(group => [group.component, ...group.coverage]); if (!components.length) return null; return <details key={family} open={components.some((kc) => kc.id === focusKc?.id)}><summary><span><small>{components.filter((kc) => kc.gating && introducedSet.has(kc.id)).length}/{components.filter((kc) => kc.gating).length}</small><b>{label}</b></span><span>{components.length} 项<i aria-hidden="true">⌄</i></span></summary><div className="skill-progress-list">{groups.map(group => renderCoverageGroup(group))}</div></details>; })}</div>}
      </section></div>}
  </fieldset></main>;
}
