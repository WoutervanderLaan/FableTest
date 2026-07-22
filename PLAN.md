# Architecture & Build Plan — Location-Derived Block World

## Context

Greenfield project (repo is empty): a persistent online block-building game on a stylized surface generated from real geospatial data. Solo senior TS/React dev, R3F and planet-scale streaming experience, willing to adopt Unity only if genuinely forced. Locked inputs from Q&A: **location-seeded now, GPS-live mobile later** (architecture must not preclude it); **structural-tier physics** (support/collapse, debris, projectiles — not vehicles/ragdolls); **dozens of concurrent players per zone** at v1.0.

Remaining assumptions (stated, not asked): desktop browser + keyboard/mouse is the primary v1 client; sessions are 20–60 min; the world is one global world, geographically partitioned into zones (not parallel server copies); monetization doesn't drive architecture yet. If any of these flip, the notes inline say what changes.

---

## 1. The pivotal fork: TypeScript end-to-end vs Unity

### Decompose it first — the engine question is really two questions

**The server question has only one answer.** A persistent shared world with building, an economy, and later hostile creatures must be server-authoritative — clients are untrusted input devices. And here's the part that kills half the Unity argument: **Unity does not solve this problem.** Unity's netcode offerings (NGO, Fusion, Mirror) are session-based room netcode for match-shaped games. A persistent, geographically-partitioned, hibernating world with a transactional economy is custom backend infrastructure in _any_ engine. Running Unity headless as your world server means one heavyweight process per region, C# ops, and per-instance licensing friction — it's how you burn a solo dev's year. You will write a custom server. The only question is the language, and for you that's TypeScript.

**So the fork is client-only.** And the client question decomposes into the three things Unity could actually buy you:

1. **Physics.** At structural tier, placed blocks are _static_ voxel colliders; dynamics are episodic (debris bursts on collapse, projectiles, a kinematic character controller). Rapier (Rust→WASM) handles hundreds of transient rigid bodies without strain, and recent versions ship a dedicated voxel collider shape built for exactly this. Critically, "structures gain emergent properties" is **not a rigid-body problem** — structural integrity is a support-graph algorithm on the block lattice (see §3.4). People who simulate buildings as jointed rigid assemblies in PhysX are solving the wrong problem expensively. **Physics does not force Unity at this tier.** It would at full-sandbox tier (vehicles, large articulated wrecks) — you chose structural, and I'd have argued you into it anyway.
2. **Mobile/GPS-live.** This is the one real Unity argument, and you deferred it. The hedge (below) makes it a Phase 5 decision instead of a day-1 tax.
3. **Tooling/content pipeline.** Scene editors and the asset store matter for content-heavy games. Your content is _generated from map data_ and blocks — the pipeline you need (geodata baker) doesn't exist in Unity either. You'd build it in C# instead of TS, worse.

**What TS-end-to-end buys that Unity can't:** one language across client, server, baker, and tooling for a solo dev; and — the technical kicker — **the same Rapier WASM build running on Node and in the browser**, so client-side prediction runs the _identical_ physics code the server runs. That collapses the hardest netcode problem (prediction/reconciliation divergence) from "two engines disagree" to "same code, same results." A Unity client + TS server hybrid forfeits exactly this and splits you across two ecosystems for zero current benefit.

### Where the web ceiling actually is (honest version)

It's not FLOPs and it's not physics. The real ceilings, in order:

- **Memory and GC.** Browsers give you ~2–4 GB effectively (mobile Safari more like 1–1.5 GB), and GC pauses under sustained meshing/allocation churn will eat your frame budget if you code idiomatically. You'll need pooled buffers, workers with transferables, and allocation discipline that React habits actively fight. This is the tax, and it's paid in style, not feasibility.
- **Mobile browsers.** iOS Safari WebGL quirks, thermal throttling, tab suspension, no reliable background execution. For _seeded_ play this is fine (Capacitor-wrapped later). For _GPS-live_ play it's the weak point — hence the Phase 5 gate.
- **No UDP.** WebSockets are TCP (head-of-line blocking). At dozens-per-zone and 10 Hz snapshots for a building game this is genuinely fine; WebTransport datagrams exist as an upgrade path when Safari catches up. This would matter for a twitch shooter; it doesn't for you.
- **No scene editor.** You will build your own debug/admin tooling (chunk inspector, zone viewer, netcode graphs). Budget for it; it's real time. On the flip side, your debug tooling is React, which you're faster at than anyone is at Unity editor scripting.

