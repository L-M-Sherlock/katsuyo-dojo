import { COMPOUND_FORM_SPECS } from '../compound-forms.mjs';
import { FORM_SEMANTICS } from '../form-semantics.mjs';
import { CHAIN_FORM_SPECS } from '../multi-step-forms.mjs';
import { normalizeLocale } from './locales.mjs';

function semantic(concise, coreMeaning, extras = {}) {
  const entry = { concise, coreMeaning, core: coreMeaning, ...extras };
  if (extras.usageNote) entry.usage = extras.usageNote;
  return Object.freeze(entry);
}

function translatedStatic(form, text) {
  const source = FORM_SEMANTICS[form];
  if (!source) throw new Error(`Missing source semantics for ${form}`);
  const extras = {};
  for (const field of ['register', 'usageNote', 'contrast']) {
    if (source[field] !== undefined) {
      if (!text[field]) throw new Error(`Missing English ${field} for ${form}`);
      extras[field] = text[field];
    }
  }
  return semantic(text.concise, text.coreMeaning, extras);
}

const EN_STATIC_TEXT = {
  negative: {
    concise: 'does not ...',
    coreMeaning: 'States that an action does not occur or that a state does not apply now or in the future.',
    register: 'Plain form',
    contrast: 'Use the negative past form for an action that did not occur in the past.',
  },
  past: {
    concise: 'did ... / used to ...',
    coreMeaning: 'States that an action occurred or that a state existed in the past.',
    register: 'Plain form',
    contrast: 'It does not always emphasize completion. Context shows whether it describes a past experience or a completed action.',
  },
  te: {
    concise: 'connects to the next expression',
    coreMeaning: 'Connects actions, states, or reasons. It also forms the base of many auxiliary expressions.',
    usageNote: 'The て-form usually has no tense by itself. The following element supplies the complete meaning.',
  },
  masu: {
    concise: 'states ... politely',
    coreMeaning: 'Politely states a present, habitual, or future action.',
    register: 'Polite form',
    contrast: 'It corresponds to the plain dictionary form. Use ました for the past.',
  },
  negativePast: {
    concise: 'did not ...',
    coreMeaning: 'States that an action did not occur or that a state did not apply in the past.',
    register: 'Plain form',
  },
  masuPast: {
    concise: 'politely states that ... happened',
    coreMeaning: 'Politely states that an action occurred or that a state existed in the past.',
    register: 'Polite form',
  },
  masuNegative: {
    concise: 'politely states that ... does not happen',
    coreMeaning: 'Politely states that an action does not occur or that a state does not apply now or in the future.',
    register: 'Polite form',
  },
  masuNegativePast: {
    concise: 'politely states that ... did not happen',
    coreMeaning: 'Politely states that an action did not occur or that a state did not apply in the past.',
    register: 'Polite form',
  },
  imperative: {
    concise: 'orders someone to ...',
    coreMeaning: 'Gives a strong and direct order to perform an action.',
    register: 'Forceful command',
    usageNote: 'This form is very strong. Use it only when the relationship and situation permit it.',
    contrast: 'Use なさい for a milder instruction. Use てください for a polite request.',
  },
  passive: {
    concise: 'is ...ed / is affected by ...',
    coreMeaning: 'Makes the person or thing that receives an action the subject. It can also show that the subject is affected by the action.',
    contrast: 'For ichidan verbs and くる, the passive and potential forms look the same. Particles and context identify the meaning.',
  },
  potential: {
    concise: 'can ... / is able to ...',
    coreMeaning: 'States that someone has the ability to do something or that conditions make an action possible.',
    contrast: 'For ichidan verbs and くる, the potential and passive forms look the same. Particles and context identify the meaning.',
  },
  volitional: {
    concise: 'will ... / let us ...',
    coreMeaning: "Expresses the speaker's intention or suggests that the listener act together with the speaker.",
    register: 'Plain form',
    contrast: 'The usual polite equivalent is 〜ましょう.',
  },
  ba: {
    concise: 'if ...',
    coreMeaning: 'Sets a condition and states that the result follows when that condition is met.',
    contrast: 'The potential form means "can do." The ば-form means "if someone does." Both use the e-row for godan verbs, but their endings differ.',
  },
  causative: {
    concise: 'makes or lets someone ...',
    coreMeaning: 'States that someone causes another person to act or causes a change. With a person as the actor, it can express force or permission.',
    usageNote: 'The relationship between the people and the context show whether it means "make" or "let."',
  },
  causativePassive: {
    concise: 'is made or compelled to ...',
    coreMeaning: 'States that an action, feeling, or change occurs because of another person or an outside influence. It often suggests reluctance or lack of control.',
    contrast: 'The causative describes the person who causes or permits the action. The causative-passive describes the person who receives that influence.',
  },
  causativePassiveContracted: {
    concise: 'is made or compelled to ...',
    coreMeaning: 'Has the same meaning as the full causative-passive. It is a shorter form available to some godan verbs.',
    register: 'Common contraction',
    usageNote: 'For example, いかせられる can contract to いかされる. Godan verbs that end in す do not use this contraction.',
  },
  tara: {
    concise: 'if ... / after ...',
    coreMeaning: 'Sets a condition that applies after an action is complete. It can also mean that something happens after the first event.',
    contrast: 'The ば-form focuses on a condition. The たら-form also commonly shows the time order after an action is complete.',
  },
  nasai: {
    concise: 'please ... / you must ...',
    coreMeaning: 'Gives an instruction or advice from a person in a higher position to a person in a lower position. It is milder than the imperative.',
    register: 'Direct instruction',
    usageNote: 'Do not use this form to a person in a higher position.',
  },
  prohibitive: {
    concise: 'do not ...',
    coreMeaning: 'Strongly prohibits an action by adding な to the dictionary form.',
    register: 'Forceful prohibition',
    contrast: 'Use ないでください to ask someone politely not to do something.',
  },
  nakute: {
    concise: 'not ... and / because not ...',
    coreMeaning: 'Connects a negative state or reason. It often means "not ... and" or "because ... is not."',
    contrast: 'ないで more often means that the second action occurs without the first action. なくて more often connects states or reasons.',
  },
  naide: {
    concise: 'without doing ...',
    coreMeaning: 'States that the next action occurs without the first action. It can also connect to requests and other expressions.',
    contrast: 'なくて more often connects negative states or reasons. ないで emphasizes that an action did not occur.',
  },
  zu: {
    concise: 'not ...',
    coreMeaning: 'Expresses negation in a more literary or fixed style. It is equivalent to ない.',
    register: 'Written or relatively formal',
    usageNote: 'する becomes せず.',
  },
  zuni: {
    concise: 'without doing ...',
    coreMeaning: 'States that the next action occurs without the first action. It is a more literary equivalent of ないで.',
    register: 'Written or relatively formal',
    usageNote: 'する becomes せずに.',
  },
  teageru: {
    concise: 'does ... for someone',
    coreMeaning: 'States that the subject does something for another person and gives that person help or a benefit.',
    usageNote: 'Direct use toward a superior can sound as if the speaker emphasizes the favor they provide.',
    contrast: 'てもらう describes the receiver of help. てくれる emphasizes that another person acts for the speaker or the speaker\'s group.',
  },
  temorau: {
    concise: 'receives help with ...',
    coreMeaning: 'States that the subject receives help or a benefit because another person performs an action.',
    contrast: 'てあげる describes the giver of help. てもらう describes the receiver of help.',
  },
  tekureru: {
    concise: 'someone does ... for me or my group',
    coreMeaning: "States that another person's action or a situation benefits the speaker or the speaker's group.",
    contrast: 'てもらう focuses on receiving help. てくれる focuses on the person who acts for the speaker or the speaker\'s group.',
  },
  tekudasai: {
    concise: 'please ...',
    coreMeaning: 'Politely asks the listener to perform an action.',
    register: 'Polite request',
    usageNote: 'Although it is polite, it can still sound direct when used with a distant person or a person in a higher position.',
  },
  naideKudasai: {
    concise: 'please do not ...',
    coreMeaning: 'Politely asks the listener not to perform an action.',
    register: 'Polite request',
    contrast: 'The dictionary form plus な gives a strong prohibition. ないでください is more polite.',
  },
  teiru: {
    concise: 'is doing ... / regularly does ... / is in a state',
    coreMeaning: 'Depending on the verb, describes an action in progress, a repeated habit, or the resulting state after a change.',
    contrast: 'てある emphasizes a state left by an intentional action.',
  },
  teru: {
    concise: 'is doing ... / regularly does ... / is in a state',
    coreMeaning: 'A conversational contraction of ている or でいる. It keeps the same core meaning.',
    register: 'Conversational contraction',
  },
  tearu: {
    concise: 'has been prepared / remains in a resulting state / regional honorific',
    coreMeaning: 'Usually describes a state left by an intentional action or an action completed in advance. In some parts of Fukuoka, the same form can respectfully describe another person\'s action or state.',
    usageNote: 'In standard Japanese, the resulting-state use often takes a transitive verb and が. The preparation use can also take を. Cards marked as Fukuoka dialect can use the honorific meaning equivalent to ていらっしゃる; that use does not mean prior preparation.',
    contrast: 'Standard ている can simply describe an ongoing action or a resulting state. てある emphasizes intentional preparation and the state that remains.',
  },
  teoru: {
    concise: 'is doing ... / regularly does ... / is in a state',
    coreMeaning: 'Usually equivalent to ている. It describes an ongoing action, a habit, or a resulting state.',
    register: 'Humble, formal, dialectal, or character-specific speech',
    usageNote: "As humble language, it refers to the speaker or the speaker's group. In other contexts, it can mark a dialect or an old-fashioned character voice.",
    contrast: 'The neutral everyday form is ている.',
  },
  toru: {
    concise: 'is doing ... / regularly does ... / is in a state',
    coreMeaning: 'A contraction of ておる or でおる to とる or どる. It keeps the meaning of the corresponding ておる form.',
    register: 'Dialectal or character-specific conversational contraction',
    contrast: 'Neutral standard Japanese usually uses ている. The effect of とる or どる depends on the region and the character.',
  },
  tai: {
    concise: 'wants to ...',
    coreMeaning: "Expresses the speaker's desire to perform an action. It conjugates like an i-adjective.",
    usageNote: "To state another person's desire directly, Japanese commonly uses たがる or adds an expression of report or inference.",
    contrast: 'てほしい expresses a wish about another person\'s action or a situation. たい expresses the speaker\'s own desire.',
  },
  tehoshii: {
    concise: 'wants someone to ... / wants ... to happen',
    coreMeaning: 'Expresses a wish for someone to perform an action or for a situation to occur.',
    usageNote: 'The person who performs the action is often marked with に. The whole expression conjugates like an i-adjective.',
    contrast: 'たい expresses the speaker\'s own desire. てほしい expresses a wish about another person\'s action or a situation.',
  },
  temo: {
    concise: 'even if ...',
    coreMeaning: 'Sets a concessive condition. The result still holds even when the first condition is met.',
    contrast: 'たら sets a general condition. ても emphasizes that the condition does not change the result.',
  },
  nagara: {
    concise: 'while doing ...',
    coreMeaning: 'States that one subject performs two actions at the same time. The later action is usually the main action.',
    usageNote: 'The two actions normally have the same subject.',
    contrast: 'つつ has a similar meaning but is more literary and formal.',
  },
  tsutsu: {
    concise: 'while doing ...',
    coreMeaning: 'States that one subject performs two actions at the same time. Its meaning is close to ながら.',
    register: 'Written or relatively formal',
    usageNote: 'つつも can also mean "although ...".',
  },
  nakerebaNaranai: {
    concise: 'must ...',
    coreMeaning: 'States an obligation or necessity through the idea that not doing the action is unacceptable.',
    register: 'Neutral or relatively formal',
  },
  nakutewaIkenai: {
    concise: 'must ...',
    coreMeaning: 'States that not doing an action would be unacceptable and that the action is therefore necessary.',
    register: 'Neutral',
  },
  naitoIkenai: {
    concise: 'must ... / have to ...',
    coreMeaning: 'Uses the structure "if not, it is unacceptable" to express an obligation or necessity.',
    register: 'Common in conversation',
  },
  tari: {
    concise: 'does things such as ...',
    coreMeaning: 'Lists representative actions or states and implies that other similar examples exist.',
    usageNote: 'Several examples commonly appear in the pattern 〜たり、〜たりする.',
  },
  tewa: {
    concise: 'does ..., then ..., repeatedly',
    coreMeaning: 'States that one event is followed by another and that this sequence occurs repeatedly.',
    usageNote: 'This course practices the repeated-sequence use. The same ては form can also express a condition or appear in a prohibition.',
  },
  temoIi: {
    concise: 'may ... / it is acceptable to ...',
    coreMeaning: 'Gives permission to perform an action or asks for permission.',
    contrast: 'なくてもいい means that it is acceptable not to do the action, so the action is not necessary.',
  },
  nakutemoIi: {
    concise: 'does not have to ...',
    coreMeaning: 'States that not performing an action causes no problem and that the action is not necessary.',
    contrast: 'It does not mean "cannot do." It means that there is no obligation or need.',
  },
  masenka: {
    concise: 'would you ...?',
    coreMeaning: 'Uses a polite negative question to invite the listener to act together or to make an indirect request.',
    register: 'Polite invitation or request',
    contrast: 'Its literal form is a negative question, but in an invitation it does not simply ask whether the listener will not act.',
  },
  youtosuru: {
    concise: 'is about to ... / attempts to ...',
    coreMeaning: 'States that an action is about to occur or that the subject attempts or intends to perform it.',
    usageNote: 'Tense and context show whether the expression means "is about to" or "attempts to."',
  },
  temiru: {
    concise: 'tries doing ... / experiences ... and then ...',
    coreMeaning: 'States that someone actually performs an action to observe the result or gain experience. In contexts such as 〜てみると and 〜てみたら, it can also introduce a judgment or discovery after an experience.',
    usageNote: 'A discovery after an experience does not always involve a deliberate trial. おわってみると can mean "looking back after it ended." おわってみないとわからない means that no judgment is possible until it actually ends. Read the following clause to identify the meaning.',
    contrast: 'This differs from the independent verb みる, which means "see." The auxiliary is usually written in kana.',
  },
  teshimau: {
    concise: 'finishes ... / does ... unintentionally',
    coreMeaning: 'States that an action is fully completed. It can also express regret, surprise, or lack of control about an action or situation. Context determines whether a negative form means incomplete action, avoided completion, or avoidance of an unwanted result.',
    usageNote: 'A negative form can negate completion or a result. With a structure such as ように, it can express prevention of an unwanted result. The complete sentence determines the meaning. A negative past question can also ask whether the event already occurred.',
    contrast: 'Conversational Japanese often contracts it to ちゃう or じゃう.',
  },
  chau: {
    concise: 'finishes ... / does ... unintentionally',
    coreMeaning: 'A conversational contraction of てしまう or でしまう. It still expresses full completion or a sense of regret or surprise.',
    register: 'Conversational contraction',
    usageNote: 'て becomes ちゃう, and で becomes じゃう.',
  },
  teoku: {
    concise: 'does ... in advance / leaves ... as it is',
    coreMeaning: 'States that someone completes an action in advance for a future purpose or leaves the resulting state unchanged.',
    usageNote: 'With advice or evaluation such as ほうがよかった, the full sentence can state what someone should have done in advance. It does not mean that the action occurred. A negative condition can state a required prior state. A negative past question can ask why someone did not finish at the appropriate point.',
    contrast: 'Conversational Japanese often contracts it to とく or どく.',
  },
  toku: {
    concise: 'does ... in advance / leaves ... as it is',
    coreMeaning: 'A conversational contraction of ておく or でおく. It expresses advance preparation or preservation of a resulting state.',
    register: 'Conversational contraction',
    usageNote: 'て becomes とく, and で becomes どく.',
  },
  teiku: {
    concise: 'continues ... / moves away while ...',
    coreMeaning: 'Shows an action or state continuing forward from a point in time, a change developing further, or movement away from the speaker.',
    usageNote: 'It does not always mean a gradual change into a different state. For example, いまのにんずうでたりていくか asks whether the current number of people will remain sufficient. It can also mean doing something before leaving. In a report about a visitor, きていった can mean that the person came and then left.',
    contrast: 'てくる often shows a change developing up to an observation point or movement toward the speaker.',
  },
  teku: {
    concise: 'continues ... / moves away while ...',
    coreMeaning: 'A conversational contraction of ていく or でいく. It keeps the same core meaning.',
    register: 'Conversational contraction',
  },
  tekuru: {
    concise: 'has begun to ... / comes while ...',
    coreMeaning: 'Shows an action, state, or change developing toward an observation point, movement toward the speaker, or an action performed before returning.',
    usageNote: 'The observation point can be in the future. こうじがすすむとざいりょうがいってくる means that materials will become necessary as construction proceeds. A negative question can ask whether a state has appeared. It does not always assert that the state did not appear.',
    contrast: 'ていく usually extends from the present into the future or shows movement away from the speaker.',
  },
  tatte: {
    concise: 'even if ...',
    coreMeaning: 'Sets a concessive condition in a conversational form. The result does not change even when the first condition is met.',
    register: 'Conversational',
    contrast: 'Its meaning is close to ても or でも, but たって or だって is more conversational.',
  },
  sugiru: {
    concise: 'does ... too much / is too ...',
    coreMeaning: 'States that an action or quality exceeds an appropriate or normal degree.',
    usageNote: 'With a verb, attach it to the ます-stem. With an adjective, it also shows an excessive degree.',
  },
  tagaru: {
    concise: 'shows signs of wanting to ...',
    coreMeaning: "Describes another person's desire based on observable behavior. It conjugates as a godan verb.",
    contrast: 'The speaker usually uses たい to state their own desire directly.',
  },
  passiveDesireNegativePast: {
    concise: 'did not want to be ...ed',
    coreMeaning: 'States that someone did not want to receive an action in the past.',
    usageNote: 'It combines the passive, たい, and the negative past in that order.',
  },
  adjectiveNegative: {
    concise: 'is not ...',
    coreMeaning: 'States that the quality or state described by an i-adjective does not apply.',
    register: 'Plain form',
  },
  adjectivePast: {
    concise: 'was ... / used to be ...',
    coreMeaning: 'States that the quality or state described by an i-adjective existed in the past.',
    register: 'Plain form',
  },
  adjectiveNegativePast: {
    concise: 'was not ...',
    coreMeaning: 'States that the quality or state described by an i-adjective did not apply in the past.',
    register: 'Plain form',
  },
  adjectiveTe: {
    concise: 'is ... and ... / because it is ...',
    coreMeaning: 'Connects an i-adjective to a following description. It can list qualities or give a reason.',
  },
  adjectiveAttributive: {
    concise: 'a ... noun',
    coreMeaning: 'Makes a na-adjective directly modify the noun that follows it.',
    contrast: 'Do not use な when the adjective is the sentence predicate. The plain predicate usually takes だ.',
  },
  adjectivePredicative: {
    concise: 'is ...',
    coreMeaning: 'Uses a na-adjective as a plain sentence predicate to make a judgment about a quality or state.',
    register: 'Plain form',
    contrast: 'Use な before a noun. Use だ for a plain sentence-final judgment.',
  },
  adjectiveNaNegative: {
    concise: 'is not ...',
    coreMeaning: 'States that the quality or state described by a na-adjective does not apply.',
    register: 'Plain form',
    usageNote: 'In conversation, ではない often becomes じゃない.',
  },
  adjectiveNaPast: {
    concise: 'was ... / used to be ...',
    coreMeaning: 'States that the quality or state described by a na-adjective existed in the past.',
    register: 'Plain form',
  },
  adjectiveNaNegativePast: {
    concise: 'was not ...',
    coreMeaning: 'States that the quality or state described by a na-adjective did not apply in the past.',
    register: 'Plain form',
    usageNote: 'In conversation, ではなかった often becomes じゃなかった.',
  },
  adjectiveNaTe: {
    concise: 'is ... and ... / because it is ...',
    coreMeaning: 'Uses で to connect a na-adjective to a following description. It can list qualities or give a reason.',
  },
  adjectiveBa: {
    concise: 'if it is ...',
    coreMeaning: 'Sets a condition based on whether a quality or state applies.',
    usageNote: 'An i-adjective usually takes ければ. A na-adjective usually takes なら.',
  },
  adjectiveAdverb: {
    concise: '...ly / becomes ...',
    coreMeaning: 'Changes an adjective into an adverb so that it modifies an action, a change, or another state.',
    usageNote: 'An i-adjective usually changes to く. A na-adjective usually takes に.',
  },
};

