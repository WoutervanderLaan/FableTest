/**
 * Module 13 — the HUD gains a connection readout. It polls the `netStatus`
 * store a few times a second (not every frame) to show connected/latency/player
 * count. Still plain DOM over the canvas.
 */
import { useEffect, useState } from "react";
import { netStatus } from "../net/status";

export function Hud() {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  const status = netStatus.error
    ? `offline — ${netStatus.error}`
    : netStatus.connected
      ? `online · ${netStatus.players} player${netStatus.players === 1 ? "" : "s"} · ${netStatus.latencyMs}ms`
      : "connecting…";

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          width: 6,
          height: 6,
          marginLeft: -3,
          marginTop: -3,
          borderRadius: 3,
          background: "#e8a33d",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 12,
          left: 12,
          font: "12px ui-monospace, monospace",
          letterSpacing: "0.04em",
          color: netStatus.error ? "#8c4a32" : "#3a352c",
          background: "rgba(244,239,227,0.85)",
          padding: "5px 10px",
          borderRadius: 2,
          pointerEvents: "none",
        }}
      >
        {status}
      </div>
      <div
        style={{
          position: "fixed",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          font: "12px ui-monospace, monospace",
          letterSpacing: "0.04em",
          color: "#3a352c",
          background: "rgba(244,239,227,0.85)",
          padding: "6px 12px",
          borderRadius: 2,
          pointerEvents: "none",
        }}
      >
        click to look · WASD move · space jump · shift run · esc release
      </div>
    </>
  );
}
