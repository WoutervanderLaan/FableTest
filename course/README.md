# Building Ruderal — a course

**Learn React Three Fiber, Three.js, GLSL shaders, and online multiplayer by rebuilding
this exact project from an empty file.**

This course teaches four things at once:

1. **Three.js** — the WebGL engine under everything here.
2. **React Three Fiber (R3F)** — driving Three.js declaratively from React.
3. **Shaders (GLSL)** — the sky, the voxel look, the swaying grass.
4. **Online multiplayer** — a server-authoritative Colyseus game server, deployed for real.

The finish line is **mini-Ruderal**: a small voxel world you walk around in first person,
edit blocks in, lit with custom shaders and postprocessing, with real multiplayer (see
other players move, share block edits), running on a server you deploy to the internet.

It's a trimmed clone of the full **Ruderal** project in this repo (`packages/`). Every
lesson ends with a **"How the real Ruderal does it"** box that points at the actual source
file it mirrors — so finishing the course also means you can read and extend the real
codebase.

---

## Who this is for

You're comfortable with **TypeScript and React**. You do **not** need any Three.js, WebGL,
GLSL, or game-networking experience — we start from zero on all four.

If you're rusty on React 19 (`createRoot`, hooks, refs) skim a refresher first; we won't
re-teach React itself.

---

## How the course is laid out

```
course/
  README.md          <- you are here (the syllabus)
  lessons/           <- one markdown lesson per module, in order (00 → 21)
  mini-ruderal/      <- YOUR workspace: the app you build up, module by module
  checkpoints/       <- "answer key" snapshots: the finished src/ after each module
```

- **`mini-ruderal/`** is where you write code. It starts as a near-empty scaffold.
- **`checkpoints/NN-name/`** holds the finished `src/` for module `NN`. If you get stuck or
  want to check your work, load it (see below). The very last checkpoint is the complete
  mini-Ruderal.

### One-time setup

```bash
cd course/mini-ruderal
pnpm install          # installs everything the whole course needs, once
pnpm dev              # open the printed http://localhost:5173 — you should see a welcome card
```

> Using npm instead of pnpm is fine: `npm install`, `npm run dev`, etc.

### Working through a lesson

1. Open `lessons/NN-*.md` and read the **Goal** + **Concepts**.
2. Write the code in `mini-ruderal/src/` as the lesson walks you through it.
3. `pnpm dev` and check the **Run & observe** section — does it match?
4. Stuck, or want to compare? Load the checkpoint:
   ```bash
   pnpm checkpoint 03        # backs up your src/, then loads checkpoints/03-*/src
   pnpm dev
   ```
   Your work is never destroyed — it's moved to `src.bak-<timestamp>/`. Run
   `pnpm checkpoint` with no argument to list all checkpoints.

### Running the multiplayer server (from Part 4 on)

```bash
pnpm server           # starts the Colyseus server on ws://localhost:2567
pnpm dev              # in a second terminal, the client
```

---

## Syllabus

Each module builds directly on the last. `D` modules are **optional deep-dives** — skip
them on your first pass and come back to push one topic toward full-Ruderal fidelity.

### Part 0 — Orientation
- **00 · Orientation** — the finish line, the four topics, the repo mental model, how to run checkpoints.

### Part 1 — Three.js & R3F foundations
- **01 · Three.js from scratch** — scene, camera, renderer, mesh, render loop (no React).
- **02 · The same scene in R3F** — `<Canvas>`, declarative meshes, `useFrame`, `useThree`.
- **02B · Devtools — a debug panel & an inspection camera** — a selection-aware control panel where adding a slider is one line, plus orbit/pan/zoom/WASD camera with frame-rate-independent damping. Everything after this is tuned against it.
- **03 · Geometry by hand** — `BufferGeometry`: positions, normals, colors, indices. The foundation of everything voxel.
- **04 · Light, shadow, fog & sky** — a directional sun with shadows, hemisphere fill, fog, a sky dome.

### Part 1B — The model-based path *(optional branch)*
Everything so far generates its own geometry. These three modules cover the other way to fill a
scene: loading art somebody authored. Skip them if you only care about the voxel world; do them
(and then jump to Part 3) if your goal is a hand-composed 3D scene rather than a generated one.
- **04B · Loading glTF models** — `GLTFLoader`, Suspense, cloning, and the ownership rules for disposal.
- **04C · Textures, UVs & PBR maps** — UV space, wrapping & repeat, the sRGB-vs-linear rule, normal/roughness maps, atlases.
- **04D · Animation & scene composition** — `AnimationMixer` and glTF clips, frame-rate-independent damping, camera rigs and layout.

