/**
 * Module 04B — a glTF model placed in the scene.
 *
 * The key move is `gltf.scene.clone(true)`: the cache hands every caller the
 * SAME Object3D, and an Object3D can only live at one place in one scene
 * graph. Render `gltf.scene` directly from two components and the second one
 * steals it from the first — the classic "only one of my models shows up" bug.
 * Clone per instance; the clones share geometry and materials, so it's cheap.
 */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { disposeMaterials, enableShadows, useGLTF } from "../loaders/gltf";

export function Crate({
  url = "/crate.gltf",
  position = [0, 0, 0],
  scale = 1,
}: {
  url?: string;
  position?: [number, number, number];
  scale?: number;
}) {
  const gltf = useGLTF(url);

  const scene = useMemo<THREE.Object3D>(
    () => enableShadows(gltf.scene.clone(true)),
    [gltf],
  );

  // No cleanup effect here on purpose: this clone owns nothing. Its geometry
  // and materials belong to the cached gltf.scene, and the node tree itself is
  // plain garbage-collectable objects. See <TintedCrate/> for the case where
  // cleanup IS required.
  return <primitive object={scene} position={position} scale={scale} />;
}

/** Same model, but each instance owns its materials so it can be tinted. */
export function TintedCrate({
  url = "/crate.gltf",
  position = [0, 0, 0],
  scale = 1,
  color,
}: {
  url?: string;
  position?: [number, number, number];
  scale?: number;
  color: string;
}) {
  const gltf = useGLTF(url);

  const scene = useMemo<THREE.Object3D>(() => {
    const root = enableShadows(gltf.scene.clone(true));
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      mat.color.set(color);
      mesh.material = mat;
    });
    return root;
  }, [gltf, color]);

  // now the materials ARE ours, so cleaning them up is both safe and required
  useEffect(() => () => disposeMaterials(scene), [scene]);

  return <primitive object={scene} position={position} scale={scale} />;
}
