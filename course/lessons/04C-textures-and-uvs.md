# 04C · Textures, UVs & PBR maps

> **Goal:** understand texture space well enough to debug it by eye. UV
> coordinates, wrapping and repeat, the color-space rule that quietly ruins
> renders, and the three-map PBR stack — assembled by hand.

**You'll build:** `src/client/loaders/textures.ts`, `src/client/scene/TextureLab.tsx`, and an
`App.tsx` that puts them side by side.

---

## Concepts

Everything so far has been **vertex-colored** — Module 03 baked a color into each vertex and
the GPU interpolated. That's exactly right for voxels (and it's what real Ruderal does), but
it caps detail at one color per corner. Textures decouple surface detail from geometry
density.

**UV space is a unit square.** Every vertex carries a `uv` attribute — a 2D coordinate saying
"sample the image *here* for me". `(0,0)` is one corner of the image, `(1,1)` the opposite;
the GPU interpolates between vertices across each triangle. That's the entire idea. Unwrapping
a complex model is the art of assigning good UVs; for a cube it's trivial, which is why we
start there.

> The checker texture has **one amber square at (0,0)**. That's a debugging trick worth
> stealing: it lets you read orientation, rotation and mirroring straight off a surface.

**`repeat` doesn't resize the image — it scales UVs.** `repeat.set(8,8)` multiplies every uv
by 8, so `uv=1.0` becomes `8.0`. What happens past 1.0 is the **wrapping** mode:

| Wrapping | Effect |
|---|---|
| `RepeatWrapping` | `fract(uv)` — the image tiles |
| `ClampToEdgeWrapping` | `clamp(uv,0,1)` — edge pixels smear outward |
| `MirroredRepeatWrapping` | tiles, flipping every other copy — hides seams cheaply |

**The color-space rule — the one that silently ruins renders.** A texture is either a
*picture* or a *lookup table*:

- **Picture** (base color, emissive): authored in **sRGB**. Tag it `THREE.SRGBColorSpace` so
  three converts to linear before lighting math. Forget it and everything looks washed out.
- **Data** (normal, roughness, metalness, AO, displacement): these are *numbers* that happen
  to be stored as pixels. They must stay **linear** (`THREE.NoColorSpace`). Tag one as sRGB
  and you silently corrupt the values — normals bend wrong, roughness goes blotchy.

Rule of thumb: if a human would call it "a picture", it's sRGB. Otherwise it's data.

**Filtering & mipmaps.** `magFilter` decides what happens when a texel is bigger than a pixel
(`LinearFilter` smooths, `NearestFilter` keeps it crisp — the pixel-art look). Minification
uses **mipmaps**, prefiltered smaller copies three generates automatically. **`anisotropy`**
fixes the blurry mush on surfaces at a grazing angle (a floor receding to the horizon) and is
the best beauty-per-cost setting in texturing — set it to 8 and move on.

**Atlases** pack many small images into one. One texture = one bind = fewer draw calls, and
it's how textured voxel engines work: each block face picks its tile by offsetting UVs into
the atlas. Module 12F picks up why that matters.

---

## Build it

### 1. `src/client/loaders/textures.ts`

The same suspense-cache shape as `loaders/gltf.ts`, plus a `configure()` applying the options
above. One subtlety worth reading closely — there are **two** caches:

```ts
const cache = new Map<string, Entry>();      // one loaded image per url
const variants = new Map<string, Texture>(); // one sampler per (url + options)
```

The second isn't an optimization, it's a correctness fix. A render function runs on every
update, so cloning inline would mint a new `THREE.Texture` every frame and leak GPU objects.
Clones share the uploaded image and differ only in sampler settings — which is exactly what
we want when the ground tiles a texture 8× and a crate uses it 1×.

### 2. `src/client/scene/TextureLab.tsx`

Three components: `<CheckerPanel>` (UV space made visible, `NearestFilter`), `<TiledGround>`
(repeat + wrap + anisotropy), and `<PbrCrate>` (a `MeshStandardMaterial` assembled from
`map` + `roughnessMap` + `normalMap`). Note the channel convention in the comments: three
follows glTF and reads **roughness from green, metalness from blue**, which is why one
grayscale image can serve as both.

