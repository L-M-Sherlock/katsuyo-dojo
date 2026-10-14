import { defineCatalog } from './catalogs.mjs';
import { createI18n } from './core.mjs';
import { DEFAULT_LOCALE, normalizeLocale } from './locales.mjs';
import { formLabel } from './content-forms.mjs';
import { knowledgeLabel } from './content-knowledge.mjs';

const zhCN = {
  'diagnostics.composite': '{parts}',
  'diagnostics.legacy.rule': '已定位到具体规则。',
  'diagnostics.legacy.targetForm': '答案对应另一种形式。',
  'diagnostics.legacy.stage': '差异位于一个构形阶段。',
  'diagnostics.legacy.mixed': '答案中有多处差异。',
  'diagnostics.legacy.partial': '只能确认答案中的部分结构。',
  'diagnostics.legacy.stagePriority': '先检查已定位的构形阶段。',
  'diagnostics.answer.invalid.empty': '请输入答案后再检查。',
  'diagnostics.answer.invalid.tooLong': '输入过长，请只填写活用后的词形（最多 256 个字符）。',
  'diagnostics.answer.invalid.stepAhead': '你已写出后续步骤的正确形式。本步只需填写当前要求的中间形式，请调整后重交；不记知识点错误。',
  'diagnostics.answer.classification.incorrect': '词类判断有误，请对照正确类别及分类依据。',
  'diagnostics.feedback.observation.stemFallback': '词尾变化的位置写成了「{written}」，需要先核对这一步的完整形式。',
  'diagnostics.feedback.observation.stemRule': '词干位置写成了「{written}」，这里需要{ruleLabel}。',
  'diagnostics.feedback.observation.negativePastIncomplete': '末尾仍是「ない」，尚未完成过去变化。',
  'diagnostics.feedback.observation.ambiguousEnding': '给定的前部仍可辨认，但后面的变化不能唯一对应某条规则。',
  'diagnostics.feedback.observation.unresolved': '输入与给定形式的前部或接续有差异，缺少足够完整的片段来判断具体错因。',
  'diagnostics.feedback.tail.withSteps': '本次不更新未确认的知识点；下面只检查尚未确认的变化。',
  'diagnostics.feedback.tail.step': '本步不更新掌握度，可对照本步正确形式查看差异，然后继续。',
  'diagnostics.feedback.tail.question': '本题已记错，知识点不扣分；请对照变化解析核对输入。',
  'diagnostics.feedback.composite': '{observations}{tail}',
  'diagnostics.continuation.classConflict': '已定位到「{familyLabel}」的过去变化，但还不能区分词类判断与变化规则。先确认词类，再按给定词类检查变化；本次尚未更新知识点。',
  'diagnostics.continuation.classification.note.tearu': '本步判断中间形式末尾「ある」的类别，不判断原词，也不计入独立掌握度。',
  'diagnostics.continuation.classification.note.default': '这里只确认中间形式的类别，不计入知识点统计。',
  'diagnostics.continuation.classification.explanation.tearu': '末尾的「ある」是五段动词；它的否定变化虽然特殊，过去形仍按五段动词变化。',
  'diagnostics.continuation.classification.explanation.default': '「{familyLabel}」构成的中间形式继续按{classLabel}变化。',
  'diagnostics.continuation.conjugation.note': '已知这个中间形式是{classLabel}，本步只检查过去变化。',
  'diagnostics.continuation.mixed.rootMismatch': '给定前部「{expected}」，你写成了「{actual}」；过去变化末尾也不同。',
  'diagnostics.continuation.mixed.tailMismatch': '给定的前部已保留，但过去变化末尾还有差异。',
  'diagnostics.continuation.mixed.tail.givenClass': '这些差异仍不能唯一对应某个知识点，本次未更新掌握度。',
  'diagnostics.continuation.mixed.tail.unknownClass': '先确认中间形式的词类，再按给定词类检查变化；本次未更新知识点。',
  'diagnostics.continuation.retainedRu': '接续前仍保留了「る」。本步只评估过去接续，不额外评估去「る」规则。',
  'diagnostics.routing.formSwitch.remainingPast': '你的答案匹配到「{familyLabel}」的{writtenLabel}，本题要求{targetLabel}。下面保留这个否定形式，只检查剩余的过去变化。前面的构成步骤未单独检查，不会因这次定位而记对。',
  'diagnostics.routing.formSwitch.intermediate': '你的答案匹配到「{familyLabel}」的{writtenLabel}，本题要求{targetLabel}。先给出这个表达的中间形式，只检查后续变化。前面的构成步骤未单独检查，不会因这次定位而记对。',
  'diagnostics.routing.continuationPast': '你的答案匹配到「{familyLabel}」过去变化的候选错误，先确认中间形式的词类，再检查过去变化。前面的构成步骤未单独检查，不会因这次定位而记对。',
  'diagnostics.path.direct': '差异位于「{source}」的{stageLabel}。{detail}',
  'diagnostics.path.direct.withRemainder': '差异位于「{source}」的{stageLabel}。{detail}后面的接续未单独评估，不据此记对。',
  'diagnostics.path.classification.note': '本步只确认给定动词的类别，不更新独立掌握度。',
  'diagnostics.path.classification.explanation': '「{source}」在这里按{classLabel}变化。',
  'diagnostics.path.conjugation.note': '本步已提供词类，只检查这一步的构形；其他步骤不重复评估。',
  'diagnostics.path.candidate.givenClass': '输入中的「{written}」匹配到「{source}」{stageLabel}的候选错误，可能涉及词类判断或构形；已提供词类，下面只检查局部变化。本次尚未确定可扣分的知识点。',
  'diagnostics.path.candidate.givenClassWithRemainder': '输入中的「{written}」匹配到「{source}」{stageLabel}的候选错误，可能涉及词类判断或构形；已提供词类，下面只检查局部变化。其余接续未单独评估，不因这次定位而记对。本次尚未确定可扣分的知识点。',
  'diagnostics.path.candidate.unknownClass': '输入中的「{written}」匹配到「{source}」{stageLabel}的候选错误，可能涉及词类判断或构形。先确认词类，再检查这一步的变化。本次尚未确定可扣分的知识点。',
  'diagnostics.path.candidate.unknownClassWithRemainder': '输入中的「{written}」匹配到「{source}」{stageLabel}的候选错误，可能涉及词类判断或构形。先确认词类，再检查这一步的变化。其余接续未单独评估，不因这次定位而记对。本次尚未确定可扣分的知识点。',
  'diagnostics.path.remainder': '其余接续未单独评估，不因这次定位而记对。',
  'diagnostics.passive.ambiguousConstruction': '问题集中在受身形的构造，先分别检查词干与受身接续；后续形式将用正确中间形式单独练习。本次尚未更新知识点。',
  'diagnostics.recognition.allowed': '你的答案与{labels}一致，本题要求{targetLabel}。',
  'diagnostics.recognition.qualified': '从构形上看，你的答案对应{labels}，本题要求{targetLabel}。',
  'diagnostics.recognition.note.unreviewed': '{label}实际用法尚未确认。',
  'diagnostics.recognition.note.unreviewedWithReason': '{label}实际用法尚未确认：{reason}。',
  'diagnostics.recognition.note.context': '{label}实际使用需要合适的语境。',
  'diagnostics.recognition.note.contextWithReason': '{label}实际使用需要合适的语境：{reason}。',
  'diagnostics.recognition.note.disallowed': '{label}不适合这里给定的词义。',
  'diagnostics.recognition.note.disallowedWithReason': '{label}不适合这里给定的词义：{reason}。',
  'diagnostics.recognition.tail.withSteps': '本次不据此扣除具体知识点的掌握度；下面检查本题要求的变化。',
  'diagnostics.recognition.tail.terminal': '本次不据此扣除具体知识点的掌握度，请对照本题解析核对形式。',
  'diagnostics.recognition.targetForm.withSteps': '{identification}本次不据此扣除具体知识点的掌握度；下面检查本题要求的变化。',
  'diagnostics.recognition.targetForm.terminal': '{identification}本次不据此扣除具体知识点的掌握度，请对照本题解析核对形式。',
  'diagnostics.recognition.prefixedFeedback': '{identification}{feedback}',
  'diagnostics.instruction.goal': '{goalLabel}',
  'diagnostics.instruction.step.addEnding': '补上{endingLabel}',
  'diagnostics.instruction.step.complete': '完成{operationLabel}',
  'diagnostics.instruction.step.row': '{goalLabel}的词尾变化',
  'diagnostics.instruction.step.dropRu': '去掉词尾「る」',
  'diagnostics.instruction.step.contract': '写出缩约形式',
  'diagnostics.instruction.target': '{goalLabel} · {operationLabel}',
  'diagnostics.instruction.prompt.attach': '{preparation}。请在给定形式后接上{endingLabel}，填写完整的{goalLabel}。',
  'diagnostics.instruction.prompt.action': '{goalLabel}：{action}{later}。',
  'diagnostics.instruction.note': '已提供正确输入和词类：本段起点「{source}」按{classLabel}变化。{rule}{completion}',
};

