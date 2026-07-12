# RUDERAL — a location-derived block world

**Phase 0: "One True Tile."** A stylized, walkable voxel world derived from real
geospatial data — this milestone bakes one 512×512 m zone (the Westerkerk /
Jordaan quarter of Amsterdam) and renders it in the browser: canals, quays,
bridges, houseboats, street trees, and ~1,500 real building footprints as
weathered, moss-grown ruins.

The aesthetic is **Ruderal Futurism**: post-apocalyptic but optimistic. The
rigid voxel grid is the damage; soft, grid-ignoring life is the hope.

## Run it

```sh
pnpm install
pnpm dev          # serves the client with the committed Amsterdam zonepack
```

Click to enter. WASD to move, shift to run, space to jump (and to swim up if
you walk into a canal). Esc releases the pointer.

## Re-bake the zone (optional)

The baked artifact (`packages/client/public/zones/*.zpk.gz`, ~64 KB) is
committed, so baking is only needed when changing the pipeline or the zone.

```sh
./packages/baker/scripts/fetch-overture.sh   # Overture GeoJSON via uv/pyarrow (once)
pnpm bake                                    # DEM tiles fetch + rasterize + encode
```

To bake a different place: change the `ZoneSpec` in `packages/baker/src/index.ts`
and pass the matching padded bbox to the fetch script.

## Architecture (Phase 0 slice)

- `packages/shared` — engine-agnostic core, shared by baker/client (and the
  Phase 1 server): zonepack binary format, deterministic zonepack→voxel
  derivation (ruin erosion, bridges, trees are all seeded hashes — the base
  world is never persisted, only re-derived), greedy mesher with vertex AO,
  kinematic AABB voxel collider.
- `packages/baker` — offline pipeline: Overture Maps GeoParquet (buildings,
  water, land use, road segments incl. bridge ranges, tree points) +
  AWS Terrain Tiles elevation → versioned `zonepack`.
- `packages/client` — Vite + React Three Fiber. R3F for shell/HUD; the chunk
  layer is imperative three.js fed by a mesher worker pool, nearest-first.
  One 512 m zone in local tangent-plane coordinates — no globe.

## Data sources & licensing

- **Overture Maps Foundation** (buildings, transportation, base themes) —
  includes OpenStreetMap-derived data: **© OpenStreetMap contributors, ODbL**.
  Attribution is rendered in the client HUD; keep it there.
- **Terrain Tiles** (Mapzen / AWS Open Data) — elevation; attribution required.

Raw fetched GeoJSON lives in `packages/baker/data/` (gitignored); refetch with
the script above.

## What is deliberately NOT here

No multiplayer, no server, no block editing, no physics beyond the kinematic
controller, no economy, no creatures. Those are Phases 1–4 of the project
plan; Phase 0 exists to prove one thing — that voxelized real-world data
produces a *recognizable place worth playing in*.
