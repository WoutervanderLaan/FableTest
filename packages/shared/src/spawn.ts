/** Spawn-point search, shared by server (authoritative spawns) and client
 *  (offline fallback). Spirals out from the zone center looking for STREET
 *  ground with headroom and open sky, so the first view is a street scene. */

import { Block } from "./blocks";
import { getVoxel, surfaceY, type VoxelZone } from "./voxelize";

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
}

export function findSpawn(vz: VoxelZone, jitterSeed = 0): SpawnPoint {
  const cx = Math.floor(vz.sizeX / 2);
  const cz = Math.floor(vz.sizeZ / 2);
  const street = new Set<number>([Block.Asphalt, Block.Pavement]);
  const maxRooftop = vz.waterLevel + 8;

  const clearAbove = (x: number, z: number, y: number): boolean =>
    getVoxel(vz, x, y + 1, z) === Block.Air &&
    getVoxel(vz, x, y + 2, z) === Block.Air &&
    getVoxel(vz, x, y + 3, z) === Block.Air;

  const openness = (x: number, z: number, y: number): number => {
    let open = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const nx = Math.round(x + Math.cos(a) * 4);
      const nz = Math.round(z + Math.sin(a) * 4);
      let blocked = false;
      for (let dy = 1; dy <= 4; dy++) {
        const b = getVoxel(vz, nx, y + dy, nz);
        if (b !== Block.Air && b !== Block.Water && b !== Block.Leaves) {
          blocked = true;
          break;
        }
      }
      if (!blocked) open++;
    }
    return open;
  };

  const candidate = (x: number, z: number, needOpen: number): SpawnPoint | null => {
    if (x < 4 || z < 4 || x >= vz.sizeX - 4 || z >= vz.sizeZ - 4) return null;
    const sy = surfaceY(vz, x, z);
    if (sy > maxRooftop) return null;
    if (!street.has(getVoxel(vz, x, sy, z))) return null;
    if (!clearAbove(x, z, sy)) return null;
    if (openness(x, z, sy) < needOpen) return null;
    return { x: x + 0.5, y: sy + 1.02, z: z + 0.5 };
  };

  // jitterSeed rotates the search start so players don't all stack on the
  // exact same block
  const phase = ((jitterSeed % 16) / 16) * Math.PI * 2;

  for (const needOpen of [5, 1]) {
    for (let r = 2; r < 240; r += 2) {
      const steps = Math.max(8, Math.floor(r * 1.5));
      for (let s = 0; s < steps; s++) {
        const a = phase + (s / steps) * Math.PI * 2;
        const hit = candidate(Math.round(cx + Math.cos(a) * r), Math.round(cz + Math.sin(a) * r), needOpen);
        if (hit) return hit;
      }
    }
  }
  return { x: cx + 0.5, y: surfaceY(vz, cx, cz) + 1.02, z: cz + 0.5 };
}