const en = {
  'diagnostics.composite': '{parts}',
  'diagnostics.legacy.rule': 'The answer differs at one identified rule. Check the highlighted knowledge point.',
  'diagnostics.legacy.targetForm': 'The answer matches a different form. Check the form that this question requires.',
  'diagnostics.legacy.stage': 'The difference is in one construction stage. Complete the guided checks to identify the rule.',
  'diagnostics.legacy.mixed': 'The answer has more than one difference. Complete the guided checks before the app assigns a rule.',
  'diagnostics.legacy.partial': 'The app can identify part of the answer, but it cannot assign one rule yet.',
  'diagnostics.legacy.stagePriority': 'The app selected the earliest useful construction stage. Complete that guided check first.',
  'diagnostics.answer.invalid.empty': 'Enter an answer before you check it.',
  'diagnostics.answer.invalid.tooLong': 'The answer is too long. Enter only the conjugated form. The limit is 256 characters.',
  'diagnostics.answer.invalid.stepAhead': 'You entered a correct form from a later step. Enter the intermediate form for this step. This answer does not count as a knowledge error.',
  'diagnostics.answer.classification.incorrect': 'The word-class selection is incorrect. Check the correct class and its rule.',
  'diagnostics.feedback.observation.stemFallback': 'You wrote “{written}” at the ending-change position. Check the complete form for this step.',
  'diagnostics.feedback.observation.stemRule': 'You wrote “{written}” at the stem position. This position requires {ruleLabel}.',
  'diagnostics.feedback.observation.negativePastIncomplete': 'The answer still ends in ない. The past change is not complete.',
  'diagnostics.feedback.observation.ambiguousEnding': 'The given first part is still recognizable. The remaining change does not identify one rule.',
  'diagnostics.feedback.observation.unresolved': 'The first part or the ending differs from the given form. There is not enough matching text to identify one cause.',
  'diagnostics.feedback.tail.withSteps': 'No unconfirmed knowledge point changes. The next steps check only the unconfirmed changes.',
  'diagnostics.feedback.tail.step': 'This step does not change mastery. Compare your answer with the correct form, and then continue.',
  'diagnostics.feedback.tail.question': 'The answer counts as incorrect, but no knowledge point loses credit. Compare your answer with the conjugation explanation.',
  'diagnostics.feedback.composite': '{observations}{tail}',
  'diagnostics.continuation.classConflict': 'The difference is in the past change of {familyLabel}. The answer does not show whether the cause is the word class or the conjugation rule. Check the class first. Then check the change for that class. No knowledge point changes.',
  'diagnostics.continuation.classification.note.tearu': 'Classify the final ある in the intermediate form. Do not classify the original word. This step does not change independent mastery.',
  'diagnostics.continuation.classification.note.default': 'Classify only the intermediate form. This step does not change knowledge statistics.',
  'diagnostics.continuation.classification.explanation.tearu': 'The final ある is a godan verb. Its negative form is irregular, but its past form follows the godan rule.',
  'diagnostics.continuation.classification.explanation.default': 'The intermediate form made with {familyLabel} continues as a {classLabel}.',
  'diagnostics.continuation.conjugation.note': 'This intermediate form is a {classLabel}. This step checks only the past change.',
  'diagnostics.continuation.mixed.rootMismatch': 'The given first part is “{expected}”, but you wrote “{actual}”. The past ending is also different.',
  'diagnostics.continuation.mixed.tailMismatch': 'The given first part is present, but the past ending is different.',
  'diagnostics.continuation.mixed.tail.givenClass': 'The differences do not identify one knowledge point. Mastery does not change.',
  'diagnostics.continuation.mixed.tail.unknownClass': 'Check the intermediate form\'s word class first. Then check the change for that class. No knowledge point changes.',
  'diagnostics.continuation.retainedRu': 'The る remains before the ending. This step checks only the past ending. It does not check the rule that removes る.',
  'diagnostics.routing.formSwitch.remainingPast': 'Your answer matches the {writtenLabel} of {familyLabel}. The question requires {targetLabel}. Keep this negative form and check only the remaining past change. Earlier construction steps were not checked and receive no credit.',
  'diagnostics.routing.formSwitch.intermediate': 'Your answer matches the {writtenLabel} of {familyLabel}. The question requires {targetLabel}. Start with the intermediate form and check only the later change. Earlier construction steps were not checked and receive no credit.',
  'diagnostics.routing.continuationPast': 'Your answer matches a possible error in the past change of {familyLabel}. Check the intermediate form\'s word class first. Then check the past change. Earlier construction steps were not checked and receive no credit.',
  'diagnostics.path.direct': 'The difference is in the {stageLabel} of “{source}”. {detail}',
  'diagnostics.path.direct.withRemainder': 'The difference is in the {stageLabel} of “{source}”. {detail}The later ending was not checked and receives no credit.',
  'diagnostics.path.classification.note': 'Classify only the given verb. This step does not change independent mastery.',
  'diagnostics.path.classification.explanation': '“{source}” follows the {classLabel} pattern here.',
  'diagnostics.path.conjugation.note': 'The word class is given. Check only the form in this step. Do not assess the other steps again.',
  'diagnostics.path.candidate.givenClass': 'The text “{written}” matches a possible error in the {stageLabel} of “{source}”. The cause can be the word class or the conjugation. The word class is given, so the next step checks only the local change. No knowledge point loses credit yet.',
  'diagnostics.path.candidate.givenClassWithRemainder': 'The text “{written}” matches a possible error in the {stageLabel} of “{source}”. The cause can be the word class or the conjugation. The word class is given, so the next step checks only the local change. The remaining endings were not checked and receive no credit. No knowledge point loses credit yet.',
  'diagnostics.path.candidate.unknownClass': 'The text “{written}” matches a possible error in the {stageLabel} of “{source}”. The cause can be the word class or the conjugation. Check the class first. Then check this change. No knowledge point loses credit yet.',
  'diagnostics.path.candidate.unknownClassWithRemainder': 'The text “{written}” matches a possible error in the {stageLabel} of “{source}”. The cause can be the word class or the conjugation. Check the class first. Then check this change. The remaining endings were not checked and receive no credit. No knowledge point loses credit yet.',
  'diagnostics.path.remainder': 'The remaining endings were not checked and receive no credit. ',
  'diagnostics.passive.ambiguousConstruction': 'The difference is in the passive construction. Check the stem and the passive ending separately. A later step will use the correct intermediate form. No knowledge point changes.',
  'diagnostics.recognition.allowed': 'Your answer is a valid {labels} form. The question requires {targetLabel}.',
  'diagnostics.recognition.qualified': 'The spelling of your answer matches {labels}. The question requires {targetLabel}.',
  'diagnostics.recognition.note.unreviewed': 'The actual use of {label} is not confirmed.',
  'diagnostics.recognition.note.unreviewedWithReason': 'The actual use of {label} is not confirmed: {reason}.',
  'diagnostics.recognition.note.context': '{label} requires a suitable context.',
  'diagnostics.recognition.note.contextWithReason': '{label} requires a suitable context: {reason}.',
  'diagnostics.recognition.note.disallowed': '{label} does not fit the given sense.',
  'diagnostics.recognition.note.disallowedWithReason': '{label} does not fit the given sense: {reason}.',
  'diagnostics.recognition.tail.withSteps': 'This does not reduce mastery for a specific knowledge point. The next steps check the required changes.',
  'diagnostics.recognition.tail.terminal': 'This does not reduce mastery for a specific knowledge point. Compare the form with the explanation.',
  'diagnostics.recognition.targetForm.withSteps': '{identification}This does not reduce mastery for a specific knowledge point. The next steps check the required changes.',
  'diagnostics.recognition.targetForm.terminal': '{identification}This does not reduce mastery for a specific knowledge point. Compare the form with the explanation.',
  'diagnostics.recognition.prefixedFeedback': '{identification}{feedback}',
  'diagnostics.instruction.goal': '{goalLabel}',
  'diagnostics.instruction.step.addEnding': 'Add the {endingLabel}',
  'diagnostics.instruction.step.complete': '{operationLabel}',
  'diagnostics.instruction.step.row': 'Change the ending for {goalLabel}',
  'diagnostics.instruction.step.dropRu': 'Remove the final る',
  'diagnostics.instruction.step.contract': 'Write the contracted form',
  'diagnostics.instruction.target': '{goalLabel} · {operationLabel}',
  'diagnostics.instruction.prompt.attach': '{preparation}. Add the {endingLabel} to the given form. Enter the complete {goalLabel}.',
  'diagnostics.instruction.prompt.action': '{goalLabel}: {action}{later}.',
  'diagnostics.instruction.note': 'The correct input and word class are given. At the start of this section, “{source}” follows the {classLabel} pattern. {rule}{completion}',
};

