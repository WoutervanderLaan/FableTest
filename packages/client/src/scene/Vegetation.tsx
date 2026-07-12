/**
 * Instanced grass: crossed quads scattered on grass-topped columns, with a
 * gentle vertex-shader sway. This is the style thesis made literal — soft,
 * grid-ignoring life growing over the rigid voxel substrate (plan §4).
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Block, getVoxel, hash01, surfaceY, type VoxelZone } from "@ruderal/shared";

const MAX_INSTANCES = 14000;

function makeCrossQuadGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  // two crossed quads, 0.8 wide × 0.75 tall; normals point up so the grass
  // shades like the ground it grows from
  const positions = new Float32Array([
    -0.4, 0, 0, 0.4, 0, 0, 0.4, 0.75, 0, -0.4, 0.75, 0,
    0, 0, -0.4, 0, 0, 0.4, 0, 0.75, 0.4, 0, 0.75, -0.4,
  ]);
  const normals = new Float32Array([
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
  ]);
  // both windings baked in (instead of DoubleSide) so backfaces keep the
  // up-pointing normal and shade like the ground rather than going black
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7,
    2, 1, 0, 3, 2, 0, 6, 5, 4, 7, 6, 4,
  ]);
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}

export function Vegetation({ vz }: { vz: VoxelZone }) {
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
  float swayPhase = float(gl_InstanceID) * 1.7;
  float bend = position.y / 0.75;
  transformed.x += sin(uTime * 1.4 + swayPhase) * 0.06 * bend;
  transformed.z += cos(uTime * 1.1 + swayPhase * 1.3) * 0.05 * bend;
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

    for (let z = 2; z < vz.sizeZ - 2 && count < MAX_INSTANCES; z++) {
      for (let x = 2; x < vz.sizeX - 2 && count < MAX_INSTANCES; x++) {
        const r = hash01(vz.seed, x, z, 77);
        if (r > 0.2) continue;
        const sy = surfaceY(vz, x, z);
        if (getVoxel(vz, x, sy, z) !== Block.Grass) continue;
        if (getVoxel(vz, x, sy + 1, z) !== Block.Air) continue;

        const jx = hash01(vz.seed, x, z, 78) - 0.5;
        const jz = hash01(vz.seed, x, z, 79) - 0.5;
        dummy.position.set(x + 0.5 + jx * 0.8, sy + 1, z + 0.5 + jz * 0.8);
        dummy.rotation.y = hash01(vz.seed, x, z, 80) * Math.PI;
        const s = 0.6 + hash01(vz.seed, x, z, 81) * 0.9;
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        m.setMatrixAt(count, dummy.matrix);

        const mix = hash01(vz.seed, x, z, 82);
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
  }, [vz]);

  useFrame((state) => {
    if (shaderRef.current) shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return <primitive object={mesh} />;
}
