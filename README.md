# RUDERAL — a location-derived block world

A persistent, shared, walkable voxel world derived from real geospatial data.
Two **Amsterdam** zones ship today — the dense **Westerkerk / Jordaan** canal
ruins (salvage-rich) and the overgrown **Vondelpark** (biomass-rich) — as a
**multiplayer survival-building world**: place and break blocks together, watch
unsupported structures collapse, harvest regenerating resource nodes drawn from
the real land use, trade with other players, travel between zones carrying your
inventory, and fend off husks that hunt you and besiege what you build.

The aesthetic is **Ruderal Futurism**: post-apocalyptic but optimistic. The
rigid voxel grid is the damage; soft, grid-ignoring life is the hope.

## Run it

```sh
pnpm install
pnpm dev        # starts BOTH the zone server (:2567) and the client (vite)
```

Pick a name and a zone, enter. WASD moves, shift runs, space jumps (swims up in
canals). **Hold LMB** breaks (blocks have durability), **RMB** places from your
inventory, **Q** throws, **F** strikes creatures, **1–5** select material,
**T** opens a trade with the nearest player, **M** travels to another zone.
Structures need a path to the ground: break the base and the rest falls. Urban
ruins yield salvage; parks yield biomass; harvested nodes regrow over time.

The world is persistent: the server journals every edit, saves per-player
inventories, and reconstructs zones on demand (`packages/server/data/`).

## Tests

```sh
pnpm test   # integration suite: real server + real websocket clients
```

36 checks across all four phases: server-authoritative movement + input acking,
edit propagation + reject rollback, durability, support-lattice collapse,
projectile impact, **multi-zone isolation + hibernation**, **resource-node
harvest with multi-drop + regeneration**, **atomic player-to-player trading**,
**cross-zone inventory persistence**, **husk combat (chase / melee / death /
loot) and structure siege**, and byte-exact world reconstruction across a
server restart.

## Architecture

- `packages/shared` — engine-agnostic core used by baker, client, AND server:
  zonepack format, deterministic zonepack→voxel derivation (the base world is
  re-derived, never stored — persistence is a tiny delta overlay), greedy
  mesher with vertex AO, voxel collider, **the movement step shared by client
  prediction and server authority**, DDA raycast, support lattice, protocol.
- `packages/baker` — offline pipeline: Overture Maps GeoParquet + AWS Terrain
  Tiles → versioned `zonepack` (~64 KB gzipped for 512×512 m of Amsterdam).
- `packages/server` — authoritative multi-zone Colyseus server. A `ZoneService`
  loads worlds on demand and **hibernates** them when empty (one process hosts
  many zones; a zone nobody visits costs only its journal on disk, and wakes up
  with its resource nodes regrown). Per zone: 20 Hz simulation of client inputs
  through the shared collider, 10 Hz snapshots, validated edits, Rapier voxels
  collider for projectiles, support-lattice collapse, resource-node harvest with
  scheduled respawn, atomic proximity trading, and husk AI (`CreatureManager` —
  creatures reuse the *same* shared movement step players do). A `PlayerStore`
  persists per-player inventory + health keyed by a stable client key, so
  inventory survives rejoin and travels between zones.
- `packages/client` — Vite + React Three Fiber. Imperative chunk layer fed by
  a mesher worker pool; client-side prediction with rewind-replay
  reconciliation; ~120 ms interpolation for remote players and husks; optimistic
  edits with confirm/timeout/reject rollback; lazy client Rapier for cosmetic
  collapse debris; zone-select + travel + trade overlays; health/combat HUD.

Colyseus schema carries only small state (players, husks, projectiles, drops);
voxel data never crosses the wire except as compact edit pairs.

### Re-bake / add a zone

```sh
./packages/baker/scripts/fetch-overture.sh <minLon,minLat,maxLon,maxLat> <zoneId>
pnpm bake            # bakes all zones in packages/baker/src/index.ts
pnpm bake <zoneId>   # or just one
```

Add an entry to `ZONES` in `packages/baker/src/index.ts` to bake a different
place on Earth; the merged `zones.json` manifest drives the in-game zone list.

## Data sources & licensing

- **Overture Maps Foundation** — includes OpenStreetMap-derived data:
  **© OpenStreetMap contributors, ODbL**. Attribution renders in the HUD.
- **Terrain Tiles** (Mapzen / AWS Open Data) — elevation; attribution required.

## Deliberately not here yet

Alliances/social structures, accounts with real identity (identity is a bearer
key + display name), and mobile. Those are the remaining Phase-4 social layer
and Phase 5 of the project plan.
