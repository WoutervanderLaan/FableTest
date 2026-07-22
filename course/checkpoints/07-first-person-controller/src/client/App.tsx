/**
 * Module 07 — you're inside the world now. The static camera is gone; a
 * PlayerController drives it from your keyboard and mouse.
 *
 * Key detail: the world is generated ONCE here and shared. The mesh and the
 * controller must reference the *same* `VoxelWorld` object, or you'd collide
 * with a world different from the one you see. This single-source-of-truth
 * world becomes important again in Part 4.
 */
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { meshWorld } from "../shared/mesher";
import { generateWorld, surfaceY } from "../shared/voxel";
import { PlayerController } from "./PlayerController";
import { SkyAndLight } from "./scene/SkyAndLight";
import { Hud } from "./ui/Hud";
import { buildGeometry } from "./voxelMesh";

const WATER_LEVEL = 9;

function Water({ size }: { size: number }) {
  return (
    <mesh
      position={[size / 2, WATER_LEVEL + 0.9, size / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#3e8e7e" transparent opacity={0.75} />
    </mesh>
  );
}

export function App() {
  const { world, geo, spawn } = useMemo(() => {
    const world = generateWorld();
    const geo = buildGeometry(meshWorld(world));
    const cx = Math.floor(world.sizeX / 2);
    const cz = Math.floor(world.sizeZ / 2);
    const spawn = { x: cx + 0.5, y: surfaceY(world, cx, cz) + 1, z: cz + 0.5 };
    return { world, geo, spawn };
  }, []);

  return (
    <>
      <Canvas shadows camera={{ fov: 74, near: 0.1, far: 1500 }}>
        <SkyAndLight center={world.sizeX / 2} />
        <mesh geometry={geo} castShadow receiveShadow>
          <meshStandardMaterial vertexColors />
        </mesh>
        <Water size={world.sizeX} />
        <PlayerController world={world} spawn={spawn} />
      </Canvas>
      <Hud />
    </>
  );
}