const EN_VOICE_CONTINUATIONS = {
  passivePast: ['was ...ed', 'Describes a passive action or an affected state in the past.'],
  passiveNegative: ['is not ...ed', 'States that a passive action or an affected state does not apply.'],
  passiveNegativePast: ['was not ...ed', 'States that a passive action or an affected state did not apply in the past.'],
  potentialPast: ['was able to ...', 'States that someone had the ability or opportunity to perform an action in the past.'],
  potentialNegative: ['cannot ...', 'States that someone lacks the ability or opportunity to perform an action.'],
  potentialNegativePast: ['could not ...', 'States that someone lacked the ability or opportunity to perform an action in the past.'],
  causativePast: ['made or let someone ...', 'States that someone caused or permitted an action or change in the past.'],
  causativeNegative: ['does not make or let someone ...', 'States that someone does not cause or permit an action or change.'],
  causativeNegativePast: ['did not make or let someone ...', 'States that someone did not cause or permit an action or change in the past.'],
  causativePassivePast: ['was made or compelled to ...', 'States that an action, feeling, or change occurred because of another person or an outside influence in the past.'],
  causativePassiveNegative: ['is not made or compelled to ...', 'States that an action, feeling, or change does not occur because of another person or an outside influence.'],
  causativePassiveNegativePast: ['was not made or compelled to ...', 'States that an action, feeling, or change did not occur because of another person or an outside influence in the past.'],
};

