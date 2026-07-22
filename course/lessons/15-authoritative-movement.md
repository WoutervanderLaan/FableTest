# 15 · Server-authoritative movement

> **Goal:** stop trusting clients. Instead of reporting positions, clients send
> *inputs*; the server runs the SAME `stepPlayer` you wrote in Module 07 and the
> result is the truth. This is the payoff of everything living in `src/shared/`.

**You'll build:** an input queue + simulation tick on the server, `sendInputs` on `Net`, and
input batching in `PlayerController`.

---

## Concepts

**One movement function, run in two places.** The client already predicts locally by calling
`stepPlayer` each frame (Module 07). Now the *server* calls the exact same `stepPlayer`, on
the exact same world (same seed), with the exact same inputs. Same code + same data + same
inputs ⇒ the two sides compute the same result, down to floating-point noise. That agreement
is the entire foundation of authoritative netcode — and it only works because `stepPlayer`
is pure, shared code with no client-only dependencies.

**The mechanism:**

- Each input is stamped with a **sequence number** (`seq`) and the player's facing (`yaw`).
- The client streams batches of inputs to the server (~20×/second).
- The server **queues** them and, on a fixed **20 Hz simulation tick**
  (`setSimulationInterval`), drains each queue by running `stepPlayer` per input. The
  resulting position lands in the schema and syncs to everyone.
- The server records the last `seq` it applied in `lastSeq` — a receipt the client will use
  for reconciliation in Module 17.

A neat trick: our `PlayerS` schema already has exactly the fields `PlayerPhys` needs
(`x,y,z,vx,vy,vz,grounded,swimming`), so the server can simulate *straight onto the synced
state object*.

**What changes for the player feel?** For now, not much — your *own* movement still uses
local prediction (instant), and others render from authoritative state. The win is
structural: positions are now computed by the server, so a hacked client can send bogus
inputs but can't teleport (the server clamps and collides them like everyone else). Module 17
makes your own movement reconcile against this authority.

---

## Build it

- **Server** — replace the `move` handler with an `input` handler that pushes batches into a
  per-session queue. Add `setSimulationInterval(() => this.tick(), TICK_MS)`. `tick()` drains
  each queue with `stepPlayer(this.world, playerS, input)`, sets `yaw` and `lastSeq`. Create
  the queue on join, delete on leave.
- **`Net.sendInputs(batch)`** — `room.send(MSG.input, batch)`.
- **`PlayerController`** — each frame, build an `InputMsg` (`seq`, `dx/dz`, `dt`, `jump`,
  `run`, `yaw`), **predict** with it locally (as before), and push it to an outbox; flush the
  outbox ~20×/second. Same input drives local prediction *and* goes to the server — that's
  what keeps them in sync.

Full files in the checkpoint.

---

## Run & observe

```bash
pnpm server
pnpm dev        # two tabs
```

It looks almost identical to Module 14 — two players walking around — but the plumbing is now
honest. To *see* the authority, watch the server: it's the thing computing every position.
Try setting `WALK_SPEED` differently on client vs. server (temporarily) and you'll see the
remote avatar (server truth) drift from what that client "intended" — proof the server is in
charge. Put it back.

> Your *own* movement may occasionally feel a hair off if prediction and server disagree
> (e.g. at a wall). That tiny disagreement is exactly what Module 17 reconciles away.

---

## How real Ruderal does it

`packages/server/src/rooms/ZoneRoom.ts` runs a 20 Hz tick (`TICK_MS = 50`) that simulates
every player through the shared `stepPlayer`, exactly like your `tick()`. The same file also
steps husks and projectiles in that loop (Module 18D). And `movement.ts` — the function being
run — is *byte-identical* to the one your client predicts with. The whole architecture of the
game rests on that shared function; you've now seen it run on both sides.

---

## Exercises

1. **Anti-cheat, felt.** Add a server clamp (already partly there via world bounds) and log
   when a client's predicted position diverges from the server's by more than, say, 2 blocks.
2. **Tick rate.** Change `TICK_MS` to 100 (10 Hz) and 25 (40 Hz). Feel the tradeoff between
   CPU and responsiveness of *other* players.
3. **Input inspection.** Log batch sizes server-side. At 60 fps with a 50 ms flush, how many
   inputs per batch? Does it change when the tab is backgrounded?
4. **Idle optimization.** Skip sending a batch when there was no input and no movement.

---

## Checkpoint

```bash
pnpm checkpoint 15
```

Files: `src/server/room.ts`, `src/client/net/connection.ts`, `src/client/PlayerController.tsx`,
`src/client/App.tsx`.

**Next:** [`16-interpolation.md`](./16-interpolation.md) — make other players move smoothly.
