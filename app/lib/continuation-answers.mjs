import { acceptedConjugations } from './conjugation.mjs';

// A supplied canonical causative (〜せる／〜させる) is an ichidan verb.
// Its short causative alternative (〜す) instead inflects as godan, so the
// short result cannot demonstrate the ichidan operation this probe measures.
// Other constructions keep their accepted contractions: dropping い from
// ている, for example, does not substitute a godan tail for an ichidan tail.
export function continuationAnswers({ baseForm, ending, surfaceBase, readingBase, answers, readings }) {
  if (baseForm !== 'causative' || !['past', 'negative', 'negativePast'].includes(ending)
    || !surfaceBase.endsWith('る') || !readingBase.endsWith('る')) {
    return { answers: [...answers], readings: [...readings] };
  }
  const allowedSurface = new Set(acceptedConjugations(surfaceBase, 'ichidan', ending));
  const allowedReading = new Set(acceptedConjugations(readingBase, 'ichidan', ending));
  return {
    answers: answers.filter(answer => allowedSurface.has(answer)),
    readings: readings.filter(answer => allowedReading.has(answer)),
  };
}
