/**
 * Module 05 — the voxel volume: how the world is stored, read, written, and
 * generated. Still pure `src/shared/` code — no Three.js in sight.
 *
 * A voxel world is one big flat `Uint8Array`: sizeX*sizeY*sizeZ bytes, each
 * byte a block id. No objects per block, no pointers — just an array you index
 * with math. That density is why a world of hundreds of thousands of blocks
 * costs a few hundred KB and is cache-friendly to walk.
 */

import { Block } from "./blocks";

export interface VoxelWorld {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  /** Dense volume. Index = (y * sizeZ + z) * sizeX + x. */
  voxels: Uint8Array;
  waterLevel: number;
  seed: number;
}

/** The one indexing formula, in one place. Y is the outer (slowest) axis. */
export function voxelIndex(w: VoxelWorld, x: number, y: number, z: number): number {
  return (y * w.sizeZ + z) * w.sizeX + x;
}

/**
 * Read a block. Out-of-bounds has deliberate semantics: solid ground below the
 * world (so you can't fall out the bottom), open air everywhere else. Callers
 * never need to bounds-check — this function is the boundary.
 */
export function getVoxel(w: VoxelWorld, x: number, y: number, z: number): number {
  if (y < 0) return Block.Soil;
  if (y >= w.sizeY || x < 0 || x >= w.sizeX || z < 0 || z >= w.sizeZ) return Block.Air;
  return w.voxels[voxelIndex(w, x, y, z)]!;
}

/** Write a block, ignoring out-of-bounds writes. */
export function setVoxel(w: VoxelWorld, x: number, y: number, z: number, b: number): void {
  if (y < 0 || y >= w.sizeY || x < 0 || x >= w.sizeX || z < 0 || z >= w.sizeZ) return;
  w.voxels[voxelIndex(w, x, y, z)] = b;
}

/** Highest non-air block in a column — used for spawning and the surface map. */
export function surfaceY(w: VoxelWorld, x: number, z: number): number {
  for (let y = w.sizeY - 1; y >= 0; y--) {
    if (getVoxel(w, x, y, z) !== Block.Air) return y;
  }
  return 0;
}

// --- Coordinate packing -----------------------------------------------------
// Squeeze an (x,y,z) block coordinate into a single integer. In Part 4 every
// block edit crosses the network as one packed number instead of three, which
// matters when a collapse sends thousands of them. 10 bits per axis = 0..1023,
// which fits any world we'll build (and stays inside JS's 2^53 safe integers).

export function packXYZ(x: number, y: number, z: number): number {
  return (x & 1023) | ((y & 1023) << 10) | ((z & 1023) << 20);
}
export function unpackX(p: number): number {
  return p & 1023;
}
export function unpackY(p: number): number {
  return (p >>> 10) & 1023;
}
export function unpackZ(p: number): number {
  return (p >>> 20) & 1023;
}

// --- Procedural generation --------------------------------------------------
// The real Ruderal "bakes" worlds from real city map data (the `baker`
// package — see Module 21). We generate ours with value noise so the course
// stays self-contained. It's deterministic: same seed → same world, on every
// machine. That determinism is non-negotiable for multiplayer (Part 4): client
// and server must derive byte-identical baseline worlds.

function hash2(seed: number, x: number, z: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function valueNoise(seed: number, x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fz = smooth(z - z0);
  const v00 = hash2(seed, x0, z0);
  const v10 = hash2(seed, x0 + 1, z0);
  const v01 = hash2(seed, x0, z0 + 1);
  const v11 = hash2(seed, x0 + 1, z0 + 1);
  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fz);
}

/** Fractal (multi-octave) noise: layered detail, 0..1-ish. */
function fbm(seed: number, x: number, z: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < 4; o++) {
    sum += amp * valueNoise(seed + o * 1013, x * freq, z * freq);
    amp *= 0.5;
    freq *= 2;
  }
  return sum;
}

export function generateWorld(
  sizeX = 64,
  sizeY = 40,
  sizeZ = 64,
  seed = 1337,
): VoxelWorld {
  const w: VoxelWorld = {
    sizeX,
    sizeY,
    sizeZ,
    voxels: new Uint8Array(sizeX * sizeY * sizeZ),
    waterLevel: 9,
    seed,
  };

  const scale = 22;
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      // Terrain height for this column.
      const n = fbm(seed, x / scale, z / scale);
      const h = Math.max(1, Math.floor(4 + n * 22));

      for (let y = 0; y < h; y++) {
        // Deeper = stone, upper few = soil.
        setVoxel(w, x, y, z, y < h - 4 ? Block.Stone : Block.Soil);
      }

      if (h <= w.waterLevel) {
        // Underwater column: sand bed, then water up to the water line.
        setVoxel(w, x, h - 1, z, Block.Sand);
        for (let y = h; y <= w.waterLevel; y++) setVoxel(w, x, y, z, Block.Water);
      } else {
        // Land: grass on top, a sandy beach right at the shoreline.
        setVoxel(w, x, h - 1, z, h <= w.waterLevel + 1 ? Block.Sand : Block.Grass);
      }
    }
  }

  // Scatter a few trees on grass, deterministically.
  for (let z = 3; z < sizeZ - 3; z++) {
    for (let x = 3; x < sizeX - 3; x++) {
      if (hash2(seed ^ 0x9e37, x, z) > 0.006) continue;
      const sy = surfaceY(w, x, z);
      if (getVoxel(w, x, sy, z) !== Block.Grass) continue;
      const trunk = 4 + Math.floor(hash2(seed, x, z) * 3);
      for (let dy = 1; dy <= trunk; dy++) setVoxel(w, x, sy + dy, z, Block.Wood);
      const cy = sy + trunk;
      for (let dx = -2; dx <= 2; dx++)
        for (let dy = -1; dy <= 2; dy++)
          for (let dz = -2; dz <= 2; dz++) {
            if (dx * dx + dy * dy + dz * dz > 5) continue;
            if (getVoxel(w, x + dx, cy + dy, z + dz) === Block.Air)
              setVoxel(w, x + dx, cy + dy, z + dz, Block.Leaves);
          }
    }
  }

  return w;
}
