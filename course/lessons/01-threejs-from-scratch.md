# 01 · Three.js from scratch

> **Goal:** draw a spinning, lit cube using raw Three.js — no React, no R3F. By the end
> you'll know the four objects every WebGL scene needs, so that when R3F hides them in the
> next module, you know exactly what it's hiding.

**You'll build:** `src/client/vanilla.ts` + a tiny `src/client/main.tsx`.

---

## Concepts

WebGL (the browser's GPU API) is brutally low-level — hundreds of lines for one triangle.
**Three.js** is the library that makes it humane. Almost every Three.js scene is the same
four objects:

| Object | Job | Real-world analogy |
|---|---|---|
| `Scene` | holds everything you want to draw | the film set |
| `Camera` | the viewpoint + lens (fov, aspect, clip planes) | the camera |
| `Mesh` | one drawable thing = **geometry** (shape) + **material** (surface) | an actor/prop |
| `WebGLRenderer` | draws the Scene from the Camera onto a `<canvas>` | the act of filming |

And one verb: **render**. Do it ~60×/second in a loop and you have animation.

A `Mesh` is always two halves:
- **Geometry** — the vertices (BoxGeometry, SphereGeometry, or your own in Module 03).
- **Material** — how the surface responds to light. `MeshStandardMaterial` is physically
  based, so **it needs a light** — with none, it renders black. (`MeshBasicMaterial`
  ignores light, which is why we'll use it for the sky later.)

---

## Build it

We're going to bypass React entirely for this one module. `index.html` already loads
`/src/client/main.tsx`; we'll make that file hand off to plain Three.js.

### 1. Replace `src/client/main.tsx`

```tsx
import { startScene } from "./vanilla";

startScene(document.getElementById("root")!);
```

That's the whole entry: grab the `#root` div, give it to Three.js. Delete the old
`App.tsx` import — we're not using React this module. (You can leave `App.tsx` on disk;
we'll bring it back in Module 02.)

### 2. Create `src/client/vanilla.ts`

Build it up piece by piece. First the three core objects:

```ts
import * as THREE from "three";

export function startScene(container: HTMLElement) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#cfc8b8");

  const camera = new THREE.PerspectiveCamera(
    60,                                        // field of view, degrees
    window.innerWidth / window.innerHeight,    // aspect ratio
    0.1,                                       // near clip (closer = invisible)
    100,                                       // far clip (farther = invisible)
  );
  camera.position.set(2.5, 2.5, 3.5);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement); // creates & inserts the <canvas>
```

Now something to look at — a cube — and light so it's visible:

```ts
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: "#e8a33d" }),
  );
  scene.add(cube);

  const sun = new THREE.DirectionalLight("#ffffff", 2.5);
  sun.position.set(3, 5, 2);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight("#cdd4cc", "#6b5f4e", 1.0));
```

Handle resize, then the render loop:

```ts
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix(); // camera changes need this to take effect
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  renderer.setAnimationLoop((t) => {
    const time = t / 1000;          // t is milliseconds since start
    cube.rotation.x = time * 0.6;
    cube.rotation.y = time * 0.9;
    renderer.render(scene, camera); // THE line that actually draws a frame
  });
}
```

> `setAnimationLoop` is Three.js's built-in `requestAnimationFrame` wrapper — it hands you
> a timestamp and also works in VR. The single most important line is
> `renderer.render(scene, camera)`: nothing appears on screen until you call it.

The finished file is in the checkpoint if you want to compare.

---

## Run & observe

```bash
pnpm dev
```

An amber cube tumbling on a warm gray background. Resize the window — it stays crisp and
un-stretched (that's the resize handler doing its job).

Kill one light (comment out the `DirectionalLight`) and reload: the cube goes flat and
dim — proof that `MeshStandardMaterial` is genuinely reacting to light, not just showing a
color. Put it back before moving on.

---

## How real Ruderal does it

The real client **never** writes this boilerplate by hand — R3F does it (next module). But
the objects are identical. Peek at `packages/client/src/App.tsx`: the `<Canvas
camera={{ fov: 74, near: 0.1, far: 1500 }}>` prop is creating exactly this
`PerspectiveCamera`, and `shadows` / `gl={{ antialias: true }}` configure exactly this
`WebGLRenderer`. Everything you just typed is still there — just declared, not constructed.

---

## Exercises

1. **Two cubes.** Add a second `Mesh` at `x = -2` with a different color. (Hint: one
   `scene`, many meshes.)
2. **Sphere.** Swap `BoxGeometry` for `new THREE.SphereGeometry(0.7, 32, 16)`.
3. **Break it on purpose.** Set the camera's `far` to `2`. Why does the cube vanish?
   (It's now beyond the far clip plane.)
4. **Basic vs Standard.** Change the material to `MeshBasicMaterial`. Notice it's fully lit
   even with no lights — and looks flat, because it ignores them entirely.

---

## Checkpoint

```bash
pnpm checkpoint 01
pnpm dev
```

Files: `src/client/vanilla.ts`, `src/client/main.tsx`.

**Next:** [`02-r3f-scene.md`](./02-r3f-scene.md) — the identical scene, declaratively, in R3F.