const EN_CHAIN_TEXT = {
  temiruDesire: ['wants to try ...', 'Expresses a desire to try an action. It does not state that the action occurred.'],
  temiruDesirePast: ['wanted to try ...', 'Expresses a past desire to try an action. It does not state that the action occurred.'],
  temiruDesireNegative: ['does not want to try ...', 'Expresses no desire to try an action.'],
  temiruDesireNegativePast: ['did not want to try ...', 'Expresses that someone had no desire to try an action in the past.'],
  passiveProgressive: ['is being ...ed / is in an affected state', 'States that an action is affecting the subject now or that the subject remains in the resulting state.'],
  passiveProgressivePast: ['was being ...ed / was in an affected state', 'States that an action was affecting the subject or that the subject was in the resulting state in the past.'],
  passiveProgressiveNegative: ['is not being ...ed / is not in an affected state', 'Negates an ongoing passive action or the resulting state caused by that action.'],
  passiveProgressiveNegativePast: ['was not being ...ed / was not in an affected state', 'States that the passive action or its resulting state did not apply at a past time.'],
  causativeReceive: ['gets permission to ... / gets the opportunity to ...', 'From the beneficiary\'s viewpoint, states that another person permits or arranges the action.'],
  causativeReceivePast: ['received permission to ... / received the opportunity to ...', 'States that another person permitted or arranged the action in the past.'],
  temiruRequest: ['please try ...', 'Asks the listener to try an action.'],
  temiruTara: ['if someone tries ... / after trying ...', 'Uses trying an action as a condition or introduces a discovery made after the attempt.'],
  teokuRequest: ['please ... in advance', 'Asks the listener to complete an action in advance as preparation.'],
  teokuBa: ['if someone ... in advance', 'Uses completion of advance preparation as a condition.'],
  teokuTara: ['if someone ... in advance / after preparing ...', 'Uses advance preparation as a condition or introduces what happens after the preparation is complete.'],
  causativeRequest: ['please let me ...', 'Asks a person with authority for permission to perform an action.'],
  temorauDesire: ['wants someone to ...', 'Expresses a desire to receive help through another person\'s action.'],
  temorauDesirePast: ['wanted someone to ...', 'Expresses a past desire to receive help through another person\'s action.'],
  temorauDesireNegative: ['does not want someone to ...', 'Expresses no desire to receive help through another person\'s action.'],
  temorauDesireNegativePast: ['did not want someone to ...', 'Expresses that someone did not want to receive help through another person\'s action in the past.'],
  temorauPotential: ['can get someone to ...', 'States that it is possible to receive help through another person\'s action.'],
  temorauPotentialPast: ['was able to get someone to ...', 'States that someone was able to receive help through another person\'s action in the past.'],
  temorauPotentialNegative: ['cannot get someone to ...', 'States that it is not possible to receive help through another person\'s action.'],
  temorauPotentialNegativePast: ['could not get someone to ...', 'States that it was not possible to receive help through another person\'s action in the past.'],
  temorauPoliteRequest: ['could you ...?', 'Politely requests an action by asking whether the speaker can receive that help.'],
  potentialPolite: ['can ...', 'Politely states that someone can perform an action.'],
  potentialPolitePast: ['was able to ...', 'Politely states that someone was able to perform an action in the past.'],
  potentialPoliteNegative: ['cannot ...', 'Politely states that someone cannot perform an action.'],
  potentialPoliteNegativePast: ['could not ...', 'Politely states that someone could not perform an action in the past.'],
  desireBa: ['if someone wants to ...', "Uses a person's desire as a condition for advice or a related arrangement."],
  sugiruNegativeRequest: ['please do not ... too much', 'Asks or advises the listener to limit the degree of an action.'],
  passiveCompletion: ['is unfortunately ...ed', 'States that the speaker or the speaker\'s property experiences an unwanted action and expresses regret or a similar feeling.'],
  passiveCompletionPast: ['was unfortunately ...ed', 'States that the speaker or the speaker\'s property experienced an unwanted action and expresses regret or a similar feeling.'],
  causativeReceiveDesire: ['wants permission to ...', 'Expresses a desire to receive permission or an arrangement to perform an action.'],
  causativeReceivePoliteRequest: ['could you let me ...?', 'Politely asks another person for permission or an arrangement to perform an action.'],
  causativeReceivePotential: ['can get permission to ...', 'States that it is possible to receive permission or an arrangement to perform an action.'],
  causativeReceivePotentialPast: ['was able to get permission to ...', 'States that someone received permission or an arrangement to perform an action in the past.'],
  causativeReceivePotentialNegative: ['cannot get permission to ...', 'States that it is not possible to receive permission or an arrangement to perform an action.'],
  causativeReceivePotentialNegativePast: ['could not get permission to ...', 'States that it was not possible to receive permission or an arrangement to perform an action in the past.'],
  potentialBa: ['if someone can ...', 'Uses the ability to perform an action as a condition.'],
  potentialTara: ['if someone can ... / after someone manages to ...', 'Uses the ability to perform an action as a condition or introduces what happens after the action becomes possible or is completed.'],
};

