/**
 * Module 12E — the same R3F you already know, on a WebGPU renderer.
 *
 * The ONLY structural change is the `gl` prop: instead of letting R3F build a
 * WebGLRenderer, we hand it a factory that builds a WebGPURenderer and awaits
 * `init()`. R3F 9 supports an async factory for exactly this.
 *
 * WebGPURenderer is not "the WebGPU renderer" so much as "the node-material
 * renderer": if WebGPU isn't available it transparently falls back to a WebGL2
 * backend and your TSL still runs, compiled to GLSL instead of WGSL. That's
 * why this checkpoint is safe to run in any browser.
 *
 * Everything in this file imports from `three/webgpu`, never from `three`.
 * They are separate builds, and mixing classes from both in one scene is the
 * main way people break this setup.
 */
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import * as THREE from "three/webgpu";
import { TslSky } from "./scene/TslSky";
import { NoiseBlob, PatchedStandard, WavyGrid } from "./scene/TslShowcase";

/**
 * A plain lit floor, so the objects sit somewhere and the sky has a horizon.
 *
 * Note the material is built imperatively and passed via the `material` prop,
 * not written as a `<meshStandardNodeMaterial>` JSX tag. R3F only knows the
 * element names it was given; the node materials live in `three/webgpu`, so a
 * JSX tag for them would need `extend({ MeshStandardNodeMaterial })` first.
 * Constructing them in a useMemo sidesteps that entirely — and keeps this
 * checkpoint free of any mixing between the two three builds.
 */
function Ground() {
  const material = useMemo(
    () => new THREE.MeshStandardNodeMaterial({ color: "#8c7a5c", roughness: 0.95 }),
    [],
  );
  return (
    <mesh material={material} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]} receiveShadow>
      <planeGeometry args={[60, 60]} />
    </mesh>
  );
}

export function App() {
  const [backend, setBackend] = useState("initialising…");

  return (
    <>
      <Canvas
        shadows
        camera={{ position: [0, 1.6, 7], fov: 55 }}
        gl={async (props) => {
          const renderer = new THREE.WebGPURenderer({
            canvas: props.canvas as HTMLCanvasElement,
            antialias: true,
          });
          await renderer.init(); // picks WebGPU, or falls back to WebGL2
          setBackend(renderer.backend.isWebGPUBackend ? "WebGPU" : "WebGL2 (fallback)");
          return renderer;
        }}
      >
        <TslSky />
        <hemisphereLight args={["#cdd4cc", "#6b5f4e", 1.1]} />
        <directionalLight position={[4, 6, 3]} intensity={2.2} castShadow />

        <NoiseBlob position={[-3.1, 0.4, 0]} />
        <PatchedStandard position={[0, 0.4, 0]} />
        <WavyGrid position={[3.2, 0.4, 0]} />

        <Ground />
      </Canvas>

      <div
        style={{
          position: "fixed",
          left: 12,
          bottom: 12,
          font: "13px ui-monospace, monospace",
          color: "#f4efe3",
          background: "rgba(0,0,0,0.45)",
          padding: "6px 10px",
          borderRadius: 6,
          pointerEvents: "none",
        }}
      >
        backend: {backend}
      </div>
    </>
  );
}
