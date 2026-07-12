/**
 * Zonepack loading: fetch → (gzip) decompress → decode → voxelize.
 * Voxelization happens on the main thread once (~100 ms) because the
 * collider needs synchronous voxel access; workers get a copy for meshing.
 */

import {
  Block,
  decodeZonepack,
  getVoxel,
  surfaceY,
  voxelize,
  type VoxelZone,
  type Zonepack,
} from "@ruderal/shared";

export interface LoadedZone {
  pack: Zonepack;
  vz: VoxelZone;
  spawn: { x: number; y: number; z: number };
}

export async function loadZone(url: string): Promise<LoadedZone> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`zone fetch failed: ${res.status}`);
  let bytes = new Uint8Array(await res.arrayBuffer());
  // .gz may arrive raw or transparently decoded depending on the server
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const ds = new DecompressionStream("gzip");
    const stream = new Response(new Blob([bytes as BufferSource]).stream().pipeThrough(ds));
    bytes = new Uint8Array(await stream.arrayBuffer());
  }
  const pack = decodeZonepack(bytes);
  const vz = voxelize(pack);
  return { pack, vz, spawn: findSpawn(vz) };
}

/** Spiral out from the zone center looking for STREET ground (not courtyard
 *  grass): road/pavement top block, headroom, and open sky around it so the
 *  first view is a street scene, not the inside of a lightwell. */
export function findSpawn(vz: VoxelZone): { x: number; y: number; z: number } {
  const cx = Math.floor(vz.sizeX / 2);
  const cz = Math.floor(vz.sizeZ / 2);
  const street = new Set<number>([Block.Asphalt, Block.Pavement]);
  const maxRooftop = vz.waterLevel + 8;

  const clearAbove = (x: number, z: number, y: number): boolean =>
    getVoxel(vz, x, y + 1, z) === Block.Air &&
    getVoxel(vz, x, y + 2, z) === Block.Air &&
    getVoxel(vz, x, y + 3, z) === Block.Air;

  /** openness: of 8 compass points 4 blocks away, how many have low skyline? */
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

  const candidate = (x: number, z: number, needOpen: number): { x: number; y: number; z: number } | null => {
    if (x < 4 || z < 4 || x >= vz.sizeX - 4 || z >= vz.sizeZ - 4) return null;
    const sy = surfaceY(vz, x, z);
    if (sy > maxRooftop) return null;
    if (!street.has(getVoxel(vz, x, sy, z))) return null;
    if (!clearAbove(x, z, sy)) return null;
    if (openness(x, z, sy) < needOpen) return null;
    return { x: x + 0.5, y: sy + 1.02, z: z + 0.5 };
  };

  // pass 1: streets with real sky around them; pass 2: any street cell
  for (const needOpen of [5, 1]) {
    for (let r = 2; r < 240; r += 2) {
      const steps = Math.max(8, Math.floor(r * 1.5));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const hit = candidate(
          Math.round(cx + Math.cos(a) * r),
          Math.round(cz + Math.sin(a) * r),
          needOpen,
        );
        if (hit) return hit;
      }
    }
  }
  return { x: cx + 0.5, y: surfaceY(vz, cx, cz) + 1.02, z: cz + 0.5 };
}
