/**
 * Wire protocol shared by server and client: message names, packing helpers,
 * gameplay limits, and block rules. Anything the server validates lives here
 * so the client can pre-validate identically (optimism that rarely rolls back).
 */

import { Block } from "./blocks";

export const SERVER_PORT = 2567;
export const ROOM_NAME = "zone";

export const TICK_MS = 50; // 20 Hz server simulation
export const PATCH_MS = 100; // 10 Hz state snapshots
export const INTERP_DELAY_MS = 120; // remote-player render delay
export const MAX_CLIENTS = 16;

export const REACH = 6.5; // max edit distance from the eye
export const EDIT_BURST = 24; // token bucket: capacity
export const EDIT_REFILL_PER_S = 12; // token bucket: refill rate
export const MAX_INPUT_DT = 0.05; // a single input may simulate at most 50 ms
export const INPUT_QUEUE_MAX = 40;

export const THROW_SPEED = 18;
export const THROW_COOLDOWN_MS = 400;
export const PROJECTILE_DAMAGE = 2;
export const PROJECTILE_TTL_MS = 6000;
export const DROP_PICKUP_RADIUS = 1.7;
export const SUPPORT_BUDGET = 900; // max blocks explored per support check

export const MSG = {
  // client → server
  input: "in", // InputMsg[]
  edit: "ed", // { p: packedXYZ, b: blockId (0 = break) }
  hit: "hi", // { p: packedXYZ }
  throw: "th", // { dx, dy, dz } unit direction
  ping: "pi", // number (client time)
  // server → client
  init: "IN", // { id, spawn, edits: number[] (pairs p,b), inv: Record<b, n> }
  edits: "ED", // number[] pairs (p, b) — applied authoritative edits
  reject: "RJ", // number[] pairs (p, actualBlock) — rollback info for sender
  damage: "DM", // { p, d, need } — break progress on a block (sender only)
  collapse: "CO", // number[] pairs (p, prevBlock) — cluster that fell
  pong: "PO", // number (echoed client time)
} as const;

export interface InputMsg {
  seq: number;
  dt: number;
  dx: number; // horizontal move intent, |(dx,dz)| <= 1
  dz: number;
  run: boolean;
  jump: boolean;
  /** facing, relayed to other clients for avatar orientation (not simulated) */
  yaw?: number;
}

/** Blocks a player may place. */
export const PLACEABLE: ReadonlySet<number> = new Set([
  Block.Brick,
  Block.BrickDark,
  Block.Wood,
  Block.Concrete,
  Block.Moss,
]);

/** Hits (hand) required to break a block. Absent = unbreakable. */
export const HARDNESS: Readonly<Record<number, number>> = {
  [Block.Grass]: 1,
  [Block.Soil]: 1,
  [Block.Silt]: 1,
  [Block.Rubble]: 1,
  [Block.Leaves]: 1,
  [Block.Moss]: 2,
  [Block.Wood]: 2,
  [Block.Brick]: 3,
  [Block.BrickDark]: 3,
  [Block.Roof]: 3,
  [Block.Asphalt]: 4,
  [Block.Pavement]: 4,
  [Block.Concrete]: 4,
};

/** What breaking a block yields (Phase 2 drops). Terrain yields nothing to
 *  keep digging from being a free block mine at MVP balance. */
export const DROP_OF: Readonly<Record<number, number>> = {
  [Block.Brick]: Block.Brick,
  [Block.BrickDark]: Block.BrickDark,
  [Block.Wood]: Block.Wood,
  [Block.Concrete]: Block.Concrete,
  [Block.Moss]: Block.Moss,
  [Block.Roof]: Block.Brick,
  [Block.Rubble]: Block.Concrete,
};

export const START_INVENTORY: Readonly<Record<number, number>> = {
  [Block.Brick]: 96,
  [Block.BrickDark]: 48,
  [Block.Wood]: 64,
  [Block.Concrete]: 48,
  [Block.Moss]: 32,
};

/** Pack voxel coords into one int: x,z ∈ [0,1024), y ∈ [0,1024). */
export function packXYZ(x: number, y: number, z: number): number {
  return x | (z << 10) | (y << 20);
}

export function unpackX(p: number): number {
  return p & 1023;
}
export function unpackZ(p: number): number {
  return (p >> 10) & 1023;
}
export function unpackY(p: number): number {
  return (p >> 20) & 1023;
}