export const DIAGNOSTIC_CATALOGS = Object.freeze({
  'zh-CN': defineCatalog(zhCN),
  en: defineCatalog(en),
});

const translators = new Map();

const CLASS_LABELS_EN = Object.freeze({
  godan:'godan verb',ichidan:'ichidan verb',irregular:'irregular verb',i:'い-adjective',na:'な-adjective',
});
const ENDING_LABELS_EN = Object.freeze({past:'past form',negative:'negative form',negativePast:'negative past form'});
const ENDING_NAMES_EN = Object.freeze({
  'suffix.passive':'passive ending','suffix.causative':'causative ending',
  'suffix.causativePassive':'causative-passive ending','suffix.negative':'negative ending',
  'adj.suffix.i-negative':'negative ending','suffix.past':'past ending','suffix.te':'て-form ending',
  'suffix.potential':'potential ending','suffix.volitional':'volitional ending',
});

function containsChinese(value) { return typeof value === 'string' && /[\u3400-\u9FFF]/u.test(value); }

function englishOperation(params) {
  const localized=params.ruleId?knowledgeLabel('en',params.ruleId):null;
  if(localized)return localized;
  return ({row:'change the ending',drop:'remove the ending',sound:'apply the sound change',
    append:'attach the ending','verb-terminal':'attach the ending',contract:'write the contraction',
    replace:'apply the change',irregular:'apply the irregular change'})[params.operation]??'complete the change';
}

