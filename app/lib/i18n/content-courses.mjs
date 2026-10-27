import { COURSE_BY_ID, COURSE_STAGES, UNIFIED_COURSES } from '../unified-curriculum.mjs';
import { DEFAULT_LOCALE, normalizeLocale } from './locales.mjs';

/**
 * @typedef {object} LocalizableCourse
 * @property {string} id
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [lesson]
 * @property {string} [url]
 * @property {readonly string[]} [forms]
 * @property {string} [domain]
 * @property {number} [stage]
 * @property {string} [stageId]
 * @property {string} [stageLabel]
 * @property {string} [stageObjective]
 * @property {boolean} [review]
 * @property {number} [order]
 */

/** @typedef {LocalizableCourse & {title:string, description:string, stageLabel:string, stageObjective:string, lessonLabel:string, url:string}} LocalizedCourse */

/**
 * @typedef {object} LocalizableCourseStage
 * @property {string} id
 * @property {string} [label]
 * @property {string} [objective]
 * @property {readonly string[]} [courseIds]
 */

/** @typedef {LocalizableCourseStage & {label:string, objective:string}} LocalizedCourseStage */

export const ENGLISH_YOKUBI_URL = 'https://yoku.bi';

const EN_STAGE_CONTENT = Object.freeze({
  basics: Object.freeze({
    label: 'Basic forms',
    objective: 'Identify word classes and form basic affirmative, negative, tense, polite, modifying, and linking patterns.',
  }),
  voice: Object.freeze({
    label: 'Potential and voice',
    objective: 'Form the potential, passive, causative, and causative-passive. Then practice their negative and past forms.',
  }),
  linking: Object.freeze({
    label: 'Links and conditions',
    objective: 'Connect actions and descriptions to express conditions, concessions, simultaneous actions, and lists.',
  }),
  intentions: Object.freeze({
    label: 'Intentions and requests',
    objective: 'Express desires, intentions, requests, commands, prohibitions, permission, invitations, and obligations.',
  }),
  actions: Object.freeze({
    label: 'Actions and states',
    objective: 'Describe ongoing actions, resulting states, attempts, preparation, direction, degree, and giving or receiving.',
  }),
  integration: Object.freeze({
    label: 'Combined use',
    objective: 'Combine voice, desire, attempts, states, and giving or receiving in complete expressions.',
  }),
});

