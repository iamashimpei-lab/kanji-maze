import assert from "node:assert/strict";
import { GRADE_MONTHS, KANJI_DATA, getKanjiPool } from "../src/kanji-data.js";
import {
  cellKey,
  connectedComponents,
  generateMaze,
  gridSizeForStrokeCount,
  pointToCell,
} from "../src/maze.js";
import { calculateScore } from "../src/score.js";

const expectedBridges = new Map([
  ["一", 0], ["二", 1], ["三", 2], ["十", 0], ["口", 0],
  ["日", 0], ["田", 0], ["山", 0], ["川", 2], ["木", 0],
]);

let highestPassageRatio = { char: "", ratio: 0 };
const gridCounts = new Map();
for (const kanji of KANJI_DATA) {
  const maze = generateMaze(kanji);
  assert.equal(maze.size, gridSizeForStrokeCount(kanji.strokes.length), `${kanji.char}: グリッドサイズが違う`);
  assert.ok(maze.totalCells > 0, `${kanji.char}: 通路セルがない`);
  assert.equal(connectedComponents(maze.cells).length, 1, `${kanji.char}: 単一連結でない`);
  assert.deepEqual(maze.start, pointToCell(kanji.strokes[0][0], maze.size), `${kanji.char}: スタートが違う`);
  assert.ok(maze.cells.has(cellKey(maze.start.x, maze.start.y)), `${kanji.char}: スタートが通路外`);
  const passageRatio = maze.totalCells / (maze.size ** 2);
  assert.ok(passageRatio < .55, `${kanji.char}: 通路がグリッドの55%以上`);
  if (passageRatio > highestPassageRatio.ratio) highestPassageRatio = { char: kanji.char, ratio: passageRatio };
  gridCounts.set(maze.size, (gridCounts.get(maze.size) ?? 0) + 1);
  if (expectedBridges.has(kanji.char)) {
    assert.equal(maze.bridgeCount, expectedBridges.get(kanji.char), `${kanji.char}: 橋本数が違う`);
  }
}
assert.equal(KANJI_DATA.length, 151, "生成データが151字でない");
console.log(`PASS maze: 151 kanji, connected/start/passage/ratio; max=${highestPassageRatio.char}:${(highestPassageRatio.ratio * 100).toFixed(2)}%`);
console.log(`PASS grid sizes: ${[...gridCounts].map(([size, count]) => `${size}=${count}`).join(", ")}`);
console.log(`PASS known bridges: ${[...expectedBridges].map(([char, count]) => `${char}=${count}`).join(", ")}`);

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
