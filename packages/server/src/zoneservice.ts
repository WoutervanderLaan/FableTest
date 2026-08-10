/**
 * Multi-zone lifecycle with hibernation (plan §3, "what makes a planet
 * affordable"). Worlds are loaded lazily on first join and unloaded when the
 * last player leaves — a zone nobody is visiting costs nothing but its tiny
 * edit journal on disk. One process hosts many zones; a registry/router in
 * front of many processes is the horizontal-scale story (not needed at MVP).
 *
 * Refcounting is by ROOM: exactly one ZoneRoom exists per live zone (Colyseus
 * filterBy zoneId), so acquire on room create, release on room dispose.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EditLog } from "./editlog";
import { ZonePhysics } from "./physics";
import { PlayerStore } from "./playerstore";
import { ServerWorld } from "./world";

export interface ZoneManifestEntry {
  id: string;
  name: string;
  file: string;
  blurb: string;
  centerLon: number;
  centerLat: number;
  waterPct: number;
  buildingPct: number;
}

export interface LoadedZone {
  id: string;
  world: ServerWorld;
  log: EditLog;
  physics: ZonePhysics;
}

interface ZoneSlot extends LoadedZone {
  refs: number;
}

export class ZoneService {
  readonly manifest: ZoneManifestEntry[];
  readonly store: PlayerStore;
  private loaded = new Map<string, ZoneSlot>();
  private loading = new Map<string, Promise<ZoneSlot>>();

  constructor(
    private zonesDir: string,
    private dataDir: string,
  ) {
    const manifestPath = join(zonesDir, "zones.json");
    if (!existsSync(manifestPath)) throw new Error(`no zones.json in ${zonesDir} — run \`pnpm bake\``);
    this.manifest = (JSON.parse(readFileSync(manifestPath, "utf8")).zones ?? []) as ZoneManifestEntry[];
    this.store = new PlayerStore(dataDir);
  }

  has(zoneId: string): boolean {
    return this.manifest.some((z) => z.id === zoneId);
  }

  defaultZone(): string {
    return this.manifest[0]?.id ?? "";
  }

  /** True while a zone is resident in memory (for tests/introspection). */
  isLoaded(zoneId: string): boolean {
    return this.loaded.has(zoneId);
  }

  loadedCount(): number {
    return this.loaded.size;
  }

  /** Peek at a resident zone's world without changing its refcount (tests). */
  peek(zoneId: string): LoadedZone | undefined {
    return this.loaded.get(zoneId);
  }

  async acquire(zoneId: string): Promise<LoadedZone> {
    const existing = this.loaded.get(zoneId);
    if (existing) {
      existing.refs++;
      return existing;
    }
    // coalesce concurrent first-loads of the same zone
    let pending = this.loading.get(zoneId);
    if (!pending) {
      pending = this.load(zoneId);
      this.loading.set(zoneId, pending);
    }
    const slot = await pending;
    this.loading.delete(zoneId);
    slot.refs++;
    return slot;
  }

  release(zoneId: string): void {
    const slot = this.loaded.get(zoneId);
    if (!slot) return;
    slot.refs--;
    if (slot.refs <= 0) this.hibernate(zoneId, slot);
  }

  private async load(zoneId: string): Promise<ZoneSlot> {
    const entry = this.manifest.find((z) => z.id === zoneId);
    if (!entry) throw new Error(`unknown zone '${zoneId}'`);

    const world = new ServerWorld(join(this.zonesDir, entry.file));
    const log = new EditLog(join(this.dataDir, `${zoneId}.edits.log`));
    const persisted = world.loadEdits(log.load());
    // waking up replenishes any nodes harvested before it went to sleep
    const regenerated = world.regenerateHarvestedNodes();
    const physics = await ZonePhysics.create(world.vz);

    const slot: ZoneSlot = { id: zoneId, world, log, physics, refs: 0 };
    this.loaded.set(zoneId, slot);
    console.log(
      `[zone] loaded '${zoneId}' — ${persisted} persisted edits, ${regenerated.length} nodes regrown ` +
        `(${this.loaded.size} zone(s) resident)`,
    );
    return slot;
  }

  private hibernate(zoneId: string, slot: ZoneSlot): void {
    slot.log.compact(slot.world.editPairs());
    slot.physics.dispose();
    this.loaded.delete(zoneId);
    console.log(`[zone] hibernated '${zoneId}' (${this.loaded.size} zone(s) resident)`);
  }

  /** Persist and free everything (server shutdown). */
  dispose(): void {
    for (const [zoneId, slot] of this.loaded) {
      slot.log.compact(slot.world.editPairs());
      slot.physics.dispose();
      console.log(`[zone] flushed '${zoneId}' on shutdown`);
    }
    this.loaded.clear();
    this.store.dispose();
  }
}
