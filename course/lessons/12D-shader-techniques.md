# 12D · Shader techniques *(deep-dive)*

> **Optional.** A grab-bag of techniques that go beyond what core Ruderal ships,
> built around one concrete upgrade: replacing the flat water plane with a real
> water shader — displaced waves, a fresnel edge glow, and sparkle.
>
> **Goal:** get comfortable writing a raw `ShaderMaterial` that does vertex
> displacement AND view-dependent fragment shading, using Three.js's built-in
> uniforms.

**You'll build:** `src/client/scene/Water.tsx` and swap it into `App.tsx`.

---

## Concepts

Three reusable techniques, all in one small shader.

**1. Vertex displacement.** Move geometry on the GPU by editing the vertex position before
projection. Summed sine waves over `uTime` give cheap, believable undulation:

```glsl
p.z += sin(p.x*0.4 + uTime*1.2)*0.15 + cos(p.y*0.5 + uTime*0.9)*0.12;
```

(Our water plane is rotated flat, so its *local* +Z is world *up* — displacing `z` raises the
surface.) Displacing in the vertex shader is free-ish and per-frame smooth; doing it on the
CPU would mean re-uploading geometry every frame.

**2. Fresnel.** Real surfaces get more reflective/bright at **grazing angles** (look across a
lake vs. straight down). The ubiquitous cheap approximation:

```glsl
float fres = pow(1.0 - max(dot(viewDir, normal), 0.0), k);
```

`viewDir · normal` is ~1 looking head-on (fres ≈ 0) and ~0 at the horizon (fres ≈ 1). We use
it to brighten the water toward the distance and drive an edge glow. Fresnel is everywhere —
water, glass, rim-lit characters, force fields.

**3. Built-in uniforms.** A raw `ShaderMaterial` gets `cameraPosition`, `modelMatrix`,
`viewMatrix`, `projectionMatrix` (and the `position`/`normal` attributes) for free from
Three.js — so we can compute `viewDir = normalize(cameraPosition - worldPos)` without wiring
a single uniform ourselves.

A high-power product of sines fakes **sparkle** (sparse glints) as a bonus.

---

## Build it

### 1. `src/client/scene/Water.tsx`

A `<mesh>` (flat, subdivided `planeGeometry` so there are vertices to displace) with a
`ShaderMaterial` that's `transparent`, `DoubleSide`, and `depthWrite: false`. The vertex
shader displaces + forwards world position and normal; the fragment shader does fresnel
color mix + sparkle + fresnel-boosted alpha. A `useFrame` advances `uTime`. Full file in the
checkpoint.

> **Why `depthWrite: false` + `transparent`?** Transparent surfaces shouldn't block what's
> behind them in the depth buffer, or you get sorting artifacts against the terrain below.

### 2. `App.tsx`

Replace the old inline flat `Water` with `import { Water } from "./scene/Water"` and
`<Water size={world.sizeX} level={WATER_LEVEL} />`. Nothing else changes.

---

## Run & observe

```bash
pnpm dev
```

Walk to a basin and look across the water: it undulates, the far edge glows brighter (fresnel
toward the horizon), and little glints skitter across the surface. Look straight *down* into
it and it goes darker and clearer — fresnel again, from the other end. With Bloom still on
from Module 12, the sparkles flare. Compare to the dead-flat plane from before.

Tune it:
- Bigger waves: raise the `0.15`/`0.12` amplitudes (and add more subdivisions so they read).
- Sharper horizon glow: raise the fresnel power `k` from `3.0`.
- Calmer glints: raise the sparkle exponent from `20.0`.

---

## How real Ruderal does it

Ruderal's core water is intentionally *simpler* than this — a translucent Lambert
(`makeWaterMaterial` in `packages/client/src/scene/materials.ts`) — because its art direction
leans matte and papery, not glossy. That's a good lesson in itself: **the fanciest shader
isn't always the right one.** But the techniques here — vertex displacement, fresnel,
built-in uniforms — are exactly what you'd reach for to push any surface further, and they're
the foundation of effects Ruderal *does* use elsewhere (the sun glow is a dot-product cousin
of fresnel).

---

## Exercises

1. **Fresnel rim on blocks.** Add a subtle fresnel rim-light to `makeVoxelMaterial` so block
   silhouettes catch the sky — a cheap way to separate geometry from the background.
2. **Real normals.** Right now fresnel uses the flat up-normal. Compute the *displaced*
   normal analytically (derivative of the wave) so the fresnel ripples with the waves.
3. **Noise field.** Replace the sine sparkle with a proper 2D value-noise function (port
   `valueNoise` from `shared/voxel.ts` into GLSL) for organic caustics.
4. **Refraction fake.** Sample the scene behind the water (a render target) and offset the
   uv by the wave normal for a refractive wobble. (Advanced — this is a mini render-to-texture
   project.)

---

## Checkpoint

```bash
pnpm checkpoint 12D
pnpm dev
```

Files: `src/client/scene/Water.tsx`, `src/client/App.tsx`.

**Next:** [`13-netcode-and-colyseus.md`](./13-netcode-and-colyseus.md) — Part 4. The world
goes multiplayer. Or finish Part 3 first with
[`12E-webgpu-and-tsl.md`](./12E-webgpu-and-tsl.md) (the same scene on a WebGPU renderer, shaders
written as TypeScript) and [`12F-performance.md`](./12F-performance.md) (draw calls, instancing,
and how to profile instead of guess).
