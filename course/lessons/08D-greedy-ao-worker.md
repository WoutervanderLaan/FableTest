# 08D · Greedy meshing, ambient occlusion & a web worker *(deep-dive)*

> **Optional.** Skip on a first pass — Part 3 doesn't depend on it. Come back
> when you want the mesher to feel professional: shadable corners (AO), instant
> edits (chunks), and a main thread that never stutters (a worker).
>
> **Goal:** upgrade the naive mesher into something close to the real Ruderal:
> ambient occlusion baked into vertices, the world split into chunks so edits
> re-mesh only what changed, and all meshing moved off the main thread into a
> web worker.

**You'll build:** `src/shared/chunkMesher.ts`, `src/worker/mesher.worker.ts`,
`src/client/WorldManager.ts`, and edit-path updates to `PlayerController.tsx` / `App.tsx`.

---

## Concepts

Three independent upgrades, each worth understanding on its own.

### 1. Ambient occlusion (AO)

Real surfaces get darker where geometry crowds them — inside corners, tight crevices. For
voxels there's a beautifully cheap approximation: for each face **vertex**, look at the three
blocks touching that corner on the open side, and darken proportionally to how many are
solid. That's it — a handful of neighbor lookups per face, multiplied into the vertex color
we're already computing.

```
ao(side1, side2, corner) = (side1 && side2) ? 0 : 3 - (side1 + side2 + corner)   // 0..3
```

The subtle part is mapping each of a face's 4 vertices to the *right* three neighbors. The
checkpoint derives the neighbor offsets **from the same corner offset used for the vertex
position**, so they can't drift out of sync — a common source of "why is my AO checkerboarded"
bugs. There's also the standard **diagonal flip**: split each quad along the diagonal that
keeps the two darkest corners together, so AO gradients don't look lopsided.

AO is most of the visual jump from "flat Lego" to "chunky, sculpted" voxels. It costs almost
nothing.

### 2. Chunks

Meshing the whole world per edit (Module 08) is O(world). Instead, split the world into
**32³ chunks**, each its own mesh. An edit only dirties its chunk — and, if it's on a chunk
border, the neighbor chunk (whose faces/AO depend on it). Re-meshing one 32³ box is trivial;
re-meshing the world is not. This is what makes building feel instant on a large map.

### 3. A web worker

Meshing is pure number-crunching with zero DOM needs — the textbook case for a **web
worker**. Move it off the main thread and even a big re-mesh never drops a frame of
rendering or input. This is the real reason the mesher has lived in `src/shared/` with no
Three.js imports since Module 06: engine-free code is code you can run in a worker.

The worker keeps its **own copy** of the voxel volume (synced by tiny `edit` messages) so it
can mesh any chunk on demand without shipping the whole world across the thread boundary each
time. Results come back as **transferred** typed arrays — a zero-copy handoff, not a clone.

---

## Build it

### 1. `src/shared/chunkMesher.ts`

`meshChunk(w, cx, cy, cz)` — the Module 06 loop, restricted to one chunk's cells (but reading
neighbors globally via `getVoxel`, so chunk borders mesh correctly), plus the AO computation
and diagonal flip above. Reuses the `MeshData` type from `mesher.ts`. Read the AO block
closely; everything else is familiar.

### 2. `src/worker/mesher.worker.ts`

A tiny message loop: `init` (store a copy of the volume), `edit` (keep the copy in sync),
`mesh` (run `meshChunk` and post the four arrays back, transferring their buffers). It uses a
narrowed `self` cast to sidestep DOM-vs-WebWorker type clashes. Vite compiles it to its own
bundle because our `vite.config.ts` sets `worker.format: "es"` — no extra config needed.

### 3. `src/client/WorldManager.ts`

A plain class (not a component) that owns a `THREE.Group` of per-chunk meshes, spins up the
worker, requests every chunk on start, and builds/updates a mesh as each chunk comes back.
`applyEdit` updates both worlds (main + worker) and re-requests the dirty chunk(s). It's
imperative on purpose: chunk meshes churn far too fast to route through React.

### 4. Wire it in

`PlayerController` swaps its `setVoxel + onEdit` for a single `edit(x,y,z,b)` callback;
`App.tsx` creates the `WorldManager`, drops `wm.group` into the scene with one
`<primitive>`, and passes `wm.applyEdit` as that callback. See the checkpoint.

---

## Run & observe

```bash
pnpm dev
```

Two things to notice:

- **AO.** Inside corners, under trees, and where blocks stack now sink into soft shadow. The
  world looks carved, not printed. Compare against Module 08 side by side.
- **Instant edits.** Mine and place as fast as you can — no hitch. Open DevTools →
  Performance and confirm the long meshing tasks are on a **worker** thread, not the main
  one. The frame rate holds because the main thread is only building a small geometry from
  arrays the worker already computed.

Dig a deep pit at a chunk boundary (multiples of 32) and watch both adjacent chunks update —
that's the border-neighbor re-mesh doing its job.

---

## How real Ruderal does it

This module is a scaled-down `packages/client/src/world/WorldManager.ts` +
`packages/client/src/worker/mesher.worker.ts` + `packages/shared/src/mesher.ts`. The real
system adds:

- **Greedy meshing** — `mesher.ts` merges adjacent coplanar faces of the same color *and*
  AO into single large quads, cutting vertex counts dramatically. (It keeps AO in the vertex
  color precisely so merges can compare it — which is why our AO lives there too.) Extending
  `meshChunk` to greedily merge is the natural next exercise; the real file is your
  reference.
- **A worker pool** (2–4 workers) with jobs **sorted by distance** from the player, so nearby
  chunks appear first.
- **`matrixAutoUpdate = false`** and careful disposal on chunks that never move — small perf
  wins at scale.

You now understand every idea in that pipeline.

---

## Exercises

1. **Greedy merge (the big one).** In `meshChunk`, before emitting, sweep each face-plane and
   merge runs of cells with identical block + AO into one quad. Log the vertex count before
   and after — expect a large drop on flat terrain. Compare your approach to
   `packages/shared/src/mesher.ts`.
2. **Worker pool.** Spawn 3 workers and round-robin chunk jobs across them. Does first paint
   get faster?
3. **Distance sort.** Request chunks nearest the spawn first. Watch the world assemble
   outward from you.
4. **AO strength.** Tweak the `AO_BRIGHT` table (e.g. `[0.35, 0.6, 0.8, 1.0]`) and find the
   line between "moody" and "muddy."

---

## Checkpoint

```bash
pnpm checkpoint 08D
pnpm dev
```

Files: `src/shared/chunkMesher.ts`, `src/worker/mesher.worker.ts`,
`src/client/WorldManager.ts`, `src/client/PlayerController.tsx`, `src/client/App.tsx`.

**Next:** [`09-glsl-fundamentals.md`](./09-glsl-fundamentals.md) — Part 3 begins. Time to
write shaders. Or, if you'd rather nail down the maths first,
[`08E-voxel-math-and-bytes.md`](./08E-voxel-math-and-bytes.md) *(deep-dive)* derives every
formula in Part 2 — the index arithmetic, the bit-packing, DDA, AO and greedy merging.
