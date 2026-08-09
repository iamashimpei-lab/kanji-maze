import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { READINGS, normalizeReading, resolveMeaning, resolveReading } from "./readings.mjs";
import { classifyStrokeEnding } from "./kanji-endings.mjs";
import { KANJI_THEMES, THEME_CATEGORIES, resolveKanjiTheme } from "./kanji-themes.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const curriculumPath = path.join(projectRoot, "data/curriculum.json");
const curriculumUpperPath = path.join(projectRoot, "data/curriculum-upper.json");
const officialGradesPath = path.join(projectRoot, "data/official-grades.json");
const officialReadingsPath = path.join(projectRoot, "data/official-readings.json");
const kanjiDirectory = path.join(projectRoot, "vendor/kanjivg-extract/kanji");
const outputPath = path.join(projectRoot, "src/kanji-data.generated.js");
const curriculum = JSON.parse(fs.readFileSync(curriculumPath, "utf8"));
const curriculumUpper = JSON.parse(fs.readFileSync(curriculumUpperPath, "utf8"));
const officialGrades = JSON.parse(fs.readFileSync(officialGradesPath, "utf8"));
const officialReadings = JSON.parse(fs.readFileSync(officialReadingsPath, "utf8"));

function expectedGradeCount(grade) {
  return officialGrades[String(grade)]?.length ?? 0;
}

function commandSize(command) {
  return { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }[command.toUpperCase()];
}

function tokenizePath(data) {
  const tokens = data.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  return tokens.map((token) => /^[A-Za-z]$/.test(token) ? token : Number(token));
}

function parsePath(data) {
  const tokens = tokenizePath(data);
  const segments = [];
  let index = 0;
  let command = null;
  let point = [0, 0];
  let subpathStart = [0, 0];
  let previousControl = null;

  const absolutePoint = (x, y, relative) => relative ? [point[0] + x, point[1] + y] : [x, y];
  while (index < tokens.length) {
    if (typeof tokens[index] === "string") command = tokens[index++];
    if (!command) throw new Error(`SVG path の先頭に命令がありません: ${data}`);
    const upper = command.toUpperCase();
    const relative = command !== upper;
    const size = commandSize(command);
    if (size === undefined) throw new Error(`未対応の SVG path 命令です: ${command}`);
    if (upper === "Z") {
      segments.push(lineSegment(point, subpathStart));
      point = [...subpathStart];
      previousControl = null;
      command = null;
      continue;
    }
    if (index + size > tokens.length || typeof tokens[index] === "string") {
      throw new Error(`SVG path の引数が不足しています: ${command}`);
    }
    const values = tokens.slice(index, index + size);
    index += size;
    const from = [...point];
    if (upper === "M") {
      point = absolutePoint(values[0], values[1], relative);
      subpathStart = [...point];
      command = relative ? "l" : "L";
      previousControl = null;
      continue;
    }
    if (upper === "L") point = absolutePoint(values[0], values[1], relative);
    if (upper === "H") point = [relative ? point[0] + values[0] : values[0], point[1]];
    if (upper === "V") point = [point[0], relative ? point[1] + values[0] : values[0]];
    if (["L", "H", "V"].includes(upper)) {
      segments.push(lineSegment(from, point));
      previousControl = null;
      continue;
    }
    if (upper === "C") {
      const first = absolutePoint(values[0], values[1], relative);
      const second = absolutePoint(values[2], values[3], relative);
      point = absolutePoint(values[4], values[5], relative);
      segments.push(cubicSegment(from, first, second, point));
      previousControl = second;
      continue;
    }
    if (upper === "S") {
      const first = previousControl ? [2 * from[0] - previousControl[0], 2 * from[1] - previousControl[1]] : from;
      const second = absolutePoint(values[0], values[1], relative);
      point = absolutePoint(values[2], values[3], relative);
      segments.push(cubicSegment(from, first, second, point));
      previousControl = second;
      continue;
    }
    if (upper === "Q" || upper === "T") {
      const control = upper === "Q"
        ? absolutePoint(values[0], values[1], relative)
        : previousControl ? [2 * from[0] - previousControl[0], 2 * from[1] - previousControl[1]] : from;
      const offset = upper === "Q" ? 2 : 0;
      point = absolutePoint(values[offset], values[offset + 1], relative);
      const first = [from[0] + (control[0] - from[0]) * 2 / 3, from[1] + (control[1] - from[1]) * 2 / 3];
      const second = [point[0] + (control[0] - point[0]) * 2 / 3, point[1] + (control[1] - point[1]) * 2 / 3];
      segments.push(cubicSegment(from, first, second, point));
      previousControl = control;
      continue;
    }
    throw new Error(`未対応の SVG path 命令です: ${command}`);
  }
  return segments;
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function lineSegment(from, to) {
  return {
    weight: distance(from, to),
    pointAt: (t) => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t],
  };
}

