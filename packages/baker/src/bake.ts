/**
 * The bake pipeline: Overture GeoJSON + Terrarium DEM → zonepack.
 *
 * This is the "one true tile" version — single zone, in-memory, unapologetic
 * about edge cases outside this zone. The planet-scale tail (coastlines, data
 * voids, slope pathologies) is hard problem #1 in the plan and is deliberately
 * NOT solved here.
 */

import { gzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  Landcover,
  encodeZonepack,
  hash01,
  hashString,
  localToLonLat,
  lonLatToLocal,
  type Zonepack,
  type ZoneSpec,
} from "@ruderal/shared";
import { DemSampler } from "./dem";
import { linesOf, pointOf, polygonsOf, type GeoCollection, type GeoFeature, type Position } from "./geojson";
import { fillPolygon, strokeLine } from "./raster";

export interface BakeOptions {
  dataDir: string;
  outDir: string;
  overtureRelease: string;
}

const ROAD_STYLES: Record<string, { width: number; lc: number }> = {
  motorway: { width: 12, lc: Landcover.Road },
  trunk: { width: 11, lc: Landcover.Road },
  primary: { width: 10, lc: Landcover.Road },
  secondary: { width: 8, lc: Landcover.Road },
  tertiary: { width: 7, lc: Landcover.Road },
  residential: { width: 5.5, lc: Landcover.Road },
  living_street: { width: 5, lc: Landcover.Road },
  unclassified: { width: 5, lc: Landcover.Road },
  service: { width: 4, lc: Landcover.Road },
  tram: { width: 3.5, lc: Landcover.Road },
  rail: { width: 3.5, lc: Landcover.Road },
  pedestrian: { width: 4, lc: Landcover.Path },
  footway: { width: 2, lc: Landcover.Path },
  path: { width: 2, lc: Landcover.Path },
  steps: { width: 2, lc: Landcover.Path },
  cycleway: { width: 2.5, lc: Landcover.Path },
};

/** Blocks of height for a building, from data when present, else a
 *  deterministic class-informed guess (Amsterdam canal-house scale). */
function buildingHeightBlocks(f: GeoFeature, id: number, seed: number): number {
  const p = f.properties;
  const h = typeof p.height === "number" ? p.height : null;
  if (h) return Math.max(3, Math.min(100, Math.round(h)));
  const floors = typeof p.num_floors === "number" ? p.num_floors : null;
  if (floors) return Math.max(3, Math.min(100, Math.round(floors * 3.2)));
  const cls = (p.class as string) ?? "";
  const subtype = (p.subtype as string) ?? "";
  const r = hash01(seed, id, 55);
  if (cls === "houseboat") return 3;
  if (subtype === "religious") return Math.round(20 + r * 6);
  if (cls === "house") return Math.round(9 + r * 4);
  if (cls === "apartments") return Math.round(13 + r * 5);
  if (subtype === "commercial") return Math.round(10 + r * 5);
  if (subtype === "industrial") return Math.round(8 + r * 5);
  return Math.round(10 + r * 5);
}

/** Linear-reference ranges [t0,t1] of a segment that are bridges. */
function bridgeRanges(props: Record<string, unknown>): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const push = (between: unknown) => {
    if (Array.isArray(between) && between.length === 2) ranges.push([between[0] as number, between[1] as number]);
    else ranges.push([0, 1]);
  };
  for (const rule of (props.level_rules as Array<Record<string, unknown>>) ?? []) {
    if (typeof rule.value === "number" && rule.value > 0) push(rule.between);
  }
  for (const flagSet of ["road_flags", "rail_flags"] as const) {
    for (const flag of (props[flagSet] as Array<Record<string, unknown>>) ?? []) {
      const values = flag.values as string[] | undefined;
      if (values?.includes("is_bridge")) push(flag.between);
    }
  }
  return ranges;
}

/** Slice a polyline to the sub-line between length fractions [t0,t1]. */
function sliceLine(pts: Array<[number, number]>, t0: number, t1: number): Array<[number, number]> {
  const segLen: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const dl = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    segLen.push(dl);
    total += dl;
  }
  if (total === 0) return [];
  const a = Math.max(0, t0) * total;
  const b = Math.min(1, t1) * total;
  const out: Array<[number, number]> = [];
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const s0 = acc;
    const s1 = acc + segLen[i];
    acc = s1;
    if (s1 < a || s0 > b) continue;
    const p = pts[i];
    const q = pts[i + 1];
    const lerp = (t: number): [number, number] => {
      const f = segLen[i] === 0 ? 0 : (t - s0) / segLen[i];
      return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
    };
    const from = s0 < a ? lerp(a) : p;
    const to = s1 > b ? lerp(b) : q;
    if (out.length === 0) out.push(from);
    out.push(to);
  }
  return out;
}

