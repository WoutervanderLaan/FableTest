/**
 * Zonepack v1 — the baked, versioned artifact the baker emits and both client
 * and server consume. Column rasters only; the voxel world is *derived* from
 * this deterministically (see voxelize.ts), so persistence later stores only
 * player deltas against it.
 *
 * Binary layout (little-endian):
 *   u32 magic "ZPK1" | u32 headerJsonLen | headerJson (utf8, padded to 4)
 *   u32 treeCount
 *   Int16  terrain[sizeX*sizeZ]        top terrain block y (bed level under water)
 *   Uint8  water[sizeX*sizeZ]          1 = water column
 *   Uint8  landcover[sizeX*sizeZ]      Landcover enum
 *   Uint8  buildingHeight[sizeX*sizeZ] blocks above terrain
 *   Uint16 buildingId[sizeX*sizeZ]     0 = none (padded to 2)
 *   Uint16 trees[treeCount*2]          (x,z) pairs
 */

export const ZONEPACK_MAGIC = 0x5a504b31; // "ZPK1"

export const Landcover = {
  None: 0,
  Grass: 1,
  Trees: 2,
  Road: 3,
  Path: 4,
  Pavement: 5,
  Bare: 6,
} as const;
export type LandcoverId = (typeof Landcover)[keyof typeof Landcover];

export interface ZonepackHeader {
  formatVersion: 1;
  id: string;
  name: string;
  centerLon: number;
  centerLat: number;
  sizeX: number; // blocks east-west
  sizeZ: number; // blocks north-south
  sizeY: number; // vertical blocks in the derived voxel volume
  /** Meters above sea level of voxel y = 0. */
  baseElevation: number;
  /** y index of the water surface (top of water blocks). */
  waterLevel: number;
  /** Provenance. */
  sources: { features: string; elevation: string };
  bakedAt: string;
}

export interface Zonepack {
  header: ZonepackHeader;
  terrain: Int16Array;
  water: Uint8Array;
  landcover: Uint8Array;
  buildingHeight: Uint8Array;
  buildingId: Uint16Array;
  /** Flattened (x,z) pairs. */
  trees: Uint16Array;
}

function pad4(n: number): number {
  return (n + 3) & ~3;
}

export function encodeZonepack(pack: Zonepack): Uint8Array {
  const headerBytes = new TextEncoder().encode(JSON.stringify(pack.header));
  const n = pack.header.sizeX * pack.header.sizeZ;
  if (
    pack.terrain.length !== n ||
    pack.water.length !== n ||
    pack.landcover.length !== n ||
    pack.buildingHeight.length !== n ||
    pack.buildingId.length !== n
  ) {
    throw new Error("zonepack array lengths do not match header dimensions");
  }
  const headerPad = pad4(headerBytes.length);
  let size = 4 + 4 + headerPad + 4;
  size += pad4(n * 2); // terrain
  size += pad4(n); // water
  size += pad4(n); // landcover
  size += pad4(n); // buildingHeight
  size += pad4(n * 2); // buildingId
  size += pad4(pack.trees.length * 2);

  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let off = 0;
  view.setUint32(off, ZONEPACK_MAGIC, true);
  off += 4;
  view.setUint32(off, headerBytes.length, true);
  off += 4;
  bytes.set(headerBytes, off);
  off += headerPad;
  view.setUint32(off, pack.trees.length / 2, true);
  off += 4;

  bytes.set(new Uint8Array(pack.terrain.buffer, pack.terrain.byteOffset, n * 2), off);
  off += pad4(n * 2);
  bytes.set(pack.water, off);
  off += pad4(n);
  bytes.set(pack.landcover, off);
  off += pad4(n);
  bytes.set(pack.buildingHeight, off);
  off += pad4(n);
  bytes.set(new Uint8Array(pack.buildingId.buffer, pack.buildingId.byteOffset, n * 2), off);
  off += pad4(n * 2);
  bytes.set(new Uint8Array(pack.trees.buffer, pack.trees.byteOffset, pack.trees.length * 2), off);

  return bytes;
}

export function decodeZonepack(data: Uint8Array): Zonepack {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let off = 0;
  const magic = view.getUint32(off, true);
  off += 4;
  if (magic !== ZONEPACK_MAGIC) throw new Error("not a zonepack (bad magic)");
  const headerLen = view.getUint32(off, true);
  off += 4;
  const header = JSON.parse(
    new TextDecoder().decode(data.subarray(off, off + headerLen)),
  ) as ZonepackHeader;
  off += pad4(headerLen);
  const treeCount = view.getUint32(off, true);
  off += 4;

  const n = header.sizeX * header.sizeZ;
  const base = data.byteOffset;

  const terrain = new Int16Array(data.buffer.slice(base + off, base + off + n * 2));
  off += pad4(n * 2);
  const water = new Uint8Array(data.buffer.slice(base + off, base + off + n));
  off += pad4(n);
  const landcover = new Uint8Array(data.buffer.slice(base + off, base + off + n));
  off += pad4(n);
  const buildingHeight = new Uint8Array(data.buffer.slice(base + off, base + off + n));
  off += pad4(n);
  const buildingId = new Uint16Array(data.buffer.slice(base + off, base + off + n * 2));
  off += pad4(n * 2);
  const trees = new Uint16Array(data.buffer.slice(base + off, base + off + treeCount * 4));

  return { header, terrain, water, landcover, buildingHeight, buildingId, trees };
}
