/**
 * Structural integrity as a lattice algorithm, not rigid-body physics
 * (plan §3.4): a block is supported iff it connects (6-neighbour) through
 * solid blocks to GROUND. Ground = any solid block at or below the baseline
 * terrain height of its column (so digging pits keeps their walls grounded,
 * and player structures must ultimately stand on the earth).
 *
 * On block removal, each solid neighbour seeds a bounded BFS of its connected
 * component. Component fully enumerated without touching ground → it falls.
 * Budget exceeded → assumed supported (large structures never false-collapse;
 * a too-small budget errs toward stability, never toward demolition).
 */

import { isSolid } from "./blocks";
import { getVoxel, type VoxelZone } from "./voxelize";

export interface UnsupportedBlock {
  x: number;
  y: number;
  z: number;
  b: number;
}

export function collectUnsupported(
  vz: VoxelZone,
  baselineTerrain: Int16Array,
  seeds: Array<[number, number, number]>,
  budget: number,
): UnsupportedBlock[] {
  const falling: UnsupportedBlock[] = [];
  const globallyChecked = new Set<number>();
  const key = (x: number, y: number, z: number) => (y * vz.sizeZ + z) * vz.sizeX + x;
  const groundTop = (x: number, z: number) => baselineTerrain[z * vz.sizeX + x];

  for (const [sx, sy, sz] of seeds) {
    const b0 = getVoxel(vz, sx, sy, sz);
    if (!isSolid(b0)) continue;
    if (sy <= groundTop(sx, sz)) continue; // itself ground
    const k0 = key(sx, sy, sz);
    if (globallyChecked.has(k0)) continue;

    const component: number[] = [k0];
    const visited = new Set<number>([k0]);
    const queue: Array<[number, number, number]> = [[sx, sy, sz]];
    let grounded = false;
    let overBudget = false;

    while (queue.length > 0) {
      const [x, y, z] = queue.pop()!;
      const neighbors: Array<[number, number, number]> = [
        [x - 1, y, z],
        [x + 1, y, z],
        [x, y - 1, z],
        [x, y + 1, z],
        [x, y, z - 1],
        [x, y, z + 1],
      ];
      for (const [nx, ny, nz] of neighbors) {
        if (!isSolid(getVoxel(vz, nx, ny, nz))) continue;
        if (ny <= groundTop(nx, nz) || ny <= 0) {
          grounded = true;
          break;
        }
        const nk = key(nx, ny, nz);
        if (visited.has(nk)) continue;
        visited.add(nk);
        component.push(nk);
        queue.push([nx, ny, nz]);
        if (component.length > budget) {
          overBudget = true;
          break;
        }
      }
      if (grounded || overBudget) break;
    }

    for (const k of visited) globallyChecked.add(k);

    if (!grounded && !overBudget) {
      for (const k of component) {
        const y = Math.floor(k / (vz.sizeZ * vz.sizeX));
        const rem = k % (vz.sizeZ * vz.sizeX);
        const z = Math.floor(rem / vz.sizeX);
        const x = rem % vz.sizeX;
        falling.push({ x, y, z, b: getVoxel(vz, x, y, z) });
      }
    }
  }
  return falling;
}
