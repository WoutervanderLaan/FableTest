# 09B · Shader math I — the toolkit

> **Goal:** build the vocabulary every later shader is written in. Eight panels,
> eight ideas, one quad each — then the same maths in 3D as a hand-written lit
> sphere. After this, modules 10, 11 and 12D read as sentences instead of spells.

**You'll build:** `src/client/scene/ShaderLab.tsx` and an `App.tsx` that lays it out.

---

## Concepts

Module 09 taught you the *plumbing* — attributes, uniforms, varyings, the vertex→fragment
pipeline. This module teaches the **maths that fills it in**.

A fragment shader is one function, run in parallel for every pixel:

```
(coordinate) → (colour)
```

It gets no memory of other pixels, no loops over the scene, no state. Everything you'll ever
do is: take a coordinate, transform it with arithmetic, and map the result to a colour. What
follows is the arithmetic.

### The eight tools

**1. UV space.** The domain. A unit square, `(0,0)` to `(1,1)`, interpolated across the
surface. Visualise it as `col = vec3(uv, 0.0)` and you can *see* orientation — red rises with
x, green with y. Every other panel operates on this square.

**2. `step` vs `smoothstep`.** `step(edge, x)` is a hard cliff: 0 below, 1 above. It aliases
horribly, because a pixel is either fully in or fully out. `smoothstep(a, b, x)` ramps between
two edges along an ease-in-out curve. **It is the most used function in shader work** — every
antialiased edge, soft mask and gradient falloff is a `smoothstep`.

Worth knowing what it actually computes: clamp `x` into `0..1` between the edges, then apply
`t*t*(3-2t)` — a cubic that's flat at both ends. That polynomial shows up again as the
interpolant inside value noise in 09C.

**3. `mix`.** Linear interpolation: `mix(a, b, t) = a + (b-a)*t`. Two colours and a 0..1 knob
gives you every gradient. Nest them and you have a whole palette ramp.

**4. Distance fields.** `length(uv - centre)` is the distance to a point. Threshold it and you
have a circle — but **keep the distance** and you get rings, glows and outlines for free,
because you know not just *whether* you're inside but *how far*. This is the seed of the SDF
work in 09C.

**5. Polar coordinates.** `atan(p.y, p.x)` gives an angle, `length(p)` a radius. Swapping
cartesian for polar turns stripes into spokes and grids into rings. It's a change of *domain*,
not of maths — the same `sin` that made a wave now makes a starburst.

**6. Waves.** `sin` is your oscillator: `amplitude * sin(frequency * x + phase)`. Multiply the
input for frequency, add `uTime` for animation, scale the output for amplitude. Note the idiom
`0.5 + 0.5*sin(...)` — `sin` returns `-1..1` and colours want `0..1`.

**7. `fract` — repetition.** `fract(x)` keeps the fractional part, so `fract(uv * 4.0)` tiles
the unit square four times. Pair it with `floor(uv * 4.0)` — which cell am I in — and you can
make grids, bricks and checkers with no extra geometry. **`fract` gives you the position
within a cell; `floor` gives you the cell's identity.** That pairing is the backbone of noise.

**8. Curves.** `pow(x, k)` reshapes a 0..1 ramp: `k > 1` eases in, `k < 1` eases out. This is
not an abstraction — it's literally the `pow(h, 0.65)` horizon bias and `pow(dot, 6.0)` sun
tightness you'll write in Module 10.

### The same maths in 3D

The lit sphere at the top uses no lights and no `MeshStandardMaterial` — just three dot
products:

```glsl
float diffuse  = max(dot(N, L), 0.0);            // how much this point faces the light
float specular = pow(max(dot(N, H), 0.0), 48.0); // how close to a mirror bounce
float fresnel  = pow(1.0 - max(dot(N, V), 0.0), 3.0); // how edge-on the surface is
```

**`dot(a, b)` between unit vectors is the cosine of the angle between them** — 1 when aligned,
0 at right angles, negative when opposed. That single fact is most of real-time lighting.
`max(..., 0.0)` discards the back side. `pow` sharpens: raising a cosine to 48 keeps only the
narrow region near perfect alignment, which is what makes a highlight *tight*.

`H = normalize(L + V)` is the **half-vector** — the direction exactly between the light and
your eye. A surface facing it bounces light straight at you. (This is Blinn-Phong; it's a
cheaper approximation of reflecting `L` about `N`.)

> **View space matters.** `vViewPos` is the position with the camera at the origin, so the view
> direction is simply `normalize(-vViewPos)`. Doing lighting in view space saves you passing a
> camera-position uniform.

