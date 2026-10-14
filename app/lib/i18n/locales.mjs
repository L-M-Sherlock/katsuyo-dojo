export const SUPPORTED_LOCALES = Object.freeze(['zh-CN', 'en']);
export const DEFAULT_LOCALE = 'zh-CN';
export const ROOT_FALLBACK_LOCALE = 'en';
export const LOCALE_PREFERENCE_KEY = 'katsuyo-ui-locale-v1';

const supported = new Set(SUPPORTED_LOCALES);

/**
 * Convert a browser language tag or a stored preference to a supported locale.
 * Chinese variants share the simplified-Chinese interface. English variants
 * share the English interface. Other languages do not select a locale.
 */
export function normalizeLocale(value) {
  if (typeof value !== 'string') return null;
  const tag = value.trim().replaceAll('_', '-');
  if (!tag) return null;
  if (supported.has(tag)) return tag;
  const lower = tag.toLowerCase();
  if (lower === 'zh' || lower.startsWith('zh-')) return 'zh-CN';
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  return null;
}

/** Return the explicit locale segment in a path, if one exists. */
export function localeFromPath(pathname) {
  if (typeof pathname !== 'string') return null;
  for (const rawSegment of pathname.split('/').filter(Boolean)) {
    const exact = SUPPORTED_LOCALES.find(locale => locale.toLowerCase() === rawSegment.toLowerCase());
    if (exact) return exact;
  }
  return null;
}

/** Read a locale preference without assuming that browser storage is usable. */
export function readLocalePreference(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    return normalizeLocale(target?.getItem?.(LOCALE_PREFERENCE_KEY));
  }
  catch { return null; }
}

/** Store only the locale. Learning profiles and exported backups stay locale-free. */
export function writeLocalePreference(locale, storage) {
  const normalized = normalizeLocale(locale);
  if (!normalized) return false;
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    if (typeof target?.setItem !== 'function') return false;
    target.setItem(LOCALE_PREFERENCE_KEY, normalized);
    return true;
  }
  catch { return false; }
}

/**
 * Select a locale for the current request. An explicit path always wins.
 * On the compatibility root, the preference wins, then the browser language.
 */
export function detectLocale({
  pathname = '',
  preference = null,
  languages = [],
  fallbackLocale = ROOT_FALLBACK_LOCALE,
} = {}) {
  const pathLocale = localeFromPath(pathname);
  if (pathLocale) return pathLocale;
  const preferred = normalizeLocale(preference);
  if (preferred) return preferred;
  const candidates = Array.isArray(languages) ? languages : [languages];
  for (const language of candidates) {
    const normalized = normalizeLocale(language);
    if (normalized) return normalized;
  }
  return normalizeLocale(fallbackLocale) ?? ROOT_FALLBACK_LOCALE;
}

function normalizeBasePath(basePath) {
  const value = `/${String(basePath ?? '').split('/').filter(Boolean).join('/')}`;
  return value === '/' ? '' : value;
}

/**
 * Add or replace the locale segment below the deployment base path.
 * The caller owns the hash and query because browsers expose them separately.
 */
export function localizedPath(pathname, locale, { basePath = '/katsuyo-dojo' } = {}) {
  const normalized = normalizeLocale(locale);
  if (!normalized) throw new RangeError(`Unsupported locale: ${String(locale)}`);
  const base = normalizeBasePath(basePath);
  const source = typeof pathname === 'string' && pathname.startsWith('/') ? pathname : `/${pathname ?? ''}`;
  const suffix = base && (source === base || source.startsWith(`${base}/`)) ? source.slice(base.length) : source;
  const parts = suffix.split('/').filter(Boolean);
  if (parts.length && localeFromPath(`/${parts[0]}/`)) parts.shift();
  const tail = parts.length ? `/${parts.join('/')}` : '';
  return `${base}/${normalized}${tail}/`.replace(/\/+/g, '/');
}

