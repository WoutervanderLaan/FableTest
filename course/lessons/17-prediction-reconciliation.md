# 17 · Prediction & reconciliation

> **Goal:** the trickiest and most satisfying netcode idea. Your own movement
> must feel *instant* (no waiting for the server round-trip) yet stay *correct*
> (the server is authoritative). The answer: predict locally, then reconcile
> against the server by replaying your unacknowledged inputs.

**You'll build:** prediction + reconciliation in `PlayerController` (client-only — the server
already sends everything we need).

---

## Concepts

If you rendered your own player from the server's authoritative position, you'd feel every
millisecond of latency — press W, wait a round-trip, then move. Unplayable. So the client
**predicts**: it runs `stepPlayer` locally the instant you press a key (Module 15 already
does this).

But prediction drifts. The server might resolve a collision slightly differently, or reject a
move. So we **reconcile** every frame:

1. **Snap** your local state to the server's latest authoritative state — the confirmed
   *past* (it's ~half-a-round-trip old).
2. **Drop** every input the server has already applied (it told you how far it got via
   `lastSeq`).
3. **Replay** all your still-unacknowledged inputs on top, using the same `stepPlayer` — 
   reconstructing the *present* from the confirmed past.

Because the replay uses the same shared function on the same world, you land exactly where
the server *will* put you once it processes those inputs. If prediction was right (the common
case), nothing visibly changes. If it was wrong, you snap to truth — a tiny correction
instead of a permanent drift.

This is the canonical Quake/Overwatch/Minecraft model, and it only works because of the
discipline you've kept since Module 07: **one pure `stepPlayer`, shared by client and
server.**

---

## Build it

The server side is done (it already sends authoritative state + `lastSeq`). In
`PlayerController`:

- Keep two lists: `outbox` (inputs to send) and `pending` (inputs applied locally but not yet
  acknowledged).
- Each frame, build the input, push it to both lists, then reconcile:
  ```ts
  const self = net.current?.room.state.players.get(net.current.id);
  if (self) {
    // 1. snap to authoritative
    p.x = self.x; p.y = self.y; p.z = self.z;
    p.vx = self.vx; p.vy = self.vy; p.vz = self.vz;
    p.grounded = self.grounded; p.swimming = self.swimming;
    // 2. drop acknowledged inputs
    while (pending[0] && pending[0].seq <= self.lastSeq) pending.shift();
    // 3. replay the rest
    for (const inp of pending) stepPlayer(world, p, inp);
  } else {
    stepPlayer(world, p, input); // pre-connect: pure local prediction
  }
  ```
- Point the camera at the reconciled `p`. Flush the outbox ~20×/second as before.

Full file in the checkpoint. Notice the controller now takes the `net` ref (to read
authoritative self-state), not a `sendInputs` callback.

---

## Run & observe

```bash
pnpm server
pnpm dev
```

Your movement feels exactly as instant as the local-only version from Part 2 — because it
*is* local prediction — but it's now anchored to server truth every frame. To see
reconciliation actually fire, add artificial latency: Chrome DevTools → Network → throttling,
or add a `setTimeout` around the server's `input` handling. Even at 200 ms of lag, *your*
movement stays crisp (predicted), while other players sit ~120 ms back (interpolated). Walk
hard into a wall and you'll feel the correction stay invisibly small.

That combination — your input instant, everyone else smooth, the server in charge — is what
"good netcode" feels like. You built it.

---

## How real Ruderal does it

`packages/client/src/player/PlayerController.tsx` does exactly this: it batches inputs keyed
by `lastSeq`, and on each authoritative snapshot it snaps to the server state and **replays**
the unacked inputs through the shared `stepPlayer`. (It layers optimistic *edits* with
rollback on top — that's the next module.) The reason the real game can run a strict
server-authoritative simulation and still feel local is this exact loop.

---

## Exercises

1. **Show the correction.** Each frame, log the distance between your predicted position
   *before* reconciliation and the reconciled result. It should hover near zero and spike at
   collisions.
2. **Break determinism on purpose.** Add `+0.001` to gravity on the client only. Watch the
   per-frame correction grow — proof that client and server must run identical code.
3. **Lag spike.** Freeze the server tick for 500 ms (a `setTimeout` that blocks the queue).
   See your `pending` list grow, then drain and reconcile in one snap when it resumes.
4. **Extrapolation experiment.** Try *not* snapping to server state (pure local). It feels
   identical until a disagreement, then drifts forever — showing why reconciliation matters.

---

## Checkpoint

```bash
pnpm checkpoint 17
```

Files: `src/client/PlayerController.tsx`, `src/client/App.tsx`.

**Next:** [`18-networked-editing.md`](./18-networked-editing.md) — share the world, not just
the players.
