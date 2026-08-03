# 12F · Performance & profiling

> **Goal:** learn to find the bottleneck instead of guessing at it. Draw calls,
> instancing, culling, matrix updates and disposal — measured live with
> `renderer.info` on 4,000 cubes drawn three different ways.

**You'll build:** `src/client/scene/PerfLab.tsx`, `src/client/ui/Stats.tsx`, and an `App.tsx`
that switches modes with the number keys.

---

## Concepts

### The bottleneck is usually the CPU, not the GPU

The instinct when a scene runs badly is "too many triangles". Usually it isn't. Modern GPUs eat
millions of triangles happily. What they don't like is being interrupted.

**A draw call is one instruction: "render this geometry with this material."** Each one carries
CPU-side setup — bind buffers, set uniforms, validate state. A few thousand per frame and your
*CPU* runs out of time before the GPU breaks a sweat. **Draw calls are the number to watch.**

This module makes that concrete. The same 4,000 cubes, three ways:

| Mode | What it does | Draw calls |
|---|---|---|
| 1. separate meshes | own `BoxGeometry` + material each | **3967** |
| 2. shared geometry + material | one geometry, one material, 4,000 meshes | **3967** |
| 3. one `InstancedMesh` | one object holding 4,000 transforms | **1** |

Those are the real numbers this checkpoint reports, and **mode 2 is the important one**.
Sharing geometry and material is a genuine win for memory and shader compiles — and it changes
the draw-call count *not at all*. The renderer still issues one call per object. People often
assume "reuse the geometry" is the optimization; it isn't the one that matters here.

> **Why 3967 and not 4000?** Frustum culling already dropped ~33 cubes that were off-screen.
> You're seeing an optimization work, for free, in the counter.

### Instancing

`InstancedMesh` is one object holding N transform matrices in a buffer. The GPU draws the same
geometry N times in a single call, reading a different matrix each time.

Use it whenever many objects share geometry and material: grass, rubble, crowds, bullets,
trees. The costs are real but small: all instances share one material, and you update transforms
by writing matrices into a buffer rather than setting `.position` on an object.

### The other levers

**Frustum culling** is on by default: three skips objects outside the camera. It works off each
object's bounding sphere, so it's nearly free — but it's computed *per object*, which is why
`InstancedMesh` often sets `frustumCulled = false` (its bounding sphere covers every instance,
so the test can't win, and for a mesher's chunks you want to cull per chunk instead).

**`matrixAutoUpdate = false`** stops three recomputing an object's world matrix every frame.
For static scenery that's pure waste. Set the matrix once, call `updateMatrix()`, done — and
remember that once it's off, *you* must call `updateMatrix()` after any change.

**Disposal.** Geometries, materials and textures hold GPU memory that JavaScript's garbage
collector cannot free. `geometry.dispose()` is the only way. The ownership rule from Module 04B
applies exactly: **dispose what you created, never what you borrowed.**

**`renderer.info`** is your instrument panel:

```
render.calls      draw calls this frame — usually THE number
render.triangles  triangles submitted
memory.geometries / memory.textures   live GPU allocations
programs.length   compiled shaders
```

> **A detail that surprises people:** mode 1 creates 4,000 separate material objects and
> reports **1** program. Shader programs are deduplicated by *configuration*, not by instance.
> You pay for a new compile when the feature set changes — `vertexColors`, a map, instancing,
> a different light setup — not for another object using the same recipe.

---

## Build it

### 1. `src/client/scene/PerfLab.tsx`

Three components over one deterministic `layout(i)` so all modes draw an identical scene.
`SeparateMeshes` (JSX geometry + material per cube), `SharedMeshes` (one of each, with explicit
disposal), and `InstancedCubes` — which also demonstrates `setMatrixAt`/`setColorAt`,
`matrixAutoUpdate = false`, and `StaticDrawUsage`.

### 2. `src/client/ui/Stats.tsx`

`StatsProbe` lives **inside** `<Canvas>` (it needs the renderer via `useThree`) and renders
nothing; `StatsOverlay` is plain DOM outside. Note the probe samples on a **500ms interval**,
not every frame: pushing formatted numbers into React state 60× a second would itself become
the bottleneck, and your FPS reading would be measuring your own instrumentation.

### 3. `App.tsx`

Mode state, the three components, and the overlay. `onSample` is wrapped in `useCallback` so
the probe isn't remounted on every sample.

---

## Run & observe

```bash
pnpm dev
```

Press **1**, **2**, **3** and watch the panel while the picture stays essentially identical.

1. **1 → 2.** Draw calls: unchanged. Geometries: 3967 → 1. You saved a lot of memory and
   *nothing* in per-frame cost. This is the module's central lesson.
