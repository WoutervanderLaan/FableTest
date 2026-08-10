/**
 * Module 02B — the workflow module. Three tunable objects, a selection-aware
 * debug panel, and a camera you can actually inspect things with.
 *
 * Click an object → the panel switches to its controls. Everything from here
 * on (grass, bushes, shaders) registers its knobs the same way.
 */
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";
import { CameraControls } from "./controls/CameraControls";
import { DebugPanel } from "./debug/DebugPanel";
import { Selectable } from "./debug/Selectable";
import { useControls } from "./debug/useControls";

function SpinningCube() {
  const ref = useRef<Mesh>(null);
  // These DO drive React (color is a prop), so the subscribing hook is right.
  const { speed, color, wobble } = useControls("Cube", {
    speed: { type: "number", value: 0.9, min: 0, max: 4, step: 0.01 },
    wobble: { type: "number", value: 0.2, min: 0, max: 1.5, step: 0.01 },
    color: { type: "color", value: "#e8a33d" },
  });

  useFrame((state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * speed;
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 2) * wobble;
  });

  return (
    <Selectable group="Cube">
      <mesh ref={ref} position={[-2.2, 0, 0]} castShadow>
        <boxGeometry args={[1.4, 1.4, 1.4]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </Selectable>
  );
}

function Knot() {
  const { roughness, metalness, color, visible } = useControls("Knot", {
    roughness: { type: "number", value: 0.35, min: 0, max: 1, step: 0.01 },
    metalness: { type: "number", value: 0.1, min: 0, max: 1, step: 0.01 },
    color: { type: "color", value: "#3e8e7e" },
    visible: { type: "boolean", value: true },
  });

  if (!visible) return null;

  return (
    <Selectable group="Knot">
      <mesh position={[1.6, 0.2, 0]} castShadow>
        <torusKnotGeometry args={[0.7, 0.24, 140, 24]} />
        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
      </mesh>
    </Selectable>
  );
}

function Ground() {
  const { color, size } = useControls("Ground", {
    size: { type: "number", value: 24, min: 4, max: 80, step: 1 },
    color: { type: "color", value: "#8c7a5c" },
  });

  return (
    <Selectable group="Ground">
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.1, 0]} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </Selectable>
  );
}

export function App() {
  return (
    <>
      <Canvas shadows camera={{ position: [4, 4, 8], fov: 50 }}>
        <color attach="background" args={["#1b1915"]} />
        <hemisphereLight args={["#cdd4cc", "#6b5f4e", 1.0]} />
        <directionalLight position={[5, 8, 4]} intensity={2.2} castShadow />

        <CameraControls target={[0, 0, 0]} radius={9} />

        <SpinningCube />
        <Knot />
        <Ground />
      </Canvas>

      <DebugPanel />
    </>
  );
}
