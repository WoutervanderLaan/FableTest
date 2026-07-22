# 14 · Rooms & state sync

> **Goal:** the first real multiplayer moment — open two tabs and watch each
> other's avatars move. We'll do it the simple (client-authoritative) way first,
> then fix the authority in Module 15.

**You'll build:** a `sendMove` on `Net`, a move handler on the server, throttled sending in
`PlayerController`, and a new `RemotePlayers` renderer.

---

## Concepts

**Schema sync in one sentence:** mutate a field on a server-side `Schema` and Colyseus ships
the diff to every client automatically, where it appears on `room.state`. You never write
serialization code.

So to make players visible to each other, the loop is:

1. Client tells the server its position (`sendMove`).
2. Server writes it into that player's `PlayerS` in the state.
3. Colyseus syncs the change to everyone.
4. Each client reads `room.state.players` and draws an avatar for every player but itself.

**This module is deliberately client-authoritative** — the client just *asserts* its
position and the server trusts it. It's the simplest thing that shows two players moving, and
feeling how easy (and how cheatable) it is motivates Module 15. We label it clearly as
temporary.

**Read state every frame, imperatively.** `RemotePlayers` doesn't use React state for the
avatar list — the set of players and their positions change every frame. Instead it keeps a
plain `THREE.Group`, reconciles a pool of avatar meshes against `state.players` each frame,
and is dropped into the scene with one `<primitive>`. Churn stays out of React.

---

## Build it

- **`Net.sendMove(x, y, z, yaw)`** — `room.send(MSG.move, …)`.
- **Server `onMessage(MSG.move, …)`** — write the reported position straight into the
  player's `PlayerS`. (Colyseus syncs it. This is the cheatable part.)
- **`PlayerController`** — accept an optional `sendMove` prop; each frame accumulate `delta`
  and flush the current position ~20×/second (not every frame — that would flood the socket).
- **`RemotePlayers.tsx`** — a `THREE.Group` + a `Map<sessionId, avatar>`. Each frame: add an
  avatar when a new player id appears, update every avatar's position/rotation from
  `state.players`, skip your own id, and remove avatars for players who left. The avatar is a
  little block figure (torso + head + amber visor), colored by a hash of the name.

Full files in the checkpoint; `RemotePlayers` is the piece worth reading closely.

---

## Run & observe

```bash
pnpm server      # terminal 1
pnpm dev         # terminal 2
```

Open **two browser tabs**. Click into each to lock the mouse, and walk around in one — in
the *other* tab, a colored block figure strolls across the world in real time. Break/place
still works locally (networked in Module 18). The HUD shows **2 players**.

Now feel why it's temporary: the remote avatar moves in little steps, not smoothly (state
arrives ~10×/second — Module 16 fixes that), and because it's client-authoritative, a
modified client could teleport anywhere and the server would happily broadcast it (Module 15
fixes that).

---

## How real Ruderal does it

`packages/client/src/scene/RemotePlayers.tsx` is exactly this component — a group of block
avatars, color-seeded from the name hash, reconciled against Colyseus state each frame, with
an amber visor. The difference is that Ruderal never trusts a client-sent position: those
avatars are driven by *server-simulated* state (Module 15) and smoothed by interpolation
(Module 16). You've built the rendering half; the next two modules make the data trustworthy
and smooth.

---

## Exercises

1. **Name tags.** Add a `<div>`-in-3D or a simple sprite above each avatar with the player's
   name. (Or log names on join for now.)
2. **Your own avatar.** Temporarily render yourself too (don't skip your id) and go
   third-person to see it — a good way to check the avatar model.
3. **Idle animation.** Bob each avatar gently with `Math.sin(time)` so they feel alive even
   when still.
4. **Flood test.** Remove the 20 Hz throttle and send every frame. Watch the network panel —
   this is why we throttle.

---

## Checkpoint

```bash
pnpm checkpoint 14
```

Files: `src/client/net/connection.ts`, `src/server/room.ts`,
`src/client/PlayerController.tsx`, `src/client/scene/RemotePlayers.tsx`, `src/client/App.tsx`.

**Next:** [`15-authoritative-movement.md`](./15-authoritative-movement.md) — make the server
the boss.
