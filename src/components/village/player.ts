// First-person controller: look, walk, sprint, jump, wade, and climb the
// fort ramp. Collision is a capsule against the world's oriented boxes and
// circles, resolved axis-by-axis so you slide along walls instead of
// sticking to them.

import * as THREE from "three";
import type { Collider, ColliderSet } from "./builder";
import { landHeight, WADE_LIMIT, WATER_Y } from "./terrain";

export const PLAYER_RADIUS = 0.38;
export const PLAYER_HEIGHT = 1.74;
export const EYE_HEIGHT = 1.62;
const STEP_HEIGHT = 0.62;
const GRAVITY = 24;
const JUMP_SPEED = 7.6;
const WALK_SPEED = 4.3;
const SPRINT_SPEED = 8.2;
const WADE_SPEED = 1.9;
const ACCEL_GROUND = 44;
const ACCEL_AIR = 9;
const MAX_PITCH = Math.PI / 2 - 0.02;

export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  /** Analog stick, -1..1, from touch controls. */
  moveX: number;
  moveY: number;
  /** Accumulated look delta in pixels, consumed each frame. */
  lookX: number;
  lookY: number;
}

export function createInputState(): InputState {
  return {
    forward: false,
    back: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
    moveX: 0,
    moveY: 0,
    lookX: 0,
    lookY: 0,
  };
}

export interface PlayerEvents {
  onFootstep?: (surface: "ground" | "wood" | "water") => void;
  onJump?: () => void;
  onLand?: (impact: number) => void;
  onSplash?: () => void;
}

export class Player {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  /** True when the feet are below the waterline. */
  wading = false;
  sensitivity = 0.0021;
  private bobPhase = 0;
  private bobAmount = 0;
  private landDip = 0;
  private stepAccumulator = 0;
  private lastSurface: "ground" | "wood" | "water" = "ground";
  private wasWading = false;

  constructor(
    private colliders: ColliderSet,
    private events: PlayerEvents = {},
  ) {}

  spawn(x: number, z: number, yaw: number) {
    this.position.set(x, landHeight(x, z) + 0.2, z);
    this.yaw = yaw;
    this.pitch = -0.03;
    this.velocity.set(0, 0, 0);
  }

  /**
   * Highest walkable surface under a point, considering the terrain and any
   * deck, stair or rampart the player is standing over.
   */
  supportHeight(x: number, z: number, feetY: number): { y: number; surface: "ground" | "wood" } {
    let best = landHeight(x, z);
    let surface: "ground" | "wood" = "ground";
    const nearby = this.colliders.near(x, z, PLAYER_RADIUS + 0.2);
    for (const c of nearby) {
      if (c.top > feetY + STEP_HEIGHT) continue;
      if (c.top <= best) continue;
      if (!this.overlaps(c, x, z, 0)) continue;
      best = c.top;
      surface = "wood";
    }
    return { y: best, surface };
  }

  private overlaps(c: Collider, x: number, z: number, pad: number): boolean {
    if (c.kind === "circle") {
      return Math.hypot(x - c.cx, z - c.cz) < c.r + pad;
    }
    const dx = x - c.cx;
    const dz = z - c.cz;
    const lx = dx * c.cos - dz * c.sin;
    const lz = dx * c.sin + dz * c.cos;
    return Math.abs(lx) < c.hx + pad && Math.abs(lz) < c.hz + pad;
  }

  /** Push the player out of anything solid at their current height. */
  private resolve(feetY: number) {
    const headY = feetY + PLAYER_HEIGHT;
    const nearby = this.colliders.near(this.position.x, this.position.z, PLAYER_RADIUS + 1.5);
    for (const c of nearby) {
      // Walkable if we are level with the top; passable if we fit underneath.
      if (feetY >= c.top - STEP_HEIGHT) continue;
      if (headY <= c.bottom) continue;

      if (c.kind === "circle") {
        const dx = this.position.x - c.cx;
        const dz = this.position.z - c.cz;
        const dist = Math.hypot(dx, dz);
        const min = c.r + PLAYER_RADIUS;
        if (dist >= min) continue;
        if (dist < 1e-4) {
          this.position.x += min;
          continue;
        }
        const push = (min - dist) / dist;
        this.position.x += dx * push;
        this.position.z += dz * push;
        continue;
      }

      const dx = this.position.x - c.cx;
      const dz = this.position.z - c.cz;
      const lx = dx * c.cos - dz * c.sin;
      const lz = dx * c.sin + dz * c.cos;
      const overlapX = c.hx + PLAYER_RADIUS - Math.abs(lx);
      const overlapZ = c.hz + PLAYER_RADIUS - Math.abs(lz);
      if (overlapX <= 0 || overlapZ <= 0) continue;

      // Eject along whichever local axis is least buried.
      let nx = 0;
      let nz = 0;
      if (overlapX < overlapZ) nx = Math.sign(lx || 1) * overlapX;
      else nz = Math.sign(lz || 1) * overlapZ;
      this.position.x += nx * c.cos + nz * c.sin;
      this.position.z += -nx * c.sin + nz * c.cos;
    }
  }