function localizedParams(params, locale) {
  if(locale!=='en')return params;
  const result={...params};
  if(params.familyForm)result.familyLabel=formLabel('en',params.familyForm);
  if(params.goalForm)result.goalLabel=formLabel('en',params.goalForm);
  if(params.stageForm)result.stageLabel=formLabel('en',params.stageForm);
  if(params.targetForm)result.targetLabel=formLabel('en',params.targetForm);
  if(params.classId)result.classLabel=CLASS_LABELS_EN[params.classId]??params.classId;
  if(params.targetEnding)result.targetLabel=ENDING_LABELS_EN[params.targetEnding]??params.targetEnding;
  if(params.writtenEndings)result.writtenLabel=String(params.writtenEndings).split(',')
    .map(ending=>ENDING_LABELS_EN[ending]??ending).join(' / ');
  if(params.forms)result.labels=String(params.forms).split(',').map(form=>formLabel('en',form)).join(' / ');
  if(params.form)result.label=formLabel('en',params.form);
  if(params.ruleId) {
    result.ruleLabel=knowledgeLabel('en',params.ruleId)??params.ruleId;
    result.operationLabel=englishOperation(params);
  }
  if(params.endingRule)result.endingLabel=ENDING_NAMES_EN[params.endingRule]??'required ending';
  if(params.preparationKind)result.preparation=({sound:'The sound change is complete',ending:'The ending change is complete',
    given:'The required form is given'})[params.preparationKind]??'The required form is given';
  if(params.operation)result.action=({row:'change only the ending',drop:'remove only the final る',
    sound:`first ${englishOperation(params).toLowerCase()}`,append:`complete ${englishOperation(params).toLowerCase()}`,
    'verb-terminal':`complete ${englishOperation(params).toLowerCase()}`})[params.operation]??`complete ${englishOperation(params).toLowerCase()}`;
  result.later=params.laterSuffix?`. Do not add “${params.laterSuffix}” yet`:'';
  if(params.operation==='row')result.rule=`${englishOperation(params)}. ${params.uWa?'Final う changes to わ here. ':''}`;
  else if(containsChinese(result.rule))result.rule='';
  if(params.needsCompletion!==undefined)result.completion=params.needsCompletion?'Enter the complete changed form.':'';
  if(containsChinese(result.detail))result.detail='Check the highlighted rule. ';
  if(containsChinese(result.reason))result.reason='the expression needs a separate usage review';
  return result;
}

