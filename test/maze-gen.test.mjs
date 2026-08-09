import assert from "node:assert/strict";
import { GRADE_MONTHS, KANJI_DATA, getKanjiPool } from "../src/kanji-data.js";
import {
  BRIDGE_RADIUS,
  HANE_RISE,
  HANE_TERRAIN_LENGTH,
  HARAI_DROP,
  HARAI_END_RADIUS,
  HARAI_TERRAIN_LENGTH,
  PLAYER_RADIUS,
  SAMPLE_SPACING,
  STROKE_RADIUS,
  canStandAt,
  estimateWalkableAreaRatio,
  floorHeightAt,
  generateMaze,
  isSampleGraphConnected,
  normalizedToWorld,
  passageRadiusAt,
  rotateStrokes,
  strokePointAtDistanceFromEnd,
  worldSizeForStrokeCount,
} from "../src/maze.js";
import { calculateScore } from "../src/score.js";
import { computeWallContours, createWallGeometry } from "../src/render3d.js";
import { classifyStrokeEnding } from "../tools/kanji-endings.mjs";
import { KANJI_THEMES, THEME_CATEGORIES, resolveKanjiTheme } from "../tools/kanji-themes.mjs";

const expectedBridges = new Map([
  ["一", 0], ["二", 1], ["三", 2], ["十", 0], ["口", 0],
  ["日", 0], ["田", 0], ["山", 0], ["川", 2], ["木", 0],
]);

assert.equal(STROKE_RADIUS, 1.7, "画の通路半径が1.7mでない");
assert.equal(BRIDGE_RADIUS, 0.95, "橋の通路半径が0.95mでない");
assert.equal(SAMPLE_SPACING, 1.2, "踏破サンプル間隔が1.2mでない");
assert.equal(HANE_TERRAIN_LENGTH, 1.5, "はねの地形長が1.5mでない");
assert.ok(HANE_RISE >= 0.6 && HANE_RISE <= 0.9, "はねの上昇量が0.6〜0.9mでない");
assert.equal(HARAI_TERRAIN_LENGTH, 3, "はらいの地形長が3mでない");
assert.ok(HARAI_DROP >= 0.4 && HARAI_DROP <= 0.6, "はらいの下降量が0.4〜0.6mでない");
assert.ok(HARAI_END_RADIUS >= PLAYER_RADIUS + 0.2, "はらい末端がプレイヤー半径+0.2mより細い");
assert.deepEqual([1, 5, 9, 13].map(worldSizeForStrokeCount), [64, 80, 96, 112], "世界スケールが仕様と違う");

const allStrokes = KANJI_DATA.flatMap((kanji) => kanji.strokes);
assert.equal(allStrokes.length, 9662, "全画数が9662でない");
assert.ok(allStrokes.every((stroke) => ["tome", "hane", "harai"].includes(stroke.ending)), "ending 未分類の画がある");
const endingCounts = Object.fromEntries(["tome", "hane", "harai"].map((ending) => [
  ending,
  allStrokes.filter((stroke) => stroke.ending === ending).length,
]));
assert.equal(Object.values(endingCounts).reduce((sum, count) => sum + count, 0), 9662, "ending 件数の合計が9662でない");
assert.deepEqual(classifyStrokeEnding(null), { ending: "tome", known: false }, "kvg:type 欠落が tome fallback にならない");
assert.deepEqual(classifyStrokeEnding("unknown"), { ending: "tome", known: false }, "未知 kvg:type が tome fallback にならない");
console.log(`PASS endings: total=9662, tome=${endingCounts.tome}, hane=${endingCounts.hane}, harai=${endingCounts.harai}`);

