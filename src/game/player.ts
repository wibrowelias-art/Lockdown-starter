import * as THREE from 'three';
import { type Chair, type Collider, ROOM } from './world';

export type Stance = 'seated' | 'stand' | 'crouch';

const EYE: Record<Stance, number> = { seated: 1.12, stand: 1.62, crouch: 0.78 };
export const SPEED = { stand: 1.45, crouch: 0.75, hurry: 2.8 };
export const STEP_LENGTH = 0.7;

export class Player {
  x = 0;
  z = 0;
  yaw = 0;
  pitch = -0.6;
  stance: Stance = 'seated';
  eye = EYE.seated;
  canMove = false;
  canLook = true;
  radius = 0.22;
  seatYaw = 0;
  /** If set, the player walks here by itself (used by tests and scripted moments). */
  autoTarget: { x: number; z: number } | null = null;
  onFootstep: ((hurry: boolean) => void) | null = null;
  onChairBump: ((c: Chair) => void) | null = null;
  /** distance travelled while standing / crouched (for reporting) */
  travelled = { stand: 0, crouch: 0 };
  private stepAcc = 0;
  private stuck = 0;
  private bob = 0;
  private bumpCooldown = 0;
  sway = 0;
  private t = 0;
  /** last frame's movement speed (m/s) */
  speed = 0;

  sitAt(x: number, z: number, yaw = 0): void {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.seatYaw = yaw;
    this.pitch = -0.62;
    this.stance = 'seated';
    this.eye = EYE.seated;
    this.autoTarget = null;
  }

  setStance(s: Stance): void {
    this.stance = s;
  }

  look(dx: number, dy: number): void {
    if (!this.canLook) return;
    this.yaw -= dx;
    this.pitch -= dy;
    this.clampLook();
  }

  private clampLook(): void {
    if (this.stance === 'seated') {
      const rel = THREE.MathUtils.euclideanModulo(this.yaw - this.seatYaw + Math.PI, Math.PI * 2) - Math.PI;
      this.yaw = this.seatYaw + THREE.MathUtils.clamp(rel, -1.9, 1.9);
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.15, 0.45);
    } else {
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.35, 1.25);
    }
  }

  /** Point the view at a world position (used by tests and scripted glances). */
  lookAt(p: THREE.Vector3): void {
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const dy = p.y - this.eye;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    this.clampLook();
  }

  update(dt: number, move: { x: number; y: number }, colliders: Collider[], hurry = false): void {
    this.t += dt;
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    const targetEye = EYE[this.stance];
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 7);
    this.speed = 0;
    if (!this.canMove || this.stance === 'seated') {
      this.autoTarget = null;
      return;
    }

    let vx = 0;
    let vz = 0;
    const speed = hurry ? SPEED.hurry : this.stance === 'crouch' ? SPEED.crouch : SPEED.stand;
    if (this.autoTarget) {
      const dx = this.autoTarget.x - this.x;
      const dz = this.autoTarget.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.06) this.autoTarget = null;
      else {
        const s = Math.min(speed, d / Math.max(dt, 1e-3));
        vx = (dx / d) * s;
        vz = (dz / d) * s;
      }
    } else {
      let mx = move.x;
      let my = move.y;
      const len = Math.hypot(mx, my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw);
      const rz = -Math.sin(this.yaw);
      vx = (fx * my + rx * mx) * speed;
      vz = (fz * my + rz * mx) * speed;
    }
    if (vx === 0 && vz === 0) return;

    // sub-step for stable collisions at high sim speed
    const steps = Math.max(1, Math.ceil((Math.hypot(vx, vz) * dt) / 0.05));
    const sdt = dt / steps;
    let moved = 0;
    for (let i = 0; i < steps; i++) {
      const px = this.x;
      const pz = this.z;
      this.x += vx * sdt;
      this.z += vz * sdt;
      this.collide(colliders, vx, vz);
      moved += Math.hypot(this.x - px, this.z - pz);
    }
    this.speed = moved / dt;
    if (this.autoTarget) {
      this.stuck = this.speed < 0.05 ? this.stuck + dt : 0;
      if (this.stuck > 0.6) {
        this.autoTarget = null;
        this.stuck = 0;
      }
    }
    this.bob += moved * 9;
    this.travelled[this.stance === 'crouch' ? 'crouch' : 'stand'] += moved;
    if (this.stance === 'stand' || hurry) {
      this.stepAcc += moved;
      while (this.stepAcc >= STEP_LENGTH) {
        this.stepAcc -= STEP_LENGTH;
        this.onFootstep?.(hurry);
      }
    }
  }

  private collide(colliders: Collider[], vx: number, vz: number): void {
    const r = this.radius;
    for (let pass = 0; pass < 2; pass++) {
      for (const c of colliders) {
        const minX = c.minX - r;
        const maxX = c.maxX + r;
        const minZ = c.minZ - r;
        const maxZ = c.maxZ + r;
        if (this.x <= minX || this.x >= maxX || this.z <= minZ || this.z >= maxZ) continue;
        const pushL = this.x - minX;
        const pushR = maxX - this.x;
        const pushF = this.z - minZ;
        const pushB = maxZ - this.z;
        const m = Math.min(pushL, pushR, pushF, pushB);
        if (m === pushL) this.x = minX;
        else if (m === pushR) this.x = maxX;
        else if (m === pushF) this.z = minZ;
        else this.z = maxZ;
        if (c.chair && this.stance === 'stand' && this.bumpCooldown <= 0 && Math.hypot(vx, vz) > 0.3) {
          this.bumpCooldown = 1.2;
          this.onChairBump?.(c.chair);
        }
      }
    }
    this.x = THREE.MathUtils.clamp(this.x, ROOM.minX + r, ROOM.maxX - r);
    this.z = THREE.MathUtils.clamp(this.z, ROOM.minZ + r, ROOM.maxZ - r);
  }

  applyTo(cam: THREE.PerspectiveCamera): void {
    const moving = this.speed > 0.05;
    const bobY = moving ? Math.sin(this.bob) * (this.stance === 'crouch' ? 0.012 : 0.025) : 0;
    const swayY = Math.sin(this.t * 1.4) * 0.004 * (1 + this.sway * 3);
    const swayYaw = Math.sin(this.t * 0.9) * 0.002 * this.sway;
    cam.position.set(this.x, this.eye + bobY + swayY, this.z);
    cam.rotation.set(this.pitch, this.yaw + swayYaw, 0, 'YXZ');
  }
}
