/**
 * Owns the client-side world: the live voxel volume (baseline + applied
 * edits), the mesher worker pool, and the chunk-mesh registry. Chunk meshes
 * never pass through React (plan §3.7) — this class mutates a THREE.Group.
 *
 * Edit flow: applyEdits() mutates the main volume (collision truth), syncs
 * every worker's copy, and queues affected chunks for remesh. The same path
 * serves optimistic local edits, authoritative broadcasts, and rollbacks.
 */

import * as THREE from "three";
import {
  CHUNK,
  dirtyChunksFor,
  getVoxel,
  setVoxelAt,
  unpackX,
  unpackY,
  unpackZ,
  type ChunkMesh,
  type VoxelZone,
} from "@ruderal/shared";
import { makeVoxelMaterial, makeWaterMaterial } from "../scene/materials";

interface ChunkEntry {
  solid?: THREE.Mesh;
  water?: THREE.Mesh;
}

export class WorldManager {
  readonly group = new THREE.Group();
  onProgress?: (done: number, total: number) => void;
  /** notified for every applied edit pair (e.g. client physics mirror) */
  onEditApplied?: (x: number, y: number, z: number, b: number) => void;

  private meshes = new Map<string, ChunkEntry>();
  private workers: Worker[] = [];
  private nextWorker = 0;
  private voxelMat = makeVoxelMaterial();
  private waterMat = makeWaterMaterial();
  private initialTotal = 0;
  private initialDone = 0;
  private initialSeen = new Set<string>();
  /** total edit pairs applied (authoritative + optimistic) — for tooling */
  appliedEdits = 0;

  constructor(readonly vz: VoxelZone) {}

  start(origin: { x: number; z: number }): void {
    const chunksX = Math.ceil(this.vz.sizeX / CHUNK);
    const chunksY = Math.ceil(this.vz.sizeY / CHUNK);
    const chunksZ = Math.ceil(this.vz.sizeZ / CHUNK);

    const jobs: Array<{ cx: number; cy: number; cz: number; d2: number }> = [];
    for (let cx = 0; cx < chunksX; cx++) {
      for (let cy = 0; cy < chunksY; cy++) {
        for (let cz = 0; cz < chunksZ; cz++) {
          const dx = (cx + 0.5) * CHUNK - origin.x;
          const dz = (cz + 0.5) * CHUNK - origin.z;
          jobs.push({ cx, cy, cz, d2: dx * dx + dz * dz });
        }
      }
    }
    jobs.sort((a, b) => a.d2 - b.d2);
    this.initialTotal = jobs.length;

    const workerCount = Math.min(4, Math.max(2, (navigator.hardwareConcurrency || 4) - 1));
    for (let w = 0; w < workerCount; w++) {
      const worker = new Worker(new URL("../worker/mesher.worker.ts", import.meta.url), { type: "module" });
      worker.postMessage({
        type: "init",
        sizeX: this.vz.sizeX,
        sizeY: this.vz.sizeY,
        sizeZ: this.vz.sizeZ,
        waterLevel: this.vz.waterLevel,
        seed: this.vz.seed,
        voxels: this.vz.voxels.buffer, // structured clone: worker gets a copy
      });
      worker.onmessage = (e) => this.handleMeshResult(e.data);
      this.workers.push(worker);
    }
    for (const j of jobs) this.requestMesh(j.cx, j.cy, j.cz);
  }

  /** Apply authoritative or optimistic edit pairs [p,b,...] to volume + meshes. */
  applyEdits(pairs: ArrayLike<number>): void {
    const dirty = new Map<string, [number, number, number]>();
    const applied: number[] = [];
    for (let i = 0; i + 1 < pairs.length; i += 2) {
      const p = pairs[i] as number;
      const b = pairs[i + 1] as number;
      const x = unpackX(p);
      const y = unpackY(p);
      const z = unpackZ(p);
      // no-op edits (e.g. the authoritative echo of an optimistic apply)
      // must not churn the mesher
      if (getVoxel(this.vz, x, y, z) === b) continue;
      if (setVoxelAt(this.vz, x, y, z, b) === null) continue;
      applied.push(p, b);
      this.appliedEdits++;
      this.onEditApplied?.(x, y, z, b);
      for (const c of dirtyChunksFor(this.vz, x, y, z)) {
        dirty.set(c.join(","), c);
      }
    }
    if (applied.length === 0) return;
    for (const w of this.workers) w.postMessage({ type: "edit", pairs: applied });
    for (const [cx, cy, cz] of dirty.values()) this.requestMesh(cx, cy, cz);
  }

  private requestMesh(cx: number, cy: number, cz: number): void {
    const worker = this.workers[this.nextWorker];
    this.nextWorker = (this.nextWorker + 1) % this.workers.length;
    worker.postMessage({ type: "mesh", cx, cy, cz });
  }

  private handleMeshResult(data: { cx: number; cy: number; cz: number; mesh: ChunkMesh | null }): void {
    const key = `${data.cx},${data.cy},${data.cz}`;

    if (this.initialSeen.size < this.initialTotal && !this.initialSeen.has(key)) {
      this.initialSeen.add(key);
      this.initialDone++;
      this.onProgress?.(this.initialDone, this.initialTotal);
    }

    let entry = this.meshes.get(key);
    if (!entry) {
      entry = {};
      this.meshes.set(key, entry);
    }

    // replace solid mesh
    if (entry.solid) {
      this.group.remove(entry.solid);
      entry.solid.geometry.dispose();
      entry.solid = undefined;
    }
    if (entry.water) {
      this.group.remove(entry.water);
      entry.water.geometry.dispose();
      entry.water = undefined;
    }
    const m = data.mesh;
    if (!m) return;

    if (m.indices.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(m.colors, 3));
      geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.voxelMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      entry.solid = mesh;
    }
    if (m.waterIndices.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(m.waterPositions, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(m.waterNormals, 3));
      geo.setIndex(new THREE.BufferAttribute(m.waterIndices, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.waterMat);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      entry.water = mesh;
    }
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    for (const entry of this.meshes.values()) {
      for (const mesh of [entry.solid, entry.water]) {
        if (mesh) {
          this.group.remove(mesh);
          mesh.geometry.dispose();
        }
      }
    }
    this.meshes.clear();
    this.voxelMat.dispose();
    this.waterMat.dispose();
  }
}
