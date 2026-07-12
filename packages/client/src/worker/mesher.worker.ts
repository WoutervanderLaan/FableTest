/**
 * Chunk meshing worker. Receives one full copy of the voxel volume at init
 * (16 MB — cheaper and simpler than SharedArrayBuffer's COOP/COEP tax), keeps
 * it in sync via edit messages, and meshes chunks on demand, transferring the
 * geometry buffers back.
 */

import { meshChunk, setVoxelAt, unpackX, unpackY, unpackZ, type VoxelZone } from "@ruderal/shared";

interface InitMsg {
  type: "init";
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  waterLevel: number;
  seed: number;
  voxels: ArrayBuffer;
}

interface MeshMsg {
  type: "mesh";
  cx: number;
  cy: number;
  cz: number;
}

interface EditMsg {
  type: "edit";
  /** flat pairs: packedXYZ, block */
  pairs: number[];
}

let vz: VoxelZone | null = null;

self.onmessage = (e: MessageEvent<InitMsg | MeshMsg | EditMsg>) => {
  const msg = e.data;
  if (msg.type === "init") {
    vz = {
      sizeX: msg.sizeX,
      sizeY: msg.sizeY,
      sizeZ: msg.sizeZ,
      waterLevel: msg.waterLevel,
      seed: msg.seed,
      voxels: new Uint8Array(msg.voxels),
      header: null as never, // not needed for meshing
    };
    return;
  }
  if (!vz) return;
  if (msg.type === "edit") {
    for (let i = 0; i + 1 < msg.pairs.length; i += 2) {
      const p = msg.pairs[i];
      setVoxelAt(vz, unpackX(p), unpackY(p), unpackZ(p), msg.pairs[i + 1]);
    }
    return;
  }
  if (msg.type === "mesh") {
    const mesh = meshChunk(vz, msg.cx, msg.cy, msg.cz);
    if (!mesh) {
      self.postMessage({ type: "mesh", cx: msg.cx, cy: msg.cy, cz: msg.cz, mesh: null });
      return;
    }
    self.postMessage({ type: "mesh", cx: msg.cx, cy: msg.cy, cz: msg.cz, mesh }, {
      transfer: [
        mesh.positions.buffer,
        mesh.normals.buffer,
        mesh.colors.buffer,
        mesh.indices.buffer,
        mesh.waterPositions.buffer,
        mesh.waterNormals.buffer,
        mesh.waterIndices.buffer,
      ],
    });
  }
};
