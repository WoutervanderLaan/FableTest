import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BackSide, DirectionalLight, MeshBasicMaterial } from "three";

const Sun = ({ center }: { center: number }) => {
  const ref = useRef<DirectionalLight>(null);
  const angle = useRef(Math.PI * 0.15); // start low in the east

  useFrame((_state, delta) => {
    if (!ref.current) return;

    angle.current += delta * 0.01; // radians/sec → controls day length

    const radius = 80;
    const height = 90;

    ref.current.position.set(
      center + Math.cos(angle.current) * radius, // east ↔ west
      Math.sin(angle.current) * height, // altitude
      center + 40, // fixed tilt toward camera
    );

    // fade out below the horizon; clamp so night is fully dark
    const daylight = Math.max(0, Math.sin(angle.current));
    ref.current.intensity = daylight * 1.9;
  });

  return (
    <directionalLight
      ref={ref}
      target-position={[center, 0, center]}
      color="#ffd9a0"
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-60}
      shadow-camera-right={60}
      shadow-camera-top={60}
      shadow-camera-bottom={-60}
      shadow-camera-near={1}
      shadow-camera-far={220}
      shadow-bias={-0.0004}
      shadow-normalBias={0.5}
    />
  );
};

const Dome = ({ center }: { center: number }) => {
  const skyMat = useMemo(
    () =>
      new MeshBasicMaterial({
        color: "#b9c2c4",
        side: BackSide, // we're inside the sphere; render inner faces
        fog: false, // the dome keeps its color; fog can't swallow it
      }),
    [],
  );

  return (
    <mesh
      material={skyMat}
      position={[center, 0, center]}
      frustumCulled={false}
    >
      <sphereGeometry args={[400, 24, 12]} />
    </mesh>
  );
};

export const SkyAndLight = ({ center = 8 }: { center?: number }) => {
  return (
    <>
      <Dome center={center} />

      <fog attach="fog" args={["#cfc8b8", 30, 100]} />

      <hemisphereLight args={["#cdd4cc", "#6b5f4e", 0.85]} />

      <Sun center={center} />
    </>
  );
};
