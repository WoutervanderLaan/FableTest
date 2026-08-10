# 08E · The math of voxels & bytes *(deep-dive)*

> **Optional.** No new code — this module *derives* what modules 05–08D told you
> to type. Read it whenever the voxel math starts feeling like magic incantations.
> Everything here is either in your `src/shared/` already or in the real
> `packages/shared/`.
>
> **Goal:** understand every formula in the voxel pipeline well enough to
> re-derive it, and get properly comfortable with bytes, hex and bit-packing —
> the layer under all of it.

---

## Why this module exists

Modules 05–08 asked you to "type it from the checkpoint" for six dense formulas: the index
formula, the coordinate packer, the DDA setup, the AO term, the diagonal flip, and the greedy
merge. Each is a couple of lines and each encodes a real idea. Copying them works. Knowing
*why* they're shaped that way is what lets you change them.

**A word on scope.** If your goal is beautiful hand-authored scenes (Part 1B's model-based
path), you can skip this module entirely and lose nothing — bit-packing is a *voxel and
networking* concern, not a 3D-graphics one. Read it if you're building a voxel engine, or if
you want the byte-level literacy that binary formats, workers, and network protocols all
assume.

---

## 1. One array, one formula

A voxel world is **one flat `Uint8Array`**, not a 3D array of objects. The reason is arithmetic:

- `{ id, light, meta }` as an object: ~50+ bytes of header, pointer, and hash-map overhead.
- One byte: **one byte**.

A 64×40×64 world is 163,840 blocks = **160 KB** — small enough to hold several of, copy into a
worker, and walk millions of times a second. The same world as objects is ~8 MB of pointer
chasing, and every mesher pass becomes a cache-miss festival.

### Deriving the index

You need a bijection from `(x, y, z)` to `[0, N)`. Think of it as a **stride** — how far you
travel in the array to move one step along each axis:

```
step x by 1  →  move 1 element
step z by 1  →  move sizeX elements     (a whole row of x)
step y by 1  →  move sizeX*sizeZ        (a whole layer of xz)
```

Multiply each coordinate by its stride and sum:

```
index = x + z*sizeX + y*sizeX*sizeZ
```

which factors into the form you typed:

```ts
index = (y * sizeZ + z) * sizeX + x
```

Identical arithmetic, one fewer multiply. **The ordering is a performance decision.** `x` is
the fastest-varying axis, so scanning `for y { for z { for x } } }` walks the array strictly
forward — every cache line you pull in gets fully used. Swap the loops and the same algorithm
can run several times slower on a large world. That's why `mesher.ts` and `voxelize.ts` both
nest their loops in exactly that order.

> **Why `getVoxel` returns solid below y=0 and air elsewhere.** Out-of-bounds is a *semantic*
> choice, not an error case. Solid below the floor means you can't fall out of the world; air
> outside means the world has open edges that mesh correctly. Because every caller — mesher,
> collider, raycast, AO — leans on those two rules, none of them needs its own bounds check.
> One decision, made once, removes bounds-checking from four algorithms.

---

## 2. Bytes, hex, and bit operations

This is the section that makes the rest legible.

### Typed arrays are views over bytes

An `ArrayBuffer` is a raw block of memory. A typed array is a *lens* on it:

```ts
const buf = new ArrayBuffer(8);        // 8 raw bytes
const u8  = new Uint8Array(buf);       // 8 elements, 1 byte each
const u32 = new Uint32Array(buf);      // 2 elements, 4 bytes each — SAME memory
u8[0] = 0xff;
u32[0]; // 255 on a little-endian machine — you're reading the same byte back
```

| Type | Bytes | Range | Used in Ruderal for |
|---|---|---|---|
| `Uint8Array` | 1 | 0..255 | block ids, water/landcover rasters |
| `Int16Array` | 2 | ±32,767 | terrain heights (can be negative) |
| `Uint16Array` | 2 | 0..65,535 | building ids, mesh indices, tree coords |
| `Uint32Array` | 4 | 0..4.29e9 | mesh indices past 65k |
| `Float32Array` | 4 | ~7 digits | positions, normals, colors |

