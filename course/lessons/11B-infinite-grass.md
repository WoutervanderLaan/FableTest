# 11B · An "infinite" grass field

> **Goal:** a meadow that never ends and never gets more expensive. Triangle
> blades on a semi-random grid, a field that re-centres on the camera, wind that
> sweeps across it in gusts, and a shader that makes flat triangles read as
> soft, backlit grass.

**You'll build:** `src/client/scene/grassShader.ts`, `src/client/scene/Grass.tsx`, and an
`App.tsx` you can fly around in.

> **Prerequisite:** [`02B-devtools-and-camera.md`](./02B-devtools-and-camera.md). This module is
> mostly *tuning*, and tuning without sliders is misery. It also uses the hash and wave maths
> from [`09B`](./09B-shader-math-toolkit.md) / [`09C`](./09C-shader-math-noise-sdf.md), and the
> instancing idea from module 11.

---

## Concepts

### One blade = one triangle

Three vertices. You cannot spend less, and at 100,000 blades that thrift is the difference
between a meadow and a slideshow. The geometry is built once in unit space — `position.y` runs
`0..1`, `position.x` is `±0.5` — so the shader can scale each blade's height and width
independently without touching the buffer.

A triangle can't curve, but it doesn't need to: the wind only has to move the tip, and a
triangle has exactly one tip.

### The field follows the camera — this is the whole trick

You do **not** generate grass out to the horizon. You build one fixed square patch of blades
and move it with the camera, so the player is always in the middle of it. Blades leaving the
back edge reappear at the front. With fog hiding the boundary, the field is indistinguishable
from an infinite one — at constant cost, forever.

The naive version of this fails in a very specific and instructive way. If each blade's
randomness (height, lean, colour) comes from its **instance index**, then when the patch shifts,
the blade that reappears at the front inherits the identity of the blade that just left the
back. Every blade re-rolls its dice as you walk and **the entire meadow boils**.

The fix is one line. Snap the patch's centre to the grid spacing, and derive each blade's
randomness from its **world position** rather than its index:

```glsl
vec2 cellWorld = aCell + uCenter;   // uCenter is snapped to cell size
float r1 = hash21(cellWorld);       // stable forever
```

Because `uCenter` only ever moves in whole cells, `cellWorld` always lands on the same fixed
world lattice. A blade at world position (12.4, −8.1) hashes to the same height and colour
whether you approach it from the north or the south, or leave and come back an hour later. It
*is* the same blade.

```
  camera moves right by one cell
       ┌───────────────┐              ┌───────────────┐
       │ a b c d e f g │      →       │ b c d e f g h │
       └───────────────┘              └───────────────┘
         ↑ 'a' leaves                   new 'h' appears —
                                        and it has always been 'h'
```

Snapping (rather than following the camera continuously) is what makes this work. Follow
continuously and the lattice slides under the hash, which is the boiling problem again.

### Breaking up the grid

A perfect grid reads as a grid instantly. Two cheap fixes, both hashed from the world cell so
they stay stable:

- **Jitter** each blade off its cell centre by up to ~one cell.
- **Vary the height** substantially — `heightVary` at 0.55 means blades range from 45% to 100%
  of full height.

### Facing the camera

A flat triangle seen exactly edge-on is invisible, so a field of randomly-rotated blades has
thin patches that shimmer as you turn. Blending each blade's own angle *partway* toward the
camera keeps coverage even without making it obvious that they're tracking you. `cameraFacing`
around 0.3–0.4 is the sweet spot.

One subtlety: you can't lerp angles directly, or 359° and 1° average to 180°. Convert both to
direction vectors, mix those, and normalise.

### Wind that sweeps

Per-blade wobble looks like static. Real wind arrives in **gusts that travel across the field**,
and you get that by making the phase depend on position along the wind direction:

```glsl
float phase = dot(world, wd) * uWindScale - uTime * uWindSpeed + r2 * 6.2831853;
float gust  = sin(phase) * 0.6 + sin(phase * 2.3 + 1.7) * 0.4;
```

The `dot(world, wd)` term is what makes the wave move *through* the meadow. Two sines at
non-integer frequency ratio keep it from looking metronomic. The per-blade offset `r2` stops
neighbours moving in lockstep.

Then bend by the **square** of height:

```glsl
local.xz += wd * gust * uWindStrength * (t * t) * height;
```

`t*t` keeps the root planted while the tip travels — the hinge that makes it read as a plant
rather than a swaying stick.

### Normals: the trick that sells it

A blade's true normal is its flat face. Light a field of those and you get a heap of glittering
shards. Tilt the normal most of the way toward **straight up** instead:

```glsl
vNormal = normalize(mix(vec3(0.0, 1.0, 0.0), faceNormal, 0.25));
```

Now the meadow shades like one soft surface lit from above — the ground it grows from — with
just enough face contribution to keep individual blades legible. (Ruderal's
`Vegetation.tsx` does exactly this, for exactly this reason.)

Two more terms do most of the remaining work:

- **Fake AO:** darken toward the root (`mix(0.55, 1.0, vHeight)`). Light doesn't reach down
  between blades.
- **Translucency:** grass is thin, so it *glows* when the sun is behind it —
  `pow(max(dot(N, -L), 0.0), 3.0)`. This single term is the biggest "oh, that looks real"
  moment in the module. Turn it to 0 and back to see.

