/**
 * Module 08D — the world is now a WorldManager (chunk meshes built off-thread,
 * with AO). Its `group` goes into the scene via a single <primitive>. Editing
 * calls `wm.applyEdit`, which re-meshes only the touched chunk in the worker —
 * so building feels instant even on a big world.
 */
import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useMemo } from "react";
import { generateWorld, surfaceY } from "../shared/voxel";
import { PlayerController } from "./PlayerController";
import { SkyAndLight } from "./scene/SkyAndLight";
import { Hud } from "./ui/Hud";
import { WorldManager } from "./WorldManager";

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
  const wm = useMemo(() => new WorldManager(generateWorld()), []);
  useEffect(() => () => wm.dispose(), [wm]);

  const spawn = useMemo(() => {
    const cx = Math.floor(wm.world.sizeX / 2);
    const cz = Math.floor(wm.world.sizeZ / 2);
    return { x: cx + 0.5, y: surfaceY(wm.world, cx, cz) + 1, z: cz + 0.5 };
  }, [wm]);

  const edit = useCallback(
    (x: number, y: number, z: number, b: number) => wm.applyEdit(x, y, z, b),
    [wm],
  );

  return (
    <>
      <Canvas shadows camera={{ fov: 74, near: 0.1, far: 1500 }}>
        <SkyAndLight center={wm.world.sizeX / 2} />
        <primitive object={wm.group} />
        <Water size={wm.world.sizeX} />
        <PlayerController world={wm.world} spawn={spawn} edit={edit} />
      </Canvas>
      <Hud />
    </>
  );
}
