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
    this.noticeTimer = null;
  }

  bind({ onStart, onAnswerOpen, onAnswerClose, onNext }) {
    byId("start-button").addEventListener("click", () => onStart(this.settings()));
    byId("answer-button").addEventListener("click", onAnswerOpen);
    byId("close-answer").addEventListener("click", onAnswerClose);
    byId("next-button").addEventListener("click", onNext);
  }

  settings() {
    return {
      mapEnabled: document.querySelector('input[name="map"]:checked').value === "on",
      northStar: document.querySelector('input[name="north-star"]:checked').value === "on",
    };
  }

  showGame(mapEnabled) {
    this.startScreen.classList.add("hidden");
    this.gameScreen.classList.remove("hidden");
    this.minimap.classList.toggle("hidden", !mapEnabled);
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
    const scale = size / maze.size;
    context.fillStyle = "#eee4c9";
    context.fillRect(0, 0, size, size);
    context.fillStyle = "#252927";
    for (const key of visited) {
      const [x, y] = key.split(",").map(Number);
      context.fillRect(x * scale - .3, y * scale - .3, scale + .6, scale + .6);
    }
    const px = (player.x + .5) * scale;
    const py = (player.y + .5) * scale;
    context.save();
    context.translate(px, py);
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