const EN_CHAIN_RULES = {
  '尝试与愿望': 'Attach てみる first, and then attach たい. Change たい to express the required polarity and tense.',
  '受身与进行或状态': 'Make the passive first, and then attach ている. Change the final いる to express the required polarity and tense.',
  '使役与接受允许': 'Make the causative first, and then attach てもらう. Change the final もらう to the past form when required.',
  '尝试与请求': 'Make the てみる form first. Change the final みる to みてください.',
  '尝试与条件': 'Make the てみる form first. Change the final みる to みたら.',
  '事先准备与请求': 'Make the ておく form first. Change the final おく to おいてください.',
  '事先准备与条件': 'Make the ておく form first. Change the final おく to the required conditional form.',
  '使役与许可请求': 'Make the causative first. Change it to the て-form, and then attach ください.',
  '接受帮助与愿望': 'Make the てもらう form first, and then attach たい. Change たい to express the required polarity and tense.',
  '接受帮助的可能与请求': 'Make the てもらう form first. Change もらう to its potential form, and then add the required polarity, tense, or polite request.',
  '可能与礼貌表达': 'Make the potential first. Treat it as an ichidan verb, and add the required polite ending.',
  '愿望与条件': 'Attach たい first. Treat it as an i-adjective, and change it to the conditional たければ.',
  '过度与否定请求': 'Attach すぎる first. Treat the final element as an ichidan verb, and change it to すぎないでください.',
  '受身与遗憾': 'Make the passive first, and then attach てしまう. Change the final しまう to the past form when required.',
  '接受允许的愿望与可能': 'Make the causative and attach てもらう. Then add the desire or potential expression and complete the required final change.',
  '可能与条件': 'Make the potential first. Treat it as an ichidan verb, and change it to the required conditional form.',
};