export function formatDiagnosticMessage(messageKey, params = {}, locale = DEFAULT_LOCALE) {
  const normalized = normalizeLocale(locale) ?? DEFAULT_LOCALE;
  let i18n = translators.get(normalized);
  if (!i18n) {
    i18n = createI18n({ locale: normalized, fallbackLocale: DEFAULT_LOCALE, catalogs: DIAGNOSTIC_CATALOGS });
    translators.set(normalized, i18n);
  }
  if (messageKey === 'diagnostics.composite') {
    const count = Math.max(0, Math.min(8, Number(params.partCount) || 0));
    const parts=Array.from({ length: count }, (_, index) => {
      const key = params[`part${index}Key`];
      if (typeof key !== 'string') return '';
      const prefix = `part${index}Param_`;
      const nested = Object.fromEntries(Object.entries(params)
        .filter(([name]) => name.startsWith(prefix)).map(([name, value]) => [name.slice(prefix.length), value]));
      return formatDiagnosticMessage(key, nested, normalized);
    }).filter(Boolean);
    return normalized==='en'?parts.map(part=>part.trim()).join(' '):parts.join('');
  }
  if(normalized==='zh-CN'&&messageKey.startsWith('diagnostics.legacy.')&&typeof params.legacyMessage==='string') {
    return params.legacyMessage;
  }
  return i18n.t(messageKey, localizedParams(params,normalized));
}