  update(dt: number, input: InputState, camera: THREE.PerspectiveCamera) {
    // --- look ---------------------------------------------------------
    this.yaw -= input.lookX * this.sensitivity;
    this.pitch -= input.lookY * this.sensitivity;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
    input.lookX = 0;
    input.lookY = 0;

    // --- intent -------------------------------------------------------
    let ix = (input.right ? 1 : 0) - (input.left ? 1 : 0) + input.moveX;
    let iz = (input.forward ? 1 : 0) - (input.back ? 1 : 0) + input.moveY;
    const mag = Math.hypot(ix, iz);
    if (mag > 1) {
      ix /= mag;
      iz /= mag;
    }

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Camera looks down -Z at yaw 0.
    const wishX = ix * cos - iz * sin;
    const wishZ = -ix * sin - iz * cos;

    const feetY = this.position.y;
    const water = feetY < WATER_Y - 0.08;
    this.wading = water;
    if (water && !this.wasWading && this.velocity.lengthSq() > 1) this.events.onSplash?.();
    this.wasWading = water;

    const maxSpeed = water ? WADE_SPEED : input.sprint ? SPRINT_SPEED : WALK_SPEED;
    const accel = this.onGround ? ACCEL_GROUND : ACCEL_AIR;
    const targetX = wishX * maxSpeed;
    const targetZ = wishZ * maxSpeed;
    this.velocity.x += Math.max(-accel * dt, Math.min(accel * dt, targetX - this.velocity.x));
    this.velocity.z += Math.max(-accel * dt, Math.min(accel * dt, targetZ - this.velocity.z));

    if (this.onGround && mag < 0.01) {
      const friction = Math.max(0, 1 - dt * 12);
      this.velocity.x *= friction;
      this.velocity.z *= friction;
    }

    if (input.jump && this.onGround && !water) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
      this.events.onJump?.();
    }
    input.jump = false;

    this.velocity.y -= GRAVITY * dt;
    if (water) this.velocity.y = Math.max(this.velocity.y, -2.5);

    // --- horizontal movement, one axis at a time so we slide on walls ---
    const beforeX = this.position.x;
    this.position.x += this.velocity.x * dt;
    this.resolve(feetY);
    if (this.blockedByWater(this.position.x, this.position.z)) {
      this.position.x = beforeX;
      this.velocity.x = 0;
    }

    const beforeZ = this.position.z;
    this.position.z += this.velocity.z * dt;
    this.resolve(feetY);
    if (this.blockedByWater(this.position.x, this.position.z)) {
      this.position.z = beforeZ;
      this.velocity.z = 0;
    }

    // --- vertical -----------------------------------------------------
    this.position.y += this.velocity.y * dt;
    const support = this.supportHeight(this.position.x, this.position.z, this.position.y);
    if (this.position.y <= support.y) {
      const impact = -this.velocity.y;
      if (!this.onGround && impact > 5) {
        this.landDip = Math.min(0.22, impact * 0.016);
        this.events.onLand?.(impact);
      }
      this.position.y = support.y;
      this.velocity.y = 0;
      this.onGround = true;
      this.lastSurface = water ? "water" : support.surface;
    } else if (this.position.y > support.y + 0.02) {
      // Step up onto a low ledge without needing to jump.
      if (this.onGround && support.y > this.position.y && support.y - this.position.y < STEP_HEIGHT) {
        this.position.y = support.y;
      } else {
        this.onGround = false;
      }
    }

    // --- head bob and footsteps ---------------------------------------
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const targetBob = this.onGround ? Math.min(1, speed / WALK_SPEED) : 0;
    this.bobAmount += (targetBob - this.bobAmount) * Math.min(1, dt * 9);
    this.bobPhase += dt * speed * 1.85;
    this.landDip *= Math.max(0, 1 - dt * 6);

    if (this.onGround && speed > 0.6) {
      this.stepAccumulator += speed * dt;
      const stride = input.sprint ? 2.1 : 1.6;
      if (this.stepAccumulator > stride) {
        this.stepAccumulator = 0;
        this.events.onFootstep?.(water ? "water" : this.lastSurface);
      }
    } else {
      this.stepAccumulator = 1.2;
    }

    // --- camera -------------------------------------------------------
    const bobY = Math.sin(this.bobPhase * 2) * 0.045 * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * 0.035 * this.bobAmount;
    const sway = Math.cos(this.bobPhase) * 0.012 * this.bobAmount;
    const eye = water ? EYE_HEIGHT - 0.25 : EYE_HEIGHT;

    camera.position.set(
      this.position.x + bobX * cos,
      this.position.y + eye + bobY - this.landDip,
      this.position.z - bobX * sin,
    );
    camera.rotation.set(this.pitch, this.yaw, sway, "YXZ");
  }

  /** Deep water is a wall; the shallows are not. */
  private blockedByWater(x: number, z: number): boolean {
    if (landHeight(x, z) >= WADE_LIMIT) return false;
    // Standing on a deck over deep water is fine.
    const support = this.supportHeight(x, z, this.position.y);
    return support.y < WADE_LIMIT;
  }
}
