import {EXPECTED_SHIMAU_USER_HELD_IDS, EXPECTED_SHIMAU_USER_HELD_PAIRS} from './shimau-user-teaching-hold-scope.mjs';
import {EXPECTED_TEMIRU_TEACHING_HOLD_IDS, EXPECTED_TEMIRU_TEACHING_HOLD_PAIRS} from './temiru-teaching-hold-scope.mjs';

// The temiru evidence above remains an eight-pair historical record. Current
// teaching additionally applies the separately documented user choices below.
export const EXPECTED_PRIOR_TEACHING_HOLD_IDS = new Set([
  ...EXPECTED_TEMIRU_TEACHING_HOLD_IDS,
  'usage:chau:verb:役立つ:やくだつ',
]);

export const EXPECTED_PRIOR_TEACHING_HOLD_PAIRS = new Set([
  ...EXPECTED_TEMIRU_TEACHING_HOLD_PAIRS,
  'verb:役立つ:やくだつ/chau',
]);

// Independent exact scope from the user's later completion-tone choices.
// Keep this separate from the earlier 118-row choice and its frozen partition.
export const EXPECTED_COMPLETION_TONE_USER_HOLD_IDS = new Set([
  'usage:chau:verb:喜ぶ:よろこぶ',
  'usage:teshimau:verb:注ぐ:そそぐ',
  'usage:teshimau:verb:始める:はじめる',
  'usage:teshimau:verb:生まれる:うまれる',
  'usage:teshimau:verb:止める:とめる',
  'usage:teshimau:verb:集める:あつめる',
  'usage:teshimau:verb:する:する',
  'usage:chau:verb:咲く:さく',
  'usage:chau:verb:見せる:みせる',
]);

export const EXPECTED_COMPLETION_TONE_USER_HOLD_PAIRS = new Set([
  'verb:喜ぶ:よろこぶ/chau',
  'verb:注ぐ:そそぐ/teshimau',
  'verb:始める:はじめる/teshimau',
  'verb:生まれる:うまれる/teshimau',
  'verb:止める:とめる/teshimau',
  'verb:集める:あつめる/teshimau',
  'verb:する:する/teshimau',
  'verb:咲く:さく/chau',
  'verb:見せる:みせる/chau',
]);

export const EXPECTED_CURRENT_TEACHING_HOLD_IDS = new Set([
  ...EXPECTED_PRIOR_TEACHING_HOLD_IDS,
  ...EXPECTED_SHIMAU_USER_HELD_IDS,
  ...EXPECTED_COMPLETION_TONE_USER_HOLD_IDS,
]);

export const EXPECTED_CURRENT_TEACHING_HOLD_PAIRS = new Set([
  ...EXPECTED_PRIOR_TEACHING_HOLD_PAIRS,
  ...EXPECTED_SHIMAU_USER_HELD_PAIRS,
  ...EXPECTED_COMPLETION_TONE_USER_HOLD_PAIRS,
]);