export function bakeZone(spec: ZoneSpec, opts: BakeOptions): ZoneManifestEntry {
  const size = spec.sizeMeters;
  const grid = { sizeX: size, sizeZ: size };
  const n = size * size;
  const seed = hashString(spec.id);

  const load = (name: string): GeoCollection =>
    JSON.parse(readFileSync(join(opts.dataDir, "overture", spec.id, `${name}.geojson`), "utf8")) as GeoCollection;
  const buildings = load("building");
  const waterFc = load("water");
  const landUse = load("land_use");
  const segments = load("segment");
  const land = load("land");

  const toLocal = (p: Position): [number, number] => {
    const { x, z } = lonLatToLocal(spec, p[0], p[1]);
    return [x, z];
  };
  const localRings = (f: GeoFeature): Array<Array<Array<[number, number]>>> =>
    polygonsOf(f).map((poly) => poly.map((ring) => ring.map(toLocal)));

  // ---- elevation ----
  console.log("sampling DEM …");
  const dem = new DemSampler(join(opts.dataDir, "dem"));
  const heightsM = new Float32Array(n);
  let minH = Infinity;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const { lon, lat } = localToLonLat(spec, x + 0.5, z + 0.5);
      const h = dem.heightAt(lon, lat);
      heightsM[z * size + x] = h;
      if (h < minH) minH = h;
    }
  }

  // ---- water ----
  console.log("rasterizing water …");
  const water = new Uint8Array(n);
  const waterSamples: number[] = [];
  for (const f of waterFc.features) {
    const subtype = f.properties.subtype as string;
    if (subtype !== "canal" && subtype !== "water") continue; // skip ocean/sea world polygons
    for (const rings of localRings(f)) {
      fillPolygon(grid, rings, (x, z) => {
        const i = z * size + x;
        if (water[i] === 0) {
          water[i] = 1;
          waterSamples.push(heightsM[i]);
        }
      });
    }
  }
  waterSamples.sort((a, b) => a - b);
  const waterM = waterSamples.length ? waterSamples[Math.floor(waterSamples.length / 2)] : minH;

  // ---- vertical datum ----
  const baseElevation = Math.floor(Math.min(minH, waterM)) - 6;
  const waterLevel = Math.max(3, Math.round(waterM - baseElevation));

  const terrain = new Int16Array(n);
  let maxTerrain = 0;
  for (let i = 0; i < n; i++) {
    if (water[i]) {
      terrain[i] = waterLevel - 3; // canal bed
    } else {
      // land never below the water table + 1: DEM noise at canal edges would
      // otherwise sink quays underwater (real Amsterdam quays sit ~1m above)
      terrain[i] = Math.max(waterLevel + 1, Math.round(heightsM[i] - baseElevation));
    }
    if (terrain[i] > maxTerrain) maxTerrain = terrain[i];
  }

  // ---- landcover ----
  console.log("rasterizing landcover + roads …");
  const landcover = new Uint8Array(n); // Landcover.None = 0
  const LU_MAP: Record<string, number> = {
    garden: Landcover.Grass,
    grass: Landcover.Grass,
    playground: Landcover.Grass,
    park: Landcover.Grass,
    greenery: Landcover.Grass,
    forest: Landcover.Trees,
    wilderness_area: Landcover.Grass,
    pedestrian: Landcover.Pavement,
  };
  for (const f of landUse.features) {
    const lc = LU_MAP[(f.properties.class as string) ?? ""];
    if (lc === undefined) continue;
    for (const rings of localRings(f)) {
      fillPolygon(grid, rings, (x, z) => {
        landcover[z * size + x] = lc;
      });
    }
  }
  for (const f of land.features) {
    const cls = f.properties.class as string;
    if (cls === "scrub" || cls === "forest" || cls === "wood") {
      for (const rings of localRings(f)) {
        fillPolygon(grid, rings, (x, z) => {
          landcover[z * size + x] = Landcover.Grass;
        });
      }
    }
  }

  // roads: non-bridge parts stamp land only; bridge parts stamp water too
  // (the voxelizer turns road-on-water cells into bridge decks)
  for (const f of segments.features) {
    const style = ROAD_STYLES[(f.properties.class as string) ?? ""] ?? ROAD_STYLES[(f.properties.subtype as string) ?? ""];
    if (!style) continue;
    const bridges = bridgeRanges(f.properties);
    for (const line of linesOf(f)) {
      const local = line.map(toLocal);
      const stampLand = (pts: Array<[number, number]>) =>
        strokeLine(grid, pts, style.width, (x, z) => {
          const i = z * size + x;
          if (!water[i]) landcover[i] = style.lc;
        });
      const stampBridge = (pts: Array<[number, number]>) =>
        strokeLine(grid, pts, Math.min(style.width, 6), (x, z) => {
          landcover[z * size + x] = style.lc;
        });

      if (bridges.length === 0) {
        stampLand(local);
      } else {
        // stamp whole line as land-only, then overlay bridge slices
        stampLand(local);
        for (const [t0, t1] of bridges) {
          const part = sliceLine(local, t0, t1);
          if (part.length >= 2) stampBridge(part);
        }
      }
    }
  }

  // ---- buildings ----
  console.log("stamping buildings …");
  const buildingHeight = new Uint8Array(n);
  const buildingId = new Uint16Array(n);
  let maxBh = 0;
  let bId = 0;
  for (const f of buildings.features) {
    bId++;
    if (bId > 65535) break;
    const bh = buildingHeightBlocks(f, bId, seed);
    if (bh > maxBh) maxBh = bh;
    for (const rings of localRings(f)) {
      fillPolygon(grid, rings, (x, z) => {
        const i = z * size + x;
        buildingId[i] = bId;
        buildingHeight[i] = bh;
      });
    }
  }

  // ---- trees ----
  console.log("placing trees …");
  const treeCells = new Set<number>();
  const addTree = (lon: number, lat: number) => {
    const { x, z } = lonLatToLocal(spec, lon, lat);
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    if (bx < 0 || bx >= size || bz < 0 || bz >= size) return;
    treeCells.add(bz * size + bx);
  };
  for (const f of land.features) {
    const cls = f.properties.class as string;
    if (cls === "tree") {
      const pt = pointOf(f);
      if (pt) addTree(pt[0], pt[1]);
      // some tree features are tiny polygons — use their first vertex
      for (const poly of polygonsOf(f)) {
        if (poly[0]?.[0]) addTree(poly[0][0][0], poly[0][0][1]);
        break;
      }
    } else if (cls === "tree_row") {
      for (const line of linesOf(f)) {
        const local = line.map(toLocal);
        let acc = 0;
        for (let i = 0; i + 1 < local.length; i++) {
          const dl = Math.hypot(local[i + 1][0] - local[i][0], local[i + 1][1] - local[i][1]);
          const steps = Math.max(1, Math.floor(dl / 6));
          for (let s = 0; s <= steps; s++) {
            const f2 = s / steps;
            const x = local[i][0] + (local[i + 1][0] - local[i][0]) * f2;
            const z = local[i][1] + (local[i + 1][1] - local[i][1]) * f2;
            const { lon, lat } = localToLonLat(spec, x, z);
            addTree(lon, lat);
          }
          acc += dl;
        }
      }
    }
  }
  const trees = new Uint16Array(treeCells.size * 2);
  let t = 0;
  for (const i of treeCells) {
    trees[t++] = i % size;
    trees[t++] = Math.floor(i / size);
  }

  // ---- assemble ----
  const sizeY = Math.ceil((maxTerrain + maxBh + 12) / 32) * 32;
  const pack: Zonepack = {
    header: {
      formatVersion: 1,
      id: spec.id,
      name: spec.name,
      centerLon: spec.centerLon,
      centerLat: spec.centerLat,
      sizeX: size,
      sizeZ: size,
      sizeY,
      baseElevation,
      waterLevel,
      sources: {
        features: `Overture Maps ${opts.overtureRelease} (© OpenStreetMap contributors, ODbL)`,
        elevation: "Terrain Tiles (Mapzen/AWS Open Data)",
      },
      bakedAt: new Date().toISOString(),
    },
    terrain,
    water,
    landcover,
    buildingHeight,
    buildingId,
    trees,
  };

  const raw = encodeZonepack(pack);
  const gz = gzipSync(raw, { level: 9 });
  mkdirSync(opts.outDir, { recursive: true });
  const outFile = join(opts.outDir, `${spec.id}.zpk.gz`);
  writeFileSync(outFile, gz);

  const waterCells = water.reduce((a, b) => a + b, 0);
  const buildingCells = buildingId.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
  let minTerrain = Infinity;
  for (let i = 0; i < n; i++) if (terrain[i] < minTerrain) minTerrain = terrain[i];
  console.log(
    `baked ${spec.id}: ${size}×${size}×${sizeY}, base=${baseElevation}m, waterLevel=y${waterLevel}` +
      `\n  water: ${((100 * waterCells) / n).toFixed(1)}%  buildings: ${((100 * buildingCells) / n).toFixed(1)}% (${bId} stamped)` +
      `\n  trees: ${treeCells.size}  terrain y: ${minTerrain}–${maxTerrain}` +
      `\n  → ${outFile} (${(gz.length / 1024).toFixed(0)} KB gz, ${(raw.length / 1024).toFixed(0)} KB raw)`,
  );

  return {
    id: spec.id,
    name: spec.name,
    file: `${spec.id}.zpk.gz`,
    blurb: spec.blurb ?? "",
    centerLon: spec.centerLon,
    centerLat: spec.centerLat,
    waterPct: Math.round((1000 * waterCells) / n) / 10,
    buildingPct: Math.round((1000 * buildingCells) / n) / 10,
  };
}

export interface ZoneManifestEntry {
  id: string;
  name: string;
  file: string;
  blurb: string;
  centerLon: number;
  centerLat: number;
  waterPct: number;
  buildingPct: number;
}
