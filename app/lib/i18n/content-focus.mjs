import { focusCopy as chineseFocusCopy } from '../focus-copy.mjs';
import { formLabel } from './content-forms.mjs';
import { knowledgeLabel } from './content-knowledge.mjs';
import { normalizeLocale } from './locales.mjs';

const EN_EXACT = Object.freeze({
  'class.godan': ['Identify godan verbs', 'Identify a godan verb before you change its ending.'],
  'class.ichidan': ['Identify ichidan verbs', 'Check the final る and distinguish ichidan verbs from godan verbs.'],
  'class.irregular': ['Identify irregular verbs', 'Learn the changes of する and 来る separately.'],
  'heuristic.ru-ie': ['Check verbs with an i/e sound before る', 'For example, 起きる is ichidan and 帰る is godan. Final る alone is not sufficient.'],
  'heuristic.ru-other': ['Check other verbs that end in る', 'Check the sound before る to make an initial class decision.'],
  'exception.ru-godan': ['Learn godan exceptions that end in る', 'For example, 帰る is godan even though an e-row sound comes before る.'],
  'adj.class.i': ['Identify い-adjectives', 'Decide whether the word changes its ending as an い-adjective.'],
  'adj.class.na': ['Identify な-adjectives', 'Decide whether the word uses attachments such as な and だ.'],
  'stem.ichidan.drop-ru': ['Remove る from an ichidan verb', 'For example, take 食べ from 食べる before you attach the required ending.'],
  'stem.irregular.connective': ['Change the stem of する and 来る', 'For example, use する → し and 来る → き before you attach the next element.'],
  'stem.godan.a': ['Move a godan ending to the a-row', 'For 書かない, first change final く in 書く to か.'],
  'stem.godan.i': ['Move a godan ending to the i-row', 'For 書きます, first change final く in 書く to き.'],
  'stem.godan.e': ['Move a godan ending to the e-row', 'For 書ける, change final く in 書く to け.'],
  'stem.godan.o': ['Form the godan volitional stem', 'For 書こう, change final く in 書く to こ, and then add う.'],
  'stem.godan.u-wa': ['Change final う to わ before a negative ending', 'Use 買う → 買わない. Do not write 買あない.'],
  'stem.godan.shi-connective': ['Change final す to し', 'For example, use 話す → 話します or 話して.'],
  'onbin.sokuon': ['Use the small-っ change after う・つ・る', 'For example, use 買う → 買った or 買って.'],
  'onbin.hatsuon': ['Use the ん change after ぬ・ぶ・む', 'For example, use 読む → 読んだ or 読んで.'],
  'onbin.i': ['Use the い change after く・ぐ', 'For example, use 書く → 書いた or 書いて.'],
  'onbin.voicing': ['Select だ or で after the sound change', 'For example, use 読む → 読んだ or 読んで. Note the voiced sound.'],
  'compound.negative-past': ['Change a negative form to past', 'Change ない to なかった, as in 書かない → 書かなかった.'],
  'compound.polite-past': ['Change ます to past', 'Replace final ます with ました.'],
  'compound.polite-negative': ['Change ます to negative', 'Replace final ます with ません.'],
  'compound.polite-negative-past': ['Change ます to negative past', 'Replace final ます with ませんでした.'],
  'compound.voice-stack': ['Continue conjugating a voice form', 'First form the potential, passive, or causative. Then change the complete expression.'],
  'compound.multi-step': ['Connect passive, desire, and negative past', 'Apply each change in order. Check the final polarity and tense.'],
  'contraction.causative-passive': ['Use the short causative-passive form', 'Godan verbs commonly contract せられる to される.'],
  'exception.aru-negative': ['Use ない as the negative of ある', 'After you form てある, apply this exception for the negative form.'],
  'adj.stem.i-ku': ['Change final い to く', 'For example, use 高い → 高く before you attach a negative or another ending.'],
  'adj.suffix.i-negative': ['Form the negative of an い-adjective', 'For example, use 高い → 高くない.'],
  'adj.suffix.i-past': ['Form the past of an い-adjective', 'For example, use 高い → 高かった.'],
  'adj.compound.i-negative-past': ['Change a negative い-adjective to past', 'For example, use 高くない → 高くなかった.'],
  'adj.exception.ii-yo': ['Use よ for the いい family', 'For example, use いい → よくない or よかった.'],
  'adj.suffix.na-attributive': ['Use な before a noun', 'For example, use 静かな部屋.'],
  'adj.suffix.na-predicative': ['Use だ at the end of a plain predicate', 'For example, use この部屋は静かだ.'],
  'adj.suffix.na-negative': ['Form the negative of a な-adjective', 'For example, use 静かではない.'],
  'adj.suffix.na-past': ['Form the past of a な-adjective', 'For example, use 静かだった.'],
  'adj.compound.na-negative-past': ['Change a negative な-adjective to past', 'For example, use 静かではない → 静かではなかった.'],
  'adj.suffix.na-te': ['Connect a な-adjective with で', 'For example, use 静かで、落ち着く.'],
  'adj.suffix.i-adverb': ['Form an adverb from an い-adjective', 'For example, use 早い → 早く.'],
  'adj.suffix.na-adverb': ['Form an adverb from a な-adjective', 'For example, use 静か → 静かに.'],
  'adj.suffix.i-te': ['Connect an い-adjective with くて', 'For example, use 高い → 高くて.'],
  'adj.suffix.i-ba': ['Form an い-adjective condition with ければ', 'For example, use 高い → 高ければ.'],
  'adj.suffix.na-conditional': ['Form a な-adjective condition with なら', 'For example, use 静か → 静かなら.'],
  'suffix.negative': ['Form the negative of a verb', 'Attach ない to say that an action or state does not occur.'],
  'suffix.past': ['Form the past of a verb', 'Attach た or だ. Apply the required sound change first.'],
  'suffix.te': ['Form the て-form of a verb', 'Attach て or で. Apply the required sound change first.'],
  'suffix.masu': ['Form polite ます', 'Select the correct stem, and then attach ます.'],
  'suffix.passive': ['Form the passive', 'Change the stem and attach れる or られる.'],
  'suffix.potential': ['Form the potential', 'Change the verb to say that an action is possible.'],
  'suffix.imperative': ['Form the imperative', 'Use the verb form that gives a direct command.'],
  'suffix.volitional': ['Form the volitional', 'Use the verb form that states an intention or suggests a shared action.'],
  'suffix.ba': ['Form the ば conditional', 'Change the verb to state a condition.'],
  'suffix.nasai': ['Attach なさい', 'Select the connective stem, and then attach なさい.'],
  'suffix.prohibitive': ['Form the prohibitive with な', 'Attach な to the dictionary form to prohibit an action.'],
  'suffix.causative': ['Form the causative', 'Use the verb form that makes or lets someone do an action.'],
  'suffix.causativePassive': ['Form the causative-passive', 'Use the verb form that says someone is made or led to do an action.'],
  'construction.youtosuru': ['Attach ようとする', 'First form the volitional. Then attach とする to say that an action is about to occur or is attempted.'],
});

