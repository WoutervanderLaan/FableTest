# 16 · Interpolation

> **Goal:** make remote players glide instead of stutter. The fix is a classic:
> render everyone else a fixed ~120 ms *in the past*, interpolating between the
> snapshots you've received.

**You'll build:** `src/client/net/interpolation.ts` (`SnapshotBuffer`) and update
`RemotePlayers` to use it.

---

## Concepts

The server syncs state ~10×/second, and packets arrive unevenly. If you snap each avatar to
the newest value the instant it arrives, motion is choppy — you're showing 10 discrete
positions per second on a 60 fps display, with jitter from network timing.

**The fix: buffer + delay.** Keep a short history of the snapshots you've received for each
remote entity, then render it at `now - 120ms`. Because you're looking slightly into the
past, you almost always have a snapshot *before* and *after* your render time, so you can
**interpolate** smoothly between them. The cost is a tiny, constant, unnoticeable delay on
other players' positions — a trade every online game makes.

Two details that matter:

- **Interpolate, don't extrapolate.** By rendering in the past you interpolate between known
  points. (Extrapolating into the future guesses, and guesses wrong at every direction
  change.) When there's no newer snapshot yet, hold at the latest rather than predict.
- **Shortest-arc yaw.** When blending facing, wrap the angle difference into `[-π, π]` so a
  turn from 179° to -179° rotates 2°, not 358°.

Your *own* player is never interpolated — you predict it locally for zero-latency response
(Module 17). Interpolation is only for entities whose truth lives on the server.

---

## Build it

- **`interpolation.ts`** — `SnapshotBuffer`: `push(x,y,z,yaw)` appends a timestamped snapshot
  (skipping duplicates) and trims history to ~2 s; `sample(renderT)` finds the two snapshots
  bracketing `renderT` and linearly interpolates position (with shortest-arc yaw). `INTERP_
  DELAY_MS = 120`.
- **`RemotePlayers`** — give each avatar its own `SnapshotBuffer`. Each frame: `push` the
  latest synced state into the buffer, then `sample(performance.now() - INTERP_DELAY_MS)` and
  place the avatar there. That's the only change from Module 14's renderer.

Copy both from the checkpoint; `SnapshotBuffer.sample` is the piece to read.

---

## Run & observe

```bash
pnpm server
pnpm dev        # two tabs
```

Walk around in one tab and watch the avatar in the other: it now **glides** smoothly instead
of hopping between positions. Strafe back and forth — the motion stays fluid through
direction changes (interpolation between real snapshots, not guessed extrapolation).

Experiment: set `INTERP_DELAY_MS` to `0` and you're back to stutter (no buffer to interpolate
across); set it to `500` and motion is glassy-smooth but other players lag noticeably behind
their "real" position. `120` is the usual sweet spot.

---

## How real Ruderal does it

`packages/client/src/net/interpolation.ts` is your `SnapshotBuffer`, essentially line-for-line
— same ~120 ms delay, same skip-duplicates, same shortest-arc yaw, same "hold at latest when
there's no newer snapshot." It's used for **every** networked entity Ruderal renders: remote
players, husks, projectiles, item drops. One small class, reused everywhere — which is why
Module 18D can render husks by dropping in the exact same buffer.

---

## Exercises

1. **Visualize the delay.** Also render a second, un-interpolated avatar (snapped to latest)
   in a different color, and watch it stutter next to the smooth one.
2. **Buffer length.** Log `buf.length` — how many snapshots does 120 ms of history hold at
   the server's patch rate?
3. **Velocity-aware.** For fast movers, try a slightly larger delay; for near-still entities,
   smaller. (Ruderal keeps it constant — is the complexity worth it?)
4. **Packet loss.** Randomly drop 20% of `push` calls (simulating loss) and confirm
   interpolation still looks fine — that robustness is the point.

---

## Checkpoint

```bash
pnpm checkpoint 16
```

Files: `src/client/net/interpolation.ts`, `src/client/scene/RemotePlayers.tsx`.

**Next:** [`17-prediction-reconciliation.md`](./17-prediction-reconciliation.md) — make your
*own* movement feel instant despite the server.