const EN_COMPOUND_MEANINGS = {
  teageru: {
    past: ['did ... for someone', 'States that the subject performed an action for another person and gave that person help or a benefit in the past.'],
    negative: ['does not ... for someone', 'States that the subject does not perform an action for another person or give the related help or benefit.'],
    negativePast: ['did not ... for someone', 'States that the subject did not perform an action for another person or give the related help or benefit in the past.'],
  },
  temorau: {
    past: ['received help with ...', 'States that the subject received help or a benefit through another person\'s action in the past.'],
    negative: ['does not receive the benefit of someone ...ing / being ...', 'Negates receiving a benefit from another person’s action or state. Context can make it a decision not to receive that benefit. It does not itself imply a prior request, refusal, or inability. With conditional と, the complete sentence can express a need for that action or state.'],
    negativePast: ['did not receive help with ...', 'States that the subject did not receive help or a benefit through another person\'s action in the past.'],
  },
  tekureru: {
    past: ['someone did ... for me or my group', 'States that another person\'s action or a situation benefited the speaker or the speaker\'s group in the past.'],
    negative: ['someone does not ... for me or my group', 'States that an expected action or situation that would benefit the speaker or the speaker\'s group does not occur.'],
    negativePast: ['someone did not ... for me or my group', 'States that an expected action or situation that would benefit the speaker or the speaker\'s group did not occur in the past.'],
  },
  teiru: {
    past: ['was doing ... / regularly did ... / was in a state', 'Depending on the verb and context, describes an action in progress at a past time, a past habit, or a resulting state that existed then.'],
    negative: ['is not doing ... / is not in a state', 'Depending on the verb and context, states that an action is not in progress, a habitual action does not occur, or a resulting state does not exist.'],
    negativePast: ['was not doing ... / was not in a state', 'Depending on the verb and context, states that an action was not in progress, a past habit did not apply, or a resulting state did not exist at a past time.'],
  },
  tearu: {
    past: ['had been prepared / regional respectful past description', 'In standard Japanese, describes a prepared result at a past time or an action completed in advance. In a marked Fukuoka context, it can respectfully describe another person\'s past action or state.'],
    negative: ['has not been prepared yet', 'States that an intentional action has not yet left the required result or that an action has not yet been completed in advance.'],
    negativePast: ['had not been prepared yet', 'States that an intentional action had not yet left the required result or that an action had not yet been completed in advance at a past time.'],
  },
  teoru: {
    past: ['was doing ... / regularly did ... / was in a state', 'Usually equivalent to ていた. It describes an action in progress, a habit, or a resulting state in the past.'],
    negative: ['is not doing ... / is not in a state', 'Usually equivalent to ていない. It states that an action is not in progress, a habit does not apply, or a resulting state does not exist.'],
    negativePast: ['was not doing ... / was not in a state', 'Usually equivalent to ていなかった. It states that an action was not in progress, a past habit did not apply, or a resulting state did not exist.'],
  },
  tai: {
    past: ['wanted to ...', 'Expresses a past desire to perform an action.'],
    negative: ['does not want to ...', 'Expresses no desire to perform an action.'],
    negativePast: ['did not want to ...', 'Expresses that someone had no desire to perform an action in the past.'],
  },
  tehoshii: {
    past: ['wanted someone to ... / wanted ... to happen', 'Expresses a past wish for someone to perform an action or for a situation to occur.'],
    negative: ['does not want someone to ... / does not want ... to happen', 'Expresses a wish that someone not perform an action or that a situation not occur.'],
    negativePast: ['did not want someone to ... / did not want ... to happen', 'Expresses a past wish that someone not perform an action or that a situation not occur.'],
  },
  youtosuru: {
    past: ['was about to ... / attempted to ...', 'States that an action was about to occur or that the subject attempted it in the past.'],
    negative: ['will not try to ... / is unwilling to ...', 'States that the subject has no intention or makes no attempt to act. With another person as the subject, it often suggests unwillingness.'],
    negativePast: ['did not try to ... / was unwilling to ...', 'States that the subject had no intention or made no attempt to act in the past. With another person as the subject, it often suggests unwillingness.'],
  },
  temiru: {
    past: ['tried doing ... / experienced ...', 'States that someone tried an action in the past. With a following form such as ら, it can introduce a judgment or discovery after the experience.'],
    negative: ['Would you like to try ...?', 'This course uses 〜てみない？ to invite someone to try an action or suggest a trial. The negative question does not express refusal or prohibition. Negative statements and conditions such as 〜てみないとわからない need a separate interpretation from their full context.'],
    negativePast: ['did not try ...', 'States that someone did not try an action in the past.'],
  },
  teshimau: {
    past: ['finished ... / an unintended event occurred', 'States that an action was fully completed in the past. It can also express regret, surprise, or lack of control about a past action or situation.'],
    negative: ['does not finish ... / avoids the result', 'Negates completion or a result. With a structure such as ように, it can express prevention of an unwanted result. The complete context determines the scope.'],
    negativePast: ['did not finish ... / the result did not occur', 'Negates a past completion or result. In a question, it can also ask whether an unintended or unwanted result already occurred. It does not always mean successful prevention or incomplete quantity.'],
  },
  teoku: {
    past: ['did ... in advance / left ... as it was', 'States that someone prepared for a later event in the past or left a resulting state unchanged.'],
    negative: ['does not ... in advance / does not leave ... as it is', 'States that someone does not perform an action in advance or does not preserve the resulting state.'],
    negativePast: ['did not ... in advance / did not leave ... as it was', 'States that someone did not perform an action in advance or did not preserve the resulting state in the past.'],
  },
  teiku: {
    past: ['continued ... / moved away while ...', 'Shows an action or state continuing from a past point, a change developing further, movement away with an action, or an action performed before leaving.'],
    negative: ['does not continue ... / does not move away while ...', 'Negates continued action or change, movement away with an action, or an action performed before leaving. A negative question can also seek agreement, so it does not always assert that the event will not occur.'],
    negativePast: ['did not continue ... / did not move away while ...', 'Negates past continuation, movement away with an action, or an action performed before leaving. A negative question can also ask whether the event occurred. Context determines the scope.'],
  },
  tekuru: {
    past: ['began to ... / came while ... / returned after ...', 'Shows an action, state, or change developing up to an observation point, movement toward the speaker with an action, or an action performed before returning.'],
    negative: ['does not begin to ... / does not come while ... / does not return after ...', 'Negates the appearance of a state or change, movement toward the speaker with an action, or an action performed before returning. A negative question can ask whether the state appears.'],
    negativePast: ['did not begin to ... / did not come while ... / did not return after ...', 'Negates the past appearance of a state or change, movement toward the speaker with an action, or an action performed before returning. A negative question can ask whether the state appeared.'],
  },
  sugiru: {
    past: ['did ... too much / was too ...', 'States that an action or quality exceeded an appropriate or normal degree in the past.'],
    negative: ['does not ... too much / is not too ...', 'States that an action or quality does not exceed an appropriate or normal degree.'],
    negativePast: ['did not ... too much / was not too ...', 'States that an action or quality did not exceed an appropriate or normal degree in the past.'],
  },
  tagaru: {
    past: ['showed signs of wanting to ...', 'Describes another person\'s past desire based on behavior that was observable then.'],
    negative: ['shows no sign of wanting to ...', 'States that another person shows no observable desire to perform an action.'],
    negativePast: ['showed no sign of wanting to ...', 'States that another person showed no observable desire to perform an action in the past.'],
  },
};

