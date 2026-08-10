import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";
import type { ZoneSpec } from "@ruderal/shared";
import { bakeZone, type ZoneManifestEntry } from "./bake";

const here = dirname(fileURLToPath(import.meta.url));

/** Phase 3: two contrasting zones so travel + differing economies are real.
 *  Westerkerk/Jordaan = dense ruins → salvage. Vondelpark = the park → biomass. */
const ZONES: ZoneSpec[] = [
  {
    id: "ams-westerkerk",
    name: "Westerkerk · Amsterdam",
    centerLon: 4.88352,
    centerLat: 52.37454,
    sizeMeters: 512,
    blurb: "Dense canal-house ruins. Rich in salvage, thin on green.",
  },
  {
    id: "ams-vondelpark",
    name: "Vondelpark · Amsterdam",
    centerLon: 4.8685,
    centerLat: 52.3581,
    sizeMeters: 512,
    blurb: "The old park, overgrown. Biomass everywhere, little to scavenge.",
  },
];

const dataDir = join(here, "..", "data");
const outDir = join(here, "..", "..", "client", "public", "zones");
const overtureRelease = process.env.OVERTURE_RELEASE ?? "2026-06-17.0";

// bake only the zone named in argv[2], or all zones if none given
const only = process.argv[2];
const specs = only ? ZONES.filter((z) => z.id === only) : ZONES;
if (specs.length === 0) {
  console.error(`no zone matching '${only}'. known: ${ZONES.map((z) => z.id).join(", ")}`);
  process.exit(1);
}

const entries: ZoneManifestEntry[] = [];
for (const spec of specs) {
  entries.push(bakeZone(spec, { dataDir, outDir, overtureRelease }));
}

// merge into the manifest (preserve zones not baked this run)
import("node:fs").then(({ existsSync, readFileSync }) => {
  const manifestPath = join(outDir, "zones.json");
  const existing: ZoneManifestEntry[] =
    existsSync(manifestPath) ? (JSON.parse(readFileSync(manifestPath, "utf8")).zones ?? []) : [];
  const byId = new Map(existing.map((z) => [z.id, z]));
  for (const e of entries) byId.set(e.id, e);
  // keep the canonical ZONES order
  const ordered = ZONES.map((z) => byId.get(z.id)).filter(Boolean);
  writeFileSync(manifestPath, JSON.stringify({ zones: ordered }, null, 2));
  console.log(`\nmanifest: ${ordered.length} zone(s) → ${manifestPath}`);
});
