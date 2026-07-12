/** Minimal GeoJSON reading for the baker — only what Overture emits. */

export type Position = [number, number];

export interface GeoFeature {
  type: "Feature";
  geometry: {
    type: "Point" | "LineString" | "Polygon" | "MultiPolygon" | "MultiLineString";
    coordinates: unknown;
  } | null;
  properties: Record<string, unknown>;
}

export interface GeoCollection {
  type: "FeatureCollection";
  features: GeoFeature[];
}

/** Yield polygon rings ([outer, ...holes]) for Polygon or MultiPolygon geometry. */
export function polygonsOf(f: GeoFeature): Position[][][] {
  if (!f.geometry) return [];
  if (f.geometry.type === "Polygon") return [f.geometry.coordinates as Position[][]];
  if (f.geometry.type === "MultiPolygon") return f.geometry.coordinates as Position[][][];
  return [];
}

/** Yield line strings for LineString or MultiLineString geometry. */
export function linesOf(f: GeoFeature): Position[][] {
  if (!f.geometry) return [];
  if (f.geometry.type === "LineString") return [f.geometry.coordinates as Position[]];
  if (f.geometry.type === "MultiLineString") return f.geometry.coordinates as Position[][];
  return [];
}

export function pointOf(f: GeoFeature): Position | null {
  if (!f.geometry || f.geometry.type !== "Point") return null;
  return f.geometry.coordinates as Position;
}
