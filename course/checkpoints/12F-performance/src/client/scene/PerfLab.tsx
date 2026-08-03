/**
 * Module 12F — the same 4,000 cubes, drawn three different ways.
 *
 *   <SeparateMeshes/>  4,000 <mesh> objects      → 4,000 draw calls
 *   <SharedMeshes/>    4,000 meshes, ONE geometry + ONE material
 *                                                → still 4,000 draw calls
 *   <InstancedCubes/>  1 InstancedMesh           → 1 draw call
 *
 * The middle one is the important one. Sharing geometry and material saves
 * memory and shader compiles, but it does NOT reduce draw calls — the renderer
 * still issues one per object. Only instancing collapses them.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export const COUNT = 4000;
const SPREAD = 34;

/** Deterministic layout so all three modes draw the identical scene. */
function layout(i: number): { pos: [number, number, number]; scale: number; hue: number } {
  const h = (x: number) => {
    const s = Math.sin(x * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  return {
    pos: [(h(i) - 0.5) * SPREAD, (h(i + 91) - 0.5) * 10, (h(i + 57) - 0.5) * SPREAD],
    scale: 0.25 + h(i + 13) * 0.55,
    hue: h(i + 29),
  };
}

const PALETTE = ["#6fa24b", "#3e8e7e", "#8c7a5c", "#c7c94f", "#e8a33d"];

/** WORST: every cube builds its own geometry and material. */
export function SeparateMeshes() {
  const items = useMemo(
    () => Array.from({ length: COUNT }, (_, i) => ({ i, ...layout(i) })),
    [],
  );
  return (
    <>
      {items.map(({ i, pos, scale, hue }) => (
        // a fresh BoxGeometry and MeshLambertMaterial per cube: COUNT of each
        <mesh key={i} position={pos} scale={scale}>
          <boxGeometry args={[1, 1, 1]} />
          <meshLambertMaterial color={PALETTE[Math.floor(hue * PALETTE.length)]} />
        </mesh>
      ))}
    </>
  );
}

/** BETTER: one geometry, one material, shared by every cube. Still COUNT calls. */
export function SharedMeshes() {
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshLambertMaterial({ color: "#8c7a5c" }), []);
  const items = useMemo(
    () => Array.from({ length: COUNT }, (_, i) => ({ i, ...layout(i) })),
    [],
  );

  // dispose what we created, when we created it — see the lesson's ownership rule
  useLayoutEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return (
    <>
      {items.map(({ i, pos, scale }) => (
        <mesh key={i} geometry={geometry} material={material} position={pos} scale={scale} />
      ))}
    </>
  );
}

/** BEST: one InstancedMesh — one draw call for all COUNT cubes. */
export function InstancedCubes({ spin = false }: { spin?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const color = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      const { pos, scale, hue } = layout(i);
      dummy.position.set(pos[0], pos[1], pos[2]);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(PALETTE[Math.floor(hue * PALETTE.length)]));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // These instances never move. Telling three to stop recomputing the
    // object's world matrix every frame is free performance for static scenery.
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    // StaticDrawUsage hints that the buffer won't change — the same hint
    // Ruderal's Vegetation.tsx sets on its 14,000 grass blades.
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  }, [dummy]);

  useFrame((_state, delta) => {
    if (spin && ref.current) {
      ref.current.rotation.y += delta * 0.1;
      ref.current.updateMatrix(); // required, since matrixAutoUpdate is off
    }
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial />
    </instancedMesh>
  );
}
