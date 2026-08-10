/**
 * Module 06 — render the actual voxel world. The relief map from Module 05 is
 * gone; this is the real thing, built by the mesher, one merged mesh with the
 * whole world's visible faces. Water is a cheap translucent plane for now
 * (proper water meshing is a rabbit hole we don't need yet).
 */
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { meshWorld } from "../shared/mesher";
import { generateWorld } from "../shared/voxel";
import { SkyAndLight } from "./scene/SkyAndLight";
import { buildGeometry } from "./voxelMesh";

const WORLD_SIZE = 64;
const WATER_LEVEL = 9;

function VoxelWorldMesh() {
  const geo = useMemo(() => buildGeometry(meshWorld(generateWorld())), []);
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial vertexColors />
    </mesh>
  );
}

function Water() {
  return (
    <mesh
      position={[WORLD_SIZE / 2, WATER_LEVEL + 0.9, WORLD_SIZE / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[WORLD_SIZE, WORLD_SIZE]} />
      <meshStandardMaterial color="#3e8e7e" transparent opacity={0.75} />
    </mesh>
  );
}

export function App() {
  return (
    <Canvas
      shadows
      camera={{ position: [32, 42, 104], fov: 50 }}
      onCreated={({ camera }) => camera.lookAt(32, 8, 32)}
    >
      <SkyAndLight center={32} />
      <VoxelWorldMesh />
      <Water />
    </Canvas>
  );
}