/** Keep the existing Chinese text while adding a stable locale-neutral payload. */
export function diagnosticMessage(messageKey, params = {}) {
  return { messageKey, params, message: formatDiagnosticMessage(messageKey, params, DEFAULT_LOCALE) };
}

export function legacyDiagnosticMessage(kind, legacyMessage) {
  const supported = new Set(['rule','targetForm','stage','mixed','partial','stagePriority']);
  const stored=Array.from(String(legacyMessage??'')).slice(0,1000).join('');
  const descriptor=diagnosticMessage(`diagnostics.legacy.${supported.has(kind)?kind:'partial'}`,{legacyMessage:stored});
  return {...descriptor,message:String(legacyMessage??'')};
}

/** Combine independently translatable messages while retaining flat log params. */
export function diagnosticComposite(parts) {
  const selected = parts.filter(part => part?.messageKey);
  const parameterCount=1+selected.reduce((count,part)=>count+1+Object.keys(part.params??{}).length,0);
  if(selected.length>8||parameterCount>32)return legacyDiagnosticMessage('partial',selected.map(part=>part.message??'').join(''));
  const params = { partCount: selected.length };
  selected.forEach((part, index) => {
    params[`part${index}Key`] = part.messageKey;
    for (const [name, value] of Object.entries(part.params ?? {})) params[`part${index}Param_${name}`] = value;
  });
  return diagnosticMessage('diagnostics.composite', params);
}

/** A descriptor for instructional fields that still expose a legacy string. */
export function diagnosticText(messageKey, params = {}) {
  return { messageKey, params };
}
