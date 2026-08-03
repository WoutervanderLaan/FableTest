/**
 * Module 04 — the lighting rig, structured exactly like the real Ruderal's
 * `packages/client/src/scene/SkyAndLight.tsx`. The only difference: our sky
 * dome uses a plain color material. In Module 10 we swap that one material for
 * a GLSL shader and get a real gradient sky + sun glow — nothing else changes.
 *
 * Three ingredients make the "golden hour" look:
 *  - a warm, low directional light = the sun (and the only shadow caster)
 *  - a hemisphere light = cheap sky/ground ambient fill so shadows aren't black
 *  - fog = distance haze that fades the world into the horizon color
 */
import { useMemo } from "react";
import * as THREE from "three";

export function SkyAndLight({ center = 8 }: { center?: number }) {
  // A big inside-out sphere around the world. BackSide = render the INNER
  // faces (we're inside it). fog:false so the dome keeps its own color instead
  // of being swallowed by the distance fog.
  const skyMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#b9c2c4",
        side: THREE.BackSide,
        fog: false,
      }),
    [],
  );

  return (
    <>
      <mesh material={skyMat} position={[center, 0, center]} frustumCulled={false}>
        <sphereGeometry args={[400, 24, 12]} />
      </mesh>

      {/* Distance haze. args = [color, near, far]: fully clear before `near`,
          fully fogged past `far`. */}
      <fog attach="fog" args={["#cfc8b8", 30, 160]} />

      {/* Ambient fill: sky color from above, warm ground bounce from below. */}
      <hemisphereLight args={["#cdd4cc", "#6b5f4e", 0.85]} />

      {/* The sun. Only this light casts shadows. The shadow-camera-* props frame
          an orthographic box that shadows are computed inside — too big and
          shadows get blocky, too small and they clip. */}
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
