import {EXPECTED_SHIMAU_USER_HELD_IDS, EXPECTED_SHIMAU_USER_HELD_PAIRS} from './shimau-user-teaching-hold-scope.mjs';
import {EXPECTED_TEMIRU_TEACHING_HOLD_IDS, EXPECTED_TEMIRU_TEACHING_HOLD_PAIRS} from './temiru-teaching-hold-scope.mjs';

// The temiru evidence above remains an eight-pair historical record. Current
// teaching additionally applies the separately documented shimau choices.
export const EXPECTED_PRIOR_TEACHING_HOLD_IDS = new Set([
  ...EXPECTED_TEMIRU_TEACHING_HOLD_IDS,
  'usage:chau:verb:役立つ:やくだつ',
]);

export const EXPECTED_PRIOR_TEACHING_HOLD_PAIRS = new Set([
  ...EXPECTED_TEMIRU_TEACHING_HOLD_PAIRS,
  'verb:役立つ:やくだつ/chau',
]);

export const EXPECTED_CURRENT_TEACHING_HOLD_IDS = new Set([
  ...EXPECTED_PRIOR_TEACHING_HOLD_IDS,
  ...EXPECTED_SHIMAU_USER_HELD_IDS,
]);

export const EXPECTED_CURRENT_TEACHING_HOLD_PAIRS = new Set([
  ...EXPECTED_PRIOR_TEACHING_HOLD_PAIRS,
  ...EXPECTED_SHIMAU_USER_HELD_PAIRS,
]);
