import { GRADE_MONTHS, KANJI_DATA } from "./kanji-data.js";
import { normalizeSolvedRecords, recordSolved, summarizeSolved } from "./progress.js";
import { VillageView } from "./village.js";

export const SAVE_KEY = "kanji-maze-save-v1";
const DEFAULT_SETTINGS = {
  grade: 1,
  month: 3,
  mapEnabled: true,
  northStar: true,
  rotate: false,
  answerMode: "choice",
  guideDone2: false,
  solvedKanji: {},
  latestSolvedChar: null,
};
const MONTH_LABELS = Object.freeze({
  1: "1がつ", 2: "2がつ", 3: "3がつ", 4: "4がつ", 5: "5がつ", 6: "6がつ",
  7: "7がつ", 8: "8がつ", 9: "9がつ", 10: "10がつ", 11: "11がつ", 12: "12がつ",
});
const THEME_LABELS = Object.freeze({
  water: "みず", mountain: "やま", plant: "くさき", fire: "ひかり", sky: "そら",
  animal: "どうぶつ", life: "くらし", town: "まち", neutral: "ことば",
});

export class GameUI {
  constructor() {
    this.startScreen = byId("start-screen");
    this.gameScreen = byId("game-screen");
    this.answerPanel = byId("answer-panel");
    this.resultPanel = byId("result-panel");
    this.answerChoices = byId("answer-choices");
    this.answerInputArea = byId("answer-input-area");
    this.answerInput = byId("answer-input");
    this.feedback = byId("answer-feedback");
    this.notice = byId("notice");
    this.minimap = byId("minimap");
    this.guideOverlay = byId("guide-overlay");
    this.zukanOverlay = byId("zukan-overlay");
    this.villageOverlay = byId("village-overlay");
    this.noticeTimer = null;
    this.guideDone2 = false;
    this.chooseInputAnswer = null;
    this.village = new VillageView(byId("village-canvas"), KANJI_DATA);
    this.restoreSettings();
    document.querySelectorAll('input[name="grade"]').forEach((input) => {
      input.addEventListener("change", () => this.updateMonthChoices(Number(input.value)));
    });
  }

