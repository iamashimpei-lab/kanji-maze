import { getKanjiPool } from "./kanji-data.js";
import { selectAnswerChoices } from "./answers.js";
import { canStandAt, explorationRate, generateMaze, markVisitedSamples, rotateStrokes } from "./maze.js";
import { villageAdditionForTheme } from "./progress.js";
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
let questionPool = [];
let touchSteering = { gestureId: null, baseYaw: 0 };
let roundRotation = 0;

const MOVE_SPEED = 3.8;
// 酔いにくさとのバランスを見る実機調整値。タップ歩行の旋回は毎秒150度を上限にする。
const TOUCH_TURN_SPEED = 150 * Math.PI / 180;

ui.bind({
  onStart: startGame,
  onAnswerOpen: openAnswers,
  onAnswerClose: closeAnswers,
  onNext: nextKanji,
  onGuideClose: closeGuide,
  onMenu: returnToMenu,
});

let loopStarted = false;

function startGame(selectedSettings) {
  settings = selectedSettings;
  questionPool = getKanjiPool(settings.grade, settings.month);
  if (questionPool.length < 4) throw new Error("出題プールは4字以上必要です");
  askedChars = new Set();
  ui.showGame(settings.mapEnabled);
  // view と controls は 1 回だけ生成して使い回す(WebGL コンテキストの増殖と
  // window リスナーの多重登録を避けるため。メニュー復帰では破棄しない)。
  if (!view) {
    view = new MazeRenderer(document.getElementById("viewport"));
    controls = new Controls(view.renderer.domElement, view.camera.fov);
  }
  view.setNorthStar(settings.northStar);
  beginRound(pickNextKanji());
  if (ui.showGuideIfNeeded()) {
    playState = "guide";
    controls.enabled = false;
  }
  lastFrame = performance.now();
  if (!loopStarted) {
    loopStarted = true;
    requestAnimationFrame(frame);
  }
}

// プレイ中にスタート画面(メニュー)へ戻す。ゲームループは回したまま描画だけ止める。
function returnToMenu() {
  if (playState === "start") return;
  playState = "start";
  if (controls) controls.enabled = false;
  ui.returnToStart();
}

function pickNextKanji() {
  let available = questionPool.filter((kanji) => !askedChars.has(kanji.char));
  if (available.length === 0) {
    askedChars = new Set();
    available = [...questionPool];
  }
  const choice = available[Math.floor(Math.random() * available.length)];
  askedChars.add(choice.char);
  return choice;
}

function beginRound(kanji) {
  currentKanji = kanji;
  roundRotation = settings.rotate ? 30 + Math.random() * 300 : 0;
  const mazeSource = roundRotation
    ? { ...kanji, strokes: rotateStrokes(kanji.strokes, roundRotation) }
    : kanji;
  maze = generateMaze(mazeSource);
  wrongAnswers = 0;
  visited = new Set();
  view.buildMaze(maze);
  // 開始位置は画の先端だと丸い端の壁に近すぎるので、2.4m ほど内側のサンプル点に立つ。
  // 向きは最初の数サンプルの平均方向(壁に正対したまま始まると画面が壁一色になるため)
  const firstStroke = maze.samplesByStroke[0];
  const spawn = firstStroke[Math.min(2, firstStroke.length - 1)];
  const ahead = firstStroke[Math.min(5, firstStroke.length - 1)];
  // three.js カメラの前方向は (-sin(yaw), -cos(yaw))。この規約で画の進行方向を向く
  const initialYaw = (spawn === ahead) ? 0 : Math.atan2(-(ahead.x - spawn.x), -(ahead.z - spawn.z));
  markVisitedSamples(maze, visited, spawn.x, spawn.z);
  player = { x: spawn.x, z: spawn.z, yaw: initialYaw, pitch: 0 };
  view.setFirstPerson(player.x, player.z, player.yaw, player.pitch);
  playState = "playing";
  controls.enabled = true;
  ui.updateStatus(0, currentScore());
  ui.drawMap(maze, visited, player, player.yaw);
}

