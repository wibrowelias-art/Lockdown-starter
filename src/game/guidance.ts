// Task guidance: tells the player what to do and where, so nobody has to guess.
//  - a one-line current-task card with distance
//  - a soft pulsing outline on the target (faintly visible through furniture)
//  - a floating key icon above it that fades within 1.2 m into the "Press E" prompt
//  - an off-screen chevron at the screen edge
//  - idle help: after 12 s a harder pulse and a whispered in-world hint, after 25 s a wider outline
// Modes: full (default), minimal (task card only), off (nothing).

import * as THREE from 'three';
import type { Game } from './game';
import type { TaskId } from '../story/state';
import { DOOR, NOAH_WALL_SPOT } from './world';
import type { Who } from '../ui/ui';

export type GuideMode = 'full' | 'minimal' | 'off';
export type GuideKey = 'E' | 'holdE' | 'Space' | 'C' | 'Shift' | 'Tab' | 'click' | 'look' | 'move';
export type GuideKind = 'world' | 'ui' | 'meter' | 'none';

export const GUIDE_LAYER = 3;

export interface GuideTarget {
  task: TaskId;
  /** stable id of what is highlighted (tests use this) */
  id: string;
  kind: GuideKind;
  text: string;
  key?: GuideKey;
  objects?: THREE.Object3D[];
  anchor?: THREE.Vector3;
  ui?: string;
  /** seconds before any marker appears (the ringing phone: the sound is the clue) */
  delay?: number;
  timed?: boolean;
  whisper?: { who: Who; text: string };
}

export interface GuideState {
  mode: GuideMode;
  task: TaskId | null;
  target: string | null;
  kind: GuideKind | null;
  highlight: boolean;
  uiGlow: string | null;
  widened: boolean;
  strong: boolean;
  pointerVisible: boolean;
  pointerAngle: number | null;
  ping: boolean;
  iconVisible: boolean;
  cardVisible: boolean;
  cardText: string;
  distance: number | null;
  markersHidden: boolean;
  dimmed: boolean;
}

const WARM = new THREE.Color(1.0, 0.93, 0.8);
const WALL_ANCHOR = new THREE.Vector3(NOAH_WALL_SPOT.x, 0.3, NOAH_WALL_SPOT.z);

