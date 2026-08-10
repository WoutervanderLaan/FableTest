/**
 * Module 13 — the server entry point. Boots a Colyseus server, registers the
 * ZoneRoom under the shared ROOM_NAME, and listens. Run it with `pnpm server`.
 *
 * `.filterBy(["zoneId"])` would give one room instance per zone id (how Ruderal
 * hosts many geographic zones in one process). We have a single world, so we
 * skip it — but it's a one-liner when you want multiple rooms.
 */
import { Server } from "colyseus";
import { ROOM_NAME, SERVER_PORT } from "../shared/protocol";
import { ZoneRoom } from "./room";

const port = Number(process.env.PORT ?? SERVER_PORT);

const gameServer = new Server({ greet: false });
gameServer.define(ROOM_NAME, ZoneRoom);

await gameServer.listen(port);
console.log(`[mini-ruderal] server on ws://localhost:${port}`);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    console.log(`[mini-ruderal] ${sig} — shutting down`);
    void gameServer.gracefullyShutdown().then(() => process.exit(0));
  });
}
