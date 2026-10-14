/** @typedef {string | Readonly<Record<string, string>> | Readonly<Record<string, Message>>} Message */

const PLURAL_CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

function freezeCatalog(value, path = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Catalog node must be an object: ${path || '<root>'}`);
  }
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (typeof entry === 'string') continue;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError(`Catalog value must be a string or object: ${nextPath}`);
    }
    freezeCatalog(entry, nextPath);
  }
  return Object.freeze(value);
}

/** Validate and freeze a locale catalog. */
export function defineCatalog(catalog) { return freezeCatalog(catalog); }

export const CORE_CATALOGS = Object.freeze({
  'zh-CN': defineCatalog({
    shell: {
      brand: '活用道場',
      language: '语言',
      locales: { 'zh-CN': '简体中文', en: 'English' },
    },
  }),
  en: defineCatalog({
    shell: {
      brand: '活用道場',
      language: 'Language',
      locales: { 'zh-CN': '简体中文', en: 'English' },
    },
  }),
});

export function messageAt(catalog, key) {
  if (!catalog || typeof key !== 'string' || !key) return undefined;
  if (Object.hasOwn(catalog, key)) return catalog[key];
  return key.split('.').reduce((node, part) => (
    node && typeof node === 'object' && Object.hasOwn(node, part) ? node[part] : undefined
  ), catalog);
}

export function isPluralMessage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.includes('other') && keys.every(key => PLURAL_CATEGORIES.has(key) && typeof value[key] === 'string');
}

/** Return stable dotted keys for catalog parity audits. */
export function catalogKeys(catalog, prefix = '') {
  const result = [];
  for (const [key, value] of Object.entries(catalog ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string' || isPluralMessage(value)) result.push(path);
    else if (value && typeof value === 'object' && !Array.isArray(value)) result.push(...catalogKeys(value, path));
  }
  return result.sort();
}

/** Extract named interpolation parameters from a string or plural message. */
export function messageParameters(message) {
  const strings = typeof message === 'string' ? [message] : isPluralMessage(message) ? Object.values(message) : [];
  return [...new Set(strings.flatMap(value => [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match => match[1])))].sort();
}

