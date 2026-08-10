/**
 * Module 07 — the movement step. THE single source of truth for how a player
 * moves, run by BOTH the client (now) and the server (Part 4). Same function +
 * same voxel world = the two sides agree, which is the entire foundation of the
 * prediction/reconciliation you'll build in Module 17.
 *
 * `stepPlayer` takes a player's physics state and one input sample, applies
 * acceleration/gravity/jump, then hands off to the collider. It MUTATES `p` in
 * place — cheap, and convenient for the tight loops that call it.
 */
import { moveWithCollisions } from "./collide";
import type { VoxelWorld } from "./voxel";

export const WALK_SPEED = 5.5;
export const RUN_SPEED = 8.5;
export const SWIM_SPEED = 3.0;
export const GRAVITY = 24;
export const WATER_GRAVITY = 5;
export const JUMP_VELOCITY = 8.2;
export const SWIM_UP_VELOCITY = 3.4;
export const WATER_SINK_CAP = -2.2;

/** Inputs are clamped to this many seconds so one lag spike can't fling you. */
export const MAX_INPUT_DT = 0.1;

/**
 * One frame of intent. `dx`/`dz` is the desired WORLD-space move direction
 * (the client rotates WASD by the camera yaw before filling this in). In Part 4
 * this same shape becomes the network input message.
 */
export interface InputSample {
  dx: number;
  dz: number;
  dt: number;
  jump: boolean;
  run: boolean;
}

export interface PlayerPhys {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  swimming: boolean;
}

export function stepPlayer(w: VoxelWorld, p: PlayerPhys, input: InputSample): void {
  const dt = Math.min(Math.max(input.dt, 0), MAX_INPUT_DT);
  if (dt === 0) return;

  // Normalize the move direction so diagonals aren't faster.
  let dx = input.dx;
  let dz = input.dz;
  const len = Math.hypot(dx, dz);
  if (len > 1) {
    dx /= len;
    dz /= len;
  }

  // Accelerate horizontal velocity toward the target (snappier on the ground,
  // floaty in the air — that `control` factor is the whole "air control" feel).
  const speed = p.swimming ? SWIM_SPEED : input.run ? RUN_SPEED : WALK_SPEED;
  const control = p.grounded || p.swimming ? 14 : 3;
  p.vx += (dx * speed - p.vx) * Math.min(1, control * dt);
  p.vz += (dz * speed - p.vz) * Math.min(1, control * dt);

  // Vertical: gravity + jump (or buoyancy while swimming).
  if (p.swimming) {
    p.vy -= WATER_GRAVITY * dt;
    if (p.vy < WATER_SINK_CAP) p.vy = WATER_SINK_CAP;
    if (input.jump) p.vy = SWIM_UP_VELOCITY;
  } else {
    p.vy -= GRAVITY * dt;
    if (input.jump && p.grounded) p.vy = JUMP_VELOCITY;
  }

  // Hand off to the collider, then commit the resolved state back onto `p`.
  const r = moveWithCollisions(w, p.x, p.y, p.z, p.vx, p.vy, p.vz, dt);
  p.x = Math.max(1.2, Math.min(w.sizeX - 1.2, r.x)); // keep inside the world bounds
  p.z = Math.max(1.2, Math.min(w.sizeZ - 1.2, r.z));
  p.y = r.y;
  p.vx = r.vx;
  p.vy = r.vy;
  p.vz = r.vz;
  p.grounded = r.onGround;
  p.swimming = r.inWater;
}
