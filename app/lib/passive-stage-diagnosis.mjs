import { acceptedConjugations } from './conjugation.mjs';

const GODAN_ROWS = {
  う: ['わ', 'い', 'う', 'え', 'お'],
  く: ['か', 'き', 'く', 'け', 'こ'],
  ぐ: ['が', 'ぎ', 'ぐ', 'げ', 'ご'],
  す: ['さ', 'し', 'す', 'せ', 'そ'],
  つ: ['た', 'ち', 'つ', 'て', 'と'],
  ぬ: ['な', 'に', 'ぬ', 'ね', 'の'],
  ぶ: ['ば', 'び', 'ぶ', 'べ', 'ぼ'],
  む: ['ま', 'み', 'む', 'め', 'も'],
  る: ['ら', 'り', 'る', 'れ', 'ろ'],
};
const CONTINUATIONS = new Map([
  ['passive', null],
  ['passivePast', 'past'],
  ['passiveNegative', 'negative'],
  ['passiveNegativePast', 'negativePast'],
  ['passiveDesireNegativePast', 'taiNegativePast'],
]);

function continuePassive(base, continuation) {
  return continuation === null ? [base] : acceptedConjugations(base, 'ichidan', continuation);
}

/**
 * Locate a bounded construction error without choosing between its stem and
 * suffix rules. Call only after more precise whole-answer diagnoses fail.
 *
 * Every candidate preserves the entire lexical root. Its continuation is
 * generated from the candidate intermediate verb, so a familiar final suffix
 * alone cannot establish that the remaining operations are intact. Matching
 * this structure does not establish the learner's reason for producing it,
 * nor provide positive evidence for the later rules.
 */
export function diagnosePassiveStageError(item, form, answer, normalize = value => value) {
  if (item?.domain !== 'verb' || item.class !== 'godan'
    || !CONTINUATIONS.has(form) || typeof answer !== 'string') return null;

  const words = [...new Set([item.surface, item.reading])]
    .filter(word => typeof word === 'string' && word.length > 1 && GODAN_ROWS[word.at(-1)]);
  if (!words.length) return null;
  const actual = normalize(answer);
  if (words.some(word => acceptedConjugations(word, 'godan', form)
    .some(correct => normalize(correct) === actual))) return null;

  for (const word of words) {
    const root = word.slice(0, -1);
    const correctBases = new Set(acceptedConjugations(word, 'godan', 'passive'));
    for (const row of GODAN_ROWS[word.at(-1)]) {
      for (const suffix of ['れる', 'られる']) {
        const base = `${root}${row}${suffix}`;
        if (correctBases.has(base)) continue;
        if (!continuePassive(base, CONTINUATIONS.get(form))
          .some(candidate => normalize(candidate) === actual)) continue;
        return {
          kcId: null,
          confirmedKcIds: [],
          message: '问题集中在受身形的构造，先分别检查词干与受身接续；后续形式将用正确中间形式单独练习。本次尚未更新知识点。',
          stage: {
            form: 'passive',
            label: '受身形构造',
            candidateKcIds: ['stem.godan.a', 'suffix.passive'],
          },
        };
      }
    }
  }
  return null;
}
