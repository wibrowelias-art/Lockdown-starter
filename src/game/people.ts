import * as THREE from 'three';
import { outline, toon } from './toon';

export type HairStyle = 'short' | 'long' | 'bun' | 'curly';
export interface PersonLook {
  shirt: number;
  skin: number;
  hair: number;
  pants: number;
  hairStyle: HairStyle;
  shoes?: number;
  scale?: number;
  glasses?: boolean;
  bigEyes?: boolean;
}

export type Pose = 'stand' | 'sit' | 'crouch' | 'floor' | 'handUp' | 'turnBack' | 'armsUp' | 'handsUp';

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
  stand: { hipY: 0.88, lean: 0, thigh: 0, shin: 0, armL: 0.05, armR: 0.05, spread: 0.12, twist: 0 },
  sit: { hipY: 0.47, lean: 0.12, thigh: 1.5708, shin: -1.5708, armL: 1.05, armR: 1.05, spread: 0.08, twist: 0 },
  handUp: { hipY: 0.47, lean: 0.05, thigh: 1.5708, shin: -1.5708, armL: 1.05, armR: 2.9, spread: 0.08, twist: 0 },
  turnBack: { hipY: 0.47, lean: 0.0, thigh: 1.5708, shin: -1.5708, armL: 1.0, armR: 0.3, spread: 0.12, twist: 0.9 },
  crouch: { hipY: 0.5, lean: 0.5, thigh: 1.35, shin: -2.05, armL: 0.7, armR: 0.7, spread: 0.12, twist: 0 },
  floor: { hipY: 0.15, lean: 0.25, thigh: 2.3, shin: -2.1, armL: 0.95, armR: 0.95, spread: 0.16, twist: 0 },
  armsUp: { hipY: 0.88, lean: -0.05, thigh: 0, shin: 0, armL: 2.7, armR: 2.7, spread: 0.35, twist: 0 },
  handsUp: { hipY: 0.88, lean: 0, thigh: 0, shin: 0, armL: 2.6, armR: 2.6, spread: 0.2, twist: 0 },
};

function part(geo: THREE.BufferGeometry, color: number, y = 0): THREE.Mesh {
  geo.translate(0, y, 0);
  return new THREE.Mesh(geo, toon(color));
}

export class Person {
  root = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  head = new THREE.Group();
  private mouth: THREE.Mesh;
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
  tremble = 0;
  /** seconds of mouth movement left */
  talking = 0;
  private t = Math.random() * 10;
  pickables: THREE.Object3D[] = [];

  constructor(
    public name: string,
    look: PersonLook,
  ) {
    this.root.scale.setScalar(look.scale ?? 1);
    this.root.name = name;
    this.root.add(this.hips);

    // tube body
    const body = part(new THREE.CapsuleGeometry(0.17, 0.3, 4, 12), look.shirt, 0.3);
    body.scale.set(1, 1, 0.78);
    this.torso.add(body);
    this.hips.add(this.torso);
    this.hips.add(part(new THREE.CapsuleGeometry(0.15, 0.06, 4, 10).rotateZ(Math.PI / 2), look.pants, 0));

    // round cartoon head, big white eyes
    const headMesh = part(new THREE.SphereGeometry(0.16, 20, 16), look.skin, 0.16);
    this.head.add(headMesh);
    const eyeR = look.bigEyes ? 0.058 : 0.045;
    for (const x of [-0.06, 0.06]) {
      const white = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 14, 10), toon(0xffffff));
      white.position.set(x, 0.18, -0.13);
      white.scale.z = 0.6;
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.45, 10, 8), toon(0x15161c));
      pupil.position.set(x, 0.18, -0.13 - eyeR * 0.55);
      pupil.userData.noOutline = true;
      this.head.add(white, pupil);
    }
    this.mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.014, 0.02), toon(0x5a2a2a));
    this.mouth.position.set(0, 0.08, -0.15);
    this.mouth.userData.noOutline = true;
    this.head.add(this.mouth);
    if (look.glasses) {
      for (const x of [-0.06, 0.06]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.009, 6, 18), toon(0x15161c));
        ring.position.set(x, 0.18, -0.165);
        ring.userData.noOutline = true;
        this.head.add(ring);
      }
    }
    this.addHair(look);
    this.head.position.y = 0.55;
    this.torso.add(this.head);

    // arms: tube + round hand, pivot at shoulder
    for (const [arm, x] of [
      [this.armL, -0.21],
      [this.armR, 0.21],
    ] as const) {
      arm.add(part(new THREE.CapsuleGeometry(0.055, 0.36, 4, 8), look.shirt, -0.22));
      arm.add(part(new THREE.SphereGeometry(0.06, 10, 8), look.skin, -0.47));
      arm.position.set(x, 0.46, 0);
      this.torso.add(arm);
    }

    // legs
    for (const [leg, shin, x] of [
      [this.legL, this.shinL, -0.085],
      [this.legR, this.shinR, 0.085],
    ] as const) {
      leg.add(part(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), look.pants, -0.22));
      shin.position.y = -0.44;
      shin.add(part(new THREE.CapsuleGeometry(0.06, 0.3, 4, 8), look.pants, -0.2));
      const shoe = part(new THREE.CapsuleGeometry(0.06, 0.1, 4, 8).rotateX(Math.PI / 2), look.shoes ?? 0x2a2a33, -0.42);
      shoe.position.z = -0.05;
      shin.add(shoe);
      leg.add(shin);
      leg.position.set(x, -0.02, 0);
      this.hips.add(leg);
    }

    outline(this.root, 0.011);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.userData.isHull) this.pickables.push(o);
    });
    this.apply();
  }

  private addHair(look: PersonLook): void {
    const hm = toon(look.hair);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.168, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hm);
    cap.position.y = 0.17;
    cap.rotation.x = 0.35;
    this.head.add(cap);
    if (look.hairStyle === 'long') {
      const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.18, 4, 10), hm);
      back.position.set(0, 0.08, 0.07);
      back.scale.z = 0.6;
      this.head.add(back);
    } else if (look.hairStyle === 'bun') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), hm);
      bun.position.set(0, 0.35, 0.05);
      this.head.add(bun);
    } else if (look.hairStyle === 'curly') {
      for (let i = 0; i < 11; i++) {
        const c = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), hm);
        const a = (i / 11) * Math.PI * 2;
        c.position.set(Math.cos(a) * 0.12, 0.27 + Math.sin(i * 1.7) * 0.03, Math.sin(a) * 0.12 + 0.02);
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

  say(sec: number): void {
    this.talking = Math.max(this.talking, sec);
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
    this.talking = Math.max(0, this.talking - dt);
    this.apply();
  }

  private apply(): void {
    const j = this.cur;
    const swing = this.walking ? Math.sin(this.walkPhase) * 0.5 : 0;
    const bob = this.walking ? Math.abs(Math.cos(this.walkPhase)) * 0.03 : 0;
    const breathe = Math.sin(this.t * 1.7) * 0.012;
    const shake = this.tremble ? (Math.sin(this.t * 37) + Math.sin(this.t * 23)) * 0.006 * this.tremble : 0;
    this.hips.position.y = j.hipY + bob;
    this.hips.position.x = shake;
    this.torso.rotation.x = -j.lean;
    this.torso.rotation.y = j.twist;
    this.torso.scale.set(1 + breathe * 0.5, 1 + breathe, 1 + breathe * 0.5);
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
    this.mouth.scale.y = this.talking > 0 ? 1 + Math.abs(Math.sin(this.t * 18)) * 3.5 : 1;
  }
}
