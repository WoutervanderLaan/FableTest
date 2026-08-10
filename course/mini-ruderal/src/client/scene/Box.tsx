import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import { Mesh } from "three";

export const Box = ({ position }: { position: [number, number, number] }) => {
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
