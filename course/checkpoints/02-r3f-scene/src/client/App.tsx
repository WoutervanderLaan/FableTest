/**
 * Module 02 — the exact same scene as Module 01, but declarative, in R3F.
 *
 * Compare this file to `vanilla.ts`. There's no `new`, no `.add()`, no render
 * loop you wrote by hand. You describe the scene as JSX and R3F reconciles it
 * into the same Three.js objects — creating, updating, and disposing them as
 * your components mount and re-render. `<Canvas>` owns the renderer + loop.
 */
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

function SpinningCube() {
  // A ref to the underlying THREE.Mesh — the escape hatch back to imperative
  // Three.js. useFrame runs once per rendered frame (this IS the render loop).
  const ref = useRef<Mesh>(null);
  useFrame((_state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.x += delta * 0.6; // delta = seconds since last frame
    ref.current.rotation.y += delta * 0.9;
  });

  return (
    <mesh ref={ref}>
      {/* geometry + material as children — R3F attaches them to the mesh */}
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#e8a33d" />
    </mesh>
  );
}

export function App() {
  return (
    <Canvas camera={{ position: [2.5, 2.5, 3.5], fov: 60 }}>
      {/* `attach="background"` sets scene.background — the JSX way to reach any
          property by name. */}
      <color attach="background" args={["#cfc8b8"]} />
      <hemisphereLight args={["#cdd4cc", "#6b5f4e", 1.0]} />
      <directionalLight position={[3, 5, 2]} intensity={2.5} />
      <SpinningCube />
    </Canvas>
  );
}
