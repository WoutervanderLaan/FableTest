/**
 * Module 04C — a small lab for reading UVs and texture settings off the screen.
 *
 * Left to right:
 *   1. <CheckerPanel/>   the UV debug checker — how UV space maps onto a face
 *   2. <TiledGround/>    wrapping + repeat + anisotropy, the workhorse settings
 *   3. <PbrCrate/>       a full PBR material assembled by hand from three maps
 */
import { useMemo } from "react";
import * as THREE from "three";
import { useTexture, useTextures } from "../loaders/textures";

/**
 * UV space is a unit square: (0,0) is one corner of the image, (1,1) the
 * opposite. Every vertex carries a `uv` attribute saying "sample the texture
 * HERE for me", and the GPU interpolates across the triangle.
 *
 * The checker's single amber square marks (u,v) = (0,0), so you can read
 * orientation and mirroring straight off the surface.
 */
export function CheckerPanel({ position = [0, 0, 0] as [number, number, number] }) {
  const map = useTexture("/uv_checker.png", {
    srgb: true,
    magFilter: THREE.NearestFilter, // keep the squares crisp, don't blur them
  });

  return (
    <mesh position={position} receiveShadow>
      <planeGeometry args={[6, 6]} />
      <meshStandardMaterial map={map} side={THREE.DoubleSide} />
    </mesh>
  );
}

/**
 * `repeat` doesn't resize the image — it SCALES UV COORDINATES. Setting
 * repeat = (8, 8) multiplies every uv by 8, so uv 1.0 becomes 8.0, and the
 * wrapping mode decides what happens past 1.0:
 *
 *   RepeatWrapping         → fract(uv), the image tiles          (default here)
 *   ClampToEdgeWrapping    → clamp(uv, 0, 1), edge pixels smear
 *   MirroredRepeatWrapping → tiles, flipping every other copy (hides seams)
 *
 * `anisotropy` is the single best perf-to-beauty trade in texturing: it fixes
 * the blurry mush you get on surfaces viewed at a grazing angle (like a floor
 * receding to the horizon) for almost nothing.
 */
export function TiledGround() {
  const map = useTexture("/crate_color.png", {
    srgb: true,
    repeat: [8, 8],
    wrap: THREE.RepeatWrapping,
    anisotropy: 8,
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[8, 0.01, 8]} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <meshStandardMaterial map={map} />
    </mesh>
  );
}

/**
 * The three-map PBR stack, wired by hand.
 *
 * `map` is a picture (sRGB). `roughnessMap` and `normalMap` are data (linear).
 * Note also that roughness/metalness maps are read from specific CHANNELS —
 * three follows the glTF convention: roughness in green, metalness in blue —
 * which is why one grayscale image can serve as both.
 */
export function PbrCrate({ position = [0, 0, 0] as [number, number, number] }) {
  const { color, rough, normal } = useTextures({
    color: ["/crate_color.png", { srgb: true }],
    rough: ["/crate_rough.png", { srgb: false }],
    normal: ["/crate_normal.png", { srgb: false }],
  });

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: color,
        roughnessMap: rough,
        normalMap: normal,
        // how strongly the normal map perturbs the surface; (1,1) = as authored
        normalScale: new THREE.Vector2(1, 1),
        metalness: 0,
        roughness: 1, // multiplied by roughnessMap's green channel
      }),
    [color, rough, normal],
  );

  return (
    <mesh position={position} material={material} castShadow receiveShadow>
      <boxGeometry args={[3, 3, 3]} />
    </mesh>
  );
}
