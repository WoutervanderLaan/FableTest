import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import { Mesh, Vector3 } from "three";

const Box = ({ position }: { position: Vector3 }) => {
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
      position={position}
      onPointerOver={() => setActive(true)}
      onPointerOut={() => setActive(false)}
      onClick={() => setClicked((prev) => !prev)}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={clicked ? "#fff" : active ? "#e8a33d" : "#000"}
      />
    </mesh>
  );
};

export const App = () => {
  return (
    <Canvas
      camera={{
        fov: 60,
        near: 0.1,
        far: 100,
        position: [2.5, 2.5, 3.5],
      }}
    >
      <color attach="background" args={["#9bd4b7"]} />
      <hemisphereLight args={["#cdd4cc", "#6b5f4e", 1.0]} />
      <directionalLight position={[3, 5, 2]} intensity={2.5} />
      <group position={new Vector3(0, 0, -1)}>
        <Box position={new Vector3(1, 0, 1)} />
        <Box position={new Vector3(-1, 0, 1)} />
      </group>
    </Canvas>
  );
};
