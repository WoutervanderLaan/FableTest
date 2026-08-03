/**
 * Module 12E — module 10's sky shader, rebuilt in TSL.
 *
 * Put them side by side. The GLSL you wrote in module 10:
 *
 *   vec3 dir  = normalize(vPos);
 *   vec3 base = mix(horizon, zenith, pow(max(dir.y, 0.0), 0.65));
 *   float glow = pow(max(dot(dir, sunDir), 0.0), 6.0);
 *   gl_FragColor = vec4(base + glowColor * glow, 1.0);
 *
 * ...and the TSL below. Same operations, same order, same result. The
 * difference is that TSL is TypeScript: `dir.y.max(0)` is a method call that
 * builds a node in a graph, and three compiles that graph to GLSL *or* WGSL
 * depending on which backend it ends up on.
 *
 * What you gain: no string concatenation, no silent typos (a misspelled
 * uniform is a TS error, not a black screen), composable/importable shader
 * fragments, and one source that runs on both WebGL and WebGPU.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three/webgpu";
import { dot, mix, positionLocal, uniform, vec3 } from "three/tsl";

export function TslSky({ center = 0 }: { center?: number }) {
  // `uniform()` makes a live handle: mutate `.value` from JS and the GPU sees
  // it next frame — exactly like ShaderMaterial's uniforms object, but typed.
  const sunDir = useMemo(
    () => uniform(new THREE.Vector3(-0.55, 0.35, 0.55).normalize()),
    [],
  );

  const material = useMemo(() => {
    const horizon = uniform(new THREE.Color("#e8ddc8"));
    const zenith = uniform(new THREE.Color("#6b7d86"));
    const glowColor = uniform(new THREE.Color("#ffd9a0"));

    // The sphere is centred on its own origin, so the local position IS the
    // direction from the sky's centre — the same trick as module 10.
    const dir = positionLocal.normalize();

    // vertical gradient, biased toward the paler horizon
    const base = mix(horizon, zenith, dir.y.max(0).pow(0.65));

    // tight warm glow around the sun
    const glow = dot(dir, sunDir).max(0).pow(6.0);

    const m = new THREE.MeshBasicNodeMaterial();
    m.colorNode = base.add(glowColor.mul(glow).mul(0.9));
    m.side = THREE.BackSide; // we're inside the dome
    m.depthWrite = false; // the sky never occludes anything
    m.fog = false;
    return m;
  }, []);

  // Drive the sun from JS: a day/night cycle in four lines.
  const t = useRef(0);
  useFrame((_state, delta) => {
    t.current += delta * 0.15;
    sunDir.value.set(Math.cos(t.current) * 0.8, 0.35, Math.sin(t.current) * 0.8).normalize();
  });

  return (
    <mesh material={material} position={[center, 0, center]} frustumCulled={false}>
      <sphereGeometry args={[400, 32, 16]} />
    </mesh>
  );
}
