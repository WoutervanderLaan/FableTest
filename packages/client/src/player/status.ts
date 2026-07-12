/** Mutable per-frame stores polled by the HUD at low frequency so the render
 *  loop never touches React state. */

import { Block } from "@ruderal/shared";

export const playerStatus = {
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  locked: false,
  swimming: false,
};

export const netStatus = {
  connected: false,
  pingMs: 0,
  players: 0,
};

export const editorStatus = {
  /** hotbar selection */
  selected: Block.Brick as number,
  /** break progress on the currently hit block: 0..1, or null */
  breakP: null as number | null,
  breakProgress: 0,
  /** own inventory snapshot (blockId → count), refreshed by controller */
  inv: {} as Record<string, number>,
};

export function headingLabel(yaw: number): string {
  // yaw 0 faces -z = north; positive yaw turns west→ (three YXZ convention)
  const dirs = ["N", "NW", "W", "SW", "S", "SE", "E", "NE"];
  const a = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return dirs[Math.round(a / (Math.PI / 4)) % 8];
}
