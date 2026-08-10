# 09 · GLSL fundamentals

> **Goal:** understand how the GPU actually draws — the vertex → fragment
> pipeline — and write your first `ShaderMaterial` from scratch. We step out of
> the voxel world for one module to learn on a single object, then bring shaders
> back in Module 10.

**You'll build:** a shader playground `App.tsx`.

---

## Concepts

Every pixel Three.js draws is the output of **two tiny programs that run on the GPU**,
written in **GLSL**:

1. **The vertex shader** runs once per vertex. Its job: set `gl_Position` (where this vertex
   lands on screen). It runs in massive parallel — thousands of vertices at once.
2. **The fragment shader** runs once per pixel the triangle covers. Its job: set
   `gl_FragColor` (this pixel's color). Millions of invocations per frame.

Data reaches them three ways — this is the whole mental model:

| Kind | Varies per… | Set by | Example |
|---|---|---|---|
| **attribute** | vertex | geometry | `position`, `uv`, `normal`, our `color` |
| **uniform** | draw call (constant across it) | JS | `uTime`, matrices, `cameraPosition` |
| **varying** | fragment (interpolated) | vertex shader → fragment shader | `vUv`, `vPos` |

A **varying** is the bridge: the vertex shader writes it at each corner, the GPU smoothly
interpolates it across the triangle, and the fragment shader reads the blended value. That
interpolation is where most shader magic comes from — gradients, wave phases, fresnel.

Three.js gives you built-ins for free in a `ShaderMaterial`: the attributes `position`,
`uv`, `normal`; the uniforms `modelMatrix`, `viewMatrix`, `projectionMatrix`,
`modelViewMatrix`, `cameraPosition`. The canonical vertex line —
`gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0)` — is just "take the
local vertex, move it into the world, into the camera's view, and project it to the screen."

---

## Build it

Replace `App.tsx` with a playground (your world files stay on disk, unused, until Module 10).
Full file in the checkpoint; the shape:

- Two GLSL strings (`vertexShader`, `fragmentShader`) as tagged `/* glsl */` template
  literals (the comment tag lights up GLSL syntax highlighting in most editors).
- A `THREE.ShaderMaterial` built in `useMemo` with `uniforms: { uTime: { value: 0 } }`.
- `useFrame` bumps `material.uniforms.uTime.value = clock.elapsedTime` and spins the mesh.
- A `<torusKnotGeometry>` to show the shading wrap around a curvy surface.

The fragment shader does two teachable things:

```glsl
vec3 col = mix(amber, teal, vUv.y);              // gradient from a varying (uv)
float bands = 0.5 + 0.5 * sin(vPos.y*8.0 - uTime*2.0); // animation from a uniform
col *= 0.55 + 0.45 * bands;
```

That's a uniform (`uTime`) driving a varying (`vPos`) to make something move — the seed of
every animated shader you'll ever write.

---

## Run & observe

```bash
pnpm dev
```

A slowly rotating knot, amber at the bottom fading to teal at the top, with bright bands
crawling upward. No lights in the scene — a `ShaderMaterial` doesn't know what a light *is*
unless you write that math yourself. That's the tradeoff: total control, zero conveniences.

Play in the fragment shader (hot reload is instant):
- `col = vec3(vUv, 0.0);` — visualize the uv coordinates directly (red = u, green = v).
- `col = vPos * 0.5 + 0.5;` — visualize local position as color (shifted into 0..1 range).
- Change `sin(... - uTime*2.0)` to `+uTime*6.0` — faster bands, reversed direction.

---

## How real Ruderal does it

The sky in `packages/client/src/scene/SkyAndLight.tsx` is exactly this: a `ShaderMaterial`
with a hand-written vertex + fragment shader (`SKY_VERT` / `SKY_FRAG`). You'll rebuild it
next module. Ruderal uses raw `ShaderMaterial` where it wants total control (the sky) and
`onBeforeCompile` patches where it wants Three.js's lighting *plus* a tweak (the voxel
surface, the grass) — that's Module 11. Knowing which tool to reach for is half of shader
work; you now have the first one.

---

## Exercises

1. **Radial gradient.** Color by distance from center: `length(vUv - 0.5)`.
2. **Two-uniform control.** Add a `uColor` uniform (a `vec3`) and drive it from a React state
   / color picker in the DOM. Feel the JS↔GLSL uniform channel.
3. **Pulse.** Scale the mesh in the *vertex* shader:
   `transformed... ` — actually, multiply `position` by `1.0 + 0.1*sin(uTime)` before the
   projection line. Displacement lives in the vertex shader.
4. **Rings.** `float r = fract(length(vPos.xy)*3.0 - uTime); col *= step(0.5, r);` — hard
   rings marching outward. Swap `step` for `smoothstep` to soften them.

---

## Checkpoint

```bash
pnpm checkpoint 09
pnpm dev
```

Files: `src/client/App.tsx`.

**Next:** [`09B-shader-math-toolkit.md`](./09B-shader-math-toolkit.md) — the maths the rest of
Part 3 is written in (`smoothstep`, `mix`, dot products, noise). Strongly recommended before
module 10, but you can also go straight to
[`10-sky-shader.md`](./10-sky-shader.md) and put a real shader sky over the world.
