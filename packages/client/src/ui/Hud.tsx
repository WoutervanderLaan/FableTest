/**
 * Field-notebook HUD (plan §4): paper panels, stamped mono type, hand-feel.
 * Marigold amber is reserved for player agency — here that means the
 * crosshair and accents, never world features.
 */

import { useEffect, useState } from "react";
import { localToLonLat, type ZoneSpec } from "@ruderal/shared";
import { headingLabel, playerStatus } from "../player/status";

const PAPER = "#f4efe3";
const INK = "#3a352c";
const BORDER = "#b8b2a7";
const AMBER = "#e8a33d";

const panelStyle: React.CSSProperties = {
  position: "fixed",
  background: PAPER,
  color: INK,
  border: `1px solid ${BORDER}`,
  borderRadius: 2,
  boxShadow: "0 1px 4px rgba(58,53,44,0.25)",
  padding: "8px 12px",
  fontSize: 12,
  lineHeight: 1.5,
  letterSpacing: "0.04em",
  userSelect: "none",
  pointerEvents: "none",
};

interface HudProps {
  spec: ZoneSpec;
  loading: boolean;
  progress: number;
}

export function Hud({ spec, loading, progress }: HudProps) {
  const [status, setStatus] = useState({ ...playerStatus });
  useEffect(() => {
    const t = setInterval(() => setStatus({ ...playerStatus }), 150);
    return () => clearInterval(t);
  }, []);

  const { lon, lat } = localToLonLat(spec, status.x, status.z);

  return (
    <>
      {/* zone card */}
      <div style={{ ...panelStyle, top: 16, left: 16, borderTop: `3px solid ${AMBER}` }}>
        <div style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase" }}>{spec.name}</div>
        <div style={{ opacity: 0.75 }}>
          zone {spec.id} · {lat.toFixed(5)}°N {lon.toFixed(5)}°E
        </div>
      </div>

      {/* position readout */}
      {status.locked && (
        <div style={{ ...panelStyle, bottom: 16, right: 16, textAlign: "right" }}>
          <div>
            {headingLabel(status.yaw)} · {Math.floor(status.x)}, {Math.floor(status.y)}, {Math.floor(status.z)}
          </div>
          {status.swimming && <div style={{ color: "#3e8e7e" }}>~ swimming ~</div>}
        </div>
      )}

      {/* attribution — ODbL requires it, and we'd owe it anyway */}
      <div style={{ ...panelStyle, bottom: 16, left: 16, fontSize: 10, opacity: 0.85 }}>
        map data © OpenStreetMap contributors · Overture Maps Foundation · elevation: Terrain Tiles (Mapzen/AWS)
      </div>

      {/* controls hint */}
      {!loading && !status.locked && (
        <div
          style={{
            ...panelStyle,
            bottom: 72,
            left: "50%",
            transform: "translateX(-50%)",
            borderBottom: `3px solid ${AMBER}`,
            fontSize: 13,
          }}
        >
          click to enter — WASD move · shift run · space jump · esc release
        </div>
      )}

      {/* crosshair */}
      {status.locked && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            width: 4,
            height: 4,
            marginLeft: -2,
            marginTop: -2,
            borderRadius: "50%",
            background: AMBER,
            boxShadow: "0 0 3px rgba(58,53,44,0.6)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* loading overlay */}
      {loading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(207,200,184,0.55)",
            pointerEvents: "none",
          }}
        >
          <div style={{ ...panelStyle, position: "static", width: 280, textAlign: "center" }}>
            <div style={{ marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}>
              deriving surface…
            </div>
            <div style={{ height: 6, background: BORDER, borderRadius: 3 }}>
              <div
                style={{
                  height: "100%",
                  width: `${Math.round(progress * 100)}%`,
                  background: AMBER,
                  borderRadius: 3,
                  transition: "width 200ms",
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
