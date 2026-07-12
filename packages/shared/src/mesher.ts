/**
 * Greedy chunk mesher with per-vertex ambient occlusion (0fps-style).
 *
 * Faces merge only when (block, direction, 4-corner AO) match, so merged
 * quads shade identically to unmerged ones. Per-voxel color jitter is done
 * in the fragment shader from world position (client side), which keeps
 * jitter from defeating greedy merging.
 *
 * Face ownership across chunk borders: a face belongs to the chunk that
 * contains its SOLID voxel, so adjacent chunks never emit duplicates.
 *
 * Hot paths are deliberately scalar (no per-cell arrays/allocations): this
 * runs in a worker per chunk and its cost sets world load time.
 */

import { BLOCK_COLOR, BLOCK_TOP_COLOR, Block, FACE_SHADE } from "./blocks";
import { CHUNK, type VoxelZone } from "./voxelize";

export interface ChunkMesh {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  waterPositions: Float32Array;
  waterNormals: Float32Array;
  waterIndices: Uint32Array;
}

const AO_CURVE = [0.42, 0.62, 0.8, 1.0];
const FACE_NAME: string[][] = [
  ["nx", "px"],
  ["ny", "py"],
  ["nz", "pz"],
];

// unit vectors for slice axis d, and in-plane axes u=(d+1)%3, v=(d+2)%3
const AXIS = [
  { ed: [1, 0, 0], eu: [0, 1, 0], ev: [0, 0, 1] },
  { ed: [0, 1, 0], eu: [0, 0, 1], ev: [1, 0, 0] },
  { ed: [0, 0, 1], eu: [1, 0, 0], ev: [0, 1, 0] },
];

export function meshChunk(vz: VoxelZone, cx: number, cy: number, cz: number): ChunkMesh | null {
  const ox = cx * CHUNK;
  const oy = cy * CHUNK;
  const oz = cz * CHUNK;
  const SX = vz.sizeX;
  const SY = vz.sizeY;
  const SZ = vz.sizeZ;
  const vox = vz.voxels;

  const readBlock = (x: number, y: number, z: number): number => {
    if (y < 0) return Block.Soil;
    if (y >= SY || x < 0 || x >= SX || z < 0 || z >= SZ) return Block.Air;
    return vox[(y * SZ + z) * SX + x];
  };
  const readOpaque = (x: number, y: number, z: number): number => {
    if (y < 0) return 1;
    if (y >= SY || x < 0 || x >= SX || z < 0 || z >= SZ) return 0;
    const b = vox[(y * SZ + z) * SX + x];
    return b !== Block.Air && b !== Block.Water ? 1 : 0;
  };

  // fast reject: fully empty chunk (direct index scan)
  {
    let any = false;
    const yMax = Math.min(SY, oy + CHUNK);
    scan: for (let y = oy; y < yMax; y++) {
      for (let z = oz; z < oz + CHUNK; z++) {
        const row = (y * SZ + z) * SX + ox;
        for (let x = 0; x < CHUNK; x++) {
          if (vox[row + x] !== Block.Air) {
            any = true;
            break scan;
          }
        }
      }
    }
    if (!any) return null;
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const wPositions: number[] = [];
  const wNormals: number[] = [];
  const wIndices: number[] = [];

  const maskKey = new Int32Array(CHUNK * CHUNK);

  for (let d = 0; d < 3; d++) {
    const { ed, eu, ev } = AXIS[d];
    const [edx, edy, edz] = ed;
    const [eux, euy, euz] = eu;
    const [evx, evy, evz] = ev;

    for (let s = 0; s <= CHUNK; s++) {
      // ---- build mask (opaque + water in one sweep) ----
      let n = 0;
      for (let iv = 0; iv < CHUNK; iv++) {
        for (let iu = 0; iu < CHUNK; iu++, n++) {
          const bx = ox + s * edx + iu * eux + iv * evx;
          const by = oy + s * edy + iu * euy + iv * evy;
          const bz = oz + s * edz + iu * euz + iv * evz;
          const ax = bx - edx;
          const ay = by - edy;
          const az = bz - edz;

          const a = readBlock(ax, ay, az);
          const b = readBlock(bx, by, bz);
          const aOp = a !== Block.Air && a !== Block.Water ? 1 : 0;
          const bOp = b !== Block.Air && b !== Block.Water ? 1 : 0;

          let key = 0;
          if (aOp !== bOp) {
            if (aOp && s > 0) {
              // face on a, normal +d; empty side at b
              key = encodeKey(a, 1, ao8(readOpaque, bx, by, bz, eux, euy, euz, evx, evy, evz));
            } else if (bOp && s < CHUNK) {
              // face on b, normal -d; empty side at a
              key = encodeKey(b, 0, ao8(readOpaque, ax, ay, az, eux, euy, euz, evx, evy, evz));
            }
          } else if (aOp === 0) {
            // water faces: between water and air only
            if (a === Block.Water && b === Block.Air && s > 0) key = WATER_KEY | (1 << 9);
            else if (b === Block.Water && a === Block.Air && s < CHUNK) key = WATER_KEY;
          }
          maskKey[n] = key;
        }
      }

      // ---- greedy sweep ----
      n = 0;
      for (let iv = 0; iv < CHUNK; iv++) {
        for (let iu = 0; iu < CHUNK; ) {
          const key = maskKey[n];
          if (key === 0) {
            iu++;
            n++;
            continue;
          }
          let w = 1;
          while (iu + w < CHUNK && maskKey[n + w] === key) w++;
          let h = 1;
          grow: while (iv + h < CHUNK) {
            for (let k = 0; k < w; k++) {
              if (maskKey[n + h * CHUNK + k] !== key) break grow;
            }
            h++;
          }

          if ((key & WATER_KEY) === WATER_KEY) {
            emitQuadRaw(wPositions, wNormals, null, wIndices, key, d, s, iu, iv, w, h, ox, oy, oz, null);
          } else {
            emitQuadRaw(positions, normals, colors, indices, key, d, s, iu, iv, w, h, ox, oy, oz, FACE_NAME[d]);
          }

          for (let hh = 0; hh < h; hh++) {
            for (let ww = 0; ww < w; ww++) maskKey[n + hh * CHUNK + ww] = 0;
          }
          iu += w;
          n += w;
        }
      }
    }
  }

  if (indices.length === 0 && wIndices.length === 0) return null;

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
    waterPositions: new Float32Array(wPositions),
    waterNormals: new Float32Array(wNormals),
    waterIndices: new Uint32Array(wIndices),
  };
}

