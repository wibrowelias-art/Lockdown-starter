import * as THREE from 'three';
import { AudioEngine } from '../audio/audio';
import { type EndingId, ENDING_IDS, NOISE_LABEL, type SceneId, Store, type StoryEvent, type StoryState } from '../story/state';
import { epilogue, type StageAction } from '../story/endings';
import { UI, type Who } from '../ui/ui';
import { Cancelled, Script, SimClock, Tweens, linear } from './clock';
import { codeScene, doorScene, endingScene, examScene, textsScene, waitingScene } from './director';
import { Input } from './input';
import type { Person, Pose } from './people';
import { Player } from './player';
import { AISLE_X, COLS, DOOR, HUDDLE, PLAYER_DESK, SAFE_Z, SWITCH_POS, World } from './world';

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
}

const FOUND_KEY = 'room214.endings';

export class Game {
  store = new Store();
  clock = new SimClock();
  tweens = new Tweens();
  audio = new AudioEngine();
  world = new World();
  player = new Player();
  camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.03, 60);
  renderer: THREE.WebGLRenderer;
  input: Input;
  ui: UI;
  flags = { eraserAsked: false, theoFrozen: false, theoNoticed: false, endShown: false, control: false };
  breath = { active: false, holding: false, level: 0, wasFull: false, cycles: 0 };
  private script: Script | null = null;
  private movers: Mover[] = [];
  private interactables: Interactable[] = [];
  private raycaster = new THREE.Raycaster();
  private last = performance.now();
  private flashlight = new THREE.SpotLight(0xe6eeff, 0, 14, 0.38, 0.6, 1.2);
  frames = 0;
  private touchApplied = false;

  constructor(
    private canvas: HTMLCanvasElement,
    host: HTMLElement,
    speed = 1,
  ) {
    this.clock.speed = speed;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.world.scene.add(this.camera);
    this.flashlight.position.set(DOOR.x + 0.6, 1.5, DOOR.z);
    this.flashlight.target.position.set(0, 0.8, 0.5);
    this.world.scene.add(this.flashlight, this.flashlight.target);

    this.input = new Input(canvas, {
      onTap: (x, y) => this.tap(x, y),
      onAction: (a) => this.action(a),
      onHold: (down) => {
        if (this.breath.active) this.breath.holding = down;
      },
    });
    this.ui = new UI(host, this.clock, this.input);
    this.ui.onSkip = () => this.skip();
    this.ui.onExit = () => this.dispatch({ type: 'EXIT' });
    this.ui.onMute = (m) => this.audio.setMuted(m);
    this.ui.onBreathe = (down) => {
      if (this.breath.active) this.breath.holding = down;
    };
    this.ui.phoneBtn.addEventListener('click', () => this.action('phone'));
    this.ui.crouchBtn.addEventListener('click', () => this.action('crouch'));
    this.ui.useBtn.addEventListener('click', () => this.action('use'));
    this.ui.phone.onSilence = () => this.phoneSilenced();
    this.ui.phone.onClose = () => this.closePhone();

    this.player.onFootstep = () => {
      this.audio.footstepLocal();
      this.dispatch({ type: 'NOISE', source: 'footstep' });
    };
    this.player.onChairBump = (c) => {
      this.world.bumpChair(c, c.group.position.x - this.player.x, c.group.position.z - this.player.z);
      this.audio.chairScrape();
      this.ui.caption('[a chair scrapes across the floor]', 2.5);
      this.dispatch({ type: 'NOISE', source: 'chairKnock' });
    };

    this.setupInteractables();
    this.store.subscribe((s, prev, e) => this.onState(s, prev, e));
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.player.sitAt(PLAYER_DESK.x, PLAYER_DESK.z + 0.42);
    this.ui.reset();
    this.showTitle();
    requestAnimationFrame(this.frame);
  }

  get touch(): boolean {
    return this.input.usedTouch || window.matchMedia?.('(pointer: coarse)').matches;
  }

  // ------------------------------------------------------------ story glue

  dispatch(e: StoryEvent): StoryState {
    return this.store.dispatch(e);
  }

  private onState(s: StoryState, prev: StoryState, e: StoryEvent): void {
    if (s.noise !== prev.noise) {
      const last = s.noiseLog[s.noiseLog.length - 1];
      this.ui.noise(s.noise, last ? `+ ${NOISE_LABEL[last.source]}` : undefined);
    }
    if (s.scene === 'code' && this.flags.control) this.updateCodeObjectives();
    if (s.scene === 'exam') this.updateExamObjectives();
    if (s.scene !== prev.scene) this.runScene(s.scene, e);
  }

  private runScene(scene: SceneId, e: StoryEvent): void {
    this.script?.cancel();
    this.script = null;
    this.ui.clearChoices();
    this.ui.clearDoorChoice();
    this.ui.prompt(null);
    this.ui.hint(null);
    this.stopBreathing();
    this.ui.phone.clearReplies();
    this.ui.phone.typing(false);
    this.closePhone();
    if (e.type === 'SKIP' || e.type === 'EXIT' || e.type === 'RESTART') this.ui.clearText();
    if (scene === 'title') return this.showTitle();
    if (scene === 'exited') return this.showExitScreen();
    const scripts: Partial<Record<SceneId, (g: Game, s: Script) => Promise<void>>> = {
      exam: examScene,
      code: codeScene,
      texts: textsScene,
      waiting: waitingScene,
      door: doorScene,
      ending: endingScene,
    };
    const fn = scripts[scene];
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
    this.ui.fade(0.35, 0);
    this.ui.showTitle(
      this.foundEndings(),
      () => {
        this.audio.init();
        this.audio.resume();
        this.ui.hideScreen();
        this.ui.fade(1, 0);
        this.dispatch({ type: 'BEGIN' });
      },
      () => this.dispatch({ type: 'EXIT' }),
    );
  }

  private showExitScreen(): void {
    this.hardReset();
    this.audio.stopAll();
    this.ui.setHud(false);
    this.ui.setTopbar(false);
    this.ui.fade(0.6, 0.5);
    const from = this.store.state.exitedFrom;
    const names: Partial<Record<SceneId, string>> = {
      title: 'the content notice',
      exam: 'the exam',
      code: 'the code',
      texts: 'texting Zoe',
      waiting: 'the wait',
      door: 'the door',
      ending: 'the ending',
    };
    this.ui.showExit(from ? (names[from] ?? from) : null, () => this.dispatch({ type: 'RESTART' }));
  }

  showEndingScreen(): void {
    if (this.flags.endShown) return;
    this.flags.endShown = true;
    const st = this.store.state;
    const id = st.ending ?? 'all_clear';
    const found = Array.from(new Set([...this.foundEndings(), id]));
    try {
      localStorage.setItem(FOUND_KEY, JSON.stringify(found));
    } catch {
      /* private mode */
    }
    this.audio.stopAll();
    this.ui.setHud(false);
    this.ui.setTopbar(true);
    this.ui.fade(1, 1);
    this.ui.showEnding(
      id,
      epilogue(st),
      found,
      () => this.dispatch({ type: 'RESTART' }),
      () => this.dispatch({ type: 'EXIT' }),
    );
  }

  private hardReset(): void {
    this.script?.cancel();
    this.script = null;
    this.clearMovers();
    this.tweens.clear();
    this.ui.reset();
    this.flags = { eraserAsked: false, theoFrozen: false, theoNoticed: false, endShown: false, control: false };
    this.breath = { active: false, holding: false, level: 0, wasFull: false, cycles: 0 };
    this.input.reset();
    this.player.canMove = false;
  }

  // ------------------------------------------------------------ helpers used by scenes

  say(who: Who, text: string, opts: { whisper?: boolean; dur?: number } = {}): number {
    const d = this.ui.say(who, text, opts);
    if (who !== 'noah') this.audio.voice(who, d * 0.8, opts.whisper);
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
    return new Promise((resolve) => {
      this.movers.push({ p, path: path.slice(), speed, done: resolve });
    });
  }

  private clearMovers(): void {
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

  everyoneLooksAtDoor(): void {
    for (const p of this.world.people.values()) {
      if (!p.root.visible) continue;
      const dx = DOOR.x - p.root.position.x;
      const dz = DOOR.z - p.root.position.z;
      const world = Math.atan2(-dx, -dz);
      const rel = THREE.MathUtils.euclideanModulo(world - p.root.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      p.headYaw = THREE.MathUtils.clamp(rel, -1.4, 1.4);
      p.headPitch = 0;
    }
  }

  // ---------- scene preparation (idempotent; lets any scene be entered via Skip) ----------

  prepareExam(): void {
    this.clearMovers();
    const w = this.world;
    w.resetPeople();
    w.setLights(true);
    w.setSiren(0);
    w.sirenLevel = 0;
    w.setDoorAngle(0);
    w.door.cover.visible = false;
    w.door.knob.rotation.x = 0;
    w.sheet.reset();
    w.eraser.visible = true;
    w.eraser.position.set(PLAYER_DESK.x + 0.25, 0.748, PLAYER_DESK.z - 0.13);
    w.hands.visible = true;
    this.flashlight.intensity = 0;
    this.player.sitAt(PLAYER_DESK.x, PLAYER_DESK.z + 0.42);
    this.player.canMove = false;
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
    this.ui.objectives(null);
    this.ui.hint(null);
    this.flags.eraserAsked = false;
    const w = this.world;
    w.zoe.root.visible = false;
    w.zoe.setPose('sit', true);
    w.setDoorAngle(0);
    if (!w.lightsOn) w.setLights(true);
  }

  prepareLockdown(): void {
    this.clearMovers();
    this.ui.clearChoices();
    this.ui.objectives(null);
    this.flags.control = false;
    this.flags.theoFrozen = false;
    const w = this.world;
    if (w.lightsOn) {
      w.setLights(false);
      this.audio.fluorescentHum(false);
    }
    w.setDoorAngle(0);
    w.door.cover.visible = true;
    w.door.knob.rotation.x = Math.PI / 2;
    w.zoe.root.visible = false;
    w.hands.visible = false;
    for (const [name, [x, z, f]] of Object.entries(HUDDLE)) {
      const p = w.people.get(name);
      if (!p) continue;
      p.walking = false;
      const far = Math.hypot(p.root.position.x - x, p.root.position.z - z) > 0.25;
      if (far) p.place(x, z, f);
      if (name === 'teacher') {
        p.faceTowards(DOOR.x, DOOR.z);
        p.setPose('crouch', far);
      } else p.setPose('floor', far);
    }
    w.theo.tremble = Math.min(w.theo.tremble, 0.5);
    const pl = this.player;
    if (pl.stance === 'seated' || pl.z < SAFE_Z - 0.3) {
      pl.x = AISLE_X;
      pl.z = 3.35;
      pl.stance = 'crouch';
      pl.yaw = 0;
      pl.pitch = -0.05;
    }
    pl.canMove = false;
    this.ui.phone.silenced = true;
    this.ui.phone.renderRing();
    this.ui.noiseVisible(true);
    this.ui.noise(this.store.state.noise);
    this.ui.setPhoneButton(true);
    this.ui.setMovement(false, this.touch);
    this.ui.setHud(true);
  }

  updateExamObjectives(): void {
    if (this.store.state.scene !== 'exam') return;
    const n = this.store.state.bubbles.length;
    const items = [{ label: `Fill in your answers (${n}/8)`, done: n >= 8, testid: 'obj-bubbles' }];
    if (this.flags.eraserAsked) items.push({ label: 'Pass Zoe your eraser (on your desk)', done: this.store.state.gaveEraser, testid: 'obj-eraser' });
    this.ui.objectives(items);
  }

  updateCodeObjectives(): void {
    const st = this.store.state.steps;
    const items: { label: string; done: boolean; optional?: boolean; testid?: string }[] = [
      { label: 'Get away from the door (back wall)', done: st.awayFromDoor, testid: 'obj-away' },
      { label: this.touch ? 'Get low (Crouch)' : 'Get low (C)', done: st.crouched, testid: 'obj-crouch' },
      { label: 'Lights off (switch by the door)', done: st.lightsOff, testid: 'obj-lights' },
      { label: this.touch ? 'Silence your phone (Phone)' : 'Silence your phone (P)', done: st.phoneSilenced, testid: 'obj-phone' },
    ];
    if (this.flags.theoNoticed || this.store.state.theoHelp.pulledDown)
      items.push({ label: 'Theo is frozen in his seat', done: this.store.state.theoHelp.pulledDown, optional: true, testid: 'obj-theo' });
    this.ui.objectives(items);
  }

  moveClassToBackWall(): void {
    const aisleFor = (x: number) => (x < COLS[0] + 0.1 ? -1.8 : x < COLS[1] + 0.1 ? 0 : x < COLS[2] + 0.1 ? 1.8 : 3.75);
    let i = 0;
    for (const [name, p] of this.world.people) {
      if (!name.startsWith('f')) continue;
      const [hx, hz, hf] = HUDDLE[name];
      const ax = aisleFor(p.root.position.x);
      const z = p.root.position.z;
      this.clock.after(0.2 + (i++ % 6) * 0.25, () => {
        if (this.store.state.scene !== 'code') return;
        p.tremble = 0.5;
        void this.walk(p, [[ax, z], [ax, hz - 0.6], [hx, hz]], 0.95, 'crouch').then(() => {
          if (this.store.state.scene === 'code' || this.store.state.scene === 'texts') {
            p.root.rotation.y = hf;
            p.setPose('floor');
            p.headYaw = 0;
          }
        });
      });
    }
  }

  sendTheoToBackWall(): Promise<void> {
    const t = this.world.theo;
    this.flags.theoFrozen = false;
    t.tremble = 0.6;
    const [hx, hz, hf] = HUDDLE.theo;
    return this.walk(t, [[3.75, t.root.position.z], [3.75, 2.2], [hx, hz]], 1.0, 'crouch').then(() => {
      if (this.store.state.scene === 'code' || this.store.state.scene === 'texts') {
        t.root.rotation.y = hf;
        t.setPose('floor');
      }
    });
  }

  beginLockdownControl(): void {
    this.flags.control = true;
    this.player.canMove = true;
    this.ui.setMovement(true, this.touch);
    this.ui.setPhoneButton(true);
    this.ui.phone.setCanClose(true);
    this.ui.noiseVisible(true);
    this.ui.noise(this.store.state.noise);
    this.updateCodeObjectives();
    this.clock.after(6, () => {
      if (this.store.state.scene === 'code' && !this.store.state.theoHelp.pulledDown) {
        this.flags.theoNoticed = true;
        this.updateCodeObjectives();
      }
    });
  }

  endLockdownControl(): void {
    this.flags.control = false;
    this.player.canMove = false;
    this.player.autoTarget = null;
    this.ui.setMovement(false, this.touch);
    this.ui.objectives(null);
    this.closePhone();
  }

  allowCrouchedMovement(): void {
    this.player.canMove = true;
    this.ui.setMovement(true, this.touch);
  }

  allLockdownStepsDone(): boolean {
    const s = this.store.state.steps;
    return s.awayFromDoor && s.crouched && s.lightsOff && s.phoneSilenced;
  }

  phoneBuzz([from, text]: string[]): void {
    this.audio.phoneBuzz();
    this.ui.phone.notify(from, text);
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
    if (this.store.state.scene === 'code') this.dispatch({ type: 'STEP', step: 'phoneSilenced' });
    this.clock.after(0.9, () => {
      if (this.store.state.scene === 'code') this.closePhone();
    });
  }

  turnLightsOff(): void {
    if (!this.world.lightsOn) return;
    this.world.setLights(false);
    this.audio.lightSwitch();
    this.audio.fluorescentHum(false);
    this.ui.caption('[click. The hum of the lights stops.]', 2.5);
    if (this.store.state.scene === 'code') this.dispatch({ type: 'STEP', step: 'lightsOff' });
  }

  async pullPlayerToBackWall(): Promise<void> {
    this.ui.fade(0.9, 0.4);
    await new Promise<void>((r) => this.clock.after(0.5, r));
    const p = this.player;
    p.x = AISLE_X;
    p.z = 3.35;
    p.stance = 'crouch';
    this.world.hands.visible = false;
    p.lookAt(new THREE.Vector3(DOOR.x, 1, DOOR.z));
    this.ui.fade(0, 0.6);
  }

  openPhone(mode: 'lock' | 'chat', canClose: boolean): void {
    this.ui.phone.setCanClose(canClose);
    this.ui.phone.open(mode);
    this.ui.setPhoneButton(true, false);
  }

  closePhone(): void {
    this.ui.phone.close();
  }

  private togglePhone(): void {
    const scene = this.store.state.scene;
    const ph = this.ui.phone;
    if (scene === 'exam') {
      this.ui.caption("[your phone stays in your pocket. It's a final.]", 2.5);
      return;
    }
    if (!['code', 'texts', 'waiting', 'door'].includes(scene)) return;
    if (ph.isOpen) {
      if (ph.canClose) this.closePhone();
      return;
    }
    if (scene === 'code') this.openPhone('lock', true);
    else if (scene === 'texts') this.openPhone('chat', false);
    else this.openPhone('chat', true);
  }

  startBreathing(): void {
    this.breath = { active: true, holding: false, level: 0, wasFull: false, cycles: 0 };
    this.ui.breathe({ progress: 0, label: 'Hold to breathe in  (0/3)' });
  }

  stopBreathing(): void {
    this.breath.active = false;
    this.breath.holding = false;
    this.ui.breathe(null);
  }

  private updateBreath(dt: number): void {
    const b = this.breath;
    if (!b.active) return;
    const rate = 1 / 2.2;
    b.level = THREE.MathUtils.clamp(b.level + (b.holding ? rate : -rate) * dt, 0, 1);
    if (b.level >= 0.97) b.wasFull = true;
    if (b.wasFull && b.level <= 0.05) {
      b.cycles++;
      b.wasFull = false;
      this.world.theo.tremble = Math.max(0.3, 1.6 - b.cycles * 0.45);
      this.audio.breathing(1.2 - b.cycles * 0.15, Math.max(0.28, 0.6 - b.cycles * 0.1));
    }
    let label: string;
    if (b.holding) label = b.level >= 0.97 ? 'Hold... now let go' : 'Breathe in...';
    else if (b.wasFull) label = 'And out, slowly...';
    else label = b.cycles ? 'Again' : 'Hold to breathe in';
    this.ui.breathe({ progress: b.level, label: `${label}  (${b.cycles}/3)` });
  }

  async walkPlayerToDoor(): Promise<void> {
    const p = this.player;
    p.stance = 'stand';
    const pts: [number, number][] = [
      [3.3, 2.0],
      [3.3, -2.35],
    ];
    for (const [tx, tz] of pts) {
      const sx = p.x;
      const sz = p.z;
      const d = Math.hypot(tx - sx, tz - sz);
      const yaw0 = p.yaw;
      const yaw1 = Math.atan2(-(tx - sx), -(tz - sz));
      const dy = THREE.MathUtils.euclideanModulo(yaw1 - yaw0 + Math.PI, Math.PI * 2) - Math.PI;
      let stepAcc = 0;
      let lastK = 0;
      await this.tweens.run(
        d / 1.6,
        (k) => {
          p.x = sx + (tx - sx) * k;
          p.z = sz + (tz - sz) * k;
          p.yaw = yaw0 + dy * Math.min(1, k * 3);
          p.pitch *= 0.9;
          stepAcc += (k - lastK) * d;
          lastK = k;
          if (stepAcc > 0.7) {
            stepAcc = 0;
            this.audio.footstepLocal();
          }
        },
        linear,
      );
    }
    const target = new THREE.Vector3(DOOR.x, 1.1, DOOR.z + 0.3);
    const yaw0 = p.yaw;
    const pitch0 = p.pitch;
    const look = new Player();
    look.x = p.x;
    look.z = p.z;
    look.eye = 1.62;
    look.stance = 'stand';
    look.lookAt(target);
    await this.tweens.run(0.5, (k) => {
      p.yaw = yaw0 + (THREE.MathUtils.euclideanModulo(look.yaw - yaw0 + Math.PI, Math.PI * 2) - Math.PI) * k;
      p.pitch = pitch0 + (look.pitch - pitch0) * k;
    });
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
        w.door.knob.rotation.x = Math.PI / 2;
        this.player.sway = 4;
        this.clock.after(1, () => (this.player.sway = 0.5));
        return;
      }
      case 'theoRuns': {
        const t = w.theo;
        t.tremble = 0;
        t.setPose('stand');
        void this.walk(t, [[3.2, t.root.position.z - 0.6], [3.7, -2.5], [DOOR.x - 0.3, DOOR.z], [DOOR.x + 1.4, DOOR.z]], 4.6).then(() => {
          t.root.visible = false;
        });
        return;
      }
      case 'policeEnter': {
        const from = w.door.angle;
        (w.hallLight.material as THREE.MeshBasicMaterial).color.set(0xffffff);
        void this.tweens.run(1.2, (k) => w.setDoorAngle(from + (1.35 - from) * k), undefined, w.door);
        await s.wait(0.4);
        void this.tweens.run(1.5, (k) => (this.flashlight.intensity = k * 22));
        return;
      }
      case 'fadeOut':
        this.ui.fade(1, 2.5);
        this.audio.sirens(0, 2.5);
        this.audio.breathing(0);
        this.audio.heartbeat(false);
        return;
    }
  }

  // ------------------------------------------------------------ interaction

  private setupInteractables(): void {
    const w = this.world;
    const scene = () => this.store.state.scene;
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
        id: 'eraser',
        objects: () => [w.eraser],
        range: 1.3,
        enabled: () => scene() === 'exam' && this.flags.eraserAsked && !this.store.state.gaveEraser && w.eraser.visible,
        label: () => 'Pass Zoe your eraser',
        use: () => {
          this.giveEraser();
          return true;
        },
      },
      {
        id: 'switch',
        objects: () => [w.switchPlate],
        range: 1.6,
        enabled: () => scene() === 'code' && this.flags.control && w.lightsOn,
        label: () => 'Turn off the lights',
        use: () => {
          this.turnLightsOff();
          return true;
        },
      },
      {
        id: 'theo',
        objects: () => w.theo.pickables,
        range: 2.0,
        enabled: () => scene() === 'code' && this.flags.control && this.flags.theoFrozen && !this.store.state.theoHelp.pulledDown,
        label: () => 'Get Theo down',
        use: () => {
          this.dispatch({ type: 'HELP_THEO', how: 'pulledDown' });
          this.say('noah', 'Theo. Hey. Get down. Come on.', { whisper: true });
          this.clock.after(1.2, () => this.say('theo', '...Okay. Okay.', { whisper: true }));
          void this.sendTheoToBackWall();
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

  giveEraser(): void {
    const w = this.world;
    this.dispatch({ type: 'GIVE_ERASER' });
    this.audio.rustle();
    const from = w.eraser.position.clone();
    const to = new THREE.Vector3(w.zoe.root.position.x + 0.15, 0.95, w.zoe.root.position.z + 0.25);
    void this.tweens.run(0.6, (k) => {
      w.eraser.position.lerpVectors(from, to, k);
      w.eraser.position.y += Math.sin(k * Math.PI) * 0.15;
    }).then(() => (w.eraser.visible = false));
  }

  private pick(clientX: number, clientY: number): { it: Interactable; hit: THREE.Intersection } | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    let best: { it: Interactable; hit: THREE.Intersection } | null = null;
    for (const it of this.interactables) {
      if (!it.enabled()) continue;
      const hits = this.raycaster.intersectObjects(it.objects(), true);
      const h = hits[0];
      if (h && h.distance <= it.range && (!best || h.distance < best.hit.distance)) best = { it, hit: h };
    }
    return best;
  }

  private centerPick() {
    const r = this.canvas.getBoundingClientRect();
    return this.pick(r.left + r.width / 2, r.top + r.height / 2);
  }

  private tap(x: number, y: number): void {
    if (this.ui.phone.isOpen) return;
    const t = this.pick(x, y);
    if (t) t.it.use(t.hit);
  }

  private action(a: 'crouch' | 'use' | 'phone' | 'escape' | 'mute'): void {
    switch (a) {
      case 'phone':
        this.togglePhone();
        return;
      case 'escape':
        if (this.ui.phone.isOpen && this.ui.phone.canClose) this.closePhone();
        return;
      case 'mute':
        this.audio.setMuted(!this.audio.muted);
        this.ui.setMutedLabel(this.audio.muted);
        return;
      case 'use': {
        const t = this.centerPick();
        if (t) t.it.use(t.hit);
        return;
      }
      case 'crouch': {
        const p = this.player;
        if (!p.canMove) return;
        if (p.stance === 'seated') this.leaveSeat('crouch');
        else p.setStance(p.stance === 'crouch' ? 'stand' : 'crouch');
        return;
      }
    }
  }

  private leaveSeat(stance: 'stand' | 'crouch'): void {
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

  // ------------------------------------------------------------ frame loop

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // keep at least ~68 deg horizontal on tall (portrait) screens
    const minH = THREE.MathUtils.degToRad(68);
    const vFromH = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minH / 2) / aspect));
    this.camera.fov = Math.max(62, Math.min(100, vFromH));
    this.camera.updateProjectionMatrix();
  }

  private frame = (now: number) => {
    requestAnimationFrame(this.frame);
    this.frames++;
    const realDt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const dt = realDt * this.clock.speed;

    const look = this.input.consumeLook();
    const sens = this.input.usedTouch ? 0.0045 : 0.0032;
    this.player.look(look.dx * sens, look.dy * sens);
    const turn = this.input.turnVector();
    if (turn) this.player.look(turn * 1.9 * realDt, 0);

    if (this.input.usedTouch && !this.touchApplied) {
      this.touchApplied = true;
      this.ui.setMovement(this.player.canMove, true);
      if (this.store.state.scene === 'code' && this.flags.control) this.updateCodeObjectives();
    }
    const blocked = this.ui.phone.isOpen || !this.player.canMove;
    const mv = blocked ? { x: 0, y: 0 } : this.input.moveVector();
    if (this.player.stance === 'seated' && this.player.canMove && (mv.x || mv.y)) this.leaveSeat('stand');
    this.player.update(dt, mv, this.world.colliders);

    this.clock.tick(dt);
    this.tweens.update(dt);
    this.updateMovers(dt);
    this.world.update(dt);
    this.updateBreath(dt);
    this.checkSteps();
    this.updateHover();

    this.player.applyTo(this.camera);
    this.renderer.render(this.world.scene, this.camera);
  };

  private checkSteps(): void {
    if (!this.flags.control || this.store.state.scene !== 'code') return;
    const st = this.store.state.steps;
    const p = this.player;
    if (!st.awayFromDoor && p.stance !== 'seated' && p.z > SAFE_Z) this.dispatch({ type: 'STEP', step: 'awayFromDoor' });
    if (!st.crouched && p.stance === 'crouch') this.dispatch({ type: 'STEP', step: 'crouched' });
  }

  private updateHover(): void {
    const ptr = this.input.pointer;
    const fromPointer = ptr.over && !this.input.usedTouch;
    let t: { it: Interactable; hit: THREE.Intersection } | null = null;
    if (!this.ui.phone.isOpen && !this.input.dragging) t = fromPointer ? this.pick(ptr.x, ptr.y) : this.centerPick();
    const label = t ? t.it.label(t.hit) : null;
    this.world.sheet.setHover(t && t.it.id === 'sheet' && t.hit.uv ? this.world.sheet.bubbleAt(t.hit.uv.x, t.hit.uv.y) : null);
    this.canvas.classList.toggle('can-use', !!label && fromPointer);
    this.ui.prompt(label ? `${this.touch ? 'Tap' : fromPointer ? 'Click' : 'E'}: ${label}` : null);
  }

  // ------------------------------------------------------------ test / debug hooks

  targetPos(id: string): THREE.Vector3 | null {
    const w = this.world;
    if (id === 'eraser') return w.eraser.getWorldPosition(new THREE.Vector3());
    if (id === 'switch') return SWITCH_POS.clone();
    if (id === 'theo') return w.theo.head.getWorldPosition(new THREE.Vector3());
    if (id === 'door') return new THREE.Vector3(DOOR.x, 1.0, DOOR.z + 0.35);
    if (id === 'window') return new THREE.Vector3(-4.5, 1.2, -0.6);
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
    return {
      x: r.left + ((v.x + 1) / 2) * r.width,
      y: r.top + ((1 - v.y) / 2) * r.height,
      onScreen: v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1,
    };
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
}