const englishStatic = Object.fromEntries(
  Object.entries(EN_STATIC_TEXT).map(([form, text]) => [form, translatedStatic(form, text)]),
);

for (const [form, meaning] of Object.entries(EN_VOICE_CONTINUATIONS)) {
  const baseForm = form.startsWith('causativePassive') ? 'causativePassive'
    : form.startsWith('passive') ? 'passive'
      : form.startsWith('potential') ? 'potential'
        : 'causative';
  const base = englishStatic[baseForm];
  englishStatic[form] = semantic(meaning[0], meaning[1], {
    ...(base.register ? { register: base.register } : {}),
    ...(base.usageNote ? { usageNote: base.usageNote } : {}),
    ...(base.contrast ? { contrast: base.contrast } : {}),
  });
}

const englishChains = Object.fromEntries(Object.entries(CHAIN_FORM_SPECS).map(([form, spec]) => {
  const meaning = EN_CHAIN_TEXT[form];
  const usageNote = EN_CHAIN_RULES[spec.familyTitle];
  if (!meaning || !usageNote) throw new Error(`Missing English chain semantics for ${form}`);
  return [form, semantic(meaning[0], meaning[1], { usageNote })];
}));

const englishCompounds = Object.fromEntries(Object.entries(COMPOUND_FORM_SPECS).map(([form, spec]) => {
  const base = englishStatic[spec.form];
  const meaning = EN_COMPOUND_MEANINGS[spec.form]?.[spec.ending];
  if (!base || !meaning) throw new Error(`Missing English compound semantics for ${form}`);
  return [form, semantic(meaning[0], meaning[1], {
    ...(base.register ? { register: base.register } : {}),
    ...(base.usageNote ? { usageNote: base.usageNote } : {}),
    ...(base.contrast ? { contrast: base.contrast } : {}),
    baseForm: spec.form,
    continuation: spec.ending,
    form,
  })];
}));

export const EN_FORM_SEMANTICS = Object.freeze({
  ...englishChains,
  ...englishStatic,
  ...englishCompounds,
});

export const FORM_SEMANTICS_BY_LOCALE = Object.freeze({
  'zh-CN': FORM_SEMANTICS,
  en: EN_FORM_SEMANTICS,
});

/** Return the form-semantics catalog for a supported UI locale. */
export function formSemanticsForLocale(locale = 'zh-CN') {
  const normalized = normalizeLocale(locale);
  if (!normalized) throw new RangeError(`Unsupported form-semantics locale: ${String(locale)}`);
  return FORM_SEMANTICS_BY_LOCALE[normalized];
}

/** Return localized semantic help for a stable form id. */
export function localizedSemanticsForForm(form, locale = 'zh-CN') {
  return formSemanticsForLocale(locale)[form] ?? null;
}