const EN_COURSE_CONTENT = Object.freeze({
  classify: Object.freeze({
    title: 'Verb classification',
    description: 'Identify godan, ichidan, and irregular verbs. Practice ending checks and common exceptions.',
  }),
  adjectiveClassify: Object.freeze({
    title: 'Adjective classification',
    description: 'Distinguish i-adjectives from na-adjectives, including na-adjectives that end in i.',
  }),
  masu: Object.freeze({
    title: 'Verb ます-stems and the ます-form',
    description: 'A ます-stem does not include ます. Add ます to write the complete ます-form. Practice regular verbs, する, and くる.',
  }),
  adjectiveIBase: Object.freeze({
    title: 'Basic i-adjective conjugation',
    description: 'Practice negative, past, and negative-past i-adjectives, including the よ-forms of いい.',
  }),
  adjectiveNaBase: Object.freeze({
    title: 'Basic na-adjective conjugation',
    description: 'Practice attributive, predicative, negative, past, negative-past, and で-linking na-adjective forms.',
  }),
  adjectiveAdverb: Object.freeze({
    title: 'Adverbial adjective forms',
    description: 'Form adverbs with く after i-adjectives and に after na-adjectives.',
  }),
  negative: Object.freeze({
    title: 'Negative verb form',
    description: 'Practice the ない-form of verbs, including stem changes and irregular attachments.',
  }),
  past: Object.freeze({
    title: 'Past verb form',
    description: 'Practice past verb forms with た or だ, including sound changes and the いく exception.',
  }),
  basicCompound: Object.freeze({
    title: 'Basic compound verb forms',
    description: 'Combine verb negation with past tense. Also practice past and negative masu-forms.',
  }),
  te: Object.freeze({
    title: 'Verb て-form',
    description: 'Practice verb links with て or で and the sound changes that these links require.',
  }),
  adjectiveITe: Object.freeze({
    title: 'i-adjective て-form',
    description: 'Connect i-adjectives with くて, including the よ-forms of いい.',
  }),
  potential: Object.freeze({
    title: 'Potential form',
    description: 'Form the basic potential. A later course covers its negative and past forms.',
  }),
  passive: Object.freeze({
    title: 'Passive form',
    description: 'Form the basic passive. A later course covers its negative and past forms.',
  }),
  causative: Object.freeze({
    title: 'Causative form',
    description: 'Form the basic causative. A later course covers its negative and past forms.',
  }),
  causativePassive: Object.freeze({
    title: 'Causative-passive form',
    description: 'Practice the causative-passive and its contraction. A later course covers negative and past forms.',
  }),
  voiceCompound: Object.freeze({
    title: 'Further conjugation of potential and voice forms',
    description: 'Change complete potential, passive, causative, and causative-passive forms to negative, past, or negative past.',
  }),
  nakuteNaide: Object.freeze({
    title: 'Negative verb links: なくて and ないで',
    description: 'Attach なくて or ないで after a negative verb form to connect expressions.',
  }),
  zuZuni: Object.freeze({
    title: 'ず and ずに',
    description: 'Practice ず and ずに, including the irregular change from する to せず.',
  }),
  ba: Object.freeze({
    title: 'Verb ば-conditional',
    description: 'Practice the verb ば-conditional. The adjective course covers adjective conditional forms.',
  }),
  adjectiveConditional: Object.freeze({
    title: 'Adjective conditional forms',
    description: 'Form i-adjective conditions with ければ and na-adjective conditions with なら.',
  }),
  tara: Object.freeze({
    title: 'Verb たら-form',
    description: 'Attach ら after the past verb form to express a condition or a situation after an action.',
  }),
  temo: Object.freeze({
    title: 'Concessive verb links: ても and でも',
    description: 'Practice verb forms with ても or でも to express a concessive condition.',
  }),
  tatte: Object.freeze({
    title: 'たって',
    description: 'Practice colloquial concessive conditions with たって or だって.',
  }),
  concurrent: Object.freeze({
    title: 'ながら and つつ',
    description: 'Attach ながら or つつ to a verb connective stem to express simultaneous actions.',
  }),
  listing: Object.freeze({
    title: 'たり and ては',
    description: 'Practice たり for lists and ては for situations that occur repeatedly.',
  }),
  desire: Object.freeze({
    title: 'たい and てほしい',
    description: 'First attach たい and てほしい. Then practice their negative and past forms.',
  }),
  tagaru: Object.freeze({
    title: 'たがる',
    description: 'First attach たがる. Then conjugate the result as a godan verb for negative and past forms.',
  }),
  volitional: Object.freeze({
    title: 'Volitional form',
    description: 'Practice the volitional to state your intention or suggest a shared action.',
  }),
  youtosuru: Object.freeze({
    title: 'ようとする',
    description: 'Attach ようとする to the volitional. Then practice the negative and past forms of the complete expression.',
  }),
  request: Object.freeze({
    title: 'てください and ないでください',
    description: 'Practice affirmative requests with てください and negative requests with ないでください.',
  }),
  imperative: Object.freeze({
    title: 'Imperative form',
    description: 'Practice the verb imperative, including irregular changes.',
  }),
  nasai: Object.freeze({
    title: 'なさい command',
    description: 'Attach なさい to a verb connective stem to give a command.',
  }),
  prohibitive: Object.freeze({
    title: 'Prohibitive form with な',
    description: 'Attach な to the dictionary form to prohibit an action.',
  }),
  permission: Object.freeze({
    title: 'Permission, lack of obligation, and invitations',
    description: 'Use てもいい for permission, なくてもいい for a lack of obligation, and ませんか for an invitation.',
  }),
  obligation: Object.freeze({
    title: 'Obligatory expressions',
    description: 'Practice なければならない, なくてはいけない, and ないといけない.',
  }),
  aspect: Object.freeze({
    title: 'ている, てある, and ておる',
    description: 'Practice ている, てある, ておる, and their contractions. For てある and ておる, this course currently uses only basic and past forms. Negative continuations use ている.',
  }),
  giving: Object.freeze({
    title: 'Giving and receiving: てあげる, てもらう, and てくれる',
    description: 'Attach the three giving and receiving expressions. Then practice their negative and past forms.',
  }),
  temiru: Object.freeze({
    title: 'てみる',
    description: 'Practice てみる for an attempt, its past form, and invitations with 〜てみない？. Negative-past questions are on hold.',
  }),
  teshimauChau: Object.freeze({
    title: 'てしまう and ちゃう',
    description: 'Practice てしまう and its ちゃう or じゃう contraction. Then practice negative and past forms of てしまう.',
  }),
  teokuToku: Object.freeze({
    title: 'ておく and とく',
    description: 'Practice ておく and its とく or どく contraction. Then practice negative and past forms of ておく.',
  }),
  direction: Object.freeze({
    title: 'ていく and てくる',
    description: 'Practice ていく, てくる, and the てく contraction. Then practice negative and past forms of ていく and てくる.',
  }),
  sugiru: Object.freeze({
    title: 'すぎる',
    description: 'Attach すぎる to express excess. Then practice the negative and past forms of the complete expression.',
  }),
  multiStepCompound: Object.freeze({
    title: 'Compound conjugation of multiple expressions',
    description: 'Combine attempts, desire, passive, giving or receiving, and advance preparation with common requests, conditions, politeness, polarity, and tense.',
  }),
});

