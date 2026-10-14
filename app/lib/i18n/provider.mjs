/* eslint-disable react/prop-types -- Public props are documented with JSDoc for this framework-neutral bridge. */
import { createContext, createElement, useContext, useMemo } from 'react';
import { CORE_CATALOGS } from './catalogs.mjs';
import { createI18n } from './core.mjs';
import { DEFAULT_LOCALE } from './locales.mjs';

const defaultI18n = createI18n();
const I18nContext = createContext(defaultI18n);

/** @param {{locale?:string,fallbackLocale?:string,catalogs?:Record<string,object>,onMissing?:(key:string,locale:string)=>void,children:import('react').ReactNode}} props */
export function I18nProvider({
  locale = DEFAULT_LOCALE,
  fallbackLocale = DEFAULT_LOCALE,
  catalogs = CORE_CATALOGS,
  onMissing,
  children,
}) {
  const value = useMemo(
    () => createI18n({ locale, fallbackLocale, catalogs, onMissing }),
    [locale, fallbackLocale, catalogs, onMissing],
  );
  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() { return useContext(I18nContext); }

export function useTranslation(namespace = '') {
  const i18n = useI18n();
  const prefix = namespace ? `${namespace}.` : '';
  const t = (key, params) => i18n.t(`${prefix}${key}`, params);
  const plural = (key, count, params) => i18n.plural(`${prefix}${key}`, count, params);
  return { ...i18n, t, plural };
}
