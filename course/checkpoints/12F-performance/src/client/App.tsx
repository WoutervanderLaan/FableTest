/**
 * Module 12F — 4,000 cubes, three ways, with the counters on screen.
 *
 * Switch modes with 1 / 2 / 3 and watch "draw calls" while the picture stays
 * the same. That gap between "looks identical" and "costs 4000× more" is the
 * whole module.
 */
import { Canvas } from "@react-three/fiber";
import { useCallback, useState } from "react";
import { InstancedCubes, SeparateMeshes, SharedMeshes } from "./scene/PerfLab";
import { StatsOverlay, StatsProbe, type Mode, type Sample } from "./ui/Stats";

export function App() {
  const [mode, setMode] = useState<Mode>("separate");
  const [sample, setSample] = useState<Sample | null>(null);

  // stable identity so <StatsProbe> isn't remounted on every sample
  const onSample = useCallback((s: Sample) => setSample(s), []);

  return (
    <>
      <Canvas camera={{ position: [0, 6, 34], fov: 55 }}>
        <color attach="background" args={["#1b1915"]} />
        <hemisphereLight args={["#cdd4cc", "#6b5f4e", 1.0]} />
        <directionalLight position={[10, 20, 10]} intensity={2.0} />

        {mode === "separate" && <SeparateMeshes />}
        {mode === "shared" && <SharedMeshes />}
        {mode === "instanced" && <InstancedCubes spin />}

        <StatsProbe onSample={onSample} />
      </Canvas>

      <StatsOverlay sample={sample} mode={mode} onMode={setMode} />
    </>
  );
}
