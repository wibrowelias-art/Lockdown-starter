import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { irisTexture, repeatSet, type Library } from './materials';

// v3 people: a clean semi-real build (no downloaded rigs). Real proportions, jointed
// limbs (shoulder, elbow, hip, knee, neck), knit/twill/denim fabric, physically based
// skin with pores and sheen (not waxy), hair with strand normals and a soft sheen,
// wet eyes with eyelids that blink. Only Ms. Okafor and Theo get open, readable faces;
// the other students keep their eyes down and are mostly seen from behind.

export type HairStyle = 'short' | 'long' | 'bun' | 'curly' | 'buzz';
export type Top = 'sweater' | 'hoodie' | 'tee' | 'cardigan';

export interface PersonLook {
  shirt: number;
  skin: number;
  hair: number;
  pants: number;
  hairStyle: HairStyle;
  top?: Top;
  /** blouse / undershirt colour */
  inner?: number;
  shoes?: number;
  sole?: number;
  scale?: number;
  glasses?: boolean;
  /** iris colour */
  eyes?: [number, number, number];
  /** open, readable face (Ms. Okafor and Theo only) */
  face?: boolean;
}

export type Pose = 'stand' | 'sit' | 'crouch' | 'floor' | 'handUp' | 'turnBack' | 'armsUp' | 'handsUp';

interface Joints {
  hipY: number;
  lean: number;
  thigh: number;
  shin: number;
  armL: number;
  armR: number;
  elbowL: number;
  elbowR: number;
  spread: number;
  twist: number;
  neck: number;
}

const POSES: Record<Pose, Joints> = {
  stand: { hipY: 0.88, lean: 0, thigh: 0, shin: 0, armL: 0.06, armR: 0.06, elbowL: 0.15, elbowR: 0.15, spread: 0.035, twist: 0, neck: 0 },
  sit: { hipY: 0.47, lean: 0.12, thigh: 1.5708, shin: -1.5708, armL: 0.95, armR: 0.95, elbowL: 0.5, elbowR: 0.5, spread: 0.05, twist: 0, neck: 0 },
  handUp: { hipY: 0.47, lean: 0.05, thigh: 1.5708, shin: -1.5708, armL: 0.95, armR: 2.95, elbowL: 0.5, elbowR: 0.15, spread: 0.05, twist: 0, neck: -0.05 },
  turnBack: { hipY: 0.47, lean: 0, thigh: 1.5708, shin: -1.5708, armL: 0.9, armR: 0.25, elbowL: 0.5, elbowR: 0.4, spread: 0.1, twist: 0.9, neck: 0 },
  crouch: { hipY: 0.455, lean: 0.5, thigh: 1.35, shin: -2.05, armL: 0.6, armR: 0.6, elbowL: 1.0, elbowR: 1.0, spread: 0.12, twist: 0, neck: 0.15 },
  floor: { hipY: 0.15, lean: 0.25, thigh: 2.3, shin: -2.1, armL: 0.75, armR: 0.75, elbowL: 1.3, elbowR: 1.3, spread: 0.18, twist: 0, neck: 0.3 },
  armsUp: { hipY: 0.88, lean: -0.05, thigh: 0, shin: 0, armL: 2.7, armR: 2.7, elbowL: 0.1, elbowR: 0.1, spread: 0.35, twist: 0, neck: 0 },
  handsUp: { hipY: 0.88, lean: 0, thigh: 0, shin: 0, armL: 2.6, armR: 2.6, elbowL: 0.5, elbowR: 0.5, spread: 0.2, twist: 0, neck: 0 },
};
const KEYS = Object.keys(POSES.stand) as (keyof Joints)[];

// body dimensions (metres, scale 1 = a ~1.7 m teenager)
const SHOULDER_X = 0.158;
const SHOULDER_Y = 0.44;
const UPPER_ARM = 0.27;
const FOREARM = 0.24;
const THIGH = 0.43;
const SHIN = 0.37;
const NECK_TOP = 0.565;
const HEAD_C = 0.105;

function rb(w: number, h: number, d: number, r: number, seg = 3): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
}

