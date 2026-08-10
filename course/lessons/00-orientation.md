# 00 · Orientation

> **Goal:** understand what you're building, why it's built this way, and how to move
> through the course. No code yet — just a map. 10 minutes.

---

## The finish line

By module 20 you'll have **mini-Ruderal**: open a browser, spawn into a small blocky
world, walk around in first person, break and place blocks, watch grass sway and the sky
glow — and when a friend opens the same URL, you see *each other* moving in real time and
share the same edited world. The server it talks to is one you deployed to the internet.

That's the same shape as the full **Ruderal** project sitting in this repo's `packages/`
folder. Ruderal is a persistent, multiplayer, voxel survival-building world derived from
*real city map data*. We're building a smaller cousin — same bones, fewer organs.

## The four things you're learning, and where they live

| Topic | You'll feel it in | Real Ruderal file it mirrors |
|---|---|---|
| **Three.js** | every mesh, camera, light | all of `packages/client/src/scene/` |
| **React Three Fiber** | the `<Canvas>` and `<mesh>` JSX | `packages/client/src/App.tsx` |
| **Shaders (GLSL)** | sky, voxel surface, grass | `scene/SkyAndLight.tsx`, `scene/materials.ts`, `scene/Vegetation.tsx` |
| **Multiplayer** | seeing other players, shared edits | `packages/server/`, `packages/client/src/net/` |

You don't need to open those files yet. Each lesson pulls in the relevant one at the end.

## The mental model: four boxes

Ruderal (and mini-Ruderal) is split into four kinds of code. Hold this picture in your head
for the whole course:

```
┌─────────────┐     inputs / edits      ┌─────────────┐
│   CLIENT    │ ──────────────────────▶ │   SERVER    │
│ (browser)   │                         │ (node)      │
│ R3F + Three │ ◀────────────────────── │  Colyseus   │
│  + shaders  │   authoritative state   │  authority  │
└─────────────┘                         └─────────────┘
        │                                      │
        └──────────────┬───────────────────────┘
                       ▼
                ┌─────────────┐
                │   SHARED    │  voxel data, movement math, the wire protocol.
                │  (pure TS)  │  The SAME code runs on client AND server.
                └─────────────┘
```

- **Client** — what runs in the browser. Renders the world (Three.js/R3F/shaders), reads
  your keyboard/mouse, talks to the server.
- **Server** — the referee. It owns the *real* state of the world and every player. The
  client only ever *asks* to move or edit; the server decides what actually happened.
- **Shared** — the clever part. Voxel math, the movement/physics step, and the message
  format are written **once** and imported by *both* client and server. This is why your
  movement can feel instant (the client predicts using the same code the server will use to
  confirm). You'll build this in Parts 2 and 4.
- *(The full Ruderal has a fourth box, **baker**, that turns real-world map data into
  worlds. We skip it — module 21 shows you where it lives.)*

The full project realizes these as a **pnpm monorepo**: `packages/shared`, `packages/client`,
`packages/server`, `packages/baker`. Our mini version keeps it simpler — one app with
`src/client/`, `src/server/`, and `src/shared/` folders — but the *architecture* is the same,
and that's the point.

## Why "server-authoritative"?

The tempting way to build multiplayer is: each browser tracks its own player and tells
everyone else "here's where I am." That's **client-authoritative**, and it's a cheater's
paradise — any client can claim anything.

Ruderal is **server-authoritative**: the server simulates everyone and is the single source
of truth. Clients send *intentions* ("I'm holding W", "I want to break this block") and
render whatever state the server hands back. The whole craft of Part 4 — prediction,
reconciliation, interpolation — exists to make that authoritative model *feel*
instantaneous despite the network round-trip. It's the same approach Valve, Minecraft, and
basically every serious multiplayer game use.

## How to move through the course

1. **Work in `mini-ruderal/src/`.** That's your sandbox. It starts almost empty.
2. **Follow the lesson**, typing the code yourself. Typing beats copy-paste for learning —
   your fingers remember what your eyes skim.
3. **Run it** (`pnpm dev`) and check the *Run & observe* section.
4. **Stuck?** Load that module's checkpoint:
   ```bash
   pnpm checkpoint 03     # from inside course/mini-ruderal
   ```
   It backs up your `src/` and drops in the finished version. Diff it against your attempt
   to see what differs.

Each lesson has the same shape: **Goal → Concepts → Build it → Run & observe → How real
Ruderal does it → Exercises → Checkpoint**.

## Setup check

If you haven't yet:

```bash
cd course/mini-ruderal
pnpm install
pnpm dev
```

Open the printed URL. You should see a paper-colored **"Mini-Ruderal"** welcome card that
says the scaffold works. If you do, you're ready.

That card is plain HTML — no 3D at all. That's deliberate: in the next module we throw it
away and draw our first triangle with raw Three.js, so you see exactly what R3F is doing
for you before you let it do it.

---

**Next:** [`01-threejs-from-scratch.md`](./01-threejs-from-scratch.md) — a spinning cube,
the hard way.
