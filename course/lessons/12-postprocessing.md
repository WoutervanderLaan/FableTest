# 12 · Postprocessing

> **Goal:** grade the whole rendered image — bloom, vignette, film grain — so the
> scene reads as one cohesive picture instead of a pile of objects. This is the
> exact effect stack the real Ruderal ships.

**You'll build:** an `EffectComposer` in `App.tsx`.

---

## Concepts

**Postprocessing** happens *after* the 3D scene is rendered. Instead of drawing to the
screen, Three.js draws to an offscreen image; then a chain of **full-screen passes** filters
that image before it's shown. Each pass is itself a fragment shader running over every pixel
— you're applying Module 09 ideas to the finished frame.

We use `@react-three/postprocessing`, whose `<EffectComposer>` you drop inside `<Canvas>`
with effect children. Three classics, and why each matters:

- **Bloom** — bright pixels bleed a soft glow. It's what makes emissive/hot things feel
  *luminous* rather than just light-colored. The key knob is `luminanceThreshold`: only
  pixels brighter than it bloom. Set it so your intentional highlights (our amber blocks, the
  sun) clear the bar and the muted terrain doesn't — bloom everything and the image turns to
  mush.
- **Vignette** — darkens the corners. A subtle, ancient cinematography trick that pulls the
  eye to the center.
- **Noise** — a whisper of film grain over everything. It hides banding in gradients (your
  sky!) and glues disparate elements into one photographed-feeling image.

Order matters — effects run top to bottom. Bloom first (operating on the true rendered
brightness), then vignette and grain as final grading.

---

## Build it

Import the effects and wrap them in an `EffectComposer` as the last children inside
`<Canvas>`:

```tsx
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";

// ...inside <Canvas>, after the scene:
<EffectComposer>
  <Bloom mipmapBlur luminanceThreshold={0.85} intensity={0.4} />
  <Vignette eskil={false} offset={0.25} darkness={0.55} />
  <Noise opacity={0.035} />
</EffectComposer>
```

That's the whole change. `mipmapBlur` gives Bloom a cheap, smooth wide glow; the numbers are
lifted straight from the real Ruderal. Full file in the checkpoint.

---

## Run & observe

```bash
pnpm dev
```

The image tightens up. Place a few **amber blocks** and look at them: they now *glow* softly,
haloing into the pixels around them — because amber (~0.9 brightness) clears the
`luminanceThreshold` and the terrain (~0.5) doesn't. The sun glow in the sky flares. The
corners sit slightly darker, and a fine grain unifies everything into one warm, filmic
picture. This is the moment mini-Ruderal stops looking like a tech demo and starts looking
like *the game*.

Dial the knobs to feel them:
- `luminanceThreshold` to `0.4` → everything blooms, the image goes dreamy/washed. To `1.0`
  → almost nothing blooms. The threshold is a *budget*: decide what earns a glow.
- `Vignette darkness` to `0.9` → heavy, moody tunnel. To `0` → off.
- Remove `<Noise>` → subtly cleaner but a touch more "CGI."

---

## How real Ruderal does it

You copied Ruderal's stack outright — `packages/client/src/App.tsx` wraps its scene in the
same `<EffectComposer>` with `<Bloom mipmapBlur luminanceThreshold={0.85} intensity={0.4}
/>`, `<Vignette offset={0.25} darkness={0.55} />`, and `<Noise opacity={0.035} />`. This is
also *why* amber is reserved for player-placed blocks: they're the brightest thing in the
palette, so they're the thing bloom makes glow — player agency literally lights up. Design
and rendering, working together.

---

## Exercises

1. **Depth of field.** Add `<DepthOfField>` from the same library and focus on the crosshair
   distance. (Watch the perf cost.)
2. **Chromatic aberration.** Add `<ChromaticAberration>` at a tiny offset for a lens feel.
3. **Selective bloom.** Give *only* amber blocks an emissive boost (in `makeVoxelMaterial`)
   so they bloom even harder while nothing else changes.
4. **Tone mapping.** Explore `<Canvas gl={{ toneMapping: THREE.ACESFilmicToneMapping }}>` and
   see how it interacts with bloom.

---

## Checkpoint

```bash
pnpm checkpoint 12
pnpm dev
```

Files: `src/client/App.tsx`.

---

## Part 3 complete 🎉 (core)

Your world now has a shader sky, jittered voxel surfaces, wind-swayed grass, and a graded
image. It *looks* like Ruderal. The optional deep-dive adds a custom water shader; or head
to **Part 4**, where the real challenge begins — making it multiplayer.

**Next:** [`12D-shader-techniques.md`](./12D-shader-techniques.md) *(optional)* — or jump to
[`13-netcode-and-colyseus.md`](./13-netcode-and-colyseus.md).