/** Shared material factory per library (keeps the number of programs/materials low). */
class Wardrobe {
  private cache = new Map<string, THREE.Material>();
  private skinSet;
  constructor(private lib: Library) {
    this.skinSet = repeatSet(lib.skin, 4, 3);
  }
  private get<T extends THREE.Material>(key: string, make: () => T): T {
    let m = this.cache.get(key) as T | undefined;
    if (!m) {
      m = make();
      this.cache.set(key, m);
    }
    return m;
  }
  skin(c: number): THREE.MeshPhysicalMaterial {
    return this.get(`skin${c}`, () => {
      const col = new THREE.Color(c);
      return new THREE.MeshPhysicalMaterial({
        color: col,
        map: this.skinSet.map,
        normalMap: this.skinSet.normalMap,
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughnessMap: this.skinSet.roughnessMap,
        roughness: 1,
        sheen: 0.35,
        sheenRoughness: 0.55,
        sheenColor: col.clone().lerp(new THREE.Color(0xff5a3c), 0.55).multiplyScalar(0.55),
      });
    });
  }
  lips(c: number): THREE.MeshStandardMaterial {
    return this.get(`lips${c}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiply(new THREE.Color(0.86, 0.6, 0.58)), roughness: 0.42 }));
  }
  fabric(c: number, kind: 'knit' | 'twill' | 'fleece' | 'denim' | 'canvas', rep = 4): THREE.MeshPhysicalMaterial {
    return this.get(`fab${c}${kind}${rep}`, () => {
      const base = kind === 'knit' || kind === 'fleece' ? this.lib.knit : this.lib.twill;
      const n = base.normalMap.clone();
      n.repeat.set(rep, rep);
      const r = base.roughnessMap.clone();
      r.repeat.set(rep, rep);
      const ns = kind === 'knit' ? 0.7 : kind === 'fleece' ? 0.3 : kind === 'denim' ? 0.9 : 0.5;
      const col = new THREE.Color(c);
      return new THREE.MeshPhysicalMaterial({
        color: col,
        normalMap: n,
        normalScale: new THREE.Vector2(ns, ns),
        roughnessMap: r,
        roughness: 1,
        sheen: kind === 'denim' || kind === 'canvas' ? 0.25 : 0.7,
        sheenRoughness: 0.8,
        sheenColor: col.clone().lerp(new THREE.Color(0xffffff), 0.4).multiplyScalar(0.5),
      });
    });
  }
  hair(c: number, curly: boolean): THREE.MeshPhysicalMaterial {
    return this.get(`hair${c}${curly}`, () => {
      const set = curly ? this.lib.curls : this.lib.hair;
      const n = set.normalMap.clone();
      n.repeat.set(curly ? 3 : 2, curly ? 3 : 1);
      const col = new THREE.Color(c);
      return new THREE.MeshPhysicalMaterial({
        color: col,
        normalMap: n,
        normalScale: new THREE.Vector2(0.9, 0.9),
        roughnessMap: set.roughnessMap,
        roughness: 1,
        sheen: 1,
        sheenRoughness: 0.35,
        sheenColor: col.clone().lerp(new THREE.Color(0xd8c8b0), 0.35),
        side: THREE.DoubleSide,
      });
    });
  }
  plain(c: number, rough: number, metal = 0): THREE.MeshStandardMaterial {
    return this.get(`p${c}${rough}${metal}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }));
  }
  eyeWhite(): THREE.MeshPhysicalMaterial {
    return this.get('eyew', () => new THREE.MeshPhysicalMaterial({ color: 0xe9e2d8, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03 }));
  }
  iris(rgb: [number, number, number]): THREE.MeshPhysicalMaterial {
    return this.get(`iris${rgb.join()}`, () => new THREE.MeshPhysicalMaterial({ map: irisTexture(rgb), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02 }));
  }
  lens(): THREE.MeshPhysicalMaterial {
    return this.get('lens', () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.04, clearcoat: 1, depthWrite: false }));
  }
}

const wardrobes = new WeakMap<Library, Wardrobe>();
function wardrobe(lib: Library): Wardrobe {
  let w = wardrobes.get(lib);
  if (!w) {
    w = new Wardrobe(lib);
    wardrobes.set(lib, w);
  }
  return w;
}

