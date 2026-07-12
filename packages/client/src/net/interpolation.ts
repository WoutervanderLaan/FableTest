/** Snapshot buffer for remote entities: render the past (~120 ms) smoothly. */

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
    // keep a couple of seconds of history
    const cutoff = performance.now() - 2000;
    while (this.buf.length > 2 && this.buf[0].t < cutoff) this.buf.shift();
  }

  sample(renderT: number): Snap | null {
    const b = this.buf;
    if (b.length === 0) return null;
    if (renderT <= b[0].t) return b[0];
    for (let i = b.length - 1; i >= 0; i--) {
      if (b[i].t <= renderT) {
        const a = b[i];
        const n = b[i + 1];
        if (!n) return a; // extrapolationless hold at latest
        const f = (renderT - a.t) / (n.t - a.t);
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
    return b[b.length - 1];
  }
}
