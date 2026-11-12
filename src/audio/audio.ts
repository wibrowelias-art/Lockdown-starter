// All sound is synthesised with Web Audio: no samples, no recordings.
// Every cue is logged (name + game scene) so automated runs can report what played.

type Speaker = 'teacher' | 'theo' | 'zoe' | 'pa' | 'door' | 'officer' | 'noah' | 'student';
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface OutOpts {
  /** 3D position (HRTF); overrides pan */
  pos?: Vec3;
  pan?: number;
  verb?: number;
  gain?: number;
  lowpass?: number;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  log: string[] = [];
  muted = false;
  private master!: GainNode;
  private duckGain!: GainNode;
  private muffle!: BiquadFilterNode;
  private whineGain: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private ring: { stop: () => void } | null = null;
  /** world positions used for door / hall sounds */
  doorPos: Vec3 = { x: 2.6, y: 1.0, z: -4.6 };
  private dry!: GainNode;
  private verbIn!: GainNode;
  private white!: AudioBuffer;
  private brown!: AudioBuffer;
  private hum: { stop: () => void } | null = null;
  private ambient: { stop: () => void } | null = null;
  private siren: { gain: GainNode; stop: () => void } | null = null;
  private breath: { level: number; rate: number; timer: number; next: number; gain: GainNode; stop: () => void } | null =
    null;
  private heart: { bpm: number; timer: number; next: number; level: number } | null = null;

  init(): void {
    if (this.ctx) return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
    } catch {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.duckGain = ctx.createGain();
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 18000;
    this.master.connect(this.duckGain).connect(this.muffle).connect(comp).connect(ctx.destination);
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.value = 0;
      l.positionY.value = 1.1;
      l.positionZ.value = 2;
    }
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(2.4, 2.2);
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.6;
    this.verbIn.connect(verb).connect(this.master);
    this.white = this.noiseBuffer('white');
    this.brown = this.noiseBuffer('brown');
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  private mark(cue: string): boolean {
    this.log.push(cue);
    return !!this.ctx;
  }

  // ---------- building blocks ----------

  private noiseBuffer(kind: 'white' | 'brown'): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  private impulse(sec: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private out(node: AudioNode, o: OutOpts = {}): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 1;
    let head: AudioNode = node;
    if (o.lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.lowpass;
      head.connect(lp);
      head = lp;
    }
    if (o.pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 1.2;
      p.rolloffFactor = 1;
      p.positionX.value = o.pos.x;
      p.positionY.value = o.pos.y;
      p.positionZ.value = o.pos.z;
      head.connect(p);
      head = p;
    } else if (o.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      head.connect(p);
      head = p;
    }
    head.connect(g);
    g.connect(this.dry);
    if (o.verb) {
      const s = ctx.createGain();
      s.gain.value = o.verb;
      g.connect(s).connect(this.verbIn);
    }
    return g;
  }

  private noise(t: number, dur: number, filter: { type: BiquadFilterType; f: number; q?: number }, peak: number, attack: number, o: OutOpts = {}, buf?: AudioBuffer): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf ?? this.white;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.value = filter.f;
    f.Q.value = filter.q ?? 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.max(0.002, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    this.out(g, o);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private tone(t: number, dur: number, type: OscillatorType, f0: number, f1: number, peak: number, attack: number, o: OutOpts = {}): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.max(0.002, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    this.out(g, o);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private get now(): number {
    return this.ctx!.currentTime + 0.01;
  }

  // ---------- ambience ----------

  roomTone(on: boolean): void {
    if (!this.mark(on ? 'roomTone' : 'roomToneOff')) return;
    this.ambient?.stop();
    this.ambient = null;
    if (!on) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    src.loop = true;
    const g = this.out(src, { lowpass: 260, gain: 0.0 });
    g.gain.setTargetAtTime(0.1, ctx.currentTime, 1);
    src.start();
    this.ambient = {
      stop: () => {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
        src.stop(ctx.currentTime + 2);
      },
    };
  }

  fluorescentHum(on: boolean): void {
    if (!this.mark(on ? 'humOn' : 'humOff')) return;
    this.hum?.stop();
    this.hum = null;
    if (!on) return;
    const ctx = this.ctx!;
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.frequency.value = 120;
    b.frequency.value = 240;
    const ga = ctx.createGain();
    ga.gain.value = 0.018;
    const gb = ctx.createGain();
    gb.gain.value = 0.006;
    a.connect(ga);
    b.connect(gb);
    const g = this.out(ga, { gain: 1 });
    gb.connect(g);
    a.start();
    b.start();
    this.hum = {
      stop: () => {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        a.stop(ctx.currentTime + 0.3);
        b.stop(ctx.currentTime + 0.3);
      },
    };
  }

  clockTick(): void {
    if (!this.ctx) return; // not logged: too frequent
    this.noise(this.now, 0.03, { type: 'bandpass', f: 3200, q: 4 }, 0.05, 0.002);
  }

  // ---------- small foley ----------

  pencil(): void {
    if (!this.mark('pencil')) return;
    const t = this.now;
    for (let i = 0; i < 4; i++) this.noise(t + i * 0.07, 0.06, { type: 'bandpass', f: 2600 + i * 200, q: 2 }, 0.06, 0.01);
  }

  rustle(): void {
    if (!this.mark('rustle')) return;
    this.noise(this.now, 0.35, { type: 'bandpass', f: 1800, q: 0.7 }, 0.05, 0.08);
  }

  doorOpenClose(): void {
    if (!this.mark('doorOpenClose')) return;
    const t = this.now;
    this.noise(t, 0.05, { type: 'bandpass', f: 2500, q: 5 }, 0.12, 0.002, { pan: 0.7 });
    this.tone(t + 1.6, 0.25, 'sine', 90, 60, 0.25, 0.005, { pan: 0.7, verb: 0.3 });
    this.noise(t + 1.6, 0.12, { type: 'lowpass', f: 900 }, 0.15, 0.003, { pan: 0.7 });
  }

  footstepLocal(): void {
    if (!this.ctx) return;
    this.tone(this.now, 0.09, 'sine', 95, 55, 0.12, 0.004);
    this.noise(this.now, 0.07, { type: 'lowpass', f: 700 }, 0.05, 0.003);
  }

  chairScrape(): void {
    if (!this.mark('chairScrape')) return;
    const t = this.now;
    this.tone(t, 0.4, 'sawtooth', 85, 150, 0.12, 0.02, { lowpass: 900, verb: 0.3 });
    this.noise(t, 0.35, { type: 'bandpass', f: 1400, q: 1.5 }, 0.12, 0.02, { verb: 0.3 });
  }

  lightSwitch(): void {
    if (!this.mark('lightSwitch')) return;
    this.noise(this.now, 0.02, { type: 'highpass', f: 1500 }, 0.3, 0.001, { pan: 0.6 });
    this.tone(this.now, 0.02, 'square', 1800, 1700, 0.05, 0.001, { pan: 0.6 });
  }

  lockClick(): void {
    if (!this.mark('lockClick')) return;
    const t = this.now;
    this.noise(t, 0.025, { type: 'bandpass', f: 3000, q: 6 }, 0.25, 0.001, { pan: 0.7 });
    this.noise(t + 0.09, 0.03, { type: 'bandpass', f: 2200, q: 6 }, 0.25, 0.001, { pan: 0.7 });
    this.tone(t + 0.09, 0.08, 'sine', 140, 90, 0.15, 0.002, { pan: 0.7 });
  }

  phoneBuzz(): void {
    if (!this.mark('phoneBuzz')) return;
    const ctx = this.ctx!;
    const t = this.now;
    for (let i = 0; i < 2; i++) {
      const s = t + i * 0.55;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 170;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.32, s + 0.02);
      g.gain.setValueAtTime(0.32, s + 0.36);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.4);
      osc.connect(g);
      this.out(g, { lowpass: 520, verb: 0.15 });
      osc.start(s);
      osc.stop(s + 0.45);
      this.noise(s, 0.4, { type: 'bandpass', f: 240, q: 2 }, 0.12, 0.02);
    }
  }

  phoneTap(): void {
    if (!this.ctx) return;
    this.noise(this.now, 0.015, { type: 'highpass', f: 2500 }, 0.04, 0.001);
  }

  // ---------- voices (murmur under subtitles) ----------

  voice(who: Speaker, dur: number, whisper = false, pos?: Vec3): void {
    if (!this.mark(`voice:${who}${whisper ? ':whisper' : ''}`)) return;
    const ctx = this.ctx!;
    const t = this.now;
    const formant: Record<Speaker, number> = { teacher: 820, theo: 640, zoe: 1150, pa: 1500, door: 1100, officer: 560, noah: 700, student: 900 };
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.loop = true;
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = whisper ? 2400 : formant[who];
    f1.Q.value = whisper ? 0.9 : 3;
    const am = ctx.createGain();
    am.gain.value = 0.0001;
    src.connect(f1).connect(am);
    // syllable-rate envelope
    let s = t;
    const end = t + Math.min(dur, 6);
    while (s < end) {
      const len = 0.09 + Math.random() * 0.16;
      const pk = (whisper ? 0.08 : 0.16) * (0.5 + Math.random() * 0.5);
      am.gain.setTargetAtTime(pk, s, 0.02);
      am.gain.setTargetAtTime(0.0001, s + len, 0.03);
      s += len + 0.04 + Math.random() * 0.08;
      if (Math.random() < 0.12) s += 0.2;
      if (who !== 'pa' && !whisper) f1.frequency.setTargetAtTime(formant[who] * (0.85 + Math.random() * 0.3), s, 0.05);
    }
    let head: AudioNode = am;
    if (who === 'pa') {
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * 2 - 1;
        curve[i] = Math.tanh(x * 4);
      }
      shaper.curve = curve;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 500;
      head.connect(shaper).connect(hp);
      head = hp;
    }
    const opts: OutOpts =
      who === 'pa'
        ? { verb: 0.9, gain: 0.5 }
        : who === 'door'
          ? { lowpass: 900, pos: this.doorPos, verb: 0.4, gain: 1.3 }
          : who === 'officer'
            ? { lowpass: 900, pan: 0.7, verb: 0.3 }
            : { verb: 0.15, gain: 0.7, pos };
    this.out(head, opts);
    src.start(t);
    src.stop(end + 0.3);
  }

  // ---------- the threat: only ever heard, never seen ----------

  bang(level = 1): void {
    if (!this.mark('bang')) return;
    const t = this.now;
    this.tone(t, 0.6, 'sine', 95, 38, 0.6 * level, 0.004, { verb: 0.8, lowpass: 300, pan: 0.5 });
    this.noise(t, 0.7, { type: 'lowpass', f: 320 }, 0.45 * level, 0.003, { verb: 0.9, pan: 0.5 }, this.brown);
    this.noise(t + 0.01, 0.25, { type: 'bandpass', f: 500, q: 2 }, 0.06 * level, 0.01, { pan: 0.5 });
  }

  bangFar(): void {
    if (!this.mark('bangFar')) return;
    const t = this.now;
    this.tone(t, 0.7, 'sine', 80, 35, 0.3, 0.006, { verb: 1, lowpass: 200, pan: 0.6 });
    this.noise(t, 0.8, { type: 'lowpass', f: 220 }, 0.25, 0.005, { verb: 1, pan: 0.6 }, this.brown);
  }

  paChime(): void {
    if (!this.mark('paChime')) return;
    const t = this.now;
    this.tone(t, 0.9, 'sine', 659, 659, 0.12, 0.02, { verb: 0.8 });
    this.tone(t + 0.55, 1.2, 'sine', 523, 523, 0.12, 0.02, { verb: 0.8 });
  }

  footsteps(o: { count: number; interval: number; panFrom: number; panTo: number; gainFrom: number; gainTo: number; cue?: string; heavy?: boolean }): void {
    if (!this.mark(o.cue ?? 'footsteps')) return;
    const t = this.now;
    for (let i = 0; i < o.count; i++) {
      const k = o.count === 1 ? 0 : i / (o.count - 1);
      const g = o.gainFrom + (o.gainTo - o.gainFrom) * k;
      const pan = o.panFrom + (o.panTo - o.panFrom) * k;
      const s = t + i * o.interval * (0.92 + Math.random() * 0.16);
      const pos = { x: this.doorPos.x + (pan - 0.5) * 12, y: 0.2, z: this.doorPos.z - 1.2 };
      this.tone(s, 0.12, 'sine', o.heavy ? 80 : 110, 50, 0.6 * g, 0.004, { lowpass: 600, pos, verb: 0.5 });
      this.noise(s, 0.08, { type: 'lowpass', f: 900 }, 0.22 * g, 0.003, { pos, verb: 0.5 });
    }
  }

  footstepsMany(): void {
    if (!this.mark('footstepsMany')) return;
    const t0 = this.now;
    for (let p = 0; p < 4; p++) {
      for (let i = 0; i < 9; i++) {
        const s = t0 + p * 0.11 + i * (0.28 + Math.random() * 0.04);
        const g = 0.25 + (i / 9) * 0.6;
        this.tone(s, 0.12, 'sine', 85, 45, 0.3 * g, 0.004, { lowpass: 700, pan: 0.6, verb: 0.5 });
        this.noise(s, 0.07, { type: 'lowpass', f: 1000 }, 0.12 * g, 0.003, { pan: 0.6, verb: 0.4 });
      }
    }
  }

  handleRattle(hard = false): void {
    if (!this.mark(hard ? 'handleRattleHard' : 'handleRattle')) return;
    const t = this.now;
    const n = hard ? 16 : 8;
    let s = t;
    const pos = this.doorPos;
    this.tone(t, 0.12, 'sine', 160, 90, 0.4, 0.003, { pos, verb: 0.3 });
    for (let i = 0; i < n; i++) {
      s += 0.05 + Math.random() * (hard ? 0.06 : 0.1);
      this.noise(s, 0.035, { type: 'bandpass', f: 3200 + Math.random() * 1500, q: 9 }, hard ? 0.5 : 0.35, 0.001, { pos, verb: 0.3 });
      this.tone(s, 0.03, 'square', 900 + Math.random() * 500, 800, 0.04, 0.001, { pos });
    }
    this.tone(s + 0.08, 0.15, 'sine', 150, 80, 0.4, 0.003, { pos, verb: 0.3 });
  }

  knock(times = 3, loud = 1): void {
    if (!this.mark('knock')) return;
    const t = this.now;
    for (let i = 0; i < times; i++) {
      const s = t + i * 0.3;
      this.tone(s, 0.16, 'sine', 125, 70, 0.8 * loud, 0.003, { pos: this.doorPos, verb: 0.4 });
      this.noise(s, 0.07, { type: 'lowpass', f: 1100 }, 0.45 * loud, 0.002, { pos: this.doorPos, verb: 0.4 });
    }
  }

  // ---------- sirens ----------

  sirens(level: number, rampSec: number): void {
    if (!this.mark(level > 0 ? `sirens:${level.toFixed(1)}` : 'sirensOff')) return;
    const ctx = this.ctx!;
    if (!this.siren && level > 0) {
      const g = ctx.createGain();
      g.gain.value = 0;
      const mk = (base: number, depth: number, rate: number, type: OscillatorType, pan: number) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = base;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = rate;
        const lg = ctx.createGain();
        lg.gain.value = depth;
        lfo.connect(lg).connect(o.frequency);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1600;
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        const og = ctx.createGain();
        og.gain.value = 0.12;
        o.connect(lp).connect(og).connect(p).connect(g);
        o.start();
        lfo.start();
        return () => {
          o.stop(ctx.currentTime + 3);
          lfo.stop(ctx.currentTime + 3);
        };
      };
      const stops = [mk(950, 380, 0.17, 'sawtooth', -0.6), mk(760, 160, 2.6, 'triangle', -0.3)];
      g.connect(this.dry);
      const send = ctx.createGain();
      send.gain.value = 0.5;
      g.connect(send).connect(this.verbIn);
      this.siren = {
        gain: g,
        stop: () => {
          g.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
          stops.forEach((s) => s());
        },
      };
    }
    if (this.siren) {
      this.siren.gain.gain.cancelScheduledValues(ctx.currentTime);
      this.siren.gain.gain.setTargetAtTime(Math.max(0, level), ctx.currentTime, Math.max(0.05, rampSec / 3));
      if (level <= 0) {
        const s = this.siren;
        this.siren = null;
        setTimeout(() => s.stop(), rampSec * 1000 + 200);
      }
    }
  }

  // ---------- body: breathing & heartbeat ----------

  breathing(level: number, rate = 0.25): void {
    if (!this.mark(level > 0 ? 'breathing' : 'breathingOff')) return;
    const ctx = this.ctx!;
    if (level <= 0) {
      this.breath?.stop();
      this.breath = null;
      return;
    }
    if (this.breath) {
      this.breath.level = level;
      this.breath.rate = rate;
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1000;
    bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(bp).connect(g);
    this.out(g, { gain: 1 });
    src.start();
    const b = {
      level,
      rate,
      next: ctx.currentTime + 0.1,
      gain: g,
      timer: 0,
      stop: () => {
        clearInterval(b.timer);
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        src.stop(ctx.currentTime + 1.5);
      },
    };
    b.timer = window.setInterval(() => {
      while (b.next < ctx.currentTime + 1.2) {
        const cycle = 1 / b.rate;
        const inhale = cycle * 0.4;
        const pk = 0.09 * b.level;
        g.gain.setTargetAtTime(pk, b.next, inhale / 3);
        g.gain.setTargetAtTime(pk * 0.15, b.next + inhale, 0.08);
        g.gain.setTargetAtTime(pk * 0.7, b.next + inhale + 0.12, 0.1);
        g.gain.setTargetAtTime(0.0001, b.next + inhale + 0.35, cycle * 0.15);
        bp.frequency.setTargetAtTime(1300, b.next, 0.2);
        bp.frequency.setTargetAtTime(800, b.next + inhale, 0.2);
        b.next += cycle;
      }
    }, 200);
    this.breath = b;
  }

  heartbeat(on: boolean, bpm = 92, level = 1): void {
    if (!this.mark(on ? 'heartbeat' : 'heartbeatOff')) return;
    const ctx = this.ctx!;
    if (!on) {
      if (this.heart) clearInterval(this.heart.timer);
      this.heart = null;
      return;
    }
    if (this.heart) {
      this.heart.bpm = bpm;
      this.heart.level = level;
      return;
    }
    const h = { bpm, level, next: ctx.currentTime + 0.1, timer: 0 };
    h.timer = window.setInterval(() => {
      while (h.next < ctx.currentTime + 1) {
        this.tone(h.next, 0.12, 'sine', 58, 40, 0.5 * h.level, 0.01, { lowpass: 160 });
        this.tone(h.next + 0.24, 0.12, 'sine', 52, 38, 0.35 * h.level, 0.01, { lowpass: 160 });
        h.next += 60 / h.bpm;
      }
    }, 200);
    this.heart = h;
  }

  // ---------- endings ----------

  cue(name: string): void {
    switch (name) {
      case 'sirenClose':
        this.sirens(0.9, 2);
        return;
      case 'footstepsNear':
        this.footsteps({ count: 8, interval: 0.55, panFrom: 0.2, panTo: 0.85, gainFrom: 0.3, gainTo: 1, cue: 'footstepsNear' });
        return;
      case 'footstepsAway':
        this.footsteps({ count: 8, interval: 0.6, panFrom: 0.85, panTo: 0.2, gainFrom: 1, gainTo: 0.15, cue: 'footstepsAway' });
        return;
      case 'runAway':
        this.footsteps({ count: 10, interval: 0.22, panFrom: 0.85, panTo: 0.1, gainFrom: 1, gainTo: 0.1, cue: 'runAway' });
        return;
      case 'runningOut':
        this.footsteps({ count: 12, interval: 0.2, panFrom: 0.2, panTo: 0.9, gainFrom: 0.9, gainTo: 0.1, cue: 'runningOut' });
        return;
      case 'footstepsMany':
        this.footstepsMany();
        return;
      case 'keys':
        this.keys();
        return;
      case 'lockClick':
        this.lockClick();
        return;
      case 'doorCreak':
        this.doorCreak();
        return;
      case 'doorSlam':
        this.doorSlam();
        return;
      case 'thudOnDoor':
        this.thud();
        return;
      case 'bangFar':
        this.bangFar();
        return;
      case 'heartbeat':
        this.heartbeat(true, 104, 1);
        return;
      case 'handleRattleHard':
        this.handleRattle(true);
        return;
      case 'radio':
        this.radio();
        return;
      default:
        this.mark(`unknown:${name}`);
    }
  }

  keys(): void {
    if (!this.mark('keys')) return;
    const t = this.now;
    for (let i = 0; i < 9; i++) {
      const s = t + Math.random() * 0.5;
      this.tone(s, 0.12, 'sine', 3000 + Math.random() * 3000, 2800, 0.03, 0.001, { pan: 0.75 });
    }
    this.noise(t + 0.55, 0.05, { type: 'bandpass', f: 2500, q: 5 }, 0.2, 0.002, { pan: 0.75 });
  }

  doorCreak(): void {
    if (!this.mark('doorCreak')) return;
    const ctx = this.ctx!;
    const t = this.now;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t);
    for (let i = 1; i < 8; i++) o.frequency.linearRampToValueAtTime(180 + Math.random() * 140, t + i * 0.1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    o.connect(bp).connect(g);
    this.out(g, { pan: 0.75, verb: 0.3 });
    o.start(t);
    o.stop(t + 0.9);
  }

  doorSlam(): void {
    if (!this.mark('doorSlam')) return;
    const t = this.now;
    this.tone(t, 0.4, 'sine', 90, 40, 0.7, 0.003, { verb: 0.7, pan: 0.7 });
    this.noise(t, 0.25, { type: 'lowpass', f: 1400 }, 0.5, 0.002, { verb: 0.7, pan: 0.7 });
  }

  thud(): void {
    if (!this.mark('thudOnDoor')) return;
    const t = this.now;
    this.tone(t, 0.35, 'sine', 70, 35, 0.8, 0.004, { verb: 0.5, pan: 0.75, lowpass: 250 });
    this.noise(t, 0.2, { type: 'lowpass', f: 450 }, 0.5, 0.003, { pan: 0.75 }, this.brown);
  }

  radio(): void {
    if (!this.mark('radio')) return;
    const t = this.now;
    this.noise(t, 0.9, { type: 'bandpass', f: 1800, q: 1.2 }, 0.08, 0.01, { pan: 0.6 });
    this.tone(t + 0.95, 0.12, 'sine', 1050, 1050, 0.05, 0.005, { pan: 0.6 });
  }

  // ---------- v2: space, silence, panic ----------

  setListener(p: Vec3, yaw: number): void {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(p.x, t, 0.02);
      l.positionY.setTargetAtTime(p.y, t, 0.02);
      l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(fx, t, 0.02);
      l.forwardY.setTargetAtTime(0, t, 0.02);
      l.forwardZ.setTargetAtTime(fz, t, 0.02);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else l.setPosition(p.x, p.y, p.z);
  }

  /** Muffle everything as noise (fear) rises: 0..100. */
  setMuffle(noise: number): void {
    if (!this.ctx) return;
    const f = 18000 * Math.pow(0.12, Math.min(1, noise / 100));
    this.muffle.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.4);
  }

  /** Cut all sound for a moment (before the handle moves). */
  silence(sec: number): void {
    if (!this.mark('silence')) return;
    const g = this.duckGain.gain;
    const t = this.ctx!.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0, t, 0.05);
    g.setTargetAtTime(1, t + sec, 0.03);
  }

  /** A thin high whine (panic), 0..1. */
  whine(level: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this.whineGain) {
      const o = ctx.createOscillator();
      o.frequency.value = 7600;
      const o2 = ctx.createOscillator();
      o2.frequency.value = 7640;
      this.whineGain = ctx.createGain();
      this.whineGain.gain.value = 0;
      o.connect(this.whineGain);
      o2.connect(this.whineGain);
      this.whineGain.connect(this.dry);
      o.start();
      o2.start();
    }
    this.whineGain.gain.setTargetAtTime(Math.max(0, level) * 0.012, ctx.currentTime, 0.8);
  }

  /** Soft low drone at key beats, 0..1. */
  drone(level: number): void {
    if (!this.mark(level > 0 ? 'drone' : 'droneOff')) return;
    const ctx = this.ctx!;
    if (!this.droneGain) {
      this.droneGain = ctx.createGain();
      this.droneGain.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 220;
      for (const f of [55, 82.4, 55.4]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.connect(lp);
        o.start();
      }
      lp.connect(this.droneGain).connect(this.dry);
    }
    this.droneGain.gain.setTargetAtTime(level * 0.06, ctx.currentTime, 1.5);
  }

  /** A phone ringing in a backpack, positional, until stopped. */
  ringtone(pos: Vec3 | null): void {
    this.ring?.stop();
    this.ring = null;
    if (!pos) return;
    if (!this.mark('ringtone')) return;
    const ctx = this.ctx!;
    const notes = [784, 988, 1175, 988, 784, 659];
    let stopped = false;
    let timer = 0;
    const play = () => {
      if (stopped) return;
      const t = ctx.currentTime + 0.02;
      notes.forEach((f, i) => this.tone(t + i * 0.16, 0.15, 'triangle', f, f, 0.3, 0.005, { pos }));
      timer = window.setTimeout(play, 1400);
    };
    play();
    this.ring = {
      stop: () => {
        stopped = true;
        clearTimeout(timer);
      },
    };
  }

  /** Fake-out: a clank in the pipes. */
  pipeKnock(): void {
    if (!this.mark('pipeKnock')) return;
    const t = this.now;
    const pos = { x: -4.4, y: 2.6, z: -1 };
    for (let i = 0; i < 3; i++) {
      this.noise(t + i * 0.18, 0.12, { type: 'bandpass', f: 900, q: 6 }, 0.35, 0.002, { pos, verb: 0.6 });
      this.tone(t + i * 0.18, 0.25, 'sine', 320, 300, 0.2, 0.002, { pos, verb: 0.6 });
    }
  }

  /** Fake-out: a door slams somewhere far down the hall. */
  farSlam(): void {
    if (!this.mark('farSlam')) return;
    const t = this.now;
    const pos = { x: -9, y: 1, z: -6 };
    this.tone(t, 0.4, 'sine', 80, 40, 0.5, 0.004, { pos, lowpass: 300, verb: 1 });
    this.noise(t, 0.3, { type: 'lowpass', f: 600 }, 0.3, 0.003, { pos, verb: 1 });
  }

  /** Desk sliding: quiet when slow, a scrape when fast. */
  deskSlide(fast: boolean): void {
    if (!this.mark(fast ? 'deskScrape' : 'deskSlide')) return;
    const t = this.now;
    if (fast) {
      this.tone(t, 0.6, 'sawtooth', 70, 160, 0.25, 0.02, { lowpass: 1000, verb: 0.4 });
      this.noise(t, 0.6, { type: 'bandpass', f: 1500, q: 1.2 }, 0.25, 0.02, { verb: 0.4 });
    } else this.noise(t, 0.5, { type: 'lowpass', f: 400 }, 0.04, 0.1);
  }

  stopAll(): void {
    this.ringtone(null);
    this.whine(0);
    if (this.droneGain && this.ctx) this.droneGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    this.mark('stopAll');
    this.hum?.stop();
    this.hum = null;
    this.ambient?.stop();
    this.ambient = null;
    if (this.siren) {
      this.siren.stop();
      this.siren = null;
    }
    this.breath?.stop();
    this.breath = null;
    if (this.heart) clearInterval(this.heart.timer);
    this.heart = null;
  }
}
