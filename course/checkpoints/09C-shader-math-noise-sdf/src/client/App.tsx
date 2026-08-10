/**
 * Module 09C — noise, warping and SDFs.
 *
 * Six panels showing the tower (hash → value noise → fbm → domain warp), plus
 * SDF shapes and dithering, plus an fbm-displaced surface with a fresnel rim
 * so you can see the same maths driving geometry rather than just colour.
 *
 * Read scene/NoiseLab.tsx alongside it.
 */
import { Canvas } from "@react-three/fiber";
import { NoiseLab, NoiseSurface } from "./scene/NoiseLab";

export function App() {
  return (
    <Canvas camera={{ position: [0, 1.4, 8.5], fov: 55 }}>
      <color attach="background" args={["#1b1915"]} />
      <NoiseLab />
      <NoiseSurface position={[0, 3.5, 0]} />
    </Canvas>
  );
}
