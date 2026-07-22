/**
 * Module 08 — editing wired end to end. When you break or place a block, the
 * controller mutates the shared `world` and bumps `version`; that rebuilds the
 * geometry via the mesher and R3F swaps it onto the mesh.
 *
 * Re-meshing the WHOLE world on every click is wasteful (you'll feel it as a
 * tiny hitch). That's the exact problem Module 08D solves with chunking + a web
 * worker — the way the real Ruderal does it.
 */
import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [version, setVersion] = useState(0);

  const { world, spawn } = useMemo(() => {
    const world = generateWorld();
    const cx = Math.floor(world.sizeX / 2);
    const cz = Math.floor(world.sizeZ / 2);
    const spawn = { x: cx + 0.5, y: surfaceY(world, cx, cz) + 1, z: cz + 0.5 };
    return { world, spawn };
  }, []);

  // Rebuild whenever an edit bumps `version`. (world is stable; version isn't.)
  const geo = useMemo(() => buildGeometry(meshWorld(world)), [world, version]);
  // Dispose the previous geometry when it's replaced, so the GPU doesn't leak.
  useEffect(() => () => geo.dispose(), [geo]);

  const onEdit = useCallback(() => setVersion((v) => v + 1), []);

  return (
    <>
      <Canvas shadows camera={{ fov: 74, near: 0.1, far: 1500 }}>
        <SkyAndLight center={world.sizeX / 2} />
        <mesh geometry={geo} castShadow receiveShadow>
          <meshStandardMaterial vertexColors />
        </mesh>
        <Water size={world.sizeX} />
        <PlayerController world={world} spawn={spawn} onEdit={onEdit} />
      </Canvas>
      <Hud />
    </>
  );
}
