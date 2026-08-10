# 11C · Bushes from leaf cards on a sphere

> **Goal:** grow a bush out of a few hundred flat quads — evenly distributed on
> a deformed sphere, lit by a normal that *lies*, cut to a leaf silhouette in
> the fragment shader, and seeded so every bush is different.

**You'll build:** `src/client/scene/bushShader.ts`, `src/client/scene/Bushes.tsx`, and an
`App.tsx` that plants six of them in module 11B's meadow.

> **Prerequisite:** [`11B-infinite-grass.md`](./11B-infinite-grass.md) (and through it,
> [`02B`](./02B-devtools-and-camera.md)). This module reuses the wind, translucency and
> instancing ideas, and the SDF work from [`09C`](./09C-shader-math-noise-sdf.md).

---

## Concepts

A bush is not a mesh you model. It's a **cloud of leaf cards** arranged to suggest a volume.
The build order below is also the order in which the thing starts looking real.

### 1. Even points on a sphere — the Fibonacci spiral

Scatter points randomly on a sphere and they clump. Use latitude/longitude bands and they bunch
at the poles. The fix is the **Fibonacci spiral**: walk `y` linearly from 1 to −1 and rotate by
the **golden angle** each step.

```ts
const GOLDEN = Math.PI * (3 - Math.sqrt(5));   // ≈ 2.39996 rad
const y = 1 - (i / (n - 1)) * 2;
const r = Math.sqrt(1 - y * y);
const theta = i * GOLDEN;
```

The golden angle is the "most irrational" rotation, so successive points never line up into
visible spiral arms. It's the same reason sunflower seeds pack the way they do.

### 2. Deform it, or it reads as a ball

A perfect sphere of leaves looks like a green ball. Two cheap deformations fix that:

- **Squash** vertically (~0.82) — bushes are wider than they are tall.
- **Lumps** — modulate the radius with low-frequency noise so the mass is irregular.

Both are per-bush, so no two share a silhouette.

### 3. The normal trick — the heart of the module

Here is the problem. Each leaf is a flat card, and in real foliage leaves point in every
direction. If you light each card by **the direction it physically faces**, adjacent leaves get
wildly different brightness and the bush becomes a speckled mess of independently-lit flakes.
It's physically honest and it looks wrong.

So you lie. Light each leaf by **the bush's overall surface normal** — the direction from the
bush's centre out through that leaf:

```glsl
vNormal = normalize(mix(n, cardN, uNormalBlend));
//                   ↑ sphere normal   ↑ the card's true facing
```

With `uNormalBlend = 0` the lighting varies smoothly from one side of the bush to the other, so
a heap of unrelated cards reads as **one soft, rounded plant**. Drag the slider to 1 and watch
the volume dissolve into speckle. That single substitution is what separates "pile of quads"
from "bush".

> This is the same idea as module 11B's grass, where blade normals are tilted toward straight
> up so the meadow shades like the ground — and the same as Ruderal's `Vegetation.tsx`. It
> generalises: **for foliage, shade by the normal of the volume you're impersonating, not the
> geometry you actually have.**

`uLeafChaos` is what makes this a real choice rather than a no-op. At 0 the cards lie flat
against the sphere, so their own normals already *equal* the sphere normal and the blend does
nothing. Push it up and the leaves start pointing all over — now the two normals genuinely
differ, and the trick has something to fix.

### 4. The leaf silhouette, as an SDF

Rather than ship a leaf texture with an alpha channel, cut the shape in the fragment shader.
A leaf is a **lens** — the intersection of two overlapping circles:

```glsl
float d = max(length(p - vec2(0.0, -sep)) - rad,
              length(p - vec2(0.0,  sep)) - rad);
if (d > 0.0) discard;
```

`max` is intersection for signed distance fields (module 09C), and two offset discs meet at two
points — exactly a leaf's tip and stem. Slide `sep` toward 0 and the lens fattens into a round
blob, which is why `leafRound` is a slider and not a constant.

No image assets, no alpha-test sorting, and a silhouette you can tune live.

### 5. Seeds

Every random choice — leaf placement, roll, scale, tint, lump phase, squash — comes from a
**seeded PRNG** (`mulberry32`), not `Math.random()`. Two consequences, both essential:

- The same seed rebuilds the same bush, so a React re-render doesn't reshuffle every leaf.
- Changing *only* the seed gives you a different plant with the same character — which is how
  you get a diverse hedge from one component.

This is the determinism argument from module 05, in a much smaller costume.

### 6. One draw call for every bush

All bushes' leaves live in a single `InstancedBufferGeometry`, with `aCenter` telling each leaf
which bush it belongs to. Six bushes or six hundred: **one draw call** (module 12F).

---

## Build it

