export const THEME_CATEGORIES = Object.freeze([
  "water",
  "mountain",
  "plant",
  "fire",
  "sky",
  "life",
  "neutral",
]);

// 意味が一目で答えにならないよう、具体テーマは連想が明確な字だけに絞る。
// neutral も含めて、現在の出題範囲 151 字を明示的に一度ずつ登録する。
const THEME_GROUPS = Object.freeze({
  water: "水川雨雪汽海魚",
  mountain: "山石岩",
  plant: "木林森竹草花",
  fire: "火赤",
  sky: "空天青日月夕白光雲風晴",
  life: "子男女手虫見人生耳足犬目貝肉体姉妹毛羽鳥休",
  neutral: "大小一二三四五六七八九十学校文字正上下田車糸気玉村音金土中力出王口年名町百円千立本早入右左先読言行南書絵図分方春思記曜話聞黄色黒太高多形長数近同今会社刀切内店線回歩広前元教知考室組後丸点買友夏公園通万頭",
});

export const KANJI_THEMES = Object.freeze(Object.fromEntries(
  Object.entries(THEME_GROUPS).flatMap(([theme, chars]) => [...chars].map((char) => [char, theme])),
));

export function resolveKanjiTheme(char) {
  return KANJI_THEMES[char] ?? "neutral";
}

export function themeAssignments() {
  return THEME_CATEGORIES.map((theme) => ({
    theme,
    chars: Object.keys(KANJI_THEMES).filter((char) => KANJI_THEMES[char] === theme),
  }));
}
