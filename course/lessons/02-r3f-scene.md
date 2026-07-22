# 02 · The same scene in R3F

> **Goal:** rebuild Module 01's spinning cube using **React Three Fiber** — and understand
> precisely what R3F does and doesn't do for you. This is the programming model for the
> entire rest of the course.

**You'll build:** a new `src/client/App.tsx` + restore `src/client/main.tsx` to React.

---

## Concepts

**React Three Fiber is React for Three.js.** You write JSX; R3F's custom renderer turns it
into real Three.js objects and keeps them in sync as your components render — creating,
updating, and disposing them for you. Nothing about Three.js is hidden or replaced; it's
*reconciled*.

The translation rule is dead simple: **any Three.js class becomes a lowercase JSX tag.**

| Three.js | R3F JSX |
|---|---|
| `new THREE.Mesh()` | `<mesh>` |
| `new THREE.BoxGeometry(1,1,1)` | `<boxGeometry args={[1,1,1]} />` |
| `new THREE.MeshStandardMaterial({color})` | `<meshStandardMaterial color="..." />` |
| `new THREE.DirectionalLight(c, i)` | `<directionalLight color={c} intensity={i} />` |

Two rules that cover 90% of R3F:

- **`args`** = the constructor arguments. `<boxGeometry args={[1,1,1]} />` literally calls
  `new BoxGeometry(1,1,1)`. Change `args` and R3F rebuilds the object.
- **Every other prop = a property set by name.** `position={[2,2,3]}` runs
  `mesh.position.set(2,2,3)`. Nested props use dashes: `shadow-mapSize={[2048,2048]}` →
  `light.shadow.mapSize`. And `attach="background"` means "assign me to `scene.background`."

Two hooks you'll use constantly (both must be called **inside** `<Canvas>`):

- **`useFrame((state, delta) => …)`** — runs every rendered frame. *This is the render
  loop* from Module 01. `delta` is seconds since the last frame (use it so motion is
  frame-rate independent).
- **`useThree()`** — grabs the scene/camera/renderer R3F made, when you need the imperative
  handle.

To reach into a specific object, use a **ref**: `<mesh ref={ref}>` gives you the actual
`THREE.Mesh` as `ref.current`.

---

## Build it

### 1. Restore `src/client/main.tsx` to React

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
```

### 2. Rewrite `src/client/App.tsx`

The spinning cube becomes a component that owns a ref and animates it with `useFrame`:

```tsx
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

function SpinningCube() {
  const ref = useRef<Mesh>(null);
  useFrame((_state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.x += delta * 0.6;
    ref.current.rotation.y += delta * 0.9;
  });

  return (
    <mesh ref={ref}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#e8a33d" />
    </mesh>
  );
}
```

Then the `App` — `<Canvas>` is the one component that creates the renderer, scene, camera,
and render loop (all of Module 01's boilerplate, gone):

```tsx
export function App() {
  return (
    <Canvas camera={{ position: [2.5, 2.5, 3.5], fov: 60 }}>
      <color attach="background" args={["#cfc8b8"]} />
      <hemisphereLight args={["#cdd4cc", "#6b5f4e", 1.0]} />
      <directionalLight position={[3, 5, 2]} intensity={2.5} />
      <SpinningCube />
    </Canvas>
  );
}
```

Read this next to Module 01's `vanilla.ts`, line for line. Same camera, same lights, same
cube, same rotation — but no `new`, no `scene.add`, no manual loop, and React will dispose
everything correctly when a component unmounts.

> **Why `delta`, not `t/1000`?** In Module 01 we set rotation *absolutely* from elapsed
> time. Here we *accumulate* `+= delta * speed`. Both work; accumulating with `delta` is
> the R3F habit because it composes naturally with pausing, and stays smooth if frames drop.

---

## Run & observe

```bash
pnpm dev
```

The identical amber cube, tumbling. It *looks* the same as Module 01 — that's the whole
point. You've traded ~35 lines of imperative setup for declarative JSX, and gained React's
component model (which we'll lean on hard once the scene has dozens of moving parts).

Open React DevTools: your scene is a component tree now.

---

## How real Ruderal does it

This is the actual architecture of `packages/client/src/App.tsx`. Its `<Canvas shadows
dpr={[1,2]} camera={{ fov: 74, near: 0.1, far: 1500 }}>` is the same `<Canvas>` you just
used, and its children — `<SkyAndLight />`, `<Vegetation />`, `<PlayerController />`,
`<RemotePlayers />` — are components exactly like your `<SpinningCube />`, each managing its
own slice of the Three.js scene. Every `useFrame` in that codebase (grass sway, player
movement, interpolation) is the loop you met in Module 01.

Note what Ruderal does **not** import: `@react-three/drei`. Neither do we. You'll build the
camera controller, geometry, and helpers by hand — which is how you actually learn this.

---

## Exercises

1. **Group them.** Wrap two `<SpinningCube />`s in a `<group position={[0,0,0]}>` and give
   each a different `position`. `<group>` is `THREE.Group` — a transform node.
2. **Hover state.** Add `onPointerOver`/`onPointerOut` to the mesh to toggle a `useState`
   color. (R3F gives meshes pointer events for free — raycasting under the hood.)
3. **Pause on click.** Add `onClick` to toggle a `paused` ref, and skip the rotation in
   `useFrame` when paused.
4. **Peek at state.** `console.log` the `state` arg of `useFrame` once. Find `state.camera`,
   `state.clock`, `state.gl` — the objects R3F built for you.

---

## Checkpoint

```bash
pnpm checkpoint 02
pnpm dev
```

Files: `src/client/App.tsx`, `src/client/main.tsx`.

**Next:** [`03-geometry-by-hand.md`](./03-geometry-by-hand.md) — stop using `BoxGeometry`
and build meshes from raw vertex buffers, the way the voxel engine will.
