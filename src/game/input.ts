// Keyboard, mouse and touch. Drag anywhere on the view to look; click/tap on
// something to use it. Touch gets a virtual joystick (see ui.ts).

export interface InputHandlers {
  onTap: (x: number, y: number) => void;
  onAction: (a: 'crouch' | 'use' | 'phone' | 'escape' | 'mute') => void;
  onHold: (down: boolean) => void;
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
  private lookDX = 0;
  private lookDY = 0;
  private tracks = new Map<number, Track>();
  usedTouch = false;
  enabled = true;

  constructor(
    private el: HTMLElement,
    private h: InputHandlers,
  ) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    el.addEventListener('pointerleave', () => (this.pointer.over = false));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('touchstart', () => (this.usedTouch = true), { passive: true });
  }

  get dragging(): boolean {
    for (const t of this.tracks.values()) if (t.moved) return true;
    return false;
  }

  private down = (e: PointerEvent) => {
    if (!this.enabled) return;
    if (e.pointerType === 'touch') this.usedTouch = true;
    this.tracks.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      t: performance.now(),
      moved: false,
      touch: e.pointerType !== 'mouse',
    });
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  private move = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
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
      const k = t.touch ? 1.25 : 1;
      this.lookDX += dx * k;
      this.lookDY += dy * k;
    }
  };

  private up = (e: PointerEvent) => {
    const t = this.tracks.get(e.pointerId);
    this.tracks.delete(e.pointerId);
    if (!t || !this.enabled || e.type === 'pointercancel') return;
    if (!t.moved && performance.now() - t.t < 600) this.h.onTap(e.clientX, e.clientY);
  };

  private keydown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code === 'Tab') e.preventDefault();
    if (e.code === 'Escape') {
      this.h.onAction('escape');
      return;
    }
    if (!this.enabled) return;
    if (e.repeat) {
      this.keys.add(e.code);
      return;
    }
    this.keys.add(e.code);
    switch (e.code) {
      case 'KeyC':
      case 'ControlLeft':
        this.h.onAction('crouch');
        break;
      case 'KeyE':
      case 'KeyF':
        this.h.onAction('use');
        break;
      case 'KeyP':
      case 'Tab':
        this.h.onAction('phone');
        break;
      case 'KeyM':
        this.h.onAction('mute');
        break;
      case 'Space':
        if (tag !== 'BUTTON') {
          e.preventDefault();
          this.h.onHold(true);
        }
        break;
    }
  };

  private keyup = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === 'Space') this.h.onHold(false);
  };

  /** strafe (x) and forward (y), each -1..1 */
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

  /** keyboard turning, rad/s sign */
  turnVector(): number {
    let t = 0;
    if (this.keys.has('ArrowLeft')) t -= 1;
    if (this.keys.has('ArrowRight')) t += 1;
    return t;
  }

  consumeLook(): { dx: number; dy: number } {
    const r = { dx: this.lookDX, dy: this.lookDY };
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
  }
}
