import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Person, type PersonLook } from './people';
import {
  AnswerSheet,
  ClockFace,
  anatomyPoster,
  bulletinTexture,
  coverTexture,
  drawBoard,
  grilleTexture,
  lockdownPoster,
  posterCell,
  signTexture,
  studentWork,
} from './textures';
import { type Library, chalkboard, radialTexture, repeatSet, shaftTexture, smudgeDecal, wiredGlass } from './materials';
import { glow, pbr, shadows, std } from './toon';

// Room 214 (layout from the reference frames). Metres. Students face -z.
// Front wall (z = -4.5): green board, PA speaker, blue door with EXIT sign, clock,
// LOCKDOWN poster. Left wall: windows with blinds. Right wall: bulletin board, lockers,
// bookshelf. Noah sits in the back row; Theo by the lockers; Zoe's seat is empty.
export const ROOM = { minX: -4.5, maxX: 4.5, minZ: -4.5, maxZ: 4.5, h: 3 };
export const COLS = [-2.7, -0.9, 0.9, 2.7];
export const ROWS = [-2.0, -0.2, 1.6];
export const CHAIR_OFFSET = 0.5;
export const DOOR = { x: 2.6, z: ROOM.minZ, w: 1.0, h: 2.15 };
export const SWITCH_POS = new THREE.Vector3(1.8, 1.25, ROOM.minZ + 0.03);
export const PLAYER_DESK = { x: COLS[2], z: ROWS[2] };
export const SEAT = { x: COLS[2], z: ROWS[2] + 0.42 };
export const AISLE_X = (COLS[2] + COLS[3]) / 2;
export const BARRICADE_FROM = new THREE.Vector3(3.75, 0, -2.65);
export const BARRICADE_TO = new THREE.Vector3(DOOR.x, 0, ROOM.minZ + 0.42);
export const PA_POS = new THREE.Vector3(0.9, 2.45, ROOM.minZ + 0.06);
const WIN_Z = [-2.4, 0.1, 2.6];

/** The wall beside the door: close to the front wall, out of the door window's sight line. */
export function inDoorWallZone(x: number, z: number): boolean {
  return z < ROOM.minZ + 1.6 && Math.abs(x - DOOR.x) > 1.0 && x > -0.8;
}

export interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  chair?: Chair;
}

export interface Chair {
  group: THREE.Group;
  collider: Collider;
}

export interface Quality {
  shadows: boolean;
  shadowSize: number;
  rectLights: boolean;
  dust: number;
  sirenShadows: boolean;
}

const LOOKS: Record<string, PersonLook> = {
  ines: { shirt: 0xc4485e, skin: 0x7a4b33, hair: 0x2a1a14, pants: 0x3a3f5c, hairStyle: 'short' },
  jo: { shirt: 0x5f9f72, skin: 0xe2b494, hair: 0x6b4423, pants: 0x34405a, hairStyle: 'short' },
  hana: { shirt: 0xe0b23a, skin: 0xd2a07a, hair: 0x15161c, pants: 0x3a3f5c, hairStyle: 'bun' },
  malik: { shirt: 0x8a62c4, skin: 0x5a3a26, hair: 0x15161c, pants: 0x2f3550, hairStyle: 'curly' },
  sam: { shirt: 0x4a68c0, skin: 0xe8c2a2, hair: 0x7a4f26, pants: 0x2f3550, hairStyle: 'short', scale: 1.1 },
};

const SEATS: Record<string, [number, number]> = {
  jo: [2, 0],
  sam: [3, 0],
  hana: [0, 1],
  ines: [2, 1],
  malik: [3, 1],
  theo: [3, 2],
};

/** Lockdown spots along the door wall, either side of the door, out of the window's sight line. */
export const HUDDLE: Record<string, [number, number, number]> = {
  teacher: [1.5, -4.1, 0],
  ines: [0.9, -4.05, 0.1],
  hana: [0.3, -4.05, 0.05],
  jo: [-0.3, -4.0, 0],
  malik: [3.55, -4.0, -0.05],
  sam: [4.1, -3.95, -0.1],
  theo: [3.75, -3.4, -0.3],
};
export const NOAH_WALL_SPOT = { x: 0.4, z: -3.1 };

export interface Backpack {
  id: string;
  mesh: THREE.Group;
  ringing: boolean;
}

function rbox(w: number, h: number, d: number, r = 0.01, seg = 2): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(geo, m);
}

/** A plane whose bottom edge curls away from the wall (posters). */
function curled(w: number, h: number, curl = 0.012): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h, 1, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (h / 2 - p.getY(i)) / h; // 0 top .. 1 bottom
    p.setZ(i, curl * Math.max(0, t - 0.7) ** 2 * 10 + (p.getX(i) > 0 ? curl * 0.2 * t : 0));
  }
  g.computeVertexNormals();
  return g;
}

