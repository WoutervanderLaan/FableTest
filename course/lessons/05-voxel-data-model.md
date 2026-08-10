# 05 · The voxel data model

> **Goal:** design how a world is stored in memory, write a deterministic
> generator for it, and render a quick relief map to prove it works. No mesher
> yet — this module is about the *data*, the bedrock everything else sits on.

**You'll build:** `src/shared/blocks.ts`, `src/shared/voxel.ts`, and a throwaway
`src/client/surfaceMap.ts` to look at the result.

---

## Concepts

A voxel world is **one big flat `Uint8Array`** — `sizeX * sizeY * sizeZ` bytes, each byte a
block id. No object per block. That density is the whole point: a 64×40×64 world is ~160k
blocks in 160 KB, and walking it is cache-friendly (great for the mesher and the collider).

Three ideas define the model:

**1. One indexing formula.** A 3D coordinate maps to a 1D array offset:
`index = (y * sizeZ + z) * sizeX + x`. Put it in *one function* (`voxelIndex`) and never
write it inline again — an off-by-one here corrupts the whole world silently.

**2. Out-of-bounds has meaning.** Rather than crash or return `undefined`, `getVoxel`
returns **solid soil below `y=0`** (so you can't fall out the bottom) and **air everywhere
else** (so the world has open edges). Every caller — mesher, collider, raycast — leans on
this so none of them needs its own bounds checks.

**3. Determinism.** Our world is generated from a **seed** with value noise. Same seed →
byte-identical world, on every machine. That's a nice-to-have for single player and an
absolute requirement for multiplayer: in Part 4 the client and server each generate the
world independently and must agree exactly, or every block would be a desync.

We also add **coordinate packing** (`packXYZ`/`unpackX/Y/Z`) — squeezing `(x,y,z)` into one
integer. You won't feel why yet; in Module 18 every network block-edit travels as one packed
number, and a structural collapse can send thousands at once.

---

## Build it

Delete Part 1's `meshbuilder.ts`/`SkyAndLight.tsx`? No — keep `SkyAndLight.tsx` and
`meshbuilder.ts`; we reuse both. Create a new `src/shared/` folder.

### 1. `src/shared/blocks.ts`

A small palette (8 blocks) with three lookup tables the renderer needs:

- `BLOCK_COLOR[id]` — base color.
- `BLOCK_TOP_COLOR[id]` — optional different color for the top face (grass is green on top,
  soil-brown on the sides — one block, two colors).
- `FACE_SHADE` — a fixed brightness per face direction (top brightest, bottom darkest).
  This single table is most of why flat-colored blocks read as 3D.

Plus `isSolid` (for collision) and `isOpaque` (for meshing). Type it out from the checkpoint
— it's short, and every value has a comment explaining the choice.

> **Amber is reserved.** Nothing the generator produces uses `Block.Amber` — it's kept for
> blocks the *player* places. That's a real Ruderal palette rule ("marigold amber is
> reserved for player agency"), and it's why your placed blocks will pop against the world.

### 2. `src/shared/voxel.ts`

This is the heart of the module. In order:

- `VoxelWorld` interface + `voxelIndex` (the one formula).
- `getVoxel` / `setVoxel` — the *only* functions that touch the array. Note `getVoxel`'s
  out-of-bounds rules.
- `surfaceY(w, x, z)` — the highest non-air block in a column (for spawning & the map).
- `packXYZ` / `unpackX/Y/Z` — the coordinate packer.
- The generator: `hash2` → `valueNoise` → `fbm` (fractal noise) → `generateWorld`.

`generateWorld` walks every column, picks a terrain height from `fbm`, fills stone→soil→
grass (or sand + water below the water line), then scatters a few deterministic trees. Read
it top to bottom in the checkpoint; the shape is "for each column, decide what stack of
blocks lives there."

> **Why value noise?** It's the simplest coherent (smooth, not white) noise: hash the
> integer lattice corners, smootherp-interpolate between them, then sum a few octaves for
> detail. The full Ruderal skips generation entirely — it *bakes* worlds from real map data
> (Module 21). Noise keeps us self-contained.

### 3. `src/client/surfaceMap.ts` + render it

To *see* the data before we have a mesher, emit one colored quad per column at its surface
height (reusing `MeshBuilder` from Module 03). `App.tsx` renders that single relief mesh
with the Module 04 lighting. See the checkpoint for both.

---

## Run & observe

```bash
pnpm dev
```

An angled relief map: green hills, brown slopes, a teal-ish basin where water sits, sandy
shorelines, and little bumps where trees stand. It's low-detail (one quad per column) but
it proves the generator makes a *world*, not noise.

Change the seed in `generateWorld()`'s default (e.g. `generateWorld(64, 40, 64, 7)`) and
reload — a completely different but equally coherent island. That's determinism you can see.

---

## How real Ruderal does it

- `packages/shared/src/voxelize.ts` is this file's big sibling: same `VoxelZone` /
  `Uint8Array` volume, same `getVoxel` out-of-bounds semantics (solid below, air outside),
  same `surfaceY`. Its `voxelize()` is far richer — weathered building shells, moss creeping
  up walls, canal beds — but it's the same "decide each column's stack" loop.
- `packages/shared/src/blocks.ts` is our `blocks.ts` with 18 blocks and the same
  `FACE_SHADE` table and reserved-amber rule.
- `packXYZ` and friends live in `packages/shared/src/protocol.ts` there, used exactly as
  we'll use them in Module 18.

The key structural lesson: **all of this is pure, engine-free `shared/` code.** That's not
tidiness for its own sake — it's what lets the identical world logic run in the browser, in
a web worker (Module 08D), and on the server (Part 4).

---

## Exercises

1. **A new block.** Add `Block.Snow` with a near-white color, and cap the tallest terrain
   with it in `generateWorld` (snow above some height). Watch it appear on the peaks.
2. **More/less water.** Change `waterLevel`. See the shoreline and basins move.
3. **Rockier terrain.** Increase the `fbm` amplitude (the `* 22` in the height line) or drop
   the `scale`. Feel how the two knobs trade height vs. frequency.
4. **Prove determinism.** Log `w.voxels[12345]` for a fixed seed across two reloads — same
   byte. Then change the seed — different byte.

---

## Checkpoint

```bash
pnpm checkpoint 05
pnpm dev
```

Files: `src/shared/blocks.ts`, `src/shared/voxel.ts`, `src/client/surfaceMap.ts`,
`src/client/App.tsx` (+ Part 1's `meshbuilder.ts`, `scene/SkyAndLight.tsx`).

**Next:** [`06-naive-mesher.md`](./06-naive-mesher.md) — turn this data into a world you can
actually look at, face by face.
