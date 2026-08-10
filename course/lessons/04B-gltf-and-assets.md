# 04B · Loading glTF models

> **Goal:** stop making every mesh yourself. Load a real model file at runtime,
> place it in Module 04's lighting rig, and understand the three things that
> bite everyone: suspense, cloning, and disposal.

**You'll build:** `src/client/loaders/gltf.ts`, `src/client/scene/Crate.tsx`, and an
`App.tsx` that renders four crates from one file.

---

## Concepts

Everything in this course so far — and everything in the real Ruderal — is geometry you
*computed*. That's the right way to learn, and it's the right way to build a voxel world.
It is emphatically **not** how you build a scene full of props, characters and set dressing.
For that you load models somebody authored in Blender.

**glTF is the format.** Think of it as "JPEG for 3D": a JSON document describing nodes,
meshes, materials and animations, plus a binary blob of vertex data. Two flavors — `.gltf`
(JSON + separate or embedded buffers) and `.glb` (the same thing packed into one binary
file). Three.js reads both with the same loader.

> **Open `public/crate.gltf` in your editor.** It's deliberately the readable flavor. You'll
> find `accessors` (typed-array views: "24 items of type VEC3, float32"), `bufferViews`
> (byte ranges), and a `buffers` entry holding base64. That's the *same* idea as the
> `MeshData` arrays you built in Module 03 — positions, normals, indices — just serialized.
> Module 08E takes this apart byte by byte.

**Three things reliably go wrong:**

**1. Loading is async, rendering is not.** `GLTFLoader.loadAsync()` returns a promise, but
`<mesh>` needs an object *now*. React's answer is **Suspense**, and its protocol is
delightfully crude: a hook that isn't ready **throws a promise**. React catches it, renders
the nearest `<Suspense fallback>`, and re-renders when it settles. Our `useGLTF` is 15 lines
because that's genuinely all there is to it.

**2. An `Object3D` can only be in one place.** The cache hands every caller the same
`gltf.scene`. Render it from two components and the second *steals* it from the first —
"only one of my models appears." The fix is `gltf.scene.clone(true)` per instance. Clones
share geometry and materials, so this is cheap.

**3. Cloning shares more than you think.** Because clones share materials, tinting one crate
tints them all. If you want per-instance materials you must `.clone()` the material too —
and *then* you own it and must dispose it. The rule: **dispose exactly what you created.**
Disposing a clone's shared geometry blanks out every other instance.

**Loaded models arrive shadow-blind.** `castShadow`/`receiveShadow` default to `false`, so a
model dropped into Module 04's rig looks flat and floats. Walk the tree once and opt in.

---

## Build it

### 0. Generate the assets

```bash
pnpm make-assets
```

This writes `public/crate.gltf` plus its textures. They're generated rather than committed —
the repo carries no binaries, and a glTF you can read in a text editor teaches the format far
better than one you can't.

### 1. `src/client/loaders/gltf.ts`

The cache + the suspense hook + two helpers. The core is:

```ts
export function useGLTF(url: string): GLTF {
  const entry = cache.get(url);
  if (!entry) {
    const promise = loader.loadAsync(url).then(
      (gltf) => cache.set(url, { status: "ok", gltf }),
      (error) => cache.set(url, { status: "error", error }),
    );
    cache.set(url, { status: "pending", promise });
    throw promise; // ← suspend
  }
  if (entry.status === "pending") throw entry.promise;
  if (entry.status === "error") throw entry.error;
  return entry.gltf;
}
```

Plus `preloadGLTF` (warm the cache early), `enableShadows` (the traverse), and **two**
disposal helpers — `disposeMaterials` and `disposeTree`. Read the comment explaining why
they're separate; that distinction is the whole ownership lesson.

### 2. `src/client/scene/Crate.tsx`

Two components: `<Crate>` (clones the node tree, shares materials, **no cleanup** — it owns
nothing) and `<TintedCrate>` (clones materials too, so it *must* dispose them). Type both and
compare their `useEffect`s.

