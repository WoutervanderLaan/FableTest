/**
 * Module 08D (deep-dive) — a chunked mesher with ambient occlusion.
 *
 * Two upgrades over the naive mesher (Module 06):
 *
 *  1. CHUNKS. We mesh the world in 32³ boxes. When you edit a block, only its
 *     chunk (and any neighbor chunk a border edit touches) is re-meshed —
 *     instead of the whole world. This is what makes editing feel instant.
 *
 *  2. AMBIENT OCCLUSION. Each face vertex is darkened by how many solid blocks
 *     crowd its corner. It's cheap (a few neighbor lookups) and it's most of
 *     what makes voxels read as solid, chunky geometry instead of flat cutouts.
 *
 * The AO here is computed per-face-vertex and baked into vertex color — no
 * separate lighting pass. The real Ruderal (`packages/shared/src/mesher.ts`)
 * goes one step further and *greedily merges* coplanar faces that share the
 * same color + AO into big quads; that's a great next exercise, and the reason
 * this file keeps AO in the vertex color (merges must preserve it).
 */
import { BLOCK_COLOR, BLOCK_TOP_COLOR, FACE_SHADE, isOpaque } from "./blocks";
import type { MeshData } from "./mesher";
import { getVoxel, type VoxelWorld } from "./voxel";

export const CHUNK = 32;

type Face = {
  dir: readonly [number, number, number];
  key: string;
  corners: readonly (readonly [number, number, number])[];
  na: number; // normal axis index (0=x,1=y,2=z)
  ua: number; // in-plane axis u
  va: number; // in-plane axis v
};

function axes(dir: readonly [number, number, number]): { na: number; ua: number; va: number } {
  const na = dir[0] !== 0 ? 0 : dir[1] !== 0 ? 1 : 2;
  const others = [0, 1, 2].filter((i) => i !== na);
  return { na, ua: others[0]!, va: others[1]! };
}

const FACES: Face[] = (
  [
    { dir: [0, 1, 0], key: "py", corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { dir: [0, -1, 0], key: "ny", corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { dir: [0, 0, 1], key: "pz", corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { dir: [0, 0, -1], key: "nz", corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
    { dir: [1, 0, 0], key: "px", corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
    { dir: [-1, 0, 0], key: "nx", corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  ] as const
).map((f) => ({ ...f, ...axes(f.dir) }));

// Brightness for AO levels 0..3 (0 = deepest crevice, 3 = fully open).
const AO_BRIGHT = [0.55, 0.7, 0.85, 1.0];

function occ(w: VoxelWorld, x: number, y: number, z: number): number {
  return isOpaque(getVoxel(w, x, y, z)) ? 1 : 0;
}

/** Mesh one chunk at chunk-coordinates (cx,cy,cz). Reads neighbors globally. */
export function meshChunk(w: VoxelWorld, cx: number, cy: number, cz: number): MeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  const z0 = cz * CHUNK;
  const x1 = Math.min(x0 + CHUNK, w.sizeX);
  const y1 = Math.min(y0 + CHUNK, w.sizeY);
  const z1 = Math.min(z0 + CHUNK, w.sizeZ);

  for (let y = y0; y < y1; y++) {
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const b = getVoxel(w, x, y, z);
        if (!isOpaque(b)) continue;

        for (const f of FACES) {
          const [dx, dy, dz] = f.dir;
          if (isOpaque(getVoxel(w, x + dx, y + dy, z + dz))) continue;

          const shade = FACE_SHADE[f.key]!;
          const baseC = f.key === "py" ? (BLOCK_TOP_COLOR[b] ?? BLOCK_COLOR[b]!) : BLOCK_COLOR[b]!;

          // The empty cell in front of this face — AO occluders live around it.
          const fx = x + dx;
          const fy = y + dy;
          const fz = z + dz;

          const vbase = positions.length / 3;
          const ao: number[] = [];
          for (const c of f.corners) {
            // Sign of this corner along each in-plane axis (derived from the
            // SAME corner offset we use for the position — so AO can't get
            // mismatched to the wrong vertex).
            const su = c[f.ua] === 1 ? 1 : -1;
            const sv = c[f.va] === 1 ? 1 : -1;
            const u = [0, 0, 0];
            u[f.ua] = su;
            const v = [0, 0, 0];
            v[f.va] = sv;
            const s1 = occ(w, fx + u[0]!, fy + u[1]!, fz + u[2]!);
            const s2 = occ(w, fx + v[0]!, fy + v[1]!, fz + v[2]!);
            const cc = occ(w, fx + u[0]! + v[0]!, fy + u[1]! + v[1]!, fz + u[2]! + v[2]!);
            const level = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
            ao.push(level);

            const bright = shade * AO_BRIGHT[level]!;
            positions.push(x + c[0], y + c[1], z + c[2]);
            normals.push(dx, dy, dz);
            colors.push(baseC[0] * bright, baseC[1] * bright, baseC[2] * bright);
          }

          // Flip the split diagonal toward the darker corners — the standard
          // trick that stops AO from looking lopsided across a quad.
          if (ao[0]! + ao[2]! > ao[1]! + ao[3]!) {
            indices.push(vbase, vbase + 1, vbase + 2, vbase, vbase + 2, vbase + 3);
          } else {
            indices.push(vbase + 1, vbase + 2, vbase + 3, vbase + 1, vbase + 3, vbase);
          }
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
  };
}
