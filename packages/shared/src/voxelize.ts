/**
 * Deterministic zonepack → voxel volume derivation.
 *
 * Everything here must be a pure function of the zonepack + zone seed: the
 * base world is never persisted, only re-derived, so client and (future)
 * server must agree bit-for-bit. All randomness goes through rng.ts hashes.
 *
 * Ruin philosophy (plan §4): "post-apocalyptic but optimistic" — buildings are
 * mostly-standing weathered shells with coherent skylines, moss creeping up
 * from the ground, occasional breaches; not carpet-bombed rubble.
 */

import { Block } from "./blocks";
import { hash01, hashString, valueNoise2 } from "./rng";
import { Landcover, type Zonepack, type ZonepackHeader } from "./zonepack";

export const CHUNK = 32;

export interface VoxelZone {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  /** Dense volume, index = (y * sizeZ + z) * sizeX + x. */
  voxels: Uint8Array;
  waterLevel: number;
  seed: number;
  header: ZonepackHeader;
}

export function voxelIndex(vz: VoxelZone, x: number, y: number, z: number): number {
  return (y * vz.sizeZ + z) * vz.sizeX + x;
}

/** Out-of-bounds semantics: solid ground below the world, air everywhere else. */
export function getVoxel(vz: VoxelZone, x: number, y: number, z: number): number {
  if (y < 0) return Block.Soil;
  if (y >= vz.sizeY || x < 0 || x >= vz.sizeX || z < 0 || z >= vz.sizeZ) return Block.Air;
  return vz.voxels[(y * vz.sizeZ + z) * vz.sizeX + x];
}

const LANDCOVER_TOP: Record<number, number> = {
  [Landcover.None]: Block.Grass, // ruderal default: unclaimed ground is overgrown
  [Landcover.Grass]: Block.Grass,
  [Landcover.Trees]: Block.Grass,
  [Landcover.Road]: Block.Asphalt,
  [Landcover.Path]: Block.Pavement,
  [Landcover.Pavement]: Block.Pavement,
  [Landcover.Bare]: Block.Silt,
};

