/**
 * Elevation sampling from AWS Terrain Tiles (Terrarium encoding).
 * Tiles are fetched once via curl (proxy-aware) into a local cache dir and
 * decoded with pngjs. Bilinear sampling in global web-mercator pixel space so
 * samples interpolate cleanly across tile boundaries.
 *
 * Data: https://registry.opendata.aws/terrain-tiles/ (Mapzen/Linux Foundation,
 * attribution required — see README).
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";

const TILE_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

export class DemSampler {
  private tiles = new Map<string, PNG | null>();

  constructor(
    private cacheDir: string,
    private zoom = 15,
  ) {}

  private tile(tx: number, ty: number): PNG | null {
    const key = `${tx},${ty}`;
    let png = this.tiles.get(key);
    if (png !== undefined) return png;

    const path = join(this.cacheDir, `${this.zoom}`, `${tx}`, `${ty}.png`);
    if (!existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true });
      execFileSync("curl", ["-sf", "--retry", "3", "-o", path, TILE_URL(this.zoom, tx, ty)], {
        timeout: 60_000,
      });
    }
    try {
      png = PNG.sync.read(readFileSync(path));
    } catch {
      png = null;
    }
    this.tiles.set(key, png);
    return png;
  }

  private pixelHeight(px: number, py: number): number {
    const tx = Math.floor(px / 256);
    const ty = Math.floor(py / 256);
    const png = this.tile(tx, ty);
    if (!png) return 0;
    const ix = ((px % 256) + 256) % 256;
    const iy = ((py % 256) + 256) % 256;
    const o = (iy * 256 + ix) * 4;
    const r = png.data[o];
    const g = png.data[o + 1];
    const b = png.data[o + 2];
    return r * 256 + g + b / 256 - 32768;
  }

  /** Height in meters at lon/lat, bilinear across tile borders. */
  heightAt(lon: number, lat: number): number {
    const n = 256 * 2 ** this.zoom;
    const px = ((lon + 180) / 360) * n - 0.5;
    const rad = (lat * Math.PI) / 180;
    const py = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n - 0.5;

    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const fx = px - x0;
    const fy = py - y0;
    const h00 = this.pixelHeight(x0, y0);
    const h10 = this.pixelHeight(x0 + 1, y0);
    const h01 = this.pixelHeight(x0, y0 + 1);
    const h11 = this.pixelHeight(x0 + 1, y0 + 1);
    return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
  }
}
