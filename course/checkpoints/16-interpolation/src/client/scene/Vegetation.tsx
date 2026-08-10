/**
 * Module 11b — instanced, wind-swayed grass. Two big techniques at once:
 *
 *  - INSTANCING. Thousands of grass tufts are ONE draw call via InstancedMesh:
 *    one geometry, one material, a per-instance transform (and color). Drawing
 *    them as separate meshes would tank the frame rate.
 *
 *  - A VERTEX-SHADER SWAY, patched in with onBeforeCompile (Module 11a) plus a
 *    `uTime` uniform we advance each frame. Each instance sways on its own phase
 *    (from gl_InstanceID), and bends more toward its tip (from local height).
 *
 * This is `packages/client/src/scene/Vegetation.tsx`, adapted to our world — the
 * project's "soft life over the rigid grid" motif, made literal.
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Block } from "../../shared/blocks";
import { getVoxel, surfaceY, type VoxelWorld } from "../../shared/voxel";

const MAX_INSTANCES = 8000;

function hash01(seed: number, x: number, z: number, salt: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(salt, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Two crossed quads, ~0.8 wide × 0.7 tall. Normals point straight up so the
// grass shades like the ground it grows from (instead of going dark edge-on).
function makeCrossQuadGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array([
    -0.4, 0, 0, 0.4, 0, 0, 0.4, 0.7, 0, -0.4, 0.7, 0,
    0, 0, -0.4, 0, 0, 0.4, 0, 0.7, 0.4, 0, 0.7, -0.4,
  ]);
  const normals = new Float32Array([
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
  ]);
  // Both windings baked in so both sides are visible and lit the same.
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7,
    2, 1, 0, 3, 2, 0, 6, 5, 4, 7, 6, 4,
  ]);
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}

export function Vegetation({ world }: { world: VoxelWorld }) {
  const shaderRef = useRef<{ uniforms: { uTime: { value: number } } } | null>(null);

  const mesh = useMemo(() => {
    const geo = makeCrossQuadGeometry();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: false });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          {
            float phase = float(gl_InstanceID) * 1.7;   // each tuft on its own beat
            float bend = position.y / 0.7;               // tips move, roots don't
            transformed.x += sin(uTime * 1.4 + phase) * 0.06 * bend;
            transformed.z += cos(uTime * 1.1 + phase * 1.3) * 0.05 * bend;
          }`,
        );
      shaderRef.current = shader as unknown as { uniforms: { uTime: { value: number } } };
    };

    const m = new THREE.InstancedMesh(geo, mat, MAX_INSTANCES);
    m.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const moss = new THREE.Color("#6fa24b");
    const chart = new THREE.Color("#c7c94f");
    const teal = new THREE.Color("#3e8e7e");
    let count = 0;

    for (let z = 2; z < world.sizeZ - 2 && count < MAX_INSTANCES; z++) {
      for (let x = 2; x < world.sizeX - 2 && count < MAX_INSTANCES; x++) {
        if (hash01(world.seed, x, z, 77) > 0.28) continue; // ~28% of grass cells
        const sy = surfaceY(world, x, z);
        if (getVoxel(world, x, sy, z) !== Block.Grass) continue;
        if (getVoxel(world, x, sy + 1, z) !== Block.Air) continue;

        const jx = hash01(world.seed, x, z, 78) - 0.5;
        const jz = hash01(world.seed, x, z, 79) - 0.5;
        dummy.position.set(x + 0.5 + jx * 0.8, sy + 1, z + 0.5 + jz * 0.8);
        dummy.rotation.y = hash01(world.seed, x, z, 80) * Math.PI;
        const s = 0.6 + hash01(world.seed, x, z, 81) * 0.9;
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        m.setMatrixAt(count, dummy.matrix);

        const mix = hash01(world.seed, x, z, 82);
        color.copy(moss).lerp(mix < 0.5 ? chart : teal, Math.abs(mix - 0.5) * 1.2);
        m.setColorAt(count, color);
        count++;
      }
    }
    m.count = count;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = false;
    m.receiveShadow = true;
    m.frustumCulled = false;
    return m;
  }, [world]);

  useFrame((state) => {
    if (shaderRef.current) shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return <primitive object={mesh} />;
}
