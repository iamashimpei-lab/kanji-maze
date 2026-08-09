import assert from "node:assert/strict";
import { KANJI_DATA } from "../src/kanji-data.js";
import {
  cellKey,
  connectedComponents,
  generateMaze,
  pointToCell,
} from "../src/maze.js";
import { calculateScore } from "../src/score.js";

const expectedBridges = new Map([
  ["一", 0], ["二", 1], ["三", 2], ["十", 0], ["口", 0],
  ["日", 0], ["田", 0], ["山", 0], ["川", 2], ["木", 0],
]);

for (const kanji of KANJI_DATA) {
  const maze = generateMaze(kanji);
  assert.ok(maze.totalCells > 0, `${kanji.char}: 通路セルがない`);
  assert.equal(connectedComponents(maze.cells).length, 1, `${kanji.char}: 単一連結でない`);
  assert.deepEqual(maze.start, pointToCell(kanji.strokes[0][0]), `${kanji.char}: スタートが違う`);
  assert.ok(maze.cells.has(cellKey(maze.start.x, maze.start.y)), `${kanji.char}: スタートが通路外`);
  assert.equal(maze.bridgeCount, expectedBridges.get(kanji.char), `${kanji.char}: 橋本数が違う`);
  console.log(`PASS maze ${kanji.char}: cells=${maze.totalCells}, bridges=${maze.bridgeCount}`);
}

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