function closeGuide() {
  if (playState !== "guide") return;
  playState = "playing";
  controls.enabled = true;
}

function openAnswers() {
  if (playState !== "playing") return;
  playState = "answering";
  controls.enabled = false;
  const choices = settings.answerMode === "choice" ? selectAnswerChoices(currentKanji, questionPool) : [];
  ui.showAnswers(settings.answerMode, choices, chooseAnswer);
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
  const collection = ui.recordCorrect(currentKanji);
  ui.closeAnswers();
  playState = "revealing";
  controls.enabled = false;
  view.startReveal(visited, () => {
    playState = "result";
    ui.showResult(currentKanji, breakdown, {
      isNew: collection.isNew,
      villageAddition: collection.isNew ? villageAdditionForTheme(currentKanji.theme) : null,
    });
  });
}

function nextKanji() {
  if (playState !== "result") return;
  ui.hideResult();
  beginRound(pickNextKanji());
}

function scoreBreakdown() {
  return getScoreBreakdown({ explorationRate: explorationRate(maze, visited), wrongAnswers, mapEnabled: settings.mapEnabled, answerMode: settings.answerMode });
}

function currentScore() {
  return calculateScore({ explorationRate: explorationRate(maze, visited), wrongAnswers, mapEnabled: settings.mapEnabled, answerMode: settings.answerMode });
}

function frame(now) {
  const delta = Math.min(.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (playState === "playing") updatePlayer(delta);
  // メニュー表示中(start)はゲーム画面が隠れているので描画しない。
  if (view && playState !== "start") view.render(now);
  requestAnimationFrame(frame);
}

function updatePlayer(delta) {
  const input = controls.read();
  player.yaw -= input.lookX;
  player.pitch = Math.max(-.62, Math.min(.62, player.pitch - input.lookY));
  let dx;
  let dz;
  if (input.touchWalk) {
    if (touchSteering.gestureId !== input.touchGestureId) {
      touchSteering = { gestureId: input.touchGestureId, baseYaw: player.yaw };
    }
    const targetYaw = touchSteering.baseYaw - input.touchYawOffset;
    player.yaw = approachAngle(player.yaw, targetYaw, TOUCH_TURN_SPEED * delta);
    // three.js カメラが実際に向いている前方へ、旋回中も歩き続ける。
    dx = -Math.sin(player.yaw) * MOVE_SPEED * delta;
    dz = -Math.cos(player.yaw) * MOVE_SPEED * delta;
  } else {
    touchSteering.gestureId = null;
    const length = Math.hypot(input.forward, input.strafe) || 1;
    const forward = input.forward / Math.max(1, length);
    const strafe = input.strafe / Math.max(1, length);
    // カメラの前方向 (-sin, -cos)・右方向 (cos, -sin) に合わせる。
    // 旧式は x 成分が逆で、東西向きの画では「見ている方向と逆に歩く」バグだった
    dx = (-Math.sin(player.yaw) * forward + Math.cos(player.yaw) * strafe) * MOVE_SPEED * delta;
    dz = (-Math.cos(player.yaw) * forward - Math.sin(player.yaw) * strafe) * MOVE_SPEED * delta;
  }
  if (canStandAt(maze, player.x + dx, player.z)) player.x += dx;
  if (canStandAt(maze, player.x, player.z + dz)) player.z += dz;
  view.setFirstPerson(player.x, player.z, player.yaw, player.pitch);

  if (markVisitedSamples(maze, visited, player.x, player.z)) {
    ui.updateStatus(wrongAnswers, currentScore());
  }
  if (settings.mapEnabled) ui.drawMap(maze, visited, player, player.yaw);
}

function approachAngle(current, target, maxStep) {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + Math.max(-maxStep, Math.min(maxStep, difference));
}