function immutableMap(entries) {
  return Object.freeze(Object.fromEntries(entries));
}

const ZH_CN_STAGE_CONTENT = immutableMap(COURSE_STAGES.map(stage => [stage.id, Object.freeze({
  label: stage.label,
  objective: stage.objective,
})]));

const ZH_CN_COURSE_CONTENT = immutableMap(UNIFIED_COURSES.map(course => [course.id, Object.freeze({
  title: course.title,
  description: course.description,
})]));

export const COURSE_STAGE_CONTENT_BY_LOCALE = Object.freeze({
  'zh-CN': ZH_CN_STAGE_CONTENT,
  en: EN_STAGE_CONTENT,
});

export const COURSE_CONTENT_BY_LOCALE = Object.freeze({
  'zh-CN': ZH_CN_COURSE_CONTENT,
  en: EN_COURSE_CONTENT,
});

function requireContentLocale(locale) {
  const normalized = normalizeLocale(locale);
  if (!normalized || !Object.hasOwn(COURSE_CONTENT_BY_LOCALE, normalized)) {
    throw new RangeError(`Unsupported course locale: ${String(locale)}`);
  }
  return normalized;
}

/** Return all localized stage labels and objectives, keyed by stable stage ID. */
export function courseStageContentForLocale(locale = DEFAULT_LOCALE) {
  return COURSE_STAGE_CONTENT_BY_LOCALE[requireContentLocale(locale)];
}

/** Return all localized course titles and descriptions, keyed by stable course ID. */
export function courseContentForLocale(locale = DEFAULT_LOCALE) {
  return COURSE_CONTENT_BY_LOCALE[requireContentLocale(locale)];
}

/** Return one localized stage sidecar, or null for an unknown stable ID. */
export function courseStageContentFor(stageOrId, locale = DEFAULT_LOCALE) {
  const id = typeof stageOrId === 'string' ? stageOrId : stageOrId?.id;
  return typeof id === 'string' ? courseStageContentForLocale(locale)[id] ?? null : null;
}

