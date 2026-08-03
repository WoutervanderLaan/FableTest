# 09C · Shader math II — noise, warping & SDFs

> **Goal:** the maths that makes shaders look like *nature* rather than like
> geometry. One hash function grows into value noise, fbm, and domain warping;
> signed distance fields give you shapes that melt together. Six panels and an
> fbm-displaced surface.

**You'll build:** `src/client/scene/NoiseLab.tsx` and an `App.tsx` that lays it out.

---

## Concepts

Module 09B's tools all produce *clean* results — gradients, circles, waves. Nature isn't clean.
This module is about controlled irregularity, and remarkably it all grows from **one function**.

### The tower: hash → noise → fbm → warp

**1. The hash.** You need randomness, but `rand()` doesn't exist in GLSL — there's no state and
no seed. Instead you need a *pure function* from coordinate to pseudo-random number: the same
input must always give the same output (or your texture would boil as the camera moves).

```glsl
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}
```

Read it right to left: `dot` collapses the 2D coordinate to one number; `sin` scrambles it
non-linearly; the large multiply pushes the interesting variation up past the decimal point;
`fract` keeps only that fractional part. The constants are arbitrary — they just need to be
irrational-ish and unrelated.

It is *not* a good hash by any rigorous standard, and it has known precision problems on some
mobile GPUs. It's used everywhere anyway because it's one line, needs no memory, and is stable.

> This is the shader cousin of the integer hashing in your `voxel.ts` — same job, different
> constraints. Module 08E derives the integer version.

**2. Value noise.** White noise (the raw hash per pixel) has no structure at any scale — it's
useless for anything organic. The fix: evaluate the hash only at **integer lattice points**,
and interpolate between them.

```glsl
vec2 i = floor(p);          // which cell     ← module 09B, panel 7
vec2 f = fract(p);          // where in it    ←
vec2 u = f * f * (3.0 - 2.0 * f);   // smoothstep the blend
return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
```

Hash the four corners, bilinearly interpolate. **The smoothstep curve on the blend factor is
what matters most** — interpolate linearly and you get visible diamond-shaped creases at cell
boundaries, because the derivative jumps. The cubic is flat at both ends, so the slope matches
across the seam.

**3. fbm (fractal Brownian motion).** One octave of noise is blobby. Real surfaces have detail
at every scale — big shapes *and* fine grain. So sum several octaves, each at double the
frequency and half the amplitude:

```glsl
for (int i = 0; i < 5; i++) { sum += amp * valueNoise(p); p *= 2.0; amp *= 0.5; }
```

Doubling is **lacunarity**, halving is **gain**. This is the single most useful construct in
procedural graphics: it reads as terrain, cloud, rust or marble depending only on how you
colour it. Your `generateWorld` in Module 05 uses exactly this, on the CPU.

**4. Domain warping.** The step most people never take, and the biggest payoff. Instead of
colouring fbm, use fbm to **displace the coordinate you sample fbm at**:

```glsl
vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
float n = fbm(p + 4.0 * q);
```

Two extra lines turn bland cloud into marbled, flowing, organic structure. The intuition:
you're bending the space the noise lives in, so features stretch and swirl instead of sitting
on a grid. Feed the warp back through itself again for even richer results.

### Signed distance fields

An SDF is a function returning **how far you are from a shape**, negative inside:

```glsl
float sdCircle(vec2 p, float r) { return length(p) - r; }
```

Compare to a boolean "am I inside?" mask. Because you have the *distance*, you get:

- **outlines** — `smoothstep(w, 0.0, abs(d))`
- **glows** — any falloff function of `d`
- **combination** — `min(a, b)` unions two shapes, `max(a, -b)` subtracts one from the other

And the best part, **`smin`** — a smooth minimum:

```glsl
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
```

A plain `min` unions two shapes with a hard crease. `smin` **melts** them together, like two
drops of water merging. That's not achievable with geometry without real work, and here it's
one function. `k` is the blend radius.

### Dithering

Quantise a smooth gradient to a few levels and you get ugly **banding**. Add a tiny per-pixel
random offset *before* quantising and the error scatters into noise your eye integrates back
into a smooth ramp. Panel 6 shows both halves side by side — it's the same reason Module 12's
postprocessing stack ends with a Noise pass.

---

## Build it

### 1. `src/client/scene/NoiseLab.tsx`