**Choosing a type is choosing a range.** `Uint8Array` for blocks caps the palette at 256 —
Ruderal uses 18. `Uint16Array` indices cap a mesh at 65,536 vertices, which is exactly why
`mesher.ts` uses `Uint32Array`.

### Hex is just grouped binary

One hex digit = exactly 4 bits. That's the entire reason hex exists in this kind of code:

```
0xFF   = 1111 1111        = 255       one byte, all bits set
0x1FF  = 1 1111 1111      = 511       nine bits — the block-id mask
0x3FF  = 11 1111 1111     = 1023      ten bits — the coordinate mask
```

When you see `0x3FF` think **"ten bits"**, not "1023".

### The six operators

```
a & b     AND   — keep bits set in BOTH.  Used to MASK (extract) fields.
a | b     OR    — set bits from either.   Used to COMBINE fields.
a ^ b     XOR   — set where they differ.  Used in hashing.
~a        NOT   — flip every bit.         ~3 = ...11111100
a << n    shift left  — multiply by 2ⁿ.   Moves a field into position.
a >> n    shift right (sign-propagating)  — divide by 2ⁿ.
a >>> n   shift right (zero-fill)         — treats the value as UNSIGNED.
```

**Two JavaScript-specific traps:**

1. **Bitwise operators coerce to signed 32-bit.** Numbers are doubles, but `|`, `&`, `<<`
   convert to int32 first. So bit 31 is the *sign* bit: `1 << 31` is negative. Any packing
   scheme must stay within **31 bits** to remain a positive integer.
2. **`>>` vs `>>>`.** `-1 >> 4` is `-1` (sign bits shift in); `-1 >>> 4` is `268435455`. If a
   packed field could ever set bit 31, you must unpack with `>>>` or you'll get garbage.

---

## 3. Packing coordinates into one integer

Here's the real thing, from `packages/shared/src/protocol.ts`:

```ts
/** Pack voxel coords into one int: x,z ∈ [0,1024), y ∈ [0,1024). */
export function packXYZ(x: number, y: number, z: number): number {
  return x | (z << 10) | (y << 20);
}
export function unpackX(p: number): number { return p & 1023; }
export function unpackZ(p: number): number { return (p >> 10) & 1023; }
export function unpackY(p: number): number { return (p >> 20) & 1023; }
```

**Derive it from a bit budget.** How many bits does each coordinate need? A zone is at most
1024 blocks on a side, and 1024 = 2¹⁰, so **10 bits each**. Three coordinates = 30 bits — which
fits in the 31 usable bits from trap #1 above, with one to spare. Lay them out end to end:

```
 bit 29        20 19        10 9          0
┌───────────────┬─────────────┬────────────┐
│      y        │      z      │     x      │
└───────────────┴─────────────┴────────────┘
```

- **Packing** shifts each field to its slot and ORs them together. No field can collide with
  another because each was masked to 10 bits by its declared range.
- **Unpacking** shifts back down, then `& 1023` clears everything above the field.

The `& 1023` on `unpackX` is redundant for a well-formed value (nothing exists below bit 0) —
it's there so a malformed value from the network can't leak into other fields.

**Why bother?** Module 18 sends every block edit over the wire, and a structural collapse can
send thousands at once. Compare:

```json
{"x":123,"y":45,"z":67,"b":3}     // 29 bytes of JSON
[47234171, 3]                      // 2 numbers
```

At 2,000 blocks in a collapse that's ~58 KB versus a few KB — and the packed form is a flat
`number[]`, which Colyseus serializes far more cheaply than an array of objects.

> **Exercise the budget yourself.** If you wanted `y ∈ [0, 256)` you'd need only 8 bits,
> freeing 2 for a block id in the same integer. That's a real design conversation, and it's
> just addition.

---

## 4. Packing *several* fields: the mesher's merge key

