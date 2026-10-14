/** Stable import failures. UI code can translate `code` and `params` while
 * existing callers can continue to show the Chinese `message`. */
export const PROFILE_IMPORT_ERROR_CODES = Object.freeze({
  INVALID_FILE: 'profile.invalid-file',
  UNSUPPORTED_FORMAT: 'profile.unsupported-format',
  UNSUPPORTED_VERSION: 'profile.unsupported-version',
  INVALID_DATA: 'profile.invalid-data',
  INVALID_PRACTICE_LOG: 'profile.invalid-practice-log',
  INVALID_ASSESSMENT: 'profile.invalid-assessment',
  INVALID_STATISTICS: 'profile.invalid-statistics',
  INVALID_SCORE_CORRECTIONS: 'profile.invalid-score-corrections',
  INVALID_PRACTICE_GOAL: 'profile.invalid-practice-goal',
});

export const PROFILE_IMPORT_MESSAGE_KEYS = Object.freeze({
  [PROFILE_IMPORT_ERROR_CODES.UNSUPPORTED_FORMAT]: 'practice.importErrors.unsupportedFormat',
  [PROFILE_IMPORT_ERROR_CODES.UNSUPPORTED_VERSION]: 'practice.importErrors.unsupportedVersion',
  [PROFILE_IMPORT_ERROR_CODES.INVALID_DATA]: 'practice.importErrors.invalidData',
  [PROFILE_IMPORT_ERROR_CODES.INVALID_PRACTICE_LOG]: 'practice.importErrors.invalidPracticeLog',
  [PROFILE_IMPORT_ERROR_CODES.INVALID_ASSESSMENT]: 'practice.importErrors.invalidAssessment',
  [PROFILE_IMPORT_ERROR_CODES.INVALID_STATISTICS]: 'practice.importErrors.invalidStatistics',
  [PROFILE_IMPORT_ERROR_CODES.INVALID_SCORE_CORRECTIONS]: 'practice.importErrors.invalidScoreCorrections',
  [PROFILE_IMPORT_ERROR_CODES.INVALID_PRACTICE_GOAL]: 'practice.importErrors.invalidPracticeGoal',
});

export class ProfileImportError extends Error {
  constructor(code, message, params = {}, options = undefined) {
    super(message, options);
    this.name = 'ProfileImportError';
    this.code = code;
    this.params = params;
  }
}

export function profileImportError(code, message, params = {}) {
  return new ProfileImportError(code, message, params);
}

export function profileImportMessageKey(error) {
  return error instanceof ProfileImportError
    ? PROFILE_IMPORT_MESSAGE_KEYS[error.code] ?? 'practice.importUnreadable'
    : 'practice.importUnreadable';
}

/** Preserve detailed legacy messages while ensuring every import failure has
 * a stable code for the localized UI boundary. */
export function normalizeProfileImportError(error) {
  if (error instanceof ProfileImportError) return error;
  const message = error instanceof Error ? error.message : '备份数据不完整或不受支持。';
  const code = message.startsWith('学习评估数据') ? PROFILE_IMPORT_ERROR_CODES.INVALID_ASSESSMENT
    : message.startsWith('统计数据') ? PROFILE_IMPORT_ERROR_CODES.INVALID_STATISTICS
      : message.startsWith('归因校正记录') ? PROFILE_IMPORT_ERROR_CODES.INVALID_SCORE_CORRECTIONS
        : PROFILE_IMPORT_ERROR_CODES.INVALID_DATA;
  return new ProfileImportError(code, message, {}, { cause: error });
}
