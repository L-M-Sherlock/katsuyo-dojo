/* eslint-disable react/prop-types -- Props are documented with JSDoc for TypeScript callers. */
/* eslint-disable react-hooks/refs -- createElement forwards ref props; refs are read only in handlers and effects. */
import { createElement, useEffect, useId, useRef, useState } from 'react';

const languages = [
  {locale: 'zh-CN', label: '简体中文', lang: 'zh-CN'},
  {locale: 'en', label: 'English', lang: 'en'},
];

/** @param {{locale: string, label: string, onChange: (locale: string) => void}} props */
export default function LanguageSwitch({locale, label, onChange}) {
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const trigger = useRef(null);
  const options = useRef([]);
  const menuId = useId();
  const selected = Math.max(0, languages.findIndex(language => language.locale === locale));
  useEffect(() => {
    if (!open) return;
    options.current[selected]?.focus();
    const outside = event => {
      if (!container.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open, selected]);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function menuKey(event, index) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? languages.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + languages.length) % languages.length;
      options.current[next]?.focus();
    }
  }
  return createElement('div', {className: 'language-switch', ref: container},
    createElement('button', {
      type: 'button', className: 'language-switch-trigger', ref: trigger,
      'aria-label': `${label}: ${languages[selected].label}`, 'aria-haspopup': 'menu',
      'aria-expanded': open, 'aria-controls': open ? menuId : undefined,
      onClick: () => setOpen(value => !value),
      onKeyDown: event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true);
        } else if (event.key === 'Escape' && open) { event.stopPropagation(); close(); }
      },
    }, createElement('span', {lang: languages[selected].lang}, languages[selected].label),
    createElement('svg', {width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true},
      createElement('path', {d: 'm4 6 4 4 4-4', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round'}))),
    open && createElement('div', {className: 'language-switch-menu', id: menuId, role: 'menu', 'aria-label': label},
      languages.map((language, index) => createElement('button', {
        key: language.locale, type: 'button', role: 'menuitemradio',
        'aria-checked': index === selected, tabIndex: -1, lang: language.lang,
        ref: node => { options.current[index] = node; },
        onKeyDown: event => menuKey(event, index),
        onClick: () => { close(); onChange(language.locale); },
      }, createElement('span', {className: 'language-switch-check', 'aria-hidden': true}, index === selected ? '✓' : ''), language.label))),
  );
}
