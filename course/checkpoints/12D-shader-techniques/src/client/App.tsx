/**
 * Module 12D (deep-dive) — the flat water plane becomes a custom water shader
 * (see scene/Water.tsx): displaced waves, fresnel edge glow, and sparkle. Only
 * two lines change here — the import and the <Water> usage. Everything else is
 * Module 12.
 */
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { useCallback, useEffect, useMemo, useState } from "react";
import { meshWorld } from "../shared/mesher";
import { generateWorld, surfaceY } from "../shared/voxel";
import { PlayerController } from "./PlayerController";
import { SkyAndLight } from "./scene/SkyAndLight";
import { Vegetation } from "./scene/Vegetation";
import { Water } from "./scene/Water";
import { makeVoxelMaterial } from "./scene/materials";
import { Hud } from "./ui/Hud";
import { buildGeometry } from "./voxelMesh";

const WATER_LEVEL = 9;

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
        <Water size={world.sizeX} level={WATER_LEVEL} />
        <PlayerController world={world} spawn={spawn} onEdit={onEdit} />

        <EffectComposer>
          <Bloom mipmapBlur luminanceThreshold={0.85} intensity={0.4} />
          <Vignette eskil={false} offset={0.25} darkness={0.55} />
          <Noise opacity={0.035} />
        </EffectComposer>
      </Canvas>
      <Hud />
    </>
  );
}
