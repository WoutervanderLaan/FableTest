/**
 * Module 09B — the shader-math toolkit, laid out as a wall of panels.
 *
 * Like module 09 this steps out of the voxel world: one flat camera, eight
 * quads and a sphere. Nothing here is about Ruderal — it's about building the
 * vocabulary that modules 10, 11 and 12D are written in.
 *
 * Read scene/ShaderLab.tsx alongside what you see. Each panel is a handful of
 * lines and one idea.
 */
import { Canvas } from "@react-three/fiber";
import { LitSphere, ShaderLab } from "./scene/ShaderLab";

export function App() {
  return (
    <Canvas camera={{ position: [0, 1.0, 8.0], fov: 55 }}>
      <color attach="background" args={["#1b1915"]} />
      <ShaderLab />
      <LitSphere position={[0, 3.2, 0]} />
    </Canvas>
  );
}
