import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Person, mat } from './people';
import {
  AnswerSheet,
  ClockFace,
  boardTexture,
  bookletTexture,
  floorTexture,
  posterCell,
  posterMitosis,
  posterQuote,
  signTexture,
  stripesTexture,
} from './textures';

// Room 214. Units are metres. Students face -z (the whiteboard). Door is on the
// +x wall near the front. Windows with blinds on the -x wall.
export const ROOM = { minX: -4.5, maxX: 4.5, minZ: -4.5, maxZ: 4.5, h: 3 };
export const COLS = [-2.7, -0.9, 0.9, 2.7];
export const ROWS = [-2.4, -0.6, 1.2];
export const CHAIR_OFFSET = 0.5;
export const DOOR = { x: ROOM.maxX, z: -3.4, w: 0.95, h: 2.1 };
export const SWITCH_POS = new THREE.Vector3(ROOM.maxX - 0.03, 1.25, -2.66);
/** Back of the room, away from the door. */
export const SAFE_Z = 2.3;
export const PLAYER_DESK = { x: COLS[2], z: ROWS[1] };
export const THEO_DESK = { x: COLS[3], z: ROWS[1] };
export const ZOE_DESK = { x: COLS[2], z: ROWS[0] };
export const AISLE_X = (COLS[2] + COLS[3]) / 2;

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
  homeX: number;
  homeZ: number;
}

function box(w: number, h: number, d: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(w, h, d);
}

function at<T extends THREE.BufferGeometry>(g: T, x: number, y: number, z: number): T {
  g.translate(x, y, z);
  return g;
}

function mesh(geo: THREE.BufferGeometry, color: number | THREE.Material): THREE.Mesh {
  return new THREE.Mesh(geo, typeof color === 'number' ? mat(color) : color);
}

const SEAT_PLAN: (string | null)[][] = [
  // cols:  0       1        2        3
  ['f1', 'f2', 'zoe', 'f3'],
  ['f4', null, 'player', 'theo'],
  ['f5', 'f6', null, null],
];

const FILLERS: Record<string, ConstructorParameters<typeof Person>[1]> = {
  f1: { shirt: 0x3b4a6b, skin: 0x8a5a3c, hair: 0x111111, pants: 0x2b2b33, hairStyle: 'curly' },
  f2: { shirt: 0x55585e, skin: 0xe2b896, hair: 0xb08a4a, pants: 0x36404d, hairStyle: 'long' },
  f3: { shirt: 0x6b5b45, skin: 0x6e4630, hair: 0x0f0f0f, pants: 0x232323, hairStyle: 'short' },
  f4: { shirt: 0x2f5160, skin: 0xd6a582, hair: 0x2b1d14, pants: 0x3a3a3a, hairStyle: 'bun' },
  f5: { shirt: 0x4a3f5c, skin: 0xb98463, hair: 0x1c1410, pants: 0x2a3140, hairStyle: 'short' },
  f6: { shirt: 0x5d6b4a, skin: 0xf0c8a8, hair: 0x6b4423, pants: 0x30302c, hairStyle: 'long' },
};

/** Where everyone ends up during the lockdown: along the back wall, out of the door's sight line. */
export const HUDDLE: Record<string, [number, number, number]> = {
  f1: [-2.75, 3.95, 0.1],
  f2: [-2.1, 4.0, -0.05],
  f3: [-1.45, 3.95, 0.05],
  f4: [-0.8, 4.0, -0.1],
  f5: [-2.4, 3.3, 0.15],
  f6: [-1.1, 3.35, -0.1],
  theo: [0.55, 3.9, -0.15],
  teacher: [3.7, 2.9, 0],
};