### Decision

**TypeScript end-to-end.** Three.js/R3F client, Node authoritative server, Rapier WASM shared on both sides, offline TS baker for geodata. **Unity re-evaluation gate at Phase 5** with explicit criteria: if GPS-live becomes core _and_ demands background location, native performance on mid phones, and app-store presence beyond what a Capacitor wrap delivers — build a second _native client_ against the same server. Because the server is engine-agnostic (binary protocol, no TS types on the wire), that decision replaces the cheapest layer and preserves everything else. That's the hedge: **engine choice stays a client-side decision as long as the server never assumes the client.**

---

## 2. Phased build plan

The risk core, in order of "kills the project if false": (1) real map data → a surface that's actually _fun and recognizable_, (2) low-latency shared building, (3) physics that feels real. Economy, creatures, and mobile are expensive but not existential. Phases prove risks in that order.

### Phase 0 — "One True Tile" (3–4 weeks, no multiplayer)

The single riskiest assumption is that voxelized real-world data produces a place worth playing in — not a mushy heightmap with noise on top.

- **In:** Offline baker: Overture GeoParquet (via DuckDB) + AWS Terrain Tiles → versioned binary "zonepack" (quantized heightfield, biome/land-use grid, water mask, building footprints stamped as ruin volumes, POI list, seed) for one hardcoded ~512×512 m zone you know personally. Browser client: voxelize, greedy-mesh in workers, walk around with a kinematic character controller. First-pass palette + fog + LUT (the visual style in §4 is cheap — validating it early is motivation and proof).
- **Out:** everything else. No server, no persistence, no editing.
- **Exit criterion:** someone who lives there looks at it and says "that's the canal / that's my street," and walking it feels like a _place_. If this fails, iterate the baker — nothing else matters yet.

### Phase 1 — MVP: the shared canvas (8–12 weeks)

- **In:** Authoritative Node server (Colyseus), **one zone**, ~16 players. Place/break blocks with optimistic local application + server validation/rollback. Player movement with client prediction + snapshot interpolation for others (10 Hz snapshots, ~120 ms interp buffer). Persistence as edit-deltas over the zonepack baseline (server restart preserves the world). Magic-link identity. Deploy on one cheap box.
- **Deliberately cut:** economy, durability, structural collapse, all dynamic physics beyond the character controller, creatures, alliances, multiple zones, accounts/profiles, mobile.
- **Exit criteria:** two players on different continents build together and it feels immediate (<150 ms perceived edit latency); server restart loses nothing; 60 fps on a mid-tier laptop; a weekend playtest with ~10 real humans doesn't fall over.

### Phase 2 — Physics & structure (6–8 weeks)

Rapier on both sides (same WASM build). Projectiles and thrown objects as server-owned bodies. Support-lattice structural integrity: unsupported clusters detach → convert to cosmetic client-side debris + server-side item drops. Block durability + damage visual states. This is where "real collisions, not placement snapping" gets proven.

### Phase 3 — World & economy (8–12 weeks)

Zone registry + many zones with hibernation (persist and unload when empty — this is what makes a planet affordable). Zone travel. Resource sourcing driven by baked land-use data (urban ruins yield salvage; wetlands yield biomass; the resource-to-terrain design happens here). Inventory + exchange with transactional integrity (single-writer zones, DB transactions for trades). Licensing/attribution compliance pass.

### Phase 4 — Inhabitants & conflict

Server-side creatures: utility-state AI, budgeted per tick, voxel-aware pathfinding (hierarchical over chunk columns). Siege events against structures — the Phase 2 support lattice is what makes attacks _mean_ something. Alliances/social. Architecture prep is cheap and done early: the server entity/snapshot system treats players as just one entity type from Phase 1.

