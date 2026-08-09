export class Controls {
  constructor(canvas, stick, knob) {
    this.canvas = canvas;
    this.stick = stick;
    this.knob = knob;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.lookDelta = { x: 0, y: 0 };
    this.movePointer = null;
    this.lookPointer = null;
    this.stickOrigin = { x: 0, y: 0 };
    this.dragPoint = { x: 0, y: 0 };
    this.enabled = true;
    this.bindEvents();
  }

  bindEvents() {
    window.addEventListener("keydown", (event) => {
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
      }
    });
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
    window.addEventListener("blur", () => this.keys.clear());
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    this.canvas.addEventListener("pointerdown", (event) => this.pointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.pointerMove(event));
    this.canvas.addEventListener("pointerup", (event) => this.pointerUp(event));
    this.canvas.addEventListener("pointercancel", (event) => this.pointerUp(event));
  }

  pointerDown(event) {
    if (!this.enabled) return;
    this.canvas.setPointerCapture(event.pointerId);
    if (event.pointerType === "touch" && event.clientX < innerWidth * 0.5 && this.movePointer === null) {
      this.movePointer = event.pointerId;
      this.stickOrigin = { x: event.clientX, y: event.clientY };
      this.stick.style.left = `${event.clientX}px`;
      this.stick.style.top = `${event.clientY}px`;
      this.stick.style.opacity = "1";
      return;
    }
    if (this.lookPointer === null) {
      this.lookPointer = event.pointerId;
      this.dragPoint = { x: event.clientX, y: event.clientY };
    }
  }

  pointerMove(event) {
    if (event.pointerId === this.movePointer) {
      const dx = event.clientX - this.stickOrigin.x;
      const dy = event.clientY - this.stickOrigin.y;
      const length = Math.hypot(dx, dy) || 1;
      const limit = 38;
      const scale = Math.min(1, limit / length);
      const shownX = dx * scale;
      const shownY = dy * scale;
      this.knob.style.transform = `translate(${shownX}px, ${shownY}px)`;
      this.move.x = shownX / limit;
      this.move.y = -shownY / limit;
    } else if (event.pointerId === this.lookPointer) {
      const sensitivity = event.pointerType === "mouse" ? 0.0035 : 0.0042;
      this.lookDelta.x += (event.clientX - this.dragPoint.x) * sensitivity;
      this.lookDelta.y += (event.clientY - this.dragPoint.y) * sensitivity;
      this.dragPoint = { x: event.clientX, y: event.clientY };
    }
  }

  pointerUp(event) {
    if (event.pointerId === this.movePointer) {
      this.movePointer = null;
      this.move.x = 0;
      this.move.y = 0;
      this.stick.style.opacity = "0";
      this.knob.style.transform = "translate(0, 0)";
    }
    if (event.pointerId === this.lookPointer) this.lookPointer = null;
  }

  read() {
    if (!this.enabled) return { forward: 0, strafe: 0, lookX: 0, lookY: 0 };
    const forwardKeys = Number(this.keys.has("KeyW") || this.keys.has("ArrowUp")) - Number(this.keys.has("KeyS") || this.keys.has("ArrowDown"));
    const strafeKeys = Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) - Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
    const result = {
      forward: Math.max(-1, Math.min(1, forwardKeys + this.move.y)),
      strafe: Math.max(-1, Math.min(1, strafeKeys + this.move.x)),
      lookX: this.lookDelta.x,
      lookY: this.lookDelta.y,
    };
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    return result;
  }
}
