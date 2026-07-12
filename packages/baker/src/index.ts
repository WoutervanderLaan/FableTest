import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { ZoneSpec } from "@ruderal/shared";
import { bakeZone } from "./bake";

const here = dirname(fileURLToPath(import.meta.url));

/** Phase 0: the One True Tile — Westerkerk / Jordaan, Amsterdam. */
const spec: ZoneSpec = {
  id: "ams-westerkerk",
  name: "Westerkerk · Amsterdam",
  centerLon: 4.88352,
  centerLat: 52.37454,
  sizeMeters: 512,
};

bakeZone(spec, {
  dataDir: join(here, "..", "data"),
  outDir: join(here, "..", "..", "client", "public", "zones"),
  overtureRelease: process.env.OVERTURE_RELEASE ?? "2026-06-17.0",
});
