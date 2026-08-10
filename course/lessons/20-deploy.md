# 20 · Deploy it online

> **Goal:** put mini-Ruderal on the internet — a real URL a friend on another
> network can open and join you. Dockerize the server, deploy it to a host, ship
> the static client to a CDN, and wire them together over `wss://`.

**You'll use:** `Dockerfile`, `fly.toml`, `.dockerignore`, `.env.example` (already in the
project root), plus a static host for the client.

---

## Concepts

Your app is two deployables with very different needs:

- **The server** is a long-lived Node process holding live WebSocket connections and game
  state in memory. It needs an always-on host with a persistent disk (for `data/`). A
  container platform (Fly.io, Railway, Render) is the right home.
- **The client** is a bundle of static files (`vite build` → `dist/`). It needs a CDN, not a
  server — any static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages) works, for free.

They meet over one config value: the client's **`VITE_SERVER_URL`**, baked in at build time,
pointing the browser at the deployed server. Two rules that trip everyone up:

- **`wss://`, not `ws://`.** A page served over HTTPS may only open *secure* WebSockets. Your
  host terminates TLS and you connect with `wss://your-server.example`.
- **CORS / origin.** The browser will connect from your client's domain to the server's
  domain — a cross-origin WebSocket. Colyseus allows this by default; if you add HTTP routes,
  set CORS accordingly.

**Persistence needs a volume.** Containers have ephemeral disks — a redeploy wipes them. Mount
a persistent volume at `DATA_DIR` (`/data`) so your edit journal and player store survive
deploys. That's the `[[mounts]]` block in `fly.toml`.

---

## Build it

### 1. The server image

The project root already has a **`Dockerfile`**: `node:22-slim`, `pnpm install`, copy `src`,
run `tsx src/server/index.ts` (via the new `start` script). It reads `PORT` and `DATA_DIR`
from the environment and declares a `/data` volume. Nothing to write — read it and understand
each line.

### 2. Deploy the server (Fly.io example)

```bash
# one-time
fly launch --no-deploy               # creates the app from fly.toml (edit the app name!)
fly volumes create mini_ruderal_data --size 1   # the persistent disk for /data

# every deploy
fly deploy
```

Your server is now at `mini-ruderal.fly.dev` (your name), speaking `wss://` on 443.

> Railway/Render are just as easy: point them at the repo, they detect the Dockerfile, set a
> `DATA_DIR` env var and attach a volume, and expose a public URL.

### 3. Deploy the client

```bash
# build with the server URL baked in
VITE_SERVER_URL=wss://mini-ruderal.fly.dev pnpm build   # -> dist/
```

Upload `dist/` to any static host, or connect the repo to Vercel/Netlify and set the
`VITE_SERVER_URL` environment variable there. (`.env.example` shows the variable.)

### 4. Verify

- Hit the server's health: opening `https://mini-ruderal.fly.dev` in a browser should return
  Colyseus's default response (proof it's up and TLS works).
- Open your deployed client URL. The HUD should read **online · N players · <ms>** — with a
  real latency now, not `0ms`.
- Send the client URL to a friend on another network. You should see each other move and
  share block edits. **That's a real online game you built and shipped.**

---

## How real Ruderal does it

Ruderal is a local `pnpm dev` project today — it ships **no** deployment config (the README
notes real-account identity and a horizontal-scale router as later phases). But the seams are
all there: the client already reads `VITE_SERVER_URL`, the server already takes `PORT` /
`DATA_DIR` / zone env vars, and `zoneservice.ts` explicitly calls out "a registry/router in
front of many processes is the horizontal-scale story." What you just did — containerize the
authoritative server, static-host the client, wire them over `wss://` with a persistent
volume — is exactly the first step that project would take. You're now ahead of the reference
on this one axis.

---

## Exercises

1. **Health route.** Add a tiny HTTP `GET /health` to the server (Colyseus exposes an Express
   app) returning `ok`, and point your host's health check at it.
2. **Env-driven world.** Make the world seed a `SEED` env var so you can run distinct public
   worlds from the same image.
3. **CI deploy.** Add a GitHub Action that runs `fly deploy` on push to `main`.
4. **Backups.** Periodically copy `data/world.edits.log` off the volume (a cron + object
   storage) so a lost volume isn't a lost world.

---

## Checkpoint

There's no new source for this module — you deploy the Module 19 app. The deploy files
(`Dockerfile`, `fly.toml`, `.dockerignore`, `.env.example`) live in the project root and
apply to whatever `src` you've built.

```bash
pnpm checkpoint 19     # the app you deploy
```

---

## Part 5 complete 🎉

mini-Ruderal is **online**: a server-authoritative, persistent, multiplayer voxel world with
custom shaders, running on infrastructure you provisioned, reachable by anyone with the link.
That was the finish line. One module left — a map of where to go next.

**Next:** [`21-bridge-to-ruderal.md`](./21-bridge-to-ruderal.md).
