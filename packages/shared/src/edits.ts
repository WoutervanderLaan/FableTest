/** Voxel edit application + chunk-dirtying, shared by server and client. */

import { CHUNK, type VoxelZone } from "./voxelize";

/**
 * Set a voxel, returning the previous block id, or null when the edit is
 * structurally invalid (out of bounds, or the y=0 bedrock layer).
 */
export function setVoxelAt(vz: VoxelZone, x: number, y: number, z: number, b: number): number | null {
  if (x < 0 || x >= vz.sizeX || z < 0 || z >= vz.sizeZ) return null;
  if (y < 1 || y >= vz.sizeY) return null; // y=0 is bedrock
  const i = (y * vz.sizeZ + z) * vz.sizeX + x;
  const prev = vz.voxels[i];
  vz.voxels[i] = b;
  return prev;
}

/** Chunks whose mesh is affected by an edit (the chunk + face-adjacent
 *  neighbors when the voxel sits on a chunk boundary). */
export function dirtyChunksFor(vz: VoxelZone, x: number, y: number, z: number): Array<[number, number, number]> {
  const cx = Math.floor(x / CHUNK);
  const cy = Math.floor(y / CHUNK);
  const cz = Math.floor(z / CHUNK);
  const out: Array<[number, number, number]> = [[cx, cy, cz]];
  const maxCx = Math.ceil(vz.sizeX / CHUNK) - 1;
  const maxCy = Math.ceil(vz.sizeY / CHUNK) - 1;
  const maxCz = Math.ceil(vz.sizeZ / CHUNK) - 1;

  if (x % CHUNK === 0 && cx > 0) out.push([cx - 1, cy, cz]);
  if (x % CHUNK === CHUNK - 1 && cx < maxCx) out.push([cx + 1, cy, cz]);
  if (y % CHUNK === 0 && cy > 0) out.push([cx, cy - 1, cz]);
  if (y % CHUNK === CHUNK - 1 && cy < maxCy) out.push([cx, cy + 1, cz]);
  if (z % CHUNK === 0 && cz > 0) out.push([cx, cy, cz - 1]);
  if (z % CHUNK === CHUNK - 1 && cz < maxCz) out.push([cx, cy, cz + 1]);
  return out;
}