  bind({ onStart, onAnswerOpen, onAnswerClose, onNext, onGuideClose, onMenu }) {
    byId("start-button").addEventListener("click", () => {
      const settings = this.settings();
      this.saveSettings(settings);
      onStart(settings);
    });
    byId("answer-button").addEventListener("click", onAnswerOpen);
    byId("menu-button").addEventListener("click", onMenu);
    byId("close-answer").addEventListener("click", onAnswerClose);
    byId("next-button").addEventListener("click", onNext);
    byId("guide-link").addEventListener("click", () => this.showGuide());
    byId("guide-close").addEventListener("click", () => {
      this.guideDone2 = true;
      this.updateSavedValues({ guideDone2: true });
      this.guideOverlay.classList.add("hidden");
      onGuideClose();
    });
    byId("answer-input-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!this.chooseInputAnswer) return;
      this.chooseInputAnswer({ char: this.answerInput.value.trim() });
    });
    byId("zukan-button").addEventListener("click", () => this.showZukan(this.settings().grade));
    byId("close-zukan").addEventListener("click", () => this.zukanOverlay.classList.add("hidden"));
    document.querySelectorAll("[data-zukan-grade]").forEach((button) => {
      button.addEventListener("click", () => this.showZukan(Number(button.dataset.zukanGrade)));
    });
    byId("village-button").addEventListener("click", () => this.showVillage());
    byId("close-village").addEventListener("click", () => {
      this.village.hide();
      this.villageOverlay.classList.add("hidden");
    });
  }

  settings() {
    return {
      grade: Number(document.querySelector('input[name="grade"]:checked').value),
      month: Number(document.querySelector('input[name="month"]:checked').value),
      mapEnabled: document.querySelector('input[name="map"]:checked').value === "on",
      northStar: document.querySelector('input[name="north-star"]:checked').value === "on",
      rotate: document.querySelector('input[name="rotate"]:checked').value === "on",
      answerMode: document.querySelector('input[name="answer-mode"]:checked').value,
    };
  }

  restoreSettings() {
    const saved = { ...DEFAULT_SETTINGS, ...this.readSavedValues() };
    this.guideDone2 = saved.guideDone2 === true;
    const grade = GRADE_MONTHS[Number(saved.grade)] ? Number(saved.grade) : DEFAULT_SETTINGS.grade;
    document.querySelector(`input[name="grade"][value="${grade}"]`).checked = true;
    document.querySelector(`input[name="map"][value="${saved.mapEnabled ? "on" : "off"}"]`).checked = true;
    document.querySelector(`input[name="north-star"][value="${saved.northStar ? "on" : "off"}"]`).checked = true;
    document.querySelector(`input[name="rotate"][value="${saved.rotate ? "on" : "off"}"]`).checked = true;
    const answerMode = saved.answerMode === "input" ? "input" : "choice";
    document.querySelector(`input[name="answer-mode"][value="${answerMode}"]`).checked = true;
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
      const label = document.createElement("span");
      label.append(MONTH_LABELS[month] ?? `${month}がつ`);
      if (index === available.length - 1) {
        label.append(document.createElement("br"));
        const small = document.createElement("small");
        small.textContent = "ぜんぶ";
        label.append(small);
      }
      wrapper.append(input, label);
      container.appendChild(wrapper);
    }
    byId("cumulative-note").classList.toggle("hidden", grade === 1);
  }

  saveSettings(settings) {
    this.updateSavedValues(settings);
  }

  readSavedValues() {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  updateSavedValues(values) {
    const saved = this.readSavedValues();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ...saved, ...values }));
    } catch {
      // 保存不可でもゲーム進行は妨げない。
    }
  }

  solvedRecords() {
    const saved = this.readSavedValues();
    // 配列形式・count 数値だけの試作版も読み込めるよう normalize して移行する。
    return normalizeSolvedRecords(saved.solvedKanji ?? saved.solved ?? {});
  }

  recordCorrect(kanji, solvedAt = new Date().toISOString()) {
    const result = recordSolved(this.solvedRecords(), kanji.char, solvedAt);
    this.updateSavedValues({ solvedKanji: result.records, latestSolvedChar: kanji.char });
    return result;
  }

  showGame(mapEnabled) {
    this.startScreen.classList.add("hidden");
    this.gameScreen.classList.remove("hidden");
    this.minimap.classList.toggle("hidden", !mapEnabled);
  }

  returnToStart() {
    this.closeAnswers();
    this.hideResult();
    this.guideOverlay.classList.add("hidden");
    this.gameScreen.classList.add("hidden");
    this.startScreen.classList.remove("hidden");
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

  showAnswers(mode, choices, choose) {
    this.feedback.textContent = "";
    this.answerInput.value = "";
    this.chooseInputAnswer = mode === "input" ? choose : null;
    this.answerChoices.replaceChildren();
    this.answerPanel.classList.toggle("input-mode", mode === "input");
    this.answerChoices.classList.toggle("hidden", mode !== "choice");
    this.answerInputArea.classList.toggle("hidden", mode !== "input");
    byId("answer-title").textContent = mode === "input" ? "かんじを いれよう" : "こたえを えらぼう";
    if (mode === "choice") {
      for (const kanji of choices) {
        const button = document.createElement("button");
        button.className = "choice-button";
        button.textContent = kanji.char;
        button.setAttribute("aria-label", `${kanji.char}を えらぶ`);
        button.addEventListener("click", () => choose(kanji));
        this.answerChoices.appendChild(button);
      }
    }
    this.answerPanel.classList.remove("hidden");
    if (mode === "input") requestAnimationFrame(() => this.answerInput.focus());
  }

  closeAnswers() {
    this.answerPanel.classList.add("hidden");
    this.answerInput.value = "";
    this.chooseInputAnswer = null;
  }

  showWrong() {
    this.answerInput.value = "";
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

  showResult(kanji, breakdown, collection = {}) {
    byId("result-char").textContent = kanji.char;
    byId("result-title").textContent = kanji.reading;
    byId("result-meaning").textContent = kanji.meaning;
    byId("result-rate").textContent = `${Math.round(breakdown.explorationRate * 100)}%`;
    byId("result-base").textContent = `${breakdown.base}てん`;
    byId("result-penalty").textContent = breakdown.penalty ? `−${breakdown.penalty}てん` : "0てん";
    byId("result-map-multiplier").textContent = breakdown.mapMultiplier === 1.5 ? "× 1.5" : "× 1";
    const inputRow = byId("result-input-row");
    inputRow.classList.toggle("hidden", breakdown.inputMultiplier === 1);
    byId("result-input-multiplier").textContent = "× 1.5";
    byId("result-total").textContent = `${breakdown.total}てん`;
    byId("collection-new").classList.toggle("hidden", !collection.isNew);
    const villageMessage = byId("village-new");
    villageMessage.textContent = collection.villageAddition ? `むらに ${collection.villageAddition}が ふえたよ` : "";
    villageMessage.classList.toggle("hidden", !collection.villageAddition);
    this.resultPanel.classList.remove("hidden");
  }

  hideResult() {
    this.resultPanel.classList.add("hidden");
  }

  showZukan(grade) {
    const selectedGrade = Math.max(1, Math.min(6, Number(grade) || 1));
    const records = this.solvedRecords();
    const saved = this.readSavedValues();
    const gradeKanji = KANJI_DATA.filter((kanji) => kanji.grade === selectedGrade);
    const solvedCount = gradeKanji.filter((kanji) => records[kanji.char]).length;
    byId("zukan-progress").textContent = `${selectedGrade}ねんせい ${gradeKanji.length}じちゅう ${solvedCount}じ`;
    document.querySelectorAll("[data-zukan-grade]").forEach((button) => {
      const active = Number(button.dataset.zukanGrade) === selectedGrade;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    const grid = byId("zukan-grid");
    grid.replaceChildren();
    for (const kanji of gradeKanji) {
      const record = records[kanji.char];
      const card = document.createElement("article");
      card.className = `zukan-card theme-${kanji.theme}${record ? " solved" : " locked"}`;
      if (record && saved.latestSolvedChar === kanji.char) card.classList.add("latest");
      const char = document.createElement("div");
      char.className = "zukan-char";
      char.textContent = kanji.char;
      const reading = document.createElement("p");
      reading.className = "zukan-reading";
      reading.textContent = record ? kanji.reading : "まだ ひみつ";
      const meaning = document.createElement("p");
      meaning.className = "zukan-meaning";
      meaning.textContent = record ? kanji.meaning : "といて みつけよう";
      const footer = document.createElement("p");
      footer.className = "zukan-stars";
      const stars = record ? (record.count >= 5 ? 3 : record.count >= 3 ? 2 : 1) : 0;
      footer.textContent = record ? `${"★".repeat(stars)}${"☆".repeat(3 - stars)}  ${THEME_LABELS[kanji.theme]}` : "☆ ☆ ☆";
      card.append(char, reading, meaning, footer);
      grid.appendChild(card);
    }
    this.zukanOverlay.classList.remove("hidden");
  }

  showVillage() {
    const records = this.solvedRecords();
    const summary = summarizeSolved(records, KANJI_DATA);
    byId("village-progress").textContent = summary.total
      ? `${summary.total}じから うまれた よるのむら。せいれいを おしてみよう。`
      : "はじめての かんじを とくと、ここに けしきが ふえるよ。";
    this.village.setRecords(records);
    this.villageOverlay.classList.remove("hidden");
    this.village.show();
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
