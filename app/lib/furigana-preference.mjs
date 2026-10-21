/* eslint-disable react/prop-types -- Public props are documented with JSDoc. */
import {createContext, createElement, useCallback, useContext, useMemo, useState} from 'react';

// Display preferences stay outside learning profiles and progress backups.
export const FURIGANA_PREFERENCE_KEY = 'katsuyo-show-furigana-v1';

const FuriganaContext = createContext({showFurigana: true, setShowFurigana: () => {}});

function initialPreference() {
  try { return globalThis.window?.localStorage.getItem(FURIGANA_PREFERENCE_KEY) !== 'false'; }
  catch { return true; }
}

/** @param {{children: import('react').ReactNode}} props */
export function FuriganaProvider({children}) {
  const [showFurigana, setVisible] = useState(initialPreference);
  const setShowFurigana = useCallback(visible => {
    setVisible(visible);
    try { window.localStorage.setItem(FURIGANA_PREFERENCE_KEY, String(visible)); }
    catch { /* Keep the control usable when browser storage is unavailable. */ }
  }, []);
  const value = useMemo(() => ({showFurigana, setShowFurigana}), [showFurigana, setShowFurigana]);
  return createElement(FuriganaContext.Provider, {value}, children);
}

export function useFuriganaPreference() { return useContext(FuriganaContext); }