### Phase 5 — Mobile & the GPS-live gate

Capacitor/PWA wrap of the web client first — cheap, honest test of mobile demand. Then the **Unity gate**: only if live-GPS play (background location, walking gameplay, store-grade polish) becomes the product's center does a native second client get built — against the unchanged server.

---

## 3. Subsystem recommendations

| Subsystem     | Primary                                                 | Alternative                                                  |
| ------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| Map features  | Overture GeoParquet + DuckDB (offline bake)             | Protomaps PMTiles / OSM extracts                             |
| Elevation     | AWS Terrain Tiles (Terrarium PNGs, free S3)             | Copernicus GLO-30                                            |
| Terrain model | Voxelized heightfield columns, 1 m grid                 | Smooth mesh + surface-snapped blocks (rejected)              |
| Blocks        | 32³ chunks, palette + RLE, delta-over-baseline          | Octrees (rejected — overkill for heightfield-dominant world) |
| Physics       | Rapier WASM, shared client/server                       | Jolt WASM; Unity/PhysX only via Phase 5 gate                 |
| Netcode       | Colyseus rooms + custom binary for voxel data           | Bare uWebSockets.js + hand-rolled protocol                   |
| Persistence   | Postgres (+PostGIS registry), edit journal + compaction | SQLite+Litestream (leaner), R2/S3 for blobs at scale         |
| Rendering     | Three.js; R3F shell, imperative voxel layer; WebGL2     | WebGPU via Three's WebGPURenderer when stable enough         |
| Hosting       | Single Hetzner/Fly box; zones-per-process               | Managed k8s (rejected until evidence demands it)             |

### 3.1 Map data & licensing

Bake offline; never hit third-party tile servers from game clients (ToS, cost, determinism). Overture gives you deduplicated buildings, land-use/landcover, water, roads, places — query regional GeoParquet with DuckDB in a Node baker. Elevation from AWS Terrain Tiles (Terrarium encoding, free, attribution required). **Licensing, honestly:** Overture's OSM-derived themes carry ODbL; share-alike applies to _derived databases_, while the rendered game is a "produced work" — safest posture: attribute prominently in-game, keep the bake pipeline's inputs/outputs cleanly separated from proprietary data, and be prepared to publish your extraction schema. Not a blocker; don't ignore it either. One flag: reconsider before _selling_ map-derived content per-region.

### 3.2 Coordinates, zones, terrain — the decision that deletes your hardest old problem

**Do not build a globe.** Your 3d-tiles/planet-renderer experience will tempt you toward a continuous streaming Earth; this game doesn't need it and it would import the floating-origin, LOD, and reprojection problems for nothing. The world is a set of **discrete geo-anchored zones** (~512×512 m), each with its own local ENU tangent plane, metric coordinates, 1 m voxel grid. Earth curvature across 512 m is ~2 cm — the flat-zone approximation is free. Web Mercator exists only for addressing source data tiles in the baker; gameplay space is local metric, so blocks are 1 m in Lagos and in Oslo. Zones are addressed by a global grid ID (quadkey or S2 cell); MVP travel between zones is a load transition, adjacency streaming is a later luxury.

**Terrain is voxels all the way down**, not a smooth mesh with blocks on top. One interaction model (dig anywhere, build anywhere), one meshing path, one collision path, and it _reads_ as a coherent world. Quantize DEM to 1 m; store per-zone base elevation offset; column RLE encoding since the world is heightfield-dominant. Real buildings become voxelized ruin volumes with resource content — recognizably your neighborhood, wrong and overgrown, which is the whole fantasy.

### 3.3 Block/structure representation

32³ chunks, palette-compressed + RLE. The load-bearing idea: **the base world is deterministically derivable from zonepack + seed, so persistence stores only player deltas.** The planet costs nothing until someone builds on it. Greedy meshing in a worker pool (transferables; a 32³ chunk meshes in low single-digit ms when optimized; port the hot loop to WASM only if profiling says so). Server needs no render meshes — it feeds voxel data straight to Rapier's voxel collider, updated incrementally on edits.

### 3.4 Physics

