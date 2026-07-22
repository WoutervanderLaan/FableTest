/**
 * Module 12D (deep-dive) — a custom water shader, replacing the flat translucent
 * plane. Three techniques you'll reuse everywhere:
 *
 *  - VERTEX DISPLACEMENT: raise the surface with summed sine waves over uTime,
 *    so the water actually undulates (not just a scrolling texture).
 *  - FRESNEL: surfaces get more reflective at grazing angles. `pow(1 - dot(view,
 *    normal), k)` is the cheap, ubiquitous approximation — here it brightens the
 *    water toward the horizon and drives the edge glow.
 *  - A CHEAP SPARKLE: a high-power product of sines fakes glinting highlights.
 *
 * A raw ShaderMaterial gets several built-ins for free from Three.js —
 * `cameraPosition`, `modelMatrix`, `viewMatrix`, `projectionMatrix`, and the
 * `position`/`normal` attributes — which is why we can compute world-space
 * fresnel without wiring those uniforms ourselves.
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const vert = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vec3 p = position;
    // The plane is rotated flat, so its local +Z becomes world up: displace z.
    float w = sin(p.x * 0.4 + uTime * 1.2) * 0.15
            + cos(p.y * 0.5 + uTime * 0.9) * 0.12;
    p.z += w;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const frag = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(viewDir, vNormalW), 0.0), 3.0);

    vec3 deep    = vec3(0.10, 0.32, 0.30);
    vec3 shallow = vec3(0.24, 0.56, 0.49);
    vec3 col = mix(deep, shallow, fres);

    // Fake glints: a high power narrows the sine product into sparse highlights.
    float spark = pow(max(sin(vWorld.x * 3.0 + uTime * 2.0)
                        * sin(vWorld.z * 3.0 - uTime * 1.5), 0.0), 20.0);
    col += spark * 0.35;

    gl_FragColor = vec4(col, 0.7 + fres * 0.3);
  }
`;

export function Water({ size, level }: { size: number; level: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  );
  matRef.current = material;

  useFrame((state) => {
    material.uniforms.uTime!.value = state.clock.elapsedTime;
  });

  return (
    <mesh
      material={material}
      position={[size / 2, level + 0.9, size / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[size, size, 48, 48]} />
    </mesh>
  );
}
