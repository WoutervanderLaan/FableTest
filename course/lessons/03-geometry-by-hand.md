# 03 · Geometry by hand

> **Goal:** build meshes from raw vertex buffers instead of `BoxGeometry`. This is *the*
> foundational skill for the voxel engine — the mesher in Part 2 is nothing but a big loop
> that does what you're about to do by hand.

**You'll build:** `src/client/meshbuilder.ts` and an `App.tsx` that renders it.

---

## Concepts

A `BoxGeometry` is a convenience. Underneath, every geometry in Three.js is a
`BufferGeometry`: a bag of **attributes**, which are just flat typed arrays with a fixed
number of values per vertex.

The attributes you'll use:

| Attribute | Values/vertex | Meaning |
|---|---|---|
| `position` | 3 | vertex xyz |
| `normal` | 3 | unit vector the surface faces — **lighting uses this** |
| `color` | 3 | per-vertex RGB (needs `material.vertexColors = true`) |
| *(index)* | — | list of vertex numbers, 3 per triangle |

**Triangles are everything.** GPUs draw triangles; a quad is two of them. The **index**
buffer says which vertices form each triangle, so shared vertices aren't duplicated.

**Winding order matters.** Three.js treats a triangle as *front-facing* when its vertices
appear **counter-clockwise** from the viewer, and by default it *culls* (skips) back faces
for speed. Wind a face the wrong way and it vanishes. The reliable rule: order the vertices
counter-clockwise **as seen from the side the normal points toward**.

**Per-vertex color** is how the whole voxel world gets its look: one cheap flat material,
with all the variety — block colors, face shading, ambient occlusion — baked into the
`color` attribute. Get comfortable with it here.

---

## Build it

We'll make a tiny reusable builder, then a cube and a colored grid with it.

### 1. `src/client/meshbuilder.ts` — the accumulator

```ts
import * as THREE from "three";

type V3 = [number, number, number];

export class MeshBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private indices: number[] = [];

  // Add a quad from 4 corners, wound CCW as seen from the front (where `n` points).
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, color: THREE.Color): void {
    const base = this.positions.length / 3;
    for (const p of [a, b, c, d]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
      this.colors.push(color.r, color.g, color.b);
    }
    // Two triangles fan across the 4 vertices: (a,b,c) and (a,c,d).
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.indices);
    return g;
  }
}
```

That `quad()` method is the seed of the entire mesher. Sit with it: **give it 4 corners, a
normal, and a color; it emits two triangles.** Part 2 calls it once per visible voxel face.

### 2. A cube — six quads, no BoxGeometry

```ts
export function makeCube(color = new THREE.Color("#e8a33d")): THREE.BufferGeometry {
  const m = new MeshBuilder();
  const h = 0.5;
  m.quad([-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h], [0, 0, 1], color);   // +Z
  m.quad([h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h], [0, 0, -1], color); // -Z
  m.quad([h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h], [1, 0, 0], color);   // +X
  m.quad([-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h], [-1, 0, 0], color); // -X
  m.quad([-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h], [0, 1, 0], color);   // +Y
  m.quad([-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h], [0, -1, 0], color); // -Y
  return m.build();
}
```

Each line is one face: 4 corners, its outward normal, the color. The winding is chosen so
every face's triangles come out counter-clockwise from outside — try reversing two corners
on one face and watch that face disappear (back-face culling).

### 3. A patchwork — the mesher, embryonic

```ts
export function makePatchwork(n = 16): THREE.BufferGeometry {
  const m = new MeshBuilder();
  const palette = ["#6fa24b", "#c7c94f", "#3e8e7e", "#b8b2a7", "#8c7a5c"].map(
    (c) => new THREE.Color(c),
  );
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const col = palette[(x * 3 + z * 7) % palette.length]!;
      m.quad([x, 0, z + 1], [x + 1, 0, z + 1], [x + 1, 0, z], [x, 0, z], [0, 1, 0], col);
    }
  }
  return m.build();
}
```