const TE_BASES = new Set(['teageru','temorau','tekureru','tekudasai','teiru','teru','tearu','teoru','tehoshii','temo','tewa','temoIi','temiru','teiku','teku','tekuru','teshimau','chau','teoku','toku']);
const MASU_BASES = new Set(['tai','tagaru','nagara','tsutsu','sugiru','masenka']);
const NEGATIVE_BASES = new Set(['nakute','naide','zu','zuni','naideKudasai','nakutemoIi','nakerebaNaranai','nakutewaIkenai','naitoIkenai']);
const PAST_BASES = new Set(['tara','tari','tatte']);
const SHORT_FORMS = new Set(['chau','toku','teru','toru','teku']);

export function focusCopyForLocale(component, locale) {
  const normalized = normalizeLocale(locale);
  if (!normalized) throw new RangeError(`Unsupported focus-copy locale: ${String(locale)}`);
  if (normalized !== 'en') return chineseFocusCopy(component);
  const exact = EN_EXACT[component.id];
  if (exact) return { title: exact[0], detail: exact[1] };
  if (component.id.startsWith('construction.')) {
    const form = component.id.slice('construction.'.length);
    const label = formLabel('en', form);
    const detail = SHORT_FORMS.has(form) ? 'Shorten the form. Check the sound of the contraction.'
      : TE_BASES.has(form) ? 'First form て／で. Then attach this expression.'
        : MASU_BASES.has(form) ? 'First select the ます-stem. Then attach this expression.'
          : NEGATIVE_BASES.has(form) ? 'First form the negative. Then attach this expression.'
            : PAST_BASES.has(form) ? 'First form the past. Then attach this expression.' : null;
    return detail ? { title: `Attach ${label}`, detail } : null;
  }
  if (/^apply\.[^.]+\.continuation$/.test(component.id)) {
    const form = component.id.split('.')[1];
    return form === 'teoru'
      ? { title: 'Change ておる to past', detail: 'First attach ておる. Then change the complete expression to past.' }
      : { title: `Change ${formLabel('en', form)} to negative or past`, detail: 'First form the expression. Then change its final element.' };
  }
  if (component.id.startsWith('composition.')) {
    const [, output, ending] = component.id.split('.');
    const kind = output === 'i-adjective' ? 'い-adjective-type' : 'verb-type';
    const result = { past: 'past', negative: 'negative', negativePast: 'negative past' }[ending];
    return result ? { title: `Change the attached ${kind} expression to ${result}`, detail: 'Complete the first change. Then change the complete expression.' } : null;
  }
  if (component.id.startsWith('compound.chain.')) {
    const label = knowledgeLabel('en', component);
    return label ? { title: `Connect the ${label.replace(/ combination$/u, '')} forms`, detail: 'Apply each change in order. Write the complete form at the end.' } : null;
  }
  return null;
}

