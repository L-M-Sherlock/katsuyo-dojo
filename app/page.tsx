"use client";

import { isPracticeRetest, isChallengeRetest, moveRetestQueue, retestQueue } from "./lib/retest-queue.mjs";

import StatisticsPage from "./lib/statistics-page.mjs";
import LanguageSwitch from "./lib/language-switch.mjs";
import PrinciplesPage, { principlesSectionFromHash } from "./lib/principles-page.mjs";
import UsageCardView from "./lib/usage-card-view.mjs";
import { USAGE_CARDS, usageCardFor } from "./lib/usage-cards.mjs";
import { emptyStatistics, recordActiveTime, statisticsSnapshot, localDay } from "./lib/statistics.mjs";
import type { Statistics } from "./lib/statistics.mjs";
import { createStatisticsClock, STATISTICS_FLUSH_MS } from "./lib/statistics-clock.mjs";
import { FORM_LABELS } from "./lib/form-labels.mjs";

import { recognizedFormsIdentificationMessage } from "./lib/form-recognition.mjs";
import { groupKnowledgeCoverage } from "./lib/knowledge-display.mjs";
import { curriculumSupportsVerbForm as eligibleFor } from "./lib/curriculum-shapes.mjs";

import { FormEvent, Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ADJECTIVES } from "./lib/adjective-catalog.mjs";
import { adjectiveTargetLabel, adjectiveClassLabel, conjugateAdjective, explainAdjectiveConjugation } from "./lib/adjective-conjugation.mjs";
import { buildAdjectiveKnowledgeModel } from "./lib/adjective-knowledge-model.mjs";
import { acceptedVariantKcIds, acceptedVariantNote } from "./lib/answer-variants.mjs";
import { advanceIntroductions, componentConfidence, emptySkillStats, isComponentMastered } from "./lib/adaptive.mjs";
import { exerciseKey, recordRecentWord, wordKey } from "./lib/exercise-selection.mjs";
import { classLabel, conjugate, explainConjugation } from "./lib/conjugation.mjs";
import { summarizeUnifiedCourse } from "./lib/unified-progress.mjs";
import { ADJECTIVE_COURSES as ADJECTIVE_CURRICULUM, CHINESE_YOKUBI_URL, COURSES as VERB_CURRICULUM } from "./lib/curriculum.mjs";
import FuriganaText from "./lib/furigana-text.mjs";
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
import ChallengeSelection from "./lib/challenge-selection.mjs";
import { createChallengePlanner, normalizeChallengeCourses, CHALLENGE_PREFERENCE_KEY, LEGACY_CHALLENGE_PREFERENCE_KEY, HIGHEST_CHALLENGE_COURSE, CHALLENGE_RECENT_QUESTION_LIMIT } from "./lib/challenge-planning.mjs";
import { createProfileStore, readPreference, writePreference } from "./lib/profile-store.mjs";
import { canContinueRound, emptyHintState, planPractice, shouldReplan, toggleHint } from "./lib/practice-session.mjs";
import { createUnifiedExport as createProfileExport, parseUnifiedImport as parseProfileImport, UNIFIED_STORAGE_KEY, LEGACY_STORAGE_KEY, LEGACY_V7_STORAGE_KEY, LEGACY_V5_STORAGE_KEY } from "./lib/unified-profile.mjs";
import { COURSE_STAGES, CURRICULUM_VERSION, UNIFIED_COURSES, sourceForForm } from "./lib/unified-curriculum.mjs";
import { buildUnifiedKnowledge, deriveUnified } from "./lib/unified-knowledge.mjs";
import { I18nProvider, useI18n } from "./lib/i18n/provider.mjs";
import { detectLocale, localeFromPath, localizedPath, loadLocalizedUsageCardLookup, readLocalePreference, writeLocalePreference } from "./lib/i18n/index.mjs";
import { englishYokubiUrl, focusCopyForLocale, formLabel, knowledgeFamilyLabel, knowledgeLabel, lexicalMeaningFor, localizeCourse, localizeCourses, localizeCourseStages, localizedSemanticsForForm } from "./lib/i18n/content.mjs";
import { SITE_CATALOGS } from "./lib/i18n/site-catalogs.mjs";
import { formatDiagnosticMessage } from "./lib/i18n/diagnostics.mjs";
import { profileImportMessageKey } from "./lib/profile-import-error.mjs";

type VerbClass = "godan" | "ichidan" | "irregular";
type AdjectiveClass = "i" | "na";
type PracticeClass = VerbClass | AdjectiveClass;
type PracticeDomain = "verb" | "adjective";
type CompoundBase = "teageru" | "temorau" | "tekureru" | "teiru" | "tearu" | "teoru" | "tai" | "tehoshii" | "youtosuru" | "temiru" | "teshimau" | "teoku" | "teiku" | "tekuru" | "sugiru" | "tagaru";
type CompoundEnding = "Past" | "Negative" | "NegativePast";
type CompoundForm = `${CompoundBase}${CompoundEnding}`;
type Form = import("./lib/multi-step-forms.mjs").ChainForm | "negative" | "past" | "te" | "masu" | "passive" | "potential" | "imperative" | "volitional" | "ba" | "nasai" | "prohibitive" | "causative" | "causativePassive" | "causativePassiveContracted" | "nakute" | "naide" | "zu" | "zuni" | "teshimau" | "chau" | "teoku" | "toku" | "negativePast" | "masuPast" | "masuNegative" | "masuNegativePast" | "passivePast" | "passiveNegative" | "passiveNegativePast" | "potentialPast" | "potentialNegative" | "potentialNegativePast" | "causativePast" | "causativeNegative" | "causativeNegativePast" | "causativePassivePast" | "causativePassiveNegative" | "causativePassiveNegativePast" | "passiveDesireNegativePast" | "teageru" | "temorau" | "tekureru" | "tekudasai" | "naideKudasai" | "teiru" | "teru" | "tearu" | "teoru" | "toru" | "tai" | "tehoshii" | "tara" | "temo" | "nagara" | "tsutsu" | "nakerebaNaranai" | "nakutewaIkenai" | "naitoIkenai" | "tari" | "tewa" | "temoIi" | "nakutemoIi" | "masenka" | "youtosuru" | "temiru" | "teiku" | "teku" | "tekuru" | "tatte" | "sugiru" | "tagaru" | "temiruDesirePast" | "passiveProgressivePast" | "causativeReceivePast" | CompoundForm | "adjectiveNegative" | "adjectivePast" | "adjectiveNegativePast" | "adjectiveTe" | "adjectiveAttributive" | "adjectivePredicative" | "adjectiveNaNegative" | "adjectiveNaPast" | "adjectiveNaNegativePast" | "adjectiveNaTe" | "adjectiveBa" | "adjectiveAdverb";
type ModeId = "classify" | "negative" | "past" | "te" | "giving" | "request" | "imperative" | "masu" | "aspect" | "passive" | "potential" | "volitional" | "desire" | "ba" | "tara" | "nasai" | "prohibitive" | "temo" | "concurrent" | "obligation" | "listing" | "permission" | "youtosuru" | "temiru" | "causative" | "causativePassive" | "nakuteNaide" | "zuZuni" | "teshimauChau" | "teokuToku" | "direction" | "tatte" | "sugiru" | "tagaru" | "multiStepCompound" | "basicCompound" | "voiceCompound" | "adjectiveClassify" | "adjectiveIBase" | "adjectiveITe" | "adjectiveNaBase" | "adjectiveConditional" | "adjectiveAdverb";
type PracticeMode = "adaptive" | ModeId;
type Result = "correct" | "incorrect" | "revealed" | null;
type Verb = { domain: "verb"; surface: string; reading: string; meaning: string; class: VerbClass; lexicalSurface?: string };
type Adjective = { domain: "adjective"; surface: string; reading: string; meaning: string; class: AdjectiveClass; iiFamily: boolean };
type PracticeItem = Verb | Adjective;
type Course = { id: ModeId; domain: PracticeDomain; title: string; description?: string; lesson: string; url: string; forms: readonly Form[]; stage?: number; stageId?: string; stageLabel?: string; stageObjective?: string; review?: boolean; order?: number };
type KnowledgeComponent = { id: string; order: number; label: string; family: keyof typeof KC_FAMILY_LABELS; gating: boolean; firstCourseId: ModeId; firstCourseIndex: number; firstLesson: string; prerequisites: string[]; coverageKcIds: string[]; coverageOnly?: boolean; unlockByPrerequisites?: boolean; masteryPrerequisites?: KnowledgeComponent[] };
type Exercise = { id: string; courseId: ModeId; courseIndex: number; form: Form | null; item: PracticeItem; kcIds: string[]; sourceUrl?: string; prerequisites?: string[]; context?: { id: string; text: string }; usageReviewVersion?: number };
type SkillStats = ReturnType<typeof emptySkillStats>;
type AssessmentState = LearningAssessment & { migration?: { at: string; changes: { kcId: string; before: SkillStats | null; after: SkillStats | null }[]; unverifiedKcIds: string[]; baselineByKc: Record<string, SkillStats> } };
type Profile = { practiceGoalCourseId?: ModeId; version: 8; statistics: Statistics; curriculumVersion: number; date: string; attempted: number; correct: number; streak: number; introducedKcIds: string[]; rotation: number; byKc: Record<string, SkillStats>; assessment: AssessmentState; accessibleCourseIds: string[]; coursePractice: Record<string, string[]>; recentWordKeys: string[]; practiceLog: PracticeLog; legacy: object | null; migration: { message?: string; preserved?: number; archived?: number } | null };
type VerbForm = Parameters<typeof conjugate>[2];
type AnswerVariant = { surface: string; reading: string; note: string };
type FormSemantics = { concise: string; coreMeaning: string; register?: string; usageNote?: string; contrast?: string };
type ChallengeSelectionProps = Omit<React.ComponentProps<typeof ChallengeSelection>, "locale" | "t" | "courseLabel" | "stageLabel"> & {
  locale?: string;
  t?: (key: string, params?: Record<string, unknown>) => string;
  courseLabel?: (course: Course) => string;
  stageLabel?: (stage: { id: string; label: string }) => string;
};
const LocalizedChallengeSelection = ChallengeSelection as unknown as React.ComponentType<ChallengeSelectionProps>;

type DiagnosticDescriptor = { messageKey: string; params?: DiagnosticParams };
type DiagnosticStep = { surface: string; reading: string; form: Form; answers: string[]; readings: string[]; kcIds: string[]; focusId: string | null; continuation: boolean; targetLabel?: string; stepTitle?: string; prompt?: string; note?: string; kind?: "stem" | "attachment" | "classification" | "conjugation" | "atomic"; nodeId?: string; diagnosticOnly?: boolean; expectedClass?: VerbClass; providedClass?: VerbClass; classChoices?: { value: VerbClass; label: string }[]; classificationExplanation?: string; analysisItem?: PracticeItem; goalForm?: Form; targetForm?: Form; targetKind?: string; i18n?: { goalLabel?: DiagnosticDescriptor; stepTitle?: DiagnosticDescriptor; targetLabel?: DiagnosticDescriptor; prompt?: DiagnosticDescriptor; note?: DiagnosticDescriptor; classificationExplanation?: DiagnosticDescriptor } };
type DiagnosticStepResult = { correct: boolean; updatedKcIds: string[]; practicedKcIds: string[] };
type DiagnosticParams = Record<string, string | number | boolean | null>;
type DiagnosticAttempt = { answer: string; outcome: string; message: string; messageKey?: string; params?: DiagnosticParams; resolution: string; index: number; total: number; nextTotal: number };
type DiagnosticFeedbackState =
  | { kind: "classification"; correct: boolean; explanation?: DiagnosticDescriptor; legacyExplanation?: string }
  | { kind: "correct" }
  | { kind: "incorrect"; descriptor?: DiagnosticDescriptor; legacyMessage?: string };
type DiagnosticNoticeState = { kind: "invalid" | "typo"; descriptor?: DiagnosticDescriptor; legacyMessage?: string } | null;

function localizedClassLabel(itemClass: PracticeClass, locale: string) {
  if (locale === "en") return ({ godan: "Godan verb", ichidan: "Ichidan verb", irregular: "Irregular verb", i: "い-adjective", na: "な-adjective" } as const)[itemClass];
  return classLabelFor(itemClass);
}

