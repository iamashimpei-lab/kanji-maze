import { createVillageLayout } from "./progress.js";

export class VillageView {
  constructor(canvas, kanjiData) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.kanjiData = kanjiData;
    this.layout = [];
    this.visible = false;
    this.frameId = 0;
    this.startedAt = performance.now();
    this.bubble = null;
    this.resize = this.resize.bind(this);
    this.animate = this.animate.bind(this);
    this.onPointer = this.onPointer.bind(this);
    window.addEventListener("resize", this.resize);
    canvas.addEventListener("pointerup", this.onPointer);
  }

  setRecords(records) {
    this.layout = createVillageLayout(records, this.kanjiData);
    this.bubble = null;
  }

  show() {
    this.visible = true;
    this.startedAt = performance.now();
    this.resize();
    cancelAnimationFrame(this.frameId);
    this.frameId = requestAnimationFrame(this.animate);
  }

  hide() {
    this.visible = false;
    cancelAnimationFrame(this.frameId);
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(bounds.width * ratio);
    const height = Math.round(bounds.height * ratio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  animate(now) {
    if (!this.visible) return;
    this.draw((now - this.startedAt) / 1000);
    this.frameId = requestAnimationFrame(this.animate);
  }

  draw(time) {
    const context = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (!width || !height) return;
    context.clearRect(0, 0, width, height);
    drawNightWash(context, width, height);
    drawHorizon(context, width, height);
    const ordered = [...this.layout].sort((first, second) => layer(first) - layer(second) || first.y - second.y);
    for (const item of ordered) drawVillageItem(context, item, width, height, time);
    drawForegroundWash(context, width, height);
    if (this.bubble) drawBubble(context, this.bubble, width, height);
  }

  onPointer(event) {
    const bounds = this.canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    let nearest = null;
    let distance = Infinity;
    for (const item of this.layout.filter((candidate) => candidate.kind === "spirit")) {
      const driftX = Math.sin(performance.now() / 1700 + item.phase) * 0.008;
      const driftY = Math.cos(performance.now() / 2100 + item.phase) * 0.008;
      const candidateDistance = Math.hypot(x - item.x - driftX, y - item.y - driftY);
      if (candidateDistance < 0.055 * item.scale && candidateDistance < distance) {
        nearest = item;
        distance = candidateDistance;
      }
    }
    this.bubble = nearest ? { ...nearest, x, y } : null;
  }
}

function drawNightWash(context, width, height) {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#071127");
  gradient.addColorStop(0.52, "#152b42");
  gradient.addColorStop(1, "#273d3c");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.save();
  context.globalAlpha = 0.08;
  for (let index = 0; index < 16; index += 1) {
    context.fillStyle = index % 2 ? "#9ab7bd" : "#586c92";
    context.beginPath();
    // 回転はほぼ水平に留める(ラジアンで大きく回すと放射状の筋に見える)
    context.ellipse(
      width * ((index * 0.173) % 1),
      height * (0.12 + (index % 7) * 0.12),
      width * (0.13 + (index % 3) * 0.05),
      height * (0.03 + (index % 4) * 0.012),
      ((index % 5) - 2) * 0.06,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.restore();
}

function drawHorizon(context, width, height) {
  context.fillStyle = "rgba(30, 51, 55, .82)";
  context.beginPath();
  context.moveTo(0, height * 0.52);
  for (let x = 0; x <= width; x += width / 12) {
    context.lineTo(x, height * (0.48 + Math.sin(x * 0.017) * 0.025));
  }
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.fill();
  context.strokeStyle = "rgba(172, 193, 174, .18)";
  context.lineWidth = Math.max(1, height * 0.004);
  context.beginPath();
  context.moveTo(0, height * 0.82);
  context.bezierCurveTo(width * 0.28, height * 0.68, width * 0.66, height * 0.91, width, height * 0.73);
  context.stroke();
}

function drawForegroundWash(context, width, height) {
  const gradient = context.createLinearGradient(0, height * 0.7, 0, height);
  gradient.addColorStop(0, "rgba(8, 19, 28, 0)");
  gradient.addColorStop(1, "rgba(4, 12, 20, .38)");
  context.fillStyle = gradient;
  context.fillRect(0, height * 0.7, width, height * 0.3);
}

function drawVillageItem(context, item, width, height, time) {
  const base = Math.min(width, height) * 0.052 * item.scale;
  let x = item.x * width;
  let y = item.y * height;
  if (item.kind === "spirit") {
    x += Math.sin(time * 0.9 + item.phase) * base * 0.16;
    y += Math.cos(time * 0.72 + item.phase) * base * 0.13;
  }
  context.save();
  context.translate(x, y);
  if (item.kind === "star") drawStar(context, base, item.variant);
  else if (item.kind === "moon") drawMoon(context, base);
  else if (item.kind === "mountain") drawMountain(context, base, item.variant);
  else if (item.kind === "rock") drawRock(context, base);
  else if (item.kind === "stream") drawStream(context, base);
  else if (item.kind === "pond") drawPond(context, base);
  else if (item.kind === "tree") drawTree(context, base, item.variant);
  else if (item.kind === "field") drawField(context, base);
  else if (item.kind === "flower") drawFlower(context, base);
  else if (item.kind === "fire") drawFire(context, base, time + item.phase);
  else if (item.kind === "lantern") drawLantern(context, base, time + item.phase);
  else if (item.kind === "house") drawHouse(context, base, item.variant);
  else if (item.kind === "bridge") drawBridge(context, base);
  else if (item.kind === "sign") drawSign(context, base);
  else if (item.kind === "spirit") drawSpirit(context, base, item.variant, time + item.phase);
  else drawStone(context, base);
  context.restore();
}

function drawStar(context, size, variant) {
  context.fillStyle = variant % 2 ? "rgba(246, 218, 135, .8)" : "rgba(206, 225, 245, .75)";
  context.beginPath();
  context.arc(0, 0, size * 0.1, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = context.fillStyle;
  context.lineWidth = size * 0.05;
  context.beginPath();
  context.moveTo(-size * 0.27, 0);
  context.lineTo(size * 0.27, 0);
  context.moveTo(0, -size * 0.27);
  context.lineTo(0, size * 0.27);
  context.stroke();
}

function drawMoon(context, size) {
  context.fillStyle = "rgba(244, 220, 151, .86)";
  context.beginPath();
  context.arc(0, 0, size * 0.38, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgba(10, 23, 44, .9)";
  context.beginPath();
  context.arc(size * 0.17, -size * 0.09, size * 0.38, 0, Math.PI * 2);
  context.fill();
}

function drawMountain(context, size, variant) {
  context.fillStyle = variant % 2 ? "rgba(64, 74, 81, .88)" : "rgba(73, 75, 77, .86)";
  context.beginPath();
  context.moveTo(-size, size * 0.48);
  context.lineTo(-size * 0.1, -size * 0.78);
  context.lineTo(size, size * 0.48);
  context.closePath();
  context.fill();
  context.fillStyle = "rgba(191, 200, 195, .35)";
  context.beginPath();
  context.moveTo(-size * 0.1, -size * 0.78);
  context.lineTo(-size * 0.42, -size * 0.33);
  context.lineTo(-size * 0.06, -size * 0.43);
  context.lineTo(size * 0.2, -size * 0.28);
  context.closePath();
  context.fill();
}

function drawRock(context, size) {
  context.fillStyle = "rgba(112, 111, 102, .78)";
  context.beginPath();
  context.moveTo(-size * 0.45, size * 0.32);
  context.lineTo(-size * 0.32, -size * 0.2);
  context.lineTo(size * 0.12, -size * 0.4);
  context.lineTo(size * 0.5, size * 0.2);
  context.closePath();
  context.fill();
}

function drawStream(context, size) {
  context.strokeStyle = "rgba(112, 190, 202, .45)";
  context.lineWidth = size * 0.34;
  context.lineCap = "round";
  context.beginPath();
  context.bezierCurveTo(-size, -size * 0.5, size, size * 0.45, size * 1.2, 0);
  context.stroke();
}

function drawPond(context, size) {
  context.fillStyle = "rgba(91, 162, 177, .46)";
  context.beginPath();
  context.ellipse(0, 0, size * 0.82, size * 0.3, -0.08, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "rgba(197, 226, 220, .34)";
  context.lineWidth = size * 0.05;
  context.stroke();
}

function drawTree(context, size, variant) {
  context.fillStyle = "#4b3c30";
  context.fillRect(-size * 0.09, -size * 0.05, size * 0.18, size * 0.72);
  context.fillStyle = variant % 2 ? "rgba(80, 112, 77, .88)" : "rgba(66, 101, 78, .9)";
  for (const [x, y, scale] of [[0, -.48, .55], [-.3, -.26, .4], [.3, -.23, .42]]) {
    context.beginPath();
    context.arc(x * size, y * size, scale * size, 0, Math.PI * 2);
    context.fill();
  }
}

function drawField(context, size) {
  context.strokeStyle = "rgba(151, 153, 86, .74)";
  context.lineWidth = size * 0.09;
  for (let index = -2; index <= 2; index += 1) {
    context.beginPath();
    context.moveTo(index * size * 0.24, size * 0.42);
    context.lineTo(index * size * 0.18, -size * 0.42);
    context.stroke();
  }
}

function drawFlower(context, size) {
  context.strokeStyle = "rgba(93, 137, 84, .8)";
  context.lineWidth = size * 0.08;
  context.beginPath();
  context.moveTo(0, size * 0.5);
  context.lineTo(0, 0);
  context.stroke();
  context.fillStyle = "rgba(218, 154, 157, .8)";
  for (let part = 0; part < 5; part += 1) {
    const angle = part / 5 * Math.PI * 2;
    context.beginPath();
    context.arc(Math.cos(angle) * size * 0.21, Math.sin(angle) * size * 0.21, size * 0.18, 0, Math.PI * 2);
    context.fill();
  }
}

function drawFire(context, size, time) {
  const flicker = 0.86 + Math.sin(time * 6) * 0.12;
  context.fillStyle = "rgba(231, 104, 57, .85)";
  context.beginPath();
  context.moveTo(0, -size * 0.7 * flicker);
  context.quadraticCurveTo(size * 0.62, 0, 0, size * 0.5);
  context.quadraticCurveTo(-size * 0.62, 0, 0, -size * 0.7 * flicker);
  context.fill();
  context.fillStyle = "rgba(251, 210, 111, .9)";
  context.beginPath();
  context.ellipse(0, size * 0.05, size * 0.18, size * 0.31, 0, 0, Math.PI * 2);
  context.fill();
}

function drawLantern(context, size, time) {
  context.fillStyle = "#4d3629";
  context.fillRect(-size * 0.06, -size * 0.3, size * 0.12, size * 0.85);
  context.fillStyle = `rgba(245, 188, 91, ${0.72 + Math.sin(time * 4) * 0.08})`;
  context.fillRect(-size * 0.24, -size * 0.55, size * 0.48, size * 0.43);
}

function drawHouse(context, size, variant) {
  context.fillStyle = variant % 2 ? "rgba(182, 158, 122, .9)" : "rgba(154, 139, 112, .9)";
  context.fillRect(-size * 0.65, -size * 0.25, size * 1.3, size * 0.85);
  context.fillStyle = "rgba(66, 51, 46, .95)";
  context.beginPath();
  context.moveTo(-size * 0.82, -size * 0.24);
  context.lineTo(0, -size * 0.88);
  context.lineTo(size * 0.82, -size * 0.24);
  context.closePath();
  context.fill();
  context.fillStyle = "rgba(244, 194, 103, .78)";
  context.fillRect(-size * 0.42, 0, size * 0.28, size * 0.28);
}

function drawBridge(context, size) {
  context.strokeStyle = "rgba(128, 80, 54, .9)";
  context.lineWidth = size * 0.18;
  context.beginPath();
  context.arc(0, size * 0.55, size * 0.85, Math.PI * 1.12, Math.PI * 1.88);
  context.stroke();
}

function drawSign(context, size) {
  context.fillStyle = "rgba(113, 86, 59, .86)";
  context.fillRect(-size * 0.07, -size * 0.15, size * 0.14, size * 0.75);
  context.fillRect(-size * 0.45, -size * 0.45, size * 0.9, size * 0.38);
}

function drawStone(context, size) {
  context.fillStyle = "rgba(143, 139, 125, .68)";
  context.beginPath();
  context.ellipse(0, 0, size * 0.38, size * 0.2, 0, 0, Math.PI * 2);
  context.fill();
}

function drawSpirit(context, size, variant, time) {
  const glow = context.createRadialGradient(0, 0, 0, 0, 0, size * 0.9);
  glow.addColorStop(0, "rgba(218, 241, 213, .42)");
  glow.addColorStop(1, "rgba(218, 241, 213, 0)");
  context.fillStyle = glow;
  context.beginPath();
  context.arc(0, 0, size * 0.9, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = variant % 2 ? "rgba(202, 231, 217, .94)" : "rgba(231, 224, 181, .94)";
  context.beginPath();
  context.ellipse(0, 0, size * 0.38, size * 0.32, 0, 0, Math.PI * 2);
  if (variant === 0 || variant === 2) {
    context.moveTo(-size * 0.3, -size * 0.18);
    context.lineTo(-size * 0.48, -size * 0.56);
    context.lineTo(-size * 0.08, -size * 0.3);
    context.moveTo(size * 0.3, -size * 0.18);
    context.lineTo(size * 0.48, -size * 0.56);
    context.lineTo(size * 0.08, -size * 0.3);
  } else {
    context.moveTo(size * 0.28, size * 0.04);
    context.quadraticCurveTo(size * 0.82, -size * 0.18, size * 0.65, -size * 0.5);
    context.quadraticCurveTo(size * 0.9, -size * 0.22, size * 0.42, size * 0.22);
  }
  context.fill();
  const blink = Math.sin(time * 1.7) > 0.96;
  context.fillStyle = "rgba(22, 40, 43, .84)";
  for (const side of [-1, 1]) {
    context.beginPath();
    context.ellipse(side * size * 0.13, -size * 0.03, size * 0.035, blink ? size * 0.012 : size * 0.055, 0, 0, Math.PI * 2);
    context.fill();
  }
}

function drawBubble(context, bubble, width, height) {
  const text = `${bubble.char}  ${bubble.reading}`;
  const fontSize = Math.max(15, Math.min(width, height) * 0.035);
  context.font = `700 ${fontSize}px "Hiragino Maru Gothic ProN", sans-serif`;
  const padding = fontSize * 0.7;
  const boxWidth = context.measureText(text).width + padding * 2;
  const boxHeight = fontSize * 2.15;
  const x = Math.max(8, Math.min(width - boxWidth - 8, bubble.x * width - boxWidth / 2));
  const y = Math.max(8, bubble.y * height - boxHeight - fontSize);
  context.fillStyle = "rgba(247, 240, 218, .96)";
  context.strokeStyle = "rgba(112, 87, 54, .9)";
  context.lineWidth = Math.max(1, fontSize * 0.08);
  roundRect(context, x, y, boxWidth, boxHeight, fontSize * 0.45);
  context.fill();
  context.stroke();
  context.fillStyle = "#24302f";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, x + boxWidth / 2, y + boxHeight / 2);
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function layer(item) {
  if (item.theme === "sky") return 0;
  if (item.theme === "mountain") return 1;
  if (item.theme === "water") return 4;
  return 2;
}
