// Keyboard, mouse and touch.
// Desktop: pointer lock. Click the view to capture the mouse; the mouse looks freely,
// left click uses what's under the crosshair, Esc releases and pauses.
// Touch (and ?nolock=1 for automated tests): drag to look, tap to use.

export type Action = 'crouch' | 'use' | 'phone' | 'escape' | 'mute' | 'useDown' | 'useUp';

export interface InputHandlers {
  onTap: (x: number, y: number) => void;
  onAction: (a: Action) => void;
  onHold: (down: boolean) => void;
  onLockChange: (locked: boolean) => void;
  /** Return true if a click on the view should capture the mouse right now. */
  wantsLock: () => boolean;
}

interface Track {
  x: number;
  y: number;
  sx: number;
  sy: number;
  t: number;
  moved: boolean;
  touch: boolean;
}

export class Input {
  keys = new Set<string>();
  joy = { x: 0, y: 0 };
  pointer = { x: -1, y: -1, over: false };
  sensitivity = 1;
  invertY = false;
  /** pointer lock disabled (touch devices, automated tests) */
  noLock: boolean;
  locked = false;
  /** look movement this frame (pixels), for "keep the mouse still" */
  lastLookPx = 0;
  holdingSpace = false;
  holdingUse = false;
  private lookDX = 0;
  private lookDY = 0;
  private tracks = new Map<number, Track>();
  usedTouch = false;
  enabled = true;

  constructor(
    private el: HTMLElement,
    private h: InputHandlers,
    noLock: boolean,
  ) {
    this.noLock = noLock;
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    el.addEventListener('pointerleave', () => (this.pointer.over = false));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', this.lockedMove);
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
      if (!this.locked) this.releaseHolds();
      this.h.onLockChange(this.locked);
    });
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.releaseHolds();
    });
    window.addEventListener('touchstart', () => (this.usedTouch = true), { passive: true });
  }

  get lockMode(): boolean {
    return !this.noLock && !this.usedTouch;
  }

  requestLock(): void {
    if (!this.lockMode || this.locked) return;
    try {
      const r = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch {
      /* not allowed here */
    }
  }

  exitLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  private releaseHolds(): void {
    if (this.holdingSpace) {
      this.holdingSpace = false;
      this.h.onHold(false);
    }
    if (this.holdingUse) {
      this.holdingUse = false;
      this.h.onAction('useUp');
    }
  }

  get dragging(): boolean {
    for (const t of this.tracks.values()) if (t.moved) return true;
    return false;
  }

  private lockedMove = (e: MouseEvent) => {
    if (!this.locked || !this.enabled) return;
    this.lookDX += e.movementX * this.sensitivity;
    this.lookDY += e.movementY * this.sensitivity * (this.invertY ? -1 : 1);
  };

  private down = (e: PointerEvent) => {
    if (!this.enabled) return;
    if (e.pointerType === 'touch') this.usedTouch = true;
    if (this.locked) {
      if (e.button === 0) {
        this.holdingUse = true;
        this.h.onAction('useDown');
        this.h.onAction('use');
      }
      return;
    }
    if (this.lockMode && e.pointerType === 'mouse' && this.h.wantsLock()) {
      this.requestLock();
      return;
    }
    this.tracks.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, touch: e.pointerType !== 'mouse' });
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  private move = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && !this.locked) {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.over = true;
    }
    const t = this.tracks.get(e.pointerId);
    if (!t || !this.enabled) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    t.x = e.clientX;
    t.y = e.clientY;
    if (!t.moved && Math.hypot(e.clientX - t.sx, e.clientY - t.sy) > 7) t.moved = true;
    if (t.moved) {
      const k = (t.touch ? 1.25 : 1) * this.sensitivity;
      this.lookDX += dx * k;
      this.lookDY += dy * k * (this.invertY ? -1 : 1);
    }
  };

  private up = (e: PointerEvent) => {
    if (this.locked && e.button === 0 && this.holdingUse) {
      this.holdingUse = false;
      this.h.onAction('useUp');
      return;
    }
    const t = this.tracks.get(e.pointerId);
    this.tracks.delete(e.pointerId);
    if (!t || !this.enabled || e.type === 'pointercancel') return;
    if (!t.moved && performance.now() - t.t < 600) this.h.onTap(e.clientX, e.clientY);
  };

  private keydown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (e.code === 'Escape') {
      this.h.onAction('escape');
      return;
    }
    if (!this.enabled) return;
    this.keys.add(e.code);
    if (e.repeat) return;
    switch (e.code) {
      case 'KeyC':
      case 'ControlLeft':
      case 'ControlRight':
        this.h.onAction('crouch');
        break;
      case 'KeyE':
      case 'KeyF':
        this.holdingUse = true;
        this.h.onAction('useDown');
        this.h.onAction('use');
        break;
      case 'Tab':
      case 'KeyP':
        this.h.onAction('phone');
        break;
      case 'KeyM':
        this.h.onAction('mute');
        break;
      case 'Space':
        this.holdingSpace = true;
        this.h.onHold(true);
        break;
    }
  };

  private keyup = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === 'Space' && this.holdingSpace) {
      this.holdingSpace = false;
      this.h.onHold(false);
    }
    if ((e.code === 'KeyE' || e.code === 'KeyF') && this.holdingUse) {
      this.holdingUse = false;
      this.h.onAction('useUp');
    }
  };

  get hurry(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  moveVector(): { x: number; y: number } {
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD')) x += 1;
    if (k.has('KeyA')) x -= 1;
    x += this.joy.x;
    y += this.joy.y;
    return { x, y };
  }

  turnVector(): number {
    let t = 0;
    if (this.keys.has('ArrowLeft')) t -= 1;
    if (this.keys.has('ArrowRight')) t += 1;
    return t;
  }

  consumeLook(): { dx: number; dy: number } {
    const r = { dx: this.lookDX, dy: this.lookDY };
    this.lastLookPx = Math.hypot(r.dx, r.dy);
    this.lookDX = 0;
    this.lookDY = 0;
    return r;
  }

  reset(): void {
    this.keys.clear();
    this.joy.x = 0;
    this.joy.y = 0;
    this.lookDX = this.lookDY = 0;
    this.tracks.clear();
    this.releaseHolds();
  }
}