---

## Build it

### 1. `src/client/scene/ShaderLab.tsx`

The infrastructure first: one `VERT` (pass `uv` through), one `PREAMBLE` (uniforms, the
palette, a `plot()` helper for drawing curves), and `makeLabMaterial(body, extraHeader)` which
wraps a fragment *body* into a complete shader. Then the `PANELS` array — each entry is a name
and a few lines of GLSL that set `col`.

> **A JavaScript trap worth meeting once:** you cannot use a backtick inside a template
> literal. Writing ``// `t` is the thickness`` in a GLSL comment silently ends the string and
> produces a baffling TypeScript syntax error dozens of lines later.

Finally `LitSphere` with its own vertex/fragment pair for the 3D half.

### 2. `App.tsx`

A flat camera, a dark background, the 4×2 grid, and the sphere above it. No voxels, no
`PlayerController` — like Module 09, we step out of the world to study one thing.

---

## Run & observe

```bash
pnpm dev
```

Eight panels and a sphere lit entirely by dot products. Read each panel against its code — the
point is to connect *the maths you see* to *the lines that made it*.

Then start turning knobs; this module is meant to be played with:

1. **Swap `smoothstep` for `step`** in panel 2's soft half. Watch the edge get jagged. Now put
   it back and narrow the edges to `smoothstep(0.49, 0.51, uv.x)` — an antialiased hard edge,
   which is what you actually want most of the time.
2. **Change the frequency** in panel 6 from `12.0` to `40.0`, then to `3.0`.
3. **Move the specular exponent** in `LitSphere` from `48.0` to `4.0` (wide, plasticky) and
   `512.0` (a tiny glint). That one number is "how polished is this surface".
4. **Delete the fresnel term.** The sphere immediately looks flatter and more like a
   billiard ball. Rim light is most of what sells a material as *not plastic*.
5. **Break the checker.** In panel 7 change `max(lx, ly)` to `min(lx, ly)` — the grid collapses
   to dots at the corners, because now you're asking for pixels near *both* edges at once.

---

## How real Ruderal does it

Everything on this wall is used, more or less verbatim, in the shaders you're about to write:

- **`SkyAndLight.tsx`** (Module 10) is panels 3 and 8 plus one dot product:
  `mix(horizon, zenith, pow(vDir.y, 0.65))` for the gradient, and
  `pow(max(dot(vDir, sunDir), 0.0), 6.0)` for the sun glow. That's *it* — a whole convincing
  sky out of `mix`, `pow` and `dot`.
- **`materials.ts`** (Module 11) uses `floor` to snap a world position into its voxel cell —
  panel 7's `floor`/`fract` pairing, doing real work:
  ```glsl
  vec3 cell = floor(vJPos - vJNorm * 0.5) + 0.5;
  ```
- **`Vegetation.tsx`** (Module 11) is panel 6, in the vertex shader:
  ```glsl
  transformed.x += sin(uTime * 1.4 + swayPhase) * 0.06 * bend;
  ```
  ...where `bend = position.y / 0.75` is a 0-at-the-root, 1-at-the-tip ramp — a gradient used
  as a *mask*, exactly like panel 3.

The real files aren't more advanced than this wall. They're these tools, chosen well.

---

## Exercises

1. **A ninth panel.** Add one that draws a rounded rectangle using
   `length(max(abs(p) - b, 0.0))`. You've just derived the box SDF that 09C hands you.
2. **Antialias by derivative.** Replace a fixed `smoothstep` width with `fwidth(x)`, which
   reports how fast a value changes per pixel. Now your edges stay one pixel wide at any zoom.
3. **Plot your own easing.** Add `pow(x, 3.0)`, `1.0 - pow(1.0 - x, 3.0)` and
   `x < 0.5 ? 4.0*x*x*x : 1.0 - pow(-2.0*x + 2.0, 3.0)/2.0` to panel 8 and compare the curves.
4. **Toon shading.** In `LitSphere`, quantise the diffuse term: `floor(diffuse * 4.0) / 4.0`.
   One line turns a smooth material into cel shading — and shows you banding, which 09C fixes
   with dithering.

---

## Checkpoint

```bash
pnpm checkpoint 09B
pnpm dev
```

Files: `src/client/scene/ShaderLab.tsx`, `src/client/App.tsx`.

**Next:** [`09C-shader-math-noise-sdf.md`](./09C-shader-math-noise-sdf.md) — hashing, noise,
domain warping and signed distance fields: where shaders start looking like nature.
