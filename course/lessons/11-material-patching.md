# 11 · Patching materials with `onBeforeCompile`

> **Goal:** keep Three.js's built-in lighting/shadows/fog and inject just a
> little custom GLSL into it. Two payoffs: a per-voxel surface jitter that kills
> the "flat Lego" look, and instanced grass that sways in the wind.

**You'll build:** `src/client/scene/materials.ts` and `src/client/scene/Vegetation.tsx`,
and wire both into `App.tsx`.

---

## Concepts

A raw `ShaderMaterial` (Modules 09–10) means writing *everything* yourself — lighting,
shadows, fog. Usually overkill. When you want Three.js's standard material **plus one
tweak**, use **`onBeforeCompile`**: a hook that hands you the built-in shader's source right
before compilation, so you splice your code in by string-replacing its well-known
`#include <chunk>` markers.

You need to know only a couple of the chunk markers:

- `#include <common>` — top of the shader; a good place to declare varyings/uniforms.
- `#include <begin_vertex>` — where `transformed` (the working vertex position) is set up;
  perfect for **displacement** (grass sway).
- `#include <color_fragment>` — where `diffuseColor` (the base surface color) is set;
  perfect for **recoloring** (voxel jitter).

You replace `"#include <x>"` with `"#include <x>\n<your code>"` — keeping the include so all
the normal machinery still runs, and adding yours after it.

**Two techniques this module:**

**(a) Per-voxel jitter.** Big flat faces read as one dead color. We hash each block's
**world-space cell** and nudge brightness ±10%. Keying on the cell (not the vertex, not the
face) makes the jitter stable per block and independent of how faces were merged — the exact
trick the real `materials.ts` uses so it survives greedy meshing.

**(b) Instancing + vertex sway.** Thousands of grass tufts as **one draw call** via
`InstancedMesh` (one geometry + material, a per-instance transform and color). Then a vertex
displacement patched in with `onBeforeCompile`, driven by a `uTime` uniform, with each
instance on its own phase via `gl_InstanceID`, bending more toward the tip.

---

## Build it

### 1. `src/client/scene/materials.ts`

`makeVoxelMaterial()` returns a `MeshLambertMaterial({ vertexColors: true })` with an
`onBeforeCompile` that (1) passes world position + normal as varyings from the vertex stage,
and (2) after `<color_fragment>`, hashes the cell and multiplies `diffuseColor.rgb`. Type it
from the checkpoint; the hash line is the same `fract(sin(dot(...)))` you saw in Module 05,
now in GLSL.

### 2. `src/client/scene/Vegetation.tsx`

Builds a crossed-quad geometry (two quads in an ✕, normals pointing up so grass shades like
the ground), an `InstancedMesh`, and scatters instances on grass-topped cells (hashing for
placement, rotation, scale, and a moss/chartreuse/teal color). The `onBeforeCompile` adds:

```glsl
float phase = float(gl_InstanceID) * 1.7;   // each tuft on its own beat
float bend  = position.y / 0.7;             // tips move, roots stay planted
transformed.x += sin(uTime * 1.4 + phase) * 0.06 * bend;
transformed.z += cos(uTime * 1.1 + phase * 1.3) * 0.05 * bend;
```

A `useFrame` feeds `uTime`. Grab the whole file from the checkpoint — the scatter loop is
worth reading, but the shader patch is the star.

### 3. `App.tsx`

Two edits: build `const voxelMat = useMemo(() => makeVoxelMaterial(), [])` and use it on the
world mesh (`<mesh geometry={geo} material={voxelMat} ... />` instead of the inline
`<meshStandardMaterial>`), and add `<Vegetation world={world} />` to the scene.

> **Did the 08D deep-dive?** Your world lives in `WorldManager` with its own
> `MeshLambertMaterial`. Same idea: build that material with `makeVoxelMaterial()` instead,
> and the jitter applies to every chunk.

---

## Run & observe

```bash
pnpm dev
```

Two changes you'll feel immediately:

- **The terrain stops looking flat.** Large stone and soil faces now have a faint, stable
  speckle — like real weathered material instead of painted plastic. Toggle it off (comment
  the `diffuseColor.rgb *= ...` line) to see how much it was doing.
- **Grass sways.** Tufts scatter across the grassy tops and ripple in a gentle wind, each on
  its own rhythm. Stand still and watch the field breathe — that's `uTime` + `gl_InstanceID`.
  And it's *one* draw call for the whole field.

---

## How real Ruderal does it

You just rebuilt two real files nearly verbatim:

- `packages/client/src/scene/materials.ts` — `makeVoxelMaterial()` is the same
  `onBeforeCompile` jitter, keyed on the floored world cell so it survives the greedy
  mesher's face merging. (That's *why* it hashes the cell instead of using a vertex
  attribute.)
- `packages/client/src/scene/Vegetation.tsx` — the same crossed-quad instanced grass with
  the same `gl_InstanceID` + `uTime` sway. In Ruderal this is the thesis made literal: soft,
  grid-ignoring life growing over the rigid voxel substrate.

Both keep Three.js's lighting and shadows — they're *patches*, not rewrites. That's the
`onBeforeCompile` sweet spot.

---

## Exercises

1. **Windier.** Increase the sway amplitude and lower the frequency for tall-grass-in-a-gale.
   Too much and the tufts detach from their roots — find the limit.
2. **Gusts.** Add a slow, world-position-based term so a wind *front* rolls across the field
   (`sin(worldX*0.1 - uTime*0.5)`), on top of the per-tuft jitter.
3. **Jitter knob.** Widen the voxel jitter to `±25%` — grittier — or tint it (hash into hue,
   not just brightness).
4. **Sway the leaves.** Give tree `Block.Leaves` faces a gentle version of the sway. (Harder:
   the leaves are in the world mesh, not instances — you'd patch `makeVoxelMaterial` and
   only move faces whose color is leaf-green.)

---

## Checkpoint

```bash
pnpm checkpoint 11
pnpm dev
```

Files: `src/client/scene/materials.ts`, `src/client/scene/Vegetation.tsx`, `src/client/App.tsx`.

**Next:** [`12-postprocessing.md`](./12-postprocessing.md) — grade the whole image with
bloom, vignette, and grain. Or push the vegetation much further first:
[`11B-infinite-grass.md`](./11B-infinite-grass.md) turns this module's grass patch into an
endless field, and [`11C-bushes.md`](./11C-bushes.md) grows bushes out of leaf cards.
