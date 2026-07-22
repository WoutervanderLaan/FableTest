# 18 · Networked editing

> **Goal:** the last core multiplayer piece — shared block edits. Break a block
> in one tab and it disappears in the other. Edits are optimistic (instant
> locally), authoritative (the server validates), and roll back if rejected.

**You'll build:** an `EditReq` type, server-side edit validation + broadcast, an event system
+ `place` on `Net`, and optimistic apply/rollback in `App` (with the controller routing edits
through it).

---

## Concepts

**Edits are messages, not schema.** The world is far too big to put in synced state, so a
block edit travels as a compact **message**: a single packed coordinate (`packXYZ`, from
Module 05) plus the block id. Everyone re-derives their local world from these edits.

**The authoritative edit flow:**

1. **Optimistic local apply.** You click; the client changes the block *immediately* (remesh)
   so it feels instant — and remembers the old block for possible rollback.
2. **Ask the server.** Send the edit request.
3. **Server validates** (in reach? in bounds? breaking a solid / placing into air?). If OK,
   it applies the edit to *its* world and **broadcasts** to everyone — including you (your
   optimistic change is now confirmed). If not, it sends *you* a `reject`, and you **restore**
   the old block.
4. **Others' edits** arrive on the same broadcast channel and apply locally.

This is the same optimistic-with-rollback pattern good apps use for any user action over a
network: act now, confirm later, undo if the server disagrees. It keeps building responsive
while the server stays the referee (no griefing blocks across the map, no placing inside
walls).

**Late joiners.** The server keeps an **edit log** (every accepted `[p, b]`) and sends it in
the `init` payload. A new client folds that history into its freshly-generated world before
meshing — so it sees the world as it *currently* is, not the pristine seed. (That log is also
the seed of persistence, Module 19.)

---

## Build it

- **`protocol.ts`** — add `EditReq { p, b }`. (`edits`/`reject` are `number[]`.)
- **Server `handleEdit`** — unpack the coord, check reach against the player's position and
  bounds, and that you're breaking a solid or placing into air. Valid → `setVoxel`, append to
  `editLog`, `this.broadcast(MSG.edits, [p, b])`. Invalid → `client.send(MSG.reject, [p])`.
  Also send `editLog` in the `init` payload.
- **`Net`** — a tiny `on(event, cb)` / `emit` fan-out (colyseus.js allows one handler per
  type, so we register `edits`/`reject` once and dispatch). Add `place(p, b)`.
- **`App`** — own edit application: `applyEdit(x,y,z,b)` applies locally, records the old
  block in an `optimistic` map, remeshes, and calls `net.place`. Subscribe to `edits` (apply
  + clear rollback + remesh) and `reject` (restore old + remesh). On join, fold `init.edits`.
- **`PlayerController`** — break/place now call the `edit(x,y,z,b)` prop instead of mutating
  the world directly.

Full files in the checkpoint.

---

## Run & observe

```bash
pnpm server
pnpm dev        # two tabs
```

Open two tabs. **Break and place blocks in one — they appear in the other**, in real time.
Build a little amber tower in tab A and watch it rise in tab B. Now open a *third* tab: it
loads and immediately shows the tower (the edit log, folded in on join). Refresh any tab —
the edits survive, because the server still holds them (until it restarts; that's Module 19).

See validation bite: aim at a block far across the map (you can't — reach limits the
raycast), or hack the client to `net.place` a distant coordinate, and the server rejects it;
your optimistic change snaps back. The world stays consistent no matter what a client sends.

---

## How real Ruderal does it

- `packages/shared/src/protocol.ts` packs coordinates with the same `packXYZ`, and voxel
  edits travel as compact `[coord, block]` messages, never through schema — exactly our
  design.
- `packages/server/src/rooms/ZoneRoom.ts` validates edits with reach checks, **token-bucket
  rate limiting**, inventory checks, and protected-block rules, then broadcasts — a
  hardened version of your `handleEdit`. It also triggers **support-lattice collapse** when
  you knock out a load-bearing block (Module 21).
- `packages/client/src/player/PlayerController.tsx` applies edits optimistically and rolls
  back on `reject` with a timeout — precisely the pattern you built, one step fancier.

---

## Exercises

1. **Block picker.** Let players place blocks other than amber (a hotbar). Validate the chosen
   block server-side.
2. **Rate limit.** Add a simple per-player edits-per-second cap on the server; reject the
   overflow. (This is Ruderal's token bucket, simplified.)
3. **Protected zone.** Make a region near spawn unbreakable (reject edits there). Feel how
   server authority enables rules clients can't bypass.
4. **Batched collapse.** When you break a block, also break the one above it and broadcast
   both in one `edits` array — a taste of multi-block updates.

---

## Checkpoint

```bash
pnpm checkpoint 18
```

Files: `src/shared/protocol.ts`, `src/server/room.ts`, `src/client/net/connection.ts`,
`src/client/PlayerController.tsx`, `src/client/App.tsx`.

---

## Part 4 complete 🎉 (core)

You have **real multiplayer**: a server-authoritative world where players see each other move
smoothly, movement feels instant via prediction, and block edits are shared and validated.
This is a genuine online game. The deep-dive adds enemies; then Part 5 makes it persist and
puts it on the internet.

**Next:** [`18D-living-world.md`](./18D-living-world.md) *(optional)* — or jump to
[`19-persistence.md`](./19-persistence.md).
