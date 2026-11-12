import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Person, type PersonLook } from './people';
import {
  AnswerSheet,
  ClockFace,
  boardTexture,
  bulletinTexture,
  coverTexture,
  floorTexture,
  lockdownPoster,
  panelTexture,
  posterCell,
  signTexture,
  stripesTexture,
} from './textures';
import { glow, gradientMap, outline, toon } from './toon';

// Room 214 (v2 layout, from the reference frames). Metres. Students face -z.
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

function box(w: number, h: number, d: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(w, h, d);
}
function at<T extends THREE.BufferGeometry>(g: T, x: number, y: number, z: number): T {
  g.translate(x, y, z);
  return g;
}
function mesh(geo: THREE.BufferGeometry, m: number | THREE.Material): THREE.Mesh {
  return new THREE.Mesh(geo, typeof m === 'number' ? toon(m) : m);
}

const LOOKS: Record<string, PersonLook> = {
  ines: { shirt: 0xd9475f, skin: 0x7a4b33, hair: 0x2a1a14, pants: 0x3a3f5c, hairStyle: 'short' },
  jo: { shirt: 0x5fbf7a, skin: 0xe8b894, hair: 0x6b4423, pants: 0x34405a, hairStyle: 'short' },
  hana: { shirt: 0xf2c230, skin: 0xd9a67a, hair: 0x15161c, pants: 0x3a3f5c, hairStyle: 'bun' },
  malik: { shirt: 0x9a6ad6, skin: 0x5a3a26, hair: 0x15161c, pants: 0x2f3550, hairStyle: 'curly' },
  sam: { shirt: 0x4a6fd1, skin: 0xf0c8a8, hair: 0x8a5a2a, pants: 0x2f3550, hairStyle: 'short', scale: 1.1 },
};

/** Seat plan [col, row]. Zoe's seat (col 1, row 2) is empty; her backpack is under it. */
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
/** Where Noah ends up if Ms. Okafor has to pull him over. */
export const NOAH_WALL_SPOT = { x: 0.95, z: -3.0 };

