import { Canvas } from "@react-three/fiber";
import { SkyAndLight } from "./scene/SkyAndLight";
import { Ground } from "./scene/Ground";
import { Crate, TintedCrate } from "./scene/Crate";
import { CheckerPanel, PBRCrate } from "./scene/TextureLab";
import { Vector3 } from "three";
import { AnimatedCrate } from "./scene/AnimatedCrate";

export const App = () => {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 3, 20], fov: 40 }}
      onCreated={({ camera }) => camera.lookAt(new Vector3(8, 1.5, 6))}
    >
      <SkyAndLight center={8} />
      <Ground />

      <Crate position={[7.9, 0.5, 6.1]} />
      <TintedCrate color="#ff00ee" position={[8, 1.5, 6]} />
      <PBRCrate position={[8.1, 2.5, 5.8]} />
      <AnimatedCrate position={[4, 2, 6]} clipName="Spin" />
      <CheckerPanel position={[6, 1.5, 0]} />
    </Canvas>
  );
};
