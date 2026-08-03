# 07B · Physics with Rapier

> **Goal:** add a real rigid-body physics engine *alongside* the collider you
> just hand-wrote — and understand exactly why the player keeps using yours
> while the debris uses Rapier's.

**You'll build:** `src/client/physics/world.ts`, `src/client/scene/Debris.tsx`, and an
`App.tsx` running both systems at once.

---

## Concepts

You just wrote a collider by hand in Module 07 and it probably raised a fair question: **why,
when `@dimforge/rapier3d-compat` is already in `package.json`?**

The answer isn't "for the learning experience". It's a real architectural split, and the real
Ruderal makes exactly the same one:

| | The player | Everything else |
|---|---|---|
| **Solver** | `shared/collide.ts` (hand-rolled) | Rapier |
| **Why** | must be deterministic + shared with the server | must look right; nobody replays it |
| **Cost of being wrong** | desync, rubber-banding, cheating | a crate lands slightly differently |

**Determinism is the whole reason.** In Part 4 your client *predicts* your movement and the
server *confirms* it by running the same `stepPlayer` on the same voxels. If the two ever
disagree by a hair, you get rubber-banding. A general physics engine is the wrong tool for
that job: it's a black box of solver iterations, contact caching, and floating-point
accumulation, and cross-platform bit-exactness is explicitly not something it promises.

**But rigid-body dynamics is genuinely hard**, and there is no reason to write it yourself.
Tumbling, friction, restitution, angular momentum, stacking, continuous collision detection —
that's Rapier's job, and it's excellent at it.

So the rule is: **hand-roll what must be reproducible; delegate what must merely look good.**

> **If you're building single-player**, the determinism constraint disappears entirely — and
> with it the reason to hand-roll. Rapier's `KinematicCharacterController` is then a perfectly
> good way to move a player, and you'd skip most of Module 07's collider. Knowing *why* the
> constraint exists is what lets you make that call deliberately.

**Three Rapier ideas you need:**

1. **Bodies vs. colliders.** A *rigid body* has mass, position and velocity. A *collider* is
   the shape attached to it. Fixed bodies never move (the world); dynamic bodies are simulated.
2. **`ColliderDesc.voxels`** — Rapier ships a voxel shape. Cell `(ix,iy,iz)` spans
   `[ix, ix+1]·size`, which is **exactly** our block convention, so there's no offset to apply.
3. **Fixed timestep.** Rapier integrates assuming constant `dt`. Feed it raw frame deltas and
   the simulation goes jittery and frame-rate dependent — the same bug class as Module 04D's
   naive damping. Bank the elapsed time and run whole 1/60 steps.

**Only feed it the shell.** A solid block buried inside a hill can never be touched, so we only
hand Rapier voxels with at least one non-solid face neighbour. That's the same "only the
surface matters" insight the mesher is built on — and on a 64×40×64 world it's ~15k cells
instead of ~160k.

---

## Build it

### 1. `src/client/physics/world.ts`

`createPhysics(vw)` awaits `RAPIER.init()` (it loads a wasm module), makes a `World` with our
own `GRAVITY`, walks the voxels collecting shell coordinates, and creates one static collider:

```ts
world.createCollider(
  RAPIER.ColliderDesc.voxels(new Int32Array(coords), { x: 1, y: 1, z: 1 }),
);
```

Then `spawnBox` (dynamic body + cuboid collider, with `setCcdEnabled(true)` so a fast throw
can't tunnel through a wall — Rapier's answer to Module 07's substepping), `trimBodies` (cap
the debris count), and `stepPhysics` with the fixed-timestep accumulator.

### 2. `src/client/scene/Debris.tsx`

One `InstancedMesh` for every cube — N tumbling boxes for **one draw call** — with the
simulation's transforms copied into instance matrices each frame. All refs, no React state:
rigid bodies change 60× a second and routing that through state would re-render the tree every
frame for nothing.

Note the two lifecycle details: a `cancelled` flag (the wasm resolves asynchronously, and you
may unmount first) and `world.free()` on teardown, because the allocation lives on the wasm
side where the JS garbage collector can't reach it.