function cubicSegment(from, first, second, to) {
  const chord = distance(from, to);
  const controlLength = distance(from, first) + distance(first, second) + distance(second, to);
  return {
    // 制御折れ線と弦の差を加味し、曲がりの強い画ほど点を多くする。
    weight: chord + (controlLength - chord) * 1.7,
    pointAt(t) {
      const u = 1 - t;
      return [
        u ** 3 * from[0] + 3 * u ** 2 * t * first[0] + 3 * u * t ** 2 * second[0] + t ** 3 * to[0],
        u ** 3 * from[1] + 3 * u ** 2 * t * first[1] + 3 * u * t ** 2 * second[1] + t ** 3 * to[1],
      ];
    },
  };
}

function sampleStroke(data) {
  const segments = parsePath(data);
  if (!segments.length) throw new Error("点を生成できない画があります");
  const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);
  const pointCount = Math.max(16, Math.min(28, Math.round(totalWeight / 3.25)));
  const points = [];
  for (let sample = 0; sample < pointCount; sample += 1) {
    const target = totalWeight * sample / (pointCount - 1);
    let elapsed = 0;
    let segment = segments.at(-1);
    let local = 1;
    for (const candidate of segments) {
      if (target <= elapsed + candidate.weight || candidate === segments.at(-1)) {
        segment = candidate;
        local = candidate.weight ? (target - elapsed) / candidate.weight : 0;
        break;
      }
      elapsed += candidate.weight;
    }
    const [x, y] = segment.pointAt(Math.max(0, Math.min(1, local)));
    points.push([round(x / 109), round(y / 109)]);
  }
  return points;
}

function round(value) {
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}

function strokeDataFromSvg(svg, char) {
  const matches = [...svg.matchAll(/<path\b([^>]*)>/g)];
  if (!matches.length) throw new Error(`${char}: KanjiVG に画がありません`);
  return matches.map((match) => {
    const attributes = match[1];
    const data = /\bd="([^"]+)"/.exec(attributes)?.[1];
    if (!data) throw new Error(`${char}: path に d 属性がありません`);
    const type = /\bkvg:type="([^"]+)"/.exec(attributes)?.[1] ?? "";
    return { data, type, ...classifyStrokeEnding(type) };
  });
}

function curriculumEntries() {
  const entries = [];
  for (const grade of [1, 2]) {
    for (const lesson of curriculum[`grade${grade}`]) {
      for (const char of lesson.kanji) entries.push({ char, grade, month: lesson.month, unit: lesson.unit });
    }
  }
  for (const grade of [3, 4, 5, 6]) {
    for (const lesson of curriculumUpper[`grade${grade}`]) {
      for (const char of lesson.kanji) entries.push({ char, grade, month: lesson.month, unit: lesson.unit });
    }
  }
  return entries;
}

function verifyEntries(entries) {
  const expectedCounts = Object.fromEntries(Object.entries(officialGrades).map(([grade, chars]) => [Number(grade), chars.length]));
  const gradeCounts = Object.fromEntries([1, 2, 3, 4, 5, 6].map((grade) => [grade, 0]));
  const gradeChars = Object.fromEntries([1, 2, 3, 4, 5, 6].map((grade) => [grade, []]));
  const uniqueChars = new Set(entries.map((entry) => entry.char));
  for (const entry of entries) {
    if (!(entry.grade in gradeCounts)) throw new Error(`未知の学年です: ${entry.grade}`);
    gradeCounts[entry.grade] += 1;
    gradeChars[entry.grade].push(entry.char);
  }
  for (const grade of [1, 2, 3, 4, 5, 6]) {
    if (gradeCounts[grade] !== expectedCounts[grade]) {
      throw new Error(`カリキュラム件数が不正です: ${grade}年=${gradeCounts[grade]} (expected ${expectedCounts[grade]})`);
    }
  }
  if (entries.length !== 1026 || uniqueChars.size !== 1026) {
    throw new Error(`カリキュラム件数が不正です: 合計=${entries.length}, 重複除外=${uniqueChars.size}`);
  }
  for (const grade of [1, 2, 3, 4, 5, 6]) {
    const officialSet = new Set(officialGrades[String(grade)]);
    const entrySet = new Set(gradeChars[grade]);
    const missing = [...officialSet].filter((char) => !entrySet.has(char));
    const extra = [...entrySet].filter((char) => !officialSet.has(char));
    if (missing.length || extra.length) {
      throw new Error(`公的配当表と不一致です: ${grade}年 不足=${missing.join("") || "なし"}, 余分=${extra.join("") || "なし"}`);
    }
  }
}

