/**
 * Authoritative world state for one zone: baseline (derived from the
 * zonepack) + player edit overlay. The overlay is the only thing persisted —
 * `edits` maps packed coords to the CURRENT block wherever it differs from
 * baseline, and re-deriving baseline+overlay reconstructs the world exactly.
 */

import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import {
  Block,
  NODE_YIELDS,
  decodeZonepack,
  packXYZ,
  setVoxelAt,
  unpackX,
  unpackY,
  unpackZ,
  voxelize,
  type VoxelZone,
  type Zonepack,
} from "@ruderal/shared";

export class ServerWorld {
  readonly pack: Zonepack;
  readonly vz: VoxelZone;
  /** packed coord → current block (only where differing from baseline). */
  readonly edits = new Map<number, number>();
  /** packed coord → accumulated damage (transient, not persisted). */
  readonly damage = new Map<number, number>();
  private readonly baseline: Uint8Array;

  constructor(zonepackPath: string) {
    const gz = readFileSync(zonepackPath);
    this.pack = decodeZonepack(new Uint8Array(gunzipSync(gz)));
    this.vz = voxelize(this.pack);
    this.baseline = new Uint8Array(this.vz.voxels); // copy before any edits
  }

  /** Apply an edit to the live volume, maintaining the delta overlay.
   *  Returns previous block, or null if structurally invalid. */
  applyEdit(x: number, y: number, z: number, b: number): number | null {
    const prev = setVoxelAt(this.vz, x, y, z, b);
    if (prev === null) return null;
    const p = packXYZ(x, y, z);
    const i = (y * this.vz.sizeZ + z) * this.vz.sizeX + x;
    if (this.baseline[i] === b) this.edits.delete(p);
    else this.edits.set(p, b);
    this.damage.delete(p);
    return prev;
  }

  /** Replay persisted edits (on boot). */
  loadEdits(pairs: Iterable<[number, number]>): number {
    let n = 0;
    for (const [p, b] of pairs) {
      if (this.applyEdit(unpackX(p), unpackY(p), unpackZ(p), b) !== null) n++;
    }
    return n;
  }

  /** Current overlay as flat [p0,b0,p1,b1,...] for init payloads / compaction. */
  editPairs(): number[] {
    const out: number[] = [];
    for (const [p, b] of this.edits) {
      out.push(p, b);
    }
    return out;
  }

  /** The block a cell holds in the baseline (pre-edit) world. */
  baselineBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= this.vz.sizeY || x < 0 || x >= this.vz.sizeX || z < 0 || z >= this.vz.sizeZ) return Block.Air;
    return this.baseline[(y * this.vz.sizeZ + z) * this.vz.sizeX + x];
  }

  /** True iff the baseline cell is a harvestable resource node. */
  isNodeCell(x: number, y: number, z: number): boolean {
    return NODE_YIELDS[this.baselineBlock(x, y, z)] !== undefined;
  }

  /**
   * Regenerate harvested nodes: any overlay entry that turned a baseline node
   * block into air is restored to the node. Called when a zone WAKES from
   * hibernation, so a zone nobody is visiting quietly replenishes. Returns the
   * restored cells so the caller can (re)build physics before serving clients.
   */
  regenerateHarvestedNodes(): Array<[number, number, number]> {
    const restored: Array<[number, number, number]> = [];
    for (const [p, b] of [...this.edits]) {
      if (b !== Block.Air) continue;
      const x = unpackX(p);
      const y = unpackY(p);
      const z = unpackZ(p);
      if (this.isNodeCell(x, y, z)) {
        this.applyEdit(x, y, z, this.baselineBlock(x, y, z)); // == baseline → overlay entry removed
        restored.push([x, y, z]);
      }
    }
    return restored;
  }
}