Coordinates aren't the interesting case. This is — from `packages/shared/src/mesher.ts`:

```ts
// key layout: bit20 = present, bit19 = isWater, bits10-17 ao, bit9 dir, bits0-8 block
function encodeKey(block: number, dirBit: number, ao: number): number {
  return (1 << 20) | (ao << 10) | (dirBit << 9) | block;
}
```

Five fields in one integer:

| Bits | Field | Why that width |
|---|---|---|
| 0–8 | block id | 9 bits = 512 blocks |
| 9 | direction | which way the face points (+/−) |
| 10–17 | AO | 4 corners × 2 bits each |
| 19 | isWater | water meshes into a separate buffer |
| 20 | present | distinguishes "no face here" from "face with key 0" |

The **`present` bit is the subtle one.** The mask array is zero-initialised, and a legitimate
face could have block id 0 and AO 0 — indistinguishable from an empty cell. Setting bit 20 on
every real face makes "is there a face here?" a simple non-zero test.

And now the payoff. Greedy meshing merges two faces only if they are **identical in every
respect** — same block, same direction, same AO on all four corners. With everything packed
into one integer, that entire test is:

```ts
if (mask[i] === mask[j]) { /* merge */ }
```

One comparison instead of six. *That* is why the packing exists — not to save memory, but to
turn a structural comparison into a single integer equality.

Unpacking is the mirror image:

```ts
const block  =  key & 0x1ff;         // bits 0-8
const dirBit = (key >> 9) & 1;       // bit 9
const ao     = (key >> 10) & 0xff;   // bits 10-17
const a0 = ao & 3, a1 = (ao >> 2) & 3, a2 = (ao >> 4) & 3, a3 = (ao >> 6) & 3;
```

Note the nesting: AO is itself four 2-bit fields packed into one 8-bit field.

---

## 5. Ambient occlusion, derived

The formula from Module 08D:

```ts
const a0 = s1m & s2m ? 0 : 3 - (s1m + s2m + cmm);
```

**Set up the geometry.** Take one *vertex* of a face. On the open side, exactly three blocks
touch that corner: two **edge** neighbours (`side1`, `side2`, sharing a face with the vertex's
cell) and one **corner** neighbour (`corner`, diagonal). Each is 0 or 1.

**The intuition:** ambient light arrives from all directions; the more of that hemisphere is
blocked by nearby geometry, the darker the corner. Counting occluders is a crude but very
effective proxy.

So the base case is simply "3 minus the number of occluders", giving a value in `0..3` where
3 = fully open:

```
3 - (side1 + side2 + corner)
```

**The special case.** If *both* edge neighbours are solid, the corner sits in a fully enclosed
crevice — light can't reach it regardless of what the diagonal block is doing. Without the
special case, `side1=1, side2=1, corner=0` would give `1` (partly lit) when it should be fully
dark. Hence:

```
if (side1 && side2) return 0;
```

Two bits per corner, four corners, packed into the 8-bit AO field above.

### The diagonal flip

```ts
const flip = a0 + a2 > a1 + a3;
```

