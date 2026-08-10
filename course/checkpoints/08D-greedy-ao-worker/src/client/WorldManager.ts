/**
 * Module 08D — the imperative chunk manager. It owns a THREE.Group of per-chunk
 * meshes, talks to the mesher worker, and applies edits.
 *
 * This is deliberately NOT a React component. Chunk meshes are created and
 * updated far too often (and too imperatively) to route through React's render
 * cycle — so we keep a plain class and drop its `group` into the scene with a
 * single `<primitive>`. The real Ruderal makes the same call: see
 * `packages/client/src/world/WorldManager.ts` and `scene/World.tsx`.
 */
import * as THREE from "three";
import { CHUNK } from "../shared/chunkMesher";
import { setVoxel, type VoxelWorld } from "../shared/voxel";

interface ChunkMsg {
  type: "chunk";
  cx: number;
  cy: number;
  cz: number;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

export class WorldManager {
  readonly group = new THREE.Group();
  private readonly worker: Worker;
  private readonly material: THREE.Material;
  private readonly meshes = new Map<string, THREE.Mesh>();
  private readonly chunksX: number;
  private readonly chunksY: number;
  private readonly chunksZ: number;

  constructor(public readonly world: VoxelWorld) {
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });

    this.worker = new Worker(new URL("../worker/mesher.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (e: MessageEvent) => this.onChunk(e.data as ChunkMsg);

    // Send the worker its own copy of the volume (main thread keeps the
    // original for collision & raycast). Transfer the copy's buffer — zero-copy.
    const copy = world.voxels.slice();
    this.worker.postMessage(
      {
        type: "init",
        sizeX: world.sizeX,
        sizeY: world.sizeY,
        sizeZ: world.sizeZ,
        waterLevel: world.waterLevel,
        seed: world.seed,
        voxels: copy.buffer,
      },
      [copy.buffer],
    );

    this.chunksX = Math.ceil(world.sizeX / CHUNK);
    this.chunksY = Math.ceil(world.sizeY / CHUNK);
    this.chunksZ = Math.ceil(world.sizeZ / CHUNK);
    for (let cy = 0; cy < this.chunksY; cy++)
      for (let cz = 0; cz < this.chunksZ; cz++)
        for (let cx = 0; cx < this.chunksX; cx++) this.requestMesh(cx, cy, cz);
  }

  private key(cx: number, cy: number, cz: number): string {
    return `${cx},${cy},${cz}`;
  }

  private requestMesh(cx: number, cy: number, cz: number): void {
    this.worker.postMessage({ type: "mesh", cx, cy, cz });
  }

  private onChunk(d: ChunkMsg): void {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(d.positions, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(d.normals, 3));
    g.setAttribute("color", new THREE.BufferAttribute(d.colors, 3));
    g.setIndex(new THREE.BufferAttribute(d.indices, 1));
    g.computeBoundingSphere();

    const k = this.key(d.cx, d.cy, d.cz);
    const existing = this.meshes.get(k);
    if (existing) {
      existing.geometry.dispose();
      existing.geometry = g;
    } else {
      const mesh = new THREE.Mesh(g, this.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.meshes.set(k, mesh);
      this.group.add(mesh);
    }
  }

  /** Apply an edit: update our world + the worker's, then remesh what changed. */
  applyEdit(x: number, y: number, z: number, b: number): void {
    setVoxel(this.world, x, y, z, b);
    this.worker.postMessage({ type: "edit", x, y, z, b });

    // An edit on a chunk border changes the neighbor chunk's faces/AO too, so
    // remesh the edited cell's chunk plus any neighbor within one block.
    const dirty = new Set<string>();
    const offsets = [
      [0, 0, 0], [1, 0, 0], [-1, 0, 0],
      [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    ];
    for (const [ox, oy, oz] of offsets) {
      const cx = Math.floor((x + ox!) / CHUNK);
      const cy = Math.floor((y + oy!) / CHUNK);
      const cz = Math.floor((z + oz!) / CHUNK);
      if (cx < 0 || cy < 0 || cz < 0) continue;
      if (cx >= this.chunksX || cy >= this.chunksY || cz >= this.chunksZ) continue;
      dirty.add(this.key(cx, cy, cz));
    }
    for (const k of dirty) {
      const [cx, cy, cz] = k.split(",").map(Number) as [number, number, number];
      this.requestMesh(cx, cy, cz);
    }
  }

  dispose(): void {
    this.worker.terminate();
    for (const mesh of this.meshes.values()) mesh.geometry.dispose();
    this.material.dispose();
    this.meshes.clear();
  }
}
