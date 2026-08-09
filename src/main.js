import { KANJI_DATA } from "./kanji-data.js";
import { cellKey, explorationRate, generateMaze } from "./maze.js";
import { calculateScore, getScoreBreakdown } from "./score.js";
import { Controls } from "./controls.js";
import { MazeRenderer } from "./render3d.js";
import { GameUI } from "./ui.js";

const ui = new GameUI();
let view = null;
let controls = null;
let settings = null;
let maze = null;
let currentKanji = null;
let visited = new Set();
let wrongAnswers = 0;
let player = { x: 0, z: 0, yaw: 0, pitch: 0 };
let lastFrame = performance.now();
let playState = "start";
let askedChars = new Set();

ui.bind({
  onStart: startGame,
  onAnswerOpen: openAnswers,
  onAnswerClose: closeAnswers,
  onNext: nextKanji,
});

function startGame(selectedSettings) {
  settings = selectedSettings;
  ui.showGame(settings.mapEnabled);
  view = new MazeRenderer(document.getElementById("viewport"));
  controls = new Controls(view.renderer.domElement, document.getElementById("touch-stick"), document.getElementById("touch-knob"));
  view.setNorthStar(settings.northStar);
  beginRound(pickNextKanji());
  lastFrame = performance.now();
  requestAnimationFrame(frame);
}

function pickNextKanji() {
  let available = KANJI_DATA.filter((kanji) => !askedChars.has(kanji.char));
  if (available.length === 0) {
    askedChars = new Set();
    available = [...KANJI_DATA];
  }
  const choice = available[Math.floor(Math.random() * available.length)];
  askedChars.add(choice.char);
  return choice;
}

function beginRound(kanji) {
  currentKanji = kanji;
  maze = generateMaze(kanji);
  wrongAnswers = 0;
  visited = new Set([cellKey(maze.start.x, maze.start.y)]);
  view.buildMaze(maze);
  const start = view.cellToWorld(maze.start);
  // 開始時は一画目の進行方向を向く(壁に正対したまま始まると画面が壁一色になるため)
  const strokeStart = kanji.strokes[0][0];
  const strokeNext = kanji.strokes[0][1] ?? strokeStart;
  const initialYaw = Math.atan2(strokeNext[0] - strokeStart[0], -(strokeNext[1] - strokeStart[1])) || 0;
  player = { x: start.x, z: start.z, yaw: initialYaw, pitch: 0 };
  playState = "playing";
  controls.enabled = true;
  ui.updateStatus(0, currentScore());
  ui.drawMap(maze, visited, maze.start, player.yaw);
}

function openAnswers() {
  if (playState !== "playing") return;
  playState = "answering";
  controls.enabled = false;
  const others = shuffle(KANJI_DATA.filter((kanji) => kanji.char !== currentKanji.char)).slice(0, 3);
  ui.showAnswers(shuffle([currentKanji, ...others]), chooseAnswer);
}

function closeAnswers() {
  if (playState !== "answering") return;
  ui.closeAnswers();
  playState = "playing";
  controls.enabled = true;
}

function chooseAnswer(choice) {
  if (choice.char !== currentKanji.char) {
    wrongAnswers += 1;
    ui.updateStatus(wrongAnswers, currentScore());
    ui.showWrong();
    setTimeout(() => {
      if (playState === "answering") closeAnswers();
    }, 1100);
    return;
  }
  const breakdown = scoreBreakdown();
  ui.closeAnswers();
  playState = "revealing";
  controls.enabled = false;
  view.startReveal(visited, () => {
    playState = "result";
    ui.showResult(currentKanji, breakdown);
  });
}

function nextKanji() {
  if (playState !== "result") return;
  ui.hideResult();
  beginRound(pickNextKanji());
}

function scoreBreakdown() {
  return getScoreBreakdown({ explorationRate: explorationRate(maze, visited), wrongAnswers, mapEnabled: settings.mapEnabled });
}

function currentScore() {
  return calculateScore({ explorationRate: explorationRate(maze, visited), wrongAnswers, mapEnabled: settings.mapEnabled });
}

function frame(now) {
  const delta = Math.min(.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (playState === "playing") updatePlayer(delta);
  view.render(now);
  requestAnimationFrame(frame);
}

function updatePlayer(delta) {
  const input = controls.read();
  player.yaw -= input.lookX;
  player.pitch = Math.max(-.62, Math.min(.62, player.pitch - input.lookY));
  const length = Math.hypot(input.forward, input.strafe) || 1;
  const forward = input.forward / Math.max(1, length);
  const strafe = input.strafe / Math.max(1, length);
  const speed = 3.15;
  const dx = (Math.sin(player.yaw) * forward + Math.cos(player.yaw) * strafe) * speed * delta;
  const dz = (-Math.cos(player.yaw) * forward + Math.sin(player.yaw) * strafe) * speed * delta;
  if (canStand(player.x + dx, player.z)) player.x += dx;
  if (canStand(player.x, player.z + dz)) player.z += dz;
  view.setFirstPerson(player.x, player.z, player.yaw, player.pitch);

  const cell = view.worldToCell(player.x, player.z);
  const key = cellKey(cell.x, cell.y);
  if (!visited.has(key) && maze.cells.has(key)) {
    visited.add(key);
    ui.updateStatus(wrongAnswers, currentScore());
  }
  if (settings.mapEnabled) ui.drawMap(maze, visited, cell, player.yaw);
}

function canStand(x, z) {
  const radius = .34;
  return [[-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]]
    .every(([dx, dz]) => {
      const cell = view.worldToCell(x + dx, z + dz);
      return maze.cells.has(cellKey(cell.x, cell.y));
    });
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
