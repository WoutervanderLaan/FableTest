import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SERVER_PORT } from "@ruderal/shared";
import { createApp } from "./app";

const here = dirname(fileURLToPath(import.meta.url));

const app = await createApp({
  zonesDir: process.env.ZONES_DIR ?? join(here, "..", "..", "client", "public", "zones"),
  dataDir: process.env.DATA_DIR ?? join(here, "..", "data"),
  port: Number(process.env.PORT ?? SERVER_PORT),
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, async () => {
    console.log(`[ruderal] ${sig} — compacting journals and shutting down`);
    await app.shutdown();
    process.exit(0);
  });
}