export function voxelize(pack: Zonepack): VoxelZone {
  const { header } = pack;
  const { sizeX, sizeZ, sizeY, waterLevel } = header;
  const seed = hashString(header.id);
  const voxels = new Uint8Array(sizeX * sizeY * sizeZ);
  const vz: VoxelZone = { sizeX, sizeY, sizeZ, voxels, waterLevel, seed, header };

  const set = (x: number, y: number, z: number, b: number) => {
    if (y >= 0 && y < sizeY && x >= 0 && x < sizeX && z >= 0 && z < sizeZ) {
      voxels[(y * sizeZ + z) * sizeX + x] = b;
    }
  };

  const colBuildingId = (x: number, z: number): number => {
    if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) return 0;
    return pack.buildingId[z * sizeX + x];
  };

  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      const i = z * sizeX + x;
      const isWater = pack.water[i] === 1;
      const th = Math.max(1, Math.min(pack.terrain[i], sizeY - 12));

      // -- ground column --
      for (let y = 0; y < th; y++) set(x, y, z, Block.Soil);
      if (isWater) {
        set(x, th, z, Block.Silt); // canal bed
        for (let y = th + 1; y <= waterLevel; y++) set(x, y, z, Block.Water);
        // road-over-water = bridge deck, flush with the lowest quay level
        const lc = pack.landcover[i];
        if (lc === Landcover.Road) set(x, waterLevel + 1, z, Block.Asphalt);
        else if (lc === Landcover.Path) set(x, waterLevel + 1, z, Block.Pavement);
      } else {
        const top = LANDCOVER_TOP[pack.landcover[i]] ?? Block.Grass;
        set(x, th, z, top);
        // clay deposits along the water line (Phase 3 resource node)
        const nearWater =
          (x > 0 && pack.water[i - 1] === 1) ||
          (x < sizeX - 1 && pack.water[i + 1] === 1) ||
          (z > 0 && pack.water[i - sizeX] === 1) ||
          (z < sizeZ - 1 && pack.water[i + sizeX] === 1);
        if (nearWater && pack.buildingHeight[i] === 0 && hash01(seed, x, z, 62) < 0.18) {
          set(x, th, z, Block.Clay);
        }
        // biomass bushes on open grass (parks read resource-rich)
        if (
          top === Block.Grass &&
          pack.buildingHeight[i] === 0 &&
          (pack.landcover[i] === Landcover.Grass || pack.landcover[i] === Landcover.Trees || pack.landcover[i] === Landcover.None) &&
          hash01(seed, x, z, 61) < 0.02
        ) {
          set(x, th + 1, z, Block.Biomass);
        }
      }

      // -- building column --
      const bh = pack.buildingHeight[i];
      const id = pack.buildingId[i];
      if (bh > 0 && id > 0) {
        const houseboat = isWater;
        const base = houseboat ? waterLevel : th;
        const matRoll = hash01(seed, id, 1);
        const mat = houseboat
          ? Block.Wood
          : matRoll < 0.5
            ? Block.Brick
            : matRoll < 0.75
              ? Block.BrickDark
              : Block.Concrete;
        const intact = houseboat || (hash01(seed, id, 7) < 0.35 && bh <= 9);
        const n0 = colBuildingId(x - 1, z);
        const n1 = colBuildingId(x + 1, z);
        const n2 = colBuildingId(x, z - 1);
        const n3 = colBuildingId(x, z + 1);
        const isWall = n0 !== id || n1 !== id || n2 !== id || n3 !== id;
        // facade = faces open ground; party walls between adjacent parcels
        // mostly collapse (else dense row-house districts ruin into a
        // matchstick forest of surviving firewalls)
        const isFacade = n0 === 0 || n1 === 0 || n2 === 0 || n3 === 0;

        // Coherent per-facade erosion: a smooth noise field over the footprint
        // so ruin silhouettes read as slumped rooflines, not static.
        let hEff = bh;
        if (!intact) {
          const n = valueNoise2(seed ^ Math.imul(id, 2654435761), x, z, 5);
          hEff = Math.max(2, Math.round(bh * (0.6 + 0.45 * n)));
          if (hash01(seed, x, z, 3) < 0.04) hEff = 2; // rare full breach
          hEff = Math.min(hEff, bh);
        }

        if (isWall) {
          const facadeU = x + z;
          let wallH = hEff;
          if (!isFacade && !intact) {
            // interior party wall: keep only a low remnant, sometimes nothing
            wallH = hash01(seed, x, z, 31) < 0.5 ? 0 : Math.min(hEff, 1 + Math.floor(hash01(seed, x, z, 32) * 3));
          }
          for (let dy = 1; dy <= wallH; dy++) {
            const y = base + dy;
            // door openings on the ground floor
            if (isFacade && dy <= 2 && facadeU % 9 === id % 9 && !houseboat) continue;
            // window grid: 2-tall openings per 3-block floor, decided per
            // window CELL so both rows of one window match
            if (isFacade && dy >= 2 && (dy - 2) % 3 < 2 && facadeU % 3 !== id % 3) {
              const floorIdx = Math.floor((dy - 2) / 3);
              const openP = intact ? 0.6 : 0.82;
              if (hash01(seed, x, z, 900 + floorIdx) < openP) continue;
            }
            let b: number = mat;
            if (!houseboat) {
              // moss creeps up from street level
              const mossP = 0.05 + 0.28 * Math.exp(-(dy - 1) / 5);
              if (hash01(seed, x, y, z) < mossP) b = Block.Moss;
            }
            set(x, y, z, b);
          }
        } else if (!intact) {
          // roofless interior: rubble scatter, with occasional salvage caches —
          // urban ruins are where building material comes from (plan §Phase 3)
          const r = hash01(seed, x, z, 11);
          if (r < 0.06) set(x, base + 1, z, Block.Salvage);
          else if (r < 0.3) set(x, base + 1, z, Block.Rubble);
        }
        if (intact) {
          set(x, base + bh, z, houseboat ? Block.Wood : Block.Roof);
        }
      }
    }
  }

  // -- trees (from real mapped tree points; canal-side elms are the soul of the place) --
  const treeCount = pack.trees.length / 2;
  for (let t = 0; t < treeCount; t++) {
    const tx = pack.trees[t * 2];
    const tz = pack.trees[t * 2 + 1];
    if (tx >= sizeX || tz >= sizeZ) continue;
    const i = tz * sizeX + tx;
    if (pack.water[i] === 1 || pack.buildingHeight[i] > 0) continue;
    const th = Math.max(1, Math.min(pack.terrain[i], sizeY - 12));
    const ht = 4 + Math.floor(hash01(seed, tx, tz, 21) * 3); // 4..6 trunk
    for (let dy = 1; dy <= ht; dy++) set(tx, th + dy, tz, Block.Wood);
    const cy = th + ht;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const r2 = dx * dx + dz * dz + dy * dy * 2.2;
          const jitter = (hash01(seed, tx + dx, cy + dy, (tz + dz) ^ 0x5f) - 0.5) * 2.5;
          if (r2 <= 4.6 + jitter) {
            const y = cy + dy;
            if (getVoxel(vz, tx + dx, y, tz + dz) === Block.Air) set(tx + dx, y, tz + dz, Block.Leaves);
          }
        }
      }
    }
  }

  return vz;
}

/** Highest non-air block at a column, for spawning. */
export function surfaceY(vz: VoxelZone, x: number, z: number): number {
  for (let y = vz.sizeY - 1; y >= 0; y--) {
    const b = getVoxel(vz, x, y, z);
    if (b !== Block.Air) return y;
  }
  return 0;
}
