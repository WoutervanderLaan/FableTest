/**
 * Module 12F — read the numbers that actually matter.
 *
 * `renderer.info` is three's built-in counter set, and it is the first thing
 * to look at when a scene is slow:
 *
 *   render.calls      draw calls this frame — usually THE number
 *   render.triangles  triangles submitted
 *   memory.geometries / memory.textures   live GPU allocations. If these climb
 *                     and never come back down, you have a leak.
 *   programs.length   compiled shaders. Note these are deduplicated by
 *                     CONFIGURATION, not by material instance: 4,000 identical
 *                     MeshLambertMaterials compile ONE program. You get a new
 *                     program when the feature set differs (vertexColors, a
 *                     map, instancing, a different light setup) — which is why
 *                     mode 3 reports one more than modes 1 and 2.
 *
 * We sample on an interval rather than every frame: formatting numbers into
 * React state 60× a second would itself become the bottleneck (and would make
 * the FPS reading measure our own overhead).
 */
import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";

export interface Sample {
  fps: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
}

/** Lives INSIDE <Canvas> so it can reach the renderer; renders nothing. */
export function StatsProbe({ onSample }: { onSample: (s: Sample) => void }) {
  const gl = useThree((state) => state.gl);
  const frames = useRef(0);
  const last = useRef(performance.now());

  useFrame(() => {
    frames.current++;
    const now = performance.now();
    const elapsed = now - last.current;
    if (elapsed < 500) return;

    onSample({
      fps: Math.round((frames.current * 1000) / elapsed),
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0,
    });

    frames.current = 0;
    last.current = now;
  });

  return null;
}

const MODES = ["separate", "shared", "instanced"] as const;
export type Mode = (typeof MODES)[number];

const LABEL: Record<Mode, string> = {
  separate: "1. separate meshes (own geometry + material each)",
  shared: "2. shared geometry + material",
  instanced: "3. one InstancedMesh",
};

export function StatsOverlay({
  sample,
  mode,
  onMode,
}: {
  sample: Sample | null;
  mode: Mode;
  onMode: (m: Mode) => void;
}) {
  // number keys 1/2/3 switch modes without touching the mouse
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      if (i >= 0 && i < MODES.length) onMode(MODES[i]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onMode]);

  const row = (k: string, v: string | number) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 18 }}>
      <span style={{ opacity: 0.65 }}>{k}</span>
      <span>{v}</span>
    </div>
  );

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        left: 12,
        font: "13px ui-monospace, SFMono-Regular, Menlo, monospace",
        color: "#f4efe3",
        background: "rgba(20,18,15,0.82)",
        padding: "12px 14px",
        borderRadius: 8,
        minWidth: 260,
        lineHeight: 1.7,
      }}
    >
      <div style={{ marginBottom: 8, color: "#e8a33d" }}>{LABEL[mode]}</div>
      {sample ? (
        <>
          {row("fps", sample.fps)}
          {row("draw calls", sample.calls)}
          {row("triangles", sample.triangles.toLocaleString())}
          {row("geometries", sample.geometries)}
          {row("textures", sample.textures)}
          {row("programs", sample.programs)}
        </>
      ) : (
        <div style={{ opacity: 0.6 }}>sampling…</div>
      )}
      <div style={{ marginTop: 10, opacity: 0.55, fontSize: 12 }}>press 1 · 2 · 3 to switch</div>
    </div>
  );
}
