import { Canvas } from "@react-three/fiber";
import { SkyAndLight } from "./scene/SkyAndLight";
import { Ground } from "./scene/Ground";
import { Crate, TintedCrate } from "./scene/Crate";

const POSITION: [number, number, number] = [8, 0.5, 8];
const SCALE = 1;

export const App = () => {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 3, 14], fov: 24 }}
      onCreated={({ camera }) => camera.lookAt(...POSITION)}
    >
      <SkyAndLight center={8} />
      <Ground />

      <Crate position={[8, 0.5, 6]} scale={SCALE} />
      <TintedCrate color="#ff00ee" position={POSITION} scale={SCALE} />
    </Canvas>
  );
};
