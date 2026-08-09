import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const officialGradesPath = path.join(projectRoot, "data/official-grades.json");
const officialGrades = JSON.parse(fs.readFileSync(officialGradesPath, "utf8"));

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
// それ以外は neutral に落とす。
const THEME_LOOKUP = Object.freeze({
  water: "水川雨雪汽海魚",
  mountain: "山石岩",
  plant: "木林森竹草花",
  fire: "火赤",
  sky: "空天青日月夕白光雲風晴",
  life: "子男女手虫見人生耳足犬目貝肉体姉妹毛羽鳥休",
  neutral: "大小一二三四五六七八九十学校文字正上下田車糸気玉村音金土中力出王口年名町百円千立本早入右左先読言行南書絵図分方春思記曜話聞黄色黒太高多形長数近同今会社刀切内店線回歩広前元教知考室組後丸点買友夏公園通万頭",
});

const THEME_BY_CHAR = Object.freeze(Object.fromEntries(
  Object.entries(THEME_LOOKUP).flatMap(([theme, chars]) => [...chars].map((char) => [char, theme])),
));

export function resolveKanjiTheme(char) {
  return THEME_BY_CHAR[char] ?? "neutral";
}

export const KANJI_THEMES = Object.freeze(Object.fromEntries(
  Object.values(officialGrades)
    .flat()
    .map((char) => [char, resolveKanjiTheme(char)]),
));

export function themeAssignments() {
  return THEME_CATEGORIES.map((theme) => ({
    theme,
    chars: Object.keys(KANJI_THEMES).filter((char) => KANJI_THEMES[char] === theme),
  }));
}