Rapier via WASM, **identical pinned build on Node and browser** — prediction and authority run the same code. Static world: per-chunk voxel colliders. Character: Rapier's kinematic character controller, shared module, client-predicted, server-verified. Dynamics are _episodic_: projectiles and gameplay-relevant bodies are server-owned and broadcast; collapse debris is cosmetic and client-local (server only spawns the item drops). **Structural integrity is not physics:** each block type has a support budget; support propagates from grounded blocks through the lattice; placement/removal triggers a bounded local BFS on the server (budgeted per tick, async for big cuts). Unsupported clusters detach and become debris + drops. This is how Valheim-style "emergent structural properties" is actually implemented, it's deterministic, cheap, cheat-proof — and it's a graph algorithm, i.e., your home turf.

### 3.5 Multiplayer

Server-authoritative, ~15–20 Hz sim tick, 10 Hz delta snapshots. Client predicts own movement, interpolates others (~120 ms buffer), applies own block edits optimistically with server ack/rollback — grid-aligned edits make conflicts rare and rollback trivial (that's a huge hidden advantage of block games over free-form ones). **Interest management comes free from geography:** zone = Colyseus room (dozens of players — trivially within budget: 30 players × ~40 B × 10 Hz ≈ 12 KB/s per client); within a zone, subscribe by chunk radius. Colyseus schema for small state (players, entities) only — chunk data and edit streams go as custom binary messages beside it; its schema sync would choke on voxel volumes. One Node process hosts many zones; empty zones hibernate to DB. Realistic capacity: dozens per zone comfortably, low hundreds per zone with effort, thousands of players _globally_ by assigning zones to processes behind a small registry/router. Anti-cheat from day one is just server validation: reach distance, rate limits, inventory as DB transactions. If Colyseus's ceiling ever bites, the protocol is already binary — swapping to bare uWebSockets.js is a contained refactor.

### 3.6 Persistence

Postgres from day one (economy and identity want relational + transactions anyway; PostGIS for the zone registry). World state = append-only edit journal per zone, compacted periodically into per-chunk delta blobs (bytea now, R2/S3 when size demands). No Redis until measured need. **Critical policy decided now:** a zone's zonepack baseline version is _frozen at first player edit_ — re-baking underneath builds silently breaks them. World-data upgrades apply to untouched zones; edited zones migrate deliberately or never (see hard problem #2).

### 3.7 Client rendering

Three.js. R3F for app shell, UI, diegetic elements; the voxel chunk layer is **imperative Three behind a thin React boundary** — chunk meshes must never pass through React reconciliation. WebGL2 baseline; Three's WebGPURenderer as opt-in later, not a dependency. InstancedMesh vegetation scattered from the landcover raster (blue-noise, thousands of instances, cheap). Post via pmndrs `postprocessing` (§4). Content-hash zonepacks served from CDN/R2; server serves only deltas and live state.

---

## 4. Visual language: **Ruderal Futurism**

Ruderal: plants that colonize disturbed ground. That's the Haraway brief made literal and buildable — the thesis lives in geometry: **the rigid human voxel grid is the damage; soft, grid-ignoring life is the hope.** Everything below implements that one opposition.

**Form & silhouette.** The substrate world is chunky 1 m voxels — ruins, terrain, roads all obey the grid. Life _breaks_ it: vegetation as crossed-quad instances with vertex-shader wind sway, moss decals bleeding over block edges, fungal clusters at non-90° angles. Player-crafted blocks read as "worked" via 45° bevels and half-steps (visual subgrid only; logic stays 1 m). Recognizability is the wonder: the player's actual street, voxelized, wrong, and alive.

**Palette (constrained, ~32 swatches, LUT-graded).** Substrate desaturated: weathered concrete `#B8B2A7`, rust `#8C4A32`, bleached asphalt `#9A9591`, silt `#7A6A55`. Life saturated but narrow-band: moss `#6FA24B`, algae teal `#3E8E7E`, lichen chartreuse `#C7C94F`, fungal cream `#E6DCC3`. **One reserved signal color — marigold amber `#E8A33D` — used exclusively for player agency:** crafted tech, active machines, UI accents. Nothing in nature or ruin may use it, so human intention always reads at a glance. MVP blocks need no textures: per-face palette indices + a cheap triplanar noise for large surfaces.

**Materials.** Matte, high-roughness everywhere; specular reserved for water and salvaged glass/emissives. Weathering is _data made visible_: a procedural shader grows moss on upward faces over block age, and durability shows as crack states — no floating health bars. The signature motif: **kintsugi repair** — a repaired block renders its mend as visible amber seams. Damage acknowledged and kept, not erased. That's "staying with the trouble" as a shader feature, and it's cheap.

**Lighting.** Single directional sun + hemisphere ambient, **time-of-day driven by the real local time of the zone's geography** — the world stays entangled with the real place, thematically load-bearing and nearly free. Small cascaded-shadow budget, height fog with warm-gray scattering, golden-hour color bias. Bloom strictly emissive-masked: bioluminescent resource veins (faint glowing seams in ground blocks marking harvestables — mycelial network as economy UI), salvage tech, kintsugi seams.

**Post stack** (pmndrs `postprocessing`, all cheap): LUT color grade (where the palette coheres), emissive-masked bloom, subtle film grain, light vignette, optional thin depth+normal edge line (dark-warm, readability not toon).

**Environmental storytelling motifs.** Infrastructure as shrine: pylons, bus stops, antennas (generated from Overture POIs/roads) become landmarks and waypoints. Water clarity as a legible world-health telltale. Roads persist as bleached markings the grid can't quite erase.

**UI feel.** Field notebook, not sci-fi HUD: off-white paper panels, stamped humanist-mono type (IBM Plex family), hand-drawn iconography, amber accents, diegetic compass/radio where cheap. The UI belongs to someone _tending_ a world, not piloting a mech.

---

## 5. The hard-problems list

1. **The geodata→gameplay bake pipeline.** One nice demo tile always works; the planet is an endless tail of coastline artifacts, bridges, data voids, multipolygon nightmares, and 40° slopes that voxelize into unclimbable cliffs. Determinism and versioning of zonepacks must be exact or persistence breaks. _Underestimate risk: high_ — you'll budget weeks; the tail is months, amortized forever.
2. **Persistent-world operations.** This is a _service_, not a program: zone lifecycle, hibernation, backups, schema migrations, abuse handling, cost control — and the frozen-baseline problem (#3.6) means world-data upgrades under player builds are a genuine unsolved-by-default migration policy you must own. Solo devs underestimate ops far more than code.
3. **The prediction/reconciliation long tail.** Making movement + optimistic edits + physics events feel _simultaneously_ correct at 150 ms is months of feel-tuning, not a feature you finish. The shared-Rapier trick and grid-aligned edits cut this substantially — it's still the netcode tax and everyone pays it.
4. **Sustained browser performance.** Not peak FPS — hour-two memory creep and GC hitching under continuous meshing. Requires pooled-buffer, worker-first discipline that React instincts actively fight. The web ceiling for this project is allocation discipline, not capability.
5. **Economy integrity under adversaries.** A location-derived economy invites GPS spoofing the moment location confers value (Phase 5 concern, design-relevant now), plus classic dup bugs and botting. Single-writer zones + transactional inventory from day one; treat every client message as hostile.

---

## 6. If approved — first execution steps (Phase 0)

1. Scaffold monorepo (pnpm workspaces): `packages/baker`, `packages/client`, `packages/shared` (voxel formats, zone math).
2. Baker: DuckDB query against Overture for one chosen zone + Terrarium DEM decode → zonepack v0 (heightfield, water mask, landcover grid, building stamps).
3. Client: zonepack loader → voxelization → greedy meshing in a worker → R3F shell with imperative chunk layer, kinematic walk controller, first palette/fog/LUT pass.
4. **Verification:** run it on a zone the team knows personally; walk it; the exit criterion is recognition ("that's my street") plus 60 fps on a mid laptop and meshing off the main thread (no frame spikes on chunk load). Commit and push to `claude/gifted-shannon-q9lfjx`.
