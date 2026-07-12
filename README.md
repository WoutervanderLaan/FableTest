# RUDERAL — a location-derived block world

A persistent, shared, walkable voxel world derived from real geospatial data.
The current build is the **Westerkerk / Jordaan quarter of Amsterdam** — canals,
quays, bridges, houseboats, street trees, and ~1,500 real building footprints
as weathered, moss-grown ruins — as a **multiplayer shared canvas**: place and
break blocks together, watch unsupported structures collapse, throw things.

The aesthetic is **Ruderal Futurism**: post-apocalyptic but optimistic. The
rigid voxel grid is the damage; soft, grid-ignoring life is the hope.

## Run it

```sh
pnpm install
pnpm dev        # starts BOTH the zone server (:2567) and the client (vite)
```

Open the client, pick a name, enter. WASD moves, shift runs, space jumps
(swims up in canals). **Hold LMB** to break (blocks have durability),
**RMB** places from your inventory, **Q** throws, **1–5** select material.
Structures need a path to the ground: break the base and the rest falls.

The world is persistent: the server journals every edit and reconstructs
baseline+edits on restart (`packages/server/data/`).

## Tests

```sh
pnpm test   # integration suite: real server + real websocket clients
```

Covers: join/movement propagation with server-authoritative simulation and
input acking, edit propagation + reject rollback, multi-hit durability,
support-lattice collapse with drops, projectile impact damage, and byte-exact
world reconstruction across a server restart.

## Architecture

- `packages/shared` — engine-agnostic core used by baker, client, AND server:
  zonepack format, deterministic zonepack→voxel derivation (the base world is
  re-derived, never stored — persistence is a tiny delta overlay), greedy
  mesher with vertex AO, voxel collider, **the movement step shared by client
  prediction and server authority**, DDA raycast, support lattice, protocol.
- `packages/baker` — offline pipeline: Overture Maps GeoParquet + AWS Terrain
  Tiles → versioned `zonepack` (~64 KB gzipped for 512×512 m of Amsterdam).
- `packages/server` — authoritative Colyseus zone server. 20 Hz simulation of
  client inputs through the shared collider, 10 Hz snapshots, validated edits
  (reach/rate/rules/inventory), Rapier (voxels collider) for server-owned
  projectiles, support-lattice collapse, append-only edit journal.
- `packages/client` — Vite + React Three Fiber. Imperative chunk layer fed by
  a mesher worker pool; client-side prediction with rewind-replay
  reconciliation; ~120 ms interpolation for remote players; optimistic edits
  with confirm/timeout/reject rollback; lazy client Rapier for cosmetic
  collapse debris.

Colyseus schema carries only small state (players, projectiles, drops); voxel
data never crosses the wire except as compact edit pairs.

### Re-bake the zone

```sh
./packages/baker/scripts/fetch-overture.sh   # Overture GeoJSON via uv/pyarrow
pnpm bake
```

Change the `ZoneSpec` in `packages/baker/src/index.ts` (and the fetch bbox)
to bake a different place on Earth.

## Data sources & licensing

- **Overture Maps Foundation** — includes OpenStreetMap-derived data:
  **© OpenStreetMap contributors, ODbL**. Attribution renders in the HUD.
- **Terrain Tiles** (Mapzen / AWS Open Data) — elevation; attribution required.

## Deliberately not here yet

Economy/trading, creatures, alliances, multiple zones, accounts (identity is
a display name), mobile. Those are Phases 3–5 of the project plan.
