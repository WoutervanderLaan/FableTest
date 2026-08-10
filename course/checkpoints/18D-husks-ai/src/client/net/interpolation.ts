/**
 * Module 16 — snapshot interpolation.
 *
 * The server only sends state ~10×/second, and packets arrive unevenly. If we
 * snapped remote players straight to the latest value, they'd teleport and
 * stutter. Instead we keep a short history of snapshots and render each remote
 * entity a fixed ~120 ms IN THE PAST — far enough back that we (almost) always
 * have a snapshot on either side of the render time to smoothly interpolate
 * between. A tiny, deliberate delay buys buttery motion.
 *
 * This is `packages/client/src/net/interpolation.ts` from the real Ruderal.
 */

export const INTERP_DELAY_MS = 120;

export interface Snap {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export class SnapshotBuffer {
  private buf: Snap[] = [];

  push(x: number, y: number, z: number, yaw = 0): void {
    const last = this.buf[this.buf.length - 1];
    if (last && last.x === x && last.y === y && last.z === z && last.yaw === yaw) return;
    this.buf.push({ t: performance.now(), x, y, z, yaw });
    const cutoff = performance.now() - 2000; // keep ~2s of history
    while (this.buf.length > 2 && this.buf[0]!.t < cutoff) this.buf.shift();
  }

  /** Sample the buffered path at a render time (usually now - INTERP_DELAY_MS). */
  sample(renderT: number): Snap | null {
    const b = this.buf;
    if (b.length === 0) return null;
    if (renderT <= b[0]!.t) return b[0]!;
    for (let i = b.length - 1; i >= 0; i--) {
      if (b[i]!.t <= renderT) {
        const a = b[i]!;
        const n = b[i + 1];
        if (!n) return a; // no newer snapshot: hold at the latest
        const f = (renderT - a.t) / (n.t - a.t);
        // shortest-arc yaw interpolation so facing doesn't spin the long way
        let dyaw = n.yaw - a.yaw;
        if (dyaw > Math.PI) dyaw -= Math.PI * 2;
        if (dyaw < -Math.PI) dyaw += Math.PI * 2;
        return {
          t: renderT,
          x: a.x + (n.x - a.x) * f,
          y: a.y + (n.y - a.y) * f,
          z: a.z + (n.z - a.z) * f,
          yaw: a.yaw + dyaw * f,
        };
      }
    }
    return b[b.length - 1]!;
  }
}
