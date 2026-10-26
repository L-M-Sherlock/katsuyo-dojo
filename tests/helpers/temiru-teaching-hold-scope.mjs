// Fixed user-authorized scope, independent of the runtime hold registry.
export const EXPECTED_TEMIRU_TEACHING_HOLD_IDS = new Set([
  'usage:temiruPast:verb:いる:いる',
  'usage:temiruDesireNegativePast:verb:帰る:かえる',
  'usage:temiruDesireNegativePast:verb:手伝う:てつだう',
  'usage:temiruPast:verb:笑う:わらう',
  'usage:temiruNegative:verb:運ぶ:はこぶ',
  'usage:temiruNegative:verb:終わる:おわる',
  'usage:temiruNegative:verb:遅れる:おくれる',
  'usage:temiruRequest:verb:貸す:かす',
]);

export const EXPECTED_TEMIRU_TEACHING_HOLD_PAIRS = new Set([
  'verb:いる:いる/temiruPast',
  'verb:帰る:かえる/temiruDesireNegativePast',
  'verb:手伝う:てつだう/temiruDesireNegativePast',
  'verb:笑う:わらう/temiruPast',
  'verb:運ぶ:はこぶ/temiruNegative',
  'verb:終わる:おわる/temiruNegative',
  'verb:遅れる:おくれる/temiruNegative',
  'verb:貸す:かす/temiruRequest',
]);

// Exact follow-up review scope: eight revisions and five explicit retentions.
export const EXPECTED_TEMIRU_FOLLOWUP_REVIEW_IDS = new Set([
  'usage:temiru:verb:取る:とる',
  'usage:temiru:verb:持つ:もつ',
  'usage:temiruNegative:verb:騒ぐ:さわぐ',
  'usage:temiruNegative:verb:持つ:もつ',
  'usage:temiruNegative:verb:変わる:かわる',
  'usage:temiruNegative:verb:見る:みる',
  'usage:temiruNegative:verb:届ける:とどける',
  'usage:temiruPast:verb:持つ:もつ',
  'usage:temiruPast:verb:落とす:おとす',
  'usage:temiruPast:verb:助ける:たすける',
  'usage:temiruDesireNegative',
  'usage:temiruRequest:verb:開ける:あける',
  'usage:temiruDesirePast:verb:買う:かう',
]);
