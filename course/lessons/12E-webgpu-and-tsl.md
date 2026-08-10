# 12E · WebGPU & TSL

> **Goal:** run the same R3F scene on a WebGPU renderer, and rewrite Module 10's
> sky shader in **TSL** — Three.js Shading Language — so one source compiles to
> GLSL *or* WGSL depending on the backend. Plus an honest account of what this
> costs you today.

**You'll build:** `src/client/scene/TslSky.tsx`, `src/client/scene/TslShowcase.tsx`, and an
`App.tsx` that swaps the renderer.

---

## Concepts

### What WebGPU actually gives you

WebGL is an OpenGL ES API from 2011 wearing a browser costume. WebGPU is a modern GPU API —
the same generation as Vulkan, Metal and D3D12. The practical differences:

- **Lower CPU overhead.** Draw calls are cheaper, so you can issue more of them before the
  *CPU* becomes your bottleneck. Module 12F explains why that's usually the wall you hit first.
- **Compute shaders.** General-purpose GPU programs that aren't tied to drawing triangles.
  This is the genuinely new capability — particle systems, physics, culling, and (interestingly
  for us) *meshing* can move onto the GPU.
- **Explicit resources.** Pipelines and bind groups are declared up front instead of inferred
  from mutable global state.

### `WebGPURenderer` is really the *node-material* renderer

This is the part that trips people up. `WebGPURenderer` is not "the WebGPU-only renderer" — it
is three's next-generation renderer, and **if WebGPU isn't available it transparently falls back
to a WebGL2 backend.** Your materials still work; they just compile to GLSL instead of WGSL.

That's why this checkpoint is safe to run anywhere, and why the app prints which backend it got:

```ts
renderer.backend.isWebGPUBackend ? "WebGPU" : "WebGL2 (fallback)"
```

### R3F integration is one prop

R3F 9 accepts an **async factory** for `gl` (its `GLProps` type explicitly includes
`(defaultProps) => Promise<Renderer>`), which is exactly what you need, because
`renderer.init()` is asynchronous:

```tsx
<Canvas
  gl={async (props) => {
    const renderer = new THREE.WebGPURenderer({ canvas: props.canvas, antialias: true });
    await renderer.init();
    return renderer;
  }}
>
```

That's the whole integration. Everything else — `<mesh>`, `useFrame`, refs — is unchanged.

> **The one rule that matters: never mix the two builds.** `three` and `three/webgpu` are
> *separate bundles* with separate copies of every class. Import `Mesh` from one and a material
> from the other and you get baffling failures. This checkpoint imports **only** from
> `three/webgpu` and `three/tsl`. It's also why we build materials imperatively and pass them
> via `material={...}` rather than writing `<meshStandardNodeMaterial>` JSX — a JSX tag would
> require `extend({ MeshStandardNodeMaterial })` first.

### TSL: shaders as TypeScript

TSL replaces shader *strings* with a node graph you build in TypeScript. Three compiles that
graph to GLSL or WGSL as needed. Compare Module 10's sky, line for line:

```glsl
/* GLSL */
vec3 dir   = normalize(vPos);
vec3 base  = mix(horizon, zenith, pow(max(dir.y, 0.0), 0.65));
float glow = pow(max(dot(dir, sunDir), 0.0), 6.0);
gl_FragColor = vec4(base + glowColor * glow, 1.0);
```

```ts
/* TSL */
const dir  = positionLocal.normalize();
const base = mix(horizon, zenith, dir.y.max(0).pow(0.65));
const glow = dot(dir, sunDir).max(0).pow(6.0);
material.colorNode = base.add(glowColor.mul(glow));
```

Identical operations in identical order. What changes is everything *around* the maths:

- **Typos are compile errors.** A misspelled uniform in GLSL gives you a black screen and a
  bad afternoon. Here it's a red squiggle.
- **Shader code becomes importable values.** `Fn()` wraps a closure into a shader function node
  you can export, reuse across five materials, and compose. That's genuinely awkward with
  template strings.
- **One source, two languages.** No `#ifdef` maze, no maintaining a WGSL copy.

### Node slots replace `onBeforeCompile`

Module 11 patched three's built-in shaders by string-replacing `#include <color_fragment>`.
It works, and it's fragile — the include names are internal implementation details that move
between releases. Node materials expose the same seams as **properties**:

| You want to change | Module 11 (GLSL) | Node material |
|---|---|---|
| final colour | replace `<color_fragment>` | `material.colorNode` |
| vertex position | replace `<begin_vertex>` | `material.positionNode` |
| roughness / metalness | replace the map chunk | `material.roughnessNode` |
| emissive | replace `<emissivemap_fragment>` | `material.emissiveNode` |

`MeshStandardNodeMaterial` keeps all of three's PBR lighting; you're substituting one channel,
not reimplementing the material.

---

## Build it

### 1. `src/client/scene/TslSky.tsx`

Module 10's sky as a `MeshBasicNodeMaterial` with a `colorNode`. Note `uniform()` — it returns a
live handle whose `.value` you mutate from JS, exactly like `ShaderMaterial.uniforms`, but typed.
The `useFrame` at the bottom rotates the sun, so you get a day/night cycle in four lines.

### 2. `src/client/scene/TslShowcase.tsx`

Three things GLSL strings do less neatly:

- **`hash21` / `valueNoise` as `Fn()` nodes** — Module 09C's tower, now importable values rather
  than a string you paste into every shader that needs it.
