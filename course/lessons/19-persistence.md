# 19 · Persistence

> **Goal:** make the world survive a restart. Edits are journaled to disk and
> replayed on boot; players respawn where they logged off. All with plain files
> and interfaces shaped so a real database could drop in later.

**You'll build:** `src/server/persistence.ts` (`EditLog` + `PlayerStore`), wired into the
room; the client sends a stable `pkey`.

---

## Concepts

**Never store the whole world.** It's huge and mostly redundant (it's derived from a seed).
Instead, store only what can't be re-derived: the **edits**. On boot, regenerate the
deterministic baseline (`generateWorld`) and **replay the journal** on top. Baseline + journal
= the exact world, reconstructed. This is *event sourcing*, and it's how Ruderal persists too.

Two stores:

- **`EditLog`** — an **append-only** journal file. Every accepted edit appends one line
  (`packedCoord block`). Append-only is the cheapest possible durable write, and it's
  crash-safe: if the process dies mid-write, the torn final line is simply skipped on load.
- **`PlayerStore`** — a small `pkey → position` map in a JSON file, saved **atomically**
  (write a `.tmp` file, then `rename` it over the real one — `rename` is atomic on POSIX, so a
  reader never sees a half-written file).

**Identity without accounts.** Each browser mints a random `pkey` once and keeps it in
`localStorage`. It's not a login — just a stable handle so the server can say "oh, you again,
here's where you left off." Real accounts are a later concern (and a security topic of their
own).

**The interfaces are "DB-shaped" on purpose.** `EditLog.append/load` and `PlayerStore.get/
set/save` are exactly the operations you'd back with Postgres later — swap the file I/O for
SQL and nothing else changes. Designing the seam now is the lesson.

---

## Build it

- **`src/server/persistence.ts`** — `EditLog(dir)` with `load()` and `append(p, b)`;
  `PlayerStore(dir)` with `get`, `set`, and atomic `save()`. Copy from the checkpoint.
- **`room.ts`** — on create, take a `dataDir` option, `load()` the journal and **replay** it
  onto the fresh world, and load the `PlayerStore`. On each accepted edit, also
  `journal.append(...)`. On join, restore the player's saved position if the `pkey` is known
  (else spawn default) and remember the `pkey` for this session. On leave, save that player's
  position. Add `onDispose()` to flush the store when the room empties.
- **`index.ts`** — read `DATA_DIR` from env and pass it via `define(ROOM_NAME, ZoneRoom,
  { dataDir })`.
- **Client** — `App.tsx` mints a `pkey` (localStorage) and passes it to `Net.join`, which
  forwards it in `joinOrCreate`.

The world already folds `init.edits` in before meshing (Module 18), so persisted edits reach
clients automatically — no client change needed there.

---

## Run & observe

```bash
pnpm server        # terminal 1
pnpm dev           # terminal 2
```

Build something — a little amber tower. Then **stop the server** (Ctrl-C) and **start it
again**. Reload the client: your tower is still there. Check `data/world.edits.log` — your
edits, in plain text. Look at `data/players.json` — your `pkey` mapped to your last position;
rejoin and you spawn back there.

That's a persistent shared world. It'll keep everything every player builds, across restarts
and redeploys — which is exactly what we need before putting it online.

---

## How real Ruderal does it

- `packages/server/src/editlog.ts` is your `EditLog`, hardened: **micro-batched** flushes (it
  doesn't hit the disk on every single edit) and periodic **compaction** (rewriting the log to
  drop redundant history). Same append-only, same "baseline + journal = byte-exact world"
  guarantee — the integration test even asserts a byte-identical world across a restart.
- `packages/server/src/playerstore.ts` is your `PlayerStore`: cross-zone inventory + health
  keyed by a stable `pkey`, atomic tmp+rename writes, periodic flush. The `pkey`-in-
  localStorage identity model is exactly Ruderal's (`ruderal:pkey`).
- `packages/server/src/zoneservice.ts` adds **hibernation**: a zone's world loads on first
  join and unloads (after compacting) when the last player leaves, so idle zones cost only
  their on-disk journal. That's the scaling story (Module 21).

---

## Exercises

1. **Compaction.** Add an `EditLog.compact()` that rewrites the file from the current
   in-memory `editLog` (dropping nothing yet — then try dropping edits later overwritten by a
   newer edit to the same coord).
2. **Batched writes.** Buffer appends and flush every 250 ms instead of per-edit; confirm the
   world still restores correctly after a hard kill.
3. **Inventory.** Give players a block count in `PlayerStore` and decrement on place — a first
   step toward real survival.
4. **Two worlds.** Run two servers with different `DATA_DIR`s and confirm their journals are
   independent.

---

## Checkpoint

```bash
pnpm checkpoint 19
```

Files: `src/server/persistence.ts`, `src/server/room.ts`, `src/server/index.ts`,
`src/client/net/connection.ts`, `src/client/App.tsx`.

**Next:** [`20-deploy.md`](./20-deploy.md) — put it on the internet.