### Part 2 — The voxel world
- **05 · Voxel data model** — a `Uint8Array` world, a block palette, coordinate packing.
- **06 · A naive mesher** — turn voxels into a mesh, one face at a time. Now you can *see* the world.
- **07 · First-person controller** — pointer lock, WASD, gravity, collision. Walk around.
- **07B · Physics with Rapier** — rigid bodies and a voxel collider, and why the *player* stays hand-rolled.
- **08 · Raycast & edit** — look at a block, break it, place one. Minecraft-in-miniature.
- **08D · Greedy meshing + AO + web worker** *(deep-dive)* — the real, fast mesher off the main thread.
- **08E · The math of voxels & bytes** *(deep-dive)* — derives every formula in Part 2: the index
  arithmetic, bit-packing and hex, DDA, AO, greedy merging, and binary file formats.

### Part 3 — Shaders
- **09 · GLSL fundamentals** — the vertex→fragment pipeline, uniforms, varyings, a raw `ShaderMaterial`.
- **09B · Shader math I — the toolkit** — `smoothstep`, `mix`, distance, polar, waves, `fract`, curves, and lighting from dot products.
- **09C · Shader math II — noise, SDFs & warping** — hashing → value noise → fbm → domain warping; signed distance fields, `smin`, dithering.
- **10 · The sky-dome shader** — a real gradient sky with a warm sun glow.
- **11 · Patching materials (`onBeforeCompile`)** — per-voxel color jitter + instanced, wind-swayed grass.
- **11B · An "infinite" grass field** — triangle blades on a camera-following grid, hashed from world position so it never boils; gusting wind, backlit translucency, tilted normals.
- **11C · Bushes from leaf cards** — Fibonacci-sphere placement, a deformed volume, the sphere-normal lighting trick, an SDF leaf silhouette, and seeds for diversity.
- **12 · Postprocessing** — `EffectComposer` with Bloom, Vignette, Noise.
- **12D · Shader techniques** *(deep-dive)* — translucent water, a fresnel rim, noise fields.
- **12E · WebGPU & TSL** — the same scene on `WebGPURenderer`; module 10's sky rewritten as a node graph, with the honest trade-offs.
- **12F · Performance & profiling** — draw calls, instancing, culling, disposal, and reading `renderer.info`.

### Part 4 — Multiplayer
- **13 · Netcode mental model + Colyseus** — why servers are authoritative; stand up a room.
- **14 · Rooms & state sync** — `@colyseus/schema`, join/leave, render other players.
- **15 · Server-authoritative movement** — stream inputs; one movement function runs on both sides.
- **16 · Interpolation** — render remote players smoothly, a little in the past.
- **17 · Prediction & reconciliation** — make *your* movement feel instant despite the server.
- **18 · Networked editing** — shared block edits, packed messages, optimistic updates with rollback.
- **18D · A living world** *(deep-dive)* — enemy AI, server-side physics, or trading.

### Part 5 — Persist & ship
- **19 · Persistence** — a file-backed edit log + player store; a world that survives restarts.
- **20 · Deploy it online** — Dockerize the server, deploy to Fly.io, host the client, go live.

### Part 6 — Bridge to full Ruderal
- **21 · Where to go next** — a guided read of the parts we simplified (geospatial baking,
  zone hibernation, structural collapse, the test harness), with pointers for extending
  your mini-Ruderal toward the real thing.

---

## A note on style

We deliberately **don't use `@react-three/drei`** (the popular R3F helper library), because
the real Ruderal doesn't either — and because building things like the camera controller
and geometry by hand is exactly how you actually learn Three.js. Once you've done it the
hard way, reaching for drei later is an informed choice, not a crutch.

Module **04B** is where that policy gets tested: it builds a suspense-aware glTF loader by hand
and then shows you drei's one-line equivalent in a callout, so you can see exactly what the
helper is doing for you. Same principle — do it the hard way once, then choose.

Ready? Open [`lessons/00-orientation.md`](./lessons/00-orientation.md).