/** Physically based skin material (shared per colour). */
export function skinMaterial(lib: Library, color: number): THREE.MeshPhysicalMaterial {
  return wardrobe(lib).skin(color);
}

/** Knit sleeve material (first-person arms). */
export function knitMaterial(lib: Library, color: number): THREE.MeshPhysicalMaterial {
  return wardrobe(lib).fabric(color, 'knit', 3);
}

/** Head shape: an egg with a tapered jaw and a fuller back of the skull. */
function headGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 40, 30);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    let sx = 0.08;
    const sy = 0.11;
    let sz = 0.096;
    if (y < 0) {
      const t = -y;
      sx *= 1 - 0.3 * t * t;
      sz *= 1 - 0.08 * t * t;
    }
    if (z > 0) sz *= 1.05;
    let Z = z * sz;
    if (y < -0.55 && z < 0) Z -= 0.012 * ((-y - 0.55) / 0.45) * -z;
    p.setXYZ(i, x * sx, y * sy, Z);
  }
  g.computeVertexNormals();
  return g;
}
let HEAD_GEO: THREE.BufferGeometry | null = null;

/** A hand hanging down (fingers along -y); the palm faces +x when side = -1 (left), -x when side = 1. */
export function buildHand(skin: THREE.Material, side: number): THREE.Group {
  const h = new THREE.Group();
  const palm = new THREE.Mesh(rb(0.026, 0.085, 0.074, 0.011), skin);
  palm.position.y = -0.045;
  h.add(palm);
  for (let i = 0; i < 4; i++) {
    const len = 0.05 - Math.abs(i - 1.3) * 0.006;
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, len, 3, 8), skin);
    f.geometry.translate(0, -len / 2 - 0.006, 0);
    f.position.set(0, -0.088, -0.027 + i * 0.018);
    f.rotation.z = -0.22 * side;
    h.add(f);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0105, 0.035, 3, 8), skin);
  thumb.geometry.translate(0, -0.022, 0);
  thumb.position.set(-0.006 * side, -0.03, -0.034);
  thumb.rotation.set(-0.55, 0, -0.2 * side);
  h.add(thumb);
  return h;
}

export class Person {
  root = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private chest!: THREE.Mesh;
  head = new THREE.Group();
  private mouth!: THREE.Mesh;
  private lowerLip!: THREE.Mesh;
  private lids: THREE.Mesh[] = [];
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private elbowL = new THREE.Group();
  private elbowR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private shinL = new THREE.Group();
  private shinR = new THREE.Group();
  private cur: Joints = { ...POSES.stand };
  private vel: Joints = Object.fromEntries(KEYS.map((k) => [k, 0])) as unknown as Joints;
  private target: Joints = { ...POSES.stand };
  pose: Pose = 'stand';
  walking = false;
  private walkPhase = 0;
  private gait = 0;
  private lastX = 0;
  private lastZ = 0;
  headYaw = 0;
  headPitch = 0;
  private headYawCur = 0;
  private headPitchCur = 0;
  tremble = 0;
  /** 0..1: the camera is too close to this face, so the head turns down/away */
  shy = 0;
  /** which way to turn the face away (set from the side the camera is on) */
  shyDir = 1;
  /** seconds of mouth movement left */
  talking = 0;
  private t = Math.random() * 10;
  private blinkIn = 1 + Math.random() * 3;
  private blinking = 0;
  private lidOpen: number;
  private height: number;
  pickables: THREE.Object3D[] = [];

