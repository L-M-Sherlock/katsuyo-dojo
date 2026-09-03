const KANJI = /[\u3400-\u9fff々]/u;

export function furiganaFor(surface, reading) {
  return surface !== reading && KANJI.test(surface) ? reading : null;
}
