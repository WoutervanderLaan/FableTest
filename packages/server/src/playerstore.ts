/**
 * Cross-zone player persistence: inventory + health, keyed by a stable player
 * key the client stores in localStorage. This is the seam where Phase 3's
 * "identity" lives — deliberately a bearer key, not accounts (magic-link
 * identity is a later phase). File-backed JSON now; the interface is
 * DB-shaped so Phase-later swaps it for Postgres without touching callers.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PLAYER_MAX_HP, START_INVENTORY } from "@ruderal/shared";

export interface PlayerRecord {
  name: string;
  inv: Record<string, number>;
  hp: number;
  /** last zone the player was in, for "continue where you left off" */
  lastZone: string;
}

export class PlayerStore {
  private records = new Map<string, PlayerRecord>();
  private path: string;
  private dirty = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(dataDir: string) {
    this.path = join(dataDir, "players.json");
    mkdirSync(dirname(this.path), { recursive: true });
    if (existsSync(this.path)) {
      try {
        const obj = JSON.parse(readFileSync(this.path, "utf8")) as Record<string, PlayerRecord>;
        for (const [k, v] of Object.entries(obj)) this.records.set(k, v);
      } catch {
        /* corrupt store: start fresh rather than crash the box */
      }
    }
    this.flushTimer = setInterval(() => this.flush(), 5000);
  }

  /** Fetch (or lazily mint) a player's record. New players get the starter kit. */
  get(key: string, name: string, zoneId: string): PlayerRecord {
    let r = this.records.get(key);
    if (!r) {
      r = { name, inv: { ...toStringKeys(START_INVENTORY) }, hp: PLAYER_MAX_HP, lastZone: zoneId };
      this.records.set(key, r);
      this.dirty = true;
    } else if (name) {
      r.name = name;
    }
    return r;
  }

  /** Persist a player's live state (called on leave and periodically). */
  save(key: string, record: PlayerRecord): void {
    this.records.set(key, record);
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty) return;
    const obj: Record<string, PlayerRecord> = {};
    for (const [k, v] of this.records) obj[k] = v;
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(obj));
    renameSync(tmp, this.path);
    this.dirty = false;
  }

  dispose(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flush();
  }
}

function toStringKeys(rec: Readonly<Record<number, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec)) out[k] = v;
  return out;
}
