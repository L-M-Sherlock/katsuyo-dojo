import { CHAIN_FORM_SPECS } from '../multi-step-forms.mjs';
import { KC_FAMILY_LABELS } from '../knowledge-model.mjs';
import { formLabel } from './content-forms.mjs';
import { normalizeLocale } from './locales.mjs';

export const KNOWLEDGE_FAMILY_LABELS = Object.freeze({
  'zh-CN': Object.freeze({ ...KC_FAMILY_LABELS }),
  en: Object.freeze({
    classification: 'Word class',
    stem: 'Stem change',
    onbin: 'Sound change',
    connection: 'Attachment',
    compound: 'Compound change',
    contraction: 'Contraction',
    exception: 'Exception',
  }),
});

const EN_EXACT = Object.freeze({
  'class.godan': 'Godan verb',
  'class.ichidan': 'Ichidan verb',
  'class.irregular': 'Irregular verb',
  'heuristic.ru-ie': 'Initial check for an i/e sound before る',
  'heuristic.ru-other': 'Initial check for other verbs that end in る',
  'exception.ru-godan': 'Godan exceptions with an i/e sound before る',
  'stem.ichidan.drop-ru': 'Remove る from an ichidan verb',
  'stem.irregular.connective': 'Connective stems of する and 来る',
  'stem.godan.a': 'Move the godan ending to the a-row',
  'stem.godan.i': 'Move the godan ending to the i-row',
  'stem.godan.e': 'Move the godan ending to the e-row',
  'stem.godan.o': 'Move the godan ending to the o-row',
  'stem.godan.u-wa': 'Change final う to わ before an a-row ending',
  'stem.godan.shi-connective': 'Change final す to し',
  'onbin.sokuon': 'Small-っ sound change for う・つ・る',
  'onbin.hatsuon': 'ん sound change for ぬ・ぶ・む',
  'onbin.i': 'い sound change for く・ぐ',
  'onbin.voicing': 'Use だ or で after the sound change',
  'compound.negative-past': 'Change a negative form to negative past',
  'compound.polite-past': 'Change ます to ました',
  'compound.polite-negative': 'Change ます to ません',
  'compound.polite-negative-past': 'Change ます to ませんでした',
  'compound.voice-stack': 'Continue conjugating a voice form',
  'compound.multi-step': 'Combine passive, desire, and negative past',
  'contraction.causative-passive': 'Contract causative-passive せられる to される',
  'exception.aru-negative': 'Use ない as the negative of ある',
  'adj.class.i': 'い-adjective',
  'adj.class.na': 'な-adjective',
  'adj.stem.i-ku': 'Change final い to く',
  'adj.suffix.i-negative': 'Attach くない to an い-adjective',
  'adj.suffix.i-past': 'Attach かった to an い-adjective',
  'adj.compound.i-negative-past': 'Change a negative い-adjective to negative past',
  'adj.exception.ii-yo': 'Use the よ- stem for the いい family',
  'adj.suffix.i-te': 'Attach くて to an い-adjective',
  'adj.suffix.i-ba': 'Attach ければ to an い-adjective',
  'adj.suffix.i-adverb': 'Attach く to form an い-adjective adverb',
  'adj.suffix.na-attributive': 'Attach な before a noun',
  'adj.suffix.na-predicative': 'Attach だ to form a plain predicate',
  'adj.suffix.na-negative': 'Attach ではない to a な-adjective',
  'adj.suffix.na-past': 'Attach だった to a な-adjective',
  'adj.compound.na-negative-past': 'Change a negative な-adjective to negative past',
  'adj.suffix.na-te': 'Attach で to connect a な-adjective',
  'adj.suffix.na-conditional': 'Attach なら to a な-adjective',
  'adj.suffix.na-adverb': 'Attach に to form a な-adjective adverb',
});

const EN_SUFFIX = Object.freeze({
  negative: 'Attach negative ない', past: 'Attach past た／だ', te: 'Attach て／で',
  masu: 'Attach polite ます', passive: 'Attach the passive ending', potential: 'Attach the potential ending',
  imperative: 'Attach the imperative ending', volitional: 'Attach the volitional ending', ba: 'Attach the ば conditional ending',
  nasai: 'Attach the なさい command', prohibitive: 'Attach prohibitive な to the dictionary form',
  causative: 'Attach the causative ending', causativePassive: 'Attach the causative-passive ending',
});

