/**
 * Module 07 — kinematic AABB-vs-voxel collision.
 *
 * The player is a box (an axis-aligned bounding box) that we move one axis at a
 * time, and after each axis we push it back out of any solid block it entered.
 * Resolving axes separately is what lets you slide along a wall instead of
 * sticking to it. We substep so a fast move can't tunnel through a 1m block in
 * a single frame.
 *
 * Pure `src/shared/` code — the client (Module 07) and the server (Part 4) both
 * call it, so a player can never walk through a wall on one side but not the
 * other.
 */
import { Block, isSolid } from "./blocks";
import { getVoxel, type VoxelWorld } from "./voxel";

export const PLAYER = {
  halfWidth: 0.35,
  height: 1.8,
  eyeHeight: 1.62,
} as const;

export interface MoveResult {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
  inWater: boolean;
}

const EPS = 1e-4;

/** Move a player box (feet-center position) by velocity*dt, resolving collisions. */
export function moveWithCollisions(
  w: VoxelWorld,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  dt: number,
): MoveResult {
  const maxStep = 0.4; // never move more than this along an axis per substep
  const speed = Math.max(Math.abs(vx), Math.abs(vy), Math.abs(vz));
  const steps = Math.max(1, Math.ceil((speed * dt) / maxStep));
  const sdt = dt / steps;

  let onGround = false;
  const p = { x, y, z };
  const v = { x: vx, y: vy, z: vz };

  for (let s = 0; s < steps; s++) {
    // --- Y axis ---
    p.y += v.y * sdt;
    if (collides(w, p.x, p.y, p.z)) {
      if (v.y < 0) {
        p.y = Math.floor(p.y) + 1 + EPS; // land on the floor cell's top face
        onGround = true;
      } else {
        p.y = Math.floor(p.y + PLAYER.height) - PLAYER.height - EPS; // bonk the ceiling
      }
      v.y = 0;
    }
    // --- X axis ---
    p.x += v.x * sdt;
    if (collides(w, p.x, p.y, p.z)) {
      if (v.x > 0) p.x = Math.floor(p.x + PLAYER.halfWidth) - PLAYER.halfWidth - EPS;
      else p.x = Math.floor(p.x - PLAYER.halfWidth) + 1 + PLAYER.halfWidth + EPS;
      v.x = 0;
    }
    // --- Z axis ---
    p.z += v.z * sdt;
    if (collides(w, p.x, p.y, p.z)) {
      if (v.z > 0) p.z = Math.floor(p.z + PLAYER.halfWidth) - PLAYER.halfWidth - EPS;
      else p.z = Math.floor(p.z - PLAYER.halfWidth) + 1 + PLAYER.halfWidth + EPS;
      v.z = 0;
    }
  }

  const feet = getVoxel(w, Math.floor(p.x), Math.floor(p.y + 0.3), Math.floor(p.z));
  const chest = getVoxel(w, Math.floor(p.x), Math.floor(p.y + 1.0), Math.floor(p.z));
  const inWater = feet === Block.Water || chest === Block.Water;

  return { x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, onGround, inWater };
}

/** Does the player box at (x,y,z) overlap any solid voxel? */
function collides(w: VoxelWorld, x: number, y: number, z: number): boolean {
  const minX = Math.floor(x - PLAYER.halfWidth + EPS);
  const maxX = Math.floor(x + PLAYER.halfWidth - EPS);
  const minY = Math.floor(y + EPS);
  const maxY = Math.floor(y + PLAYER.height - EPS);
  const minZ = Math.floor(z - PLAYER.halfWidth + EPS);
  const maxZ = Math.floor(z + PLAYER.halfWidth - EPS);
  for (let by = minY; by <= maxY; by++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      for (let bx = minX; bx <= maxX; bx++) {
        if (isSolid(getVoxel(w, bx, by, bz))) return true;
      }
    }
  }
  return false;
}
