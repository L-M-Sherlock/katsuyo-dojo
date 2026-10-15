import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CORE_CATALOGS,
  DEFAULT_LOCALE,
  ROOT_FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  catalogKeys,
  messageAt,
  messageParameters,
} from '../app/lib/i18n/index.mjs';
import { CHALLENGE_MESSAGES } from '../app/lib/challenge-selection.mjs';
import { DIAGNOSTIC_CATALOGS } from '../app/lib/i18n/diagnostics.mjs';
import { SITE_CATALOGS } from '../app/lib/i18n/site-catalogs.mjs';
import { STATISTICS_MESSAGES } from '../app/lib/statistics-page.mjs';
import { USAGE_CARD_MESSAGES } from '../app/lib/usage-card-view.mjs';

function parametersByKey(catalog) {
  return Object.fromEntries(catalogKeys(catalog).map(key => [
    key,
    messageParameters(messageAt(catalog, key)),
  ]));
}

const PAIRED_CATALOGS = Object.freeze({
  core: CORE_CATALOGS,
  site: SITE_CATALOGS,
  diagnostics: DIAGNOSTIC_CATALOGS,
  statistics: STATISTICS_MESSAGES,
  challenge: CHALLENGE_MESSAGES,
  usageCards: USAGE_CARD_MESSAGES,
});

test('all runtime message catalogs have the same keys and interpolation contract', () => {
  assert.deepEqual(SUPPORTED_LOCALES, ['zh-CN', 'en']);
  assert.equal(DEFAULT_LOCALE, 'zh-CN');
  assert.equal(ROOT_FALLBACK_LOCALE, 'en');

  const [referenceLocale, ...otherLocales] = SUPPORTED_LOCALES;
  for (const [name, catalogs] of Object.entries(PAIRED_CATALOGS)) {
    const reference = catalogs[referenceLocale];
    assert.ok(reference, `missing ${name} catalog: ${referenceLocale}`);
    assert.ok(catalogKeys(reference).length > 0, `empty ${name} catalog: ${referenceLocale}`);
    for (const locale of otherLocales) {
      assert.ok(catalogs[locale], `missing ${name} catalog: ${locale}`);
      assert.deepEqual(catalogKeys(catalogs[locale]), catalogKeys(reference), `${name}/${locale} key parity`);
      assert.deepEqual(parametersByKey(catalogs[locale]), parametersByKey(reference), `${name}/${locale} parameter parity`);
    }
  }
});

test('locale labels and the brand resolve in every supported locale', () => {
  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(messageAt(CORE_CATALOGS[locale], 'shell.brand'), '活用道場');
    assert.equal(typeof messageAt(CORE_CATALOGS[locale], 'shell.language'), 'string');
    for (const option of SUPPORTED_LOCALES) {
      assert.equal(typeof messageAt(CORE_CATALOGS[locale], `shell.locales.${option}`), 'string');
      assert.equal(messageAt(SITE_CATALOGS[locale], `shell.locales.${option}`),
        option === 'zh-CN' ? '简体中文' : 'English');
    }
  }
});