### 3. `App.tsx`

Add `<Debris world={world} />` next to `<PlayerController>`. Both read the **same**
`VoxelWorld` object, so the mesh you see, the surface you walk on, and the surface the crates
land on are guaranteed to agree.

---

## Run & observe

```bash
pnpm dev
```

Twelve crates rain down and settle onto the terrain — bouncing off slopes, wedging into
hollows, coming to rest. Walk around with WASD as before; the player still moves with your
own collider. **Press Q** to hurl a crate along your view direction. Throw one into a pit and
watch it tumble down.

Things to try:

1. **Feel the two systems.** Walk into a settled crate — you pass through it. The player
   collides with *voxels*, not with Rapier bodies. Making them interact means either giving the
   player a Rapier body (and losing determinism) or querying Rapier from your own collider.
   That trade is the whole lesson.
2. **Break the timestep.** In `stepPhysics`, replace the accumulator loop with a single
   `p.world.step()` per frame. Throttle the CPU in DevTools and watch gravity visibly change
   strength.
3. **Turn off CCD.** Remove `.setCcdEnabled(true)` and throw hard at a thin wall. Crates
   tunnel straight through.
4. **Feed it everything.** Delete the shell test so every solid voxel goes into the collider.
   Note the startup pause — that's ~160k cells instead of ~15k.

> **Watch the bundle.** `vite build` now warns about chunk size: Rapier's wasm is ~1MB. Real
> Ruderal **lazy-loads** it (`packages/client/src/scene/Debris.tsx` imports it dynamically) so
> players who never see debris never download the engine. Module 12F covers that.

---

## How real Ruderal does it

This module is a scaled-down `packages/server/src/physics.ts` — and the resemblance is
literal. Its `ZonePhysics` constructor builds the same shell-voxel array with the same
neighbour test, and creates the collider the same way:

```ts
const desc = RAPIER.ColliderDesc.voxels(new Int32Array(coords), { x: 1, y: 1, z: 1 })
  .setTranslation(VOXEL_OFFSET, VOXEL_OFFSET, VOXEL_OFFSET);
```

...where `VOXEL_OFFSET = 0`, with a comment noting the grid alignment was *verified
empirically by a physics probe test*. Two differences worth knowing:

- **Ruderal runs Rapier on the SERVER**, for thrown-block projectiles that must actually hit
  people (`packages/server/src/physics.ts`, with an `EventQueue` for collision events). The
  client runs Rapier too, but only for **cosmetic** collapse debris
  (`packages/client/src/scene/Debris.tsx`) — lazily imported.
- **The player never touches Rapier on either side.** `packages/shared/src/collide.ts` opens
  with the note that it is *"deliberately dependency-free… Rapier replaces or augments this in
  Phase 2, sharing the same WASM build client/server"* — and in practice it never did, because
  determinism won.

That's the division you just built, in production.

---

## Exercises

1. **Character controller.** Swap the player onto Rapier's
   `world.createCharacterController(0.01)` with a capsule collider. Compare the feel to your
   hand-rolled version — then note what you gave up (Part 4 prediction).
2. **Break blocks into debris.** After Module 08, spawn 3–4 small cubes at a block's position
   whenever you break one, tinted with `BLOCK_COLOR`. That's Ruderal's collapse effect, in ten
   lines.
3. **Wake the world up.** Rapier sleeps resting bodies to save time. Log
   `body.isSleeping()` for a settled crate, then throw another into it and watch it wake.
4. **Lazy-load it.** Convert the static `import RAPIER from "@dimforge/rapier3d-compat"` into
   a dynamic `await import(...)` inside `createPhysics`, and confirm with `vite build` that the
   wasm moved to its own chunk.

---

## Checkpoint

```bash
pnpm checkpoint 07B
pnpm dev
```

Files: `src/client/physics/world.ts`, `src/client/scene/Debris.tsx`, `src/client/App.tsx`
(+ Module 07's `shared/collide.ts`, `shared/movement.ts`, `PlayerController.tsx`).

**Next:** [`08-raycast-and-edit.md`](./08-raycast-and-edit.md) — break and place blocks.