### 3. `App.tsx`

Lay all three out plus 04B's `<Crate>` — whose textures `GLTFLoader` wired up automatically
from the material block in the file. Compare it against the hand-built `<PbrCrate>`: same
maps, same result, one of them typed by you.

---

## Run & observe

```bash
pnpm make-assets && pnpm dev
```

- **The checker panel** — count squares to read the UV grid. The amber square is `(0,0)`.
- **The ground** — one 256px image tiled 8×8 across 40 units.
- **The PBR crate** — plank seams that *catch light* as you orbit. That's the normal map;
  the geometry is a plain 6-face box.

Break things to see the rules:

1. **Kill the color space.** In `TextureLab.tsx` change `srgb: true` to `false` on the
   ground's color map. Everything pales and flattens.
2. **Corrupt a data map.** Now set `srgb: true` on `crate_normal.png`. The seam lighting goes
   wrong — you're feeding gamma-decoded values into a vector.
3. **Drop anisotropy.** Set `anisotropy: 1` and look down the ground plane toward the horizon.
   The mush is back.
4. **Clamp instead of repeat.** `wrap: THREE.ClampToEdgeWrapping` on the ground. One stretched
   copy, edge pixels smeared to infinity.

---

## How real Ruderal does it

**Ruderal ships no texture files at all.** Its surfaces are flat palette colors × a
`FACE_SHADE` table × vertex AO — see `packages/shared/src/blocks.ts` and
`packages/shared/src/mesher.ts`. That's a deliberate art choice ("Ruderal Futurism": the rigid
grid is the damage), and a performance one: no texture binds, no atlas, no UV attribute in the
mesh at all. Look back at Module 06's `MeshData` — `position`, `normal`, `color`, `index`.
**No `uv`.**

What Ruderal does instead is *procedural* surface detail. `packages/client/src/scene/materials.ts`
patches the voxel material's fragment shader to hash each block's world-space cell into a
subtle value jitter:

```glsl
vec3 cell = floor(vJPos - vJNorm * 0.5) + 0.5;
float jn = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
diffuseColor.rgb *= (0.90 + 0.20 * jn);
```

That's a texture computed in the shader instead of sampled — no memory, no UVs, and (crucially)
it survives greedy meshing, because it's keyed on world position rather than on the vertex
layout. Module 09C derives that `fract(sin(dot(...)))` hash from first principles.

So: textures when you have authored art; procedural detail when you have an algorithm and a
palette. Knowing both is the point.

---

## Exercises

1. **Atlas the checker.** Set `repeat: [0.5, 0.5]` and `offset` to `(0.5, 0)` on a texture.
   You're now sampling one quadrant — that's an atlas lookup, by hand.
2. **Normal-map strength.** Animate `normalScale` from `(0,0)` to `(3,3)` in `useFrame`. Watch
   flat become deeply grooved with no geometry change.
3. **Pixel-art mode.** Give the ground `magFilter: THREE.NearestFilter` and `repeat: [2,2]`.
   Crisp texels — the Minecraft look, which is a *filtering* decision, not an art one.
4. **Add UVs to the voxel mesher.** In Module 06's `mesher.ts`, emit a `uv` array (0..1 per
   face) alongside positions, and give the voxel material a texture. You've just converted
   Ruderal's look from palette to textured — and you'll immediately see why an atlas is
   mandatory.

---

## Checkpoint

```bash
pnpm checkpoint 04C
pnpm make-assets
pnpm dev
```

Files: `src/client/loaders/textures.ts`, `src/client/scene/TextureLab.tsx`,
`src/client/App.tsx` (+ 04B's `loaders/gltf.ts`, `scene/Crate.tsx`).

**Next:** [`04D-animation-and-composition.md`](./04D-animation-and-composition.md) — make the
loaded model move, and compose a scene without a voxel in sight.
