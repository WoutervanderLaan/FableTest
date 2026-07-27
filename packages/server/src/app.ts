/** Bootable server factory — used by index.ts and by integration tests. */

import { ROOM_NAME } from "@ruderal/shared";
import { ZoneRoom } from "./rooms/ZoneRoom";
import { ZoneService } from "./zoneservice";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";

export interface AppOptions {
  /** Directory holding zones.json + *.zpk.gz (client/public/zones). */
  zonesDir: string;
  /** Writable dir for edit journals + players.json. */
  dataDir: string;
  port: number;
}

export interface App {
  server: Server;
  service: ZoneService;
  shutdown: () => Promise<void>;
}

export async function createApp(opts: AppOptions): Promise<App> {
  const service = new ZoneService(opts.zonesDir, opts.dataDir);

  const server = new Server({
    greet: false,
    transport: new WebSocketTransport(),
  }); // one room per zone, matched by zoneId; the shared service is injected once
  server.define(ROOM_NAME, ZoneRoom, { service }).filterBy(["zoneId"]);
  await server.listen(opts.port);

  console.log(
    `[ruderal] on :${opts.port} — ${service.manifest.length} zone(s) available: ` +
      service.manifest.map((z) => z.id).join(", "),
  );

  return {
    server,
    service,
    shutdown: async () => {
      await server.gracefullyShutdown(false);
      service.dispose();
    },
  };
}
