/**
 * Module 04B — the same lit scene as 04, but the objects in it were authored
 * somewhere else and loaded at runtime from a glTF file.
 *
 * Note the shape of the thing: <Suspense> INSIDE <Canvas>. R3F's canvas is a
 * React renderer like any other, so React's own loading protocol works here —
 * and the fallback is 3D content (a placeholder box), not HTML.
 */
import { Canvas } from "@react-three/fiber";
import { Suspense, useMemo } from "react";
import { makePatchwork } from "./meshbuilder";
import { Crate, TintedCrate } from "./scene/Crate";
import { SkyAndLight } from "./scene/SkyAndLight";

function Ground() {
  const geo = useMemo(() => makePatchwork(16), []);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors />
    </mesh>
  );
}

/** Shown while the glTF is in flight. Suspense fallbacks are just more scene. */
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
      camera={{ position: [8, 12, 30], fov: 55 }}
      onCreated={({ camera }) => camera.lookAt(8, 1, 8)}
    >
      <SkyAndLight center={8} />
      <Ground />

      <Suspense fallback={<LoadingBox />}>
        {/* one file, parsed once, instanced four ways */}
        <Crate position={[6, 1.5, 8]} scale={2.5} />
        <Crate position={[9.5, 1.5, 6]} scale={2.5} />
        <TintedCrate position={[11, 1.5, 10]} scale={2.5} color="#6fa24b" />
        <TintedCrate position={[7, 4, 9]} scale={1.6} color="#e8a33d" />
      </Suspense>
    </Canvas>
  );
}
