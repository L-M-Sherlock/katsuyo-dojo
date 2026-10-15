import {createElement as h, useSyncExternalStore} from 'react';
import {furiganaFor} from './furigana.mjs';
import {splitFuriganaParts} from './furigana-corpus.mjs';
import {furifontEntry, furifontStyle, getFurifontLoader} from './furifont.mjs';

/**
 * Font selection changes glyphs only. Original text and reviewed readings stay
 * authoritative, including during loading and for any unresolved alignment.
 * @param {{surface: string, reading?: string, family?: 'sans' | 'serif' | 'display', forceRuby?: boolean}} props
 */
export default function FuriganaText({surface, reading = surface, family = 'sans', forceRuby = false}) {
  const loader = getFurifontLoader(family);
  const ready = useSyncExternalStore(loader.subscribe, loader.getSnapshot, loader.getSnapshot);
  const annotation = furiganaFor(surface, reading);
  if (!ready) {
    return annotation || forceRuby
      ? h('ruby', {lang: 'ja'}, surface, h('rt', null, annotation ?? reading))
      : h('span', {lang: 'ja'}, surface);
  }
  const parts = splitFuriganaParts({text: surface, reading});
  return h('span', {className: 'furigana-text', lang: 'ja'}, ...parts.map((part, index) => {
    if (!part.reading) return part.text;
    const entry = furifontEntry(part, family);
    return entry
      ? h('span', {
        key: index, className: 'furifont-ruby', 'data-reading': part.reading,
        role: 'term', 'aria-label': `${part.text}（${part.reading}）`,
        style: furifontStyle(entry, family),
      }, part.text)
      : h('ruby', {key: index}, part.text, h('rt', null, part.reading));
  }));
}
