import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { READINGS } from "./readings.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const curriculumPath = path.join(projectRoot, "data/curriculum.json");
const kanjiDirectory = path.join(projectRoot, "vendor/kanjivg-extract/kanji");
const outputPath = path.join(projectRoot, "src/kanji-data.generated.js");
const curriculum = JSON.parse(fs.readFileSync(curriculumPath, "utf8"));

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
  return Number(Math.max(0, Math.min(1, value)).toFixed(5));
}

function pathDataFromSvg(svg, char) {
  const matches = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*>/g)];
  if (!matches.length) throw new Error(`${char}: KanjiVG に画がありません`);
  return matches.map((match) => match[1]);
}

function curriculumEntries() {
  const entries = [];
  for (const grade of [1, 2]) {
    for (const lesson of curriculum[`grade${grade}`]) {
      for (const char of lesson.kanji) entries.push({ char, grade, month: lesson.month, unit: lesson.unit });
    }
  }
  return entries;
}

function verifyEntries(entries) {
  const grade1Count = entries.filter((entry) => entry.grade === 1).length;
  const grade2Count = entries.filter((entry) => entry.grade === 2).length;
  const uniqueChars = new Set(entries.map((entry) => entry.char));
  if (grade1Count !== 80 || grade2Count !== 71 || entries.length !== 151 || uniqueChars.size !== 151) {
    throw new Error(`カリキュラム件数が不正です: 1年=${grade1Count}, 2年=${grade2Count}, 合計=${entries.length}, 重複除外=${uniqueChars.size}`);
  }
  const missingReadings = entries.filter(({ char }) => !READINGS[char]).map(({ char }) => char);
  const extraReadings = Object.keys(READINGS).filter((char) => !uniqueChars.has(char));
  if (missingReadings.length || extraReadings.length) {
    throw new Error(`読み辞書が不一致です: 不足=${missingReadings.join("") || "なし"}, 余分=${extraReadings.join("") || "なし"}`);
  }
}

function build() {
  const entries = curriculumEntries();
  verifyEntries(entries);
  const data = entries.map((entry) => {
    const hex = entry.char.codePointAt(0).toString(16).padStart(5, "0");
    const svgPath = path.join(kanjiDirectory, `${hex}.svg`);
    if (!fs.existsSync(svgPath)) throw new Error(`${entry.char}: KanjiVG が見つかりません (${svgPath})`);
    const svg = fs.readFileSync(svgPath, "utf8");
    return {
      ...entry,
      ...READINGS[entry.char],
      strokes: pathDataFromSvg(svg, entry.char).map(sampleStroke),
    };
  });
  for (const kanji of data) {
    for (const stroke of kanji.strokes) {
      if (stroke.length < 16 || stroke.length > 28) {
        throw new Error(`${kanji.char}: 画の点数が範囲外です (${stroke.length})`);
      }
      if (stroke.some((point) => point.length !== 2 || point.some((value) => !Number.isFinite(value) || value < 0 || value > 1))) {
        throw new Error(`${kanji.char}: 正規化座標が不正です`);
      }
    }
  }
  const header = "// tools/build-kanji-data.mjs により生成。直接編集しないでください。\n";
  fs.writeFileSync(outputPath, `${header}export const KANJI_DATA = ${JSON.stringify(data)};\n`);
  const strokeCount = data.reduce((sum, kanji) => sum + kanji.strokes.length, 0);
  console.log(`PASS curriculum: grade1=80, grade2=71, total=${data.length}`);
  console.log(`PASS readings: ${Object.keys(READINGS).length} entries`);
  console.log(`PASS KanjiVG: ${data.length} kanji, ${strokeCount} strokes`);
  console.log("PASS sampling: 16..28 points/stroke, coordinates=0..1");
  console.log(`WROTE ${path.relative(projectRoot, outputPath)}`);
}

try {
  build();
} catch (error) {
  console.error(`ERROR ${error.message}`);
  process.exitCode = 1;
}
