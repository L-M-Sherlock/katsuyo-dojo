const FORMAT = "katsuyo-dojo-profile";
const FORMAT_VERSION = 2;
const KC_ID_ALIASES = {
  "exception.suru.class": "facet.class.irregular.suru",
  "exception.kuru.class": "facet.class.irregular.kuru",
};

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function count(value, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 0), maximum) : 0;
}

function rate(value) {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

function skillStats(value) {
  const source = record(value);
  if (!source) return null;
  const attempts = count(source.attempts);
  const correct = count(source.correct, attempts);
  const confidence = rate(source.confidence);
  return {
    attempts,
    correct,
    filteredAccuracy: source.filteredAccuracy == null ? null : rate(source.filteredAccuracy),
    confidence,
    bestConfidence: Math.max(confidence, rate(source.bestConfidence)),
    cleanTimeTotal: Number.isFinite(source.cleanTimeTotal) ? Math.max(source.cleanTimeTotal, 0) : 0,
    cleanTimeCount: count(source.cleanTimeCount, correct),
  };
}

export function createProfileExport(profile, exportedAt = new Date().toISOString()) {
  return { format: FORMAT, formatVersion: FORMAT_VERSION, exportedAt, profile };
}

export function parseProfileImport(value, { today, kcIds = /** @type {string[]} */ ([]), gatingKcIds = kcIds, initialKcIds = /** @type {string[]} */ ([]) }) {
  const envelope = record(value);
  if (!envelope) throw new Error("文件内容不是有效的数据对象。");
  if ("format" in envelope && (envelope.format !== FORMAT || ![1, FORMAT_VERSION].includes(envelope.formatVersion))) {
    throw new Error("这不是受支持的活用道場备份文件。");
  }

  const source = record(envelope.profile) ?? envelope;
  if (![4, 5].includes(source.version)) {
    throw new Error("备份版本不受支持或数据不完整。");
  }

  const sameDay = source.date === today;
  const attempted = sameDay ? count(source.attempted) : 0;
  const daily = {
    date: today,
    attempted,
    correct: sameDay ? count(source.correct, attempted) : 0,
    streak: sameDay ? count(source.streak, attempted) : 0,
    rotation: count(source.rotation),
  };

  // The old flattened skills cannot be decomposed reliably. Keep only daily
  // totals and restart the atomic assessment, as promised by the v5 migration.
  if (source.version === 4) {
    if (!record(source.bySkill)) throw new Error("备份版本不受支持或数据不完整。");
    return { version: 5, ...daily, introducedKcIds: [...initialKcIds], byKc: {} };
  }
  if (!record(source.byKc)) throw new Error("备份版本不受支持或数据不完整。");

  const allowed = new Set(kcIds);
  const allowedGating = new Set(gatingKcIds);
  const byKc = {};
  for (const [id, value] of Object.entries(source.byKc)) {
    const targetId = KC_ID_ALIASES[id] ?? id;
    const stats = allowed.has(targetId) ? skillStats(value) : null;
    if (stats && (!(targetId in byKc) || id === targetId)) byKc[targetId] = stats;
  }
  const introducedKcIds = [...new Set([
    ...initialKcIds,
    ...(Array.isArray(source.introducedKcIds) ? source.introducedKcIds.map((id) => KC_ID_ALIASES[id] ?? id) : []),
  ])].filter((id) => allowedGating.has(id));
  return {
    version: 5,
    ...daily,
    introducedKcIds,
    byKc,
  };
}
