import { GRADE_MONTHS } from "./kanji-data.js";

const SAVE_KEY = "kanji-maze-save-v1";
const DEFAULT_SETTINGS = { grade: 1, month: 3, mapEnabled: true, northStar: true, rotate: false, guideDone2: false };
const MONTH_LABELS = Object.freeze({
  1: "1がつ",
  2: "2がつ",
  3: "3がつ",
  4: "4がつ",
  5: "5がつ",
  6: "6がつ",
  7: "7がつ",
  8: "8がつ",
  9: "9がつ",
  10: "10がつ",
  11: "11がつ",
  12: "12がつ",
});

export class GameUI {
  constructor() {
    this.startScreen = byId("start-screen");
    this.gameScreen = byId("game-screen");
    this.answerPanel = byId("answer-panel");
    this.resultPanel = byId("result-panel");
    this.answerChoices = byId("answer-choices");
    this.feedback = byId("answer-feedback");
    this.notice = byId("notice");
    this.minimap = byId("minimap");
    this.guideOverlay = byId("guide-overlay");
    this.noticeTimer = null;
    this.guideDone2 = false;
    this.restoreSettings();
    document.querySelectorAll('input[name="grade"]').forEach((input) => {
      input.addEventListener("change", () => this.updateMonthChoices(Number(input.value)));
    });
  }

  bind({ onStart, onAnswerOpen, onAnswerClose, onNext, onGuideClose }) {
    byId("start-button").addEventListener("click", () => {
      const settings = this.settings();
      this.saveSettings(settings);
      onStart(settings);
    });
    byId("answer-button").addEventListener("click", onAnswerOpen);
    byId("close-answer").addEventListener("click", onAnswerClose);
    byId("next-button").addEventListener("click", onNext);
    byId("guide-link").addEventListener("click", () => this.showGuide());
    byId("guide-close").addEventListener("click", () => {
      this.guideDone2 = true;
      this.updateSavedValues({ guideDone2: true });
      this.guideOverlay.classList.add("hidden");
      onGuideClose();
    });
  }

  settings() {
    return {
      grade: Number(document.querySelector('input[name="grade"]:checked').value),
      month: Number(document.querySelector('input[name="month"]:checked').value),
      mapEnabled: document.querySelector('input[name="map"]:checked').value === "on",
      northStar: document.querySelector('input[name="north-star"]:checked').value === "on",
      rotate: document.querySelector('input[name="rotate"]:checked').value === "on",
    };
  }

  restoreSettings() {
    let saved = DEFAULT_SETTINGS;
    try {
      saved = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") };
    } catch {
      // 保存内容が壊れていても、初期設定で遊べるようにする。
    }
    this.guideDone2 = saved.guideDone2 === true;
    const grade = GRADE_MONTHS[Number(saved.grade)] ? Number(saved.grade) : DEFAULT_SETTINGS.grade;
    document.querySelector(`input[name="grade"][value="${grade}"]`).checked = true;
    document.querySelector(`input[name="map"][value="${saved.mapEnabled ? "on" : "off"}"]`).checked = true;
    document.querySelector(`input[name="north-star"][value="${saved.northStar ? "on" : "off"}"]`).checked = true;
    document.querySelector(`input[name="rotate"][value="${saved.rotate ? "on" : "off"}"]`).checked = true;
    this.updateMonthChoices(grade, Number(saved.month));
  }

  updateMonthChoices(grade, preferredMonth) {
    const container = byId("month-choices");
    const available = GRADE_MONTHS[grade] ?? GRADE_MONTHS[DEFAULT_SETTINGS.grade];
    const selected = available.includes(preferredMonth) ? preferredMonth : available.at(-1);
    container.replaceChildren();
    for (const [index, month] of available.entries()) {
      const wrapper = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "month";
      input.value = String(month);
      input.checked = month === selected;
      const text = document.createElement("span");
      text.append(MONTH_LABELS[month] ?? `${month}がつ`);
      if (index === available.length - 1) {
        text.append(document.createElement("br"));
        const small = document.createElement("small");
        small.textContent = "ぜんぶ";
        text.append(small);
      }
      wrapper.append(input, text);
      container.appendChild(wrapper);
    }
    byId("cumulative-note").classList.toggle("hidden", grade === 1);
  }