export class World {
  scene = new THREE.Scene();
  colliders: Collider[] = [];
  chairs: Chair[] = [];
  people = new Map<string, Person>();
  teacher!: Person;
  theo!: Person;
  zoe!: Person;
  sheet = new AnswerSheet();
  sheetMesh!: THREE.Mesh;
  eraser!: THREE.Mesh;
  hands = new THREE.Group();
  rightHand = new THREE.Group();
  clock = new ClockFace();
  door = { pivot: new THREE.Group(), handle: new THREE.Group(), cover: new THREE.Mesh(), knob: new THREE.Mesh(), angle: 0 };
  switchPlate = new THREE.Group();
  switchToggle!: THREE.Mesh;
  hallLight!: THREE.Mesh;
  lightsOn = true;
  private hemi!: THREE.HemisphereLight;
  private ceiling: THREE.PointLight[] = [];
  private panels: THREE.Mesh[] = [];
  private panelOn = new THREE.MeshBasicMaterial({ color: 0xeef3ff });
  private panelOff = new THREE.MeshLambertMaterial({ color: 0x2a2d30 });
  private windowMat = new THREE.MeshBasicMaterial({ color: 0x8da0b3 });
  private stripes: THREE.Mesh[] = [];
  private stripeMat: THREE.MeshBasicMaterial;
  private sirenLight = new THREE.PointLight(0xff0000, 0, 9, 1.6);
  private exitLight = new THREE.PointLight(0xff2a1a, 0.6, 4.5, 2);
  private daylight = new THREE.DirectionalLight(0x9fb4d0, 0.25);
  private fish: THREE.Mesh[] = [];
  sirenLevel = 0;
  private sirenTarget = 0;
  private rattle = 0;
  private t = 0;

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color(0x07090c);
    s.fog = new THREE.Fog(0x0b0e12, 7, 22);
    this.stripeMat = new THREE.MeshBasicMaterial({
      map: stripesTexture(),
      color: 0x8fa6c4,
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

  // ---------------- room shell ----------------

  private buildRoom(): void {
    const s = this.scene;
    const { minX, maxX, minZ, maxZ, h } = ROOM;
    const W = maxX - minX;
    const D = maxZ - minZ;
    const floor = mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: floorTexture() }));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    const ceil = mesh(new THREE.PlaneGeometry(W, D), 0x9a9c9a);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = h;
    s.add(ceil);

    const wallColor = 0x6c7a74;
    const lower = 0x46504c;
    const addWall = (w: number, x: number, z: number, ry: number, y0 = 0, y1 = h) => {
      const seg = (a: number, b: number, color: number) => {
        if (b - a <= 0.001 || w <= 0.001) return;
        const m = mesh(new THREE.PlaneGeometry(w, b - a), color);
        m.position.set(x, (a + b) / 2, z);
        m.rotation.y = ry;
        s.add(m);
      };
      seg(Math.max(y0, 1), y1, wallColor);
      seg(y0, Math.min(1, y1), lower);
    };
    addWall(W, 0, minZ, 0); // front
    addWall(W, 0, maxZ, Math.PI); // back
    // left wall with three window openings: build as strips
    const winZ = [-2.5, 0, 2.5];
    const winW = 1.5;
    const sill = 0.95;
    const top = 2.45;
    let z0 = minZ;
    for (const wz of winZ) {
      const a = wz - winW / 2;
      addWall(a - z0, minX, (z0 + a) / 2, Math.PI / 2);
      addWall(winW, minX, wz, Math.PI / 2, 0, sill);
      const lintel = mesh(new THREE.PlaneGeometry(winW, h - top), wallColor);
      lintel.position.set(minX, (top + h) / 2, wz);
      lintel.rotation.y = Math.PI / 2;
      s.add(lintel);
      z0 = wz + winW / 2;
    }
    addWall(maxZ - z0, minX, (z0 + maxZ) / 2, Math.PI / 2);

    // right wall with the door opening
    const dz0 = DOOR.z - DOOR.w / 2;
    const dz1 = DOOR.z + DOOR.w / 2;
    addWall(dz0 - minZ, maxX, (minZ + dz0) / 2, -Math.PI / 2);
    addWall(maxZ - dz1, maxX, (dz1 + maxZ) / 2, -Math.PI / 2);
    const lintel = mesh(new THREE.PlaneGeometry(DOOR.w, h - DOOR.h), wallColor);
    lintel.position.set(maxX, (DOOR.h + h) / 2, DOOR.z);
    lintel.rotation.y = -Math.PI / 2;
    s.add(lintel);

