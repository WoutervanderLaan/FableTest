/**
 * Module 03 — render geometry we built by hand instead of using BoxGeometry.
 *
 * Both meshes use `vertexColors`: the color comes from the geometry's `color`
 * attribute, not the material. That's exactly how the voxel world will be
 * colored later — one flat material, all the variety baked into vertices.
 */
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { makeCube, makePatchwork } from "./meshbuilder";

function HandCube() {
  const geo = useMemo(() => makeCube(new THREE.Color("#e8a33d")), []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_s, d) => {
    if (ref.current) ref.current.rotation.y += d * 0.5;
  });
  return (
    <mesh ref={ref} geometry={geo} position={[8, 2.5, 8]}>
      <meshStandardMaterial vertexColors />
    </mesh>
  );
}

function Patchwork() {
  const geo = useMemo(() => makePatchwork(16), []);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial vertexColors />
    </mesh>
  );
}

export function App() {
  return (
    <Canvas
      camera={{ position: [8, 15, 32], fov: 55 }}
      onCreated={({ camera }) => camera.lookAt(8, 1, 8)}
    >
      <color attach="background" args={["#cfc8b8"]} />
      <hemisphereLight args={["#cdd4cc", "#6b5f4e", 0.9]} />
      <directionalLight position={[12, 18, 6]} intensity={2.2} />
      <Patchwork />
      <HandCube />
    </Canvas>
  );
}