### 1. `src/client/scene/bushShader.ts`

The vertex shader: pick the card's facing (`mix(n, aCardDir, uLeafChaos)`), build an orthonormal
basis in that plane, roll it randomly, place the quad, add wind and outward puff, then set
`vNormal` from the blend above. The fragment shader: the lens SDF, a midrib, edge darkening,
sky+sun lighting, and the backlit translucency term from 11B.

`vExposure = n.y * 0.5 + 0.5` is a one-line ambient occlusion: leaves on the underside see less
sky.

### 2. `src/client/scene/Bushes.tsx`

`mulberry32`, the leaf quad, and the generation loop. One detail worth reading — the random leaf
directions are drawn from a **normal distribution** and normalised, not from uniform components:

```ts
const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);  // Box–Muller
```

Picking `x`, `y`, `z` uniformly in `[-1,1]` and normalising bunches directions toward the cube's
eight corners. Gaussian components are spherically symmetric, so they don't.

### 3. `App.tsx`

Six bushes on a ring. Only the **seed** differs between them.

---

## Run & observe

```bash
pnpm dev
```

Six distinct bushes in the meadow. Then take them apart with the panel:

1. **`Bush · look → normalBlend`, 0 → 1.** The bushes lose their smooth volumetric gradient and
   break into individually-lit leaves. Slide back to 0 and the roundness returns. This is the
   module in one control.
2. **`leafChaos` to 0.** Cards lie flat on the sphere — a shrink-wrapped, scaly look. Now
   `normalBlend` does almost nothing, because a tangent card's own normal *is* the sphere
   normal. Push chaos back up and the slider matters again.
3. **`Bush · layout → seedOffset`.** Every bush regenerates into a different plant. Same code,
   same parameters, one number.
4. **`Bush · shape → leavesPerBush`** from 260 down to 40. Watch the volume become transparent —
   and note the draw call count doesn't change.
5. **`leafRound` 0 → 1.** Pointed leaves become round blobs. Good for showing what the SDF is
   doing.
6. **`lumpiness` to 0.** Perfect spheres. Immediately reads as artificial.
7. **`puff` to 0.8.** The silhouette goes shaggy as cards push outward at random.

---

## How real Ruderal does it

Ruderal has **no bushes** — its vegetation is the instanced grass in
`packages/client/src/scene/Vegetation.tsx`, and its trees are *voxels*, blocks of
`Block.Leaves` placed by the generator (`packages/shared/src/voxelize.ts`). Foliage in a voxel
world is made of the same cubes as everything else, which is the whole aesthetic: *"the rigid
voxel grid is the damage; soft, grid-ignoring life is the hope."*

But the one technique this module is built on is already in that file, stated plainly:

```ts
// two crossed quads, 0.8 wide × 0.75 tall; normals point up so the grass
// shades like the ground it grows from
```

Normals pointing **up** rather than along the card's face — for exactly the reason the bush
normals point **outward** rather than along the leaf. Ruderal's grass is a two-card version of
this module's bush: cards impersonating a volume, shaded by the volume's normal, swaying in a
vertex shader.

If you wanted bushes in Ruderal proper, this component drops in almost unchanged — place them
where `voxelize.ts` marks `Block.Leaves`, seed each from the world seed and its block
coordinates (`hash01(seed, x, z, salt)`), and you'd get deterministic bushes that both client
and server agree on.

---

## Exercises

1. **A trunk and branches.** Add a few tapered cylinders, and bias leaf placement toward branch
   ends instead of a single centre. That's the step from bush to tree.
2. **Seasons.** Drive `colorA`/`colorB` and `leavesPerBush` from a "season" slider — green and
   full, amber and sparse, bare. One parameter, four looks.
3. **Real ambient occlusion.** Replace `vExposure` with a cheap occlusion estimate: for each
   leaf, count neighbours within a radius at build time and pass it as an attribute. Denser
   regions get darker.
4. **Billboard the far ones.** Beyond ~20m, swap a bush for two crossed quads with the same
   colours. Measure the triangle drop in module 12F's panel.
5. **Grow them.** Add a `uGrowth` uniform scaling `uLeafSize` and the offsets from 0 to 1, and
   stagger it per bush by seed. Bushes that sprout is a two-line change.

---

## Checkpoint

```bash
pnpm checkpoint 11C
pnpm dev
```

Files: `src/client/scene/bushShader.ts`, `src/client/scene/Bushes.tsx`, `src/client/App.tsx`
(+ 11B's `scene/Grass.tsx` and 02B's `debug/` / `controls/`).

**Next:** [`12-postprocessing.md`](./12-postprocessing.md) — bloom, vignette and noise over the
top of your meadow. Or [`12F-performance.md`](./12F-performance.md) to measure what all this
foliage actually costs.
