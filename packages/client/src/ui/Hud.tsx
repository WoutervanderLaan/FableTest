/**
 * Field-notebook HUD (plan §4): paper panels, stamped mono type. Marigold
 * amber is reserved for player agency — crosshair, hotbar selection, accents.
 */

import { useEffect, useState } from "react";
import { BLOCK_COLOR, Block, localToLonLat, type ZoneSpec } from "@ruderal/shared";
import { combatStatus, editorStatus, headingLabel, healthStatus, netStatus, playerStatus } from "../player/status";

const PAPER = "#f4efe3";
const INK = "#3a352c";
const BORDER = "#b8b2a7";
const AMBER = "#e8a33d";

const HOTBAR: Array<{ b: number; label: string }> = [
  { b: Block.Brick, label: "brick" },
  { b: Block.BrickDark, label: "dark brick" },
  { b: Block.Wood, label: "wood" },
  { b: Block.Concrete, label: "concrete" },
  { b: Block.Moss, label: "moss" },
];

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

function cssColor(b: number): string {
  const c = BLOCK_COLOR[b];
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}

interface HudProps {
  spec: ZoneSpec;
  loading: boolean;
  progress: number;
}

export function Hud({ spec, loading, progress }: HudProps) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 150);
    return () => clearInterval(t);
  }, []);

  const status = playerStatus;
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

      {/* net status */}
      <div style={{ ...panelStyle, top: 16, right: 16, textAlign: "right" }}>
        <div>
          {netStatus.connected ? `${netStatus.players} online · ${netStatus.pingMs} ms` : "— offline —"}
        </div>
        {netStatus.husks > 0 && (
          <div style={{ opacity: 0.8, color: "#7a9e2e" }}>{netStatus.husks} husk{netStatus.husks > 1 ? "s" : ""} near</div>
        )}
        {status.locked && (
          <div style={{ opacity: 0.75 }}>
            {headingLabel(status.yaw)} · {Math.floor(status.x)}, {Math.floor(status.y)}, {Math.floor(status.z)}
            {status.swimming ? " · ~swimming~" : ""}
          </div>
        )}
      </div>

      {/* health bar (bottom-left, above attribution) */}
      {status.locked && (
        <div style={{ position: "fixed", bottom: 52, left: 16, width: 200, pointerEvents: "none" }}>
          <div style={{ fontSize: 10, color: INK, letterSpacing: "0.06em", marginBottom: 3, textTransform: "uppercase" }}>
            vitality {Math.round(healthStatus.hp)}
          </div>
          <div style={{ height: 8, background: "rgba(58,53,44,0.35)", borderRadius: 3, border: `1px solid ${BORDER}` }}>
            <div
              style={{
                height: "100%",
                width: `${Math.max(0, Math.min(100, (healthStatus.hp / healthStatus.maxHp) * 100))}%`,
                background: healthStatus.hp > 30 ? "#6fa24b" : "#c0563a",
                borderRadius: 3,
                transition: "width 120ms",
              }}
            />
          </div>
        </div>
      )}

      {/* attribution — ODbL requires it, and we'd owe it anyway */}
      <div style={{ ...panelStyle, bottom: 16, left: 16, fontSize: 10, opacity: 0.85 }}>
        map data © OpenStreetMap contributors · Overture Maps Foundation · elevation: Terrain Tiles (Mapzen/AWS)
      </div>

      {/* hotbar */}
      <div
        style={{
          position: "fixed",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 6,
          pointerEvents: "none",
        }}
      >
        {HOTBAR.map((slot, i) => {
          const selected = editorStatus.selected === slot.b;
          const count = editorStatus.inv[String(slot.b)] ?? 0;
          return (
            <div
              key={slot.b}
              style={{
                width: 56,
                background: PAPER,
                border: `2px solid ${selected ? AMBER : BORDER}`,
                borderRadius: 2,
                padding: "4px 6px",
                textAlign: "center",
                color: INK,
                fontSize: 10,
                letterSpacing: "0.03em",
                opacity: count > 0 ? 1 : 0.55,
              }}
            >
              <div
                style={{
                  height: 18,
                  background: cssColor(slot.b),
                  borderRadius: 1,
                  border: `1px solid rgba(58,53,44,0.35)`,
                }}
              />
              <div style={{ marginTop: 2 }}>
                {i + 1} · {count}
              </div>
            </div>
          );
        })}
      </div>

      {/* controls hint */}
      {!loading && !status.locked && (
        <div
          style={{
            ...panelStyle,
            bottom: 96,
            left: "50%",
            transform: "translateX(-50%)",
            borderBottom: `3px solid ${AMBER}`,
            fontSize: 13,
            textAlign: "center",
          }}
        >
          click to enter — WASD move · shift run · space jump
          <br />
          hold LMB break · RMB place · Q throw · F strike · 1–5 select
          <br />
          T trade · M travel · esc release
        </div>
      )}

      {/* crosshair + break progress */}
      {status.locked && (
        <>
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              width: combatStatus.targetHuskId ? 12 : 4,
              height: combatStatus.targetHuskId ? 12 : 4,
              marginLeft: combatStatus.targetHuskId ? -6 : -2,
              marginTop: combatStatus.targetHuskId ? -6 : -2,
              borderRadius: combatStatus.targetHuskId ? 2 : "50%",
              background: combatStatus.targetHuskId ? "transparent" : AMBER,
              border: combatStatus.targetHuskId ? `2px solid #c0563a` : "none",
              boxShadow: "0 0 3px rgba(58,53,44,0.6)",
              pointerEvents: "none",
            }}
          />
          {editorStatus.breakP !== null && (
            <div
              style={{
                position: "fixed",
                top: "calc(50% + 14px)",
                left: "50%",
                transform: "translateX(-50%)",
                width: 44,
                height: 5,
                background: "rgba(58,53,44,0.35)",
                borderRadius: 2,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  width: `${Math.round(editorStatus.breakProgress * 100)}%`,
                  height: "100%",
                  background: AMBER,
                  borderRadius: 2,
                }}
              />
            </div>
          )}
        </>
      )}

      {/* disconnected overlay */}
      {!netStatus.connected && !loading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(58,53,44,0.45)",
          }}
        >
          <div style={{ ...panelStyle, position: "static", borderTop: `3px solid #8c4a32` }}>
            connection lost — reload to rejoin
          </div>
        </div>
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