2. **2 → 3.** Draw calls: 3967 → **1**. Same cubes, same triangles, one instruction.
3. **Watch `geometries` after switching.** It should fall back to a small number as the old
   objects are released. A count that climbs across mode switches and *plateaus* is what a
   real leak looks like — this counter is how you find one.
4. **Turn off culling.** In `SeparateMeshes` add `frustumCulled={false}` to the mesh and orbit
   until most cubes are off-screen. Draw calls stay at 4,000 instead of dropping.
5. **Break `matrixAutoUpdate`.** In `InstancedCubes`, delete the `updateMatrix()` inside
   `useFrame`. The rotation stops — because you told three to stop doing it for you.

> **On FPS numbers:** read them on your own machine. In a software renderer (or a throttled
> laptop) absolute FPS is meaningless; the *counters* are still exactly right, and the
> comparison between modes is what matters.

---

## How real Ruderal does it

Ruderal is a performance-shaped codebase, and every lever above appears in it:

- **Instancing for vegetation.** `packages/client/src/scene/Vegetation.tsx` puts up to
  **14,000** grass blades in one `InstancedMesh`, with
  `m.instanceMatrix.setUsage(THREE.StaticDrawUsage)` and `m.frustumCulled = false` — both
  exactly as in this module. It even animates all 14,000 for the price of one uniform, by
  swaying them in the vertex shader (Module 11) instead of touching matrices on the CPU.
- **The mesher is the real optimization.** Module 06's "only draw the surface" rule and Module
  08D's greedy merging attack the problem one level up: the cheapest triangle is the one you
  never emit. `packages/shared/src/mesher.ts` merges coplanar faces so a flat 32×32 floor
  becomes one quad instead of 1,024.
- **Chunks give culling something to work with.** One mesh per 32³ chunk (Module 08D) means
  frustum culling can discard most of the world per frame, and an edit re-meshes one chunk
  rather than everything.
- **Work moved off the main thread.** `packages/client/src/worker/mesher.worker.ts` runs in a
  **pool of 2–4 workers**, jobs sorted by distance from the player so nearby chunks appear
  first. Meshing never costs you a frame.
- **`matrixAutoUpdate = false` and careful disposal** on chunk meshes that never move — noted
  in Module 08D as "small perf wins at scale".
- **Lazy-loading a big dependency.** `packages/client/src/scene/Debris.tsx` imports Rapier
  *dynamically*, so players who never see collapse debris never download the wasm. You saw the
  cost of not doing this in Module 07B, where `vite build` warned about the chunk size.

The ordering is the lesson: Ruderal reduces *work* first (mesher), then *draw calls* (chunks +
instancing), then trims per-frame overhead (matrix updates, disposal). Optimizing in the other
order is how people waste weeks.

---

## Exercises

1. **Find the knee.** Change `COUNT` to 500, 2,000, 10,000, 50,000. Where does mode 1 stop
   holding 60fps on *your* machine? Mode 3 will still be fine at 50,000 — that's the point.
2. **Per-chunk culling.** Give `InstancedCubes` `frustumCulled = true` and a manually computed
   `boundingSphere`. Then split the 4,000 cubes into 8 instanced groups and watch culling start
   to help again.
3. **Make a leak, then find it.** Create a new `BoxGeometry` inside `useFrame` and never dispose
   it. Watch `geometries` climb without limit. Now fix it. That's the whole debugging loop.
4. **Profile for real.** Open DevTools → Performance, record 5 seconds in mode 1 and mode 3, and
   compare where the time goes. Mode 1 should show a wall of scripting; mode 3 should be idle.
5. **Instance the debris.** Module 07B already uses one `InstancedMesh` for its Rapier cubes.
   Raise `MAX_DEBRIS` to 5,000 and confirm the draw-call count doesn't move.

---

## Checkpoint

```bash
pnpm checkpoint 12F
pnpm dev
```

Files: `src/client/scene/PerfLab.tsx`, `src/client/ui/Stats.tsx`, `src/client/App.tsx`.

---

## Part 3 complete 🎉

You can now write shaders from the maths up (09B, 09C), patch three's own materials (11), stack
postprocessing (12), run it all on a modern renderer (12E), and — most importantly — *measure*
it instead of guessing.

**Next:** [`13-netcode-and-colyseus.md`](./13-netcode-and-colyseus.md) — Part 4 begins, and the
world gets other people in it. Or, if you're on the single-player path, go back to
[`21-bridge-to-ruderal.md`](./21-bridge-to-ruderal.md) for a guided read of the real codebase.
