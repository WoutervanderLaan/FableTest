# 10 · The sky-dome shader

> **Goal:** replace the flat sky color with a real gradient sky and a warm sun
> glow — by swapping the dome's *one* material for a shader. This is the exact
> `SKY_VERT` / `SKY_FRAG` from the real Ruderal.

**You'll build:** an upgrade to `src/client/scene/SkyAndLight.tsx`.

---

## Concepts

Back in the world now. Remember Module 04's payoff: the sky dome is a big inside-out sphere
(`BackSide`) with a material that ignores fog. We built it with a plain `MeshBasicMaterial`
specifically so this module could be a **one-material swap**. Nothing about the dome, its
size, its placement, or the lights changes — only `skyMat`.

The shader itself is beautifully small:

- **Vertex:** pass `vDir = normalize(position)` as a varying. Because the sphere geometry is
  centered on its own origin, `position` *is* the direction from the sky's center to that
  vertex — independent of where we place the dome in the world.
- **Fragment:** color each pixel from that direction:
  - a vertical gradient, `mix(horizon, zenith, pow(vDir.y, 0.65))`. The `pow(..., 0.65)`
    biases the blend toward the lighter horizon color — a real atmospheric cue (the sky is
    paler near the ground).
  - a warm glow around the sun: `pow(max(dot(vDir, sunDir), 0.0), 6.0)`. `dot` peaks toward
    the sun direction; the high exponent keeps the glow tight instead of washing out the
    whole sky.

Two dot/pow tricks give you a convincing sky in ~10 lines. No texture, no HDR — just
direction in, color out.

---

## Build it

Open `scene/SkyAndLight.tsx`. Add the two shader strings and change `skyMat` from
`MeshBasicMaterial` to a `ShaderMaterial`:

```tsx
const skyMat = useMemo(
  () => new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false, // sky never occludes anything
    fog: false,        // and fog never touches it
  }),
  [],
);
```

`SKY_VERT`/`SKY_FRAG` are in the checkpoint — type them and read the comments. The lights,
fog, and `<mesh>...<sphereGeometry/>` all stay exactly as they were.

> **`depthWrite: false`** keeps the sky from writing to the depth buffer, so nearby geometry
> always draws over it regardless of the sphere's radius. **`fog: false`** is essential:
> without it, the distance fog would blend the far dome to a flat color and erase your
> gradient.

---

## Run & observe

```bash
pnpm dev
```

Walk out into the open and look around. The sky now shades from a pale, paper-warm horizon
up to a cooler slate zenith, and there's a soft warm bloom low in the south-west where the
sun sits — matched to the warm directional light already raking your terrain. Turn toward
and away from the sun and watch the glow appear and fade: that's `dot(vDir, sunDir)` in
action.

Tweak the fragment shader live:
- Push `sunDir` higher (`vec3(-0.55, 0.9, 0.55)`) for a midday sun.
- Change the glow color to a cool blue and the exponent to `2.0` for a hazy overcast look.
- Swap `horizon`/`zenith` for night colors and dim the lights — instant dusk.

---

## How real Ruderal does it

This *is* `packages/client/src/scene/SkyAndLight.tsx` — the shader you just wrote is
`SKY_VERT`/`SKY_FRAG` almost character-for-character, including the `pow(h, 0.65)` bias and
the `pow(dot, 6.0)` sun. Ruderal deliberately keeps the sun low and warm — "golden hour" is
the project's whole mood, and wiring the sun to a zone's real local time-of-day is noted as
a later nicety. You've now rebuilt the atmospheric backbone of the game's look.

---

## Exercises

1. **Day/night cycle.** Make `sunDir` a uniform and rotate it over time in `useFrame`; move
   the `directionalLight` to match. Watch shadows swing and the glow travel.
2. **Sun disc.** Add a small bright core: `smoothstep(0.999, 1.0, dot(vDir, sunDir))` added
   to the color. Then let Bloom (Module 12) make it flare.
3. **Horizon band.** Add a subtle brightening right at `abs(vDir.y) < 0.05` for a hazy
   horizon line.
4. **Stars.** For a night variant, hash `vDir` into sparse white points when the sun is
   below the horizon.

---

## Checkpoint

```bash
pnpm checkpoint 10
pnpm dev
```

Files: `src/client/scene/SkyAndLight.tsx`.

**Next:** [`11-material-patching.md`](./11-material-patching.md) — keep Three.js's lighting
but inject your own code into it, for the voxel surface and the grass.
