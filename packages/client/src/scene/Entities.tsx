/**
 * Server-owned entities: projectiles (interpolated) and drops (bobbing
 * pickups). Both render as instanced meshes fed straight from Colyseus state.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BLOCK_COLOR, INTERP_DELAY_MS } from "@ruderal/shared";
import type { Net } from "../net/connection";
import { SnapshotBuffer } from "../net/interpolation";

const MAX_PROJECTILES = 64;
const MAX_DROPS = 320;

export function Entities({ net }: { net: Net }) {
  const projMesh = useMemo(() => {
    const m = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.34, 0.34, 0.34),
      new THREE.MeshLambertMaterial({ color: "#8d857a" }),
      MAX_PROJECTILES,
    );
    m.castShadow = true;
    m.frustumCulled = false;
    m.count = 0;
    return m;
  }, []);

  const dropMesh = useMemo(() => {
    const m = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.26, 0.26, 0.26),
      new THREE.MeshLambertMaterial({ emissiveIntensity: 0.25, emissive: "#3a352c" }),
      MAX_DROPS,
    );
    m.frustumCulled = false;
    m.count = 0;
    return m;
  }, []);

  const projBuffers = useRef(new Map<string, SnapshotBuffer>());
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame((frameState) => {
    const state = net.room.state as {
      projectiles?: {
        forEach(cb: (p: { x: number; y: number; z: number }, id: string) => void): void;
      };
      drops?: {
        forEach(cb: (d: { x: number; y: number; z: number; b: number }, id: string) => void): void;
      };
    };

    // projectiles: interpolate
    const renderT = performance.now() - INTERP_DELAY_MS;
    const seen = new Set<string>();
    let n = 0;
    state.projectiles?.forEach((p, id) => {
      seen.add(id);
      let buf = projBuffers.current.get(id);
      if (!buf) {
        buf = new SnapshotBuffer();
        projBuffers.current.set(id, buf);
      }
      buf.push(p.x, p.y, p.z);
      const s = buf.sample(renderT) ?? p;
      if (n < MAX_PROJECTILES) {
        dummy.position.set(s.x, s.y, s.z);
        dummy.rotation.set(s.x * 3, s.y * 3, s.z * 3); // cheap tumble
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        projMesh.setMatrixAt(n, dummy.matrix);
        n++;
      }
    });
    for (const id of projBuffers.current.keys()) {
      if (!seen.has(id)) projBuffers.current.delete(id);
    }
    projMesh.count = n;
    projMesh.instanceMatrix.needsUpdate = true;

    // drops: static positions with bob + spin
    const t = frameState.clock.elapsedTime;
    let dn = 0;
    state.drops?.forEach((d) => {
      if (dn >= MAX_DROPS) return;
      dummy.position.set(d.x, d.y + Math.sin(t * 2 + d.x + d.z) * 0.08 + 0.1, d.z);
      dummy.rotation.set(0, t * 1.2 + d.x, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      dropMesh.setMatrixAt(dn, dummy.matrix);
      const c = BLOCK_COLOR[d.b] ?? BLOCK_COLOR[10];
      color.setRGB(c[0], c[1], c[2]);
      dropMesh.setColorAt(dn, color);
      dn++;
    });
    dropMesh.count = dn;
    dropMesh.instanceMatrix.needsUpdate = true;
    if (dropMesh.instanceColor) dropMesh.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <primitive object={projMesh} />
      <primitive object={dropMesh} />
    </>
  );
}
