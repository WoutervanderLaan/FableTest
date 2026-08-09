import {
  NearestFilter,
  DoubleSide,
  RepeatWrapping,
  MeshStandardMaterial,
  Vector2,
} from "three";
import { useTexture, useTextures } from "../loaders/textures";
import { useMemo } from "react";

export const CheckerPanel = ({
  position = [0, 0, 0],
}: {
  position?: [number, number, number];
}) => {
  const textureMap = useTexture("/uv_checker.png", {
    srgb: true,
    magFilter: NearestFilter,
  });

  return (
    <mesh position={position} receiveShadow castShadow>
      <boxGeometry args={[3, 6, 3]} />
      <meshStandardMaterial map={textureMap} side={DoubleSide} />
    </mesh>
  );
};

export const TiledGround = () => {
  const textureMap = useTexture("/crate_color.png", {
    srgb: true,
    repeat: [3, 3],
    wrap: RepeatWrapping,
    anisotropy: 8,
    magFilter: NearestFilter,
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[8, 0, 8]} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <meshStandardMaterial map={textureMap} />
    </mesh>
  );
};

export const PBRCrate = ({
  position = [0, 0, 0],
}: {
  position?: [number, number, number];
}) => {
  const { color, rough, normal } = useTextures({
    color: ["/crate_color.png", { srgb: true }],
    rough: ["/crate_rough.png", { srgb: false }],
    normal: ["/crate_normal.png", { srgb: false }],
  });

  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        map: color,
        roughnessMap: rough,
        normalMap: normal,
        normalScale: new Vector2(1, 6),
      }),
    [rough, normal, color],
  );

  return (
    <mesh position={position} material={material} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
};