  constructor(
    public name: string,
    look: PersonLook,
    lib: Library,
  ) {
    const W = wardrobe(lib);
    const scale = look.scale ?? 1;
    this.height = scale;
    this.root.scale.setScalar(scale);
    this.root.name = name;
    this.root.add(this.hips);
    this.lidOpen = look.face ? 0.4 : 0.02;

    const top = look.top ?? 'sweater';
    const topMat = W.fabric(look.shirt, top === 'tee' ? 'twill' : top === 'hoodie' ? 'fleece' : 'knit', top === 'tee' ? 8 : 5);
    const skin = W.skin(look.skin);
    const pants = W.fabric(look.pants, 'denim', 6);
    const shoe = W.fabric(look.shoes ?? 0x2a2c33, 'canvas', 3);
    const sole = W.plain(look.sole ?? 0xe6e2da, 0.8);

    // pelvis + torso (lathe profile, flattened front-to-back)
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), pants);
    pelvis.scale.set(0.15, 0.1, 0.1);
    pelvis.position.y = 0.02;
    this.hips.add(pelvis);
    const prof = [
      [0.128, -0.04],
      [0.136, 0.04],
      [0.13, 0.14],
      [0.138, 0.24],
      [0.152, 0.33],
      [0.156, 0.38],
      [0.145, 0.43],
      [0.118, 0.475],
      [0.08, 0.505],
      [0.05, 0.525],
      [0.001, 0.532],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    this.chest = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), topMat);
    this.chest.scale.z = 0.68;
    this.torso.add(this.chest);
    this.hips.add(this.torso);
    if (top !== 'tee') {
      const hem = new THREE.Mesh(new THREE.TorusGeometry(0.133, 0.012, 6, 28).rotateX(Math.PI / 2), topMat);
      hem.scale.z = 0.68;
      hem.position.y = -0.03;
      this.torso.add(hem);
    }
    this.addTopDetails(top, look, W, topMat);

    // neck + head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.045, 0.1, 14), skin);
    neck.position.y = 0.53;
    this.torso.add(neck);
    this.head.position.y = NECK_TOP;
    this.torso.add(this.head);
    this.buildHead(look, W, skin);

    // arms: shoulder -> elbow -> hand
    const longSleeve = top !== 'tee';
    for (const [arm, elbow, side] of [
      [this.armL, this.elbowL, -1],
      [this.armR, this.elbowR, 1],
    ] as const) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), topMat);
      cap.scale.set(0.9, 0.8, 0.95);
      cap.position.set(-side * 0.008, -0.004, 0);
      arm.add(cap);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(longSleeve ? 0.045 : 0.04, longSleeve ? 0.042 : 0.035, UPPER_ARM, 14), longSleeve ? topMat : skin);
      upper.position.y = -UPPER_ARM / 2;
      arm.add(upper);
      if (!longSleeve) {
        const sl = new THREE.Mesh(new THREE.CapsuleGeometry(0.053, 0.06, 4, 12), topMat);
        sl.position.y = -0.06;
        arm.add(sl);
      }
      elbow.position.y = -UPPER_ARM;
      const elbowBall = new THREE.Mesh(new THREE.SphereGeometry(longSleeve ? 0.042 : 0.035, 14, 10), longSleeve ? topMat : skin);
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(longSleeve ? 0.042 : 0.034, longSleeve ? 0.039 : 0.028, FOREARM - 0.02, 14), longSleeve ? topMat : skin);
      fore.position.y = -FOREARM / 2 + 0.01;
      elbow.add(elbowBall, fore);
      if (longSleeve) {
        const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.009, 6, 16).rotateX(Math.PI / 2), topMat);
        cuff.position.y = -FOREARM + 0.012;
        elbow.add(cuff);
      }
      const hand = buildHand(skin, side);
      hand.position.y = -FOREARM;
      elbow.add(hand);
      arm.add(elbow);
      arm.position.set(side * SHOULDER_X, SHOULDER_Y, 0);
      this.torso.add(arm);
    }

    // legs: hip -> knee -> shoe
    for (const [leg, shin, side] of [
      [this.legL, this.shinL, -1],
      [this.legR, this.shinR, 1],
    ] as const) {
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.056, THIGH, 14), pants);
      thigh.position.y = -THIGH / 2;
      const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.074, 14, 10), pants);
      leg.add(thigh, hipBall);
      shin.position.y = -THIGH;
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.057, 12, 10), pants);
      const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.045, SHIN, 14), pants);
      calf.position.y = -SHIN / 2;
      shin.add(knee, calf);
      const foot = new THREE.Group();
      foot.position.y = -SHIN;
      const upperShoe = new THREE.Mesh(rb(0.092, 0.07, 0.25, 0.03), shoe);
      upperShoe.position.set(0, -0.022, -0.055);
      const soleM = new THREE.Mesh(rb(0.098, 0.026, 0.262, 0.012), sole);
      soleM.position.set(0, -0.047, -0.055);
      foot.add(upperShoe, soleM);
      shin.add(foot);
      leg.add(shin);
      leg.position.set(side * 0.085, -0.02, 0);
      this.hips.add(leg);
    }

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) this.pickables.push(o);
    });
    this.apply(0);
  }

  private addTopDetails(top: Top, look: PersonLook, W: Wardrobe, topMat: THREE.Material): void {
    if (top === 'hoodie') {
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.032, 8, 20, Math.PI).rotateX(Math.PI / 2), topMat);
      hood.scale.set(1, 1.5, 0.75);
      hood.position.set(0, 0.49, 0.012);
      this.torso.add(hood);
      const pocket = new THREE.Mesh(rb(0.2, 0.1, 0.02, 0.008), topMat);
      pocket.position.set(0, 0.11, -0.088);
      this.torso.add(pocket);
      const cord = W.plain(look.inner ?? 0xe8e4dc, 0.7);
      for (const x of [-0.03, 0.03]) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.12, 5), cord);
        c.position.set(x, 0.42, -0.106);
        c.rotation.x = -0.15;
        this.torso.add(c);
      }
    } else if (top === 'cardigan') {
      const blouse = W.fabric(look.inner ?? 0xf2efe8, 'twill', 6);
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.013, 6, 18).rotateX(Math.PI / 2), blouse);
      collar.position.y = 0.505;
      collar.scale.z = 0.85;
      this.torso.add(collar);
      const placket = new THREE.Mesh(rb(0.036, 0.1, 0.01, 0.004), blouse);
      placket.position.set(0, 0.45, -0.1);
      placket.rotation.x = 0.12;
      this.torso.add(placket);
      const btn = W.plain(0x4a3a2a, 0.4);
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 8, 6), btn);
        b.position.set(0.035, 0.06 + i * 0.075, -(0.09 + i * 0.006));
        this.torso.add(b);
      }
    } else {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.008, 6, 18).rotateX(Math.PI / 2), topMat);
      rib.position.y = 0.515;
      this.torso.add(rib);
    }
  }

  private buildHead(look: PersonLook, W: Wardrobe, skin: THREE.Material): void {
    const f = new THREE.Group();
    f.position.y = HEAD_C;
    this.head.add(f);
    HEAD_GEO ??= headGeometry();
    f.add(new THREE.Mesh(HEAD_GEO, skin));

    // ears
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), skin);
      ear.scale.set(0.011, 0.028, 0.019);
      ear.position.set(s * 0.077, -0.006, 0.01);
      ear.rotation.y = s * -0.3;
      f.add(ear);
    }
    // nose: bridge, tip, wings
    const bridge = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), skin);
    bridge.scale.set(0.009, 0.026, 0.012);
    bridge.position.set(0, -0.014, -0.092);
    bridge.rotation.x = 0.25;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), skin);
    tip.scale.set(0.012, 0.011, 0.012);
    tip.position.set(0, -0.036, -0.101);
    f.add(bridge, tip);
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), skin);
      wing.scale.set(0.008, 0.007, 0.008);
      wing.position.set(s * 0.011, -0.04, -0.094);
      f.add(wing);
    }
    // eyes: wet eyeball, iris cap, upper lid (blinks), brow
    const irisRGB = look.eyes ?? [92, 60, 38];
    const brow = W.plain(new THREE.Color(look.hair).multiplyScalar(0.8).getHex(), 0.8);
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(s * 0.03, 0.0, -0.081);
      eye.rotation.x = look.face ? 0 : -0.3;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), W.eyeWhite());
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.01205, 16, 4, 0, Math.PI * 2, 0, 0.5).rotateX(-Math.PI / 2), W.iris(irisRGB));
      eye.add(ball, iris);
      f.add(eye);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0131, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), skin);
      lid.position.copy(eye.position);
      lid.rotation.x = this.lidOpen;
      this.lids.push(lid);
      f.add(lid);
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.0036, 0.024, 3, 6).rotateZ(Math.PI / 2), brow);
      b.position.set(s * 0.031, 0.025, -0.089);
      b.rotation.z = s * -0.1;
      b.rotation.y = s * 0.25;
      f.add(b);
    }
    // mouth: lips + dark inner mouth that opens when talking
    const lips = W.lips(look.skin);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.0042, 0.026, 3, 8).rotateZ(Math.PI / 2), lips);
    upper.position.set(0, -0.057, -0.089);
    upper.scale.z = 0.8;
    this.lowerLip = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.021, 3, 8).rotateZ(Math.PI / 2), lips);
    this.lowerLip.position.set(0, -0.066, -0.087);
    this.lowerLip.scale.z = 0.8;
    this.mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), W.plain(0x2a1414, 0.9));
    this.mouth.scale.set(0.015, 0.002, 0.004);
    this.mouth.position.set(0, -0.0615, -0.087);
    f.add(upper, this.lowerLip, this.mouth);

    this.addHair(look, W, f);
    if (look.glasses) {
      const frame = W.plain(0x2a2522, 0.35, 0.8);
      for (const s of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0017, 6, 24), frame);
        ring.scale.y = 0.75;
        ring.position.set(s * 0.031, 0.0, -0.101);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.018, 20), W.lens());
        lens.scale.y = 0.75;
        lens.position.copy(ring.position);
        lens.rotation.y = Math.PI;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.002, 0.095), frame);
        arm.position.set(s * 0.076, 0.004, -0.05);
        arm.rotation.y = s * 0.12;
        f.add(ring, lens, arm);
      }
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.024, 5).rotateZ(Math.PI / 2), frame);
      br.position.set(0, 0.004, -0.104);
      f.add(br);
    }
  }

  private addHair(look: PersonLook, W: Wardrobe, f: THREE.Group): void {
    const curly = look.hairStyle === 'curly';
    const hm = W.hair(look.hair, curly);
    const k = { short: 1.08, long: 1.09, bun: 1.07, curly: 1.17, buzz: 1.025 }[look.hairStyle];
    const capGeo = new THREE.SphereGeometry(1, 36, 18, 0, Math.PI * 2, 0, Math.PI * 0.56).rotateX(0.62).scale(0.08 * k, 0.11 * (k - 0.02), 0.096 * k * 1.03);
    const cap = new THREE.Mesh(capGeo, hm);
    cap.position.z = 0.003;
    f.add(cap);
    if (look.hairStyle === 'long') {
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.094, 0.112, 0.25, 28, 1, true, -1.9, 3.8), hm);
      back.position.set(0, -0.08, 0.008);
      back.scale.z = 0.92;
      f.add(back);
    } else if (look.hairStyle === 'bun') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.042, 16, 12), hm);
      bun.position.set(0, 0.08, 0.082);
      bun.scale.set(1, 0.9, 0.85);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 6, 16), W.plain(0x2a2a30, 0.6));
      tie.position.set(0, 0.062, 0.062);
      tie.rotation.x = 0.9;
      f.add(bun, tie);
    } else if (curly) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const up = 0.35 + (i % 3) * 0.22;
        const r = 0.03 + ((i * 7) % 5) * 0.004;
        const c = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), hm);
        const dir = new THREE.Vector3(Math.cos(a) * Math.cos(up), Math.sin(up), Math.sin(a) * Math.cos(up));
        if (dir.z < -0.4 && dir.y < 0.6) continue; // keep the forehead clear
        c.position.set(dir.x * 0.085, dir.y * 0.105 + 0.01, dir.z * 0.095 + 0.008);
        f.add(c);
      }
    }
  }

  setPose(p: Pose, instant = false): void {
    this.pose = p;
    this.target = { ...POSES[p] };
    if (instant) {
      this.cur = { ...this.target };
      KEYS.forEach((k) => (this.vel[k] = 0));
      this.apply(0);
    }
  }

  place(x: number, z: number, facing: number): void {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = facing;
    this.lastX = x;
    this.lastZ = z;
  }

  faceTowards(x: number, z: number): void {
    const dx = x - this.root.position.x;
    const dz = z - this.root.position.z;
    if (Math.abs(dx) + Math.abs(dz) < 1e-4) return;
    this.root.rotation.y = Math.atan2(-dx, -dz);
  }

  say(sec: number): void {
    this.talking = Math.max(this.talking, sec);
  }

  update(dt: number): void {
    this.t += dt;
    // smooth, critically damped joints (crouch / stand / sit without snapping)
    const w = 7;
    const steps = Math.max(1, Math.ceil(dt / 0.02));
    const h = dt / steps;
    for (let s = 0; s < steps; s++)
      for (const key of KEYS) {
        const a = (this.target[key] - this.cur[key]) * w * w - 2 * w * this.vel[key];
        this.vel[key] += a * h;
        this.cur[key] += this.vel[key] * h;
      }
    this.headYawCur += (this.headYaw - this.headYawCur) * Math.min(1, dt * 4);
    this.headPitchCur += (this.headPitch - this.headPitchCur) * Math.min(1, dt * 4);
    // gait from distance actually travelled: feet don't slide
    const pos = this.root.position;
    let dist = Math.hypot(pos.x - this.lastX, pos.z - this.lastZ);
    this.lastX = pos.x;
    this.lastZ = pos.z;
    if (dist > 0.5) dist = 0; // teleport
    const speed = dt > 0 ? dist / dt : 0;
    const want = this.walking || speed > 0.12 ? Math.min(1, speed / 1.0) : 0;
    this.gait += (want - this.gait) * Math.min(1, dt * 8);
    const amp = 0.42 * this.gait;
    if (amp > 0.01) this.walkPhase += (dist / Math.max(0.2, 4 * 0.86 * this.height * Math.sin(amp))) * Math.PI * 2;
    this.talking = Math.max(0, this.talking - dt);
    // blinking
    this.blinkIn -= dt;
    if (this.blinkIn < 0) {
      this.blinking = 0.14;
      this.blinkIn = 2.5 + Math.random() * 4;
    }
    this.blinking = Math.max(0, this.blinking - dt);
    this.apply(amp);
  }

  private apply(amp: number): void {
    const j = this.cur;
    const ph = this.walkPhase;
    const swing = Math.sin(ph) * amp;
    const bob = (Math.abs(Math.cos(ph)) - 0.5) * 0.03 * this.gait;
    const fear = Math.min(1, this.tremble);
    const breath = Math.sin(this.t * Math.PI * 2 * (0.27 + fear * 0.2));
    const shake = this.tremble ? (Math.sin(this.t * 37) + Math.sin(this.t * 23)) * 0.004 * this.tremble : 0;
    this.hips.position.y = j.hipY + bob;
    this.hips.position.x = shake;
    this.torso.rotation.x = -j.lean - 0.04 * this.gait;
    this.torso.rotation.y = j.twist - swing * 0.15;
    this.chest.scale.set(1 + breath * 0.008, 1 + breath * 0.005, 0.68 * (1 + breath * 0.025));
    this.legL.rotation.x = j.thigh + swing;
    this.legR.rotation.x = j.thigh - swing;
    this.shinL.rotation.x = j.shin - Math.max(0, Math.cos(ph)) * 0.75 * this.gait;
    this.shinR.rotation.x = j.shin - Math.max(0, -Math.cos(ph)) * 0.75 * this.gait;
    this.armL.rotation.x = j.armL - swing * 0.7;
    this.armR.rotation.x = j.armR + swing * 0.7;
    this.armL.rotation.z = -j.spread - shake * 2;
    this.armR.rotation.z = j.spread + shake * 2;
    this.armL.position.y = this.armR.position.y = SHOULDER_Y + breath * 0.003;
    this.elbowL.rotation.x = j.elbowL + 0.15 * this.gait;
    this.elbowR.rotation.x = j.elbowR + 0.15 * this.gait;
    const micro = Math.sin(this.t * 0.63) * 0.03 + Math.sin(this.t * 1.37 + 1) * 0.015;
    this.head.rotation.y = this.headYawCur + j.twist * 0.5 + micro + this.shy * this.shyDir;
    this.head.rotation.x = this.headPitchCur + j.lean * 0.4 - j.neck - this.shy * 0.5 + Math.sin(this.t * 0.91) * 0.015 + shake * 3;
    const lid = this.blinking > 0 ? -1.4 : this.lidOpen - this.shy * 0.5;
    for (const l of this.lids) l.rotation.x = lid;
    const open = this.talking > 0 ? Math.abs(Math.sin(this.t * 14)) * 0.004 : 0;
    this.mouth.scale.y = 0.002 + open;
    this.lowerLip.position.y = -0.066 - open * 0.9;
  }
}
