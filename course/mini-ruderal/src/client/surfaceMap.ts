/**
 * Module 05 — a quick way to SEE the voxel data before we have a real mesher.
 *
 * For each (x,z) column we find the top block and emit one colored quad at its
 * surface height. The result is a relief map: proof the generator produced hills,
 * water, beaches, and trees. Module 06 replaces this with a true mesher that
 * shows the world's actual 3D faces.
 */
import * as THREE from "three";
import { BLOCK_COLOR, BLOCK_TOP_COLOR } from "../shared/blocks";
import { getVoxel, surfaceY, type VoxelWorld } from "../shared/voxel";
import { MeshBuilder } from "./MeshBuilder";

export function buildSurfaceMap(w: VoxelWorld): THREE.BufferGeometry {
  const m = new MeshBuilder();
  const col = new THREE.Color();
  for (let z = 0; z < w.sizeZ; z++) {
    for (let x = 0; x < w.sizeX; x++) {
      const sy = surfaceY(w, x, z);
      const b = getVoxel(w, x, sy, z);
      const c = BLOCK_TOP_COLOR[b] ?? BLOCK_COLOR[b]!;
      // a little height shading so the terrain relief reads
      const shade = 0.55 + 0.45 * (sy / w.sizeY);
      col.setRGB(c[0] * shade, c[1] * shade, c[2] * shade);
      m.quad(
        [x, sy, z + 1],
        [x + 1, sy, z + 1],
        [x + 1, sy, z],
        [x, sy, z],
        [0, 1, 0],
        col,
      );
    }
  }
  return m.build();
}