---

## Build it

### 1. `src/client/scene/grassShader.ts`

The vertex shader in five labelled steps: locate the blade on the world lattice → fade by
distance → build the triangle → apply wind → set the normal. The fragment shader does albedo
gradient + AO + diffuse + translucency + fog blend.

Note `vFade` is multiplied into the blade's **height**, so distant blades sink into the ground
rather than popping out of existence, and the square patch becomes a disc.

### 2. `src/client/scene/Grass.tsx`

An `InstancedBufferGeometry` (one triangle + an `aCell` instanced attribute), the uniforms, and
the snapping in `useFrame`:

```ts
u.uCenter.value.set(
  Math.floor(camera.position.x / cell) * cell,
  Math.floor(camera.position.z / cell) * cell,
);
```

Watch which hook each control uses. `resolution` and `size` rebuild the geometry, so they use
`useControls` (re-renders). Everything else feeds a uniform every frame, so it uses
`useControlRef` (never re-renders) — dragging the wind slider must not re-render the scene.

`frustumCulled={false}` and an infinite bounding sphere, because the field is re-centred every
frame and a static bounding volume would be a lie.

### 3. `App.tsx`

Ground plane, fog, the grass, and the camera from 02B.

---

## Run & observe

```bash
pnpm dev
```

**Hold W and fly.** The grass never runs out. Fly for a full minute and it's still there,
costing exactly what it cost at the start.

Now dismantle it with the panel:

1. **Drop `resolution` to 60.** The trick becomes visible — a sparse disc of blades sliding
   along with you. Put it back to 320 and it's a meadow again.
2. **Set `jitter` to 0.** The grid appears instantly, in rows. This is why jitter exists.
3. **Set `translucency` to 0, then 3.** Watch the field go from flat to lit-from-within. Orbit
   so the sun is behind the grass for the full effect.
4. **Set `cameraFacing` to 0.** Turn on the spot and watch thin, shimmering patches appear where
   blades are edge-on. Set it to 1 and they all stare at you, which reads as unnervingly
   uniform. ~0.35 is the compromise.
5. **`windScale` to 0.02** — the whole field moves as one, like a flag. **To 1.2** — high-frequency
   chop. Around 0.2 gives you rolling gusts.
6. **Break the trick on purpose.** In `grassShader.ts`, change the hash input from `cellWorld` to
   `aCell`:
   ```glsl
   float r1 = hash21(aCell);   // ← instance-relative, not world
   ```
   Now fly. The meadow **boils** — every blade re-rolling its height and colour as the patch
   shifts. That's the failure the world-lattice hash exists to prevent, and it's worth seeing
   once.

---

## How real Ruderal does it

Ruderal's `packages/client/src/scene/Vegetation.tsx` is the *fixed-world* cousin of this. The
differences are all consequences of one design decision:

| | This module | Ruderal |
|---|---|---|
| Extent | infinite, camera-relative | one baked zone, finite |
| Placement | hashed grid, in the shader | CPU loop over voxel columns, placed where the surface block is `Grass` |
| Transform | computed per-vertex | `InstancedMesh` + `setMatrixAt`, `StaticDrawUsage` |
| Blade | 1 triangle | 2 crossed quads |
| Count | ~100,000 | 14,000 (`MAX_INSTANCES`) |

Ruderal can use `setMatrixAt` and never touch it again precisely *because* its world is finite
and known at load time — the grass is placed once, on real terrain, and stays there. The moment
you want an unbounded world, per-instance CPU matrices stop working and the position has to
move into the shader, which is what this module does.

The two share their most important lines, though. The sway:

```glsl
float swayPhase = float(gl_InstanceID) * 1.7;
float bend = position.y / 0.75;
transformed.x += sin(uTime * 1.4 + swayPhase) * 0.06 * bend;
```

...is this module's wind with a per-instance phase instead of a travelling wave. And the
comment above its geometry — *"normals point straight up so the grass shades like the ground it
grows from"* — is the normal trick, stated outright.

---

## Exercises

1. **Follow the terrain.** Sample a heightmap (or `fbm` from 09C) at the blade's world position
   and offset it vertically. Infinite grass over infinite rolling hills, still one draw call.
2. **Density map.** Multiply blade height by an `fbm` of world position so the meadow thins into
   patches and bare earth. Far more natural than uniform coverage.
3. **Two LOD rings.** Draw a dense inner field and a sparse outer one with taller, wider blades.
   Compare the triangle count in module 12F's stats panel.
4. **Interaction.** Pass the player position as a uniform and push blades away radially within a
   metre. Grass that parts as you walk through it is a five-line change.
5. **Curve the blade.** Give the geometry 3 segments (7 vertices) and bend it along an arc
   instead of translating the tip. More expensive, considerably prettier — measure the cost.

---

## Checkpoint

```bash
pnpm checkpoint 11B
pnpm dev
```

Files: `src/client/scene/grassShader.ts`, `src/client/scene/Grass.tsx`, `src/client/App.tsx`
(+ 02B's `debug/` and `controls/`).

**Next:** [`11C-bushes.md`](./11C-bushes.md) — the same ideas curved around a sphere, to grow
bushes worth putting in the meadow.