- **`<WavyGrid>`** — `positionNode` displaces geometry, and the *same node* is reused for
  `colorNode`. In GLSL that reuse needs a varying; here it's a variable.
- **`<PatchedStandard>`** — a `MeshStandardNodeMaterial` with full PBR lighting whose colour is
  a per-cell hash. This is Module 11's voxel jitter, without the string surgery.

### 3. `App.tsx`

The async `gl` factory, the backend readout, and a ground plane so the sky has a horizon.

---

## Run & observe

```bash
pnpm dev
```

A teal noise sphere, a jittered torus knot lit by real PBR, and a rippling grid under a TSL sky
that slowly changes as the sun moves. Bottom-left tells you which backend you're on.

- **In Chrome/Edge** you should see `backend: WebGPU`.
- **In a browser without WebGPU** (or headless Chromium) you'll see
  `backend: WebGL2 (fallback)` — *and the scene looks identical*. That's the whole promise.

Things to try:

1. **Force the fallback.** Pass `forceWebGL: true` to the `WebGPURenderer` constructor and
   reload. Same image, different compiler. Your TSL didn't change.
2. **Read the generated shader.** `await material.getNodeBuilderState?.()` is fiddly; easier is
   Chrome DevTools → any WebGL/WebGPU capture extension. Seeing your node graph come out as
   real WGSL makes the abstraction concrete.
3. **Break a name.** Rename `positionLocal` to `positionLocaal`. TypeScript catches it *before*
   you reload — the thing GLSL strings can never do for you.
4. **Add a channel.** Give `<PatchedStandard>` a `roughnessNode` driven by the same hash, so
   jittered patches are also rougher.

---

## The honest caveats

This module would be dishonest without these.

- **Typechecking gets slow.** `three/webgpu` and `three/tsl` ship very large type definitions,
  and `tsc --noEmit` on this checkpoint takes *dramatically* longer than on any other module in
  the course — minutes rather than seconds, even with `skipLibCheck: true`. Budget for it, and
  consider not running `pnpm typecheck` in a hot loop while working on TSL.
- **Bundle size.** `three.webgpu.js` is substantially bigger than the core build. Fine for an
  app committed to it; a real cost if you only wanted one node material.
- **The ecosystem lags.** `@react-three/postprocessing` (Module 12) targets WebGL's
  `EffectComposer`. WebGPU postprocessing goes through three's own node-based post pipeline
  instead — which is why this checkpoint doesn't reuse Module 12's stack.
- **Two builds, one rule.** Say it again: never import from both `three` and `three/webgpu` in
  the same app.
- **Compute shaders are WebGPU-only.** They do *not* fall back to WebGL2. If you build on
  `compute()`, you need a real WebGPU backend and a real fallback plan.

None of this makes WebGPU a bad bet — it's where three is heading, and TSL is genuinely nicer
than string shaders. It does mean "port everything to WebGPU" is a decision with costs, not a
free upgrade.

---

## How real Ruderal does it

**Ruderal doesn't use any of this** — no `WebGPURenderer`, no TSL, no node materials anywhere in
`packages/`. It's a WebGL2 project using `ShaderMaterial` and `onBeforeCompile`. So this module
is the one place in the course with no "real Ruderal" file to point at.

What's interesting is what porting it *would* look like, because you now know both sides:

- **`packages/client/src/scene/materials.ts`** — its `onBeforeCompile` hook replacing
  `#include <color_fragment>` becomes a `colorNode` on a `MeshStandardNodeMaterial`. Same voxel
  jitter, same world-space cell hash, no string replacement and no dependence on three's
  internal include names.
- **`packages/client/src/scene/Vegetation.tsx`** — the grass sway patches `<begin_vertex>`;
  that becomes a `positionNode`. The `gl_InstanceID` phase offset has a TSL equivalent
  (`instanceIndex`).
- **`packages/client/src/worker/mesher.worker.ts`** — the interesting one. Ruderal meshes chunks
  on a **worker pool** because meshing is pure number-crunching (Module 08D). That is exactly
  the shape of a **compute shader**. A GPU mesher is a genuinely different architecture, and it's
  the most compelling reason a voxel engine would move to WebGPU.

The reason Ruderal hasn't is the caveats above: the project needs postprocessing, a wide
browser floor, and it already hits its frame budget on WebGL2. That's a reasonable engineering
call — and one you can now make deliberately rather than by default.

---

## Exercises

1. **Port the grass.** Take Module 11's `Vegetation` sway and rebuild it as a `positionNode` on
   a `MeshStandardNodeMaterial`, using `instanceIndex` for the per-blade phase.
2. **A compute shader.** Use `compute()` to update an array of particle positions on the GPU and
   feed it into an `InstancedMesh`. **WebGPU backend only** — guard it with
   `renderer.backend.isWebGPUBackend` and provide a CPU path.
3. **Node postprocessing.** Rebuild Module 12's bloom + vignette with three's node-based
   `PostProcessing` class instead of `@react-three/postprocessing`.
4. **Measure the claim.** Put 2,000 separate meshes on screen and compare frame time on the
   WebGPU backend versus `forceWebGL: true`. You should see WebGPU's lower draw-call overhead —
   and Module 12F explains why instancing beats both.

---

## Checkpoint

```bash
pnpm checkpoint 12E
pnpm dev
```

Files: `src/client/scene/TslSky.tsx`, `src/client/scene/TslShowcase.tsx`, `src/client/App.tsx`.

**Next:** [`12F-performance.md`](./12F-performance.md) — draw calls, instancing and profiling:
making all of this run fast, on either backend.
