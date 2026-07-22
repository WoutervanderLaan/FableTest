/**
 * Module 05 — render the generated world as a surface relief map. This is a
 * stepping stone: it proves the `src/shared/` voxel data is real and looks like
 * a world, using only the geometry + lighting skills from Part 1. In Module 06
 * we build the actual mesher.
 */
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { generateWorld } from "../shared/voxel";
import { SkyAndLight } from "./scene/SkyAndLight";
import { buildSurfaceMap } from "./surfaceMap";

function SurfaceMap() {
  const geo = useMemo(() => buildSurfaceMap(generateWorld()), []);
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial vertexColors />
    </mesh>
  );
}

export function App() {
  return (
    <Canvas
      shadows
      camera={{ position: [32, 52, 104], fov: 50 }}
      onCreated={({ camera }) => camera.lookAt(32, 6, 32)}
    >
      <SkyAndLight center={32} />
      <SurfaceMap />
    </Canvas>
  );
}
