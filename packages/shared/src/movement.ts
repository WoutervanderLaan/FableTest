/**
 * The single source of truth for player movement, run by BOTH the client
 * (prediction) and the server (authority). Same code + same voxel state =
 * reconciliation errors stay at floating-point noise.
 */

import { moveWithCollisions } from "./collide";
import { MAX_INPUT_DT, type InputMsg } from "./protocol";
import type { VoxelZone } from "./voxelize";

export const WALK_SPEED = 5.5;
export const RUN_SPEED = 8.5;
export const SWIM_SPEED = 3.0;
export const GRAVITY = 24;
export const WATER_GRAVITY = 5;
export const JUMP_VELOCITY = 8.2;
export const SWIM_UP_VELOCITY = 3.4;
export const WATER_SINK_CAP = -2.2;

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

export function stepPlayer(vz: VoxelZone, p: PlayerPhys, input: InputMsg): void {
  const dt = Math.min(Math.max(input.dt, 0), MAX_INPUT_DT);
  if (dt === 0) return;

  let dx = input.dx;
  let dz = input.dz;
  const len = Math.hypot(dx, dz);
  if (len > 1) {
    dx /= len;
    dz /= len;
  }

  const speed = p.swimming ? SWIM_SPEED : input.run ? RUN_SPEED : WALK_SPEED;
  const control = p.grounded || p.swimming ? 14 : 3;
  p.vx += (dx * speed - p.vx) * Math.min(1, control * dt);
  p.vz += (dz * speed - p.vz) * Math.min(1, control * dt);

  if (p.swimming) {
    p.vy -= WATER_GRAVITY * dt;
    if (p.vy < WATER_SINK_CAP) p.vy = WATER_SINK_CAP;
    if (input.jump) p.vy = SWIM_UP_VELOCITY;
  } else {
    p.vy -= GRAVITY * dt;
    if (input.jump && p.grounded) p.vy = JUMP_VELOCITY;
  }

  const r = moveWithCollisions(vz, p.x, p.y, p.z, p.vx, p.vy, p.vz, dt);
  p.x = Math.max(1.2, Math.min(vz.sizeX - 1.2, r.x));
  p.z = Math.max(1.2, Math.min(vz.sizeZ - 1.2, r.z));
  p.y = r.y;
  p.vx = r.vx;
  p.vy = r.vy;
  p.vz = r.vz;
  p.grounded = r.onGround;
  p.swimming = r.inWater;
}
