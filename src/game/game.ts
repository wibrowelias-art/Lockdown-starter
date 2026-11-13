import * as THREE from 'three';
import { AudioEngine } from '../audio/audio';
import {
  ALL_TASKS,
  type EndingId,
  ENDING_IDS,
  NOISE_HIGH,
  NOISE_LABEL,
  type SceneId,
  Store,
  type StoryEvent,
  type StoryState,
  type TaskId,
  cluesFound,
  tasksDone,
} from '../story/state';
import { epilogue, type StageAction } from '../story/endings';
import { type ChecklistItem, type Settings, UI, type Who } from '../ui/ui';
import { Cancelled, Script, SimClock, Tweens, linear } from './clock';
import { codeScene, doorScene, endingScene, examScene, lockdownScene, textsScene, waitingScene } from './director';
import { Input } from './input';
import { type Person, type Pose, buildHand, knitMaterial, skinMaterial } from './people';
import { Player } from './player';
import { type Preset, Renderer, presetSpec } from './render';
import type { Library } from './materials';
import { GUIDE_LAYER, Guidance } from './guidance';
import { AISLE_X, DOOR, HUDDLE, NOAH_WALL_SPOT, PA_POS, PLAYER_DESK, ROOM, SEAT, SWITCH_POS, World, inDoorWallZone } from './world';

interface Interactable {
  id: string;
  objects: () => THREE.Object3D[];
  range: number;
  enabled: () => boolean;
  label: (hit: THREE.Intersection) => string | null;
  use: (hit: THREE.Intersection) => boolean;
}

interface Mover {
  p: Person;
  path: [number, number][];
  speed: number;
  done: () => void;
  /** already stepped around the player once on this walk */
  detoured?: boolean;
}

const FOUND_KEY = 'room214.endings';
const SETTINGS_KEY = 'room214.settings';
const PLAY_SCENES: SceneId[] = ['exam', 'code', 'lockdown', 'texts', 'waiting', 'door', 'ending'];

const TASK_LABEL: Record<TaskId, string> = {
  bubbles: 'Fill in 4 answers',
  holdStillAisle: 'Hold still while Ms. Okafor walks by',
  zoeBackpack: "Look under the desks: Zoe's backpack",
  lookPA: 'Look at the PA speaker',
  dropDown: 'Drop down (C) on "Everybody down!"',
  wallByDoor: 'Get to the wall beside the door',
  theoDown: 'Pull Theo down with you',
  blinds: 'Close the blinds',
  coverWindow: 'Cover the door window (spare sheet)',
  barricade: 'Slide the spare desk to the door',
  ringingPhone: 'Find the ringing phone',
  silencePhone: 'Silence your phone (Tab)',
  lockAndLights: 'Ms. Okafor: lock + lights',
  zoeReplies: 'Answer Zoe (3 texts)',
  testQuestion: 'Ask Zoe which closet',
  textMom: 'Text Mom (optional)',
  coverGlow: 'Cover the screen glow (Space)',
  holdStill: 'Hold still (Space) when the handle moves',
  breatheTheo: 'Breathe with Theo',
  schoolAlert: "Read the alert on Ms. Okafor's phone",
  whisper: 'Answer Sam',
  stayDown: 'Stay down when the sirens come',
  readTiming: 'Read the 10:52 text',
  decide: 'Decide',
};
const LOCKDOWN_GROUPS: Partial<Record<TaskId, string>> = {
  lockAndLights: '1 LOCK',
  barricade: '1 LOCK',
  coverWindow: '1 LOCK',
  blinds: '2 LIGHTS',
  silencePhone: '2 LIGHTS',
  ringingPhone: '2 LIGHTS',
  wallByDoor: '3 OUT OF SIGHT',
  theoDown: '3 OUT OF SIGHT',
};
const PHASE_TITLE: Partial<Record<SceneId, string>> = {
  exam: '1 · THE FINAL',
  code: '2 · THE CODE',
  lockdown: 'LOCKDOWN',
  texts: '4 · ZOE',
  waiting: '5 · THE WAIT',
  door: '6 · THE KNOCK',
};
const PHASE_TASKS: Partial<Record<SceneId, TaskId[]>> = {
  exam: ['bubbles', 'holdStillAisle', 'zoeBackpack'],
  code: ['lookPA', 'dropDown'],
  lockdown: ['lockAndLights', 'barricade', 'coverWindow', 'blinds', 'silencePhone', 'ringingPhone', 'wallByDoor', 'theoDown'],
  texts: ['zoeReplies', 'testQuestion', 'textMom', 'coverGlow'],
  waiting: ['holdStill', 'breatheTheo', 'schoolAlert', 'whisper', 'stayDown'],
  door: ['readTiming', 'decide'],
};

/** Screen centre (crosshair), shared to avoid per-frame allocations. */
const CENTER = new THREE.Vector2(0, 0);

