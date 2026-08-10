/**
 * Module 11C — bushes in the meadow.
 *
 * Six bushes, six seeds, one draw call. Same seed → same bush, every reload;
 * change a seed and you get a different plant with the same character.
 *
 * The knob to find first is "Bush · look → normalBlend". At 0 the bush shades
 * as a round volume; at 1 it shades as what it physically is, a pile of flat
 * cards. That slider is this module in one control.
 */
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { CameraControls } from "./controls/CameraControls";
import { DebugPanel } from "./debug/DebugPanel";
import { Selectable } from "./debug/Selectable";
import { useControls } from "./debug/useControls";
import { Bushes, type BushSpec } from "./scene/Bushes";
import { Grass } from "./scene/Grass";

const FOG = "#cfc8b8";

function Ground() {
  const { color } = useControls("Ground", {
    color: { type: "color", value: "#4a4526" },
  });
  return (
    <>
      <fog attach="fog" args={[FOG, 14, 40]} />
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
  const { seedOffset, spread } = useControls("Bush · layout", {
    seedOffset: { type: "number", value: 0, min: 0, max: 50, step: 1 },
    spread: { type: "number", value: 5.6, min: 2, max: 12, step: 0.1 },
  });

  // Six bushes on a ring. Only the SEED differs between them — every other
  // parameter is shared, which is what makes the diversity so cheap.
  const bushes = useMemo<BushSpec[]>(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return {
          position: [Math.cos(a) * spread, 0.75 + (i % 3) * 0.12, Math.sin(a) * spread] as [
            number,
            number,
            number,
          ],
          seed: 1000 + i * 137 + seedOffset,
          radius: 0.85 + (i % 4) * 0.13,
        };
      }),
    [seedOffset, spread],
  );

  return (
    <>
      <Canvas camera={{ position: [0, 2.6, 10], fov: 55, near: 0.05, far: 400 }}>
        <Ground />
        <Grass />
        <Bushes bushes={bushes} />
        <CameraControls target={[0, 0.9, 0]} radius={10} moveSpeed={6} />
      </Canvas>

      <DebugPanel />
    </>
  );
}
