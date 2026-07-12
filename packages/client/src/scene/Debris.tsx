/**
 * Cosmetic collapse debris (Phase 2): when the server broadcasts a collapse,
 * the fallen blocks burst into client-local Rapier rigid bodies. Rapier (the
 * same pinned build the server runs) is imported lazily on first collapse so
 * the initial bundle stays lean. Purely visual — the authoritative outcome
 * (blocks removed, drops spawned) already arrived via messages.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BLOCK_COLOR, GRAVITY, hash01, isSolid, unpackX, unpackY, unpackZ, type VoxelZone } from "@ruderal/shared";
import type { Net } from "../net/connection";
import type { WorldManager } from "../world/WorldManager";

const MAX_DEBRIS = 120;
const DEBRIS_TTL_MS = 4200;
const MAX_STATIC_REGION = 26;

type RapierModule = typeof import("@dimforge/rapier3d-compat");

interface DebrisEntry {
  body: import("@dimforge/rapier3d-compat").RigidBody;
  color: [number, number, number];
  dieAt: number;
}

class DebrisSim {
  private RAPIER: RapierModule | null = null;
  private world: import("@dimforge/rapier3d-compat").World | null = null;
  private entries: DebrisEntry[] = [];
  private statics: Array<import("@dimforge/rapier3d-compat").Collider> = [];
  private loading = false;

  async burst(blocks: Array<{ x: number; y: number; z: number; b: number }>, vz: VoxelZone): Promise<void> {
    if (!this.RAPIER) {
      if (this.loading) return;
      this.loading = true;
      const mod = await import("@dimforge/rapier3d-compat");
      await mod.init();
      this.RAPIER = mod;
      this.world = new mod.World({ x: 0, y: -GRAVITY, z: 0 });
      this.loading = false;
    }
    const RAPIER = this.RAPIER;
    const world = this.world!;

    // temporary static environment: shell voxels around the burst
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const b of blocks) {
      minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x);
      minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y);
      minZ = Math.min(minZ, b.z); maxZ = Math.max(maxZ, b.z);
    }
    minX = Math.max(0, minX - 3); minY = Math.max(0, minY - 4); minZ = Math.max(0, minZ - 3);
    maxX = Math.min(vz.sizeX - 1, Math.min(maxX + 3, minX + MAX_STATIC_REGION));
    maxY = Math.min(vz.sizeY - 1, Math.min(maxY + 3, minY + MAX_STATIC_REGION));
    maxZ = Math.min(vz.sizeZ - 1, Math.min(maxZ + 3, minZ + MAX_STATIC_REGION));

    for (const c of this.statics) world.removeCollider(c, false);
    this.statics = [];
    const solid = (x: number, y: number, z: number) =>
      y < 0 || (y < vz.sizeY && x >= 0 && x < vz.sizeX && z >= 0 && z < vz.sizeZ &&
        isSolid(vz.voxels[(y * vz.sizeZ + z) * vz.sizeX + x]));
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (!solid(x, y, z)) continue;
          if (
            solid(x - 1, y, z) && solid(x + 1, y, z) && solid(x, y - 1, z) &&
            solid(x, y + 1, z) && solid(x, y, z - 1) && solid(x, y, z + 1)
          ) continue;
          this.statics.push(
            world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setTranslation(x + 0.5, y + 0.5, z + 0.5)),
          );
        }
      }
    }

    const now = performance.now();
    for (const blk of blocks) {
      if (this.entries.length >= MAX_DEBRIS) break;
      const jx = hash01(blk.x, blk.y, blk.z, 1) - 0.5;
      const jz = hash01(blk.x, blk.y, blk.z, 2) - 0.5;
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(blk.x + 0.5, blk.y + 0.5, blk.z + 0.5)
          .setLinvel(jx * 2.5, 1.2 + hash01(blk.x, blk.y, blk.z, 3) * 1.6, jz * 2.5)
          .setAngvel({ x: jx * 5, y: 0, z: jz * 5 }),
      );
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 0.3, 0.3).setDensity(1.4).setFriction(0.9), body);
      this.entries.push({ body, color: [...(BLOCK_COLOR[blk.b] ?? BLOCK_COLOR[10])], dieAt: now + DEBRIS_TTL_MS });
    }
  }

  step(dt: number, mesh: THREE.InstancedMesh, dummy: THREE.Object3D, color: THREE.Color): void {
    const world = this.world;
    if (!world) return;
    world.timestep = Math.min(dt, 0.05);
    world.step();

    const now = performance.now();
    let n = 0;
    const alive: DebrisEntry[] = [];
    for (const e of this.entries) {
      if (now > e.dieAt) {
        world.removeRigidBody(e.body);
        continue;
      }
      alive.push(e);
      const t = e.body.translation();
      const r = e.body.rotation();
      dummy.position.set(t.x, t.y, t.z);
      dummy.quaternion.set(r.x, r.y, r.z, r.w);
      const fade = Math.min(1, (e.dieAt - now) / 600); // shrink out at the end
      dummy.scale.setScalar(fade);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      color.setRGB(e.color[0], e.color[1], e.color[2]);
      mesh.setColorAt(n, color);
      n++;
    }
    this.entries = alive;
    if (alive.length === 0 && this.statics.length > 0) {
      for (const c of this.statics) world.removeCollider(c, false);
      this.statics = [];
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

export function Debris({ net, world }: { net: Net; world: WorldManager }) {
  const sim = useRef(new DebrisSim());
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.62, 0.62, 0.62),
      new THREE.MeshLambertMaterial(),
      MAX_DEBRIS,
    );
    m.castShadow = true;
    m.frustumCulled = false;
    m.count = 0;
    return m;
  }, []);

  useEffect(
    () =>
      net.on("collapse", (pairs) => {
        const blocks: Array<{ x: number; y: number; z: number; b: number }> = [];
        for (let i = 0; i + 1 < pairs.length && blocks.length < 48; i += 2) {
          const p = pairs[i];
          blocks.push({ x: unpackX(p), y: unpackY(p), z: unpackZ(p), b: pairs[i + 1] });
        }
        if (blocks.length > 0) void sim.current.burst(blocks, world.vz);
      }),
    [net, world],
  );

  useFrame((_, dt) => sim.current.step(dt, mesh, dummy, color));

  return <primitive object={mesh} />;
}
