/**
 * Zone geometry. A zone is a discrete geo-anchored square (~512 m) with its
 * own local tangent-plane coordinate system — we deliberately do NOT build a
 * globe (plan §3.2). Convention (right-handed, y-up, matching three.js):
 *   x = meters east of the zone's west edge
 *   z = meters south of the zone's north edge   (so raster row 0 = north)
 *   y = blocks above header.baseElevation
 */

export interface ZoneSpec {
  id: string;
  name: string;
  centerLon: number;
  centerLat: number;
  /** Horizontal extent in meters (square). One block = one meter. */
  sizeMeters: number;
  /** Short flavor line for the zone-select menu. */
  blurb?: string;
}

/** Meters per degree of latitude/longitude at a given latitude (WGS84 series). */
export function metersPerDegree(latDeg: number): { mLat: number; mLon: number } {
  const rad = (latDeg * Math.PI) / 180;
  const mLat = 111132.92 - 559.82 * Math.cos(2 * rad) + 1.175 * Math.cos(4 * rad) - 0.0023 * Math.cos(6 * rad);
  const mLon = 111412.84 * Math.cos(rad) - 93.5 * Math.cos(3 * rad) + 0.118 * Math.cos(5 * rad);
  return { mLat, mLon };
}

export interface ZoneBBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export function zoneBBox(spec: ZoneSpec, padMeters = 0): ZoneBBox {
  const { mLat, mLon } = metersPerDegree(spec.centerLat);
  const half = spec.sizeMeters / 2 + padMeters;
  return {
    minLon: spec.centerLon - half / mLon,
    maxLon: spec.centerLon + half / mLon,
    minLat: spec.centerLat - half / mLat,
    maxLat: spec.centerLat + half / mLat,
  };
}

/** Project lon/lat to local zone meters. Flat-plane approximation: curvature
 *  across 512 m is ~2 cm, far below block resolution. */
export function lonLatToLocal(spec: ZoneSpec, lon: number, lat: number): { x: number; z: number } {
  const { mLat, mLon } = metersPerDegree(spec.centerLat);
  const bbox = zoneBBox(spec);
  return {
    x: (lon - bbox.minLon) * mLon,
    z: (bbox.maxLat - lat) * mLat,
  };
}

export function localToLonLat(spec: ZoneSpec, x: number, z: number): { lon: number; lat: number } {
  const { mLat, mLon } = metersPerDegree(spec.centerLat);
  const bbox = zoneBBox(spec);
  return {
    lon: bbox.minLon + x / mLon,
    lat: bbox.maxLat - z / mLat,
  };
}
