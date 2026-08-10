/**
 * Module 04C — textures. The scene is a reading exercise: a UV checker to see
 * texture space directly, a tiled ground to feel wrapping/repeat/anisotropy,
 * a hand-assembled PBR crate, and the glTF crate from 04B whose textures the
 * loader wired up for us.
 */
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { Crate } from "./scene/Crate";
import { SkyAndLight } from "./scene/SkyAndLight";
import { CheckerPanel, PbrCrate, TiledGround } from "./scene/TextureLab";

function LoadingBox() {
  return (
    <mesh position={[8, 2, 8]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#8c7a5c" wireframe />
    </mesh>
  );
}

export function App() {
  return (
    <Canvas
      shadows
      camera={{ position: [8, 10, 26], fov: 55 }}
      onCreated={({ camera }) => camera.lookAt(8, 2, 8)}
    >
      <SkyAndLight center={8} />

      <Suspense fallback={<LoadingBox />}>
        <TiledGround />
        <CheckerPanel position={[2, 3.2, 6]} />
        <PbrCrate position={[8, 1.5, 8]} />
        {/* 04B's model — its material came from the glTF, textures and all */}
        <Crate position={[14, 1.5, 7]} scale={3} />
      </Suspense>
    </Canvas>
  );
}
