/**
 * Module 11B — an "infinite" grass field.
 *
 * The field is a fixed square of blades that RE-CENTRES on the camera every
 * frame, snapped to the grid spacing. Blades leaving the back edge reappear at
 * the front, and because every blade's randomness is hashed from its snapped
 * WORLD position (see grassShader.ts), the ones that reappear look like blades
 * that were always there. Nothing is allocated, nothing is sorted, and the
 * field is as infinite as your fog is thick.
 *
 * Cost is constant: `resolution²` blades, one draw call, forever.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useControlRef, useControls } from "../debug/useControls";
import { GRASS_FRAG, GRASS_VERT } from "./grassShader";

/**
 * One blade = one triangle. Three vertices, one draw primitive — you cannot
 * spend less. `position.y` runs 0..1 so the shader can scale each blade's
 * height freely, and `position.x` is ±0.5 so it can scale width.
 */
function makeBladeGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.0, 1, 0]), 3),
  );
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1));
  return geo;
}

export function Grass() {
  const { camera } = useThree();
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Structural knobs — changing these rebuilds geometry, so they must
  // re-render (useControls, not useControlRef).
  const { resolution, size } = useControls("Grass · field", {
    resolution: { type: "number", value: 320, min: 40, max: 520, step: 10 },
    size: { type: "number", value: 34, min: 10, max: 120, step: 1, label: "size (m)" },
  });

  // Everything else feeds a uniform every frame, so it must NOT re-render.
  const look = useControlRef("Grass · look", {
    bladeWidth: { type: "number", value: 0.07, min: 0.01, max: 0.2, step: 0.001 },
    bladeHeight: { type: "number", value: 0.62, min: 0.1, max: 2, step: 0.01 },
    heightVary: { type: "number", value: 0.55, min: 0, max: 1, step: 0.01 },
    jitter: { type: "number", value: 0.85, min: 0, max: 2, step: 0.01 },
    cameraFacing: { type: "number", value: 0.35, min: 0, max: 1, step: 0.01 },
    translucency: { type: "number", value: 0.7, min: 0, max: 3, step: 0.01 },
    baseColor: { type: "color", value: "#3d5c24" },
    tipColor: { type: "color", value: "#a8c65a" },
  });

  const wind = useControlRef("Grass · wind", {
    strength: { type: "number", value: 0.35, min: 0, max: 2, step: 0.01 },
    speed: { type: "number", value: 1.4, min: 0, max: 6, step: 0.01 },
    scale: { type: "number", value: 0.22, min: 0.01, max: 1.5, step: 0.01 },
    dirX: { type: "number", value: 1, min: -1, max: 1, step: 0.01 },
    dirZ: { type: "number", value: 0.35, min: -1, max: 1, step: 0.01 },
  });

  // Rebuild only when the grid changes.
  const geometry = useMemo(() => {
    const blade = makeBladeGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = blade.index;
    geo.attributes.position = blade.attributes.position;

    const count = resolution * resolution;
    const cells = new Float32Array(count * 2);
    const cell = size / resolution;
    const half = size * 0.5;
    let o = 0;
    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        cells[o++] = x * cell - half;
        cells[o++] = z * cell - half;
      }
    }
    geo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cells, 2));
    geo.instanceCount = count;

    // The field is re-centred every frame, so a static bounding volume is
    // meaningless — cull manually via uRadius in the shader instead.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
    return geo;
  }, [resolution, size]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uCenter: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uBladeWidth: { value: 0.055 },
      uBladeHeight: { value: 0.55 },
      uHeightVary: { value: 0.55 },
      uJitter: { value: 0.85 },
      uRadius: { value: 23 },
      uWindDir: { value: new THREE.Vector2(1, 0.35) },
      uWindStrength: { value: 0.35 },
      uWindSpeed: { value: 1.4 },
      uWindScale: { value: 0.22 },
      uCameraFacing: { value: 0.35 },
      uCameraPos: { value: new THREE.Vector3() },
      uBaseColor: { value: new THREE.Color("#2f4a22") },
      uTipColor: { value: new THREE.Color("#8fae4b") },
      uSunDir: { value: new THREE.Vector3(0.5, 0.55, 0.4).normalize() },
      uSunColor: { value: new THREE.Color("#ffe6b8") },
      uSkyColor: { value: new THREE.Color("#9fb6c4") },
      uFogColor: { value: new THREE.Color("#cfc8b8") },
      uTranslucency: { value: 0.7 },
    }),
    [],
  );

  useFrame((state) => {
    const u = uniforms;
    const cell = size / resolution;

    // THE INFINITE TRICK, on the CPU side: snap the field's centre to whole
    // cells. Snapping (rather than following the camera continuously) is what
    // keeps every blade on a fixed world lattice, so the hashes stay stable
    // and the field doesn't shimmer as you walk.
    u.uCenter.value.set(
      Math.floor(camera.position.x / cell) * cell,
      Math.floor(camera.position.z / cell) * cell,
    );
    u.uCameraPos.value.copy(camera.position);
    u.uTime.value = state.clock.elapsedTime;
    u.uRadius.value = size * 0.5;

    u.uBladeWidth.value = look("bladeWidth");
    u.uBladeHeight.value = look("bladeHeight");
    u.uHeightVary.value = look("heightVary");
    u.uJitter.value = look("jitter") * cell;
    u.uCameraFacing.value = look("cameraFacing");
    u.uTranslucency.value = look("translucency");
    u.uBaseColor.value.set(look("baseColor"));
    u.uTipColor.value.set(look("tipColor"));

    u.uWindStrength.value = wind("strength");
    u.uWindSpeed.value = wind("speed");
    u.uWindScale.value = wind("scale");
    u.uWindDir.value.set(wind("dirX"), wind("dirZ"));
  });

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={GRASS_VERT}
        fragmentShader={GRASS_FRAG}
        uniforms={uniforms}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
