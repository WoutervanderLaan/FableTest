/**
 * Module 04 — a proto-world: patchwork ground + a few blocks, now lit with a
 * sun that casts shadows, ambient fill, fog, and a sky dome.
 *
 * Shadows need three opt-ins working together:
 *   1. <Canvas shadows>            — turn the shadow pass on
 *   2. <directionalLight castShadow> — a light that emits shadows (in SkyAndLight)
 *   3. per-mesh castShadow / receiveShadow — who blocks light, who catches it
 * Miss any one and you get no shadows (a classic first-time gotcha).
 */
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { makeCube, makePatchwork } from "./meshbuilder";
import { SkyAndLight } from "./scene/SkyAndLight";

function Ground() {
  const geo = useMemo(() => makePatchwork(16), []);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors />
    </mesh>
  );
}

function Block({ pos, color }: { pos: [number, number, number]; color: string }) {
  const geo = useMemo(() => makeCube(new THREE.Color(color)), [color]);
  return (
    <mesh geometry={geo} position={pos} scale={2} castShadow receiveShadow>
      <meshStandardMaterial vertexColors />
    </mesh>
  );
}

export function App() {
  return (
    <Canvas
      shadows
      camera={{ position: [8, 12, 30], fov: 55 }}
      onCreated={({ camera }) => camera.lookAt(8, 1, 8)}
    >
      <SkyAndLight center={8} />
      <Ground />
      <Block pos={[5, 1, 6]} color="#8c7a5c" />
      <Block pos={[9, 1, 9]} color="#6fa24b" />
      <Block pos={[11, 1, 5]} color="#3e8e7e" />
      <Block pos={[7, 3, 7]} color="#e8a33d" />
    </Canvas>
  );
}
