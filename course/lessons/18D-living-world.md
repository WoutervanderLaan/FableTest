# 18D · A living world *(deep-dive)*

> **Optional.** Add server-authoritative enemies — "husks" that wander and chase
> — to prove the payoff of the shared-`stepPlayer` design one more time: the same
> movement code that drives players and prediction now drives AI.
>
> **Goal:** spawn creatures on the server, give them a simple brain, sync them
> via schema, and render them on the client with the interpolation you already
> built.

**You'll build:** a `HuskS` schema + husk map, `src/server/creatures.ts` (a
`CreatureManager`), a tick hook in the room, and `src/client/scene/Husks.tsx`.

---

## Concepts

**AI is just another `stepPlayer` caller.** A husk has the same physics state as a player.
Its "brain" runs each tick and decides one thing: an input (a move direction, whether to
run). Then it hands that input to the *same* `stepPlayer`, against the *same* world, through
the *same* collider. It walks, falls, and bumps into walls exactly like a player — for free.
That's the third caller of your one movement function (client prediction, server authority,
now NPC AI).

**The brain** here is a two-state machine:
- **Chase** — if a player is within aggro range, steer straight at them and run.
- **Wander** — otherwise, pick a random heading every few seconds and amble.

**Server-authoritative, like everything else.** Husks live only on the server; their
positions sync to clients via a `MapSchema<HuskS>` in the state. Clients never simulate them
— they just render what the authoritative state says, smoothed through the **same
`SnapshotBuffer`** from Module 16. Rendering a husk is rendering a remote player with a
different mesh.

---

## Build it

- **`schema.ts`** — add `HuskS` (`x,y,z,yaw,state`) and a `husks: MapSchema<HuskS>` on
  `ZoneState`. Same `declare`/`defineTypes` pattern.
- **`server/creatures.ts`** — `CreatureManager(world, state)`: `spawn(n)` places husks at
  random surface points (both a physics record and a `HuskS` in state); `tick(dt)` runs each
  husk's brain → `stepPlayer` → copies the result into its `HuskS`. Read the `tick` — the
  nearest-player search and the chase/wander choice are the whole AI.
- **`server/room.ts`** — create the `CreatureManager`, `spawn(6)` on room create, and call
  `creatures.tick(TICK_MS / 1000)` inside the simulation tick, right after players.
- **`client/scene/Husks.tsx`** — a copy of `RemotePlayers` reading `state.husks`, with a
  hunched figure + glowing green eyes, interpolated ~120 ms in the past. Add `<Husks net={net}
  />` to the App.

Full files in the checkpoint.

---

## Run & observe

```bash
pnpm server
pnpm dev        # one or two tabs
```

Six husks roam the world. Stand still and watch one amble on its wander timer; walk toward it
and it locks on and **chases** you (running), pathing over the terrain with the same physics
you move by. Because they're server-driven, **every player sees the same husks in the same
places** — open two tabs and confirm a husk chasing you appears in the other tab too. And
they move smoothly, because they ride the Module 16 interpolation buffer.

Notice a limitation: husks can't jump, so a steep hill stops them (they'll pile up against
it). That's honest emergent behavior from reusing the player collider — and a fun thing to
improve.

---

## How real Ruderal does it

`packages/server/src/creatures.ts` is this, matured: a `CreatureManager` with a
wander → chase → **melee** → **siege** state machine, husks that attack players and batter
structures, a spawn cap, and periodic spawning — all reusing the shared `stepPlayer` for
movement, exactly like yours. The client renders them via `packages/client/src/scene/Husks.tsx`
(hunched figures, sickly-green emissive eyes) through the same `SnapshotBuffer`. Ruderal also
runs **projectiles** through a server-side Rapier physics world (`server/physics.ts`) and
supports atomic proximity **trading** between players — other directions the same "server
simulates, schema syncs, client renders interpolated" pattern can go.

---

## Exercises

1. **Give them jumps.** Let a husk jump when blocked and grounded (set `jump: true` in its
   input when it hasn't moved much recently). Watch them start climbing hills.
2. **Health & combat.** Add `hp` to `HuskS`; let a player's break-action damage a husk in
   reach; broadcast a hit and remove it at 0.
3. **A siege state.** When a husk reaches a player-placed block, have it "attack" the block
   (a timed edit that removes it) — Ruderal's siege behavior in miniature.
4. **Flocking.** Make husks avoid stacking by adding a small separation force to their input.

---

## Checkpoint

```bash
pnpm checkpoint 18D
```

Files: `src/shared/schema.ts`, `src/server/creatures.ts`, `src/server/room.ts`,
`src/client/scene/Husks.tsx`, `src/client/App.tsx`.

**Next:** [`19-persistence.md`](./19-persistence.md) — make the world survive a restart.
