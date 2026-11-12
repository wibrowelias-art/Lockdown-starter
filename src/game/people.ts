import * as THREE from 'three';

const matCache = new Map<string, THREE.MeshLambertMaterial>();
export function mat(color: number, emissive = 0): THREE.MeshLambertMaterial {
  const key = `${color}:${emissive}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true, emissive });
    matCache.set(key, m);
  }
  return m;
}

function box(w: number, h: number, d: number, color: number, y = 0): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, y, 0);
  return new THREE.Mesh(g, mat(color));
}

export type HairStyle = 'short' | 'long' | 'bun' | 'curly';
export interface PersonLook {
  shirt: number;
  skin: number;
  hair: number;
  pants: number;
  hairStyle: HairStyle;
  shoes?: number;
  scale?: number;
}

export type Pose = 'stand' | 'sit' | 'crouch' | 'floor' | 'handUp' | 'turnBack';

interface Joints {
  hipY: number;
  lean: number;
  thigh: number;
  shin: number;
  armL: number;
  armR: number;
  spread: number;
  twist: number;
}

const POSES: Record<Pose, Joints> = {
  stand: { hipY: 0.9, lean: 0, thigh: 0, shin: 0, armL: 0.05, armR: 0.05, spread: 0.08, twist: 0 },
  sit: { hipY: 0.48, lean: 0.12, thigh: 1.5708, shin: -1.5708, armL: 1.1, armR: 1.1, spread: 0.05, twist: 0 },
  handUp: { hipY: 0.48, lean: 0.05, thigh: 1.5708, shin: -1.5708, armL: 1.1, armR: 2.9, spread: 0.05, twist: 0 },
  turnBack: { hipY: 0.48, lean: 0.0, thigh: 1.5708, shin: -1.5708, armL: 1.0, armR: 0.3, spread: 0.1, twist: 0.9 },
  crouch: { hipY: 0.55, lean: 0.5, thigh: 1.3, shin: -2.0, armL: 0.6, armR: 0.6, spread: 0.1, twist: 0 },
  floor: { hipY: 0.14, lean: 0.25, thigh: 2.3, shin: -2.1, armL: 0.95, armR: 0.95, spread: 0.12, twist: 0 },
};

export class Person {
  root = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private shinL = new THREE.Group();
  private shinR = new THREE.Group();
  private cur: Joints = { ...POSES.stand };
  private target: Joints = { ...POSES.stand };
  pose: Pose = 'stand';
  walking = false;
  private walkPhase = 0;
  headYaw = 0;
  headPitch = 0;
  private headYawCur = 0;
  private headPitchCur = 0;
  /** 0..1 shaking (fear) */
  tremble = 0;
  private t = Math.random() * 10;
  /** meshes that can be ray-picked */
  pickables: THREE.Object3D[] = [];

  constructor(
    public name: string,
    look: PersonLook,
  ) {
    const s = look.scale ?? 1;
    this.root.scale.setScalar(s);
    this.root.name = name;
    this.root.add(this.hips);

    // torso + shoulders
    const torsoMesh = box(0.36, 0.52, 0.21, look.shirt, 0.26);
    const collar = box(0.2, 0.05, 0.16, look.shirt, 0.53);
    this.torso.add(torsoMesh, collar);
    this.hips.add(this.torso);
    const hipBlock = box(0.34, 0.12, 0.2, look.pants, 0);
    this.hips.add(hipBlock);

    // head
    const headGeo = new THREE.IcosahedronGeometry(0.115, 1);
    headGeo.scale(0.92, 1.08, 0.98);
    const headMesh = new THREE.Mesh(headGeo, mat(look.skin));
    headMesh.position.y = 0.13;
    this.head.add(headMesh);
    const neck = box(0.08, 0.08, 0.08, look.skin, 0.02);
    this.head.add(neck);
    const eyeL = box(0.022, 0.014, 0.01, 0x1a1a1a);
    eyeL.position.set(-0.04, 0.145, -0.105);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.04;
    this.head.add(eyeL, eyeR);
    this.addHair(look);
    this.head.position.y = 0.54;
    this.torso.add(this.head);

    // arms (pivot at shoulder, hanging down -y)
    for (const [arm, x] of [
      [this.armL, -0.23],
      [this.armR, 0.23],
    ] as const) {
      const sleeve = box(0.1, 0.36, 0.1, look.shirt, -0.18);
      const fore = box(0.085, 0.2, 0.085, look.shirt, -0.44);
      const hand = box(0.08, 0.09, 0.05, look.skin, -0.58);
      arm.add(sleeve, fore, hand);
      arm.position.set(x, 0.47, 0);
      this.torso.add(arm);
    }

    // legs (pivot at hip, thigh down -y; shin pivot at knee)
    for (const [leg, shin, x] of [
      [this.legL, this.shinL, -0.09],
      [this.legR, this.shinR, 0.09],
    ] as const) {
      leg.add(box(0.14, 0.44, 0.15, look.pants, -0.22));
      shin.position.y = -0.44;
      shin.add(box(0.12, 0.42, 0.13, look.pants, -0.21));
      const shoe = box(0.12, 0.07, 0.22, look.shoes ?? 0x222222, -0.43);
      shoe.position.z = -0.04;
      shin.add(shoe);
      leg.add(shin);
      leg.position.set(x, -0.02, 0);
      this.hips.add(leg);
    }

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) this.pickables.push(o);
    });
    this.apply();
  }

  private addHair(look: PersonLook): void {
    const hairM = mat(look.hair);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.125, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM);
    cap.position.y = 0.15;
    cap.rotation.x = 0.25;
    this.head.add(cap);
    if (look.hairStyle === 'long') {
      const back = box(0.24, 0.32, 0.08, look.hair, -0.02);
      back.position.set(0, 0.06, 0.08);
      this.head.add(back);
    } else if (look.hairStyle === 'bun') {
      const bun = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), hairM);
      bun.position.set(0, 0.25, 0.08);
      this.head.add(bun);
    } else if (look.hairStyle === 'curly') {
      for (let i = 0; i < 7; i++) {
        const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), hairM);
        const a = (i / 7) * Math.PI * 2;
        c.position.set(Math.cos(a) * 0.09, 0.22 + Math.sin(i) * 0.02, Math.sin(a) * 0.09);
        this.head.add(c);
      }
    }
  }

  setPose(p: Pose, instant = false): void {
    this.pose = p;
    this.target = { ...POSES[p] };
    if (instant) {
      this.cur = { ...this.target };
      this.apply();
    }
  }

  place(x: number, z: number, facing: number): void {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = facing;
  }

  faceTowards(x: number, z: number): void {
    const dx = x - this.root.position.x;
    const dz = z - this.root.position.z;
    if (Math.abs(dx) + Math.abs(dz) < 1e-4) return;
    this.root.rotation.y = Math.atan2(-dx, -dz);
  }

  update(dt: number): void {
    this.t += dt;
    const k = Math.min(1, dt * 5);
    (Object.keys(this.cur) as (keyof Joints)[]).forEach((key) => {
      this.cur[key] += (this.target[key] - this.cur[key]) * k;
    });
    this.headYawCur += (this.headYaw - this.headYawCur) * Math.min(1, dt * 4);
    this.headPitchCur += (this.headPitch - this.headPitchCur) * Math.min(1, dt * 4);
    if (this.walking) this.walkPhase += dt * 7.5;
    this.apply();
  }

  private apply(): void {
    const j = this.cur;
    const swing = this.walking ? Math.sin(this.walkPhase) * 0.5 : 0;
    const bob = this.walking ? Math.abs(Math.cos(this.walkPhase)) * 0.03 : 0;
    const breathe = Math.sin(this.t * 1.6) * 0.006;
    const shake = this.tremble ? (Math.sin(this.t * 37) + Math.sin(this.t * 23)) * 0.006 * this.tremble : 0;
    this.hips.position.y = j.hipY + bob;
    this.hips.position.x = shake;
    this.torso.rotation.x = -j.lean;
    this.torso.rotation.y = j.twist;
    this.torso.scale.y = 1 + breathe;
    this.legL.rotation.x = j.thigh + swing;
    this.legR.rotation.x = j.thigh - swing;
    this.shinL.rotation.x = j.shin - (this.walking ? Math.max(0, -swing) * 0.6 : 0);
    this.shinR.rotation.x = j.shin - (this.walking ? Math.max(0, swing) * 0.6 : 0);
    this.armL.rotation.x = j.armL - swing * 0.8;
    this.armR.rotation.x = j.armR + swing * 0.8;
    this.armL.rotation.z = j.spread;
    this.armR.rotation.z = -j.spread;
    this.head.rotation.y = this.headYawCur + j.twist * 0.5;
    this.head.rotation.x = this.headPitchCur + j.lean * 0.4;
  }
}
