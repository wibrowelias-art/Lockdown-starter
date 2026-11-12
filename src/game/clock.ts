// Simulation clock. All story timing runs on sim time so the whole game can be
// sped up (?speed=N) for automated playthroughs.

export class Cancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

interface Timer {
  at: number;
  seq: number;
  fn: () => void;
  dead?: boolean;
}

interface Cond {
  pred: () => boolean;
  deadline: number;
  fn: (ok: boolean) => void;
  dead?: boolean;
}

export class SimClock {
  time = 0;
  speed = 1;
  private timers: Timer[] = [];
  private conds: Cond[] = [];
  private seq = 0;

  after(sec: number, fn: () => void): () => void {
    const t: Timer = { at: this.time + Math.max(0, sec), seq: this.seq++, fn };
    this.timers.push(t);
    return () => {
      t.dead = true;
    };
  }

  at(time: number, fn: () => void): () => void {
    return this.after(time - this.time, fn);
  }

  when(pred: () => boolean, timeoutSec: number, fn: (ok: boolean) => void): () => void {
    const c: Cond = { pred, deadline: this.time + timeoutSec, fn };
    this.conds.push(c);
    return () => {
      c.dead = true;
    };
  }

  tick(dt: number): void {
    this.time += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => !t.dead && t.at <= this.time).sort((a, b) => a.at - b.at || a.seq - b.seq);
      this.timers = this.timers.filter((t) => !t.dead && t.at > this.time);
      for (const t of due) t.fn();
    }
    if (this.conds.length) {
      const list = this.conds;
      this.conds = [];
      const keep: Cond[] = [];
      for (const c of list) {
        if (c.dead) continue;
        if (c.pred()) c.fn(true);
        else if (this.time >= c.deadline) c.fn(false);
        else keep.push(c);
      }
      // Conditions added by callbacks during this loop landed in this.conds.
      this.conds = [...keep, ...this.conds];
    }
  }

  clear(): void {
    this.timers = [];
    this.conds = [];
  }
}

/** A cancellable script thread with its own time cursor (prevents drift at high speeds). */
export class Script {
  private cursor: number;
  private token: { cancelled: boolean; rejecters: Set<() => void> };

  constructor(
    private clock: SimClock,
    token?: { cancelled: boolean; rejecters: Set<() => void> },
  ) {
    this.cursor = clock.time;
    this.token = token ?? { cancelled: false, rejecters: new Set() };
  }

  get cancelled(): boolean {
    return this.token.cancelled;
  }

  /** New concurrent thread sharing cancellation. */
  fork(): Script {
    return new Script(this.clock, this.token);
  }

  /** Run fn in a concurrent thread; Cancelled errors are swallowed. */
  spawn(fn: (s: Script) => Promise<void>): Promise<void> {
    const t = this.fork();
    return fn(t).catch((e) => {
      if (!(e instanceof Cancelled)) console.error(e);
    });
  }

  wait(sec: number): Promise<void> {
    if (this.token.cancelled) return Promise.reject(new Cancelled());
    // Catch up if we were blocked on something else for a while.
    if (this.cursor < this.clock.time - 0.5) this.cursor = this.clock.time;
    const target = this.cursor + sec;
    return new Promise<void>((resolve, reject) => {
      const rej = () => {
        cancelTimer();
        reject(new Cancelled());
      };
      const cancelTimer = this.clock.at(target, () => {
        this.token.rejecters.delete(rej);
        this.cursor = target;
        resolve();
      });
      this.token.rejecters.add(rej);
    });
  }

  /** Wait until pred() is true, or timeout. Resolves true if pred passed. */
  until(pred: () => boolean, timeoutSec = Infinity): Promise<boolean> {
    if (this.token.cancelled) return Promise.reject(new Cancelled());
    if (pred()) {
      this.cursor = this.clock.time;
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve, reject) => {
      const rej = () => {
        cancelCond();
        reject(new Cancelled());
      };
      const cancelCond = this.clock.when(pred, timeoutSec, (ok) => {
        this.token.rejecters.delete(rej);
        this.cursor = this.clock.time;
        resolve(ok);
      });
      this.token.rejecters.add(rej);
    });
  }

  /** Throws Cancelled if this script was cancelled (use after awaiting non-clock promises). */
  check(): void {
    if (this.token.cancelled) throw new Cancelled();
  }

  cancel(): void {
    if (this.token.cancelled) return;
    this.token.cancelled = true;
    const rs = [...this.token.rejecters];
    this.token.rejecters.clear();
    rs.forEach((r) => r());
  }
}

export type Ease = (k: number) => number;
export const easeInOut: Ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
export const easeOut: Ease = (k) => 1 - (1 - k) * (1 - k);
export const linear: Ease = (k) => k;

interface Tween {
  t: number;
  dur: number;
  step: (k: number) => void;
  ease: Ease;
  done: () => void;
  key?: object;
}

/** Tweens run on sim time. A new tween with the same key replaces the old one. */
export class Tweens {
  private list: Tween[] = [];

  run(dur: number, step: (k: number) => void, ease: Ease = easeInOut, key?: object): Promise<void> {
    if (key) this.list = this.list.filter((tw) => tw.key !== key);
    return new Promise((resolve) => {
      if (dur <= 0) {
        step(1);
        resolve();
        return;
      }
      this.list.push({ t: 0, dur, step, ease, done: resolve, key });
    });
  }

  update(dt: number): void {
    if (!this.list.length) return;
    const finished: Tween[] = [];
    for (const tw of this.list) {
      tw.t = Math.min(tw.dur, tw.t + dt);
      tw.step(tw.ease(tw.t / tw.dur));
      if (tw.t >= tw.dur) finished.push(tw);
    }
    if (finished.length) {
      this.list = this.list.filter((tw) => !finished.includes(tw));
      finished.forEach((tw) => tw.done());
    }
  }

  clear(): void {
    this.list = [];
  }
}
