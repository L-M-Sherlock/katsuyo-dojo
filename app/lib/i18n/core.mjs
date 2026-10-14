import { CORE_CATALOGS, isPluralMessage, messageAt } from './catalogs.mjs';
import { DEFAULT_LOCALE, normalizeLocale } from './locales.mjs';

function interpolate(message, params) {
  return message.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (token, name) => (
    Object.hasOwn(params, name) ? String(params[name]) : token
  ));
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Date value must be valid.');
  return date;
}

function durationParts(milliseconds) {
  let remaining = Math.max(0, Math.round(milliseconds / 1000));
  const values = [
    ['day', Math.floor(remaining / 86_400)],
    ['hour', Math.floor((remaining % 86_400) / 3_600)],
    ['minute', Math.floor((remaining % 3_600) / 60)],
    ['second', remaining % 60],
  ];
  const first = values.findIndex(([, value]) => value > 0);
  return first < 0 ? [['second', 0]] : values.slice(first);
}

/**
 * Create a framework-neutral translator and locale-aware formatters.
 * Locale catalogs can use nested objects or stable dotted keys.
 * @param {object} [options]
 * @param {string} [options.locale]
 * @param {string} [options.fallbackLocale]
 * @param {Record<string, Record<string, unknown>>} [options.catalogs]
 * @param {(key: string, locale: string) => void} [options.onMissing]
 */
export function createI18n({
  locale = DEFAULT_LOCALE,
  fallbackLocale = DEFAULT_LOCALE,
  catalogs = CORE_CATALOGS,
  onMissing,
} = {}) {
  const activeLocale = normalizeLocale(locale) ?? DEFAULT_LOCALE;
  const activeFallback = normalizeLocale(fallbackLocale) ?? DEFAULT_LOCALE;
  const pluralRules = new Intl.PluralRules(activeLocale);

  function resolve(key) {
    const localized = messageAt(catalogs[activeLocale], key);
    if (localized !== undefined) return localized;
    const fallback = messageAt(catalogs[activeFallback], key);
    if (fallback !== undefined) return fallback;
    onMissing?.(key, activeLocale);
    return key;
  }

  function t(key, params = {}) {
    const value = resolve(key);
    if (typeof value === 'string') return interpolate(value, params);
    if (isPluralMessage(value)) {
      const count = Number(params.count);
      if (!Number.isFinite(count)) throw new TypeError(`Plural message requires a numeric count: ${key}`);
      const category = pluralRules.select(count);
      return interpolate(value[category] ?? value.other, params);
    }
    onMissing?.(key, activeLocale);
    return key;
  }

  function number(value, options) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('Number value must be finite.');
    return new Intl.NumberFormat(activeLocale, options).format(value);
  }

  function date(value, options = { dateStyle: 'medium' }) {
    return new Intl.DateTimeFormat(activeLocale, options).format(validDate(value));
  }

  function duration(milliseconds, { maxUnits = 2, unitDisplay = 'short' } = {}) {
    if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds)) throw new TypeError('Duration must be a finite number of milliseconds.');
    const limit = Math.max(1, Math.trunc(maxUnits));
    return durationParts(milliseconds).filter(([, value], index) => value > 0 || index === 0).slice(0, limit)
      .map(([unit, value]) => new Intl.NumberFormat(activeLocale, { style: 'unit', unit, unitDisplay }).format(value)).join(' ');
  }

  return Object.freeze({
    locale: activeLocale,
    fallbackLocale: activeFallback,
    t,
    plural: (key, count, params = {}) => t(key, { ...params, count }),
    has: key => messageAt(catalogs[activeLocale], key) !== undefined || messageAt(catalogs[activeFallback], key) !== undefined,
    number,
    date,
    duration,
  });
}

