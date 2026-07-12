/**
 * Deterministic hashing — every derived-world decision (erosion, moss, rubble,
 * tree shapes) must be reproducible from (zoneSeed, coords, salt) so that any
 * machine can re-derive the identical base world from a zonepack.
 */

export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mix up to four 32-bit ints into a well-distributed uint32. */
export function hash32(a: number, b = 0, c = 0, d = 0): number {
  let h = (a | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (b | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (c | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h ^ (d | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Uniform [0,1) from up to four ints. */
export function hash01(a: number, b = 0, c = 0, d = 0): number {
  return hash32(a, b, c, d) / 4294967296;
}

/**
 * Cheap coherent 2D value noise in [0,1): bilinear interpolation of lattice
 * hashes at the given cell size. Used for erosion fields that should vary
 * smoothly across a facade instead of per-voxel static.
 */
export function valueNoise2(seed: number, x: number, z: number, cell: number): number {
  const gx = Math.floor(x / cell);
  const gz = Math.floor(z / cell);
  const fx = x / cell - gx;
  const fz = z / cell - gz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const v00 = hash01(seed, gx, gz);
  const v10 = hash01(seed, gx + 1, gz);
  const v01 = hash01(seed, gx, gz + 1);
  const v11 = hash01(seed, gx + 1, gz + 1);
  return (v00 * (1 - sx) + v10 * sx) * (1 - sz) + (v01 * (1 - sx) + v11 * sx) * sz;
}
