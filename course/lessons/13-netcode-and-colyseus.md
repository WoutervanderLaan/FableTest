# 13 · Netcode mental model + Colyseus

> **Goal:** understand the model that makes real multiplayer games work — and
> stand up an actual server your client connects to. By the end, you join a
> Colyseus room on load and see live connection status.

**You'll build:** `src/shared/protocol.ts`, `src/shared/schema.ts`, `src/server/` (index +
room), `src/client/net/` (connection + status), and HUD/App wiring.

---

## Concepts

**The one decision that shapes everything: who's authoritative?**

- **Client-authoritative**: each browser decides its own state ("I'm here now") and tells
  everyone. Simple, and a cheater's paradise — a hacked client can claim anything.
- **Server-authoritative**: the server owns the truth. Clients send *intentions* ("I'm
  holding W"); the server simulates and hands back reality. Every serious multiplayer game
  works this way. So will we (from Module 15).

**Colyseus** is a Node framework for authoritative realtime rooms. Three pieces:

- **Room** — one running match. It owns state and has lifecycle hooks (`onCreate`, `onJoin`,
  `onLeave`) and message handlers.
- **Schema** — a special class Colyseus *watches*. Mutate a field on the server and the
  change is automatically, efficiently synced to every client (just the diff). This is one
  of the two channels between server and client.
- **Messages** — explicit `room.send(type, data)` / `room.onMessage(type, …)` for everything
  that isn't continuous state (a block edit, a ping). The other channel.

**Two channels, on purpose.** Player positions belong in the *schema* (continuous, everyone
needs them). Voxel edits are *messages* (discrete, and the whole world is far too big to put
in schema). Keeping the schema tiny is a performance rule you'll respect all through Part 4.

**Determinism ties it together.** The server generates its world with the *same*
`generateWorld()` the client runs, so both sides share an identical baseline without
shipping it. (Same seed → same world, from Module 05.)

---

## Build it

This module adds a lot of scaffolding but little logic. Grab the files from the checkpoint;
here's the map and the why:

- **`src/shared/protocol.ts`** — the wire contract: `ROOM_NAME`, message keys (`MSG`), and
  payload types. Shared so client and server can't disagree. We declare the *full* message
  set now so names stay stable across Part 4; we wire handlers up as we go.
- **`src/shared/schema.ts`** — `PlayerS` (name, position, velocity, `lastSeq`, …) and
  `ZoneState` (a `MapSchema<PlayerS>`). Note the `declare` + `defineTypes` pattern and the
  comment explaining it — normal class fields would break the encoder under ES2022. Copy it
  exactly.
- **`src/server/room.ts`** — `ZoneRoom`: on create, make state + generate the world; on
  join, spawn a `PlayerS` and send an `init` payload; on leave, remove them. That's it — a
  lobby. No movement yet.
- **`src/server/index.ts`** — boot a Colyseus `Server`, `define(ROOM_NAME, ZoneRoom)`,
  `listen`. Run with `pnpm server`.
- **`src/client/net/connection.ts`** — a `Net` wrapper: `join` opens the room, waits for
  `init`, starts a ping/pong. One small surface for the rest of the app.
- **`src/client/net/status.ts`** + **`ui/Hud.tsx`** — a mutable status store the HUD polls
  (never per-frame React state).
- **`App.tsx`** — join on mount, store the `Net`, surface status.

---

## Run & observe

Two terminals, both in `course/mini-ruderal`:

```bash
pnpm server     # terminal 1 — [mini-ruderal] server on ws://localhost:2567
pnpm dev        # terminal 2 — the client
```

The HUD top-left reads **connecting… → online · 1 player · <n>ms**. Open a **second browser
tab** on the same URL and both flip to **2 players**. The server terminal logs each join and
leave. You're connected — nothing moves across the network yet, but the pipe is open.

Kill the server (Ctrl-C in terminal 1) and reload the client: the HUD shows **offline** with
the error. That's your `catch` in `Net.join` working.

---

## How real Ruderal does it

- `packages/server/src/app.ts` builds the same `new Server({ greet: false })` and
  `.define(ROOM_NAME, ZoneRoom)` — plus `.filterBy(["zoneId"])`, which gives **one room
  instance per geographic zone** (how Ruderal hosts a whole city of zones in one process).
- `packages/server/src/schema.ts` is our `schema.ts` grown up — same `declare`/`defineTypes`
  gotcha, with husks, projectiles, and drops added. The comment warning about class-field
  initializers is lifted straight from there; it's a real bug they hit.
- `packages/client/src/net/connection.ts` is our `Net` with more messages and a fan-out
  event system (which we'll add in Module 18).

---

## Exercises

1. **Name yourself.** Store a name in `localStorage` and pass it to `Net.join`; log it
   server-side. (The server already reads `options.name`.)
2. **Two rooms.** Add `.filterBy(["zoneId"])` and pass a `zoneId` on join; open two tabs with
   different ids and confirm the server makes two rooms (player counts stay separate).
3. **Reconnect.** On `room.onLeave`, flip `netStatus` and try to rejoin after a few seconds.
4. **Server log.** Add a heartbeat log of `this.state.players.size` every 5 seconds.

---

## Checkpoint

```bash
pnpm checkpoint 13
# terminal 1: pnpm server   terminal 2: pnpm dev
```

Files: `src/shared/protocol.ts`, `src/shared/schema.ts`, `src/server/index.ts`,
`src/server/room.ts`, `src/client/net/connection.ts`, `src/client/net/status.ts`,
`src/client/ui/Hud.tsx`, `src/client/App.tsx`.

**Next:** [`14-state-sync.md`](./14-state-sync.md) — see other players move.
