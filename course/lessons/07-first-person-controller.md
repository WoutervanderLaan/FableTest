# 07 · First-person controller

> **Goal:** get inside the world. Pointer-lock mouselook, WASD movement, gravity,
> jumping, and solid collision against the voxels — built on a `stepPlayer`
> function that (this is the important part) the server will run unchanged in
> Part 4.

**You'll build:** `src/shared/collide.ts`, `src/shared/movement.ts`,
`src/client/PlayerController.tsx`, `src/client/ui/Hud.tsx`.

---

## Concepts

Movement splits cleanly into two layers, and the split is deliberate:

**1. `stepPlayer` (shared) — the physics.** Given a player's state and one input sample
(move direction, jump, run, `dt`), it applies acceleration, gravity, and jumping, then asks
the collider to move-and-resolve. It's pure `src/shared/` code with **no camera, no
keyboard, no Three.js** — just math on numbers. That purity is why the same function can be
the client's prediction *and* the server's authority later. Burn this in: **input in, new
state out, no I/O.**

**2. `PlayerController` (client) — the I/O.** It reads the mouse (pointer lock) and keyboard,
turns them into an `InputSample`, calls `stepPlayer`, and points the R3F camera at the
result. It owns *zero* physics math.

**Collision = axis-separated AABB sweep.** The player is a box. We move it one axis at a
time and, after each axis, push it back out of any solid voxel it entered. Doing axes
separately is what lets you *slide* along a wall instead of stopping dead. We **substep**
(cap movement per step) so a fast fall can't teleport through a 1-block floor.

**Pointer lock** is the browser API that hides the cursor and gives you raw
`movementX/movementY` deltas — mandatory for mouselook. You request it on a click; the OS
hands control back on `Esc`.

**Camera order `YXZ`** means "yaw around world-up first, then pitch." It's the correct order
for an FPS camera — roll stays zero and looking around feels right. WASD is rotated by the
current yaw so "forward" is always where you're facing.

---

## Build it

### 1. `src/shared/collide.ts`

`PLAYER` dimensions, `moveWithCollisions(...)` (the substepped axis sweep), and a private
`collides()` AABB test. Type it from the checkpoint and read the three axis blocks — each
resolves a penetration by snapping the box to the block face and zeroing that axis's
velocity. The `inWater` check at the end feeds swimming.

### 2. `src/shared/movement.ts`

The speed/gravity constants, the `InputSample` and `PlayerPhys` shapes, and `stepPlayer`.
Note two feel details: the `control` factor makes ground movement snappy and air movement
floaty (air control), and inputs are clamped to `MAX_INPUT_DT` so one lag spike can't fling
you across the map. It **mutates `p` in place** — cheap, and handy for the loops that call it.

### 3. `src/client/PlayerController.tsx`

All mutable state lives in **refs** (`phys`, `yaw`, `pitch`, `keys`) so the component never
re-renders during play — the render loop is `useFrame`, not React state. A `useEffect` wires
the pointer-lock/mouse/keyboard listeners once. Each frame:

```ts
// rotate WASD into world space by yaw, call the shared step, move the camera
if (k.has("KeyW")) { dx -= sinY; dz -= cosY; }   // forward = camera's -Z
// ...A/S/D...
stepPlayer(world, phys.current, { dx, dz, dt: delta, jump, run });
camera.position.set(p.x, p.y + PLAYER.eyeHeight, p.z);
camera.rotation.y = yaw.current;
camera.rotation.x = pitch.current;
```

It returns `null` — it renders nothing, it just drives the camera. Full file in the
checkpoint.

### 4. `src/client/ui/Hud.tsx`

A DOM crosshair + controls hint, layered over the canvas with `pointerEvents: none` so
clicks fall through to trigger pointer lock. Plain HTML, no 3D.

### 5. `App.tsx`

Generate the world **once** and share the *same* object with both the mesh and the
controller — collide against exactly what you see. Compute a spawn at the surface of the
world center. See the checkpoint.

---

## Run & observe

```bash
pnpm dev
```

Click the canvas to lock the mouse. Look around; **WASD** to walk, **Space** to jump,
**Shift** to run, **Esc** to release. You can climb hills, get blocked by stone walls, slide
along them, and fall (with gravity) off ledges. Walk into water and you bob/sink instead of
walking — that's the `swimming` branch.

Feel the tuning: sprint down a slope, jump at the top of a rise. Then open `movement.ts` and
change `JUMP_VELOCITY` to `14` or `GRAVITY` to `9` and re-feel it. This is where "game feel"
lives.

---

## How real Ruderal does it

`packages/shared/src/movement.ts` **is** your `movement.ts` — identical constants, identical
`stepPlayer` signature, same `control`/`MAX_INPUT_DT` tricks. `packages/shared/src/collide.ts`
is your collider almost line-for-line. And `packages/client/src/player/PlayerController.tsx`
is your controller with more on top: it feeds the same `stepPlayer` but wraps it in client
prediction and server reconciliation (Module 17). The reason the real controller can predict
movement locally and have the server confirm it later is *exactly* the shared-`stepPlayer`
discipline you just followed. You've now built the single most reused function in the whole
project.

---

## Exercises

1. **Fly mode.** Add a `noclip` toggle (a key) that skips gravity and collision (move the
   position directly). Great for exploring; also shows what the collider was buying you.
2. **Head bob.** Add a subtle vertical sine to the camera based on horizontal speed. Small
   change, big feel.
3. **Coyote time.** Allow a jump for ~100ms after leaving the ground. (Track "time since
   grounded".) A classic platformer nicety.
4. **Third person.** Pull the camera back along `-forward` by a few blocks and look at where
   the player *would* be. You'll immediately want a visible player model — which is exactly
   what remote players get in Part 4.

---

## Checkpoint

```bash
pnpm checkpoint 07
pnpm dev
```

Files: `src/shared/collide.ts`, `src/shared/movement.ts`,
`src/client/PlayerController.tsx`, `src/client/ui/Hud.tsx`, `src/client/App.tsx`.

**Next:** [`08-raycast-and-edit.md`](./08-raycast-and-edit.md) — break and place blocks. Or take
the detour through [`07B-rapier-physics.md`](./07B-rapier-physics.md) *(optional)* for rigid-body
physics, and why the player you just built deliberately isn't using it.
