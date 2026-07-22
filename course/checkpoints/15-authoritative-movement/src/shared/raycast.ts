/**
 * Module 08 — a voxel raycast (Amanatides–Woo "fast voxel traversal", a.k.a.
 * grid DDA). Given a ray, it walks cell-by-cell along the grid — never skipping
 * a cell, never testing empty space twice — and returns the first solid voxel
 * plus which face you entered through. That face normal is what tells us where
 * a *placed* block should go (against the face you're looking at).
 *
 * Pure `src/shared/` again: the client uses it for edit targeting now, and the
 * server will re-run edits through the same reasoning in Part 4.
 */
import { isSolid } from "./blocks";
import { getVoxel, type VoxelWorld } from "./voxel";

export interface VoxelHit {
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
  w: VoxelWorld,
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

  // Current cell.
  let ix = Math.floor(ox);
  let iy = Math.floor(oy);
  let iz = Math.floor(oz);

  // Which way we step along each axis.
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;

  // How far along the ray (in t) between crossing one cell boundary and the next.
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

  // t at which the ray crosses the NEXT boundary on each axis.
  let tMaxX = dx !== 0 ? (dx > 0 ? ix + 1 - ox : ox - ix) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? iy + 1 - oy : oy - iy) * tDeltaY : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? iz + 1 - oz : oz - iz) * tDeltaZ : Infinity;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;

  while (t <= maxDist) {
    if (isSolid(getVoxel(w, ix, iy, iz))) {
      return { x: ix, y: iy, z: iz, nx, ny, nz, dist: t, block: getVoxel(w, ix, iy, iz) };
    }
    // Advance into the neighbor whose boundary is closest along the ray.
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
