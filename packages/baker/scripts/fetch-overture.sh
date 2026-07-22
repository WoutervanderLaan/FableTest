#!/usr/bin/env bash
# Fetch Overture Maps source data for a zone bbox into
# packages/baker/data/overture/<zoneId>/. Uses the official `overturemaps`
# CLI (pyarrow reads the S3 GeoParquet directly), installed into a local
# uv-managed venv on first run, via a proxy-aware wrapper.
#
# Usage: fetch-overture.sh [minLon,minLat,maxLon,maxLat] [zoneId]
set -euo pipefail
cd "$(dirname "$0")/.."

BBOX="${1:-4.8790,52.3718,4.8880,52.3773}" # default: Amsterdam Westerkerk zone, padded
ZONE_ID="${2:-ams-westerkerk}"
OUT_DIR="data/overture/$ZONE_ID"
VENV="${VENV:-../../.venv-overture}"

mkdir -p "$OUT_DIR"

if [ ! -x "$VENV/bin/overturemaps" ]; then
  uv venv "$VENV"
  uv pip install --python "$VENV/bin/python" overturemaps
fi

for t in building water land_use segment land; do
  echo "== fetching $t for $ZONE_ID bbox $BBOX =="
  "$VENV/bin/python" scripts/overture_fetch.py download --bbox="$BBOX" -f geojson --type="$t" -o "$OUT_DIR/$t.geojson"
done

echo "done: $(ls "$OUT_DIR")"