### 3. `App.tsx`

Wrap the models in `<Suspense>` **inside** `<Canvas>`, with a 3D fallback:

```tsx
<Suspense fallback={<LoadingBox />}>
  <Crate position={[6, 1.5, 8]} scale={2.5} />
  <TintedCrate position={[11, 1.5, 10]} scale={2.5} color="#6fa24b" />
</Suspense>
```

> **What about drei?** `@react-three/drei` gives you all of the above as
> `const { scene } = useGLTF('/crate.gltf')` — same cache, same suspense, plus a `<Clone>`
> helper. It is genuinely the right call in a real project. The course builds it by hand
> once so that when you reach for drei later it's an informed choice rather than a black
> box — the same reasoning behind the hand-built camera controller in Module 07.

---

## Run & observe

```bash
pnpm make-assets && pnpm dev
```

Four crates in Module 04's golden-hour light: two wood, one moss-green, one amber, all
casting real shadows onto the patchwork ground. They came from **one** 4 KB file parsed
**once**.

Things worth doing:

- **Watch the fallback.** DevTools → Network → throttle to "Slow 3G" and reload. The amber
  wireframe box appears, then pops to crates. That's Suspense.
- **Break the clone.** In `Crate.tsx` return `<primitive object={gltf.scene} …>` instead of
  the clone. Three crates vanish — the last one to render stole the object.
- **Break the ownership rule.** Change `disposeMaterials` to `disposeTree` in `TintedCrate`,
  then hot-reload a few times. Meshes go black or vanish as shared geometry gets freed out
  from under the other instances.

---

## How real Ruderal does it

**It doesn't — and that's worth knowing.** There is no `GLTFLoader`, no `.glb`, and no
`public/` anywhere in `packages/`. Every triangle in Ruderal is computed: terrain from
`packages/shared/src/voxelize.ts`, surfaces from `packages/shared/src/mesher.ts`, grass from
`packages/client/src/scene/Vegetation.tsx`. For a world derived from real map data that's the
only option — you can't author Amsterdam by hand.

But Ruderal *does* load a big binary asset at runtime, and the shape is identical to what you
just built: `packages/client/src/loader.ts` fetches a gzipped **zonepack**, decompresses it,
and hands it to `decodeZonepack` (`packages/shared/src/zonepack.ts`) — which walks a
`DataView` pulling typed arrays out of byte ranges, exactly like glTF accessors and
bufferViews. Cache, async boundary, typed arrays, ownership. Different format, same job.

So: use models when a human authored the thing; generate geometry when an algorithm did.
Most real projects do both.

---

## Exercises

1. **Preload.** Call `preloadGLTF('/crate.gltf')` at module top level and reload with
   throttling on. The fallback should barely flash — loading now starts before React renders.
2. **An error boundary.** Point a `<Crate url="/nope.gltf">` at a missing file. The thrown
   error escapes to the console; wrap it in a React error boundary and render a red box
   instead.
3. **Read the file.** Open `public/crate.gltf` and change `"scale": [0.45, 0.45, 0.45]` on
   the Beacon node. Reload. You've just edited a 3D model in a text editor.
4. **Bring your own.** Download any CC0 `.glb` (Poly Haven, Khronos sample models), drop it
   in `public/`, and point `<Crate url=…>` at it. Note what you have to fix: scale, origin,
   and shadow flags. That's the real asset workflow in three lines.

---

## Checkpoint

```bash
pnpm checkpoint 04B
pnpm make-assets
pnpm dev
```

Files: `src/client/loaders/gltf.ts`, `src/client/scene/Crate.tsx`, `src/client/App.tsx`
(+ Module 04's `scene/SkyAndLight.tsx`, `meshbuilder.ts`).

**Next:** [`04C-textures-and-uvs.md`](./04C-textures-and-uvs.md) — the crate has textures we
haven't looked at yet. Time to understand UVs.