function DiagnosticPractice({ item, goalLabel, steps, onEvidence, onDone, active = true }: {
  item: PracticeItem; goalLabel: string; steps: DiagnosticStep[]; active?: boolean;
  onEvidence: (step: DiagnosticStep, correct: boolean, failedKcId: string | null, confirmed: string[], totalChange: number, attempt: DiagnosticAttempt) => Promise<boolean>;
  onDone: (outcome: "completed" | "skipped", answered: number, total: number) => Promise<boolean>;
}) {
  const { locale, t } = useI18n();
  const [index, setIndex] = useState(0);
  const [practiceSteps, setPracticeSteps] = useState(steps);
  const [answer, setAnswer] = useState("");
  const [hasFollowups, setHasFollowups] = useState(false);
  const [feedback, setFeedback] = useState<DiagnosticFeedbackState | null>(null);
  const [notice, setNotice] = useState<DiagnosticNoticeState>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const evaluated = useRef(new Set<string>());
  const examinedNodes = useRef(new Set<string>());
  const input = useRef<HTMLInputElement>(null);
  const firstChoice = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const step = practiceSteps[index];
  const diagnosticCopy = (descriptor?: DiagnosticDescriptor) => descriptor ? formatDiagnosticMessage(descriptor.messageKey, descriptor.params, locale) : null;
  const displayTarget = locale === "zh-CN"
    ? step.targetLabel ?? formLabel(locale, step.targetForm ?? step.form) ?? step.form
    : diagnosticCopy(step.i18n?.targetLabel) ?? formLabel(locale, step.targetForm ?? step.form) ?? step.form;
  const stepTitle = diagnosticCopy(step.i18n?.stepTitle) ?? (locale === "zh-CN" && step.stepTitle
    ? step.stepTitle : step.kind === "classification" ? t("practice.diagnostic.judgeVerb") : t("practice.diagnostic.transformTo", { target: displayTarget }));
  const feedbackText = feedback?.kind === "classification"
    ? `${t(feedback.correct ? "practice.diagnostic.classCorrect" : "practice.diagnostic.classWrong")} ${diagnosticCopy(feedback.explanation) ?? (locale === "zh-CN" ? feedback.legacyExplanation ?? "" : "")}${t("practice.diagnostic.classOnly")}`
    : feedback?.kind === "correct" ? t("practice.diagnostic.stepCorrect")
      : feedback?.kind === "incorrect"
        ? `${feedback.descriptor?.messageKey ? formatDiagnosticMessage(feedback.descriptor.messageKey, feedback.descriptor.params, locale) : locale === "zh-CN" ? feedback.legacyMessage ?? t("practice.diagnostic.fragmentMissing") : t("practice.diagnostic.fragmentMissing")} ${t("practice.diagnostic.assisted")}`
        : null;
  const noticeText = notice?.kind === "typo" ? t("practice.diagnostic.typo")
    : notice?.descriptor?.messageKey ? formatDiagnosticMessage(notice.descriptor.messageKey, notice.descriptor.params, locale)
      : notice ? locale === "zh-CN" ? notice.legacyMessage ?? t("practice.diagnostic.invalid") : t("practice.diagnostic.invalid") : null;
  useEffect(() => { if (active) (firstChoice.current ?? input.current)?.focus(); }, [active]);
  useEffect(() => { if (feedback && !busy && active) nextButton.current?.focus(); }, [feedback, busy, active]);
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
      const descriptor = analysis.feedback?.messageKey ? analysis.feedback : diagnosis?.messageKey ? diagnosis : null;
      const attempt: DiagnosticAttempt = { answer: value, outcome: analysis.kind, message: analysis.feedback?.message ?? diagnosis?.message ?? "", ...(descriptor?.messageKey ? { messageKey: descriptor.messageKey, params: descriptor.params ?? {} } : {}), resolution: analysis.feedback?.resolution ?? analysis.kind, index: index + 1, total: practiceSteps.length, nextTotal: practiceSteps.length };
      if (analysis.kind === "typo" || analysis.kind === "invalid") {
        attempt.message = analysis.kind === "invalid" ? (locale === "en" ? t("practice.diagnostic.invalid") : analysis.feedback?.message ?? t("practice.diagnostic.invalid")) : t("practice.diagnostic.typo");
        if (!await onEvidence(step, false, null, [], 0, attempt)) return;
        setNotice({ kind: analysis.kind, descriptor: descriptor?.messageKey ? descriptor as DiagnosticDescriptor : undefined, legacyMessage: analysis.feedback?.message });
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
        ? { kind: "classification", correct, explanation: step.i18n?.classificationExplanation, legacyExplanation: step.classificationExplanation }
        : correct ? { kind: "correct" }
          : { kind: "incorrect", descriptor: descriptor?.messageKey ? descriptor as DiagnosticDescriptor : undefined, legacyMessage: analysis.feedback?.message ?? diagnosis?.message });
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
  return <section className="diagnostic-practice" aria-label={t("practice.diagnostic.aria")}>
    <h3>{t("practice.diagnostic.heading", { current: index + 1, total: practiceSteps.length })}</h3>
    <p className="diagnostic-step-label">{t("practice.diagnostic.stepGoal")}</p>
    <h4 className="diagnostic-step-title">{stepTitle}</h4>
    {(diagnosticCopy(step.i18n?.prompt) ?? (locale === "zh-CN" ? step.prompt : null)) ? <p className="diagnostic-instruction"><strong>{diagnosticCopy(step.i18n?.prompt) ?? step.prompt}</strong></p> : <p className="diagnostic-instruction">{t(step.kind === "classification" ? "practice.diagnostic.chooseClass" : step.continuation ? "practice.diagnostic.continueTo" : "practice.diagnostic.firstTo")} <strong>{step.kind === "classification" ? t("practice.class.verbCategory") : displayTarget}</strong></p>}
    <p className="diagnostic-given-label">{t("practice.diagnostic.given")}</p>
    <p className="diagnostic-word"><FuriganaText surface={step.surface} reading={step.reading} /></p>
    {step.providedClass && <p className="diagnostic-note">{t("practice.diagnostic.providedClass", { className: localizedClassLabel(step.providedClass, locale) })}</p>}
    {(diagnosticCopy(step.i18n?.note) ?? (locale === "zh-CN" ? step.note : null)) && <p className="diagnostic-note">{diagnosticCopy(step.i18n?.note) ?? step.note}</p>}
    {step.kind === "classification" ? <div className="class-options two-options">{step.classChoices?.map((choice, choiceIndex) => <button ref={choiceIndex === 0 ? firstChoice : undefined} type="button" key={choice.value} disabled={Boolean(feedback) || busy} className={`${answer === choice.value ? "selected" : ""} ${feedback && choice.value === step.expectedClass ? "choice-correct" : ""} ${feedback && answer === choice.value && choice.value !== step.expectedClass ? "choice-wrong" : ""}`} onClick={() => checkAnswer(choice.value)}>{localizedClassLabel(choice.value, locale)}</button>)}</div>
      : <form onSubmit={submit}><label htmlFor="diagnostic-answer">{t("practice.diagnostic.answer")}</label><div className="answer-row"><input ref={input} id="diagnostic-answer" lang="ja" autoComplete="off" value={answer} disabled={Boolean(feedback) || busy} onChange={(event) => { setAnswer(event.target.value); setNotice(null); }} onKeyDown={(event) => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault(); }} /><button type="submit" disabled={!answer.trim() || Boolean(feedback) || busy}>{t("practice.diagnostic.check")}</button></div></form>}
    {noticeText && <p role="status">{noticeText}</p>}
    {feedbackText && <div role="status"><p>{feedbackText}</p>{!hasFollowups && step.kind !== "classification" && <p>{t("practice.diagnostic.correctForm")} <FuriganaText surface={step.answers[0]} reading={step.readings[0]} /></p>}{(feedback?.kind === "incorrect" || (feedback?.kind === "classification" && !feedback.correct)) && <p className="diagnostic-continue-note">{t("practice.diagnostic.continueAfterWrong")}</p>}<button ref={nextButton} type="button" className="diagnostic-next-button" data-diagnostic-next aria-keyshortcuts="Enter" disabled={busy} onClick={next}>{t(index === practiceSteps.length - 1 ? "practice.diagnostic.finish" : "practice.diagnostic.next")}<span aria-hidden="true"><kbd>Enter</kbd> →</span></button></div>}
    <button type="button" className="text-button" disabled={busy} onClick={() => finish("skipped")}>{t("practice.diagnostic.skip")}</button>
    <footer className="diagnostic-meta">
      <p className="diagnostic-goal">{t("practice.diagnostic.fullReference", { goal: goalLabel })}</p>
      <details className="diagnostic-policy"><summary>{t("practice.diagnostic.scoringTitle")}</summary><p>{t("practice.diagnostic.scoring")}</p></details>
    </footer>
  </section>;
}

function PracticeLogView({ log }: { log: PracticeLog }) {
  const { locale, t } = useI18n();
  const [visible, setVisible] = useState(30);
  const outcomeKey: Record<string, string> = { correct: "correct", incorrect: "incorrect", revealed: "revealed", typo: "typo", invalid: "invalid", completed: "completed", skipped: "skipped", migrated: "migrated", shown: "shown", queued: "queued" };
  const sourceKey: Record<string, string> = { independent: "independent", guided: "guided", diagnostic: "diagnostic", hinted: "hinted", "feedback-retry": "feedbackRetry", rehearsal: "rehearsal", revealed: "revealed", migration: "migration" };
  const providedKey: Record<string, string> = { subgoal: "subgoal", intermediate: "intermediate", "word-class": "wordClass", "target-rule": "targetRule", hint: "hint", answer: "answer", "lexical-retry": "lexicalRetry" };
  const pendingLabel = (snapshot: {pending: boolean; queue?: "practice" | "challenge" | null}) => snapshot.pending ? `${t("log.yes")}${snapshot.queue ? ` (${t(snapshot.queue === "challenge" ? "log.challenge" : "log.practice")})` : ""}` : t("log.no");
  const percent = (stats: SkillStats | null) => `${Math.round((stats?.confidence ?? 0) * 100)}%`;
  return <section className="practice-log" aria-label={t("log.aria")}>
    <p className="practice-log-note">{t("log.note", { count: log.events.length, limit: PRACTICE_LOG_LIMIT })} {log.droppedEntries > 0 && t("log.dropped", { count: log.droppedEntries })}</p>
    {!log.events.length && <p>{t("log.empty")}</p>}
    {[...log.events].reverse().slice(0, visible).map(event => <details key={event.id}>
      <summary><span><strong>{event.type === "migration" ? t("log.migration") : <><span lang="ja">{event.exercise.surface}</span>{` · ${event.exercise.form ? formLabel(locale, event.exercise.form as Form) ?? event.exercise.form : t("practice.class.category")}`}</>}</strong><small>#{event.sequence} · {event.type === "question" ? t("log.question") : event.type === "step" ? t("log.step", { current: event.target.stepIndex, total: event.target.totalSteps }) : event.type === "migration" ? t("log.migration") : event.type === "hint" ? t("log.hint") : event.type === "retest-transfer" ? t("log.transfer") : t("log.end")} · {t(`log.outcomes.${outcomeKey[event.outcome] ?? event.outcome}`)}</small></span><time dateTime={event.at}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium", hour12: false }).format(new Date(event.at))}</time></summary>
      <div className="practice-log-detail">
        {event.mode && <p>{t(event.type === "retest-transfer" ? "log.previousLocation" : "log.mode")}: {t(event.mode === "challenge" ? "log.challenge" : "log.practice")}</p>}
        {!["diagnostic-end", "migration", "hint", "retest-transfer"].includes(event.type) && <><p>{t("log.given")} <FuriganaText surface={event.target.surface} reading={event.target.reading} /> · {t("log.target")} {event.target.form ? formLabel(locale, event.target.form) : t("practice.class.category")}</p><p>{t("log.submitted")} {(event.target.kind === "classification" || event.target.form === null) && ["godan", "ichidan", "irregular", "i", "na"].includes(event.answer) ? localizedClassLabel(event.answer as PracticeClass, locale) : <span lang="ja">{event.answer || t("log.blank")}</span>}{event.answerTruncated && t("log.truncated", { length: event.answerLength })}</p></>}
        {(event.diagnosis as { messageKey?: string }).messageKey ? <p>{(event.diagnosis as { messageKey: string }).messageKey.startsWith("diagnostics.") ? formatDiagnosticMessage((event.diagnosis as { messageKey: string }).messageKey, (event.diagnosis as { params?: Record<string, unknown> }).params, locale) : t((event.diagnosis as { messageKey: string }).messageKey, (event.diagnosis as { params?: Record<string, unknown> }).params)}</p> : event.type === "migration" ? <p>{t("log.migrationSummary", { count: event.changes.length })}</p> : event.diagnosis.message && <p>{locale === "zh-CN" ? event.diagnosis.message : t("log.legacyDiagnosis", { outcome: t(`log.outcomes.${outcomeKey[event.outcome] ?? event.outcome}`) })}</p>}
        {event.hintUsed && <p>{t("log.hintUsed")}</p>}
        {event.support ? <p>{t("log.conditions", { source: t(`log.sources.${sourceKey[event.support.source] ?? (event.support.independent ? "independent" : "guided")}`), details: event.support.provided.length > 0 ? ` · ${event.support.provided.map(value => t(`log.provided.${providedKey[value] ?? value}`)).join(", ")}` : "" })}</p> : <p>{t("log.legacy")}</p>}
        {event.changes.length ? <><strong>{t(event.type === "migration" ? "log.correction" : event.support ? "log.independent" : "log.old")} · {t("log.kcCount", { count: event.changes.length })}</strong><dl>{event.changes.map(change => <div key={change.kcId}><dt>{knowledgeLabel(locale, KC_BY_ID.get(change.kcId) ?? change.kcId) ?? change.kcId}</dt><dd>{t("log.stats", { attemptsBefore: change.before?.attempts ?? 0, attemptsAfter: change.after?.attempts ?? 0, correctBefore: change.before?.correct ?? 0, correctAfter: change.after?.correct ?? 0, confidenceBefore: percent(change.before), confidenceAfter: percent(change.after) })}</dd></div>)}</dl></> : <p>{t("log.noUpdate")}</p>}
        {Boolean(event.assistedChanges?.length) && <><strong>{t("log.assisted")}</strong><dl>{event.assistedChanges?.map(change => <div key={change.kcId}><dt>{knowledgeLabel(locale, KC_BY_ID.get(change.kcId) ?? change.kcId) ?? change.kcId}</dt><dd>{t("log.assistedStats", { attemptsBefore: change.before?.attempts ?? 0, attemptsAfter: change.after?.attempts ?? 0, correctBefore: change.before?.correct ?? 0, correctAfter: change.after?.correct ?? 0 })}</dd></div>)}</dl></>}
        {event.assessment && <div className="assessment-log"><p>{t("log.pending", { before: pendingLabel(event.assessment.before), after: pendingLabel(event.assessment.after), correctBefore: event.assessment.before.independentCorrect, correctAfter: event.assessment.after.independentCorrect })}</p>{event.assessment.eligibility && <p>{t(event.assessment.eligibility.eligible ? "log.eligible" : "log.ineligible")} {event.assessment.eligibility.remainingQuestions > 0 && t("log.remaining", { count: event.assessment.eligibility.remainingQuestions })} {event.assessment.eligibility.policy === "single-word-delayed" && t("log.oldPolicy")}</p>}</div>}
      </div>
    </details>)}
    {visible < log.events.length && <button type="button" className="text-button" onClick={() => setVisible(value => value + 30)}>{t("log.earlier")}</button>}
  </section>;
}

function PendingRetests({ assessment, queue = "all", onAdd, onMove, onReview }: { assessment: AssessmentState; queue?: "all" | "challenge"; onAdd?: (key: string) => Promise<void>; onMove?: (key: string) => Promise<void>; onReview?: (course: ModeId) => void }) {
  const { locale, t } = useI18n();
  const pending = Object.values(assessment.pending).filter(entry => queue === "all" || isChallengeRetest(entry)).sort((a, b) => a.createdOrdinal - b.createdOrdinal);
  const suspended = Object.values(assessment.suspendedPending ?? {}).filter(entry => queue === "all" || isChallengeRetest(entry));
  return <section className="pending-retests" aria-label={t("retest.aria")}>
    <p>{t("retest.policy")}</p>
    {!pending.length && <p>{t("retest.empty")}</p>}
    {suspended.length > 0 && <details><summary>{t("retest.suspended", { count: suspended.length })}</summary><p>{t("retest.suspendedText")}</p>{suspended.map(entry => <p key={entry.key}>{entry.target.surface} · {entry.target.form ? formLabel(locale, entry.target.form as Form) : t("practice.class.category")}</p>)}</details>}
    {pending.map(entry => {
      const group = ASSESSMENT_CATALOG.get(entry.key);
      const candidate = group?.exercises.find((value: Exercise) => ![entry.lastWordKey, entry.lastPresentedWordKey].includes(assessmentTarget(value).wordKey)) ?? group?.exercises[0];
      const singleWord = group?.words.size === 1;
      const status = candidate ? retestStatus(entry, candidate, { originalCount: assessment.originalCount, singleWord }) : null;
      const courseTitle = localizeCourse(COURSES.find(value => value.id === entry.courseId), locale)?.title ?? entry.courseId;
      const className = candidate?.item.class ? localizedClassLabel(candidate.item.class as PracticeClass, locale) : t("practice.class.category");
      return <article key={entry.key}><h3>{entry.target.form ? formLabel(locale, entry.target.form as Form) : t("retest.class", { className })} · {courseTitle}</h3><p>{t("retest.location", { place: t(isChallengeRetest(entry) ? "retest.challengePlace" : "retest.practicePlace") })} {isChallengeRetest(entry) && t("retest.noAuto")}</p><p>{t("retest.trigger")} <FuriganaText surface={entry.target.surface} reading={entry.target.reading} /></p><p>{status?.eligible ? t("retest.eligible") : status?.remainingQuestions ? t("retest.remaining", { count: status.remainingQuestions }) : t("retest.waiting")}</p>{isChallengeRetest(entry) && Boolean(status?.remainingQuestions) && <p>{t("retest.mix")}</p>}{singleWord && <p>{t("retest.single")}</p>}{isChallengeRetest(entry) && <div className="retest-actions">{onReview && <button type="button" className="text-button" onClick={() => onReview(entry.courseId as ModeId)}>{t("retest.continue")}</button>}{onAdd && <button type="button" className="text-button" onClick={() => onAdd(entry.key)}>{t("retest.add")}</button>}</div>}{isPracticeRetest(entry) && onMove && <button type="button" className="text-button" onClick={() => onMove(entry.key)}>{t("retest.challengeOnly")}</button>}</article>;
    })}
  </section>;
}

