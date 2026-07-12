/**
 * Rasterization of local-meter geometry onto the zone's block grid.
 * Cell (x,z) covers [x,x+1)×[z,z+1) meters; tests happen at cell centers.
 */

export type Cell = (x: number, z: number) => void;

export interface Grid {
  sizeX: number;
  sizeZ: number;
}

/** Even-odd scanline fill over all rings (outer + holes together). */
export function fillPolygon(grid: Grid, rings: Array<Array<[number, number]>>, cb: Cell): void {
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const ring of rings) {
    for (const [, z] of ring) {
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  const z0 = Math.max(0, Math.floor(minZ));
  const z1 = Math.min(grid.sizeZ - 1, Math.ceil(maxZ));

  const xs: number[] = [];
  for (let z = z0; z <= z1; z++) {
    const zc = z + 0.5;
    xs.length = 0;
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const [ax, az] = ring[i];
        const [bx, bz] = ring[(i + 1) % ring.length];
        if (az === bz) continue;
        if ((az <= zc && bz > zc) || (bz <= zc && az > zc)) {
          xs.push(ax + ((zc - az) / (bz - az)) * (bx - ax));
        }
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.floor(xs[k] + 0.5));
      const to = Math.min(grid.sizeX - 1, Math.floor(xs[k + 1] - 0.5 + 1) - 1);
      for (let x = from; x <= to; x++) cb(x, z);
    }
  }
}

/** Stamp all cells whose center lies within `width/2` of the polyline. */
export function strokeLine(grid: Grid, points: Array<[number, number]>, width: number, cb: Cell): void {
  const r = width / 2;
  const r2 = r * r;
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - r));
    const maxX = Math.min(grid.sizeX - 1, Math.ceil(Math.max(ax, bx) + r));
    const minZ = Math.max(0, Math.floor(Math.min(az, bz) - r));
    const maxZ = Math.min(grid.sizeZ - 1, Math.ceil(Math.max(az, bz) + r));
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const cx = x + 0.5;
        const cz = z + 0.5;
        let t = len2 === 0 ? 0 : ((cx - ax) * dx + (cz - az) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        const ex = ax + t * dx - cx;
        const ez = az + t * dz - cz;
        if (ex * ex + ez * ez <= r2) cb(x, z);
      }
    }
  }
}
