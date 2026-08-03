/**
 * Module 07B — the same world, now with TWO physics systems in it.
 *
 * The player still moves through `shared/movement.ts` + `shared/collide.ts`:
 * hand-rolled, deterministic, and (in Part 4) shared with the server. The
 * debris cubes move through Rapier. Same voxel data, two solvers, chosen for
 * two different jobs.
 *
 * Key detail from module 07 still holds: the world is generated ONCE and the
 * same `VoxelWorld` object feeds the mesh, the controller, AND now the Rapier
 * collider — so all three agree about where the ground is.
 */
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { meshWorld } from "../shared/mesher";
import { generateWorld, surfaceY } from "../shared/voxel";
import { PlayerController } from "./PlayerController";
import { Debris } from "./scene/Debris";
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
        <Debris world={world} />
      </Canvas>
      <Hud />
    </>
  );
}
