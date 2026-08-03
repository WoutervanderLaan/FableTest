# 04 · Light, shadow, fog & sky

> **Goal:** turn the flat test scene into Ruderal's "golden hour" look — a warm sun that
> casts real shadows, ambient fill, distance fog, and a sky dome. You'll build the exact
> structure of the real `SkyAndLight.tsx`, with one plain material standing in for the
> shader you'll write in Module 10.

**You'll build:** `src/client/scene/SkyAndLight.tsx`, and update `App.tsx`.

---

## Concepts

**Lighting is a budget, not a switch.** A believable outdoor look here is just three
lights working together:

1. **A directional light = the sun.** Parallel rays, one direction, one warm color. It's
   the *only* thing that casts shadows (shadows are expensive; you want one caster).
2. **A hemisphere light = ambient fill.** A cheap gradient — sky color from above, ground
   color from below — so shadowed areas aren't pure black. No cost, no shadows.
3. **Fog** — not a light, but it sells depth: distant geometry fades to the horizon color.

**Shadows need three opt-ins**, and missing any one silently gives you none:

- `<Canvas shadows>` — enable the shadow render pass.
- `<directionalLight castShadow ...>` — a light that emits shadows, **plus** a
  `shadow-camera-*` box that frames the area shadows are computed in. Too large → blocky
  shadows; too small → shadows clip at the edges.
- Per mesh: `castShadow` (blocks light) and/or `receiveShadow` (catches shadows).

`shadow-bias` / `shadow-normalBias` nudge away "shadow acne" (that dotty self-shadowing).
The values in the checkpoint are good defaults — the same ones the real Ruderal ships.

**The sky dome** is a trick: a big sphere rendered **inside-out** (`side: BackSide`) around
the whole world, with a material that ignores fog. Right now it's a flat color. In Module
10 we replace *only that material* with a shader for a gradient sky + sun glow — the dome,
the size, the placement all stay. Building it now means that swap is a one-file change.

---

## Build it

### 1. `src/client/scene/SkyAndLight.tsx`

Keep your `meshbuilder.ts` from Module 03. Add this new file:

```tsx
import { useMemo } from "react";
import * as THREE from "three";

export function SkyAndLight({ center = 8 }: { center?: number }) {
  const skyMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: "#b9c2c4",
      side: THREE.BackSide,   // we're inside the sphere; render inner faces
      fog: false,             // the dome keeps its color; fog can't swallow it
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
```

Notice the dashed props: `shadow-mapSize` → `light.shadow.mapSize`, `shadow-camera-left` →
`light.shadow.camera.left`, and `target-position` aims the sun at the world's center. This
is R3F reaching into nested Three.js properties by name.

### 2. Update `App.tsx` — turn shadows on and opt meshes in

```tsx
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { makeCube, makePatchwork } from "./meshbuilder";
import { SkyAndLight } from "./scene/SkyAndLight";

function Ground() {
  const geo = useMemo(() => makePatchwork(16), []);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors />
    </mesh>
  );
}

function Block({ pos, color }: { pos: [number, number, number]; color: string }) {
  const geo = useMemo(() => makeCube(new THREE.Color(color)), [color]);
  return (
    <mesh geometry={geo} position={pos} scale={2} castShadow receiveShadow>
      <meshStandardMaterial vertexColors />
    </mesh>
  );
}

export function App() {
  return (
    <Canvas shadows camera={{ position: [8, 12, 30], fov: 55 }}
            onCreated={({ camera }) => camera.lookAt(8, 1, 8)}>
      <SkyAndLight center={8} />
      <Ground />
      <Block pos={[5, 1, 6]} color="#8c7a5c" />
      <Block pos={[9, 1, 9]} color="#6fa24b" />
      <Block pos={[11, 1, 5]} color="#3e8e7e" />
      <Block pos={[7, 3, 7]} color="#e8a33d" />
    </Canvas>
  );
}
```

The `<Canvas shadows>`, the light's `castShadow`, and the meshes' `castShadow` /
`receiveShadow` are the three opt-ins from the concept above — all present.

---

## Run & observe

```bash
pnpm dev
```

Warm, directional light now rakes across the scene. Each block drops a soft shadow onto the
ground and its neighbors; the elevated amber block shadows the ones below it. The far edges
of the patchwork fade slightly into the fog color. The background is the sky dome, not a
flat clear color.

Try it:
- Remove `shadows` from `<Canvas>` → every shadow disappears (opt-in #1 gone).
- Remove `castShadow` from a `Block` → that block stops dropping a shadow but still catches
  others' (it's now invisible to the shadow pass as a caster).
- Set the light `intensity` to `0` → the hemisphere fill is all that's left: flat, shadowless,
  ambient. That's your fill-vs-key budget, made visible.

---

## How real Ruderal does it

You just rebuilt `packages/client/src/scene/SkyAndLight.tsx` almost verbatim — same
hemisphere + shadow-casting directional rig, same `<fog>`, same inside-out sphere. Compare
them side by side; the **only** meaningful difference is that Ruderal's sky sphere uses a
`THREE.ShaderMaterial` (its `SKY_VERT`/`SKY_FRAG`) instead of our `MeshBasicMaterial`. The
shadow-camera and bias numbers you used are lifted straight from the real file. Ruderal's
sun sits at golden-hour on purpose — it's the project's whole mood.

That one-material gap is exactly what Part 3 closes.

---

## Exercises

1. **Move the sun.** Animate the light's `position` in a `useFrame` to sweep the shadows
   across the scene like a time-of-day. (Wrap the light in a component so you can ref it.)
2. **Shadow resolution.** Drop `shadow-mapSize` to `[256, 256]` and see the shadows go
   chunky; bump to `[4096, 4096]` and watch them sharpen (and cost more).
3. **Frame the shadow box.** Shrink `shadow-camera-right`/etc. to `10`. Shadows get crisper
   near the middle but **clip** at the edges — you're seeing the shadow camera's frustum.
4. **Fog feel.** Pull `<fog>`'s `far` down to `40`. The world closes in — this is the exact
   knob Ruderal uses to make a small baked zone feel like it continues past the horizon.

---

## Checkpoint

```bash
pnpm checkpoint 04
pnpm dev
```

Files: `src/client/scene/SkyAndLight.tsx`, `src/client/App.tsx`, `src/client/meshbuilder.ts`,
`src/client/main.tsx`.

---

## Part 1 complete 🎉

You can now stand up a lit, shadowed, atmospheric Three.js scene in R3F and build any
geometry you want from raw buffers. That's the entire foundation. **Part 2** puts it to
work: a real voxel world you can walk around inside.

**Next:** [`05-voxel-data-model.md`](./05-voxel-data-model.md) — or branch into
[`04B-gltf-and-assets.md`](./04B-gltf-and-assets.md) *(optional)* to fill a scene with loaded
models, textures and animation instead of generated geometry.
