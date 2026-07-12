/**
 * Lighting per the style brief (plan §4): one warm low sun + hemisphere
 * ambient, warm-gray height fog, gradient sky dome. Golden-hour bias is the
 * default Phase 0 look; wiring time-of-day to the zone's real local time is
 * a Phase 1+ nicety.
 */

import { useMemo } from "react";
import * as THREE from "three";

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, 0.0, 1.0);
  vec3 horizon = vec3(0.847, 0.816, 0.753);   // #d8d0c0 — bleached paper sky
  vec3 zenith  = vec3(0.612, 0.671, 0.686);   // #9cabaf — washed slate blue
  vec3 col = mix(horizon, zenith, pow(h, 0.65));
  // low warm sun glow in the south-west
  vec3 sunDir = normalize(vec3(-0.55, 0.28, 0.55));
  float g = pow(max(dot(vDir, sunDir), 0.0), 6.0);
  col += vec3(0.35, 0.22, 0.08) * g;
  gl_FragColor = vec4(col, 1.0);
}
`;

export function SkyAndLight({ zoneSize }: { zoneSize: number }) {
  const skyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );

  const c = zoneSize / 2;

  return (
    <>
      <mesh material={skyMat} position={[c, 0, c]} frustumCulled={false}>
        <sphereGeometry args={[900, 24, 12]} />
      </mesh>
      <fog attach="fog" args={["#cfc8b8", 70, 520]} />
      <hemisphereLight args={["#cdd4cc", "#6b5f4e", 0.85]} />
      <directionalLight
        position={[c - 180, 120, c + 180]}
        target-position={[c, 0, c]}
        color="#ffd9a0"
        intensity={1.7}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-300}
        shadow-camera-right={300}
        shadow-camera-top={300}
        shadow-camera-bottom={-300}
        shadow-camera-near={10}
        shadow-camera-far={700}
        shadow-bias={-0.0004}
        shadow-normalBias={0.5}
      />
    </>
  );
}
