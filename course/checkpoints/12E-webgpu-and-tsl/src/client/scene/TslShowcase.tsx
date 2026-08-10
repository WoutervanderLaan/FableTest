/**
 * Module 12E — three things TSL does that raw GLSL strings can't do as neatly.
 *
 *   1. <NoiseBlob/>    a reusable, IMPORTABLE noise function — Fn() gives you
 *                      real function composition instead of string concat.
 *   2. <WavyGrid/>     vertex displacement via positionNode, plus per-instance
 *                      variation, with the SAME node reused for colour.
 *   3. <PatchedStandard/> a physically-lit MeshStandardNodeMaterial whose
 *                      colour is a node — the TSL answer to onBeforeCompile.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three/webgpu";
import {
  Fn,
  float,
  floor,
  fract,
  mix,
  normalLocal,
  positionLocal,
  sin,
  uniform,
  vec2,
  vec3,
} from "three/tsl";

/**
 * The hash → value-noise tower from module 09C, as a TSL function.
 *
 * `Fn` takes a JS closure and turns it into a shader function node. Because
 * it's just a value, you can export it, unit-test the graph it builds, and
 * import it into five materials — none of which is pleasant with template
 * strings.
 */
export const hash21 = Fn(([p]: [ReturnType<typeof vec2>]) =>
  fract(sin(p.dot(vec2(12.9898, 78.233))).mul(43758.5453)),
);

export const valueNoise = Fn(([p]: [ReturnType<typeof vec2>]) => {
  const i = floor(p);
  const f = fract(p);
  const a = hash21(i);
  const b = hash21(i.add(vec2(1, 0)));
  const c = hash21(i.add(vec2(0, 1)));
  const d = hash21(i.add(vec2(1, 1)));
  const u = f.mul(f).mul(float(3).sub(f.mul(2))); // smoothstep curve
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

/** A sphere coloured by noise sampled in object space. */
export function NoiseBlob({ position = [0, 0, 0] as [number, number, number] }) {
  const material = useMemo(() => {
    const n = valueNoise(positionLocal.xz.mul(2.5));
    const m = new THREE.MeshBasicNodeMaterial();
    m.colorNode = mix(vec3(0.09, 0.22, 0.2), vec3(0.24, 0.56, 0.49), n);
    return m;
  }, []);

  return (
    <mesh material={material} position={position}>
      <sphereGeometry args={[1.1, 64, 48]} />
    </mesh>
  );
}

/**
 * Vertex displacement. `positionNode` replaces the vertex position, exactly
 * as module 11's `onBeforeCompile` patch of <begin_vertex> did — except here
 * it's an expression you can also reuse for colour, which is the awkward part
 * in GLSL (you'd need a varying).
 */
export function WavyGrid({ position = [0, 0, 0] as [number, number, number] }) {
  const uTime = useMemo(() => uniform(0), []);

  const material = useMemo(() => {
    const wave = sin(positionLocal.x.mul(3).add(uTime.mul(2)))
      .mul(sin(positionLocal.y.mul(3).sub(uTime.mul(1.3))))
      .mul(0.25);

    const m = new THREE.MeshBasicNodeMaterial();
    // displace along the surface normal
    m.positionNode = positionLocal.add(normalLocal.mul(wave));
    // ...and reuse the very same node to colour the peaks
    m.colorNode = mix(vec3(0.22, 0.2, 0.17), vec3(0.91, 0.64, 0.24), wave.mul(2).add(0.5));
    m.side = THREE.DoubleSide;
    return m;
  }, [uTime]);

  useFrame((state) => {
    uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh material={material} position={position} rotation={[-Math.PI / 2.4, 0, 0]}>
      <planeGeometry args={[3.2, 3.2, 96, 96]} />
    </mesh>
  );
}

/**
 * A real lit material with a node-driven colour.
 *
 * MeshStandardNodeMaterial is the node version of MeshStandardMaterial: it
 * keeps all of three's PBR lighting and lets you replace individual channels
 * with nodes. This is the direct successor to module 11's onBeforeCompile —
 * same goal, no string surgery, no fragile `#include` replacement.
 */
export function PatchedStandard({ position = [0, 0, 0] as [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    // hash each unit cell of object space — module 11's per-voxel jitter idea
    const cell = floor(positionLocal.mul(3));
    const jitter = hash21(cell.xz.add(cell.y));

    const m = new THREE.MeshStandardNodeMaterial();
    m.colorNode = mix(vec3(0.55, 0.45, 0.33), vec3(0.91, 0.64, 0.24), jitter);
    m.roughness = 0.65;
    m.metalness = 0.0;
    return m;
  }, []);

  useFrame((_state, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.4;
  });

  return (
    <mesh ref={ref} material={material} position={position} castShadow receiveShadow>
      <torusKnotGeometry args={[0.8, 0.28, 160, 32]} />
    </mesh>
  );
}
