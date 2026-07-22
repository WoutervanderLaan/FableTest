/**
 * Module 10 — the sky dome gets a real shader. Compare this to the Module 04
 * version: the lights, fog, sphere, size, and placement are all UNCHANGED. The
 * only difference is `skyMat` — a ShaderMaterial instead of MeshBasicMaterial.
 * That's the payoff of building the dome early: swapping the look is a one-line
 * material change.
 *
 * This is `SKY_VERT` / `SKY_FRAG` from the real Ruderal, essentially verbatim.
 */
import { useMemo } from "react";
import * as THREE from "three";

// The vertex shader passes the (normalized) direction from the sphere center to
// this vertex. Because the sphere geometry is centered on its own origin, that
// direction is independent of where we place the dome in the world.
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The fragment shader colors each pixel from that direction: a vertical
// gradient (horizon → zenith) plus a warm glow around the sun's direction.
const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y, 0.0, 1.0);
    vec3 horizon = vec3(0.847, 0.816, 0.753); // #d8d0c0 bleached paper
    vec3 zenith  = vec3(0.612, 0.671, 0.686); // #9cabaf washed slate
    // pow(h, 0.65) biases the blend so more of the sky reads as the lighter
    // horizon color — a subtle but important atmospheric cue.
    vec3 col = mix(horizon, zenith, pow(h, 0.65));

    // A low, warm sun glow in the south-west. dot() peaks toward the sun; the
    // high power (6.0) keeps the glow tight instead of washing the whole sky.
    vec3 sunDir = normalize(vec3(-0.55, 0.28, 0.55));
    float g = pow(max(dot(vDir, sunDir), 0.0), 6.0);
    col += vec3(0.35, 0.22, 0.08) * g;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function SkyAndLight({ center = 8 }: { center?: number }) {
  const skyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false, // the sky never occludes anything
        fog: false, // and fog never touches it
      }),
    [],
  );

  return (
    <>
      <mesh material={skyMat} position={[center, 0, center]} frustumCulled={false}>
        <sphereGeometry args={[400, 24, 12]} />
      </mesh>

      <fog attach="fog" args={["#cfc8b8", 30, 160]} />
      <hemisphereLight args={["#cdd4cc", "#6b5f4e", 0.85]} />
      <directionalLight
        position={[center - 40, 60, center + 40]}
        target-position={[center, 0, center]}
        color="#ffd9a0"
        intensity={1.9}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={1}
        shadow-camera-far={220}
        shadow-bias={-0.0004}
        shadow-normalBias={0.5}
      />
    </>
  );
}