  saveSettings(settings) {
    this.updateSavedValues(settings);
  }

  updateSavedValues(values) {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
    } catch {
      // 壊れた保存内容は、新しい値で置き換える。
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ...saved, ...values }));
    } catch {
      // プライベートブラウズ等で保存不可でもゲーム開始は妨げない。
    }
  }

  showGame(mapEnabled) {
    this.startScreen.classList.add("hidden");
    this.gameScreen.classList.remove("hidden");
    this.minimap.classList.toggle("hidden", !mapEnabled);
  }

  showGuideIfNeeded() {
    if (this.guideDone2) return false;
    this.showGuide();
    return true;
  }

  showGuide() {
    const touch = navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches;
    byId("touch-guide").classList.toggle("hidden", !touch);
    byId("desktop-guide").classList.toggle("hidden", touch);
    this.guideOverlay.classList.remove("hidden");
  }

  showAnswers(choices, choose) {
    this.feedback.textContent = "";
    this.answerChoices.replaceChildren();
    for (const kanji of choices) {
      const button = document.createElement("button");
      button.className = "choice-button";
      button.textContent = kanji.char;
      button.setAttribute("aria-label", `${kanji.char}を えらぶ`);
      button.addEventListener("click", () => choose(kanji));
      this.answerChoices.appendChild(button);
    }
    this.answerPanel.classList.remove("hidden");
  }

  closeAnswers() {
    this.answerPanel.classList.add("hidden");
  }

  showWrong() {
    this.feedback.textContent = "おしい！ 300てん ひかれます。もうすこし あるいてみよう。";
  }

  updateStatus(wrongAnswers, score) {
    byId("wrong-count").textContent = String(wrongAnswers);
    byId("score-display").textContent = String(score);
  }

  flashNotice(message) {
    clearTimeout(this.noticeTimer);
    this.notice.textContent = message;
    this.notice.classList.add("visible");
    this.noticeTimer = setTimeout(() => this.notice.classList.remove("visible"), 1800);
  }

  showResult(kanji, breakdown) {
    byId("result-char").textContent = kanji.char;
    byId("result-title").textContent = `${kanji.reading}`;
    byId("result-meaning").textContent = kanji.meaning;
    byId("result-rate").textContent = `${Math.round(breakdown.explorationRate * 100)}%`;
    byId("result-base").textContent = `${breakdown.base}てん`;
    byId("result-penalty").textContent = breakdown.penalty ? `−${breakdown.penalty}てん` : "0てん";
    byId("result-multiplier").textContent = breakdown.multiplier === 1.5 ? "× 1.5" : "× 1";
    byId("result-total").textContent = `${breakdown.total}てん`;
    this.resultPanel.classList.remove("hidden");
  }

  hideResult() {
    this.resultPanel.classList.add("hidden");
  }

  drawMap(maze, visited, player, yaw) {
    const canvas = this.minimap;
    const context = canvas.getContext("2d");
    const size = canvas.width;
    const padding = 8;
    const scale = (size - padding * 2) / maze.worldSize;
    const mapPoint = (point) => ({
      x: padding + (point.x + maze.worldSize / 2) * scale,
      y: padding + (point.z + maze.worldSize / 2) * scale,
    });
    context.fillStyle = "#eee4c9";
    context.fillRect(0, 0, size, size);
    context.strokeStyle = "#252927";
    context.fillStyle = "#252927";
    context.lineWidth = Math.max(2.2, maze.strokeRadius * 2 * scale);
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const link of maze.sampleLinks) {
      if (!visited.has(link.from.id) || !visited.has(link.to.id)) continue;
      const from = mapPoint(link.from);
      const to = mapPoint(link.to);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    }
    for (const sample of maze.samples) {
      if (!visited.has(sample.id)) continue;
      const point = mapPoint(sample);
      context.beginPath();
      context.arc(point.x, point.y, context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
    }
    const current = mapPoint(player);
    context.save();
    context.translate(current.x, current.y);
    context.rotate(yaw);
    context.beginPath();
    context.moveTo(0, -6);
    context.lineTo(4.5, 5);
    context.lineTo(-4.5, 5);
    context.closePath();
    context.fillStyle = "#c54838";
    context.fill();
    context.restore();
  }
}

function byId(id) {
  return document.getElementById(id);
}
