/** Bootable server factory — used by index.ts and by integration tests. */

import { join } from "node:path";
import { Server } from "colyseus";
import { ROOM_NAME } from "@ruderal/shared";
import { EditLog } from "./editlog";
import { ZonePhysics } from "./physics";
import { ZoneRoom } from "./rooms/ZoneRoom";
import { ServerWorld } from "./world";

export interface AppOptions {
  zonepackPath: string;
  dataDir: string;
  port: number;
}

export interface App {
  server: Server;
  world: ServerWorld;
  log: EditLog;
  shutdown: () => Promise<void>;
}

export async function createApp(opts: AppOptions): Promise<App> {
  const world = new ServerWorld(opts.zonepackPath);
  const log = new EditLog(join(opts.dataDir, `${world.pack.header.id}.edits.log`));
  const persisted = world.loadEdits(log.load());
  const physics = await ZonePhysics.create(world.vz);

  const server = new Server({ greet: false });
  server.define(ROOM_NAME, ZoneRoom, { world, log, physics });
  await server.listen(opts.port);

  console.log(
    `[ruderal] zone '${world.pack.header.id}' on :${opts.port} — ` +
      `${world.vz.sizeX}×${world.vz.sizeY}×${world.vz.sizeZ}, ${persisted} persisted edits`,
  );

  return {
    server,
    world,
    log,
    shutdown: async () => {
      log.compact(world.editPairs());
      await server.gracefullyShutdown(false);
    },
  };
}
