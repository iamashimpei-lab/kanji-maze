const MOUSE_LOOK_SENSITIVITY = 0.0035;
// 2本指ドラッグの実機調整値。1 CSS px あたりの回転量(rad)。
const TWO_FINGER_LOOK_SENSITIVITY = 0.0042;

export class Controls {
  constructor(canvas, verticalFovDegrees = 67) {
    this.canvas = canvas;
    this.verticalFov = verticalFovDegrees * Math.PI / 180;
    this.keys = new Set();
    this.lookDelta = { x: 0, y: 0 };
    this.mousePointer = null;
    this.mousePoint = { x: 0, y: 0 };
    this.touchPoints = new Map();
    this.touchMode = "idle";
    this.touchGestureId = 0;
    this.touchMidpoint = null;
    this._enabled = true;
    this.bindEvents();
  }

  get enabled() {
    return this._enabled;
  }

  set enabled(value) {
    this._enabled = value;
    if (!value) this.resetPointers();
  }

  bindEvents() {
    window.addEventListener("keydown", (event) => {
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
      }
    });
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.resetPointers();
    });
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    this.canvas.addEventListener("pointerdown", (event) => this.pointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.pointerMove(event));
    this.canvas.addEventListener("pointerup", (event) => this.pointerUp(event));
    this.canvas.addEventListener("pointercancel", (event) => this.pointerUp(event));
    this.canvas.addEventListener("lostpointercapture", (event) => this.pointerUp(event));
  }

  pointerDown(event) {
    if (!this.enabled) return;
    // 高速タップ等で pointer が既に消えていると setPointerCapture が例外を投げ、
    // ハンドラごと死んで以後のタッチが無反応になるため握りつぶす
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // capture できなくても座標イベントは届くので続行する
    }
    if (event.pointerType === "touch") {
      event.preventDefault();
      this.touchPoints.set(event.pointerId, pointFromEvent(event));
      if (this.touchPoints.size === 1) {
        this.touchMode = "walk";
        this.touchGestureId += 1;
        this.touchMidpoint = null;
      } else {
        this.touchMode = "look";
        this.touchMidpoint = midpointOfFirstTwo(this.touchPoints);
      }
      return;
    }
    if (this.mousePointer === null) {
      this.mousePointer = event.pointerId;
      this.mousePoint = pointFromEvent(event);
    }
  }

  pointerMove(event) {
    if (event.pointerType === "touch") {
      event.preventDefault();
      if (!this.enabled || !this.touchPoints.has(event.pointerId)) return;
      this.touchPoints.set(event.pointerId, pointFromEvent(event));
      if (this.touchMode === "look" && this.touchPoints.size >= 2) {
        const midpoint = midpointOfFirstTwo(this.touchPoints);
        if (this.touchMidpoint) {
          // 2本指の中点を使うため、指同士の間隔変化は視点移動にしない。
          this.lookDelta.x += (midpoint.x - this.touchMidpoint.x) * TWO_FINGER_LOOK_SENSITIVITY;
          this.lookDelta.y += (midpoint.y - this.touchMidpoint.y) * TWO_FINGER_LOOK_SENSITIVITY;
        }
        this.touchMidpoint = midpoint;
      }
      return;
    }
    if (!this.enabled || event.pointerId !== this.mousePointer) return;
    const sensitivity = event.pointerType === "mouse" ? MOUSE_LOOK_SENSITIVITY : TWO_FINGER_LOOK_SENSITIVITY;
    this.lookDelta.x += (event.clientX - this.mousePoint.x) * sensitivity;
    this.lookDelta.y += (event.clientY - this.mousePoint.y) * sensitivity;
    this.mousePoint = pointFromEvent(event);
  }

  pointerUp(event) {
    if (event.pointerType === "touch") {
      event.preventDefault();
      if (!this.touchPoints.delete(event.pointerId)) return;
      if (this.touchPoints.size === 0) {
        this.touchMode = "idle";
        this.touchMidpoint = null;
      } else if (this.touchMode === "look" && this.touchPoints.size >= 2) {
        this.touchMidpoint = midpointOfFirstTwo(this.touchPoints);
      }
      // 2本指操作後に1本だけ残っても、全て離すまでは歩行へ戻さない。
      return;
    }
    if (event.pointerId === this.mousePointer) this.mousePointer = null;
  }

  resetPointers() {
    this.mousePointer = null;
    this.touchPoints.clear();
    this.touchMode = "idle";
    this.touchMidpoint = null;
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
  }

  touchYawOffset() {
    if (this.touchMode !== "walk" || this.touchPoints.size !== 1) return 0;
    const point = this.touchPoints.values().next().value;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return 0;
    const normalizedX = Math.max(-1, Math.min(1, ((point.x - rect.left) / rect.width) * 2 - 1));
    const horizontalHalfFov = Math.atan(Math.tan(this.verticalFov / 2) * rect.width / rect.height);
    return normalizedX * horizontalHalfFov;
  }

  read() {
    if (!this.enabled) return emptyInput();
    const forward = Number(this.keys.has("KeyW") || this.keys.has("ArrowUp")) - Number(this.keys.has("KeyS") || this.keys.has("ArrowDown"));
    const strafe = Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) - Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
    const touchWalk = this.touchMode === "walk" && this.touchPoints.size === 1;
    const result = {
      forward,
      strafe,
      lookX: this.lookDelta.x,
      lookY: this.lookDelta.y,
      touchWalk,
      touchGestureId: touchWalk ? this.touchGestureId : null,
      touchYawOffset: touchWalk ? this.touchYawOffset() : 0,
    };
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    return result;
  }
}

function pointFromEvent(event) {
  return { x: event.clientX, y: event.clientY };
}

function midpointOfFirstTwo(points) {
  const [first, second] = [...points.values()];
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function emptyInput() {
  return {
    forward: 0,
    strafe: 0,
    lookX: 0,
    lookY: 0,
    touchWalk: false,
    touchGestureId: null,
    touchYawOffset: 0,
  };
}
