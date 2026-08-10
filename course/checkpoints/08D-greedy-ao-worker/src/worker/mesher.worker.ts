/**
 * Module 08D — the mesher web worker.
 *
 * Meshing is pure number-crunching with no DOM needs, so it's the perfect thing
 * to move OFF the main thread — then a big remesh never drops a frame of
 * rendering or input. This is exactly why the mesher lives in `src/shared/` and
 * touches no Three.js: it has to be able to run here, in a worker.
 *
 * Protocol (all via postMessage):
 *   main → worker:  { type:"init", ...world fields, voxels: ArrayBuffer }
 *                   { type:"edit", x, y, z, b }
 *                   { type:"mesh", cx, cy, cz }
 *   worker → main:  { type:"chunk", cx, cy, cz, positions, normals, colors, indices }
 *                   (the four arrays are TRANSFERRED — zero-copy handoff)
 *
 * The worker keeps its OWN copy of the voxel volume, synced by "edit" messages,
 * so it can mesh any chunk on demand without shipping the whole world each time.
 */
import { meshChunk } from "../shared/chunkMesher";
import { setVoxel, type VoxelWorld } from "../shared/voxel";

// Narrow view of the worker global that dodges DOM-vs-WebWorker lib clashes.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
};

let world: VoxelWorld | null = null;

ctx.onmessage = (e: MessageEvent) => {
  const msg = e.data as
    | { type: "init"; sizeX: number; sizeY: number; sizeZ: number; waterLevel: number; seed: number; voxels: ArrayBuffer }
    | { type: "edit"; x: number; y: number; z: number; b: number }
    | { type: "mesh"; cx: number; cy: number; cz: number };

  if (msg.type === "init") {
    world = {
      sizeX: msg.sizeX,
      sizeY: msg.sizeY,
      sizeZ: msg.sizeZ,
      waterLevel: msg.waterLevel,
      seed: msg.seed,
      voxels: new Uint8Array(msg.voxels),
    };
  } else if (msg.type === "edit") {
    if (world) setVoxel(world, msg.x, msg.y, msg.z, msg.b);
  } else if (msg.type === "mesh") {
    if (!world) return;
    const md = meshChunk(world, msg.cx, msg.cy, msg.cz);
    ctx.postMessage(
      {
        type: "chunk",
        cx: msg.cx,
        cy: msg.cy,
        cz: msg.cz,
        positions: md.positions,
        normals: md.normals,
        colors: md.colors,
        indices: md.indices,
      },
      [md.positions.buffer, md.normals.buffer, md.colors.buffer, md.indices.buffer],
    );
  }
};
