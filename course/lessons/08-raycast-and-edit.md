# 08 · Raycast & edit

> **Goal:** look at a block, break it, place a new one against it. This closes
> the Minecraft loop — and every piece of it is shared code the server will
> re-run in Part 4.

**You'll build:** `src/shared/raycast.ts`, an editing upgrade to
`PlayerController.tsx`, and a remesh-on-edit `App.tsx`.

---

## Concepts

**Targeting is a voxel raycast.** From the camera, shoot a ray along the view direction and
find the first solid block it hits. You *could* march the ray in tiny fixed steps, but that
either skips thin blocks or wastes work. The right tool is **grid DDA** (the Amanatides–Woo
algorithm): step exactly from one cell boundary to the next, visiting every cell the ray
crosses, in order, once. It returns the hit block **and the face normal** you entered
through.

That normal is the trick to **placing**: break replaces the hit cell with air; place puts a
block in the *neighbor* cell on the side you're looking at — which is just `hit + normal`.
It's why placing feels intuitive: blocks stick to the face under your crosshair.

**Editing means re-meshing.** The mesh is baked geometry; changing a voxel doesn't change it
until we rebuild. For now we rebuild the whole world mesh on each edit and let R3F swap it
in. That's wasteful — you'll feel a tiny hitch — and it's exactly what Module 08D fixes with
chunks + a worker. Feeling the naive cost first is the point.

**The highlight box** is a `LineSegments` built from `EdgesGeometry(BoxGeometry)` — a
wireframe cube we move onto the targeted block each frame, in amber (player-agency color).

---

## Build it

### 1. `src/shared/raycast.ts`

`raycastVoxel(w, ox,oy,oz, dx,dy,dz, maxDist)` → `VoxelHit | null`. Type it from the
checkpoint. The setup computes, per axis, the step direction, the `t`-distance between cell
boundaries (`tDelta`), and the `t` to the first boundary (`tMax`); the loop repeatedly
advances into whichever neighbor's boundary is nearest, recording the face normal as it
crosses. It's compact but dense — read it with the comments.

### 2. Editing in `PlayerController.tsx`

Add to the controller:

- Each frame, after moving the camera, cast a ray and stash the hit; move the highlight box
  onto it (or hide it if nothing's in reach).
- A `mousedown` handler: **left button** breaks (`setVoxel(hit, Air)`), **right button**
  places (`setVoxel(hit + normal, Amber)`), guarded so you can't place a block inside your
  own body. Both call an `onEdit()` prop to trigger the remesh.
- Prevent the context menu so right-click is usable.

The controller now returns the `<lineSegments>` highlight instead of `null`. Full file in the
checkpoint.

### 3. Remesh in `App.tsx`

Hold a `version` counter in state; the geometry is `useMemo(() => buildGeometry(meshWorld(
world)), [world, version])`, and `onEdit` bumps `version`. One tidy detail: dispose the
previous geometry when it's replaced, so the GPU doesn't leak —
`useEffect(() => () => geo.dispose(), [geo])`.

---

## Run & observe

```bash
pnpm dev
```

Lock the mouse. An amber wireframe tracks whatever block is under your crosshair.
**Left-click** to mine it away; **right-click** to stack an amber block against the face
you're looking at. Dig a tunnel into a hill, build a little tower, carve your initials. The
amber blocks pop against the muted world — that reserved color, earning its keep.

Watch for the hitch: on a big edit-heavy spree you'll feel each remesh rebuild the *entire*
world. Keep that feeling; Module 08D makes it vanish.

---

## How real Ruderal does it

- `packages/shared/src/raycast.ts` is your `raycastVoxel`, essentially identical — same DDA,
  same `VoxelHit` with a face normal, used for the same edit targeting.
- The edit path in `packages/client/src/player/PlayerController.tsx` is your break/place with
  a crucial addition: it's **networked and optimistic**. It applies the edit locally *right
  away* (so it feels instant), sends it to the server, and rolls back if the server rejects
  it (out of reach, rate-limited, protected block). That optimistic-with-rollback pattern is
  Module 18. You've built the local half; Part 4 adds the authority.
- Ruderal also re-meshes only the affected chunk, never the whole world — Module 08D.

---

## Exercises

1. **A hotbar.** Track a "current block" and switch it with number keys (or scroll). Place
   something other than amber. (Careful — keep amber feeling special.)
2. **Break particles.** On break, spawn a few small falling cubes at the block's position
   that fade out. (A taste of Ruderal's `Debris` system.)
3. **Reach.** Change `REACH`. Notice how a longer reach makes precise building harder — game
   design in one constant.
4. **Undo.** Keep a stack of `{x,y,z, oldBlock}` on each edit; bind a key to pop and restore.
   You've just invented the edit *log* — which, persisted, is how Ruderal saves worlds
   (Module 19).

---

## Checkpoint

```bash
pnpm checkpoint 08
pnpm dev
```

Files: `src/shared/raycast.ts`, `src/client/PlayerController.tsx`, `src/client/App.tsx`.

---

## Part 2 complete 🎉 (core)

You have a voxel world you generate, mesh, walk around inside, and edit — a real
single-player voxel sandbox. The optional deep-dive next makes the mesher fast and
professional; or you can skip straight to **Part 3** and make it *beautiful* with shaders.

**Next:** [`08D-greedy-ao-worker.md`](./08D-greedy-ao-worker.md) *(optional deep-dive)* — or
jump to [`09-glsl-fundamentals.md`](./09-glsl-fundamentals.md).