    // hallway behind the door: dark, faintly lit, always empty
    const hall = new THREE.Group();
    const hallFloor = mesh(new THREE.PlaneGeometry(3, 8), 0x2a2a2a);
    hallFloor.rotation.x = -Math.PI / 2;
    hallFloor.position.set(maxX + 1.5, 0.001, DOOR.z);
    const hallWall = mesh(new THREE.PlaneGeometry(8, h), 0x3a3f44);
    hallWall.rotation.y = -Math.PI / 2;
    hallWall.position.set(maxX + 2.2, h / 2, DOOR.z);
    this.hallLight = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.12), new THREE.MeshBasicMaterial({ color: 0x9aa3a8 }));
    this.hallLight.rotation.x = Math.PI / 2;
    this.hallLight.position.set(maxX + 1.4, h - 0.02, DOOR.z + 1.5);
    const lockers = mesh(at(box(0.4, 1.8, 3), maxX + 2.0, 0.9, DOOR.z - 0.5), 0x4b5a63);
    hall.add(hallFloor, hallWall, this.hallLight, lockers);
    s.add(hall);

    // trim
    const base = mesh(at(box(W, 0.12, 0.02), 0, 0.06, minZ + 0.01), 0x2a2a2a);
    s.add(base);

    // whiteboard + clock + posters
    const board = mesh(new THREE.PlaneGeometry(3.4, 1.28), new THREE.MeshLambertMaterial({ map: boardTexture() }));
    board.position.set(-0.3, 1.55, minZ + 0.02);
    s.add(board);
    const frame = mesh(at(box(3.5, 0.05, 0.08), -0.3, 0.88, minZ + 0.04), 0x9a9fa3);
    s.add(frame);
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.19, 20), new THREE.MeshLambertMaterial({ map: this.clock.texture }));
    clock.position.set(2.5, 2.45, minZ + 0.02);
    s.add(clock);
    const posters: [THREE.Texture, number, number, number, number, number, number][] = [
      [posterCell(), 0.75, 1.0, -2.2, 1.65, maxZ - 0.02, Math.PI],
      [posterQuote(), 0.6, 0.8, 2.0, 1.65, maxZ - 0.02, Math.PI],
      [posterMitosis(), 1.1, 0.55, 2.55, 1.5, minZ + 0.02, 0],
    ];
    for (const [t, w, hh, x, y, z, ry] of posters) {
      const p = mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshLambertMaterial({ map: t }));
      p.position.set(x, y, z);
      p.rotation.y = ry;
      s.add(p);
    }
    const bulletin = mesh(at(box(1.6, 1.0, 0.03), 0, 1.65, maxZ - 0.02), 0x8a6a45);
    s.add(bulletin);
    for (let i = 0; i < 6; i++) {
      const note = mesh(new THREE.PlaneGeometry(0.2, 0.26), [0xe8e2c8, 0xd8e8f0, 0xf0d8d8][i % 3]);
      note.position.set(-0.6 + (i % 3) * 0.55 + Math.random() * 0.1, 1.85 - Math.floor(i / 3) * 0.4, maxZ - 0.04);
      note.rotation.set(0, Math.PI, (Math.random() - 0.5) * 0.2);
      s.add(note);
    }
  }

  // ---------------- furniture ----------------

  private addCollider(c: Collider): Collider {
    this.colliders.push(c);
    return c;
  }

  private makeDesk(x: number, z: number): void {
    const legs: THREE.BufferGeometry[] = [];
    for (const dx of [-0.31, 0.31])
      for (const dz of [-0.21, 0.21]) legs.push(at(box(0.035, 0.7, 0.035), x + dx, 0.35, z + dz));
    legs.push(at(box(0.6, 0.12, 0.02), x, 0.58, z - 0.2));
    legs.push(at(box(0.62, 0.02, 0.36), x, 0.6, z - 0.02));
    this.scene.add(mesh(mergeGeometries(legs), 0x2c2f33));
    const top = mesh(at(box(0.7, 0.035, 0.5), x, 0.72, z), 0x9b8463);
    this.scene.add(top);
    this.addCollider({ minX: x - 0.35, maxX: x + 0.35, minZ: z - 0.25, maxZ: z + 0.25 });
  }

  private makeChair(x: number, z: number, color = 0x2f4a5c): Chair {
    const g = new THREE.Group();
    const parts: THREE.BufferGeometry[] = [];
    for (const dx of [-0.17, 0.17])
      for (const dz of [-0.17, 0.17]) parts.push(at(box(0.03, 0.45, 0.03), dx, 0.225, dz));
    parts.push(at(box(0.03, 0.4, 0.03), -0.17, 0.65, 0.18), at(box(0.03, 0.4, 0.03), 0.17, 0.65, 0.18));
    g.add(mesh(mergeGeometries(parts), 0x3a3d40));
    g.add(mesh(at(box(0.42, 0.04, 0.4), 0, 0.46, 0), color));
    g.add(mesh(at(box(0.42, 0.26, 0.03), 0, 0.75, 0.2), color));
    g.position.set(x, 0, z);
    this.scene.add(g);
    const chair: Chair = {
      group: g,
      homeX: x,
      homeZ: z,
      collider: { minX: x - 0.21, maxX: x + 0.21, minZ: z - 0.21, maxZ: z + 0.22 },
    };
    chair.collider.chair = chair;
    this.addCollider(chair.collider);
    this.chairs.push(chair);
    return chair;
  }

  /** Nudge a chair (it was bumped). */
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

  private buildFurniture(): void {
    for (const z of ROWS) for (const x of COLS) {
      this.makeDesk(x, z);
      this.makeChair(x, z + CHAIR_OFFSET);
    }
    // teacher desk
    const tx = -2.6;
    const tz = -3.65;
    this.scene.add(mesh(at(box(1.5, 0.74, 0.72), tx, 0.37, tz), 0x5e4532));
    this.scene.add(mesh(at(box(1.56, 0.04, 0.78), tx, 0.76, tz), 0x7a5a40));
    this.scene.add(mesh(at(box(0.32, 0.12, 0.24), tx - 0.4, 0.84, tz), 0xe8e4d8));
    this.scene.add(mesh(at(box(0.3, 0.05, 0.22), tx + 0.2, 0.805, tz + 0.05), 0xd8d4c8));
    const mug = mesh(at(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 8), tx + 0.55, 0.83, tz - 0.1), 0x2f6b8a);
    this.scene.add(mug);
    this.addCollider({ minX: tx - 0.78, maxX: tx + 0.78, minZ: tz - 0.39, maxZ: tz + 0.39 });

    // bookshelf (back right)
    const bx = 4.25;
    const bz = 3.4;
    this.scene.add(mesh(at(box(0.4, 1.8, 1.4), bx, 0.9, bz), 0x4a3a2c));
    for (let shelf = 0; shelf < 4; shelf++)
      for (let i = 0; i < 9; i++) {
        const hgt = 0.2 + Math.random() * 0.1;
        const b = mesh(at(box(0.25, hgt, 0.09), bx - 0.08, 0.12 + shelf * 0.43 + hgt / 2, bz - 0.6 + i * 0.13), [0x7a2e2e, 0x2e4a7a, 0x3d6b3d, 0x8a7a3a, 0x5a3d6b][(i + shelf) % 5]);
        this.scene.add(b);
      }
    this.addCollider({ minX: bx - 0.2, maxX: ROOM.maxX, minZ: bz - 0.7, maxZ: bz + 0.7 });

    // aquarium cabinet (back left corner)
    const ax = -3.7;
    const az = 4.1;
    this.scene.add(mesh(at(box(1.3, 0.8, 0.6), ax, 0.4, az), 0x3d342c));
    const tank = new THREE.Mesh(
      at(box(0.9, 0.45, 0.36), ax, 1.03, az),
      new THREE.MeshBasicMaterial({ color: 0x2f7f86, transparent: true, opacity: 0.75 }),
    );
    this.scene.add(tank);
    const tankLight = new THREE.PointLight(0x40c8c0, 0.9, 2.6, 2);
    tankLight.position.set(ax, 1.1, az - 0.4);
    this.scene.add(tankLight);
    for (let i = 0; i < 3; i++) {
      const f = mesh(box(0.05, 0.025, 0.012), new THREE.MeshBasicMaterial({ color: [0xff8a3a, 0xffd04a, 0xff6a6a][i] }));
      f.position.set(ax, 1.0 + i * 0.08, az);
      this.fish.push(f);
      this.scene.add(f);
    }
    this.addCollider({ minX: ax - 0.65, maxX: ax + 0.65, minZ: az - 0.3, maxZ: ROOM.maxZ });

    // backpacks
    const packColors = [0x8a3a3a, 0x2a2a2a, 0x3a5a7a, 0x6a6a3a, 0x4a2a5a];
    let k = 0;
    for (const z of ROWS) for (const x of COLS) {
      if (Math.random() < 0.35 || (x === PLAYER_DESK.x && z === PLAYER_DESK.z)) continue;
      const p = mesh(at(box(0.28, 0.36, 0.16), 0, 0.18, 0), packColors[k++ % packColors.length]);
      p.position.set(x - 0.42, 0, z + 0.4);
      p.rotation.y = Math.random() - 0.5;
      this.scene.add(p);
    }
  }

  // ---------------- door + switch ----------------

  private buildDoor(): void {
    const d = this.door;
    const hingeZ = DOOR.z - DOOR.w / 2;
    d.pivot.position.set(ROOM.maxX - 0.03, 0, hingeZ);
    const slab = mesh(at(box(0.045, DOOR.h, DOOR.w - 0.02), 0, DOOR.h / 2, DOOR.w / 2), 0x6a5240);
    d.pivot.add(slab);
    // narrow window in the door
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.55), new THREE.MeshBasicMaterial({ color: 0x5d666d }));
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(-0.024, 1.55, DOOR.w * 0.72);
    d.pivot.add(glass);
    d.cover = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.62), new THREE.MeshLambertMaterial({ color: 0x0c0c0c }));
    d.cover.rotation.y = -Math.PI / 2;
    d.cover.position.set(-0.028, 1.55, DOOR.w * 0.72);
    d.cover.visible = false;
    d.pivot.add(d.cover);
    // lever handle (rattles)
    d.handle.position.set(-0.05, 1.0, DOOR.w - 0.1);
    const rose = mesh(at(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8).rotateZ(Math.PI / 2), 0.0, 0, 0), 0xb8b8b0);
    const lever = mesh(at(box(0.025, 0.025, 0.13), -0.02, 0, -0.06), 0xc8c8c0);
    d.handle.add(rose, lever);
    d.pivot.add(d.handle);
    d.knob = mesh(at(box(0.02, 0.05, 0.015), -0.04, 1.2, DOOR.w - 0.1), 0xc8c8c0);
    d.pivot.add(d.knob);
    this.scene.add(d.pivot);
    // a thin line of hallway light under the door
    const gap = new THREE.Mesh(new THREE.PlaneGeometry(0.03, DOOR.w - 0.06), new THREE.MeshBasicMaterial({ color: 0x8a96a3 }));
    gap.rotation.x = -Math.PI / 2;
    gap.position.set(ROOM.maxX - 0.035, 0.004, DOOR.z);
    this.scene.add(gap);
    // frame
    const fm = 0x3a2e26;
    this.scene.add(mesh(at(box(0.06, 0.06, DOOR.w + 0.12), ROOM.maxX - 0.02, DOOR.h + 0.03, DOOR.z), fm));
    this.scene.add(mesh(at(box(0.06, DOOR.h, 0.06), ROOM.maxX - 0.02, DOOR.h / 2, hingeZ - 0.03), fm));
    this.scene.add(mesh(at(box(0.06, DOOR.h, 0.06), ROOM.maxX - 0.02, DOOR.h / 2, DOOR.z + DOOR.w / 2 + 0.03), fm));
    // exit sign
    const exit = new THREE.Mesh(
      at(box(0.06, 0.16, 0.38), ROOM.maxX - 0.05, DOOR.h + 0.28, DOOR.z),
      new THREE.MeshBasicMaterial({ map: signTexture('EXIT', '#3a0505', '#ff3b2a') }),
    );
    this.scene.add(exit);
    this.exitLight.position.set(ROOM.maxX - 0.4, DOOR.h + 0.2, DOOR.z);
    this.scene.add(this.exitLight);
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.11), new THREE.MeshLambertMaterial({ map: signTexture('214', '#1c2a3a', '#e8e8e8') }));
    num.rotation.y = -Math.PI / 2;
    num.position.set(ROOM.maxX - 0.01, 1.7, DOOR.z + DOOR.w / 2 + 0.25);
    this.scene.add(num);

    // light switch
    const sp = this.switchPlate;
    sp.position.copy(SWITCH_POS);
    sp.add(mesh(box(0.015, 0.12, 0.075), 0xe8e6de));
    this.switchToggle = mesh(at(box(0.02, 0.03, 0.018), -0.012, 0, 0), 0xf4f2ea);
    this.switchToggle.rotation.z = 0.35;
    sp.add(this.switchToggle);
    // generous invisible hit box
    const hit = new THREE.Mesh(box(0.12, 0.3, 0.26), new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'switchHit';
    sp.add(hit);
    this.scene.add(sp);
  }

  setDoorAngle(a: number): void {
    this.door.angle = a;
    this.door.pivot.rotation.y = -a;
  }

  rattleHandle(sec: number): void {
    this.rattle = Math.max(this.rattle, sec);
  }

  // ---------------- windows / blinds ----------------

  private buildWindows(): void {
    const winZ = [-2.5, 0, 2.5];
    for (const wz of winZ) {
      const outside = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), this.windowMat);
      outside.rotation.y = Math.PI / 2;
      outside.position.set(ROOM.minX - 0.12, 1.7, wz);
      this.scene.add(outside);
      const slats: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 17; i++) {
        const g = box(0.06, 0.012, 1.48);
        g.rotateZ(0.5);
        slats.push(at(g, ROOM.minX + 0.05, 1.0 + i * 0.087, wz));
      }
      this.scene.add(mesh(mergeGeometries(slats), 0xb7b2a4));
      this.scene.add(mesh(at(box(0.18, 0.04, 1.6), ROOM.minX + 0.07, 0.95, wz), 0x8f8a80));
      // light through blinds on the floor
      const st = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.6), this.stripeMat);
      st.rotation.x = -Math.PI / 2;
      st.rotation.z = Math.PI / 2;
      st.position.set(ROOM.minX + 1.6, 0.01, wz);
      this.stripes.push(st);
      this.scene.add(st);
      // and on the ceiling (siren bounce)
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), this.stripeMat);
      sc.rotation.x = Math.PI / 2;
      sc.rotation.z = Math.PI / 2;
      sc.position.set(ROOM.minX + 1.0, ROOM.h - 0.01, wz);
      this.stripes.push(sc);
      this.scene.add(sc);
    }
    // plant on the sill
    const pot = mesh(at(new THREE.CylinderGeometry(0.1, 0.08, 0.16, 7), ROOM.minX + 0.12, 1.06, 1.2), 0x8a4a2a);
    this.scene.add(pot);
    for (let i = 0; i < 6; i++) {
      const leaf = mesh(new THREE.ConeGeometry(0.04, 0.3, 4), 0x2f5a2f);
      leaf.position.set(ROOM.minX + 0.12 + (Math.random() - 0.5) * 0.1, 1.27, 1.2 + (Math.random() - 0.5) * 0.12);
      leaf.rotation.set((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8);
      this.scene.add(leaf);
    }
  }

  // ---------------- people ----------------

  private buildPeople(): void {
    SEAT_PLAN.forEach((row, r) =>
      row.forEach((who, c) => {
        if (!who || who === 'player' || who === 'theo' || who === 'zoe') return;
        const p = new Person(who, FILLERS[who]);
        this.people.set(who, p);
        this.scene.add(p.root);
        this.seat(p, c, r);
      }),
    );
    this.teacher = new Person('teacher', { shirt: 0xd9a92a, skin: 0x5a3a26, hair: 0x141414, pants: 0x3d3d44, hairStyle: 'bun', scale: 1.04 });
    this.theo = new Person('theo', { shirt: 0xb0302a, skin: 0xe0b08f, hair: 0x5a3b22, pants: 0x2d3540, hairStyle: 'short' });
    this.zoe = new Person('zoe', { shirt: 0x3f7d5c, skin: 0xc68e64, hair: 0x231a16, pants: 0x2a2a35, hairStyle: 'long', scale: 0.97 });
    for (const p of [this.teacher, this.theo, this.zoe]) {
      this.people.set(p.name, p);
      this.scene.add(p.root);
    }
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
    SEAT_PLAN.forEach((row, r) =>
      row.forEach((who, c) => {
        if (!who || who === 'player') return;
        const p = this.people.get(who);
        if (p) this.seat(p, c, r);
      }),
    );
    this.teacher.place(-1.3, -3.85, Math.PI);
    this.teacher.setPose('stand', true);
    this.teacher.headPitch = 0;
    this.teacher.root.visible = true;
  }

  /** Lockdown positions (used when a scene is skipped or entered directly). */
  huddleEveryone(includeTheo: boolean): void {
    for (const [name, [x, z, f]] of Object.entries(HUDDLE)) {
      if (name === 'theo' && !includeTheo) continue;
      const p = this.people.get(name);
      if (!p) continue;
      p.place(x, z, f);
      if (name === 'teacher') p.faceTowards(DOOR.x, DOOR.z);
      p.walking = false;
      p.setPose(name === 'teacher' ? 'crouch' : 'floor', true);
      p.headPitch = -0.2;
      p.headYaw = 0;
    }
    this.zoe.root.visible = false;
  }

  // ---------------- player's desk ----------------

  private buildDesktop(): void {
    const { x, z } = PLAYER_DESK;
    const y = 0.74;
    this.sheetMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.216, 0.279), new THREE.MeshLambertMaterial({ map: this.sheet.texture }));
    this.sheetMesh.rotation.x = -Math.PI / 2;
    this.sheetMesh.position.set(x + 0.02, y, z + 0.06);
    this.sheetMesh.name = 'answerSheet';
    this.scene.add(this.sheetMesh);
    const booklet = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), new THREE.MeshLambertMaterial({ map: bookletTexture() }));
    booklet.rotation.set(-Math.PI / 2, 0, 0.12);
    booklet.position.set(x - 0.21, y - 0.001, z + 0.02);
    this.scene.add(booklet);
    this.eraser = mesh(box(0.05, 0.016, 0.022), 0xe58aa0);
    this.eraser.position.set(x + 0.25, y + 0.008, z - 0.13);
    this.eraser.rotation.y = 0.4;
    this.eraser.name = 'eraser';
    this.scene.add(this.eraser);

    // first-person hands resting on the desk
    const skin = 0xa8714f;
    const sleeve = 0x34404a;
    const makeHand = (mirror: number) => {
      const h = new THREE.Group();
      h.add(mesh(at(box(0.075, 0.025, 0.09), 0, 0.012, 0), skin));
      for (let i = 0; i < 4; i++) {
        const f = mesh(at(box(0.016, 0.018, 0.06), -0.027 + i * 0.018, 0.01, -0.07), skin);
        f.rotation.x = -0.15;
        h.add(f);
      }
      const thumb = mesh(at(box(0.018, 0.018, 0.05), 0.045 * mirror, 0.01, -0.02), skin);
      thumb.rotation.y = 0.5 * mirror;
      h.add(thumb);
      const wrist = mesh(at(new THREE.CylinderGeometry(0.045, 0.052, 0.38, 6).rotateX(Math.PI / 2), 0, 0.03, 0.23), sleeve);
      wrist.rotation.x = -0.18;
      h.add(wrist);
      return h;
    };
    const left = makeHand(1);
    left.position.set(x - 0.2, y, z + 0.2);
    left.rotation.y = -0.35;
    this.rightHand = makeHand(-1);
    const pencil = mesh(at(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 6).rotateX(Math.PI / 2), 0, 0, 0), 0xe8b830);
    pencil.position.set(-0.03, 0.03, -0.08);
    pencil.rotation.set(0.5, 0.3, 0);
    this.rightHand.add(pencil);
    this.rightHand.position.set(x + 0.12, y, z + 0.2);
    this.rightHand.rotation.y = 0.3;
    this.hands.add(left, this.rightHand);
    this.scene.add(this.hands);
  }

  /** Move the writing hand to a point on the sheet. */
  handTo(row: number, col: number): THREE.Vector3 {
    const [u, v] = this.sheet.bubbleUV(row, col);
    const p = new THREE.Vector3((u - 0.5) * 0.216, (v - 0.5) * 0.279, 0);
    this.sheetMesh.localToWorld(p);
    return p;
  }

  // ---------------- lights ----------------

  private buildLights(): void {
    this.hemi = new THREE.HemisphereLight(0xdfe7f0, 0x4a4f55, 1.4);
    this.scene.add(this.hemi);
    const panelGeo = box(1.2, 0.03, 0.6);
    for (const x of [-2, 1.4])
      for (const z of [-2.6, 0, 2.6]) {
        const p = new THREE.Mesh(panelGeo, this.panelOn);
        p.position.set(x, ROOM.h - 0.02, z);
        this.panels.push(p);
        this.scene.add(p);
      }
    for (const [x, z] of [
      [-2, -1.6],
      [1.6, -1.6],
      [-2, 2.2],
      [1.6, 2.2],
    ]) {
      const l = new THREE.PointLight(0xe8f0ff, 7, 0, 2);
      l.position.set(x, ROOM.h - 0.3, z);
      this.ceiling.push(l);
      this.scene.add(l);
    }
    this.daylight.position.set(-8, 4, 1);
    this.scene.add(this.daylight);
    this.sirenLight.position.set(ROOM.minX + 0.6, 2.0, 0);
    this.scene.add(this.sirenLight);
  }

  setLights(on: boolean): void {
    this.lightsOn = on;
    this.hemi.intensity = on ? 1.35 : 0.34;
    this.hemi.color.set(on ? 0xdfe7f0 : 0x6f86a8);
    this.ceiling.forEach((l) => (l.visible = on));
    this.panels.forEach((p) => (p.material = on ? this.panelOn : this.panelOff));
    this.daylight.intensity = on ? 0.25 : 0.5;
    this.switchToggle.rotation.z = on ? 0.35 : -0.35;
    (this.scene.fog as THREE.Fog).color.set(on ? 0x0b0e12 : 0x05070a);
  }

  setSiren(level: number): void {
    this.sirenTarget = level;
  }

  // ---------------- per frame ----------------

  update(dt: number): void {
    this.t += dt;
    for (const p of this.people.values()) p.update(dt);
    this.sirenLevel += (this.sirenTarget - this.sirenLevel) * Math.min(1, dt * 0.6);
    const lvl = this.sirenLevel;
    const ph = Math.sin(this.t * 4.2);
    const red = Math.max(0, ph) ** 2;
    const blue = Math.max(0, -ph) ** 2;
    const sc = new THREE.Color(0.9 * red + 0.05 * blue, 0.05, 0.12 * red + 1.0 * blue);
    this.sirenLight.color.copy(sc);
    this.sirenLight.intensity = lvl * (red + blue) * 9;
    const base = new THREE.Color(this.lightsOn ? 0x8da0b3 : 0x46576a);
    this.windowMat.color.copy(base).lerp(sc, Math.min(0.85, lvl * (red + blue)));
    const baseOpacity = this.lightsOn ? 0.0 : 0.22;
    this.stripeMat.opacity = Math.min(0.9, baseOpacity + lvl * (red + blue) * 0.7);
    this.stripeMat.color.set(0x8fa6c4).lerp(sc, Math.min(1, lvl * 1.5));
    // handle rattle
    if (this.rattle > 0) {
      this.rattle = Math.max(0, this.rattle - dt);
      this.door.handle.rotation.x = Math.sin(this.t * 55) * 0.35 * Math.min(1, this.rattle * 3) - 0.15;
    } else this.door.handle.rotation.x *= 0.8;
    // fish
    this.fish.forEach((f, i) => {
      f.position.x = -3.7 + Math.sin(this.t * (0.4 + i * 0.13) + i) * 0.35;
      f.rotation.y = Math.cos(this.t * (0.4 + i * 0.13) + i) > 0 ? 0 : Math.PI;
    });
  }
}
