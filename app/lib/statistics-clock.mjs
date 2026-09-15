import { localDay } from './statistics.mjs';

export const STATISTICS_IDLE_MS = 60_000;
export const STATISTICS_FLUSH_MS = 30_000;
// A clock dedicated to descriptive statistics. It never supplies assessment
// responseMs, schedules a retest, or changes an independent-evidence condition.
export function createStatisticsClock({ now = () => performance.now(), wall = () => new Date() } = {}) {
  let cursor = now(), lastWall = wall(), interaction = cursor, answerMs = 0;
  let context = { enabled: false, answering: false, domain: 'verb', courseId: '' };
  let fragments = [];
  function accrue() {
    const end = now(), currentWall = wall();
    const duration = context.enabled ? Math.max(0, Math.min(end, interaction + STATISTICS_IDLE_MS) - cursor) : 0;
    if (duration > 0) {
      if (context.answering) answerMs += duration;
      let remaining = duration, from = new Date(lastWall);
      while (remaining > 0) {
        const midnight = new Date(from); midnight.setHours(24, 0, 0, 0);
        const ms = Math.min(remaining, midnight.getTime() - from.getTime());
        const day = localDay(from), last = fragments.at(-1);
        if (last && last.day === day && last.domain === context.domain && last.courseId === context.courseId) last.ms += ms;
        else fragments.push({ day, domain: context.domain, courseId: context.courseId, ms });
        remaining -= ms; from = new Date(from.getTime() + ms);
      }
    }
    cursor = end; lastWall = currentWall;
  }
  return {
    setContext(next) {
      accrue();
      if (next.enabled && !context.enabled) interaction = cursor;
      context = { ...context, ...next };
    },
    touch() { accrue(); interaction = cursor; },
    answerDuration() { accrue(); return Math.round(answerMs); },
    resetAnswer() { accrue(); answerMs = 0; },
    drain() { accrue(); const value = fragments; fragments = []; return value; },
    restore(value) { fragments = [...value, ...fragments]; },
    pending() { accrue(); return fragments.reduce((sum, part) => sum + part.ms, 0); },
    reset() { cursor = now(); lastWall = wall(); interaction = cursor; answerMs = 0; fragments = []; },
  };
}