// 東西・南北の両方向で、末端距離だけが地形を決めることを固定する。
for (const [direction, points] of [
  ["east-west", [[0.9, 0.5], [0.1, 0.5]]],
  ["south-north", [[0.5, 0.9], [0.5, 0.1]]],
]) {
  const terrainMaze = (ending) => generateMaze({
    char: "試",
    theme: "neutral",
    strokes: [{ points, type: null, ending }],
  });
  const hane = terrainMaze("hane");
  const haneDistances = [4, 1.5, 1, 0.5, 0];
  const haneHeights = haneDistances.map((distance) => {
    const point = strokePointAtDistanceFromEnd(hane, 0, distance);
    return floorHeightAt(hane, point.x, point.z);
  });
  assert.equal(haneHeights[0], 0, `${direction}: はねの画途中が平らでない`);
  assert.equal(haneHeights[1], 0, `${direction}: はね地形が1.5mより内側へ漏れた`);
  assert.ok(isMonotonic(haneHeights.slice(1), "up"), `${direction}: はねの高さが単調増加でない`);
  assert.ok(haneHeights.at(-1) >= 0.6 && haneHeights.at(-1) <= 0.9, `${direction}: はね先端の高さが範囲外`);

  const harai = terrainMaze("harai");
  const haraiDistances = [4, 3, 2, 1, 0];
  const haraiPoints = haraiDistances.map((distance) => strokePointAtDistanceFromEnd(harai, 0, distance));
  const haraiHeights = haraiPoints.map((point) => floorHeightAt(harai, point.x, point.z));
  const haraiRadii = haraiPoints.map((point) => passageRadiusAt(harai, point.x, point.z));
  assert.equal(haraiHeights[0], 0, `${direction}: はらいの画途中が平らでない`);
  assert.equal(haraiHeights[1], 0, `${direction}: はらい地形が3mより内側へ漏れた`);
  assert.ok(isMonotonic(haraiHeights.slice(1), "down"), `${direction}: はらいの高さが単調減少でない`);
  assert.ok(haraiHeights.at(-1) <= -0.4 && haraiHeights.at(-1) >= -0.6, `${direction}: はらい先端の高さが範囲外`);
  assert.ok(isMonotonic(haraiRadii, "down"), `${direction}: はらい半径が単調減少でない`);
  assert.ok(Math.abs(haraiRadii[0] - 1.7) < 1e-9 && Math.abs(haraiRadii.at(-1) - 0.9) < 1e-9, `${direction}: はらい半径の端値が違う`);

  const tome = terrainMaze("tome");
  for (const distance of [8, 4, 3, 1.5, 0]) {
    const point = strokePointAtDistanceFromEnd(tome, 0, distance);
    assert.equal(floorHeightAt(tome, point.x, point.z), 0, `${direction}: とめに高低差がある`);
  }
}
console.log("PASS terrain profiles: east-west/south-north; hane=+0.75m/1.5m, harai=-0.5m/3m, tome=flat");
console.log("PASS harai taper: radius=1.7m -> 0.9m monotonic; clearance>=player+0.2m");

assert.deepEqual(new Set(Object.values(KANJI_THEMES)), new Set(THEME_CATEGORIES), "テーマカテゴリ表が一致しない");
assert.equal(Object.keys(KANJI_THEMES).length, 1026, "テーマ表が1026字でない");
assert.equal(resolveKanjiTheme("々"), "neutral", "未定義字の neutral fallback が効かない");
for (const kanji of KANJI_DATA) {
  assert.equal(kanji.theme, resolveKanjiTheme(kanji.char), `${kanji.char}: 生成テーマがテーマ表と違う`);
}
console.log(`PASS themes: 1026 assigned; categories=${THEME_CATEGORIES.join(",")}; undefined=>neutral`);

const rotatedSample = KANJI_DATA.find((kanji) => kanji.char === "川");
assert.ok(rotatedSample, "回転検査用の川が見つからない");
const rotationProbe = [{ points: [[0.25, 0.5], [0.75, 0.5]], ending: "tome" }];
const rotationProbeCopy = structuredClone(rotationProbe);
const rotatedProbe = rotateStrokes(rotationProbe, 90);
assert.deepEqual(rotationProbe, rotationProbeCopy, "rotateStrokes が入力を破壊した");
assert.equal(rotatedProbe.length, rotationProbe.length, "rotateStrokes が stroke 数を変えた");
assert.equal(rotatedProbe[0].points.length, rotationProbe[0].points.length, "rotateStrokes が点数を変えた");
assert.ok(rotatedProbe[0].points.every((point) => point.every((value) => Number.isFinite(value))), "rotateStrokes が不正な座標を返した");

const baseRotationMaze = generateMaze(rotatedSample);
const baseYaw = sampleYaw(baseRotationMaze);
for (const angle of [45, 90, 135]) {
  const rotatedMaze = generateMaze({
    ...rotatedSample,
    strokes: rotateStrokes(rotatedSample.strokes, angle),
  });
  assert.ok(isSampleGraphConnected(rotatedMaze), `川: ${angle}° 回転でサンプル点グラフが壊れた`);
  assert.equal(rotatedMaze.bridgeCount, baseRotationMaze.bridgeCount, `川: ${angle}° 回転で橋本数が変わった`);
  const delta = normalizeAngle(sampleYaw(rotatedMaze) - baseYaw);
  assert.ok(Math.abs(delta + angle * Math.PI / 180) < 0.06, `川: ${angle}° 回転で start 向きが追従しない (${(delta * 180 / Math.PI).toFixed(2)}°)`);
}
console.log("PASS rotation: rotateStrokes pure; 川 bridgeCount and start yaw follow 45°/90°/135°");