// key layout: bit20 = present, bit19 = isWater, bits10-17 ao, bit9 dir, bits0-8 block
const WATER_KEY = (1 << 20) | (1 << 19);

function encodeKey(block: number, dirBit: number, ao: number): number {
  return (1 << 20) | (ao << 10) | (dirBit << 9) | block;
}

/** 4-corner AO (2 bits each) sampled around the empty-side cell. */
function ao8(
  readOpaque: (x: number, y: number, z: number) => number,
  ex: number,
  ey: number,
  ez: number,
  eux: number,
  euy: number,
  euz: number,
  evx: number,
  evy: number,
  evz: number,
): number {
  const s1m = readOpaque(ex - eux, ey - euy, ez - euz);
  const s1p = readOpaque(ex + eux, ey + euy, ez + euz);
  const s2m = readOpaque(ex - evx, ey - evy, ez - evz);
  const s2p = readOpaque(ex + evx, ey + evy, ez + evz);
  const cmm = readOpaque(ex - eux - evx, ey - euy - evy, ez - euz - evz);
  const cpm = readOpaque(ex + eux - evx, ey + euy - evy, ez + euz - evz);
  const cpp = readOpaque(ex + eux + evx, ey + euy + evy, ez + euz + evz);
  const cmp = readOpaque(ex - eux + evx, ey - euy + evy, ez - euz + evz);

  const a0 = s1m & s2m ? 0 : 3 - (s1m + s2m + cmm);
  const a1 = s1p & s2m ? 0 : 3 - (s1p + s2m + cpm);
  const a2 = s1p & s2p ? 0 : 3 - (s1p + s2p + cpp);
  const a3 = s1m & s2p ? 0 : 3 - (s1m + s2p + cmp);
  return a0 | (a1 << 2) | (a2 << 4) | (a3 << 6);
}

const WATER_COLOR = BLOCK_COLOR[Block.Water];

function emitQuadRaw(
  positions: number[],
  normals: number[],
  colors: number[] | null,
  indices: number[],
  key: number,
  d: number,
  s: number,
  iu: number,
  iv: number,
  w: number,
  h: number,
  ox: number,
  oy: number,
  oz: number,
  faceNames: string[] | null,
): void {
  const { ed, eu, ev } = AXIS[d];
  const dirBit = (key >> 9) & 1;
  const isWater = (key & WATER_KEY) === WATER_KEY;
  const block = key & 0x1ff;
  const ao = (key >> 10) & 0xff;
  const a0 = ao & 3;
  const a1 = (ao >> 2) & 3;
  const a2 = (ao >> 4) & 3;
  const a3 = (ao >> 6) & 3;

  let base: readonly [number, number, number] = WATER_COLOR;
  let shade = 1;
  if (!isWater && faceNames) {
    const faceName = faceNames[dirBit];
    shade = FACE_SHADE[faceName];
    const topColor = faceName === "py" ? BLOCK_TOP_COLOR[block] : null;
    base = topColor ?? BLOCK_COLOR[block];
  }

  const vertBase = positions.length / 3;
  const aos = [a0, a1, a2, a3];
  const uvs = [
    [iu, iv],
    [iu + w, iv],
    [iu + w, iv + h],
    [iu, iv + h],
  ];
  const nx = ed[0] * (dirBit === 1 ? 1 : -1);
  const ny = ed[1] * (dirBit === 1 ? 1 : -1);
  const nz = ed[2] * (dirBit === 1 ? 1 : -1);

  for (let c = 0; c < 4; c++) {
    const uu = uvs[c][0];
    const vv = uvs[c][1];
    positions.push(
      ox + s * ed[0] + uu * eu[0] + vv * ev[0],
      oy + s * ed[1] + uu * eu[1] + vv * ev[1],
      oz + s * ed[2] + uu * eu[2] + vv * ev[2],
    );
    normals.push(nx, ny, nz);
    if (colors) {
      const l = shade * AO_CURVE[aos[c]];
      colors.push(base[0] * l, base[1] * l, base[2] * l);
    }
  }

  // anisotropy fix: flip the quad diagonal when AO demands it
  const flip = a0 + a2 > a1 + a3;
  if (dirBit === 1) {
    if (flip) indices.push(vertBase + 1, vertBase + 2, vertBase + 3, vertBase + 1, vertBase + 3, vertBase + 0);
    else indices.push(vertBase + 0, vertBase + 1, vertBase + 2, vertBase + 0, vertBase + 2, vertBase + 3);
  } else {
    if (flip) indices.push(vertBase + 1, vertBase + 0, vertBase + 3, vertBase + 1, vertBase + 3, vertBase + 2);
    else indices.push(vertBase + 0, vertBase + 3, vertBase + 2, vertBase + 0, vertBase + 2, vertBase + 1);
  }
}
