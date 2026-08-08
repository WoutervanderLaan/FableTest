import { Suspense, useEffect, useMemo, useRef } from "react";
import { useGLTF } from "../loaders/gltf";
import { enableShadows } from "../utils/enableShadows";
import { disposeMaterial } from "../utils/disposeMaterial";
import { setMaterialColor } from "../utils/setMaterialColor";
import { ErrorBoundary } from "react-error-boundary";
import { Mesh } from "three";

type CrateProps = {
  position?: [number, number, number];
  scale?: number;
};

const LoadingBox = ({ position, scale }: CrateProps) => (
  <mesh position={position} scale={scale} castShadow>
    <boxGeometry args={[1, 1, 1]} />
    <meshStandardMaterial wireframe />
  </mesh>
);

const ErrorBox = ({ position, scale }: CrateProps) => {
  const meshRef = useRef<Mesh>(null);

  return (
    <mesh ref={meshRef} position={position} scale={scale} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#ff0000" />
    </mesh>
  );
};

const CratePrimitive = ({ position = [0, 0, 0], scale = 1 }: CrateProps) => {
  const gltf = useGLTF("/crate.gltf");

  const scene = useMemo(() => enableShadows(gltf.scene.clone()), [gltf]);

  return <primitive object={scene} position={position} scale={scale} />;
};

const TintedCratePrimitive = ({
  position = [0, 0, 0],
  scale = 1,
  color,
}: CrateProps & { color: string }) => {
  const gltf = useGLTF("/crate.gltf");

  const scene = useMemo(() => {
    const root = enableShadows(gltf.scene.clone(true));

    return setMaterialColor(root, color);
  }, [gltf, color]);

  useEffect(
    () => () => {
      disposeMaterial(scene);
    },

    [scene],
  );

  return <primitive object={scene} position={position} scale={scale} />;
};

export const TintedCrate = (props: CrateProps & { color: string }) => (
  <Suspense fallback={<LoadingBox {...props} />}>
    <TintedCratePrimitive {...props} />
  </Suspense>
);

export const Crate = (props: CrateProps) => (
  <ErrorBoundary fallback={<ErrorBox {...props} />}>
    <Suspense fallback={<LoadingBox {...props} />}>
      <CratePrimitive {...props} />
    </Suspense>
  </ErrorBoundary>
);
