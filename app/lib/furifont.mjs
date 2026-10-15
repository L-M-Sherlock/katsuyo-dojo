import manifest from '../data/furifont-runtime.json' with {type: 'json'};

const keyFor = ({text, reading}) => `${text}\u0000${reading}`;
const entries = new Map(manifest.entries.map(entry => [keyFor(entry), entry]));
const loaders = new WeakMap();
const unavailable = Object.freeze({
  subscribe: () => () => {},
  getSnapshot: () => false,
  load: () => Promise.resolve(false),
});

/** Match the existing reviewed reading, never the font's default pronunciation. */
export function furifontEntry(part, family = 'sans') {
  const entry = part.reading ? entries.get(keyFor(part)) : undefined;
  return entry?.families?.[family] ? entry : undefined;
}

export const furifontFeatures = salt => `"rclt" 1, "salt" ${salt}`;

/** @param {'sans' | 'serif' | 'display'} family */
export function furifontStyle(entry, family = 'sans') {
  const font = manifest.families[family];
  const overhang = entry.families?.[family]?.inkOverhangEm ?? entry.inkOverhangEm;
  return {
    fontFamily: `"${font.family}", var(--font-jp-${family === 'sans' ? 'sans' : 'serif'})`,
    fontFeatureSettings: furifontFeatures(entry.families[family].salt),
    paddingInlineStart: overhang?.left ? `${overhang.left}em` : undefined,
    paddingInlineEnd: overhang?.right ? `${overhang.right}em` : undefined,
  };
}

/** Share the exact loaded face; a system-font fallback is not a successful load. */
export function createFurifontLoader({fontSet, FontFace, baseUrl, family = 'sans'}) {
  let ready = false;
  let pending;
  const subscribers = new Set();
  const load = () => {
    if (pending) return pending;
    pending = (async () => {
      try {
        const font = manifest.families[family];
        if (!fontSet?.add || !FontFace || !font) return false;
        const source = new URL(font.fontUrl, baseUrl);
        source.searchParams.set('v', font.sha256);
        const face = new FontFace(font.family, `url("${source.href}") format("woff2")`, {
          style: 'normal', weight: font.weights.join(' '), display: 'swap',
        });
        const loaded = await face.load();
        if (loaded !== face || (face.status && face.status !== 'loaded')) return false;
        fontSet.add(face);
        ready = true;
        for (const subscriber of subscribers) subscriber();
        return true;
      } catch {
        // Keep native ruby for unavailable APIs, failed requests and bad fonts.
        return false;
      }
    })();
    return pending;
  };
  return {
    getSnapshot: () => ready,
    subscribe: subscriber => {
      subscribers.add(subscriber);
      void load();
      return () => subscribers.delete(subscriber);
    },
    load,
  };
}

/** @param {'sans' | 'serif' | 'display'} family */
export function getFurifontLoader(family = 'sans') {
  const page = globalThis.document;
  const FontFace = globalThis.FontFace ?? page?.defaultView?.FontFace;
  if (!page?.fonts || !FontFace) return unavailable;
  if (!loaders.has(page.fonts)) loaders.set(page.fonts, new Map());
  const byFamily = loaders.get(page.fonts);
  if (!byFamily.has(family)) {
    const baseUrl = new URL(import.meta.env?.BASE_URL ?? './', page.baseURI).href;
    byFamily.set(family, createFurifontLoader({fontSet: page.fonts, FontFace, baseUrl, family}));
  }
  return byFamily.get(family);
}
