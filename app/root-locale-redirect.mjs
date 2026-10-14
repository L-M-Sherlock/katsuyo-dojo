import { detectLocale, readLocalePreference } from './lib/i18n/index.mjs';

/** Build the localized URL for the compatibility root without changing learning data. */
export function preferredLocaleDestination({
  location,
  storage,
  languages,
  basePath = import.meta.env?.BASE_URL ?? '/katsuyo-dojo/',
}) {
  const locale = detectLocale({
    pathname: location.pathname,
    preference: readLocalePreference(storage),
    languages,
  });
  const baseUrl = new URL(basePath, location.origin);
  const destination = new URL(`${locale}/`, baseUrl);
  destination.search = location.search;
  destination.hash = location.hash;
  return destination.href;
}

export function redirectFromCompatibilityRoot(browserWindow = window) {
  let storage;
  try { storage = browserWindow.localStorage; }
  catch { storage = null; }
  const destination = preferredLocaleDestination({
    location: browserWindow.location,
    storage,
    languages: browserWindow.navigator.languages?.length
      ? browserWindow.navigator.languages
      : [browserWindow.navigator.language],
  });
  browserWindow.location.replace(destination);
}

if (typeof window !== 'undefined') redirectFromCompatibilityRoot(window);