A quad is drawn as two triangles, and the GPU interpolates vertex colors **within each
triangle** — so the shared diagonal is a crease where interpolation changes direction. Split it
the wrong way and a smooth AO gradient develops a visible diagonal seam (the classic "my AO
looks lopsided" artifact).

Comparing the two diagonals' total darkness tells you which way the gradient actually runs;
flipping the split to follow it keeps the interpolation smooth. It costs one comparison and
removes an artifact you'd otherwise never quite place.

---

## 6. DDA, derived

The raycast setup from Module 08 looks like incantation until you write down the ray equation.

A ray is `P(t) = O + t·D`. Normalise `D` first, and then **`t` is distance in world units** —
which is what makes `maxDist` and the returned `dist` meaningful.

**Question 1: how far along the ray between successive x-planes?** The planes are at integer
x, one unit apart. Moving `Δt` advances x by `Δt·dx`, so covering one unit of x takes:

```ts
tDeltaX = 1 / |dx|         // Infinity when dx == 0 — never crosses an x-plane
```

**Question 2: how far to the *first* x-plane?** Depends on direction. Going right (`dx > 0`)
the next boundary is `ix+1`, at distance `(ix + 1 - ox)` in x-units; going left it's `ix`, at
`(ox - ix)`. Convert x-units to t-units by multiplying by `tDeltaX`:

```ts
tMaxX = (dx > 0 ? ix + 1 - ox : ox - ix) * tDeltaX
```

**The loop.** `tMaxX/Y/Z` each say "distance until I leave this cell along that axis". The
smallest one is the boundary you actually hit next, so: step that axis, set `t` to that
boundary, and add `tDelta` to get the *next* boundary on the same axis.

**The face normal falls out for free.** If you stepped `+1` in x, you entered through the cell's
`-x` face, so the normal is `-stepX`. That's why the code sets `nx = -stepX`. And that normal
is what makes block *placement* work: place at `hit + normal`, which is why blocks stick to the
face under your crosshair.

**Why not just march in small steps?** Fixed steps either skip thin geometry (steps too big) or
waste enormous work (too small), and never give you an exact face normal. DDA visits every cell
the ray crosses, in order, exactly once, with no tuning parameter.

---

## 7. Greedy meshing, derived

The naive mesher emits one quad per visible face. Greedy meshing merges coplanar neighbours
into big rectangles. The algorithm is a **2D run-merge repeated per slice**:

1. For each of the 3 axes, and each slice along it, build a 2D `mask` of merge keys (§4).
2. Scan the mask. At the first non-zero cell:
   - extend **width** while the key matches,
   - extend **height** while an entire row of that width matches,
3. Emit one quad of `w × h`, zero out the cells you consumed, continue.

A flat 32×32 floor becomes **1** quad instead of 1,024 — a 1000× vertex reduction on the
common case. The worst case (a 3D checkerboard) merges nothing and costs you the mask
bookkeeping.

**The catch, and why AO lives in the key.** Two faces that differ in AO must *not* merge, or a
shadowed corner would be smeared across a large quad. That's exactly why AO is packed into the
comparison key rather than computed later — and, in turn, why Ruderal's per-voxel color jitter
lives in the *fragment shader* keyed on world position (`packages/client/src/scene/materials.ts`)
rather than in vertex colors. Vertex jitter would make every face's key unique and defeat
merging entirely. The rendering trick and the meshing algorithm are coupled.

---

## 8. Binary file formats

`packages/shared/src/zonepack.ts` is a complete, readable binary format — 144 lines that use
every idea above.

```
u32 magic "ZPK1" | u32 headerJsonLen | headerJson (utf8, padded to 4)
u32 treeCount
Int16  terrain[sizeX*sizeZ]
Uint8  water[sizeX*sizeZ]
...
```

**Magic numbers.** `0x5A504B31` is the ASCII for `Z`,`P`,`K`,`1` (`0x5A 0x50 0x4B 0x31`). Read
it first; if it doesn't match, this isn't your file — fail immediately rather than
misinterpreting megabytes. The trailing `1` is the format version.

**A JSON header in a binary file** is a genuinely good hybrid: the fixed-size bulk data gets
binary efficiency, while the metadata (names, sizes, provenance, timestamps) stays
self-describing and extensible.

**`DataView` and endianness.** Multi-byte numbers can be stored low-byte-first (little-endian)
or high-byte-first (big-endian). `DataView` forces you to say which:

```ts
view.setUint32(off, ZONEPACK_MAGIC, true);   // true = little-endian
```

Typed arrays use the *platform's* order, which is why anything crossing a machine boundary
should go through `DataView` with an explicit flag. Effectively every machine you'll meet is
little-endian, but "effectively every" is not "every".

**Alignment, and the `pad4` trick.** A `Uint16Array` view must start at an even byte offset; a
`Uint32Array` at a multiple of 4. Hence:

```ts
function pad4(n: number): number {
  return (n + 3) & ~3;
}
```

`~3` is `...11111100`, so `& ~3` clears the low two bits — rounding *down* to a multiple of 4.
Adding 3 first turns that into rounding *up*. It's the standard alignment idiom, and you'll
now recognise it everywhere (including in this course's own `make-assets.mjs`, which uses it to
lay out the glTF buffer).

**Why `decodeZonepack` calls `.slice()`.** `data.buffer.slice(a, b)` *copies* the bytes. That
looks wasteful next to a zero-copy view — but a view requires the source offset to be correctly
aligned, and a `Uint8Array` you received from `fetch` or a worker offers no such guarantee.
Copying buys unconditional correctness; the alternative is an alignment exception on some
inputs and not others.

---

## 9. Determinism and hashing

Module 05 insisted the generator be deterministic: same seed → byte-identical world. In Part 4
that stops being a nicety, because client and server each generate the world independently and
must agree exactly.

`Math.random()` is unusable here — no seed, no reproducibility. Instead you **hash coordinates**:
a pure function from `(seed, x, y, z)` to a number that looks random but is perfectly
repeatable. That's `hash2`/`hash01` in your `voxel.ts`, built from the same integer mixing
(multiply by large odd constants, XOR-shift the high bits down) you saw in `>>>` above. XOR-shift
matters specifically because multiplication only propagates entropy *upward*; shifting the high
bits back down and XORing mixes it through the whole word.

The same idea reappears in GLSL, where there's no integer hashing to lean on:

```glsl
float jn = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
```

Take a dot product with arbitrary constants, blow it up through `sin`, multiply by a big number,
and keep the fractional part. It isn't a good hash by cryptographic standards — but it's one
line, needs no state, and is stable across frames. Module 09C builds this up properly.

---

## Where each idea lives

| Idea | Your code | Real Ruderal |
|---|---|---|
| Index formula, OOB rules | `shared/voxel.ts` | `packages/shared/src/voxelize.ts` |
| Coordinate packing | `shared/voxel.ts` | `packages/shared/src/protocol.ts` |
| Merge key, AO, flip | `shared/chunkMesher.ts` (08D) | `packages/shared/src/mesher.ts` |
| DDA | `shared/raycast.ts` | `packages/shared/src/raycast.ts` |
| Binary format | — | `packages/shared/src/zonepack.ts` |
| Deterministic hashing | `shared/voxel.ts` | `packages/shared/src/voxelize.ts` |

---

## Exercises

1. **Re-derive the packer.** Write `packXYZB(x, y, z, block)` putting a 5-bit block id in the
   spare high bits. What's the largest world it still supports? Prove it with `>>>`.
2. **Break the sign bit.** Evaluate `packXYZ(0, 2048, 0)` and unpack it with `>>` and then
   `>>>`. Explain the difference in one sentence.
3. **Measure the loop order.** Time your `meshWorld` with loops nested `y,z,x`, then `x,z,y`.
   Same output, and on a large world a meaningful gap. That's cache locality, measured.
4. **Read a real file.** Write a 20-line script that reads a `.zonepack` from
   `packages/baker/`, checks the magic, prints the JSON header, and reports each array's length.
   You'll have written a format parser.
5. **Defeat greedy meshing.** Add a tiny per-vertex color jitter to `meshChunk` and log the
   vertex count before and after. Watch merging collapse — then move the jitter to the fragment
   shader, as `materials.ts` does, and watch it come back.

---

## No checkpoint

This module adds no files — it explains the ones you already have. Re-read `shared/voxel.ts`,
`shared/chunkMesher.ts` and `shared/raycast.ts` with this in hand; the goal is that none of the
lines look arbitrary any more.

**Next:** [`09-glsl-fundamentals.md`](./09-glsl-fundamentals.md) — Part 3 begins. Or, if the bit
math whetted your appetite for the maths of *looks* rather than of storage, jump to
[`09B-shader-math-toolkit.md`](./09B-shader-math-toolkit.md).