const CHAIN_FAMILY_LABELS = Object.freeze({
  'compound.chain.temiru-desire-past': 'Trying and desire',
  'compound.chain.passive-progressive-past': 'Passive and progressive or resultant state',
  'compound.chain.causative-receive-past': 'Causative permission received',
  'compound.chain.try-request': 'Trying and a request',
  'compound.chain.try-condition': 'Trying and a condition',
  'compound.chain.prepare-request': 'Advance preparation and a request',
  'compound.chain.prepare-condition': 'Advance preparation and a condition',
  'compound.chain.causative-request': 'Causative permission request',
  'compound.chain.receive-desire': 'Receiving help and desire',
  'compound.chain.receive-potential': 'Receiving help, potential, and a request',
  'compound.chain.potential-polite': 'Potential and polite forms',
  'compound.chain.desire-condition': 'Desire and a condition',
  'compound.chain.excess-request': 'Excess and a negative request',
  'compound.chain.passive-completion': 'Passive and an unwanted result',
  'compound.chain.permission-potential': 'Desire and ability to receive permission',
  'compound.chain.potential-condition': 'Potential and a condition',
});

const endingLabel = ending => ({ past: 'past', negative: 'negative', negativePast: 'negative past' })[ending] ?? ending;

export function knowledgeFamilyLabel(locale, family) {
  const normalized = normalizeLocale(locale);
  if (!normalized) throw new RangeError(`Unsupported knowledge locale: ${String(locale)}`);
  return KNOWLEDGE_FAMILY_LABELS[normalized]?.[family] ?? family;
}

function englishKnowledgeLabel(id) {
  if (EN_EXACT[id]) return EN_EXACT[id];
  if (EN_SUFFIX[id.slice('suffix.'.length)] && id.startsWith('suffix.')) return EN_SUFFIX[id.slice('suffix.'.length)];
  if (CHAIN_FAMILY_LABELS[id]) return `${CHAIN_FAMILY_LABELS[id]} combination`;
  if (id.startsWith('lexeme.ru-godan.')) return `${id.slice('lexeme.ru-godan.'.length)} is a godan verb`;
  if (id === 'facet.class.irregular.suru') return 'Coverage of する-family verbs';
  if (id === 'facet.class.irregular.kuru') return 'Coverage of 来る';
  if (id === 'facet.onbin.sokuon.iku') return 'Coverage of the 行く small-っ exception';
  if (id === 'facet.adj.class.na.regular') return 'Coverage of regular な-adjectives';
  if (id === 'facet.adj.class.na.i-ending') return 'Coverage of な-adjectives that end in い';
  if (id === 'facet.stem.connective.suru') return 'Coverage of the する connective stem';
  if (id === 'facet.stem.connective.kuru') return 'Coverage of the 来る connective stem';
  if (id.startsWith('facet.form.')) {
    const [, , form, kind] = id.split('.');
    return `Coverage of ${kind === 'suru' ? 'する-family verbs' : '来る'} in ${formLabel('en', form)}`;
  }
  if (id.startsWith('construction.')) return `${formLabel('en', id.slice('construction.'.length))} attachment`;
  if (id.startsWith('apply.') && id.endsWith('.continuation')) {
    const form = id.split('.')[1];
    return `Further conjugation of ${formLabel('en', form)}`;
  }
  if (id.startsWith('facet.apply.')) {
    const [, , form, ending] = id.split('.');
    return `${formLabel('en', form)} — ${endingLabel(ending)} coverage`;
  }
  if (id.startsWith('facet.chain.')) {
    const spec = Object.values(CHAIN_FORM_SPECS).find(value => value.facetId === id);
    if (spec) return `${formLabel('en', Object.entries(CHAIN_FORM_SPECS).find(([, value]) => value === spec)?.[0])} coverage`;
  }
  if (id.startsWith('composition.')) {
    const [, output, ending] = id.split('.');
    return `Change the attached ${output === 'i-adjective' ? 'い-adjective-type' : 'verb-type'} expression to ${endingLabel(ending)}`;
  }
  if (id.startsWith('exception.suru.')) return `する change in ${formLabel('en', id.slice('exception.suru.'.length))}`;
  if (id.startsWith('exception.kuru.')) return `来る change in ${formLabel('en', id.slice('exception.kuru.'.length))}`;
  return null;
}

/** Return the learner-facing label for a stable knowledge-component ID. */
export function knowledgeLabel(locale, componentOrId) {
  const component = typeof componentOrId === 'string' ? null : componentOrId;
  const id = component?.id ?? componentOrId;
  const normalized = normalizeLocale(locale);
  if (!normalized) throw new RangeError(`Unsupported knowledge locale: ${String(locale)}`);
  if (normalized !== 'en') return component?.label ?? id;
  return englishKnowledgeLabel(id);
}

export function localizeKnowledgeComponent(component, locale) {
  const label = knowledgeLabel(locale, component);
  if (!label) throw new Error(`Missing ${locale} knowledge label: ${component.id}`);
  return { ...component, label };
}

export function localizeKnowledgeComponents(components, locale) {
  return components.map(component => localizeKnowledgeComponent(component, locale));
}

