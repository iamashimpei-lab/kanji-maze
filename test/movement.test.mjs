import assert from "node:assert/strict";
import test from "node:test";
import {
  PLAYER_RADIUS,
  canStandAt,
  generateMaze,
  resolvePlayerMovement,
  rotateStrokes,
} from "../src/maze.js";

const ANGLES = [0, 37, 90, 143, 270];
const WORLD_SIZE = 64;
const normalized = ([x, z]) => [0.5 + x / WORLD_SIZE, 0.5 + z / WORLD_SIZE];
const rotatePoint = ({ x, z }, angleDegrees) => {
  const angle = angleDegrees * Math.PI / 180;
  return {
    x: x * Math.cos(angle) - z * Math.sin(angle),
    z: x * Math.sin(angle) + z * Math.cos(angle),
  };
};
const straightStroke = [{
  points: [normalized([-10, 0]), normalized([10, 0])],
  ending: "tome",
}];
const cornerStrokes = [
  { points: [normalized([-10, 0]), normalized([0, 0])], ending: "tome" },
  { points: [normalized([0, 0]), normalized([0, 10])], ending: "tome" },
];

function mazeFor(strokes, angle = 0) {
  return generateMaze({ char: "試", strokes: rotateStrokes(strokes, angle) });
}

function directionAt(angleDegrees) {
  const angle = angleDegrees * Math.PI / 180;
  return {
    tangent: { x: Math.cos(angle), z: Math.sin(angle) },
    normal: { x: -Math.sin(angle), z: Math.cos(angle) },
  };
}

test("内側の角は床の和集合として歩行可能", () => {
  for (const angle of ANGLES) {
    const maze = mazeFor(cornerStrokes, angle);
    const point = rotatePoint({ x: 1.3, z: 1.3 }, angle);
    assert.equal(canStandAt(maze, point.x, point.z), true, `${angle}° の内角に立てない`);
  }
});

test("斜めの壁では接線方向へ滑り、法線方向だけなら停止する", () => {
  for (const angle of ANGLES) {
    const maze = mazeFor(straightStroke, angle);
    const { tangent, normal } = directionAt(angle);
    const start = { x: normal.x * 1.24, z: normal.z * 1.24 };
    const desired = {
      x: normal.x * 0.18 + tangent.x * 0.05,
      z: normal.z * 0.18 + tangent.z * 0.05,
    };
    const moved = resolvePlayerMovement(maze, start.x, start.z, desired.x, desired.z);
    const actual = { x: moved.x - start.x, z: moved.z - start.z };
    const tangentAmount = actual.x * tangent.x + actual.z * tangent.z;
    assert.ok(tangentAmount > 0.04, `${angle}° の壁で接線成分が消えた`);
    assert.equal(canStandAt(maze, moved.x, moved.z), true, `${angle}° のスライド後に通路外へ出た`);

    const headOn = resolvePlayerMovement(maze, start.x, start.z, normal.x * 0.18, normal.z * 0.18);
    assert.ok(Math.hypot(headOn.x - start.x, headOn.z - start.z) < 1e-9, `${angle}° の壁を法線入力で押し抜けた`);
  }
});

test("通路外から数フレームで中心線側へ復帰する", () => {
  const maze = mazeFor(straightStroke, 37);
  const { normal } = directionAt(37);
  let position = { x: normal.x * 2, z: normal.z * 2 };
  assert.equal(canStandAt(maze, position.x, position.z), false, "開始点が通路内になっている");
  for (let frame = 0; frame < 4; frame += 1) {
    position = resolvePlayerMovement(maze, position.x, position.z, 0, 0);
  }
  assert.equal(canStandAt(maze, position.x, position.z), true, "4フレームで通路内へ復帰しない");
});

test("大きい delta 相当でも細い通路間の壁を飛び越えない", () => {
  const maze = {
    strokeRadius: 1.7,
    bridgeRadius: 0.95,
    strokeSegments: [],
    bridgeSegments: [
      { from: { x: -10, z: 0 }, to: { x: 10, z: 0 }, type: "bridge" },
      { from: { x: -10, z: 1.9 }, to: { x: 10, z: 1.9 }, type: "bridge" },
    ],
  };
  const moved = resolvePlayerMovement(maze, 0, 0, 0, 3.8 * 0.5);
  assert.equal(canStandAt(maze, moved.x, moved.z), true, "移動後が通路外になった");
  assert.ok(moved.z < 0.6, "途中の壁を飛び越えて隣の通路へ移った");
});

test("細い橋へずれて進入しても縁に沿って渡り続ける", () => {
  const angle = 37;
  const { tangent, normal } = directionAt(angle);
  const maze = {
    strokeRadius: 1.7,
    bridgeRadius: 0.95,
    strokeSegments: [],
    bridgeSegments: [{
      from: { x: -10 * tangent.x, z: -10 * tangent.z },
      to: { x: 10 * tangent.x, z: 10 * tangent.z },
      type: "bridge",
    }],
  };
  const start = { x: normal.x * 0.49, z: normal.z * 0.49 };
  assert.equal(canStandAt(maze, start.x, start.z), true, "橋の仕様上の有効半径が0.5mでない");
  const moved = resolvePlayerMovement(
    maze,
    start.x,
    start.z,
    tangent.x * 0.12 + normal.x * 0.12,
    tangent.z * 0.12 + normal.z * 0.12,
  );
  const tangentAmount = (moved.x - start.x) * tangent.x + (moved.z - start.z) * tangent.z;
  assert.ok(tangentAmount > 0.1, "橋の縁で進行方向の移動が止まった");
  assert.equal(canStandAt(maze, moved.x, moved.z), true, "橋の縁から外へ出た");
  assert.equal(PLAYER_RADIUS, 0.45, "プレイヤー半径が変更された");
});
