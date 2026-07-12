/**
 * Kinematic AABB-vs-voxel collision for the walk controller. Axis-separated
 * move-and-resolve; deliberately dependency-free for Phase 0 (Rapier replaces
 * or augments this in Phase 2, sharing the same WASM build client/server).
 */

import { Block, isSolid } from "./blocks";
import { getVoxel, type VoxelZone } from "./voxelize";

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

/**
 * Move a player AABB (feet-center position) by vel*dt with collision.
 * Substeps so a single frame never tunnels through a 1m block.
 */
export function moveWithCollisions(
  vz: VoxelZone,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vzel: number,
  dt: number,
): MoveResult {
  const maxStep = 0.4; // max movement per substep along any axis
  const speed = Math.max(Math.abs(vx), Math.abs(vy), Math.abs(vzel));
  const steps = Math.max(1, Math.ceil((speed * dt) / maxStep));
  const sdt = dt / steps;

  let onGround = false;
  const p = { x, y, z };
  const v = { x: vx, y: vy, z: vzel };

  for (let s = 0; s < steps; s++) {
    // Y axis
    p.y += v.y * sdt;
    if (collides(vz, p.x, p.y, p.z)) {
      if (v.y < 0) {
        p.y = Math.floor(p.y) + 1 + EPS; // land on top face of the floor cell
        onGround = true;
      } else {
        p.y = Math.floor(p.y + PLAYER.height) - PLAYER.height - EPS; // bump under ceiling cell
      }
      v.y = 0;
    }
    // X axis
    p.x += v.x * sdt;
    if (collides(vz, p.x, p.y, p.z)) {
      if (v.x > 0) p.x = Math.floor(p.x + PLAYER.halfWidth) - PLAYER.halfWidth - EPS;
      else p.x = Math.floor(p.x - PLAYER.halfWidth) + 1 + PLAYER.halfWidth + EPS;
      v.x = 0;
    }
    // Z axis
    p.z += v.z * sdt;
    if (collides(vz, p.x, p.y, p.z)) {
      if (v.z > 0) p.z = Math.floor(p.z + PLAYER.halfWidth) - PLAYER.halfWidth - EPS;
      else p.z = Math.floor(p.z - PLAYER.halfWidth) + 1 + PLAYER.halfWidth + EPS;
      v.z = 0;
    }
  }

  const feetBlock = getVoxel(vz, Math.floor(p.x), Math.floor(p.y + 0.3), Math.floor(p.z));
  const chestBlock = getVoxel(vz, Math.floor(p.x), Math.floor(p.y + 1.0), Math.floor(p.z));
  const inWater = feetBlock === Block.Water || chestBlock === Block.Water;

  return { x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, onGround, inWater };
}

function collides(vz: VoxelZone, x: number, y: number, z: number): boolean {
  const minX = Math.floor(x - PLAYER.halfWidth + EPS);
  const maxX = Math.floor(x + PLAYER.halfWidth - EPS);
  const minY = Math.floor(y + EPS);
  const maxY = Math.floor(y + PLAYER.height - EPS);
  const minZ = Math.floor(z - PLAYER.halfWidth + EPS);
  const maxZ = Math.floor(z + PLAYER.halfWidth - EPS);
  for (let by = minY; by <= maxY; by++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      for (let bx = minX; bx <= maxX; bx++) {
        if (isSolid(getVoxel(vz, bx, by, bz))) return true;
      }
    }
  }
  return false;
}
