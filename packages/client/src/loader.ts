/**
 * Zonepack loading: fetch → (gzip) decompress → decode → voxelize.
 * Voxelization happens on the main thread once (~100 ms) because the
 * collider needs synchronous voxel access; mesher workers get copies.
 * Spawn points come from the server (shared findSpawn) in multiplayer.
 */

import { decodeZonepack, voxelize, type VoxelZone, type Zonepack } from "@ruderal/shared";

export interface LoadedZone {
  pack: Zonepack;
  vz: VoxelZone;
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
  return { pack, vz };
}