/** Return one localized course sidecar, or null for an unknown stable ID. */
export function courseContentFor(courseOrId, locale = DEFAULT_LOCALE) {
  const id = typeof courseOrId === 'string' ? courseOrId : courseOrId?.id;
  return typeof id === 'string' ? courseContentForLocale(locale)[id] ?? null : null;
}

/** Convert a Chinese Yokubi lesson URL to the matching English lesson URL. */
export function englishYokubiUrl(sourceUrl) {
  try {
    const source = new URL(sourceUrl);
    const lessonPath = source.pathname.match(/\/(Section\d+\/Part\d+\/Lesson\d+\.html)$/u)?.[1];
    return lessonPath ? `${ENGLISH_YOKUBI_URL}/${lessonPath}` : ENGLISH_YOKUBI_URL;
  } catch {
    return ENGLISH_YOKUBI_URL;
  }
}

/**
 * Return a localized course view without changing any learning identity fields.
 * @param {LocalizableCourse|string|null|undefined} courseOrId
 * @param {string} [locale]
 * @returns {LocalizedCourse|null}
 */
export function localizeCourse(courseOrId, locale = DEFAULT_LOCALE) {
  const course = typeof courseOrId === 'string' ? COURSE_BY_ID.get(courseOrId) : courseOrId;
  if (!course?.id) return null;
  const normalized = requireContentLocale(locale);
  const content = courseContentFor(course.id, normalized);
  const stageContent = courseStageContentFor(course.stageId, normalized);
  if (!content) throw new Error(`Missing ${normalized} course content: ${course.id}`);
  if (!stageContent) throw new Error(`Missing ${normalized} course-stage content: ${course.stageId}`);
  return {
    ...course,
    title: content.title,
    description: content.description,
    stageLabel: stageContent.label,
    stageObjective: stageContent.objective,
    lessonLabel: normalized === 'en' && course.lesson === '复习' ? 'Review' : course.lesson,
    url: normalized === 'en' ? englishYokubiUrl(course.url) : course.url,
  };
}

/**
 * Localize a course list while preserving its input order.
 * @param {readonly LocalizableCourse[]} [courses]
 * @param {string} [locale]
 * @returns {LocalizedCourse[]}
 */
export function localizeCourses(courses, locale = DEFAULT_LOCALE) {
  return (courses ?? UNIFIED_COURSES).map(course => {
    const localized = localizeCourse(course, locale);
    if (!localized) throw new Error(`Cannot localize course without a stable ID`);
    return localized;
  });
}

/**
 * Return a localized stage view while preserving its course membership.
 * @param {LocalizableCourseStage|string|null|undefined} stageOrId
 * @param {string} [locale]
 * @returns {LocalizedCourseStage|null}
 */
export function localizeCourseStage(stageOrId, locale = DEFAULT_LOCALE) {
  const stage = typeof stageOrId === 'string' ? COURSE_STAGES.find(value => value.id === stageOrId) : stageOrId;
  if (!stage?.id) return null;
  const content = courseStageContentFor(stage.id, locale);
  if (!content) throw new Error(`Missing ${locale} course-stage content: ${stage.id}`);
  return { ...stage, label: content.label, objective: content.objective };
}

/**
 * Localize a stage list while preserving its input order and course membership.
 * @param {readonly LocalizableCourseStage[]} [stages]
 * @param {string} [locale]
 * @returns {LocalizedCourseStage[]}
 */
export function localizeCourseStages(stages, locale = DEFAULT_LOCALE) {
  return (stages ?? COURSE_STAGES).map(stage => {
    const localized = localizeCourseStage(stage, locale);
    if (!localized) throw new Error(`Cannot localize course stage without a stable ID`);
    return localized;
  });
}