let highestAreaRatio = { char: "", ratio: 0 };
const scaleCounts = new Map();
let totalSamples = 0;
for (const kanji of KANJI_DATA) {
  const maze = generateMaze(kanji);
  assert.equal(maze.worldSize, worldSizeForStrokeCount(kanji.strokes.length), `${kanji.char}: 世界スケールが違う`);
  assert.ok(maze.totalSamples > 0, `${kanji.char}: 踏破サンプル点がない`);
  assert.ok(isSampleGraphConnected(maze), `${kanji.char}: サンプル点グラフが単一連結でない`);
  const expectedStart = normalizedToWorld(kanji.strokes[0].points[0], maze.worldSize);
  assert.equal(maze.start.id, 0, `${kanji.char}: スタートが最初のサンプルでない`);
  assert.equal(maze.start.strokeId, 0, `${kanji.char}: スタートが1画目でない`);
  assert.ok(Math.abs(maze.start.x - expectedStart.x) < 1e-9 && Math.abs(maze.start.z - expectedStart.z) < 1e-9, `${kanji.char}: スタートが1画目の書き始めでない`);
  assert.ok(canStandAt(maze, maze.start.x, maze.start.z), `${kanji.char}: スタート位置に立てない`);
  assert.ok(maze.samples.every((sample) => canStandAt(maze, sample.x, sample.z)), `${kanji.char}: 画上のサンプル点に立てない`);
  for (const stroke of maze.strokePolylines.filter((candidate) => candidate.ending === "harai")) {
    const end = stroke.points.at(-1);
    assert.ok(passageRadiusAt(maze, end.x, end.z) >= PLAYER_RADIUS + 0.2, `${kanji.char}: はらい末端が歩行可能幅を満たさない`);
  }

  // 距離場を72×72点で積分した歩行可能面積。隣接画が溶けて巨大な広場になる事故を検出する。
  const areaRatio = estimateWalkableAreaRatio(maze, 72);
  assert.ok(areaRatio < 0.4, `${kanji.char}: 歩行可能面積が世界の40%以上 (${(areaRatio * 100).toFixed(2)}%)`);
  if (areaRatio > highestAreaRatio.ratio) highestAreaRatio = { char: kanji.char, ratio: areaRatio };
  scaleCounts.set(maze.worldSize, (scaleCounts.get(maze.worldSize) ?? 0) + 1);
  totalSamples += maze.totalSamples;
  if (expectedBridges.has(kanji.char)) {
    assert.equal(maze.bridgeCount, expectedBridges.get(kanji.char), `${kanji.char}: 橋本数が違う`);
  }
}
assert.equal(KANJI_DATA.length, 1026, "生成データが1026字でない");
console.log(`PASS maze: 1026 kanji, sample-graph connected/start/samples/collision; samples=${totalSamples}`);
console.log(`PASS distance constants: stroke=${STROKE_RADIUS}m, bridge=${BRIDGE_RADIUS}m, spacing=${SAMPLE_SPACING}m`);
console.log(`PASS world scales: ${[...scaleCounts].map(([size, count]) => `${size}m=${count}`).join(", ")}`);
console.log(`PASS passage-area guard: all<40%; max=${highestAreaRatio.char}:${(highestAreaRatio.ratio * 100).toFixed(2)}%`);
console.log(`PASS known bridges: ${[...expectedBridges].map(([char, count]) => `${char}=${count}`).join(", ")}`);

for (const char of ["一", "口"]) {
  const kanji = KANJI_DATA.find((entry) => entry.char === char);
  const maze = generateMaze(kanji);
  const contours = computeWallContours(maze);
  const outerArea = signedArea2d(contours.outer.points);
  assert.equal(contours.outer.points.length, 4, `${char}: 外周矩形が4点でない`);
  assert.ok(contours.holes.length >= 1, `${char}: くり抜きがない`);
  assert.ok(contours.holes.every((hole) => signedArea2d(hole.points) * outerArea < 0), `${char}: hole の向きが外周と逆でない`);
  if (char === "一") {
    assert.equal(contours.islands.length, 0, "一: 島がある");
  } else {
    assert.ok(contours.islands.length >= 1, "口: 島がない");
  }
  console.log(`PASS wall contours ${char}: outer=1 holes=${contours.holes.length} islands=${contours.islands.length}`);
}

