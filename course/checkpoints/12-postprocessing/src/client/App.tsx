/**
 * Module 12 — postprocessing. An EffectComposer takes the rendered image and
 * runs full-screen passes over it before it hits the screen:
 *   - Bloom     : bright pixels bleed a soft glow (our amber blocks + sun)
 *   - Vignette  : darken the corners to focus the eye
 *   - Noise     : a whisper of film grain to unify everything
 * This is the exact stack (and settings) from the real Ruderal's App.tsx.
 */
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { useCallback, useEffect, useMemo, useState } from "react";
import { meshWorld } from "../shared/mesher";
import { generateWorld, surfaceY } from "../shared/voxel";
import { PlayerController } from "./PlayerController";
import { SkyAndLight } from "./scene/SkyAndLight";
import { Vegetation } from "./scene/Vegetation";
import { makeVoxelMaterial } from "./scene/materials";
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

  const voxelMat = useMemo(() => makeVoxelMaterial(), []);
  const geo = useMemo(() => buildGeometry(meshWorld(world)), [world, version]);
  useEffect(() => () => geo.dispose(), [geo]);
  const onEdit = useCallback(() => setVersion((v) => v + 1), []);

  return (
    <>
      <Canvas shadows camera={{ fov: 74, near: 0.1, far: 1500 }}>
        <SkyAndLight center={world.sizeX / 2} />
        <mesh geometry={geo} material={voxelMat} castShadow receiveShadow />
        <Vegetation world={world} />
        <Water size={world.sizeX} />
        <PlayerController world={world} spawn={spawn} onEdit={onEdit} />

        <EffectComposer>
          {/* luminanceThreshold: only pixels brighter than this bloom. Our amber
              (~0.9) clears it; the muted terrain (~0.5) doesn't. */}
          <Bloom mipmapBlur luminanceThreshold={0.85} intensity={0.4} />
          <Vignette eskil={false} offset={0.25} darkness={0.55} />
          <Noise opacity={0.035} />
        </EffectComposer>
      </Canvas>
      <Hud />
    </>
  );
}