export interface Backpack {
  id: string;
  mesh: THREE.Group;
  ringing: boolean;
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
  private paRings: THREE.Mesh[] = [];
  private paActive = 0;
  private slats: THREE.Mesh[] = [];
  blindsClosed = 0;
  private feet: THREE.Mesh[] = [];
  feetX: number | null = null;
  lightsOn = true;
  private hemi = new THREE.HemisphereLight(0xfff4e0, 0x8a90a8, 2.2);
  private sun = new THREE.DirectionalLight(0xfff0dc, 1.3);
  private doorLight = new THREE.PointLight(0xe8f0ff, 0, 3.2, 2);
  private panels: THREE.Mesh[] = [];
  private panelOn: THREE.MeshBasicMaterial;
  private panelOff = new THREE.MeshBasicMaterial({ color: 0x4a5490 });
  private windowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfeaf5).multiplyScalar(1.4) });
  private stripes: THREE.Mesh[] = [];
  private stripeMat: THREE.MeshBasicMaterial;
  private sirenLight = new THREE.PointLight(0xff4fa0, 0, 10, 1.4);
  sirenLevel = 0;
  private sirenTarget = 0;
  private rattle = 0;
  /** 0..1 how far the lever is pressed (slow press during hold-still beats) */
  handlePress = 0;
  private t = 0;

  constructor() {
    this.scene.background = new THREE.Color(0x10131f);
    this.panelOn = new THREE.MeshBasicMaterial({ map: panelTexture() });
    this.stripeMat = new THREE.MeshBasicMaterial({
      map: stripesTexture(),
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.buildRoom();
    this.buildFurniture();
    this.buildDoor();
    this.buildWindows();
    this.buildPeople();
    this.buildDesktop();
    this.buildLights();
    this.setLights(true);
  }

  // ---------------- shell ----------------

  private buildRoom(): void {
    const s = this.scene;
    const { minX, maxX, minZ, maxZ, h } = ROOM;
    const W = maxX - minX;
    const D = maxZ - minZ;
    const floor = mesh(new THREE.PlaneGeometry(W, D), toon(0x8f9bb5, floorTexture()));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    const ceil = mesh(new THREE.PlaneGeometry(W, D), 0xd9d3c3);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = h;
    s.add(ceil);
    const wall = 0xeee2c8;
    const addWall = (w: number, x: number, z: number, ry: number, y0 = 0, y1 = h) => {
      if (w <= 0.001 || y1 - y0 <= 0.001) return;
      const m = mesh(new THREE.PlaneGeometry(w, y1 - y0), wall);
      m.position.set(x, (y0 + y1) / 2, z);
      m.rotation.y = ry;
      s.add(m);
    };
    // front wall with door opening
    const d0 = DOOR.x - DOOR.w / 2;
    const d1 = DOOR.x + DOOR.w / 2;
    addWall(d0 - minX, (minX + d0) / 2, minZ, 0);
    addWall(maxX - d1, (d1 + maxX) / 2, minZ, 0);
    addWall(DOOR.w, DOOR.x, minZ, 0, DOOR.h, h);
    addWall(W, 0, maxZ, Math.PI);
    addWall(D, maxX, 0, -Math.PI / 2);
    // left wall with three windows
    const winZ = [-2.4, 0.1, 2.6];
    const winW = 1.5;
    let z0 = minZ;
    for (const wz of winZ) {
      addWall(wz - winW / 2 - z0, minX, (z0 + wz - winW / 2) / 2, Math.PI / 2);
      addWall(winW, minX, wz, Math.PI / 2, 0, 0.95);
      addWall(winW, minX, wz, Math.PI / 2, 2.45, h);
      z0 = wz + winW / 2;
    }
    addWall(maxZ - z0, minX, (z0 + maxZ) / 2, Math.PI / 2);
    // skirting, so the floor line reads
    for (const [w, x, z, ry] of [
      [W, 0, minZ + 0.01, 0],
      [W, 0, maxZ - 0.01, Math.PI],
      [D, minX + 0.01, 0, Math.PI / 2],
      [D, maxX - 0.01, 0, -Math.PI / 2],
    ] as const) {
      const sk = mesh(new THREE.PlaneGeometry(w, 0.1), 0x6a6f86);
      sk.position.set(x, 0.05, z);
      sk.rotation.y = ry;
      s.add(sk);
    }

    // hallway behind the door: bright, empty
    const hall = mesh(new THREE.BoxGeometry(4, h, 2.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf2f6ff).multiplyScalar(1.6), side: THREE.BackSide }));
    hall.position.set(DOOR.x, h / 2, minZ - 1.25);
    hall.userData.noOutline = true;
    s.add(hall);

    // board, PA speaker, EXIT, clock, LOCKDOWN poster
    const board = mesh(new THREE.PlaneGeometry(3.3, 1.25), new THREE.MeshToonMaterial({ map: boardTexture(), gradientMap: gradientMap() }));
    board.position.set(-1.5, 1.6, minZ + 0.05);
    s.add(board);
    s.add(mesh(at(box(3.45, 1.4, 0.04), -1.5, 1.6, minZ + 0.01), 0xb9b3a4));
    s.add(mesh(at(box(3.3, 0.05, 0.1), -1.5, 0.95, minZ + 0.05), 0xb9b3a4));

    const pa = this.paSpeaker;
    pa.position.copy(PA_POS);
    pa.add(mesh(box(0.32, 0.32, 0.08), 0xc9c4b6));
    const grille = mesh(new THREE.CircleGeometry(0.1, 18), 0x4a4a52);
    grille.position.z = 0.041;
    pa.add(grille);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.2 + i * 0.09, 0.225 + i * 0.09, 32), glow(0xff8a5c, 2.2));
      ring.position.z = 0.03;
      ring.visible = false;
      this.paRings.push(ring);
      pa.add(ring);
    }
    s.add(pa);

    const exit = new THREE.Mesh(at(box(0.48, 0.2, 0.06), DOOR.x, DOOR.h + 0.33, minZ + 0.04), new THREE.MeshBasicMaterial({ map: signTexture('EXIT', '#2fa865', '#ffffff') }));
    (exit.material as THREE.MeshBasicMaterial).color.multiplyScalar(1.6);
    s.add(exit);
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), new THREE.MeshBasicMaterial({ map: this.clock.texture }));
    clock.position.set(3.75, 2.45, minZ + 0.03);
    s.add(clock);
    const poster = mesh(new THREE.PlaneGeometry(0.5, 0.75), new THREE.MeshToonMaterial({ map: lockdownPoster(), gradientMap: gradientMap() }));
    poster.position.set(3.75, 1.55, minZ + 0.03);
    s.add(poster);

    // right wall: colourful bulletin board
    const bb = mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshToonMaterial({ map: bulletinTexture(), gradientMap: gradientMap() }));
    bb.position.set(maxX - 0.03, 1.65, -1.6);
    bb.rotation.y = -Math.PI / 2;
    s.add(bb);
    // back wall poster
    const cell = mesh(new THREE.PlaneGeometry(0.6, 0.8), new THREE.MeshToonMaterial({ map: posterCell(), gradientMap: gradientMap() }));
    cell.position.set(-1.5, 1.7, maxZ - 0.03);
    cell.rotation.y = Math.PI;
    s.add(cell);
  }

  // ---------------- furniture ----------------

  private addCollider(c: Collider): Collider {
    this.colliders.push(c);
    return c;
  }

  private deskMesh(): THREE.Group {
    const g = new THREE.Group();
    const legs: THREE.BufferGeometry[] = [];
    for (const dx of [-0.31, 0.31]) for (const dz of [-0.21, 0.21]) legs.push(at(box(0.04, 0.7, 0.04), dx, 0.35, dz));
    legs.push(at(box(0.62, 0.02, 0.36), 0, 0.58, -0.02));
    g.add(mesh(mergeGeometries(legs), 0x8f96a8));
    g.add(mesh(at(box(0.72, 0.04, 0.52), 0, 0.72, 0), 0xd9a86c));
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
    const legs: THREE.BufferGeometry[] = [];
    for (const dx of [-0.17, 0.17]) for (const dz of [-0.17, 0.17]) legs.push(at(box(0.035, 0.45, 0.035), dx, 0.225, dz));
    g.add(mesh(mergeGeometries(legs), 0x8f96a8));
    g.add(mesh(at(box(0.42, 0.05, 0.4), 0, 0.46, 0), 0x5b6e96));
    g.add(mesh(at(box(0.42, 0.34, 0.05), 0, 0.78, 0.2), 0x5b6e96));
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
    const body = mesh(new THREE.CapsuleGeometry(0.15, 0.16, 4, 10), color);
    body.scale.z = 0.6;
    body.position.y = 0.24;
    g.add(body);
    const pocket = mesh(new THREE.CapsuleGeometry(0.09, 0.04, 4, 8), color);
    pocket.scale.z = 0.5;
    pocket.position.set(0, 0.17, -0.09);
    g.add(pocket);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    outline(g, 0.008);
    this.scene.add(g);
    return g;
  }

  private buildFurniture(): void {
    for (const z of ROWS)
      for (const x of COLS) {
        this.makeDesk(x, z);
        this.makeChair(x, z + CHAIR_OFFSET);
      }
    // teacher desk
    const tx = -2.9;
    const tz = -3.5;
    this.scene.add(mesh(at(box(1.5, 0.74, 0.72), tx, 0.37, tz), 0xa8794d));
    this.scene.add(mesh(at(box(1.56, 0.05, 0.78), tx, 0.765, tz), 0xc48f5c));
    this.scene.add(mesh(at(box(0.32, 0.12, 0.24), tx - 0.4, 0.85, tz), 0xfbfaf5));
    this.addCollider({ minX: tx - 0.78, maxX: tx + 0.78, minZ: tz - 0.39, maxZ: tz + 0.39 });

    // gray lockers along the right wall by Noah and Theo
    const lx = ROOM.maxX - 0.22;
    for (let i = 0; i < 6; i++) {
      const z = 0.25 + i * 0.42;
      this.scene.add(mesh(at(box(0.42, 1.9, 0.4), lx, 0.95, z), 0xa3abba));
      for (let v = 0; v < 3; v++) this.scene.add(mesh(at(box(0.01, 0.025, 0.22), lx - 0.215, 1.6 + v * 0.06, z), 0x6a7286));
      this.scene.add(mesh(at(box(0.02, 0.12, 0.03), lx - 0.215, 1.05, z + 0.13), 0x5a6276));
    }
    this.addCollider({ minX: lx - 0.21, maxX: ROOM.maxX, minZ: 0.05, maxZ: 2.75 });
    // bookshelf in the back-right corner
    const bx = ROOM.maxX - 0.22;
    const bz = 3.55;
    this.scene.add(mesh(at(box(0.42, 1.8, 1.2), bx, 0.9, bz), 0x8a5a3a));
    const bookCols = [0xd63a3a, 0x3a6ad6, 0x5fbf7a, 0xf2c230, 0x9a6ad6];
    for (let sh = 0; sh < 4; sh++)
      for (let i = 0; i < 8; i++) {
        const hh = 0.22 + Math.random() * 0.08;
        this.scene.add(mesh(at(box(0.25, hh, 0.1), bx - 0.07, 0.12 + sh * 0.43 + hh / 2, bz - 0.5 + i * 0.135), bookCols[(i + sh) % 5]));
      }
    this.addCollider({ minX: bx - 0.21, maxX: ROOM.maxX, minZ: bz - 0.6, maxZ: bz + 0.6 });

    // backpacks (one of them will ring)
    const packs: [string, number, number, number][] = [
      ['malik', 0x2f8f8a, COLS[3] - 0.48, ROWS[1] + 0.45],
      ['hana', 0xf28c3a, COLS[0] + 0.48, ROWS[1] + 0.45],
      ['ines', 0x2f3f7a, COLS[2] - 0.48, ROWS[1] + 0.45],
      ['sam', 0x7a7f8a, COLS[3] + 0.48, ROWS[0] + 0.45],
      ['red', 0xd94a3a, COLS[1] + 0.42, ROWS[2] + 0.1],
    ];
    for (const [id, color, x, z] of packs) {
      this.backpacks.push({ id, mesh: this.makeBackpack(color, x, z, (Math.random() - 0.5) * 0.8), ringing: false });
    }
    // Zoe's purple backpack under her empty desk: white tag, yellow dot
    const zb = this.makeBackpack(0x8a4fd6, COLS[1] - 0.05, ROWS[2] - 0.05, 0.3);
    const tag = mesh(at(box(0.07, 0.1, 0.01), 0.1, 0.32, -0.1), 0xffffff);
    const dot = mesh(new THREE.SphereGeometry(0.025, 10, 8), 0xf2d22e);
    dot.position.set(0, 0.2, -0.12);
    zb.add(tag, dot);
    this.zoeBackpack = zb;

    // the spare desk by the door (barricade)
    this.barricade = this.deskMesh();
    this.barricade.position.copy(BARRICADE_FROM);
    this.scene.add(this.barricade);
    this.barricadeCollider = this.addCollider({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 });
    this.setBarricade(0);
  }

  /** 0 = by the wall, 1 = pushed against the door. */
  setBarricade(k: number): void {
    const p = new THREE.Vector3().lerpVectors(BARRICADE_FROM, BARRICADE_TO, k);
    this.barricade.position.copy(p);
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
    d.pivot.add(mesh(at(box(DOOR.w - 0.02, DOOR.h, 0.05), DOOR.w / 2, DOOR.h / 2, 0), 0x4f74b8));
    // tall narrow window: pure white hall light (blooms)
    d.window = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.85), glow(0xffffff, 2.2));
    d.window.position.set(DOOR.w * 0.62, 1.55, 0.027);
    d.pivot.add(d.window);
    d.cover = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.92), new THREE.MeshBasicMaterial({ map: coverTexture(), color: new THREE.Color(0xfff6e8).multiplyScalar(1.5) }));
    d.cover.position.set(DOOR.w * 0.62, 1.55, 0.03);
    d.cover.visible = false;
    d.pivot.add(d.cover);
    d.handle.position.set(DOOR.w - 0.1, 1.0, 0.04);
    d.handle.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10).rotateX(Math.PI / 2), 0xd9d9d9));
    d.handle.add(mesh(at(box(0.14, 0.03, 0.03), -0.06, 0, 0.02), 0xe6e6e6));
    d.pivot.add(d.handle);
    d.knob = mesh(at(box(0.05, 0.02, 0.02), 0, 0, 0), 0xd9d9d9);
    d.knob.position.set(DOOR.w - 0.1, 1.2, 0.04);
    d.pivot.add(d.knob);
    this.scene.add(d.pivot);
    const fm = 0x2f4a80;
    this.scene.add(mesh(at(box(DOOR.w + 0.14, 0.07, 0.07), DOOR.x, DOOR.h + 0.035, ROOM.minZ + 0.02), fm));
    this.scene.add(mesh(at(box(0.07, DOOR.h, 0.07), hingeX - 0.035, DOOR.h / 2, ROOM.minZ + 0.02), fm));
    this.scene.add(mesh(at(box(0.07, DOOR.h, 0.07), DOOR.x + DOOR.w / 2 + 0.035, DOOR.h / 2, ROOM.minZ + 0.02), fm));
    const num = mesh(new THREE.PlaneGeometry(0.22, 0.11), new THREE.MeshBasicMaterial({ map: signTexture('214', '#2f4a80', '#ffffff') }));
    num.position.set(DOOR.x + DOOR.w / 2 + 0.25, 1.65, ROOM.minZ + 0.03);
    this.scene.add(num);

    // the strip of hall light under the door, and a soft pool on the floor
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.w - 0.06, 0.05), glow(0xffffff, 2.6));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(DOOR.x, 0.004, ROOM.minZ + 0.06);
    strip.userData.noOutline = true;
    this.scene.add(strip);
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(DOOR.w * 1.3, 0.9),
      new THREE.MeshBasicMaterial({ color: 0x8f9cd8, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, map: this.poolTexture() }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(DOOR.x, 0.005, ROOM.minZ + 0.5);
    this.scene.add(pool);
    // shadows of feet that cross the strip (the only "sight" of whoever is outside)
    for (let i = 0; i < 2; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.07), new THREE.MeshBasicMaterial({ color: 0x0b0d18 }));
      f.rotation.x = -Math.PI / 2;
      f.position.set(DOOR.x, 0.006, ROOM.minZ + 0.06);
      f.visible = false;
      this.feet.push(f);
      this.scene.add(f);
    }

    const sp = this.switchPlate;
    sp.position.copy(SWITCH_POS);
    sp.add(mesh(box(0.08, 0.13, 0.015), 0xf4f2ea));
    this.switchToggle = mesh(at(box(0.025, 0.035, 0.02), 0, 0, 0.012), 0xffffff);
    sp.add(this.switchToggle);
    this.scene.add(sp);
  }

  private poolTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 0, 2, 32, 0, 60);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(1, '#000000');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  setDoorAngle(a: number): void {
    this.door.angle = a;
    this.door.pivot.rotation.y = -a;
  }

  rattleHandle(sec: number): void {
    this.rattle = Math.max(this.rattle, sec);
  }

  /** Feet shadows on the light strip; x = null hides them. */
  setFeet(x: number | null): void {
    this.feetX = x;
    this.feet.forEach((f, i) => {
      f.visible = x !== null && Math.abs(x - DOOR.x) < DOOR.w / 2 + 0.1;
      if (x !== null) f.position.x = THREE.MathUtils.clamp(x + (i ? 0.1 : -0.1), DOOR.x - 0.45, DOOR.x + 0.45);
    });
  }

  // ---------------- windows / blinds ----------------

  private buildWindows(): void {
    for (const wz of [-2.4, 0.1, 2.6]) {
      const outside = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), this.windowMat);
      outside.rotation.y = Math.PI / 2;
      outside.position.set(ROOM.minX - 0.1, 1.7, wz);
      outside.userData.noOutline = true;
      this.scene.add(outside);
      for (let i = 0; i < 16; i++) {
        const slat = mesh(box(0.07, 0.012, 1.46), 0xf3f0e6);
        slat.position.set(ROOM.minX + 0.05, 1.0 + i * 0.09, wz);
        this.slats.push(slat);
        this.scene.add(slat);
      }
      this.scene.add(mesh(at(box(0.16, 0.05, 1.6), ROOM.minX + 0.07, 0.95, wz), 0xc9c4b6));
      const st = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.4), this.stripeMat);
      st.rotation.x = Math.PI / 2;
      st.rotation.z = Math.PI / 2;
      st.position.set(ROOM.minX + 1.4, ROOM.h - 0.01, wz);
      this.stripes.push(st);
      this.scene.add(st);
    }
    // the cord that closes the blinds (interactable), by the middle window
    const cord = mesh(at(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 6), 0, 1.75, 0), 0xf3f0e6);
    const pull = mesh(new THREE.SphereGeometry(0.03, 8, 6), 0xd9d3c3);
    pull.position.y = 1.24;
    this.blindsCord.add(cord, pull);
    this.blindsCord.position.set(ROOM.minX + 0.12, 0, 0.1 + 0.8);
    const hit = new THREE.Mesh(box(0.25, 1.4, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1.6;
    this.blindsCord.add(hit);
    this.scene.add(this.blindsCord);
    this.setBlinds(0);
  }

  /** 0 = open (tilted), 1 = closed flat. */
  setBlinds(k: number): void {
    this.blindsClosed = k;
    this.slats.forEach((s) => (s.rotation.z = 0.55 + k * 0.95));
  }

  // ---------------- people ----------------

  private buildPeople(): void {
    for (const [name, look] of Object.entries(LOOKS)) {
      const p = new Person(name, look);
      this.people.set(name, p);
      this.scene.add(p.root);
    }
    this.teacher = new Person('teacher', { shirt: 0xd9a23a, skin: 0xe8b894, hair: 0xa8452a, pants: 0x2f3550, hairStyle: 'bun', glasses: true, scale: 1.05 });
    this.theo = new Person('theo', { shirt: 0xd63a3a, skin: 0x7a4b33, hair: 0x15161c, pants: 0x2f3f7a, hairStyle: 'curly', bigEyes: true });
    for (const p of [this.teacher, this.theo]) {
      this.people.set(p.name, p);
      this.scene.add(p.root);
    }
    // her phone (the school alert appears on it during the wait)
    const ph = this.teacherPhone;
    ph.add(mesh(box(0.075, 0.14, 0.012), 0x22252e));
    this.teacherPhoneScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.065, 0.12), glow(0xbcd0ff, 1.0));
    this.teacherPhoneScreen.position.z = -0.007;
    this.teacherPhoneScreen.rotation.y = Math.PI;
    this.teacherPhoneScreen.visible = false;
    ph.add(this.teacherPhoneScreen);
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

  /** Place everyone on the door wall (used when a phase is entered directly). */
  huddle(name: string): void {
    const p = this.people.get(name);
    const spot = HUDDLE[name];
    if (!p || !spot) return;
    p.place(spot[0], spot[1], spot[2]);
    p.walking = false;
    p.setPose(name === 'teacher' ? 'crouch' : 'floor', true);
    if (name === 'teacher') p.faceTowards(DOOR.x + 1, -2);
  }

  /** Teacher's phone shows the school alert. */
  setAlert(on: boolean): void {
    const t = this.teacher.root.position;
    this.teacherPhone.visible = on;
    this.teacherPhoneScreen.visible = on;
    this.teacherPhone.position.set(t.x + 0.18, 0.62, t.z + 0.3);
    this.teacherPhone.rotation.set(-0.9, 0, 0);
  }

  // ---------------- Noah's desk ----------------

  private buildDesktop(): void {
    const { x, z } = PLAYER_DESK;
    const y = 0.745;
    this.sheetMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.216, 0.279), new THREE.MeshBasicMaterial({ map: this.sheet.texture }));
    this.sheetMesh.rotation.x = -Math.PI / 2;
    this.sheetMesh.position.set(x + 0.03, y, z + 0.05);
    this.sheetMesh.name = 'answerSheet';
    this.scene.add(this.sheetMesh);
    // spare sheet (used to cover the door window)
    this.spareSheet = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), new THREE.MeshBasicMaterial({ map: coverTexture() }));
    this.spareSheet.rotation.set(-Math.PI / 2, 0, -0.25);
    this.spareSheet.position.set(x - 0.22, y - 0.001, z - 0.06);
    this.scene.add(this.spareSheet);
    // maroon pencil case, silver bottle
    const pc = mesh(new THREE.CapsuleGeometry(0.04, 0.17, 4, 8).rotateZ(Math.PI / 2), 0x8a2a3a);
    pc.position.set(x - 0.2, y + 0.04, z - 0.2);
    pc.rotation.y = 0.15;
    const bottle = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 12), 0xc9ced8);
    bottle.position.set(x + 0.28, y + 0.12, z - 0.18);
    const cap = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.04, 10), 0x6a7286);
    cap.position.y = 0.14;
    bottle.add(cap);
    outline(pc, 0.006);
    outline(bottle, 0.006);
    this.scene.add(pc, bottle);

    // first-person hands: gray sleeves, tan hands, yellow pencil
    const skin = 0xf0c09a;
    const sleeve = 0x7a7f8f;
    const makeHand = () => {
      const h = new THREE.Group();
      const palm = mesh(new THREE.SphereGeometry(0.05, 12, 10), skin);
      palm.scale.set(1, 0.55, 1.15);
      palm.position.set(0, 0.02, -0.02);
      h.add(palm);
      const arm = mesh(new THREE.CapsuleGeometry(0.05, 0.36, 4, 10).rotateX(Math.PI / 2), sleeve);
      arm.position.set(0, 0.04, 0.25);
      arm.rotation.x = -0.15;
      h.add(arm);
      outline(h, 0.006);
      return h;
    };
    const left = makeHand();
    left.position.set(x - 0.16, y, z + 0.2);
    left.rotation.y = -0.3;
    this.rightHand = makeHand();
    const pencil = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.17, 6).rotateX(Math.PI / 2), 0xf2c230);
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
    this.scene.add(this.hemi);
    this.sun.position.set(-2, 6, 3);
    this.scene.add(this.sun);
    const pg = new THREE.PlaneGeometry(1.3, 0.55);
    for (const x of [-2.4, 0, 2.4])
      for (const z of [-2.6, 0, 2.6]) {
        const p = new THREE.Mesh(pg, this.panelOn);
        p.rotation.x = Math.PI / 2;
        p.rotation.z = (Math.random() - 0.5) * 0.02;
        p.position.set(x, ROOM.h - 0.015, z);
        this.panels.push(p);
        this.scene.add(p);
      }
    this.doorLight.position.set(DOOR.x, 0.35, ROOM.minZ + 0.5);
    this.scene.add(this.doorLight);
    this.sirenLight.position.set(ROOM.minX + 0.8, 2.3, 0);
    this.scene.add(this.sirenLight);
  }

  setLights(on: boolean): void {
    this.lightsOn = on;
    if (on) {
      this.hemi.color.set(0xfff4e0);
      this.hemi.groundColor.set(0x8a90a8);
      this.hemi.intensity = 2.3;
      this.sun.color.set(0xfff0dc);
      this.sun.intensity = 1.4;
      this.doorLight.intensity = 0;
    } else {
      // readable navy, not black
      this.hemi.color.set(0x5f6fd0);
      this.hemi.groundColor.set(0x1a2048);
      this.hemi.intensity = 1.05;
      this.sun.color.set(0x7080d8);
      this.sun.intensity = 0.4;
      this.doorLight.intensity = 1.1;
    }
    this.panels.forEach((p) => (p.material = on ? this.panelOn : this.panelOff));
    this.switchToggle.position.y = on ? 0.02 : -0.02;
    (this.scene.background as THREE.Color).set(on ? 0x10131f : 0x0a0d1c);
  }

  setSiren(level: number): void {
    this.sirenTarget = level;
  }

  /** PA speaker rings pulse while it talks. */
  setPA(sec: number): void {
    this.paActive = Math.max(this.paActive, sec);
  }

  // ---------------- per frame ----------------

  update(dt: number): void {
    this.t += dt;
    for (const p of this.people.values()) p.update(dt);
    this.sirenLevel += (this.sirenTarget - this.sirenLevel) * Math.min(1, dt * 0.6);
    const lvl = this.sirenLevel;
    const ph = Math.sin(this.t * 4.2);
    const pink = Math.max(0, ph) ** 2;
    const blue = Math.max(0, -ph) ** 2;
    const sc = new THREE.Color(0.95 * pink + 0.2 * blue, 0.35 * pink + 0.4 * blue, 0.7 * pink + 1.0 * blue);
    this.sirenLight.color.copy(sc);
    this.sirenLight.intensity = lvl * (pink + blue) * 4.5;
    const base = new THREE.Color(this.lightsOn ? 0xdfeaf5 : 0x6f7fc0).multiplyScalar(this.lightsOn ? 1.4 : 1.1);
    const open = 1 - this.blindsClosed * 0.65;
    this.windowMat.color.copy(base).multiplyScalar(open).lerp(sc.clone().multiplyScalar(1.5), Math.min(0.55, lvl * (pink + blue)));
    this.stripeMat.opacity = Math.min(0.42, lvl * (pink + blue) * 0.4 + (this.lightsOn ? 0 : 0.12 * open));
    this.stripeMat.color.set(0xb8c4ff).lerp(sc, Math.min(1, lvl * 1.5));
    // handle: rattle, or a slow press
    if (this.rattle > 0) {
      this.rattle = Math.max(0, this.rattle - dt);
      this.door.handle.rotation.z = Math.sin(this.t * 55) * 0.3 * Math.min(1, this.rattle * 3) - 0.15;
    } else this.door.handle.rotation.z += (-this.handlePress * 0.75 - this.door.handle.rotation.z) * Math.min(1, dt * 6);
    // PA rings
    this.paActive = Math.max(0, this.paActive - dt);
    this.paRings.forEach((r, i) => {
      r.visible = this.paActive > 0;
      const k = ((this.t * 1.4 + i / 3) % 1) * 0.6 + 0.8;
      r.scale.setScalar(k);
    });
  }
}
