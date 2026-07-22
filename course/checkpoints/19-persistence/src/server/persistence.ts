/**
 * Module 19 — file-backed persistence.
 *
 * Two stores, deliberately shaped like a database so a real one (Postgres, etc.)
 * could slot in later without touching the room:
 *
 *  - EditLog: an append-only journal of every accepted block edit. The world is
 *    NEVER stored whole — it's re-derived from the deterministic baseline
 *    (generateWorld) plus this journal. Append-only means writes are cheap and
 *    crash-safe (a half-written last line is just skipped on load).
 *
 *  - PlayerStore: a small key→value map (player key → last position), saved
 *    atomically via write-tmp-then-rename so a crash never leaves a corrupt file.
 *
 * This mirrors `packages/server/src/editlog.ts` + `playerstore.ts`.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export class EditLog {
  private file: string;

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "world.edits.log");
  }

  /** Load the whole journal as a flat [p, b, p, b, ...] array. */
  load(): number[] {
    if (!existsSync(this.file)) return [];
    const out: number[] = [];
    for (const line of readFileSync(this.file, "utf8").split("\n")) {
      if (!line) continue;
      const sp = line.indexOf(" ");
      if (sp < 0) continue; // skip a torn final line
      out.push(Number(line.slice(0, sp)), Number(line.slice(sp + 1)));
    }
    return out;
  }

  /** Append one accepted edit. (Ruderal micro-batches these; per-edit is fine here.) */
  append(p: number, b: number): void {
    appendFileSync(this.file, `${p} ${b}\n`);
  }
}

export interface Pos {
  x: number;
  y: number;
  z: number;
}

export class PlayerStore {
  private file: string;
  private data: Record<string, Pos> = {};

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "players.json");
    if (existsSync(this.file)) {
      try {
        this.data = JSON.parse(readFileSync(this.file, "utf8"));
      } catch {
        this.data = {};
      }
    }
  }

  get(pkey: string): Pos | undefined {
    return this.data[pkey];
  }

  set(pkey: string, pos: Pos): void {
    this.data[pkey] = pos;
  }

  /** Atomic save: write a tmp file, then rename over the real one. */
  save(): void {
    const tmp = this.file + ".tmp";
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file);
  }
}