function SemanticDetails({ semantics }: { semantics: FormSemantics | null }) {
  const { t } = useI18n();
  if (!semantics) return null;
  return <dl className="semantic-details" aria-label={t("practice.semantics.aria")}>
    <div className="semantic-core"><dt>{t("practice.semantics.meaning")}</dt><dd>{semantics.coreMeaning}</dd></div>
    {semantics.register && <div><dt>{t("practice.semantics.register")}</dt><dd>{semantics.register}</dd></div>}
    {semantics.usageNote && <div><dt>{t("practice.semantics.note")}</dt><dd>{semantics.usageNote}</dd></div>}
    {semantics.contrast && <div><dt>{t("practice.semantics.contrast")}</dt><dd>{semantics.contrast}</dd></div>}
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
  ["誘う", "さそう", "邀请", "godan"], ["雇う", "やとう", "雇用", "godan"], ["扱う", "あつかう", "对待", "godan"], ["疑う", "うたがう", "怀疑", "godan"], ["嫌う", "きらう", "讨厌", "godan"], ["からかう", "からかう", "取笑", "godan"], ["祝う", "いわう", "庆祝", "godan"], ["追う", "おう", "追赶", "godan"],
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



// Legacy registries retain historical KC definitions; only KNOWLEDGE.exercises
// is the current reviewed teaching catalog used by the scheduler.
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
  components: KnowledgeComponent[]; exercises: Exercise[]; registryExercises: Exercise[]; courseKcIds: Record<ModeId, string[]>;
};
export const ALL_KCS = KNOWLEDGE.components;
const GATING_KCS = ALL_KCS.filter(kc => kc.gating);
const KC_BY_ID = new Map(ALL_KCS.map(kc => [kc.id, kc]));
const INITIAL_KC_IDS = [GATING_KCS[0].id];
const ASSESSMENT_CATALOG = assessmentCatalog(KNOWLEDGE.exercises);
const importOptions = () => ({ today: todayKey(), components: ALL_KCS, legacyComponents: [...VERB_KNOWLEDGE.components, ...ADJECTIVE_KNOWLEDGE.components], exercises: KNOWLEDGE.exercises });
const kcsOf = (courseId: ModeId) => (KNOWLEDGE.courseKcIds[courseId] ?? []).map(id => KC_BY_ID.get(id)).filter((kc): kc is KnowledgeComponent => Boolean(kc));
const PRACTICE_PLANNER = createPracticePlanner(KNOWLEDGE);
const CHALLENGE_PLANNER = createChallengePlanner(KNOWLEDGE);
const CHALLENGE_COURSE_IDS = COURSES.filter(c => CHALLENGE_PLANNER.hasCourse(c.id)).map(c => c.id);
type AssignedQuestion = {item: KnowledgeComponent; candidate: Exercise; challengeRetest?: boolean};
function challengeRound(courseId: ModeId, questions: AssignedQuestion[]) {
  const items = [...new Map(questions.map(q => [q.item.id, q.item])).values()];
  return {focus: items[0] ?? null, review: false, goalCourseId: courseId, globalRecovery: false, available: items, plan: questions.map(q => q.item)};
}
function emptyProfile(): Profile {
  const profile = { version: 8 as const, curriculumVersion: CURRICULUM_VERSION, date: todayKey(), attempted: 0, correct: 0, streak: 0,
    introducedKcIds: [...INITIAL_KC_IDS], rotation: 0, byKc: {}, assessment: emptyAssessment(), accessibleCourseIds: [],
    coursePractice: {}, recentWordKeys: [], practiceLog: emptyPracticeLog(), legacy: null, migration: null, statistics: emptyStatistics() };
  profile.statistics.progressStart = statisticsSnapshot(profile, { ...KNOWLEDGE, courses: COURSES });
  return profile;
}
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
function verificationFor(mode: PracticeMode, profile: Profile, seed = 0, courseId: string | null = null) {
  return planRetestQuestion(profile, mode, { exercises: KNOWLEDGE.exercises, components: ALL_KCS, courses: COURSES, courseKcIds: KNOWLEDGE.courseKcIds, seed, courseId });
}