A grid of upward-facing colored quads in **one** geometry. `n*n` cells, one draw call.
This is a 2D preview of exactly how Module 06 turns a 3D voxel volume into a mesh.

### 4. Render it

In `App.tsx`, build geometries in `useMemo` (so they're made once, not every render) and
hand them to a `<mesh geometry={…}>` with a `vertexColors` material:

```tsx
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { makeCube, makePatchwork } from "./meshbuilder";

function HandCube() {
  const geo = useMemo(() => makeCube(new THREE.Color("#e8a33d")), []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_s, d) => { if (ref.current) ref.current.rotation.y += d * 0.5; });
  return (
    <mesh ref={ref} geometry={geo} position={[8, 2.5, 8]}>
      <meshStandardMaterial vertexColors />
    </mesh>
  );
}

function Patchwork() {
  const geo = useMemo(() => makePatchwork(16), []);
  return <mesh geometry={geo}><meshStandardMaterial vertexColors /></mesh>;
}

export function App() {
  return (
    <Canvas camera={{ position: [8, 15, 32], fov: 55 }}
            onCreated={({ camera }) => camera.lookAt(8, 1, 8)}>
      <color attach="background" args={["#cfc8b8"]} />
      <hemisphereLight args={["#cdd4cc", "#6b5f4e", 0.9]} />
      <directionalLight position={[12, 18, 6]} intensity={2.2} />
      <Patchwork />
      <HandCube />
    </Canvas>
  );
}
```

> Two new things: passing a prebuilt geometry via the **`geometry={geo}` prop** (instead of
> a `<boxGeometry>` child), and `onCreated={({camera}) => camera.lookAt(...)}` to aim the
> camera at the grid — our stand-in for camera controls until we build a real one in
> Module 07. `vertexColors` on the material tells it to read the `color` attribute.

---

## Run & observe

```bash
pnpm dev
```

A 16×16 checkerboard of palette colors, an amber cube slowly turning above it. The cube's
faces are shaded differently by the *same* light because each face's `normal` points a
different way — that's the normals doing their job. The patchwork is a single mesh: 256
colored tiles, one draw call.

Comment out `vertexColors` on the patchwork material → it goes uniform white/gray, because
the color attribute is now ignored. That's the switch the whole voxel look depends on.

---

## How real Ruderal does it

Two direct parallels:

- `packages/client/src/scene/Vegetation.tsx` builds its grass geometry exactly like this —
  hand-written `position`/`normal`/`index` arrays via `new THREE.BufferAttribute(...)`.
  Open `makeCrossQuadGeometry()` and you'll recognize every line.
- `packages/shared/src/mesher.ts` is `MeshBuilder` grown up: it walks a voxel chunk and
  emits a quad per visible face into `position`/`normal`/`color`/`index` arrays — and bakes
  **face shading and ambient occlusion** straight into that `color` attribute, the same
  per-vertex-color trick you just used. Everything colorful in Ruderal is vertex color on a
  plain material.

---

## Exercises

1. **A pyramid.** Add `makePyramid()`: a square base quad + four triangles. (For a bare
   triangle, push 3 vertices and index `base, base+1, base+2`.)
2. **Height map.** Make the patchwork bumpy: set each cell's `y` to
   `Math.sin(x*0.5)+Math.cos(z*0.5)`. Watch the shading break — the normals still point
   straight up, so lighting is now "wrong." (Recomputing normals for slopes is a great
   rabbit hole; `geometry.computeVertexNormals()` does it for you.)
3. **Wireframe.** Add `wireframe` to a material to see the triangles directly. Count them:
   256 quads = 512 triangles.
4. **Break winding.** Reverse two corners of the cube's `+Y` face and find the hole from
   above. Now you can *see* back-face culling.

---

## Checkpoint

```bash
pnpm checkpoint 03
pnpm dev
```

Files: `src/client/meshbuilder.ts`, `src/client/App.tsx`, `src/client/main.tsx`.

**Next:** [`04-light-shadow-sky.md`](./04-light-shadow-sky.md) — turn this flat-lit test
scene into the golden-hour Ruderal look: a sun with shadows, fog, and a sky dome.
