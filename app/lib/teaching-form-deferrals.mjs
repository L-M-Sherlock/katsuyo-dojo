// Reversible teaching choices. These do not remove morphology or historical
// review evidence, and they are not claims that a Japanese form is impossible.
export const USER_DIRECTED_FORM_DEFERRALS = Object.freeze([
  Object.freeze({
    form: 'temiruNegativePast',
    basis: 'user-directed-teaching-hold',
    requestedAt: '2026-10-17',
    reason: '按用户要求，暂缓所有「てみる」过去否定形式的常规及自由挑战出题；保留构形、完整词形识别与历史学习记录，不认定该形式在所有语境中不成立。',
    restoreCondition: '用户明确要求恢复后，按当前专项规则复核拟恢复的自然例句、中英内容和注音，并同步恢复教学覆盖要求。',
  }),
  ...['tearuNegative', 'tearuNegativePast', 'temiruDesireNegative', 'temiruDesireNegativePast'].map(form => Object.freeze({
    form,
    basis: 'user-directed-teaching-hold',
    requestedAt: '2026-10-27',
    reason: '按用户明确选择，暂缓该完整形式在当前及未来词条中的常规及自由挑战出题；这是可恢复的教学安排，不认定该语法形式不存在，保留构形、完整词形识别和历史学习证据。',
    restoreCondition: '须有用户明确恢复指令，并按当前专项规则复核拟恢复的自然例句、中英内容和注音，重新核验教学供应、覆盖要求及历史复测路径后恢复。',
    evidenceFile: 'docs/form-hold-baseline-20261027.json.gz',
  })),
]);

export const USER_DIRECTED_DEFERRED_FORMS = new Set(USER_DIRECTED_FORM_DEFERRALS.map(row => row.form));
export const isTeachingFormDeferred = form => USER_DIRECTED_DEFERRED_FORMS.has(form);
