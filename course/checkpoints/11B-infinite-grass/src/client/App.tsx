/**
 * Module 11B — walk around an endless meadow.
 *
 * Fly with WASD and watch the horizon: the grass never runs out, never pops,
 * and never gets more expensive. Open the "Grass · field" panel and drop
 * `resolution` to 60 to see the trick exposed — you'll spot the disc of blades
 * following you around.
 */
import { Canvas } from "@react-three/fiber";
import { CameraControls } from "./controls/CameraControls";
import { DebugPanel } from "./debug/DebugPanel";
import { Selectable } from "./debug/Selectable";
import { useControls } from "./debug/useControls";
import { Grass } from "./scene/Grass";

const FOG = "#cfc8b8";

/** The earth under the grass, plus the fog the field fades into. */
function Ground() {
  const { color } = useControls("Ground", {
    color: { type: "color", value: "#4a4526" },
  });

  return (
    <>
      <fog attach="fog" args={[FOG, 12, 34]} />
      <color attach="background" args={[FOG]} />
      <Selectable group="Ground">
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
          <planeGeometry args={[400, 400]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </Selectable>
    </>
  );
}

export function App() {
  return (
    <>
      <Canvas camera={{ position: [0, 1.4, 5], fov: 55, near: 0.05, far: 400 }}>
        <Ground />
        <Grass />
        <CameraControls target={[0, 0.5, 0]} radius={5} moveSpeed={7} />
      </Canvas>

      <DebugPanel />
    </>
  );
}
