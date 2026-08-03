// import { Canvas, useFrame } from "@react-three/fiber";
// import { useMemo, useRef, useState } from "react";
// import { Mesh, Vector3 } from "three";
// import { makePatchwork } from "./MeshBuilder";
// import { SkyAndLight } from "./scene/SkyAndLight";

// const Box = ({ position }: { position: [number, number, number] }) => {
//   const boxRef = useRef<Mesh>(null);
//   const [active, setActive] = useState(false);
//   const [clicked, setClicked] = useState(false);

//   useFrame((_state, delta) => {
//     if (!boxRef.current) return;

//     boxRef.current.rotation.x += delta * 0.5;
//     boxRef.current.rotation.y += delta * 0.6;
//   });

//   return (
//     <mesh
//       ref={boxRef}
//       castShadow
//       receiveShadow
//       position={position}
//       onPointerOver={() => setActive(true)}
//       onPointerOut={() => setActive(false)}
//       onClick={() => setClicked((prev) => !prev)}
//     >
//       <boxGeometry args={[4, 4, 4]} />
//       <meshStandardMaterial
//         color={clicked ? "#fff" : active ? "#e8a33d" : "#09eef6"}
//       />
//     </mesh>
//   );
// };

// const Ground = () => {
//   const geometry = useMemo(() => makePatchwork(1000), []);

//   return (
//     <mesh geometry={geometry} receiveShadow>
//       <meshStandardMaterial vertexColors />
//     </mesh>
//   );
// };

// export const App = () => {
//   return (
//     <Canvas
//       shadows
//       camera={{ position: [8, 12, 30], fov: 55 }}
//       onCreated={({ camera }) => camera.lookAt(8, 1, 8)}
//     >
//       <SkyAndLight center={8} />

//       <Ground />

//       <group position={new Vector3(0, 0, -1)}>
//         <Box position={[10, 5, 16]} />
//         <Box position={[0, 5, 16]} />
//       </group>
//     </Canvas>
//   );
// };
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
  uniform float uTime;

  void main() {
    vUv = uv;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    
    vec3 p = position;
    p.x += sin(uTime + position.y * 2.0) * 0.1 * position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  in vec2 vUv;
  in vec3 vPos;

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
    material.uniforms.uTime!.value = state.clock.elapsedTime * 3;
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