`NOISE_HELPERS` is a GLSL string with the whole tower — `hash21`, `valueNoise`, `fbm`,
`sdCircle`, `sdBox`, `smin` — injected via the `extraHeader` parameter you added to
`makeLabMaterial` in 09B. Each function uses only the one above it; read it straight down.

Then `NOISE_PANELS` (six bodies), the `NoiseLab` grid, and `NoiseSurface` — a plane whose
**vertex** shader displaces geometry with the same `fbm`, proving the maths isn't just for
colour.

### 2. `App.tsx`

The 3×2 grid plus the surface above it.

---

## Run & observe

```bash
pnpm dev
```

Read the top row left to right and you can watch structure appear: **static → blobs →
terrain**. That progression is the whole lesson. Then the bottom row: warped marble, melting
SDF shapes, and banding-vs-dither.

Things to try:

1. **Kill the smoothstep in `valueNoise`.** Change `vec2 u = f * f * (3.0 - 2.0 * f);` to
   `vec2 u = f;`. Diamond creases appear all over the noise — that's the derivative
   discontinuity, made visible.
2. **Count the octaves.** Change fbm's loop to 1, then 8. One octave is blobby; eight is barely
   different from five but costs 60% more. Finding that knee is real performance work.
3. **Turn the warp up.** In panel 4, change `4.0 * q` to `0.5 * q`, then `12.0 * q`.
4. **Watch `smin` melt.** Panel 5 animates `k`. Set it to a constant `0.0` for a hard union,
   then `0.4`.
5. **Look closely at the surface's shading.** It's soft and cloudy because we displaced the
   *positions* but never recomputed the *normals* — so lighting still thinks the plane is flat,
   and only the fresnel term gives it shape. Exercise 3 fixes that.

---

## How real Ruderal does it

The hash in panel 1 is, character for character, the one in
`packages/client/src/scene/materials.ts`:

```glsl
float jn = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
diffuseColor.rgb *= (0.90 + 0.20 * jn);
```

Three details make it a good piece of engineering, and you can now read all three:

1. **It's a 3D hash keyed on the voxel's world cell** —
   `vec3 cell = floor(vJPos - vJNorm * 0.5) + 0.5;` steps half a voxel back along the normal to
   land *inside* the block this face belongs to, then floors to identify the cell. That's 09B's
   `floor`/`fract` pairing doing real work.
2. **It's in the fragment shader on purpose.** Jitter baked into vertex colours would make every
   face's greedy-merge key unique and destroy the mesher's merging (Module 08E, §7). Keying on
   world position instead means merged and unmerged quads look identical.
3. **The range is tiny** — `0.90 + 0.20 * jn`. Procedural detail sells best when you barely
   notice it.

Meanwhile `packages/shared/src/voxelize.ts` runs the **CPU** version of this same tower —
`hash01` → value noise → fbm — to decide terrain heights, and it must be bit-for-bit
deterministic because client and server both run it (Module 08E, §9). Same maths, two
languages, two very different constraints.

The fresnel term on the surface is the one in
`packages/client/src/scene/materials.ts`'s water treatment and in Module 12D's translucent
canals.

---

## Exercises

1. **Gradient noise.** Value noise interpolates *values* at lattice points; Perlin-style
   gradient noise interpolates *dot products with random gradients*, which removes the axis-aligned
   blockiness. Implement it and compare panel 2 side by side.
2. **Voronoi.** For each cell and its 8 neighbours, hash a feature point and keep the nearest
   distance. You get organic cell patterns — cracked mud, scales, stone. ~15 lines.
3. **Recompute the normals.** In `NoiseSurface`, sample `fbm` three times (at `p`, `p+dx`,
   `p+dy`), build two tangents from the height differences, and `cross()` them for a true normal.
   The surface immediately gains real lighting.
4. **Warp the sky.** Take Module 10's sky shader and add a subtle domain-warped fbm to the
   horizon colour. Instant clouds — and it's four lines on top of what you already have.
5. **Ridged noise.** Replace `sum += amp * valueNoise(p)` with
   `sum += amp * (1.0 - abs(valueNoise(p) * 2.0 - 1.0))`. Blobs become sharp ridges — the
   standard trick for mountain terrain.

---

## Checkpoint

```bash
pnpm checkpoint 09C
pnpm dev
```

Files: `src/client/scene/NoiseLab.tsx`, `src/client/App.tsx` (+ 09B's `scene/ShaderLab.tsx`).

**Next:** [`10-sky-shader.md`](./10-sky-shader.md) — back into the world, and your first
shader that ships: the sky dome. You now have every tool it uses.