function build() {
  const entries = curriculumEntries();
  verifyEntries(entries);
  const unknownTypes = new Set();
  const data = entries.map((entry) => {
    const hex = entry.char.codePointAt(0).toString(16).padStart(5, "0");
    const svgPath = path.join(kanjiDirectory, `${hex}.svg`);
    if (!fs.existsSync(svgPath)) throw new Error(`${entry.char}: KanjiVG が見つかりません (${svgPath})`);
    const svg = fs.readFileSync(svgPath, "utf8");
    const strokes = strokeDataFromSvg(svg, entry.char).map((stroke) => {
      if (!stroke.known) unknownTypes.add(stroke.type || "(missing)");
      return {
        points: sampleStroke(stroke.data),
        type: stroke.type || null,
        ending: stroke.ending,
      };
    });
    const reading = resolveReading(entry.char, officialReadings[entry.char]);
    const officialCandidates = (officialReadings[entry.char] ?? []).map((candidate) => normalizeReading(candidate));
    if (officialCandidates.length && !officialCandidates.includes(normalizeReading(reading))) {
      throw new Error(`${entry.char}: 読みが official-readings.json と一致しません (${reading})`);
    }
    return {
      ...entry,
      reading,
      meaning: resolveMeaning(entry.char, reading),
      theme: resolveKanjiTheme(entry.char),
      strokes,
    };
  });
  for (const kanji of data) {
    for (const stroke of kanji.strokes) {
      if (stroke.points.length < 16 || stroke.points.length > 28) {
        throw new Error(`${kanji.char}: 画の点数が範囲外です (${stroke.points.length})`);
      }
      if (stroke.points.some((point) => point.length !== 2 || point.some((value) => !Number.isFinite(value) || value < 0 || value > 1))) {
        throw new Error(`${kanji.char}: 正規化座標が不正です`);
      }
      if (!["tome", "hane", "harai"].includes(stroke.ending)) throw new Error(`${kanji.char}: ending が不正です`);
    }
    if (!THEME_CATEGORIES.includes(kanji.theme)) throw new Error(`${kanji.char}: theme が不正です (${kanji.theme})`);
    if (!kanji.reading || !kanji.meaning) throw new Error(`${kanji.char}: reading/meaning が空です`);
  }
  const tunedMeaningChars = data
    .filter((entry) => !Object.hasOwn(READINGS, entry.char) && entry.meaning !== normalizeReading(entry.reading))
    .map((entry) => entry.char);
  const themeCounts = Object.fromEntries(THEME_CATEGORIES.map((theme) => [
    theme,
    data.filter((entry) => entry.theme === theme).length,
  ]));
  const emptyThemes = THEME_CATEGORIES.filter((theme) => themeCounts[theme] < 1);
  const neutralRate = themeCounts.neutral / data.length;
  if (emptyThemes.length) throw new Error(`空のテーマがあります: ${emptyThemes.join(",")}`);
  if (neutralRate > 0.35) throw new Error(`neutral が35%を超えています: ${(neutralRate * 100).toFixed(2)}%`);
  const header = "// tools/build-kanji-data.mjs により生成。直接編集しないでください。\n";
  fs.writeFileSync(outputPath, `${header}export const KANJI_DATA = ${JSON.stringify(data)};\n`);
  const strokeCount = data.reduce((sum, kanji) => sum + kanji.strokes.length, 0);
  const endingCounts = Object.fromEntries(["tome", "hane", "harai"].map((ending) => [
    ending,
    data.reduce((sum, kanji) => sum + kanji.strokes.filter((stroke) => stroke.ending === ending).length, 0),
  ]));
  const fileSize = fs.statSync(outputPath).size;
  console.log(`PASS curriculum: grade1=${expectedGradeCount(1)}, grade2=${expectedGradeCount(2)}, grade3=${expectedGradeCount(3)}, grade4=${expectedGradeCount(4)}, grade5=${expectedGradeCount(5)}, grade6=${expectedGradeCount(6)}, total=${data.length}`);
  console.log(`PASS readings: hand=${Object.keys(READINGS).length}, resolved=${data.length}`);
  console.log(`PASS meanings: resolved=${data.length}, tuned=${tunedMeaningChars.length}`);
  console.log(`INFO tuned meaning chars: ${tunedMeaningChars.join("") || "なし"}`);
  console.log(`PASS KanjiVG: ${data.length} kanji, ${strokeCount} strokes`);
  console.log(`PASS endings: total=${strokeCount}, tome=${endingCounts.tome}, hane=${endingCounts.hane}, harai=${endingCounts.harai}`);
  console.log(`INFO unknown kvg:type: ${[...unknownTypes].sort().join(", ") || "none"}`);
  console.log(`PASS themes: ${data.length} kanji, categories=${THEME_CATEGORIES.join(",")}`);
  console.log(`PASS theme distribution: ${THEME_CATEGORIES.map((theme) => `${theme}=${themeCounts[theme]}`).join(", ")}; neutral=${(neutralRate * 100).toFixed(2)}%<=35%`);
  console.log("PASS sampling: 16..28 points/stroke, coordinates=0..1");
  console.log(`PASS output size: ${fileSize} bytes`);
  console.log(`WROTE ${path.relative(projectRoot, outputPath)}`);
}

try {
  build();
} catch (error) {
  console.error(`ERROR ${error.message}`);
  process.exitCode = 1;
}