export class World {
  scene = new THREE.Scene();
  colliders: Collider[] = [];
  chairs: Chair[] = [];
  people = new Map<string, Person>();
  teacher!: Person;
  theo!: Person;
  sheet = new AnswerSheet();
  sheetMesh!: THREE.Mesh;
  spareSheet!: THREE.Mesh;
  hands = new THREE.Group();
  rightHand = new THREE.Group();
  clock = new ClockFace();
  door = {
    pivot: new THREE.Group(),
    handle: new THREE.Group(),
    cover: new THREE.Mesh(),
    knob: new THREE.Mesh(),
    window: new THREE.Mesh(),
    angle: 0,
  };
  switchPlate = new THREE.Group();
  switchToggle!: THREE.Mesh;
  backpacks: Backpack[] = [];
  zoeBackpack = new THREE.Group();
  barricade = new THREE.Group();
  barricadeCollider!: Collider;
  blindsCord = new THREE.Group();
  paSpeaker = new THREE.Group();
  teacherPhone = new THREE.Group();
  private teacherPhoneScreen!: THREE.Mesh;
  private phoneLight = new THREE.PointLight(0xbcd0ff, 0, 0.9, 2);
  private paRings: THREE.Mesh[] = [];
  private paActive = 0;
  private slats: THREE.Mesh[] = [];
  blindsClosed = 0;
  private feet: THREE.Mesh[] = [];
  feetX: number | null = null;
  lightsOn = true;
  /** 0 = warm exam look, 1 = cold lockdown look (for the colour grade) */
  mood = 0;
  // lights
  private hemi = new THREE.HemisphereLight(0xfff4e0, 0x8a90a8, 0.25);
  private sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
  private panelLights: THREE.Light[] = [];
  private spots: THREE.SpotLight[] = [];
  private hallSpot = new THREE.SpotLight(0xf2f6ff, 0, 9, 0.32, 0.5, 1.2);
  private gapLight: THREE.Light;
  private exitLight = new THREE.PointLight(0x40ff80, 0.5, 2.4, 2);
  private sirenSpots: THREE.SpotLight[] = [];
  private panels: THREE.Mesh[] = [];
  private panelOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.98, 0.93).multiplyScalar(3.0) });
  private panelOff = std(0xd8d6cf, 0.6);
  private outsideMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfe9f5).multiplyScalar(1.5) });
  private shafts: THREE.Mesh[] = [];
  private shaftMat: THREE.MeshBasicMaterial;
  private doorShaftMat: THREE.MeshBasicMaterial;
  private spillMat: THREE.MeshBasicMaterial;
  private dust: THREE.Points | null = null;
  private dustBase: Float32Array | null = null;
  private dustMat: THREE.PointsMaterial | null = null;
  sirenLevel = 0;
  private sirenTarget = 0;
  private rattle = 0;
  handlePress = 0;
  private flicker = 0;
  private t = 0;
  private c1 = new THREE.Color();
  private c2 = new THREE.Color();
  private pink = new THREE.Color(1.0, 0.35, 0.7);
  private blue = new THREE.Color(0.2, 0.4, 1.0);
  private dayOutside = new THREE.Color(0xdfe9f5).multiplyScalar(1.5);
  private nightOutside = new THREE.Color(0x1b2550).multiplyScalar(0.8);

  constructor(
    private lib: Library,
    private q: Quality,
  ) {
    this.useRect = q.rectLights;
    RectAreaLightUniformsLib.init();
    this.scene.background = new THREE.Color(0x10131f);
    this.scene.fog = new THREE.FogExp2(0xd8d4c8, 0.012);
    this.shaftMat = new THREE.MeshBasicMaterial({ map: shaftTexture(), color: 0xfff3dc, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.doorShaftMat = new THREE.MeshBasicMaterial({ map: shaftTexture(), color: 0xe8f0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.spillMat = new THREE.MeshBasicMaterial({ map: radialTexture(), color: 0xc8d4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const gap = new THREE.RectAreaLight(0xf0f4ff, 0, DOOR.w - 0.05, 0.05);
    gap.position.set(DOOR.x, 0.03, ROOM.minZ + 0.05);
    gap.lookAt(DOOR.x, 0.03, 0);
    this.gapLight = gap;
    this.buildRoom();
    this.buildDetails();
    this.buildFurniture();
    this.buildDoor();
    this.buildWindows();
    this.buildPeople();
    this.buildDesktop();
    this.buildLights();
    this.buildAtmosphere();
    this.setLights(true);
  }

  // ---------------- shell ----------------

  private buildRoom(): void {
    const s = this.scene;
    const { minX, maxX, minZ, maxZ, h } = this.roomDims();
    const W = maxX - minX;
    const D = maxZ - minZ;
    const L = this.lib;
    const fs = repeatSet(L.floor, W / 1.2, D / 1.2);
    const floorMat = new THREE.MeshPhysicalMaterial({ map: fs.map, normalMap: fs.normalMap, roughnessMap: fs.roughnessMap, roughness: 1, clearcoat: 0.45, clearcoatRoughness: 0.12, normalScale: new THREE.Vector2(0.6, 0.6) });
    const floor = mesh(new THREE.PlaneGeometry(W, D), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    const cs = repeatSet(L.ceiling, W / 1.2, D / 1.2);
    const ceil = mesh(new THREE.PlaneGeometry(W, D), pbr(cs, {}, 0.8));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = h;
    s.add(ceil);
    const addWall = (w: number, x: number, z: number, ry: number, y0 = 0, y1 = h) => {
      if (w <= 0.001 || y1 - y0 <= 0.001) return;
      const ws = repeatSet(L.wall, w / 1.6, (y1 - y0) / 1.6);
      const m = mesh(new THREE.PlaneGeometry(w, y1 - y0), pbr(ws, {}, 0.7));
      m.position.set(x, (y0 + y1) / 2, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      s.add(m);
    };
    const d0 = DOOR.x - DOOR.w / 2;
    const d1 = DOOR.x + DOOR.w / 2;
    addWall(d0 - minX, (minX + d0) / 2, minZ, 0);
    addWall(maxX - d1, (d1 + maxX) / 2, minZ, 0);
    addWall(DOOR.w, DOOR.x, minZ, 0, DOOR.h, h);
    addWall(W, 0, maxZ, Math.PI);
    addWall(D, maxX, 0, -Math.PI / 2);
    const winW = 1.5;
    let z0 = minZ;
    for (const wz of WIN_Z) {
      addWall(wz - winW / 2 - z0, minX, (z0 + wz - winW / 2) / 2, Math.PI / 2);
      addWall(winW, minX, wz, Math.PI / 2, 0, 0.95);
      addWall(winW, minX, wz, Math.PI / 2, 2.45, h);
      z0 = wz + winW / 2;
    }
    addWall(maxZ - z0, minX, (z0 + maxZ) / 2, Math.PI / 2);
    // rubber cove base
    const base = std(0x4a4640, 0.6);
    for (const [w, x, z, ry] of [
      [d0 - minX, (minX + d0) / 2, minZ + 0.012, 0],
      [maxX - d1, (d1 + maxX) / 2, minZ + 0.012, 0],
      [W, 0, maxZ - 0.012, Math.PI],
      [D, minX + 0.012, 0, Math.PI / 2],
      [D, maxX - 0.012, 0, -Math.PI / 2],
    ] as const) {
      const b = mesh(rbox(w, 0.1, 0.022, 0.006), base);
      b.position.set(x, 0.05, z);
      b.rotation.y = ry;
      b.receiveShadow = true;
      s.add(b);
    }
    // hallway behind the door: bright, empty
    const hall = mesh(new THREE.BoxGeometry(4, h, 2.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf2f6ff).multiplyScalar(1.4), side: THREE.BackSide }));
    hall.position.set(DOOR.x, h / 2, minZ - 1.26);
    s.add(hall);
  }

  private roomDims() {
    return ROOM;
  }

  /** Board, PA, EXIT, clock, posters, bulletin board, vents, outlets, detector, decals. */
  private buildDetails(): void {
    const s = this.scene;
    const { minX, maxX, minZ, maxZ, h } = ROOM;
    const alu = std(0xc2c6cc, 0.38, 1, { normalMap: this.lib.brushed.normalMap });
    // chalkboard
    const cb = chalkboard(drawBoard);
    const board = mesh(new THREE.PlaneGeometry(3.3, 1.25), pbr(cb, {}, 0.6));
    board.position.set(-1.5, 1.6, minZ + 0.035);
    s.add(board);
    for (const [w, hh, x, y] of [
      [3.42, 0.05, -1.5, 2.25],
      [3.42, 0.05, -1.5, 0.95],
      [0.05, 1.35, -3.19, 1.6],
      [0.05, 1.35, 0.19, 1.6],
    ] as const) {
      const f = mesh(rbox(w, hh, 0.05, 0.012), alu);
      f.position.set(x, y, minZ + 0.03);
      f.castShadow = true;
      s.add(f);
    }
    const tray = mesh(rbox(3.3, 0.025, 0.09, 0.008), alu);
    tray.position.set(-1.5, 0.92, minZ + 0.07);
    s.add(tray);
    for (let i = 0; i < 4; i++) {
      const ch = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 8).rotateZ(Math.PI / 2), std(0xf4f2ea, 0.9));
      ch.position.set(-2.6 + i * 0.13, 0.94, minZ + 0.07);
      s.add(ch);
    }
    const eraser = mesh(rbox(0.13, 0.035, 0.05, 0.008), std(0x2a2a2e, 0.9));
    eraser.position.set(-0.4, 0.95, minZ + 0.075);
    s.add(eraser);

    // PA speaker with grille and ripple rings
    const pa = this.paSpeaker;
    pa.position.copy(PA_POS);
    pa.add(mesh(rbox(0.32, 0.32, 0.07, 0.02), std(0xd9d5ca, 0.55)));
    const grille = mesh(new THREE.CircleGeometry(0.11, 32), std(0x9a9890, 0.5, 0.6, { map: grilleTexture() }));
    grille.position.z = 0.036;
    pa.add(grille);
    for (let i = 0; i < 3; i++) {
      const ring = mesh(new THREE.RingGeometry(0.2 + i * 0.09, 0.212 + i * 0.09, 40), glow(0xffb48a, 1.6));
      ring.position.z = 0.03;
      ring.visible = false;
      this.paRings.push(ring);
      pa.add(ring);
    }
    shadows(pa, true, true);
    s.add(pa);

    // EXIT sign with green spill
    const exit = new THREE.Group();
    exit.add(mesh(rbox(0.5, 0.22, 0.07, 0.01), std(0xeeeeea, 0.4)));
    const face = mesh(new THREE.PlaneGeometry(0.44, 0.16), new THREE.MeshBasicMaterial({ map: signTexture('EXIT', '#22a85a', '#ffffff') }));
    (face.material as THREE.MeshBasicMaterial).color.setScalar(3.2);
    face.position.z = 0.036;
    exit.add(face);
    exit.position.set(DOOR.x, DOOR.h + 0.33, minZ + 0.04);
    s.add(exit);
    this.exitLight.position.set(DOOR.x, DOOR.h + 0.25, minZ + 0.3);
    s.add(this.exitLight);

    // clock: rim, face, glass
    const clock = new THREE.Group();
    clock.add(mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.05, 40).rotateX(Math.PI / 2), std(0x1c1d22, 0.5)));
    const cf = mesh(new THREE.CircleGeometry(0.195, 40), std(0xffffff, 0.6, 0, { map: this.clock.texture }));
    cf.position.z = 0.026;
    clock.add(cf);
    const glass = mesh(new THREE.SphereGeometry(0.2, 32, 12, 0, Math.PI * 2, 0, 0.35), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, transparent: true, opacity: 0.18, clearcoat: 1 }));
    glass.rotation.x = Math.PI / 2;
    glass.position.z = -0.17;
    glass.scale.z = 0.4;
    clock.add(glass);
    clock.position.set(3.75, 2.45, minZ + 0.03);
    s.add(clock);

    // posters (with a slight curl)
    const posters: [THREE.Texture, number, number, number, number, number, number][] = [
      [lockdownPoster(), 0.5, 0.75, 3.75, 1.55, minZ + 0.02, 0],
      [posterCell(), 0.6, 0.8, -1.5, 1.7, maxZ - 0.02, Math.PI],
      [anatomyPoster(), 0.6, 0.9, -3.4, 1.7, maxZ - 0.02, Math.PI],
    ];
    for (const [t, w, hh, x, y, z, ry] of posters) {
      const p = mesh(curled(w, hh), std(0xffffff, 0.75, 0, { map: t, side: THREE.DoubleSide }));
      p.position.set(x, y, z);
      p.rotation.y = ry;
      p.receiveShadow = true;
      s.add(p);
    }
    // bulletin board with pinned student work
    const bb = mesh(rbox(2.4, 1.2, 0.025, 0.01), std(0xffffff, 0.85, 0, { map: bulletinTexture() }));
    bb.position.set(maxX - 0.015, 1.65, -1.6);
    bb.rotation.y = -Math.PI / 2;
    s.add(bb);
    for (let i = 0; i < 5; i++) {
      const sw = mesh(curled(0.21, 0.28, 0.01), std(0xffffff, 0.8, 0, { map: studentWork(i), side: THREE.DoubleSide }));
      sw.position.set(i < 3 ? 0.6 + i * 0.32 : -2.6 + (i - 3) * 0.3, 1.7 + (i % 2) * 0.05, maxZ - 0.025);
      sw.rotation.set(0, Math.PI, (i % 2 ? 1 : -1) * 0.03);
      s.add(sw);
    }
    // vent, smoke detector, outlets
    const vent = mesh(rbox(0.6, 0.3, 0.03, 0.01), std(0xe0ddd4, 0.5, 0.3, { map: grilleTexture(true) }));
    vent.position.set(-2.5, 2.7, maxZ - 0.015);
    vent.rotation.y = Math.PI;
    s.add(vent);
    const det = mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.035, 32), std(0xf2f0ea, 0.5));
    det.position.set(0.3, h - 0.018, 0.8);
    s.add(det);
    const ledOn = mesh(new THREE.SphereGeometry(0.004, 8, 6), glow(0x40ff60, 2));
    ledOn.position.set(0.33, h - 0.04, 0.8);
    s.add(ledOn);
    const outletMat = std(0xf0eee6, 0.4);
    for (const [x, z, ry] of [
      [-3.6, minZ + 0.012, 0],
      [0.8, minZ + 0.012, 0],
      [maxX - 0.012, 0.0, -Math.PI / 2],
      [minX + 0.012, -1.2, Math.PI / 2],
      [1.5, maxZ - 0.012, Math.PI],
    ] as const) {
      const o = mesh(rbox(0.07, 0.115, 0.01, 0.004), outletMat);
      o.position.set(x, 0.32, z);
      o.rotation.y = ry;
      s.add(o);
      for (const dy of [-0.025, 0.025]) {
        const slot = mesh(new THREE.PlaneGeometry(0.012, 0.02), std(0x222222, 0.8));
        slot.position.set(0, dy, 0.0055);
        o.add(slot);
      }
    }
    // fingerprints around the light switch, scuffs on the floor
    const fp = mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshStandardMaterial({ map: smudgeDecal(5), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.6 }));
    fp.position.set(SWITCH_POS.x, SWITCH_POS.y, minZ + 0.033);
    s.add(fp);
    for (let i = 0; i < 6; i++) {
      const sc = mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshStandardMaterial({ map: smudgeDecal(10 + i), transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.6 }));
      sc.rotation.x = -Math.PI / 2;
      sc.rotation.z = i;
      sc.position.set([2.4, 1.8, 0, -1.8, 3.6, 1.9][i], 0.002, [-3.4, 0.6, -1.2, 0.8, -2.5, 2.6][i]);
      s.add(sc);
    }
  }

  // ---------------- furniture ----------------

  private addCollider(c: Collider): Collider {
    this.colliders.push(c);
    return c;
  }

  private steel(): THREE.MeshStandardMaterial {
    return std(0x9aa0a8, 0.35, 1, { normalMap: this.lib.brushed.normalMap });
  }

  private deskMesh(): THREE.Group {
    const g = new THREE.Group();
    const steel = this.steel();
    const top = mesh(rbox(0.72, 0.028, 0.52, 0.008), pbr(this.lib.laminate, {}, 0.3));
    top.position.y = 0.735;
    const edge = mesh(rbox(0.725, 0.016, 0.525, 0.006), std(0x3a3a3e, 0.5));
    edge.position.y = 0.716;
    g.add(top, edge);
    for (const dx of [-0.31, 0.31])
      for (const dz of [-0.21, 0.21]) {
        const leg = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 10), steel);
        leg.position.set(dx, 0.35, dz);
        const foot = mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.015, 10), std(0x202022, 0.8));
        foot.position.set(dx, 0.008, dz);
        g.add(leg, foot);
      }
    const rack = mesh(rbox(0.62, 0.012, 0.36, 0.005), std(0x5a5e66, 0.5, 0.6));
    rack.position.set(0, 0.6, -0.02);
    const front = mesh(rbox(0.6, 0.11, 0.012, 0.004), std(0x5a5e66, 0.5, 0.6));
    front.position.set(0, 0.56, -0.2);
    g.add(rack, front);
    shadows(g);
    return g;
  }

  private makeDesk(x: number, z: number): void {
    const d = this.deskMesh();
    d.position.set(x, 0, z);
    this.scene.add(d);
    this.addCollider({ minX: x - 0.36, maxX: x + 0.36, minZ: z - 0.26, maxZ: z + 0.26 });
  }

  private makeChair(x: number, z: number): Chair {
    const g = new THREE.Group();
    const steel = this.steel();
    const shell = std(0x4f6088, 0.42);
    for (const dx of [-0.17, 0.17]) {
      for (const dz of [-0.17, 0.17]) {
        const leg = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.45, 8), steel);
        leg.position.set(dx, 0.225, dz);
        g.add(leg);
      }
      const up = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.42, 8), steel);
      up.position.set(dx, 0.66, 0.19);
      g.add(up);
    }
    const seat = mesh(rbox(0.42, 0.035, 0.4, 0.015), shell);
    seat.position.y = 0.465;
    const back = mesh(rbox(0.42, 0.28, 0.028, 0.014), shell);
    back.position.set(0, 0.78, 0.2);
    back.rotation.x = -0.08;
    g.add(seat, back);
    shadows(g);
    g.position.set(x, 0, z);
    this.scene.add(g);
    const chair: Chair = { group: g, collider: { minX: x - 0.21, maxX: x + 0.21, minZ: z - 0.21, maxZ: z + 0.23 } };
    chair.collider.chair = chair;
    this.addCollider(chair.collider);
    this.chairs.push(chair);
    return chair;
  }

  bumpChair(c: Chair, dx: number, dz: number): void {
    const len = Math.hypot(dx, dz) || 1;
    const mx = (dx / len) * 0.06;
    const mz = (dz / len) * 0.06;
    c.group.position.x += mx;
    c.group.position.z += mz;
    c.group.rotation.y += (Math.random() - 0.5) * 0.3;
    c.collider.minX += mx;
    c.collider.maxX += mx;
    c.collider.minZ += mz;
    c.collider.maxZ += mz;
  }

  private makeBackpack(color: number, x: number, z: number, ry: number): THREE.Group {
    const g = new THREE.Group();
    const nylon = std(color, 0.6, 0, { normalMap: this.lib.nylon.normalMap, roughnessMap: this.lib.nylon.roughnessMap, normalScale: new THREE.Vector2(0.6, 0.6) });
    const body = mesh(rbox(0.3, 0.4, 0.17, 0.07, 4), nylon);
    body.position.y = 0.2;
    const pocket = mesh(rbox(0.22, 0.16, 0.06, 0.03, 3), nylon);
    pocket.position.set(0, 0.13, -0.1);
    const zip = mesh(new THREE.TorusGeometry(0.13, 0.004, 6, 24, Math.PI), std(0x222226, 0.4, 0.6));
    zip.position.set(0, 0.25, -0.085);
    const strapMat = std(0x2a2a2e, 0.7, 0, { normalMap: this.lib.twill.normalMap });
    for (const sx of [-0.08, 0.08]) {
      const strap = mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 16, Math.PI * 0.9), strapMat);
      strap.rotation.y = Math.PI / 2;
      strap.position.set(sx, 0.2, 0.09);
      strap.scale.set(1, 1, 0.4);
      g.add(strap);
    }
    g.add(body, pocket, zip);
    shadows(g);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.scene.add(g);
    return g;
  }

  private buildFurniture(): void {
    for (const z of ROWS)
      for (const x of COLS) {
        this.makeDesk(x, z);
        this.makeChair(x, z + CHAIR_OFFSET);
      }
    // teacher desk: wood with drawers
    const tx = -2.9;
    const tz = -3.5;
    const wood = std(0x8a5f3c, 0.55);
    const td = new THREE.Group();
    const top = mesh(rbox(1.56, 0.04, 0.78, 0.012), std(0xa8764a, 0.45));
    top.position.y = 0.76;
    const body = mesh(rbox(1.5, 0.72, 0.72, 0.012), wood);
    body.position.y = 0.37;
    td.add(top, body);
    for (let i = 0; i < 3; i++) {
      const dr = mesh(rbox(0.42, 0.18, 0.02, 0.006), std(0x9a6a42, 0.5));
      dr.position.set(0.48, 0.6 - i * 0.2, 0.37);
      const pull = mesh(rbox(0.1, 0.012, 0.02, 0.005), std(0xb8bcc2, 0.3, 1));
      pull.position.set(0.48, 0.6 - i * 0.2, 0.39);
      td.add(dr, pull);
    }
    const papers = mesh(rbox(0.3, 0.05, 0.22, 0.004), std(0xf4f2ea, 0.8));
    papers.position.set(-0.35, 0.805, 0);
    const mug = mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.1, 20), std(0x2f6b8a, 0.25));
    mug.position.set(0.5, 0.83, -0.12);
    td.add(papers, mug);
    td.position.set(tx, 0, tz);
    td.rotation.y = Math.PI;
    shadows(td);
    this.scene.add(td);
    this.addCollider({ minX: tx - 0.78, maxX: tx + 0.78, minZ: tz - 0.39, maxZ: tz + 0.39 });

    // gray lockers by Noah and Theo
    const lx = ROOM.maxX - 0.22;
    const lockerMat = pbr(this.lib.locker, { metalness: 0.6 }, 0.6);
    const slot = std(0x2a2e36, 0.7);
    const handle = this.steel();
    for (let i = 0; i < 6; i++) {
      const z = 0.25 + i * 0.42;
      const l = mesh(rbox(0.42, 1.9, 0.4, 0.012), lockerMat);
      l.position.set(lx, 0.95, z);
      shadows(l);
      this.scene.add(l);
      for (let v = 0; v < 4; v++) {
        const s = mesh(new THREE.PlaneGeometry(0.22, 0.012), slot);
        s.rotation.y = -Math.PI / 2;
        s.position.set(lx - 0.211, 1.55 + v * 0.035, z);
        this.scene.add(s);
      }
      const hd = mesh(rbox(0.025, 0.14, 0.03, 0.008), handle);
      hd.position.set(lx - 0.22, 1.05, z + 0.13);
      this.scene.add(hd);
    }
    this.addCollider({ minX: lx - 0.21, maxX: ROOM.maxX, minZ: 0.05, maxZ: 2.75 });

    // bookshelf with books, textbooks and a microscope
    const bx = ROOM.maxX - 0.22;
    const bz = 3.55;
    const shelf = new THREE.Group();
    const sw = std(0x7a5236, 0.6);
    for (const [w, hh, d, x, y, z] of [
      [0.4, 1.8, 0.03, 0, 0.9, -0.6],
      [0.4, 1.8, 0.03, 0, 0.9, 0.6],
      [0.03, 1.8, 1.2, 0.19, 0.9, 0],
    ] as const) {
      const p = mesh(rbox(w, hh, d, 0.006), sw);
      p.position.set(x, y, z);
      shelf.add(p);
    }
    const bookCols = [0x8a2e2e, 0x2e4a8a, 0x3d6b3d, 0x8a7a3a, 0x5a3d6b, 0x2a5a6a];
    for (let sh = 0; sh < 4; sh++) {
      const board = mesh(rbox(0.4, 0.025, 1.2, 0.006), sw);
      board.position.set(0, 0.02 + sh * 0.44, 0);
      shelf.add(board);
      let zz = -0.55;
      for (let i = 0; zz < 0.5; i++) {
        const th = 0.03 + ((i * 37 + sh * 13) % 5) * 0.008;
        const hh = 0.22 + ((i * 17 + sh) % 4) * 0.025;
        const b = mesh(rbox(0.22, hh, th, 0.004), std(bookCols[(i + sh) % 6], 0.7));
        b.position.set(-0.05, 0.035 + sh * 0.44 + hh / 2, zz + th / 2);
        b.rotation.x = i % 7 === 6 ? 0.18 : 0;
        shelf.add(b);
        zz += th + 0.004;
      }
    }
    shelf.position.set(bx, 0, bz);
    shadows(shelf);
    this.scene.add(shelf);
    // microscope + textbooks on top
    const scope = new THREE.Group();
    const black = std(0x1d1e22, 0.35, 0.3);
    const white = std(0xe8e6e0, 0.35);
    const baseS = mesh(rbox(0.14, 0.03, 0.2, 0.01), black);
    const arm = mesh(rbox(0.04, 0.22, 0.05, 0.01), white);
    arm.position.set(0, 0.13, 0.05);
    arm.rotation.x = -0.25;
    const tube = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 16), black);
    tube.position.set(0, 0.2, -0.01);
    tube.rotation.x = 0.35;
    const stage = mesh(rbox(0.1, 0.012, 0.1, 0.004), black);
    stage.position.set(0, 0.09, -0.02);
    scope.add(baseS, arm, tube, stage);
    scope.position.set(bx - 0.05, 1.8, bz - 0.25);
    scope.rotation.y = -Math.PI / 2;
    shadows(scope);
    this.scene.add(scope);
    for (let i = 0; i < 3; i++) {
      const tb = mesh(rbox(0.26, 0.045, 0.2, 0.006), std([0x2e5a8a, 0x8a3a2e, 0x3a7a5a][i], 0.6));
      tb.position.set(bx - 0.05, 1.835 + i * 0.046, bz + 0.25);
      tb.rotation.y = i * 0.12;
      shadows(tb);
      this.scene.add(tb);
    }
    this.addCollider({ minX: bx - 0.21, maxX: ROOM.maxX, minZ: bz - 0.6, maxZ: bz + 0.6 });

    // backpacks (one of them will ring)
    const packs: [string, number, number, number][] = [
      ['malik', 0x2f7f7a, COLS[3] - 0.48, ROWS[1] + 0.45],
      ['hana', 0xd8823a, COLS[0] + 0.48, ROWS[1] + 0.45],
      ['ines', 0x2f3f6a, COLS[2] - 0.48, ROWS[1] + 0.45],
      ['sam', 0x6a6f7a, COLS[3] + 0.48, ROWS[0] + 0.45],
      ['red', 0xb83a30, COLS[1] + 0.42, ROWS[2] + 0.1],
    ];
    for (const [id, color, x, z] of packs) this.backpacks.push({ id, mesh: this.makeBackpack(color, x, z, ((id.length * 37) % 10) / 10 - 0.4), ringing: false });
    // Zoe's purple backpack under her empty desk: white tag, yellow dot
    const zb = this.makeBackpack(0x7a4ac4, COLS[1] - 0.05, ROWS[2] - 0.05, 0.3);
    const tag = mesh(rbox(0.06, 0.09, 0.004, 0.002), std(0xffffff, 0.7));
    tag.position.set(0.11, 0.33, -0.1);
    tag.rotation.z = 0.2;
    const dot = mesh(new THREE.SphereGeometry(0.022, 16, 12), std(0xf2d22e, 0.4));
    dot.position.set(0, 0.2, -0.13);
    zb.add(tag, dot);
    this.zoeBackpack = zb;

    // the spare desk by the door (barricade)
    this.barricade = this.deskMesh();
    this.barricade.position.copy(BARRICADE_FROM);
    this.scene.add(this.barricade);
    this.barricadeCollider = this.addCollider({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 });
    this.setBarricade(0);
  }

  setBarricade(k: number): void {
    const p = this.barricade.position.lerpVectors(BARRICADE_FROM, BARRICADE_TO, k);
    this.barricade.rotation.y = k * 0.05;
    const c = this.barricadeCollider;
    c.minX = p.x - 0.36;
    c.maxX = p.x + 0.36;
    c.minZ = p.z - 0.26;
    c.maxZ = p.z + 0.26;
  }

  // ---------------- door, strip, switch ----------------

  private buildDoor(): void {
    const d = this.door;
    const hingeX = DOOR.x - DOOR.w / 2;
    d.pivot.position.set(hingeX, 0, ROOM.minZ + 0.025);
    const slab = mesh(rbox(DOOR.w - 0.02, DOOR.h, 0.05, 0.01), pbr(this.lib.door, {}, 0.5));
    slab.position.set(DOOR.w / 2, DOOR.h / 2, 0);
    slab.castShadow = true;
    slab.receiveShadow = true;
    d.pivot.add(slab);
    const kick = mesh(rbox(DOOR.w - 0.08, 0.22, 0.004, 0.002), this.steel());
    kick.position.set(DOOR.w / 2, 0.13, 0.027);
    d.pivot.add(kick);
    // tall narrow window: white hall light behind wired glass
    d.window = mesh(new THREE.PlaneGeometry(0.17, 0.85), glow(0xffffff, 4.0));
    d.window.position.set(DOOR.w * 0.62, 1.55, 0.006);
    d.pivot.add(d.window);
    const wires = mesh(new THREE.PlaneGeometry(0.17, 0.85), new THREE.MeshPhysicalMaterial({ map: wiredGlass(), transparent: true, roughness: 0.05, clearcoat: 1, metalness: 0 }));
    wires.position.set(DOOR.w * 0.62, 1.55, 0.026);
    d.pivot.add(wires);
    const wf = std(0x2f4a7a, 0.4, 0.5);
    for (const [w, hh, x, y] of [
      [0.21, 0.02, DOOR.w * 0.62, 1.985],
      [0.21, 0.02, DOOR.w * 0.62, 1.115],
      [0.02, 0.89, DOOR.w * 0.62 - 0.095, 1.55],
      [0.02, 0.89, DOOR.w * 0.62 + 0.095, 1.55],
    ] as const) {
      const f = mesh(rbox(w, hh, 0.012, 0.004), wf);
      f.position.set(x, y, 0.03);
      d.pivot.add(f);
    }
    d.cover = mesh(new THREE.PlaneGeometry(0.22, 0.92), new THREE.MeshBasicMaterial({ map: coverTexture(), color: new THREE.Color(0xfff6e8).multiplyScalar(1.2) }));
    d.cover.position.set(DOOR.w * 0.62, 1.55, 0.034);
    d.cover.visible = false;
    d.pivot.add(d.cover);
    // brushed lever handle
    const brushedM = this.steel();
    d.handle.position.set(DOOR.w - 0.1, 1.0, 0.04);
    d.handle.add(mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.02, 24).rotateX(Math.PI / 2), brushedM));
    const lever = mesh(rbox(0.14, 0.022, 0.022, 0.008), brushedM);
    lever.position.set(-0.06, 0, 0.025);
    d.handle.add(lever);
    shadows(d.handle);
    d.pivot.add(d.handle);
    d.knob = mesh(rbox(0.05, 0.016, 0.016, 0.006), brushedM);
    d.knob.position.set(DOOR.w - 0.1, 1.2, 0.04);
    d.pivot.add(d.knob);
    this.scene.add(d.pivot);
    const fm = std(0x2f4a7a, 0.45, 0.4);
    for (const [w, hh, x, y] of [
      [DOOR.w + 0.14, 0.07, DOOR.x, DOOR.h + 0.035],
      [0.07, DOOR.h, hingeX - 0.035, DOOR.h / 2],
      [0.07, DOOR.h, DOOR.x + DOOR.w / 2 + 0.035, DOOR.h / 2],
    ] as const) {
      const f = mesh(rbox(w, hh, 0.07, 0.01), fm);
      f.position.set(x, y, ROOM.minZ + 0.02);
      f.castShadow = true;
      this.scene.add(f);
    }
    const num = mesh(new THREE.PlaneGeometry(0.22, 0.11), std(0xffffff, 0.5, 0, { map: signTexture('214', '#2f4a80', '#ffffff') }));
    num.position.set(DOOR.x + DOOR.w / 2 + 0.25, 1.65, ROOM.minZ + 0.03);
    this.scene.add(num);

    // the strip of hall light under the door + a soft fan on the floor
    const strip = mesh(new THREE.PlaneGeometry(DOOR.w - 0.06, 0.04), glow(0xffffff, 4.5));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(DOOR.x, 0.004, ROOM.minZ + 0.055);
    this.scene.add(strip);
    const spill = mesh(new THREE.PlaneGeometry(DOOR.w * 1.6, 1.3), this.spillMat);
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(DOOR.x, 0.005, ROOM.minZ + 0.68);
    this.scene.add(spill);
    for (let i = 0; i < 2; i++) {
      const f = mesh(new THREE.PlaneGeometry(0.13, 0.06), new THREE.MeshBasicMaterial({ color: 0x080a12 }));
      f.rotation.x = -Math.PI / 2;
      f.position.set(DOOR.x, 0.006, ROOM.minZ + 0.055);
      f.visible = false;
      this.feet.push(f);
      this.scene.add(f);
    }

    // light switch + plate
    const sp = this.switchPlate;
    sp.position.copy(SWITCH_POS);
    sp.add(mesh(rbox(0.075, 0.12, 0.01, 0.004), std(0xf4f2ea, 0.35)));
    this.switchToggle = mesh(rbox(0.022, 0.034, 0.016, 0.004), std(0xffffff, 0.3));
    this.switchToggle.position.z = 0.01;
    sp.add(this.switchToggle);
    this.scene.add(sp);
  }

  setDoorAngle(a: number): void {
    this.door.angle = a;
    this.door.pivot.rotation.y = -a;
  }

  rattleHandle(sec: number): void {
    this.rattle = Math.max(this.rattle, sec);
  }

  setFeet(x: number | null): void {
    this.feetX = x;
    this.feet.forEach((f, i) => {
      f.visible = x !== null && Math.abs(x - DOOR.x) < DOOR.w / 2 + 0.1;
      if (x !== null) f.position.x = THREE.MathUtils.clamp(x + (i ? 0.1 : -0.1), DOOR.x - 0.45, DOOR.x + 0.45);
    });
  }

  // ---------------- windows / blinds ----------------

  private buildWindows(): void {
    const frame = std(0xc8ccd2, 0.4, 0.8);
    const slatMat = std(0xf2efe6, 0.38, 0.35);
    for (const wz of WIN_Z) {
      const outside = mesh(new THREE.PlaneGeometry(1.6, 1.6), this.outsideMat);
      outside.rotation.y = Math.PI / 2;
      outside.position.set(ROOM.minX - 0.3, 1.7, wz);
      this.scene.add(outside);
      for (const [w, hh, d, y, z] of [
        [0.08, 0.05, 1.56, 2.45, 0],
        [0.08, 0.05, 1.56, 0.95, 0],
        [0.08, 1.55, 0.05, 1.7, -0.76],
        [0.08, 1.55, 0.05, 1.7, 0.76],
        [0.06, 1.5, 0.03, 1.7, 0],
      ] as const) {
        const f = mesh(rbox(w, hh, d, 0.008), frame);
        f.position.set(ROOM.minX + 0.0, y, wz + z);
        f.castShadow = true;
        this.scene.add(f);
      }
      const sill = mesh(rbox(0.22, 0.04, 1.62, 0.01), std(0xd8d4c8, 0.45));
      sill.position.set(ROOM.minX + 0.09, 0.94, wz);
      shadows(sill);
      this.scene.add(sill);
      const geo = rbox(0.075, 0.008, 1.46, 0.003, 1);
      for (let i = 0; i < 17; i++) {
        const slat = mesh(geo, slatMat);
        slat.position.set(ROOM.minX + 0.06, 1.0 + i * 0.087, wz);
        slat.castShadow = true;
        slat.receiveShadow = true;
        this.slats.push(slat);
        this.scene.add(slat);
      }
      // daylight shafts through the blinds
      const shaft = mesh(new THREE.PlaneGeometry(1.3, 2.6), this.shaftMat);
      shaft.position.set(ROOM.minX + 1.1, 1.1, wz);
      shaft.rotation.set(0, Math.PI / 2, -0.75);
      this.shafts.push(shaft);
      this.scene.add(shaft);
    }
    // the cord that closes the blinds (interactable)
    const cord = mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.0, 6), std(0xf3f0e6, 0.6));
    cord.position.y = 1.75;
    const pull = mesh(new THREE.SphereGeometry(0.018, 12, 8), std(0xd9d3c3, 0.4));
    pull.position.y = 1.24;
    this.blindsCord.add(cord, pull);
    this.blindsCord.position.set(ROOM.minX + 0.12, 0, 0.9);
    const hit = mesh(new THREE.BoxGeometry(0.25, 1.4, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1.6;
    this.blindsCord.add(hit);
    this.scene.add(this.blindsCord);
    // a plant on the windowsill
    const plant = new THREE.Group();
    const pot = mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.15, 24), std(0xb0603a, 0.85));
    pot.position.y = 0.075;
    const soil = mesh(new THREE.CircleGeometry(0.085, 20), std(0x3a2a1e, 1));
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.145;
    plant.add(pot, soil);
    const leafMat = std(0x3f6e34, 0.5, 0, { side: THREE.DoubleSide });
    for (let i = 0; i < 9; i++) {
      const leaf = mesh(new THREE.SphereGeometry(0.06, 10, 6), leafMat);
      leaf.scale.set(0.35, 1.4, 0.12);
      const a = (i / 9) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.04, 0.22 + (i % 3) * 0.03, Math.sin(a) * 0.04);
      leaf.rotation.set(Math.sin(a) * 0.6, a, Math.cos(a) * 0.6);
      plant.add(leaf);
    }
    plant.position.set(ROOM.minX + 0.12, 0.96, 0.6);
    shadows(plant);
    this.scene.add(plant);
    this.setBlinds(0);
  }

  setBlinds(k: number): void {
    this.blindsClosed = k;
    this.slats.forEach((s) => (s.rotation.z = 0.55 + k * 0.95));
  }

  // ---------------- people ----------------

  private buildPeople(): void {
    for (const [name, look] of Object.entries(LOOKS)) {
      const p = new Person(name, look);
      shadows(p.root, true, false);
      this.people.set(name, p);
      this.scene.add(p.root);
    }
    this.teacher = new Person('teacher', { shirt: 0xc8962e, skin: 0xd9a888, hair: 0x8a3a20, pants: 0x2f3550, hairStyle: 'bun', glasses: true, scale: 1.05 });
    this.theo = new Person('theo', { shirt: 0xb83030, skin: 0x7a4b33, hair: 0x15161c, pants: 0x2f3f6a, hairStyle: 'curly', bigEyes: true });
    for (const p of [this.teacher, this.theo]) {
      shadows(p.root, true, false);
      this.people.set(p.name, p);
      this.scene.add(p.root);
    }
    const ph = this.teacherPhone;
    ph.add(mesh(rbox(0.075, 0.15, 0.009, 0.008), std(0x1a1b20, 0.25, 0.5)));
    this.teacherPhoneScreen = mesh(new THREE.PlaneGeometry(0.066, 0.135), glow(0xbcd0ff, 0.9));
    this.teacherPhoneScreen.position.z = -0.005;
    this.teacherPhoneScreen.rotation.y = Math.PI;
    this.teacherPhoneScreen.visible = false;
    ph.add(this.teacherPhoneScreen, this.phoneLight);
    this.phoneLight.position.z = -0.1;
    ph.visible = false;
    this.scene.add(ph);
    this.resetPeople();
  }

  seat(p: Person, col: number, row: number): void {
    p.place(COLS[col], ROWS[row] + CHAIR_OFFSET - 0.02, 0);
    p.setPose('sit', true);
    p.walking = false;
    p.headYaw = 0;
    p.headPitch = -0.35;
    p.tremble = 0;
    p.root.visible = true;
  }

  resetPeople(): void {
    for (const [name, [c, r]] of Object.entries(SEATS)) {
      const p = this.people.get(name);
      if (p) this.seat(p, c, r);
    }
    this.teacher.place(-0.6, -3.85, Math.PI);
    this.teacher.setPose('stand', true);
    this.teacher.headPitch = 0;
    this.teacher.root.visible = true;
    this.teacherPhone.visible = false;
  }

  huddle(name: string): void {
    const p = this.people.get(name);
    const spot = HUDDLE[name];
    if (!p || !spot) return;
    p.place(spot[0], spot[1], spot[2]);
    p.walking = false;
    p.setPose(name === 'teacher' ? 'crouch' : 'floor', true);
    if (name === 'teacher') p.faceTowards(DOOR.x + 1, -2);
  }

  setAlert(on: boolean): void {
    const t = this.teacher.root.position;
    this.teacherPhone.visible = on;
    this.teacherPhoneScreen.visible = on;
    this.phoneLight.intensity = on ? 0.25 : 0;
    this.teacherPhone.position.set(t.x + 0.18, 0.62, t.z + 0.3);
    this.teacherPhone.rotation.set(-0.9, 0, 0);
  }

  // ---------------- Noah's desk ----------------

  private buildDesktop(): void {
    const { x, z } = PLAYER_DESK;
    const y = 0.751;
    const paper = (t: THREE.Texture) => std(0xffffff, 0.85, 0, { map: t, polygonOffset: true, polygonOffsetFactor: -1 });
    this.sheetMesh = mesh(new THREE.PlaneGeometry(0.216, 0.279), paper(this.sheet.texture));
    this.sheetMesh.rotation.x = -Math.PI / 2;
    this.sheetMesh.position.set(x + 0.03, y, z + 0.05);
    this.sheetMesh.receiveShadow = true;
    this.sheetMesh.name = 'answerSheet';
    this.scene.add(this.sheetMesh);
    this.spareSheet = mesh(new THREE.PlaneGeometry(0.2, 0.26), paper(coverTexture()));
    this.spareSheet.rotation.set(-Math.PI / 2, 0, -0.25);
    this.spareSheet.position.set(x - 0.22, y - 0.0005, z - 0.06);
    this.spareSheet.receiveShadow = true;
    this.scene.add(this.spareSheet);
    // maroon pencil case (fabric), silver bottle (clearcoat), pencil
    const pc = mesh(rbox(0.2, 0.06, 0.07, 0.03, 4), std(0x7a2433, 0.65, 0, { normalMap: this.lib.nylon.normalMap, roughnessMap: this.lib.nylon.roughnessMap }));
    pc.position.set(x - 0.2, y + 0.03, z - 0.2);
    pc.rotation.y = 0.15;
    const bottle = new THREE.Group();
    const bmat = new THREE.MeshPhysicalMaterial({ color: 0xc9ced8, metalness: 1, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.05, normalMap: this.lib.brushed.normalMap });
    const bodyB = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 32), bmat);
    bodyB.position.y = 0.11;
    const shoulder = mesh(new THREE.SphereGeometry(0.035, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), bmat);
    shoulder.position.y = 0.22;
    const cap = mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.035, 24), std(0x3a3e46, 0.4));
    cap.position.y = 0.255;
    bottle.add(bodyB, shoulder, cap);
    bottle.position.set(x + 0.28, y, z - 0.18);
    shadows(pc);
    shadows(bottle);
    this.scene.add(pc, bottle);

    // first-person hands: gray sleeves (knit), natural hands, yellow pencil
    const skin = std(0xd9a07c, 0.55);
    const sleeve = std(0x6e7280, 0.85, 0, { normalMap: this.lib.knit.normalMap, normalScale: new THREE.Vector2(0.6, 0.6) });
    const makeHand = (side: number) => {
      const h = new THREE.Group();
      const palm = mesh(rbox(0.075, 0.025, 0.085, 0.012, 3), skin);
      palm.position.set(0, 0.016, -0.02);
      h.add(palm);
      for (let i = 0; i < 4; i++) {
        const f = mesh(new THREE.CapsuleGeometry(0.0085, 0.045 - Math.abs(i - 1.5) * 0.006, 4, 8).rotateX(Math.PI / 2), skin);
        f.position.set(-0.027 + i * 0.018, 0.012, -0.085);
        f.rotation.x = -0.25;
        h.add(f);
      }
      const thumb = mesh(new THREE.CapsuleGeometry(0.009, 0.035, 4, 8).rotateX(Math.PI / 2), skin);
      thumb.position.set(0.045 * side, 0.012, -0.035);
      thumb.rotation.y = 0.6 * side;
      h.add(thumb);
      const arm = mesh(new THREE.CapsuleGeometry(0.048, 0.34, 4, 16).rotateX(Math.PI / 2), sleeve);
      arm.position.set(0, 0.04, 0.24);
      arm.rotation.x = -0.15;
      const cuff = mesh(new THREE.TorusGeometry(0.046, 0.008, 8, 20), sleeve);
      cuff.position.set(0, 0.03, 0.065);
      h.add(arm, cuff);
      shadows(h);
      return h;
    };
    const left = makeHand(1);
    left.position.set(x - 0.16, y, z + 0.2);
    left.rotation.y = -0.3;
    this.rightHand = makeHand(-1);
    const pencil = new THREE.Group();
    const wood = mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.16, 6).rotateX(Math.PI / 2), std(0xe8b830, 0.45));
    const tip = mesh(new THREE.ConeGeometry(0.0045, 0.018, 6).rotateX(-Math.PI / 2), std(0xd8b88a, 0.8));
    tip.position.z = -0.089;
    const rubber = mesh(new THREE.CylinderGeometry(0.0047, 0.0047, 0.014, 8).rotateX(Math.PI / 2), std(0xe08a9a, 0.8));
    rubber.position.z = 0.087;
    pencil.add(wood, tip, rubber);
    pencil.position.set(-0.03, 0.035, -0.08);
    pencil.rotation.set(0.5, 0.3, 0);
    this.rightHand.add(pencil);
    this.rightHand.position.set(x + 0.14, y, z + 0.2);
    this.rightHand.rotation.y = 0.3;
    this.hands.add(left, this.rightHand);
    this.scene.add(this.hands);
  }

  handTo(row: number, col: number): THREE.Vector3 {
    const [u, v] = this.sheet.bubbleUV(row, col);
    const p = new THREE.Vector3((u - 0.5) * 0.216, (v - 0.5) * 0.279, 0);
    this.sheetMesh.localToWorld(p);
    return p;
  }

  // ---------------- lights ----------------

  private buildLights(): void {
    const s = this.scene;
    s.add(this.hemi);
    // daylight through the blinds (real slat shadows)
    this.sun.position.set(-11, 6.5, 1.5);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = this.q.shadows;
    const sc = this.sun.shadow.camera;
    sc.left = -6;
    sc.right = 6;
    sc.top = 5;
    sc.bottom = -3;
    sc.near = 2;
    sc.far = 25;
    this.sun.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    s.add(this.sun, this.sun.target);
    // ceiling panels: emissive panels + area lights + two shadow-casting spots
    const pg = new THREE.PlaneGeometry(1.3, 0.55);
    for (const x of [-2.4, 0, 2.4])
      for (const z of [-2.6, 0, 2.6]) {
        const p = mesh(pg, this.panelOn);
        p.rotation.x = Math.PI / 2;
        p.position.set(x, ROOM.h - 0.008, z);
        this.panels.push(p);
        s.add(p);
      }
    for (const x of [-2.4, 0, 2.4]) {
      const r = new THREE.RectAreaLight(0xfff6e8, 4.5, 1.3, 6.2);
      r.position.set(x, ROOM.h - 0.02, 0);
      r.lookAt(x, 0, 0);
      r.userData.rect = true;
      this.panelLights.push(r);
      s.add(r);
    }
    const amb = new THREE.AmbientLight(0xfff4e6, 0.9);
    amb.userData.rect = false;
    this.panelLights.push(amb);
    s.add(amb);
    s.add(this.gapLight);
    for (const x of [-1.5, 1.5]) {
      const sp = new THREE.SpotLight(0xfff4e6, 14, 0, 1.15, 1, 2);
      sp.position.set(x, ROOM.h - 0.05, 0.2);
      sp.target.position.set(x, 0, 0.2);
      sp.castShadow = this.q.shadows;
      sp.shadow.mapSize.set(this.q.shadowSize / 2, this.q.shadowSize / 2);
      sp.shadow.bias = -0.0006;
      sp.shadow.normalBias = 0.02;
      sp.shadow.radius = 4;
      this.spots.push(sp);
      s.add(sp, sp.target);
    }
    // hall light through the door window (the door slab casts the rest)
    this.hallSpot.position.set(DOOR.x + 0.15, 1.95, ROOM.minZ - 2.2);
    this.hallSpot.target.position.set(DOOR.x - 0.3, 0, ROOM.minZ + 2.2);
    this.hallSpot.castShadow = this.q.shadows;
    this.hallSpot.shadow.mapSize.set(512, 512);
    s.add(this.hallSpot, this.hallSpot.target);
    // sirens: coloured spots outside the windows, through the slats
    for (const z of [-1.4, 1.8]) {
      const sp = new THREE.SpotLight(0xff4fa0, 0, 0, 0.55, 0.6, 1.4);
      sp.position.set(ROOM.minX - 6, 2.4, z);
      sp.target.position.set(0, 2.2, z * 0.4);
      sp.castShadow = this.q.sirenShadows;
      sp.shadow.mapSize.set(512, 512);
      this.sirenSpots.push(sp);
      s.add(sp, sp.target);
    }
  }

  private buildAtmosphere(): void {
    // light shaft from the door window into the dark room
    const ds = mesh(new THREE.PlaneGeometry(0.34, 2.5), this.doorShaftMat);
    ds.position.set(DOOR.x + 0.08, 0.95, ROOM.minZ + 1.0);
    ds.rotation.set(-0.95, 0, 0);
    this.scene.add(ds);
    const n = this.q.dust;
    if (n <= 0) return;
    const pos = new Float32Array(n * 3);
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    for (let i = 0; i < n; i++) {
      const door = i % 2 === 0;
      pos[i * 3] = door ? r(DOOR.x - 0.4, DOOR.x + 0.5) : r(ROOM.minX + 0.2, ROOM.minX + 2.6);
      pos[i * 3 + 1] = door ? r(0.05, 1.9) : r(0.9, 2.5);
      pos[i * 3 + 2] = door ? r(ROOM.minZ + 0.2, ROOM.minZ + 2.4) : r(-3.2, 3.4);
    }
    this.dustBase = pos.slice();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sprite = radialTexture();
    sprite.center.set(0.5, 0.5);
    this.dustMat = new THREE.PointsMaterial({ size: 0.012, map: sprite, color: 0xfff4e0, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.dust = new THREE.Points(geo, this.dustMat);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  setLights(on: boolean): void {
    this.lightsOn = on;
    this.hemi.color.set(on ? 0xfff4e0 : 0x3f50c8);
    this.hemi.groundColor.set(on ? 0x8a90a8 : 0x10163a);
    this.hemi.intensity = on ? 0.35 : 0.3;
    this.sun.color.set(on ? 0xfff1dc : 0x8fa2e8);
    this.panelLights.forEach((l) => (l.visible = on && l.userData.rect === this.useRect));
    this.gapLight.visible = this.useRect;
    this.spots.forEach((l) => (l.visible = on));
    this.panels.forEach((p) => (p.material = on ? this.panelOn : this.panelOff));
    this.hallSpot.intensity = on ? 6 : 20;
    (this.gapLight as THREE.RectAreaLight).intensity = on ? 3 : 14;
    this.switchToggle.position.y = on ? 0.02 : -0.02;
    (this.scene.background as THREE.Color).set(on ? 0x10131f : 0x0a0d1c);
    (this.scene.fog as THREE.FogExp2).color.set(on ? 0xd8d4c8 : 0x1a2040);
    this.scene.environmentIntensity = on ? 0.45 : 0.06;
  }

  /** Live quality changes (shadows, area lights, dust) without rebuilding the room. */
  applyQuality(q: { shadows: boolean; shadowSize: number; rectLights: boolean; dust: number; sirenShadows: boolean }): void {
    this.q = { ...this.q, ...q };
    this.sun.castShadow = q.shadows;
    this.spots.forEach((s) => (s.castShadow = q.shadows));
    this.hallSpot.castShadow = q.shadows;
    this.sirenSpots.forEach((s) => (s.castShadow = q.shadows && q.sirenShadows));
    this.useRect = q.rectLights;
    this.setLights(this.lightsOn);
    if (this.dust) this.dust.geometry.setDrawRange(0, q.dust);
  }

  private useRect = true;

  /** Start-up flicker of the fluorescent panels (exam start). */
  flickerPanels(sec: number): void {
    this.flicker = sec;
  }

  setSiren(level: number): void {
    this.sirenTarget = level;
  }

  setPA(sec: number): void {
    this.paActive = Math.max(this.paActive, sec);
  }

  // ---------------- per frame (no allocations) ----------------

  update(dt: number): void {
    this.t += dt;
    for (const p of this.people.values()) p.update(dt);
    this.mood += ((this.lightsOn ? 0 : 1) - this.mood) * Math.min(1, dt * 0.8);
    // fluorescent flicker
    if (this.flicker > 0) {
      this.flicker = Math.max(0, this.flicker - dt);
      const on = this.flicker <= 0 || Math.sin(this.t * 53) + Math.sin(this.t * 31) > -0.3;
      this.panelLights.forEach((l) => (l.visible = this.lightsOn && on && l.userData.rect === this.useRect));
      this.panels.forEach((p) => (p.material = this.lightsOn && on ? this.panelOn : this.panelOff));
    }
    // daylight: dimmer as the blinds close, colder when the lights are out
    const open = 1 - this.blindsClosed * 0.85;
    this.sun.intensity = (this.lightsOn ? 1.8 : 0.5) * open;
    this.shaftMat.opacity = (this.lightsOn ? 0.045 : 0.02) * open;
    this.doorShaftMat.opacity = this.lightsOn ? 0.0 : 0.1;
    this.spillMat.opacity = this.lightsOn ? 0.1 : 0.42;
    this.exitLight.intensity = this.lightsOn ? 0.2 : 0.7;
    // sirens
    this.sirenLevel += (this.sirenTarget - this.sirenLevel) * Math.min(1, dt * 0.6);
    const lvl = this.sirenLevel;
    const ph = Math.sin(this.t * 4.2);
    const pk = Math.max(0, ph) ** 2;
    const bl = Math.max(0, -ph) ** 2;
    this.c1.copy(this.pink).multiplyScalar(pk).add(this.c2.copy(this.blue).multiplyScalar(bl));
    this.sirenSpots.forEach((sp, i) => {
      sp.color.copy(this.c1);
      sp.intensity = lvl * (i ? bl + pk * 0.4 : pk + bl * 0.4) * 300 * (1 - this.blindsClosed * 0.5);
    });
    this.c2.copy(this.lightsOn ? this.dayOutside : this.nightOutside).multiplyScalar(open);
    this.outsideMat.color.copy(this.c2).lerp(this.c1.multiplyScalar(2.8), Math.min(0.5, lvl * (pk + bl)));
    // handle: rattle, or a slow press
    if (this.rattle > 0) {
      this.rattle = Math.max(0, this.rattle - dt);
      this.door.handle.rotation.z = Math.sin(this.t * 55) * 0.3 * Math.min(1, this.rattle * 3) - 0.15;
    } else this.door.handle.rotation.z += (-this.handlePress * 0.75 - this.door.handle.rotation.z) * Math.min(1, dt * 6);
    // PA rings
    this.paActive = Math.max(0, this.paActive - dt);
    this.paRings.forEach((r, i) => {
      r.visible = this.paActive > 0;
      r.scale.setScalar(((this.t * 1.4 + i / 3) % 1) * 0.6 + 0.8);
    });
    // dust motes drift in the light (in place, no allocation)
    if (this.dust && this.dustBase) {
      const a = this.dust.geometry.attributes.position as THREE.BufferAttribute;
      const arr = a.array as Float32Array;
      const b = this.dustBase;
      const t = this.t;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = b[i] + Math.sin(t * 0.13 + i) * 0.06;
        arr[i + 1] = b[i + 1] + Math.sin(t * 0.09 + i * 0.7) * 0.08;
        arr[i + 2] = b[i + 2] + Math.cos(t * 0.11 + i * 1.3) * 0.06;
      }
      a.needsUpdate = true;
      this.dustMat!.opacity = this.lightsOn ? 0.35 : 0.55;
    }
  }
}
