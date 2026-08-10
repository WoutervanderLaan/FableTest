# 21 · Where to go next — a bridge to full Ruderal

> **Goal:** no new code — a guided read of the parts of the real project we
> *simplified*, so you can now open the actual `packages/` and understand it, and
> a map of how to push your mini-Ruderal toward the real thing.

You've built a real online voxel game and, along the way, rebuilt the bones of Ruderal. This
final module points you at the organs. Everything below is in this repo, and you now have the
background to read all of it.

---

## What you already understand

Open these and you'll recognize your own code, one level up:

| You built | Real Ruderal |
|---|---|
| `shared/mesher.ts` (naive) + `chunkMesher` (AO) | `packages/shared/src/mesher.ts` (greedy + AO) |
| `shared/movement.ts` `stepPlayer` | `packages/shared/src/movement.ts` (identical shape) |
| `shared/collide.ts` | `packages/shared/src/collide.ts` |
| `shared/raycast.ts` | `packages/shared/src/raycast.ts` |
| `scene/SkyAndLight.tsx`, `materials.ts`, `Vegetation.tsx` | same filenames, same techniques |
| `net/connection.ts`, `net/interpolation.ts` | same filenames |
| `server/room.ts`, `creatures.ts`, `persistence.ts` | `rooms/ZoneRoom.ts`, `creatures.ts`, `editlog.ts` + `playerstore.ts` |

That's most of the codebase already legible to you.

---

## What we simplified — and where it really lives

### 1. The world comes from real map data (`packages/baker`)
We generated terrain with value noise. Ruderal **bakes** worlds from real geospatial data:
building footprints and heights from **Overture Maps**, elevation from **AWS Terrain Tiles**.
Read the pipeline top-down:
- `packages/baker/src/index.ts` — the zone registry (what places exist).
- `bake.ts` — orchestrates a bake; `geojson.ts` (footprints), `dem.ts` (elevation),
  `raster.ts` (landcover) turn raw data into layers.
- `packages/shared/src/zonepack.ts` — the compact on-disk format; `voxelize.ts` turns a
  zonepack into a voxel volume (the richer sibling of your `generateWorld`, with weathered
  building shells, moss, canals). `packages/client/src/loader.ts` fetches + decompresses it.

**Extend yours:** swap `generateWorld` for a loader that reads a hand-authored heightmap PNG,
then try a tiny real-data bake.

### 2. Many worlds in one process (`zoneservice.ts`)
You ran one room. Ruderal runs **one room per geographic zone** (`.filterBy(["zoneId"])`) and
**hibernates** idle zones: a zone's world loads on first join and unloads (after compacting
its journal) when the last player leaves — so an unvisited zone costs only its file on disk.
- `packages/server/src/zoneservice.ts` — the lifecycle manager.
- "Travel" between zones is just leaving one room and joining another
  (`packages/client/src/App.tsx`).

**Extend yours:** add `.filterBy(["zoneId"])`, a second seed per zone, and a travel button.

### 3. Structures that collapse (`shared/support.ts`)
Break a load-bearing block in Ruderal and unsupported blocks above fall. A **support
lattice** flood-fills from the ground each edit; newly-unsupported blocks are removed and sent
as a `collapse` message, which the client turns into **Rapier physics debris**.
- `packages/shared/src/support.ts` — the support computation.
- `packages/client/src/scene/Debris.tsx` — lazy-loads Rapier, spawns falling rigid bodies.

**Extend yours:** on break, check the block directly above; if it's now floating, break it too
and cascade — a poor-man's collapse. Then read `support.ts` for the real flood-fill.

### 4. A living, fighting world
You added wandering/chasing husks (18D). Ruderal's husks have a full **wander → chase → melee →
siege** state machine (`packages/server/src/creatures.ts`), players **throw blocks** as
projectiles simulated in a server-side **Rapier** physics world
(`packages/server/src/physics.ts`), and players **trade** atomically by proximity
(`ZoneRoom.ts`). All of it is the same pattern you know: server simulates, schema syncs, client
renders interpolated.

### 5. It's tested (`packages/server/test/integration.ts`)
Ruderal has a 36-check integration suite that spins up a real server and real `colyseus.js`
clients over loopback WebSockets — asserting movement/acking, edit propagation + reject
rollback, durability across restart, collapse, projectiles, multi-zone isolation +
hibernation, trading, and **byte-exact world reconstruction**. It's the same kind of headless
smoke test that verified your netcode — worth reading as a model for testing realtime systems.
Run it: `pnpm --filter @ruderal/server test`.

---

## A suggested path from here

1. **Polish what you have.** Add a name-tag over avatars, a block-picker hotbar, and a simple
   inventory in `PlayerStore`.
2. **Do the deep-dives you skipped** (`08D` greedy meshing, `12D` water, `18D` husks) — each is
   a self-contained upgrade.
3. **Pick one "simplified" system above and grow it** in mini-Ruderal: cascading collapse, a
   second zone, or projectiles. Use the real file as your reference.
4. **Read the real `packages/` end to end.** Start at `packages/client/src/App.tsx` and follow
   the imports — you'll find very little that's now unfamiliar.

---

## That's the course

You came in wanting React Three Fiber, Three.js, shaders, and online multiplayer. You now
have all four, proven by a real thing you built from an empty file and shipped to the
internet: a lit, shadered, server-authoritative, persistent, multiplayer voxel world — a
working cousin of the project in this repo.

Go build something with it.

**← Back to the [syllabus](../README.md).**
