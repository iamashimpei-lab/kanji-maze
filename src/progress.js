export const VILLAGE_THEME_LABELS = Object.freeze({
  water: "みずべ",
  mountain: "やまの けしき",
  plant: "きや はたけ",
  fire: "あかり",
  sky: "よぞらの ひかり",
  animal: "よるの せいれい",
  life: "よるの せいれい",
  town: "いえや とうろう",
  neutral: "いしだたみ",
});

export function normalizeSolvedRecords(input) {
  const entries = Array.isArray(input)
    ? input.map((record) => [record?.char, record])
    : Object.entries(input && typeof input === "object" ? input : {});
  const normalized = {};
  for (const [key, value] of entries) {
    const char = typeof value?.char === "string" ? value.char : key;
    if (typeof char !== "string" || [...char].length !== 1) continue;
    const legacyCount = typeof value === "number" ? value : value?.count;
    const count = Math.max(1, Math.trunc(Number(legacyCount) || 1));
    const firstSolvedAt = validDate(value?.firstSolvedAt)
      ? value.firstSolvedAt
      : validDate(value?.solvedAt) ? value.solvedAt : null;
    normalized[char] = { char, count, firstSolvedAt };
  }
  return normalized;
}

export function recordSolved(input, char, solvedAt = new Date().toISOString()) {
  const records = normalizeSolvedRecords(input);
  if (typeof char !== "string" || [...char].length !== 1) throw new Error("正解記録には1文字の漢字が必要です");
  const previous = records[char];
  const firstSolvedAt = previous?.firstSolvedAt ?? (validDate(solvedAt) ? solvedAt : new Date(0).toISOString());
  records[char] = { char, count: (previous?.count ?? 0) + 1, firstSolvedAt };
  return { records, record: records[char], isNew: !previous };
}

export function summarizeSolved(input, kanjiData) {
  const records = normalizeSolvedRecords(input);
  const byGrade = Object.fromEntries([1, 2, 3, 4, 5, 6].map((grade) => [grade, 0]));
  const byTheme = {};
  const knownChars = new Set(kanjiData.map((kanji) => kanji.char));
  let total = 0;
  for (const kanji of kanjiData) {
    if (!records[kanji.char]) continue;
    total += 1;
    byGrade[kanji.grade] = (byGrade[kanji.grade] ?? 0) + 1;
    byTheme[kanji.theme] = (byTheme[kanji.theme] ?? 0) + 1;
  }
  const unknown = Object.keys(records).filter((char) => !knownChars.has(char)).length;
  return { total, attempts: Object.values(records).reduce((sum, record) => sum + record.count, 0), byGrade, byTheme, unknown };
}

// 日時や正解回数を seed に含めないため、解いた字の集合が同じなら必ず同じ村になる。
export function createVillageLayout(input, kanjiData) {
  const records = normalizeSolvedRecords(input);
  const kanjiByChar = new Map(kanjiData.map((kanji) => [kanji.char, kanji]));
  const chars = Object.keys(records).filter((char) => kanjiByChar.has(char)).sort();
  const villageSeed = hashString(chars.join(""));
  return chars.map((char, index) => {
    const kanji = kanjiByChar.get(char);
    const random = seededRandom(hashString(`${villageSeed}:${char}`));
    const theme = kanji.theme ?? "neutral";
    const band = verticalBand(theme);
    const kinds = villageKinds(theme);
    return {
      id: `${theme}-${char.codePointAt(0)}`,
      char,
      reading: kanji.reading,
      theme,
      kind: kinds[Math.floor(random() * kinds.length)],
      variant: Math.floor(random() * 4),
      x: round(0.055 + random() * 0.89),
      y: round(band[0] + random() * (band[1] - band[0])),
      scale: round(0.72 + random() * 0.62),
      phase: round(random() * Math.PI * 2),
      order: index,
    };
  });
}

export function villageAdditionForTheme(theme) {
  return VILLAGE_THEME_LABELS[theme] ?? VILLAGE_THEME_LABELS.neutral;
}

function villageKinds(theme) {
  return {
    water: ["stream", "pond"],
    mountain: ["mountain", "rock"],
    plant: ["tree", "field", "flower"],
    fire: ["fire", "lantern"],
    sky: ["star", "moon"],
    animal: ["spirit"],
    life: ["spirit"],
    town: ["house", "bridge", "lantern"],
    neutral: ["stone", "sign"],
  }[theme] ?? ["stone"];
}

function verticalBand(theme) {
  if (theme === "sky") return [0.08, 0.34];
  if (theme === "mountain") return [0.3, 0.49];
  if (theme === "water") return [0.7, 0.9];
  return [0.48, 0.86];
}

function validDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function round(value) {
  return Number(value.toFixed(4));
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
