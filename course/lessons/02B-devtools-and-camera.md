# 02B · Devtools — a debug panel & an inspection camera

> **Goal:** stop editing constants and reloading. Build a selection-aware debug
> panel where adding a tweakable value is one line, and a camera you can orbit,
> pan, zoom and fly — so you can actually *look* at what you're building.

**You'll build:** `src/client/debug/` (store, `useControls`, panel, `<Selectable>`) and
`src/client/controls/CameraControls.tsx`.

---

## Why this module comes early

Everything after this point has numbers in it: wind strength, blade count, sway frequency,
noise scale, sun angle. There are two ways to find good values.

1. Edit a constant, save, wait for reload, look, repeat. ~5 seconds per attempt.
2. Drag a slider and watch it change. ~0 seconds per attempt.

The second way isn't just faster, it's *qualitatively different* — you stop guessing and start
exploring, and you find values you'd never have typed. Every serious 3D project has a panel
like this, and the cost of building one is about an hour. Do it now and every later module pays
you back.

The same goes for the camera. Inspecting a bush from underneath, or checking whether grass
tiles seamlessly, is impossible with a fixed camera.

> **Isn't there a library for this?** Yes — `lil-gui` (what Bruno Simon's Three.js Journey
> uses), `tweakpane`, and `leva` (the React/R3F-native one) all do the panel; drei's
> `<OrbitControls>` does the camera. Use them in a real project. We build both here because
> the panel is ~200 lines of plain React, the camera is the single most reusable piece of 3D
> interaction code there is, and the *selection-aware* behaviour you actually want is custom
> either way. Same reasoning as the drei note in the syllabus.

---

## Concepts

### The store lives outside React

A slider drag fires continuously. If each change went through `useState`, React would re-render
your scene tree dozens of times a second, and your render loop would be competing with the
reconciler.

So the values live in a plain module-level store with a subscribe/snapshot pair. React
components that *need* to re-render subscribe via `useSyncExternalStore`; the render loop reads
`debugStore.get()` directly and re-renders nothing. That's why there are **two** hooks:

| Hook | Re-renders? | Use for |
|---|---|---|
| `useControls(group, schema)` | yes, on change | values React renders — colors passed as props, counts, toggles that add/remove objects |
| `useControlRef(group, schema)` | **never** | values you feed to a uniform or mutate in `useFrame` |

Getting this split right is the difference between a debug panel that helps and one that tanks
your frame rate.

### The API has to be one line

This is the whole design constraint:

```ts
const { strength } = useControls("Wind", {
  strength: { type: "number", value: 0.4, min: 0, max: 2, step: 0.01 },
});
```

Declare it next to the code that uses it. If registering a knob takes more ceremony than that,
you won't bother — and you'll be back to editing constants.

### Selection-aware panels

Ten tunable objects × ten knobs each is a hundred sliders. Unusable. Instead each object
registers its own **group**, and the panel shows only the selected one.

Selection is delightfully cheap, because R3F raycasts for you: wrap an object in
`<Selectable group="Grass">` and its `onClick` sets the selected group. The one detail that
matters is `e.stopPropagation()` — without it a click passes through to everything behind the
object you hit, and the furthest one wins.

### The camera: spherical coordinates around a target

Orbit controls are just a point plus three numbers:

```
target   the point we orbit and look at
radius   distance from target      ← wheel
theta    azimuth, around Y         ← horizontal drag
phi      polar angle from +Y       ← vertical drag
```

The position is *derived* each frame, never stored:

```ts
x = target.x + r * sin(phi) * sin(theta)
y = target.y + r * cos(phi)
z = target.z + r * sin(phi) * cos(theta)
```

Three details separate "works" from "feels right":

- **Clamp `phi` just inside `0..PI`.** Exactly at a pole the camera's up-vector is undefined and
  the view flips — the classic gimbal snap.
- **Zoom multiplicatively:** `radius *= exp(deltaY * 0.001)`. Additive zoom crawls when you're
  far away and overshoots when you're close; multiplicative feels identical at every scale.
- **Scale panning by radius.** A drag should move the world about the same number of *pixels*
  whether you're zoomed in or out.

### Damping is the thing that makes it feel good

Every input writes to a **desired** value. Every frame the **current** value eases toward it:

```ts
const t = 1 - Math.exp(-lambda * dt);
current += (desired - current) * t;
```

Not `current += (desired - current) * 0.1`. The naive version converges 2.4× faster at 144fps
than at 60fps, so your camera feel depends on the player's monitor. `lambda` is a rate in
e-folds per second: 9 is responsive, 2–3 is cinematic.

