/** Amanatides–Woo DDA voxel raycast, used for edit targeting. */

import { isSolid } from "./blocks";
import { getVoxel, type VoxelZone } from "./voxelize";

export interface VoxelHit {
  /** The solid voxel that was hit. */
  x: number;
  y: number;
  z: number;
  /** Unit normal of the face entered (points back toward the ray origin). */
  nx: number;
  ny: number;
  nz: number;
  dist: number;
  block: number;
}

export function raycastVoxel(
  vz: VoxelZone,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
): VoxelHit | null {
  const len = Math.hypot(dx, dy, dz);
  if (len === 0) return null;
  dx /= len;
  dy /= len;
  dz /= len;

  let ix = Math.floor(ox);
  let iy = Math.floor(oy);
  let iz = Math.floor(oz);

  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

  let tMaxX = dx !== 0 ? (dx > 0 ? ix + 1 - ox : ox - ix) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? iy + 1 - oy : oy - iy) * tDeltaY : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? iz + 1 - oz : oz - iz) * tDeltaZ : Infinity;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;

  while (t <= maxDist) {
    const b = getVoxel(vz, ix, iy, iz);
    if (isSolid(b)) {
      return { x: ix, y: iy, z: iz, nx, ny, nz, dist: t, block: b };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      ix += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      iy += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      iz += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
  }
  return null;
}