export class Guidance {
  mode: GuideMode = 'full';
  state: GuideState = {
    mode: 'full',
    task: null,
    target: null,
    kind: null,
    highlight: false,
    uiGlow: null,
    widened: false,
    strong: false,
    pointerVisible: false,
    pointerAngle: null,
    ping: false,
    iconVisible: false,
    cardVisible: false,
    cardText: '',
    distance: null,
    markersHidden: false,
    dimmed: false,
  };
  private current: GuideTarget | null = null;
  private since = 0;
  private shown = 0;
  private whispered = new Set<string>();
  private doneCount = -1;
  private lastProgress = 0;
  private t = 0;
  private shells: THREE.Mesh[] = [];
  private xray = new THREE.MeshBasicMaterial({ color: WARM, transparent: true, opacity: 0.1, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  private rim = new THREE.MeshBasicMaterial({ color: WARM, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.BackSide, toneMapped: false });
  private rimFlat = new THREE.MeshBasicMaterial({ color: WARM, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  private keysSeen: Set<string>;
  private v = new THREE.Vector3();
  private box = new THREE.Box3();

  constructor(private g: Game) {
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem('room214.keysSeen') || '[]');
    } catch {
      /* ignore */
    }
    this.keysSeen = new Set(seen);
  }

  setMode(m: GuideMode): void {
    this.mode = m;
    this.state.mode = m;
  }

  reset(): void {
    this.clearShells();
    this.current = null;
    this.whispered.clear();
    this.doneCount = -1;
  }

  // ------------------------------------------------------------ what is the current task?

  /** The next suggested task and its target. Order: urgent first, then nearest. */
  pick(): GuideTarget | null {
    const g = this.g;
    const st = g.store.state;
    const w = g.world;
    const t = st.tasks;
    const p = g.player;
    const ph = g.ui.phone;
    const sceneT = g.clock.time;
    if (g.hold.active) {
      return st.scene === 'exam'
        ? { task: 'holdStillAisle', id: 'meter', kind: 'meter', text: "Hold Space. Don't move. Ms. Okafor is walking past.", key: 'Space' }
        : { task: 'holdStill', id: 'meter', kind: 'meter', text: "Hold Space. Don't move.", key: 'Space' };
    }
    switch (st.scene) {
      case 'exam': {
        if (!t.bubbles) return { task: 'bubbles', id: 'sheet', kind: 'world', text: `Fill in four answers on your sheet (${Math.min(4, st.bubbles.length)}/4).`, key: 'click', objects: [w.sheetMesh] };
        if (!t.zoeBackpack)
          return { task: 'zoeBackpack', id: 'zoeBackpack', kind: 'world', text: "Look left, under Zoe's empty desk.", key: 'look', objects: [w.zoeBackpack], timed: true, whisper: { who: 'noah', text: 'Where is Zoe?' } };
        return null;
      }
      case 'code': {
        if (g.flags.paWindow && !t.lookPA) return { task: 'lookPA', id: 'pa', kind: 'world', text: 'Look up at the PA speaker by the board.', key: 'look', objects: [w.paSpeaker] };
        if (g.flags.dropWindow && !t.dropDown) return { task: 'dropDown', id: 'key:C', kind: 'none', text: 'Get down. Now.', key: 'C' };
        return null;
      }
      case 'lockdown': {
        if (!g.flags.control) return null;
        const el = sceneT - g.flags.lockdownStart;
        const wall: GuideTarget = {
          task: 'wallByDoor',
          id: 'wallSpot',
          kind: 'world',
          text: "Get to the wall beside the door, out of the window's view.",
          key: 'move',
          anchor: WALL_ANCHOR,
          objects: [g.wallMarker],
          timed: true,
          whisper: { who: 'teacher', text: 'Over here. By the wall.' },
        };
        const herPath = Math.hypot(p.x - (DOOR.x - 0.6), p.z - (DOOR.z + 0.5)) < 1.2;
        if (!t.lockAndLights && herPath && el > 2)
          return { task: 'lockAndLights', id: 'teacher', kind: 'world', text: 'Make room. Ms. Okafor needs to get to the door.', key: 'move', objects: [w.teacher.root] };
        if (!t.wallByDoor && el < 8) return wall;
        if (g.flags.ringing && !t.ringingPhone) {
          const pack = w.backpacks.find((b) => b.id === g.flags.ringing)!;
          return { task: 'ringingPhone', id: `pack:${pack.id}`, kind: 'world', text: "A phone is ringing in someone's bag. Follow the sound.", key: 'E', objects: [pack.mesh], delay: 6, timed: true, whisper: { who: 'malik', text: "It's in a bag. Find it." } };
        }
        if (g.phoneHasBuzzed && !t.silencePhone)
          return ph.isOpen
            ? { task: 'silencePhone', id: 'ui:phone-silent', kind: 'ui', text: 'Switch it to silent.', key: 'click', ui: 'phone-silent' }
            : { task: 'silencePhone', id: 'ui:phone-btn', kind: 'ui', text: 'Your phone is buzzing. Silence it.', key: 'Tab', ui: 'phone-btn', timed: true, whisper: { who: 'theo', text: 'Your phone, man.' } };
        const cands: GuideTarget[] = [];
        if (!t.wallByDoor) cands.push(wall);
        if (!t.barricade)
          cands.push({ task: 'barricade', id: 'barricade', kind: 'world', text: 'Slide the spare desk against the door. Hold E, slowly.', key: 'holdE', objects: [w.barricade], timed: true, whisper: { who: 'teacher', text: 'The spare desk. Against the door. Slowly.' } });
        if (!t.coverWindow)
          cands.push(
            g.flags.holdingSheet
              ? { task: 'coverWindow', id: 'doorWindow', kind: 'world', text: 'Cover the window in the door with the sheet.', key: 'E', objects: [w.door.window], timed: true, whisper: { who: 'teacher', text: 'The window in the door. Cover it.' } }
              : { task: 'coverWindow', id: 'spareSheet', kind: 'world', text: 'Take the spare answer sheet from your desk.', key: 'E', objects: [w.spareSheet], timed: true, whisper: { who: 'teacher', text: 'Something to cover the window. Paper.' } },
          );
        if (!t.theoDown)
          cands.push(
            g.flags.theoFollowing
              ? { task: 'theoDown', id: 'wallSpot', kind: 'world', text: 'Bring Theo to the wall beside the door.', key: 'move', anchor: WALL_ANCHOR, objects: [g.wallMarker], timed: true }
              : { task: 'theoDown', id: 'theo', kind: 'world', text: 'Pull Theo down. He is frozen by the lockers.', key: 'E', objects: [w.theo.root], timed: true, whisper: { who: 'ines', text: "Noah. Theo. He's not moving." } },
          );
        if (!t.blinds)
          cands.push({ task: 'blinds', id: 'blinds', kind: 'world', text: 'Close the blinds. The cord hangs by the middle window.', key: 'E', objects: [w.blindsCord], timed: true, whisper: { who: 'teacher', text: 'The blinds, Noah.' } });
        if (!t.silencePhone)
          cands.push(
            ph.isOpen
              ? { task: 'silencePhone', id: 'ui:phone-silent', kind: 'ui', text: 'Switch it to silent.', key: 'click', ui: 'phone-silent' }
              : { task: 'silencePhone', id: 'ui:phone-btn', kind: 'ui', text: 'Silence your phone before it buzzes.', key: 'Tab', ui: 'phone-btn', timed: true },
          );
        if (!cands.length) {
          if (!t.lockAndLights) return { task: 'lockAndLights', id: 'teacher', kind: 'world', text: 'Stay clear. Ms. Okafor is locking the door.', objects: [w.teacher.root] };
          return null;
        }
        // nearest first (UI tasks count as distance 0 only when nothing else is near)
        let best = cands[0];
        let bestD = Infinity;
        for (const c of cands) {
          const a = this.anchorOf(c);
          const d = a ? Math.hypot(a.x - p.x, a.z - p.z) : 3;
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        return best;
      }
      case 'texts': {
        if (g.flags.danger && ph.isOpen && !t.coverGlow) return { task: 'coverGlow', id: 'key:Space', kind: 'none', text: 'Footsteps outside. Hold Space to cover the screen.', key: 'Space' };
        if (!ph.isOpen && g.ui.phoneBadge) return { task: 'zoeReplies', id: 'ui:phone-btn', kind: 'ui', text: 'Your phone lit up. Check it.', key: 'Tab', ui: 'phone-btn' };
        if (ph.isOpen) {
          if (g.ui.hasTestId('reply-ask') && !t.testQuestion) return { task: 'testQuestion', id: 'ui:reply-ask', kind: 'ui', text: 'Ask Zoe exactly which closet she is in.', key: 'click', ui: 'reply-ask' };
          if (g.ui.hasTestId('reply-calm')) return { task: 'zoeReplies', id: 'ui:replies', kind: 'ui', text: 'Answer Zoe.', key: 'click', ui: 'reply-calm' };
          if (!t.textMom) return { task: 'textMom', id: ph.thread === 'mom' ? 'ui:reply-mom' : 'ui:tab-mom', kind: 'ui', text: 'Mom is worried. Text her back (optional).', key: 'click', ui: ph.thread === 'mom' ? 'reply-mom' : 'tab-mom' };
        }
        return null;
      }
      case 'waiting': {
        if (g.breath.active) return { task: 'breatheTheo', id: 'ui:breathe', kind: 'ui', text: 'Breathe with Theo: hold while the dashed ring grows.', key: 'Space', ui: 'breathe-btn', timed: true, whisper: { who: 'teacher', text: 'Breathe with him, Noah.' } };
        if (g.flags.alertOn && !t.schoolAlert)
          return { task: 'schoolAlert', id: 'alert', kind: 'world', text: "Ms. Okafor's phone lit up. Read it over her shoulder.", key: 'E', objects: [w.teacherPhone], timed: true, whisper: { who: 'theo', text: 'Her phone. Look.' } };
        if (g.ui.hasTestId('whisper-stay')) return { task: 'whisper', id: 'ui:whisper', kind: 'ui', text: 'Sam is whispering to you. Answer him.', key: 'click', ui: 'whisper-stay' };
        if (g.flags.stayDownWindow && !t.stayDown) return { task: 'stayDown', id: 'key:none', kind: 'none', text: "Stay down. Don't stand up." };
        return null;
      }
      case 'door': {
        if (g.ui.phoneBadge && !t.readTiming && !ph.isOpen) return { task: 'readTiming', id: 'ui:phone-btn', kind: 'ui', text: 'Zoe texted at 10:52. Read it.', key: 'Tab', ui: 'phone-btn' };
        if (g.ui.hasTestId('door-keep')) return { task: 'decide', id: 'ui:door-choice', kind: 'ui', text: 'What would you do?', key: 'click', ui: 'door-keep' };
        return null;
      }
      default:
        return null;
    }
  }

  private anchorV = new THREE.Vector3();
  private ndcV = new THREE.Vector3();
  private anchorOf(c: GuideTarget): THREE.Vector3 | null {
    if (c.anchor) return c.anchor;
    if (!c.objects?.length) return null;
    this.box.makeEmpty();
    for (const o of c.objects) this.box.expandByObject(o);
    if (this.box.isEmpty()) return null;
    const v = this.anchorV;
    this.box.getCenter(v);
    v.y = this.box.max.y + 0.18;
    return v;
  }

  /** For tests: the target the guidance would use for a task right now. */
  probe(task: TaskId): { kind: GuideKind; hasObjects: boolean } | null {
    const c = this.current;
    if (c && c.task === task) return { kind: c.kind, hasObjects: !!c.objects?.length };
    return null;
  }

  // ------------------------------------------------------------ per frame

  update(dt: number, realDt: number): void {
    const g = this.g;
    this.t += realDt;
    const next = this.pick();
    const changed = (next?.id ?? null) !== (this.current?.id ?? null) || next?.task !== this.current?.task;
    const done = Object.values(g.store.state.tasks).filter(Boolean).length + g.store.state.bubbles.length;
    if (done !== this.doneCount || g.barricadeK !== this.lastProgress) {
      this.doneCount = done;
      this.lastProgress = g.barricadeK;
      this.since = 0;
    }
    if (changed) {
      this.since = 0;
      this.shown = 0;
      this.clearShells();
      this.current = next;
      if (next?.objects?.length && next.kind === 'world') this.buildShells(next.objects);
      if (next?.key) this.maybeKeyHint(next.key);
    }
    this.current = next;
    this.since += dt;
    this.shown += dt;
    const c = this.current;
    const s = this.state;
    const lockdownDark = !g.world.lightsOn;
    s.mode = this.mode;
    s.task = c?.task ?? null;
    s.target = c?.id ?? null;
    s.kind = c?.kind ?? null;
    s.markersHidden = c?.kind === 'meter';
    s.dimmed = lockdownDark;
    s.strong = !!c?.timed && this.since > 12;
    s.widened = !!c?.timed && this.since > 25;
    if (s.strong && c?.whisper && !this.whispered.has(c.task + c.id) && this.mode !== 'off') {
      this.whispered.add(c.task + c.id);
      g.say(c.whisper.who, c.whisper.text, { whisper: true });
    }
    const delayed = !!c?.delay && this.shown < c.delay;
    const full = this.mode === 'full' && !!c && !delayed && !s.markersHidden;

    // card (full + minimal)
    const anchor = c ? this.anchorOf(c) : null;
    const dist = anchor ? Math.hypot(anchor.x - g.player.x, anchor.z - g.player.z) : null;
    s.distance = dist === null ? null : Math.round(dist * 10) / 10;
    s.cardVisible = this.mode !== 'off' && !!c && !g.flags.endShown;
    s.cardText = c ? c.text : '';
    g.ui.guideCard(s.cardVisible ? { text: c!.text, key: c!.key ? this.keyLabel(c!.key) : null, distance: c!.kind === 'world' && dist !== null && !delayed ? s.distance : null, dim: lockdownDark } : null);

    // world outline
    s.highlight = full && c!.kind === 'world' && this.shells.length > 0;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * Math.PI * 2 * 1.5);
    const dim = lockdownDark ? 0.45 : 1;
    const strong = s.strong ? 1.6 : 1;
    this.rim.opacity = s.highlight ? (0.25 + 0.45 * pulse) * strong * dim : 0;
    this.rimFlat.opacity = this.rim.opacity;
    this.xray.opacity = s.highlight ? (0.05 + 0.06 * pulse) * (s.widened ? 2.2 : 1) * dim : 0;
    for (const m of this.shells) {
      m.visible = s.highlight;
      if (m.userData.rim) m.scale.copy(m.userData.baseScale as THREE.Vector3).multiplyScalar(s.widened ? 1.05 : 1);
    }

    // UI glow
    s.uiGlow = full && c!.kind === 'ui' ? c!.ui ?? null : null;
    g.ui.guideGlow(s.uiGlow, s.strong);

    // floating key icon + off-screen chevron
    let iconVisible = false;
    let pointerVisible = false;
    let angle: number | null = null;
    if (full && anchor && c!.kind === 'world') {
      const cam = g.camera;
      this.v.copy(anchor).applyMatrix4(cam.matrixWorldInverse);
      const behind = this.v.z > 0;
      const ndc = this.ndcV.copy(anchor).project(cam);
      const on = !behind && Math.abs(ndc.x) < 0.88 && Math.abs(ndc.y) < 0.85;
      const r = g.renderer.three.domElement.getBoundingClientRect();
      if (on) {
        const near = dist !== null && dist < 1.2;
        const op = near ? 0 : THREE.MathUtils.smoothstep(dist ?? 9, 1.2, 2.0);
        iconVisible = op > 0.05;
        g.ui.guideIcon(iconVisible ? { x: r.left + ((ndc.x + 1) / 2) * r.width, y: r.top + ((1 - ndc.y) / 2) * r.height, label: c!.key ? this.keyLabel(c!.key) : '', opacity: op * (lockdownDark ? 0.6 : 1) } : null);
        g.ui.guidePointer(null);
      } else {
        g.ui.guideIcon(null);
        let ax = this.v.x;
        let ay = this.v.y;
        if (Math.hypot(ax, ay) < 1e-3) ay = -1;
        angle = Math.atan2(ay, ax);
        const fwd = Math.acos(THREE.MathUtils.clamp(-this.v.z / Math.max(1e-6, this.v.length()), -1, 1));
        const op = THREE.MathUtils.smoothstep(fwd, 0.35, 0.9);
        pointerVisible = op > 0.05;
        g.ui.guidePointer(pointerVisible ? { angle, opacity: op * (lockdownDark ? 0.65 : 1), ping: !!c!.delay } : null);
      }
    } else {
      g.ui.guideIcon(null);
      g.ui.guidePointer(null);
    }
    s.iconVisible = iconVisible;
    s.pointerVisible = pointerVisible;
    s.pointerAngle = angle;
    s.ping = pointerVisible && !!c?.delay;
    // the hold ring on the prompt (barricade)
    g.ui.holdRing(c?.key === 'holdE' && full && g.input.holdingUse ? g.barricadeK : null);
  }

  keyLabel(k: GuideKey): string {
    const touch = this.g.touch;
    switch (k) {
      case 'E':
        return touch ? 'Use' : 'E';
      case 'holdE':
        return touch ? 'Hold Use' : 'Hold E';
      case 'Space':
        return touch ? 'Hold' : 'Space';
      case 'C':
        return touch ? 'Crouch' : 'C';
      case 'Tab':
        return touch ? 'Phone' : 'Tab';
      case 'Shift':
        return 'Shift';
      case 'click':
        return touch ? 'Tap' : 'Click';
      case 'look':
        return touch ? 'Look' : 'Look';
      case 'move':
        return touch ? 'Move' : 'WASD';
    }
  }

  /** First use of each control shows a key-cap hint once. */
  private maybeKeyHint(k: GuideKey): void {
    if (this.mode === 'off') return;
    const map: Partial<Record<GuideKey, string>> = {
      E: 'E  Use',
      holdE: 'Hold E  Push, drag',
      Space: 'Space  Hold still, breathe, cover',
      C: 'C  Crouch',
      Tab: 'Tab  Phone',
      move: 'Shift  Hurry (loud)',
    };
    const touchMap: Partial<Record<GuideKey, string>> = { E: 'Use  Use', holdE: 'Hold Use  Push, drag', Space: 'Hold  Hold still', C: 'Crouch', Tab: 'Phone' };
    const text = (this.g.touch ? touchMap : map)[k];
    const id = k === 'move' ? 'Shift' : k;
    if (!text || this.keysSeen.has(id)) return;
    this.keysSeen.add(id);
    try {
      localStorage.setItem('room214.keysSeen', JSON.stringify([...this.keysSeen]));
    } catch {
      /* ignore */
    }
    this.g.ui.keyHint(text);
  }

  // ------------------------------------------------------------ outline shells

  private buildShells(objects: THREE.Object3D[]): void {
    const meshes: THREE.Mesh[] = [];
    for (const o of objects)
      o.traverse((x) => {
        const m = x as THREE.Mesh;
        if (m.isMesh && !m.userData.isHull && !m.userData.guide && m.visible && (m.material as THREE.Material).visible !== false) meshes.push(m);
      });
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    for (const m of meshes) {
      const geo = m.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      geo.boundingBox!.getSize(size);
      geo.boundingBox!.getCenter(center);
      const t = 0.014;
      const sc = (v: number) => 1 + (2 * t) / Math.max(v, 0.02);
      const flat = Math.min(size.x, size.y, size.z) < 0.004;
      const rim = new THREE.Mesh(geo, flat ? this.rimFlat : this.rim);
      if (flat) {
        // a slightly larger copy just behind the plane: reads as a glowing border
        const s2 = (v: number) => (v < 0.004 ? 1 : 1 + 0.05 / Math.max(v, 0.05));
        rim.scale.set(s2(size.x), s2(size.y), s2(size.z));
        rim.position.set(center.x * (1 - rim.scale.x), center.y * (1 - rim.scale.y), center.z * (1 - rim.scale.z));
        if (size.z < 0.004) rim.position.z -= 0.002;
        else if (size.y < 0.004) rim.position.y -= 0.002;
        else rim.position.x -= 0.002;
      } else {
        rim.scale.set(sc(size.x), sc(size.y), sc(size.z));
        rim.position.set(center.x * (1 - rim.scale.x), center.y * (1 - rim.scale.y), center.z * (1 - rim.scale.z));
      }
      rim.userData = { guide: true, rim: true, baseScale: rim.scale.clone() };
      rim.renderOrder = 999;
      const xr = new THREE.Mesh(geo, this.xray);
      xr.userData = { guide: true };
      xr.renderOrder = 998;
      for (const s of [rim, xr]) {
        s.layers.set(GUIDE_LAYER);
        s.raycast = () => {};
        m.add(s);
        this.shells.push(s);
      }
    }
  }

  private clearShells(): void {
    for (const s of this.shells) s.parent?.remove(s);
    this.shells = [];
  }
}

export { DOOR };