---

## Build it

### 1. `src/client/debug/store.ts`

Groups, values, listeners, and a selected group. Two subtleties worth reading:

- **Defaults never clobber.** Re-registering a group keeps values you've already dragged, so a
  hot reload doesn't reset your tuning.
- **The `token` guard on `unregister`.** React StrictMode mounts effects twice, and hot reload
  remounts constantly. Without the token, a remount's cleanup deletes the group its own
  re-registration just created, and your controls vanish.

### 2. `src/client/debug/useControls.ts`

The two hooks above. Note that registration is keyed on the group name plus the *field names*,
not the schema object's identity — a schema literal is a new object every render, so keying on
identity would re-register infinitely.

### 3. `src/client/debug/DebugPanel.tsx` and `Selectable.tsx`

Plain DOM over the canvas: group tabs, then a row per control (range / checkbox / color /
select). `<Selectable>` is nine lines.

### 4. `src/client/controls/CameraControls.tsx`

Pointer handlers for orbit/pan/dolly, a key set for WASD/QE, and one `useFrame` that applies
keyboard movement, damps everything, and derives the camera position. Exports `damp()`, which
later modules reuse.

Two robustness details you'd otherwise debug later: `setPointerCapture` so a drag continues when
the pointer leaves the canvas, and clearing the key set on `window.blur` so alt-tabbing
mid-move doesn't leave you gliding forever.

---

## Run & observe

```bash
pnpm dev
```

A cube, a knot and a ground plane, with a panel top-right.

1. **Drag** to orbit, **right-drag** (or shift-drag) to pan, **wheel** to zoom, **WASD** to fly,
   **Q/E** for down/up, **shift** to go faster.
2. **Click the knot in the 3D view.** The panel switches to its controls — that's the raycast
   selection working.
3. **Drag `roughness`** to 1 and watch the knot go matte in real time. No reload.
4. **Untick `visible`** on the knot. It disappears — that control is a React re-render, which is
   exactly why it uses `useControls` and not `useControlRef`.
5. **Set `lambda` low.** Change `<CameraControls lambda={2} />` and feel the camera become
   floaty and cinematic; `lambda={20}` is almost instant. That one number is the entire "feel"
   of your camera.

---

## How real Ruderal does it

Ruderal has **no debug panel** — its tuning constants are edited in source
(`packages/shared/src/movement.ts` is a wall of them: `WALK_SPEED`, `JUMP_VELOCITY`, `GRAVITY`).
That's a defensible choice for values that must be *identical on client and server*: a slider
that changes `GRAVITY` on one machine would desync the simulation instantly (Module 07 and
Part 4).

So the rule this module implies is a real one: **tune presentation with sliders, keep simulation
constants in source.** Wind strength, colours, blade counts and noise scales are presentation —
tune them live. Movement physics is shared authority — leave it in a file where both sides read
the same number.

Ruderal's camera is also the opposite of this one: `packages/client/src/player/PlayerController.tsx`
is a first-person pointer-lock camera driven by the shared movement step (Module 07). This
module's camera is a *tool* for inspecting things you're building, not a camera for playing
through. Most projects want both.

---

## Exercises

1. **A vector control.** Add `type: "vec3"` rendering three sliders, and use it to position the
   directional light.
2. **Persist the tuning.** Write values to `localStorage` on change and read them at
   registration. Now your tuning survives a reload — and you can copy the JSON into source when
   you're happy.
3. **A "copy values" button.** Serialize the selected group to the clipboard as a code snippet.
   This is how you graduate a slider into a constant.
4. **Focus on selection.** Make clicking an object also ease `CameraControls`' target to that
   object's position. (You have `damp` already; this is ~10 lines and feels magical.)
5. **A monitor, not a control.** Add a read-only row type that displays a live value each frame
   (FPS, instance count) without a slider. Module 12F's `renderer.info` readout is the obvious
   client.

---

## Checkpoint

```bash
pnpm checkpoint 02B
pnpm dev
```

Files: `src/client/debug/store.ts`, `src/client/debug/useControls.ts`,
`src/client/debug/DebugPanel.tsx`, `src/client/debug/Selectable.tsx`,
`src/client/controls/CameraControls.tsx`, `src/client/App.tsx`.

**Next:** [`03-geometry-by-hand.md`](./03-geometry-by-hand.md) — back to the main line, building
meshes from raw buffers. You'll want these sliders shortly: modules
[`11B`](./11B-infinite-grass.md) and [`11C`](./11C-bushes.md) are built almost entirely by
tuning against this panel.
