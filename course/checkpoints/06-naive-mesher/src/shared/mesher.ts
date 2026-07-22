/**
 * Module 06 — the naive mesher: turn a voxel volume into a triangle mesh.
 *
 * The whole idea in one sentence: **emit a quad for every face where an opaque
 * block meets a non-opaque neighbor.** Interior faces (block touching block) are
 * never seen, so we skip them — that alone turns hundreds of thousands of
 * potential faces into a few tens of thousands.
 *
 * This stays in `src/shared/` and returns plain typed arrays — NO Three.js. The
 * client wraps the arrays into a BufferGeometry. Keeping the mesher engine-free
 * is what lets the real Ruderal run it inside a web worker (Module 08D) and keep
 * the door open to meshing on a server. `MeshBuilder` from Module 03 was this
 * function's training-wheels version.
 */
import { BLOCK_COLOR, BLOCK_TOP_COLOR, FACE_SHADE, isOpaque } from "./blocks";
import { getVoxel, type VoxelWorld } from "./voxel";

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

// One entry per cube face: the outward normal/direction, the FACE_SHADE key,
// and the 4 corner offsets (wound CCW as seen from outside — same rule as the
// hand-built cube in Module 03).
const FACES = [
  { dir: [0, 1, 0], key: "py", corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], key: "ny", corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], key: "pz", corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], key: "nz", corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
  { dir: [1, 0, 0], key: "px", corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { dir: [-1, 0, 0], key: "nx", corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
] as const;

export function meshWorld(w: VoxelWorld): MeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y < w.sizeY; y++) {
    for (let z = 0; z < w.sizeZ; z++) {
      for (let x = 0; x < w.sizeX; x++) {
        const b = getVoxel(w, x, y, z);
        if (!isOpaque(b)) continue; // air/water emit nothing here

        for (const f of FACES) {
          const [dx, dy, dz] = f.dir;
          // If the neighbor in this direction is opaque, the face is hidden.
          if (isOpaque(getVoxel(w, x + dx, y + dy, z + dz))) continue;

          const shade = FACE_SHADE[f.key]!;
          // Top faces of grass-like blocks use their special top color.
          const base =
            f.key === "py" ? (BLOCK_TOP_COLOR[b] ?? BLOCK_COLOR[b]!) : BLOCK_COLOR[b]!;
          const r = base[0] * shade;
          const g = base[1] * shade;
          const bl = base[2] * shade;

          const vbase = positions.length / 3;
          for (const c of f.corners) {
            positions.push(x + c[0], y + c[1], z + c[2]);
            normals.push(dx, dy, dz);
            colors.push(r, g, bl);
          }
          indices.push(vbase, vbase + 1, vbase + 2, vbase, vbase + 2, vbase + 3);
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
