const FORMAT = "katsuyo-dojo-profile";
const FORMAT_VERSION = 1;

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

export function parseProfileImport(value, { today, skillIds, maxSkills }) {
  const envelope = record(value);
  if (!envelope) throw new Error("文件内容不是有效的数据对象。");
  if ("format" in envelope && (envelope.format !== FORMAT || envelope.formatVersion !== FORMAT_VERSION)) {
    throw new Error("这不是受支持的活用道場备份文件。");
  }

  const source = record(envelope.profile) ?? envelope;
  if (source.version !== 4 || !record(source.bySkill)) {
    throw new Error("备份版本不受支持或数据不完整。");
  }

  const allowed = new Set(skillIds);
  const bySkill = {};
  for (const [id, value] of Object.entries(source.bySkill)) {
    const stats = allowed.has(id) ? skillStats(value) : null;
    if (stats) bySkill[id] = stats;
  }

  const sameDay = source.date === today;
  const attempted = sameDay ? count(source.attempted) : 0;
  return {
    version: 4,
    date: today,
    attempted,
    correct: sameDay ? count(source.correct, attempted) : 0,
    streak: sameDay ? count(source.streak, attempted) : 0,
    introducedSkillCount: Math.min(Math.max(count(source.introducedSkillCount), 1), maxSkills),
    rotation: count(source.rotation),
    bySkill,
  };
}
