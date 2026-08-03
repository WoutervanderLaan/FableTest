# 04D · Animation & scene composition

> **Goal:** make the loaded model move, and compose a whole scene without a
> voxel in it. Animation clips, the mixer, frame-rate-independent damping, and
> camera work — the parts of "a stunning scene" that aren't shaders.

**You'll build:** `src/client/scene/AnimatedCrate.tsx`, `src/client/scene/Composition.tsx`,
and an `App.tsx` that assembles the model-based path end to end.

---

## Concepts

### Animation

A glTF animation is three nested things, and the names matter because three's API mirrors
them exactly:

- **Keyframes** — a times array and a values array ("at t=2s this node's rotation is *q*").
- **A channel** — binds one keyframe track to one node's `position` / `rotation` / `scale`.
- **A clip** (`THREE.AnimationClip`) — a named bundle of channels: `"Spin"`, `"Walk"`, `"Idle"`.

**`AnimationMixer` is the playback engine.** It owns the clock, blends overlapping actions,
and writes results onto the object graph. You feed it `delta` once per frame:

```ts
useFrame((_state, delta) => mixer.update(delta));
```

An **action** (`mixer.clipAction(clip)`) is one playing instance of a clip, with its own
`timeScale`, loop mode, and weight. Crossfading two actions is how character animation works.

> **The binding gotcha.** A mixer drives *the exact object tree you gave it*. Because we clone
> per instance (Module 04B), each instance needs its **own** mixer bound to its **own** clone.
> One shared mixer animates one crate and leaves the rest frozen — and it's a confusing bug,
> because nothing errors.

Open `public/crate.gltf` and find the `animations` block: a sampler with `input: 4`
(the times accessor) and `output: 5` (the quaternions), and a channel targeting node 1's
`rotation`. Five keyframes, one full turn. That's the whole format.

### Frame-rate-independent damping

This is the one piece of real math in the module, and it's worth more than it looks.

The tempting way to smooth a value is:

```ts
current += (target - current) * 0.1;   // ✗ wrong
```

It looks fine at 60fps and is subtly broken: at 144fps it converges 2.4× faster, at 30fps half
as fast. Camera feel becomes a function of the player's monitor. The fix is exponential decay —
over a timestep `dt`, cover this fraction of the remaining distance:

```ts
const t = 1 - Math.exp(-lambda * dt);   // ✓ identical at any frame rate
camera.position.lerp(desired, t);
```

`lambda` is a rate in *e-folds per second* — higher is snappier. You'll meet this shape again
in Module 07's `control` factor and all through Part 4's interpolation.

### Composition

Two habits do most of the work:

- **Drive the camera by mutation, not state.** `useFrame` writing `camera.position` never
  triggers a React render. A `useState`-driven camera re-renders your whole subtree 60× a
  second.
- **Lay out with arithmetic.** A `<Ring>` helper placing N objects on a circle beats
  hand-positioning forty of them, and it gives you a knob to tune.

---

## Build it

### 1. `src/client/scene/AnimatedCrate.tsx`

One clone + one mixer per instance in a single `useMemo`, the action started in a `useEffect`,
and `mixer.update(delta)` in `useFrame`.

Watch the cleanup — there's a real TypeScript trap:

```ts
useEffect(() => {
  return () => {
    mixer.stopAllAction();   // braces required!
  };
}, [mixer]);
```

`stopAllAction()` **returns the mixer**, so writing `() => () => mixer.stopAllAction()` makes
the cleanup return a value, and React's `Destructor` type rejects it. A one-character habit
that costs ten minutes the first time.

### 2. `src/client/scene/Composition.tsx`

`damp(lambda, dt)`, a `smoothstep` for 0..1 curves, the `<CameraRig>` (eased orbit that lerps
*both* position and look-at target so nothing snaps), and the `<Ring>` layout helper.

### 3. `App.tsx`

Compose it: tiled ground, a hero PBR crate, the animated crate above it, a ring of five tinted
crates, and the camera rig. No `<Canvas>` camera controls, no voxels, no mesher.

---

## Run & observe

```bash
pnpm make-assets && pnpm dev
```

The camera drifts in a slow orbit and settles — never a snap, because both position and target
are damped. The beacon crate above the hero spins at 0.6× the authored speed. Five tinted
crates ring the center, all casting shadows into the golden-hour light.

Feel the math:

1. **Break damping.** Replace `damp(lambda, delta)` with a constant `0.1`, then throttle to
   4× CPU slowdown in DevTools → Performance. The camera visibly lags differently. Restore it
   and repeat — identical feel at any rate.
2. **Turn `lambda` up.** `lambda={12}` is snappy and a bit nervous; `lambda={0.6}` is dreamy
   and slow to arrive. This is the single most useful camera-feel knob you own.
3. **Share one mixer.** Hoist the mixer out of `AnimatedCrate` into a module-level singleton
   and render two of them. Only one spins — the binding gotcha, live.
4. **Reverse time.** `timeScale={-1}`.

---

## How real Ruderal does it

Ruderal has no `AnimationMixer` and no clips — with no authored models there's nothing to play.
Every moving thing is driven by code instead, and the two techniques you just learned are both
in there:

- **Damping is everywhere.** `packages/client/src/net/interpolation.ts` renders remote players
  ~120ms in the past and eases toward each snapshot; the husks in
  `packages/server/src/creatures.ts` steer with the same shape. Different purpose, same
  `1 - exp(-lambda*dt)` idea.
- **Animation-by-shader.** The grass in `packages/client/src/scene/Vegetation.tsx` sways via a
  vertex-shader patch with no CPU animation at all:

  ```glsl
  float swayPhase = float(gl_InstanceID) * 1.7;
  float bend = position.y / 0.75;          // 0 at the root, 1 at the tip
  transformed.x += sin(uTime * 1.4 + swayPhase) * 0.06 * bend;
  ```

  14,000 blades animating for the cost of one uniform update. That's the trade: a mixer gives
  you authored, art-directed motion; a shader gives you free motion on thousands of objects.
  Module 11 builds that exact shader.

**Part 1B complete.** You now have the full model-based path — load, texture, animate, compose.
If your goal is a hand-authored 3D world rather than a generated one, you can stop here and go
straight to **Part 3** for shaders; Parts 2 and 4 are the voxel and multiplayer paths.

---

## Exercises

1. **Crossfade.** Add a second clip to `crate.gltf` (copy the `Spin` sampler, change the
   values), then `action.crossFadeTo(other, 0.5, false)` on a keypress. That's character
   animation in miniature.
2. **A cinematic intro.** On mount, ease the camera from far above down to the rig's orbit over
   3 seconds using `smoothstep` on elapsed time. Then hand off to `CameraRig`.
3. **Damp a rotation.** Damping a quaternion needs `slerp`, not `lerp`. Make the hero crate
   turn to face the camera with `quaternion.slerp(target, damp(4, dt))`.
4. **Grid instead of ring.** Write a `<Grid cols rows spacing>` sibling to `<Ring>` and lay 25
   crates out. Then add per-instance jitter from a hash so it stops looking like a spreadsheet.

---

## Checkpoint

```bash
pnpm checkpoint 04D
pnpm make-assets
pnpm dev
```

Files: `src/client/scene/AnimatedCrate.tsx`, `src/client/scene/Composition.tsx`,
`src/client/App.tsx` (+ 04B/04C's loaders and scene files).

**Next:** [`05-voxel-data-model.md`](./05-voxel-data-model.md) — back to the main line, and the
generated world. Or jump to [`09-glsl-fundamentals.md`](./09-glsl-fundamentals.md) to start
Part 3 and make what you have here beautiful.
