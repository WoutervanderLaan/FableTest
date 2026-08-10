/**
 * Module 09 — a shader playground. We step OUT of the voxel world for one module
 * to learn GLSL on a single object, then bring shaders back into the world in
 * Module 10.
 *
 * A ShaderMaterial replaces Three.js's built-in lighting/coloring with two small
 * GPU programs you write yourself:
 *   - the VERTEX shader runs once per vertex and must set gl_Position
 *   - the FRAGMENT shader runs once per pixel and must set gl_FragColor
 * Data flows in three ways: ATTRIBUTES (per-vertex, e.g. position/uv), UNIFORMS
 * (same for every vertex/pixel this draw, e.g. uTime), and VARYINGS (written in
 * the vertex shader, smoothly interpolated, read in the fragment shader).
 */
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

// `position` and `uv` are built-in attributes Three.js provides; the matrices
// are built-in uniforms. We just pass uv + local position along as varyings.
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    // A vertical gradient from amber to teal (our palette), using the uv varying.
    vec3 amber = vec3(0.91, 0.64, 0.24);
    vec3 teal  = vec3(0.24, 0.56, 0.49);
    vec3 col = mix(amber, teal, vUv.y);

    // Animated bands travelling up the surface — a uniform (uTime) driving a
    // varying (vPos.y). This is the essence of every animated shader.
    float bands = 0.5 + 0.5 * sin(vPos.y * 8.0 - uTime * 2.0);
    col *= 0.55 + 0.45 * bands;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function ShaderPlayground() {
  const ref = useRef<THREE.Mesh>(null);
  // Build the material once. `uniforms` is the live channel between JS and GLSL.
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { uTime: { value: 0 } },
      }),
    [],
  );

  useFrame((state) => {
    material.uniforms.uTime!.value = state.clock.elapsedTime;
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.3;
  });

  return (
    <mesh ref={ref} material={material}>
      <torusKnotGeometry args={[1, 0.35, 180, 32]} />
    </mesh>
  );
}

export function App() {
  return (
    <Canvas camera={{ position: [0, 0, 4], fov: 55 }}>
      <color attach="background" args={["#cfc8b8"]} />
      <ShaderPlayground />
    </Canvas>
  );
}
