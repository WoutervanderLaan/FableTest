/**
 * Module 07B — render the Rapier bodies.
 *
 * One InstancedMesh holds every debris cube: N tumbling boxes cost ONE draw
 * call, and each frame we just rewrite N matrices. Rendering physics output is
 * almost always this shape — the simulation owns the transforms, the renderer
 * only copies them.
 *
 * Everything here is imperative and ref-based. Rigid bodies change 60× a
 * second; routing that through React state would re-render the tree every
 * frame for no benefit (the same reasoning as PlayerController's refs).
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { VoxelWorld } from "../../shared/voxel";
import { createPhysics, spawnBox, stepPhysics, trimBodies, type Physics } from "../physics/world";

const MAX_DEBRIS = 200;
const THROW_SPEED = 14;

export function Debris({ world: vw }: { world: VoxelWorld }) {
  const { camera } = useThree();
  const physics = useRef<Physics | null>(null);
  const accumulator = useRef({ t: 0 });
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Rapier's wasm loads asynchronously, so the world appears a frame or two
  // after mount. `cancelled` guards the case where we unmount first.
  useEffect(() => {
    let cancelled = false;
    createPhysics(vw).then((p) => {
      if (cancelled) return;
      physics.current = p;
      // seed a few boxes above the spawn so there's something to watch fall
      const cx = vw.sizeX / 2;
      const cz = vw.sizeZ / 2;
      for (let i = 0; i < 12; i++) {
        spawnBox(p, cx + (Math.random() - 0.5) * 6, 30 + i * 1.5, cz + (Math.random() - 0.5) * 6);
      }
    });
    return () => {
      cancelled = true;
      physics.current?.world.free(); // release the wasm-side allocation
      physics.current = null;
    };
  }, [vw]);

  // Q throws a block along the view direction
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const p = physics.current;
      if (!p || e.code !== "KeyQ" || e.repeat) return;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      spawnBox(
        p,
        camera.position.x + dir.x,
        camera.position.y + dir.y,
        camera.position.z + dir.z,
        dir.x * THROW_SPEED,
        dir.y * THROW_SPEED,
        dir.z * THROW_SPEED,
      );
      trimBodies(p, MAX_DEBRIS);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [camera]);

  useFrame((_state, delta) => {
    const p = physics.current;
    const mesh = meshRef.current;
    if (!p || !mesh) return;

    stepPhysics(p, delta, accumulator.current);

    for (let i = 0; i < p.bodies.length; i++) {
      const t = p.bodies[i].translation();
      const r = p.bodies[i].rotation();
      dummy.position.set(t.x, t.y, t.z);
      dummy.quaternion.set(r.x, r.y, r.z, r.w);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = p.bodies.length;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_DEBRIS]} castShadow receiveShadow>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#e8a33d" />
    </instancedMesh>
  );
}
