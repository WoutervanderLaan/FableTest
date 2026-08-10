# 06 · A naive mesher

> **Goal:** turn the voxel volume into a real 3D mesh — one quad for every
> visible block face. This is the single most important algorithm in a voxel
> engine, and the naive version is only ~40 lines.

**You'll build:** `src/shared/mesher.ts` and `src/client/voxelMesh.ts`.

---

## Concepts

**The core insight: only draw the surface.** A solid block buried inside the ground has all
six neighbors solid — none of its faces can ever be seen, so we emit nothing for it. We only
emit a face where an **opaque block meets a non-opaque neighbor** (air or water). For a
typical world that's a tiny fraction of all faces — the difference between millions of
triangles and tens of thousands.

So the whole mesher is:

```
for every cell:
  if the cell isn't opaque: skip
  for each of its 6 faces:
    if the neighbor in that direction is opaque: skip   # hidden face
    else: emit a quad (4 vertices + 2 triangles)
```

Each emitted quad bakes its color right into the vertices (the Module 03 trick):
`BLOCK_COLOR × FACE_SHADE`. The `FACE_SHADE` factor is why a flat cube reads as lit even
before real lighting touches it — top faces come out brighter than side faces than bottom
faces. Grass uses `BLOCK_TOP_COLOR` on its up-face so the top is green and the sides brown.

**Where it lives matters.** The mesher goes in `src/shared/` and returns **plain typed
arrays** (`MeshData`), not a Three.js geometry. That keeps it engine-free so it can later run
in a web worker (08D) or on a server. The client has a tiny `voxelMesh.ts` that wraps those
arrays into a `BufferGeometry` — the *only* line where mesher output meets Three.js.

---

## Build it

### 1. `src/shared/mesher.ts`

Define `MeshData` (four arrays), a `FACES` table (per face: direction, `FACE_SHADE` key, and
the 4 corner offsets — the same winding you worked out by hand in Module 03), then
`meshWorld(w)` implementing the loop above. Type it from the checkpoint; the `FACES` table
is worth reading slowly — each entry is one face of a unit cube.

The corner offsets are in `[0..1]` cube-local space; adding the cell's `(x,y,z)` places them
in the world. Because we make 4 fresh vertices per face (not shared), each face can have its
own flat color and normal — exactly what we want for the blocky look.

### 2. `src/client/voxelMesh.ts`

```ts
import * as THREE from "three";
import type { MeshData } from "../shared/mesher";

export function buildGeometry(md: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(md.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(md.normals, 3));
  g.setAttribute("color", new THREE.BufferAttribute(md.colors, 3));
  g.setIndex(new THREE.BufferAttribute(md.indices, 1));
  g.computeBoundingSphere();
  return g;
}
```

That's the entire bridge. The mesher already produced exactly the arrays a `BufferGeometry`
wants, so there's nothing to reshape.

### 3. Render it

`App.tsx` generates the world once, meshes it, wraps it, and drops it in with a
`vertexColors` material. Water isn't opaque so the mesher skips it — we fake it for now with
a single translucent plane at the water line (proper water meshing is a rabbit hole we don't
need). See the checkpoint.

---

## Run & observe

```bash
pnpm dev
```

The real world, in 3D: hills with grassy tops and soil sides, stone where terrain is deep,
a translucent water plane sitting in the basins, and blocky trees. Because we skip hidden
faces, this is *thousands* of quads, not millions — check the tab stays smooth.

Toggle the optimization off to feel it: temporarily change the "skip hidden face" line to
never skip (`if (false)`), reload, and watch the triangle count (and memory) explode while
looking identical — you're now drawing the insides of every hill.

---

## How real Ruderal does it

`packages/shared/src/mesher.ts` is this file, evolved. It still emits quads into
`position`/`normal`/`color`/`index` arrays with `FACE_SHADE` baked in — but it **greedily
merges** adjacent coplanar faces of the same color into single big quads (far fewer
vertices), and bakes **ambient occlusion** into the corners. That's precisely Module 08D.
It also returns arrays (no Three.js), for the same worker reason. Everything you just wrote
is the skeleton the real one hangs on.

---

## Exercises

1. **Face count.** Log `md.positions.length / 3` (vertices) and
   `md.indices.length / 3` (triangles). Now flatten the terrain (fewer exposed faces) and
   watch both drop.
2. **Wireframe.** Add `wireframe` to the material and fly the Module 05 camera around — you
   can see the mesher only built the shell.
3. **X-ray.** Make `isOpaque` return `false` for `Block.Stone`. Now stone faces are always
   emitted *and* stone never hides its neighbors — you'll see through hillsides. Revert.
4. **A second material.** Split water into its own mesh: emit water top-faces in a second
   pass and give them a translucent material, instead of the fake plane. (This is genuinely
   fiddly — a good taste of why water meshing is its own topic.)

---

## Checkpoint

```bash
pnpm checkpoint 06
pnpm dev
```

Files: `src/shared/mesher.ts`, `src/client/voxelMesh.ts`, `src/client/App.tsx`.

**Next:** [`07-first-person-controller.md`](./07-first-person-controller.md) — get inside the
world and walk around.
