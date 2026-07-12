/**
 * The imperative chunk layer. Chunk geometry never passes through React
 * reconciliation (plan §3.7): a worker pool meshes chunks nearest-first and
 * finished meshes are attached straight to a THREE.Group.
 */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CHUNK, type ChunkMesh, type VoxelZone } from "@ruderal/shared";
import { makeVoxelMaterial, makeWaterMaterial } from "./materials";

interface WorldProps {
  vz: VoxelZone;
  spawn: { x: number; y: number; z: number };
  onProgress: (done: number, total: number) => void;
}

export function World({ vz, spawn, onProgress }: WorldProps) {
  const group = useMemo(() => new THREE.Group(), []);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  useEffect(() => {
    const voxelMat = makeVoxelMaterial();
    const waterMat = makeWaterMaterial();

    const chunksX = Math.ceil(vz.sizeX / CHUNK);
    const chunksY = Math.ceil(vz.sizeY / CHUNK);
    const chunksZ = Math.ceil(vz.sizeZ / CHUNK);

    // nearest-first job order: the street you spawn on appears immediately
    const jobs: Array<{ cx: number; cy: number; cz: number; d2: number }> = [];
    for (let cx = 0; cx < chunksX; cx++) {
      for (let cy = 0; cy < chunksY; cy++) {
        for (let cz = 0; cz < chunksZ; cz++) {
          const dx = (cx + 0.5) * CHUNK - spawn.x;
          const dz = (cz + 0.5) * CHUNK - spawn.z;
          jobs.push({ cx, cy, cz, d2: dx * dx + dz * dz });
        }
      }
    }
    jobs.sort((a, b) => a.d2 - b.d2);
    const total = jobs.length;
    let done = 0;
    let next = 0;

    const workerCount = Math.min(4, Math.max(2, (navigator.hardwareConcurrency || 4) - 1));
    const workers: Worker[] = [];

    const handleResult = (worker: Worker, data: { mesh: ChunkMesh | null }) => {
      done++;
      progressRef.current(done, total);
      const m = data.mesh;
      if (m && m.indices.length > 0) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
        geo.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(m.colors, 3));
        geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, voxelMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
      }
      if (m && m.waterIndices.length > 0) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(m.waterPositions, 3));
        geo.setAttribute("normal", new THREE.BufferAttribute(m.waterNormals, 3));
        geo.setIndex(new THREE.BufferAttribute(m.waterIndices, 1));
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, waterMat);
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
      }
      // feed the worker its next job
      if (next < jobs.length) {
        const j = jobs[next++];
        worker.postMessage({ type: "mesh", cx: j.cx, cy: j.cy, cz: j.cz });
      }
    };

    for (let w = 0; w < workerCount; w++) {
      const worker = new Worker(new URL("../worker/mesher.worker.ts", import.meta.url), {
        type: "module",
      });
      // each worker gets its own copy of the volume (structured clone)
      worker.postMessage({
        type: "init",
        sizeX: vz.sizeX,
        sizeY: vz.sizeY,
        sizeZ: vz.sizeZ,
        waterLevel: vz.waterLevel,
        seed: vz.seed,
        voxels: vz.voxels.buffer,
      });
      worker.onmessage = (e) => handleResult(worker, e.data);
      workers.push(worker);
    }
    // prime each worker with a couple of jobs to keep the pipe full
    for (const worker of workers) {
      for (let k = 0; k < 2 && next < jobs.length; k++) {
        const j = jobs[next++];
        worker.postMessage({ type: "mesh", cx: j.cx, cy: j.cy, cz: j.cz });
      }
    }

    return () => {
      for (const w of workers) w.terminate();
      for (const child of [...group.children]) {
        group.remove(child);
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      }
      voxelMat.dispose();
      waterMat.dispose();
    };
  }, [vz, spawn, group]);

  return <primitive object={group} />;
}