const browserStorage = () => window.localStorage;
function loadProfile(raw: string | null): { profile: Profile; migrated: boolean; invalid: boolean; original?: string | null; correctionNotice?: string } {
  const fresh = activateReadyKcs(emptyProfile());
  let original = raw;
  try {
    const legacyV4 = raw ? null : readPreference(browserStorage, LEGACY_V7_STORAGE_KEY) ?? readPreference(browserStorage, LEGACY_STORAGE_KEY) ?? readPreference(browserStorage, LEGACY_V5_STORAGE_KEY) ?? readPreference(browserStorage, LEGACY_PROFILE_KEY_V4);
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

function initialUiLocale() {
  if (typeof window === "undefined") return "zh-CN";
  let storage: Storage | null = null;
  try { storage = window.localStorage; }
  catch { storage = null; }
  const chooseLocale = detectLocale as unknown as (options: { pathname?: string; preference?: string | null; languages?: readonly string[]; fallbackLocale?: string }) => string;
  return chooseLocale({
    pathname: window.location.pathname,
    preference: readLocalePreference(storage),
    languages: navigator.languages,
  });
}

export default function Home() {
  const [locale, setLocale] = useState(initialUiLocale);
  useEffect(() => {
    const syncLocaleFromHistory = () => {
      const pathLocale = localeFromPath(window.location.pathname);
      if (pathLocale) setLocale(pathLocale);
    };
    addEventListener("popstate", syncLocaleFromHistory);
    return () => removeEventListener("popstate", syncLocaleFromHistory);
  }, []);
  const changeLocale = useCallback((nextLocale: string) => {
    if (nextLocale === locale) return;
    let storage: Storage | null = null;
    try { storage = window.localStorage; }
    catch { storage = null; }
    writeLocalePreference(nextLocale, storage);
    const pathname = localizedPath(window.location.pathname, nextLocale);
    window.history.pushState(null, "", `${pathname}${window.location.search}${window.location.hash}`);
    setLocale(nextLocale);
  }, [locale]);
  return <I18nProvider locale={locale} catalogs={SITE_CATALOGS}><HomeContent locale={locale} onLocaleChange={changeLocale} /></I18nProvider>;
}

function HomeContent({ locale, onLocaleChange }: { locale: string; onLocaleChange: (locale: string) => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const localizedCourses = useMemo(() => localizeCourses(COURSES, locale) as Course[], [locale]);
  const localizedCourseById = useMemo(() => new Map(localizedCourses.map(course => [course.id, course])), [localizedCourses]);
  const localizedStages = useMemo(() => localizeCourseStages(COURSE_STAGES, locale), [locale]);
  const [englishUsageCards, setEnglishUsageCards] = useState<{ status: "idle" | "loading" | "ready" | "error"; lookup: typeof usageCardFor | null }>({ status: "idle", lookup: null });
  const [englishUsageRetry, setEnglishUsageRetry] = useState(0);
  useEffect(() => {
    if (locale !== "en") return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setEnglishUsageCards(current => current.lookup ? current : { status: "loading", lookup: null });
      try {
        const lookup = await loadLocalizedUsageCardLookup(USAGE_CARDS, usageCardFor, locale);
        if (active) setEnglishUsageCards(current => current.lookup === lookup ? current : { status: "ready", lookup });
      } catch {
        if (active) setEnglishUsageCards({ status: "error", lookup: null });
      }
    });
    return () => { active = false; };
  }, [locale, englishUsageRetry]);
  const englishUsageLoading = locale === "en" && englishUsageCards.status !== "ready";
  const localizedUsageCardFor = locale === "zh-CN" ? usageCardFor : englishUsageCards.lookup ?? (() => null);
  const [mode, setMode] = useState<PracticeMode>("adaptive");
  const [temporarilySkippedCourseId, setTemporarilySkippedCourseId] = useState<ModeId | null>(null);
  const [challengeQuestions, setChallengeQuestions] = useState<AssignedQuestion[] | null>(null);
  const challenging = challengeQuestions !== null;
  const [challengePosition, setChallengePosition] = useState(0);
  const [showChallengeSelection, setShowChallengeSelection] = useState(() => typeof window !== "undefined" && window.location.hash === "#/challenge");
  const [selectedChallengeCourses, setSelectedChallengeCourses] = useState<ModeId[]>([]);
  const [activeChallengeCourses, setActiveChallengeCourses] = useState<ModeId[]>([]);
  const navigationHandler = useRef<(() => void) | null>(null);
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
  const [unlocked, setUnlocked] = useState<{ courseId: ModeId; kcId: string } | null>(null);
  const [typoNotice, setTypoNotice] = useState(false);
  const [inputNotice, setInputNotice] = useState<string | null>(null);
  const [probesDone, setProbesDone] = useState(false);
  const [probeResults, setProbeResults] = useState<DiagnosticStepResult[]>([]);
  const [probeExtraCount, setProbeExtraCount] = useState(0);
  const [diagnosticMessage, setDiagnosticMessage] = useState<string | null>(null);
  const [diagnosticDescriptor, setDiagnosticDescriptor] = useState<{ messageKey: string; params?: DiagnosticParams } | null>(null);
  const [confirmedKcIds, setConfirmedKcIds] = useState<string[]>([]);
  const [diagnosticKcId, setDiagnosticKcId] = useState<string | null>(null);
  const [acceptedVariant, setAcceptedVariant] = useState<AnswerVariant | null>(null);
  const [independentResult, setIndependentResult] = useState(true);
  const [migrationNotice, setMigrationNotice] = useState(false);
  const [correctionNotice, setCorrectionNotice] = useState<string | null>(null);
  const [showStatistics, setShowStatistics] = useState(() => typeof window !== "undefined" && window.location.hash === "#/stats");
  const [principlesSection, setPrinciplesSection] = useState<string | null>(() => typeof window !== "undefined" ? principlesSectionFromHash(window.location.hash) : null);
  const showPrinciples = principlesSection !== null;
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressView, setProgressView] = useState<"course" | "atomic" | "pending" | "log">("course");
  const [transferNotice, setTransferNotice] = useState<{ kind: "success" | "error"; key: string; text?: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const questionCardRef = useRef<HTMLElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const progressTriggerRef = useRef<HTMLButtonElement>(null);
  const progressCloseRef = useRef<HTMLButtonElement>(null);
  const startedAt = useRef(0);
  const [statisticsClock] = useState(() => createStatisticsClock());
  const timingWrite = useRef<Promise<boolean> | null>(null);
  const waitForTiming = useCallback(async () => { if (timingWrite.current) await timingWrite.current; }, []);
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
  const [storageNotice, setStorageNotice] = useState<{ key: string } | null>(null);
  const blockedRef = useRef(false);
  const savingRef = useRef(false);
  const gradedRef = useRef(false);
  const roundQuestions = useMemo(() => {
    if (challengeQuestions) return challengeQuestions;
    const assigned = PRACTICE_PLANNER.assign(roundState, planningProfile, { seed, usedKeys: usedQuestionKeys, usedWordKeys,
      restrictCourseId: temporarilySkippedCourseId ? goalCourseId : null }) as { item: KnowledgeComponent; candidate: Exercise }[];
    if (verification?.exercise) {
      const candidate = verification.exercise as Exercise;
      const focusId = [...candidate.kcIds].reverse().find(id => KC_BY_ID.get(id)?.gating) ?? candidate.kcIds[0];
      assigned[0] = { item: KC_BY_ID.get(focusId) ?? assigned[0]?.item ?? ALL_KCS[0], candidate };
    }
    return assigned;
  }, [planningProfile, roundState, seed, usedQuestionKeys, usedWordKeys, verification, challengeQuestions, temporarilySkippedCourseId, goalCourseId]);
  const currentQuestion = roundQuestions[questionIndex];
  const targetKc = currentQuestion?.item ?? focusKc ?? ALL_KCS.find((kc) => kc.gating) ?? GATING_KCS[0];
  const exercise = currentQuestion?.candidate ?? PRACTICE_PLANNER.candidatesFor(targetKc, planningProfile, goalCourseId ?? targetKc.firstCourseId)[0] ?? KNOWLEDGE.exercises[0];
  const course = COURSES[exercise.courseIndex];
  const displayCourse = localizedCourseById.get(course.id) ?? course;
  const item = exercise.item;
  const activeVerification = verification?.exercise?.id === exercise.id ? verification : null;
  const practiceDomain = item.domain;
  const form = exercise.form;
  const englishUsageUnavailable = englishUsageLoading && Boolean(form);
  const targetLabel = form
    ? item.domain === "adjective" && locale === "zh-CN"
      ? adjectiveTargetLabel(item, form)
      : item.domain === "adjective" && form === "adjectiveBa" && item.class === "i"
        ? "i-adjective ば-conditional"
        : formLabel(locale, form) ?? form
    : displayCourse.title;
  const sourceCourse = sourceForForm(item.domain, form);
  const sourceUrl = exercise.sourceUrl ?? sourceCourse?.url ?? course.url;
  const localizedSourceUrl = locale === "en" ? englishYokubiUrl(sourceUrl) : sourceUrl;
  const sourceLesson = sourceCourse?.lesson ?? displayCourse.lesson;
  const displaySourceCourse = { lesson: locale === "en" && sourceLesson === "复习" ? "Review" : sourceLesson, url: localizedSourceUrl };
  const formSemantics = (form ? localizedSemanticsForForm(form, locale) : null) as FormSemantics | null;
  const derivation = deriveFor(item, form);
  const usageCard = localizedUsageCardFor(item, form);
  const itemMeaning = lexicalMeaningFor(`${item.domain}:${item.surface}:${item.reading}`, locale) ?? (locale === "zh-CN" ? item.meaning : "");
  const unattributed = result === "incorrect" && diagnosticKcId === null && Boolean(form);
  const diagnosticAnalysis = useMemo(() => unattributed && form ? createAnswerAnalyzer(item, form)(answer) : null, [unattributed, item, form, answer]);
  const diagnosticSteps = (diagnosticAnalysis?.steps ?? []) as DiagnosticStep[];
  const recognizedForms = diagnosticAnalysis && 'recognizedForms' in diagnosticAnalysis
    ? diagnosticAnalysis.recognizedForms ?? [] : [];
  const recognizedIdentification = recognizedFormsIdentificationMessage(item, recognizedForms, targetLabel);
  const originalFormIdentification = recognizedIdentification
    ? formatDiagnosticMessage(recognizedIdentification.messageKey, recognizedIdentification.params, locale) : null;
  const probing = diagnosticSteps.length > 0 && !probesDone;
  useEffect(() => {
    if (!result || finished || progressOpen || showStatistics || showChallengeSelection || showPrinciples || englishUsageUnavailable) return;
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
  }, [result, probing, finished, progressOpen, showStatistics, showChallengeSelection, showPrinciples, englishUsageUnavailable]);

  useEffect(() => {
    if (loading || showStatistics || progressOpen || showChallengeSelection || showPrinciples || englishUsageUnavailable) return;
    const frame = requestAnimationFrame(() => {
      const card = questionCardRef.current;
      if (card && card.getBoundingClientRect().top < 12) card.scrollIntoView?.({block:'start',behavior:'auto'});
      inputRef.current?.focus({preventScroll:true});
    });
    return () => cancelAnimationFrame(frame);
  }, [exercise.id, questionIndex, seed, loading, showStatistics, progressOpen, showChallengeSelection, showPrinciples, englishUsageUnavailable]);

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
    const remembered = readPreference(browserStorage, CHALLENGE_PREFERENCE_KEY) ?? readPreference(browserStorage, LEGACY_CHALLENGE_PREFERENCE_KEY);
    const challengeIds = normalizeChallengeCourses(remembered, CHALLENGE_COURSE_IDS) as ModeId[];
    const challengeId = challengeIds[0];
    const position = loaded.profile.rotation * SESSION_LENGTH;
    const firstChallenge = challengeId ? CHALLENGE_PLANNER.nextQuestion(challengeIds, loaded.profile, {seed: 1, position}) as AssignedQuestion | null : null;
    const challenge = firstChallenge ? [firstChallenge] : null;
    const next = challengeId && challenge?.length ? challengeRound(challengeId, challenge) : makePlan("adaptive", loaded.profile, SESSION_LENGTH);
    const frame = requestAnimationFrame(() => {
      setProfile(loaded.profile); setPlanningProfile(loaded.profile); setVerification(challengeId && challenge?.length ? null : verificationFor("adaptive", loaded.profile));
      if (challengeId && challenge?.length) {
        setChallengePosition(position); setMode(challengeId); setChallengeQuestions(challenge); setSelectedChallengeCourses(challengeIds); setActiveChallengeCourses(challengeIds);
        if (!window.location.hash) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/challenge/play`);
      } else if (window.location.hash === '#/challenge/play') {
        setShowChallengeSelection(true); window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/challenge`);
      }
      setRoundState(next); setMigrationNotice(loaded.migrated); setCorrectionNotice(loaded.correctionNotice ?? null); setLoading(false);
      if (snapshot.error) setStorageNotice({ key: "practice.notice.storageRead" });
      if (loaded.invalid) {
        blockedRef.current = true; setBlocked(true); setInvalidRaw(loaded.original ?? null);
        setStorageNotice({ key: "practice.notice.storageInvalid" });
      }
    });
    const externalChange = (event: StorageEvent) => {
      if (event.key === LEGACY_V7_STORAGE_KEY || event.key === LEGACY_STORAGE_KEY || event.key === LEGACY_V5_STORAGE_KEY) { setStorageNotice({ key: "practice.notice.storageLegacy" }); }
      if ((event.key === STORAGE_KEY || event.key === null) && store.isExternalChange(event.key === null ? null : event.newValue)) {
        blockedRef.current = true; setBlocked(true); setProgressOpen(false);
        setStorageNotice({ key: "practice.notice.storageConflict" });
      }
    };
    addEventListener("storage", externalChange);
    return () => { cancelAnimationFrame(frame); removeEventListener("storage", externalChange); };
  }, [store]);
  useEffect(() => { if (!progressOpen) return; const oldOverflow = document.body.style.overflow; const progressTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : progressTriggerRef.current; document.body.style.overflow = "hidden"; progressCloseRef.current?.focus(); const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setProgressOpen(false); }; addEventListener("keydown", closeOnEscape); return () => { document.body.style.overflow = oldOverflow; removeEventListener("keydown", closeOnEscape); progressTrigger?.focus(); }; }, [progressOpen]);
  const save = useCallback(async (next: Profile, { quiet = false, replace = false } = {}) => {
    if (!quiet) await waitForTiming();
    if (blockedRef.current || savingRef.current) return false;
    if (!quiet) { savingRef.current = true; setSaving(true); }
    const fragments = replace ? [] : statisticsClock.drain();
    next = { ...next, statistics: recordActiveTime(next.statistics, fragments) };
    try {
      const status = await store.save(next);
      if (status === "conflict" || blockedRef.current) {
        statisticsClock.restore(fragments);
        blockedRef.current = true; setBlocked(true); setProgressOpen(false);
        setStorageNotice({ key: "practice.notice.saveConflict" });
        return false;
      }
      if (replace) statisticsClock.reset();
      profileRef.current = next; setProfile(next);
      setStorageNotice(status === "unsaved" ? { key: "practice.notice.saveFailed" } : null);
      return true;
    } finally { if (!quiet) { savingRef.current = false; setSaving(false); } }
  }, [store, statisticsClock, waitForTiming]);
  const flushTiming = useCallback(async () => {
    if (loading || blockedRef.current || savingRef.current || timingWrite.current || statisticsClock.pending() < 1) return;
    const job = save(profileRef.current, { quiet: true }); timingWrite.current = job;
    try { await job; } finally { timingWrite.current = null; }
  }, [loading, save, statisticsClock]);
  useEffect(() => {
    const update = () => statisticsClock.setContext({ enabled: !loading && !englishUsageUnavailable && !blocked && !finished && !showStatistics && !progressOpen && !showChallengeSelection && !showPrinciples && !document.hidden && document.hasFocus(), answering: !result && !gradedRef.current, domain: item.domain, courseId: course.id });
    const presence = () => { update(); if (document.hidden || !document.hasFocus()) void flushTiming(); };
    const hide = () => { statisticsClock.setContext({ enabled: false }); void flushTiming(); };
    const interaction = () => statisticsClock.touch();
    update();
    for (const event of ['keydown', 'pointerdown', 'pointermove', 'scroll']) window.addEventListener(event, interaction, { passive: true });
    for (const event of ['focus', 'blur', 'pageshow']) window.addEventListener(event, presence);
    window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', presence);
    const interval = window.setInterval(() => void flushTiming(), STATISTICS_FLUSH_MS);
    return () => {
      window.clearInterval(interval);
      for (const event of ['keydown', 'pointerdown', 'pointermove', 'scroll']) window.removeEventListener(event, interaction);
      for (const event of ['focus', 'blur', 'pageshow']) window.removeEventListener(event, presence);
      window.removeEventListener('pagehide', hide);
      document.removeEventListener('visibilitychange', presence);
    };
  }, [loading, englishUsageUnavailable, blocked, finished, showStatistics, progressOpen, showChallengeSelection, showPrinciples, result, item.domain, course.id, statisticsClock, flushTiming]);
  useLayoutEffect(() => {
    navigationHandler.current = () => {
      const hash = window.location.hash;
      const section = principlesSectionFromHash(hash);
      if (hash === '#/stats' || hash === '#/challenge' || section !== null) statisticsClock.setContext({enabled: false});
      void flushTiming();
      if (hash === '#/challenge/play' && !challenging) { navigateView('challenge', true); return; }
      if (!['#/stats', '#/challenge', '#/challenge/play'].includes(hash) && section === null && challenging) applyRound('adaptive', profileRef.current);
      setShowStatistics(hash === '#/stats'); setShowChallengeSelection(hash === '#/challenge');
      setPrinciplesSection(section);
    };
  });
  useEffect(() => {
    const changed = () => navigationHandler.current?.();
    window.addEventListener('hashchange', changed); window.addEventListener('popstate', changed);
    return () => { window.removeEventListener('hashchange', changed); window.removeEventListener('popstate', changed); };
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    const title = t(showPrinciples ? "shell.title.principles" : showStatistics ? "shell.title.statistics" : showChallengeSelection || challenging ? "shell.title.challenge" : "shell.title.practice");
    const description = t("shell.description");
    document.title = title;
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", description);
    const localizedHref = document.querySelector<HTMLLinkElement>(`link[rel="alternate"][hreflang="${locale}"]`)?.href;
    const defaultHref = document.querySelector<HTMLLinkElement>('link[rel="alternate"][hreflang="x-default"]')?.href;
    if (localizedHref) document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute("href", localizedHref);
    const setMeta = (selector: string, content: string) => document.querySelector<HTMLMetaElement>(selector)?.setAttribute("content", content);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:locale"]', locale === "en" ? "en_US" : "zh_CN");
    if (localizedHref) setMeta('meta[property="og:url"]', localizedHref);
    if (defaultHref) {
      const image = new URL(locale === "en" ? "og-en.png" : "og.png", defaultHref).href;
      setMeta('meta[property="og:image"]', image);
      setMeta('meta[name="twitter:image"]', image);
    }
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);
    if (loading) return;
    if (showPrinciples) {
      const target = document.getElementById(principlesSection ? `principles-${principlesSection}` : 'principles-title');
      target?.focus({preventScroll: true});
      (principlesSection ? target : document.querySelector<HTMLElement>('.topbar'))?.scrollIntoView?.({block: 'start'});
      return;
    }
    if (showStatistics) document.getElementById('statistics-title')?.focus({preventScroll: true});
    else if (showChallengeSelection) document.getElementById('challenge-title')?.focus({preventScroll: true});
    document.querySelector<HTMLElement>('.topbar')?.scrollIntoView?.({block: 'start'});
  }, [showStatistics, showChallengeSelection, challenging, loading, showPrinciples, principlesSection, locale, t]);
  function navigateView(view: 'practice' | 'stats' | 'challenge' | 'challenge-play' | 'principles', replace = false) {
    if (view === 'stats' || view === 'challenge' || view === 'principles') statisticsClock.setContext({enabled: false});
    void flushTiming();
    const hash = view === 'practice' ? '' : view === 'challenge-play' ? '#/challenge/play' : `#/${view}`;
    if (window.location.hash !== hash) {
      const url = `${window.location.pathname}${window.location.search}${hash}`;
      if (replace) window.history.replaceState(null, '', url); else window.history.pushState(null, '', url);
    }
    setShowStatistics(view === 'stats'); setShowChallengeSelection(view === 'challenge');
    setPrinciplesSection(view === 'principles' ? '' : null);
  }
  function openPrinciples(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigateView('principles');
  }
  function navigateStatistics(show: boolean) { navigateView(show ? 'stats' : challenging ? 'challenge-play' : 'practice'); }
  function goPractice() { if (challenging) void start('adaptive'); else navigateView('practice'); }
  const resetQuestion = useCallback(() => { statisticsClock.resetAnswer(); gradedRef.current = false; loggedQuestionId.current = null; lexicalRetry.current = false; setIndependentResult(true); setAnswer(""); setProbesDone(false); setProbeResults([]); setProbeExtraCount(0); setTypoNotice(false); setInputNotice(null); setSelectedClass(null); setResult(null); setHint(emptyHintState()); setDiagnosticMessage(null); setDiagnosticDescriptor(null); setDiagnosticKcId(null); setConfirmedKcIds([]); setAcceptedVariant(null); startedAt.current = clockNow(); }, [statisticsClock, setAnswer, setAcceptedVariant, setDiagnosticKcId, setDiagnosticMessage, setHint, setResult, setSelectedClass]);

  function logTarget(step?: DiagnosticStep, attempt?: DiagnosticAttempt): LogTarget {
    return { surface: step?.surface ?? item.surface, reading: step?.reading ?? item.reading, form: step?.form ?? form,
      label: step?.kind === "classification" ? "动词类别" : step?.targetLabel ?? (step ? FORM_LABELS[step.form] : form ? targetLabel : "词类判断"),
      kind: step?.kind ?? (step ? "conjugation" : "question"), kcIds: step?.kcIds ?? derivation.requiredKcIds,
      answers: step?.answers ?? derivation.acceptedVariants, readings: step?.readings ?? deriveFor(readingItem, form).acceptedVariants,
      stepIndex: attempt?.index ?? null, totalSteps: attempt?.total ?? 0, nextTotalSteps: attempt?.nextTotal ?? 0 };
  }
  function withPracticeEvent(before: Profile, after: Profile, event: Omit<Parameters<typeof appendPracticeEvent>[2], "questionId" | "exercise" | "hintUsed">): Profile {
    loggedQuestionId.current ??= practiceEventId();
    const progress = challenging || ["typo", "invalid"].includes(event.outcome) ? after : { ...after, practiceGoalCourseId: goalCourseId ?? course.id };
    return appendPracticeEvent(before, progress, { ...event, mode: challenging ? "challenge" : "practice", questionId: loggedQuestionId.current, hintUsed: event.type === "hint" || hint.used,
      statistics: { ordinal: after.assessment.originalCount, day: localDay(), answerMs: event.type === "question" && ["correct", "incorrect", "revealed"].includes(event.outcome) ? statisticsClock.answerDuration() : null,
        progress: statisticsSnapshot(after, { ...KNOWLEDGE, courses: COURSES }), retestAttempt: Boolean((activeVerification && ["retest", "rehearsal"].includes(activeVerification.kind)) || challengeQuestions?.[questionIndex]?.challengeRetest) },
      exercise: { id: exercise.id, courseId: course.id, form, surface: item.surface, reading: item.reading, wordClass: item.class, domain: item.domain, ...(exercise.context ? { context: { ...exercise.context, reviewVersion: exercise.usageReviewVersion ?? 1 } } : {}) } },
    id => KC_BY_ID.get(id)?.label ?? id) as Profile;
  }
  async function recordQuestionRetry(outcome: string, message: string) {
    await waitForTiming();
    const current = profileRef.current;
    if (outcome === "typo") lexicalRetry.current = true;
    return save(withPracticeEvent(current, current, { type: "question", outcome, answer, target: logTarget(),
      support: { independent: false, source: outcome, provided: outcome === "typo" ? ["lexical-retry"] : [] }, diagnosis: { resolution: outcome, message } }));
  }

  async function showHint() {
    await waitForTiming();
    if (hint.shown) { setHint(toggleHint); return; }
    if (result || gradedRef.current || blockedRef.current || savingRef.current) return;
    const current = profileRef.current, id = practiceEventId(), at = new Date().toISOString();
    loggedQuestionId.current ??= practiceEventId();
    const observation = applyLearningObservation(current, exercise, { mode: challenging ? "challenge" : "practice", type: "hint", outcome: "shown", questionId: loggedQuestionId.current, eventId: id, at }, ASSESSMENT_CATALOG);
    if (observation.duplicate) return;
    const logged = withPracticeEvent(current, observation.profile as Profile, { id, at, type: "hint", outcome: "shown", answer: "", target: logTarget(),
      support: observation.support, assessmentKey: assessmentTarget(exercise).key, eligibility: observation.retest,
      diagnosis: { resolution: "hinted", messageKey: "practice.feedback.hintLogged", params: {}, message: "已查看提示，后续作答作为辅助练习；保留待独立复测，不增加题数或知识点成绩。" } });
    if (await save(logged)) setHint({ shown: true, used: true });
  }

  async function grade(correct: boolean, revealed = false, failedKcId: string | null = null, message: string | null = null, extraKcIds: string[] = [], confirmed: string[] = [], attempt: { answer?: string; resolution?: string; nextTotal?: number; messageKey?: string; params?: DiagnosticParams } = {}) {
    await waitForTiming();
    if (result || gradedRef.current || blockedRef.current || savingRef.current) return;
    gradedRef.current = true;
    statisticsClock.setContext({ answering: false });
    setTypoNotice(false);
    if (!correct && !revealed && !form) failedKcId ??= targetKc.id;
    if (revealed) { failedKcId = null; confirmed = []; }
    const old = profileRef.current.date === todayKey() ? profileRef.current : { ...profileRef.current, date: todayKey(), attempted: 0, correct: 0, streak: 0 };
    const outcome = revealed ? "revealed" : correct ? "correct" : "incorrect";
    const id = practiceEventId(), at = new Date().toISOString();
    loggedQuestionId.current ??= practiceEventId();
    const observation = applyLearningObservation(old, exercise, { mode: challenging ? "challenge" : "practice", type: "question", outcome, questionId: loggedQuestionId.current, eventId: id, at,
      kcIds: [...new Set([...derivation.requiredKcIds, ...extraKcIds])], focusId: targetKc.id, failedKcId, confirmedKcIds: confirmed, hintUsed: hint.used,
      lexicalRetry: lexicalRetry.current, responseMs: clockNow() - startedAt.current, answerLength: form ? conjugateFor(readingItem, form).length : item.reading.length }, ASSESSMENT_CATALOG);
    if (observation.duplicate) return;
    const diagnosisMessageKey = attempt.messageKey ?? (revealed ? "practice.feedback.answerRevealed" : correct ? "practice.feedback.answerCorrect" : failedKcId ? "practice.feedback.knownError" : "practice.feedback.unknownError");
    const nextProfile = { ...observation.profile, attempted: old.attempted + 1, correct: old.correct + (correct ? 1 : 0), streak: correct ? old.streak + 1 : 0,
      recentWordKeys: recordRecentWord(old.recentWordKeys, exercise), coursePractice: correct && observation.support.independent
        ? { ...old.coursePractice, [course.id]: [...new Set([...(old.coursePractice[course.id] ?? []), exerciseKey(exercise)])].slice(-12) } : old.coursePractice } as Profile;
    const logged = withPracticeEvent(profileRef.current, nextProfile, { id, at, type: "question", outcome, answer: attempt.answer ?? answer,
      support: observation.support, assessmentKey: assessmentTarget(exercise).key, eligibility: observation.retest,
      target: { ...logTarget(), kcIds: [...new Set([...derivation.requiredKcIds, ...extraKcIds])], nextTotalSteps: attempt.nextTotal ?? 0 },
      diagnosis: { kcId: failedKcId, confirmedKcIds: confirmed, resolution: attempt.resolution ?? (failedKcId ? "rule" : outcome),
        messageKey: diagnosisMessageKey, params: attempt.params ?? {},
        message: message ?? (revealed ? "查看答案，本题按未答对记录。" : correct ? "答案正确。" : failedKcId ? "已记录能确定的知识点错误。" : "本题记错，尚未确定具体知识点。") } });
    if (!await save(logged)) { gradedRef.current = false; return; }
    setIndependentResult(observation.support.independent);
    setDiagnosticMessage(message);
    setDiagnosticDescriptor({ messageKey: diagnosisMessageKey, params: attempt.params });
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
    const descriptor = analysis.feedback?.messageKey ? analysis.feedback : diagnosed?.messageKey ? diagnosed : null;
    return grade(false, false, diagnosed?.kcId ?? null, analysis.feedback?.message ?? diagnosed?.message?.replace(item.reading, item.surface) ?? null, [], diagnosed?.confirmedKcIds ?? [], { resolution: analysis.feedback?.resolution, nextTotal: analysis.steps.length, ...(descriptor?.messageKey ? { messageKey: descriptor.messageKey, params: descriptor.params ?? {} } : {}) });
  }
  async function saveStepEvidence(step: DiagnosticStep, correct: boolean, failedKcId: string | null, confirmed: string[], totalChange: number, attempt: DiagnosticAttempt) {
    await waitForTiming();
    const current = profileRef.current;
    const retry = attempt.outcome === "typo" || attempt.outcome === "invalid";
    const id = practiceEventId(), at = new Date().toISOString();
    loggedQuestionId.current ??= practiceEventId();
    const observation = applyLearningObservation(current, exercise, { mode: challenging ? "challenge" : "practice", type: "step", outcome: attempt.outcome, questionId: loggedQuestionId.current, eventId: id, at,
      step, failedKcId, confirmedKcIds: confirmed, hintUsed: hint.used }, ASSESSMENT_CATALOG);
    if (observation.duplicate) return false;
    const nextProfile = observation.profile as Profile;
    const stepMessageKey = attempt.messageKey ?? (step.diagnosticOnly ? "practice.diagnostic.classOnly" : correct ? "practice.diagnostic.stepCorrect" : "practice.diagnostic.stepWrong");
    const logged = withPracticeEvent(current, nextProfile, { id, at, type: "step", outcome: attempt.outcome, answer: attempt.answer, target: logTarget(step, attempt),
      support: observation.support, assessmentKey: assessmentTarget(exercise).key, eligibility: observation.retest,
      diagnosis: { kcId: failedKcId, confirmedKcIds: confirmed, resolution: attempt.resolution, messageKey: stepMessageKey, params: attempt.params ?? {},
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
    await waitForTiming();
    if (blockedRef.current || savingRef.current) return;
    if (mode === "adaptive") { const current = profileRef.current; const advanced = advanceIntroductions(ALL_KCS, current.introducedKcIds, current.byKc) as { introducedKcIds: string[]; added: KnowledgeComponent[] }; if (advanced.added.length) { if (!await save({ ...current, introducedKcIds: advanced.introducedKcIds })) return; const next = advanced.added.at(-1)!; setUnlocked({ courseId: COURSES[next.firstCourseIndex].id, kcId: next.id }); } }
    setFinished(true);
  }, [mode, save, waitForTiming]);
  const nextQuestion = useCallback(async () => {
    await waitForTiming();
    if (!gradedRef.current || blockedRef.current || savingRef.current || probing) return;
    const answeredCount = roundOffset + questionIndex + 1;
    if (challenging) {
      const current = profileRef.current;
      const recent = [...usedQuestionKeys, exerciseKey(roundQuestions[questionIndex].candidate)].slice(-CHALLENGE_RECENT_QUESTION_LIMIT);
      const position = challengePosition + 1;
      const next = CHALLENGE_PLANNER.nextQuestion(activeChallengeCourses, current, {position, seed: seed + 1, recentQuestionKeys: recent}) as AssignedQuestion | null;
      if (!next) return finishRound();
      setChallengePosition(position); setChallengeQuestions([next]); setUsedQuestionKeys(recent);
      setPlanningProfile(current); setRoundState(challengeRound(next.candidate.courseId, [next]));
      setRoundOffset(answeredCount); setQuestionIndex(0); setSeed(value => value + 1); resetQuestion(); return;
    }
    if (answeredCount >= SESSION_LENGTH) return finishRound();
    const current = profileRef.current;
    const pendingHere = Object.values(current.assessment.pending).some(pending => isPracticeRetest(pending)
      && (mode === "adaptive" || pending.courseId === mode)
      && (!temporarilySkippedCourseId || pending.courseId === goalCourseId));
    if (pendingHere || verification?.exercise) {
      const next = makePlan(mode, current, SESSION_LENGTH - answeredCount, goalCourseId);
      const consumed = [...new Set([...usedQuestionKeys, ...roundQuestions.slice(0, questionIndex + 1).map(({ candidate }) => exerciseKey(candidate))])];
      const consumedWords = [...usedWordKeys, ...roundQuestions.slice(0, questionIndex + 1).map(({ candidate }) => wordKey(candidate))];
      const nextVerification = verificationFor(mode, current, seed + 1, temporarilySkippedCourseId ? goalCourseId : null);
      // Legitimate retests and their question-count spacing can continue even
      // when this course has exhausted its distinct learning examples.
      if (!nextVerification?.exercise && !PRACTICE_PLANNER.assign(next, current, { seed: seed + 1, usedKeys: consumed, usedWordKeys: consumedWords,
        restrictCourseId: temporarilySkippedCourseId ? goalCourseId : null }).length) return finishRound();
      setUsedWordKeys(consumedWords);
      setPlanningProfile(current); setRoundState(next);
      setRoundOffset(answeredCount); setUsedQuestionKeys(consumed); setQuestionIndex(0);
      setVerification(nextVerification); setSeed(value => value + 1); resetQuestion();
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
        setUnlocked({ courseId: COURSES[introduced.firstCourseIndex].id, kcId: introduced.id });
      }
      const remaining = SESSION_LENGTH - answeredCount;
      const next = makePlan(mode, nextProfile, remaining, goalCourseId);
      if ((mode !== "adaptive" || next.goalCourseId === goalCourseId) && canContinueRound(focusKc, next, nextProfile.byKc, false)) {
        const consumed = [...new Set([...usedQuestionKeys, ...roundQuestions.slice(0, questionIndex + 1).map(({ candidate }) => exerciseKey(candidate))])];
        const consumedWords = [...usedWordKeys, ...roundQuestions.slice(0, questionIndex + 1).map(({ candidate }) => wordKey(candidate))];
        if (!PRACTICE_PLANNER.assign(next, nextProfile, { seed: seed + 1, usedKeys: consumed, usedWordKeys: consumedWords,
          restrictCourseId: temporarilySkippedCourseId ? goalCourseId : null }).length) return finishRound();
        setUsedWordKeys(consumedWords);
        setPlanningProfile(nextProfile); setRoundState(next); setRoundOffset(answeredCount); setUsedQuestionKeys(consumed); setQuestionIndex(0); setVerification(verificationFor(mode, nextProfile, seed + 1, temporarilySkippedCourseId ? goalCourseId : null)); setSeed((value) => value + 1); resetQuestion();
        return;
      }
      finishRound();
      return;
    }
    if (PRACTICE_PLANNER.needsRefreshAfterAnswer(roundState, planningProfile, current, roundQuestions, questionIndex)) {
      const next = makePlan(mode, current, SESSION_LENGTH - answeredCount, goalCourseId);
      if (mode === "adaptive" && next.goalCourseId !== goalCourseId) return finishRound();
      // Retain the existing 3:1 cadence when the main focus is unchanged.
      // Reassign only questions the learner has not yet seen, using fresh scores.
      const refreshed = next.focus?.id === focusKc?.id
        ? { ...next, plan: roundState.plan.slice(questionIndex + 1) } : next;
      const consumed = [...new Set([...usedQuestionKeys, ...roundQuestions.slice(0, questionIndex + 1).map(({ candidate }) => exerciseKey(candidate))])];
      const consumedWords = [...usedWordKeys, ...roundQuestions.slice(0, questionIndex + 1).map(({ candidate }) => wordKey(candidate))];
      if (!PRACTICE_PLANNER.assign(refreshed, current, { seed: seed + 1, usedKeys: consumed, usedWordKeys: consumedWords,
        restrictCourseId: temporarilySkippedCourseId ? goalCourseId : null }).length) return finishRound();
      setPlanningProfile(current); setRoundState(refreshed); setRoundOffset(answeredCount);
      setUsedQuestionKeys(consumed); setUsedWordKeys(consumedWords); setQuestionIndex(0);
      setVerification(null); setSeed(value => value + 1); resetQuestion();
      return;
    }
    if (questionIndex + 1 >= roundQuestions.length) return finishRound();
    setQuestionIndex((value) => value + 1);
    setVerification(null);
    resetQuestion();
  }, [finishRound, focusKc, goalCourseId, mode, probing, questionIndex, reviewRound, resetQuestion, roundOffset, roundQuestions, roundState, planningProfile, save, usedQuestionKeys, usedWordKeys, verification, seed, waitForTiming, challenging, challengePosition, activeChallengeCourses, temporarilySkippedCourseId]);
  const classChoices = useMemo(() => practiceDomain === "verb" ? ["ichidan", "godan", "irregular"] as PracticeClass[] : ["i", "na"] as PracticeClass[], [practiceDomain]);
  useLayoutEffect(() => {
    // Commit the new question/feedback state before it can receive input. The
    // native listener stays mounted instead of briefly retaining an old result
    // while passive effects catch up with a freshly rendered next button.
    keyboardHandler.current = (event: KeyboardEvent) => {
      if (progressOpen || showChallengeSelection || blocked || loading || englishUsageUnavailable || showStatistics || showPrinciples) return;
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
      if (target?.closest("input:not(:disabled),textarea,select,summary,[contenteditable='true']")) return;
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
  }, [blocked, classChoices, finished, form, loading, englishUsageUnavailable, nextQuestion, probing, progressOpen, result, showStatistics, showChallengeSelection, showPrinciples]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => keyboardHandler.current?.(event);
    addEventListener("keydown", handler);
    return () => removeEventListener("keydown", handler);
  }, []);
  async function finishDiagnosticPractice(outcome: "completed" | "skipped", answered: number, total: number) {
    await waitForTiming();
    const current = profileRef.current;
    const id = practiceEventId(), at = new Date().toISOString();
    loggedQuestionId.current ??= practiceEventId();
    const observation = applyLearningObservation(current, exercise, { mode: challenging ? "challenge" : "practice", type: "diagnostic-end", outcome, questionId: loggedQuestionId.current, eventId: id, at }, ASSESSMENT_CATALOG);
    if (observation.duplicate) return false;
    if (!await save(withPracticeEvent(current, observation.profile as Profile, { id, at, type: "diagnostic-end", outcome,
      support: observation.support, assessmentKey: assessmentTarget(exercise).key, eligibility: observation.retest,
      target: { ...logTarget(), kind: "summary", label: "拆步练习", totalSteps: total, nextTotalSteps: total },
      diagnosis: { messageKey: outcome === "completed" ? "practice.diagnostic.completedSummary" : "practice.diagnostic.skippedSummary", params: { answered, total }, message: `${outcome === "completed" ? "完成拆步" : "跳过剩余拆步"}，已作答 ${answered} / ${total} 步；原题结果保持不变。` } }))) return false;
    setProbesDone(true);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".next-button")?.focus());
    return true;
  }

  function applyRound(nextMode: PracticeMode, current: Profile, preferredCourseId: string | null = null, skippedCourseId: ModeId | null = null) {
    setChallengeQuestions(null); setChallengePosition(0); setShowChallengeSelection(false); setActiveChallengeCourses([]);
    writePreference(browserStorage, CHALLENGE_PREFERENCE_KEY, null);
    writePreference(browserStorage, LEGACY_CHALLENGE_PREFERENCE_KEY, null);
    if (window.location.hash.startsWith('#/challenge')) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    const next = makePlan(nextMode, current, SESSION_LENGTH, preferredCourseId);
    setPlanningProfile(current); setMode(nextMode); setRoundState(next); setTemporarilySkippedCourseId(skippedCourseId);
    setVerification(verificationFor(nextMode, current, seed + 1, skippedCourseId ? next.goalCourseId : null));
    setQuestionIndex(0); setRoundOffset(0); setUsedQuestionKeys([]); setUsedWordKeys([]); setSessionCorrect(0); setFinished(false); setUnlocked(null);
    setSeed((value) => value + 1); resetQuestion();
  }
  async function start(nextMode: PracticeMode) {
    await waitForTiming();
    if (nextMode !== "adaptive" && !summarizeUnifiedCourse(COURSES.find(c => c.id === nextMode)!, kcsOf(nextMode), profileRef.current.introducedKcIds, profileRef.current).unlocked) return;
    const current = activateReadyKcs({ ...profileRef.current, rotation: profileRef.current.rotation + 1 });
    if (await save(current)) { navigateView("practice"); applyRound(nextMode, current, nextMode === mode ? goalCourseId : null); }
  }
  async function skipToCourse(courseId: ModeId) {
    await waitForTiming();
    if (mode !== "adaptive" || challenging || (probing && !probesDone && !finished) || blockedRef.current || savingRef.current) return;
    if (!alternativeCourses.some(course => course.id === courseId)) return;
    const current = activateReadyKcs({ ...profileRef.current, rotation: profileRef.current.rotation + 1, practiceGoalCourseId: courseId });
    if (!await save(current)) return;
    applyRound("adaptive", current, courseId, goalCourseId as ModeId);
  }
  function openChallenge() {
    if (showChallengeSelection) return;
    if (challenging) setSelectedChallengeCourses([...activeChallengeCourses]);
    navigateView('challenge');
  }
  async function startChallenge(selection: ModeId | ModeId[]) {
    await waitForTiming();
    const ids = normalizeChallengeCourses(selection, CHALLENGE_COURSE_IDS) as ModeId[];
    if (blockedRef.current || savingRef.current || !ids.length) return;
    const current = {...profileRef.current, rotation: profileRef.current.rotation + 1};
    const position = current.rotation * SESSION_LENGTH;
    const first = CHALLENGE_PLANNER.nextQuestion(ids, current, {position, seed: seed + 1}) as AssignedQuestion | null;
    const questions = first ? [first] : [];
    if (!questions.length || !await save(current)) return;
    writePreference(browserStorage, CHALLENGE_PREFERENCE_KEY, JSON.stringify(ids));
    writePreference(browserStorage, LEGACY_CHALLENGE_PREFERENCE_KEY, null);
    setChallengePosition(position); setChallengeQuestions(questions); setSelectedChallengeCourses(ids); setActiveChallengeCourses(ids);
    setMode(ids[0]); setPlanningProfile(current); setRoundState(challengeRound(ids[0], questions));
    setVerification(null); setQuestionIndex(0); setRoundOffset(0); setUsedQuestionKeys([]); setUsedWordKeys([]);
    setSessionCorrect(0); setFinished(false); setUnlocked(null); setSeed(value => value + 1); resetQuestion();
    navigateView('challenge-play');
  }
  function changeCourseFilter(value: "all" | PracticeDomain) {
    setCourseFilter(value); writePreference(browserStorage, PRACTICE_DOMAIN_KEY, value);
  }
  async function moveRetestTask(key: string, queue: "practice" | "challenge") {
    await waitForTiming();
    if (blockedRef.current || savingRef.current) return;
    const before = profileRef.current, entry = before.assessment.pending[key];
    const assessment = moveRetestQueue(before.assessment, key, queue);
    if (!entry || assessment === before.assessment) return;
    const target = entry.target;
    const next = appendPracticeEvent(before, { ...before, assessment }, {
      type: "retest-transfer", outcome: "queued", mode: retestQueue(entry), questionId: entry.lastQuestionId,
      exercise: { id: "", courseId: entry.courseId, form: target.form, surface: target.surface, reading: target.reading, wordClass: "", domain: target.domain },
      target: { surface: target.surface, reading: target.reading, form: target.form, label: queue === "practice" ? "加入练习复测" : "仅在挑战中复测", kind: "retest-transfer", kcIds: [], answers: [], readings: [], stepIndex: null, totalSteps: 0, nextTotalSteps: 0 },
      assessmentKey: key, diagnosis: { resolution: "retest-transfer", messageKey: queue === "practice" ? "practice.feedback.retestMovedPractice" : "practice.feedback.retestMovedChallenge", params: {}, message: `已将此任务调整到${queue === "practice" ? "练习" : "自由挑战"}中复测；知识点成绩、作答次数和复测条件保持不变。` },
      statistics: { ordinal: before.assessment.originalCount, day: localDay(), progress: statisticsSnapshot({ ...before, assessment }, { ...KNOWLEDGE, courses: COURSES }) },
    }, id => KC_BY_ID.get(id)?.label ?? id) as Profile;
    await save(next);
  }

  const addChallengeRetest = (key: string) => moveRetestTask(key, "practice");
  const keepChallengeRetest = (key: string) => moveRetestTask(key, "challenge");

  async function resetProgress() {
    await waitForTiming();
    if (!window.confirm(t("practice.clearConfirm"))) return;
    const fresh = activateReadyKcs(emptyProfile());
    if (!await save(fresh, { replace: true })) return;
    for (const key of [LEGACY_V7_STORAGE_KEY, LEGACY_STORAGE_KEY, LEGACY_V5_STORAGE_KEY, LEGACY_PROFILE_KEY_V4, LEGACY_PROFILE_KEY_V3, LEGACY_PROFILE_KEY_V2, "katsuyo-practice-stats-v1"]) writePreference(browserStorage, key, null);
    applyRound("adaptive", fresh);
  }
  async function resetInvalidProgress() {
    await waitForTiming();
    if (!window.confirm(t("practice.clearInvalidConfirm"))) return;
    blockedRef.current = false;
    const fresh = activateReadyKcs(emptyProfile());
    if (!await save(fresh, { replace: true })) return;
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
  async function exportProgress() {
    await waitForTiming();
    await flushTiming();
    downloadProgress(JSON.stringify(createProfileExport(profileRef.current), null, 2), `katsuyo-dojo-progress-${todayKey()}.json`);
    setTransferNotice({ kind: "success", key: "practice.exportDone" });
  }
  async function importProgress(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = activateReadyKcs(parseProfileImport(JSON.parse(await file.text()), importOptions()) as Profile);
      if (!window.confirm(t("practice.importConfirm"))) return;
      if (!await save(imported, { replace: true })) return;
      applyRound("adaptive", imported);
      setTransferNotice({ kind: "success", key: "practice.importDone" });
    } catch (error) {
      setTransferNotice({ kind: "error", key: profileImportMessageKey(error), text: error instanceof Error ? error.message : undefined });
    }
  }

  const pendingRetests = Object.values(profile.assessment.pending);
  const practiceRetests = pendingRetests.filter(isPracticeRetest), challengeRetests = pendingRetests.filter(isChallengeRetest);
  const pendingInMode = pendingRetests.filter(entry => challenging ? isChallengeRetest(entry) && activeChallengeCourses.includes(entry.courseId as ModeId) : isPracticeRetest(entry) && (mode === "adaptive" || entry.courseId === mode));
  const challengeSummary = activeChallengeCourses.length > 1 ? t("practice.challengeSummary", { count: activeChallengeCourses.length }) : localizedCourseById.get(activeChallengeCourses[0])?.title ?? displayCourse.title;
  const currentPending = profile.assessment.pending[assessmentTarget(exercise).key];
  const pendingForCurrentMode = currentPending && retestQueue(currentPending) === (challenging ? "challenge" : "practice") ? currentPending : null;
  const shownFocusKc = activeVerification ? targetKc : focusKc;
  const focusPercent = Math.round((shownFocusKc ? componentConfidence(shownFocusKc, profile.byKc) : focusStats.confidence) * 100);
  const evidenceKcId = unattributed ? "" : diagnosticKcId ?? targetKc.id;
  const evidenceKc = KC_BY_ID.get(evidenceKcId);
  const currentPercent = Math.round((evidenceKc ? componentConfidence(evidenceKc, profile.byKc) : profile.byKc[evidenceKcId]?.confidence ?? 0) * 100);
  const introducedSet = new Set(profile.introducedKcIds);
  const activeKcs = ALL_KCS;
  const introducedKcs = profile.introducedKcIds.map((id) => KC_BY_ID.get(id)).filter((kc): kc is KnowledgeComponent => Boolean(kc));
  const masteredKcCount = GATING_KCS.filter((item) => isComponentMastered(item, profile.byKc)).length;
  const activeRouteComplete = practiceRetests.length === 0 && activeKcs.filter((kc) => kc.gating).every((kc) => isComponentMastered(kc, profile.byKc));
  const unfinishedReview = COURSES.find(value => {
    const summary = summarizeUnifiedCourse(value, kcsOf(value.id), profile.introducedKcIds, profile);
    return summary.unlocked && summary.mastered === summary.total && !summary.complete && summary.pendingCount === 0;
  });
  const visibleCourses = localizedCourses.filter(c => courseFilter === "all" || c.domain === courseFilter);
  const alternativeCourses = useMemo(() => {
    if (mode !== "adaptive" || challenging) return [];
    return COURSES.filter(candidate => {
      if (candidate.id === goalCourseId) return false;
      const summary = summarizeUnifiedCourse(candidate, kcsOf(candidate.id), profile.introducedKcIds, profile);
      if (!summary.unlocked || summary.mastered === summary.total) return false;
      const previewProfile = activateReadyKcs({ ...profile, rotation: profile.rotation + 1, practiceGoalCourseId: candidate.id });
      const preview = makePlan("adaptive", previewProfile, SESSION_LENGTH, candidate.id);
      return preview.goalCourseId === candidate.id && !!preview.focus
        && PRACTICE_PLANNER.assign(preview, previewProfile, { restrictCourseId: candidate.id }).length > 0;
    });
  }, [profile, goalCourseId, mode, challenging]);
  const goalCourse = COURSES.find(value => value.id === goalCourseId) ?? course;
  const displayGoalCourse = localizedCourseById.get(goalCourse.id) ?? goalCourse;
  const recovery = !challenging && !activeVerification && !reviewRound && focusKc && focusKc.firstCourseId !== goalCourse.id;
  const displayedCourse = activeVerification ? displayCourse : displayGoalCourse;
  const focusDisplayLabel = displayedCourse.title;
  // Preview the same profile and retained course that start(mode) will pass to
  // applyRound. The global minimum can belong to another, unfinished course.
  const nextRoundFocus = useMemo(() => {
    if (!finished || challenging) return null;
    const nextProfile = activateReadyKcs({ ...profile, rotation: profile.rotation + 1 });
    return makePlan(mode, nextProfile, SESSION_LENGTH, goalCourseId).focus;
  }, [finished, challenging, profile, mode, goalCourseId]);
  const nextRoundFocusCopy = nextRoundFocus ? focusCopyForLocale(nextRoundFocus, locale) : null;
  const nextRoundMissingCoverage = nextRoundFocus?.coverageKcIds.filter((id) => (profile.byKc[id]?.correct ?? 0) < 1).map((id) => knowledgeLabel(locale, KC_BY_ID.get(id) ?? id)).filter(Boolean) ?? [];
  const questionNumber = roundOffset + questionIndex + 1;
  const roundQuestionLimit = challenging ? roundQuestions.length : verification?.exercise || Object.values(planningProfile.assessment.pending).some(entry => isPracticeRetest(entry) && (mode === "adaptive" || entry.courseId === mode))
    ? SESSION_LENGTH : Math.min(SESSION_LENGTH, roundOffset + roundQuestions.length);
  const answeredInRound = challenging ? roundOffset + questionIndex + (result ? 1 : 0) : Math.min(roundOffset + questionIndex + (result ? 1 : 0), SESSION_LENGTH);
  const focusComplete = !challenging && Boolean(result && !pendingForCurrentMode && focusKc && isComponentMastered(focusKc, profile.byKc));
  const feedbackTitle = t(result === "correct" ? "practice.feedback.correct" : result === "revealed" ? "practice.feedback.revealed" : "practice.feedback.close");
  const probePracticedCount = new Set(probeResults.flatMap((step) => step.practicedKcIds)).size;
  const probeCorrectCount = probeResults.filter((step) => step.correct).length;
  const probeTotalCount = diagnosticSteps.length + probeExtraCount;
  const probeStatus = t(!probesDone ? "practice.probe.active" : probeResults.length === probeTotalCount ? "practice.probe.complete" : probeResults.length ? "practice.probe.partial" : "practice.probe.skipped");
  const probeSummary = diagnosticSteps.length > 0 && (probesDone || probeResults.length > 0)
    ? t("practice.probe.summary", { status: probeStatus, answered: probeResults.length, total: probeTotalCount, correct: probeCorrectCount, practice: probePracticedCount ? t("practice.probe.practiced", { count: probePracticedCount }) : t("practice.probe.recorded") })
    : null;
  const localizedDiagnosis = diagnosticDescriptor ? diagnosticDescriptor.messageKey.startsWith("diagnostics.")
    ? formatDiagnosticMessage(diagnosticDescriptor.messageKey, diagnosticDescriptor.params, locale)
    : t(diagnosticDescriptor.messageKey, diagnosticDescriptor.params) : null;
  const feedbackMessage = probeSummary ?? (result === "revealed" ? t("practice.answerFeedback.revealed") : result === "correct" && !independentResult ? t("practice.answerFeedback.assisted") : localizedDiagnosis ?? (locale === "zh-CN" && diagnosticMessage ? diagnosticMessage : unattributed ? t("practice.answerFeedback.unattributed") : locale === "zh-CN" ? detail.rule : t("practice.feedback.knownError")));
  const feedbackMeta = probeSummary
    ? t("practice.probe.meta", { status: probeStatus })
    : !independentResult ? t("practice.probe.assistedMeta") : pendingForCurrentMode ? t("practice.probe.pendingMeta") : t("practice.probe.independentMeta", { percent: currentPercent });
  const kcStatus = (kc: KnowledgeComponent) => {
    const stats = profile.byKc[kc.id] ?? emptySkillStats();
    const nonGatingParent = ALL_KCS.find(parent => parent.coverageKcIds.includes(kc.id))?.id ?? "exception.ru-godan";
    const active = kc.gating ? introducedSet.has(kc.id) : introducedSet.has(nonGatingParent) || stats.attempts > 0;
    if (kc.id.startsWith("facet.")) return t(!active ? "practice.kc.status.locked" : (stats.correct ?? 0) >= 1 ? "practice.kc.status.covered" : "practice.kc.status.needed");
    if (focusKc?.id === kc.id && active) return t("practice.kc.status.focus");
    if (!active && stats.attempts > 0) return t(isComponentMastered(kc, profile.byKc) ? "practice.kc.status.masteredLocked" : "practice.kc.status.previewed");
    if (!active) return t(kc.gating ? "practice.kc.status.locked" : "practice.kc.status.lexical");
    if (isComponentMastered(kc, profile.byKc)) return t("practice.kc.status.mastered");
    if (kc.masteryPrerequisites?.some(prerequisite => !isComponentMastered(prerequisite, profile.byKc))) return t("practice.kc.status.prerequisite");
    if (kc.coverageKcIds.some((id) => (profile.byKc[id]?.correct ?? 0) < 1)) return t("practice.kc.status.needed");
    if (stats.bestConfidence >= 1 || (kc.coverageOnly && kc.coverageKcIds.every((id) => (profile.byKc[id]?.correct ?? 0) > 0))) return t("practice.kc.status.strengthen");
    return stats.attempts === 0 ? t(profile.migration ? "practice.kc.status.confirm" : "practice.kc.status.unpracticed") : t("practice.kc.status.learning");
  };
  const renderKcRow = (kc: KnowledgeComponent, reused = false) => {
    const stats = profile.byKc[kc.id] ?? emptySkillStats();
    const percent = Math.round(componentConfidence(kc, profile.byKc) * 100);
    const isFocus = focusKc?.id === kc.id;
    const isLexical = kc.id.startsWith("lexeme.") || kc.id.startsWith("facet.");
    const isFacet = kc.id.startsWith("facet.");
    const coverage = kc.coverageKcIds.length ? `${kc.coverageKcIds.filter((id) => (profile.byKc[id]?.correct ?? 0) >= 1).length}/${kc.coverageKcIds.length}` : null;
    const prerequisiteLabels = kc.prerequisites.map((id) => knowledgeLabel(locale, KC_BY_ID.get(id) ?? id)).filter(Boolean);
    const localizedLabel = knowledgeLabel(locale, kc) ?? kc.id;
    const sourceCourseTitle = localizedCourseById.get(COURSES[kc.firstCourseIndex].id)?.title ?? COURSES[kc.firstCourseIndex].title;
    return <div className={`skill-progress-row ${isFocus ? "focus" : ""} ${isLexical ? "lexical" : ""}`} key={kc.id} data-kc-id={kc.id}>
      <div className="skill-progress-copy"><span>{localizedLabel}</span><small>{kc.id.startsWith("lexeme.") ? t("practice.kc.lexical") : kc.id.startsWith("facet.") ? t("practice.kc.facet") : ""}{kcStatus(kc)} · {t("progress.status.attempts", { count: stats.attempts })}{coverage ? t("practice.kc.coverage", { coverage }) : ""}{reused ? t("practice.kc.reused", { course: sourceCourseTitle }) : ""}{prerequisiteLabels.length ? t("practice.kc.prerequisites", { items: prerequisiteLabels.join(locale === "en" ? ", " : "、") }) : ""}</small>{profile.assessment.assistedByKc[kc.id] && <small>{t("practice.kc.assisted", { attempts: profile.assessment.assistedByKc[kc.id].attempts, correct: profile.assessment.assistedByKc[kc.id].correct })}</small>}{profile.assessment.migration?.baselineByKc?.[kc.id] && <small>{t("practice.kc.historical")}</small>}</div>
      <div className="skill-progress-value"><div><span style={{ width: `${isFacet ? stats.correct >= 1 ? 100 : 0 : percent}%` }} /></div><b>{isFacet ? stats.correct >= 1 ? "✓" : "—" : `${percent}%`}</b></div>
    </div>;
  };
  const renderCoverageGroup = (group: { component: KnowledgeComponent; coverage: KnowledgeComponent[] }, courseId?: ModeId) => (
    <div className="knowledge-coverage-group" key={group.component.id} data-coverage-parent={group.component.id}>
      {renderKcRow(group.component, Boolean(courseId && group.component.firstCourseId !== courseId))}
      {group.coverage.length > 0 && <div className="knowledge-coverage-children" role="group" aria-label={t("practice.kc.groupAria", { label: knowledgeLabel(locale, group.component) ?? group.component.id })}>
        {group.coverage.map(kc => renderKcRow(kc, Boolean(courseId && kc.firstCourseId !== courseId)))}
      </div>}
    </div>
  );
  const knowledgeGroups = groupKnowledgeCoverage(activeKcs);
  const courseSummary = (item: Course) => {
    const required = kcsOf(item.id).filter((kc) => kc.gating);
    return summarizeUnifiedCourse(item, required, introducedSet, profile);
  };
  const courseSwitch = mode === "adaptive" && alternativeCourses.length > 0 && <details className="course-switch">
    <summary>{t("practice.courseSwitch.title")}</summary>
    <p>{t("practice.courseSwitch.text")}</p>
    <div>{alternativeCourses.map(candidate => <button type="button" key={candidate.id} onClick={() => void skipToCourse(candidate.id)}>{t("practice.courseSwitch.action", { course: localizedCourseById.get(candidate.id)?.title ?? candidate.title })}</button>)}</div>
  </details>;
  const showEnglishUsageGate = englishUsageUnavailable && !showStatistics && !showChallengeSelection && !showPrinciples;

  return <main className="site-shell" lang={locale}>
    {storageNotice && <div className="storage-notice" role="alert"><p>{t(storageNotice.key)}</p><button type="button" onClick={exportProgress}>{t("practice.notice.exportPage")}</button>{invalidRaw !== null && <><button type="button" onClick={() => downloadProgress(invalidRaw, `katsuyo-dojo-original-${todayKey()}.json`)}>{t("practice.notice.exportOriginal")}</button><button type="button" disabled={saving} onClick={resetInvalidProgress}>{t("practice.notice.clearInvalid")}</button></>}{blocked && <button type="button" onClick={() => window.location.reload()}>{t("practice.notice.reload")}</button>}</div>}
    {loading && <p role="status">{t("practice.loading")}</p>}
    <fieldset className="practice-controls" disabled={loading || saving || blocked} aria-busy={loading || saving}>
    <header className="topbar"><button className="brand" type="button" onClick={() => showStatistics || showPrinciples ? navigateStatistics(false) : start("adaptive")}><span className="brand-mark" aria-hidden="true"><span className="brand-glyph">活</span></span><span><strong lang="ja">活用道場</strong><small>KATSUYŌ PRACTICE</small></span></button><div className="topbar-actions"><nav className="main-view-nav" aria-label={t("shell.navAria")}><button type="button" aria-current={!showStatistics && !showPrinciples && !showChallengeSelection && !challenging ? "page" : undefined} onClick={goPractice}>{t("shell.nav.practice")}</button><button type="button" aria-current={showStatistics ? "page" : undefined} onClick={() => navigateStatistics(true)}>{t("shell.nav.statistics")}</button><button type="button" aria-current={!showStatistics && !showPrinciples && (showChallengeSelection || challenging) ? "page" : undefined} onClick={openChallenge}>{t("shell.nav.challenge")}</button><a href="#/principles" aria-current={showPrinciples ? "page" : undefined} onClick={openPrinciples}>{t("shell.nav.principles")}</a></nav><LanguageSwitch locale={locale} label={t("shell.language")} onChange={onLocaleChange} /><div className="daily-summary"><div><span>{t("shell.today")}</span><strong>{profile.correct} / {profile.attempted}</strong></div><div><span>{t("shell.streak")}</span><strong>{profile.streak}</strong></div></div><a className="github-link" href="https://github.com/L-M-Sherlock/katsuyo-dojo" target="_blank" rel="noopener noreferrer" aria-label={t("shell.sourceCode")}>GitHub <span aria-hidden="true">↗</span></a></div></header>
    {showPrinciples && !loading && <PrinciplesPage locale={locale} section={principlesSection ?? ""} onBack={() => navigateView(challenging ? "challenge-play" : "practice")} backLabel={challenging ? t("practice.backChallenge") : t("practice.backPractice")} />}
    {showStatistics && !loading && <StatisticsPage locale={locale} t={t} profile={profile} model={KNOWLEDGE} courses={COURSES} courseLabel={(value: Course) => localizedCourseById.get(value.id)?.title ?? value.title} knowledgeLabel={(value: KnowledgeComponent) => knowledgeLabel(locale, value) ?? value.id} backLabel={challenging ? t("practice.backChallenge") : t("practice.back")} onBack={() => navigateStatistics(false)} onKnowledge={() => { setProgressView("course"); setProgressOpen(true); }} />}
    {showEnglishUsageGate && <section className="usage-content-gate" role={englishUsageCards.status === "error" ? "alert" : "status"} aria-live="polite"><p>{t(englishUsageCards.status === "error" ? "practice.usageLoad.error" : "practice.usageLoad.loading")}</p>{englishUsageCards.status === "error" && <button type="button" onClick={() => setEnglishUsageRetry(value => value + 1)}>{t("practice.usageLoad.retry")}</button>}</section>}
    <div hidden={showStatistics || showChallengeSelection || showPrinciples || showEnglishUsageGate} inert={showStatistics || showChallengeSelection || showPrinciples || showEnglishUsageGate}><section className={`practice-layout ${challenging ? "challenge-layout" : ""}`}>{!challenging && <aside className="lesson-rail"><p className="eyebrow">{t("practice.rail.eyebrow")}</p><h1>{t("practice.rail.title")}</h1><p className="intro">{t("practice.rail.intro")}</p>
      <div className="domain-switch" role="tablist" aria-label={t("practice.rail.filter")}>{(["all", "verb", "adjective"] as const).map(value => <button type="button" role="tab" key={value} aria-selected={courseFilter === value} className={courseFilter === value ? "active" : ""} onClick={() => changeCourseFilter(value)}>{t(value === "all" ? "practice.rail.all" : value === "verb" ? "practice.rail.verbs" : "practice.rail.adjectives")}</button>)}</div>
      <p className="answer-note">{t("practice.rail.filter")}</p>
      <button type="button" className={`adaptive-entry ${mode === "adaptive" ? "active" : ""}`} onClick={() => start("adaptive")}><span className="adaptive-icon" aria-hidden="true"><span className="adaptive-glyph">自</span></span><span><strong>{t("practice.rail.adaptive")}</strong><small>{challenging ? t("practice.adaptiveContinue") : <>{t(mode === "adaptive" ? "practice.currentCourse" : "practice.currentSpecial")} · <span className="current-course-name">{focusDisplayLabel}</span></>}</small><small>{challenging ? t("practice.adaptiveRoute") : pendingInMode.length ? t("practice.pendingRetests", { count: pendingInMode.length }) : t("practice.mastery")}</small></span><b>{challenging ? t("practice.status.continue") : `${focusPercent}%`}</b></button>
      <button type="button" className={`challenge-entry ${challenging ? "active" : ""}`} onClick={openChallenge}><strong>{t("practice.rail.challenge")}</strong><span>{challenging ? challengeSummary : t("practice.rail.challengeDetail")}</span></button>
      <button ref={progressTriggerRef} type="button" className="progress-trigger" onClick={() => setProgressOpen(true)} aria-haspopup="dialog"><span><b>{t("practice.rail.progress")}</b><small>{t("practice.rail.progressDetail")}</small></span><strong>{masteredKcCount}<i>/</i>{GATING_KCS.length}</strong></button>
      <nav className="mode-list" aria-label={t("practice.rail.filter")}>{visibleCourses.map((item) => { const canonical = COURSES.find(value => value.id === item.id)!; const summary = courseSummary(canonical); const status = !summary.unlocked ? t("practice.status.locked") : summary.mastered === summary.total ? t("practice.status.mastered") : t("practice.status.score", { mastered: summary.mastered, total: summary.total }); return <button type="button" className={!challenging && mode === item.id ? "active" : ""} disabled={!summary.unlocked} onClick={() => start(item.id)} key={item.id} title={item.description}><span>{item.order !== undefined ? item.order + 1 : (item as Course & { lessonLabel?: string }).lessonLabel ?? item.lesson}</span><span className="course-name"><small>{item.stageLabel}</small>{item.title}</span><i>{status}</i></button>; })}</nav>

      <button type="button" className="reset-progress" onClick={resetProgress}>{t("practice.rail.reset")}</button>
    </aside>}<section className="exercise-stage">{challenging && <h1 className="sr-only">{t("practice.challenge.srTitle")}</h1>}{correctionNotice && <div className="migration-notice" role="status"><p><strong>{t("practice.notice.correctedTitle")}</strong><span>{locale === "zh-CN" ? correctionNotice : t("practice.notice.retained")}</span></p><button type="button" onClick={() => setCorrectionNotice(null)} aria-label={t("practice.notice.closeCorrection")}>{t("practice.notice.confirm")}</button></div>}{migrationNotice && <div className="migration-notice" role="status"><p><strong>{t("practice.notice.enabledTitle")}</strong><span>{t("practice.notice.enabled")} {profile.assessment.migration ? t("practice.notice.migrated", { changes: profile.assessment.migration.changes.length, pending: pendingRetests.length }) : t("practice.notice.retained")}</span></p><button type="button" onClick={() => setMigrationNotice(false)} aria-label={t("practice.notice.closeMigration")}>{t("practice.notice.confirm")}</button></div>}{!finished ? <><div className={`stage-meta${challenging ? " challenge-stage-meta" : ""}`}><span>{t("practice.question.number", { current: questionNumber })}{!challenging && <> / {roundQuestionLimit}</>}</span>{challenging ? <span className="challenge-count">{t("practice.question.challengeCount", { answered: answeredInRound, correct: sessionCorrect })}</span> : <div className="progress-track"><span style={{ width: `${questionNumber / Math.max(roundQuestionLimit, 1) * 100}%` }} /></div>}<button type="button" className="quiet-button" onClick={finishRound}>{t(challenging ? "practice.question.endChallenge" : "practice.question.endRound")}</button></div>
      {!probing && courseSwitch}
      {challenging && <div className="practice-notice challenge-notice"><strong>{t("practice.challenge.banner", { course: displayCourse.title })}</strong><span>{activeChallengeCourses.length > 1 ? t("practice.challenge.selected", { count: activeChallengeCourses.length }) : t("practice.challenge.current")}</span><button type="button" onClick={openChallenge}>{t("practice.challenge.change")}</button><button type="button" onClick={() => start("adaptive")}>{t("practice.challenge.adaptive")}</button></div>}
      {!challenging && (activeVerification || recovery || reviewRound) && <p className="practice-notice">
        <strong>{t(activeVerification?.kind === 'retest' ? 'practice.verification.retest' : activeVerification?.kind === 'rehearsal' ? 'practice.verification.rehearsal' : activeVerification?.kind === 'spacing' ? 'practice.verification.spacing' : recovery ? 'practice.verification.recovery' : 'practice.verification.review')}</strong>
        {t(activeVerification?.kind === 'retest' ? 'practice.verification.retestText' : activeVerification?.kind === 'rehearsal' ? 'practice.verification.rehearsalText' : activeVerification?.kind === 'spacing' ? 'practice.verification.spacingText' : recovery ? roundState.globalRecovery ? 'practice.verification.recoveryGlobal' : 'practice.verification.recoveryLocal' : 'practice.verification.reviewText')}{recovery && course.id !== goalCourse.id ? ` ${t("practice.verification.source", { course: displayCourse.title })}` : ''}
      </p>}
      <article ref={questionCardRef} className={`exercise-card${result ? " has-result" : ""}`} data-form={form ?? ""} key={`${exercise.id}-${questionIndex}-${seed}`}><div className="question-kicker"><span>Yokubi · L{displaySourceCourse?.lesson ?? displayCourse.lesson}</span><span>{targetLabel}</span>{result && <span>{knowledgeFamilyLabel(locale, targetKc.family)} · {knowledgeLabel(locale, targetKc)}</span>}</div><p className="instruction">{form ? <>{t("practice.question.transform", { kind: t(practiceDomain === "verb" ? "practice.question.verb" : "practice.question.adjective") })} <strong>{targetLabel}</strong></> : t("practice.question.classify", { kind: t(practiceDomain === "verb" ? "practice.question.verb" : "practice.question.adjective") })}</p>{formSemantics && <p className="semantic-brief"><span>{t("practice.question.purpose")}</span><span>{formSemantics.concise}</span></p>}<div className="word-display"><FuriganaText surface={item.surface} reading={item.reading} family="display" forceRuby /><span className="word-meaning">{itemMeaning}</span></div>
      {usageCard && (!result || probing) && <UsageCardView card={usageCard} locale={locale} t={t} />}
      {!form ? <div className={`class-options ${classChoices.length === 2 ? "two-options" : ""}`}>{classChoices.map((choice, index) => <button type="button" key={choice} disabled={Boolean(result)} data-class-shortcut={String(index + 1)} aria-keyshortcuts={String(index + 1)} className={`${selectedClass === choice ? "selected" : ""} ${result && choice === item.class ? "choice-correct" : ""} ${selectedClass === choice && result === "incorrect" ? "choice-wrong" : ""}`} onClick={() => chooseClass(choice)}><small>{t(`practice.question.classDetail.${choice}`)}</small><strong>{localizedClassLabel(choice, locale)}</strong><kbd aria-hidden="true">{index + 1}</kbd></button>)}</div> : <form onSubmit={submit}><label htmlFor="answer">{t("practice.question.answer")}</label><div className={`answer-row ${result ?? ""}`}><input ref={inputRef} id="answer" lang="ja" onKeyDown={(event) => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault(); }} autoComplete="off" disabled={Boolean(result)} value={answer} aria-describedby={typoNotice ? "typo-notice" : undefined} onChange={(e) => { setAnswer(e.target.value); setTypoNotice(false); setInputNotice(null); }} placeholder={t("practice.question.placeholder")} /><button type="submit" disabled={!answer.trim() || Boolean(result)}>{t("practice.question.check")}</button></div><p className="answer-note">{t("practice.question.answerNote")}</p>{inputNotice && <p className="hint-box" role="status">{locale === "zh-CN" ? inputNotice : t("practice.diagnostic.invalid")}</p>}{typoNotice && <p id="typo-notice" className="hint-box" role="status">{t("practice.question.typo")}</p>}</form>}
      {!result && <div className="assist-row"><button type="button" className="text-button" onClick={showHint}>{t(hintShown ? "practice.question.hideHint" : "practice.question.showHint")}</button><button type="button" className="text-button" onClick={() => grade(false, true)}>{t("practice.question.dontKnow")}</button></div>}{hintShown && !result && <p className="hint-box">{locale === "zh-CN" ? hintFor(item, form) : t(item.domain === "adjective" ? "practice.hint.adjective" : item.class === "irregular" ? "practice.hint.irregular" : !form && item.surface.endsWith("る") ? "practice.hint.ru" : "practice.hint.ending")}</p>}
      {result && <div ref={feedbackRef} className={`feedback ${result}`} role="status"><div className="feedback-copy"><strong>{feedbackTitle}</strong>{probeSummary && originalFormIdentification && <p className="original-form-identification">{originalFormIdentification}</p>}<p className="feedback-summary">{feedbackMessage}</p></div>{challenging && currentPending && <div className="challenge-retest-action"><p>{t(isChallengeRetest(currentPending) ? "practice.feedback.challengePending" : "practice.feedback.practicePending")}</p>{isChallengeRetest(currentPending) && <button type="button" className="text-button" onClick={() => addChallengeRetest(currentPending.key)}>{t("practice.feedback.addPractice")}</button>}</div>}<div className="knowledge-tags" aria-label={t("practice.feedback.knowledgeAria")}>{derivation.requiredKcIds.map((id: string) => KC_BY_ID.get(id)).filter((kc: KnowledgeComponent | undefined): kc is KnowledgeComponent => Boolean(kc)).map((kc: KnowledgeComponent) => <span className={kc.id === evidenceKcId ? "target" : confirmedKcIds.includes(kc.id) ? "confirmed" : ""} key={kc.id}>{confirmedKcIds.includes(kc.id) && t("practice.feedback.confirmed")}{knowledgeFamilyLabel(locale, kc.family)} · {knowledgeLabel(locale, kc)}</span>)}</div>{confirmedKcIds.length > 0 && <p className="partial-evidence-note">{t(independentResult ? "practice.feedback.independentPartial" : "practice.feedback.assistedPartial")}</p>}{probing && <DiagnosticPractice key={`${exercise.id}-${questionIndex}-${seed}`} item={item} goalLabel={targetLabel} active={!showStatistics && !showChallengeSelection && !showPrinciples} steps={diagnosticSteps} onEvidence={saveStepEvidence} onDone={finishDiagnosticPractice} />}<div hidden={probing}><div className="rule-line"><span><FuriganaText family="serif" surface={item.surface} reading={item.reading} /></span><b>→</b>{!form ? <span className="answer-emphasis">{localizedClassLabel(item.class, locale)}</span> : acceptedVariant ? <span className="answer-emphasis"><FuriganaText family="serif" surface={acceptedVariant.surface} reading={acceptedVariant.reading} /></span> : detailSteps ? detailSteps.map((step: string, i: number) => <Fragment key={`${step}-${i}`}><span className={i === detailSteps.length - 1 ? "answer-emphasis" : ""}><FuriganaText family="serif" surface={step} reading={readingSteps?.[i] ?? step} /></span>{i < detailSteps.length - 1 && <b>→</b>}</Fragment>) : detail.parts.map((part: string, i: number) => <span className={i === detail.parts.length - 1 ? "answer-emphasis" : ""} key={`${part}-${i}`}><FuriganaText family="serif" surface={part} reading={readingParts[i] ?? part} />{i < detail.parts.length - 1 && <b className="joiner">＋</b>}</span>)}</div>{acceptedVariant && form && <p className="accepted-variant-note">{locale === "zh-CN" && acceptedVariant.note && <span>{acceptedVariant.note}</span>}<span>{t(form === "causativePassive" || form.startsWith("causativePassive") ? "practice.feedback.fullForm" : "practice.feedback.defaultForm")} <FuriganaText family="serif" surface={detail.answer} reading={readingDetail?.answer ?? detail.answer} /></span></p>}{result === "incorrect" && form && <p className="your-answer">{t("practice.feedback.yourAnswer")} <span lang="ja">{answer || "—"}</span></p>}{usageCard && !probing && <UsageCardView card={usageCard} revealed locale={locale} t={t} />}<SemanticDetails semantics={formSemantics} /></div><div className="feedback-meta"><span>{feedbackMeta}</span><a href={locale === "en" ? displaySourceCourse?.url ?? displayCourse.url : exercise.sourceUrl ?? course.url} target="_blank" rel="noreferrer">{t("practice.feedback.reference")}</a></div><button type="button" className="next-button" hidden={probing} disabled={probing} onClick={nextQuestion}>{t(probing ? "practice.feedback.finishSteps" : !challenging && questionNumber === roundQuestionLimit && !focusComplete ? "practice.feedback.roundResult" : focusComplete ? "practice.feedback.continue" : "practice.feedback.next")}{!probing && <span><kbd>Enter</kbd> →</span>}</button></div>}{!result && <p className="keyboard-hint">{!form ? <>{classChoices.map((_, index) => <Fragment key={index}><kbd>{index + 1}</kbd>{" "}</Fragment>)}{t("practice.question.choose")}</> : <><kbd>Enter</kbd> {t("practice.question.enterCheck")}</>}</p>}</article></> :
      challenging ? <article className="completion-card"><p className="completion-jp" lang="ja">{t("practice.completion.jp")}</p><span className="completion-label">{t("practice.challenge.ended")}</span>{answeredInRound > 0 && <div className="score"><strong>{sessionCorrect}</strong><span>/ {answeredInRound}</span></div>}<p>{challengeSummary}</p><p>{t("practice.challenge.saved")}</p><button type="button" className="restart-button" onClick={() => startChallenge(activeChallengeCourses)}>{t(activeChallengeCourses.length > 1 ? "practice.challenge.continueSelected" : "practice.challenge.continueCourse")}<span><kbd>Enter</kbd> →</span></button><button type="button" className="back-adaptive" onClick={openChallenge}>{t("practice.challenge.changeCourses")}</button><button type="button" className="back-adaptive" onClick={() => start("adaptive")}>{t("practice.challenge.adaptiveTraining")}</button></article> :
      <article className="completion-card">
        <p className="completion-jp" lang="ja">{t("practice.completion.jp")}</p>
        <span className="completion-label">{t("practice.completion.round")}</span>
        {answeredInRound > 0 && <div className="score"><strong>{sessionCorrect}</strong><span>/ {answeredInRound}</span></div>}
        <p>{pendingInMode.length ? t("practice.completion.pending", { count: pendingInMode.length }) : unlocked ? t("practice.completion.unlocked", { item: `${localizedCourseById.get(unlocked.courseId)?.title ?? unlocked.courseId} · ${knowledgeLabel(locale, KC_BY_ID.get(unlocked.kcId) ?? unlocked.kcId)}` }) : mode === "adaptive" && activeRouteComplete ? unfinishedReview ? t("practice.completion.review", { course: localizedCourseById.get(unfinishedReview.id)?.title ?? unfinishedReview.title }) : t("practice.completion.allComplete") : t(mode === "adaptive" ? "practice.completion.adaptive" : "practice.completion.special")}</p>
        <div className="completion-focus">
          <span>{t("practice.completion.nextFocus")}</span>
          <strong>{nextRoundFocusCopy?.title ?? (nextRoundFocus ? knowledgeLabel(locale, nextRoundFocus) : null) ?? t("practice.completion.allMastered")}</strong>
          {nextRoundFocusCopy && <p>{nextRoundFocusCopy.detail}</p>}
          {nextRoundMissingCoverage.length > 0 && <small>{t("practice.completion.missing", { items: nextRoundMissingCoverage.join(locale === "en" ? ", " : "、") })}</small>}
        </div>
        {courseSwitch}
        <button type="button" className="restart-button" onClick={() => start(mode)}>{t(mode === "adaptive" ? "practice.completion.nextRound" : "practice.completion.nextSpecial")}<span><kbd>Enter</kbd> →</span></button>
        {mode !== "adaptive" && <button type="button" className="back-adaptive" onClick={() => start("adaptive")}>{t("practice.completion.adaptiveTraining")}</button>}
      </article>}
      <footer className="source-note"><a href="#/principles" onClick={openPrinciples}>{t("practice.source.principles")}</a> · {t("practice.source.curriculum")} <a href={locale === "en" ? "https://yoku.bi/" : CHINESE_YOKUBI_URL} target="_blank" rel="noreferrer">{t("practice.source.yokubi")}</a> · {t("practice.source.adaptive")} <a href="https://l-m-sherlock.github.io/kanabr/" target="_blank" rel="noopener noreferrer">kanabr</a> · {t("practice.source.local")} · CC BY 4.0</footer></section></section></div>
    {progressOpen && <div className="progress-overlay"><button type="button" className="progress-backdrop" onClick={() => setProgressOpen(false)} aria-label={t("progress.closeAria")} /><section className="progress-drawer" role="dialog" aria-modal="true" aria-labelledby="progress-title"><header><div><p>LEARNING PROFILE · UNIFIED</p><h2 id="progress-title">{t("progress.title")}</h2></div><button ref={progressCloseRef} type="button" onClick={() => setProgressOpen(false)} aria-label={t("progress.closeAria")}>{t("progress.close")} <kbd>Esc</kbd></button></header><div className="progress-summary"><div><span>{t("progress.mastered")}</span><strong>{masteredKcCount}</strong></div><div><span>{t("progress.unlocked")}</span><strong>{introducedKcs.length}</strong></div><p>{t("progress.summary", { practice: practiceRetests.length, challenge: challengeRetests.length })}</p>{profile.assessment.migration && <p>{t("progress.migration", { count: profile.assessment.migration.changes.length })}</p>}</div><section className="profile-transfer" aria-labelledby="profile-transfer-title"><div><h3 id="profile-transfer-title">{t("progress.transferTitle")}</h3><p>{t("progress.transferText")}</p></div><div className="transfer-actions"><button type="button" onClick={exportProgress}>{t("progress.export")}</button><button type="button" onClick={() => importInputRef.current?.click()}>{t("progress.import")}</button><input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={importProgress} /></div>{transferNotice && <p className={`transfer-notice ${transferNotice.kind}`} role="status">{locale === "zh-CN" && transferNotice.text ? transferNotice.text : t(transferNotice.key)}</p>}</section><details className="curriculum-guide"><summary>{t("progress.guideTitle")}</summary><p><strong>{t("progress.groupingLabel")}</strong> {t("progress.grouping")}</p><p><strong>{t("progress.orderingLabel")}</strong> {t("progress.ordering")}</p><p><strong>{t("progress.unlockingLabel")}</strong> {t("progress.unlocking")}</p><ol>{localizedStages.map((stage) => <li key={stage.id}><strong>{stage.label}</strong><span>{stage.objective}</span></li>)}</ol><p>{t("progress.guideEnd")}</p></details><div className="progress-view-tabs" role="tablist" aria-label={t("progress.tabsAria")}><button type="button" role="tab" aria-selected={progressView === "course"} className={progressView === "course" ? "active" : ""} onClick={() => setProgressView("course")}>{t("progress.courses")}</button><button type="button" role="tab" aria-selected={progressView === "atomic"} className={progressView === "atomic" ? "active" : ""} onClick={() => setProgressView("atomic")}>{t("progress.knowledge")}</button><button type="button" role="tab" aria-selected={progressView === "pending"} className={progressView === "pending" ? "active" : ""} onClick={() => setProgressView("pending")}>{t("progress.pending", { count: pendingRetests.length })}</button><button type="button" role="tab" aria-selected={progressView === "log"} className={progressView === "log" ? "active" : ""} onClick={() => setProgressView("log")}>{t("progress.log")}</button></div>
      {progressView === "pending" ? <PendingRetests assessment={profile.assessment} onAdd={addChallengeRetest} onMove={keepChallengeRetest} onReview={id => { setProgressOpen(false); void startChallenge(id); }} /> : progressView === "log" ? <PracticeLogView log={profile.practiceLog} /> : progressView === "course" ? <div className="course-progress-list">{visibleCourses.map((item) => { const summary = courseSummary(COURSES.find(value => value.id === item.id)!); const isFocusCourse = focusKc?.firstCourseId === item.id; const status = !summary.unlocked ? t("progress.status.locked") : summary.mastered === summary.total ? t("progress.status.mastered") : t("progress.status.score", { mastered: summary.mastered, total: summary.total }); return <details key={item.id} open={isFocusCourse}><summary><span><small>{item.order !== undefined ? item.order + 1 : item.lesson}</small><b>{item.title}</b></span><span>{status}<i aria-hidden="true">⌄</i></span></summary><p className="course-objective"><strong>{item.stageLabel}</strong> · {item.description ?? item.stageObjective}</p><div className="skill-progress-list">{groupKnowledgeCoverage(summary.required, ALL_KCS).map(group => renderCoverageGroup(group, item.id))}</div></details>; })}</div> : <div className="course-progress-list atomic-progress-list">{Object.keys(KC_FAMILY_LABELS).map((family) => { const groups = knowledgeGroups.filter(group => group.component.family === family); const components = groups.flatMap(group => [group.component, ...group.coverage]); if (!components.length) return null; return <details key={family} open={components.some((kc) => kc.id === focusKc?.id)}><summary><span><small>{components.filter((kc) => kc.gating && introducedSet.has(kc.id)).length}/{components.filter((kc) => kc.gating).length}</small><b>{knowledgeFamilyLabel(locale, family)}</b></span><span>{t("progress.items", { count: components.length })}<i aria-hidden="true">⌄</i></span></summary><div className="skill-progress-list">{groups.map(group => renderCoverageGroup(group))}</div></details>; })}</div>}
      </section></div>}
    {showChallengeSelection && !loading && <LocalizedChallengeSelection locale={locale} t={t} courses={COURSES.filter(c => CHALLENGE_PLANNER.hasCourse(c.id))} stages={COURSE_STAGES}
      courseLabel={(value: Course) => localizedCourseById.get(value.id)?.title ?? value.title} stageLabel={(value: { id: string; label: string }) => localizedStages.find(stage => stage.id === value.id)?.label ?? value.label}
      selected={selectedChallengeCourses} onChange={setSelectedChallengeCourses}
      retests={challengeRetests.length > 0 ? <details className="challenge-pending"><summary>{t("practice.challenge.pending", { count: challengeRetests.length })}</summary><PendingRetests assessment={profile.assessment} queue="challenge" onAdd={addChallengeRetest} onReview={id => void startChallenge(id)} /></details> : null}
      onStart={() => startChallenge(selectedChallengeCourses)} onHighest={() => startChallenge(HIGHEST_CHALLENGE_COURSE as ModeId)}
      onBack={() => navigateView(challenging ? 'challenge-play' : 'practice')} backLabel={challenging ? t("practice.backChallenge") : t("practice.backPractice")} />}
  </fieldset></main>;
}