export class Game {
  store = new Store();
  clock = new SimClock();
  tweens = new Tweens();
  audio = new AudioEngine();
  world: World;
  player = new Player();
  camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.03, 60);
  renderer: Renderer;
  input: Input;
  ui: UI;
  settings: Settings;
  flags = {
    control: false,
    endShown: false,
    paused: false,
    softUnlock: false,
    theoFrozen: false,
    theoFollowing: false,
    holdingSheet: false,
    ringing: null as string | null,
    alertOn: false,
    danger: false,
    glowCaught: false,
    paWindow: false,
    dropWindow: false,
    gazeBackpack: 0,
    lockdownTimer: 0,
    lockdownStart: 0,
    stayDownWindow: false,
  };
  breath = { active: false, holding: false, guide: 0, you: 0, sync: 0, cycles: 0, t: 0 };
  hold: { active: boolean; t: number; dur: number; bad: number; ok: boolean; real?: number } = { active: false, t: 0, dur: 0, bad: 0, ok: true };
  barricadeK = 0;
  private barricadeFastSession = false;
  private script: Script | null = null;
  private movers: Mover[] = [];
  private interactables: Interactable[] = [];
  private raycaster = new THREE.Raycaster();
  private last = performance.now();
  private flashlight = new THREE.SpotLight(0xe6eeff, 0, 14, 0.4, 0.6, 1.2);
  private raisedHands = new THREE.Group();
  guidance: Guidance;
  /** a floor ring at Noah's spot on the door wall: the guidance target for "get to the wall" */
  wallMarker = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.02, 32), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  phoneHasBuzzed = false;
  frames = 0;
  fps = 0;
  fpsMs = 0;
  private fpsAcc = { t: 0, n: 0 };
  private touchApplied = false;
  private panic = 0;
  private lastListUpdate = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    host: HTMLElement,
    speed = 1,
    opts: { noLock?: boolean; preset?: Preset; lib: Library },
  ) {
    this.clock.speed = speed;
    this.settings = this.loadSettings();
    if (opts.preset) this.settings.quality = opts.preset;
    const spec = presetSpec(this.resolvePreset(this.settings.quality));
    this.world = new World(opts.lib, { shadows: spec.shadows, shadowSize: spec.shadowSize, rectLights: true, dust: 400, sirenShadows: true });
    this.renderer = new Renderer(canvas, this.world.scene, this.camera);
    this.world.scene.add(this.camera);
    this.flashlight.position.set(DOOR.x, 1.5, DOOR.z - 0.6);
    this.flashlight.target.position.set(DOOR.x - 0.5, 0.8, 0);
    this.world.scene.add(this.flashlight, this.flashlight.target);
    this.buildRaisedHands();
    this.wallMarker.position.set(NOAH_WALL_SPOT.x, 0.012, NOAH_WALL_SPOT.z);
    this.wallMarker.raycast = () => {};
    this.world.scene.add(this.wallMarker);
    this.camera.layers.enable(GUIDE_LAYER);
    this.guidance = new Guidance(this);

    this.input = new Input(
      canvas,
      {
        onTap: (x, y) => this.tap(x, y),
        onAction: (a) => this.action(a),
        onHold: (down) => this.setHold(down),
        onLockChange: (locked) => this.lockChanged(locked),
        wantsLock: () => PLAY_SCENES.includes(this.store.state.scene) && !this.flags.endShown,
      },
      !!opts.noLock,
    );
    this.ui = new UI(host, this.clock, this.input, this.settings);
    this.ui.onSkip = () => this.skip();
    this.guidance.setMode(this.settings.guidance);
    this.ui.onExit = () => this.dispatch({ type: 'EXIT' });
    this.ui.onSettings = (s) => this.applySettings(s);
    this.ui.onResume = () => this.resume();
    this.ui.onHold = (d) => this.setHold(d);
    this.ui.onUseHold = (d) => {
      this.input.holdingUse = d;
      if (d) this.action('use');
    };
    this.ui.phoneBtn.addEventListener('click', () => this.action('phone'));
    this.ui.crouchBtn.addEventListener('click', () => this.action('crouch'));
    this.ui.onNeedsPointer = () => this.softUnlock();
    this.ui.onPicked = () => this.relock();
    this.ui.phone.onPicked = () => this.relock();
    this.ui.phone.onSilence = () => this.phoneSilenced();
    this.ui.phone.onClose = () => this.closePhone();
    this.applySettings(this.settings);

    this.player.onFootstep = (hurry) => {
      this.audio.footstepLocal();
      this.dispatch({ type: 'NOISE', source: hurry ? 'hurryStep' : 'footstep' });
    };
    this.player.onChairBump = (c) => {
      this.world.bumpChair(c, c.group.position.x - this.player.x, c.group.position.z - this.player.z);
      this.audio.chairScrape();
      this.ui.caption('[a chair scrapes across the floor]', 2.5);
      this.dispatch({ type: 'NOISE', source: 'chairKnock' });
    };

    this.setupInteractables();
    this.store.subscribe((s, prev, e) => this.onState(s, prev, e));
    window.addEventListener('resize', () => this.renderer.resize());
    this.renderer.resize();
    this.player.sitAt(SEAT.x, SEAT.z);
    this.ui.reset();
    this.showTitle();
    this.precompile();
    if (!opts.preset && this.settings.quality === 'auto') this.startBenchmark();
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.ui.toggleFps();
      }
    });
    requestAnimationFrame(this.frame);
  }

  /** Compile every visible material up front (lights only change intensity, so one pass covers lights on and off). */
  precompile(): void {
    const t0 = performance.now();
    this.renderer.three.compile(this.world.scene, this.camera);
    this.compileMs = performance.now() - t0;
  }
  compileMs = 0;

  /** Auto quality: 1 s of frames at High on the title screen picks the preset. */
  autoResult: { fps: number; preset: Preset } | null = null;
  private bench: { skip: number; t: number; n: number } | null = null;
  startBenchmark(): void {
    this.autoPreset = 'high';
    this.applySettings(this.settings);
    this.bench = { skip: 10, t: 0, n: 0 };
  }
  private stepBenchmark(realMs: number): void {
    const b = this.bench!;
    if (b.skip > 0) {
      b.skip--;
      return;
    }
    b.t += realMs;
    b.n++;
    if (b.t < 1000) return;
    const fps = (b.n * 1000) / b.t;
    const preset: Preset = fps >= 90 ? 'ultra' : fps >= 50 ? 'high' : fps >= 28 ? 'medium' : 'low';
    this.bench = null;
    this.autoResult = { fps, preset };
    this.autoPreset = preset;
    if (this.settings.quality === 'auto') this.applySettings(this.settings);
  }

  get touch(): boolean {
    return this.input.usedTouch || !!window.matchMedia?.('(pointer: coarse)').matches;
  }

  // ------------------------------------------------------------ settings, pause

  private loadSettings(): Settings {
    const coarse = !!window.matchMedia?.('(pointer: coarse)').matches;
    const d: Settings = { sensitivity: 1, invertY: false, sound: true, quality: coarse ? 'low' : 'auto', videoLens: false, guidance: 'full' };
    try {
      return { ...d, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    } catch {
      return d;
    }
  }

  applySettings(s: Settings): void {
    this.settings = s;
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;
    this.audio.setMuted(!s.sound);
    this.renderer.videoLens = s.videoLens;
    this.renderer.setPreset(this.resolvePreset(s.quality));
    this.world.applyQuality(this.renderer.spec);
    this.guidance?.setMode(s.guidance);
    this.ui.guidanceOff = s.guidance === 'off';
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }

  /** Release the mouse for on-screen buttons without pausing. */
  softUnlock(): void {
    if (!this.input.locked) return;
    this.flags.softUnlock = true;
    this.input.exitLock();
  }

  /** Capture the mouse again (works inside a click/key gesture). */
  relock(): void {
    if (this.input.lockMode && PLAY_SCENES.includes(this.store.state.scene) && !this.flags.endShown && !this.ui.phone.isOpen) this.input.requestLock();
  }

  /** 'auto' picks a preset from a short benchmark (see main.ts); phones get Low. */
  autoPreset: Preset = 'high';
  resolvePreset(q: Settings['quality']): Preset {
    return q === 'auto' ? this.autoPreset : q;
  }

  private lockChanged(locked: boolean): void {
    if (locked) {
      this.flags.softUnlock = false;
      this.setPaused(false);
      return;
    }
    if (this.flags.softUnlock) return;
    if (PLAY_SCENES.includes(this.store.state.scene) && !this.flags.endShown) this.setPaused(true);
  }

  setPaused(p: boolean): void {
    this.flags.paused = p;
    this.ui.pause(p && !this.ui.optionsOpen);
    if (this.audio.ctx) {
      if (p) void this.audio.ctx.suspend();
      else void this.audio.ctx.resume();
    }
  }

  private resume(): void {
    this.ui.toggleOptions(false);
    if (this.input.lockMode) this.input.requestLock();
    else this.setPaused(false);
  }

  // ------------------------------------------------------------ story glue

  dispatch(e: StoryEvent): StoryState {
    return this.store.dispatch(e);
  }

  task(t: TaskId): void {
    this.dispatch({ type: 'TASK', task: t });
  }

  private onState(s: StoryState, prev: StoryState, e: StoryEvent): void {
    if (s.noise !== prev.noise) {
      const last = s.noiseLog[s.noiseLog.length - 1];
      this.ui.noise(s.noise, last ? `+ ${NOISE_LABEL[last.source]}` : undefined);
      this.audio.setMuffle(s.noise * 0.8);
    }
    if (s.battery !== prev.battery) this.ui.phone.setBattery(s.battery);
    if (s.scene !== prev.scene) this.runScene(s.scene, e);
    else this.updateChecklist();
  }

  updateChecklist(): void {
    const st = this.store.state;
    const tasks = PHASE_TASKS[st.scene];
    if (!tasks || this.flags.endShown) {
      this.ui.checklist(null);
      return;
    }
    const items: ChecklistItem[] = tasks.map((t) => ({
      label: t === 'bubbles' ? `${TASK_LABEL[t]} (${Math.min(4, st.bubbles.length)}/4)` : t === 'holdStill' ? `${TASK_LABEL[t]} (${st.holdStill}/3)` : TASK_LABEL[t],
      done: st.tasks[t],
      missed: st.missed.includes(t),
      optional: t === 'textMom' || t === 'testQuestion',
      group: st.scene === 'lockdown' ? LOCKDOWN_GROUPS[t] : undefined,
      current: this.guidance?.state.task === t && this.guidance.mode !== 'off',
      testid: `task-${t}`,
    }));
    const timer = st.scene === 'lockdown' && this.flags.control ? 1 - (this.clock.time - this.flags.lockdownStart) / 75 : undefined;
    this.ui.checklist(PHASE_TITLE[st.scene] ?? '', items, timer);
  }

  private runScene(scene: SceneId, e: StoryEvent): void {
    this.script?.cancel();
    this.script = null;
    this.ui.clearChoices();
    this.ui.clearDoorChoice();
    this.ui.prompt(null);
    this.ui.hint(null);
    this.ui.holdMeter(null);
    this.stopBreathing();
    this.hold.active = false;
    this.ui.phone.clearReplies();
    this.ui.phone.typing(false);
    this.closePhone();
    this.audio.ringtone(null);
    this.flags.ringing = null;
    this.flags.danger = false;
    if (e.type === 'SKIP' || e.type === 'EXIT' || e.type === 'RESTART') this.ui.clearText();
    if (scene === 'title') return this.showTitle();
    if (scene === 'exited') return this.showExitScreen();
    const scripts: Partial<Record<SceneId, (g: Game, s: Script) => Promise<void>>> = {
      exam: examScene,
      code: codeScene,
      lockdown: lockdownScene,
      texts: textsScene,
      waiting: waitingScene,
      door: doorScene,
      ending: endingScene,
    };
    const fn = scripts[scene];
    this.updateChecklist();
    if (!fn) return;
    const s = new Script(this.clock);
    this.script = s;
    fn(this, s).catch((err) => {
      if (!(err instanceof Cancelled)) console.error(err);
    });
  }

  skip(): void {
    const scene = this.store.state.scene;
    if (scene === 'ending') {
      if (!this.flags.endShown) {
        this.script?.cancel();
        this.showEndingScreen();
      } else this.ui.revealEnding();
      return;
    }
    if (scene === 'title' || scene === 'exited') return;
    this.dispatch({ type: 'SKIP' });
  }

  private foundEndings(): EndingId[] {
    try {
      const v = JSON.parse(localStorage.getItem(FOUND_KEY) || '[]');
      return Array.isArray(v) ? v.filter((x) => (ENDING_IDS as string[]).includes(x)) : [];
    } catch {
      return [];
    }
  }

  private showTitle(): void {
    this.hardReset();
    this.ui.setHud(false);
    this.ui.setTopbar(false);
    this.ui.fade(0.25, 0);
    this.ui.showTitle(
      this.foundEndings(),
      () => {
        this.audio.init();
        this.audio.resume();
        this.audio.setMuted(!this.settings.sound);
        this.ui.hideScreen();
        this.ui.fade(1, 0);
        this.input.requestLock();
        this.dispatch({ type: 'BEGIN' });
      },
      () => this.dispatch({ type: 'EXIT' }),
      this.touch,
    );
  }

  private showExitScreen(): void {
    this.hardReset();
    this.input.exitLock();
    this.audio.stopAll();
    this.ui.setHud(false);
    this.ui.setTopbar(false);
    this.ui.fade(0.6, 0.5);
    const from = this.store.state.exitedFrom;
    this.ui.showExit(from, () => this.dispatch({ type: 'RESTART' }));
  }

  showEndingScreen(): void {
    if (this.flags.endShown) return;
    this.flags.endShown = true;
    this.input.exitLock();
    const st = this.store.state;
    const id = st.ending ?? 'all_clear';
    const found = Array.from(new Set([...this.foundEndings(), id]));
    try {
      localStorage.setItem(FOUND_KEY, JSON.stringify(found));
    } catch {
      /* ignore */
    }
    this.audio.stopAll();
    this.ui.setHud(false);
    this.ui.setTopbar(true);
    this.ui.checklist(null);
    this.ui.fade(1, 1);
    const stats = `Tasks done: ${tasksDone(st)} of ${ALL_TASKS.length} · Clues: ${cluesFound(st)} of 3 · Battery left: ${st.battery}% · Noise: ${Math.round(st.noise)}`;
    this.ui.showEnding(id, epilogue(st), found, stats, () => this.dispatch({ type: 'RESTART' }), () => this.dispatch({ type: 'EXIT' }));
  }

  private hardReset(): void {
    this.script?.cancel();
    this.script = null;
    this.clearMovers();
    this.tweens.clear();
    this.ui.reset();
    this.flags = {
      ...this.flags,
      control: false,
      endShown: false,
      paused: false,
      softUnlock: false,
      theoFrozen: false,
      theoFollowing: false,
      holdingSheet: false,
      ringing: null,
      alertOn: false,
      danger: false,
      glowCaught: false,
      paWindow: false,
      dropWindow: false,
      gazeBackpack: 0,
      stayDownWindow: false,
    };
    this.ui.pause(false);
    this.breath = { active: false, holding: false, guide: 0, you: 0, sync: 0, cycles: 0, t: 0 };
    this.hold = { active: false, t: 0, dur: 0, bad: 0, ok: true };
    this.input.reset();
    this.player.canMove = false;
    this.raisedHands.visible = false;
    this.panic = 0;
    this.phoneHasBuzzed = false;
    this.guidance?.reset();
    this.audio.ringtone(null);
  }

  // ------------------------------------------------------------ helpers for scenes

  say(who: Who, text: string, opts: { whisper?: boolean; dur?: number } = {}): number {
    const d = this.ui.say(who, text, opts);
    const person = this.world.people.get(who);
    if (person) person.say(d * 0.85);
    const pos = person ? { x: person.root.position.x, y: 1.2, z: person.root.position.z } : undefined;
    const kind = who === 'teacher' || who === 'theo' || who === 'zoe' || who === 'pa' || who === 'door' || who === 'officer' || who === 'noah' ? who : 'student';
    if (who === 'pa') this.world.setPA(d);
    this.audio.voice(kind, d * 0.8, opts.whisper, pos);
    return d;
  }

  setTime(min: number): void {
    this.world.clock.set(min);
    const h = Math.floor(min / 60);
    const m = Math.floor(min % 60);
    this.ui.phone.setTime(`${h}:${String(m).padStart(2, '0')}`);
  }

  walk(p: Person, path: [number, number][], speed = 1.1, pose?: Pose): Promise<void> {
    this.movers = this.movers.filter((m) => {
      if (m.p === p) m.done();
      return m.p !== p;
    });
    if (pose) p.setPose(pose);
    return new Promise((resolve) => this.movers.push({ p, path: path.slice(), speed, done: resolve }));
  }

  clearMovers(): void {
    const ms = this.movers;
    this.movers = [];
    ms.forEach((m) => {
      m.p.walking = false;
      m.done();
    });
  }

  private updateMovers(dt: number): void {
    if (!this.movers.length) return;
    const finished: Mover[] = [];
    for (const m of this.movers) {
      const pos = m.p.root.position;
      let budget = m.speed * dt;
      // Ms. Okafor and Theo step around the player instead of walking into the camera
      if (!m.detoured && m.path.length && (m.p === this.world.teacher || m.p === this.world.theo)) this.detourAroundPlayer(m);
      while (budget > 0 && m.path.length) {
        const [tx, tz] = m.path[0];
        const dx = tx - pos.x;
        const dz = tz - pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-3) m.p.faceTowards(tx, tz);
        if (d <= budget) {
          pos.x = tx;
          pos.z = tz;
          budget -= d;
          m.path.shift();
        } else {
          pos.x += (dx / d) * budget;
          pos.z += (dz / d) * budget;
          budget = 0;
        }
      }
      m.p.walking = m.path.length > 0;
      if (!m.path.length) finished.push(m);
    }
    if (finished.length) {
      this.movers = this.movers.filter((m) => !finished.includes(m));
      finished.forEach((m) => m.done());
    }
  }

  private detourAroundPlayer(m: Mover): void {
    const pos = m.p.root.position;
    const [tx, tz] = m.path[0];
    const px = this.player.x;
    const pz = this.player.z;
    const sx = tx - pos.x;
    const sz = tz - pos.z;
    const len = Math.hypot(sx, sz);
    if (len < 0.3) return;
    // closest point of this leg to the player
    const k = THREE.MathUtils.clamp(((px - pos.x) * sx + (pz - pos.z) * sz) / (len * len), 0, 1);
    const cx = pos.x + sx * k;
    const cz = pos.z + sz * k;
    const d = Math.hypot(cx - px, cz - pz);
    if (d > 1.25 || k <= 0.02 || k >= 0.98) return;
    // go round on the side the leg already passes, 1.35 m from the player
    let nx = -sz / len;
    let nz = sx / len;
    if ((cx - px) * nx + (cz - pz) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    const wx = THREE.MathUtils.clamp(px + nx * 1.35, ROOM.minX + 0.3, ROOM.maxX - 0.3);
    const wz = THREE.MathUtils.clamp(pz + nz * 1.35, ROOM.minZ + 0.3, ROOM.maxZ - 0.3);
    m.path.unshift([wx, wz]);
    m.detoured = true;
  }

  everyoneLooksAt(x: number, z: number): void {
    for (const p of this.world.people.values()) {
      if (!p.root.visible) continue;
      const dx = x - p.root.position.x;
      const dz = z - p.root.position.z;
      const rel = THREE.MathUtils.euclideanModulo(Math.atan2(-dx, -dz) - p.root.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      p.headYaw = THREE.MathUtils.clamp(rel, -1.4, 1.4);
      p.headPitch = 0;
    }
  }

  everyoneLooksAtDoor(): void {
    this.everyoneLooksAt(DOOR.x, DOOR.z);
  }

  /** Path for a person from wherever they are to their spot on the door wall. */
  huddlePath(name: string): [number, number][] {
    const p = this.world.people.get(name)!;
    const [hx, hz] = HUDDLE[name];
    const x = p.root.position.x;
    const ax = x < -1.8 ? -1.8 : x < 0 ? 0 : x < 1.8 ? 1.8 : 3.75;
    return [
      [ax, p.root.position.z],
      [ax, -3.3],
      [hx, hz],
    ];
  }

  sendToWall(name: string, speed = 1.0): Promise<void> {
    const p = this.world.people.get(name)!;
    const [, , f] = HUDDLE[name];
    return this.walk(p, this.huddlePath(name), speed, name === 'teacher' ? 'crouch' : 'crouch').then(() => {
      if (!['lockdown', 'texts', 'waiting', 'door'].includes(this.store.state.scene)) return;
      p.root.rotation.y = f;
      if (name === 'teacher') p.faceTowards(DOOR.x + 1, -2);
      p.setPose(name === 'teacher' ? 'crouch' : 'floor');
      p.headYaw = 0;
    });
  }

  // ---------- scene preparation (idempotent; lets any phase be entered via Skip) ----------

  prepareExam(): void {
    this.clearMovers();
    const w = this.world;
    w.resetPeople();
    w.setLights(true);
    w.setSiren(0);
    w.sirenLevel = 0;
    w.setDoorAngle(0);
    w.door.cover.visible = false;
    w.door.knob.rotation.z = 0;
    w.sheet.reset();
    w.spareSheet.visible = true;
    w.hands.visible = true;
    w.setBlinds(0);
    w.setBarricade(0);
    w.setFeet(null);
    w.setAlert(false);
    w.handlePress = 0;
    this.barricadeK = 0;
    this.flashlight.intensity = 0;
    this.player.sitAt(SEAT.x, SEAT.z);
    this.player.canMove = false;
    w.flickerPanels(1.4);
    this.ui.setHud(true);
    this.ui.setTopbar(true);
    this.ui.setMovement(false, this.touch);
    this.ui.setPhoneButton(false);
    this.ui.noiseVisible(false);
    this.ui.setCrosshair(true);
    this.flags.control = false;
  }

  prepareCode(): void {
    this.clearMovers();
    this.ui.clearChoices();
    this.ui.hint(null);
    this.hold.active = false;
    this.ui.holdMeter(null);
    const w = this.world;
    w.resetPeople();
    if (!w.lightsOn) w.setLights(true);
    this.ui.noiseVisible(true);
    this.ui.noise(this.store.state.noise);
  }

  /** State after the lockdown steps: lights off, door locked, everyone on the door wall. */
  prepareAfterLockdown(): void {
    this.clearMovers();
    this.ui.clearChoices();
    this.flags.control = false;
    this.flags.theoFrozen = false;
    this.flags.theoFollowing = false;
    const w = this.world;
    const st = this.store.state;
    if (w.lightsOn) {
      w.setLights(false);
      this.audio.fluorescentHum(false);
    }
    w.setDoorAngle(0);
    w.door.knob.rotation.z = Math.PI / 2;
    w.door.cover.visible = st.tasks.coverWindow;
    w.setBarricade(st.tasks.barricade ? 1 : this.barricadeK);
    w.setBlinds(1);
    w.hands.visible = false;
    for (const name of Object.keys(HUDDLE)) {
      const p = w.people.get(name);
      if (!p) continue;
      const [x, z, f] = HUDDLE[name];
      p.walking = false;
      const far = Math.hypot(p.root.position.x - x, p.root.position.z - z) > 0.25;
      if (far) p.place(x, z, f);
      if (name === 'teacher') {
        p.faceTowards(DOOR.x + 1, -2);
        p.setPose('crouch', far);
      } else p.setPose('floor', far);
    }
    w.theo.tremble = Math.min(w.theo.tremble, 0.5);
    const pl = this.player;
    const crowded = Object.values(HUDDLE).some(([x, z]) => Math.hypot(pl.x - x, pl.z - z) < 0.75);
    if (pl.stance === 'seated' || !inDoorWallZone(pl.x, pl.z) || crowded) {
      pl.x = NOAH_WALL_SPOT.x;
      pl.z = NOAH_WALL_SPOT.z;
      pl.stance = 'crouch';
      pl.lookAt(new THREE.Vector3(DOOR.x, 0.9, DOOR.z));
    }
    pl.canMove = false;
    this.ui.phone.silenced = true;
    this.ui.phone.renderRing();
    this.ui.noiseVisible(true);
    this.ui.noise(st.noise);
    this.ui.setPhoneButton(true);
    this.ui.setMovement(false, this.touch);
    this.ui.setHud(true);
  }

  allowCrouchedMovement(): void {
    this.player.canMove = true;
    this.ui.setMovement(true, this.touch);
  }

  leaveSeat(stance: 'stand' | 'crouch'): void {
    const p = this.player;
    if (p.stance !== 'seated') return;
    p.stance = stance;
    this.world.hands.visible = false;
    const sx = p.x;
    const sz = p.z;
    const tx = AISLE_X - 0.05;
    const tz = PLAYER_DESK.z + 0.35;
    void this.tweens.run(0.35, (k) => {
      p.x = sx + (tx - sx) * k;
      p.z = sz + (tz - sz) * k;
    });
    p.pitch = Math.max(p.pitch, -0.3);
  }

  // ---------- lockdown mechanics ----------

  beginLockdownControl(): void {
    this.flags.control = true;
    this.flags.lockdownStart = this.clock.time;
    this.player.canMove = true;
    if (this.player.stance === 'seated') this.leaveSeat('crouch');
    this.ui.setMovement(true, this.touch);
    this.ui.setPhoneButton(true);
    this.ui.phone.setCanClose(true);
    this.ui.noiseVisible(true);
    this.updateChecklist();
  }

  endLockdownControl(): void {
    this.flags.control = false;
    this.player.canMove = false;
    this.player.autoTarget = null;
    this.ui.setMovement(false, this.touch);
    this.closePhone();
  }

  lockdownPlayerTasksDone(): boolean {
    const t = this.store.state.tasks;
    return t.wallByDoor && t.theoDown && t.blinds && t.coverWindow && t.barricade && t.silencePhone && (t.ringingPhone || this.store.state.missed.includes('ringingPhone')) && t.lockAndLights;
  }

  phoneBuzz([from, text]: string[]): void {
    this.phoneHasBuzzed = true;
    this.audio.phoneBuzz();
    this.ui.phone.notify(from, text);
    this.ui.phone.addMsg('mom', text, { silent: true, thread: 'mom' });
    this.ui.phone.flash();
    this.ui.setPhoneButton(true, true);
    this.ui.caption('[your phone buzzes in your pocket. Loud.]', 2.5);
    this.player.sway = 2;
    this.clock.after(1, () => (this.player.sway = 0.4));
    this.dispatch({ type: 'NOISE', source: 'phoneBuzz' });
  }

  private phoneSilenced(): void {
    this.audio.phoneTap();
    this.ui.setPhoneButton(true, false);
    this.task('silencePhone');
    this.clock.after(0.9, () => {
      if (this.store.state.scene === 'lockdown') this.closePhone();
    });
  }

  startRinging(id: string): void {
    const pack = this.world.backpacks.find((b) => b.id === id);
    if (!pack) return;
    pack.ringing = true;
    this.flags.ringing = id;
    const p = pack.mesh.position;
    this.audio.ringtone({ x: p.x, y: 0.3, z: p.z });
    this.ui.caption("[a phone starts ringing. Someone's backpack.]", 3);
  }

  stopRinging(): void {
    this.world.backpacks.forEach((b) => (b.ringing = false));
    this.flags.ringing = null;
    this.audio.ringtone(null);
  }

  turnLightsOff(): void {
    if (!this.world.lightsOn) return;
    this.world.setLights(false);
    this.audio.lightSwitch();
    this.audio.fluorescentHum(false);
    this.ui.caption('[click. The room goes dark blue.]', 2.5);
  }

  async pullPlayerToWall(): Promise<void> {
    this.ui.fade(0.9, 0.4);
    await new Promise<void>((r) => this.clock.after(0.5, r));
    const p = this.player;
    p.x = NOAH_WALL_SPOT.x;
    p.z = NOAH_WALL_SPOT.z;
    p.stance = 'crouch';
    this.world.hands.visible = false;
    p.lookAt(new THREE.Vector3(DOOR.x, 0.9, DOOR.z));
    this.ui.fade(0, 0.6);
  }

  // ---------- phone ----------

  /** Opening the phone costs 1% battery. At 0% the screen stays black. */
  openPhone(mode: 'lock' | 'chat', canClose: boolean, free = false): boolean {
    if (this.ui.phone.isOpen) return true;
    const st = this.store.state;
    if (st.battery <= 0) {
      this.ui.caption('[your phone is dead. The screen stays black.]', 3);
      return false;
    }
    if (!free) this.dispatch({ type: 'PHONE_CHECK' });
    this.ui.phone.setCanClose(canClose);
    this.ui.phone.open(mode);
    this.softUnlock();
    this.ui.setPhoneButton(true, false);
    return true;
  }

  closePhone(): void {
    const was = this.ui.phone.isOpen;
    this.ui.phone.close();
    if (was) this.relock();
  }

  private togglePhone(): void {
    const scene = this.store.state.scene;
    const ph = this.ui.phone;
    if (scene === 'exam' || scene === 'code') {
      this.ui.caption("[your phone stays in your pocket. It's a final.]", 2.5);
      return;
    }
    if (!['lockdown', 'texts', 'waiting', 'door'].includes(scene)) return;
    if (ph.isOpen) {
      if (ph.canClose) this.closePhone();
      return;
    }
    this.openPhone(scene === 'lockdown' && !ph.silenced ? 'lock' : 'chat', true);
  }

  private setHold(down: boolean): void {
    this.breath.holding = down;
    if (this.ui.phone.isOpen) this.ui.phone.setCovered(down);
    if (down && this.ui.phone.isOpen && this.flags.danger) this.task('coverGlow');
  }

  get holdingStill(): boolean {
    return this.input.holdingSpace || this.breath.holding;
  }

  // ---------- hold still ----------

  /** A hold-still beat: hold Space, keep the mouse and feet still. Resolves passed/failed. */
  async holdStill(s: Script, dur: number, label: string): Promise<boolean> {
    this.hold = { active: true, t: 0, dur, bad: 0, ok: true };
    this.ui.hint(this.touch ? 'Hold the Hold button. Don\u2019t move.' : 'Hold Space. Don\u2019t move.', true);
    await s.until(() => !this.hold.active, dur + 2);
    this.ui.hint(null);
    this.ui.holdMeter(null);
    const passed = this.hold.bad < Math.min(0.5, (dur / Math.max(1, this.clock.speed)) * 0.3);
    this.hold.active = false;
    void label;
    return passed;
  }

  /** dt = sim time (beat length), realDt = real time (how long you actually moved). */
  private updateHold(dt: number, realDt: number): void {
    const h = this.hold;
    if (!h.active) return;
    h.t += dt;
    h.real = (h.real ?? 0) + realDt;
    const moving = this.input.lastLookPx > 6 || this.player.speed > 0.05 || !this.holdingStill;
    // grace and allowance in real seconds, capped by the beat's real length (matters only at ?speed > 1)
    const realLen = h.dur / Math.max(1, this.clock.speed);
    if (moving && h.real > Math.min(1.0, realLen * 0.3)) h.bad += realDt;
    h.ok = !moving;
    this.ui.holdMeter({ progress: Math.min(1, h.t / h.dur), sub: h.ok ? 'still...' : this.holdingStill ? 'you moved!' : 'hold Space', ok: h.ok });
    if (h.t >= h.dur) h.active = false;
  }

  // ---------- breathe with Theo (hold in time with the ring) ----------

  startBreathing(): void {
    this.breath = { active: true, holding: this.breath.holding, guide: 0, you: 0, sync: 0, cycles: 0, t: 0 };
  }

  stopBreathing(): void {
    this.breath.active = false;
    this.ui.breathe(null);
  }

  private updateBreath(dt: number): void {
    const b = this.breath;
    if (!b.active) return;
    const holding = b.holding || this.input.holdingSpace;
    b.t += dt;
    const period = 5;
    const ph = (b.t % period) / period;
    b.guide = ph < 0.5 ? ph * 2 : 2 - ph * 2;
    b.you = THREE.MathUtils.clamp(b.you + (holding ? 1 : -1) * dt / 2.5, 0, 1);
    if (Math.abs(b.you - b.guide) < 0.22) b.sync += dt;
    b.cycles = Math.floor(b.sync / period);
    this.world.theo.tremble = Math.max(0.3, 1.6 - b.cycles * 0.45);
    this.ui.breathe({ guide: b.guide, you: b.you, label: `${ph < 0.5 ? 'In...' : 'Out...'}  in step: ${b.cycles}/3` });
  }

  // ---------- door ----------

  async walkPlayerToDoor(): Promise<void> {
    const p = this.player;
    p.stance = 'stand';
    const target: [number, number] = [DOOR.x - 0.35, DOOR.z + 0.85];
    const sx = p.x;
    const sz = p.z;
    const d = Math.hypot(target[0] - sx, target[1] - sz);
    await this.tweens.run(Math.max(0.6, d / 1.4), (k) => {
      p.x = sx + (target[0] - sx) * k;
      p.z = sz + (target[1] - sz) * k;
    }, linear);
    if (this.store.state.tasks.barricade) {
      this.audio.deskSlide(true);
      await this.tweens.run(1.2, (k) => this.world.setBarricade(1 - k * 0.6));
    }
    const look = new Player();
    look.x = p.x;
    look.z = p.z;
    look.eye = 1.62;
    look.stance = 'stand';
    look.lookAt(new THREE.Vector3(DOOR.x, 1.1, DOOR.z));
    const y0 = p.yaw;
    const p0 = p.pitch;
    await this.tweens.run(0.5, (k) => {
      p.yaw = y0 + (THREE.MathUtils.euclideanModulo(look.yaw - y0 + Math.PI, Math.PI * 2) - Math.PI) * k;
      p.pitch = p0 + (look.pitch - p0) * k;
    });
  }

  /** Faces (Ms. Okafor, Theo) are never seen closer than ~1 m: they look down/away as you approach. */
  faceMin = Infinity;
  private faceV = new THREE.Vector3();
  private camV = new THREE.Vector3();
  faceMinAt = '';
  faceBlocks = 0;
  private fwdV = new THREE.Vector3();
  /** How much the body faces a point: 1 straight at it, <= 0 the point is behind them. */
  private facing(p: Person, x: number, y: number, z: number): number {
    // body facing (not the head, which itself turns away when you come close)
    p.root.getWorldDirection(this.fwdV); // +z of the body = its back
    const dx = x - this.faceV.x;
    const dy = y - this.faceV.y;
    const dz = z - this.faceV.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    return -(this.fwdV.x * dx + this.fwdV.y * dy + this.fwdV.z * dz) / l;
  }
  /** Personal space: in front of these two faces you can't step closer than ~1 m (they never shove you). */
  private keepFaceDistance(prevX: number, prevZ: number): void {
    if (this.player.stance === 'seated') return;
    const w = this.world;
    for (const p of [w.teacher, w.theo]) {
      if (!p.root.visible) continue;
      p.head.getWorldPosition(this.faceV);
      this.faceV.y += 0.1 * p.root.scale.y;
      if (this.facing(p, this.player.x, this.player.eye, this.player.z) < 0) continue;
      const dy = this.player.eye - this.faceV.y;
      const need = Math.sqrt(Math.max(0, 1.04 * 1.04 - dy * dy));
      const dx = this.player.x - this.faceV.x;
      const dz = this.player.z - this.faceV.z;
      const d = Math.hypot(dx, dz);
      if (d >= need) continue;
      const before = Math.hypot(prevX - this.faceV.x, prevZ - this.faceV.z);
      if (before >= need) {
        // stepping in from outside: stop where the step meets the circle (like bumping into
        // someone); a scripted walk ends there
        const mx = this.player.x - prevX;
        const mz = this.player.z - prevZ;
        const fx = prevX - this.faceV.x;
        const fz = prevZ - this.faceV.z;
        const a = mx * mx + mz * mz;
        const b = 2 * (fx * mx + fz * mz);
        const c = fx * fx + fz * fz - need * need;
        const disc = b * b - 4 * a * c;
        const t = a > 1e-9 && disc >= 0 ? THREE.MathUtils.clamp((-b - Math.sqrt(disc)) / (2 * a), 0, 1) * 0.98 : 0;
        this.player.x = prevX + mx * t;
        this.player.z = prevZ + mz * t;
        this.player.autoTarget = null;
        this.faceBlocks++;
      } else if (d < before) {
        // already inside (they came to you): you may only move away
        this.player.x = prevX;
        this.player.z = prevZ;
        this.player.autoTarget = null;
        this.faceBlocks++;
      }
    }
  }
  private updateFaces(dt: number): void {
    const w = this.world;
    this.camera.getWorldPosition(this.camV);
    const sc = this.store.state.scene;
    const playing = sc !== 'title' && sc !== 'exited';
    for (const p of [w.teacher, w.theo]) {
      if (!p.root.visible) continue;
      p.head.getWorldPosition(this.faceV);
      this.faceV.y += 0.1 * p.root.scale.y;
      const d = this.faceV.distanceTo(this.camV);
      // only a face you are in front of counts as seen (behind/beside it you see hair and shoulders)
      const front = this.facing(p, this.camV.x, this.camV.y, this.camV.z) > 0;
      if (playing && front && d < this.faceMin) {
        this.faceMin = d;
        this.faceMinAt = `${p.name} ${sc} player(${this.player.x.toFixed(2)},${this.player.z.toFixed(2)},${this.player.stance}) face(${this.faceV.x.toFixed(2)},${this.faceV.y.toFixed(2)},${this.faceV.z.toFixed(2)})`;
      }
      const want = front ? THREE.MathUtils.clamp((1.2 - d) / 0.3, 0, 1) : 0;
      p.shy += (want - p.shy) * Math.min(1, dt * 6);
    }
  }

  private buildRaisedHands(): void {
    const skin = skinMaterial(this.world.lib, 0xd2a07e);
    const sleeve = knitMaterial(this.world.lib, 0x6e7280);
    for (const sx of [-1, 1]) {
      const h = new THREE.Group();
      const hand = buildHand(skin, sx);
      hand.rotation.set(0, (sx * Math.PI) / 2, Math.PI); // fingers up, palm out
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.3, 4, 12), sleeve);
      arm.position.y = -0.21;
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.009, 6, 16).rotateX(Math.PI / 2), sleeve);
      cuff.position.y = -0.045;
      h.add(hand, arm, cuff);
      h.position.set(sx * 0.32, 0.02, -0.5);
      h.rotation.z = -sx * 0.2;
      this.raisedHands.add(h);
    }
    this.raisedHands.visible = false;
    this.camera.add(this.raisedHands);
  }

  async stageAction(a: StageAction, s: Script): Promise<void> {
    const w = this.world;
    switch (a) {
      case 'openDoorCrack':
        void this.tweens.run(0.8, (k) => w.setDoorAngle(k * 0.3), undefined, w.door);
        return;
      case 'slamDoor': {
        const from = w.door.angle;
        void this.tweens.run(0.15, (k) => w.setDoorAngle(from * (1 - k)), linear, w.door);
        this.player.sway = 4;
        this.clock.after(1, () => (this.player.sway = 0.5));
        return;
      }
      case 'theoRuns': {
        const t = w.theo;
        t.tremble = 0;
        t.setPose('stand');
        void this.walk(t, [[DOOR.x + 0.2, DOOR.z + 0.6], [DOOR.x + 0.2, DOOR.z - 1.5]], 4.2).then(() => (t.root.visible = false));
        return;
      }
      case 'feetShadows': {
        void this.tweens.run(2.5, (k) => w.setFeet(DOOR.x - 0.9 + k * 0.9), linear);
        this.clock.after(9, () => w.setFeet(null));
        return;
      }
      case 'policeEnter': {
        const from = w.door.angle;
        w.setBarricade(0);
        void this.tweens.run(1.2, (k) => w.setDoorAngle(from + (1.35 - from) * k), undefined, w.door);
        await s.wait(0.4);
        void this.tweens.run(1.5, (k) => (this.flashlight.intensity = k * 18));
        return;
      }
      case 'walkOut': {
        this.ui.hint(this.touch ? 'Raise your hands: hold the Hold button' : 'Raise your hands: hold Space', true);
        this.ui.setMovement(false, this.touch);
        const ok = await s.until(() => this.holdingStill, 12);
        this.ui.hint(null);
        this.raisedHands.visible = true;
        this.ui.caption(ok ? '[you raise your hands and walk out, slowly]' : '[an officer guides you out, hands up]', 4);
        const p = this.player;
        p.stance = 'stand';
        const sx = p.x;
        const sz = p.z;
        const tx = DOOR.x;
        const tz = DOOR.z - 0.6;
        const yaw0 = p.yaw;
        const yaw1 = Math.atan2(-(tx - sx), -(tz - sz));
        const dy = THREE.MathUtils.euclideanModulo(yaw1 - yaw0 + Math.PI, Math.PI * 2) - Math.PI;
        await this.tweens.run(3.2, (k) => {
          p.x = sx + (tx - sx) * k;
          p.z = sz + (tz - sz) * k;
          p.yaw = yaw0 + dy * Math.min(1, k * 2);
          p.pitch *= 0.9;
        }, linear);
        return;
      }
      case 'fadeOut':
        this.ui.fade(1, 2.5);
        this.audio.sirens(0, 2.5);
        this.audio.breathing(0);
        this.audio.heartbeat(false);
        this.audio.drone(0);
        return;
    }
  }

  // ------------------------------------------------------------ interaction

  private setupInteractables(): void {
    const w = this.world;
    const scene = () => this.store.state.scene;
    const lockdown = () => scene() === 'lockdown' && this.flags.control;
    this.interactables = [
      {
        id: 'sheet',
        objects: () => [w.sheetMesh],
        range: 1.3,
        enabled: () => scene() === 'exam' && this.player.stance === 'seated',
        label: (h) => {
          const b = h.uv ? w.sheet.bubbleAt(h.uv.x, h.uv.y) : null;
          return b ? `Fill in ${41 + b.row}${'ABCD'[b.col]}` : null;
        },
        use: (h) => {
          const b = h.uv ? w.sheet.bubbleAt(h.uv.x, h.uv.y) : null;
          if (!b) return false;
          this.fillBubble(b.row, b.col);
          return true;
        },
      },
      {
        id: 'theo',
        objects: () => w.theo.pickables,
        range: 1.8,
        enabled: () => lockdown() && this.flags.theoFrozen && !this.flags.theoFollowing,
        label: () => 'Pull Theo with you',
        use: () => {
          this.flags.theoFollowing = true;
          this.flags.theoFrozen = false;
          this.say('noah', 'Theo. Hey. With me. Come on.', { whisper: true });
          this.clock.after(1.2, () => this.say('theo', '...Okay. Okay.', { whisper: true }));
          w.theo.setPose('crouch');
          return true;
        },
      },
      {
        id: 'blinds',
        objects: () => [w.blindsCord],
        range: 1.6,
        enabled: () => lockdown() && !this.store.state.tasks.blinds,
        label: () => 'Close the blinds',
        use: () => {
          this.audio.rustle();
          void this.tweens.run(1.2, (k) => w.setBlinds(k));
          this.task('blinds');
          return true;
        },
      },
      {
        id: 'spareSheet',
        objects: () => [w.spareSheet],
        range: 1.4,
        enabled: () => lockdown() && w.spareSheet.visible && !this.flags.holdingSheet,
        label: () => 'Take the spare sheet',
        use: () => {
          w.spareSheet.visible = false;
          this.flags.holdingSheet = true;
          this.audio.rustle();
          this.ui.caption('[you take the spare answer sheet]', 2);
          return true;
        },
      },
      {
        id: 'doorWindow',
        objects: () => [w.door.window],
        range: 1.6,
        enabled: () => lockdown() && this.flags.holdingSheet && !this.store.state.tasks.coverWindow,
        label: () => 'Cover the door window',
        use: () => {
          w.door.cover.visible = true;
          this.flags.holdingSheet = false;
          this.audio.rustle();
          this.task('coverWindow');
          return true;
        },
      },
      {
        id: 'barricade',
        objects: () => [w.barricade],
        range: 1.6,
        enabled: () => lockdown() && !this.store.state.tasks.barricade,
        label: () => (this.touch ? 'Hold Use: slide the desk to the door' : 'Hold E: slide the desk (Shift: faster, loud)'),
        use: () => true,
      },
      ...w.backpacks.map(
        (b): Interactable => ({
          id: `pack:${b.id}`,
          objects: () => [b.mesh],
          range: 1.5,
          enabled: () => lockdown() && this.flags.ringing !== null && !this.store.state.tasks.ringingPhone,
          label: () => 'Check the backpack',
          use: () => {
            this.audio.rustle();
            if (b.ringing) {
              this.stopRinging();
              this.task('ringingPhone');
              this.say('malik', "That's mine. Sorry. Sorry.", { whisper: true });
            } else this.ui.caption('[not this one]', 1.5);
            return true;
          },
        }),
      ),
      {
        id: 'alert',
        objects: () => [w.teacherPhone],
        range: 2.4,
        enabled: () => scene() === 'waiting' && this.flags.alertOn && !this.store.state.tasks.schoolAlert,
        label: () => 'Read the alert over her shoulder',
        use: () => {
          this.task('schoolAlert');
          this.ui.phone.banner('DISTRICT ALERT', 'Lockdown in effect. Do not open doors for anyone. Police will unlock rooms with keys.', '10:50', 'DO NOT OPEN DOORS');
          this.ui.caption('[you read it over her shoulder]', 3);
          return true;
        },
      },
    ];
  }

  fillBubble(row: number, col: number): void {
    const w = this.world;
    w.sheet.fill(row, col);
    this.audio.pencil();
    const target = w.handTo(row, col);
    const hand = w.rightHand;
    const from = hand.position.clone();
    const to = new THREE.Vector3(target.x + 0.03, hand.position.y, target.z + 0.08);
    void this.tweens.run(0.25, (k) => hand.position.lerpVectors(from, to, k), undefined, hand);
    this.dispatch({ type: 'FILL_BUBBLE', index: row });
  }

  pick(clientX: number, clientY: number): { it: Interactable; hit: THREE.Intersection } | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.layers.set(0);
    let best: { it: Interactable; hit: THREE.Intersection } | null = null;
    for (const it of this.interactables) {
      if (!it.enabled()) continue;
      const h = this.raycaster.intersectObjects(it.objects(), true)[0];
      if (h && h.distance <= it.range && (!best || h.distance < best.hit.distance)) best = { it, hit: h };
    }
    return best;
  }

  /** debug: every enabled interactable and where a ray at (x, y) hits it */
  pickDebug(clientX: number, clientY: number): string[] {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.layers.set(0);
    return this.interactables.filter((it) => it.enabled()).map((it) => {
      const objs = it.objects();
      const h = this.raycaster.intersectObjects(objs, true)[0];
      return `${it.id}:${objs.length}obj:${h ? h.distance.toFixed(2) + '@' + (h.object.name || h.object.type) : 'miss'}`;
    });
  }

  private centerPick() {
    const r = this.canvas.getBoundingClientRect();
    return this.pick(r.left + r.width / 2, r.top + r.height / 2);
  }

  /** Is the crosshair on this object (ignoring range)? */
  gazing(obj: THREE.Object3D, maxDist = 12): boolean {
    this.raycaster.setFromCamera(CENTER, this.camera);
    const h = this.raycaster.intersectObject(obj, true)[0];
    return !!h && h.distance < maxDist;
  }

  private tap(x: number, y: number): void {
    if (this.ui.phone.isOpen || this.flags.paused) return;
    const t = this.pick(x, y);
    if (t) t.it.use(t.hit);
  }

  private action(a: 'crouch' | 'use' | 'phone' | 'escape' | 'mute' | 'useDown' | 'useUp'): void {
    if (this.flags.paused && a !== 'escape' && a !== 'mute') return;
    switch (a) {
      case 'phone':
        this.togglePhone();
        return;
      case 'escape':
        if (this.ui.optionsOpen) this.ui.toggleOptions(false);
        else if (this.ui.phone.isOpen && this.ui.phone.canClose) this.closePhone();
        return;
      case 'mute':
        this.settings.sound = !this.settings.sound;
        this.applySettings(this.settings);
        return;
      case 'use': {
        if (this.ui.phone.isOpen) return;
        const t = this.input.locked || this.touch || this.input.noLock ? this.centerPick() : null;
        if (t) t.it.use(t.hit);
        return;
      }
      case 'useDown':
      case 'useUp':
        if (a === 'useUp') this.barricadeFastSession = false;
        return;
      case 'crouch': {
        const p = this.player;
        const scene = this.store.state.scene;
        if (scene === 'code' && this.flags.dropWindow && p.stance === 'seated') {
          this.leaveSeat('crouch');
          this.task('dropDown');
          return;
        }
        if (!p.canMove) return;
        if (p.stance === 'seated') this.leaveSeat('crouch');
        else p.setStance(p.stance === 'crouch' ? 'stand' : 'crouch');
        return;
      }
    }
  }

  // ------------------------------------------------------------ frame loop

  private frame = (now: number) => {
    requestAnimationFrame(this.frame);
    this.frames++;
    const realMs = Math.max(0, now - this.last);
    this.last = now;
    this.fpsAcc.t += realMs;
    this.fpsAcc.n++;
    if (this.bench) this.stepBenchmark(realMs);
    if (this.fpsAcc.t >= 500) {
      this.fps = (this.fpsAcc.n * 1000) / this.fpsAcc.t;
      this.fpsMs = this.fpsAcc.t / this.fpsAcc.n;
      this.fpsAcc.t = 0;
      this.fpsAcc.n = 0;
      if (this.ui.fpsOn) {
        const info = this.renderer.three.info;
        this.ui.setFps(`${this.fps.toFixed(0)} fps · ${this.fpsMs.toFixed(1)} ms · ${this.renderer.preset}${this.settings.quality === 'auto' ? ' (auto)' : ''} · ${info.render.calls} draws · ${(info.render.triangles / 1000).toFixed(0)}k tris`);
      }
    }
    const realDt = Math.min(this.clock.speed > 1 ? 0.25 : 0.1, realMs / 1000);
    const dt = this.flags.paused ? 0 : realDt * this.clock.speed;

    if (this.input.usedTouch && !this.touchApplied) {
      this.touchApplied = true;
      this.ui.setMovement(this.player.canMove, true);
    }
    const look = this.input.consumeLook();
    if (!this.flags.paused) {
      const sens = this.input.locked ? 0.0022 : this.input.usedTouch ? 0.0045 : 0.0032;
      this.player.look(look.dx * sens, look.dy * sens);
      const turn = this.input.turnVector();
      if (turn) this.player.look(turn * 1.9 * realDt, 0);
    }

    const blocked = this.ui.phone.isOpen || !this.player.canMove || this.flags.paused;
    const mv = blocked ? { x: 0, y: 0 } : this.input.moveVector();
    if (this.player.stance === 'seated' && this.player.canMove && (mv.x || mv.y)) this.leaveSeat('stand');
    const hurry = this.input.hurry && this.player.canMove && (mv.x !== 0 || mv.y !== 0);
    const prevX = this.player.x;
    const prevZ = this.player.z;
    this.player.update(dt, mv, this.world.colliders, hurry);
    this.keepFaceDistance(prevX, prevZ);

    this.clock.tick(dt);
    this.tweens.update(dt);
    this.updateMovers(dt);
    this.world.update(dt);
    if (dt > 0) {
      this.updateBreath(dt);
      this.updateHold(dt, realDt);
      this.updateTasks(dt);
    }
    this.updateHover();
    this.player.applyTo(this.camera);
    this.camera.updateMatrixWorld();
    const prevTask = this.guidance.state.task;
    this.guidance.update(dt, realDt);
    if (prevTask !== this.guidance.state.task) this.updateChecklist();
    this.ui.setHolding(this.hold.active);
    this.updatePanic(realDt);
    this.updateFaces(dt);

    this.player.applyTo(this.camera);
    this.audio.setListener({ x: this.player.x, y: this.player.eye, z: this.player.z }, this.player.yaw);
    this.renderer.render(realDt);
  };

  private updatePanic(dt: number): void {
    const st = this.store.state;
    const noise = st.noise / 100;
    const beat = this.hold.active ? 0.5 : this.flags.danger ? 0.3 : 0;
    const target = ['lockdown', 'texts', 'waiting', 'door', 'ending'].includes(st.scene) ? Math.min(1, noise * 0.8 + beat + (st.scene === 'door' ? 0.25 : 0)) : 0;
    this.panic += (target - this.panic) * Math.min(1, dt * 1.5);
    this.renderer.panic = this.flags.endShown ? 0 : this.panic;
    this.renderer.mood = this.world.mood;
    this.renderer.targetExposure = this.world.lightsOn ? 1.0 : 1.4;
    this.renderer.closeUp = this.ui.phone.isOpen;
    this.audio.whine(this.panic > 0.35 ? this.panic - 0.3 : 0);
  }

  /** Per-frame task checks (positions, gaze, holds, followers, timers). */
  private updateTasks(dt: number): void {
    const st = this.store.state;
    const w = this.world;
    const p = this.player;
    if (st.scene === 'exam' && !st.tasks.zoeBackpack) {
      if (this.gazing(w.zoeBackpack, 4)) {
        this.flags.gazeBackpack += dt;
        if (this.flags.gazeBackpack > 0.6) this.task('zoeBackpack');
      }
    }
    if (st.scene === 'texts' && this.flags.danger && this.ui.phone.isOpen && this.holdingStill && !st.tasks.coverGlow) {
      this.ui.phone.setCovered(true);
      this.task('coverGlow');
    }
    if (st.scene === 'code' && this.flags.paWindow && !st.tasks.lookPA && this.gazing(w.paSpeaker, 12)) this.task('lookPA');
    if (st.scene === 'lockdown' && this.flags.control) {
      if (!st.tasks.wallByDoor && p.stance !== 'seated' && inDoorWallZone(p.x, p.z)) this.task('wallByDoor');
      // Theo follows you, crouched
      if (this.flags.theoFollowing && !st.tasks.theoDown) {
        const t = w.theo.root.position;
        const tx = THREE.MathUtils.clamp(p.x + 1.1, ROOM.minX + 0.4, ROOM.maxX - 0.4);
        const tz = THREE.MathUtils.clamp(p.z + 0.85, ROOM.minZ + 0.4, ROOM.maxZ - 0.4);
        const d = Math.hypot(tx - t.x, tz - t.z);
        if (d > 0.05) {
          const step = Math.min(d, 1.6 * dt);
          let ux = (tx - t.x) / d;
          let uz = (tz - t.z) / d;
          // never walk into Noah's face: inside 1.2 m, go round him instead of closer
          const rx = t.x - p.x;
          const rz = t.z - p.z;
          const rd = Math.hypot(rx, rz);
          if (rd < 1.2 && rd > 1e-3 && ux * rx + uz * rz < 0) {
            const inward = (ux * rx + uz * rz) / rd;
            ux -= (inward * rx) / rd;
            uz -= (inward * rz) / rd;
            const ul = Math.hypot(ux, uz) || 1;
            ux /= ul;
            uz /= ul;
          }
          w.theo.faceTowards(t.x + ux, t.z + uz);
          t.x += ux * step;
          t.z += uz * step;
          w.theo.walking = d > 0.2;
        } else w.theo.walking = false;
        if (inDoorWallZone(p.x, p.z) && Math.hypot(t.x - p.x, t.z - p.z) < 1.75) {
          this.flags.theoFollowing = false;
          w.theo.walking = false;
          this.task('theoDown');
          void this.sendToWall('theo', 1.2);
        }
      }
      // barricade: hold E near the desk
      if (!st.tasks.barricade && this.input.holdingUse) {
        const t = this.centerPick();
        const near = Math.hypot(w.barricade.position.x - p.x, w.barricade.position.z - p.z) < 1.7;
        if (near && (t?.it.id === 'barricade' || this.input.usedTouch || this.input.noLock || this.input.locked)) {
          const fast = this.input.hurry;
          if (fast && !this.barricadeFastSession) {
            this.barricadeFastSession = true;
            this.audio.deskSlide(true);
            this.ui.caption('[the desk legs SCREECH across the floor]', 2.5);
            this.dispatch({ type: 'NOISE', source: 'deskScrape' });
          }
          if (!fast && Math.random() < dt * 2) this.audio.deskSlide(false);
          this.barricadeK = Math.min(1, this.barricadeK + dt / (fast ? 1.6 : 4.5));
          w.setBarricade(this.barricadeK);
          if (this.barricadeK >= 1) this.task('barricade');
        }
      }
      // the timer bar: refresh a few times a second, not every frame
      const now = performance.now();
      if (now - this.lastListUpdate > 250) {
        this.lastListUpdate = now;
        this.updateChecklist();
      }
    }
  }

  private updateHover(): void {
    const ptr = this.input.pointer;
    const fromPointer = !this.input.locked && ptr.over && !this.input.usedTouch && this.input.noLock;
    let t: { it: Interactable; hit: THREE.Intersection } | null = null;
    if (!this.ui.phone.isOpen && !this.input.dragging && !this.flags.paused) t = fromPointer ? this.pick(ptr.x, ptr.y) : this.centerPick();
    const label = t ? t.it.label(t.hit) : null;
    this.world.sheet.setHover(t && t.it.id === 'sheet' && t.hit.uv ? this.world.sheet.bubbleAt(t.hit.uv.x, t.hit.uv.y) : null);
    const verb = this.touch ? 'Tap' : fromPointer ? 'Click' : 'E';
    const needsClick = this.input.lockMode && !this.input.locked && !this.flags.paused && !this.ui.phone.isOpen && PLAY_SCENES.includes(this.store.state.scene) && !this.flags.endShown;
    this.ui.prompt(needsClick ? 'Click the view to look around' : label ? (label.startsWith('Hold') ? label : `${verb}: ${label}`) : null);
  }

  // ------------------------------------------------------------ test / debug hooks

  targetPos(id: string): THREE.Vector3 | null {
    const w = this.world;
    const wp = (o: THREE.Object3D, dy = 0) => o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, dy, 0));
    switch (id) {
      case 'switch':
        return SWITCH_POS.clone();
      case 'theo':
        return wp(w.theo.head, 0.12);
      case 'door':
        return new THREE.Vector3(DOOR.x, 1.0, DOOR.z);
      case 'doorWindow':
        return wp(w.door.window);
      case 'pa':
        return PA_POS.clone();
      case 'zoeBackpack':
        return wp(w.zoeBackpack, 0.22);
      case 'blinds':
        return wp(w.blindsCord, 1.3);
      case 'spareSheet':
        return wp(w.spareSheet);
      case 'barricade':
        return wp(w.barricade, 0.72);
      case 'alert':
        return wp(w.teacherPhone);
      case 'window':
        return new THREE.Vector3(-4.5, 1.6, 0.1);
      case 'board':
        return new THREE.Vector3(-1.5, 1.6, -4.5);
      case 'wallSpot':
        return new THREE.Vector3(NOAH_WALL_SPOT.x, 0.3, NOAH_WALL_SPOT.z);
      case 'teacher':
        return wp(w.teacher.head);
      case 'sheet':
        return wp(w.sheetMesh);
    }
    if (id.startsWith('pack:')) {
      const b = w.backpacks.find((x) => x.id === id.slice(5));
      return b ? wp(b.mesh, 0.25) : null;
    }
    const m = /^bubble:(\d):(\d)$/.exec(id);
    if (m) return w.handTo(Number(m[1]), Number(m[2]));
    return null;
  }

  screenPos(id: string): { x: number; y: number; onScreen: boolean } | null {
    const p = this.targetPos(id);
    if (!p) return null;
    this.player.applyTo(this.camera);
    this.camera.updateMatrixWorld();
    const v = p.clone().project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, onScreen: v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
  }

  lookAtPoint(x: number, y: number, z: number): void {
    this.player.lookAt(new THREE.Vector3(x, y, z));
  }

  aim(id: string): boolean {
    const p = this.targetPos(id);
    if (!p) return false;
    this.player.lookAt(p);
    return true;
  }

  walkTo(x: number, z: number): Promise<{ x: number; z: number }> {
    if (this.player.stance === 'seated' && this.player.canMove) this.leaveSeat('stand');
    this.player.autoTarget = { x, z };
    return new Promise((resolve) => {
      const check = () => {
        if (!this.player.autoTarget) resolve({ x: this.player.x, z: this.player.z });
        else requestAnimationFrame(check);
      };
      check();
    });
  }

  /** Grid A* over the room (test/debug helper): walk to within `within` m of (x, z). */
  async navTo(x: number, z: number, within = 0.15): Promise<boolean> {
    const cell = 0.2;
    const nx = Math.round((ROOM.maxX - ROOM.minX) / cell);
    const nz = Math.round((ROOM.maxZ - ROOM.minZ) / cell);
    const r = this.player.radius + 0.04;
    const free = (i: number, j: number) => {
      if (i < 0 || j < 0 || i >= nx || j >= nz) return false;
      const px = ROOM.minX + (i + 0.5) * cell;
      const pz = ROOM.minZ + (j + 0.5) * cell;
      if (px < ROOM.minX + r || px > ROOM.maxX - r || pz < ROOM.minZ + r || pz > ROOM.maxZ - r) return false;
      for (const c of this.world.colliders) if (px > c.minX - r && px < c.maxX + r && pz > c.minZ - r && pz < c.maxZ + r) return false;
      return true;
    };
    const toCell = (px: number, pz: number): [number, number] => [Math.floor((px - ROOM.minX) / cell), Math.floor((pz - ROOM.minZ) / cell)];
    const center = (i: number, j: number): [number, number] => [ROOM.minX + (i + 0.5) * cell, ROOM.minZ + (j + 0.5) * cell];
    let [si, sj] = toCell(this.player.x, this.player.z);
    if (!free(si, sj)) {
      let best: [number, number] | null = null;
      for (let d = 1; d < 4 && !best; d++) for (let di = -d; di <= d; di++) for (let dj = -d; dj <= d; dj++) if (!best && free(si + di, sj + dj)) best = [si + di, sj + dj];
      if (best) [si, sj] = best;
    }
    const goal = (i: number, j: number) => {
      const [cx, cz] = center(i, j);
      return Math.hypot(cx - x, cz - z) <= Math.max(within, cell * 0.75);
    };
    const key = (i: number, j: number) => i * 1000 + j;
    const open: [number, number, number][] = [[si, sj, 0]];
    const g = new Map<number, number>([[key(si, sj), 0]]);
    const from = new Map<number, number>();
    let end = -1;
    let guard = 0;
    while (open.length && guard++ < 20000) {
      open.sort((a, b) => a[2] - b[2]);
      const [i, j] = open.shift()!;
      if (goal(i, j)) {
        end = key(i, j);
        break;
      }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = i + di;
        const nj = j + dj;
        if (!free(ni, nj) || (di && dj && (!free(i + di, j) || !free(i, j + dj)))) continue;
        const ng = g.get(key(i, j))! + Math.hypot(di, dj);
        if (ng < (g.get(key(ni, nj)) ?? Infinity)) {
          g.set(key(ni, nj), ng);
          from.set(key(ni, nj), key(i, j));
          const [cx, cz] = center(ni, nj);
          open.push([ni, nj, ng + Math.max(0, Math.hypot(cx - x, cz - z) - within) / cell]);
        }
      }
    }
    if (end < 0) return false;
    const path: [number, number][] = [];
    for (let k: number | undefined = end; k !== undefined; k = from.get(k)) path.unshift(center(Math.floor(k / 1000), k % 1000));
    // keep only turning points
    const pts = path.filter((_, i) => i === path.length - 1 || i % 3 === 2);
    for (const [px, pz] of pts) await this.walkTo(px, pz);
    return Math.hypot(this.player.x - x, this.player.z - z) <= within + 0.3;
  }

  get loud(): boolean {
    return this.store.state.noise >= NOISE_HIGH;
  }
}
