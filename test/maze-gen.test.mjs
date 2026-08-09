import assert from "node:assert/strict";
import { GRADE_MONTHS, KANJI_DATA, getKanjiPool } from "../src/kanji-data.js";
import {
  BRIDGE_RADIUS,
  SAMPLE_SPACING,
  STROKE_RADIUS,
  canStandAt,
  estimateWalkableAreaRatio,
  generateMaze,
  isSampleGraphConnected,
  normalizedToWorld,
  worldSizeForStrokeCount,
} from "../src/maze.js";
import { calculateScore } from "../src/score.js";
import { computeWallContours, createWallGeometry } from "../src/render3d.js";

const expectedBridges = new Map([
  ["一", 0], ["二", 1], ["三", 2], ["十", 0], ["口", 0],
  ["日", 0], ["田", 0], ["山", 0], ["川", 2], ["木", 0],
]);

assert.equal(STROKE_RADIUS, 1.7, "画の通路半径が1.7mでない");
assert.equal(BRIDGE_RADIUS, 0.95, "橋の通路半径が0.95mでない");
assert.equal(SAMPLE_SPACING, 1.2, "踏破サンプル間隔が1.2mでない");
assert.deepEqual([1, 5, 9, 13].map(worldSizeForStrokeCount), [64, 80, 96, 112], "世界スケールが仕様と違う");

let highestAreaRatio = { char: "", ratio: 0 };
const scaleCounts = new Map();
let totalSamples = 0;
for (const kanji of KANJI_DATA) {
  const maze = generateMaze(kanji);
  assert.equal(maze.worldSize, worldSizeForStrokeCount(kanji.strokes.length), `${kanji.char}: 世界スケールが違う`);
  assert.ok(maze.totalSamples > 0, `${kanji.char}: 踏破サンプル点がない`);
  assert.ok(isSampleGraphConnected(maze), `${kanji.char}: サンプル点グラフが単一連結でない`);
  const expectedStart = normalizedToWorld(kanji.strokes[0][0], maze.worldSize);
  assert.equal(maze.start.id, 0, `${kanji.char}: スタートが最初のサンプルでない`);
  assert.equal(maze.start.strokeId, 0, `${kanji.char}: スタートが1画目でない`);
  assert.ok(Math.abs(maze.start.x - expectedStart.x) < 1e-9 && Math.abs(maze.start.z - expectedStart.z) < 1e-9, `${kanji.char}: スタートが1画目の書き始めでない`);
  assert.ok(canStandAt(maze, maze.start.x, maze.start.z), `${kanji.char}: スタート位置に立てない`);
  assert.ok(maze.samples.every((sample) => canStandAt(maze, sample.x, sample.z)), `${kanji.char}: 画上のサンプル点に立てない`);

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
assert.equal(KANJI_DATA.length, 151, "生成データが151字でない");
console.log(`PASS maze: 151 kanji, sample-graph connected/start/samples/collision; samples=${totalSamples}`);
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
assert.equal(getKanjiPool(1, 9).length, 12, "1年9月が12字でない");
assert.equal(getKanjiPool(1, 3).length, 80, "1年3月が80字でない");
assert.equal(getKanjiPool(2, 4).length, 95, "2年4月が95字でない");
assert.equal(getKanjiPool(2, 8).length, 151, "2年8月が151字でない");
console.log("PASS pool exact: g1/9=12, g1/3=80, g2/4=95, g2/8=151");

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
