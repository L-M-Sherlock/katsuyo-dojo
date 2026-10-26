import {isTeachingFormDeferred} from './teaching-form-deferrals.mjs';

// Reversible, exact sense/form teaching holds applied after historical reviews.
// Source objects and earlier language judgments remain unchanged.
export const TEACHING_PAIR_DEFERRALS = Object.freeze([
  Object.freeze({
    "id": "usage:temiruPast:verb:いる:いる",
    "pair": "verb:いる:いる/temiruPast",
    "senseId": "verb:いる:いる",
    "form": "temiruPast",
    "sourceHash": "a4ad13dba3ad52a35685af8b666295dd3016b7c6218c7cad9664e74f0cd59ec4",
    "englishHash": "1964405880ef5a66fc2a43fc8f018bfa789a049efb2a1b9a07218fe65e0b2b33",
    "basis": "user-directed-teaching-hold",
    "requestedAt": "2026-10-26",
    "reason": "用户对当前「いる＋てみた」例句的日常教学自然度提出具体疑点并要求暂缓；明确地点、时段或主动停留的解释不足以单独作为恢复依据。保留构形、词形识别及历史复测，不断言该表达在所有语境下都不成立。",
    "restoreCondition": "用户同意恢复，且新的自然日常场景已完成独立审核，并核验中英内容、注音与教学供应后，按精确配对恢复。"
  }),
  Object.freeze({
    "id": "usage:temiruDesireNegativePast:verb:帰る:かえる",
    "pair": "verb:帰る:かえる/temiruDesireNegativePast",
    "senseId": "verb:帰る:かえる",
    "form": "temiruDesireNegativePast",
    "sourceHash": "117b56bb89bb06b0dda4246a139af7af52c09bd8be4b3fc3e98435c1d17da8f8",
    "englishHash": "c68775da002d99fdf1942bb4e7f6eb02d586adfc8f788c0b9a9e815d7d5ad03e",
    "basis": "user-directed-teaching-hold",
    "requestedAt": "2026-10-26",
    "reason": "用户审阅原句后认为该处境将普通行为或自发反应勉强包装成尝试，明确要求暂缓这个精确配对；保留构形、词形识别和历史复测，不将这一教学选择扩成整个语法形式禁用。",
    "restoreCondition": "用户同意恢复，且新例句在固定词义、目标形式下通过独立自然度与中英注音审核后，按精确配对恢复。"
  }),
  Object.freeze({
    "id": "usage:temiruDesireNegativePast:verb:手伝う:てつだう",
    "pair": "verb:手伝う:てつだう/temiruDesireNegativePast",
    "senseId": "verb:手伝う:てつだう",
    "form": "temiruDesireNegativePast",
    "sourceHash": "693fc07207a74034b097977c71a4e5a82a84c1be01ea48b1a8b36354e2998b19",
    "englishHash": "9aec098dd4e2b05873ed7f7f028316afaf103c46c87c49a0df6a0f5eaa08c52c",
    "basis": "user-directed-teaching-hold",
    "requestedAt": "2026-10-26",
    "reason": "用户审阅原句后认为该处境将普通行为或自发反应勉强包装成尝试，明确要求暂缓这个精确配对；保留构形、词形识别和历史复测，不将这一教学选择扩成整个语法形式禁用。",
    "restoreCondition": "用户同意恢复，且新例句在固定词义、目标形式下通过独立自然度与中英注音审核后，按精确配对恢复。"
  }),
  Object.freeze({
    "id": "usage:temiruPast:verb:笑う:わらう",
    "pair": "verb:笑う:わらう/temiruPast",
    "senseId": "verb:笑う:わらう",
    "form": "temiruPast",
    "sourceHash": "3bd34fac869fbb2228f9a4b05b5f82f901db6bb69e35283e1921b7bbb609cb65",
    "englishHash": "03d6f9597a327ec5f607220470629b6c9856a8676a950a78bb925fb2118ba7a2",
    "basis": "user-directed-teaching-hold",
    "requestedAt": "2026-10-26",
    "reason": "用户审阅原句后认为该处境将普通行为或自发反应勉强包装成尝试，明确要求暂缓这个精确配对；保留构形、词形识别和历史复测，不将这一教学选择扩成整个语法形式禁用。",
    "restoreCondition": "用户同意恢复，且新例句在固定词义、目标形式下通过独立自然度与中英注音审核后，按精确配对恢复。"
  }),
  Object.freeze({
    "id": "usage:temiruNegative:verb:運ぶ:はこぶ",
    "pair": "verb:運ぶ:はこぶ/temiruNegative",
    "senseId": "verb:運ぶ:はこぶ",
    "form": "temiruNegative",
    "sourceHash": "c0fefb8526fb9692b596f0c7ceb2eaad6e690913cce663149cbcc63285c26db4",
    "englishHash": "5ffcd192f16a5bc70372d4efea649711972f2035f21534bc92650f4b94e8eedf",
    "basis": "user-directed-teaching-hold",
    "requestedAt": "2026-10-26",
    "reason": "用户审阅原句后认为该处境将普通行为或自发反应勉强包装成尝试，明确要求暂缓这个精确配对；保留构形、词形识别和历史复测，不将这一教学选择扩成整个语法形式禁用。",
    "restoreCondition": "用户同意恢复，且新例句在固定词义、目标形式下通过独立自然度与中英注音审核后，按精确配对恢复。"
  }),
  Object.freeze({
    "id": "usage:temiruNegative:verb:終わる:おわる",
    "pair": "verb:終わる:おわる/temiruNegative",
    "senseId": "verb:終わる:おわる",
    "form": "temiruNegative",
    "sourceHash": "52b461e326203f79d6a725ba0e4e5df5df7ff500da80d04fefb4f0262cfffc4f",
    "englishHash": "b649af85409b4d15e87c41a8255b537885b1656c8a568df2843ce0bb040f9ba3",
    "basis": "user-directed-teaching-hold",
    "requestedAt": "2026-10-26",
    "reason": "用户在明确获知建议需要更换原动词后，选择暂缓这三个原配对以避免继续硬造句；此处仅记录精确教学选择，不宣称该形式在所有语境下都不存在自然表达。",
    "restoreCondition": "用户同意恢复，且固定原词义、目标形式的新例句通过独立自然度、中英内容和注音审核后，按配对恢复。"
  }),
  Object.freeze({
    "id": "usage:temiruNegative:verb:遅れる:おくれる",
    "pair": "verb:遅れる:おくれる/temiruNegative",
    "senseId": "verb:遅れる:おくれる",
    "form": "temiruNegative",
    "sourceHash": "725435df5fc86fb55a4f12183a88ec9cf6e23b61812e4e890ed7ac00346080c0",
    "englishHash": "23535ffad37e0276dfefd003d5086f14b8691b8891f12d54cf66e47c5f83b17e",
    "basis": "user-directed-teaching-hold",
    "requestedAt": "2026-10-26",
    "reason": "用户在明确获知建议需要更换原动词后，选择暂缓这三个原配对以避免继续硬造句；此处仅记录精确教学选择，不宣称该形式在所有语境下都不存在自然表达。",
    "restoreCondition": "用户同意恢复，且固定原词义、目标形式的新例句通过独立自然度、中英内容和注音审核后，按配对恢复。"
  }),
  Object.freeze({
    "id": "usage:temiruRequest:verb:貸す:かす",
    "pair": "verb:貸す:かす/temiruRequest",
    "senseId": "verb:貸す:かす",
    "form": "temiruRequest",
    "sourceHash": "e8425f066a9589228f4b366e533fb5b465f9c479ba8af4241a5a457e27a85793",
    "englishHash": "3cb1335a5b6291a17a4f628a9f658591fb0762b948d92af7114ba6fdd8bd3f58",
    "basis": "user-directed-teaching-hold",
    "requestedAt": "2026-10-26",
    "reason": "用户在明确获知建议需要更换原动词后，选择暂缓这三个原配对以避免继续硬造句；此处仅记录精确教学选择，不宣称该形式在所有语境下都不存在自然表达。",
    "restoreCondition": "用户同意恢复，且固定原词义、目标形式的新例句通过独立自然度、中英内容和注音审核后，按配对恢复。"
  }),
]);

const byPair = new Map(TEACHING_PAIR_DEFERRALS.map(row => [row.pair, row]));
export const teachingPairDeferral = (senseId, form) => byPair.get(`${senseId}/${form}`);
export const isTeachingPairDeferred = (senseId, form) => byPair.has(`${senseId}/${form}`);
export const isUsageCardTeachingDeferred = card => isTeachingFormDeferred(card.form) || isTeachingPairDeferred(card.senseId, card.form);
