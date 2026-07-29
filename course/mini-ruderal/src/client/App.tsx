import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { Mesh, Vector3 } from "three";
import { makePatchwork } from "./MeshBuilder";
import { SkyAndLight } from "./scene/SkyAndLight";

const Box = ({ position }: { position: [number, number, number] }) => {
  const boxRef = useRef<Mesh>(null);
  const [active, setActive] = useState(false);
  const [clicked, setClicked] = useState(false);

  useFrame((_state, delta) => {
    if (!boxRef.current) return;

    boxRef.current.rotation.x += delta * 0.5;
    boxRef.current.rotation.y += delta * 0.6;
  });

  return (
    <mesh
      ref={boxRef}
      castShadow
      receiveShadow
      position={position}
      onPointerOver={() => setActive(true)}
      onPointerOut={() => setActive(false)}
      onClick={() => setClicked((prev) => !prev)}
    >
      <boxGeometry args={[4, 4, 4]} />
      <meshStandardMaterial
        color={clicked ? "#fff" : active ? "#e8a33d" : "#09eef6"}
      />
    </mesh>
  );
};

const Ground = () => {
  const geometry = useMemo(() => makePatchwork(1000), []);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors />
    </mesh>
  );
};

export const App = () => {
  return (
    <Canvas
      shadows
      camera={{ position: [8, 12, 30], fov: 55 }}
      onCreated={({ camera }) => camera.lookAt(8, 1, 8)}
    >
      <SkyAndLight center={8} />

      <Ground />

      <group position={new Vector3(0, 0, -1)}>
        <Box position={[10, 5, 16]} />
        <Box position={[0, 5, 16]} />
      </group>
    </Canvas>
  );
};