let minY = Infinity;
let maxY = -Infinity;
for (const kanji of KANJI_DATA) {
  const maze = generateMaze(kanji);
  const geometry = createWallGeometry(maze);
  geometry.computeBoundingBox();
  assert.ok(geometry.boundingBox, `${kanji.char}: wall geometry の boundingBox がない`);
  minY = Math.min(minY, geometry.boundingBox.min.y);
  maxY = Math.max(maxY, geometry.boundingBox.max.y);
  assert.ok(geometry.boundingBox.min.y >= -0.01, `${kanji.char}: wall geometry の下端が低すぎる (${geometry.boundingBox.min.y.toFixed(4)})`);
  assert.ok(geometry.boundingBox.max.y <= 2.61, `${kanji.char}: wall geometry の上端が高すぎる (${geometry.boundingBox.max.y.toFixed(4)})`);
}
console.log(`PASS wall geometry bounds: y=[${minY.toFixed(4)}, ${maxY.toFixed(4)}]`);

for (const grade of [1, 2]) {
  let previousCount = 0;
  const counts = [];
  for (const month of GRADE_MONTHS[grade]) {
    const count = getKanjiPool(grade, month).length;
    assert.ok(count >= previousCount, `${grade}年${month}月: 出題数が減った`);
    previousCount = count;
    counts.push(`${month}=${count}`);
  }
  console.log(`PASS pool monotonic grade=${grade}: ${counts.join(", ")}`);
}
for (const grade of [3, 4, 5, 6]) {
  let previousCount = 0;
  const counts = [];
  for (const month of GRADE_MONTHS[grade]) {
    const count = getKanjiPool(grade, month).length;
    assert.ok(count >= previousCount, `${grade}年${month}月: 出題数が減った`);
    previousCount = count;
    counts.push(`${month}=${count}`);
  }
  console.log(`PASS pool monotonic grade=${grade}: ${counts.join(", ")}`);
}
assert.equal(getKanjiPool(1, 3).length, 80, "1年3月が80字でない");
assert.equal(getKanjiPool(2, 3).length, 240, "2年3月が240字でない");
assert.equal(getKanjiPool(3, 3).length, 440, "3年3月が440字でない");
assert.equal(getKanjiPool(4, 11).length, 608, "4年11月が608字でない");
assert.equal(getKanjiPool(5, 3).length, 835, "5年3月が835字でない");
assert.equal(getKanjiPool(6, 3).length, 1026, "6年3月が1026字でない");
console.log("PASS pool exact: g1/3=80, g2/3=240, g3/3=440, g4/11=608, g5/3=835, g6/3=1026");

let previous = Infinity;
for (let percent = 0; percent <= 100; percent += 1) {
  const score = calculateScore(percent / 100, 0, true);
  assert.ok(score <= previous, `踏破率 ${percent}% で得点が増えた`);
  previous = score;
}
assert.ok(calculateScore(0.3, 1, true) < calculateScore(0.3, 0, true), "誤答ペナルティがない");
assert.ok(calculateScore(0.3, 0, false) > calculateScore(0.3, 0, true), "地図なし倍率がない");
assert.equal(calculateScore(1, 99, true), 0, "得点の下限が0でない");
console.log("PASS score: monotonic, penalty, no-map multiplier, floor");
console.log("ALL TESTS PASSED");

function signedArea2d(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    area += point.x * next.y - next.x * point.y;
  }
  return area / 2;
}

function isMonotonic(values, direction) {
  return values.every((value, index) => index === 0 || (
    direction === "up" ? value >= values[index - 1] - 1e-9 : value <= values[index - 1] + 1e-9
  ));
}

function sampleYaw(maze) {
  const firstStroke = maze.samplesByStroke[0];
  const spawn = firstStroke[Math.min(2, firstStroke.length - 1)];
  const ahead = firstStroke[Math.min(5, firstStroke.length - 1)];
  return spawn === ahead ? 0 : Math.atan2(-(ahead.x - spawn.x), -(ahead.z - spawn.z));
}

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
