/**
 * Module 04D — a composed scene with no voxels in it.
 *
 * Loaded models (04B), textured surfaces (04C), a glTF animation clip, and an
 * eased camera rig. This is the whole model-based path: everything you need
 * for a good-looking interactive scene, without a mesher in sight.
 */
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { AnimatedCrate } from "./scene/AnimatedCrate";
import { CameraRig, Ring } from "./scene/Composition";
import { Crate, TintedCrate } from "./scene/Crate";
import { SkyAndLight } from "./scene/SkyAndLight";
import { PbrCrate, TiledGround } from "./scene/TextureLab";

function LoadingBox() {
  return (
    <mesh position={[8, 2, 8]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#8c7a5c" wireframe />
    </mesh>
  );
}

const PALETTE = ["#6fa24b", "#3e8e7e", "#8c7a5c", "#c7c94f", "#e8a33d"];

export function App() {
  return (
    <Canvas shadows camera={{ position: [8, 10, 30], fov: 55 }}>
      <SkyAndLight center={8} />
      <CameraRig target={[8, 2, 8]} radius={22} height={9} />

      <Suspense fallback={<LoadingBox />}>
        <TiledGround />

        {/* the hero object, dead center */}
        <PbrCrate position={[8, 1.5, 8]} />

        {/* the glTF's own "Spin" clip, one mixer per instance */}
        <AnimatedCrate position={[8, 5.5, 8]} scale={1.4} timeScale={0.6} />

        {/* layout by arithmetic, not by hand */}
        <Ring count={5} radius={7} center={[8, 1, 8]}>
          {(pos, i) => (
            <TintedCrate position={pos} scale={1.6} color={PALETTE[i % PALETTE.length]} />
          )}
        </Ring>

        <Crate position={[8, 1, 18]} scale={2} />
      </Suspense>
    </Canvas>
  );
}
