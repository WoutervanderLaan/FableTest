/**
 * Append-only edit journal with compaction — file-backed for the one-box MVP.
 * Interface is deliberately DB-shaped: Phase 3 (accounts/economy) swaps this
 * for Postgres without touching the room. Lines are `p b` pairs (packed coord,
 * block); a compacted file is just the current overlay replayed.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class EditLog {
  private pendingLines: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private path: string) {
    mkdirSync(dirname(path), { recursive: true });
  }

  load(): Array<[number, number]> {
    if (!existsSync(this.path)) return [];
    const out: Array<[number, number]> = [];
    for (const line of readFileSync(this.path, "utf8").split("\n")) {
      if (!line) continue;
      const sp = line.indexOf(" ");
      if (sp < 0) continue;
      const p = Number(line.slice(0, sp));
      const b = Number(line.slice(sp + 1));
      if (Number.isFinite(p) && Number.isFinite(b)) out.push([p, b]);
    }
    return out;
  }

  append(p: number, b: number): void {
    this.pendingLines.push(`${p} ${b}\n`);
    // micro-batched flush: at most one fs write per 250 ms burst
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 250);
    }
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.pendingLines.length === 0) return;
    appendFileSync(this.path, this.pendingLines.join(""));
    this.pendingLines = [];
  }

  /** Rewrite the journal as the current overlay (atomic via rename). */
  compact(pairs: number[]): void {
    this.flush();
    let content = "";
    for (let i = 0; i + 1 < pairs.length; i += 2) {
      content += `${pairs[i]} ${pairs[i + 1]}\n`;
    }
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, content);
    renameSync(tmp, this.path);
  }
}
